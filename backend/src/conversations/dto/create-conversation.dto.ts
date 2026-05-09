import { IsString, IsOptional, IsUUID, IsArray } from 'class-validator';

export class CreateConversationDto {
  @IsString()
  @IsOptional()
  title?: string;

  @IsUUID()
  @IsOptional()
  task_id?: string; // Optional: Link conversation to a task

  @IsUUID()
  @IsOptional()
  board_id?: string; // Optional: Link conversation to a board (board-level AI chat)

  @IsUUID()
  @IsOptional()
  pod_id?: string; // Optional: Link conversation to a pod

  @IsUUID()
  @IsOptional()
  agent_id?: string; // Optional: Link conversation directly to an agent (F06)

  @IsArray()
  @IsUUID(4, { each: true })
  @IsOptional()
  skill_ids?: string[]; // Optional: Selected skills for this conversation

  @IsUUID()
  @IsOptional()
  backbone_connection_id?: string; // Optional: Pin conversation to a specific backbone
}
