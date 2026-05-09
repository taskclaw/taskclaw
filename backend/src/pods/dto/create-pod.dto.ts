import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsUUID,
  IsNumber,
  IsObject,
} from 'class-validator';

export class CreatePodDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsString()
  @IsOptional()
  slug?: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsString()
  @IsOptional()
  icon?: string;

  @IsString()
  @IsOptional()
  color?: string;

  @IsUUID()
  @IsOptional()
  backbone_connection_id?: string;

  @IsObject()
  @IsOptional()
  agent_config?: Record<string, any>;

  @IsNumber()
  @IsOptional()
  position?: number;

  @IsNumber()
  @IsOptional()
  autonomy_level?: number;
}
