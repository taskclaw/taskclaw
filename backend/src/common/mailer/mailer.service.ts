import { Injectable, Logger } from '@nestjs/common';

/**
 * Minimal mailer abstraction (Epic 1, S1.7).
 *
 * GoTrue previously sent transactional emails (password reset). The backend has no
 * mail provider yet, so the default driver just logs. Wire a real provider
 * (Resend / SMTP / Postmark) behind this same interface when one is chosen — see the
 * migration PRD's open questions. Password-reset is gated on a real driver being
 * configured; login/signup/refresh work without it.
 */
@Injectable()
export class MailerService {
  private readonly logger = new Logger(MailerService.name);

  /** True once a real provider is wired (the log driver returns false). */
  get isConfigured(): boolean {
    return false;
  }

  async sendPasswordReset(email: string, resetLink: string): Promise<void> {
    this.logger.warn(
      `[mailer:log-driver] password reset for ${email} — no provider configured. Link: ${resetLink}`,
    );
  }
}
