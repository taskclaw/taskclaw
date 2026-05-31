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
  Inject,
} from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { AuthGuard } from '../common/guards/auth.guard';
import { BoardRoutingService } from './board-routing.service';
import { CoordinatorService } from './coordinator.service';
import { CreateBoardRouteDto } from './dto/create-board-route.dto';
import { UpdateBoardRouteDto } from './dto/update-board-route.dto';
import { and, desc, eq } from 'drizzle-orm';
import { DB, type Db } from '../db';
import { taskDags, tasks, taskDependencies } from '../db/schema';

@ApiTags('Board Routing')
@Controller('accounts/:accountId/board-routing')
@UseGuards(AuthGuard)
export class BoardRoutingController {
  constructor(
    private readonly routingService: BoardRoutingService,
    private readonly coordinatorService: CoordinatorService,
    @Inject(DB) private readonly db: Db,
  ) {}

  @Get('routes')
  @ApiOperation({ summary: 'List board routes' })
  findAllRoutes(@Param('accountId') accountId: string) {
    return this.routingService.findAllRoutes(accountId);
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
  ) {
    const where = status
      ? and(eq(taskDags.accountId, accountId), eq(taskDags.status, status))
      : eq(taskDags.accountId, accountId);

    return this.db.query.taskDags.findMany({
      where,
      orderBy: desc(taskDags.createdAt),
      with: {
        tasks: {
          columns: { id: true, title: true, status: true, completed: true },
        },
      },
    });
  }

  @Get('dags/:dagId')
  @ApiOperation({ summary: 'Get a task DAG with tasks and dependencies' })
  async getDag(
    @Param('accountId') accountId: string,
    @Param('dagId') dagId: string,
  ) {
    const [dag] = await this.db
      .select()
      .from(taskDags)
      .where(and(eq(taskDags.id, dagId), eq(taskDags.accountId, accountId)))
      .limit(1);

    if (!dag) {
      throw new Error(`DAG ${dagId} not found`);
    }

    const dagTasks = await this.db
      .select()
      .from(tasks)
      .where(eq(tasks.dagId, dagId));

    const deps = await this.db
      .select()
      .from(taskDependencies)
      .where(eq(taskDependencies.dagId, dagId));

    return { ...dag, tasks: dagTasks, dependencies: deps };
  }
}
