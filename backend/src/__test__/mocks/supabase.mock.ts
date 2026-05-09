/**
 * Reusable Supabase client mock for unit tests.
 *
 * Usage:
 *   const { mockClient, mockFrom } = createSupabaseMock();
 *   mockFrom('tasks').select.mockResolvedValue({ data: [taskFixture], error: null });
 */

export interface MockQueryBuilder {
  select: jest.Mock;
  insert: jest.Mock;
  update: jest.Mock;
  delete: jest.Mock;
  eq: jest.Mock;
  neq: jest.Mock;
  is: jest.Mock;
  in: jest.Mock;
  order: jest.Mock;
  limit: jest.Mock;
  single: jest.Mock;
  maybeSingle: jest.Mock;
  head: jest.Mock;
}

function createQueryBuilder(
  defaultResult: any = { data: null, error: null },
): MockQueryBuilder {
  const qb: any = {};
  const chainMethods = [
    'select',
    'insert',
    'update',
    'delete',
    'eq',
    'neq',
    'is',
    'in',
    'order',
    'limit',
    'head',
  ];
  const terminalMethods = ['single', 'maybeSingle'];

  // Chain methods return `this` (the builder) by default
  for (const method of chainMethods) {
    qb[method] = jest.fn().mockReturnValue(qb);
  }

  // Terminal methods resolve to the default result
  for (const method of terminalMethods) {
    qb[method] = jest.fn().mockResolvedValue(defaultResult);
  }

  // Make the builder itself thenable (await qb resolves to defaultResult)
  qb.then = (resolve: any, reject: any) =>
    Promise.resolve(defaultResult).then(resolve, reject);

  return qb as MockQueryBuilder;
}

export interface SupabaseMock {
  /** Override return value for a specific table's operations */
  mockFrom: (table: string) => MockQueryBuilder;
  /** The mock client to pass to SupabaseAdminService / SupabaseService */
  mockClient: {
    from: jest.Mock;
    auth: {
      getUser: jest.Mock;
    };
  };
  /** Reset all mocks between tests */
  reset: () => void;
}

export function createSupabaseMock(): SupabaseMock {
  const tableBuilders = new Map<string, MockQueryBuilder>();

  const mockFrom = jest.fn((table: string) => {
    if (!tableBuilders.has(table)) {
      tableBuilders.set(table, createQueryBuilder());
    }
    return tableBuilders.get(table)!;
  });

  const mockClient = {
    from: mockFrom,
    auth: {
      getUser: jest
        .fn()
        .mockResolvedValue({ data: { user: null }, error: null }),
    },
  };

  return {
    mockFrom: (table: string) => {
      const builder = createQueryBuilder();
      tableBuilders.set(table, builder);
      mockFrom.mockImplementation((t: string) =>
        tableBuilders.has(t) ? tableBuilders.get(t)! : createQueryBuilder(),
      );
      return builder;
    },
    mockClient,
    reset: () => {
      tableBuilders.clear();
      mockFrom.mockClear();
      mockClient.auth.getUser.mockClear();
    },
  };
}
