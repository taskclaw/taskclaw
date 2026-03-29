import { Injectable, BadRequestException } from '@nestjs/common';
import { SupabaseService } from '../../supabase/supabase.service';

const DISPOSABLE_DOMAINS = new Set([
  'mailinator.com',
  'guerrillamail.com',
  'tempmail.com',
  'yopmail.com',
  'throwaway.email',
  'sharklasers.com',
  'guerrillamail.info',
  'guerrillamail.net',
  'grr.la',
  'guerrillamail.de',
  'tmail.ws',
  'trashmail.com',
  'dispostable.com',
  'maildrop.cc',
  'fakeinbox.com',
  'temp-mail.org',
  '10minutemail.com',
  'mailnesia.com',
  'getnada.com',
  'tempail.com',
  'mohmal.com',
  'burnermail.io',
  'guerrillamailblock.com',
  'mintemail.com',
  'trashmail.net',
  'mailcatch.com',
  'tempr.email',
  'discard.email',
  'mailsac.com',
  'harakirimail.com',
]);

const TEST_EMAILS = new Set([
  'test@test.com',
  'test@example.com',
  'example@example.com',
  'foo@bar.com',
  'admin@admin.com',
  'user@user.com',
]);

@Injectable()
export class WaitlistService {
  constructor(private readonly supabaseService: SupabaseService) {}

  private validateEmail(email: string): void {
    const normalized = email.toLowerCase().trim();
    const domain = normalized.split('@')[1];
    const localPart = normalized.split('@')[0];

    if (DISPOSABLE_DOMAINS.has(domain)) {
      throw new BadRequestException(
        'Please use a valid, non-disposable email address',
      );
    }

    if (TEST_EMAILS.has(normalized)) {
      throw new BadRequestException('Please use a real email address');
    }

    if (/\+(test|spam|trash|junk|fake)/.test(localPart)) {
      throw new BadRequestException('Please use a valid email address');
    }
  }

  async join(email: string, source: string = 'landing_page') {
    const normalized = email.toLowerCase().trim();
    this.validateEmail(normalized);

    const client = this.supabaseService.getAdminClient();

    // Upsert: if email already exists, do nothing (ON CONFLICT)
    const { error } = await client
      .from('waitlist')
      .upsert(
        { email: normalized, source },
        { onConflict: 'email', ignoreDuplicates: true },
      );

    if (error) {
      throw new BadRequestException(
        'Unable to join waitlist. Please try again.',
      );
    }

    return {
      success: true,
      message: "You're on the list! We'll reach out soon.",
    };
  }

  async getCount(): Promise<{ count: number }> {
    const client = this.supabaseService.getAdminClient();

    const { count, error } = await client
      .from('waitlist')
      .select('*', { count: 'exact', head: true });

    if (error) {
      return { count: 0 };
    }

    return { count: count ?? 0 };
  }

  async findAll(page = 1, limit = 50) {
    const client = this.supabaseService.getAdminClient();
    const offset = (page - 1) * limit;

    const { data, count, error } = await client
      .from('waitlist')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) {
      throw new BadRequestException('Failed to fetch waitlist');
    }

    return {
      data: data ?? [],
      total: count ?? 0,
      page,
      limit,
    };
  }
}
