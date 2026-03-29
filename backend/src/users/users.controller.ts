import {
  Controller,
  Get,
  Patch,
  Body,
  Request,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { UsersService } from './users.service';
import { AuthGuard } from '../common/guards/auth.guard';

@ApiTags('Users')
@Controller('users')
@UseGuards(AuthGuard)
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get('me')
  @ApiOperation({ summary: 'Get current user profile' })
  getProfile(@Request() req) {
    const token = req.headers.authorization?.split(' ')[1];
    return this.usersService.getProfile(req.user.id, token);
  }

  @Get('me/preferences')
  @ApiOperation({ summary: 'Get current user preferences' })
  getPreferences(@Request() req) {
    const token = req.headers.authorization?.split(' ')[1];
    return this.usersService.getPreferences(req.user.id, token);
  }

  @Patch('me/preferences')
  @ApiOperation({ summary: 'Update current user preferences' })
  updatePreferences(
    @Request() req,
    @Body()
    body: {
      theme?: string;
      locale?: string;
      notifications_email?: boolean;
      notifications_push?: boolean;
      notifications_in_app?: boolean;
    },
  ) {
    const token = req.headers.authorization?.split(' ')[1];
    return this.usersService.updatePreferences(req.user.id, body, token);
  }
}
