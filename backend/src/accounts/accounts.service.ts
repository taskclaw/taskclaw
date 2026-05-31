import { Injectable, Inject, InternalServerErrorException } from '@nestjs/common';
import { and, count, desc, eq, ilike } from 'drizzle-orm';
import { DB, type Db } from '../db';
import { accounts, accountUsers } from '../db/schema';
import { AccessControlHelper } from '../common/helpers/access-control.helper';

import { SystemSettingsService } from '../system-settings/system-settings.service';
import { ProjectsService } from '../projects/projects.service';

@Injectable()
export class AccountsService {
  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly accessControlHelper: AccessControlHelper,
    private readonly systemSettingsService: SystemSettingsService,
    private readonly projectsService: ProjectsService,
  ) {}

  async getUserAccounts(userId: string, _accessToken?: string) {
    let data;
    try {
      // We manually filter by user_id here, so it is safe.
      data = await this.db.query.accountUsers.findMany({
        where: eq(accountUsers.userId, userId),
        columns: { role: true },
        with: {
          account: {
            columns: {
              id: true,
              name: true,
              onboardingCompleted: true,
            },
          },
        },
      });
    } catch (error) {
      console.error('AccountsService Error:', error);
      throw new InternalServerErrorException(
        error instanceof Error ? error.message : 'Failed to load accounts',
      );
    }

    if (!data) {
      return [];
    }

    return data.map((item: any) => ({
      id: item.account.id,
      name: item.account.name,
      role: item.role,
      onboarding_completed: item.account.onboardingCompleted ?? false,
      plan: 'Free', // Placeholder for now
    }));
  }

  async createAccount(userId: string, name: string, accessToken?: string) {
    // 1. Create the account
    // No access control needed for creation (anyone can create an account if authenticated)
    let account;
    try {
      [account] = await this.db
        .insert(accounts)
        .values({
          name,
          ownerUserId: userId,
        })
        .returning();
    } catch (accountError) {
      console.error('AccountsService: Error creating account', accountError);
      throw new InternalServerErrorException(
        accountError instanceof Error
          ? accountError.message
          : 'Failed to create account',
      );
    }

    // 2. Add the user as owner in account_users
    try {
      await this.db.insert(accountUsers).values({
        accountId: account.id,
        userId: userId,
        role: 'owner',
      });
    } catch (memberError) {
      console.error('AccountsService: Error adding owner', memberError);
      // Ideally we should rollback the account creation here
      throw new InternalServerErrorException(
        memberError instanceof Error
          ? memberError.message
          : 'Failed to add owner',
      );
    }

    // 3. Check system settings and auto-create project if needed
    try {
      const settings = await this.systemSettingsService.getSettings();
      if (!settings.allow_multiple_projects) {
        // Auto-create default project
        await this.projectsService.createProject(
          account.id,
          'Default Project',
          userId,
          accessToken || '',
        );
      }
    } catch (error) {
      console.error('AccountsService: Error auto-creating project', error);
      // Don't fail the account creation if project creation fails, but log it.
    }

    return account;
  }

  async updateAccount(
    accountId: string,
    name: string,
    userId: string,
    _accessToken?: string,
  ) {
    // Verify user is owner/admin
    await this.accessControlHelper.verifyAccountAccess(
      null,
      accountId,
      userId,
      ['owner', 'admin'],
    );

    let data;
    try {
      [data] = await this.db
        .update(accounts)
        .set({ name })
        .where(eq(accounts.id, accountId))
        .returning();
    } catch (error) {
      throw new InternalServerErrorException(
        error instanceof Error ? error.message : 'Failed to update account',
      );
    }

    return data;
  }

  async patchAccount(
    accountId: string,
    updates: { name?: string; onboarding_completed?: boolean },
    userId: string,
    _accessToken?: string,
  ) {
    // Verify user is owner/admin/member
    await this.accessControlHelper.verifyAccountAccess(
      null,
      accountId,
      userId,
    );

    // Build update payload (only include defined fields)
    const payload: Partial<typeof accounts.$inferInsert> = {};
    if (updates.name !== undefined) payload.name = updates.name;
    if (updates.onboarding_completed !== undefined)
      payload.onboardingCompleted = updates.onboarding_completed;

    if (Object.keys(payload).length === 0) {
      return { message: 'No updates provided' };
    }

    let data;
    try {
      [data] = await this.db
        .update(accounts)
        .set(payload)
        .where(eq(accounts.id, accountId))
        .returning();
    } catch (error) {
      throw new InternalServerErrorException(
        error instanceof Error ? error.message : 'Failed to update account',
      );
    }

    return data;
  }
  async findAllAccounts(page: number = 1, limit: number = 10, search?: string) {
    const offset = (page - 1) * limit;

    const where = search ? ilike(accounts.name, `%${search}%`) : undefined;

    let accountRows;
    let total;
    try {
      const [rows, totalResult] = await Promise.all([
        this.db.query.accounts.findMany({
          where,
          with: {
            user: {
              columns: { email: true },
            },
          },
          orderBy: desc(accounts.createdAt),
          limit,
          offset,
        }),
        this.db.select({ value: count() }).from(accounts).where(where),
      ]);
      accountRows = rows;
      total = totalResult[0]?.value ?? 0;
    } catch (error) {
      throw new InternalServerErrorException(
        error instanceof Error ? error.message : 'Failed to load accounts',
      );
    }

    return {
      // Re-key the `user` relation back to `owner` to preserve the response
      // shape PostgREST exposed via `owner:users!owner_user_id(email)`.
      data: accountRows.map((account: any) => {
        const { user, ...rest } = account;
        const owner = user ?? null;
        return {
          ...rest,
          owner,
          ownerEmail: owner?.email || 'Unknown',
        };
      }),
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil((total || 0) / limit),
      },
    };
  }
}
