import { Module } from '@nestjs/common';
import { EventsService } from './events.service';
import { EventsController } from './events.controller';
import { ApiKeysModule } from '../auth/api-keys/api-keys.module';

@Module({
  imports: [ApiKeysModule], // AuthGuard depends on ApiKeysService (global, but explicit here)
  controllers: [EventsController],
  providers: [EventsService],
  exports: [EventsService],
})
export class EventsModule {}
