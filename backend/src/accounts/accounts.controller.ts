import { Body, Controller, Get, Param, Patch, Post, Put, Request, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { AccountsService } from './accounts.service';
import { AuthGuard } from '../common/guards/auth.guard';

@ApiTags('Accounts')
@Controller('accounts')
@UseGuards(AuthGuard)
export class AccountsController {
    constructor(private readonly accountsService: AccountsService) { }

    @Get()
    getUserAccounts(@Request() req) {
        const token = req.headers.authorization?.split(' ')[1];
        return this.accountsService.getUserAccounts(req.user.id, token);
    }

    @Post()
    createAccount(@Body('name') name: string, @Request() req) {
        const token = req.headers.authorization?.split(' ')[1];
        return this.accountsService.createAccount(req.user.id, name, token);
    }

    @Put(':id')
    updateAccount(@Param('id') id: string, @Body('name') name: string, @Request() req) {
        const token = req.headers.authorization?.split(' ')[1];
        return this.accountsService.updateAccount(id, name, req.user.id, token);
    }

    @Patch(':id')
    patchAccount(
        @Param('id') id: string,
        @Body() body: { name?: string; onboarding_completed?: boolean },
        @Request() req,
    ) {
        const token = req.headers.authorization?.split(' ')[1];
        return this.accountsService.patchAccount(id, body, req.user.id, token);
    }
}
