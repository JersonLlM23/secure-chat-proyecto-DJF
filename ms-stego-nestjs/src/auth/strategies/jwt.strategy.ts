import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import type { Request } from 'express';

import { loadJwtPublicKey } from '../../config/jwt-public-key.js';
import type { AuthenticatedUser } from '../interfaces/authenticated-user.interface.js';
import type { JwtPayload } from '../interfaces/jwt-payload.interface.js';

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(config: ConfigService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: loadJwtPublicKey(config),
      algorithms: ['RS256'],
      issuer: config.getOrThrow<string>('JWT_ISSUER'),
      audience: config.getOrThrow<string>('JWT_AUDIENCE'),
      passReqToCallback: true,
    });
  }

  /*
   * La verificación criptográfica (firma, exp, iss, aud) la realiza
   * passport-jwt antes de invocar este método. Aquí solo se valida la
   * forma del payload y se conserva el token para AUTH.
   */
  validate(request: Request, payload: JwtPayload): AuthenticatedUser {
    if (
      payload.typ !== 'access' ||
      typeof payload.sub !== 'string' ||
      !UUID_PATTERN.test(payload.sub)
    ) {
      throw new UnauthorizedException('Token de usuario inválido');
    }

    const authorization = request.header('authorization');

    const token =
      authorization?.startsWith('Bearer ') === true
        ? authorization.slice('Bearer '.length)
        : '';

    if (!token) {
      throw new UnauthorizedException('Token de usuario inválido');
    }

    return {
      userId: payload.sub,
      token,
      payload,
    };
  }
}
