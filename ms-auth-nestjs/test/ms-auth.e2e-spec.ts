import { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Test, TestingModule } from '@nestjs/testing';
import { NestExpressApplication } from '@nestjs/platform-express';
import { generateKeyPairSync } from 'node:crypto';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/configure-app.js';
import { hashPassword } from '../src/common/security/password.js';
import { Role } from '../src/roles/entities/role.entity.js';
import { UserRole } from '../src/user-roles/entities/user-role.entity.js';
import { User } from '../src/users/entities/user.entity.js';

const PASSWORD = 'ClaveSegura2026!';
const ACTION = 'steganography.analyze';
const READ_OWN = 'steganography.results.read.own';
const READ_ANY = 'steganography.results.read.any';

type Subject = {
  id: string;
  username: string;
  token: string;
};

describe('AUTH Service (e2e, PostgreSQL real)', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let jwtService: JwtService;
  let issuer: string;
  let audience: string;
  let serviceKey: string;

  const createdUserIds: string[] = [];
  let admin: Subject;
  let analyst: Subject;
  let regularUser: Subject;
  let inactiveAssignmentUser: Subject;
  let logoutUser: Subject;
  let inactiveUserUsername: string;

  let counter = 0;

  async function createSubject(
    roleName: string,
    options: { assignmentActive?: boolean; active?: boolean } = {},
  ): Promise<Subject & { assignmentId: string }> {
    counter += 1;

    const suffix = `${Date.now()}${counter}`.slice(-8);
    const username = `e2e_${roleName.toLowerCase()}_${suffix}`;
    const userRepository = dataSource.getRepository(User);
    const roleRepository = dataSource.getRepository(Role);
    const userRoleRepository = dataSource.getRepository(UserRole);

    const role = await roleRepository.findOneOrFail({
      where: { rol: roleName },
    });

    const user = await userRepository.save(
      userRepository.create({
        cedula: `${1700000000 + counter}`,
        nombres: 'E2E',
        apellidos: 'Subject',
        fechaNacimiento: '1990-01-01',
        username,
        email: `${username}@example.com`,
        telefono: `${1900000000 + counter}`,
        passwordHash: await hashPassword(PASSWORD),
        estado: options.active ?? true,
      }),
    );

    createdUserIds.push(user.id);

    const assignment = await userRoleRepository.save(
      userRoleRepository.create({
        userId: user.id,
        roleId: role.id,
        estado: options.assignmentActive ?? true,
      }),
    );

    const token = await jwtService.signAsync({
      sub: user.id,
      username: user.username,
      tokenVersion: user.tokenVersion,
      typ: 'access',
    });

    return {
      id: user.id,
      username: user.username,
      token,
      assignmentId: assignment.id,
    };
  }

  function internalRequest(
    token?: string,
    key = serviceKey,
    action = ACTION,
  ) {
    const req = request(app.getHttpServer())
      .post('/internal/authorization/check')
      .send({ subject_token: token ?? '', action, resource_id: null });

    return key ? req.set('X-Service-Key', key) : req;
  }

  function accessTokenFor(
    subject: Subject,
    overrides: {
      tokenVersion?: number;
      typ?: string;
      issuer?: string;
      audience?: string;
      expiresIn?: number;
    } = {},
  ) {
    const options: Record<string, unknown> = {
      expiresIn: overrides.expiresIn ?? 900,
    };

    if (overrides.issuer !== undefined) {
      options.issuer = overrides.issuer;
    }

    if (overrides.audience !== undefined) {
      options.audience = overrides.audience;
    }

    return jwtService.signAsync(
      {
        sub: subject.id,
        username: subject.username,
        tokenVersion: overrides.tokenVersion ?? 0,
        typ: overrides.typ ?? 'access',
      },
      options,
    );
  }

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication<NestExpressApplication>();
    configureApp(app as NestExpressApplication);
    await app.init();

    dataSource = app.get(DataSource);
    jwtService = app.get(JwtService);

    const config = app.get(ConfigService);
    issuer = config.getOrThrow<string>('JWT_ISSUER');
    audience = config.getOrThrow<string>('JWT_AUDIENCE');
    serviceKey = config.getOrThrow<string>('INTERNAL_API_KEY');

    admin = await createSubject('ADMIN');
    analyst = await createSubject('ANALYST');
    regularUser = await createSubject('USER');
    inactiveAssignmentUser = await createSubject('USER', {
      assignmentActive: false,
    });
    logoutUser = await createSubject('USER');

    const inactive = await createSubject('USER', { active: false });
    inactiveUserUsername = inactive.username;
  });

  afterAll(async () => {
    if (dataSource?.isInitialized) {
      if (createdUserIds.length > 0) {
        await dataSource.query(
          'DELETE FROM user_roles WHERE user_id = ANY($1::uuid[])',
          [createdUserIds],
        );
        await dataSource.query('DELETE FROM users WHERE id = ANY($1::uuid[])', [
          createdUserIds,
        ]);
      }
    }

    await app?.close();
  });

  describe('Salud y migraciones', () => {
    it('GET /api/health responde ok', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/health')
        .expect(200);

      expect(response.body.status).toBe('ok');
      expect(response.body.service).toBe('ms-auth-nestjs');
    });

    it('las rutas antiguas /api/v1 ya no funcionan', async () => {
      await request(app.getHttpServer()).get('/api/v1/health').expect(404);

      await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ identifier: admin.username, password: PASSWORD })
        .expect(404);

      await request(app.getHttpServer())
        .post('/api/v1/internal/authorization/check')
        .set('X-Service-Key', serviceKey)
        .send({ subject_token: admin.token, action: ACTION })
        .expect(404);
    });

    it('synchronize está deshabilitado y existen migraciones aplicadas', async () => {
      expect(dataSource.options.synchronize).toBe(false);

      const rows = await dataSource.query(
        'SELECT count(*)::int AS total FROM migrations',
      );

      expect(rows[0].total).toBeGreaterThan(0);
    });
  });

  describe('Autenticación', () => {
    it('login exitoso emite un JWT RS256 sin roles', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ identifier: admin.username, password: PASSWORD })
        .expect(200);

      const token = response.body.accessToken as string;
      const [encodedHeader] = token.split('.');
      const header = JSON.parse(
        Buffer.from(encodedHeader, 'base64url').toString('utf8'),
      );
      const payload = jwt.decode(token) as Record<string, unknown>;

      expect(header.alg).toBe('RS256');
      expect(payload.sub).toBe(admin.id);
      expect(payload.typ).toBe('access');
      expect(payload.tokenVersion).toBe(0);
      expect(payload).not.toHaveProperty('roles');
      expect(response.body.user.roles).toEqual(['ADMIN']);
    });

    it('rechaza un usuario inexistente', async () => {
      await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ identifier: 'no_existe_e2e', password: PASSWORD })
        .expect(401);
    });

    it('rechaza una contraseña incorrecta', async () => {
      await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ identifier: admin.username, password: 'Incorrecta2026!' })
        .expect(401);
    });

    it('rechaza un usuario inactivo', async () => {
      await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ identifier: inactiveUserUsername, password: PASSWORD })
        .expect(401);
    });

    it('GET /api/auth/profile exige un token', async () => {
      await request(app.getHttpServer())
        .get('/api/auth/profile')
        .expect(401);

      const response = await request(app.getHttpServer())
        .get('/api/auth/profile')
        .set('Authorization', `Bearer ${admin.token}`)
        .expect(200);

      expect(response.body.userId).toBe(admin.id);
      expect(response.body.roles).toEqual(['ADMIN']);
    });

    it('GET /api/auth/me se conserva como alias', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${admin.token}`)
        .expect(200);

      expect(response.body.userId).toBe(admin.id);
    });

    it('logout invalida el token anterior mediante tokenVersion', async () => {
      await request(app.getHttpServer())
        .post('/api/auth/logout')
        .set('Authorization', `Bearer ${logoutUser.token}`)
        .expect(204);

      await request(app.getHttpServer())
        .get('/api/auth/profile')
        .set('Authorization', `Bearer ${logoutUser.token}`)
        .expect(401);
    });
  });

  describe('Endpoint interno de autorización', () => {
    it('rechaza una solicitud sin X-Service-Key', async () => {
      await internalRequest(admin.token, '').expect(401);
    });

    it('rechaza una API key incorrecta', async () => {
      await internalRequest(admin.token, 'b'.repeat(64)).expect(401);
    });

    it('rechaza un token de usuario inválido', async () => {
      await internalRequest('no-es-un-jwt').expect(401);
    });

    it('rechaza un token firmado con HS256', async () => {
      const forged = jwt.sign(
        { sub: admin.id, username: admin.username, tokenVersion: 0, typ: 'access' },
        'secreto-simetrico',
        { algorithm: 'HS256', issuer, audience, expiresIn: 900 },
      );

      await internalRequest(forged).expect(401);
    });

    it('rechaza un token con firma de otra clave RSA', async () => {
      const { privateKey } = generateKeyPairSync('rsa', {
        modulusLength: 2048,
      });

      const forged = jwt.sign(
        { sub: admin.id, username: admin.username, tokenVersion: 0, typ: 'access' },
        privateKey.export({ type: 'pkcs8', format: 'pem' }),
        { algorithm: 'RS256', issuer, audience, expiresIn: 900 },
      );

      await internalRequest(forged).expect(401);
    });

    it('rechaza un token expirado', async () => {
      const token = await accessTokenFor(admin, { expiresIn: -1 });
      await internalRequest(token).expect(401);
    });

    it('rechaza un issuer incorrecto', async () => {
      const token = await accessTokenFor(admin, { issuer: 'issuer-malicioso' });
      await internalRequest(token).expect(401);
    });

    it('rechaza una audience incorrecta', async () => {
      const token = await accessTokenFor(admin, { audience: 'otra-api' });
      await internalRequest(token).expect(401);
    });

    it('rechaza un token con typ distinto de access', async () => {
      const token = await accessTokenFor(admin, { typ: 'refresh' });
      await internalRequest(token).expect(401);
    });

    it('autoriza a ADMIN con una decisión explícita', async () => {
      const response = await internalRequest(admin.token).expect(200);

      expect(response.body).toEqual({
        subject_id: admin.id,
        action: ACTION,
        allowed: true,
        reason: 'active_role_grants_permission',
      });
    });

    it('autoriza a ANALYST', async () => {
      const response = await internalRequest(analyst.token).expect(200);

      expect(response.body.allowed).toBe(true);
      expect(response.body.reason).toBe('active_role_grants_permission');
    });

    it('deniega a USER', async () => {
      const response = await internalRequest(regularUser.token).expect(200);

      expect(response.body.allowed).toBe(false);
      expect(response.body.reason).toBe('insufficient_permissions');
    });

    it('deniega si la asignación de rol está inactiva', async () => {
      const response = await internalRequest(
        inactiveAssignmentUser.token,
      ).expect(200);

      expect(response.body.allowed).toBe(false);
      expect(response.body.reason).toBe('insufficient_permissions');
    });

    it('deniega un token revocado por tokenVersion', async () => {
      const token = await accessTokenFor(admin, { tokenVersion: 99 });
      const response = await internalRequest(token).expect(200);

      expect(response.body.allowed).toBe(false);
      expect(response.body.reason).toBe('token_revoked');
    });

    it('autoriza a ADMIN a consultar resultados ajenos', async () => {
      const response = await internalRequest(
        admin.token,
        serviceKey,
        READ_ANY,
      ).expect(200);

      expect(response.body).toEqual({
        subject_id: admin.id,
        action: READ_ANY,
        allowed: true,
        reason: 'active_role_grants_permission',
      });
    });

    it('deniega a ANALYST la consulta de resultados ajenos', async () => {
      const response = await internalRequest(
        analyst.token,
        serviceKey,
        READ_ANY,
      ).expect(200);

      expect(response.body.allowed).toBe(false);
      expect(response.body.reason).toBe('insufficient_permissions');
    });

    it('deniega a USER la consulta de resultados ajenos', async () => {
      const response = await internalRequest(
        regularUser.token,
        serviceKey,
        READ_ANY,
      ).expect(200);

      expect(response.body.allowed).toBe(false);
      expect(response.body.reason).toBe('insufficient_permissions');
    });

    it('autoriza a ADMIN, ANALYST y USER a consultar resultados propios', async () => {
      for (const subject of [admin, analyst, regularUser]) {
        const response = await internalRequest(
          subject.token,
          serviceKey,
          READ_OWN,
        ).expect(200);

        expect(response.body.allowed).toBe(true);
        expect(response.body.action).toBe(READ_OWN);
        expect(response.body.reason).toBe('active_role_grants_permission');
      }
    });

    it('deniega resultados propios si el rol está inactivo', async () => {
      const response = await internalRequest(
        inactiveAssignmentUser.token,
        serviceKey,
        READ_OWN,
      ).expect(200);

      expect(response.body.allowed).toBe(false);
      expect(response.body.reason).toBe('insufficient_permissions');
    });

    it('deniega resultados ajenos si el token fue revocado', async () => {
      const token = await accessTokenFor(admin, { tokenVersion: 99 });
      const response = await internalRequest(
        token,
        serviceKey,
        READ_ANY,
      ).expect(200);

      expect(response.body.allowed).toBe(false);
      expect(response.body.reason).toBe('token_revoked');
    });
  });
});
