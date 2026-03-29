import { Module, OnModuleInit, Logger } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { ModuleRef } from '@nestjs/core';
import { Queue } from 'bullmq';
import { SyncService } from './sync.service';
import { OutboundSyncService } from './outbound-sync.service';
import { SyncProcessor, SyncJobData } from './sync.processor';
import { SyncController } from './sync.controller';
import { SupabaseModule } from '../supabase/supabase.module';
import { CommonModule } from '../common/common.module';
import { AdaptersModule } from '../adapters/adapters.module';
import { SyncQueueModule, SYNC_QUEUE_NAME } from './sync-queue.module';
import { getQueueToken } from '@nestjs/bullmq';

/**
 * SyncModule: Handles scheduled and manual sync operations.
 *
 * BullMQ is registered conditionally via SyncQueueModule:
 * - When REDIS_URL is set: jobs are queued via BullMQ with retry/backoff.
 * - When REDIS_URL is NOT set: sync runs directly from the cron job.
 */
@Module({
  imports: [
    ScheduleModule.forRoot(),
    SupabaseModule,
    CommonModule,
    AdaptersModule,
    SyncQueueModule.register(),
  ],
  controllers: [SyncController],
  providers: [SyncService, OutboundSyncService],
  exports: [SyncService, OutboundSyncService],
})
export class SyncModule implements OnModuleInit {
  private readonly logger = new Logger(SyncModule.name);

  constructor(
    private readonly moduleRef: ModuleRef,
    private readonly syncService: SyncService,
    private readonly syncProcessor: SyncProcessor,
  ) {}

  async onModuleInit() {
    // Wire up the processor callback so it can call syncSource
    this.syncProcessor.setSyncCallback(
      this.syncService.syncSource.bind(this.syncService),
    );

    // Try to inject the Bull queue into the sync service
    try {
      const queue = this.moduleRef.get<Queue<SyncJobData>>(
        getQueueToken(SYNC_QUEUE_NAME),
        { strict: false },
      );
      if (queue) {
        this.syncService.setBullQueue(queue);
        this.logger.log('BullMQ sync queue wired to SyncService successfully.');
      }
    } catch {
      this.logger.log(
        'BullMQ queue not available — SyncService will use direct execution.',
      );
    }
  }
}
