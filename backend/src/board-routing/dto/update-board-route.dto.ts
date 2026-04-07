import { PartialType } from '@nestjs/swagger';
import { CreateBoardRouteDto } from './create-board-route.dto';

export class UpdateBoardRouteDto extends PartialType(CreateBoardRouteDto) {}
