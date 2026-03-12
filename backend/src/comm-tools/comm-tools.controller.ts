import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Body,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { CommToolsService } from './comm-tools.service';
import { ToggleCommToolDto } from './dto/toggle-comm-tool.dto';
import { UpdateCommToolDto } from './dto/update-comm-tool.dto';
import { AuthGuard } from '../common/guards/auth.guard';

@Controller('accounts/:accountId/comm-tools')
@UseGuards(AuthGuard)
export class CommToolsController {
  constructor(private readonly commToolsService: CommToolsService) {}

  /**
   * Get statuses for all 3 communication tools.
   */
  @Get()
  getAll(@Param('accountId') accountId: string) {
    return this.commToolsService.getAll(accountId);
  }

  /**
   * Toggle a communication tool ON or OFF.
   * ON: verifies OpenClaw gateway is reachable, saves declaration to DB.
   * OFF: updates DB.
   */
  @Post('toggle')
  @HttpCode(HttpStatus.OK)
  toggle(
    @Param('accountId') accountId: string,
    @Body() dto: ToggleCommToolDto,
  ) {
    return this.commToolsService.toggle(accountId, dto.tool_type, dto.is_enabled);
  }

  /**
   * Update check interval or config for a specific tool.
   */
  @Patch(':toolType')
  update(
    @Param('accountId') accountId: string,
    @Param('toolType') toolType: string,
    @Body() dto: UpdateCommToolDto,
  ) {
    return this.commToolsService.updateConfig(accountId, toolType, dto);
  }

  /**
   * Trigger an immediate health check for a specific tool.
   */
  @Post(':toolType/check')
  @HttpCode(HttpStatus.OK)
  checkNow(
    @Param('accountId') accountId: string,
    @Param('toolType') toolType: string,
  ) {
    return this.commToolsService.checkToolHealth(accountId, toolType);
  }

  /**
   * Get list of enabled + healthy tool types (lightweight, for prompt building).
   */
  @Get('available')
  getAvailable(@Param('accountId') accountId: string) {
    return this.commToolsService.getAvailableTools(accountId);
  }
}
