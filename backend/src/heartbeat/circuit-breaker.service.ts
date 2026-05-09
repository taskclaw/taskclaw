import { Injectable, Logger } from '@nestjs/common';
import { SupabaseAdminService } from '../supabase/supabase-admin.service';

/**
 * DB-backed circuit breaker service.
 *
 * State is persisted in `circuit_breaker_states` so it survives restarts and deploys.
 *
 * Rules:
 * - 3+ failures within 5 minutes → state = 'open'
 * - 10 minutes after opened_at → state = 'half-open' (allow one probe call)
 * - probe success (recordSuccess while half-open) → state = 'closed', failure_count = 0
 * - probe failure (recordFailure while half-open) → state = 'open', reset opened_at
 */
@Injectable()
export class CircuitBreakerService {
  private readonly logger = new Logger(CircuitBreakerService.name);

  constructor(private readonly supabaseAdmin: SupabaseAdminService) {}

  /**
   * Returns true if the circuit is open (or half-open acting as open).
   * Automatically transitions from 'open' to 'half-open' after 10 minutes.
   */
  async isOpen(configId: string, threshold: number): Promise<boolean> {
    const client = this.supabaseAdmin.getClient();

    const { data, error } = await client
      .from('circuit_breaker_states')
      .select('state, opened_at, failure_count')
      .eq('config_id', configId)
      .maybeSingle();

    if (error) {
      this.logger.error(
        `CircuitBreaker isOpen query failed for ${configId}: ${error.message}`,
      );
      // Fail closed — allow execution on DB error
      return false;
    }

    if (!data) {
      // No record → circuit is closed
      return false;
    }

    if (data.state === 'closed') {
      return false;
    }

    if (data.state === 'open') {
      // Check if 10 minutes have passed → transition to half-open
      if (data.opened_at) {
        const openedAt = new Date(data.opened_at).getTime();
        const tenMinutesMs = 10 * 60 * 1000;
        if (Date.now() - openedAt >= tenMinutesMs) {
          // Transition to half-open
          await client
            .from('circuit_breaker_states')
            .update({ state: 'half-open' })
            .eq('config_id', configId);
          this.logger.log(
            `CircuitBreaker ${configId}: open → half-open (10min elapsed)`,
          );
          // half-open means we allow one probe — return false so execution proceeds
          return false;
        }
      }
      return true; // Still open
    }

    if (data.state === 'half-open') {
      // Allow one probe — treat as not open
      return false;
    }

    return false;
  }

  /**
   * Record a failure. Returns true if the circuit just opened.
   */
  async recordFailure(configId: string, threshold: number): Promise<boolean> {
    const client = this.supabaseAdmin.getClient();

    // Upsert: get current state then update
    const { data: existing } = await client
      .from('circuit_breaker_states')
      .select('failure_count, state, last_failure_at')
      .eq('config_id', configId)
      .maybeSingle();

    const now = new Date().toISOString();
    const currentCount = existing?.failure_count ?? 0;
    const currentState = existing?.state ?? 'closed';

    // Count failures within last 5 minutes
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    const lastFailure = existing?.last_failure_at;
    const recentFailureWindow =
      lastFailure && lastFailure > fiveMinutesAgo;

    // If half-open and this is a probe failure → re-open
    if (currentState === 'half-open') {
      const { error } = await client.from('circuit_breaker_states').upsert({
        config_id: configId,
        failure_count: currentCount + 1,
        last_failure_at: now,
        opened_at: now, // Reset cooldown
        state: 'open',
      });
      if (error) {
        this.logger.error(
          `CircuitBreaker recordFailure upsert failed for ${configId}: ${error.message}`,
        );
      }
      this.logger.warn(
        `CircuitBreaker ${configId}: half-open probe failed → re-opened`,
      );
      return true;
    }

    // For closed state: increment count and check threshold
    const newCount = recentFailureWindow ? currentCount + 1 : 1;
    const shouldOpen = newCount >= threshold;

    const updateData: Record<string, any> = {
      config_id: configId,
      failure_count: newCount,
      last_failure_at: now,
    };

    if (shouldOpen) {
      updateData.state = 'open';
      updateData.opened_at = now;
    } else {
      updateData.state = 'closed';
    }

    const { error } = await client
      .from('circuit_breaker_states')
      .upsert(updateData);

    if (error) {
      this.logger.error(
        `CircuitBreaker recordFailure upsert failed for ${configId}: ${error.message}`,
      );
    }

    if (shouldOpen) {
      this.logger.warn(
        `CircuitBreaker ${configId}: ${newCount} failures in 5min → OPEN`,
      );
    }

    return shouldOpen;
  }

  /**
   * Record a success. Resets the circuit to closed.
   */
  async recordSuccess(configId: string): Promise<void> {
    const client = this.supabaseAdmin.getClient();

    const { error } = await client.from('circuit_breaker_states').upsert({
      config_id: configId,
      failure_count: 0,
      last_failure_at: null,
      opened_at: null,
      state: 'closed',
    });

    if (error) {
      this.logger.error(
        `CircuitBreaker recordSuccess upsert failed for ${configId}: ${error.message}`,
      );
    }
  }

  /**
   * Reset circuit state (alias for recordSuccess).
   */
  async reset(configId: string): Promise<void> {
    await this.recordSuccess(configId);
  }
}
