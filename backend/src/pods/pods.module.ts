import { Module } from '@nestjs/common';
import { SupabaseModule } from '../supabase/supabase.module';
import { CommonModule } from '../common/common.module';
import { PodsController } from './pods.controller';
import { PodsService } from './pods.service';
import { PodBundleService } from './pod-bundle.service';

@Module({
  imports: [SupabaseModule, CommonModule],
  controllers: [PodsController],
  providers: [PodsService, PodBundleService],
  exports: [PodsService, PodBundleService],
})
export class PodsModule {}
