/**
 * Reusable CacheService mock for unit tests.
 *
 * By default: cache misses (get returns undefined).
 * Use mockCacheHit() to simulate a cached value.
 */

export function createCacheMock() {
  const store = new Map<string, any>();

  const mock = {
    get: jest.fn((key: string) => store.get(key)),
    set: jest.fn((key: string, value: any, _ttl: number) => {
      store.set(key, value);
    }),
    delete: jest.fn((key: string) => {
      store.delete(key);
    }),
    deleteByPrefix: jest.fn((prefix: string) => {
      for (const key of store.keys()) {
        if (key.startsWith(prefix)) store.delete(key);
      }
    }),
    /** Seed a cache entry for testing cache-hit paths */
    seed: (key: string, value: any) => {
      store.set(key, value);
    },
    /** Clear the in-memory store and all mock call history */
    reset: () => {
      store.clear();
      mock.get.mockClear();
      mock.set.mockClear();
      mock.delete.mockClear();
      mock.deleteByPrefix.mockClear();
    },
  };

  return mock;
}
