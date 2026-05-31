import { NotFoundException, BadRequestException } from '@nestjs/common';
import { SourcesService } from './sources.service';
import { createDrizzleMock } from '../__test__/mocks/drizzle.mock';

describe('SourcesService (Drizzle)', () => {
  let db: ReturnType<typeof createDrizzleMock>;
  const access = { verifyAccountAccess: jest.fn().mockResolvedValue({ role: 'owner' }) };
  const adapterRegistry = {
    getAdapter: jest.fn().mockReturnValue({
      validateConfig: jest.fn().mockResolvedValue({ valid: true }),
    }),
  };
  const ACCOUNT = 'acc-1';
  const USER = 'user-1';

  const svc = () => new SourcesService(db.db as any, access as any, adapterRegistry as any);

  beforeEach(() => {
    db = createDrizzleMock();
    jest.clearAllMocks();
    access.verifyAccountAccess.mockResolvedValue({ role: 'owner' });
    adapterRegistry.getAdapter.mockReturnValue({
      validateConfig: jest.fn().mockResolvedValue({ valid: true }),
    });
  });

  it('findAll re-keys category→categories and masks config', async () => {
    db.query('sources').findMany.mockResolvedValue([
      {
        id: 's1',
        provider: 'notion',
        config: { api_key: 'sk-abcdefghijكل' },
        category: { id: 'c1', name: 'Bug' },
      },
    ]);
    const [row] = await svc().findAll(USER, ACCOUNT);
    expect(row.categories).toEqual({ id: 'c1', name: 'Bug' });
    expect('category' in row).toBe(false); // re-keyed, not duplicated
    expect(row.config.api_key).toContain('****'); // masked
  });

  it('findOne throws NotFound when missing', async () => {
    db.query('sources').findFirst.mockResolvedValue(undefined);
    await expect(svc().findOne(USER, ACCOUNT, 'nope')).rejects.toThrow(
      NotFoundException,
    );
  });

  it('create rejects an invalid category for the account', async () => {
    db.select.mockReturnValueOnce(db.makeBuilder([])); // category lookup → none
    await expect(
      svc().create(USER, ACCOUNT, {
        category_id: 'bad',
        provider: 'notion',
        config: {},
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('create inserts mapped camelCase columns and returns masked config', async () => {
    db.select.mockReturnValueOnce(db.makeBuilder([{ id: 'c1' }])); // category exists
    db.insert.mockReturnValueOnce(
      db.makeBuilder([{ id: 's-new', config: { token: 'abcdefghij' } }]),
    );
    const row = await svc().create(USER, ACCOUNT, {
      category_id: 'c1',
      provider: 'notion',
      config: { token: 'abcdefghij' },
    });
    expect(row.id).toBe('s-new');
    expect(row.config.token).toContain('****');
    expect(db.insert).toHaveBeenCalled();
  });
});
