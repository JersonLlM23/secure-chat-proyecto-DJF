import { describe, expect, it } from 'vitest';

import { envSchema } from './env.schema.js';

const validEnv = {
  DB_HOST: '127.0.0.1',
  DB_PORT: '5432',
  DB_USERNAME: 'stego_user',
  DB_PASSWORD: 'Change_This_DB_Password',
  DB_DATABASE: 'stego_db',
  JWT_PUBLIC_KEY_PATH: 'keys/public.pem',
  AUTH_INTERNAL_URL: 'http://localhost:3001',
  INTERNAL_API_KEY: 'a'.repeat(64),
};

describe('envSchema', () => {
  it('aplica los valores por defecto de STEGO', () => {
    const env = envSchema.parse(validEnv);

    expect(env.NODE_ENV).toBe('development');
    expect(env.PORT).toBe(3002);
    expect(env.DB_PORT).toBe(5432);
    expect(env.DB_SSL).toBe('false');
    expect(env.SWAGGER_ENABLED).toBe('false');
    expect(env.JWT_ISSUER).toBe('ms-auth');
    expect(env.JWT_AUDIENCE).toBe('secure-chat-api');
    expect(env.AUTH_TIMEOUT_MS).toBe(3000);
    expect(env.MAX_FILE_SIZE_BYTES).toBe(10 * 1024 * 1024);
    expect(env.MAX_IMAGE_PIXELS).toBe(40_000_000);
    expect(env.STEGO_SUSPICIOUS_THRESHOLD).toBe(0.75);
    expect(env.STEGO_CLEAR_THRESHOLD).toBe(0.55);
  });

  it('rechaza contraseñas de base de datos demasiado cortas', () => {
    expect(() =>
      envSchema.parse({ ...validEnv, DB_PASSWORD: 'short' }),
    ).toThrow();
  });

  it('rechaza un puerto fuera de rango', () => {
    expect(() => envSchema.parse({ ...validEnv, PORT: '70000' })).toThrow();
  });

  it('rechaza una API key de servicio débil', () => {
    expect(() =>
      envSchema.parse({ ...validEnv, INTERNAL_API_KEY: 'weak' }),
    ).toThrow();
  });

  it('rechaza umbrales inconsistentes', () => {
    expect(() =>
      envSchema.parse({
        ...validEnv,
        STEGO_CLEAR_THRESHOLD: '0.9',
        STEGO_SUSPICIOUS_THRESHOLD: '0.5',
      }),
    ).toThrow();
  });
});
