import { Injectable, Logger, NotFoundException, Inject } from '@nestjs/common';
import { and, desc, eq } from 'drizzle-orm';
import { DB, type Db } from '../db';
import {
  boardRoutes,
  tasks,
  boardSteps,
  taskDependencies,
} from '../db/schema';
import { CreateBoardRouteDto } from './dto/create-board-route.dto';
import { UpdateBoardRouteDto } from './dto/update-board-route.dto';

/**
 * Maps the snake_case task column names that may appear in a route's
 * `transform_config.field_mapping` to the camelCase keys Drizzle uses on the
 * fetched row / insert payload. PostgREST exposed columns as snake_case, so the
 * stored field_mapping configs reference snake_case names — translate them here
 * to preserve the original transform behavior unchanged.
 */
const TASK_FIELD_MAP: Record<string, string> = {
  account_id: 'accountId',
  category_id: 'categoryId',
  source_id: 'sourceId',
  external_id: 'externalId',
  title: 'title',
  status: 'status',
  priority: 'priority',
  completed: 'completed',
  notes: 'notes',
  metadata: 'metadata',
  external_url: 'externalUrl',
  due_date: 'dueDate',
  completed_at: 'completedAt',
  last_synced_at: 'lastSyncedAt',
  board_instance_id: 'boardInstanceId',
  current_step_id: 'currentStepId',
  card_data: 'cardData',
  step_history: 'stepHistory',
  override_category_id: 'overrideCategoryId',
  result: 'result',
  dag_id: 'dagId',
  backbone_connection_id: 'backboneConnectionId',
  assignee_type: 'assigneeType',
  assignee_id: 'assigneeId',
  creator_type: 'creatorType',
  creator_id: 'creatorId',
  input_context: 'inputContext',
};

@Injectable()
export class BoardRoutingService {
  private readonly logger = new Logger(BoardRoutingService.name);

  constructor(@Inject(DB) private readonly db: Db) {}

  async createRoute(accountId: string, dto: CreateBoardRouteDto) {
    const [data] = await this.db
      .insert(boardRoutes)
      .values({
        accountId,
        sourceBoardId: dto.source_board_id,
        sourceStepId: dto.source_step_id ?? null,
        targetBoardId: dto.target_board_id,
        targetStepId: dto.target_step_id ?? null,
        trigger: dto.trigger ?? 'auto',
        transformConfig: dto.transform_config ?? {},
        isActive: dto.is_active ?? true,
      })
      .returning();

    return data;
  }

  async findAllRoutes(accountId: string) {
    const data = await this.db
      .select()
      .from(boardRoutes)
      .where(eq(boardRoutes.accountId, accountId))
      .orderBy(desc(boardRoutes.createdAt));

    return data;
  }

  async findRoute(accountId: string, routeId: string) {
    const [data] = await this.db
      .select()
      .from(boardRoutes)
      .where(
        and(
          eq(boardRoutes.id, routeId),
          eq(boardRoutes.accountId, accountId),
        ),
      )
      .limit(1);

    if (!data) {
      throw new NotFoundException(`Board route ${routeId} not found`);
    }

    return data;
  }

  async updateRoute(
    accountId: string,
    routeId: string,
    dto: UpdateBoardRouteDto,
  ) {
    // Verify exists
    await this.findRoute(accountId, routeId);

    const [data] = await this.db
      .update(boardRoutes)
      .set(this.toRoutePatch(dto))
      .where(
        and(
          eq(boardRoutes.id, routeId),
          eq(boardRoutes.accountId, accountId),
        ),
      )
      .returning();

    return data;
  }

  async deleteRoute(accountId: string, routeId: string) {
    // Verify exists
    await this.findRoute(accountId, routeId);

    await this.db
      .delete(boardRoutes)
      .where(
        and(
          eq(boardRoutes.id, routeId),
          eq(boardRoutes.accountId, accountId),
        ),
      );

    return { message: 'Board route deleted successfully' };
  }

  async triggerRoute(taskId: string, routeId: string) {
    // Fetch the route
    const [route] = await this.db
      .select()
      .from(boardRoutes)
      .where(eq(boardRoutes.id, routeId))
      .limit(1);

    if (!route) {
      throw new NotFoundException(`Board route ${routeId} not found`);
    }

    // Fetch the source task
    const [task] = await this.db
      .select()
      .from(tasks)
      .where(eq(tasks.id, taskId))
      .limit(1);

    if (!task) {
      throw new NotFoundException(`Task ${taskId} not found`);
    }

    // Apply transform_config (field mapping)
    const transformConfig =
      (route.transformConfig as Record<string, any>) || {};
    const newTaskData: typeof tasks.$inferInsert = {
      accountId: task.accountId,
      title: task.title,
      notes: task.notes || '',
      priority: task.priority || 'Medium',
      boardInstanceId: route.targetBoardId,
      currentStepId: route.targetStepId || null,
      status: 'To-Do',
      cardData: (task.cardData as Record<string, any>) || {},
    };

    // Apply field transforms if configured
    if (transformConfig.field_mapping) {
      for (const [targetField, sourceField] of Object.entries(
        transformConfig.field_mapping as Record<string, string>,
      )) {
        const targetKey = TASK_FIELD_MAP[targetField];
        const sourceKey = TASK_FIELD_MAP[sourceField];
        const taskRow = task as Record<string, any>;
        if (targetKey && sourceKey && taskRow[sourceKey] !== undefined) {
          (newTaskData as Record<string, any>)[targetKey] = taskRow[sourceKey];
        }
      }
    }

    // If target_step_id provided, resolve status from step name
    if (route.targetStepId) {
      const [step] = await this.db
        .select({ name: boardSteps.name })
        .from(boardSteps)
        .where(eq(boardSteps.id, route.targetStepId))
        .limit(1);
      if (step) {
        newTaskData.status = step.name;
      }
    }

    // Create the new task in the target board
    const inserted = await this.db
      .insert(tasks)
      .values(newTaskData)
      .returning();
    const newTask = inserted[0];

    // Create a dependency record linking source -> target
    await this.db.insert(taskDependencies).values({
      sourceTaskId: taskId,
      targetTaskId: newTask.id,
      dependencyType: 'route',
      routeId: routeId,
    });

    this.logger.log(
      `Route ${routeId}: transferred task ${taskId} -> ${newTask.id} to board ${route.targetBoardId}`,
    );

    return newTask;
  }

  /**
   * Map the snake_case UpdateBoardRouteDto to the camelCase board_routes
   * columns (only defined fields), mirroring the partial update PostgREST
   * performed when passed the DTO directly.
   */
  private toRoutePatch(
    dto: UpdateBoardRouteDto,
  ): Partial<typeof boardRoutes.$inferInsert> {
    const patch: Partial<typeof boardRoutes.$inferInsert> = {};
    if (dto.source_board_id !== undefined)
      patch.sourceBoardId = dto.source_board_id;
    if (dto.source_step_id !== undefined)
      patch.sourceStepId = dto.source_step_id;
    if (dto.target_board_id !== undefined)
      patch.targetBoardId = dto.target_board_id;
    if (dto.target_step_id !== undefined)
      patch.targetStepId = dto.target_step_id;
    if (dto.trigger !== undefined) patch.trigger = dto.trigger;
    if (dto.transform_config !== undefined)
      patch.transformConfig = dto.transform_config;
    if (dto.is_active !== undefined) patch.isActive = dto.is_active;
    return patch;
  }
}
