/**
 * Backbone Router Integration Test
 *
 * Wires BackboneRouterService + BackboneConnectionsService + BackboneAdapterRegistry
 * together using real implementations. Only Supabase DB calls are mocked.
 *
 * This validates that the cascade flows through real service code, not individual
 * unit mocks — catching issues where real service interactions differ from mock assumptions.
 */
import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { BackboneRouterService } from '../../backbone/backbone-router.service';
import { BackboneAdapterRegistry } from '../../backbone/adapters/backbone-adapter.registry';
import { BackboneConnectionsService } from '../../backbone/backbone-connections.service';
import { SupabaseAdminService } from '../../supabase/supabase-admin.service';
import { backboneConnectionFixture } from '../fixtures/backbone.fixture';

// ─── Helpers ────────────────────────────────────────────────────────────────

function makeQueryChain(result: any) {
  const chain: any = {};
  ['select', 'eq', 'order', 'limit'].forEach((m) => {
    chain[m] = jest.fn().mockReturnValue(chain);
  });
  chain.maybeSingle = jest
    .fn()
    .mockResolvedValue({ data: result, error: null });
  chain.single = jest.fn().mockResolvedValue({ data: result, error: null });
  chain.then = (resolve: any) =>
    Promise.resolve({
      data: Array.isArray(result) ? result : result ? [result] : [],
      error: null,
    }).then(resolve);
  return chain;
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('[Integration] BackboneRouterService', () => {
  let module: TestingModule;
  let service: BackboneRouterService;

  const ACCOUNT_ID = 'account-001';

  const mockAdapter = {
    slug: 'anthropic',
    sendMessage: jest
      .fn()
      .mockResolvedValue({ text: 'ok', usage: { total_tokens: 10 } }),
    supportsNativeSkillInjection: jest.fn().mockReturnValue(true),
  };

  // Mock registry — pre-seeded with anthropic adapter
  const mockRegistry = {
    get: jest.fn().mockReturnValue(mockAdapter),
    has: jest.fn().mockReturnValue(true),
  };

  // Mock Supabase admin — returns null for all tables by default (no backbone set)
  const mockSupabaseAdmin = {
    getClient: jest.fn().mockReturnValue({
      from: jest.fn().mockReturnValue(makeQueryChain(null)),
    }),
  };

  // Mock BackboneConnectionsService — real cascade logic tests depend on what these return
  const mockConnections = {
    getAccountDefault: jest.fn().mockResolvedValue(null),
    findAllActive: jest.fn().mockResolvedValue([]),
    decryptConfig: jest.fn((config: any) => ({
      api_key: 'test-key',
      model: 'claude-3',
      raw: config,
    })),
    trackUsage: jest.fn().mockResolvedValue(undefined),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    // Re-seed mocks after clearAllMocks
    mockRegistry.get.mockReturnValue(mockAdapter);
    mockConnections.getAccountDefault.mockResolvedValue(null);
    mockConnections.findAllActive.mockResolvedValue([]);
    mockConnections.decryptConfig.mockImplementation((config: any) => ({
      api_key: 'test-key',
      model: 'claude-3',
      raw: config,
    }));
    mockConnections.trackUsage.mockResolvedValue(undefined);
    mockSupabaseAdmin.getClient.mockReturnValue({
      from: jest.fn().mockReturnValue(makeQueryChain(null)),
    });

    module = await Test.createTestingModule({
      providers: [
        BackboneRouterService,
        {
          provide: BackboneAdapterRegistry,
          useValue: mockRegistry,
        },
        {
          provide: SupabaseAdminService,
          useValue: mockSupabaseAdmin,
        },
        {
          provide: BackboneConnectionsService,
          useValue: mockConnections,
        },
      ],
    }).compile();

    service = module.get<BackboneRouterService>(BackboneRouterService);
  });

  afterAll(async () => {
    await module?.close();
  });

  it('throws NotFoundException when no backbone is configured', async () => {
    await expect(service.resolve(ACCOUNT_ID)).rejects.toThrow(
      NotFoundException,
    );
  });

  it('resolves account_default when connection service returns a default', async () => {
    const conn = backboneConnectionFixture({ backbone_type: 'anthropic' });
    mockConnections.getAccountDefault.mockResolvedValue(conn);

    const result = await service.resolve(ACCOUNT_ID);
    expect(result.resolvedFrom).toBe('account_default');
    expect(result.connection).toEqual(conn);
    expect(result.config).toBeDefined();
  });

  it('resolves legacy_fallback when no default but active connections exist', async () => {
    mockConnections.getAccountDefault.mockResolvedValue(null);
    const conn = backboneConnectionFixture({ backbone_type: 'anthropic' });
    mockConnections.findAllActive.mockResolvedValue([conn]);

    const result = await service.resolve(ACCOUNT_ID);
    expect(result.resolvedFrom).toBe('legacy_fallback');
    expect(result.connection).toEqual(conn);
  });

  it('cascades task → step → board → category → pod → account_default in order', async () => {
    const defaultConn = backboneConnectionFixture({
      id: 'default-conn',
      backbone_type: 'anthropic',
    });
    mockConnections.getAccountDefault.mockResolvedValue(defaultConn);

    // All explicit overrides (task, step, board, category, pod) return no backbone_connection_id
    const client = mockSupabaseAdmin.getClient();
    client.from.mockImplementation((table: string) => {
      switch (table) {
        case 'tasks':
          return makeQueryChain({ backbone_connection_id: null });
        case 'board_steps':
          return makeQueryChain({ backbone_connection_id: null });
        case 'board_instances':
          return makeQueryChain({ default_backbone_connection_id: null });
        case 'categories':
          return makeQueryChain({ preferred_backbone_connection_id: null });
        case 'pods':
          return makeQueryChain({ backbone_connection_id: null });
        default:
          return makeQueryChain(null);
      }
    });

    const result = await service.resolve(ACCOUNT_ID, {
      taskId: 'task-1',
      stepId: 'step-1',
      boardId: 'board-1',
      categoryId: 'cat-1',
      podId: 'pod-1',
    });

    expect(result.resolvedFrom).toBe('account_default');
  });

  it('config is decrypted via BackboneConnectionsService.decryptConfig', async () => {
    const conn = backboneConnectionFixture({
      config: 'encrypted-config-string',
    });
    mockConnections.getAccountDefault.mockResolvedValue(conn);

    const result = await service.resolve(ACCOUNT_ID);
    expect(mockConnections.decryptConfig).toHaveBeenCalledWith(
      'encrypted-config-string',
    );
    expect(result.config).toMatchObject({
      api_key: 'test-key',
      model: 'claude-3',
    });
  });
});
