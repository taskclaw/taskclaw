import { Injectable } from '@nestjs/common';

@Injectable()
export class CircuitBreakerService {
  private failures = new Map<string, number>();

  recordFailure(configId: string, threshold: number): boolean {
    const count = (this.failures.get(configId) ?? 0) + 1;
    this.failures.set(configId, count);
    return count >= threshold;
  }

  recordSuccess(configId: string) {
    this.failures.delete(configId);
  }

  isOpen(configId: string, threshold: number): boolean {
    return (this.failures.get(configId) ?? 0) >= threshold;
  }

  reset(configId: string) {
    this.failures.delete(configId);
  }
}
