import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { spawn, execSync } from 'child_process';
import * as fs from 'fs';
import type {
  BackboneAdapter,
  BackboneSendOptions,
  BackboneSendResult,
  BackboneHealthResult,
} from './backbone-adapter.interface';

/**
 * ClaudeCodeAdapter (F202, F203, F204, F206)
 *
 * Local subprocess adapter for the Claude Code CLI.
 * Uses `claude --print --output-format json` — NOT an HTTP API.
 * The `claude` binary must be installed and available in PATH.
 *
 * Protocol: cli
 * Config fields (all optional):
 *   - model            — Claude model slug (default: claude-sonnet-4-6)
 *   - workspace_path   — Working directory for the subprocess
 *   - system_prompt_prefix — Prefix prepended to all system prompts
 *   - timeout_seconds  — Max seconds to wait for response (default: 120)
 */
@Injectable()
export class ClaudeCodeAdapter implements BackboneAdapter {
  readonly slug = 'claude-code';
  private readonly logger = new Logger(ClaudeCodeAdapter.name);

  // ── sendMessage (F202, F206) ──────────────────────────────────────

  async sendMessage(options: BackboneSendOptions): Promise<BackboneSendResult> {
    const { config, systemPrompt, message, history = [], onToken, signal } =
      options;

    const timeoutMs = (config.timeout_seconds ?? 120) * 1000;
    const model = config.model || 'claude-sonnet-4-6';
    const rawWorkspaceDir = config.workspace_path || process.cwd();
    // Auto-create workspace dir so a missing /tmp path doesn't cause a misleading ENOENT on the binary
    let workspaceDir = rawWorkspaceDir;
    if (config.workspace_path && !fs.existsSync(config.workspace_path)) {
      try {
        fs.mkdirSync(config.workspace_path, { recursive: true });
        this.logger.debug(`Claude Code CLI: created workspace dir ${config.workspace_path}`);
      } catch {
        this.logger.warn(`Claude Code CLI: workspace_path ${config.workspace_path} missing, falling back to cwd`);
        workspaceDir = process.cwd();
      }
    }

    // Build full conversation prompt for --print mode
    const fullPrompt = this.buildPrompt(systemPrompt ?? '', history, message, config);

    this.logger.debug(
      `Claude Code CLI: spawning claude --print (model=${model})`,
    );
    const startTime = Date.now();

    return new Promise((resolve, reject) => {
      const args = [
        '--print',
        '--output-format',
        'json',
        '--model',
        model,
        '--dangerously-skip-permissions',
        fullPrompt,
      ];

      let stdout = '';
      let stderr = '';

      // Strip CLAUDECODE to allow nested invocation from within Claude Code sessions
      const childEnv = { ...process.env };
      delete childEnv['CLAUDECODE'];

      const child = spawn('claude', args, {
        cwd: workspaceDir,
        env: childEnv,
        timeout: timeoutMs,
        // Close stdin so --print mode doesn't block waiting for interactive input
        stdio: ['ignore', 'pipe', 'pipe'],
      });

      child.stdout.on('data', (data: Buffer) => {
        stdout += data.toString();
        // Forward raw chunks when caller wants streaming tokens
        if (onToken) {
          onToken(data.toString());
        }
      });

      child.stderr.on('data', (data: Buffer) => {
        stderr += data.toString();
      });

      child.on('close', (code) => {
        const latencyMs = Date.now() - startTime;
        this.logger.debug(
          `Claude Code CLI: exit code ${code} in ${latencyMs}ms`,
        );

        if (code !== 0) {
          reject(
            new Error(
              `claude CLI exited with code ${code}: ${stderr || stdout}`,
            ),
          );
          return;
        }

        // Parse JSON output from --output-format json
        try {
          const text = this.parseClaudeOutput(stdout);
          resolve({
            text,
            model,
            usage: { total_tokens: Math.ceil(text.length / 4) }, // best-effort estimate
          });
        } catch {
          // Fallback: return raw stdout if JSON parse fails
          resolve({ text: stdout.trim(), model });
        }
      });

      child.on('error', (err: NodeJS.ErrnoException) => {
        if (err.code === 'ENOENT') {
          // ENOENT can mean either the binary or the cwd is missing
          const pathHasClaude = (process.env.PATH || '')
            .split(':')
            .some((dir) => {
              try { return fs.existsSync(`${dir}/claude`); } catch { return false; }
            });
          if (!pathHasClaude) {
            reject(new Error('claude CLI not found in PATH. Install Claude Code: https://claude.ai/code'));
          } else {
            reject(new Error(`claude spawn failed (ENOENT): workspace_path "${workspaceDir}" may not exist`));
          }
        } else {
          reject(err);
        }
      });

      // Honour AbortSignal for cancellation (F206)
      if (signal) {
        signal.addEventListener('abort', () => {
          child.kill('SIGTERM');
          reject(new Error('Request aborted'));
        });
      }
    });
  }

  // ── healthCheck (F203) ───────────────────────────────────────────

  async healthCheck(
    _config: Record<string, any>,
  ): Promise<BackboneHealthResult> {
    const start = Date.now();
    try {
      const output = execSync('claude --version', {
        timeout: 5000,
        encoding: 'utf8',
      });
      const version = output.trim();
      return {
        healthy: true,
        latencyMs: Date.now() - start,
        metadata: { version, type: 'local-cli' },
      };
    } catch (err: any) {
      return {
        healthy: false,
        latencyMs: Date.now() - start,
        error:
          err.code === 'ENOENT'
            ? 'claude CLI not found in PATH. Install Claude Code.'
            : `claude --version failed: ${err.message}`,
      };
    }
  }

  // ── validateConfig (F204) ─────────────────────────────────────────

  validateConfig(config: Record<string, any>): void {
    // All fields are optional for the local CLI adapter
    if (config.workspace_path && !fs.existsSync(config.workspace_path)) {
      throw new BadRequestException(
        `workspace_path does not exist: ${config.workspace_path}`,
      );
    }
    if (config.timeout_seconds !== undefined) {
      const t = Number(config.timeout_seconds);
      if (isNaN(t) || t < 5 || t > 600) {
        throw new BadRequestException(
          'timeout_seconds must be between 5 and 600',
        );
      }
    }
  }

  // ── transformSystemPrompt ─────────────────────────────────────────

  transformSystemPrompt(prompt: string, _config: Record<string, any>): string {
    // Format as CLAUDE.md-style instructions for the subprocess
    return `# TaskClaw Agent Instructions\n\n${prompt}`;
  }

  // ── supportsNativeSkillInjection ──────────────────────────────────

  supportsNativeSkillInjection(): boolean {
    return false;
  }

  // ── Private helpers ───────────────────────────────────────────────

  /**
   * Build a single prompt string from system prompt, history, and the
   * current user message.  Passed as the positional argument to
   * `claude --print`.  (F206)
   */
  private buildPrompt(
    systemPrompt: string,
    history: Array<{ role: string; content: string }>,
    message: string,
    config: Record<string, any>,
  ): string {
    const parts: string[] = [];

    const prefix = config.system_prompt_prefix as string | undefined;
    if (prefix) {
      parts.push(prefix);
    }

    if (systemPrompt) {
      parts.push(systemPrompt);
    }

    if (history.length > 0) {
      const historyText = history
        .map(
          (h) =>
            `${h.role === 'user' ? 'User' : 'Assistant'}: ${h.content}`,
        )
        .join('\n\n');
      parts.push(`Previous conversation:\n${historyText}`);
    }

    parts.push(`User: ${message}`);
    parts.push('Assistant:');

    return parts.join('\n\n');
  }

  /**
   * Parse `--output-format json` output.
   *
   * Claude CLI emits one JSON object per line; the final result line has
   * `{ "type": "result", "subtype": "success", "result": "<text>" }`.
   * We scan from the end to find it.
   */
  private parseClaudeOutput(stdout: string): string {
    const lines = stdout.trim().split('\n').filter(Boolean);

    for (let i = lines.length - 1; i >= 0; i--) {
      try {
        const parsed = JSON.parse(lines[i]);
        if (parsed.type === 'result' && parsed.result) {
          return parsed.result as string;
        }
        if (parsed.result) {
          return parsed.result as string;
        }
      } catch {
        // Not JSON — continue scanning upward
      }
    }

    // Fallback: concatenate any non-JSON lines
    const textLines = lines.filter((line) => {
      try {
        JSON.parse(line);
        return false;
      } catch {
        return true;
      }
    });
    return textLines.join('\n').trim() || stdout.trim();
  }
}
