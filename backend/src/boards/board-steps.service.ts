import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { SupabaseAdminService } from '../supabase/supabase-admin.service';
import { AccessControlHelper } from '../common/helpers/access-control.helper';
import { CreateBoardStepDto } from './dto/create-board-step.dto';
import { UpdateBoardStepDto } from './dto/update-board-step.dto';

@Injectable()
export class BoardStepsService {
  constructor(
    private readonly supabaseAdmin: SupabaseAdminService,
    private readonly accessControl: AccessControlHelper,
  ) {}

  async findAll(userId: string, accountId: string, boardId: string) {
    const client = this.supabaseAdmin.getClient();
    await this.accessControl.verifyAccountAccess(client, accountId, userId);

    // Verify board belongs to account
    await this.verifyBoardAccess(accountId, boardId);

    const { data, error } = await client
      .from('board_steps')
      .select(
        '*, linked_category:categories!linked_category_id(id, name, color, icon)',
      )
      .eq('board_instance_id', boardId)
      .order('position', { ascending: true });

    if (error) {
      throw new Error(`Failed to fetch board steps: ${error.message}`);
    }

    return data;
  }

  async findOne(
    userId: string,
    accountId: string,
    boardId: string,
    stepId: string,
  ) {
    const client = this.supabaseAdmin.getClient();
    await this.accessControl.verifyAccountAccess(client, accountId, userId);
    await this.verifyBoardAccess(accountId, boardId);

    const { data, error } = await client
      .from('board_steps')
      .select('*')
      .eq('id', stepId)
      .eq('board_instance_id', boardId)
      .single();

    if (error || !data) {
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
    const client = this.supabaseAdmin.getClient();
    await this.accessControl.verifyAccountAccess(client, accountId, userId);
    await this.verifyBoardAccess(accountId, boardId);

    // Determine position if not provided
    let position = dto.position;
    if (position === undefined) {
      const { data: existingSteps } = await client
        .from('board_steps')
        .select('position')
        .eq('board_instance_id', boardId)
        .order('position', { ascending: false })
        .limit(1);

      position =
        existingSteps && existingSteps.length > 0
          ? existingSteps[0].position + 1
          : 0;
    }

    const { data, error } = await client
      .from('board_steps')
      .insert({
        board_instance_id: boardId,
        step_key: dto.step_key,
        name: dto.name,
        step_type: dto.step_type || 'human_review',
        position,
        color: dto.color || null,
        linked_category_id: dto.linked_category_id || null,
        backbone_connection_id: dto.backbone_connection_id || null,
      })
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to create board step: ${error.message}`);
    }

    return data;
  }

  async update(
    userId: string,
    accountId: string,
    boardId: string,
    stepId: string,
    dto: UpdateBoardStepDto,
  ) {
    const client = this.supabaseAdmin.getClient();
    await this.accessControl.verifyAccountAccess(client, accountId, userId);
    await this.verifyBoardAccess(accountId, boardId);
    await this.findOne(userId, accountId, boardId, stepId);

    const { data, error } = await client
      .from('board_steps')
      .update(dto)
      .eq('id', stepId)
      .eq('board_instance_id', boardId)
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to update board step: ${error.message}`);
    }

    return data;
  }

  async remove(
    userId: string,
    accountId: string,
    boardId: string,
    stepId: string,
  ) {
    const client = this.supabaseAdmin.getClient();
    await this.accessControl.verifyAccountAccess(client, accountId, userId);
    await this.verifyBoardAccess(accountId, boardId);

    const step = await this.findOne(userId, accountId, boardId, stepId);

    // Find an adjacent step to move tasks to
    const { data: allSteps } = await client
      .from('board_steps')
      .select('id, position')
      .eq('board_instance_id', boardId)
      .neq('id', stepId)
      .order('position', { ascending: true });

    if (allSteps && allSteps.length > 0) {
      // Move tasks to the nearest step (prefer previous, fallback to next)
      const targetStep =
        allSteps.find((s) => s.position < step.position) || allSteps[0];

      await client
        .from('tasks')
        .update({
          current_step_id: targetStep.id,
          status: step.name, // preserve last known status
        })
        .eq('current_step_id', stepId);
    } else {
      // Last step being deleted — nullify task step references
      await client
        .from('tasks')
        .update({ current_step_id: null })
        .eq('current_step_id', stepId);
    }

    const { error } = await client
      .from('board_steps')
      .delete()
      .eq('id', stepId)
      .eq('board_instance_id', boardId);

    if (error) {
      throw new Error(`Failed to delete board step: ${error.message}`);
    }

    return { message: 'Board step deleted successfully' };
  }

  async reorder(
    userId: string,
    accountId: string,
    boardId: string,
    stepIds: string[],
  ) {
    const client = this.supabaseAdmin.getClient();
    await this.accessControl.verifyAccountAccess(client, accountId, userId);
    await this.verifyBoardAccess(accountId, boardId);

    if (!stepIds || stepIds.length === 0) {
      throw new BadRequestException('step_ids array is required');
    }

    // Update positions in order
    const updates = stepIds.map((id, index) =>
      client
        .from('board_steps')
        .update({ position: index })
        .eq('id', id)
        .eq('board_instance_id', boardId),
    );

    await Promise.all(updates);

    return this.findAll(userId, accountId, boardId);
  }

  private async verifyBoardAccess(accountId: string, boardId: string) {
    const client = this.supabaseAdmin.getClient();
    const { data, error } = await client
      .from('board_instances')
      .select('id')
      .eq('id', boardId)
      .eq('account_id', accountId)
      .single();

    if (error || !data) {
      throw new NotFoundException(
        `Board with ID ${boardId} not found in this account`,
      );
    }
  }
}
