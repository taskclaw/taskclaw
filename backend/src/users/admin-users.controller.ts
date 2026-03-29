import {
  Controller,
  Get,
  Param,
  Query,
  Put,
  Body,
  Delete,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '../common/guards/auth.guard';
import { AdminGuard } from '../common/guards/admin.guard';
import { UsersService } from './users.service';

@Controller('admin/users')
@UseGuards(AuthGuard, AdminGuard)
export class AdminUsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  async findAll(
    @Query('page') page: number = 1,
    @Query('limit') limit: number = 10,
    @Query('search') search?: string,
    @Query('status') status?: string,
  ) {
    return this.usersService.findAllUsers(
      Number(page),
      Number(limit),
      search,
      status,
    );
  }

  @Get(':id')
  async findOne(@Param('id') id: string) {
    return this.usersService.getUserDetailsAdmin(id);
  }

  @Put(':id/role')
  async updateRole(@Param('id') id: string, @Body('role') role: string) {
    return this.usersService.updateUserRole(id, role);
  }

  @Put(':id/status')
  async updateStatus(@Param('id') id: string, @Body('status') status: string) {
    return this.usersService.updateUserStatus(id, status);
  }

  @Delete(':id')
  async remove(@Param('id') id: string) {
    return this.usersService.deleteUser(id);
  }
}
