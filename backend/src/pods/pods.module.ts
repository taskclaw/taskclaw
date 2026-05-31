import { Module } from '@nestjs/common';
import { CommonModule } from '../common/common.module';
import { PodsController } from './pods.controller';
import { PodsService } from './pods.service';
import { PodBundleService } from './pod-bundle.service';

@Module({
  imports: [ CommonModule],
  controllers: [PodsController],
  providers: [PodsService, PodBundleService],
  exports: [PodsService, PodBundleService],
})
export class PodsModule {}
