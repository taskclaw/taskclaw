import { Module, Global } from '@nestjs/common';
import { AccessControlHelper } from './helpers/access-control.helper';
import { CacheService } from './cache.service';

@Global()
@Module({
  providers: [CacheService, AccessControlHelper],
  exports: [CacheService, AccessControlHelper],
})
export class CommonModule {}
