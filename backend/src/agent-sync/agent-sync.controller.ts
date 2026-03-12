import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  UseGuards,
  Request,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { AgentSyncService } from './agent-sync.service';
import { AuthGuard } from '../common/guards/auth.guard';

@Controller('accounts/:accountId/agent-sync')
@UseGuards(AuthGuard)
export class AgentSyncController {
  constructor(private readonly agentSyncService: AgentSyncService) {}

  /**
   * Get sync status dashboard data for all categories.
   */
  @Get('status')
  getStatus(@Param('accountId') accountId: string) {
    return this.agentSyncService.getStatus(accountId);
  }

  /**
   * Check plugin health / connectivity.
   */
  @Get('health')
  checkHealth(@Param('accountId') accountId: string) {
    return this.agentSyncService.checkHealth(accountId);
  }

  /**
   * Trigger sync for all categories in the account.
   */
  @Post('sync')
  @HttpCode(HttpStatus.OK)
  syncAll(@Param('accountId') accountId: string) {
    return this.agentSyncService.syncAllForAccount(accountId);
  }

  /**
   * Trigger sync for a specific category.
   */
  @Post('sync/:categoryId')
  @HttpCode(HttpStatus.OK)
  syncCategory(
    @Param('accountId') accountId: string,
    @Param('categoryId') categoryId: string,
  ) {
    return this.agentSyncService.syncCategory(accountId, categoryId);
  }

  /**
   * Preview what the compiled SKILL.md would look like for a category.
   */
  @Get(':categoryId/preview')
  preview(
    @Param('accountId') accountId: string,
    @Param('categoryId') categoryId: string,
  ) {
    return this.agentSyncService.previewInstructions(accountId, categoryId);
  }

  /**
   * Delete a provider agent for a category (remove skill from server).
   */
  @Delete(':categoryId')
  @HttpCode(HttpStatus.OK)
  deleteAgent(
    @Param('accountId') accountId: string,
    @Param('categoryId') categoryId: string,
  ) {
    return this.agentSyncService.deleteAgent(accountId, categoryId);
  }
}
