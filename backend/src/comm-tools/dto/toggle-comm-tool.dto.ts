import { IsString, IsNotEmpty, IsBoolean, IsIn } from 'class-validator';

export class ToggleCommToolDto {
  @IsString()
  @IsNotEmpty()
  @IsIn(['telegram', 'whatsapp', 'slack'])
  tool_type: string;

  @IsBoolean()
  is_enabled: boolean;
}
