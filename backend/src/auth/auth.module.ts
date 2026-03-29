import { Module } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { SupabaseModule } from '../supabase/supabase.module';
import { ApiKeysModule } from './api-keys/api-keys.module';

@Module({
  imports: [SupabaseModule, ApiKeysModule],
  controllers: [AuthController],
  providers: [AuthService],
  exports: [AuthService],
})
export class AuthModule {}
