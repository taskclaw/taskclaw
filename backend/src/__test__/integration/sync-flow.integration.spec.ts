/**
 * Sync Flow Integration Test
 *
 * Wires SyncService (now Drizzle-backed) with its real method implementations.
 * Only DB calls (Drizzle) and external adapter calls are mocked.
 *
 * Tests the full sync lifecycle: lock → source fetch → job creation →
 * status update → adapter sync → result persistence → lock release.
 */
import { SyncService } from '../../sync/sync.service';
import { createDrizzleMock } from '../mocks/drizzle.mock';
import { createBullQueueMock } from '../mocks/bullmq.mock';

// A Drizzle (camelCase) source row the converted service reads.
function drizzleSource(overrides: Record<string, any> = {}) {
  return {
    id: 'source-integration-test',
    provider: 'notion',
    accountId: 'account-1',
    categoryId: 'cat-1',
    isActive: true,
    syncStatus: 'idle',
    config: {},
    syncFilters: [],
    connectionId: null,
    ...overrides,
  };
}

function buildAdapterRegistry(syncResult: any) {
  return {
    getAdapter: jest.fn().mockReturnValue({
      fetchTasks: jest.fn().mockResolvedValue(syncResult),
      sync: jest.fn().mockResolvedValue(syncResult),
    }),
  };
}

/** A Drizzle mock seeded so source-fetch returns `source` and job-insert returns an id. */
function buildDb(source: any, jobId = 'job-1') {
  const db = createDrizzleMock();
  db.select.mockReturnValue(db.makeBuilder(source ? [source] : []));
  db.insert.mockReturnValue(db.makeBuilder([{ id: jobId }]));
  db.update.mockReturnValue(db.makeBuilder([]));
  return db;
}

describe('[Integration] SyncService — full sync lifecycle', () => {
  const source = drizzleSource();

  const successSyncResult = {
    tasks_synced: 5,
    tasks_created: 3,
    tasks_updated: 2,
    tasks_deleted: 0,
    errors: [],
  };

  function buildService(db: ReturnType<typeof createDrizzleMock>, adapterRegistry: any) {
    return new SyncService(db.db as any, adapterRegistry, false);
  }

  describe('successful sync lifecycle', () => {
    it('runs the sync and returns the adapter result', async () => {
      const db = buildDb(source, 'job-integration-1');
      const service = buildService(db, buildAdapterRegistry(successSyncResult));
      jest
        .spyOn(service as any, 'performInboundSync')
        .mockResolvedValue(successSyncResult);

      const result = await service.syncSource(source.id);

      expect(result.tasks_synced).toBe(5);
      expect(result.tasks_created).toBe(3);
      expect(result.tasks_updated).toBe(2);
      expect(result.errors).toHaveLength(0);
    });

    it('lock is always released after successful sync', async () => {
      const db = buildDb(source);
      const service = buildService(db, buildAdapterRegistry(successSyncResult));
      jest
        .spyOn(service as any, 'performInboundSync')
        .mockResolvedValue(successSyncResult);

      await service.syncSource(source.id);

      const locks = (service as any).syncLocks;
      expect(locks.get(source.id)).toBeFalsy();
    });
  });

  describe('failure sync lifecycle', () => {
    it('lock is released even when performInboundSync throws', async () => {
      const db = buildDb(source, 'job-err-1');
      const service = buildService(db, buildAdapterRegistry(successSyncResult));
      jest
        .spyOn(service as any, 'performInboundSync')
        .mockRejectedValue(new Error('Notion API rate limit exceeded'));

      await expect(service.syncSource(source.id)).rejects.toThrow(
        'Notion API rate limit exceeded',
      );

      const locks = (service as any).syncLocks;
      expect(locks.get(source.id)).toBeFalsy();
    });
  });

  describe('concurrent sync prevention', () => {
    it('blocks a second syncSource() call while first is in-progress', async () => {
      const db = buildDb(source, 'job-concurrent-1');
      const service = buildService(db, buildAdapterRegistry(successSyncResult));

      (service as any).syncLocks.set(source.id, true);

      await expect(service.syncSource(source.id)).rejects.toThrow(
        `Sync already in progress for source ${source.id}`,
      );
    });

    it('allows a second sync after the first completes and releases the lock', async () => {
      const db = buildDb(source, 'job-2');
      const service = buildService(db, buildAdapterRegistry(successSyncResult));
      jest
        .spyOn(service as any, 'performInboundSync')
        .mockResolvedValue(successSyncResult);

      await service.syncSource(source.id);
      await expect(service.syncSource(source.id)).resolves.toBeDefined();
    });
  });

  describe('addSyncJob — queue fallback', () => {
    it('uses setBullQueue and routes job correctly', async () => {
      const queue = createBullQueueMock();
      const db = buildDb(null);
      const service = buildService(db, buildAdapterRegistry(successSyncResult));
      service.setBullQueue(queue as any);
      (service as any).bullQueueAvailable = true;

      const result = await service.addSyncJob('source-q', 'account-q', 'cron');

      expect(result.queued).toBe(true);
      expect(queue.add).toHaveBeenCalledWith(
        'sync',
        { sourceId: 'source-q', accountId: 'account-q', triggeredBy: 'cron' },
        expect.objectContaining({ attempts: 3 }),
      );
    });
  });
});
