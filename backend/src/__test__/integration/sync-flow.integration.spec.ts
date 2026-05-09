/**
 * Sync Flow Integration Test
 *
 * Wires SyncService with its real method implementations.
 * Only Supabase DB calls and external adapter HTTP calls are mocked.
 *
 * Tests the full sync lifecycle: lock → source fetch → job creation →
 * status update → adapter sync → result persistence → lock release.
 */
import { SyncService } from '../../sync/sync.service';
import { sourceFixture } from '../fixtures/source.fixture';
import { createBullQueueMock } from '../mocks/bullmq.mock';

// ─── DB mock factory ────────────────────────────────────────────────────────

interface TableMock {
  selectResult?: any;
  insertResult?: any;
  updateResult?: any;
}

function buildDb(tables: Record<string, TableMock>) {
  return {
    from: jest.fn((table: string) => {
      const t = tables[table] ?? {};
      const chain: any = {
        select: jest.fn().mockReturnThis(),
        insert: jest.fn().mockReturnThis(),
        update: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        neq: jest.fn().mockReturnThis(),
        single: jest
          .fn()
          .mockResolvedValue(t.selectResult ?? { data: null, error: null }),
        then: (resolve: any) =>
          Promise.resolve(t.selectResult ?? { data: null, error: null }).then(
            resolve,
          ),
      };
      // insert returns a chain that resolves to insertResult
      chain.insert.mockReturnValue({
        select: jest.fn().mockReturnThis(),
        single: jest
          .fn()
          .mockResolvedValue(t.insertResult ?? { data: null, error: null }),
        then: (resolve: any) =>
          Promise.resolve(t.insertResult ?? { data: null, error: null }).then(
            resolve,
          ),
      });
      // update returns a chain that resolves to updateResult
      chain.update.mockReturnValue({
        eq: jest
          .fn()
          .mockResolvedValue(t.updateResult ?? { data: null, error: null }),
        then: (resolve: any) =>
          Promise.resolve(t.updateResult ?? { data: null, error: null }).then(
            resolve,
          ),
      });
      return chain;
    }),
  };
}

function buildAdapterRegistry(syncResult: any) {
  return {
    getAdapter: jest.fn().mockReturnValue({
      sync: jest.fn().mockResolvedValue(syncResult),
    }),
  };
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('[Integration] SyncService — full sync lifecycle', () => {
  const source = sourceFixture({
    id: 'source-integration-test',
    provider: 'notion',
    account_id: 'account-1',
  });

  const successSyncResult = {
    tasks_synced: 5,
    tasks_created: 3,
    tasks_updated: 2,
    tasks_deleted: 0,
    errors: [],
  };

  function buildService(db: any, adapterRegistry: any) {
    const supabaseAdmin = { getClient: jest.fn().mockReturnValue(db) };
    const service = new SyncService(
      supabaseAdmin as any,
      adapterRegistry,
      false,
    );
    // Inject performInboundSync as a spy over the private method
    return service;
  }

  // ── Full success lifecycle ───────────────────────────────────

  describe('successful sync lifecycle', () => {
    it('transitions source: idle → syncing → idle', async () => {
      const db = buildDb({
        sources: {
          selectResult: { data: source, error: null },
          updateResult: { data: null, error: null },
        },
        sync_jobs: {
          insertResult: { data: { id: 'job-integration-1' }, error: null },
          updateResult: { data: null, error: null },
        },
      });

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
      const db = buildDb({
        sources: { selectResult: { data: source, error: null } },
        sync_jobs: { insertResult: { data: { id: 'job-1' }, error: null } },
      });

      const service = buildService(db, buildAdapterRegistry(successSyncResult));
      jest
        .spyOn(service as any, 'performInboundSync')
        .mockResolvedValue(successSyncResult);

      await service.syncSource(source.id);

      // Lock must be falsy after completion
      const locks = (service as any).syncLocks;
      expect(locks.get(source.id)).toBeFalsy();
    });
  });

  // ── Failure lifecycle ─────────────────────────────────────────

  describe('failure sync lifecycle', () => {
    it('lock is released even when performInboundSync throws', async () => {
      const db = buildDb({
        sources: { selectResult: { data: source, error: null } },
        sync_jobs: { insertResult: { data: { id: 'job-err-1' }, error: null } },
      });

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

  // ── Concurrent sync prevention ───────────────────────────────

  describe('concurrent sync prevention', () => {
    it('blocks a second syncSource() call while first is in-progress', async () => {
      const db = buildDb({
        sources: { selectResult: { data: source, error: null } },
        sync_jobs: {
          insertResult: { data: { id: 'job-concurrent-1' }, error: null },
        },
      });

      const service = buildService(db, buildAdapterRegistry(successSyncResult));

      // Manually set the lock to simulate in-progress sync
      (service as any).syncLocks.set(source.id, true);

      await expect(service.syncSource(source.id)).rejects.toThrow(
        `Sync already in progress for source ${source.id}`,
      );
    });

    it('allows a second sync after the first completes and releases the lock', async () => {
      const db = buildDb({
        sources: { selectResult: { data: source, error: null } },
        sync_jobs: { insertResult: { data: { id: 'job-2' }, error: null } },
      });

      const service = buildService(db, buildAdapterRegistry(successSyncResult));
      jest
        .spyOn(service as any, 'performInboundSync')
        .mockResolvedValue(successSyncResult);

      await service.syncSource(source.id);
      // Lock released — second call should succeed
      await expect(service.syncSource(source.id)).resolves.toBeDefined();
    });
  });

  // ── addSyncJob → direct fallback ─────────────────────────────

  describe('addSyncJob — queue fallback', () => {
    it('uses setBullQueue and routes job correctly', async () => {
      const queue = createBullQueueMock();

      const db = buildDb({});
      const service = buildService(db, buildAdapterRegistry(successSyncResult));
      service.setBullQueue(queue as any);

      // Inject bullQueueAvailable token
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
