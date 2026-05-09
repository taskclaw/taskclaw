import {
  IsNotEmpty,
  IsOptional,
  IsString,
  IsBoolean,
  IsInt,
  IsIn,
  IsUrl,
  Min,
  Max,
  IsObject,
  Matches,
} from 'class-validator';

export class CreateAgentDto {
  @IsNotEmpty()
  @IsString()
  name: string;

  @IsOptional()
  @IsString()
  @Matches(/^[a-z0-9-]+$/, { message: 'slug must be lowercase alphanumeric with hyphens' })
  slug?: string;

  @IsOptional()
  @IsString()
  avatar_url?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  persona?: string;

  @IsOptional()
  @IsString()
  @Matches(/^#[0-9A-Fa-f]{6}$/, { message: 'color must be a valid hex color (e.g. #7C3AED)' })
  color?: string;

  @IsOptional()
  @IsString()
  backbone_connection_id?: string;

  @IsOptional()
  @IsString()
  model_override?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(20)
  max_concurrent_tasks?: number;

  @IsOptional()
  @IsIn(['worker', 'pilot', 'coordinator'])
  agent_type?: string;

  @IsOptional()
  @IsObject()
  config?: Record<string, unknown>;

  // PRD §9 — per-agent overrides for spawn env / HTTP headers / CLI flags.
  // Allows a single agent to use a Bedrock-routed Anthropic key while the
  // rest of the account stays on the default backbone, etc.
  @IsOptional()
  @IsObject()
  custom_env?: Record<string, string>;

  @IsOptional()
  custom_args?: string[];
}
