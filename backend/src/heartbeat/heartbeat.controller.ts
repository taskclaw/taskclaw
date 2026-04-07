import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { AuthGuard } from '../common/guards/auth.guard';
import { HeartbeatService } from './heartbeat.service';
import { ExecutionLogService } from './execution-log.service';
import { CreateHeartbeatDto } from './dto/create-heartbeat.dto';
import { UpdateHeartbeatDto } from './dto/update-heartbeat.dto';

@ApiTags('Heartbeat')
@Controller('accounts/:accountId/heartbeat')
@UseGuards(AuthGuard)
export class HeartbeatController {
  constructor(
    private readonly heartbeatService: HeartbeatService,
    private readonly executionLog: ExecutionLogService,
  ) {}

  @Get('configs')
  @ApiOperation({ summary: 'List heartbeat configs' })
  findAll(@Param('accountId') accountId: string) {
    return this.heartbeatService.findAll(accountId);
  }

  @Post('configs')
  @ApiOperation({ summary: 'Create a heartbeat config' })
  @HttpCode(HttpStatus.CREATED)
  create(
    @Param('accountId') accountId: string,
    @Body() dto: CreateHeartbeatDto,
  ) {
    return this.heartbeatService.create(accountId, dto);
  }

  @Get('configs/:id')
  @ApiOperation({ summary: 'Get a heartbeat config' })
  findOne(@Param('id') id: string) {
    return this.heartbeatService.findOne(id);
  }

  @Patch('configs/:id')
  @ApiOperation({ summary: 'Update a heartbeat config' })
  update(@Param('id') id: string, @Body() dto: UpdateHeartbeatDto) {
    return this.heartbeatService.update(id, dto);
  }

  @Delete('configs/:id')
  @ApiOperation({ summary: 'Delete a heartbeat config' })
  @HttpCode(HttpStatus.NO_CONTENT)
  delete(@Param('id') id: string) {
    return this.heartbeatService.delete(id);
  }

  @Post('configs/:id/toggle')
  @ApiOperation({ summary: 'Toggle heartbeat config active state' })
  toggle(@Param('id') id: string, @Body() body: { is_active: boolean }) {
    return this.heartbeatService.toggle(id, body.is_active);
  }

  @Post('configs/:id/trigger')
  @ApiOperation({ summary: 'Manually trigger a heartbeat' })
  trigger(@Param('id') id: string) {
    return this.heartbeatService.trigger(id);
  }

  @Get('execution-log')
  @ApiOperation({ summary: 'List execution logs' })
  getExecutionLog(
    @Param('accountId') accountId: string,
    @Query('trigger_type') triggerType?: string,
    @Query('status') status?: string,
    @Query('pod_id') podId?: string,
    @Query('board_id') boardId?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    return this.executionLog.findAll(accountId, {
      trigger_type: triggerType,
      status,
      pod_id: podId,
      board_id: boardId,
      limit: limit ? parseInt(limit, 10) : undefined,
      offset: offset ? parseInt(offset, 10) : undefined,
    });
  }
}
