import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { UsersService } from '../users/users.service.js';
import { JwtPayload } from '../auth/interfaces/jwt-payload/jwt-payload.interface.js';
import { AuthorizationCheckDto } from './dto/authorization-check.dto.js';
import { AuthorizationDecision } from './interfaces/authorization-decision.interface.js';

/*
 * Matriz de permisos explícita para las acciones internas.
 * Para esta versión solo ADMIN y ANALYST pueden ejecutar análisis.
 */
const ACTION_ROLES: Record<string, readonly string[]> = {
  'steganography.analyze': ['ADMIN', 'ANALYST'],
};

@Injectable()
export class InternalAuthorizationService {
  private readonly logger = new Logger(InternalAuthorizationService.name);

  constructor(
    private readonly jwtService: JwtService,
    private readonly usersService: UsersService,
  ) {}

  async check(dto: AuthorizationCheckDto): Promise<AuthorizationDecision> {
    const payload = await this.verifySubjectToken(dto.subject_token);

    /*
     * Denegación segura por defecto: cualquier fallo posterior a la
     * validación criptográfica del token se resuelve como `allowed: false`.
     */
    try {
      const user = await this.usersService.findActiveWithRoles(payload.sub);

      if (!user) {
        return this.deny(payload.sub, dto.action, 'subject_not_active');
      }

      if (payload.tokenVersion !== user.tokenVersion) {
        return this.deny(payload.sub, dto.action, 'token_revoked');
      }

      const allowedRoles = ACTION_ROLES[dto.action];

      if (!allowedRoles) {
        return this.deny(payload.sub, dto.action, 'unsupported_action');
      }

      /*
       * findActiveWithRoles ya filtra:
       * - usuario activo y no eliminado
       * - asignación user_roles activa
       * - rol activo y no eliminado
       */
      const roles = (user.userRoles ?? [])
        .filter((userRole) => userRole.estado && userRole.role?.estado)
        .map((userRole) => userRole.role.rol.toUpperCase());

      const allowed = roles.some((role) => allowedRoles.includes(role));

      return {
        subject_id: payload.sub,
        action: dto.action,
        allowed,
        reason: allowed
          ? 'active_role_grants_permission'
          : 'insufficient_permissions',
      };
    } catch (error) {
      this.logger.error(
        'Fallo al evaluar autorización interna',
        error instanceof Error ? error.stack : undefined,
      );

      return this.deny(payload.sub, dto.action, 'authorization_unavailable');
    }
  }

  private async verifySubjectToken(token: string): Promise<JwtPayload> {
    let payload: JwtPayload;

    try {
      /*
       * Firma RS256 con la clave pública, expiración, issuer y audience
       * son validados por la configuración de JwtModule.
       */
      payload = await this.jwtService.verifyAsync<JwtPayload>(token, {
        algorithms: ['RS256'],
      });
    } catch {
      throw new UnauthorizedException('Token de usuario inválido');
    }

    if (payload.typ !== 'access' || typeof payload.sub !== 'string') {
      throw new UnauthorizedException('Token de usuario inválido');
    }

    return payload;
  }

  private deny(
    subjectId: string,
    action: string,
    reason: string,
  ): AuthorizationDecision {
    return {
      subject_id: subjectId,
      action,
      allowed: false,
      reason,
    };
  }
}
