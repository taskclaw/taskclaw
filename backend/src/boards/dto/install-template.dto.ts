import { IsUUID, IsOptional, IsString } from 'class-validator';

export class InstallTemplateDto {
  @IsUUID()
  template_id: string;

  @IsOptional()
  @IsString()
  name?: string; // override template name
}
