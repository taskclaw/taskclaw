import {
  CanActivate,
  ExecutionContext,
  Injectable,
  ForbiddenException,
  Logger,
  SetMetadata,
  Inject,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { and, count, eq } from 'drizzle-orm';
import { DB, type Db } from '../../db';
import {
  sources,
  categories,
  tasks,
  conversations,
  knowledgeDocs,
  skills,
  accountUsers,
  subscriptions,
} from '../../db/schema';

/**
 * Plan feature limits.
 * Maps plan name → resource → max count.
 * -1 means unlimited.
 */
const PLAN_LIMITS: Record<string, Record<string, number>> = {
  Hobby: {
    sources: 2,
    categories: 5,
    tasks: 500,
    conversations: 50,
    knowledge_docs: 10,
    skills: 3,
    team_members: 1,
  },
  Pro: {
    sources: 10,
    categories: 25,
    tasks: 5000,
    conversations: -1,
    knowledge_docs: 100,
    skills: 20,
    team_members: 10,
  },
  Enterprise: {
    sources: -1,
    categories: -1,
    tasks: -1,
    conversations: -1,
    knowledge_docs: -1,
    skills: -1,
    team_members: -1,
  },
};

/**
 * Maps a `@PlanResource('<name>')` resource string to a counter that runs
 * `select count(*) ... where account_id = $1` against the matching table. The
 * original code did a dynamic `db.from(resource)` against the table whose name
 * matched the resource string; Drizzle needs a static table object, so the
 * mapping is made explicit here. `team_members` has no dedicated table (the
 * PostgREST code would have queried `account_users`); it is included for parity
 * with PLAN_LIMITS.
 */
const RESOURCE_COUNTERS: Record<
  string,
  (db: Db, accountId: string) => Promise<number>
> = {
  sources: async (db, accountId) => {
    const [row] = await db
      .select({ value: count() })
      .from(sources)
      .where(eq(sources.accountId, accountId));
    return row?.value ?? 0;
  },
  categories: async (db, accountId) => {
    const [row] = await db
      .select({ value: count() })
      .from(categories)
      .where(eq(categories.accountId, accountId));
    return row?.value ?? 0;
  },
  tasks: async (db, accountId) => {
    const [row] = await db
      .select({ value: count() })
      .from(tasks)
      .where(eq(tasks.accountId, accountId));
    return row?.value ?? 0;
  },
  conversations: async (db, accountId) => {
    const [row] = await db
      .select({ value: count() })
      .from(conversations)
      .where(eq(conversations.accountId, accountId));
    return row?.value ?? 0;
  },
  knowledge_docs: async (db, accountId) => {
    const [row] = await db
      .select({ value: count() })
      .from(knowledgeDocs)
      .where(eq(knowledgeDocs.accountId, accountId));
    return row?.value ?? 0;
  },
  skills: async (db, accountId) => {
    const [row] = await db
      .select({ value: count() })
      .from(skills)
      .where(eq(skills.accountId, accountId));
    return row?.value ?? 0;
  },
  team_members: async (db, accountId) => {
    const [row] = await db
      .select({ value: count() })
      .from(accountUsers)
      .where(eq(accountUsers.accountId, accountId));
    return row?.value ?? 0;
  },
};

export const PLAN_RESOURCE_KEY = 'plan_resource';
export const PlanResource = (resource: string) =>
  SetMetadata(PLAN_RESOURCE_KEY, resource);

/**
 * PlanLimitGuard
 *
 * Use with @PlanResource('sources') decorator on POST endpoints
 * to enforce plan-based limits on resource creation.
 */
@Injectable()
export class PlanLimitGuard implements CanActivate {
  private readonly logger = new Logger(PlanLimitGuard.name);

  constructor(
    private readonly reflector: Reflector,
    @Inject(DB) private readonly db: Db,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    // Community edition has no plan limits — all features are unlimited
    if (process.env.EDITION !== 'cloud') return true;

    const resource = this.reflector.get<string>(
      PLAN_RESOURCE_KEY,
      context.getHandler(),
    );
    if (!resource) return true; // No resource decorator = no limit check

    const request = context.switchToHttp().getRequest();
    const accountId = request.params?.accountId;
    if (!accountId) return true;

    // Get account's current plan
    const sub = await this.db.query.subscriptions.findFirst({
      where: and(
        eq(subscriptions.accountId, accountId),
        eq(subscriptions.status, 'active'),
      ),
      with: { plan: true },
    });

    // `plan` is a `one(...)` relation → a single row at runtime; Drizzle's
    // relational typing widens it to `object | object[]`, so narrow at the boundary.
    const plan = sub?.plan as { name?: string } | undefined;
    const planName = plan?.name || 'Hobby';
    const limits = PLAN_LIMITS[planName] || PLAN_LIMITS.Hobby;
    const maxCount = limits[resource];

    if (maxCount === undefined || maxCount === -1) return true;

    // Count current resources
    const counter = RESOURCE_COUNTERS[resource];
    if (!counter) {
      this.logger.error(`Failed to count ${resource}: unknown resource table`);
      return true; // Don't block on count errors
    }

    let currentCount: number;
    try {
      currentCount = await counter(this.db, accountId);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`Failed to count ${resource}: ${message}`);
      return true; // Don't block on count errors
    }

    if (currentCount >= maxCount) {
      throw new ForbiddenException(
        `Plan limit reached: ${planName} plan allows up to ${maxCount} ${resource}. ` +
          `Please upgrade your plan to add more.`,
      );
    }

    return true;
  }
}
