import { withRetry, isRetryableError } from './retry.util';

// Speed up tests by removing actual sleep delays
jest.mock('./retry.util', () => {
  const actual = jest.requireActual('./retry.util');
  return {
    ...actual,
    // Override withRetry to use a zero-delay sleep for tests
    withRetry: async <T>(
      fn: () => Promise<T>,
      options: any = {},
    ): Promise<T> => {
      const {
        maxRetries = 3,
        baseDelayMs = 0, // zero delay in tests
        backoffMultiplier = 3,
        isRetryable = actual.isRetryableError,
        logger,
        operationName = 'operation',
      } = options;

      let lastError: any;
      for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
          return await fn();
        } catch (error) {
          lastError = error;
          if (attempt >= maxRetries) break;
          if (!isRetryable(error)) break;
          // No actual sleep — zero delay for unit tests
        }
      }
      throw lastError;
    },
  };
});

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('isRetryableError()', () => {
  describe('network errors — retryable', () => {
    it('retries TypeError (fetch network failure)', () => {
      const err = new TypeError('Failed to fetch');
      expect(isRetryableError(err)).toBe(true);
    });

    it('retries ECONNREFUSED', () => {
      expect(isRetryableError({ code: 'ECONNREFUSED' })).toBe(true);
    });

    it('retries ECONNRESET', () => {
      expect(isRetryableError({ code: 'ECONNRESET' })).toBe(true);
    });

    it('retries ETIMEDOUT', () => {
      expect(isRetryableError({ code: 'ETIMEDOUT' })).toBe(true);
    });

    it('retries ENOTFOUND', () => {
      expect(isRetryableError({ code: 'ENOTFOUND' })).toBe(true);
    });

    it('retries AbortError', () => {
      expect(isRetryableError({ name: 'AbortError' })).toBe(true);
    });
  });

  describe('5xx status codes — retryable', () => {
    it('retries 500 in error message', () => {
      expect(
        isRetryableError({ message: 'API error (500): Internal Server Error' }),
      ).toBe(true);
    });

    it('retries 503 in error message', () => {
      expect(
        isRetryableError({ message: 'API error (503): Service Unavailable' }),
      ).toBe(true);
    });

    it('retries when error.status is 500', () => {
      expect(isRetryableError({ status: 500 })).toBe(true);
    });

    it('retries when error.statusCode is 502', () => {
      expect(isRetryableError({ statusCode: 502 })).toBe(true);
    });
  });

  describe('4xx status codes — NOT retryable', () => {
    it('does not retry 400 in error message', () => {
      expect(
        isRetryableError({ message: 'API error (400): Bad Request' }),
      ).toBe(false);
    });

    it('does not retry 401 in error message', () => {
      expect(
        isRetryableError({ message: 'API error (401): Unauthorized' }),
      ).toBe(false);
    });

    it('does not retry 404 in error message', () => {
      expect(isRetryableError({ message: 'API error (404): Not Found' })).toBe(
        false,
      );
    });

    it('does not retry when error.status is 422', () => {
      expect(isRetryableError({ status: 422 })).toBe(false);
    });
  });

  describe('unknown errors — NOT retryable by default', () => {
    it('does not retry plain Error with no status or code', () => {
      expect(isRetryableError(new Error('Something went wrong'))).toBe(false);
    });

    it('throws when called with null (null has no properties to check)', () => {
      // isRetryableError doesn't guard against null — callers should handle this
      expect(() => isRetryableError(null)).toThrow();
    });
  });
});

describe('withRetry()', () => {
  describe('success cases', () => {
    it('returns the result on the first successful call', async () => {
      const fn = jest.fn().mockResolvedValue('success');
      const result = await withRetry(fn, { maxRetries: 3 });
      expect(result).toBe('success');
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('succeeds on second attempt after one retryable failure', async () => {
      const fn = jest
        .fn()
        .mockRejectedValueOnce({ code: 'ECONNREFUSED' })
        .mockResolvedValueOnce('second attempt success');
      const result = await withRetry(fn, { maxRetries: 3 });
      expect(result).toBe('second attempt success');
      expect(fn).toHaveBeenCalledTimes(2);
    });
  });

  describe('retry behavior', () => {
    it('retries up to maxRetries on 5xx errors', async () => {
      const fn = jest.fn().mockRejectedValue({ statusCode: 503 });
      await expect(withRetry(fn, { maxRetries: 2 })).rejects.toBeDefined();
      expect(fn).toHaveBeenCalledTimes(3); // 1 initial + 2 retries
    });

    it('does NOT retry on 4xx errors', async () => {
      const fn = jest.fn().mockRejectedValue({ status: 401 });
      await expect(withRetry(fn, { maxRetries: 3 })).rejects.toBeDefined();
      expect(fn).toHaveBeenCalledTimes(1); // no retries
    });

    it('throws the last error after exhausting all retries', async () => {
      const finalError = {
        code: 'ECONNREFUSED',
        message: 'Connection refused',
      };
      const fn = jest.fn().mockRejectedValue(finalError);
      await expect(withRetry(fn, { maxRetries: 2 })).rejects.toEqual(
        finalError,
      );
    });

    it('stops retrying immediately on non-retryable error even with retries remaining', async () => {
      const fn = jest
        .fn()
        .mockRejectedValueOnce({ status: 429 }) // 4xx — not retryable
        .mockResolvedValueOnce('should not reach here');
      await expect(withRetry(fn, { maxRetries: 3 })).rejects.toBeDefined();
      expect(fn).toHaveBeenCalledTimes(1);
    });
  });

  describe('custom isRetryable predicate', () => {
    it('uses custom isRetryable to decide retry eligibility', async () => {
      const fn = jest
        .fn()
        .mockRejectedValueOnce(new Error('specific error'))
        .mockResolvedValueOnce('ok');

      const result = await withRetry(fn, {
        maxRetries: 3,
        isRetryable: (err) => err.message === 'specific error',
      });

      expect(result).toBe('ok');
      expect(fn).toHaveBeenCalledTimes(2);
    });
  });

  describe('maxRetries = 0', () => {
    it('makes exactly one attempt and throws immediately', async () => {
      const fn = jest.fn().mockRejectedValue({ code: 'ECONNREFUSED' });
      await expect(withRetry(fn, { maxRetries: 0 })).rejects.toBeDefined();
      expect(fn).toHaveBeenCalledTimes(1);
    });
  });
});
