import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  UseGuards,
  Request,
} from '@nestjs/common';
import { ProjectsService } from './projects.service';
import { AuthGuard } from '../common/guards/auth.guard';

@Controller('projects')
@UseGuards(AuthGuard)
export class ProjectsController {
  constructor(private readonly projectsService: ProjectsService) {}

  @Get(':id')
  getProjectDetails(@Param('id') id: string, @Request() req) {
    const token = req.headers.authorization?.split(' ')[1];
    return this.projectsService.getProjectDetails(id, req.user.id, token);
  }

  @Put(':id')
  updateProject(
    @Param('id') id: string,
    @Body() body: { name: string; description?: string },
    @Request() req,
  ) {
    const token = req.headers.authorization?.split(' ')[1];
    return this.projectsService.updateProject(
      id,
      body.name,
      body.description,
      req.user.id,
      token,
    );
  }

  @Delete(':id')
  deleteProject(@Param('id') id: string, @Request() req) {
    const token = req.headers.authorization?.split(' ')[1];
    return this.projectsService.deleteProject(id, req.user.id, token);
  }
}

@Controller('accounts/:accountId/projects')
@UseGuards(AuthGuard)
export class AccountProjectsController {
  constructor(private readonly projectsService: ProjectsService) {}

  @Get()
  getAccountProjects(@Param('accountId') accountId: string, @Request() req) {
    const token = req.headers.authorization?.split(' ')[1];
    return this.projectsService.getAccountProjects(
      accountId,
      req.user.id,
      token,
    );
  }

  @Post()
  createProject(
    @Param('accountId') accountId: string,
    @Body() body: { name: string; description?: string },
    @Request() req,
  ) {
    const token = req.headers.authorization?.split(' ')[1];
    return this.projectsService.createProject(
      accountId,
      body.name,
      body.description,
      req.user.id,
      token,
    );
  }
}
