import {
  IsString,
  IsOptional,
  IsArray,
  IsObject,
  ValidateNested,
  ArrayMaxSize,
  IsNotEmpty,
} from 'class-validator';
import { Type } from 'class-transformer';

export class BulkTaskItemDto {
  @IsNotEmpty()
  @IsString()
  title: string;

  @IsOptional()
  @IsString()
  priority?: string;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsObject()
  card_data?: Record<string, any>;
}

export class BulkCreateBoardTasksDto {
  @IsArray()
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => BulkTaskItemDto)
  tasks: BulkTaskItemDto[];
}
