import { Injectable, UnauthorizedException } from '@nestjs/common';

import { ConfigService } from '@nestjs/config';

import { PassportStrategy } from '@nestjs/passport';

import { ExtractJwt, Strategy } from 'passport-jwt';
import { JwtPayload } from '../../interfaces/jwt-payload/jwt-payload.interface.js';
import { AuthenticatedUser } from '../../interfaces/authenticated-user/authenticated-user.interface.js';
import { UsersService } from '../../../users/users.service.js';
import { loadJwtPublicKey } from '../../../config/jwt-keys.js';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(
    configService: ConfigService,

    private readonly usersService: UsersService,
  ) {
    super({
      /*
       * Authorization:
       * Bearer eyJ...
       */
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),

      ignoreExpiration: false,

      /*
       * Solo la clave pública. El algoritmo aceptado es
       * exclusivamente RS256 (nunca HS256 ni "none").
       */
      secretOrKey: loadJwtPublicKey(configService),

      issuer: configService.getOrThrow<string>('JWT_ISSUER'),

      audience: configService.getOrThrow<string>('JWT_AUDIENCE'),

      algorithms: ['RS256'],
    });
  }

  async validate(payload: JwtPayload): Promise<AuthenticatedUser> {
    /*
     * Solamente aceptamos
     * access tokens.
     */
    if (payload.typ !== 'access' || typeof payload.sub !== 'string') {
      throw new UnauthorizedException('Token inválido');
    }

    /*
     * Consultamos PostgreSQL.
     *
     * Aquí obtenemos:
     *
     * users
     *   ↓
     * user_roles
     *   ↓
     * roles
     */
    const user = await this.usersService.findActiveWithRoles(payload.sub);

    if (!user) {
      throw new UnauthorizedException('Usuario no autorizado');
    }

    /*
     * Verificación de cierre de sesión.
     *
     * JWT viejo:
     * tokenVersion = 0
     *
     * PostgreSQL después del logout:
     * tokenVersion = 1
     */
    if (payload.tokenVersion !== user.tokenVersion) {
      throw new UnauthorizedException('La sesión ha expirado');
    }

    /*
     * Los roles NO salen del JWT.
     *
     * Salen de:
     *
     * user_roles
     *     ↓
     * roles
     */
    const roles =
      user.userRoles
        ?.filter(
          (userRole) =>
            userRole.estado &&
            userRole.role !== undefined &&
            userRole.role !== null &&
            userRole.role.estado,
        )

        .map((userRole) => userRole.role.rol) ?? [];

    return {
      userId: user.id,

      username: user.username,

      email: user.email,

      roles: [...new Set(roles)],
    };
  }
}
