import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { AuthGuard } from '../common/guards/auth.guard';
import { AdminGuard } from '../common/guards/admin.guard';
import { AccountsService } from './accounts.service';

@ApiTags('Admin')
@Controller('admin/accounts')
@UseGuards(AuthGuard, AdminGuard)
export class AdminAccountsController {
    constructor(private readonly accountsService: AccountsService) { }

    @Get()
    async findAll(
        @Query('page') page: number = 1,
        @Query('limit') limit: number = 10,
        @Query('search') search?: string,
    ) {
        return this.accountsService.findAllAccounts(Number(page), Number(limit), search);
    }
}
