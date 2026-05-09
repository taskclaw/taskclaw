import { NotFoundException } from '@nestjs/common';
import { BackboneRouterService } from './backbone-router.service';
import { backboneConnectionFixture } from '../__test__/fixtures/backbone.fixture';

// ─── Helpers ────────────────────────────────────────────────────────────────

/** Build a chainable Supabase query mock that resolves with a maybeSingle result */
function makeQueryChain(result: any) {
  const chain: any = {};
  ['select', 'eq', 'order', 'limit'].forEach((m) => {
    chain[m] = jest.fn().mockReturnValue(chain);
  });
  chain.maybeSingle = jest
    .fn()
    .mockResolvedValue({ data: result, error: null });
  chain.single = jest.fn().mockResolvedValue({ data: result, error: null });
  return chain;
}

/** Build a SupabaseAdminService mock where each table returns configurable data */
function makeSupabaseAdmin(tableData: Record<string, any> = {}) {
  return {
    getClient: jest.fn().mockReturnValue({
      from: jest.fn((table: string) =>
        makeQueryChain(tableData[table] ?? null),
      ),
    }),
  };
}

/** Build a BackboneAdapterRegistry mock */
function makeRegistry(adapterOverrides: Partial<any> = {}) {
  const adapter = {
    slug: 'anthropic',
    sendMessage: jest
      .fn()
      .mockResolvedValue({ text: 'response', usage: { total_tokens: 100 } }),
    supportsNativeSkillInjection: jest.fn().mockReturnValue(true),
    transformSystemPrompt: undefined,
    ...adapterOverrides,
  };
  return {
    get: jest.fn().mockReturnValue(adapter),
    _adapter: adapter,
  };
}

/** Build a BackboneConnectionsService mock */
function makeConnections(defaultConn: any = null, activeConns: any[] = []) {
  return {
    getAccountDefault: jest.fn().mockResolvedValue(defaultConn),
    findAllActive: jest.fn().mockResolvedValue(activeConns),
    decryptConfig: jest.fn((config: any) => ({
      decrypted: true,
      original: config,
    })),
    trackUsage: jest.fn().mockResolvedValue(undefined),
  };
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('BackboneRouterService', () => {
  const ACCOUNT_ID = 'account-uuid-001';

  // ── resolve() cascade order ──────────────────────────────────

  describe('resolve() — cascade order', () => {
    it('returns task-level connection when task has backbone_connection_id', async () => {
      const activeConn = backboneConnectionFixture({ id: 'task-conn' });
      const supabaseAdmin = makeSupabaseAdmin({
        tasks: { backbone_connection_id: 'task-conn' },
        backbone_connections: activeConn,
      });
      // Override from() to return active conn for backbone_connections table
      const client = supabaseAdmin.getClient();
      client.from.mockImplementation((table: string) => {
        if (table === 'tasks')
          return makeQueryChain({ backbone_connection_id: 'task-conn' });
        if (table === 'backbone_connections') return makeQueryChain(activeConn);
        return makeQueryChain(null);
      });

      const registry = makeRegistry();
      const connections = makeConnections();
      const service = new BackboneRouterService(
        supabaseAdmin as any,
        registry as any,
        connections as any,
      );

      const result = await service.resolve(ACCOUNT_ID, { taskId: 'task-1' });
      expect(result.resolvedFrom).toBe('task');
    });

    it('skips task level and uses step level when task has no backbone', async () => {
      const stepConn = backboneConnectionFixture({ id: 'step-conn' });
      const supabaseAdmin = { getClient: jest.fn() };
      const client = {
        from: jest.fn((table: string) => {
          if (table === 'tasks')
            return makeQueryChain({ backbone_connection_id: null });
          if (table === 'board_steps')
            return makeQueryChain({ backbone_connection_id: 'step-conn' });
          if (table === 'backbone_connections') return makeQueryChain(stepConn);
          return makeQueryChain(null);
        }),
      };
      supabaseAdmin.getClient.mockReturnValue(client);

      const service = new BackboneRouterService(
        supabaseAdmin as any,
        makeRegistry() as any,
        makeConnections() as any,
      );

      const result = await service.resolve(ACCOUNT_ID, {
        taskId: 'task-1',
        stepId: 'step-1',
      });
      expect(result.resolvedFrom).toBe('step');
    });

    it('falls through to account_default when all explicit levels are null', async () => {
      const defaultConn = backboneConnectionFixture({ id: 'default-conn' });
      const supabaseAdmin = {
        getClient: jest.fn().mockReturnValue({
          from: jest.fn().mockReturnValue(makeQueryChain(null)),
        }),
      };
      const connections = makeConnections(defaultConn);
      const service = new BackboneRouterService(
        supabaseAdmin as any,
        makeRegistry() as any,
        connections as any,
      );

      const result = await service.resolve(ACCOUNT_ID);
      expect(result.resolvedFrom).toBe('account_default');
      expect(connections.getAccountDefault).toHaveBeenCalledWith(ACCOUNT_ID);
    });

    it('falls through to legacy_fallback and logs warning when no default exists', async () => {
      const fallbackConn = backboneConnectionFixture({ id: 'fallback-conn' });
      const supabaseAdmin = {
        getClient: jest.fn().mockReturnValue({
          from: jest.fn().mockReturnValue(makeQueryChain(null)),
        }),
      };
      const connections = makeConnections(null, [fallbackConn]);
      const service = new BackboneRouterService(
        supabaseAdmin as any,
        makeRegistry() as any,
        connections as any,
      );

      const result = await service.resolve(ACCOUNT_ID);
      expect(result.resolvedFrom).toBe('legacy_fallback');
    });

    it('throws NotFoundException when no backbone found at any level', async () => {
      const supabaseAdmin = {
        getClient: jest.fn().mockReturnValue({
          from: jest.fn().mockReturnValue(makeQueryChain(null)),
        }),
      };
      const connections = makeConnections(null, []); // no fallback either
      const service = new BackboneRouterService(
        supabaseAdmin as any,
        makeRegistry() as any,
        connections as any,
      );

      await expect(service.resolve(ACCOUNT_ID)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // ── Inactive connection skip ─────────────────────────────────

  describe('inactive connection handling', () => {
    it('skips task-level connection when is_active=false and cascades down', async () => {
      // backbone_connections returns null (filtered by is_active=true in loadConnection)
      const supabaseAdmin = { getClient: jest.fn() };
      const client = {
        from: jest.fn((table: string) => {
          if (table === 'tasks')
            return makeQueryChain({ backbone_connection_id: 'inactive-conn' });
          if (table === 'backbone_connections') return makeQueryChain(null); // inactive → filtered out
          return makeQueryChain(null);
        }),
      };
      supabaseAdmin.getClient.mockReturnValue(client);

      const defaultConn = backboneConnectionFixture({ id: 'default-conn' });
      const connections = makeConnections(defaultConn);
      const service = new BackboneRouterService(
        supabaseAdmin as any,
        makeRegistry() as any,
        connections as any,
      );

      const result = await service.resolve(ACCOUNT_ID, { taskId: 'task-1' });
      // Should have fallen through to account_default
      expect(result.resolvedFrom).toBe('account_default');
    });
  });

  // ── Config decryption ────────────────────────────────────────

  describe('config decryption', () => {
    it('calls decryptConfig() on the resolved connection config', async () => {
      const defaultConn = backboneConnectionFixture();
      const supabaseAdmin = {
        getClient: jest.fn().mockReturnValue({
          from: jest.fn().mockReturnValue(makeQueryChain(null)),
        }),
      };
      const connections = makeConnections(defaultConn);
      const service = new BackboneRouterService(
        supabaseAdmin as any,
        makeRegistry() as any,
        connections as any,
      );

      await service.resolve(ACCOUNT_ID);
      expect(connections.decryptConfig).toHaveBeenCalledWith(
        defaultConn.config,
      );
    });
  });

  // ── send() — skill injection ─────────────────────────────────

  describe('send() — skill injection into system prompt', () => {
    it('injects skills into system prompt when adapter does not support native skill injection', async () => {
      const defaultConn = backboneConnectionFixture();
      const supabaseAdmin = {
        getClient: jest.fn().mockReturnValue({
          from: jest.fn().mockReturnValue(makeQueryChain(null)),
        }),
      };
      const connections = makeConnections(defaultConn);
      const registry = makeRegistry({
        supportsNativeSkillInjection: jest.fn().mockReturnValue(false),
      });
      const service = new BackboneRouterService(
        supabaseAdmin as any,
        registry as any,
        connections as any,
      );

      await service.send({
        accountId: ACCOUNT_ID,
        sendOptions: {
          message: 'Hello',
          systemPrompt: 'Base prompt.',
          skills: [
            { name: 'Summarizer', description: 'Summarizes text' },
            { name: 'Translator', description: 'Translates text' },
          ],
        },
      });

      const callArgs = registry._adapter.sendMessage.mock.calls[0][0];
      expect(callArgs.systemPrompt).toContain('Available skills:');
      expect(callArgs.systemPrompt).toContain('Summarizer: Summarizes text');
      expect(callArgs.skills).toBeUndefined(); // skills removed from native payload
    });

    it('passes skills natively when adapter supports native skill injection', async () => {
      const defaultConn = backboneConnectionFixture();
      const supabaseAdmin = {
        getClient: jest.fn().mockReturnValue({
          from: jest.fn().mockReturnValue(makeQueryChain(null)),
        }),
      };
      const connections = makeConnections(defaultConn);
      const registry = makeRegistry({
        supportsNativeSkillInjection: jest.fn().mockReturnValue(true),
      });
      const service = new BackboneRouterService(
        supabaseAdmin as any,
        registry as any,
        connections as any,
      );

      const skills = [{ name: 'Tool', description: 'Does things' }];
      await service.send({
        accountId: ACCOUNT_ID,
        sendOptions: { message: 'test', systemPrompt: 'prompt', skills },
      });

      const callArgs = registry._adapter.sendMessage.mock.calls[0][0];
      expect(callArgs.skills).toEqual(skills);
      expect(callArgs.systemPrompt).not.toContain('Available skills:');
    });
  });

  // ── send() — usage tracking ──────────────────────────────────

  describe('send() — usage tracking', () => {
    it('calls trackUsage fire-and-forget when tokens are returned', async () => {
      const defaultConn = backboneConnectionFixture();
      const supabaseAdmin = {
        getClient: jest.fn().mockReturnValue({
          from: jest.fn().mockReturnValue(makeQueryChain(null)),
        }),
      };
      const connections = makeConnections(defaultConn);
      const service = new BackboneRouterService(
        supabaseAdmin as any,
        makeRegistry() as any,
        connections as any,
      );

      await service.send({
        accountId: ACCOUNT_ID,
        sendOptions: { message: 'Hello', systemPrompt: 'prompt' },
      });

      expect(connections.trackUsage).toHaveBeenCalledWith(defaultConn.id, 100);
    });

    it('does not block when trackUsage rejects', async () => {
      const defaultConn = backboneConnectionFixture();
      const supabaseAdmin = {
        getClient: jest.fn().mockReturnValue({
          from: jest.fn().mockReturnValue(makeQueryChain(null)),
        }),
      };
      const connections = makeConnections(defaultConn);
      connections.trackUsage.mockRejectedValue(new Error('tracking failed'));
      const service = new BackboneRouterService(
        supabaseAdmin as any,
        makeRegistry() as any,
        connections as any,
      );

      // Should not throw even though tracking fails
      await expect(
        service.send({
          accountId: ACCOUNT_ID,
          sendOptions: { message: 'Hello', systemPrompt: '' },
        }),
      ).resolves.toBeDefined();
    });
  });
});
