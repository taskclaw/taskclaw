import { SyncService } from './sync.service';
import { sourceFixture, type SourceRow } from '../__test__/fixtures/source.fixture';
import { createBullQueueMock } from '../__test__/mocks/bullmq.mock';
import { createDrizzleMock, type DrizzleMock } from '../__test__/mocks/drizzle.mock';

// ─── Helpers ────────────────────────────────────────────────────────────────

/**
 * The Drizzle `sources` row is camelCase, whereas the PostgREST fixture is
 * snake_case. Re-key so the rows the mocked `db.select()` hands back match the
 * shape the converted service reads (`source.accountId`, `source.syncIntervalMinutes`,
 * `source.lastSyncedAt`, …).
 */
function toDrizzleSource(row: SourceRow) {
  return {
    id: row.id,
    accountId: row.account_id,
    categoryId: 'category-uuid-001',
    provider: row.provider,
    config: {},
    syncStatus: row.sync_status,
    lastSyncedAt: row.last_synced_at,
    lastSyncError: row.last_sync_error,
    syncIntervalMinutes: row.sync_interval_minutes,
    isActive: row.is_active,
    syncFilters: [],
    categoryProperty: null,
    connectionId: null,
  };
}

function makeAdapterRegistry() {
  return {
    getAdapter: jest.fn().mockReturnValue({
      fetchTasks: jest.fn().mockResolvedValue([]),
    }),
  };
}

function buildService(
  options: {
    db?: DrizzleMock;
    bullQueueAvailable?: boolean;
    queue?: any;
  } = {},
) {
  const drizzle = options.db ?? createDrizzleMock();
  const adapterRegistry = makeAdapterRegistry();
  const service = new SyncService(
    drizzle.db as any,
    adapterRegistry as any,
    options.bullQueueAvailable ?? false,
  );

  if (options.queue) {
    service.setBullQueue(options.queue);
  }

  return { service, db: drizzle, adapterRegistry };
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('SyncService', () => {
  // ── addSyncJob() — queue routing ─────────────────────────────

  describe('addSyncJob()', () => {
    it('enqueues a BullMQ job when queue is available', async () => {
      const queue = createBullQueueMock();
      const { service } = buildService({ bullQueueAvailable: true, queue });

      const result = await service.addSyncJob(
        'source-1',
        'account-1',
        'manual',
      );

      expect(result.queued).toBe(true);
      expect(result.jobId).toBe('mock-job-id');
      expect(queue.add).toHaveBeenCalledWith(
        'sync',
        { sourceId: 'source-1', accountId: 'account-1', triggeredBy: 'manual' },
        expect.objectContaining({
          attempts: 3,
          backoff: { type: 'exponential', delay: 5000 },
        }),
      );
    });

    it('returns queued=false and executes directly when no queue available', async () => {
      const { service } = buildService({ bullQueueAvailable: false });
      // Prevent actual syncSource from running (it would fail without full DB setup)
      jest.spyOn(service as any, 'syncSource').mockResolvedValue({
        tasks_synced: 0,
        tasks_created: 0,
        tasks_updated: 0,
        tasks_deleted: 0,
        errors: [],
      });

      const result = await service.addSyncJob('source-1');
      expect(result.queued).toBe(false);
    });

    it('falls back to direct execution when queue.add() throws', async () => {
      const queue = createBullQueueMock();
      queue.add.mockRejectedValue(new Error('Redis connection failed'));
      const { service } = buildService({ bullQueueAvailable: true, queue });
      jest.spyOn(service as any, 'syncSource').mockResolvedValue({
        tasks_synced: 0,
        tasks_created: 0,
        tasks_updated: 0,
        tasks_deleted: 0,
        errors: [],
      });

      const result = await service.addSyncJob('source-1');
      expect(result.queued).toBe(false);
    });
  });

  // ── syncSource() — lock prevention ───────────────────────────

  describe('syncSource() — concurrent sync prevention', () => {
    it('throws when sync is already in progress for the same source', async () => {
      const { service } = buildService();

      // Simulate lock already set
      (service as any).syncLocks.set('locked-source', true);

      await expect(service.syncSource('locked-source')).rejects.toThrow(
        'Sync already in progress for source locked-source',
      );
    });

    it('releases the lock in finally block after success', async () => {
      const source = toDrizzleSource(sourceFixture({ id: 'source-lock-test' }));
      const db = createDrizzleMock();
      // syncSource: select source → [source]; insert sync_job → returning [job]
      db.select.mockReturnValueOnce(db.makeBuilder([source]));
      db.insert.mockReturnValueOnce(db.makeBuilder([{ id: 'job-1' }]));

      const { service } = buildService({ db });
      jest.spyOn(service as any, 'performInboundSync').mockResolvedValue({
        tasks_synced: 1,
        tasks_created: 1,
        tasks_updated: 0,
        tasks_deleted: 0,
        errors: [],
      });

      await service.syncSource('source-lock-test');

      // Lock should be released
      expect((service as any).syncLocks.get('source-lock-test')).toBeFalsy();
    });

    it('releases the lock even when sync throws an error', async () => {
      const source = toDrizzleSource(sourceFixture({ id: 'error-source' }));
      const db = createDrizzleMock();
      db.select.mockReturnValueOnce(db.makeBuilder([source]));
      db.insert.mockReturnValueOnce(db.makeBuilder([{ id: 'job-1' }]));

      const { service } = buildService({ db });
      jest
        .spyOn(service as any, 'performInboundSync')
        .mockRejectedValue(new Error('adapter error'));

      await expect(service.syncSource('error-source')).rejects.toThrow(
        'adapter error',
      );
      expect((service as any).syncLocks.get('error-source')).toBeFalsy();
    });
  });

  // ── syncSource() — error cases ───────────────────────────────

  describe('syncSource() — error handling', () => {
    it('throws when source is not found', async () => {
      const db = createDrizzleMock();
      // select source → [] (no row found)
      db.select.mockReturnValueOnce(db.makeBuilder([]));

      const { service } = buildService({ db });

      await expect(service.syncSource('missing-source')).rejects.toThrow(
        'Source missing-source not found',
      );
    });

    it('throws when sync job record creation fails', async () => {
      const source = toDrizzleSource(sourceFixture());
      const db = createDrizzleMock();
      // select source → [source]; insert sync_job returning → [] (insert produced no row)
      db.select.mockReturnValueOnce(db.makeBuilder([source]));
      db.insert.mockReturnValueOnce(db.makeBuilder([]));

      const { service } = buildService({ db });

      await expect(service.syncSource(source.id)).rejects.toThrow(
        'Failed to create sync job',
      );
    });
  });

  // ── handleScheduledSync() — cron filtering ───────────────────

  describe('handleScheduledSync() — cron scheduling', () => {
    it('enqueues sources that are past their sync_interval_minutes threshold', async () => {
      const overdueSource = toDrizzleSource(
        sourceFixture({
          id: 'overdue-source',
          sync_interval_minutes: 30,
          last_synced_at: new Date(Date.now() - 60 * 60 * 1000).toISOString(), // 60 min ago
        }),
      );

      const db = createDrizzleMock();
      // handleScheduledSync: single select of active sources
      db.select.mockReturnValueOnce(db.makeBuilder([overdueSource]));

      const { service } = buildService({ db });
      const addJobSpy = jest
        .spyOn(service, 'addSyncJob')
        .mockResolvedValue({ queued: false });

      await service.handleScheduledSync();

      expect(addJobSpy).toHaveBeenCalledWith(
        overdueSource.id,
        overdueSource.accountId,
        'cron',
      );
    });

    it('skips sources that are not yet due for sync', async () => {
      const recentSource = toDrizzleSource(
        sourceFixture({
          id: 'recent-source',
          sync_interval_minutes: 30,
          last_synced_at: new Date(Date.now() - 5 * 60 * 1000).toISOString(), // 5 min ago, interval is 30
        }),
      );

      const db = createDrizzleMock();
      db.select.mockReturnValueOnce(db.makeBuilder([recentSource]));

      const { service } = buildService({ db });
      const addJobSpy = jest
        .spyOn(service, 'addSyncJob')
        .mockResolvedValue({ queued: false });

      await service.handleScheduledSync();
      expect(addJobSpy).not.toHaveBeenCalled();
    });

    it('syncs source with no last_synced_at (treats as epoch → always due)', async () => {
      const neverSynced = toDrizzleSource(
        sourceFixture({
          id: 'never-synced',
          last_synced_at: null,
          sync_interval_minutes: 30,
        }),
      );

      const db = createDrizzleMock();
      db.select.mockReturnValueOnce(db.makeBuilder([neverSynced]));

      const { service } = buildService({ db });
      const addJobSpy = jest
        .spyOn(service, 'addSyncJob')
        .mockResolvedValue({ queued: false });

      await service.handleScheduledSync();
      expect(addJobSpy).toHaveBeenCalledWith(
        neverSynced.id,
        neverSynced.accountId,
        'cron',
      );
    });

    it('handles sources fetch error gracefully (no throw)', async () => {
      const db = createDrizzleMock();
      // Drizzle throws (rejects) instead of returning {error}; the cron must swallow it.
      const rejectingBuilder = db.makeBuilder();
      rejectingBuilder.then = (_resolve: any, reject: any) =>
        Promise.reject(new Error('DB error')).then(_resolve, reject);
      db.select.mockReturnValueOnce(rejectingBuilder);

      const { service } = buildService({ db });
      await expect(service.handleScheduledSync()).resolves.toBeUndefined();
    });
  });
});
