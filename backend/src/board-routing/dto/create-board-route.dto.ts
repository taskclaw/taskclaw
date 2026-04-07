import { IsString, IsOptional, IsBoolean, IsObject, IsIn } from 'class-validator';

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
  @IsIn(['auto', 'ai_decision', 'manual'])
  trigger?: 'auto' | 'ai_decision' | 'manual';

  @IsOptional()
  @IsObject()
  transform_config?: Record<string, any>;

  @IsOptional()
  @IsBoolean()
  is_active?: boolean;
}
