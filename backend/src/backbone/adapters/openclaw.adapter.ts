import { Logger, BadRequestException } from '@nestjs/common';
import {
  BackboneAdapter,
  BackboneSendOptions,
  BackboneSendResult,
  BackboneHealthResult,
  BackboneMessage,
} from './backbone-adapter.interface';
import WebSocket from 'ws';
import { v4 as uuid } from 'uuid';

/**
 * OpenClawAdapter (F007)
 *
 * Implements the BackboneAdapter interface for OpenClaw instances.
 * Uses the OpenClaw WebSocket protocol:
 *   1. Connect to ws://<host>
 *   2. Receive connect.challenge with nonce
 *   3. Respond with connect request (auth token + client info)
 *   4. Send chat.send with the user message
 *   5. Collect streaming text chunks until chat final event
 *   6. Close connection
 *
 * Extracted from openclaw.service.ts — logic preserved faithfully.
 */
export class OpenClawAdapter implements BackboneAdapter {
  readonly slug = 'openclaw';
  private readonly logger = new Logger(OpenClawAdapter.name);

  // ── BackboneAdapter: sendMessage ──

  async sendMessage(options: BackboneSendOptions): Promise<BackboneSendResult> {
    const { config, systemPrompt, message, history, onToken, signal } = options;

    this.validateConfig(config);

    // Build messages array from the unified interface
    const messages: BackboneMessage[] = [];
    if (systemPrompt) {
      messages.push({ role: 'system', content: systemPrompt });
    }
    if (history && history.length > 0) {
      messages.push(...history);
    }
    messages.push({ role: 'user', content: message });

    // Build a single input string for OpenClaw (same as original buildOpenClawInput)
    const userInput = this.buildOpenClawInput(messages);

    return this.executeOpenClawWebSocket(config, userInput, onToken, signal);
  }

  // ── BackboneAdapter: healthCheck ──

  async healthCheck(config: Record<string, any>): Promise<BackboneHealthResult> {
    const start = Date.now();
    try {
      const healthy = await this.testOpenClawConnection(config);
      return {
        healthy,
        latencyMs: Date.now() - start,
        ...(healthy ? {} : { error: 'WebSocket authentication failed' }),
      };
    } catch (err) {
      return {
        healthy: false,
        latencyMs: Date.now() - start,
        error: err.message,
      };
    }
  }

  // ── BackboneAdapter: validateConfig ──

  validateConfig(config: Record<string, any>): void {
    if (!config.api_url) {
      throw new BadRequestException(
        'OpenClaw config requires "api_url" (WebSocket endpoint)',
      );
    }
    if (!config.api_key) {
      throw new BadRequestException(
        'OpenClaw config requires "api_key" (operator token)',
      );
    }
    if (!config.agent_id) {
      throw new BadRequestException(
        'OpenClaw config requires "agent_id" (the agent to route messages to)',
      );
    }
  }

  // ── BackboneAdapter: supportsNativeSkillInjection ──

  supportsNativeSkillInjection(): boolean {
    return true;
  }

  // ── Private: WebSocket execution (faithfully copied from openclaw.service.ts) ──

  private async executeOpenClawWebSocket(
    config: Record<string, any>,
    userInput: string,
    onToken?: (token: string) => void,
    signal?: AbortSignal,
  ): Promise<BackboneSendResult> {
    // Convert HTTP URL to WebSocket URL
    const wsUrl = (config.api_url as string)
      .replace(/^https:\/\//, 'wss://')
      .replace(/^http:\/\//, 'ws://');

    this.logger.log(
      `[OpenClaw WS] Connecting to ${wsUrl} with ${userInput.length} char input`,
    );

    return new Promise<BackboneSendResult>((resolve, reject) => {
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

      // Support abort signal for cancellation
      if (signal) {
        signal.addEventListener(
          'abort',
          () => {
            if (!resolved) {
              resolved = true;
              this.logger.warn('[OpenClaw WS] Request aborted via signal');
              cleanup();
              reject(new Error('OpenClaw request aborted'));
            }
          },
          { once: true },
        );
      }

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
            if (onToken) {
              onToken(payload.data.delta);
            }
          }
          // Also capture from "text" stream (alternative streaming method)
          if (payload?.stream === 'text' && payload?.data?.text) {
            responseChunks.push(payload.data.text);
            if (onToken) {
              onToken(payload.data.text);
            }
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

          // Priority 3: Fall back to a placeholder message
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
            text: fullResponse,
            model: 'openclaw',
            raw: { runId },
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
              text: responseChunks.join(''),
              model: 'openclaw',
              raw: {},
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

  // ── Private: Build input string (faithfully copied from openclaw.service.ts) ──

  private buildOpenClawInput(messages: BackboneMessage[]): string {
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

  // ── Private: Test connection (faithfully copied from openclaw.service.ts) ──

  private async testOpenClawConnection(
    config: Record<string, any>,
  ): Promise<boolean> {
    const wsUrl = (config.api_url as string)
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
}
