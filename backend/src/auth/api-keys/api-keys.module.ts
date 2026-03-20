import { Module, Global } from '@nestjs/common';
import { ApiKeysService } from './api-keys.service';
import { ApiKeysController } from './api-keys.controller';
import { SupabaseModule } from '../../supabase/supabase.module';

@Global()
@Module({
  imports: [SupabaseModule],
  controllers: [ApiKeysController],
  providers: [ApiKeysService],
  exports: [ApiKeysService],
})
export class ApiKeysModule {}
