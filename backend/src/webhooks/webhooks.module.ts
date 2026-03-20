import { Module, Global } from '@nestjs/common';
import { WebhooksService } from './webhooks.service';
import { WebhookEmitterService } from './webhook-emitter.service';
import { WebhooksController } from './webhooks.controller';
import { SupabaseModule } from '../supabase/supabase.module';

@Global()
@Module({
  imports: [SupabaseModule],
  controllers: [WebhooksController],
  providers: [WebhooksService, WebhookEmitterService],
  exports: [WebhookEmitterService],
})
export class WebhooksModule {}
