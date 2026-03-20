import {
  IsString,
  IsOptional,
  IsObject,
  IsArray,
} from 'class-validator';

export class CreateConnectionDto {
  @IsString()
  definition_id: string;

  @IsOptional()
  @IsObject()
  credentials?: Record<string, string>;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  scopes?: string[];

  @IsOptional()
  @IsObject()
  config?: Record<string, any>;

  @IsOptional()
  @IsString()
  external_account_name?: string;
}
