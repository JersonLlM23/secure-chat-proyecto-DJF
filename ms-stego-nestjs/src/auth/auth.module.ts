import { Module } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';

import { AuthClientService } from './auth-client.service.js';
import { JwtAuthGuard } from './guards/jwt-auth.guard.js';
import { JwtStrategy } from './strategies/jwt.strategy.js';

@Module({
  imports: [PassportModule.register({ defaultStrategy: 'jwt' })],
  providers: [JwtStrategy, JwtAuthGuard, AuthClientService],
  exports: [JwtAuthGuard, AuthClientService],
})
export class AuthModule {}
