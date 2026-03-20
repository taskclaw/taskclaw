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
  UseInterceptors,
  UploadedFile,
  Request,
  HttpCode,
  HttpStatus,
  BadRequestException,
} from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';
import { KnowledgeService } from './knowledge.service';
import { CreateKnowledgeDocDto } from './dto/create-knowledge-doc.dto';
import { UpdateKnowledgeDocDto } from './dto/update-knowledge-doc.dto';
import { AuthGuard } from '../common/guards/auth.guard';

@ApiTags('Knowledge')
@Controller('accounts/:accountId/knowledge')
@UseGuards(AuthGuard)
export class KnowledgeController {
  constructor(private readonly knowledgeService: KnowledgeService) {}

  @Get()
  findAll(
    @Request() req,
    @Param('accountId') accountId: string,
    @Query('category_id') categoryId?: string,
  ) {
    return this.knowledgeService.findAll(req.accessToken, accountId, categoryId);
  }

  @Get('master')
  findMasterForCategory(
    @Request() req,
    @Param('accountId') accountId: string,
    @Query('category_id') categoryId: string,
  ) {
    if (!categoryId) {
      throw new Error('category_id query param is required');
    }
    return this.knowledgeService.findMasterForCategory(req.accessToken, accountId, categoryId);
  }

  @Get(':id/attachments/:filename/content')
  getAttachmentContent(
    @Request() req,
    @Param('accountId') accountId: string,
    @Param('id') docId: string,
    @Param('filename') filename: string,
  ) {
    return this.knowledgeService.getAttachmentContent(
      req.accessToken,
      accountId,
      docId,
      filename,
    );
  }

  @Get(':id')
  findOne(@Request() req, @Param('accountId') accountId: string, @Param('id') id: string) {
    return this.knowledgeService.findOne(req.accessToken, accountId, id);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(
    @Request() req,
    @Param('accountId') accountId: string,
    @Body() createKnowledgeDocDto: CreateKnowledgeDocDto,
  ) {
    const userId = req.user?.id;
    return this.knowledgeService.create(req.accessToken, accountId, userId, createKnowledgeDocDto);
  }

  @Patch(':id')
  update(
    @Request() req,
    @Param('accountId') accountId: string,
    @Param('id') id: string,
    @Body() updateKnowledgeDocDto: UpdateKnowledgeDocDto,
  ) {
    return this.knowledgeService.update(req.accessToken, accountId, id, updateKnowledgeDocDto);
  }

  @Post(':id/set-master')
  @HttpCode(HttpStatus.OK)
  setAsMaster(@Request() req, @Param('accountId') accountId: string, @Param('id') id: string) {
    return this.knowledgeService.setAsMaster(req.accessToken, accountId, id);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  remove(@Request() req, @Param('accountId') accountId: string, @Param('id') id: string) {
    return this.knowledgeService.remove(req.accessToken, accountId, id);
  }

  @Post(':id/attachments')
  @UseInterceptors(FileInterceptor('file'))
  @HttpCode(HttpStatus.OK)
  uploadAttachment(
    @Request() req,
    @Param('accountId') accountId: string,
    @Param('id') docId: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    if (!file) {
      throw new BadRequestException('No file provided');
    }
    return this.knowledgeService.uploadAttachment(
      req.accessToken,
      accountId,
      docId,
      file,
    );
  }

  @Delete(':id/attachments/:filename')
  @HttpCode(HttpStatus.OK)
  removeAttachment(
    @Request() req,
    @Param('accountId') accountId: string,
    @Param('id') docId: string,
    @Param('filename') filename: string,
  ) {
    return this.knowledgeService.removeAttachment(
      req.accessToken,
      accountId,
      docId,
      filename,
    );
  }
}
