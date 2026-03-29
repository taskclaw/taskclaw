import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../common/guards/auth.guard';
import { AdminGuard } from '../common/guards/admin.guard';
import { ProjectsService } from './projects.service';

@Controller('admin/projects')
@UseGuards(AuthGuard, AdminGuard)
export class AdminProjectsController {
  constructor(private readonly projectsService: ProjectsService) {}

  @Get()
  async findAll(
    @Query('page') page: number = 1,
    @Query('limit') limit: number = 10,
    @Query('search') search?: string,
  ) {
    return this.projectsService.findAllProjects(
      Number(page),
      Number(limit),
      search,
    );
  }
}
