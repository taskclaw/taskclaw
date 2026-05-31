import {
  BadRequestException,
  Injectable,
  Inject,
  ForbiddenException,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { and, desc, eq } from 'drizzle-orm';
import { DB, type Db } from '../db';
import {
  accountUsers,
  invitations,
  users,
  accounts,
} from '../db/schema';
import { AccessControlHelper } from '../common/helpers/access-control.helper';
import { snakeKeys } from '../common/utils/snake-keys.util';

@Injectable()
export class TeamsService {
  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly accessControlHelper: AccessControlHelper,
  ) {}

  async getAccountMembers(
    accountId: string,
    userId: string,
    _accessToken?: string,
  ) {
    // Verify user belongs to account
    await this.accessControlHelper.verifyAccountAccess(null, accountId, userId);

    // Drizzle's relational query returns the joined row under the relation name
    // (`user`), which already matches the PostgREST alias used here (`user:users`).
    const rows = await this.db.query.accountUsers.findMany({
      where: eq(accountUsers.accountId, accountId),
      with: { user: true },
    });

    return rows.map((item) => {
      // Drizzle can infer a `one` relation as `T | T[]`; normalize.
      const u = Array.isArray(item.user) ? item.user[0] : item.user;
      return { id: u?.id, name: u?.name, email: u?.email, role: item.role };
    });
  }

  async getAccountInvitations(
    accountId: string,
    userId: string,
    _accessToken?: string,
  ) {
    // Verify user belongs to account
    await this.accessControlHelper.verifyAccountAccess(null, accountId, userId);

    const rows = await this.db
      .select()
      .from(invitations)
      .where(eq(invitations.accountId, accountId))
      .orderBy(desc(invitations.createdAt));
    return rows.map(snakeKeys);
  }

  async inviteUser(
    accountId: string,
    email: string,
    role: string,
    userId: string,
    _accessToken?: string,
  ) {
    // Verify user is owner/admin
    await this.accessControlHelper.verifyAccountAccess(null, accountId, userId, [
      'owner',
      'admin',
    ]);

    // Check if user is already a member.
    // Migration note: previously this could have used GoTrue admin lookup; we
    // resolve the invitee against public.users by email (the canonical user
    // table now that GoTrue is removed).
    const [user] = await this.db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, email))
      .limit(1);

    if (user) {
      const [existingMember] = await this.db
        .select({ id: accountUsers.id })
        .from(accountUsers)
        .where(
          and(
            eq(accountUsers.accountId, accountId),
            eq(accountUsers.userId, user.id),
          ),
        )
        .limit(1);

      if (existingMember) {
        throw new BadRequestException(
          'User is already a member of this account.',
        );
      }
    }

    // Check if invitation already exists
    const [existingInvite] = await this.db
      .select({ id: invitations.id })
      .from(invitations)
      .where(
        and(
          eq(invitations.accountId, accountId),
          eq(invitations.email, email),
        ),
      )
      .limit(1);

    if (existingInvite) {
      throw new ConflictException('Invitation already sent to this email.');
    }

    const token =
      Math.random().toString(36).substring(2, 15) +
      Math.random().toString(36).substring(2, 15);

    await this.db.insert(invitations).values({
      accountId,
      email,
      role,
      token,
    });

    // TODO: Send email via Resend
    console.log(`Invitation link: http://localhost:3002/invite?token=${token}`);

    return { success: true };
  }

  async removeMember(
    accountId: string,
    memberId: string,
    userId: string,
    _accessToken?: string,
  ) {
    // Verify caller is owner/admin
    await this.accessControlHelper.verifyAccountAccess(null, accountId, userId, [
      'owner',
      'admin',
    ]);

    // Cannot remove yourself
    if (memberId === userId) {
      throw new BadRequestException('Cannot remove yourself from the account');
    }

    // Cannot remove the account owner
    const [account] = await this.db
      .select({ ownerUserId: accounts.ownerUserId })
      .from(accounts)
      .where(eq(accounts.id, accountId))
      .limit(1);

    if (account && account.ownerUserId === memberId) {
      throw new BadRequestException('Cannot remove the account owner');
    }

    // Verify member exists
    const [member] = await this.db
      .select({ id: accountUsers.id })
      .from(accountUsers)
      .where(
        and(
          eq(accountUsers.accountId, accountId),
          eq(accountUsers.userId, memberId),
        ),
      )
      .limit(1);

    if (!member) {
      throw new NotFoundException('Member not found in this account');
    }

    await this.db
      .delete(accountUsers)
      .where(
        and(
          eq(accountUsers.accountId, accountId),
          eq(accountUsers.userId, memberId),
        ),
      );

    return { success: true };
  }

  async acceptInvitation(
    accountId: string,
    invitationId: string,
    userId: string,
    _accessToken?: string,
  ) {
    // Fetch invitation
    const [invitation] = await this.db
      .select()
      .from(invitations)
      .where(
        and(
          eq(invitations.id, invitationId),
          eq(invitations.accountId, accountId),
        ),
      )
      .limit(1);

    if (!invitation) {
      throw new NotFoundException('Invitation not found');
    }

    // Verify the invitation belongs to the current user (by email).
    // Migration note: previously this used `supabase.auth.getUser()` (GoTrue) to
    // read the caller's email; GoTrue is gone, so we resolve the caller's email
    // from public.users by their authenticated userId instead.
    const [authUser] = await this.db
      .select({ email: users.email })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    if (!authUser?.email || authUser.email !== invitation.email) {
      throw new ForbiddenException(
        'This invitation is not for your email address',
      );
    }

    // Check if already a member
    const [existingMember] = await this.db
      .select({ id: accountUsers.id })
      .from(accountUsers)
      .where(
        and(
          eq(accountUsers.accountId, accountId),
          eq(accountUsers.userId, userId),
        ),
      )
      .limit(1);

    if (existingMember) {
      // Already a member, just delete the invitation
      await this.db
        .delete(invitations)
        .where(eq(invitations.id, invitationId));
      return { success: true, message: 'Already a member' };
    }

    // Add user to account
    await this.db.insert(accountUsers).values({
      accountId,
      userId,
      role: invitation.role || 'member',
    });

    // Delete the invitation
    await this.db.delete(invitations).where(eq(invitations.id, invitationId));

    return { success: true };
  }

  async deleteInvitation(
    invitationId: string,
    userId: string,
    _accessToken?: string,
  ) {
    // We need to find the account_id of the invitation to verify access
    const [invitation] = await this.db
      .select({ accountId: invitations.accountId })
      .from(invitations)
      .where(eq(invitations.id, invitationId))
      .limit(1);

    if (!invitation) {
      throw new NotFoundException('Invitation not found');
    }

    // Verify user is owner/admin of the account
    await this.accessControlHelper.verifyAccountAccess(
      null,
      invitation.accountId!,
      userId,
      ['owner', 'admin'],
    );

    await this.db
      .delete(invitations)
      .where(eq(invitations.id, invitationId));

    return { success: true };
  }
}
