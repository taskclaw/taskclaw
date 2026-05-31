import { createDrizzleMock } from './drizzle.mock';

describe('createDrizzleMock', () => {
  it('supports the query-builder chain (thenable)', async () => {
    const { db, select, makeBuilder } = createDrizzleMock();
    select.mockReturnValueOnce(makeBuilder([{ id: '1', name: 'cat' }]));

    const rows = await db
      .select()
      .from({})
      .where({})
      .limit(1);

    expect(rows).toEqual([{ id: '1', name: 'cat' }]);
  });

  it('supports insert().values().returning()', async () => {
    const { db, insert, makeBuilder } = createDrizzleMock();
    insert.mockReturnValueOnce(makeBuilder([{ id: 'new' }]));

    const [row] = await db.insert({}).values({ name: 'x' }).returning();

    expect(row).toEqual({ id: 'new' });
  });

  it('supports the relational query API', async () => {
    const { db, query } = createDrizzleMock();
    query('tasks').findFirst.mockResolvedValue({ id: 't1', title: 'Task' });
    query('tasks').findMany.mockResolvedValue([{ id: 't1' }, { id: 't2' }]);

    expect(await db.query.tasks.findFirst({})).toEqual({ id: 't1', title: 'Task' });
    expect(await db.query.tasks.findMany({})).toHaveLength(2);
  });

  it('supports raw execute()', async () => {
    const { db, execute } = createDrizzleMock();
    execute.mockResolvedValue({ rows: [{ n: 5 }] });

    const res = await db.execute('select 1');
    expect(res.rows[0].n).toBe(5);
  });

  it('reset() clears configured results', async () => {
    const { db, query, reset } = createDrizzleMock();
    query('tasks').findFirst.mockResolvedValue({ id: 't1' });
    reset();
    expect(await db.query.tasks.findFirst({})).toBeUndefined();
  });
});
