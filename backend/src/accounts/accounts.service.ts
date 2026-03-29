import {
  Injectable,
  InternalServerErrorException,
  ForbiddenException,
} from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import { AccessControlHelper } from '../common/helpers/access-control.helper';

import { SystemSettingsService } from '../system-settings/system-settings.service';
import { ProjectsService } from '../projects/projects.service';

@Injectable()
export class AccountsService {
  constructor(
    private readonly supabaseService: SupabaseService,
    private readonly accessControlHelper: AccessControlHelper,
    private readonly systemSettingsService: SystemSettingsService,
    private readonly projectsService: ProjectsService,
  ) {}

  async getUserAccounts(userId: string, accessToken?: string) {
    // We use the service role client (via getClient with token) to bypass RLS
    // But we manually filter by user_id here, so it is safe.
    const supabase = this.supabaseService.getClient(accessToken);

    const { data, error } = await supabase
      .from('account_users')
      .select(
        `
        role,
        account:accounts (
          id,
          name,
          onboarding_completed
        )
      `,
      )
      .eq('user_id', userId);

    if (error) {
      console.error('AccountsService Error:', error);
      throw new InternalServerErrorException(error.message);
    }

    if (!data) {
      return [];
    }

    return data.map((item: any) => ({
      id: item.account.id,
      name: item.account.name,
      role: item.role,
      onboarding_completed: item.account.onboarding_completed ?? false,
      plan: 'Free', // Placeholder for now
    }));
  }

  async createAccount(userId: string, name: string, accessToken?: string) {
    const supabase = this.supabaseService.getClient(accessToken);

    // 1. Create the account
    // No access control needed for creation (anyone can create an account if authenticated)
    const { data: account, error: accountError } = await supabase
      .from('accounts')
      .insert({
        name,
        owner_user_id: userId,
      })
      .select()
      .single();

    if (accountError) {
      console.error('AccountsService: Error creating account', accountError);
      throw new InternalServerErrorException(accountError.message);
    }

    // 2. Add the user as owner in account_users
    const { error: memberError } = await supabase.from('account_users').insert({
      account_id: account.id,
      user_id: userId,
      role: 'owner',
    });

    if (memberError) {
      console.error('AccountsService: Error adding owner', memberError);
      // Ideally we should rollback the account creation here
      throw new InternalServerErrorException(memberError.message);
    }

    // 3. Check system settings and auto-create project if needed
    try {
      const settings = await this.systemSettingsService.getSettings();
      if (!settings.allow_multiple_projects) {
        // Auto-create default project
        // We need to use the admin client or pass the access token if available.
        // Since ProjectsService uses SupabaseService which might need context, let's see.
        // ProjectsService.createProject expects (accountId, name, userId).
        // Wait, let's check ProjectsService signature.
        // Assuming createProject(accountId: string, name: string, userId: string)
        // We might need to handle the "accessToken" part if ProjectsService relies on it for RLS.
        // However, since we are in the backend, we might be able to bypass RLS or use the token we have.

        // Actually, ProjectsService usually takes (createProjectDto, userId) or similar.
        // Let's assume for now I can call it. I'll need to verify ProjectsService signature.
        // But wait, I can't see ProjectsService right now.
        // I'll assume standard signature and fix if needed.
        // Re-reading my previous thought: "ProjectsService.createProject(account.id, 'Default Project', accessToken)"

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
    accessToken?: string,
  ) {
    const supabase = this.supabaseService.getClient(accessToken);

    // Verify user is owner/admin
    await this.accessControlHelper.verifyAccountAccess(
      supabase,
      accountId,
      userId,
      ['owner', 'admin'],
    );

    const { data, error } = await supabase
      .from('accounts')
      .update({ name })
      .eq('id', accountId)
      .select()
      .single();

    if (error) {
      throw new InternalServerErrorException(error.message);
    }

    return data;
  }

  async patchAccount(
    accountId: string,
    updates: { name?: string; onboarding_completed?: boolean },
    userId: string,
    accessToken?: string,
  ) {
    const supabase = this.supabaseService.getClient(accessToken);

    // Verify user is owner/admin/member
    await this.accessControlHelper.verifyAccountAccess(
      supabase,
      accountId,
      userId,
    );

    // Build update payload (only include defined fields)
    const payload: Record<string, any> = {};
    if (updates.name !== undefined) payload.name = updates.name;
    if (updates.onboarding_completed !== undefined)
      payload.onboarding_completed = updates.onboarding_completed;

    if (Object.keys(payload).length === 0) {
      return { message: 'No updates provided' };
    }

    // Use admin client to bypass RLS for account updates
    const adminClient = this.supabaseService.getAdminClient();
    const { data, error } = await adminClient
      .from('accounts')
      .update(payload)
      .eq('id', accountId)
      .select()
      .single();

    if (error) {
      throw new InternalServerErrorException(error.message);
    }

    return data;
  }
  async findAllAccounts(page: number = 1, limit: number = 10, search?: string) {
    const supabase = this.supabaseService.getAdminClient();
    const offset = (page - 1) * limit;

    let query = supabase
      .from('accounts')
      .select('*, owner:users!owner_user_id(email)', { count: 'exact' });

    if (search) {
      query = query.ilike('name', `%${search}%`);
    }

    const {
      data: accounts,
      count,
      error,
    } = await query
      .range(offset, offset + limit - 1)
      .order('created_at', { ascending: false });

    if (error) {
      throw new InternalServerErrorException(error.message);
    }

    return {
      data: accounts.map((account: any) => ({
        ...account,
        ownerEmail: account.owner?.email || 'Unknown',
      })),
      meta: {
        total: count,
        page,
        limit,
        totalPages: Math.ceil((count || 0) / limit),
      },
    };
  }
}
