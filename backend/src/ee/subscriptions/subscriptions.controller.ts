import { Controller, Get, Param, Request, UseGuards } from '@nestjs/common';
import { SubscriptionsService } from './subscriptions.service';
import { AuthGuard } from '../../common/guards/auth.guard';

@Controller('accounts/:accountId/subscription')
export class SubscriptionsController {
  constructor(private readonly subscriptionsService: SubscriptionsService) {}

  @Get()
  @UseGuards(AuthGuard)
  async getSubscription(@Param('accountId') accountId: string, @Request() req) {
    const token = req.headers.authorization?.split(' ')[1];
    return this.subscriptionsService.getSubscription(
      accountId,
      req.user.id,
      token,
    );
  }
}
