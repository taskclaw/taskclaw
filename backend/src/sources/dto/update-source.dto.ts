import {
  IsOptional,
  IsString,
  IsUUID,
  IsObject,
  IsBoolean,
  IsInt,
  IsArray,
  Min,
} from 'class-validator';

export class UpdateSourceDto {
  @IsOptional()
  @IsUUID()
  category_id?: string;

  @IsOptional()
  @IsObject()
  config?: Record<string, any>;

  @IsOptional()
  @IsInt()
  @Min(1)
  sync_interval_minutes?: number;

  @IsOptional()
  @IsBoolean()
  is_active?: boolean;

  @IsOptional()
  @IsArray()
  sync_filters?: Array<{
    property: string;
    type: string;
    condition: string;
    value: any;
  }>;

  @IsOptional()
  @IsString()
  category_property?: string | null;
}
