import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtAuthService } from './jwt-auth.service';
import { ApiKeysModule } from './api-keys/api-keys.module';

@Module({
  imports: [
    ApiKeysModule,
    // Global so the AuthGuard (used across every module) can inject JwtService.
    JwtModule.registerAsync({
      global: true,
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get<string>('JWT_SECRET'),
        signOptions: { expiresIn: '1h' },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtAuthService],
  exports: [AuthService, JwtAuthService],
})
export class AuthModule {}
