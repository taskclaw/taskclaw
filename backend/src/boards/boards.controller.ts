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
  Query,
} from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { BoardsService } from './boards.service';
import { BoardStepsService } from './board-steps.service';
import { BoardTemplatesService } from './board-templates.service';
import { BundleImportService } from './bundle-import.service';
import { CreateBoardDto } from './dto/create-board.dto';
import { UpdateBoardDto } from './dto/update-board.dto';
import { CreateBoardStepDto } from './dto/create-board-step.dto';
import { UpdateBoardStepDto } from './dto/update-board-step.dto';
import { AuthGuard } from '../common/guards/auth.guard';

@ApiTags('Boards')
@Controller('accounts/:accountId/boards')
@UseGuards(AuthGuard)
export class BoardsController {
  constructor(
    private readonly boardsService: BoardsService,
    private readonly boardStepsService: BoardStepsService,
    private readonly boardTemplatesService: BoardTemplatesService,
    private readonly bundleImportService: BundleImportService,
  ) {}

  // ─── Board Instance CRUD ───────────────────────────────────

  @Get()
  @ApiOperation({ summary: 'List all boards' })
  findAll(
    @Req() req,
    @Param('accountId') accountId: string,
    @Query('archived') archived?: string,
    @Query('favorite') favorite?: string,
    @Query('pod_id') podId?: string,
  ) {
    const filters: any = {};
    if (archived !== undefined) filters.archived = archived === 'true';
    if (favorite !== undefined) filters.favorite = favorite === 'true';
    if (podId !== undefined) filters.pod_id = podId;

    return this.boardsService.findAll(req.user.id, accountId, filters);
  }

  @Post('import')
  @ApiOperation({ summary: 'Import board from manifest' })
  importManifest(
    @Req() req,
    @Param('accountId') accountId: string,
    @Body() manifest: any,
  ) {
    return this.boardTemplatesService.importManifest(
      req.user.id,
      accountId,
      manifest,
    );
  }

  @Post('bundle-import')
  @ApiOperation({ summary: 'Import board from bundle' })
  importBundle(
    @Req() req,
    @Param('accountId') accountId: string,
    @Body() bundle: any,
  ) {
    return this.bundleImportService.importBundle(
      req.user.id,
      accountId,
      bundle,
    );
  }

  @Get(':boardId')
  @ApiOperation({ summary: 'Get board by ID' })
  findOne(
    @Req() req,
    @Param('accountId') accountId: string,
    @Param('boardId') boardId: string,
  ) {
    return this.boardsService.findOne(req.user.id, accountId, boardId);
  }

  @Post()
  @ApiOperation({ summary: 'Create a new board' })
  create(
    @Req() req,
    @Param('accountId') accountId: string,
    @Body() dto: CreateBoardDto,
  ) {
    return this.boardsService.create(req.user.id, accountId, dto);
  }

  @Patch(':boardId')
  @ApiOperation({ summary: 'Update a board' })
  update(
    @Req() req,
    @Param('accountId') accountId: string,
    @Param('boardId') boardId: string,
    @Body() dto: UpdateBoardDto,
  ) {
    return this.boardsService.update(req.user.id, accountId, boardId, dto);
  }

  @Delete(':boardId')
  @ApiOperation({ summary: 'Delete a board' })
  remove(
    @Req() req,
    @Param('accountId') accountId: string,
    @Param('boardId') boardId: string,
  ) {
    return this.boardsService.remove(req.user.id, accountId, boardId);
  }

  @Post(':boardId/duplicate')
  @ApiOperation({ summary: 'Duplicate a board' })
  duplicate(
    @Req() req,
    @Param('accountId') accountId: string,
    @Param('boardId') boardId: string,
  ) {
    return this.boardsService.duplicate(req.user.id, accountId, boardId);
  }

  @Get(':boardId/export')
  @ApiOperation({ summary: 'Export board as manifest' })
  exportManifest(
    @Req() req,
    @Param('accountId') accountId: string,
    @Param('boardId') boardId: string,
  ) {
    return this.boardsService.exportManifest(req.user.id, accountId, boardId);
  }

  // ─── Board Integrations ──────────────────────────────────

  @Get(':boardId/integrations')
  @ApiOperation({ summary: 'Get board integration statuses' })
  getIntegrations(
    @Req() req,
    @Param('accountId') accountId: string,
    @Param('boardId') boardId: string,
  ) {
    return this.boardsService.getIntegrationStatuses(
      req.user.id,
      accountId,
      boardId,
    );
  }

  @Post(':boardId/integrations')
  @ApiOperation({ summary: 'Add integration to board' })
  addIntegration(
    @Req() req,
    @Param('accountId') accountId: string,
    @Param('boardId') boardId: string,
    @Body() body: any,
  ) {
    return this.boardsService.addIntegrationDefinition(
      req.user.id,
      accountId,
      boardId,
      body,
    );
  }

  @Patch(':boardId/integrations/:slug')
  @ApiOperation({ summary: 'Update board integration config' })
  updateIntegration(
    @Req() req,
    @Param('accountId') accountId: string,
    @Param('boardId') boardId: string,
    @Param('slug') slug: string,
    @Body() body: { enabled: boolean; config: Record<string, string> },
  ) {
    return this.boardsService.updateIntegrationConfig(
      req.user.id,
      accountId,
      boardId,
      slug,
      body,
    );
  }

  @Delete(':boardId/integrations/:slug')
  @ApiOperation({ summary: 'Remove integration from board' })
  removeIntegration(
    @Req() req,
    @Param('accountId') accountId: string,
    @Param('boardId') boardId: string,
    @Param('slug') slug: string,
  ) {
    return this.boardsService.removeIntegrationDefinition(
      req.user.id,
      accountId,
      boardId,
      slug,
    );
  }

  // ─── Board Steps CRUD ─────────────────────────────────────

  @Get(':boardId/steps')
  @ApiOperation({ summary: 'List board steps' })
  findAllSteps(
    @Req() req,
    @Param('accountId') accountId: string,
    @Param('boardId') boardId: string,
  ) {
    return this.boardStepsService.findAll(req.user.id, accountId, boardId);
  }

  @Post(':boardId/steps')
  @ApiOperation({ summary: 'Create a board step' })
  createStep(
    @Req() req,
    @Param('accountId') accountId: string,
    @Param('boardId') boardId: string,
    @Body() dto: CreateBoardStepDto,
  ) {
    return this.boardStepsService.create(req.user.id, accountId, boardId, dto);
  }

  @Patch(':boardId/steps/:stepId')
  @ApiOperation({ summary: 'Update a board step' })
  updateStep(
    @Req() req,
    @Param('accountId') accountId: string,
    @Param('boardId') boardId: string,
    @Param('stepId') stepId: string,
    @Body() dto: UpdateBoardStepDto,
  ) {
    return this.boardStepsService.update(
      req.user.id,
      accountId,
      boardId,
      stepId,
      dto,
    );
  }

  @Delete(':boardId/steps/:stepId')
  @ApiOperation({ summary: 'Delete a board step' })
  removeStep(
    @Req() req,
    @Param('accountId') accountId: string,
    @Param('boardId') boardId: string,
    @Param('stepId') stepId: string,
  ) {
    return this.boardStepsService.remove(
      req.user.id,
      accountId,
      boardId,
      stepId,
    );
  }

  @Post(':boardId/steps/reorder')
  @ApiOperation({ summary: 'Reorder board steps' })
  reorderSteps(
    @Req() req,
    @Param('accountId') accountId: string,
    @Param('boardId') boardId: string,
    @Body() body: { step_ids: string[] },
  ) {
    return this.boardStepsService.reorder(
      req.user.id,
      accountId,
      boardId,
      body.step_ids,
    );
  }
}
