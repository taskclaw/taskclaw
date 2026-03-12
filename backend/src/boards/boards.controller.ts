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
import { BoardsService } from './boards.service';
import { BoardStepsService } from './board-steps.service';
import { BoardTemplatesService } from './board-templates.service';
import { BundleImportService } from './bundle-import.service';
import { CreateBoardDto } from './dto/create-board.dto';
import { UpdateBoardDto } from './dto/update-board.dto';
import { CreateBoardStepDto } from './dto/create-board-step.dto';
import { UpdateBoardStepDto } from './dto/update-board-step.dto';
import { AuthGuard } from '../common/guards/auth.guard';

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
  findAll(
    @Req() req,
    @Param('accountId') accountId: string,
    @Query('archived') archived?: string,
    @Query('favorite') favorite?: string,
  ) {
    const filters: any = {};
    if (archived !== undefined) filters.archived = archived === 'true';
    if (favorite !== undefined) filters.favorite = favorite === 'true';

    return this.boardsService.findAll(req.user.id, accountId, filters);
  }

  @Post('import')
  importManifest(
    @Req() req,
    @Param('accountId') accountId: string,
    @Body() manifest: any,
  ) {
    return this.boardTemplatesService.importManifest(req.user.id, accountId, manifest);
  }

  @Post('bundle-import')
  importBundle(
    @Req() req,
    @Param('accountId') accountId: string,
    @Body() bundle: any,
  ) {
    return this.bundleImportService.importBundle(req.user.id, accountId, bundle);
  }

  @Get(':boardId')
  findOne(
    @Req() req,
    @Param('accountId') accountId: string,
    @Param('boardId') boardId: string,
  ) {
    return this.boardsService.findOne(req.user.id, accountId, boardId);
  }

  @Post()
  create(
    @Req() req,
    @Param('accountId') accountId: string,
    @Body() dto: CreateBoardDto,
  ) {
    return this.boardsService.create(req.user.id, accountId, dto);
  }

  @Patch(':boardId')
  update(
    @Req() req,
    @Param('accountId') accountId: string,
    @Param('boardId') boardId: string,
    @Body() dto: UpdateBoardDto,
  ) {
    return this.boardsService.update(req.user.id, accountId, boardId, dto);
  }

  @Delete(':boardId')
  remove(
    @Req() req,
    @Param('accountId') accountId: string,
    @Param('boardId') boardId: string,
  ) {
    return this.boardsService.remove(req.user.id, accountId, boardId);
  }

  @Post(':boardId/duplicate')
  duplicate(
    @Req() req,
    @Param('accountId') accountId: string,
    @Param('boardId') boardId: string,
  ) {
    return this.boardsService.duplicate(req.user.id, accountId, boardId);
  }

  @Get(':boardId/export')
  exportManifest(
    @Req() req,
    @Param('accountId') accountId: string,
    @Param('boardId') boardId: string,
  ) {
    return this.boardsService.exportManifest(req.user.id, accountId, boardId);
  }

  // ─── Board Steps CRUD ─────────────────────────────────────

  @Get(':boardId/steps')
  findAllSteps(
    @Req() req,
    @Param('accountId') accountId: string,
    @Param('boardId') boardId: string,
  ) {
    return this.boardStepsService.findAll(req.user.id, accountId, boardId);
  }

  @Post(':boardId/steps')
  createStep(
    @Req() req,
    @Param('accountId') accountId: string,
    @Param('boardId') boardId: string,
    @Body() dto: CreateBoardStepDto,
  ) {
    return this.boardStepsService.create(req.user.id, accountId, boardId, dto);
  }

  @Patch(':boardId/steps/:stepId')
  updateStep(
    @Req() req,
    @Param('accountId') accountId: string,
    @Param('boardId') boardId: string,
    @Param('stepId') stepId: string,
    @Body() dto: UpdateBoardStepDto,
  ) {
    return this.boardStepsService.update(req.user.id, accountId, boardId, stepId, dto);
  }

  @Delete(':boardId/steps/:stepId')
  removeStep(
    @Req() req,
    @Param('accountId') accountId: string,
    @Param('boardId') boardId: string,
    @Param('stepId') stepId: string,
  ) {
    return this.boardStepsService.remove(req.user.id, accountId, boardId, stepId);
  }

  @Post(':boardId/steps/reorder')
  reorderSteps(
    @Req() req,
    @Param('accountId') accountId: string,
    @Param('boardId') boardId: string,
    @Body() body: { step_ids: string[] },
  ) {
    return this.boardStepsService.reorder(req.user.id, accountId, boardId, body.step_ids);
  }
}
