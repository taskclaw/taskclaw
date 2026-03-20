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
import { CategoriesService } from './categories.service';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';
import { AuthGuard } from '../common/guards/auth.guard';
import { PlanLimitGuard, PlanResource } from '../common/guards/plan-limit.guard';

@ApiTags('Categories')
@Controller('accounts/:accountId/categories')
@UseGuards(AuthGuard)
export class CategoriesController {
  constructor(private readonly categoriesService: CategoriesService) {}

  @Get()
  findAll(@Req() req, @Param('accountId') accountId: string) {
    return this.categoriesService.findAll(req.user.id, accountId, req.accessToken);
  }

  @Get(':id')
  findOne(
    @Req() req,
    @Param('accountId') accountId: string,
    @Param('id') id: string,
  ) {
    return this.categoriesService.findOne(req.user.id, accountId, id, req.accessToken);
  }

  @Post()
  @UseGuards(PlanLimitGuard)
  @PlanResource('categories')
  create(
    @Req() req,
    @Param('accountId') accountId: string,
    @Body() createCategoryDto: CreateCategoryDto,
  ) {
    return this.categoriesService.create(
      req.user.id,
      accountId,
      createCategoryDto,
      req.accessToken,
    );
  }

  @Post('bulk')
  @UseGuards(PlanLimitGuard)
  @PlanResource('categories')
  createBulk(
    @Req() req,
    @Param('accountId') accountId: string,
    @Body() categories: CreateCategoryDto[],
  ) {
    return this.categoriesService.createBulk(
      req.user.id,
      accountId,
      categories,
      req.accessToken,
    );
  }

  @Patch(':id')
  update(
    @Req() req,
    @Param('accountId') accountId: string,
    @Param('id') id: string,
    @Body() updateCategoryDto: UpdateCategoryDto,
  ) {
    return this.categoriesService.update(
      req.user.id,
      accountId,
      id,
      updateCategoryDto,
      req.accessToken,
    );
  }

  @Delete(':id')
  remove(
    @Req() req,
    @Param('accountId') accountId: string,
    @Param('id') id: string,
  ) {
    return this.categoriesService.remove(req.user.id, accountId, id, req.accessToken);
  }
}
