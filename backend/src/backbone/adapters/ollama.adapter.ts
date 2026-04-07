import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import {
  BackboneAdapter,
  BackboneSendOptions,
  BackboneSendResult,
  BackboneHealthResult,
  BackboneMessage,
} from './backbone-adapter.interface';

/**
 * OllamaAdapter
 *
 * Implements the BackboneAdapter interface for Ollama's local REST API.
 * Supports NDJSON streaming for real-time token output.
 */
@Injectable()
export class OllamaAdapter implements BackboneAdapter {
  readonly slug = 'ollama';
  private readonly logger = new Logger(OllamaAdapter.name);

  // ── BackboneAdapter: validateConfig ──

  validateConfig(config: Record<string, any>): void {
    if (!config.api_url) {
      throw new BadRequestException(
        'Ollama config requires "api_url" (e.g. http://ollama:11434)',
      );
    }
    if (!config.model) {
      throw new BadRequestException(
        'Ollama config requires "model" (e.g. llama3.2:3b)',
      );
    }
  }

  // ── BackboneAdapter: supportsNativeSkillInjection ──

  supportsNativeSkillInjection(): boolean {
    return false;
  }

  // ── BackboneAdapter: supportsToolExecution ──

  supportsToolExecution(): boolean {
    return false;
  }

  // ── BackboneAdapter: healthCheck ──

  async healthCheck(config: Record<string, any>): Promise<BackboneHealthResult> {
    const start = Date.now();
    try {
      const response = await fetch(`${config.api_url}/api/tags`, {
        method: 'GET',
        signal: AbortSignal.timeout(5000),
      });
      const healthy = response.ok;
      return {
        healthy,
        latencyMs: Date.now() - start,
        ...(healthy ? {} : { error: `HTTP ${response.status}` }),
      };
    } catch (error) {
      this.logger.error('[Ollama] Connection test failed:', error.message);
      return {
        healthy: false,
        latencyMs: Date.now() - start,
        error: error.message,
      };
    }
  }

  // ── BackboneAdapter: sendMessage ──

  async sendMessage(options: BackboneSendOptions): Promise<BackboneSendResult> {
    const { config, systemPrompt, message, history, onToken, signal } = options;

    this.validateConfig(config);

    // Build messages array in Ollama format
    const messages: Array<{ role: string; content: string }> = [];
    if (systemPrompt) {
      messages.push({ role: 'system', content: systemPrompt });
    }
    if (history && history.length > 0) {
      for (const msg of history) {
        if (msg.role === 'system') continue;
        messages.push({ role: msg.role, content: msg.content });
      }
    }
    messages.push({ role: 'user', content: message });

    this.logger.log(
      `[Ollama] Sending ${messages.length} messages to ${config.model}`,
    );

    const response = await fetch(`${config.api_url}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: config.model,
        messages,
        stream: true,
      }),
      signal: signal || AbortSignal.timeout(120000),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Ollama API error (${response.status}): ${errorText}`);
    }

    return this.handleNDJSONStream(response, config.model, onToken);
  }

  // ── Private: NDJSON streaming response ──

  private async handleNDJSONStream(
    response: Response,
    model: string,
    onToken?: (token: string) => void,
  ): Promise<BackboneSendResult> {
    const reader = response.body?.getReader();
    if (!reader) {
      throw new Error('Ollama streaming response has no readable body');
    }

    const decoder = new TextDecoder();
    let fullText = '';
    let buffer = '';

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const chunk = JSON.parse(line);
            if (chunk.message?.content) {
              const token = chunk.message.content;
              fullText += token;
              if (onToken) onToken(token);
            }
          } catch {
            // Skip unparseable NDJSON lines
          }
        }
      }
    } finally {
      reader.releaseLock();
    }

    return {
      text: fullText,
      model,
      usage: { total_tokens: 0 },
    };
  }
}
