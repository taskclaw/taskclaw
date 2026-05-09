import {
  IsNotEmpty,
  IsOptional,
  IsString,
  IsInt,
  IsArray,
  IsObject,
  Min,
  Max,
  ValidateNested,
  ArrayMinSize,
} from 'class-validator';
import { Type } from 'class-transformer';

export class OrchestrationTaskDto {
  @IsNotEmpty()
  @IsString()
  pod_id: string;

  @IsNotEmpty()
  @IsString()
  goal: string;

  @IsOptional()
  @IsObject()
  input_context?: Record<string, unknown>;

  @IsOptional()
  @IsArray()
  depends_on_indices?: number[];
}

export class CreateOrchestrationDto {
  @IsNotEmpty()
  @IsString()
  goal: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => OrchestrationTaskDto)
  tasks: OrchestrationTaskDto[];

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(4)
  autonomy_level?: number;
}
