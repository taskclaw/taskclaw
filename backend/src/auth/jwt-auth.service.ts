import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { randomBytes, createHash } from 'crypto';
import { and, eq, isNull } from 'drizzle-orm';
import { DB, type Db } from '../db';
import { refreshTokens } from '../db/schema';

const ACCESS_TTL_SECONDS = 60 * 60; // 1h — matches GoTrue default; no instant revocation
const REFRESH_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30d

export interface SessionUser {
  id: string;
  email: string;
  name?: string | null;
}

export interface IssuedSession {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  token_type: 'bearer';
  user: { id: string; email: string; name?: string | null };
}

/**
 * Local token service (Epic 1) — replaces GoTrue's token issuance.
 *
 * - Access token: stateless HS256 JWT signed with the SAME `JWT_SECRET` GoTrue used,
 *   so PostgREST/Realtime keep validating tokens during the cutover and the AuthGuard
 *   verifies both GoTrue and local tokens with one code path.
 * - Refresh token: opaque 32-byte random, stored only as sha256, one-time-use rotation
 *   with family reuse-detection.
 */
@Injectable()
export class JwtAuthService {
  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  private get secret(): string {
    return this.config.get<string>('JWT_SECRET')!;
  }

  private sha256(raw: string): string {
    return createHash('sha256').update(raw).digest('hex');
  }

  async signAccess(user: SessionUser): Promise<string> {
    return this.jwt.signAsync(
      { sub: user.id, email: user.email, role: 'authenticated', typ: 'access' },
      { secret: this.secret, expiresIn: ACCESS_TTL_SECONDS, issuer: 'taskclaw' },
    );
  }

  /** Issue a brand-new refresh token (new family). Returns the raw token. */
  async issueRefresh(
    userId: string,
    meta: { userAgent?: string; ip?: string } = {},
    familyId?: string,
    parentId?: string,
  ): Promise<string> {
    const raw = randomBytes(32).toString('hex');
    await this.db.insert(refreshTokens).values({
      userId,
      tokenHash: this.sha256(raw),
      expiresAt: new Date(Date.now() + REFRESH_TTL_MS).toISOString(),
      userAgent: meta.userAgent,
      ip: meta.ip,
      ...(familyId ? { familyId } : {}),
      ...(parentId ? { parentId } : {}),
    });
    return raw;
  }

  /** Build a full session (access + refresh) for a user. */
  async issueSession(
    user: SessionUser,
    meta: { userAgent?: string; ip?: string } = {},
  ): Promise<IssuedSession> {
    const [access_token, refresh_token] = await Promise.all([
      this.signAccess(user),
      this.issueRefresh(user.id, meta),
    ]);
    return {
      access_token,
      refresh_token,
      expires_in: ACCESS_TTL_SECONDS,
      token_type: 'bearer',
      user: { id: user.id, email: user.email, name: user.name ?? null },
    };
  }

  /**
   * Rotate a refresh token: validate, revoke the old one, mint a child in the same
   * family. If a *revoked* token is replayed, revoke the whole family (theft signal).
   */
  async rotateRefresh(rawToken: string): Promise<{ userId: string; refresh: string }> {
    const hash = this.sha256(rawToken);

    // Atomically CLAIM the token: a conditional UPDATE flips revoked_at only if
    // it is still NULL, so of N concurrent refreshes exactly one gets the row
    // back. A separate select-then-revoke leaves a race window where parallel
    // replays of the same token all validate and all mint children.
    const [row] = await this.db
      .update(refreshTokens)
      .set({ revokedAt: new Date().toISOString() })
      .where(
        and(eq(refreshTokens.tokenHash, hash), isNull(refreshTokens.revokedAt)),
      )
      .returning();

    if (!row) {
      // Lost the claim: unknown token, or a replay of an already-rotated one.
      const [existing] = await this.db
        .select()
        .from(refreshTokens)
        .where(eq(refreshTokens.tokenHash, hash))
        .limit(1);
      if (!existing) throw new UnauthorizedException('Invalid refresh token');
      // reuse of a rotated token → revoke the entire family (theft signal)
      await this.db
        .update(refreshTokens)
        .set({ revokedAt: new Date().toISOString() })
        .where(eq(refreshTokens.familyId, existing.familyId));
      throw new UnauthorizedException('Refresh token reuse detected');
    }

    if (new Date(row.expiresAt) < new Date()) {
      // Already revoked above — revoking an expired token is harmless.
      throw new UnauthorizedException('Refresh token expired');
    }

    const childRaw = await this.issueRefresh(
      row.userId,
      { userAgent: row.userAgent ?? undefined, ip: row.ip ?? undefined },
      row.familyId,
      row.id,
    );

    return { userId: row.userId, refresh: childRaw };
  }

  /** Revoke a single refresh token (logout). */
  async revoke(rawToken: string): Promise<void> {
    await this.db
      .update(refreshTokens)
      .set({ revokedAt: new Date().toISOString() })
      .where(
        and(
          eq(refreshTokens.tokenHash, this.sha256(rawToken)),
          // only set if not already revoked — harmless either way
        ),
      );
  }

  /** Revoke every refresh token for a user (password change / reset). */
  async revokeAllForUser(userId: string): Promise<void> {
    await this.db
      .update(refreshTokens)
      .set({ revokedAt: new Date().toISOString() })
      .where(eq(refreshTokens.userId, userId));
  }
}
