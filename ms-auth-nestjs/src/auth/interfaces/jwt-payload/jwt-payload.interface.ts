/*
 * Claims del access token emitido por AUTH.
 *
 * `iss`, `aud`, `exp` e `iat` son añadidos automáticamente por
 * @nestjs/jwt al firmar. Los roles NUNCA se incluyen como fuente de
 * autorización: se consultan en PostgreSQL en cada solicitud.
 */
export interface JwtPayload {
  sub: string;
  username: string;
  tokenVersion: number;
  typ: 'access';
  iss?: string;
  aud?: string;
  exp?: number;
  iat?: number;
}
