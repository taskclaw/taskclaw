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
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { AgentsService } from './agents.service';
import { AgentActivityService } from './agent-activity.service';
import { CreateAgentDto } from './dto/create-agent.dto';
import { UpdateAgentDto } from './dto/update-agent.dto';
import { AuthGuard } from '../common/guards/auth.guard';

@ApiTags('Agents')
@Controller('accounts/:accountId/agents')
@UseGuards(AuthGuard)
export class AgentsController {
  constructor(
    private readonly agentsService: AgentsService,
    private readonly agentActivityService: AgentActivityService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'List agents in an account' })
  findAll(
    @Req() req,
    @Param('accountId') accountId: string,
    @Query('status') status?: string,
    @Query('agent_type') agent_type?: string,
  ) {
    return this.agentsService.findAll(req.user.id, accountId, {
      status,
      agent_type,
    });
  }

  @Get(':agentId')
  @ApiOperation({ summary: 'Get an agent by ID' })
  findOne(
    @Req() req,
    @Param('accountId') accountId: string,
    @Param('agentId') agentId: string,
  ) {
    return this.agentsService.findOne(req.user.id, accountId, agentId);
  }

  @Post()
  @ApiOperation({ summary: 'Create a new agent' })
  create(
    @Req() req,
    @Param('accountId') accountId: string,
    @Body() dto: CreateAgentDto,
  ) {
    return this.agentsService.create(req.user.id, accountId, dto);
  }

  @Patch(':agentId')
  @ApiOperation({ summary: 'Update an agent' })
  update(
    @Req() req,
    @Param('accountId') accountId: string,
    @Param('agentId') agentId: string,
    @Body() dto: UpdateAgentDto,
  ) {
    return this.agentsService.update(req.user.id, accountId, agentId, dto);
  }

  @Delete(':agentId')
  @ApiOperation({ summary: 'Soft-deactivate an agent (is_active=false)' })
  remove(
    @Req() req,
    @Param('accountId') accountId: string,
    @Param('agentId') agentId: string,
  ) {
    return this.agentsService.remove(req.user.id, accountId, agentId);
  }

  @Post(':agentId/pause')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Pause an agent (status=paused)' })
  pause(
    @Req() req,
    @Param('accountId') accountId: string,
    @Param('agentId') agentId: string,
  ) {
    return this.agentsService.pause(req.user.id, accountId, agentId);
  }

  @Post(':agentId/resume')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Resume a paused agent (status=idle)' })
  resume(
    @Req() req,
    @Param('accountId') accountId: string,
    @Param('agentId') agentId: string,
  ) {
    return this.agentsService.resume(req.user.id, accountId, agentId);
  }

  @Post(':agentId/clone')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Clone an agent with a new name' })
  clone(
    @Req() req,
    @Param('accountId') accountId: string,
    @Param('agentId') agentId: string,
    @Body('name') newName?: string,
  ) {
    return this.agentsService.clone(req.user.id, accountId, agentId, newName);
  }

  @Get(':agentId/activity')
  @ApiOperation({ summary: 'Get paginated activity feed for an agent' })
  getActivity(
    @Req() req,
    @Param('accountId') accountId: string,
    @Param('agentId') agentId: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.agentActivityService.getActivity(
      accountId,
      agentId,
      page ? parseInt(page) : 1,
      limit ? parseInt(limit) : 20,
    );
  }

  @Get(':agentId/skills')
  @ApiOperation({ summary: 'Get skills linked to an agent' })
  getSkills(
    @Req() req,
    @Param('accountId') accountId: string,
    @Param('agentId') agentId: string,
  ) {
    return this.agentsService.getAgentSkills(req.user.id, accountId, agentId);
  }

  @Post(':agentId/skills/:skillId')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Add a skill to an agent' })
  addSkill(
    @Req() req,
    @Param('accountId') accountId: string,
    @Param('agentId') agentId: string,
    @Param('skillId') skillId: string,
  ) {
    return this.agentsService.addSkillToAgent(req.user.id, accountId, agentId, skillId);
  }

  @Delete(':agentId/skills/:skillId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Remove a skill from an agent' })
  removeSkill(
    @Req() req,
    @Param('accountId') accountId: string,
    @Param('agentId') agentId: string,
    @Param('skillId') skillId: string,
  ) {
    return this.agentsService.removeSkillFromAgent(req.user.id, accountId, agentId, skillId);
  }

  @Get(':agentId/knowledge')
  @ApiOperation({ summary: 'Get knowledge docs for an agent' })
  getKnowledge(
    @Req() req,
    @Param('accountId') accountId: string,
    @Param('agentId') agentId: string,
  ) {
    return this.agentsService.getAgentKnowledge(req.user.id, accountId, agentId);
  }
}
