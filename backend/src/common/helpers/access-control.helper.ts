import {
  Injectable,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { SupabaseClient } from '@supabase/supabase-js';
import { CacheService } from '../cache.service';

// Cache account membership role for 5 minutes
const ACCOUNT_ROLE_TTL_SECONDS = 300;

@Injectable()
export class AccessControlHelper {
  constructor(private readonly cacheService: CacheService) {}

  /**
   * Verify user belongs to account with optional role check.
   * Caches the role lookup for ACCOUNT_ROLE_TTL_SECONDS to avoid repeated DB queries.
   */
  async verifyAccountAccess(
    supabase: SupabaseClient,
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
      const { data: membership, error } = await supabase
        .from('account_users')
        .select('role')
        .eq('account_id', accountId)
        .eq('user_id', userId)
        .single();

      if (error || !membership) {
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

  /**
   * Verify user has access to project
   */
  async verifyProjectAccess(
    supabase: SupabaseClient,
    projectId: string,
    userId: string,
  ): Promise<{ accountId: string; role: string }> {
    // Get project's account
    const { data: project, error: projectError } = await supabase
      .from('projects')
      .select('account_id')
      .eq('id', projectId)
      .single();

    if (projectError || !project) {
      throw new NotFoundException('Project not found');
    }

    // Verify account access
    const membership = await this.verifyAccountAccess(
      supabase,
      project.account_id,
      userId,
    );

    return {
      accountId: project.account_id,
      role: membership.role,
    };
  }
}
