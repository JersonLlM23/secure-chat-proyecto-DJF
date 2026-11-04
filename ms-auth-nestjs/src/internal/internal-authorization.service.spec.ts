import { UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { describe, expect, it, vi } from 'vitest';
import { InternalAuthorizationService } from './internal-authorization.service.js';
import { UsersService } from '../users/users.service.js';
import type { User } from '../users/entities/user.entity.js';

const SUBJECT_ID = '00000000-0000-4000-8000-000000000001';

function userWithRoles(roles: string[], estado = true): User {
  return {
    id: SUBJECT_ID,
    username: 'subject',
    email: 'subject@example.com',
    tokenVersion: 0,
    userRoles: roles.map((rol) => ({
      estado,
      role: { rol, estado },
    })),
  } as unknown as User;
}

function createService(options: {
  payload?: Record<string, unknown>;
  user?: User | null;
  verifyError?: Error;
  dbError?: Error;
}) {
  const verifyAsync = options.verifyError
    ? vi.fn().mockRejectedValue(options.verifyError)
    : vi.fn().mockResolvedValue(
        options.payload ?? {
          sub: SUBJECT_ID,
          username: 'subject',
          tokenVersion: 0,
          typ: 'access',
        },
      );

  const findActiveWithRoles = options.dbError
    ? vi.fn().mockRejectedValue(options.dbError)
    : vi.fn().mockResolvedValue(options.user ?? null);

  const service = new InternalAuthorizationService(
    { verifyAsync } as unknown as JwtService,
    { findActiveWithRoles } as unknown as UsersService,
  );

  return service;
}

const action = 'steganography.analyze';

describe('InternalAuthorizationService', () => {
  it('autoriza a ADMIN', async () => {
    const service = createService({ user: userWithRoles(['ADMIN']) });

    await expect(service.check({ subject_token: 't', action })).resolves.toEqual(
      {
        subject_id: SUBJECT_ID,
        action,
        allowed: true,
        reason: 'active_role_grants_permission',
      },
    );
  });

  it('autoriza a ANALYST', async () => {
    const service = createService({ user: userWithRoles(['ANALYST']) });

    await expect(service.check({ subject_token: 't', action })).resolves.toEqual(
      {
        subject_id: SUBJECT_ID,
        action,
        allowed: true,
        reason: 'active_role_grants_permission',
      },
    );
  });

  it('deniega a USER', async () => {
    const service = createService({ user: userWithRoles(['USER']) });

    await expect(service.check({ subject_token: 't', action })).resolves.toEqual(
      {
        subject_id: SUBJECT_ID,
        action,
        allowed: false,
        reason: 'insufficient_permissions',
      },
    );
  });

  it('deniega si la asignación está inactiva', async () => {
    const service = createService({
      user: userWithRoles(['ADMIN'], false),
    });

    const result = await service.check({ subject_token: 't', action });

    expect(result.allowed).toBe(false);
    expect(result.reason).toBe('insufficient_permissions');
  });

  it('deniega si el usuario no está activo', async () => {
    const service = createService({ user: null });

    const result = await service.check({ subject_token: 't', action });

    expect(result.allowed).toBe(false);
    expect(result.reason).toBe('subject_not_active');
  });

  it('deniega si tokenVersion fue revocado', async () => {
    const service = createService({
      payload: {
        sub: SUBJECT_ID,
        username: 'subject',
        tokenVersion: 9,
        typ: 'access',
      },
      user: userWithRoles(['ADMIN']),
    });

    const result = await service.check({ subject_token: 't', action });

    expect(result.allowed).toBe(false);
    expect(result.reason).toBe('token_revoked');
  });

  it('deniega una acción no soportada', async () => {
    const service = createService({ user: userWithRoles(['ADMIN']) });

    const result = await service.check({
      subject_token: 't',
      action: 'unknown.action',
    });

    expect(result.allowed).toBe(false);
    expect(result.reason).toBe('unsupported_action');
  });

  it('rechaza un token inválido', async () => {
    const service = createService({
      verifyError: new Error('invalid signature'),
    });

    await expect(service.check({ subject_token: 't', action })).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('rechaza un token con typ distinto de access', async () => {
    const service = createService({
      payload: {
        sub: SUBJECT_ID,
        username: 'subject',
        tokenVersion: 0,
        typ: 'refresh',
      },
    });

    await expect(service.check({ subject_token: 't', action })).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('deniega de forma segura ante un fallo de persistencia', async () => {
    const service = createService({
      dbError: new Error('database unavailable'),
    });

    const result = await service.check({ subject_token: 't', action });

    expect(result.allowed).toBe(false);
    expect(result.reason).toBe('authorization_unavailable');
  });
});
