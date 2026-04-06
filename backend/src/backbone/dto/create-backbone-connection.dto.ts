import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsBoolean,
  IsObject,
} from 'class-validator';

export class CreateBackboneConnectionDto {
  @IsString()
  @IsNotEmpty()
  backbone_type: string; // slug matching a registered adapter (e.g. 'openclaw')

  @IsString()
  @IsNotEmpty()
  name: string; // human-readable label (e.g. "Production OpenClaw")

  @IsObject()
  @IsNotEmpty()
  config: Record<string, any>; // adapter-specific config (api_url, api_key, model, etc.)

  @IsBoolean()
  @IsOptional()
  is_default?: boolean;

  @IsBoolean()
  @IsOptional()
  is_active?: boolean = true;

  @IsString()
  @IsOptional()
  description?: string;
}
