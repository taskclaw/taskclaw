import { Injectable, Inject, BadRequestException } from '@nestjs/common';
import { count, desc } from 'drizzle-orm';
import { DB, type Db } from '../../db';
import { waitlist } from '../../db/schema';

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
  constructor(@Inject(DB) private readonly db: Db) {}

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

    // Upsert: if email already exists, do nothing (ON CONFLICT)
    try {
      await this.db
        .insert(waitlist)
        .values({ email: normalized, source })
        .onConflictDoNothing({ target: [waitlist.email] });
    } catch {
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
    try {
      const [row] = await this.db
        .select({ value: count() })
        .from(waitlist);

      return { count: row?.value ?? 0 };
    } catch {
      return { count: 0 };
    }
  }

  async findAll(page = 1, limit = 50) {
    const offset = (page - 1) * limit;

    try {
      const [data, [total]] = await Promise.all([
        this.db
          .select()
          .from(waitlist)
          .orderBy(desc(waitlist.createdAt))
          .limit(limit)
          .offset(offset),
        this.db.select({ value: count() }).from(waitlist),
      ]);

      return {
        data: data ?? [],
        total: total?.value ?? 0,
        page,
        limit,
      };
    } catch {
      throw new BadRequestException('Failed to fetch waitlist');
    }
  }
}
