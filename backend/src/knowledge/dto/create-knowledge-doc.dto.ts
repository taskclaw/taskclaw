import {
  IsString,
  IsOptional,
  IsBoolean,
  IsUUID,
  IsArray,
  MaxLength,
} from 'class-validator';

export class CreateKnowledgeDocDto {
  @IsString()
  @MaxLength(200)
  title: string;

  @IsString()
  @MaxLength(102400) // 100KB limit
  content: string;

  @IsOptional()
  @IsUUID()
  category_id?: string;

  @IsOptional()
  @IsBoolean()
  is_master?: boolean;

  @IsOptional()
  @IsArray()
  file_attachments?: Array<{
    name: string;
    url: string;
    size: number;
    type: string;
  }>;
}
