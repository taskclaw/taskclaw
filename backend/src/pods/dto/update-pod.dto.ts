import { PartialType } from '@nestjs/mapped-types';
import { CreatePodDto } from './create-pod.dto';

export class UpdatePodDto extends PartialType(CreatePodDto) {}
