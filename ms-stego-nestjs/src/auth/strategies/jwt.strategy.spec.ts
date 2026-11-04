import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { generateKeyPairSync } from 'node:crypto';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Request } from 'express';
import { afterAll, describe, expect, it } from 'vitest';

import { JwtStrategy } from './jwt.strategy.js';

const directory = mkdtempSync(join(tmpdir(), 'stego-jwt-'));

const publicKeyPath = join(directory, 'public.pem');

const { publicKey } = generateKeyPairSync('rsa', {
  modulusLength: 2048,
  publicKeyEncoding: {
    type: 'spki',
    format: 'pem',
  },
  privateKeyEncoding: {
    type: 'pkcs8',
    format: 'pem',
  },
});

writeFileSync(publicKeyPath, publicKey);

const configValues: Record<string, unknown> = {
  JWT_PUBLIC_KEY_PATH: publicKeyPath,
  JWT_ISSUER: 'ms-auth',
  JWT_AUDIENCE: 'secure-chat-api',
};

const config = {
  getOrThrow: (key: string) => configValues[key],
} as unknown as ConfigService;

const strategy = new JwtStrategy(config);

const userId = '33333333-3333-4333-8333-333333333333';

function requestWithToken(token = 'signed-token'): Request {
  return {
    header: (name: string) =>
      name.toLowerCase() === 'authorization' ? `Bearer ${token}` : undefined,
  } as unknown as Request;
}

afterAll(() => {
  rmSync(directory, { recursive: true, force: true });
});

describe('JwtStrategy', () => {
  it('extrae sub y conserva el token para AUTH', () => {
    const user = strategy.validate(requestWithToken(), {
      sub: userId,
      typ: 'access',
      tokenVersion: 1,
    });

    expect(user.userId).toBe(userId);
    expect(user.token).toBe('signed-token');
  });

  it('rechaza tokens que no son de tipo access', () => {
    expect(() =>
      strategy.validate(requestWithToken(), {
        sub: userId,
        typ: 'refresh',
      }),
    ).toThrow(UnauthorizedException);
  });

  it('rechaza un sub que no es UUID', () => {
    expect(() =>
      strategy.validate(requestWithToken(), {
        sub: 'not-a-uuid',
        typ: 'access',
      }),
    ).toThrow(UnauthorizedException);
  });

  it('rechaza peticiones sin header Authorization', () => {
    expect(() =>
      strategy.validate(requestWithToken(''), {
        sub: userId,
        typ: 'access',
      }),
    ).toThrow(UnauthorizedException);
  });
});
