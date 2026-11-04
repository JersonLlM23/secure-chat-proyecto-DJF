import { SetMetadata } from '@nestjs/common';

export const ALLOW_AUTHENTICATED_KEY = 'allowAnyAuthenticated';

/*
 * Marca explícitamente una ruta como accesible para cualquier usuario
 * autenticado, sin exigir un rol concreto. El RolesGuard deniega por
 * defecto cuando una ruta privada no declara @Roles() ni este decorador.
 */
export const AllowAnyAuthenticated = () =>
  SetMetadata(ALLOW_AUTHENTICATED_KEY, true);
