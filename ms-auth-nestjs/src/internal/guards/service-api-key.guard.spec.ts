import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { describe, expect, it } from 'vitest';
import { ServiceApiKeyGuard } from './service-api-key.guard.js';

const EXPECTED_KEY = 'a'.repeat(64);

function contextWithKey(key?: string): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => ({
        header: (name: string) =>
          name.toLowerCase() === 'x-service-key' ? key : undefined,
      }),
    }),
  } as unknown as ExecutionContext;
}

describe('ServiceApiKeyGuard', () => {
  const config = {
    getOrThrow: () => EXPECTED_KEY,
  } as unknown as ConfigService;

  const guard = new ServiceApiKeyGuard(config);

  it('rechaza una solicitud sin X-Service-Key', () => {
    expect(() => guard.canActivate(contextWithKey())).toThrow(
      UnauthorizedException,
    );
  });

  it('rechaza una API key incorrecta', () => {
    expect(() => guard.canActivate(contextWithKey('b'.repeat(64)))).toThrow(
      UnauthorizedException,
    );
  });

  it('rechaza una API key con longitud distinta', () => {
    expect(() => guard.canActivate(contextWithKey('a'.repeat(10)))).toThrow(
      UnauthorizedException,
    );
  });

  it('acepta la API key correcta', () => {
    expect(guard.canActivate(contextWithKey(EXPECTED_KEY))).toBe(true);
  });
});
