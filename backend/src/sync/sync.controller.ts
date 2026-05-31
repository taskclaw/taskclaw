import { Controller, Post, Get, Param, UseGuards, Req } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { SyncService } from './sync.service';
import { AuthGuard } from '../common/guards/auth.guard';
import { AccessControlHelper } from '../common/helpers/access-control.helper';

@ApiTags('Sync')
@Controller('accounts/:accountId/sync')
@UseGuards(AuthGuard)
export class SyncController {
  constructor(
    private readonly syncService: SyncService,
    private readonly accessControl: AccessControlHelper,
  ) {}

  /**
   * Manually trigger sync for a specific source
   */
  @Post('sources/:sourceId')
  async syncSource(
    @Req() req,
    @Param('accountId') accountId: string,
    @Param('sourceId') sourceId: string,
  ): Promise<any> {
    await this.accessControl.verifyAccountAccess(null, accountId, req.user.id);
    return this.syncService.syncSource(sourceId);
  }

  /**
   * Get sync status for all sources in the account
   */
  @Get('status')
  async getSyncStatus(@Req() req, @Param('accountId') accountId: string) {
    await this.accessControl.verifyAccountAccess(null, accountId, req.user.id);
    return this.syncService.getSyncStatus(req.user.id, accountId);
  }
}
