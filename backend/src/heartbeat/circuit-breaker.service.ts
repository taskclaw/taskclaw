import { Injectable, Inject, Logger } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { DB, type Db } from '../db';
import { circuitBreakerStates } from '../db/schema';

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

  constructor(@Inject(DB) private readonly db: Db) {}

  /**
   * Returns true if the circuit is open (or half-open acting as open).
   * Automatically transitions from 'open' to 'half-open' after 10 minutes.
   */
  async isOpen(configId: string, threshold: number): Promise<boolean> {
    let data:
      | {
          state: string;
          opened_at: string | null;
          failure_count: number;
        }
      | undefined;

    try {
      const [row] = await this.db
        .select({
          state: circuitBreakerStates.state,
          opened_at: circuitBreakerStates.openedAt,
          failure_count: circuitBreakerStates.failureCount,
        })
        .from(circuitBreakerStates)
        .where(eq(circuitBreakerStates.configId, configId))
        .limit(1);
      data = row;
    } catch (error) {
      this.logger.error(
        `CircuitBreaker isOpen query failed for ${configId}: ${(error as Error).message}`,
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
          await this.db
            .update(circuitBreakerStates)
            .set({ state: 'half-open' })
            .where(eq(circuitBreakerStates.configId, configId));
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
    // Upsert: get current state then update
    const [existing] = await this.db
      .select({
        failure_count: circuitBreakerStates.failureCount,
        state: circuitBreakerStates.state,
        last_failure_at: circuitBreakerStates.lastFailureAt,
      })
      .from(circuitBreakerStates)
      .where(eq(circuitBreakerStates.configId, configId))
      .limit(1);

    const now = new Date().toISOString();
    const currentCount = existing?.failure_count ?? 0;
    const currentState = existing?.state ?? 'closed';

    // Count failures within last 5 minutes
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    const lastFailure = existing?.last_failure_at;
    const recentFailureWindow = lastFailure && lastFailure > fiveMinutesAgo;

    // If half-open and this is a probe failure → re-open
    if (currentState === 'half-open') {
      try {
        await this.db
          .insert(circuitBreakerStates)
          .values({
            configId,
            failureCount: currentCount + 1,
            lastFailureAt: now,
            openedAt: now, // Reset cooldown
            state: 'open',
          })
          .onConflictDoUpdate({
            target: [circuitBreakerStates.configId],
            set: {
              failureCount: currentCount + 1,
              lastFailureAt: now,
              openedAt: now, // Reset cooldown
              state: 'open',
            },
          });
      } catch (error) {
        this.logger.error(
          `CircuitBreaker recordFailure upsert failed for ${configId}: ${(error as Error).message}`,
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

    const updateData: typeof circuitBreakerStates.$inferInsert = {
      configId,
      failureCount: newCount,
      lastFailureAt: now,
      state: 'closed',
    };

    if (shouldOpen) {
      updateData.state = 'open';
      updateData.openedAt = now;
    } else {
      updateData.state = 'closed';
    }

    try {
      await this.db
        .insert(circuitBreakerStates)
        .values(updateData)
        .onConflictDoUpdate({
          target: [circuitBreakerStates.configId],
          set: updateData,
        });
    } catch (error) {
      this.logger.error(
        `CircuitBreaker recordFailure upsert failed for ${configId}: ${(error as Error).message}`,
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
    const values: typeof circuitBreakerStates.$inferInsert = {
      configId,
      failureCount: 0,
      lastFailureAt: null,
      openedAt: null,
      state: 'closed',
    };

    try {
      await this.db
        .insert(circuitBreakerStates)
        .values(values)
        .onConflictDoUpdate({
          target: [circuitBreakerStates.configId],
          set: values,
        });
    } catch (error) {
      this.logger.error(
        `CircuitBreaker recordSuccess upsert failed for ${configId}: ${(error as Error).message}`,
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
