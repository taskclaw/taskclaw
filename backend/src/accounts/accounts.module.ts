import { Module } from '@nestjs/common';
import { AccountsService } from './accounts.service';
import { AccountsController } from './accounts.controller';

import { AdminAccountsController } from './admin-accounts.controller';

import { ProjectsModule } from '../projects/projects.module';
import { SystemSettingsModule } from '../system-settings/system-settings.module';

@Module({
  imports: [ProjectsModule, SystemSettingsModule],
  controllers: [AccountsController, AdminAccountsController],
  providers: [AccountsService],
})
export class AccountsModule {}
