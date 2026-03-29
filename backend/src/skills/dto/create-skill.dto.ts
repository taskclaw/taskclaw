import {
  IsString,
  IsOptional,
  IsBoolean,
  MaxLength,
  IsIn,
} from 'class-validator';

export class CreateSkillDto {
  @IsString()
  @MaxLength(100)
  name: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @IsString()
  @MaxLength(51200) // 50KB limit
  instructions: string;

  @IsOptional()
  @IsBoolean()
  is_active?: boolean;

  @IsOptional()
  @IsString()
  @IsIn(['general', 'integration', 'board', 'system'])
  skill_type?: string;
}
