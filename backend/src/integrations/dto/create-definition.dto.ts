import {
  IsString,
  IsOptional,
  IsBoolean,
  IsArray,
  IsIn,
  IsObject,
  MaxLength,
} from 'class-validator';

export class CreateDefinitionDto {
  @IsString()
  @MaxLength(100)
  slug: string;

  @IsString()
  @MaxLength(200)
  name: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  icon?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  categories?: string[];

  @IsString()
  @IsIn(['api_key', 'oauth2', 'webhook', 'basic', 'none'])
  auth_type: string;

  @IsOptional()
  @IsObject()
  auth_config?: Record<string, any>;

  @IsOptional()
  @IsArray()
  config_fields?: any[];

  @IsOptional()
  @IsString()
  skill_id?: string;

  @IsOptional()
  @IsString()
  setup_guide?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  proxy_base_url?: string;
}
