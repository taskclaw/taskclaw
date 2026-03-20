import { Module, NestModule, MiddlewareConsumer } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { CorrelationIdMiddleware } from './common/middleware/correlation-id.middleware';
import { RequestLoggerMiddleware } from './common/middleware/request-logger.middleware';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { SupabaseModule } from './supabase/supabase.module';
import { UsersModule } from './users/users.module';
import { AccountsModule } from './accounts/accounts.module';
import { ProjectsModule } from './projects/projects.module';
import { TeamsModule } from './teams/teams.module';
import { SearchModule } from './search/search.module';
import { SystemSettingsModule } from './system-settings/system-settings.module';
import { CommonModule } from './common/common.module';
import { AuthModule } from './auth/auth.module';
import { AiAssistantModule } from './ai-assistant/ai-assistant.module';
import { CategoriesModule } from './categories/categories.module';
import { SourcesModule } from './sources/sources.module';
import { TasksModule } from './tasks/tasks.module';
import { SyncModule } from './sync/sync.module';
import { AdaptersModule } from './adapters/adapters.module';
import { AiProviderModule } from './ai-provider/ai-provider.module';
import { ConversationsModule } from './conversations/conversations.module';
import { KnowledgeModule } from './knowledge/knowledge.module';
import { SkillsModule } from './skills/skills.module';
import { AgentSyncModule } from './agent-sync/agent-sync.module';
import { BoardsModule } from './boards/boards.module';

import { IntegrationsModule } from './integrations/integrations.module';

// Edition-gated modules (cloud-only)
import { LangfuseModule } from './ee/langfuse/langfuse.module';
import { LangfuseNoopModule } from './common/langfuse-noop.module';
import { StripeModule } from './ee/stripe/stripe.module';
import { PlansModule } from './ee/plans/plans.module';
import { SubscriptionsModule } from './ee/subscriptions/subscriptions.module';
import { WaitlistModule } from './ee/waitlist/waitlist.module';

const isCloudEdition = process.env.EDITION === 'cloud';

// Cloud edition: full Langfuse + billing modules
// Community edition: noop Langfuse stub, no billing
const editionModules = isCloudEdition
  ? [LangfuseModule, StripeModule, PlansModule, SubscriptionsModule, WaitlistModule]
  : [LangfuseNoopModule];

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    ScheduleModule.forRoot(),
    SupabaseModule,
    ...editionModules,
    AuthModule,
    UsersModule,
    AccountsModule,
    ProjectsModule,
    TeamsModule,
    SearchModule,
    SystemSettingsModule,
    CommonModule,
    AiAssistantModule,
    AdaptersModule,
    AiProviderModule,
    ConversationsModule,
    KnowledgeModule,
    SkillsModule,
    CategoriesModule,
    SourcesModule,
    TasksModule,
    SyncModule,
    AgentSyncModule,
    BoardsModule,
    IntegrationsModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer
      .apply(CorrelationIdMiddleware, RequestLoggerMiddleware)
      .forRoutes('*');
  }
}
