import {
  Injectable,
  Inject,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { and, asc, desc, eq, ne } from 'drizzle-orm';
import { DB, type Db } from '../db';
import { boardSteps, boardInstances, tasks } from '../db/schema';
import { AccessControlHelper } from '../common/helpers/access-control.helper';
import { CreateBoardStepDto } from './dto/create-board-step.dto';
import { UpdateBoardStepDto } from './dto/update-board-step.dto';
import { snakeKeys } from '../common/utils/snake-keys.util';

@Injectable()
export class BoardStepsService {
  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly accessControl: AccessControlHelper,
  ) {}

  /**
   * Drizzle's relational query returns joined rows under the relation name
   * (`category`, `agent`); PostgREST returned them under the aliases used in the
   * embedded select (`linked_category`, `default_agent`). Re-key so the response
   * shape callers depend on is unchanged.
   */
  private present(row: any) {
    const { category, agent, ...rest } = row;
    return {
      ...snakeKeys(rest),
      linked_category: category ?? null,
      default_agent: agent ?? null,
    };
  }

  async findAll(userId: string, accountId: string, boardId: string) {
    await this.accessControl.verifyAccountAccess(null, accountId, userId);

    // Verify board belongs to account
    await this.verifyBoardAccess(accountId, boardId);

    const rows = await this.db.query.boardSteps.findMany({
      where: eq(boardSteps.boardInstanceId, boardId),
      orderBy: asc(boardSteps.position),
      with: {
        category: { columns: { id: true, name: true, color: true, icon: true } },
        agent: {
          columns: {
            id: true,
            name: true,
            color: true,
            avatarUrl: true,
            status: true,
          },
        },
      },
    });

    return rows.map((r) => this.present(r));
  }

  async findOne(
    userId: string,
    accountId: string,
    boardId: string,
    stepId: string,
  ) {
    await this.accessControl.verifyAccountAccess(null, accountId, userId);
    await this.verifyBoardAccess(accountId, boardId);

    const [data] = await this.db
      .select()
      .from(boardSteps)
      .where(
        and(
          eq(boardSteps.id, stepId),
          eq(boardSteps.boardInstanceId, boardId),
        ),
      )
      .limit(1);

    if (!data) {
      throw new NotFoundException(`Board step with ID ${stepId} not found`);
    }

    return data;
  }

  async create(
    userId: string,
    accountId: string,
    boardId: string,
    dto: CreateBoardStepDto,
  ) {
    await this.accessControl.verifyAccountAccess(null, accountId, userId);
    await this.verifyBoardAccess(accountId, boardId);

    // Determine position if not provided
    let position = dto.position;
    if (position === undefined) {
      const existingSteps = await this.db
        .select({ position: boardSteps.position })
        .from(boardSteps)
        .where(eq(boardSteps.boardInstanceId, boardId))
        .orderBy(desc(boardSteps.position))
        .limit(1);

      position =
        existingSteps && existingSteps.length > 0
          ? existingSteps[0].position + 1
          : 0;
    }

    const [data] = await this.db
      .insert(boardSteps)
      .values({
        boardInstanceId: boardId,
        stepKey: dto.step_key,
        name: dto.name,
        stepType: dto.step_type || 'human_review',
        position,
        color: dto.color || null,
        linkedCategoryId: dto.linked_category_id || null,
        defaultAgentId: (dto as any).default_agent_id || null,
        backboneConnectionId: dto.backbone_connection_id || null,
      })
      .returning();

    return snakeKeys(data);
  }

  async update(
    userId: string,
    accountId: string,
    boardId: string,
    stepId: string,
    dto: UpdateBoardStepDto,
  ) {
    await this.accessControl.verifyAccountAccess(null, accountId, userId);
    await this.verifyBoardAccess(accountId, boardId);
    await this.findOne(userId, accountId, boardId, stepId);

    // Map the snake_case DTO to camelCase columns (only defined fields).
    const patch: Partial<typeof boardSteps.$inferInsert> = {};
    if (dto.name !== undefined) patch.name = dto.name;
    if (dto.position !== undefined) patch.position = dto.position;
    if (dto.color !== undefined) patch.color = dto.color;
    if (dto.step_type !== undefined) patch.stepType = dto.step_type;
    if (dto.linked_category_id !== undefined)
      patch.linkedCategoryId = dto.linked_category_id;
    if (dto.trigger_type !== undefined) patch.triggerType = dto.trigger_type;
    if (dto.ai_first !== undefined) patch.aiFirst = dto.ai_first;
    if (dto.input_schema !== undefined) patch.inputSchema = dto.input_schema;
    if (dto.output_schema !== undefined) patch.outputSchema = dto.output_schema;
    if (dto.on_success_step_id !== undefined)
      patch.onSuccessStepId = dto.on_success_step_id;
    if (dto.on_error_step_id !== undefined)
      patch.onErrorStepId = dto.on_error_step_id;
    if (dto.webhook_url !== undefined) patch.webhookUrl = dto.webhook_url;
    if (dto.webhook_auth_header !== undefined)
      patch.webhookAuthHeader = dto.webhook_auth_header;
    if (dto.schedule_cron !== undefined) patch.scheduleCron = dto.schedule_cron;
    if (dto.system_prompt !== undefined) patch.systemPrompt = dto.system_prompt;
    if (dto.backbone_connection_id !== undefined)
      patch.backboneConnectionId = dto.backbone_connection_id;

    const [data] = await this.db
      .update(boardSteps)
      .set(patch)
      .where(
        and(
          eq(boardSteps.id, stepId),
          eq(boardSteps.boardInstanceId, boardId),
        ),
      )
      .returning();

    return snakeKeys(data);
  }

  async remove(
    userId: string,
    accountId: string,
    boardId: string,
    stepId: string,
  ) {
    await this.accessControl.verifyAccountAccess(null, accountId, userId);
    await this.verifyBoardAccess(accountId, boardId);

    const step = await this.findOne(userId, accountId, boardId, stepId);

    // Find an adjacent step to move tasks to
    const allSteps = await this.db
      .select({ id: boardSteps.id, position: boardSteps.position })
      .from(boardSteps)
      .where(
        and(
          eq(boardSteps.boardInstanceId, boardId),
          ne(boardSteps.id, stepId),
        ),
      )
      .orderBy(asc(boardSteps.position));

    if (allSteps && allSteps.length > 0) {
      // Move tasks to the nearest step (prefer previous, fallback to next)
      const targetStep =
        allSteps.find((s) => s.position < step.position) || allSteps[0];

      await this.db
        .update(tasks)
        .set({
          currentStepId: targetStep.id,
          status: step.name, // preserve last known status
        })
        .where(eq(tasks.currentStepId, stepId));
    } else {
      // Last step being deleted — nullify task step references
      await this.db
        .update(tasks)
        .set({ currentStepId: null })
        .where(eq(tasks.currentStepId, stepId));
    }

    await this.db
      .delete(boardSteps)
      .where(
        and(
          eq(boardSteps.id, stepId),
          eq(boardSteps.boardInstanceId, boardId),
        ),
      );

    return { message: 'Board step deleted successfully' };
  }

  async reorder(
    userId: string,
    accountId: string,
    boardId: string,
    stepIds: string[],
  ) {
    await this.accessControl.verifyAccountAccess(null, accountId, userId);
    await this.verifyBoardAccess(accountId, boardId);

    if (!stepIds || stepIds.length === 0) {
      throw new BadRequestException('step_ids array is required');
    }

    // Update positions in order
    const updates = stepIds.map((id, index) =>
      this.db
        .update(boardSteps)
        .set({ position: index })
        .where(
          and(
            eq(boardSteps.id, id),
            eq(boardSteps.boardInstanceId, boardId),
          ),
        ),
    );

    await Promise.all(updates);

    return this.findAll(userId, accountId, boardId);
  }

  private async verifyBoardAccess(accountId: string, boardId: string) {
    const [data] = await this.db
      .select({ id: boardInstances.id })
      .from(boardInstances)
      .where(
        and(
          eq(boardInstances.id, boardId),
          eq(boardInstances.accountId, accountId),
        ),
      )
      .limit(1);

    if (!data) {
      throw new NotFoundException(
        `Board with ID ${boardId} not found in this account`,
      );
    }
  }
}
