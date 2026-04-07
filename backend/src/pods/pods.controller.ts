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
import { CreatePodDto } from './dto/create-pod.dto';
import { UpdatePodDto } from './dto/update-pod.dto';
import { AuthGuard } from '../common/guards/auth.guard';

@ApiTags('Pods')
@Controller('accounts/:accountId/pods')
@UseGuards(AuthGuard)
export class PodsController {
  constructor(private readonly podsService: PodsService) {}

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
