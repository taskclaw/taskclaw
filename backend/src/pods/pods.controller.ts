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
} from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { PodsService } from './pods.service';
import { PodBundleService } from './pod-bundle.service';
import { CreatePodDto } from './dto/create-pod.dto';
import { UpdatePodDto } from './dto/update-pod.dto';
import { AuthGuard } from '../common/guards/auth.guard';

@ApiTags('Pods')
@Controller('accounts/:accountId/pods')
@UseGuards(AuthGuard)
export class PodsController {
  constructor(
    private readonly podsService: PodsService,
    private readonly bundleService: PodBundleService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'List all pods' })
  findAll(@Req() req, @Param('accountId') accountId: string) {
    return this.podsService.findAll(req.user.id, accountId);
  }

  @Get('by-slug/:slug')
  @ApiOperation({ summary: 'Get pod by slug' })
  findBySlug(
    @Req() req,
    @Param('accountId') accountId: string,
    @Param('slug') slug: string,
  ) {
    return this.podsService.findBySlug(req.user.id, accountId, slug);
  }

  // PRD §6 — pod bundle export/import. Routes declared before `:podId`
  // routes so the literal /import path wins NestJS routing.
  @Post('import')
  @ApiOperation({ summary: 'Import a Pod Bundle (PRD §6)' })
  importBundle(
    @Req() req,
    @Param('accountId') accountId: string,
    @Body() body: unknown,
  ) {
    return this.bundleService.import(accountId, body);
  }

  @Get(':podId/export')
  @ApiOperation({ summary: 'Export a Pod as a portable bundle' })
  exportBundle(
    @Req() req,
    @Param('accountId') accountId: string,
    @Param('podId') podId: string,
  ) {
    return this.bundleService.export(accountId, podId);
  }

  @Get(':podId')
  @ApiOperation({ summary: 'Get pod by ID' })
  findOne(
    @Req() req,
    @Param('accountId') accountId: string,
    @Param('podId') podId: string,
  ) {
    return this.podsService.findOne(req.user.id, accountId, podId);
  }

  @Post()
  @ApiOperation({ summary: 'Create a new pod' })
  create(
    @Req() req,
    @Param('accountId') accountId: string,
    @Body() dto: CreatePodDto,
  ) {
    return this.podsService.create(req.user.id, accountId, dto);
  }

  @Patch(':podId')
  @ApiOperation({ summary: 'Update a pod' })
  update(
    @Req() req,
    @Param('accountId') accountId: string,
    @Param('podId') podId: string,
    @Body() dto: UpdatePodDto,
  ) {
    return this.podsService.update(req.user.id, accountId, podId, dto);
  }

  @Delete(':podId')
  @ApiOperation({ summary: 'Delete a pod' })
  delete(
    @Req() req,
    @Param('accountId') accountId: string,
    @Param('podId') podId: string,
  ) {
    return this.podsService.delete(req.user.id, accountId, podId);
  }
}
