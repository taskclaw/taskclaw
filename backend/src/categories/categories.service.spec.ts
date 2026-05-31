import { NotFoundException } from '@nestjs/common';
import { CategoriesService } from './categories.service';
import { createDrizzleMock } from '../__test__/mocks/drizzle.mock';

describe('CategoriesService (Drizzle)', () => {
  let db: ReturnType<typeof createDrizzleMock>;
  const access = { verifyAccountAccess: jest.fn().mockResolvedValue({ role: 'owner' }) };
  const ACCOUNT = 'acc-1';
  const USER = 'user-1';

  const svc = () => new CategoriesService(db.db as any, access as any);

  beforeEach(() => {
    db = createDrizzleMock();
    access.verifyAccountAccess.mockClear();
  });

  it('findAll scopes by account and checks access', async () => {
    db.select.mockReturnValueOnce(db.makeBuilder([{ id: 'c1' }, { id: 'c2' }]));
    const rows = await svc().findAll(USER, ACCOUNT);
    expect(rows).toHaveLength(2);
    expect(access.verifyAccountAccess).toHaveBeenCalledWith(null, ACCOUNT, USER);
  });

  it('findOne returns the row', async () => {
    db.select.mockReturnValueOnce(db.makeBuilder([{ id: 'c1', name: 'Bug' }]));
    const row = await svc().findOne(USER, ACCOUNT, 'c1');
    expect(row).toEqual({ id: 'c1', name: 'Bug' });
  });

  it('findOne throws NotFound when missing', async () => {
    db.select.mockReturnValueOnce(db.makeBuilder([]));
    await expect(svc().findOne(USER, ACCOUNT, 'nope')).rejects.toThrow(
      NotFoundException,
    );
  });

  it('create inserts with account_id and returns the row', async () => {
    db.insert.mockReturnValueOnce(db.makeBuilder([{ id: 'new', name: 'Feature' }]));
    const row = await svc().create(USER, ACCOUNT, { name: 'Feature' });
    expect(row).toEqual({ id: 'new', name: 'Feature' });
    expect(db.insert).toHaveBeenCalled();
  });

  it('update verifies existence then returns updated row', async () => {
    db.select.mockReturnValueOnce(db.makeBuilder([{ id: 'c1' }])); // findOne
    db.update.mockReturnValueOnce(db.makeBuilder([{ id: 'c1', name: 'Renamed' }]));
    const row = await svc().update(USER, ACCOUNT, 'c1', { name: 'Renamed' });
    expect(row).toEqual({ id: 'c1', name: 'Renamed' });
  });

  it('remove verifies existence then deletes', async () => {
    db.select.mockReturnValueOnce(db.makeBuilder([{ id: 'c1' }])); // findOne
    const res = await svc().remove(USER, ACCOUNT, 'c1');
    expect(res).toEqual({ message: 'Category deleted successfully' });
    expect(db.delete).toHaveBeenCalled();
  });
});
