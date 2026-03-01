import { IsOptional, IsInt, Min, Max, IsObject } from 'class-validator';

export class UpdateCommToolDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(1440)
  check_interval_minutes?: number;

  @IsOptional()
  @IsObject()
  config?: Record<string, any>;
}
