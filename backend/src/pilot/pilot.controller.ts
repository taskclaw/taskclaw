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
import { and, desc, eq } from 'drizzle-orm';
import { AuthGuard } from '../common/guards/auth.guard';
import { PilotService } from './pilot.service';
import { DB, type Db } from '../db';
import { pilotConfigs } from '../db/schema';

@ApiTags('Pilot')
@Controller('accounts/:accountId/pilot')
@UseGuards(AuthGuard)
export class PilotController {
  constructor(
    private readonly pilotService: PilotService,
    @Inject(DB) private readonly db: Db,
  ) {}

  // ─── Pilot Config CRUD ───────────────────────────────────────────────────

  @Get('configs')
  @ApiOperation({ summary: 'List pilot configs for account' })
  async findConfigs(@Param('accountId') accountId: string) {
    return this.db
      .select()
      .from(pilotConfigs)
      .where(eq(pilotConfigs.accountId, accountId))
      .orderBy(desc(pilotConfigs.createdAt));
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
    const now = new Date().toISOString();

    const values: typeof pilotConfigs.$inferInsert = {
      accountId,
      podId: body.pod_id ?? null,
      updatedAt: now,
    };
    if (body.backbone_connection_id !== undefined)
      values.backboneConnectionId = body.backbone_connection_id;
    if (body.system_prompt !== undefined)
      values.systemPrompt = body.system_prompt;
    if (body.is_active !== undefined) values.isActive = body.is_active;
    if (body.max_tasks_per_cycle !== undefined)
      values.maxTasksPerCycle = body.max_tasks_per_cycle;
    if (body.approval_required !== undefined)
      values.approvalRequired = body.approval_required;

    // Mirror PostgREST upsert: only the explicitly provided fields are written
    // on conflict (plus updated_at). The non-conflict, non-provided columns keep
    // their existing values.
    const updateSet: Record<string, unknown> = { updatedAt: now };
    if (body.backbone_connection_id !== undefined)
      updateSet.backboneConnectionId = body.backbone_connection_id;
    if (body.system_prompt !== undefined)
      updateSet.systemPrompt = body.system_prompt;
    if (body.is_active !== undefined) updateSet.isActive = body.is_active;
    if (body.max_tasks_per_cycle !== undefined)
      updateSet.maxTasksPerCycle = body.max_tasks_per_cycle;
    if (body.approval_required !== undefined)
      updateSet.approvalRequired = body.approval_required;

    const rows = await this.db
      .insert(pilotConfigs)
      .values(values)
      .onConflictDoUpdate({
        target: [pilotConfigs.accountId, pilotConfigs.podId],
        set: updateSet,
      })
      .returning();

    return rows[0];
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
    const patch: Record<string, unknown> = {
      updatedAt: new Date().toISOString(),
    };
    if (body.backbone_connection_id !== undefined)
      patch.backboneConnectionId = body.backbone_connection_id;
    if (body.system_prompt !== undefined)
      patch.systemPrompt = body.system_prompt;
    if (body.is_active !== undefined) patch.isActive = body.is_active;
    if (body.max_tasks_per_cycle !== undefined)
      patch.maxTasksPerCycle = body.max_tasks_per_cycle;
    if (body.approval_required !== undefined)
      patch.approvalRequired = body.approval_required;

    const rows = await this.db
      .update(pilotConfigs)
      .set(patch)
      .where(
        and(
          eq(pilotConfigs.id, configId),
          eq(pilotConfigs.accountId, accountId),
        ),
      )
      .returning();

    return rows[0];
  }

  @Delete('configs/:configId')
  @ApiOperation({ summary: 'Delete a pilot config' })
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteConfig(
    @Param('accountId') accountId: string,
    @Param('configId') configId: string,
  ) {
    await this.db
      .delete(pilotConfigs)
      .where(
        and(
          eq(pilotConfigs.id, configId),
          eq(pilotConfigs.accountId, accountId),
        ),
      );

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
