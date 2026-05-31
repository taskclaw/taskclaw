import {
  Injectable,
  ForbiddenException,
  NotFoundException,
  Inject,
} from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import { CacheService } from '../cache.service';
import { DB, type Db } from '../../db';
import { accountUsers, projects } from '../../db/schema';

// Cache account membership role for 5 minutes
const ACCOUNT_ROLE_TTL_SECONDS = 300;

/**
 * Account/project access checks (Epic 2 — migrated to Drizzle).
 *
 * The legacy `supabase` first parameter is kept so the ~dozens of existing callers
 * compile unchanged during the data-layer migration; it is ignored. Drop it in the
 * Epic 2 cleanup pass once every caller has been converted.
 */
@Injectable()
export class AccessControlHelper {
  constructor(
    private readonly cacheService: CacheService,
    @Inject(DB) private readonly db: Db,
  ) {}

  async verifyAccountAccess(
    _supabase: unknown,
    accountId: string,
    userId: string,
    requiredRoles?: string[],
  ): Promise<{ role: string }> {
    const cacheKey = `account:${accountId}:user:${userId}:role`;
    const cached = this.cacheService.get<string>(cacheKey);
    let role: string;

    if (cached) {
      role = cached;
    } else {
      const [membership] = await this.db
        .select({ role: accountUsers.role })
        .from(accountUsers)
        .where(
          and(
            eq(accountUsers.accountId, accountId),
            eq(accountUsers.userId, userId),
          ),
        )
        .limit(1);

      if (!membership) {
        throw new ForbiddenException('Access denied to this account');
      }

      role = membership.role as string;
      this.cacheService.set(cacheKey, role, ACCOUNT_ROLE_TTL_SECONDS);
    }

    if (requiredRoles && !requiredRoles.includes(role)) {
      throw new ForbiddenException(
        `Requires one of: ${requiredRoles.join(', ')}`,
      );
    }

    return { role };
  }

  async verifyProjectAccess(
    _supabase: unknown,
    projectId: string,
    userId: string,
  ): Promise<{ accountId: string; role: string }> {
    const [project] = await this.db
      .select({ accountId: projects.accountId })
      .from(projects)
      .where(eq(projects.id, projectId))
      .limit(1);

    if (!project || !project.accountId) {
      throw new NotFoundException('Project not found');
    }

    const membership = await this.verifyAccountAccess(
      null,
      project.accountId,
      userId,
    );

    return {
      accountId: project.accountId,
      role: membership.role,
    };
  }
}
