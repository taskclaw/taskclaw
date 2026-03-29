import { IsString, IsOptional, IsObject, IsArray, IsIn } from 'class-validator';

export class UpdateConnectionDto {
  @IsOptional()
  @IsObject()
  credentials?: Record<string, string>;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  scopes?: string[];

  @IsOptional()
  @IsString()
  @IsIn(['pending', 'active', 'expired', 'error', 'revoked'])
  status?: string;

  @IsOptional()
  @IsObject()
  config?: Record<string, any>;

  @IsOptional()
  @IsString()
  external_account_name?: string;
}
