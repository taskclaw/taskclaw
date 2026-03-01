import {
  IsString,
  IsOptional,
  IsInt,
  IsBoolean,
  IsArray,
} from 'class-validator';

export class UpdateBoardStepDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsInt()
  position?: number;

  @IsOptional()
  @IsString()
  color?: string;

  @IsOptional()
  @IsString()
  step_type?: string;

  @IsOptional()
  @IsString()
  linked_category_id?: string | null; // null to unlink

  // ─── Rich config ─────────────────────────────────────────

  @IsOptional()
  @IsString()
  trigger_type?: string; // on_entry | manual | schedule | webhook

  @IsOptional()
  @IsBoolean()
  ai_first?: boolean;

  @IsOptional()
  @IsArray()
  input_schema?: any[]; // [{key, label, type, required, default_value, options}]

  @IsOptional()
  @IsArray()
  output_schema?: any[]; // [{key, label, type, default_value, options}]

  @IsOptional()
  @IsString()
  on_success_step_id?: string | null;

  @IsOptional()
  @IsString()
  on_error_step_id?: string | null;

  // ─── Trigger-specific config ─────────────────────────────

  @IsOptional()
  @IsString()
  webhook_url?: string | null;

  @IsOptional()
  @IsString()
  webhook_auth_header?: string | null;

  @IsOptional()
  @IsString()
  schedule_cron?: string | null;

  // ─── System prompt ─────────────────────────────────────

  @IsOptional()
  @IsString()
  system_prompt?: string | null;
}
