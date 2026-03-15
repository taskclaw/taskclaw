import {
  IsOptional,
  IsString,
  IsUUID,
  IsBoolean,
  IsISO8601,
  IsNumber,
  IsObject,
  ValidateIf,
} from 'class-validator';


export class UpdateTaskDto {
  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsUUID()
  category_id?: string;

  @IsOptional()
  @IsString()
  status?: string;

  @IsOptional()
  @IsString()
  priority?: string;

  @IsOptional()
  @IsBoolean()
  completed?: boolean;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsISO8601()
  due_date?: string;

  @IsOptional()
  @IsNumber()
  time_spent?: number;

  @IsOptional()
  @IsUUID()
  current_step_id?: string;

  @IsOptional()
  @ValidateIf((_o, v) => v !== null)
  @IsUUID()
  override_category_id?: string | null;

  @IsOptional()
  @IsObject()
  card_data?: Record<string, any>;
}
