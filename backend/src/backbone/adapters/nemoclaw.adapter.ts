import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import type {
  BackboneAdapter,
  BackboneSendOptions,
  BackboneSendResult,
  BackboneHealthResult,
} from './backbone-adapter.interface';

@Injectable()
export class NemoClawAdapter implements BackboneAdapter {
  readonly slug = 'nemoclaw';
  private readonly logger = new Logger(NemoClawAdapter.name);

  async sendMessage(options: BackboneSendOptions): Promise<BackboneSendResult> {
    const { config, systemPrompt, message, history = [], onToken, signal } = options;

    const baseUrl = (config.api_url as string).replace(/\/$/, '');
    const model = config.model as string;
    const maxTokens = (config.max_tokens as number) ?? 2048;
    const temperature = (config.temperature as number) ?? 0.7;
    const apiKey = config.api_key as string | undefined;

    // Build messages array (OpenAI format)
    const messages: Array<{ role: string; content: string }> = [];

    if (systemPrompt) {
      messages.push({ role: 'system', content: systemPrompt });
    }

    // Add history
    for (const h of history) {
      messages.push({ role: h.role, content: h.content });
    }

    // Add current user message
    messages.push({ role: 'user', content: message });

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (apiKey) {
      headers['Authorization'] = `Bearer ${apiKey}`;
    }

    const streaming = Boolean(onToken);

    const body = JSON.stringify({
      model,
      messages,
      max_tokens: maxTokens,
      temperature,
      stream: streaming,
    });

    this.logger.debug(
      `NemoClaw: POST ${baseUrl}/v1/chat/completions (model=${model}, stream=${streaming})`,
    );
    const startTime = Date.now();

    const response = await fetch(`${baseUrl}/v1/chat/completions`, {
      method: 'POST',
      headers,
      body,
      signal,
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => '');
      throw new Error(`NemoClaw API error ${response.status}: ${errorText}`);
    }

    if (streaming && onToken) {
      return this.handleStreaming(response, model, startTime, onToken);
    } else {
      return this.handleNonStreaming(response, model, startTime);
    }
  }

  private async handleNonStreaming(
    response: Response,
    model: string,
    _startTime: number,
  ): Promise<BackboneSendResult> {
    const data = (await response.json()) as any;
    const text = (data.choices?.[0]?.message?.content as string) ?? '';
    const usage = data.usage as any;

    return {
      text,
      model: (data.model as string) ?? model,
      usage: usage
        ? {
            prompt_tokens: usage.prompt_tokens as number,
            completion_tokens: usage.completion_tokens as number,
            total_tokens: usage.total_tokens as number,
          }
        : undefined,
    };
  }

  private async handleStreaming(
    response: Response,
    model: string,
    _startTime: number,
    onToken: (chunk: string) => void,
  ): Promise<BackboneSendResult> {
    const reader = response.body?.getReader();
    if (!reader) throw new Error('No response body for streaming');

    const decoder = new TextDecoder();
    let fullText = '';
    let totalTokens = 0;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const chunk = decoder.decode(value, { stream: true });
      const lines = chunk.split('\n');

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        const data = line.slice(6).trim();
        if (data === '[DONE]') break;

        try {
          const parsed = JSON.parse(data) as any;
          const delta = parsed.choices?.[0]?.delta?.content as string | undefined;
          if (delta) {
            fullText += delta;
            onToken(delta);
          }
          if ((parsed.usage as any)?.total_tokens) {
            totalTokens = (parsed.usage as any).total_tokens as number;
          }
        } catch {
          // Ignore parse errors on partial chunks
        }
      }
    }

    return {
      text: fullText,
      model,
      usage: totalTokens ? { total_tokens: totalTokens } : undefined,
    };
  }

  async healthCheck(config: Record<string, any>): Promise<BackboneHealthResult> {
    const baseUrl = ((config.api_url as string) ?? 'http://localhost:8000').replace(/\/$/, '');
    const start = Date.now();

    // Try /health first, then /v1/models
    for (const path of ['/health', '/v1/models']) {
      try {
        const headers: Record<string, string> = {};
        if (config.api_key) {
          headers['Authorization'] = `Bearer ${config.api_key as string}`;
        }

        const res = await fetch(`${baseUrl}${path}`, {
          headers,
          signal: AbortSignal.timeout(8000),
        });

        if (res.ok) {
          const data = (await res.json().catch(() => ({}))) as any;
          const models = Array.isArray(data.data)
            ? (data.data as any[]).map((m: any) => m.id as string)
            : undefined;
          return {
            healthy: true,
            latencyMs: Date.now() - start,
            metadata: { endpoint: path, ...(models ? { models } : {}) },
          };
        }
      } catch {
        // Try next endpoint
      }
    }

    return {
      healthy: false,
      latencyMs: Date.now() - start,
      error: `NeMo service unreachable at ${baseUrl}. Ensure NeMo Microservice container is running.`,
    };
  }

  validateConfig(config: Record<string, any>): void {
    if (!config.api_url) {
      throw new BadRequestException(
        'NemoClaw requires "api_url" (e.g. http://localhost:8000)',
      );
    }
    if (!config.model) {
      throw new BadRequestException(
        'NemoClaw requires "model" (e.g. meta/llama-3.1-8b-instruct)',
      );
    }
    try {
      new URL(config.api_url as string);
    } catch {
      throw new BadRequestException(`Invalid api_url: ${config.api_url as string}`);
    }
  }

  supportsNativeSkillInjection(): boolean {
    return false;
  }
}
