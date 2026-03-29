import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  Body,
  Req,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { ApiKeysService } from './api-keys.service';
import { AuthGuard } from '../../common/guards/auth.guard';

@ApiTags('API Keys')
@Controller('accounts/:accountId/api-keys')
@UseGuards(AuthGuard)
export class ApiKeysController {
  constructor(private readonly apiKeysService: ApiKeysService) {}

  @Get()
  @ApiOperation({ summary: 'List API keys (masked)' })
  findAll(@Req() req, @Param('accountId') accountId: string) {
    return this.apiKeysService.findAll(accountId);
  }

  @Post()
  @ApiOperation({ summary: 'Create API key (returns full key once)' })
  @HttpCode(HttpStatus.CREATED)
  create(
    @Req() req,
    @Param('accountId') accountId: string,
    @Body() body: { name: string; scopes?: string[]; expires_at?: string },
  ) {
    return this.apiKeysService.create(
      accountId,
      req.user.id,
      body.name,
      body.scopes,
      body.expires_at,
    );
  }

  @Delete(':keyId')
  @ApiOperation({ summary: 'Revoke an API key' })
  @HttpCode(HttpStatus.OK)
  remove(
    @Req() req,
    @Param('accountId') accountId: string,
    @Param('keyId') keyId: string,
  ) {
    return this.apiKeysService.remove(accountId, keyId);
  }
}
