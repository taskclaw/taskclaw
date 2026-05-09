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
import { PilotService } from './pilot.service';
import { SupabaseAdminService } from '../supabase/supabase-admin.service';

@ApiTags('Pilot')
@Controller('accounts/:accountId/pilot')
@UseGuards(AuthGuard)
export class PilotController {
  constructor(
    private readonly pilotService: PilotService,
    private readonly supabaseAdmin: SupabaseAdminService,
  ) {}

  // ─── Pilot Config CRUD ───────────────────────────────────────────────────

  @Get('configs')
  @ApiOperation({ summary: 'List pilot configs for account' })
  async findConfigs(@Param('accountId') accountId: string) {
    const { data, error } = await this.supabaseAdmin
      .getClient()
      .from('pilot_configs')
      .select('*')
      .eq('account_id', accountId)
      .order('created_at', { ascending: false });

    if (error) {
      throw new Error(`Failed to fetch pilot configs: ${error.message}`);
    }

    return data;
  }

  @Post('configs')
  @ApiOperation({ summary: 'Create or upsert pilot config (by pod_id)' })
  @HttpCode(HttpStatus.CREATED)
  async upsertConfig(
    @Param('accountId') accountId: string,
    @Body()
    body: {
      pod_id?: string | null;
      backbone_connection_id?: string | null;
      system_prompt?: string;
      is_active?: boolean;
      max_tasks_per_cycle?: number;
      approval_required?: boolean;
    },
  ) {
    const client = this.supabaseAdmin.getClient();

    const payload: Record<string, any> = {
      account_id: accountId,
      pod_id: body.pod_id ?? null,
      updated_at: new Date().toISOString(),
    };

    if (body.backbone_connection_id !== undefined)
      payload.backbone_connection_id = body.backbone_connection_id;
    if (body.system_prompt !== undefined)
      payload.system_prompt = body.system_prompt;
    if (body.is_active !== undefined) payload.is_active = body.is_active;
    if (body.max_tasks_per_cycle !== undefined)
      payload.max_tasks_per_cycle = body.max_tasks_per_cycle;
    if (body.approval_required !== undefined)
      payload.approval_required = body.approval_required;

    const { data, error } = await client
      .from('pilot_configs')
      .upsert(payload, {
        onConflict: 'account_id,pod_id',
        ignoreDuplicates: false,
      })
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to upsert pilot config: ${error.message}`);
    }

    return data;
  }

  @Patch('configs/:configId')
  @ApiOperation({ summary: 'Update a pilot config' })
  async updateConfig(
    @Param('accountId') accountId: string,
    @Param('configId') configId: string,
    @Body()
    body: {
      backbone_connection_id?: string | null;
      system_prompt?: string;
      is_active?: boolean;
      max_tasks_per_cycle?: number;
      approval_required?: boolean;
    },
  ) {
    const client = this.supabaseAdmin.getClient();

    const { data, error } = await client
      .from('pilot_configs')
      .update({
        ...body,
        updated_at: new Date().toISOString(),
      })
      .eq('id', configId)
      .eq('account_id', accountId)
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to update pilot config: ${error.message}`);
    }

    return data;
  }

  @Delete('configs/:configId')
  @ApiOperation({ summary: 'Delete a pilot config' })
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteConfig(
    @Param('accountId') accountId: string,
    @Param('configId') configId: string,
  ) {
    const { error } = await this.supabaseAdmin
      .getClient()
      .from('pilot_configs')
      .delete()
      .eq('id', configId)
      .eq('account_id', accountId);

    if (error) {
      throw new Error(`Failed to delete pilot config: ${error.message}`);
    }

    return;
  }

  // ─── Pilot Run ───────────────────────────────────────────────────────────

  @Post('run')
  @ApiOperation({ summary: 'Manually run the pilot agent' })
  @HttpCode(HttpStatus.OK)
  async run(
    @Param('accountId') accountId: string,
    @Query('pod_id') podId?: string,
  ) {
    if (podId) {
      const result = await this.pilotService.runPodPilot(accountId, podId);
      return {
        status: 'completed',
        summary: result?.summary ?? 'No active pilot config for this pod.',
        actions_taken: result?.actions_taken ?? 0,
      };
    }

    const result = await this.pilotService.runWorkspacePilot(accountId);
    return {
      status: 'completed',
      summary: result?.summary ?? 'No active workspace pilot config.',
      actions_taken: result?.actions_taken ?? 0,
    };
  }
}
