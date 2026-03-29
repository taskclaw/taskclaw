import {
  IsNotEmpty,
  IsString,
  IsUUID,
  IsObject,
  IsOptional,
  IsBoolean,
  IsInt,
  Min,
} from 'class-validator';

export class CreateSourceDto {
  @IsNotEmpty()
  @IsUUID()
  category_id: string;

  @IsNotEmpty()
  @IsString()
  provider: string; // Runtime validation via AdapterRegistry — any registered adapter name is valid

  @IsNotEmpty()
  @IsObject()
  config: Record<string, any>; // Provider-specific config (API keys, database IDs)

  @IsOptional()
  @IsInt()
  @Min(1)
  sync_interval_minutes?: number;

  @IsOptional()
  @IsBoolean()
  is_active?: boolean;

  @IsOptional()
  @IsUUID()
  connection_id?: string;
}
