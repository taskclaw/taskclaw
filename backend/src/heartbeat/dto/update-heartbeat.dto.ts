import { PartialType } from '@nestjs/swagger';
import { CreateHeartbeatDto } from './create-heartbeat.dto';

export class UpdateHeartbeatDto extends PartialType(CreateHeartbeatDto) {}
