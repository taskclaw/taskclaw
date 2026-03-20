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
  HttpCode,
  HttpStatus,
  Query,
} from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { IntegrationsService } from './integrations.service';
import { CreateDefinitionDto } from './dto/create-definition.dto';
import { UpdateDefinitionDto } from './dto/update-definition.dto';
import { CreateConnectionDto } from './dto/create-connection.dto';
import { UpdateConnectionDto } from './dto/update-connection.dto';
import { AuthGuard } from '../common/guards/auth.guard';

@ApiTags('Integrations')
@Controller('accounts/:accountId/integrations')
@UseGuards(AuthGuard)
export class IntegrationsController {
  constructor(private readonly integrationsService: IntegrationsService) {}

  // ─── Definitions ──────────────────────────────────────────

  @Get('definitions')
  findAllDefinitions(
    @Req() req,
    @Param('accountId') accountId: string,
    @Query('category') category?: string,
  ) {
    if (category) {
      return this.integrationsService.findAllDefinitionsByCategory(req.user.id, accountId, category);
    }
    return this.integrationsService.findAllDefinitions(req.user.id, accountId);
  }

  @Get('definitions/:defId')
  findOneDefinition(
    @Req() req,
    @Param('accountId') accountId: string,
    @Param('defId') defId: string,
  ) {
    return this.integrationsService.findOneDefinition(req.user.id, accountId, defId);
  }

  @Post('definitions')
  @HttpCode(HttpStatus.CREATED)
  createDefinition(
    @Req() req,
    @Param('accountId') accountId: string,
    @Body() dto: CreateDefinitionDto,
  ) {
    return this.integrationsService.createDefinition(req.user.id, accountId, dto);
  }

  @Patch('definitions/:defId')
  updateDefinition(
    @Req() req,
    @Param('accountId') accountId: string,
    @Param('defId') defId: string,
    @Body() dto: UpdateDefinitionDto,
  ) {
    return this.integrationsService.updateDefinition(req.user.id, accountId, defId, dto);
  }

  @Delete('definitions/:defId')
  @HttpCode(HttpStatus.OK)
  removeDefinition(
    @Req() req,
    @Param('accountId') accountId: string,
    @Param('defId') defId: string,
  ) {
    return this.integrationsService.removeDefinition(req.user.id, accountId, defId);
  }

  // ─── Connections ──────────────────────────────────────────

  @Get('connections')
  findAllConnections(
    @Req() req,
    @Param('accountId') accountId: string,
    @Query('category') category?: string,
  ) {
    if (category) {
      return this.integrationsService.findAllConnectionsByCategory(req.user.id, accountId, category);
    }
    return this.integrationsService.findAllConnections(req.user.id, accountId);
  }

  @Get('connections/:connId')
  findOneConnection(
    @Req() req,
    @Param('accountId') accountId: string,
    @Param('connId') connId: string,
  ) {
    return this.integrationsService.findOneConnection(req.user.id, accountId, connId);
  }

  @Post('connections')
  @HttpCode(HttpStatus.CREATED)
  createConnection(
    @Req() req,
    @Param('accountId') accountId: string,
    @Body() dto: CreateConnectionDto,
  ) {
    return this.integrationsService.createConnection(req.user.id, accountId, dto);
  }

  @Patch('connections/:connId')
  updateConnection(
    @Req() req,
    @Param('accountId') accountId: string,
    @Param('connId') connId: string,
    @Body() dto: UpdateConnectionDto,
  ) {
    return this.integrationsService.updateConnection(req.user.id, accountId, connId, dto);
  }

  @Delete('connections/:connId')
  @HttpCode(HttpStatus.OK)
  removeConnection(
    @Req() req,
    @Param('accountId') accountId: string,
    @Param('connId') connId: string,
  ) {
    return this.integrationsService.removeConnection(req.user.id, accountId, connId);
  }

  @Post('connections/:connId/toggle')
  async toggleConnection(
    @Req() req: any,
    @Param('accountId') accountId: string,
    @Param('connId') connId: string,
    @Body('enabled') enabled: boolean,
  ) {
    return this.integrationsService.toggleConnection(
      req.user.id, accountId, connId, enabled,
    );
  }

  @Post('connections/:connId/health-check')
  async checkConnectionHealth(
    @Req() req: any,
    @Param('accountId') accountId: string,
    @Param('connId') connId: string,
  ) {
    return this.integrationsService.checkConnectionHealth(
      req.user.id, accountId, connId,
    );
  }
}

// Separate controller for board-level integration refs
@ApiTags('Board Integration Refs')
@Controller('accounts/:accountId/boards/:boardId/integration-refs')
@UseGuards(AuthGuard)
export class BoardIntegrationRefsController {
  constructor(private readonly integrationsService: IntegrationsService) {}

  @Get()
  getRefsForBoard(
    @Req() req,
    @Param('accountId') accountId: string,
    @Param('boardId') boardId: string,
  ) {
    return this.integrationsService.getRefsForBoard(req.user.id, accountId, boardId);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  addRef(
    @Req() req,
    @Param('accountId') accountId: string,
    @Param('boardId') boardId: string,
    @Body() body: { connection_id: string; is_required?: boolean },
  ) {
    return this.integrationsService.addRef(
      req.user.id,
      accountId,
      boardId,
      body.connection_id,
      body.is_required,
    );
  }

  @Delete(':refId')
  @HttpCode(HttpStatus.OK)
  removeRef(
    @Req() req,
    @Param('accountId') accountId: string,
    @Param('boardId') boardId: string,
    @Param('refId') refId: string,
  ) {
    return this.integrationsService.removeRef(req.user.id, accountId, boardId, refId);
  }
}
