import { Body, Controller, Delete, Get, Param, Post, UseGuards, Request, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { TeamsService } from './teams.service';
import { AuthGuard } from '../common/guards/auth.guard';

@ApiTags('Teams')
@Controller('accounts/:accountId')
@UseGuards(AuthGuard)
export class TeamsController {
    constructor(private readonly teamsService: TeamsService) { }

    @Get('members')
    @ApiOperation({ summary: 'List account members' })
    getAccountMembers(@Param('accountId') accountId: string, @Request() req) {
        const token = req.headers.authorization?.split(' ')[1];
        return this.teamsService.getAccountMembers(accountId, req.user.id, token);
    }

    @Delete('members/:memberId')
    @ApiOperation({ summary: 'Remove a member from the account' })
    @HttpCode(HttpStatus.OK)
    removeMember(
        @Param('accountId') accountId: string,
        @Param('memberId') memberId: string,
        @Request() req,
    ) {
        const token = req.headers.authorization?.split(' ')[1];
        return this.teamsService.removeMember(accountId, memberId, req.user.id, token);
    }

    @Get('invitations')
    @ApiOperation({ summary: 'List account invitations' })
    getAccountInvitations(@Param('accountId') accountId: string, @Request() req) {
        const token = req.headers.authorization?.split(' ')[1];
        return this.teamsService.getAccountInvitations(accountId, req.user.id, token);
    }

    @Post('invitations')
    @ApiOperation({ summary: 'Invite a user to the account' })
    inviteUser(
        @Param('accountId') accountId: string,
        @Body('email') email: string,
        @Body('role') role: string,
        @Request() req,
    ) {
        const token = req.headers.authorization?.split(' ')[1];
        return this.teamsService.inviteUser(accountId, email, role, req.user.id, token);
    }

    @Post('invitations/:invitationId/accept')
    @ApiOperation({ summary: 'Accept an invitation to join the account' })
    acceptInvitation(
        @Param('accountId') accountId: string,
        @Param('invitationId') invitationId: string,
        @Request() req,
    ) {
        const token = req.headers.authorization?.split(' ')[1];
        return this.teamsService.acceptInvitation(accountId, invitationId, req.user.id, token);
    }

    @Delete('invitations/:invitationId')
    @ApiOperation({ summary: 'Delete an invitation' })
    deleteInvitation(@Param('invitationId') invitationId: string, @Request() req) {
        const token = req.headers.authorization?.split(' ')[1];
        return this.teamsService.deleteInvitation(invitationId, req.user.id, token);
    }
}
