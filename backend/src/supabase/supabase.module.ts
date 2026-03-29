import { Module, Global } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { SupabaseService } from './supabase.service';
import { SupabaseAdminService } from './supabase-admin.service';

@Global()
@Module({
  imports: [ConfigModule],
  providers: [SupabaseService, SupabaseAdminService],
  exports: [SupabaseService, SupabaseAdminService],
})
export class SupabaseModule {}
