/**
 * Backbone connection fixture factory.
 */

export function backboneConnectionFixture(
  overrides: Partial<BackboneConnectionRow> = {},
): BackboneConnectionRow {
  return {
    id: 'backbone-conn-uuid-001',
    account_id: 'account-uuid-001',
    backbone_type: 'anthropic',
    name: 'Test Anthropic Connection',
    is_active: true,
    is_default: false,
    config: '{"api_key":"encrypted-key"}',
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

export interface BackboneConnectionRow {
  id: string;
  account_id: string;
  backbone_type: string;
  name: string;
  is_active: boolean;
  is_default: boolean;
  config: string;
  created_at: string;
  updated_at: string;
}
