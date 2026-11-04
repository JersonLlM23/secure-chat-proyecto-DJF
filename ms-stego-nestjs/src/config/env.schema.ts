import { z } from 'zod';

export const envSchema = z.object({
  NODE_ENV: z
    .enum(['development', 'test', 'production'])
    .default('development'),

  PORT: z.coerce.number().int().min(1).max(65535).default(3002),

  CORS_ORIGINS: z.string().default('http://localhost:3000'),

  TRUST_PROXY: z.string().optional(),

  DB_HOST: z.string().min(1),

  DB_PORT: z.coerce.number().int().min(1).max(65535).default(5432),

  DB_USERNAME: z.string().min(1),

  DB_PASSWORD: z.string().min(12),

  DB_DATABASE: z.string().min(1),

  DB_SSL: z.enum(['true', 'false']).default('false'),

  SWAGGER_ENABLED: z.enum(['true', 'false']).default('false'),

  /*
   * STEGO no firma tokens: únicamente verifica los emitidos por AUTH con
   * la clave pública RSA (RS256). No existe ningún secreto compartido.
   */
  JWT_PUBLIC_KEY_PATH: z.string().min(1),

  JWT_ISSUER: z.string().min(1).default('ms-auth'),

  JWT_AUDIENCE: z.string().min(1).default('secure-chat-api'),

  /*
   * Endpoint interno servicio-a-servicio de AUTH.
   */
  AUTH_INTERNAL_URL: z.string().url(),

  AUTH_TIMEOUT_MS: z.coerce.number().int().positive().default(3000),

  /*
   * Debe coincidir con INTERNAL_API_KEY de AUTH.
   */
  INTERNAL_API_KEY: z
    .string()
    .min(43, 'INTERNAL_API_KEY debe tener al menos 256 bits de entropía'),

  /*
   * Límites de carga y decodificación de imágenes (protección OWASP y
   * frente a pixel bombs).
   */
  MAX_FILE_SIZE_BYTES: z.coerce
    .number()
    .int()
    .positive()
    .default(10 * 1024 * 1024),

  MAX_IMAGE_WIDTH: z.coerce.number().int().positive().default(10_000),

  MAX_IMAGE_HEIGHT: z.coerce.number().int().positive().default(10_000),

  MAX_IMAGE_PIXELS: z.coerce.number().int().positive().default(40_000_000),

  /*
   * Umbrales experimentales del análisis estadístico. Requieren
   * calibración con un corpus representativo antes de interpretarse
   * como evidencia forense concluyente.
   */
  STEGO_SUSPICIOUS_THRESHOLD: z.coerce
    .number()
    .min(0)
    .max(1)
    .default(0.75),

  STEGO_CLEAR_THRESHOLD: z.coerce.number().min(0).max(1).default(0.55),
}).superRefine((env, context) => {
  if (env.STEGO_CLEAR_THRESHOLD >= env.STEGO_SUSPICIOUS_THRESHOLD) {
    context.addIssue({
      code: 'custom',
      message:
        'STEGO_CLEAR_THRESHOLD debe ser menor que STEGO_SUSPICIOUS_THRESHOLD',
      path: ['STEGO_CLEAR_THRESHOLD'],
    });
  }
});
