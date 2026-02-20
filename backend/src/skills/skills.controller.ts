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
import { FileInterceptor } from '@nestjs/platform-express';
import { SkillsService } from './skills.service';
import { CreateSkillDto } from './dto/create-skill.dto';
import { UpdateSkillDto } from './dto/update-skill.dto';
import { AuthGuard } from '../common/guards/auth.guard';

@Controller('accounts/:accountId/skills')
@UseGuards(AuthGuard)
export class SkillsController {
  constructor(private readonly skillsService: SkillsService) {}

  @Get()
  findAll(
    @Request() req,
    @Param('accountId') accountId: string,
    @Query('active_only') activeOnly?: string,
  ) {
    return this.skillsService.findAll(req.accessToken, accountId, activeOnly === 'true');
  }

  @Get('category-map')
  getCategorySkillsMap(
    @Request() req,
    @Param('accountId') accountId: string,
  ) {
    return this.skillsService.getCategorySkillsMap(req.accessToken, accountId);
  }

  @Get('category/:categoryId/default')
  findDefaultForCategory(
    @Request() req,
    @Param('accountId') accountId: string,
    @Param('categoryId') categoryId: string,
  ) {
    return this.skillsService.findDefaultForCategory(req.accessToken, accountId, categoryId);
  }

  @Post(':id/attachments')
  @UseInterceptors(FileInterceptor('file'))
  @HttpCode(HttpStatus.OK)
  uploadAttachment(
    @Request() req,
    @Param('accountId') accountId: string,
    @Param('id') skillId: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    if (!file) {
      throw new BadRequestException('No file provided');
    }
    return this.skillsService.uploadAttachment(
      req.accessToken,
      accountId,
      skillId,
      file,
    );
  }

  @Delete(':id/attachments/:filename')
  @HttpCode(HttpStatus.OK)
  removeAttachment(
    @Request() req,
    @Param('accountId') accountId: string,
    @Param('id') skillId: string,
    @Param('filename') filename: string,
  ) {
    return this.skillsService.removeAttachment(
      req.accessToken,
      accountId,
      skillId,
      filename,
    );
  }

  @Get(':id')
  findOne(@Request() req, @Param('accountId') accountId: string, @Param('id') id: string) {
    return this.skillsService.findOne(req.accessToken, accountId, id);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(
    @Request() req,
    @Param('accountId') accountId: string,
    @Body() createSkillDto: CreateSkillDto,
  ) {
    const userId = req.user?.id;
    return this.skillsService.create(req.accessToken, accountId, userId, createSkillDto);
  }

  @Patch(':id')
  update(
    @Request() req,
    @Param('accountId') accountId: string,
    @Param('id') id: string,
    @Body() updateSkillDto: UpdateSkillDto,
  ) {
    return this.skillsService.update(req.accessToken, accountId, id, updateSkillDto);
  }

  @Post(':skillId/link-category/:categoryId')
  @HttpCode(HttpStatus.OK)
  linkToCategory(
    @Request() req,
    @Param('accountId') accountId: string,
    @Param('skillId') skillId: string,
    @Param('categoryId') categoryId: string,
  ) {
    return this.skillsService.linkToCategory(req.accessToken, accountId, skillId, categoryId);
  }

  @Delete(':skillId/unlink-category/:categoryId')
  @HttpCode(HttpStatus.OK)
  unlinkFromCategory(
    @Request() req,
    @Param('accountId') accountId: string,
    @Param('skillId') skillId: string,
    @Param('categoryId') categoryId: string,
  ) {
    return this.skillsService.unlinkFromCategory(req.accessToken, accountId, skillId, categoryId);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  remove(@Request() req, @Param('accountId') accountId: string, @Param('id') id: string) {
    return this.skillsService.remove(req.accessToken, accountId, id);
  }
}
