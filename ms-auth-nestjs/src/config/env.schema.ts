import { z } from 'zod';

export const envSchema = z.object({
  NODE_ENV: z
    .enum(['development', 'test', 'production'])
    .default('development'),

  PORT: z.coerce.number().int().min(1).max(65535).default(3001),

  CORS_ORIGINS: z.string().default('http://localhost:3000'),

  TRUST_PROXY: z.string().optional(),

  DB_HOST: z.string().min(1),

  DB_PORT: z.coerce.number().int().min(1).max(65535).default(5432),

  DB_USERNAME: z.string().min(1),

  DB_PASSWORD: z.string().min(12),

  DB_DATABASE: z.string().min(1),

  DB_SSL: z.enum(['true', 'false']).default('false'),

  RATE_LIMIT_TTL_MS: z.coerce.number().int().positive().default(60000),

  RATE_LIMIT_MAX: z.coerce.number().int().positive().default(100),

  RATE_LIMIT_BLOCK_MS: z.coerce.number().int().positive().default(60000),

  /*
   * RS256: AUTH firma con la clave privada y expone/verifica con la pública.
   * No existe ningún secreto compartido (JWT_SECRET fue eliminado).
   */
  JWT_PRIVATE_KEY_PATH: z.string().min(1),

  JWT_PUBLIC_KEY_PATH: z.string().min(1),

  JWT_EXPIRES_IN_SECONDS: z.coerce
    .number()
    .int()
    .min(60)
    .max(3600)
    .default(900),

  JWT_ISSUER: z.string().min(1).default('ms-auth'),

  JWT_AUDIENCE: z.string().min(1).default('secure-chat-api'),

  /*
   * Credencial de servicio para el endpoint interno usado por STEGO.
   * Se exige al menos 256 bits de entropía; se documenta generarla con
   * `openssl rand -hex 32` (64 caracteres hexadecimales).
   */
  INTERNAL_API_KEY: z
    .string()
    .min(43, 'INTERNAL_API_KEY debe tener al menos 256 bits de entropía'),
});
