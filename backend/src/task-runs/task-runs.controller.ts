import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { AuthGuard } from '../common/guards/auth.guard';
import { TaskRunsService } from './task-runs.service';

@ApiTags('Task Runs')
@Controller('accounts/:accountId/task-runs')
@UseGuards(AuthGuard)
export class TaskRunsController {
  constructor(private readonly runs: TaskRunsService) {}

  @Get()
  list(
    @Param('accountId', new ParseUUIDPipe()) accountId: string,
    @Query('pod_id') podId?: string,
    @Query('task_id') taskId?: string,
    @Query('limit') limit?: string,
  ) {
    const lim = limit ? Math.max(1, Math.min(200, Number(limit))) : 50;
    if (podId) return this.runs.listForPod(accountId, podId, lim);
    if (taskId) return this.runs.listForTask(accountId, taskId, lim);
    return this.runs.listForAccount(accountId, lim);
  }

  @Get('failures')
  failureBreakdown(
    @Param('accountId', new ParseUUIDPipe()) accountId: string,
    @Query('days') days?: string,
  ) {
    const n = days ? Math.max(1, Math.min(90, Number(days))) : 7;
    return this.runs.failureBreakdown(accountId, n);
  }
}
