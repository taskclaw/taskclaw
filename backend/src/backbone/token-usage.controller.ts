import { Controller, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Post, Query, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { AuthGuard } from '../common/guards/auth.guard';
import { TokenUsageService } from './token-usage.service';

@ApiTags('Token Usage')
@Controller('accounts/:accountId/token-usage')
@UseGuards(AuthGuard)
export class TokenUsageController {
  constructor(private readonly usage: TokenUsageService) {}

  @Get('summary')
  summary(
    @Param('accountId', new ParseUUIDPipe()) accountId: string,
    @Query('days') days?: string,
  ) {
    const n = days ? Math.max(1, Math.min(180, Number(days))) : 30;
    return this.usage.getDashboardSummary(accountId, n);
  }

  // Manual trigger — useful right after a fresh deploy or in tests, before
  // the hourly cron has had a chance to populate token_usage_daily.
  @Post('rollup')
  @HttpCode(HttpStatus.OK)
  rollup() {
    return this.usage.runRollup();
  }
}
