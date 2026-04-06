import {
  IsString,
  IsOptional,
  IsBoolean,
  IsArray,
  IsInt,
  IsUUID,
  IsObject,
  ValidateIf,
} from 'class-validator';

export class UpdateBoardDto {
  @IsOptional()
  @IsString()
  name?: string;

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
  @IsInt()
  display_order?: number;

  @IsOptional()
  @IsBoolean()
  is_archived?: boolean;

  @IsOptional()
  @ValidateIf((_o, v) => v !== null)
  @IsUUID()
  default_category_id?: string | null;

  @IsOptional()
  @ValidateIf((_o, v) => v !== null)
  @IsUUID()
  orchestrator_category_id?: string | null;

  @IsOptional()
  @ValidateIf((_o, v) => v !== null)
  @IsUUID()
  default_backbone_connection_id?: string | null;

  @IsOptional()
  @IsObject()
  settings_override?: Record<string, any>;
}
