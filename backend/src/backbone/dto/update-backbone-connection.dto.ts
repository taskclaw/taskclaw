import { PartialType } from '@nestjs/mapped-types';
import { CreateBackboneConnectionDto } from './create-backbone-connection.dto';

export class UpdateBackboneConnectionDto extends PartialType(
  CreateBackboneConnectionDto,
) {}
