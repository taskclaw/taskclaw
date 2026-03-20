import { BadRequestException, Injectable, InternalServerErrorException, ForbiddenException, NotFoundException, ConflictException } from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import { AccessControlHelper } from '../common/helpers/access-control.helper';

@Injectable()
export class TeamsService {
    constructor(
        private readonly supabaseService: SupabaseService,
        private readonly accessControlHelper: AccessControlHelper,
    ) { }

    async getAccountMembers(accountId: string, userId: string, accessToken?: string) {
        const supabase = this.supabaseService.getClient(accessToken);

        // Verify user belongs to account
        await this.accessControlHelper.verifyAccountAccess(supabase, accountId, userId);

        const { data, error } = await supabase
            .from('account_users')
            .select(`
        role,
        user:users (
          id,
          name,
          email
        )
      `)
            .eq('account_id', accountId);

        if (error) {
            throw new InternalServerErrorException(error.message);
        }

        return data.map((item: any) => ({
            id: item.user.id,
            name: item.user.name,
            email: item.user.email,
            role: item.role,
        }));
    }

    async getAccountInvitations(accountId: string, userId: string, accessToken?: string) {
        const supabase = this.supabaseService.getClient(accessToken);

        // Verify user belongs to account
        await this.accessControlHelper.verifyAccountAccess(supabase, accountId, userId);

        const { data, error } = await supabase
            .from('invitations')
            .select('*')
            .eq('account_id', accountId)
            .order('created_at', { ascending: false });

        if (error) {
            throw new InternalServerErrorException(error.message);
        }

        return data;
    }

    async inviteUser(accountId: string, email: string, role: string, userId: string, accessToken?: string) {
        const supabase = this.supabaseService.getClient(accessToken);

        // Verify user is owner/admin
        await this.accessControlHelper.verifyAccountAccess(supabase, accountId, userId, ['owner', 'admin']);

        // Check if user is already a member
        // We need to find the user by email first.
        // Since we are using service role key, we can query the users table (if it's in public schema or we have access)
        // BUT Supabase Auth users are in auth.users which is not directly accessible via PostgREST usually.
        // However, we might have a public.users table that syncs with auth.users.
        // Looking at the code: `supabase.from('users').select('id').eq('email', email)` implies public.users.

        const { data: user } = await supabase.from('users').select('id').eq('email', email).single();

        if (user) {
            const { data: existingMember } = await supabase
                .from('account_users')
                .select('id')
                .eq('account_id', accountId)
                .eq('user_id', user.id)
                .single();

            if (existingMember) {
                throw new BadRequestException('User is already a member of this account.');
            }
        }

        // Check if invitation already exists
        const { data: existingInvite } = await supabase
            .from('invitations')
            .select('id')
            .eq('account_id', accountId)
            .eq('email', email)
            .single();

        if (existingInvite) {
            throw new ConflictException('Invitation already sent to this email.');
        }

        const token = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);

        const { error } = await supabase
            .from('invitations')
            .insert({
                account_id: accountId,
                email,
                role,
                token,
            });

        if (error) {
            throw new InternalServerErrorException(error.message);
        }

        // TODO: Send email via Resend
        console.log(`Invitation link: http://localhost:3002/invite?token=${token}`);

        return { success: true };
    }

    async removeMember(accountId: string, memberId: string, userId: string, accessToken?: string) {
        const supabase = this.supabaseService.getClient(accessToken);

        // Verify caller is owner/admin
        await this.accessControlHelper.verifyAccountAccess(supabase, accountId, userId, ['owner', 'admin']);

        // Cannot remove yourself
        if (memberId === userId) {
            throw new BadRequestException('Cannot remove yourself from the account');
        }

        // Cannot remove the account owner
        const { data: account } = await supabase
            .from('accounts')
            .select('owner_user_id')
            .eq('id', accountId)
            .single();

        if (account && account.owner_user_id === memberId) {
            throw new BadRequestException('Cannot remove the account owner');
        }

        // Verify member exists
        const { data: member } = await supabase
            .from('account_users')
            .select('id')
            .eq('account_id', accountId)
            .eq('user_id', memberId)
            .single();

        if (!member) {
            throw new NotFoundException('Member not found in this account');
        }

        const { error } = await supabase
            .from('account_users')
            .delete()
            .eq('account_id', accountId)
            .eq('user_id', memberId);

        if (error) {
            throw new InternalServerErrorException(error.message);
        }

        return { success: true };
    }

    async acceptInvitation(accountId: string, invitationId: string, userId: string, accessToken?: string) {
        const supabase = this.supabaseService.getClient(accessToken);

        // Fetch invitation
        const { data: invitation, error: invError } = await supabase
            .from('invitations')
            .select('*')
            .eq('id', invitationId)
            .eq('account_id', accountId)
            .single();

        if (invError || !invitation) {
            throw new NotFoundException('Invitation not found');
        }

        // Verify the invitation belongs to the current user (by email)
        const { data: authUser } = await supabase.auth.getUser();
        if (!authUser?.user?.email || authUser.user.email !== invitation.email) {
            throw new ForbiddenException('This invitation is not for your email address');
        }

        // Check if already a member
        const { data: existingMember } = await supabase
            .from('account_users')
            .select('id')
            .eq('account_id', accountId)
            .eq('user_id', userId)
            .single();

        if (existingMember) {
            // Already a member, just delete the invitation
            await supabase.from('invitations').delete().eq('id', invitationId);
            return { success: true, message: 'Already a member' };
        }

        // Add user to account
        const { error: addError } = await supabase
            .from('account_users')
            .insert({
                account_id: accountId,
                user_id: userId,
                role: invitation.role || 'member',
            });

        if (addError) {
            throw new InternalServerErrorException(addError.message);
        }

        // Delete the invitation
        await supabase.from('invitations').delete().eq('id', invitationId);

        return { success: true };
    }

    async deleteInvitation(invitationId: string, userId: string, accessToken?: string) {
        const supabase = this.supabaseService.getClient(accessToken);

        // We need to find the account_id of the invitation to verify access
        const { data: invitation } = await supabase
            .from('invitations')
            .select('account_id')
            .eq('id', invitationId)
            .single();

        if (!invitation) {
            throw new NotFoundException('Invitation not found');
        }

        // Verify user is owner/admin of the account
        await this.accessControlHelper.verifyAccountAccess(supabase, invitation.account_id, userId, ['owner', 'admin']);

        const { error } = await supabase
            .from('invitations')
            .delete()
            .eq('id', invitationId);

        if (error) {
            throw new InternalServerErrorException(error.message);
        }

        return { success: true };
    }
}
