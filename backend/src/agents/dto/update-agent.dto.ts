import { PartialType } from '@nestjs/mapped-types';
import { CreateAgentDto } from './create-agent.dto';
import { IsOptional, IsIn } from 'class-validator';

export class UpdateAgentDto extends PartialType(CreateAgentDto) {
  @IsOptional()
  @IsIn(['idle', 'working', 'paused', 'error', 'offline'])
  status?: string;

  @IsOptional()
  is_active?: boolean;
}
