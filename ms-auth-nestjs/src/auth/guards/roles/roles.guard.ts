import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';

import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from '../../decorators/roles/roles.decorator.js';
import { IS_PUBLIC_KEY } from '../../decorators/public/public.decorator.js';
import { ALLOW_AUTHENTICATED_KEY } from '../../decorators/allow-authenticated/allow-authenticated.decorator.js';
import { AuthenticatedUser } from '../../interfaces/authenticated-user/authenticated-user.interface.js';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    /*
     * Las rutas @Public() no pasan por autorización RBAC. Su protección,
     * si aplica, es responsabilidad de otro guard (por ejemplo la API key
     * de servicio del endpoint interno).
     */
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) {
      return true;
    }

    /*
     * Roles requeridos por
     * Controller/endpoint.
     */
    const requiredRoles = this.reflector.getAllAndOverride<string[]>(
      ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );

    const request = context.switchToHttp().getRequest<{
      user?: AuthenticatedUser;
    }>();

    /*
     * request.user fue creado
     * por JwtStrategy usando
     * roles provenientes de BD.
     */
    const user = request.user;

    /*
     * Sin @Roles(): si la ruta no se marcó explícitamente como
     * "cualquier autenticado", se deniega. Esto evita que un decorador
     * olvidado deje una ruta sensible accesible a cualquier usuario.
     */
    if (!requiredRoles || requiredRoles.length === 0) {
      const allowAuthenticated = this.reflector.getAllAndOverride<boolean>(
        ALLOW_AUTHENTICATED_KEY,
        [context.getHandler(), context.getClass()],
      );

      if (!allowAuthenticated) {
        throw new ForbiddenException('Acceso no autorizado');
      }

      if (!user) {
        throw new ForbiddenException('Acceso no autorizado');
      }

      return true;
    }

    if (!user) {
      throw new ForbiddenException('Acceso no autorizado');
    }

    const currentRoles = new Set(user.roles.map((role) => role.toUpperCase()));

    const authorized = requiredRoles.some((requiredRole) =>
      currentRoles.has(requiredRole.toUpperCase()),
    );

    if (!authorized) {
      throw new ForbiddenException('No posee los roles requeridos');
    }

    return true;
  }
}
