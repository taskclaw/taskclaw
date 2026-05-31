import { Module } from '@nestjs/common';
import { SourcesService } from './sources.service';
import { SourcesController } from './sources.controller';
import { CommonModule } from '../common/common.module';
import { AdaptersModule } from '../adapters/adapters.module';

@Module({
  imports: [ CommonModule, AdaptersModule],
  controllers: [SourcesController],
  providers: [SourcesService],
  exports: [SourcesService],
})
export class SourcesModule {}
