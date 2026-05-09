import { SyncService } from './sync.service';
import { sourceFixture } from '../__test__/fixtures/source.fixture';
import { createBullQueueMock } from '../__test__/mocks/bullmq.mock';

// ─── Helpers ────────────────────────────────────────────────────────────────

function makeQueryChain(result: any) {
  const chain: any = {};
  ['select', 'eq', 'neq', 'update', 'insert'].forEach((m) => {
    chain[m] = jest.fn().mockReturnValue(chain);
  });
  chain.single = jest.fn().mockResolvedValue(result);
  chain.then = (resolve: any) => Promise.resolve(result).then(resolve);
  return chain;
}

function makeSupabaseAdmin(tableResults: Record<string, any> = {}) {
  return {
    getClient: jest.fn().mockReturnValue({
      from: jest.fn((table: string) =>
        makeQueryChain(tableResults[table] ?? { data: null, error: null }),
      ),
    }),
  };
}

function makeAdapterRegistry() {
  return {
    getAdapter: jest.fn().mockReturnValue({
      sync: jest.fn().mockResolvedValue({
        tasks_synced: 3,
        tasks_created: 2,
        tasks_updated: 1,
        tasks_deleted: 0,
        errors: [],
      }),
    }),
  };
}

function buildService(
  options: {
    sourceResult?: any;
    syncJobResult?: any;
    bullQueueAvailable?: boolean;
    queue?: any;
  } = {},
) {
  const source = sourceFixture();
  const supabaseAdmin = makeSupabaseAdmin({
    sources: options.sourceResult ?? { data: source, error: null },
    sync_jobs: options.syncJobResult ?? { data: { id: 'job-1' }, error: null },
  });

  const adapterRegistry = makeAdapterRegistry();
  const service = new SyncService(
    supabaseAdmin as any,
    adapterRegistry as any,
    options.bullQueueAvailable ?? false,
  );

  if (options.queue) {
    service.setBullQueue(options.queue);
  }

  return { service, supabaseAdmin, adapterRegistry };
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
      const source = sourceFixture({ id: 'locked-source' });
      const { service } = buildService({
        sourceResult: { data: source, error: null },
        syncJobResult: { data: { id: 'job-1' }, error: null },
      });

      // Simulate lock already set
      (service as any).syncLocks.set('locked-source', true);

      await expect(service.syncSource('locked-source')).rejects.toThrow(
        'Sync already in progress for source locked-source',
      );
    });

    it('releases the lock in finally block after success', async () => {
      const source = sourceFixture({ id: 'source-lock-test' });
      const supabaseAdmin = { getClient: jest.fn() };

      // Build chain that tracks multiple table calls
      const mockClient = {
        from: jest.fn((table: string) => {
          if (table === 'sources') {
            return {
              select: jest.fn().mockReturnThis(),
              eq: jest.fn().mockReturnThis(),
              update: jest.fn().mockReturnThis(),
              single: jest
                .fn()
                .mockResolvedValue({ data: source, error: null }),
              then: (resolve: any) =>
                Promise.resolve({ data: source, error: null }).then(resolve),
            };
          }
          return makeQueryChain({ data: { id: 'job-1' }, error: null });
        }),
      };
      supabaseAdmin.getClient.mockReturnValue(mockClient);

      const service = new SyncService(
        supabaseAdmin as any,
        makeAdapterRegistry() as any,
        false,
      );
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
      const source = sourceFixture({ id: 'error-source' });
      const supabaseAdmin = { getClient: jest.fn() };
      const mockClient = {
        from: jest.fn((table: string) => {
          if (table === 'sources') {
            return {
              select: jest.fn().mockReturnThis(),
              eq: jest.fn().mockReturnThis(),
              update: jest.fn().mockReturnThis(),
              single: jest
                .fn()
                .mockResolvedValue({ data: source, error: null }),
              then: (resolve: any) =>
                Promise.resolve({ data: source, error: null }).then(resolve),
            };
          }
          return makeQueryChain({ data: { id: 'job-1' }, error: null });
        }),
      };
      supabaseAdmin.getClient.mockReturnValue(mockClient);

      const service = new SyncService(
        supabaseAdmin as any,
        makeAdapterRegistry() as any,
        false,
      );
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
      const { service } = buildService({
        sourceResult: { data: null, error: { message: 'not found' } },
      });

      await expect(service.syncSource('missing-source')).rejects.toThrow(
        'Source missing-source not found',
      );
    });

    it('throws when sync job record creation fails', async () => {
      const source = sourceFixture();
      const supabaseAdmin = { getClient: jest.fn() };
      const mockClient = {
        from: jest.fn((table: string) => {
          if (table === 'sources') {
            return {
              select: jest.fn().mockReturnThis(),
              eq: jest.fn().mockReturnThis(),
              update: jest.fn().mockReturnThis(),
              single: jest
                .fn()
                .mockResolvedValue({ data: source, error: null }),
              then: (resolve: any) =>
                Promise.resolve({ data: source, error: null }).then(resolve),
            };
          }
          if (table === 'sync_jobs') {
            return {
              insert: jest.fn().mockReturnThis(),
              select: jest.fn().mockReturnThis(),
              update: jest.fn().mockReturnThis(),
              eq: jest.fn().mockReturnThis(),
              single: jest.fn().mockResolvedValue({
                data: null,
                error: { message: 'insert failed' },
              }),
              then: (resolve: any) =>
                Promise.resolve({
                  data: null,
                  error: { message: 'insert failed' },
                }).then(resolve),
            };
          }
          return makeQueryChain({ data: null, error: null });
        }),
      };
      supabaseAdmin.getClient.mockReturnValue(mockClient);

      const service = new SyncService(
        supabaseAdmin as any,
        makeAdapterRegistry() as any,
        false,
      );
      await expect(service.syncSource(source.id)).rejects.toThrow(
        'Failed to create sync job',
      );
    });
  });

  // ── handleScheduledSync() — cron filtering ───────────────────

  describe('handleScheduledSync() — cron scheduling', () => {
    it('enqueues sources that are past their sync_interval_minutes threshold', async () => {
      const overdueSource = sourceFixture({
        id: 'overdue-source',
        sync_interval_minutes: 30,
        last_synced_at: new Date(Date.now() - 60 * 60 * 1000).toISOString(), // 60 min ago
      });

      const supabaseAdmin = {
        getClient: jest.fn().mockReturnValue({
          from: jest.fn().mockReturnValue({
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            neq: jest.fn().mockReturnThis(),
            then: (resolve: any) =>
              Promise.resolve({ data: [overdueSource], error: null }).then(
                resolve,
              ),
          }),
        }),
      };

      const service = new SyncService(
        supabaseAdmin as any,
        makeAdapterRegistry() as any,
        false,
      );
      const addJobSpy = jest
        .spyOn(service, 'addSyncJob')
        .mockResolvedValue({ queued: false });

      await service.handleScheduledSync();

      expect(addJobSpy).toHaveBeenCalledWith(
        overdueSource.id,
        overdueSource.account_id,
        'cron',
      );
    });

    it('skips sources that are not yet due for sync', async () => {
      const recentSource = sourceFixture({
        id: 'recent-source',
        sync_interval_minutes: 30,
        last_synced_at: new Date(Date.now() - 5 * 60 * 1000).toISOString(), // 5 min ago, interval is 30
      });

      const supabaseAdmin = {
        getClient: jest.fn().mockReturnValue({
          from: jest.fn().mockReturnValue({
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            neq: jest.fn().mockReturnThis(),
            then: (resolve: any) =>
              Promise.resolve({ data: [recentSource], error: null }).then(
                resolve,
              ),
          }),
        }),
      };

      const service = new SyncService(
        supabaseAdmin as any,
        makeAdapterRegistry() as any,
        false,
      );
      const addJobSpy = jest
        .spyOn(service, 'addSyncJob')
        .mockResolvedValue({ queued: false });

      await service.handleScheduledSync();
      expect(addJobSpy).not.toHaveBeenCalled();
    });

    it('syncs source with no last_synced_at (treats as epoch → always due)', async () => {
      const neverSynced = sourceFixture({
        id: 'never-synced',
        last_synced_at: null,
        sync_interval_minutes: 30,
      });

      const supabaseAdmin = {
        getClient: jest.fn().mockReturnValue({
          from: jest.fn().mockReturnValue({
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            neq: jest.fn().mockReturnThis(),
            then: (resolve: any) =>
              Promise.resolve({ data: [neverSynced], error: null }).then(
                resolve,
              ),
          }),
        }),
      };

      const service = new SyncService(
        supabaseAdmin as any,
        makeAdapterRegistry() as any,
        false,
      );
      const addJobSpy = jest
        .spyOn(service, 'addSyncJob')
        .mockResolvedValue({ queued: false });

      await service.handleScheduledSync();
      expect(addJobSpy).toHaveBeenCalledWith(
        neverSynced.id,
        neverSynced.account_id,
        'cron',
      );
    });

    it('handles sources fetch error gracefully (no throw)', async () => {
      const supabaseAdmin = {
        getClient: jest.fn().mockReturnValue({
          from: jest.fn().mockReturnValue({
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            neq: jest.fn().mockReturnThis(),
            then: (resolve: any) =>
              Promise.resolve({
                data: null,
                error: { message: 'DB error' },
              }).then(resolve),
          }),
        }),
      };

      const service = new SyncService(
        supabaseAdmin as any,
        makeAdapterRegistry() as any,
        false,
      );
      await expect(service.handleScheduledSync()).resolves.toBeUndefined();
    });
  });
});
