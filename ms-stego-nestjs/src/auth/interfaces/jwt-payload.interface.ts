export interface JwtPayload {
  sub: string;
  typ?: string;
  tokenVersion?: number;
  iss?: string;
  aud?: string;
  exp?: number;
  iat?: number;
}
