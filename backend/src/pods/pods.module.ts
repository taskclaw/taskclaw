import { Module } from '@nestjs/common';
import { SupabaseModule } from '../supabase/supabase.module';
import { CommonModule } from '../common/common.module';
import { PodsController } from './pods.controller';
import { PodsService } from './pods.service';

@Module({
  imports: [SupabaseModule, CommonModule],
  controllers: [PodsController],
  providers: [PodsService],
  exports: [PodsService],
})
export class PodsModule {}
