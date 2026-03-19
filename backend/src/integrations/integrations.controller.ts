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
} from '@nestjs/common';
import { IntegrationsService } from './integrations.service';
import { CreateDefinitionDto } from './dto/create-definition.dto';
import { UpdateDefinitionDto } from './dto/update-definition.dto';
import { CreateConnectionDto } from './dto/create-connection.dto';
import { UpdateConnectionDto } from './dto/update-connection.dto';
import { AuthGuard } from '../common/guards/auth.guard';

@Controller('accounts/:accountId/integrations')
@UseGuards(AuthGuard)
export class IntegrationsController {
  constructor(private readonly integrationsService: IntegrationsService) {}

  // ─── Definitions ──────────────────────────────────────────

  @Get('definitions')
  findAllDefinitions(
    @Req() req,
    @Param('accountId') accountId: string,
  ) {
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
  ) {
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
}

// Separate controller for board-level integration refs
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
