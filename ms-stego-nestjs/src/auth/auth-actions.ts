/*
 * Acciones consultadas dinámicamente en AUTH.
 *
 * Deben existir en la matriz ACTION_ROLES de
 * ms-auth-nestjs/src/internal/internal-authorization.service.ts.
 */
export const AUTH_ACTIONS = {
  ANALYZE: 'steganography.analyze',
  READ_OWN: 'steganography.results.read.own',
  READ_ANY: 'steganography.results.read.any',
} as const;

export type AuthAction = (typeof AUTH_ACTIONS)[keyof typeof AUTH_ACTIONS];
