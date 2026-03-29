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
import { TasksService } from './tasks.service';
import { CreateTaskDto } from './dto/create-task.dto';
import { UpdateTaskDto } from './dto/update-task.dto';
import { BulkCreateBoardTasksDto } from './dto/bulk-create-board-tasks.dto';
import { AuthGuard } from '../common/guards/auth.guard';

@ApiTags('Tasks')
@Controller('accounts/:accountId/tasks')
@UseGuards(AuthGuard)
export class TasksController {
  constructor(private readonly tasksService: TasksService) {}

  @Get()
  @ApiOperation({ summary: 'List tasks with optional filters' })
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

    return this.tasksService.findAll(
      req.user.id,
      accountId,
      filters,
      req.accessToken,
    );
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get task by ID' })
  findOne(
    @Req() req,
    @Param('accountId') accountId: string,
    @Param('id') id: string,
  ) {
    return this.tasksService.findOne(
      req.user.id,
      accountId,
      id,
      req.accessToken,
    );
  }

  @Get(':id/content')
  @ApiOperation({ summary: 'Get task content' })
  getContent(
    @Req() req,
    @Param('accountId') accountId: string,
    @Param('id') id: string,
  ) {
    return this.tasksService.getTaskContent(
      req.user.id,
      accountId,
      id,
      req.accessToken,
    );
  }

  @Get(':id/comments')
  @ApiOperation({ summary: 'Get task comments' })
  getComments(
    @Req() req,
    @Param('accountId') accountId: string,
    @Param('id') id: string,
  ) {
    return this.tasksService.getTaskComments(
      req.user.id,
      accountId,
      id,
      req.accessToken,
    );
  }

  @Get(':id/sync-status')
  @ApiOperation({ summary: 'Get task sync status' })
  getSyncStatus(
    @Req() req,
    @Param('accountId') accountId: string,
    @Param('id') id: string,
  ) {
    return this.tasksService.getSyncStatus(
      req.user.id,
      accountId,
      id,
      req.accessToken,
    );
  }

  @Get('search')
  @ApiOperation({ summary: 'Full-text search tasks by title and notes' })
  search(
    @Req() req,
    @Param('accountId') accountId: string,
    @Query('q') query: string,
  ) {
    return this.tasksService.search(
      req.user.id,
      accountId,
      query,
      req.accessToken,
    );
  }

  @Patch('bulk')
  @ApiOperation({ summary: 'Bulk update multiple tasks' })
  bulkUpdate(
    @Req() req,
    @Param('accountId') accountId: string,
    @Body()
    body: {
      updates: Array<{
        id: string;
        status?: string;
        priority?: string;
        current_step_id?: string;
        completed?: boolean;
      }>;
    },
  ) {
    return this.tasksService.bulkUpdate(
      req.user.id,
      accountId,
      body.updates,
      req.accessToken,
    );
  }

  @Post()
  @ApiOperation({ summary: 'Create a new task' })
  create(
    @Req() req,
    @Param('accountId') accountId: string,
    @Body() createTaskDto: CreateTaskDto,
  ) {
    return this.tasksService.create(
      req.user.id,
      accountId,
      createTaskDto,
      req.accessToken,
    );
  }

  @Post('bulk/:boardId')
  @ApiOperation({ summary: 'Bulk create tasks for a board' })
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
  @ApiOperation({ summary: 'Update a task' })
  update(
    @Req() req,
    @Param('accountId') accountId: string,
    @Param('id') id: string,
    @Body() updateTaskDto: UpdateTaskDto,
  ) {
    return this.tasksService.update(
      req.user.id,
      accountId,
      id,
      updateTaskDto,
      req.accessToken,
    );
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a task' })
  remove(
    @Req() req,
    @Param('accountId') accountId: string,
    @Param('id') id: string,
  ) {
    return this.tasksService.remove(
      req.user.id,
      accountId,
      id,
      req.accessToken,
    );
  }

  @Post(':id/ai-update')
  @ApiOperation({ summary: 'Save AI findings to task notes' })
  aiUpdate(
    @Req() req,
    @Param('accountId') accountId: string,
    @Param('id') id: string,
    @Body() body: { notes_append: string; conversation_id?: string },
  ) {
    return this.tasksService.aiUpdate(
      req.user.id,
      accountId,
      id,
      body,
      req.accessToken,
    );
  }

  @Post(':id/sync')
  @ApiOperation({ summary: 'Sync task to external source' })
  syncToSource(
    @Req() req,
    @Param('accountId') accountId: string,
    @Param('id') id: string,
  ) {
    return this.tasksService.syncToSource(
      req.user.id,
      accountId,
      id,
      req.accessToken,
    );
  }
}
