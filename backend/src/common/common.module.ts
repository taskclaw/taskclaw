import { Module, Global } from '@nestjs/common';
import { AccessControlHelper } from './helpers/access-control.helper';

@Global()
@Module({
  providers: [AccessControlHelper],
  exports: [AccessControlHelper],
})
export class CommonModule {}
