/* oxlint-disable typescript/unbound-method */
import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { describe, expect, it } from 'vitest';
import { RolesGuard } from './roles.guard.js';
import { Roles } from '../../decorators/roles/roles.decorator.js';
import { Public } from '../../decorators/public/public.decorator.js';
import { AllowAnyAuthenticated } from '../../decorators/allow-authenticated/allow-authenticated.decorator.js';
import type { AuthenticatedUser } from '../../interfaces/authenticated-user/authenticated-user.interface.js';

class TestController {
  @Public()
  publicHandler(): void {}

  @AllowAnyAuthenticated()
  authenticatedHandler(): void {}

  @Roles('ADMIN')
  adminHandler(): void {}

  @Roles('ADMIN', 'ANALYST')
  adminOrAnalystHandler(): void {}

  unmarkedHandler(): void {}
}

function executionContext(
  handler: () => void,
  user?: AuthenticatedUser,
): ExecutionContext {
  return {
    getHandler: () => handler,
    getClass: () => TestController,
    switchToHttp: () => ({
      getRequest: () => ({ user }),
    }),
  } as unknown as ExecutionContext;
}

const admin: AuthenticatedUser = {
  userId: '00000000-0000-4000-8000-000000000001',
  username: 'admin',
  email: 'admin@example.com',
  roles: ['ADMIN'],
};

const analyst: AuthenticatedUser = {
  userId: '00000000-0000-4000-8000-000000000002',
  username: 'analyst',
  email: 'analyst@example.com',
  roles: ['ANALYST'],
};

describe('RolesGuard', () => {
  const guard = new RolesGuard(new Reflector());

  it('permite rutas públicas', () => {
    const handler = TestController.prototype.publicHandler;
    expect(guard.canActivate(executionContext(handler))).toBe(true);
  });

  it('permite rutas marcadas como cualquier autenticado', () => {
    const handler = TestController.prototype.authenticatedHandler;
    expect(guard.canActivate(executionContext(handler, analyst))).toBe(true);
  });

  it('deniega por defecto una ruta privada sin @Roles ni marca explícita', () => {
    const handler = TestController.prototype.unmarkedHandler;
    expect(() =>
      guard.canActivate(executionContext(handler, admin)),
    ).toThrow(ForbiddenException);
  });

  it('permite cuando el usuario posee el rol requerido', () => {
    const handler = TestController.prototype.adminHandler;
    expect(guard.canActivate(executionContext(handler, admin))).toBe(true);
  });

  it('permite cuando posee al menos uno de varios roles requeridos', () => {
    const handler = TestController.prototype.adminOrAnalystHandler;
    expect(guard.canActivate(executionContext(handler, analyst))).toBe(true);
  });

  it('deniega por rol insuficiente', () => {
    const handler = TestController.prototype.adminHandler;
    expect(() =>
      guard.canActivate(executionContext(handler, analyst)),
    ).toThrow(ForbiddenException);
  });
});
