import { IsString, IsOptional, IsInt, IsNotEmpty } from 'class-validator';

export class CreateBoardStepDto {
  @IsNotEmpty()
  @IsString()
  step_key: string;

  @IsNotEmpty()
  @IsString()
  name: string;

  @IsOptional()
  @IsString()
  step_type?: string; // 'input' | 'ai_process' | 'human_review' | 'action' | 'done'

  @IsOptional()
  @IsInt()
  position?: number;

  @IsOptional()
  @IsString()
  color?: string;

  @IsOptional()
  @IsString()
  linked_category_id?: string;
}
