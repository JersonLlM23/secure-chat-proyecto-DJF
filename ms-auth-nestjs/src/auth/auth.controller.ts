import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
} from '@nestjs/common';

import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { AuthService } from './auth.service.js';
import { Public } from './decorators/public/public.decorator.js';
import { AllowAnyAuthenticated } from './decorators/allow-authenticated/allow-authenticated.decorator.js';
import { LoginDto } from './dto/login.dto/login.dto.js';
import { CurrentUser } from './decorators/current-user/current-user.decorator.js';
import type { AuthenticatedUser } from './interfaces/authenticated-user/authenticated-user.interface.js';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  /*
   * Ruta pública.
   */
  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @Throttle({
    default: {
      limit: 5,
      ttl: 60_000,
    },
  })
  @ApiOperation({ summary: 'Autenticación de usuario' })
  @ApiResponse({ status: 200, description: 'Token de acceso emitido' })
  @ApiResponse({ status: 401, description: 'Credenciales inválidas' })
  login(
    @Body()
    dto: LoginDto,
  ) {
    return this.authService.login(dto);
  }

  /*
   * Requiere JWT.
   *
   * No requiere rol particular.
   */
  @Get('profile')
  @AllowAnyAuthenticated()
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Perfil del usuario autenticado' })
  profile(
    @CurrentUser()
    user: AuthenticatedUser,
  ) {
    return user;
  }

  /*
   * Alias heredado de /auth/me. Se conserva para no romper clientes o
   * pruebas existentes; comparte exactamente la misma semántica que
   * /auth/profile.
   */
  @Get('me')
  @AllowAnyAuthenticated()
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Alias heredado de /auth/profile' })
  me(
    @CurrentUser()
    user: AuthenticatedUser,
  ) {
    return user;
  }

  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  @AllowAnyAuthenticated()
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Cierre de sesión (incrementa tokenVersion)' })
  @ApiResponse({ status: 204, description: 'Sesión invalidada' })
  async logout(
    @CurrentUser()
    user: AuthenticatedUser,
  ): Promise<void> {
    await this.authService.logout(user.userId);
  }
}
