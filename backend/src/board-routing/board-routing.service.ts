import {
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { SupabaseAdminService } from '../supabase/supabase-admin.service';
import { CreateBoardRouteDto } from './dto/create-board-route.dto';
import { UpdateBoardRouteDto } from './dto/update-board-route.dto';

@Injectable()
export class BoardRoutingService {
  private readonly logger = new Logger(BoardRoutingService.name);

  constructor(private readonly supabaseAdmin: SupabaseAdminService) {}

  async createRoute(accountId: string, dto: CreateBoardRouteDto) {
    const client = this.supabaseAdmin.getClient();
    const { data, error } = await client
      .from('board_routes')
      .insert({
        account_id: accountId,
        source_board_id: dto.source_board_id,
        source_step_id: dto.source_step_id ?? null,
        target_board_id: dto.target_board_id,
        target_step_id: dto.target_step_id ?? null,
        trigger: dto.trigger ?? 'auto',
        transform_config: dto.transform_config ?? {},
        is_active: dto.is_active ?? true,
      })
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to create board route: ${error.message}`);
    }

    return data;
  }

  async findAllRoutes(accountId: string) {
    const client = this.supabaseAdmin.getClient();
    const { data, error } = await client
      .from('board_routes')
      .select('*')
      .eq('account_id', accountId)
      .order('created_at', { ascending: false });

    if (error) {
      throw new Error(`Failed to fetch board routes: ${error.message}`);
    }

    return data;
  }

  async findRoute(accountId: string, routeId: string) {
    const client = this.supabaseAdmin.getClient();
    const { data, error } = await client
      .from('board_routes')
      .select('*')
      .eq('id', routeId)
      .eq('account_id', accountId)
      .single();

    if (error || !data) {
      throw new NotFoundException(`Board route ${routeId} not found`);
    }

    return data;
  }

  async updateRoute(
    accountId: string,
    routeId: string,
    dto: UpdateBoardRouteDto,
  ) {
    const client = this.supabaseAdmin.getClient();

    // Verify exists
    await this.findRoute(accountId, routeId);

    const { data, error } = await client
      .from('board_routes')
      .update(dto)
      .eq('id', routeId)
      .eq('account_id', accountId)
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to update board route: ${error.message}`);
    }

    return data;
  }

  async deleteRoute(accountId: string, routeId: string) {
    const client = this.supabaseAdmin.getClient();

    // Verify exists
    await this.findRoute(accountId, routeId);

    const { error } = await client
      .from('board_routes')
      .delete()
      .eq('id', routeId)
      .eq('account_id', accountId);

    if (error) {
      throw new Error(`Failed to delete board route: ${error.message}`);
    }

    return { message: 'Board route deleted successfully' };
  }

  async triggerRoute(taskId: string, routeId: string) {
    const client = this.supabaseAdmin.getClient();

    // Fetch the route
    const { data: route, error: routeError } = await client
      .from('board_routes')
      .select('*')
      .eq('id', routeId)
      .single();

    if (routeError || !route) {
      throw new NotFoundException(`Board route ${routeId} not found`);
    }

    // Fetch the source task
    const { data: task, error: taskError } = await client
      .from('tasks')
      .select('*')
      .eq('id', taskId)
      .single();

    if (taskError || !task) {
      throw new NotFoundException(`Task ${taskId} not found`);
    }

    // Apply transform_config (field mapping)
    const transformConfig = route.transform_config || {};
    const newTaskData: Record<string, any> = {
      account_id: task.account_id,
      title: task.title,
      notes: task.notes || '',
      priority: task.priority || 'Medium',
      board_instance_id: route.target_board_id,
      current_step_id: route.target_step_id || null,
      status: 'To-Do',
      card_data: task.card_data || {},
    };

    // Apply field transforms if configured
    if (transformConfig.field_mapping) {
      for (const [targetField, sourceField] of Object.entries(
        transformConfig.field_mapping as Record<string, string>,
      )) {
        if (task[sourceField] !== undefined) {
          newTaskData[targetField] = task[sourceField];
        }
      }
    }

    // If target_step_id provided, resolve status from step name
    if (route.target_step_id) {
      const { data: step } = await client
        .from('board_steps')
        .select('name')
        .eq('id', route.target_step_id)
        .single();
      if (step) {
        newTaskData.status = step.name;
      }
    }

    // Create the new task in the target board
    const { data: newTask, error: createError } = await client
      .from('tasks')
      .insert(newTaskData)
      .select()
      .single();

    if (createError) {
      throw new Error(
        `Failed to create routed task: ${createError.message}`,
      );
    }

    // Create a dependency record linking source -> target
    await client.from('task_dependencies').insert({
      source_task_id: taskId,
      target_task_id: newTask.id,
      dependency_type: 'route',
      route_id: routeId,
    });

    this.logger.log(
      `Route ${routeId}: transferred task ${taskId} -> ${newTask.id} to board ${route.target_board_id}`,
    );

    return newTask;
  }
}
