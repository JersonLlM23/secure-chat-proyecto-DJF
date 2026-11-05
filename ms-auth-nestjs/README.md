# ms-auth-nestjs

Microservicio de autenticación y autorización del proyecto **Secure Chat**
(Desarrollo de Software Seguro). Gestiona usuarios, roles, asignaciones y
emite/valida JWT firmados con **RS256**. Aplica **RBAC dinámico** consultando
PostgreSQL en cada solicitud y expone un endpoint interno para que **STEGO**
consulte decisiones de autorización.

> Alcance: este repositorio implementa únicamente **AUTH**. STEGO no forma
> parte de este entregable; solo se deja preparado su contrato de comunicación.

---

## 1. Descripción

AUTH es un microservicio REST independiente que:

- Autentica usuarios (`username` o `email` + contraseña con Argon2id).
- Emite access tokens JWT firmados con una clave privada RSA (RS256).
- Valida firma, expiración, issuer, audience y tipo de token.
- Mantiene sesiones mediante `tokenVersion` (logout invalida tokens previos).
- Administra usuarios, roles y la relación N:M `user_roles`.
- Autoriza con datos vigentes de PostgreSQL (usuario, asignación y rol).
- Ofrece `POST /internal/authorization/check` para STEGO.
- Puede ejecutarse sin STEGO.

## 2. Arquitectura y responsabilidades

```
ms-auth-nestjs
â”œâ”€â”€ src/auth          Login, logout, perfil, JWT RS256, guards y decorators
â”œâ”€â”€ src/users         CRUD de usuarios
â”œâ”€â”€ src/roles         CRUD de roles
â”œâ”€â”€ src/user-roles    Asignación/revocación/activación de roles
â”œâ”€â”€ src/internal      Endpoint interno de autorización para STEGO
â”œâ”€â”€ src/database      DataSource, migraciones, runner y seed
â”œâ”€â”€ src/common        Filtros, middleware, DTO y utilidades de seguridad
â””â”€â”€ src/config        Validación de entorno (Zod) y carga de claves RSA
```

Modelo relacional:

- `users`
- `roles`
- `user_roles` (`id` PK, `user_id` FK, `role_id` FK, `assigned_at`,
  `status`, auditoría y `UNIQUE (user_id, role_id)`)

La autorización **nunca** usa roles embebidos en el JWT. El JWT solo
identifica al usuario (`sub`, `username`, `tokenVersion`, `typ`).

## 3. Tecnologías

- NestJS 12 + TypeScript (ESM)
- PostgreSQL + TypeORM (migraciones, `synchronize: false`)
- `@nestjs/jwt` + Passport (`passport-jwt`) con RS256
- Argon2id
- Zod para variables de entorno
- class-validator / class-transformer
- Vitest + Supertest
- Docker multi-stage + Docker Compose

## 4. Requisitos previos

- Node.js 24+
- npm 11+
- Docker + Docker Compose (para PostgreSQL y despliegue)
- OpenSSL (generación de claves RSA)

## 5. Instalación local

```bash
npm ci
cp example.env.dist .env
# editar .env con credenciales locales
```

## 6. Variables de entorno

| Variable                                                       | Obligatoria | Descripción                              |
| -------------------------------------------------------------- | ----------- | ---------------------------------------- |
| `NODE_ENV`                                                     | No          | `development`, `test`, `production`      |
| `PORT`                                                         | No          | Puerto HTTP (default `3001`)             |
| `CORS_ORIGINS`                                                 | No          | Orígenes separados por coma              |
| `TRUST_PROXY`                                                  | No          | Configuración de proxy confiable         |
| `DB_HOST` / `DB_PORT`                                          | Sí          | Conexión PostgreSQL                      |
| `DB_USERNAME` / `DB_PASSWORD`                                  | Sí          | Credenciales (password ≥ 12)             |
| `DB_DATABASE`                                                  | Sí          | Base de datos                            |
| `DB_SSL`                                                       | No          | `true`/`false`                           |
| `RATE_LIMIT_TTL_MS` / `RATE_LIMIT_MAX` / `RATE_LIMIT_BLOCK_MS` | No          | Throttling global                        |
| `JWT_PRIVATE_KEY_PATH`                                         | Sí          | Ruta de la clave privada RSA (solo AUTH) |
| `JWT_PUBLIC_KEY_PATH`                                          | Sí          | Ruta de la clave pública RSA             |
| `JWT_EXPIRES_IN_SECONDS`                                       | No          | Expiración del access token (60–3600)    |
| `JWT_ISSUER`                                                   | No          | Default `ms-auth`                        |
| `JWT_AUDIENCE`                                                 | No          | Default `secure-chat-api`                |
| `INTERNAL_API_KEY`                                             | Sí          | API key de servicio (≥ 256 bits)         |

`JWT_SECRET` fue eliminado: no existe fallback silencioso a HS256. Si las
claves no están presentes, AUTH falla al iniciar.

## 7. Generación y ubicación de claves RSA

```bash
mkdir keys
openssl genpkey -algorithm RSA -pkeyopt rsa_keygen_bits:2048 -out keys/private.pem
openssl rsa -pubout -in keys/private.pem -out keys/public.pem
```

- `keys/private.pem` permanece **solo en AUTH**.
- `keys/public.pem` puede compartirse con STEGO.
- `keys/` y `*.pem` están en `.gitignore` y en `.dockerignore`.
- En Docker las claves se montan de solo lectura en `/app/keys`.

## 8. Configuración de PostgreSQL

El despliegue integrado (AUTH + STEGO + ambas bases) se define en el
`docker-compose.yml` de la raiz del repositorio. AUTH usa el servicio
`auth-db` y el volumen externo `ms-auth-nestjs_users_postgres_data`:

```bash
docker compose up -d auth-db
```

Para desarrollo local sin Docker se puede usar cualquier PostgreSQL
accesible y configurar `DB_*` en el `.env` de este microservicio.

## 9. Ejecución de migraciones

```bash
# compila y aplica migraciones pendientes
npm run migration:run

# revierte la última migración
npm run migration:revert
```

Migraciones incluidas:

1. `InitialSchema` — esquema base (idempotente).
2. `LegacySchemaAlignment` — alinea columnas heredadas
   (`estado` → `status`, `fecha_*` → `created_at`/`updated_at`/`deleted_at`,
   `fecha_asignacion` → `assigned_at`), agrega `id` a `user_roles`, crea
   `UNIQUE (user_id, role_id)` y migra roles heredados:
   `OPERADOR` → `ANALYST`, `CLIENTE` → `USER`.

`synchronize` está deshabilitado en todos los entornos.

## 10. Ejecución local

```bash
npm run migration:run
npm run seed
npm run start:dev
```

Servicios:

- API: `http://localhost:3001/api`
- Swagger (solo fuera de producción): `http://localhost:3001/docs`
- Health: `http://localhost:3001/api/health`

Usuarios de ejemplo creados por el seed (todos con `ClaveSegura2026!`):

| Usuario    | Rol principal  |
| ---------- | -------------- |
| `jperez`   | ADMIN          |
| `amendoza` | ANALYST        |
| `mgomez`   | USER           |
| `cvega`    | USER + ANALYST |
| `lcastro`  | USER           |

## 11. Despliegue con Docker Compose

El compose interno de este microservicio fue retirado. Usar el compose de
la raiz:

```bash
# desde la raiz del repositorio
docker compose up -d --build auth auth-migrate auth-db
```

- PostgreSQL conserva el volumen externo
  `ms-auth-nestjs_users_postgres_data`.
- Las migraciones se ejecutan una sola vez en `auth-migrate`
  (`restart: "no"`). AUTH solo inicia con `node dist/main.js`.
- Las claves se montan desde `./ms-auth-nestjs/keys` (solo lectura).
- Contenedor con usuario no privilegiado y `no-new-privileges`.
- Healthchecks para PostgreSQL y AUTH.
- Para aplicar migraciones nuevas: `docker compose run --rm auth-migrate`.

> La autenticación servicio-a-servicio con `X-Service-Key` debe usarse dentro
> de una red privada. No sustituye TLS cuando los servicios salen de la red
> local confiable.

## 12. Endpoints

### Autenticación

| Método | Ruta                | Acceso                        |
| ------ | ------------------- | ----------------------------- |
| POST   | `/api/auth/login`   | Público (throttle 5/min)      |
| GET    | `/api/auth/profile` | Cualquier usuario autenticado |
| GET    | `/api/auth/me`      | Alias heredado de `profile`   |
| POST   | `/api/auth/logout`  | Cualquier usuario autenticado |

### Usuarios (ADMIN)

| Método | Ruta                        |
| ------ | --------------------------- |
| POST   | `/api/users`                |
| GET    | `/api/users`                |
| GET    | `/api/users/:id`            |
| GET    | `/api/users/cedula/:cedula` |
| PATCH  | `/api/users/:id`            |
| DELETE | `/api/users/:id`            |

### Roles (ADMIN)

| Método | Ruta             |
| ------ | ---------------- |
| POST   | `/api/roles`     |
| GET    | `/api/roles`     |
| GET    | `/api/roles/:id` |
| PATCH  | `/api/roles/:id` |
| DELETE | `/api/roles/:id` |

### Asignación de roles (ADMIN)

| Método | Ruta                                          |
| ------ | --------------------------------------------- |
| POST   | `/api/user-roles`                             |
| GET    | `/api/user-roles/user/:userId`                |
| GET    | `/api/user-roles/:id`                         |
| PATCH  | `/api/user-roles/:id` (`{ "estado": false }`) |
| DELETE | `/api/user-roles/:id`                         |
| DELETE | `/api/user-roles/:userId/:roleId` (heredado)  |

### Interno / Salud

| Método | Ruta                            | Acceso                            |
| ------ | ------------------------------- | --------------------------------- |
| POST   | `/internal/authorization/check` | `X-Service-Key` + JWT del usuario |
| GET    | `/api/health`                   | Público                           |

## 13. Matriz RBAC

| Recurso / acción                  | ADMIN | ANALYST | USER |
| --------------------------------- | :---: | :-----: | :--: |
| Gestionar usuarios                |  ✅   |   ❌    |  ❌  |
| Gestionar roles                   |  ✅   |   ❌    |  ❌  |
| Asignar/revocar roles             |  ✅   |   ❌    |  ❌  |
| Ver perfil propio                 |  ✅   |   ✅    |  ✅  |
| `steganography.analyze` (interno) |  ✅   |   ✅    |  ❌  |

La autorización se recalcula en cada request desde PostgreSQL. Desactivar una
asignación (`user_roles.status = false`) revoca el permiso de inmediato aunque
el JWT siga vigente. Los roles inactivos o eliminados no conceden permisos.

## 14. Contrato del endpoint interno

`POST /internal/authorization/check`

Headers:

```
X-Service-Key: <INTERNAL_API_KEY>
Content-Type: application/json
```

Solicitud:

```json
{
  "subject_token": "JWT_DEL_USUARIO",
  "action": "steganography.analyze",
  "resource_id": null
}
```

La identidad se obtiene **solo** validando `subject_token`. No se acepta un
`userId` enviado por STEGO.

Respuesta autorizada (`200`):

```json
{
  "subject_id": "uuid",
  "action": "steganography.analyze",
  "allowed": true,
  "reason": "active_role_grants_permission"
}
```

Respuesta denegada (`200`):

```json
{
  "subject_id": "uuid",
  "action": "steganography.analyze",
  "allowed": false,
  "reason": "insufficient_permissions"
}
```

Códigos de error:

- `401`: API key ausente/incorrecta o JWT inválido/expirado/firma incorrecta.
- `400`: DTO inválido.
- `403`: guard de roles (otras rutas).

Motivos de denegación: `insufficient_permissions`, `subject_not_active`,
`token_revoked`, `unsupported_action`, `authorization_unavailable`.

Por diseño, cualquier fallo posterior a la validación del token (incluido un
error de persistencia) devuelve `allowed: false`.

## 15. Ejemplos

Login:

```bash
curl -X POST http://localhost:3001/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"identifier":"jperez","password":"ClaveSegura2026!"}'
```

Perfil:

```bash
curl http://localhost:3001/api/auth/profile \
  -H "Authorization: Bearer <TOKEN>"
```

Decisión interna:

```bash
curl -X POST http://localhost:3001/internal/authorization/check \
  -H "Content-Type: application/json" \
  -H "X-Service-Key: <INTERNAL_API_KEY>" \
  -d '{"subject_token":"<TOKEN>","action":"steganography.analyze","resource_id":null}'
```

Activación/desactivación de una asignación:

```bash
curl -X PATCH http://localhost:3001/api/user-roles/<ID_ASIGNACION> \
  -H "Authorization: Bearer <TOKEN_ADMIN>" \
  -H "Content-Type: application/json" \
  -d '{"estado": false}'
```

## 16. Ejecución de pruebas

```bash
# unitarias (no requieren PostgreSQL)
npm test

# e2e/integración con PostgreSQL real + migraciones aplicadas + claves RSA
npm run migration:run
npm run test:e2e
```

Las pruebas e2e crean usuarios de prueba, verifican login/logout, RS256,
issuer/audience/typ, firma inválida, expiración, RBAC y el endpoint interno,
y eliminan sus datos al finalizar. No se usan mocks para afirmar integración
con PostgreSQL.

## 17. Consideraciones de seguridad

- RS256 obligatorio; se rechaza HS256 y cualquier otro algoritmo.
- La clave privada no se comparte, versiona ni incluye en la imagen Docker.
- Contraseñas solo como hash Argon2id (`memoryCost=19456`, `timeCost=2`,
  `parallelism=1`); nunca se devuelven ni se registran.
- Login con mensajes genéricos y hash ficticio para reducir diferencias de tiempo.
- `tokenVersion` invalida sesiones en logout.
- RBAC en cada request con estado de usuario, asignación y rol.
- `RolesGuard` deniega por defecto rutas privadas sin `@Roles()` explícito;
  las rutas abiertas usan `@Public()` y las de solo autenticación usan
  `@AllowAnyAuthenticated()`.
- API key interna comparada en tiempo constante y nunca registrada.
- ValidationPipe estricto, CORS restrictivo, cabeceras de seguridad, filtro
  global de excepciones y `ClassSerializerInterceptor` para excluir hashes.
- `synchronize: false` y migraciones explícitas.
- No se registran contraseñas, JWT completos, claves ni API keys.

## 18. Colección Postman

La colección funcional se encuentra en:

- `postman/ms-auth.postman_collection.json`
- `postman/ms-auth.postman_environment.json`

Importar ambas en Postman, ejecutar `Login` y usar las variables
`accessToken`, `adminId`, `roleId`, etc.
