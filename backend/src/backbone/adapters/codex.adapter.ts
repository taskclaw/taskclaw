import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import {
  BackboneAdapter,
  BackboneSendOptions,
  BackboneSendResult,
  BackboneHealthResult,
} from './backbone-adapter.interface';

/**
 * CodexAdapter (F026)
 *
 * Adapter for OpenAI Codex using the /v1/responses API.
 */
@Injectable()
export class CodexAdapter implements BackboneAdapter {
  readonly slug = 'codex';
  private readonly logger = new Logger(CodexAdapter.name);

  private static readonly DEFAULT_API_URL = 'https://api.openai.com';

  validateConfig(config: Record<string, any>): void {
    if (!config.api_key) {
      throw new BadRequestException('codex: "api_key" is required');
    }
  }

  supportsNativeSkillInjection(): boolean {
    return false;
  }

  async sendMessage(options: BackboneSendOptions): Promise<BackboneSendResult> {
    const { config, systemPrompt, message, history = [], onToken, signal } =
      options;

    const apiUrl = (config.api_url ?? CodexAdapter.DEFAULT_API_URL).replace(
      /\/+$/,
      '',
    );
    const model = config.model ?? 'codex-mini-latest';
    const streaming = typeof onToken === 'function';

    // Build input array for the Responses API
    const input: any[] = [];

    if (systemPrompt) {
      input.push({ role: 'system', content: systemPrompt });
    }

    for (const h of history.filter((m) => m.role !== 'system')) {
      input.push({ role: h.role, content: h.content });
    }

    input.push({ role: 'user', content: message });

    const body: Record<string, any> = {
      model,
      input,
      stream: streaming,
    };

    if (config.max_tokens) {
      body.max_output_tokens = config.max_tokens;
    }

    const url = `${apiUrl}/v1/responses`;

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.api_key}`,
    };
    if (config.organization_id) {
      headers['OpenAI-Organization'] = config.organization_id;
    }

    this.logger.debug(`POST ${url} (model=${model}, stream=${streaming})`);

    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal,
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => 'unknown error');
      throw new Error(
        `codex: API returned ${response.status} — ${errorText}`,
      );
    }

    if (streaming) {
      return this.handleStream(response, onToken!);
    }

    const json = await response.json();

    // Responses API returns output[] with message items
    const text = this.extractTextFromResponse(json);

    return {
      text,
      usage: json.usage
        ? {
            prompt_tokens: json.usage.input_tokens,
            completion_tokens: json.usage.output_tokens,
            total_tokens:
              (json.usage.input_tokens ?? 0) +
              (json.usage.output_tokens ?? 0),
          }
        : undefined,
      model: json.model,
      raw: json,
    };
  }

  async healthCheck(config: Record<string, any>): Promise<BackboneHealthResult> {
    const start = Date.now();
    try {
      const apiUrl = (
        config.api_url ?? CodexAdapter.DEFAULT_API_URL
      ).replace(/\/+$/, '');
      const url = `${apiUrl}/v1/models`;

      const response = await fetch(url, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${config.api_key}`,
        },
        signal: AbortSignal.timeout(10_000),
      });

      return {
        healthy: response.ok,
        latencyMs: Date.now() - start,
        error: response.ok ? undefined : `HTTP ${response.status}`,
      };
    } catch (err: any) {
      return {
        healthy: false,
        latencyMs: Date.now() - start,
        error: err.message ?? String(err),
      };
    }
  }

  // ── Private helpers ──────────────────────────────────────────────

  private extractTextFromResponse(json: any): string {
    // Responses API: output is an array of items
    const output: any[] = json.output ?? [];
    const parts: string[] = [];

    for (const item of output) {
      if (item.type === 'message') {
        for (const content of item.content ?? []) {
          if (content.type === 'output_text') {
            parts.push(content.text);
          }
        }
      }
    }

    return parts.join('') || json.output_text || '';
  }

  private async handleStream(
    response: Response,
    onToken: (token: string) => void,
  ): Promise<BackboneSendResult> {
    const reader = response.body!.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let fullText = '';
    let usage: BackboneSendResult['usage'];
    let model: string | undefined;

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop()!;

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const data = line.slice(6).trim();
          if (data === '[DONE]') continue;

          try {
            const event = JSON.parse(data);

            // Responses API streaming: output_text.delta events
            if (
              event.type === 'response.output_text.delta' &&
              event.delta
            ) {
              fullText += event.delta;
              onToken(event.delta);
            }

            if (event.type === 'response.created') {
              model = event.response?.model;
            }

            if (
              event.type === 'response.completed' &&
              event.response?.usage
            ) {
              const u = event.response.usage;
              usage = {
                prompt_tokens: u.input_tokens,
                completion_tokens: u.output_tokens,
                total_tokens:
                  (u.input_tokens ?? 0) + (u.output_tokens ?? 0),
              };
            }
          } catch {
            // non-JSON line, skip
          }
        }
      }
    } finally {
      reader.releaseLock();
    }

    return { text: fullText, usage, model };
  }
}
