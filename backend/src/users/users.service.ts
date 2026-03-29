import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';

@Injectable()
export class UsersService {
  constructor(private readonly supabaseService: SupabaseService) {}

  async getProfile(userId: string, accessToken?: string) {
    console.log('[UsersService.getProfile] Called with userId:', userId);
    // Use getAuthClient (Anon Key + JWT) to verify the session
    const supabase = this.supabaseService.getAuthClient(accessToken || '');

    const { data: user, error } = await supabase.auth.getUser();

    console.log('[UsersService.getProfile] Auth response:', {
      hasUser: !!user,
      userId: user?.user?.id,
      email: user?.user?.email,
      error: error?.message,
    });

    if (error || !user) {
      console.error(
        '[UsersService.getProfile] User not found or error:',
        error,
      );
      throw new NotFoundException(
        'User profile not found. Please log in again.',
      );
    }

    const profile = {
      name: user.user.user_metadata.full_name || user.user.email,
      email: user.user.email,
      avatar: '', // Placeholder
      role: user.user.app_metadata?.role || 'member',
    };

    console.log('[UsersService.getProfile] Returning profile:', profile);
    return profile;
  }

  async getPreferences(userId: string, accessToken?: string) {
    const supabase = this.supabaseService.getClient(accessToken);

    const { data, error } = await supabase
      .from('user_preferences')
      .select('*')
      .eq('user_id', userId)
      .single();

    if (error && error.code !== 'PGRST116') {
      // PGRST116 = "Row not found" — that's fine, return defaults
      throw new Error(`Failed to fetch preferences: ${error.message}`);
    }

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
    accessToken?: string,
  ) {
    const supabase = this.supabaseService.getClient(accessToken);

    // Upsert preferences
    const { data, error } = await supabase
      .from('user_preferences')
      .upsert(
        {
          user_id: userId,
          ...preferences,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'user_id' },
      )
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to update preferences: ${error.message}`);
    }

    return data;
  }

  async findAllUsers(
    page: number = 1,
    limit: number = 10,
    search?: string,
    status?: string,
  ) {
    const supabase = this.supabaseService.getAdminClient();
    const offset = (page - 1) * limit;

    let query = supabase.from('users').select('*', { count: 'exact' });

    if (search) {
      query = query.or(`email.ilike.%${search}%,name.ilike.%${search}%`);
    }

    if (status) {
      query = query.eq('status', status);
    }

    const {
      data: users,
      count,
      error,
    } = await query
      .range(offset, offset + limit - 1)
      .order('created_at', { ascending: false });

    if (error) {
      throw new Error(error.message);
    }

    const usersWithCounts = await Promise.all(
      users.map(async (user) => {
        const { count: instancesCount } = await supabase
          .from('account_users')
          .select('*', { count: 'exact', head: true })
          .eq('user_id', user.id);

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
        total: count,
        page,
        limit,
        totalPages: Math.ceil((count || 0) / limit),
      },
    };
  }

  async updateUserStatus(userId: string, status: string) {
    const normalized = String(status || '').toLowerCase();
    const allowed = ['active', 'pending', 'suspended'];
    if (!allowed.includes(normalized)) {
      throw new BadRequestException('Invalid status');
    }

    const supabase = this.supabaseService.getAdminClient();
    const { error } = await supabase
      .from('users')
      .update({ status: normalized })
      .eq('id', userId);

    if (error) throw new Error(error.message);
    return { success: true };
  }

  async getUserDetailsAdmin(userId: string) {
    const supabase = this.supabaseService.getAdminClient();

    const { data: user, error } = await supabase
      .from('users')
      .select('*')
      .eq('id', userId)
      .single();

    if (error) throw new Error(error.message);

    const { data: accounts } = await supabase
      .from('account_users')
      .select(
        `
                role,
                account:accounts (
                    id,
                    name
                )
            `,
      )
      .eq('user_id', userId);

    return {
      ...user,
      linkedAccounts:
        accounts?.map((a: any) => ({
          id: a.account.id,
          name: a.account.name,
          role: a.role,
        })) || [],
    };
  }

  async updateUserRole(userId: string, role: string) {
    const supabase = this.supabaseService.getAdminClient();

    const { error: authError } = await supabase.auth.admin.updateUserById(
      userId,
      { app_metadata: { role } },
    );

    if (authError) throw new Error(authError.message);

    return { success: true };
  }

  async deleteUser(userId: string) {
    const supabase = this.supabaseService.getAdminClient();

    const { error } = await supabase.auth.admin.deleteUser(userId);

    if (error) throw new Error(error.message);

    return { success: true };
  }
}
