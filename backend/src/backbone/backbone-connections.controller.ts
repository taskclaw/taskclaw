import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  UseGuards,
  Req,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { AuthGuard } from '../common/guards/auth.guard';
import { BackboneConnectionsService } from './backbone-connections.service';
import { BackboneDefinitionsService } from './backbone-definitions.service';
import { BackboneHealthService } from './backbone-health.service';
import { MigrateAiProvidersService } from './migrations/migrate-ai-providers';
import { CreateBackboneConnectionDto } from './dto/create-backbone-connection.dto';
import { UpdateBackboneConnectionDto } from './dto/update-backbone-connection.dto';

@ApiTags('Backbone')
@Controller('accounts/:accountId/backbone')
@UseGuards(AuthGuard)
export class BackboneConnectionsController {
  constructor(
    private readonly connectionsService: BackboneConnectionsService,
    private readonly definitionsService: BackboneDefinitionsService,
    private readonly healthService: BackboneHealthService,
    private readonly migrateService: MigrateAiProvidersService,
  ) {}

  // ─── Definitions ─────────────────────────────────────────

  /**
   * GET /accounts/:accountId/backbone/definitions
   * List available backbone types.
   */
  @Get('definitions')
  getDefinitions() {
    return this.definitionsService.findAllIncludingUnavailable();
  }

  // ─── Connections CRUD ────────────────────────────────────

  /**
   * GET /accounts/:accountId/backbone/connections
   * List all backbone connections for the account.
   */
  @Get('connections')
  findAll(@Req() req, @Param('accountId') accountId: string) {
    return this.connectionsService.findAll(req.user.id, accountId);
  }

  /**
   * GET /accounts/:accountId/backbone/connections/:id
   * Get a single backbone connection.
   */
  @Get('connections/:id')
  findOne(
    @Req() req,
    @Param('accountId') accountId: string,
    @Param('id') id: string,
  ) {
    return this.connectionsService.findById(req.user.id, accountId, id);
  }

  /**
   * POST /accounts/:accountId/backbone/connections
   * Create a new backbone connection.
   */
  @Post('connections')
  create(
    @Req() req,
    @Param('accountId') accountId: string,
    @Body() dto: CreateBackboneConnectionDto,
  ) {
    return this.connectionsService.create(req.user.id, accountId, dto);
  }

  /**
   * PATCH /accounts/:accountId/backbone/connections/:id
   * Update an existing backbone connection.
   */
  @Patch('connections/:id')
  update(
    @Req() req,
    @Param('accountId') accountId: string,
    @Param('id') id: string,
    @Body() dto: UpdateBackboneConnectionDto,
  ) {
    return this.connectionsService.update(req.user.id, accountId, id, dto);
  }

  /**
   * DELETE /accounts/:accountId/backbone/connections/:id
   * Delete a backbone connection.
   */
  @Delete('connections/:id')
  remove(
    @Req() req,
    @Param('accountId') accountId: string,
    @Param('id') id: string,
  ) {
    return this.connectionsService.remove(req.user.id, accountId, id);
  }

  /**
   * POST /accounts/:accountId/backbone/connections/:id/verify
   * Trigger a health check for a specific connection.
   */
  @Post('connections/:id/verify')
  async verify(
    @Req() req,
    @Param('accountId') accountId: string,
    @Param('id') id: string,
  ) {
    // Ensure the user has access and the connection exists
    const connection = await this.connectionsService.findById(
      req.user.id,
      accountId,
      id,
    );

    // Run the raw row through the health checker (need unmasked config)
    const client = (this.connectionsService as any).supabaseAdmin.getClient();
    const { data: row } = await client
      .from('backbone_connections')
      .select('*')
      .eq('id', id)
      .eq('account_id', accountId)
      .single();

    const status = await this.healthService.checkOne(row);

    return {
      success: status === 'healthy',
      status,
      verified_at: new Date().toISOString(),
    };
  }

  /**
   * POST /accounts/:accountId/backbone/connections/:id/default
   * Set a connection as the account default.
   */
  @Post('connections/:id/default')
  setDefault(
    @Req() req,
    @Param('accountId') accountId: string,
    @Param('id') id: string,
  ) {
    return this.connectionsService.setDefault(req.user.id, accountId, id);
  }

  // ─── Migration (F016) ───────────────────────────────────

  /**
   * POST /accounts/:accountId/backbone/migrate
   * Migrate un-migrated ai_provider_configs to backbone_connections.
   * Idempotent — safe to call multiple times.
   */
  @Post('migrate')
  migrate(@Req() req, @Param('accountId') accountId: string) {
    // Access-check happens implicitly via AuthGuard; the migration
    // service itself processes all accounts (not scoped to one),
    // but we keep the guard so only authenticated users can trigger it.
    return this.migrateService.migrateAll();
  }
}
