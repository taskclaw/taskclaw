import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Query,
  UseGuards,
  Req,
  ParseIntPipe,
  DefaultValuePipe,
} from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { ConversationsService } from './conversations.service';
import { CreateConversationDto } from './dto/create-conversation.dto';
import { SendMessageDto } from './dto/send-message.dto';
import { UpdateConversationDto } from './dto/update-conversation.dto';
import { AuthGuard } from '../common/guards/auth.guard';

@ApiTags('Conversations')
@Controller('accounts/:accountId/conversations')
@UseGuards(AuthGuard)
export class ConversationsController {
  constructor(private readonly conversationsService: ConversationsService) {}

  /**
   * GET /accounts/:accountId/conversations
   * List user's conversations with pagination
   */
  @Get()
  @ApiOperation({ summary: 'List conversations with pagination' })
  findAll(
    @Req() req,
    @Param('accountId') accountId: string,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
    @Query('task_id') taskId?: string,
    @Query('board_id') boardId?: string,
    @Query('pod_id') podId?: string,
    @Query('agent_id') agentId?: string,
  ) {
    return this.conversationsService.findAll(
      req.user.id,
      accountId,
      req.accessToken,
      page,
      limit,
      taskId,
      boardId,
      podId,
      agentId,
    );
  }

  /**
   * GET /accounts/:accountId/conversations/:id
   * Get conversation details
   */
  @Get(':id')
  @ApiOperation({ summary: 'Get conversation by ID' })
  findOne(
    @Req() req,
    @Param('accountId') accountId: string,
    @Param('id') id: string,
  ) {
    return this.conversationsService.findOne(
      req.user.id,
      accountId,
      id,
      req.accessToken,
    );
  }

  /**
   * POST /accounts/:accountId/conversations
   * Create a new conversation
   */
  @Post()
  @ApiOperation({ summary: 'Create a new conversation' })
  create(
    @Req() req,
    @Param('accountId') accountId: string,
    @Body() createConversationDto: CreateConversationDto,
  ) {
    return this.conversationsService.create(
      req.user.id,
      accountId,
      createConversationDto,
      req.accessToken,
    );
  }

  /**
   * GET /accounts/:accountId/conversations/:id/messages
   * Get messages for a conversation
   */
  @Get(':id/messages')
  @ApiOperation({ summary: 'Get messages for a conversation' })
  getMessages(
    @Req() req,
    @Param('accountId') accountId: string,
    @Param('id') id: string,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(50), ParseIntPipe) limit: number,
  ) {
    return this.conversationsService.getMessages(
      req.user.id,
      accountId,
      id,
      req.accessToken,
      page,
      limit,
    );
  }

  /**
   * POST /accounts/:accountId/conversations/:id/messages/background
   * Send a message and process AI response in background.
   * Returns immediately after storing user message. Task moves to "AI Running" then "In Review" when AI responds.
   */
  @Post(':id/messages/background')
  @ApiOperation({ summary: 'Send message with background AI processing' })
  sendMessageBackground(
    @Req() req,
    @Param('accountId') accountId: string,
    @Param('id') id: string,
    @Body() sendMessageDto: SendMessageDto,
  ) {
    return this.conversationsService.sendMessageBackground(
      req.user.id,
      accountId,
      id,
      sendMessageDto,
      req.accessToken,
    );
  }

  /**
   * POST /accounts/:accountId/conversations/:id/messages
   * Send a message and get AI response
   */
  @Post(':id/messages')
  @ApiOperation({ summary: 'Send message and get AI response' })
  sendMessage(
    @Req() req,
    @Param('accountId') accountId: string,
    @Param('id') id: string,
    @Body() sendMessageDto: SendMessageDto,
  ) {
    return this.conversationsService.sendMessage(
      req.user.id,
      accountId,
      id,
      sendMessageDto,
      req.accessToken,
    );
  }

  /**
   * PATCH /accounts/:accountId/conversations/:id
   * Update conversation (e.g., change title)
   */
  @Patch(':id')
  @ApiOperation({ summary: 'Update conversation' })
  update(
    @Req() req,
    @Param('accountId') accountId: string,
    @Param('id') id: string,
    @Body() updateConversationDto: UpdateConversationDto,
  ) {
    return this.conversationsService.update(
      req.user.id,
      accountId,
      id,
      updateConversationDto,
      req.accessToken,
    );
  }

  /**
   * DELETE /accounts/:accountId/conversations/:id
   * Delete conversation and all messages
   */
  @Delete(':id')
  @ApiOperation({ summary: 'Delete conversation and messages' })
  remove(
    @Req() req,
    @Param('accountId') accountId: string,
    @Param('id') id: string,
  ) {
    return this.conversationsService.remove(
      req.user.id,
      accountId,
      id,
      req.accessToken,
    );
  }
}
