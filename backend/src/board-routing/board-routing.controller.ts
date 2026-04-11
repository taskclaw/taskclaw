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
  Req,
} from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import type { Request } from 'express';
import { AuthGuard } from '../common/guards/auth.guard';
import { BoardRoutingService } from './board-routing.service';
import { CoordinatorService } from './coordinator.service';
import { DagApprovalService } from './dag-approval.service';
import { CreateBoardRouteDto } from './dto/create-board-route.dto';
import { UpdateBoardRouteDto } from './dto/update-board-route.dto';
import { SupabaseAdminService } from '../supabase/supabase-admin.service';

@ApiTags('Board Routing')
@Controller('accounts/:accountId/board-routing')
@UseGuards(AuthGuard)
export class BoardRoutingController {
  constructor(
    private readonly routingService: BoardRoutingService,
    private readonly coordinatorService: CoordinatorService,
    private readonly dagApprovalService: DagApprovalService,
    private readonly supabaseAdmin: SupabaseAdminService,
  ) {}

  @Get('routes')
  @ApiOperation({ summary: 'List board routes (optionally filtered by pod_id)' })
  findAllRoutes(
    @Param('accountId') accountId: string,
    @Query('pod_id') podId?: string,
  ) {
    return this.routingService.findAllRoutes(accountId, podId);
  }

  @Post('routes')
  @ApiOperation({ summary: 'Create a board route' })
  @HttpCode(HttpStatus.CREATED)
  createRoute(
    @Param('accountId') accountId: string,
    @Body() dto: CreateBoardRouteDto,
  ) {
    return this.routingService.createRoute(accountId, dto);
  }

  @Get('routes/board/:boardId/manual')
  @ApiOperation({ summary: 'List manual + ai_decision routes for a board (for Send-to-Board UI)' })
  findManualRoutes(
    @Param('accountId') accountId: string,
    @Param('boardId') boardId: string,
  ) {
    return this.routingService.findManualRoutesForBoard(accountId, boardId);
  }

  @Get('routes/:routeId')
  @ApiOperation({ summary: 'Get a board route' })
  findRoute(
    @Param('accountId') accountId: string,
    @Param('routeId') routeId: string,
  ) {
    return this.routingService.findRoute(accountId, routeId);
  }

  @Patch('routes/:routeId')
  @ApiOperation({ summary: 'Update a board route' })
  updateRoute(
    @Param('accountId') accountId: string,
    @Param('routeId') routeId: string,
    @Body() dto: UpdateBoardRouteDto,
  ) {
    return this.routingService.updateRoute(accountId, routeId, dto);
  }

  @Delete('routes/:routeId')
  @ApiOperation({ summary: 'Delete a board route' })
  @HttpCode(HttpStatus.NO_CONTENT)
  deleteRoute(
    @Param('accountId') accountId: string,
    @Param('routeId') routeId: string,
  ) {
    return this.routingService.deleteRoute(accountId, routeId);
  }

  /**
   * Manual route trigger: human or frontend explicitly sends a task through a route.
   * Works for trigger='manual', 'ai_decision', or any trigger type.
   */
  @Post('routes/:routeId/trigger')
  @ApiOperation({ summary: 'Manually trigger a board route for a specific task' })
  @HttpCode(HttpStatus.OK)
  triggerRoute(
    @Param('accountId') accountId: string,
    @Param('routeId') routeId: string,
    @Body() body: { task_id: string },
  ) {
    return this.routingService.triggerRoute(body.task_id, routeId);
  }

  @Post('decompose-goal')
  @ApiOperation({ summary: 'Decompose a high-level goal into tasks via AI' })
  async decomposeGoal(
    @Param('accountId') accountId: string,
    @Body() body: { goal: string; pod_id?: string; conversation_id?: string },
  ) {
    return this.coordinatorService.decomposeGoal({
      accountId,
      podId: body.pod_id,
      goal: body.goal,
      conversationId: body.conversation_id,
    });
  }

  @Get('dags')
  @ApiOperation({ summary: 'List task DAGs' })
  async getDags(
    @Param('accountId') accountId: string,
    @Query('status') status?: string,
    @Query('pod_id') podId?: string,
  ) {
    const client = this.supabaseAdmin.getClient();
    let query = client
      .from('task_dags')
      .select('*, tasks(id, title, status, completed)')
      .eq('account_id', accountId)
      .order('created_at', { ascending: false });

    if (status) {
      query = query.eq('status', status);
    }
    if (podId) {
      query = query.eq('pod_id', podId);
    }

    const { data, error } = await query;
    if (error) {
      throw new Error(`Failed to fetch DAGs: ${error.message}`);
    }

    return data;
  }

  @Get('dags/:dagId')
  @ApiOperation({ summary: 'Get a task DAG with tasks and dependencies' })
  async getDag(
    @Param('accountId') accountId: string,
    @Param('dagId') dagId: string,
  ) {
    const client = this.supabaseAdmin.getClient();

    const { data: dag, error: dagError } = await client
      .from('task_dags')
      .select('*')
      .eq('id', dagId)
      .eq('account_id', accountId)
      .single();

    if (dagError || !dag) {
      throw new Error(`DAG ${dagId} not found`);
    }

    const { data: tasks } = await client
      .from('tasks')
      .select('*')
      .eq('dag_id', dagId);

    const { data: deps } = await client
      .from('task_dependencies')
      .select('*')
      .eq('dag_id', dagId);

    return { ...dag, tasks: tasks ?? [], dependencies: deps ?? [] };
  }

  // ─── DAG Approval Endpoints (BE11) ──────────────────────────────────────

  @Get('dags/:dagId/approval')
  @ApiOperation({ summary: 'Get the approval record for a DAG' })
  getDagApproval(
    @Param('accountId') accountId: string,
    @Param('dagId') dagId: string,
  ) {
    return this.dagApprovalService.getApproval(dagId);
  }

  @Post('dags/:dagId/approve')
  @ApiOperation({ summary: 'Approve a pending DAG and start execution' })
  @HttpCode(HttpStatus.OK)
  approveDag(
    @Param('accountId') accountId: string,
    @Param('dagId') dagId: string,
    @Body() body: { notes?: string },
    @Req() req: Request,
  ) {
    const userId = (req as any)['user']?.id ?? 'system';
    return this.dagApprovalService.approve(dagId, userId, body.notes);
  }

  @Post('dags/:dagId/reject')
  @ApiOperation({ summary: 'Reject a pending DAG' })
  @HttpCode(HttpStatus.OK)
  rejectDag(
    @Param('accountId') accountId: string,
    @Param('dagId') dagId: string,
    @Body() body: { notes?: string },
    @Req() req: Request,
  ) {
    const userId = (req as any)['user']?.id ?? 'system';
    return this.dagApprovalService.reject(dagId, userId, body.notes);
  }
}
