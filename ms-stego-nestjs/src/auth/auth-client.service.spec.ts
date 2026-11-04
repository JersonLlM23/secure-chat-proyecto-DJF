import {
  ForbiddenException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { AUTH_ACTIONS } from './auth-actions.js';
import { AuthClientService } from './auth-client.service.js';

const userId = '11111111-1111-4111-8111-111111111111';

function createService(): AuthClientService {
  const values: Record<string, unknown> = {
    AUTH_INTERNAL_URL: 'http://auth.local:3001/',
    INTERNAL_API_KEY: 'k'.repeat(64),
    AUTH_TIMEOUT_MS: 1500,
  };

  return new AuthClientService({
    getOrThrow: (key: string) => values[key],
  } as unknown as ConfigService);
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('AuthClientService (Fail-Closed)', () => {
  it('autoriza solo con allowed:true y una decisión coherente', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        subject_id: userId,
        action: AUTH_ACTIONS.ANALYZE,
        allowed: true,
        reason: 'active_role_grants_permission',
      }),
    );

    vi.stubGlobal('fetch', fetchMock);

    await expect(
      createService().assertAuthorized({
        token: 'jwt-token',
        userId,
        action: AUTH_ACTIONS.ANALYZE,
      }),
    ).resolves.toBeUndefined();

    const [url, options] = fetchMock.mock.calls[0];

    expect(url).toBe('http://auth.local:3001/internal/authorization/check');
    expect(options.headers['x-service-key']).toBe('k'.repeat(64));
    expect(JSON.parse(options.body)).toMatchObject({
      subject_token: 'jwt-token',
      action: AUTH_ACTIONS.ANALYZE,
      resource_id: null,
    });
  });

  it('lanza 403 cuando AUTH responde allowed:false', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonResponse({
          subject_id: userId,
          action: AUTH_ACTIONS.READ_ANY,
          allowed: false,
          reason: 'insufficient_permissions',
        }),
      ),
    );

    await expect(
      createService().assertAuthorized({
        token: 'jwt-token',
        userId,
        action: AUTH_ACTIONS.READ_ANY,
      }),
    ).rejects.toThrow(ForbiddenException);
  });

  it('lanza 503 ante errores 5xx de AUTH', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(jsonResponse({ message: 'down' }, 503)),
    );

    await expect(
      createService().assertAuthorized({
        token: 'jwt-token',
        userId,
        action: AUTH_ACTIONS.ANALYZE,
      }),
    ).rejects.toThrow(ServiceUnavailableException);
  });

  it('lanza 503 ante timeout o error de conexión', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockRejectedValue(new DOMException('The operation was aborted', 'AbortError')),
    );

    await expect(
      createService().assertAuthorized({
        token: 'jwt-token',
        userId,
        action: AUTH_ACTIONS.ANALYZE,
      }),
    ).rejects.toThrow(ServiceUnavailableException);
  });

  it('lanza 503 si la decisión no corresponde al subject o acción consultada', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonResponse({
          subject_id: '22222222-2222-4222-8222-222222222222',
          action: AUTH_ACTIONS.ANALYZE,
          allowed: true,
          reason: 'active_role_grants_permission',
        }),
      ),
    );

    await expect(
      createService().assertAuthorized({
        token: 'jwt-token',
        userId,
        action: AUTH_ACTIONS.ANALYZE,
      }),
    ).rejects.toThrow(ServiceUnavailableException);
  });

  it('lanza 503 si la respuesta no es JSON válido', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response('not-json', {
          status: 200,
          headers: { 'content-type': 'text/plain' },
        }),
      ),
    );

    await expect(
      createService().assertAuthorized({
        token: 'jwt-token',
        userId,
        action: AUTH_ACTIONS.ANALYZE,
      }),
    ).rejects.toThrow(ServiceUnavailableException);
  });
});
