import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';

import { ConfigService } from '@nestjs/config';
import { timingSafeEqual } from 'node:crypto';
import type { Request } from 'express';

/*
 * Comparación en tiempo constante. Se igualan longitudes con buffers
 * rellenos para no filtrar el tamaño de la clave esperada.
 */
function constantTimeEquals(provided: string, expected: string): boolean {
  const providedBuffer = Buffer.from(provided, 'utf8');
  const expectedBuffer = Buffer.from(expected, 'utf8');

  const length = Math.max(providedBuffer.length, expectedBuffer.length);

  const providedPadded = Buffer.alloc(length);
  const expectedPadded = Buffer.alloc(length);

  providedBuffer.copy(providedPadded);
  expectedBuffer.copy(expectedPadded);

  const sameContent = timingSafeEqual(providedPadded, expectedPadded);

  return sameContent && providedBuffer.length === expectedBuffer.length;
}

@Injectable()
export class ServiceApiKeyGuard implements CanActivate {
  constructor(private readonly configService: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();

    const provided = request.header('x-service-key');

    const expected = this.configService.getOrThrow<string>('INTERNAL_API_KEY');

    if (!provided || !constantTimeEquals(provided, expected)) {
      throw new UnauthorizedException('Credencial de servicio inválida');
    }

    return true;
  }
}
