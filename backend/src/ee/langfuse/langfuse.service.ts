import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Langfuse from 'langfuse';

/**
 * Known model pricing (USD per token).
 * Used to estimate costs when the provider doesn't return them.
 */
const MODEL_PRICING: Record<string, { input: number; output: number }> = {
  // OpenAI via OpenRouter
  'openai/gpt-4o': { input: 0.0000025, output: 0.00001 },
  'openai/gpt-4o-mini': { input: 0.00000015, output: 0.0000006 },
  'openai/gpt-4-turbo': { input: 0.00001, output: 0.00003 },
  'openai/gpt-3.5-turbo': { input: 0.0000005, output: 0.0000015 },
  // Anthropic via OpenRouter
  'anthropic/claude-3.5-sonnet': { input: 0.000003, output: 0.000015 },
  'anthropic/claude-3-haiku': { input: 0.00000025, output: 0.00000125 },
  // Meta via OpenRouter
  'meta-llama/llama-3.1-70b-instruct': {
    input: 0.00000052,
    output: 0.00000075,
  },
  'meta-llama/llama-3.1-8b-instruct': { input: 0.00000006, output: 0.00000006 },
  // Google via OpenRouter
  'google/gemini-pro-1.5': { input: 0.00000125, output: 0.000005 },
  // Defaults
  default: { input: 0.000001, output: 0.000002 },
};

export interface TraceGenerationParams {
  /** Unique name for the trace (e.g., 'chat-message', 'title-generation') */
  name: string;
  /** The LLM model used */
  model?: string;
  /** Input messages sent to the LLM */
  input: any;
  /** Output response from the LLM */
  output: any;
  /** Token usage details */
  usage?: {
    promptTokens?: number;
    completionTokens?: number;
    totalTokens?: number;
  };
  /** Duration of the call in milliseconds */
  durationMs?: number;
  /** User ID for attribution */
  userId?: string;
  /** Account ID for multi-tenant attribution */
  accountId?: string;
  /** Conversation ID for session tracking */
  conversationId?: string;
  /** Additional metadata */
  metadata?: Record<string, any>;
  /** Tags for filtering */
  tags?: string[];
  /** Whether the call succeeded */
  success?: boolean;
  /** Error message if failed */
  error?: string;
}

@Injectable()
export class LangfuseService implements OnModuleDestroy {
  private langfuse: Langfuse | null = null;
  private readonly logger = new Logger(LangfuseService.name);
  private readonly enabled: boolean;

  constructor(private readonly configService: ConfigService) {
    const publicKey = this.configService.get<string>('LANGFUSE_PUBLIC_KEY');
    const secretKey = this.configService.get<string>('LANGFUSE_SECRET_KEY');
    const baseUrl =
      this.configService.get<string>('LANGFUSE_BASE_URL') ||
      'https://cloud.langfuse.com';

    if (publicKey && secretKey) {
      this.langfuse = new Langfuse({
        publicKey,
        secretKey,
        baseUrl,
        flushAt: 5, // Flush after 5 events
        flushInterval: 10000, // Or every 10 seconds
      });
      this.enabled = true;
      this.logger.log(`Langfuse initialized (${baseUrl})`);
    } else {
      this.enabled = false;
      this.logger.warn(
        'LANGFUSE_PUBLIC_KEY or LANGFUSE_SECRET_KEY not set — LLM observability disabled. ' +
          'Set both in .env to enable token/cost tracking.',
      );
    }
  }

  /**
   * Check if Langfuse is enabled
   */
  isEnabled(): boolean {
    return this.enabled;
  }

  /**
   * Trace an LLM generation (chat completion, etc.)
   * This is the main method to call from services making AI calls.
   */
  traceGeneration(params: TraceGenerationParams): void {
    if (!this.langfuse || !this.enabled) return;

    try {
      const pricing = this.getModelPricing(params.model);
      const inputCost = (params.usage?.promptTokens || 0) * pricing.input;
      const outputCost = (params.usage?.completionTokens || 0) * pricing.output;

      // Create trace (represents the full request lifecycle)
      const trace = this.langfuse.trace({
        name: params.name,
        userId: params.userId,
        sessionId: params.conversationId,
        metadata: {
          accountId: params.accountId,
          ...params.metadata,
        },
        tags: [
          ...(params.tags || []),
          params.success !== false ? 'success' : 'error',
          params.model ? `model:${params.model}` : 'model:unknown',
        ],
      });

      // Create generation (represents the actual LLM call)
      trace.generation({
        name: `${params.name}-generation`,
        model: params.model || 'unknown',
        input: params.input,
        output: params.output,
        usage: params.usage
          ? {
              promptTokens: params.usage.promptTokens,
              completionTokens: params.usage.completionTokens,
              totalTokens: params.usage.totalTokens,
            }
          : undefined,
        metadata: {
          durationMs: params.durationMs,
          estimatedCost: {
            input: inputCost,
            output: outputCost,
            total: inputCost + outputCost,
            currency: 'USD',
          },
          ...(params.error ? { error: params.error } : {}),
        },
        level: params.success === false ? 'ERROR' : 'DEFAULT',
        statusMessage: params.error || undefined,
      });

      this.logger.debug(
        `Traced ${params.name}: ${params.usage?.totalTokens || 0} tokens, ` +
          `$${(inputCost + outputCost).toFixed(6)} estimated cost`,
      );
    } catch (error) {
      // Never let tracing errors affect the main application
      this.logger.error(`Failed to trace generation: ${error.message}`);
    }
  }

  /**
   * Get token pricing for a model
   */
  private getModelPricing(model?: string): { input: number; output: number } {
    if (!model) return MODEL_PRICING['default'];
    return MODEL_PRICING[model] || MODEL_PRICING['default'];
  }

  /**
   * Flush all pending events (useful before shutdown)
   */
  async flush(): Promise<void> {
    if (this.langfuse) {
      await this.langfuse.flushAsync();
    }
  }

  /**
   * Get usage summary for an account from our local DB.
   * Langfuse tracks everything; this gives a quick local summary.
   */
  async getUsageSummary(
    accountId: string,
    supabaseClient: any,
    days: number = 30,
  ): Promise<{
    totalMessages: number;
    totalTokens: number;
    estimatedCost: number;
    byDay: Array<{
      date: string;
      messages: number;
      tokens: number;
      cost: number;
    }>;
  }> {
    const since = new Date();
    since.setDate(since.getDate() - days);

    // Query messages with AI metadata for token counts
    const { data: messages, error } = await supabaseClient
      .from('messages')
      .select(
        `
        created_at,
        metadata,
        conversation:conversations!inner(account_id)
      `,
      )
      .eq('conversations.account_id', accountId)
      .eq('role', 'assistant')
      .gte('created_at', since.toISOString())
      .order('created_at', { ascending: true });

    if (error || !messages) {
      return { totalMessages: 0, totalTokens: 0, estimatedCost: 0, byDay: [] };
    }

    // Aggregate by day
    const dayMap = new Map<
      string,
      { messages: number; tokens: number; cost: number }
    >();
    let totalTokens = 0;
    let totalCost = 0;

    for (const msg of messages) {
      const date = new Date(msg.created_at).toISOString().split('T')[0];
      const tokens =
        msg.metadata?.tokens_used || msg.metadata?.totalTokens || 0;
      const model = msg.metadata?.model || 'default';
      const pricing = this.getModelPricing(model);
      // Rough estimate: 30% input, 70% output for assistant messages
      const cost = tokens * (pricing.input * 0.3 + pricing.output * 0.7);

      totalTokens += tokens;
      totalCost += cost;

      const existing = dayMap.get(date) || { messages: 0, tokens: 0, cost: 0 };
      existing.messages += 1;
      existing.tokens += tokens;
      existing.cost += cost;
      dayMap.set(date, existing);
    }

    return {
      totalMessages: messages.length,
      totalTokens,
      estimatedCost: Math.round(totalCost * 1000000) / 1000000,
      byDay: Array.from(dayMap.entries()).map(([date, data]) => ({
        date,
        ...data,
        cost: Math.round(data.cost * 1000000) / 1000000,
      })),
    };
  }

  /**
   * Get usage breakdown by task and category for an account.
   */
  async getUsageBreakdown(
    accountId: string,
    supabaseClient: any,
    days: number = 30,
  ): Promise<{
    byTask: Array<{
      task_id: string;
      task_title: string;
      category_id: string | null;
      category_name: string | null;
      messages: number;
      tokens: number;
      cost: number;
    }>;
    byCategory: Array<{
      category_id: string | null;
      category_name: string | null;
      tasks: number;
      messages: number;
      tokens: number;
      cost: number;
    }>;
  }> {
    const since = new Date();
    since.setDate(since.getDate() - days);

    // Query messages joined with conversations → tasks → categories
    const { data: messages, error } = await supabaseClient
      .from('messages')
      .select(
        `
        metadata,
        conversation:conversations!inner(
          account_id,
          task_id,
          task:tasks(id, title, category_id, categories(id, name))
        )
      `,
      )
      .eq('conversations.account_id', accountId)
      .eq('role', 'assistant')
      .gte('created_at', since.toISOString());

    if (error || !messages) {
      return { byTask: [], byCategory: [] };
    }

    // Aggregate by task
    const taskMap = new Map<
      string,
      {
        task_id: string;
        task_title: string;
        category_id: string | null;
        category_name: string | null;
        messages: number;
        tokens: number;
        cost: number;
      }
    >();

    for (const msg of messages) {
      const task = msg.conversation?.task;
      if (!task) continue;

      const tokens =
        msg.metadata?.tokens_used || msg.metadata?.totalTokens || 0;
      const model = msg.metadata?.model || 'default';
      const pricing = this.getModelPricing(model);
      const cost = tokens * (pricing.input * 0.3 + pricing.output * 0.7);

      const existing = taskMap.get(task.id) || {
        task_id: task.id,
        task_title: task.title || 'Untitled',
        category_id: task.category_id || null,
        category_name: task.categories?.name || null,
        messages: 0,
        tokens: 0,
        cost: 0,
      };
      existing.messages += 1;
      existing.tokens += tokens;
      existing.cost += cost;
      taskMap.set(task.id, existing);
    }

    const byTask = Array.from(taskMap.values()).sort(
      (a, b) => b.tokens - a.tokens,
    );

    // Aggregate by category from task data
    const catMap = new Map<
      string,
      {
        category_id: string | null;
        category_name: string | null;
        taskIds: Set<string>;
        messages: number;
        tokens: number;
        cost: number;
      }
    >();

    for (const t of byTask) {
      const key = t.category_id || '__none__';
      const existing = catMap.get(key) || {
        category_id: t.category_id,
        category_name: t.category_name,
        taskIds: new Set<string>(),
        messages: 0,
        tokens: 0,
        cost: 0,
      };
      existing.taskIds.add(t.task_id);
      existing.messages += t.messages;
      existing.tokens += t.tokens;
      existing.cost += t.cost;
      catMap.set(key, existing);
    }

    const byCategory = Array.from(catMap.values())
      .map(({ taskIds, ...rest }) => ({ ...rest, tasks: taskIds.size }))
      .sort((a, b) => b.tokens - a.tokens);

    return {
      byTask: byTask.map((t) => ({
        ...t,
        cost: Math.round(t.cost * 1000000) / 1000000,
      })),
      byCategory: byCategory.map((c) => ({
        ...c,
        cost: Math.round(c.cost * 1000000) / 1000000,
      })),
    };
  }

  /**
   * Get usage for a single task.
   */
  async getTaskUsage(
    accountId: string,
    taskId: string,
    supabaseClient: any,
  ): Promise<{ messages: number; tokens: number; cost: number }> {
    const { data: messages, error } = await supabaseClient
      .from('messages')
      .select(
        `
        metadata,
        conversation:conversations!inner(account_id, task_id)
      `,
      )
      .eq('conversations.account_id', accountId)
      .eq('conversations.task_id', taskId)
      .eq('role', 'assistant');

    if (error || !messages) {
      return { messages: 0, tokens: 0, cost: 0 };
    }

    let totalTokens = 0;
    let totalCost = 0;

    for (const msg of messages) {
      const tokens =
        msg.metadata?.tokens_used || msg.metadata?.totalTokens || 0;
      const model = msg.metadata?.model || 'default';
      const pricing = this.getModelPricing(model);
      totalTokens += tokens;
      totalCost += tokens * (pricing.input * 0.3 + pricing.output * 0.7);
    }

    return {
      messages: messages.length,
      tokens: totalTokens,
      cost: Math.round(totalCost * 1000000) / 1000000,
    };
  }

  async onModuleDestroy() {
    await this.flush();
    if (this.langfuse) {
      await this.langfuse.shutdownAsync();
    }
  }
}
