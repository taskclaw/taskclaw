import { IsString, IsOptional, IsBoolean, IsObject, IsIn } from 'class-validator';

export type TriggerType = 'auto' | 'ai_decision' | 'manual' | 'error' | 'fallback';

export class CreateBoardRouteDto {
  @IsString()
  source_board_id: string;

  @IsOptional()
  @IsString()
  source_step_id?: string;

  @IsString()
  target_board_id: string;

  @IsOptional()
  @IsString()
  target_step_id?: string;

  @IsOptional()
  @IsIn(['auto', 'ai_decision', 'manual', 'error', 'fallback'])
  trigger?: TriggerType;

  @IsOptional()
  @IsObject()
  transform_config?: Record<string, any>;

  @IsOptional()
  @IsBoolean()
  is_active?: boolean;

  @IsOptional()
  @IsString()
  label?: string;

  @IsOptional()
  @IsObject()
  conditions?: Record<string, any>;

  @IsOptional()
  @IsString()
  pod_id?: string;
}
