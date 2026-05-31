import { snakeKeys } from './snake-keys.util';

describe('snakeKeys', () => {
  it('converts camelCase column keys to snake_case', () => {
    expect(
      snakeKeys({
        id: 'x',
        boardInstanceId: 'b',
        currentStepId: 's',
        createdAt: 't',
        triggerType: 'workspace_chat',
      }),
    ).toEqual({
      id: 'x',
      board_instance_id: 'b',
      current_step_id: 's',
      created_at: 't',
      trigger_type: 'workspace_chat',
    });
  });

  it('leaves single-word and already-snake keys unchanged (idempotent)', () => {
    const snake = {
      id: '1',
      name: 'n',
      status: 'ok',
      account_id: 'a',
      created_at: 't',
    };
    expect(snakeKeys(snake)).toEqual(snake);
    // applying twice is a no-op
    expect(snakeKeys(snakeKeys({ accountId: 'a', isActive: true }))).toEqual({
      account_id: 'a',
      is_active: true,
    });
  });

  it('is jsonb-safe: renames the column key but never recurses into the value', () => {
    const out = snakeKeys({
      cardData: { someUserKey: 1, nestedCamel: { deepKey: 2 } },
      agentConfig: { maxTokens: 100 },
      metadata: { externalRef: 'keep-me' },
    });
    // top-level column keys converted...
    expect(Object.keys(out).sort()).toEqual([
      'agent_config',
      'card_data',
      'metadata',
    ]);
    // ...but the jsonb VALUE objects keep their original (camelCase) keys
    expect(out.card_data).toEqual({
      someUserKey: 1,
      nestedCamel: { deepKey: 2 },
    });
    expect(out.agent_config).toEqual({ maxTokens: 100 });
    expect(out.metadata).toEqual({ externalRef: 'keep-me' });
  });

  it('preserves null/undefined/array values verbatim', () => {
    const arr = [{ innerCamel: 1 }];
    const out = snakeKeys({
      podId: null,
      boardId: undefined,
      skillIds: arr,
    });
    expect(out.pod_id).toBeNull();
    expect(out.board_id).toBeUndefined();
    // array value passed through by reference, not key-converted
    expect(out.skill_ids).toBe(arr);
  });
});
