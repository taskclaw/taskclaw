import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import {
  BackboneAdapter,
  BackboneSendOptions,
  BackboneSendResult,
  BackboneHealthResult,
} from './backbone-adapter.interface';

/**
 * CustomHttpAdapter (F027)
 *
 * Generic OpenAI-compatible adapter that posts to any /v1/chat/completions
 * endpoint. Supports custom headers from config.headers.
 */
@Injectable()
export class CustomHttpAdapter implements BackboneAdapter {
  readonly slug = 'custom-http';
  private readonly logger = new Logger(CustomHttpAdapter.name);

  validateConfig(config: Record<string, any>): void {
    if (!config.api_url) {
      throw new BadRequestException(
        'custom-http: "api_url" is required (e.g. https://my-llm.example.com)',
      );
    }
    if (!config.api_key) {
      throw new BadRequestException('custom-http: "api_key" is required');
    }
    if (!config.model) {
      throw new BadRequestException(
        'custom-http: "model" is required (e.g. gpt-4o, llama-3, etc.)',
      );
    }
  }

  supportsNativeSkillInjection(): boolean {
    return false;
  }

  async sendMessage(options: BackboneSendOptions): Promise<BackboneSendResult> {
    const { config, systemPrompt, message, history = [], onToken, signal } =
      options;

    const apiUrl = config.api_url.replace(/\/+$/, '');
    const model = config.model;
    const streaming = typeof onToken === 'function';

    const messages: any[] = [];

    if (systemPrompt) {
      messages.push({ role: 'system', content: systemPrompt });
    }

    for (const h of history.filter((m) => m.role !== 'system')) {
      messages.push({ role: h.role, content: h.content });
    }

    messages.push({ role: 'user', content: message });

    const body: Record<string, any> = {
      model,
      messages,
      stream: streaming,
    };

    if (config.max_tokens) {
      body.max_tokens = config.max_tokens;
    }
    if (config.temperature !== undefined) {
      body.temperature = config.temperature;
    }

    const url = `${apiUrl}/v1/chat/completions`;

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.api_key}`,
      // Merge any custom headers from config
      ...(config.headers ?? {}),
    };

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
        `custom-http: API returned ${response.status} — ${errorText}`,
      );
    }

    if (streaming) {
      return this.handleStream(response, onToken!);
    }

    const json = await response.json();
    const choice = json.choices?.[0];
    const text = choice?.message?.content ?? '';

    return {
      text,
      usage: json.usage
        ? {
            prompt_tokens: json.usage.prompt_tokens,
            completion_tokens: json.usage.completion_tokens,
            total_tokens: json.usage.total_tokens,
          }
        : undefined,
      model: json.model,
      raw: json,
    };
  }

  async healthCheck(config: Record<string, any>): Promise<BackboneHealthResult> {
    const start = Date.now();
    const apiUrl = config.api_url.replace(/\/+$/, '');

    // First try GET /v1/models
    try {
      const response = await fetch(`${apiUrl}/v1/models`, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${config.api_key}`,
          ...(config.headers ?? {}),
        },
        signal: AbortSignal.timeout(10_000),
      });

      if (response.ok) {
        return { healthy: true, latencyMs: Date.now() - start };
      }
    } catch {
      // Fall through to completions probe
    }

    // Fallback: POST a minimal completion
    try {
      const response = await fetch(`${apiUrl}/v1/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${config.api_key}`,
          ...(config.headers ?? {}),
        },
        body: JSON.stringify({
          model: config.model,
          messages: [{ role: 'user', content: 'ping' }],
          max_tokens: 1,
        }),
        signal: AbortSignal.timeout(15_000),
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
            const delta = event.choices?.[0]?.delta;

            if (delta?.content) {
              fullText += delta.content;
              onToken(delta.content);
            }

            if (event.model) {
              model = event.model;
            }

            if (event.usage) {
              usage = {
                prompt_tokens: event.usage.prompt_tokens,
                completion_tokens: event.usage.completion_tokens,
                total_tokens: event.usage.total_tokens,
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
