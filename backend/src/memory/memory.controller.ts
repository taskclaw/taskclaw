import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  Query,
  Headers,
  ParseIntPipe,
  DefaultValuePipe,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { MemoryConnectionsService } from './memory-connections.service';
import type {
  CreateMemoryConnectionDto,
  UpdateMemoryConnectionDto,
} from './memory-connections.service';
import { MemoryRouterService } from './memory-router.service';
import { MemoryAdapterRegistry } from './adapters/memory-adapter.registry';
import { SupabaseAdminService } from '../supabase/supabase-admin.service';

/**
 * MemoryController (BE05)
 *
 * REST API for memory connections and memory entries.
 *
 * Routes:
 *   GET    /accounts/:accountId/memory/connections
 *   POST   /accounts/:accountId/memory/connections
 *   PATCH  /accounts/:accountId/memory/connections/:id
 *   DELETE /accounts/:accountId/memory/connections/:id
 *   GET    /accounts/:accountId/memory/connections/:id/health
 *   GET    /accounts/:accountId/memory/entries
 *   DELETE /accounts/:accountId/memory/entries/:memoryId
 */
@Controller()
export class MemoryController {
  constructor(
    private readonly connectionsService: MemoryConnectionsService,
    private readonly memoryRouter: MemoryRouterService,
    private readonly registry: MemoryAdapterRegistry,
    private readonly supabaseAdmin: SupabaseAdminService,
  ) {}

  // ── Memory Connections ──────────────────────────────────────

  @Get('accounts/:accountId/memory/connections')
  async listConnections(@Param('accountId') accountId: string) {
    return this.connectionsService.findAll(accountId);
  }

  @Post('accounts/:accountId/memory/connections')
  async createConnection(
    @Param('accountId') accountId: string,
    @Body() dto: CreateMemoryConnectionDto,
  ) {
    return this.connectionsService.create(accountId, dto);
  }

  @Patch('accounts/:accountId/memory/connections/:id')
  async updateConnection(
    @Param('accountId') accountId: string,
    @Param('id') id: string,
    @Body() dto: UpdateMemoryConnectionDto,
  ) {
    return this.connectionsService.update(id, accountId, dto);
  }

  @Delete('accounts/:accountId/memory/connections/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteConnection(
    @Param('accountId') accountId: string,
    @Param('id') id: string,
  ) {
    return this.connectionsService.remove(id, accountId);
  }

  @Get('accounts/:accountId/memory/connections/:id/health')
  async healthCheck(
    @Param('accountId') accountId: string,
    @Param('id') id: string,
  ) {
    const connection = await this.connectionsService.findOne(id, accountId);
    const adapter = this.registry.resolve(connection.adapter_slug);
    return adapter.healthCheck(connection.config);
  }

  // ── Memory Entries ─────────────────────────────────────────

  @Get('accounts/:accountId/memory/entries')
  async listEntries(
    @Param('accountId') accountId: string,
    @Query('type') type?: string,
    @Query('task_id') taskId?: string,
    @Query('limit', new DefaultValuePipe(50), ParseIntPipe) limit = 50,
  ) {
    const client = this.supabaseAdmin.getClient();
    let q = client
      .from('agent_memories')
      .select('*')
      .eq('account_id', accountId)
      .is('valid_to', null)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (type) q = q.eq('type', type);
    if (taskId) q = q.eq('task_id', taskId);

    const { data, error } = await q;
    if (error) throw new Error(error.message);
    return data || [];
  }

  @Delete('accounts/:accountId/memory/entries/:memoryId')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteEntry(
    @Param('accountId') accountId: string,
    @Param('memoryId') memoryId: string,
  ) {
    const { adapter } = await this.memoryRouter.resolveAdapter(accountId);
    return adapter.forget(memoryId, accountId);
  }

  // ── Adapter list (for UI) ──────────────────────────────────

  @Get('memory/adapters')
  listAdapters() {
    return this.registry.list().map((a) => ({
      slug: a.slug,
      name: a.name,
    }));
  }
}
