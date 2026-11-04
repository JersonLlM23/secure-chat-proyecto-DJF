import type { JwtPayload } from './jwt-payload.interface.js';

export interface AuthenticatedUser {
  userId: string;

  /*
   * Token original. Se reenvía a AUTH como subject_token para
   * comprobaciones dinámicas de sesión y autorización.
   */
  token: string;

  payload: JwtPayload;
}
