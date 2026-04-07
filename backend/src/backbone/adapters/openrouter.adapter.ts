import { Logger, BadRequestException } from '@nestjs/common';
import {
  BackboneAdapter,
  BackboneSendOptions,
  BackboneSendResult,
  BackboneHealthResult,
  BackboneMessage,
} from './backbone-adapter.interface';

/**
 * OpenRouterAdapter (F008)
 *
 * Implements the BackboneAdapter interface for OpenRouter (OpenAI-compatible HTTP API).
 * Sends POST to /chat/completions with Bearer auth, parses the standard choices response.
 *
 * Extracted from openclaw.service.ts — logic preserved faithfully.
 */
export class OpenRouterAdapter implements BackboneAdapter {
  readonly slug = 'openrouter';
  private readonly logger = new Logger(OpenRouterAdapter.name);

  // ── BackboneAdapter: sendMessage ──

  async sendMessage(options: BackboneSendOptions): Promise<BackboneSendResult> {
    const { config, systemPrompt, message, history, signal } = options;

    this.validateConfig(config);

    // Build messages array in OpenAI-compatible format
    const messages: BackboneMessage[] = [];
    if (systemPrompt) {
      messages.push({ role: 'system', content: systemPrompt });
    }
    if (history && history.length > 0) {
      messages.push(...history);
    }
    messages.push({ role: 'user', content: message });

    return this.executeOpenRouterRequest(config, messages, signal, options.tool_context);
  }

  // ── BackboneAdapter: healthCheck ──

  async healthCheck(config: Record<string, any>): Promise<BackboneHealthResult> {
    const start = Date.now();
    try {
      const apiUrl = (config.api_url as string) || 'https://openrouter.ai/api/v1';
      const response = await fetch(`${apiUrl}/models`, {
        method: 'GET',
        headers: { Authorization: `Bearer ${config.api_key}` },
        signal: AbortSignal.timeout(5000),
      });
      const healthy = response.ok;
      return {
        healthy,
        latencyMs: Date.now() - start,
        ...(healthy ? {} : { error: `HTTP ${response.status}` }),
      };
    } catch (error) {
      this.logger.error(
        '[OpenRouter] Connection test failed:',
        error.message,
      );
      return {
        healthy: false,
        latencyMs: Date.now() - start,
        error: error.message,
      };
    }
  }

  // ── BackboneAdapter: validateConfig ──

  validateConfig(config: Record<string, any>): void {
    if (!config.api_key) {
      throw new BadRequestException(
        'OpenRouter config requires "api_key" (API key from openrouter.ai)',
      );
    }
  }

  // ── BackboneAdapter: supportsNativeSkillInjection ──

  supportsNativeSkillInjection(): boolean {
    return false;
  }

  // ── Private: HTTP execution (faithfully copied from openclaw.service.ts) ──

  private async executeOpenRouterRequest(
    config: Record<string, any>,
    messages: BackboneMessage[],
    signal?: AbortSignal,
    toolContext?: BackboneSendOptions['tool_context'],
  ): Promise<BackboneSendResult> {
    const apiUrl = (config.api_url as string) || 'https://openrouter.ai/api/v1';
    const model = (config.model as string) || 'openai/gpt-3.5-turbo';

    const requestBody: any = {
      model,
      messages: messages.map((m) => ({ role: m.role, content: m.content })),
    };

    if (toolContext?.length) {
      requestBody.tools = toolContext.map((t) => ({
        type: 'function',
        function: {
          name: t.name,
          description: t.description,
          parameters: t.input_schema ?? { type: 'object', properties: {} },
        },
      }));
    }
    const endpoint = `${apiUrl}/chat/completions`;

    this.logger.log(`[OpenRouter] Sending ${messages.length} messages`);

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.api_key}`,
    };

    const response = await fetch(endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify(requestBody),
      signal: signal || AbortSignal.timeout(120000),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`API error (${response.status}): ${errorText}`);
    }

    const data = await response.json();

    if (data.choices && data.choices[0]) {
      return {
        text: data.choices[0].message.content,
        model: data.model,
        usage: data.usage
          ? {
              prompt_tokens: data.usage.prompt_tokens,
              completion_tokens: data.usage.completion_tokens,
              total_tokens: data.usage.total_tokens,
            }
          : undefined,
        raw: data,
      };
    }

    throw new Error('Unexpected response format from OpenRouter');
  }
}
