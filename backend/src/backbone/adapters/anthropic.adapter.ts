import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import {
  BackboneAdapter,
  BackboneSendOptions,
  BackboneSendResult,
  BackboneHealthResult,
  BackboneMessage,
} from './backbone-adapter.interface';

/**
 * AnthropicAdapter
 *
 * Implements the BackboneAdapter interface for Anthropic's Messages API.
 * Supports SSE streaming and native tool execution.
 */
@Injectable()
export class AnthropicAdapter implements BackboneAdapter {
  readonly slug = 'anthropic';
  private readonly logger = new Logger(AnthropicAdapter.name);

  // ── BackboneAdapter: validateConfig ──

  validateConfig(config: Record<string, any>): void {
    if (!config.api_key) {
      throw new BadRequestException(
        'Anthropic config requires "api_key" (API key from console.anthropic.com)',
      );
    }
  }

  // ── BackboneAdapter: supportsNativeSkillInjection ──

  supportsNativeSkillInjection(): boolean {
    return true;
  }

  // ── BackboneAdapter: supportsToolExecution ──

  supportsToolExecution(): boolean {
    return true;
  }

  // ── BackboneAdapter: healthCheck ──

  async healthCheck(config: Record<string, any>): Promise<BackboneHealthResult> {
    const start = Date.now();
    try {
      const response = await fetch('https://api.anthropic.com/v1/models', {
        method: 'GET',
        headers: {
          'x-api-key': config.api_key,
          'anthropic-version': '2023-06-01',
        },
        signal: AbortSignal.timeout(5000),
      });
      const healthy = response.ok;
      return {
        healthy,
        latencyMs: Date.now() - start,
        ...(healthy ? {} : { error: `HTTP ${response.status}` }),
      };
    } catch (error) {
      this.logger.error('[Anthropic] Connection test failed:', error.message);
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

    // Build messages array in Anthropic format
    const messages: Array<{ role: string; content: string }> = [];
    if (history && history.length > 0) {
      for (const msg of history) {
        if (msg.role === 'system') continue; // system goes in separate field
        messages.push({ role: msg.role, content: msg.content });
      }
    }
    messages.push({ role: 'user', content: message });

    const model = (config.model as string) || 'claude-opus-4-5';
    const maxTokens = (config.max_tokens as number) || 8192;
    const isStreaming = !!onToken;

    const requestBody: any = {
      model,
      max_tokens: maxTokens,
      messages,
      stream: isStreaming,
    };

    if (systemPrompt) {
      requestBody.system = systemPrompt;
    }

    if (options.tool_context?.length && this.supportsToolExecution()) {
      requestBody.tools = options.tool_context.map((t) => ({
        name: t.name,
        description: t.description,
        input_schema: t.input_schema ?? { type: 'object', properties: {} },
      }));
    }

    this.logger.log(
      `[Anthropic] Sending ${messages.length} messages (stream=${isStreaming})`,
    );

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': config.api_key,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify(requestBody),
      signal: signal || AbortSignal.timeout(120000),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Anthropic API error (${response.status}): ${errorText}`);
    }

    if (isStreaming) {
      return this.handleStreamingResponse(response, onToken, model);
    }

    return this.handleNonStreamingResponse(response, model);
  }

  // ── Private: non-streaming response ──

  private async handleNonStreamingResponse(
    response: Response,
    requestModel: string,
  ): Promise<BackboneSendResult> {
    const data = await response.json();

    const text =
      data.content && data.content[0] ? data.content[0].text : '';

    return {
      text,
      model: data.model || requestModel,
      usage: data.usage
        ? {
            prompt_tokens: data.usage.input_tokens,
            completion_tokens: data.usage.output_tokens,
            total_tokens:
              (data.usage.input_tokens || 0) +
              (data.usage.output_tokens || 0),
          }
        : undefined,
      raw: data,
    };
  }

  // ── Private: SSE streaming response ──

  private async handleStreamingResponse(
    response: Response,
    onToken: (token: string) => void,
    requestModel: string,
  ): Promise<BackboneSendResult> {
    const reader = response.body?.getReader();
    if (!reader) {
      throw new Error('Anthropic streaming response has no readable body');
    }

    const decoder = new TextDecoder();
    let fullText = '';
    let usage: any = null;
    let model = requestModel;
    let buffer = '';

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const jsonStr = line.slice(6).trim();
          if (jsonStr === '[DONE]' || !jsonStr) continue;

          try {
            const event = JSON.parse(jsonStr);

            if (
              event.type === 'content_block_delta' &&
              event.delta?.type === 'text_delta'
            ) {
              const text = event.delta.text;
              fullText += text;
              onToken(text);
            }

            if (event.type === 'message_start' && event.message) {
              model = event.message.model || model;
              if (event.message.usage) {
                usage = {
                  prompt_tokens: event.message.usage.input_tokens,
                };
              }
            }

            if (event.type === 'message_delta' && event.usage) {
              usage = {
                ...usage,
                completion_tokens: event.usage.output_tokens,
                total_tokens:
                  (usage?.prompt_tokens || 0) +
                  (event.usage.output_tokens || 0),
              };
            }
          } catch {
            // Skip unparseable SSE lines
          }
        }
      }
    } finally {
      reader.releaseLock();
    }

    return {
      text: fullText,
      model,
      usage: usage || undefined,
    };
  }
}
