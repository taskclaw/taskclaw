import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { and, count, desc, eq, ilike, or, sql } from 'drizzle-orm';
import { DB, type Db } from '../db';
import { accountUsers, users } from '../db/schema';

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);

  constructor(@Inject(DB) private readonly db: Db) {}

  async getProfile(userId: string, _accessToken?: string) {
    // The AuthGuard already verified the session and set req.user.id (= userId).
    // Read the profile from public.users by id — no GoTrue dependency.
    const [user] = await this.db
      .select({ id: users.id, email: users.email, name: users.name })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    if (!user) {
      throw new NotFoundException(
        'User profile not found. Please log in again.',
      );
    }

    return {
      name: user.name || user.email,
      email: user.email,
      avatar: '', // Placeholder
      role: 'member',
    };
  }

  async getPreferences(userId: string, _accessToken?: string) {
    // NOTE: `user_preferences` is not modeled in the Drizzle schema (schema.ts),
    // so this stays as raw SQL against public.user_preferences. The original
    // PostgREST query selected `*` and tolerated a missing row (PGRST116) by
    // returning defaults — preserved here.
    const result = await this.db.execute(
      sql`select * from user_preferences where user_id = ${userId} limit 1`,
    );
    const data = result.rows[0] as Record<string, any> | undefined;

    return (
      data || {
        user_id: userId,
        theme: 'system',
        locale: 'en',
        notifications_email: true,
        notifications_push: true,
        notifications_in_app: true,
      }
    );
  }

  async updatePreferences(
    userId: string,
    preferences: {
      theme?: string;
      locale?: string;
      notifications_email?: boolean;
      notifications_push?: boolean;
      notifications_in_app?: boolean;
    },
    _accessToken?: string,
  ) {
    // NOTE: `user_preferences` is not modeled in the Drizzle schema (schema.ts),
    // so this stays as raw SQL. Mirrors the original PostgREST upsert on
    // (user_id) — insert defaults, update the supplied columns on conflict.
    const updatedAt = new Date().toISOString();

    const result = await this.db.execute(sql`
      insert into user_preferences (
        user_id, theme, locale,
        notifications_email, notifications_push, notifications_in_app,
        updated_at
      )
      values (
        ${userId},
        ${preferences.theme ?? 'system'},
        ${preferences.locale ?? 'en'},
        ${preferences.notifications_email ?? true},
        ${preferences.notifications_push ?? true},
        ${preferences.notifications_in_app ?? true},
        ${updatedAt}
      )
      on conflict (user_id) do update set
        theme = coalesce(${preferences.theme ?? null}, user_preferences.theme),
        locale = coalesce(${preferences.locale ?? null}, user_preferences.locale),
        notifications_email = coalesce(${preferences.notifications_email ?? null}, user_preferences.notifications_email),
        notifications_push = coalesce(${preferences.notifications_push ?? null}, user_preferences.notifications_push),
        notifications_in_app = coalesce(${preferences.notifications_in_app ?? null}, user_preferences.notifications_in_app),
        updated_at = ${updatedAt}
      returning *
    `);

    return result.rows[0] as Record<string, any>;
  }

  async findAllUsers(
    page: number = 1,
    limit: number = 10,
    search?: string,
    status?: string,
  ) {
    const offset = (page - 1) * limit;

    const conditions: any[] = [];
    if (search) {
      conditions.push(
        or(
          ilike(users.email, `%${search}%`),
          ilike(users.name, `%${search}%`),
        ),
      );
    }
    if (status) {
      conditions.push(eq(users.status, status));
    }
    const where = conditions.length ? and(...conditions) : undefined;

    const [usersList, [{ value: total }]] = await Promise.all([
      this.db
        .select()
        .from(users)
        .where(where)
        .orderBy(desc(users.createdAt))
        .limit(limit)
        .offset(offset),
      this.db.select({ value: count() }).from(users).where(where),
    ]);

    const usersWithCounts = await Promise.all(
      usersList.map(async (user) => {
        const [{ value: instancesCount }] = await this.db
          .select({ value: count() })
          .from(accountUsers)
          .where(eq(accountUsers.userId, user.id));

        return {
          ...user,
          instancesCount: instancesCount || 0,
          status: String(user.status || 'active').toLowerCase(),
          lastActive: new Date().toISOString(),
        };
      }),
    );

    return {
      data: usersWithCounts,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil((total || 0) / limit),
      },
    };
  }

  async updateUserStatus(userId: string, status: string) {
    const normalized = String(status || '').toLowerCase();
    const allowed = ['active', 'pending', 'suspended'];
    if (!allowed.includes(normalized)) {
      throw new BadRequestException('Invalid status');
    }

    await this.db
      .update(users)
      .set({ status: normalized })
      .where(eq(users.id, userId));

    return { success: true };
  }

  async getUserDetailsAdmin(userId: string) {
    const user = await this.db.query.users.findFirst({
      where: eq(users.id, userId),
    });

    if (!user) throw new Error('User not found');

    // PostgREST embedded `account:accounts(...)` → Drizzle relation is `account`
    // (account_users → accounts). Re-key to preserve the original response shape.
    const accounts = await this.db.query.accountUsers.findMany({
      where: eq(accountUsers.userId, userId),
      columns: { role: true },
      with: {
        account: {
          columns: { id: true, name: true },
        },
      },
    });

    return {
      ...user,
      linkedAccounts:
        accounts?.map((a) => {
          // Drizzle can infer a `one` relation as `T | T[]`; normalize.
          const acc = Array.isArray(a.account) ? a.account[0] : a.account;
          return { id: acc?.id, name: acc?.name, role: a.role };
        }) || [],
    };
  }

  async updateUserRole(_userId: string, _role: string) {
    // TODO(local-auth): The local `public.users` table has no role/app_metadata
    // column, and GoTrue (which held app_metadata.role) is being removed. There is
    // nowhere to persist a user's global role in local-auth mode. Per-account roles
    // live in `account_users.role`. Until a global-role column is added to the
    // schema, this is a deliberate no-op so existing callers don't break.
    this.logger.warn(
      'role management not available in local-auth mode',
    );

    return { success: true };
  }

  async deleteUser(userId: string) {
    // GoTrue is being removed; delete straight from public.users. FK cascades
    // (account_users, refresh_tokens, etc. — all ON DELETE CASCADE) clean up the rest.
    await this.db.delete(users).where(eq(users.id, userId));

    return { success: true };
  }
}
