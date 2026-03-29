import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { withRetry } from '../common/utils/retry.util';
import { LangfuseService } from '../ee/langfuse/langfuse.service';
import WebSocket from 'ws';
import { v4 as uuid } from 'uuid';

export interface OpenClawMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export interface OpenClawRequest {
  agent_id?: string;
  messages: OpenClawMessage[];
  stream?: boolean;
}

export interface OpenClawResponse {
  response: string;
  metadata?: {
    tokens_used?: number;
    model?: string;
    [key: string]: any;
  };
}

export interface OpenClawConfig {
  api_url: string;
  api_key: string;
  agent_id?: string;
}

@Injectable()
export class OpenClawService {
  private readonly logger = new Logger(OpenClawService.name);

  constructor(private readonly langfuse: LangfuseService) {}

  /**
   * Send a chat request to OpenClaw/OpenRouter instance with retry logic.
   * Retries up to 3 times on network errors and 5xx status codes
   * with exponential backoff (1s, 3s, 9s).
   *
   * All calls are traced via Langfuse for token/cost monitoring.
   */
  async sendMessage(
    config: OpenClawConfig,
    messages: OpenClawMessage[],
    traceContext?: {
      userId?: string;
      accountId?: string;
      conversationId?: string;
    },
  ): Promise<OpenClawResponse> {
    const startTime = Date.now();
    let result: OpenClawResponse | undefined;
    let error: Error | undefined;

    try {
      result = await withRetry(() => this.executeAIRequest(config, messages), {
        maxRetries: 3,
        baseDelayMs: 1000,
        backoffMultiplier: 3,
        logger: this.logger,
        operationName: 'AI sendMessage',
      });
      return result;
    } catch (err) {
      error = err;
      this.logger.error('AI API error after retries:', err.message);

      if (err.name === 'AbortError') {
        throw new BadRequestException('AI request timed out after 120 seconds');
      }

      throw new BadRequestException(
        `Failed to communicate with AI: ${err.message}`,
      );
    } finally {
      // Always trace the call (success or failure)
      const durationMs = Date.now() - startTime;
      this.langfuse.traceGeneration({
        name: 'chat-message',
        model: result?.metadata?.model || 'unknown',
        input: messages,
        output: result?.response || null,
        usage: result?.metadata?.tokens_used
          ? {
              totalTokens: result.metadata.tokens_used,
              promptTokens: Math.round(result.metadata.tokens_used * 0.3),
              completionTokens: Math.round(result.metadata.tokens_used * 0.7),
            }
          : undefined,
        durationMs,
        userId: traceContext?.userId,
        accountId: traceContext?.accountId,
        conversationId: traceContext?.conversationId,
        tags: [
          config.api_url.includes('openrouter.ai') ? 'openrouter' : 'openclaw',
        ],
        success: !error,
        error: error?.message,
      });
    }
  }

  /**
   * Execute a single AI API request (without retry — called by sendMessage via withRetry).
   * Uses WebSocket protocol for OpenClaw, HTTP for OpenRouter.
   */
  private async executeAIRequest(
    config: OpenClawConfig,
    messages: OpenClawMessage[],
  ): Promise<OpenClawResponse> {
    const isOpenRouter = config.api_url.includes('openrouter.ai');

    if (isOpenRouter) {
      return this.executeOpenRouterRequest(config, messages);
    }

    return this.executeOpenClawWebSocket(config, messages);
  }

  /**
   * Execute OpenRouter request via HTTP (unchanged).
   */
  private async executeOpenRouterRequest(
    config: OpenClawConfig,
    messages: OpenClawMessage[],
  ): Promise<OpenClawResponse> {
    const requestBody = {
      model: 'openai/gpt-3.5-turbo',
      messages: messages,
    };
    const endpoint = `${config.api_url}/chat/completions`;

    this.logger.log(`[OpenRouter] Sending ${messages.length} messages`);

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.api_key}`,
    };

    const response = await fetch(endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify(requestBody),
      signal: AbortSignal.timeout(120000),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`API error (${response.status}): ${errorText}`);
    }

    const data = await response.json();

    if (data.choices && data.choices[0]) {
      return {
        response: data.choices[0].message.content,
        metadata: {
          model: data.model,
          tokens_used: data.usage?.total_tokens,
        },
      };
    }

    throw new Error('Unexpected response format from OpenRouter');
  }

  /**
   * Execute OpenClaw request via WebSocket protocol.
   *
   * OpenClaw uses a WebSocket-based API:
   * 1. Connect to ws://<host>
   * 2. Receive connect.challenge with nonce
   * 3. Respond with connect request (auth token + client info)
   * 4. Send chat.send with the user message
   * 5. Collect streaming text chunks until chat.done event
   * 6. Close connection
   */
  private async executeOpenClawWebSocket(
    config: OpenClawConfig,
    messages: OpenClawMessage[],
  ): Promise<OpenClawResponse> {
    // Convert HTTP URL to WebSocket URL
    const wsUrl = config.api_url
      .replace(/^https:\/\//, 'wss://')
      .replace(/^http:\/\//, 'ws://');

    this.logger.log(
      `[OpenClaw WS] Connecting to ${wsUrl} with ${messages.length} messages`,
    );

    // Build the user message: combine system prompt + history into a single message
    // OpenClaw expects a single text input via chat.send, with system context prepended
    const userInput = this.buildOpenClawInput(messages);

    return new Promise<OpenClawResponse>((resolve, reject) => {
      const timeoutMs = 180000; // 3 minutes for full conversation
      const responseChunks: string[] = [];
      let connected = false;
      let chatSent = false;
      let chatAcknowledged = false;
      let resolved = false;
      let currentSessionKey: string = '';
      let runId: string | null = null;

      const timer = setTimeout(() => {
        if (!resolved) {
          resolved = true;
          this.logger.error('[OpenClaw WS] Request timed out after 180s');
          try {
            ws.close();
          } catch {}
          reject(new Error('OpenClaw request timed out after 180 seconds'));
        }
      }, timeoutMs);

      const cleanup = () => {
        clearTimeout(timer);
        try {
          ws.close();
        } catch {}
      };

      const ws = new WebSocket(wsUrl, {
        headers: { 'User-Agent': 'TaskClaw/1.0' },
      });

      ws.on('open', () => {
        this.logger.log(
          '[OpenClaw WS] Connection opened, waiting for challenge...',
        );
      });

      ws.on('message', (raw: WebSocket.RawData) => {
        if (resolved) return;

        let data: any;
        try {
          data = JSON.parse(raw.toString());
        } catch {
          this.logger.warn(
            '[OpenClaw WS] Non-JSON message:',
            raw.toString().slice(0, 200),
          );
          return;
        }

        // Skip noisy events
        if (data.event === 'health' || data.event === 'tick') return;

        this.logger.debug(`[OpenClaw WS] ${data.type}/${data.event || 'res'}`);

        // ── Step 1: Connect challenge ──
        if (data.type === 'event' && data.event === 'connect.challenge') {
          this.logger.log('[OpenClaw WS] Authenticating...');
          ws.send(
            JSON.stringify({
              type: 'req',
              id: uuid(),
              method: 'connect',
              params: {
                auth: { token: config.api_key },
                client: {
                  id: 'webchat-ui',
                  version: '1.0.0',
                  platform: 'web',
                  mode: 'webchat',
                },
                minProtocol: 3,
                maxProtocol: 3,
                role: 'operator',
                scopes: ['operator.admin'],
              },
            }),
          );
          return;
        }

        // ── Step 2: Connect success ──
        if (data.type === 'res' && data.ok === true && !connected) {
          connected = true;
          this.logger.log('[OpenClaw WS] Authenticated successfully');

          currentSessionKey = `taskclaw-${uuid().slice(0, 12)}`;
          ws.send(
            JSON.stringify({
              type: 'req',
              id: uuid(),
              method: 'chat.send',
              params: {
                sessionKey: currentSessionKey,
                message: userInput,
                idempotencyKey: uuid(),
                ...(config.agent_id ? { agent: config.agent_id } : {}),
              },
            }),
          );

          this.logger.log(
            `[OpenClaw WS] Sent chat.send (${userInput.length} chars, session: ${currentSessionKey})`,
          );
          chatSent = true;
          return;
        }

        // ── Connect failure ──
        if (data.type === 'res' && data.ok === false && !connected) {
          resolved = true;
          const errMsg =
            data.error?.message || data.error || 'Authentication failed';
          this.logger.error(`[OpenClaw WS] Auth failed: ${errMsg}`);
          cleanup();
          reject(new Error(`OpenClaw authentication failed: ${errMsg}`));
          return;
        }

        // ── chat.send acknowledgment ──
        if (
          data.type === 'res' &&
          data.ok === true &&
          chatSent &&
          !chatAcknowledged
        ) {
          chatAcknowledged = true;
          runId = data.payload?.runId || null;
          this.logger.log(
            `[OpenClaw WS] chat.send acknowledged (runId: ${runId})`,
          );
          return;
        }

        // ── chat.send error ──
        if (
          data.type === 'res' &&
          data.ok === false &&
          chatSent &&
          !chatAcknowledged
        ) {
          resolved = true;
          const errMsg =
            data.error?.message || data.error || 'Chat request failed';
          this.logger.error(`[OpenClaw WS] chat.send failed: ${errMsg}`);
          cleanup();
          reject(new Error(`OpenClaw chat error: ${errMsg}`));
          return;
        }

        // ── Agent streaming (text or assistant stream) ──
        if (data.type === 'event' && data.event === 'agent') {
          const payload = data.payload;
          // Capture delta text from "assistant" stream (primary streaming method)
          if (payload?.stream === 'assistant' && payload?.data?.delta) {
            responseChunks.push(payload.data.delta);
          }
          // Also capture from "text" stream (alternative streaming method)
          if (payload?.stream === 'text' && payload?.data?.text) {
            responseChunks.push(payload.data.text);
          }
          return;
        }

        // ── Chat completion (final state) ──
        // The final event includes the full response in payload.message.content
        if (
          data.type === 'event' &&
          data.event === 'chat' &&
          data.payload?.state === 'final'
        ) {
          this.logger.log('[OpenClaw WS] Chat reached final state');
          resolved = true;

          // Priority 1: Extract full text from the final event's message content
          let fullResponse = '';
          const finalMessage = data.payload?.message;
          if (finalMessage?.content && Array.isArray(finalMessage.content)) {
            for (const block of finalMessage.content) {
              if (block.type === 'text' && block.text) {
                fullResponse += block.text;
              }
            }
          }

          // Priority 2: Streaming chunks (if final event didn't include full text)
          if (!fullResponse && responseChunks.length > 0) {
            fullResponse = responseChunks.join('');
            this.logger.log(
              `[OpenClaw WS] Using ${responseChunks.length} streaming chunks (${fullResponse.length} chars)`,
            );
          }

          // Priority 3: Fall back to the accumulated text from the last assistant stream event
          if (!fullResponse) {
            this.logger.warn(
              '[OpenClaw WS] No response text in final event or stream',
            );
            fullResponse =
              'The AI agent processed this task but did not generate a text response. This may indicate a model configuration issue on the OpenClaw instance.';
          } else {
            this.logger.log(
              `[OpenClaw WS] Chat completed with ${fullResponse.length} chars`,
            );
          }

          cleanup();
          resolve({
            response: fullResponse,
            metadata: { model: 'openclaw', runId },
          });
          return;
        }

        // ── Chat delta events (also carry accumulated text) ──
        // These are emitted alongside agent stream events but carry content blocks
        if (
          data.type === 'event' &&
          data.event === 'chat' &&
          data.payload?.state === 'delta'
        ) {
          // We don't need to process deltas since we collect from agent stream
          // But if we missed stream events, the final event has the full text
          return;
        }

        // ── Error events ──
        if (
          data.type === 'event' &&
          (data.event === 'chat.error' || data.event === 'error')
        ) {
          resolved = true;
          const errMsg =
            data.data?.message || data.payload?.message || 'Unknown error';
          this.logger.error(`[OpenClaw WS] Error event: ${errMsg}`);
          cleanup();
          reject(new Error(`OpenClaw error: ${errMsg}`));
          return;
        }
      });

      ws.on('error', (err) => {
        if (!resolved) {
          resolved = true;
          this.logger.error(`[OpenClaw WS] Connection error: ${err.message}`);
          cleanup();
          reject(new Error(`OpenClaw connection error: ${err.message}`));
        }
      });

      ws.on('close', (code, reason) => {
        this.logger.log(`[OpenClaw WS] Closed: code=${code}`);
        if (!resolved) {
          resolved = true;
          if (responseChunks.length > 0) {
            cleanup();
            resolve({
              response: responseChunks.join(''),
              metadata: { model: 'openclaw' },
            });
          } else {
            cleanup();
            reject(
              new Error(
                `OpenClaw connection closed unexpectedly (code: ${code})`,
              ),
            );
          }
        }
      });
    });
  }

  /**
   * Build a single input string for OpenClaw from message array.
   * Prepends system prompt and conversation history as context.
   */
  private buildOpenClawInput(messages: OpenClawMessage[]): string {
    const parts: string[] = [];

    const systemMsgs = messages.filter((m) => m.role === 'system');
    const nonSystemMsgs = messages.filter((m) => m.role !== 'system');

    // Prepend system context
    if (systemMsgs.length > 0) {
      parts.push(
        '[System Context]\n' + systemMsgs.map((m) => m.content).join('\n'),
      );
    }

    // Add conversation history (all but last user message)
    const historyMsgs = nonSystemMsgs.slice(0, -1);
    if (historyMsgs.length > 0) {
      parts.push(
        '[Conversation History]\n' +
          historyMsgs.map((m) => `${m.role}: ${m.content}`).join('\n'),
      );
    }

    // Add current user message
    const lastMsg = nonSystemMsgs[nonSystemMsgs.length - 1];
    if (lastMsg) {
      parts.push(lastMsg.content);
    }

    return parts.join('\n\n');
  }

  /**
   * Test connection to OpenClaw/OpenRouter instance.
   * For OpenClaw, opens a WebSocket, authenticates, and closes.
   */
  async testConnection(config: OpenClawConfig): Promise<boolean> {
    const isOpenRouter = config.api_url.includes('openrouter.ai');

    if (isOpenRouter) {
      try {
        const response = await fetch(`${config.api_url}/models`, {
          method: 'GET',
          headers: { Authorization: `Bearer ${config.api_key}` },
          signal: AbortSignal.timeout(5000),
        });
        return response.ok;
      } catch (error) {
        this.logger.error(
          '[OpenRouter] Connection test failed:',
          error.message,
        );
        return false;
      }
    }

    // OpenClaw: test via WebSocket auth
    return this.testOpenClawConnection(config);
  }

  /**
   * Test OpenClaw connection via WebSocket handshake.
   */
  private async testOpenClawConnection(
    config: OpenClawConfig,
  ): Promise<boolean> {
    const wsUrl = config.api_url
      .replace(/^https:\/\//, 'wss://')
      .replace(/^http:\/\//, 'ws://');

    this.logger.log(`[OpenClaw WS] Testing connection to ${wsUrl}`);

    return new Promise<boolean>((resolve) => {
      const timer = setTimeout(() => {
        this.logger.warn('[OpenClaw WS] Connection test timed out');
        try {
          ws.close();
        } catch {}
        resolve(false);
      }, 10000);

      const ws = new WebSocket(wsUrl, {
        headers: { 'User-Agent': 'TaskClaw/1.0' },
      });

      ws.on('message', (raw: WebSocket.RawData) => {
        let data: any;
        try {
          data = JSON.parse(raw.toString());
        } catch {
          return;
        }

        if (data.type === 'event' && data.event === 'connect.challenge') {
          const connectMsg = {
            type: 'req',
            id: uuid(),
            method: 'connect',
            params: {
              auth: { token: config.api_key },
              client: {
                id: 'webchat-ui',
                version: '1.0.0',
                platform: 'web',
                mode: 'webchat',
              },
              minProtocol: 3,
              maxProtocol: 3,
              role: 'operator',
              scopes: ['operator.admin'],
            },
          };
          ws.send(JSON.stringify(connectMsg));
          return;
        }

        if (data.type === 'res' && data.ok === true) {
          this.logger.log('[OpenClaw WS] Connection test passed');
          clearTimeout(timer);
          try {
            ws.close();
          } catch {}
          resolve(true);
          return;
        }

        if (data.type === 'res' && data.ok === false) {
          this.logger.warn(
            `[OpenClaw WS] Connection test auth failed: ${data.error?.message || 'unknown'}`,
          );
          clearTimeout(timer);
          try {
            ws.close();
          } catch {}
          resolve(false);
          return;
        }
      });

      ws.on('error', (err) => {
        this.logger.error(
          `[OpenClaw WS] Connection test error: ${err.message}`,
        );
        clearTimeout(timer);
        resolve(false);
      });

      ws.on('close', () => {
        clearTimeout(timer);
      });
    });
  }

  /**
   * Build conversation history for OpenClaw
   */
  buildMessageHistory(
    systemPrompt: string,
    conversationHistory: Array<{ role: string; content: string }>,
    userMessage: string,
  ): OpenClawMessage[] {
    const messages: OpenClawMessage[] = [];

    if (systemPrompt) {
      messages.push({ role: 'system', content: systemPrompt });
    }

    const recentHistory = conversationHistory.slice(-10);
    for (const msg of recentHistory) {
      messages.push({
        role: msg.role as 'user' | 'assistant',
        content: msg.content,
      });
    }

    messages.push({ role: 'user', content: userMessage });

    return messages;
  }
}
