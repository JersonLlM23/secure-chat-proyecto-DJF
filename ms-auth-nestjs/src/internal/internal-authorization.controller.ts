import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  UseGuards,
} from '@nestjs/common';

import {
  ApiBody,
  ApiHeader,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Public } from '../auth/decorators/public/public.decorator.js';
import { Throttle } from '@nestjs/throttler';
import { AuthorizationCheckDto } from './dto/authorization-check.dto.js';
import { ServiceApiKeyGuard } from './guards/service-api-key.guard.js';
import { InternalAuthorizationService } from './internal-authorization.service.js';

/*
 * Endpoint servicio-a-servicio.
 *
 * - La API key de servicio (X-Service-Key) autentica a STEGO.
 * - El JWT del usuario (subject_token) autentica al usuario final.
 * Ambos controles son independientes y obligatorios.
 */
@ApiTags('internal')
@Controller('internal/authorization')
export class InternalAuthorizationController {
  constructor(
    private readonly authorizationService: InternalAuthorizationService,
  ) {}

  @Public()
  @UseGuards(ServiceApiKeyGuard)
  @Post('check')
  @HttpCode(HttpStatus.OK)
  @Throttle({
    default: {
      limit: 60,
      ttl: 60_000,
    },
  })
  @ApiHeader({
    name: 'X-Service-Key',
    required: true,
    description: 'Credencial de servicio compartida con STEGO',
  })
  @ApiBody({ type: AuthorizationCheckDto })
  @ApiOperation({
    summary: 'Consultar una decisión de autorización para STEGO',
  })
  @ApiResponse({
    status: 200,
    description:
      'Decisión explícita (allowed true/false). Por defecto deniega.',
    schema: {
      type: 'object',
      properties: {
        subject_id: { type: 'string', format: 'uuid' },
        action: { type: 'string' },
        allowed: { type: 'boolean' },
        reason: { type: 'string' },
      },
    },
  })
  @ApiResponse({ status: 401, description: 'API key o token inválido' })
  check(
    @Body()
    dto: AuthorizationCheckDto,
  ) {
    return this.authorizationService.check(dto);
  }
}
