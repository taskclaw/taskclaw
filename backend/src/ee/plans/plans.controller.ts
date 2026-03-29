import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Request,
  UseGuards,
} from '@nestjs/common';
import { PlansService } from './plans.service';
import { AuthGuard } from '../../common/guards/auth.guard';
import { AdminGuard } from '../../common/guards/admin.guard';

@Controller('plans')
export class PlansController {
  constructor(private readonly plansService: PlansService) {}

  @Get()
  @UseGuards(AuthGuard)
  async getPlans(@Request() req) {
    const token = req.headers.authorization?.split(' ')[1];
    return this.plansService.getPlans(token);
  }

  @Post()
  @UseGuards(AuthGuard, AdminGuard)
  async createPlan(@Body() body: any) {
    return this.plansService.createPlan(body);
  }

  @Put(':id')
  @UseGuards(AuthGuard, AdminGuard)
  async updatePlan(@Param('id') id: string, @Body() body: any) {
    return this.plansService.updatePlan(id, body);
  }

  @Delete(':id')
  @UseGuards(AuthGuard, AdminGuard)
  async deletePlan(@Param('id') id: string) {
    return this.plansService.deletePlan(id);
  }
}
