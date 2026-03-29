import { Injectable } from '@nestjs/common';
import { TraceGenerationParams } from '../ee/langfuse/langfuse.service';

/**
 * No-op implementation of LangfuseService for the community edition.
 * All methods silently do nothing — this allows services that depend on
 * LangfuseService to work without changes in the community edition.
 */
@Injectable()
export class LangfuseNoopService {
  isEnabled(): boolean {
    return false;
  }

  traceGeneration(_params: TraceGenerationParams): void {
    // noop
  }

  async flush(): Promise<void> {
    // noop
  }

  async getUsageSummary(): Promise<{
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
    return { totalMessages: 0, totalTokens: 0, estimatedCost: 0, byDay: [] };
  }

  async getUsageBreakdown(): Promise<{
    byTask: any[];
    byCategory: any[];
  }> {
    return { byTask: [], byCategory: [] };
  }

  async getTaskUsage(): Promise<{
    messages: number;
    tokens: number;
    cost: number;
  }> {
    return { messages: 0, tokens: 0, cost: 0 };
  }

  async onModuleDestroy(): Promise<void> {
    // noop
  }
}
