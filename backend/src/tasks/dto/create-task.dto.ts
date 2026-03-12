import {
  IsString,
  IsOptional,
  IsUUID,
  IsBoolean,
  IsISO8601,
} from 'class-validator';

export class CreateTaskDto {
  @IsString()
  title: string;

  @IsOptional()
  @IsUUID()
  category_id?: string;

  @IsOptional()
  @IsUUID()
  source_id?: string; // NULL for local tasks

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
  @IsUUID()
  board_instance_id?: string;

  @IsOptional()
  @IsUUID()
  current_step_id?: string;
}
