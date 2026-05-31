import { Module, Global } from '@nestjs/common';
import { WebhooksService } from './webhooks.service';
import { WebhookEmitterService } from './webhook-emitter.service';
import { WebhooksController } from './webhooks.controller';

@Global()
@Module({
  imports: [],
  controllers: [WebhooksController],
  providers: [WebhooksService, WebhookEmitterService],
  exports: [WebhookEmitterService],
})
export class WebhooksModule {}
