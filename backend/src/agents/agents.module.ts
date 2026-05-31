import { Module } from '@nestjs/common';
import { AgentsService } from './agents.service';
import { AgentsController } from './agents.controller';
import { AgentActivityService } from './agent-activity.service';
import { CommonModule } from '../common/common.module';

@Module({
  imports: [ CommonModule],
  controllers: [AgentsController],
  providers: [AgentsService, AgentActivityService],
  exports: [AgentsService, AgentActivityService],
})
export class AgentsModule {}
