import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AuthModule } from '../auth/auth.module.js';
import { UsersModule } from '../users/users.module.js';
import { InternalAuthorizationController } from './internal-authorization.controller.js';
import { InternalAuthorizationService } from './internal-authorization.service.js';
import { ServiceApiKeyGuard } from './guards/service-api-key.guard.js';

@Module({
  imports: [ConfigModule, AuthModule, UsersModule],
  controllers: [InternalAuthorizationController],
  providers: [InternalAuthorizationService, ServiceApiKeyGuard],
})
export class InternalAuthorizationModule {}
