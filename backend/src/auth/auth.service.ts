import {
  Injectable,
  UnauthorizedException,
  BadRequestException,
  Inject,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { randomBytes, createHash } from 'crypto';
import { eq, sql } from 'drizzle-orm';
import { DB, type Db } from '../db';
import { users, passwordResetTokens } from '../db/schema';
import { JwtAuthService } from './jwt-auth.service';
import { MailerService } from '../common/mailer/mailer.service';
import { CacheService } from '../common/cache.service';
import { LoginDto, SignupDto } from './dto/auth.dto';

// Pre-computed bcrypt hash so the unknown-email branch of login spends roughly the
// same time as a real compare (mitigates user enumeration via timing).
const DUMMY_BCRYPT_HASH =
  '$2a$12$C6UzMDM.H6dfI/f/IKcEeO3p3oP6m0s0qX9oQ2qY3wP9m7m1bB8mC';
const RESET_TTL_MS = 60 * 60 * 1000; // 1h
const BCRYPT_COST = 12;

/**
 * Local Postgres auth (Epic 1). GoTrue/Supabase has been removed; this is the only
 * auth path. Access tokens are HS256 JWTs (same JWT_SECRET); refresh tokens rotate
 * via JwtAuthService. Existing GoTrue bcrypt ($2a$) hashes verify unchanged.
 */
@Injectable()
export class AuthService {
  constructor(
    private readonly config: ConfigService,
    private readonly jwt: JwtService,
    private readonly tokens: JwtAuthService,
    private readonly mailer: MailerService,
    private readonly cache: CacheService,
    @Inject(DB) private readonly db: Db,
  ) {}

  private sha256(raw: string): string {
    return createHash('sha256').update(raw).digest('hex');
  }

  async login(
    loginDto: LoginDto,
    meta: { userAgent?: string; ip?: string } = {},
  ) {
    const email = loginDto.email.toLowerCase();
    const [user] = await this.db
      .select({
        id: users.id,
        email: users.email,
        name: users.name,
        passwordHash: users.passwordHash,
        status: users.status,
      })
      .from(users)
      .where(sql`lower(${users.email}) = ${email}`)
      .limit(1);

    // Always run a compare (dummy on unknown email) to keep timing uniform.
    const ok = await bcrypt.compare(
      loginDto.password,
      user?.passwordHash ?? DUMMY_BCRYPT_HASH,
    );
    if (!user || !ok) throw new UnauthorizedException('Invalid credentials');

    if (String(user.status).toLowerCase() !== 'active') {
      throw new UnauthorizedException(
        'Your account is pending approval or suspended.',
      );
    }

    await this.db
      .update(users)
      .set({ lastSignInAt: new Date().toISOString() })
      .where(eq(users.id, user.id));

    return this.tokens.issueSession(
      { id: user.id, email: user.email, name: user.name },
      meta,
    );
  }

  async signup(signupDto: SignupDto) {
    const email = signupDto.email.toLowerCase();
    const passwordHash = await bcrypt.hash(signupDto.password, BCRYPT_COST);
    try {
      // The on_public_user_created trigger provisions account + account_users.
      await this.db
        .insert(users)
        .values({ email, name: signupDto.name, passwordHash, status: 'pending' });
    } catch (e: any) {
      if (e?.code === '23505') {
        throw new BadRequestException('Email already registered');
      }
      throw new BadRequestException(e?.message ?? 'Signup failed');
    }
    // No session — account is pending approval.
    return { success: true, status: 'pending' };
  }

  async refresh(refreshToken: string) {
    const { userId, refresh } = await this.tokens.rotateRefresh(refreshToken);
    const [user] = await this.db
      .select({ id: users.id, email: users.email, name: users.name })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);
    if (!user) throw new UnauthorizedException('User not found');
    const access_token = await this.tokens.signAccess(user);
    return {
      access_token,
      refresh_token: refresh,
      expires_in: 3600,
      token_type: 'bearer' as const,
      user,
    };
  }

  async logout(accessToken: string, refreshToken?: string) {
    if (refreshToken) await this.tokens.revoke(refreshToken);
    const sub = this.subFromToken(accessToken);
    if (sub) this.cache.delete(`user:${sub}:status`);
    return { success: true };
  }

  async getMe(accessToken: string) {
    const sub = this.subFromToken(accessToken);
    if (!sub) throw new UnauthorizedException('Invalid session');
    const [user] = await this.db
      .select({
        id: users.id,
        email: users.email,
        name: users.name,
        status: users.status,
      })
      .from(users)
      .where(eq(users.id, sub))
      .limit(1);
    if (!user) throw new UnauthorizedException('Invalid session');
    return user;
  }

  async resetPasswordForEmail(email: string, _redirectTo: string) {
    const [user] = await this.db
      .select({ id: users.id })
      .from(users)
      .where(sql`lower(${users.email}) = ${email.toLowerCase()}`)
      .limit(1);

    if (user) {
      const raw = randomBytes(32).toString('hex');
      await this.db.insert(passwordResetTokens).values({
        userId: user.id,
        tokenHash: this.sha256(raw),
        expiresAt: new Date(Date.now() + RESET_TTL_MS).toISOString(),
      });
      const base = this.config.get<string>('SITE_URL') ?? '';
      await this.mailer.sendPasswordReset(
        email,
        `${base}/update-password?token=${raw}`,
      );
    }
    // Always succeed — no account enumeration.
    return { success: true };
  }

  async resetPassword(rawToken: string, newPassword: string) {
    const [row] = await this.db
      .select()
      .from(passwordResetTokens)
      .where(eq(passwordResetTokens.tokenHash, this.sha256(rawToken)))
      .limit(1);
    if (!row || row.usedAt || new Date(row.expiresAt) < new Date()) {
      throw new BadRequestException('Invalid or expired token');
    }
    const passwordHash = await bcrypt.hash(newPassword, BCRYPT_COST);
    await this.db
      .update(users)
      .set({ passwordHash, updatedAt: new Date().toISOString() })
      .where(eq(users.id, row.userId));
    await this.db
      .update(passwordResetTokens)
      .set({ usedAt: new Date().toISOString() })
      .where(eq(passwordResetTokens.id, row.id));
    await this.tokens.revokeAllForUser(row.userId);
    this.cache.delete(`user:${row.userId}:status`);
    return { success: true };
  }

  async updateUser(accessToken: string, attributes: { password?: string }) {
    const sub = this.subFromToken(accessToken);
    if (!sub) throw new UnauthorizedException('Invalid session');
    if (attributes.password) {
      const passwordHash = await bcrypt.hash(attributes.password, BCRYPT_COST);
      await this.db
        .update(users)
        .set({ passwordHash, updatedAt: new Date().toISOString() })
        .where(eq(users.id, sub));
      await this.tokens.revokeAllForUser(sub);
    }
    const [user] = await this.db
      .select({ id: users.id, email: users.email, name: users.name })
      .from(users)
      .where(eq(users.id, sub))
      .limit(1);
    return user;
  }

  /** Verify a local access token (HS256, shared secret) and return its subject. */
  private subFromToken(token: string): string | null {
    try {
      const payload = this.jwt.verify<{ sub?: string }>(token, {
        secret: this.config.get<string>('JWT_SECRET'),
      });
      return payload?.sub ?? null;
    } catch {
      return null;
    }
  }
}
