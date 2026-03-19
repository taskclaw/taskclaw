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
import { TasksService } from './tasks.service';
import { CreateTaskDto } from './dto/create-task.dto';
import { UpdateTaskDto } from './dto/update-task.dto';
import { BulkCreateBoardTasksDto } from './dto/bulk-create-board-tasks.dto';
import { AuthGuard } from '../common/guards/auth.guard';

@Controller('accounts/:accountId/tasks')
@UseGuards(AuthGuard)
export class TasksController {
  constructor(private readonly tasksService: TasksService) {}

  @Get()
  findAll(
    @Req() req,
    @Param('accountId') accountId: string,
    @Query('category_id') categoryId?: string,
    @Query('source_id') sourceId?: string,
    @Query('status') status?: string,
    @Query('priority') priority?: string,
    @Query('completed') completed?: string,
    @Query('board_id') boardId?: string,
  ) {
    const filters: any = {};
    if (categoryId) filters.category_id = categoryId;
    if (sourceId) filters.source_id = sourceId;
    if (status) filters.status = status;
    if (priority) filters.priority = priority;
    if (completed !== undefined) filters.completed = completed === 'true';
    if (boardId) filters.board_id = boardId;

    return this.tasksService.findAll(req.user.id, accountId, filters, req.accessToken);
  }

  @Get(':id')
  findOne(
    @Req() req,
    @Param('accountId') accountId: string,
    @Param('id') id: string,
  ) {
    return this.tasksService.findOne(req.user.id, accountId, id, req.accessToken);
  }

  @Get(':id/content')
  getContent(
    @Req() req,
    @Param('accountId') accountId: string,
    @Param('id') id: string,
  ) {
    return this.tasksService.getTaskContent(req.user.id, accountId, id, req.accessToken);
  }

  @Get(':id/comments')
  getComments(
    @Req() req,
    @Param('accountId') accountId: string,
    @Param('id') id: string,
  ) {
    return this.tasksService.getTaskComments(req.user.id, accountId, id, req.accessToken);
  }

  @Get(':id/sync-status')
  getSyncStatus(
    @Req() req,
    @Param('accountId') accountId: string,
    @Param('id') id: string,
  ) {
    return this.tasksService.getSyncStatus(req.user.id, accountId, id, req.accessToken);
  }

  @Post()
  create(
    @Req() req,
    @Param('accountId') accountId: string,
    @Body() createTaskDto: CreateTaskDto,
  ) {
    return this.tasksService.create(req.user.id, accountId, createTaskDto, req.accessToken);
  }

  /**
   * Bulk-create tasks for a board (used by Board AI Chat after user confirms)
   */
  @Post('bulk/:boardId')
  bulkCreateForBoard(
    @Req() req,
    @Param('accountId') accountId: string,
    @Param('boardId') boardId: string,
    @Body() dto: BulkCreateBoardTasksDto,
  ) {
    return this.tasksService.bulkCreateForBoard(
      req.user.id,
      accountId,
      boardId,
      dto.tasks,
      req.accessToken,
    );
  }

  @Patch(':id')
  update(
    @Req() req,
    @Param('accountId') accountId: string,
    @Param('id') id: string,
    @Body() updateTaskDto: UpdateTaskDto,
  ) {
    return this.tasksService.update(req.user.id, accountId, id, updateTaskDto, req.accessToken);
  }

  @Delete(':id')
  remove(
    @Req() req,
    @Param('accountId') accountId: string,
    @Param('id') id: string,
  ) {
    return this.tasksService.remove(req.user.id, accountId, id, req.accessToken);
  }

  /**
   * Sprint 7: Save AI findings to task notes and trigger outbound sync
   */
  @Post(':id/ai-update')
  aiUpdate(
    @Req() req,
    @Param('accountId') accountId: string,
    @Param('id') id: string,
    @Body() body: { notes_append: string; conversation_id?: string },
  ) {
    return this.tasksService.aiUpdate(req.user.id, accountId, id, body, req.accessToken);
  }

  /**
   * Sprint 7: Manually push task changes to external source
   */
  @Post(':id/sync')
  syncToSource(
    @Req() req,
    @Param('accountId') accountId: string,
    @Param('id') id: string,
  ) {
    return this.tasksService.syncToSource(req.user.id, accountId, id, req.accessToken);
  }
}
