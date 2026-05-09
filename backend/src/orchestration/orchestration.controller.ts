import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  UseGuards,
  Req,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { OrchestrationService } from './orchestration.service';
import { CreateOrchestrationDto } from './orchestration.dto';
import { AuthGuard } from '../common/guards/auth.guard';

@ApiTags('Orchestrations')
@Controller('accounts/:accountId/orchestrations')
@UseGuards(AuthGuard)
export class OrchestrationController {
  constructor(private readonly orchestrationService: OrchestrationService) {}

  @Get()
  @ApiOperation({ summary: 'List all orchestrations for an account' })
  listOrchestrations(
    @Req() req,
    @Param('accountId') accountId: string,
  ) {
    return this.orchestrationService.listOrchestrations(req.user.id, accountId);
  }

  @Post()
  @ApiOperation({ summary: 'Create a new orchestration DAG' })
  createOrchestration(
    @Req() req,
    @Param('accountId') accountId: string,
    @Body() dto: CreateOrchestrationDto,
  ) {
    return this.orchestrationService.createOrchestration(
      req.user.id,
      accountId,
      dto,
    );
  }

  @Get(':oid')
  @ApiOperation({ summary: 'Get an orchestration with all tasks and deps' })
  getOrchestration(
    @Req() req,
    @Param('accountId') accountId: string,
    @Param('oid') oid: string,
  ) {
    return this.orchestrationService.getOrchestration(
      req.user.id,
      accountId,
      oid,
    );
  }

  @Post(':oid/approve')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Approve a pending_approval orchestration' })
  approveOrchestration(
    @Req() req,
    @Param('accountId') accountId: string,
    @Param('oid') oid: string,
  ) {
    return this.orchestrationService.approveOrchestration(
      req.user.id,
      accountId,
      oid,
    );
  }

  @Post(':oid/reject')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Reject and cancel an orchestration' })
  rejectOrchestration(
    @Req() req,
    @Param('accountId') accountId: string,
    @Param('oid') oid: string,
  ) {
    return this.orchestrationService.rejectOrchestration(
      req.user.id,
      accountId,
      oid,
    );
  }
}
