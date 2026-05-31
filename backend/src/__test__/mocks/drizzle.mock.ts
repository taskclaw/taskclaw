/**
 * Reusable Drizzle (`Db`) mock for unit tests — the counterpart to supabase.mock.ts,
 * used as services migrate from `SupabaseAdminService` to the `DB` token (Epic 2).
 *
 * Supports both data-access styles the services use:
 *
 *   1. Query builder (thenable, resolves to an array):
 *        db.select().from(t).where(...).limit(1)        → [...]
 *        db.insert(t).values(...).returning()           → [...]
 *        db.update(t).set(...).where(...).returning()   → [...]
 *        db.delete(t).where(...)                         → [...]
 *
 *   2. Relational query API:
 *        db.query.tasks.findFirst({ with: {...} })       → object | undefined
 *        db.query.tasks.findMany({ where, with })        → [...]
 *
 *   3. Raw SQL: db.execute(sql`...`)                      → { rows: [...] }
 *
 * Usage:
 *   const { db, query, select, makeBuilder } = createDrizzleMock();
 *   query('tasks').findFirst.mockResolvedValue(taskFixture);
 *   select.mockReturnValueOnce(makeBuilder([{ id: '1' }]));   // for a specific call
 */

export interface MockQueryApi {
  findFirst: jest.Mock;
  findMany: jest.Mock;
}

export interface MockBuilder {
  from: jest.Mock;
  where: jest.Mock;
  limit: jest.Mock;
  offset: jest.Mock;
  orderBy: jest.Mock;
  groupBy: jest.Mock;
  having: jest.Mock;
  leftJoin: jest.Mock;
  innerJoin: jest.Mock;
  rightJoin: jest.Mock;
  values: jest.Mock;
  set: jest.Mock;
  returning: jest.Mock;
  onConflictDoUpdate: jest.Mock;
  onConflictDoNothing: jest.Mock;
  for: jest.Mock;
  // thenable so `await db.select()...` resolves to the configured result
  then: (resolve: any, reject?: any) => Promise<any>;
}

const CHAIN_METHODS = [
  'from',
  'where',
  'limit',
  'offset',
  'orderBy',
  'groupBy',
  'having',
  'leftJoin',
  'innerJoin',
  'rightJoin',
  'values',
  'set',
  'returning',
  'onConflictDoUpdate',
  'onConflictDoNothing',
  'for',
] as const;

/** Build a chainable, thenable query builder that resolves to `result`. */
export function makeBuilder(result: any = []): MockBuilder {
  const b: any = {};
  for (const m of CHAIN_METHODS) b[m] = jest.fn(() => b);
  b.then = (resolve: any, reject?: any) =>
    Promise.resolve(result).then(resolve, reject);
  return b as MockBuilder;
}

export interface DrizzleMock {
  /** The mock to inject in place of the `DB` token. */
  db: any;
  /** Access (and configure) the relational API for a table: query('tasks').findFirst.mockResolvedValue(...) */
  query: (table: string) => MockQueryApi;
  /** The top-level jest.fns — override per-call with mockReturnValueOnce(makeBuilder(...)). */
  select: jest.Mock;
  insert: jest.Mock;
  update: jest.Mock;
  delete: jest.Mock;
  execute: jest.Mock;
  makeBuilder: typeof makeBuilder;
  reset: () => void;
}

export function createDrizzleMock(): DrizzleMock {
  const queryTables = new Map<string, MockQueryApi>();
  const getQuery = (table: string): MockQueryApi => {
    if (!queryTables.has(table)) {
      queryTables.set(table, {
        findFirst: jest.fn().mockResolvedValue(undefined),
        findMany: jest.fn().mockResolvedValue([]),
      });
    }
    return queryTables.get(table)!;
  };

  // `db.query.<table>` resolves lazily via a Proxy so any table name works.
  const queryProxy = new Proxy(
    {},
    { get: (_t, prop: string) => getQuery(prop) },
  );

  const select = jest.fn(() => makeBuilder([]));
  const insert = jest.fn(() => makeBuilder([]));
  const update = jest.fn(() => makeBuilder([]));
  const del = jest.fn(() => makeBuilder([]));
  const execute = jest.fn().mockResolvedValue({ rows: [] });
  const transaction = jest.fn(async (cb: any) =>
    cb({ select, insert, update, delete: del, execute, query: queryProxy }),
  );

  const db = {
    query: queryProxy,
    select,
    insert,
    update,
    delete: del,
    execute,
    transaction,
  };

  return {
    db,
    query: getQuery,
    select,
    insert,
    update,
    delete: del,
    execute,
    makeBuilder,
    reset: () => {
      queryTables.clear();
      [select, insert, update, del, execute, transaction].forEach((m) =>
        m.mockClear(),
      );
      select.mockImplementation(() => makeBuilder([]));
      insert.mockImplementation(() => makeBuilder([]));
      update.mockImplementation(() => makeBuilder([]));
      del.mockImplementation(() => makeBuilder([]));
      execute.mockResolvedValue({ rows: [] });
    },
  };
}
