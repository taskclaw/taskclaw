import {
  IsString,
  IsOptional,
  IsBoolean,
  IsInt,
  Min,
  Max,
} from 'class-validator';

export class CreateHeartbeatDto {
  @IsString()
  name: string;

  @IsOptional()
  @IsString()
  schedule?: string;

  @IsOptional()
  @IsString()
  prompt?: string;

  @IsOptional()
  @IsBoolean()
  is_active?: boolean;

  @IsOptional()
  @IsBoolean()
  dry_run?: boolean;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(50)
  max_tasks_per_run?: number;

  @IsOptional()
  @IsString()
  pod_id?: string;

  @IsOptional()
  @IsString()
  board_id?: string;
}
