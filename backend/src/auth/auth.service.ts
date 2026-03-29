import {
  Injectable,
  UnauthorizedException,
  BadRequestException,
} from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import { LoginDto, SignupDto, UpdatePasswordDto } from './dto/auth.dto';

@Injectable()
export class AuthService {
  constructor(private readonly supabaseService: SupabaseService) {}

  async login(loginDto: LoginDto) {
    // Use getAuthClient with empty token initially to get a client for auth operations
    // Actually, for signInWithPassword, we can use the Anon key client directly.
    // But getAuthClient requires a token.
    // Let's use getClient() which returns the anon client if no token is passed?
    // Wait, getClient() returns Service Role if token is passed, or Anon if not.
    // BUT we want to be explicit.

    // Let's look at SupabaseService again.
    // getClient(accessToken?) -> if token: Service Role (BAD for auth), if no token: Anon (GOOD for auth)

    // So for login, we can use getClient() (no token).
    const supabase = this.supabaseService.getClient();

    const { data, error } = await supabase.auth.signInWithPassword({
      email: loginDto.email,
      password: loginDto.password,
    });

    if (error) {
      console.error('[AuthService.login] Supabase auth error:', {
        message: error.message,
        status: error.status,
        name: error.name,
        email: loginDto.email,
      });
      throw new UnauthorizedException(error.message);
    }

    // Block login for users pending approval / suspended (stored in public.users.status)
    // We intentionally check this server-side so even if the frontend changes, pending users can't log in.
    if (data?.user?.id) {
      const admin = this.supabaseService.getAdminClient();
      const { data: profile, error: profileError } = await admin
        .from('users')
        .select('status')
        .eq('id', data.user.id)
        .single();

      if (profileError) {
        // Backwards-compat if migration wasn't applied yet: allow login rather than hard-failing.
        // Once `users.status` exists, this will enforce the gate.
        const msg = (profileError as any)?.message?.toLowerCase?.() || '';
        if (!msg.includes('status')) {
          throw new UnauthorizedException('Unable to verify account status');
        }
      } else {
        const status = String(profile?.status || 'active').toLowerCase();
        if (status !== 'active') {
          throw new UnauthorizedException(
            'Your account is pending approval or suspended.',
          );
        }
      }
    }

    return data.session;
  }

  async signup(signupDto: SignupDto) {
    const supabase = this.supabaseService.getClient();

    const { data, error } = await supabase.auth.signUp({
      email: signupDto.email,
      password: signupDto.password,
      options: {
        data: {
          full_name: signupDto.name,
        },
      },
    });

    if (error) {
      throw new BadRequestException(error.message);
    }

    // Mark newly created users as pending until an admin approves them.
    // This is stored in public.users (profile table) and enforced on login + API guard.
    if (data?.user?.id) {
      const admin = this.supabaseService.getAdminClient();
      const { error: upsertError } = await admin.from('users').upsert(
        {
          id: data.user.id,
          email: signupDto.email,
          name: signupDto.name,
          status: 'pending',
        },
        { onConflict: 'id' },
      );

      if (upsertError) {
        // Don't block signup if profile upsert fails, but log for debugging.
        console.error(
          '[AuthService.signup] Failed to set user pending status:',
          upsertError,
        );
      }
    }

    return data.session;
  }

  async logout(accessToken: string) {
    // To sign out, we need the user's session.
    // Use getAuthClient(accessToken) which uses Anon + JWT
    const supabase = this.supabaseService.getAuthClient(accessToken);
    const { error } = await supabase.auth.signOut();

    if (error) {
      // We don't really care if logout fails, but good to log
      console.error('Logout error:', error);
    }

    return { success: true };
  }

  async getMe(accessToken: string) {
    const supabase = this.supabaseService.getAuthClient(accessToken);
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser();

    if (error || !user) {
      throw new UnauthorizedException('Invalid session');
    }

    return user;
  }

  async resetPasswordForEmail(email: string, redirectTo: string) {
    const supabase = this.supabaseService.getClient();
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo,
    });

    if (error) {
      throw new BadRequestException(error.message);
    }

    return { success: true };
  }

  async updateUser(accessToken: string, attributes: any) {
    const supabase = this.supabaseService.getAuthClient(accessToken);
    const { data, error } = await supabase.auth.updateUser(attributes);

    if (error) {
      throw new BadRequestException(error.message);
    }

    return data.user;
  }

  async exchangeCodeForSession(code: string) {
    const supabase = this.supabaseService.getClient(); // Anon client is fine for code exchange? Or getAuthClient?
    // Actually, exchangeCodeForSession is usually done with the anon key.
    // But wait, getClient() returns Service Role if token is passed, or Anon if not.
    // We don't have a token yet. So getClient() (no args) returns Anon client.

    const { data, error } = await supabase.auth.exchangeCodeForSession(code);

    if (error) {
      throw new UnauthorizedException(error.message);
    }

    return data.session;
  }
}
