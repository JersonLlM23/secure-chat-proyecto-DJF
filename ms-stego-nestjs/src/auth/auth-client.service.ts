import {
  ForbiddenException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import type { AuthAction } from './auth-actions.js';

interface AuthorizationCheckPayload {
  subject_token: string;
  action: AuthAction;
  resource_id?: string | null;
}

interface AuthorizationDecision {
  subject_id?: unknown;
  action?: unknown;
  allowed?: unknown;
  reason?: unknown;
}

/*
 * Cliente HTTP para el endpoint interno de AUTH.
 *
 * No implementa el guard de API key: esa responsabilidad pertenece al
 * endpoint interno de AUTH. STEGO solo envía X-Service-Key.
 */
@Injectable()
export class AuthClientService {
  private readonly endpoint: string;
  private readonly serviceKey: string;
  private readonly timeoutMs: number;

  constructor(config: ConfigService) {
    const baseUrl = config
      .getOrThrow<string>('AUTH_INTERNAL_URL')
      .replace(/\/+$/, '');

    this.endpoint = `${baseUrl}/internal/authorization/check`;
    this.serviceKey = config.getOrThrow<string>('INTERNAL_API_KEY');
    this.timeoutMs = config.getOrThrow<number>('AUTH_TIMEOUT_MS');
  }

  /*
   * Fail-Closed:
   * - allowed: true y decisión coherente => autoriza.
   * - allowed: false => 403.
   * - error, timeout, 5xx, 401/403 de integración o respuesta inválida
   *   => 503 (nunca se asume autorización).
   */
  async assertAuthorized(params: {
    token: string;
    userId: string;
    action: AuthAction;
    resourceId?: string;
  }): Promise<void> {
    const body: AuthorizationCheckPayload = {
      subject_token: params.token,
      action: params.action,
      resource_id: params.resourceId ?? null,
    };

    let response: Response;

    try {
      response = await fetch(this.endpoint, {
        method: 'POST',
        headers: {
          accept: 'application/json',
          'content-type': 'application/json',
          'x-service-key': this.serviceKey,
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch {
      throw new ServiceUnavailableException(
        'Servicio de autorización no disponible',
      );
    }

    if (!response.ok) {
      throw new ServiceUnavailableException(
        'Servicio de autorización no disponible',
      );
    }

    let decision: AuthorizationDecision;

    try {
      decision = (await response.json()) as AuthorizationDecision;
    } catch {
      throw new ServiceUnavailableException(
        'Respuesta de autorización inválida',
      );
    }

    /*
     * La identidad y la acción deben coincidir con la consulta. Esto
     * evita aceptar una decisión ambigua o de otro subject.
     */
    if (
      decision.subject_id !== params.userId ||
      decision.action !== params.action
    ) {
      throw new ServiceUnavailableException(
        'Respuesta de autorización inválida',
      );
    }

    if (decision.allowed === false) {
      throw new ForbiddenException(
        typeof decision.reason === 'string'
          ? decision.reason
          : 'Operación no autorizada',
      );
    }

    if (decision.allowed !== true) {
      throw new ServiceUnavailableException(
        'Respuesta de autorización inválida',
      );
    }
  }
}
