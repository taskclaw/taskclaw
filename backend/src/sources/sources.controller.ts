import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  UseGuards,
  Req,
  BadRequestException,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { SourcesService } from './sources.service';
import { CreateSourceDto } from './dto/create-source.dto';
import { UpdateSourceDto } from './dto/update-source.dto';
import { AuthGuard } from '../common/guards/auth.guard';
import { PlanLimitGuard, PlanResource } from '../common/guards/plan-limit.guard';
import { AdapterRegistry } from '../adapters/adapter.registry';

@ApiTags('Sources')
@Controller('accounts/:accountId/sources')
@UseGuards(AuthGuard)
export class SourcesController {
  constructor(
    private readonly sourcesService: SourcesService,
    private readonly adapterRegistry: AdapterRegistry,
  ) {}

  @Get()
  findAll(@Req() req, @Param('accountId') accountId: string) {
    return this.sourcesService.findAll(req.user.id, accountId);
  }

  @Get(':id')
  findOne(
    @Req() req,
    @Param('accountId') accountId: string,
    @Param('id') id: string,
  ) {
    return this.sourcesService.findOne(req.user.id, accountId, id);
  }

  @Post()
  @UseGuards(PlanLimitGuard)
  @PlanResource('sources')
  create(
    @Req() req,
    @Param('accountId') accountId: string,
    @Body() createSourceDto: CreateSourceDto,
  ) {
    return this.sourcesService.create(req.user.id, accountId, createSourceDto);
  }

  @Patch(':id')
  update(
    @Req() req,
    @Param('accountId') accountId: string,
    @Param('id') id: string,
    @Body() updateSourceDto: UpdateSourceDto,
  ) {
    return this.sourcesService.update(
      req.user.id,
      accountId,
      id,
      updateSourceDto,
    );
  }

  @Delete(':id')
  remove(
    @Req() req,
    @Param('accountId') accountId: string,
    @Param('id') id: string,
  ) {
    return this.sourcesService.remove(req.user.id, accountId, id);
  }

  /**
   * Get properties/schema from the external source (Notion DB properties, ClickUp fields, etc.)
   * Uses the stored (unmasked) config from the source.
   * Delegates to adapter.getProperties() if the adapter supports it.
   */
  @Get(':id/properties')
  async getSourceProperties(
    @Req() req,
    @Param('accountId') accountId: string,
    @Param('id') id: string,
  ) {
    // Fetch source with unmasked config (direct DB access)
    const source = await this.sourcesService.findOneUnmasked(
      req.user.id,
      accountId,
      id,
    );

    const adapter = this.adapterRegistry.getAdapter(source.provider);

    if (!adapter.getProperties) {
      return { error: `Adapter '${source.provider}' does not support getProperties` };
    }

    try {
      return await adapter.getProperties(source.config);
    } catch (error: any) {
      return { error: error.message || `Failed to fetch ${source.provider} properties` };
    }
  }

  @Post('validate')
  validate(
    @Req() req,
    @Param('accountId') accountId: string,
    @Body() body: { provider: string; config: Record<string, any> },
  ) {
    return this.sourcesService.validateSource(
      req.user.id,
      accountId,
      body.provider,
      body.config,
    );
  }

  /**
   * List available workspaces/databases for a given provider and credentials.
   * Delegates to adapter.listWorkspaces() if the adapter supports it.
   *
   * Replaces the old provider-specific endpoints:
   *   POST /notion/databases
   *   POST /clickup/workspaces
   */
  @Post(':provider/workspaces')
  async listWorkspaces(
    @Param('provider') provider: string,
    @Body() body: Record<string, any>,
  ) {
    if (!this.adapterRegistry.hasAdapter(provider)) {
      throw new BadRequestException(`Unknown provider: ${provider}`);
    }

    const adapter = this.adapterRegistry.getAdapter(provider);

    if (!adapter.listWorkspaces) {
      return { error: `Adapter '${provider}' does not support listWorkspaces` };
    }

    try {
      return await adapter.listWorkspaces(body);
    } catch (error: any) {
      if (error.message?.includes('unauthorized') || error.message?.includes('Invalid')) {
        return { error: 'Invalid credentials' };
      }
      return { error: error.message || `Failed to list workspaces for ${provider}` };
    }
  }

  /**
   * Fetch properties/schema from a provider using raw credentials (before a source is saved).
   * Delegates to adapter.getProperties() if the adapter supports it.
   *
   * Replaces the old provider-specific endpoints:
   *   POST /notion/properties
   *   POST /clickup/fields
   */
  @Post(':provider/properties')
  async listProviderProperties(
    @Param('provider') provider: string,
    @Body() body: Record<string, any>,
  ) {
    if (!this.adapterRegistry.hasAdapter(provider)) {
      throw new BadRequestException(`Unknown provider: ${provider}`);
    }

    const adapter = this.adapterRegistry.getAdapter(provider);

    if (!adapter.getProperties) {
      return { error: `Adapter '${provider}' does not support getProperties` };
    }

    try {
      return await adapter.getProperties(body);
    } catch (error: any) {
      return { error: error.message || `Failed to fetch ${provider} properties` };
    }
  }
}
