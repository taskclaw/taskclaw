import {
  IsString,
  IsOptional,
  IsBoolean,
  IsArray,
  IsUUID,
  ValidateNested,
  IsNotEmpty,
} from 'class-validator';
import { Type } from 'class-transformer';

export class InlineStepDto {
  @IsNotEmpty()
  @IsString()
  step_key: string;

  @IsNotEmpty()
  @IsString()
  name: string;

  @IsOptional()
  @IsString()
  step_type?: string; // defaults to 'input' for first, 'done' for last, 'human_review' for middle

  @IsOptional()
  @IsString()
  color?: string;

  @IsOptional()
  @IsString()
  linked_category_id?: string; // Links step to a category for AI config inheritance
}

export class CreateBoardDto {
  @IsNotEmpty()
  @IsString()
  name: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  icon?: string;

  @IsOptional()
  @IsString()
  color?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];

  @IsOptional()
  @IsBoolean()
  is_favorite?: boolean;

  @IsOptional()
  @IsUUID()
  default_category_id?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => InlineStepDto)
  steps?: InlineStepDto[];
}
