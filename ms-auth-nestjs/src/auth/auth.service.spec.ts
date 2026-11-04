import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { describe, expect, it, vi } from 'vitest';
import { AuthService } from './auth.service.js';
import { UsersService } from '../users/users.service.js';
import { hashPassword } from '../common/security/password.js';
import type { User } from '../users/entities/user.entity.js';

const USER_ID = '00000000-0000-4000-8000-000000000001';
const PASSWORD = 'ClaveSegura2026!';

async function makeUser(overrides: Partial<User> = {}): Promise<User> {
  return {
    id: USER_ID,
    username: 'jperez',
    email: 'jperez@example.com',
    passwordHash: await hashPassword(PASSWORD),
    tokenVersion: 0,
    estado: true,
    userRoles: [
      {
        estado: true,
        role: { rol: 'ADMIN', estado: true },
      },
    ],
    ...overrides,
  } as unknown as User;
}

function createService(usersService: Partial<UsersService>) {
  const signAsync = vi.fn().mockResolvedValue('signed.jwt.token');

  const service = new AuthService(
    usersService as UsersService,
    { signAsync } as unknown as JwtService,
    { get: () => 900 } as unknown as ConfigService,
  );

  return { service, signAsync };
}

describe('AuthService', () => {
  it('emite un token sin roles y devuelve roles desde PostgreSQL', async () => {
    const user = await makeUser();

    const { service, signAsync } = createService({
      findForAuthentication: vi.fn().mockResolvedValue(user),
      findActiveWithRoles: vi.fn().mockResolvedValue(user),
    });

    const result = await service.login({
      identifier: 'jperez',
      password: PASSWORD,
    });

    expect(result.accessToken).toBe('signed.jwt.token');
    expect(result.user.roles).toEqual(['ADMIN']);
    expect(signAsync).toHaveBeenCalledWith({
      sub: USER_ID,
      username: 'jperez',
      tokenVersion: 0,
      typ: 'access',
    });
    expect(signAsync.mock.calls[0][0]).not.toHaveProperty('roles');
  });

  it('rechaza un usuario inexistente', async () => {
    const { service } = createService({
      findForAuthentication: vi.fn().mockResolvedValue(null),
    });
    await service.onModuleInit();

    await expect(
      service.login({ identifier: 'nadie', password: PASSWORD }),
    ).rejects.toThrow(UnauthorizedException);
  });

  it('rechaza una contraseña incorrecta', async () => {
    const user = await makeUser();

    const { service } = createService({
      findForAuthentication: vi.fn().mockResolvedValue(user),
    });

    await expect(
      service.login({ identifier: 'jperez', password: 'Incorrecta2026!' }),
    ).rejects.toThrow(UnauthorizedException);
  });

  it('incrementa tokenVersion en logout', async () => {
    const incrementTokenVersion = vi.fn().mockResolvedValue(undefined);

    const { service } = createService({ incrementTokenVersion });

    await service.logout(USER_ID);

    expect(incrementTokenVersion).toHaveBeenCalledWith(USER_ID);
  });
});
