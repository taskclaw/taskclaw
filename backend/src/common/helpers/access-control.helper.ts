import {
  Injectable,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { SupabaseClient } from '@supabase/supabase-js';

@Injectable()
export class AccessControlHelper {
  /**
   * Verify user belongs to account with optional role check
   */
  async verifyAccountAccess(
    supabase: SupabaseClient,
    accountId: string,
    userId: string,
    requiredRoles?: string[],
  ): Promise<{ role: string }> {
    // Debug logging
    console.log('[AccessControl] Checking access:', {
      accountId,
      userId,
      requiredRoles,
    });

    // Check membership in account_users table
    const { data: membership, error } = await supabase
      .from('account_users')
      .select('role')
      .eq('account_id', accountId)
      .eq('user_id', userId)
      .single();

    console.log('[AccessControl] Query result:', {
      membership,
      error: error?.message,
    });

    if (error || !membership) {
      throw new ForbiddenException('Access denied to this account');
    }

    if (requiredRoles && !requiredRoles.includes(membership.role)) {
      throw new ForbiddenException(
        `Requires one of: ${requiredRoles.join(', ')}`,
      );
    }

    return membership;
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
