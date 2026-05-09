import { Controller, Get, Param, ParseUUIDPipe, Query, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { AuthGuard } from '../common/guards/auth.guard';
import { InboxService } from './inbox.service';

@ApiTags('Inbox')
@Controller('accounts/:accountId/inbox')
@UseGuards(AuthGuard)
export class InboxController {
  constructor(private readonly inbox: InboxService) {}

  @Get()
  list(
    @Param('accountId', new ParseUUIDPipe()) accountId: string,
    @Query('limit') limit?: string,
  ) {
    const n = limit ? Math.max(1, Math.min(500, Number(limit))) : 100;
    return this.inbox.getInbox(accountId, n);
  }

  @Get('count')
  count(@Param('accountId', new ParseUUIDPipe()) accountId: string) {
    return this.inbox.getCount(accountId).then((n) => ({ count: n }));
  }
}
