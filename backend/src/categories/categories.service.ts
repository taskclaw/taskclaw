import { Injectable, Inject, NotFoundException } from '@nestjs/common';
import { and, desc, eq } from 'drizzle-orm';
import { DB, type Db } from '../db';
import { categories } from '../db/schema';
import { AccessControlHelper } from '../common/helpers/access-control.helper';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';

/**
 * Categories — first service converted to Drizzle (Epic 2 pilot).
 * Tenant isolation stays at the app level (`account_id` scoping + verifyAccountAccess),
 * exactly as before; only the data-access transport changed (PostgREST → Drizzle).
 */
@Injectable()
export class CategoriesService {
  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly accessControl: AccessControlHelper,
  ) {}

  async findAll(userId: string, accountId: string, _accessToken?: string) {
    await this.accessControl.verifyAccountAccess(null, accountId, userId);

    return this.db
      .select()
      .from(categories)
      .where(eq(categories.accountId, accountId))
      .orderBy(desc(categories.createdAt));
  }

  async findOne(
    userId: string,
    accountId: string,
    id: string,
    _accessToken?: string,
  ) {
    await this.accessControl.verifyAccountAccess(null, accountId, userId);

    const [row] = await this.db
      .select()
      .from(categories)
      .where(and(eq(categories.id, id), eq(categories.accountId, accountId)))
      .limit(1);

    if (!row) {
      throw new NotFoundException(`Category with ID ${id} not found`);
    }
    return row;
  }

  async create(
    userId: string,
    accountId: string,
    createCategoryDto: CreateCategoryDto,
    _accessToken?: string,
  ) {
    await this.accessControl.verifyAccountAccess(null, accountId, userId);

    const [row] = await this.db
      .insert(categories)
      .values({ accountId, ...createCategoryDto })
      .returning();
    return row;
  }

  async createBulk(
    userId: string,
    accountId: string,
    categoryList: CreateCategoryDto[],
    _accessToken?: string,
  ) {
    await this.accessControl.verifyAccountAccess(null, accountId, userId);

    const rows = categoryList.map((cat) => ({ accountId, ...cat }));

    // Upsert ignoring duplicates on (account_id, name).
    return this.db
      .insert(categories)
      .values(rows)
      .onConflictDoNothing({
        target: [categories.accountId, categories.name],
      })
      .returning();
  }

  async update(
    userId: string,
    accountId: string,
    id: string,
    updateCategoryDto: UpdateCategoryDto,
    _accessToken?: string,
  ) {
    await this.accessControl.verifyAccountAccess(null, accountId, userId);
    // Verify category exists and belongs to account
    await this.findOne(userId, accountId, id);

    const [row] = await this.db
      .update(categories)
      .set(updateCategoryDto)
      .where(and(eq(categories.id, id), eq(categories.accountId, accountId)))
      .returning();
    return row;
  }

  async remove(
    userId: string,
    accountId: string,
    id: string,
    _accessToken?: string,
  ) {
    await this.accessControl.verifyAccountAccess(null, accountId, userId);
    // Verify category exists and belongs to account
    await this.findOne(userId, accountId, id);

    await this.db
      .delete(categories)
      .where(and(eq(categories.id, id), eq(categories.accountId, accountId)));

    return { message: 'Category deleted successfully' };
  }
}
