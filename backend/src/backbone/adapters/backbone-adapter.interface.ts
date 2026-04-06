/**
 * BackboneAdapter interface (F005)
 *
 * Each AI backbone (OpenClaw, OpenAI, Anthropic, etc.) implements this
 * interface so the router can talk to it in a unified way.
 */

export interface BackboneSendOptions {
  /** Decrypted connection config (api_url, api_key, model, etc.) */
  config: Record<string, any>;
  /** System prompt to inject */
  systemPrompt: string;
  /** User message */
  message: string;
  /** Conversation history (role + content pairs) */
  history?: BackboneMessage[];
  /** Skills the agent has available */
  skills?: BackboneSkillDefinition[];
  /** Optional streaming callback; when provided the adapter should stream */
  onToken?: (token: string) => void;
  /** Abort signal for cancellation */
  signal?: AbortSignal;
  /** Additional metadata (account_id, conversation_id, etc.) */
  metadata?: Record<string, any>;
}

export interface BackboneMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  /** Tool call metadata when role === 'tool' */
  tool_call_id?: string;
}

export interface BackboneSkillDefinition {
  name: string;
  description: string;
  parameters: Record<string, any>;
}

export interface BackboneSendResult {
  /** Final assistant reply text */
  text: string;
  /** Token usage (if reported by the backbone) */
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
  };
  /** Model that actually served the request */
  model?: string;
  /** Raw response from the backbone (for debugging / logging) */
  raw?: any;
}

export interface BackboneHealthResult {
  healthy: boolean;
  latencyMs?: number;
  error?: string;
  /** Optional additional metadata reported by the adapter (e.g. version, type) */
  metadata?: Record<string, any>;
}

export interface BackboneAdapter {
  /** Unique slug that identifies this backbone type (e.g. 'openclaw', 'openai') */
  readonly slug: string;

  /** Send a message and return the response */
  sendMessage(options: BackboneSendOptions): Promise<BackboneSendResult>;

  /** Check whether a connection with the given config is reachable */
  healthCheck(config: Record<string, any>): Promise<BackboneHealthResult>;

  /** Validate config shape before saving (throw BadRequestException on failure) */
  validateConfig(config: Record<string, any>): void;

  /**
   * Optional: transform the system prompt for this backbone's conventions.
   * Default behaviour (when not implemented): return the prompt as-is.
   */
  transformSystemPrompt?(prompt: string, config: Record<string, any>): string;

  /**
   * Optional: whether this backbone supports native skill/tool injection.
   * When true the router passes skills to sendMessage; otherwise it injects
   * skill descriptions into the system prompt.
   */
  supportsNativeSkillInjection?(): boolean;
}
