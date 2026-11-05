# ms-stego-nestjs

Microservicio **STEGO** del proyecto **Secure Chat**. Analiza imagenes PNG y BMP
para detectar indicios de esteganografia LSB (Least Significant Bit) mediante
metricas estadisticas, y persiste cada resultado en su propia base PostgreSQL.

Forma parte de una arquitectura de dos microservicios junto con `ms-auth-nestjs`
(AUTH). STEGO **no emite ni firma tokens**: verifica localmente los JWT RS256
emitidos por AUTH y, ademas, consulta a AUTH una decision de autorizacion
vigente antes de procesar cada solicitud.

---

## 1. Responsabilidades

- Validar el JWT de acceso (firma RS256, `exp`, `iss`, `aud`, `typ = access`).
- Consultar a AUTH la autorizacion de la accion solicitada (RBAC dinamico).
- Validar archivos por extension y magic bytes reales, no por `Content-Type`.
- Decodificar imagenes PNG (via Sharp) y BMP (decoder propio sobre `bmp-ts`).
- Calcular metricas LSB: entropia, PoV, chi-cuadrado y `anomalyScore`.
- Clasificar el resultado, asignar una accion y persistirlo.
- Permitir consultar resultados propios o ajenos segun permisos.
- Exponer un healthcheck real contra PostgreSQL.

No gestiona usuarios, roles ni sesiones: eso pertenece a AUTH. Tampoco oculta ni
extrae mensajes; solo realiza analisis estadistico indicativo.

---

## 2. Arquitectura dentro del proyecto

```text
Cliente (Swagger / Postman)
   |
   v
STEGO :3002
   |
   +--> PostgreSQL STEGO (stego-db)  -> tabla stego_analysis
   |
   +--> AUTH :3001
          POST /internal/authorization/check
          (X-Service-Key + subject_token)
```

Flujo de una solicitud de analisis:

```text
1. JwtAuthGuard valida firma/claims con public.pem
2. StegoService -> AuthClientService pide decision a AUTH (fail-closed)
3. FileValidationService valida presencia, tamano, extension y magic bytes
4. SteganographyService decodifica y calcula metricas
5. StegoService clasifica y persiste en stego_analysis
6. Responde AnalysisResponseDto (201)
```

Si AUTH no responde, responde con error o devuelve una decision incoherente,
STEGO deniega con `503`. La autorizacion nunca se asume por defecto.

---

## 3. Stack tecnologico

| Componente | Version / uso |
| --- | --- |
| NestJS | 12 |
| Node.js | 24 (imagen `node:24-alpine`) |
| TypeScript | 6 (ESM, `nodenext`) |
| PostgreSQL | 18 (contenedor) |
| TypeORM | entidades + migraciones (`synchronize: false`) |
| Passport / passport-jwt | guard JWT RS256 |
| Sharp | decodificacion y normalizacion a sRGB |
| bmp-ts | decodificacion BMP |
| Multer | carga multipart en memoria |
| Zod | validacion del entorno |
| Zod + class-validator | validacion de entrada |
| Vitest | pruebas unitarias y e2e |
| Oxlint | lint type-aware |
| Swagger | documentacion en `/docs` |

---

## 4. Estructura de la carpeta

```text
ms-stego-nestjs/
├── Dockerfile
├── .env.example
├── nest-cli.json
├── package.json
├── tsconfig.json
├── vitest.config.ts
├── vitest.config.e2e.ts
├── keys/                      # public.pem (no versionado)
├── src/
│   ├── main.ts                # bootstrap + Swagger
│   ├── app.module.ts          # Config, TypeORM, modulos, middleware
│   ├── configure-app.ts       # prefijo /api, CORS, pipes, filtros
│   ├── auth/
│   │   ├── auth-actions.ts            # acciones RBAC consultadas
│   │   ├── auth-client.service.ts     # cliente HTTP de AUTH
│   │   ├── auth.module.ts
│   │   ├── decorators/current-user.decorator.ts
│   │   ├── guards/jwt-auth.guard.ts
│   │   ├── interfaces/
│   │   └── strategies/jwt.strategy.ts
│   ├── common/
│   │   ├── filters/all-exceptions/all-exceptions.filter.ts
│   │   └── middleware/request-id/request-id.middleware.ts
│   ├── config/
│   │   ├── env.schema.ts       # validacion Zod del entorno
│   │   └── jwt-public-key.ts
│   ├── database/
│   │   ├── data-source.ts
│   │   ├── migrate.ts
│   │   ├── revert-migration.ts
│   │   └── migrations/
│   ├── health/                 # GET /api/health
│   └── stego/
│       ├── stego.controller.ts
│       ├── stego.service.ts    # orquestacion del analisis
│       ├── stego.module.ts
│       ├── dto/
│       ├── entities/
│       ├── enums/
│       ├── interfaces/
│       └── services/
│           ├── bmp-decoder.ts
│           ├── file-validation.service.ts
│           ├── steganography.service.ts
│           └── stego-analysis.service.ts
└── test/
    └── fixtures/synthetic-images.ts
```

---

## 5. API expuesta

Prefijo global: `/api`. Swagger en `/docs` (fuera del prefijo), habilitado solo
con `SWAGGER_ENABLED=true`.

| Metodo | Ruta | Acceso | Descripcion |
| --- | --- | --- | --- |
| `POST` | `/api/steganography/analyze` | JWT + `steganography.analyze` | Analiza una imagen (`multipart/form-data`, campo `file`) |
| `GET` | `/api/steganography/results/:id` | JWT + `read.own` o `read.any` | Devuelve un resultado |
| `GET` | `/api/health` | Publico | `SELECT 1` contra PostgreSQL |

### Acciones RBAC consultadas en AUTH

| Accion | ADMIN | ANALYST | USER |
| --- | :---: | :---: | :---: |
| `steganography.analyze` | Si | Si | No |
| `steganography.results.read.own` | Si | Si | Si |
| `steganography.results.read.any` | Si | No | No |

Un resultado propio se consulta con `read.own`; uno ajeno exige `read.any`.

---

## 6. Flujo interno de `analyze`

`StegoService.analyze()` (`src/stego/stego.service.ts`) ejecuta, en este orden:

1. `AuthClientService.assertAuthorized` con `steganography.analyze`.
2. `FileValidationService.validate`:
   - archivo presente y no vacio;
   - `MAX_FILE_SIZE_BYTES`;
   - extension `.png` / `.bmp` (sin distinguir mayusculas);
   - magic bytes (`89 50 4E 47...` para PNG, `42 4D` para BMP);
   - nombre saneado a maximo 255 caracteres.
3. Calculo de `sha256` sobre los **bytes originales** recibidos.
4. `SteganographyService.analyze` decodifica y calcula metricas.
5. Clasificacion y persistencia en `stego_analysis`.

Si la decodificacion falla despues de la validacion, se persiste un registro con
`status = error` y `action = rechazo`, y se responde `422`. El `analysisId` se
incluye en la excepcion interna, pero el filtro global no lo expone en el cuerpo.

---

## 7. Analisis LSB

Se analizan los canales RGB de forma agregada y por canal, excluyendo alfa.

| Metrica | Descripcion |
| --- | --- |
| `bitZeroCount` / `bitOneCount` | Conteo de bits menos significativos 0 y 1 |
| `lsbEntropy` | Entropia binaria de los LSB, en `[0, 1]` |
| `poVScore` | Balance de pares `(2i, 2i+1)`, en `[0, 1]` |
| `chiSquareValue` | Chi-cuadrado sobre los pares de valores |
| `chiSquareDegreesOfFreedom` | Pares no vacios menos 1 |
| `chiSquarePValue` | Aproximacion Wilson-Hilferty |
| `anomalyScore` | `0.45 * entropia + 0.45 * PoV + 0.10 * p-valor` |

Clasificacion segun `anomalyScore` y los umbrales configurados:

| `status` | Condicion | `action` |
| --- | --- | --- |
| `sospechoso` | `>= STEGO_SUSPICIOUS_THRESHOLD` | `cuarentena` |
| `sin_indicios` | `<= STEGO_CLEAR_THRESHOLD` | `aceptado` |
| `no_concluyente` | Entre ambos umbrales | `advertencia` |
| `error` | Fallo de decodificacion | `rechazo` |

`STEGO_CLEAR_THRESHOLD` debe ser estrictamente menor que
`STEGO_SUSPICIOUS_THRESHOLD`; el schema de entorno lo valida.

El resultado es **indicativo**: las heuristicas no constituyen prueba forense
concluyente, y las limitaciones se devuelven en el campo `limitations`.

---

## 8. Modelo de datos

Tabla `stego_analysis` (PostgreSQL propia de STEGO):

| Columna | Tipo | Notas |
| --- | --- | --- |
| `id` | `uuid` | PK, default `gen_random_uuid()` |
| `userId` | `uuid` | Tomado del claim `sub`, nunca del cliente |
| `filename` | `varchar(255)` | Nombre saneado |
| `sha256` | `varchar(64)` | Hash de los bytes originales |
| `technique` | `varchar(100)` | `lsb_statistical_analysis` |
| `status` | enum | `sin_indicios`, `sospechoso`, `no_concluyente`, `error` |
| `indicators` | `jsonb` | Metricas reales del analisis |
| `action` | enum | `aceptado`, `cuarentena`, `rechazo`, `advertencia` |
| `limitations` | `text` | Alcance del analisis |
| `createdAt` | `timestamptz` | Fecha de creacion |

Indices: `userId`, `sha256` y `createdAt`.

Migraciones:

- `1760000000000-CreateStegoAnalysis.ts`: crea tipos enum, tabla e indices.
- `1760000001000-StegoAnalysisIdDefault.ts`: agrega `DEFAULT gen_random_uuid()`
  al `id` (idempotente y correctiva).

`synchronize` esta deshabilitado: todo cambio de esquema pasa por migraciones.

---

## 9. Configuracion del entorno

Copiar `.env.example` y reemplazar los valores `CHANGE_ME_*`:

```bash
cp .env.example .env
```

En PowerShell:

```powershell
Copy-Item .env.example .env
```

| Variable | Obligatoria | Default | Descripcion |
| --- | :---: | --- | --- |
| `NODE_ENV` | No | `development` | `development` \| `test` \| `production` |
| `PORT` | No | `3002` | Puerto HTTP |
| `CORS_ORIGINS` | No | `http://localhost:3000` | Origenes separados por coma |
| `TRUST_PROXY` | No | vacio | Solo si hay proxy confiable |
| `DB_HOST` | Si | - | Host PostgreSQL |
| `DB_PORT` | No | `5432` | Puerto PostgreSQL |
| `DB_USERNAME` | Si | - | Usuario |
| `DB_PASSWORD` | Si | - | Minimo 12 caracteres |
| `DB_DATABASE` | Si | - | Nombre de la base |
| `DB_SSL` | No | `false` | `true` exige certificado valido |
| `SWAGGER_ENABLED` | No | `false` | `true` publica `/docs` |
| `JWT_PUBLIC_KEY_PATH` | Si | - | Ruta a `public.pem` de AUTH |
| `JWT_ISSUER` | No | `ms-auth` | Debe coincidir con AUTH |
| `JWT_AUDIENCE` | No | `secure-chat-api` | Debe coincidir con AUTH |
| `AUTH_INTERNAL_URL` | Si | - | Base URL de AUTH |
| `AUTH_TIMEOUT_MS` | No | `3000` | Timeout del cliente HTTP |
| `INTERNAL_API_KEY` | Si | - | Minimo 43 caracteres; igual que AUTH |
| `MAX_FILE_SIZE_BYTES` | No | `10485760` | Tamano maximo de archivo |
| `MAX_IMAGE_WIDTH` | No | `10000` | Ancho maximo |
| `MAX_IMAGE_HEIGHT` | No | `10000` | Alto maximo |
| `MAX_IMAGE_PIXELS` | No | `40000000` | Pixeles totales maximos |
| `STEGO_SUSPICIOUS_THRESHOLD` | No | `0.75` | Umbral de sospecha |
| `STEGO_CLEAR_THRESHOLD` | No | `0.55` | Umbral de ausencia de indicios |

Para generar una API key de servicio:

```bash
openssl rand -hex 32
```

STEGO solo necesita `public.pem`; la clave privada permanece exclusivamente en
AUTH. En Docker Compose, `ms-auth-nestjs/keys/public.pem` se monta en
`/app/keys/public.pem:ro`.

---

## 10. Ejecucion local

Requisitos: Node.js 24+, npm 11+, PostgreSQL accesible y `public.pem`.

```bash
npm ci
cp .env.example .env   # ajustar credenciales y JWT_PUBLIC_KEY_PATH
npm run migration:run
npm run start:dev
```

Servicios:

```text
API:     http://localhost:3002/api
Swagger: http://localhost:3002/docs   (si SWAGGER_ENABLED=true)
Health:  http://localhost:3002/api/health
```

Nota: `.env.example` usa `DB_PORT=5433` para no chocar con la base local de
AUTH en `5432`.

---

## 11. Ejecucion con Docker Compose

Desde la raiz del repositorio:

```bash
docker compose up -d --build
```

El Compose levanta `stego-db`, `stego-migrate` y `stego`, y espera a que
`auth` este saludable antes de iniciar STEGO. El servicio publica
`127.0.0.1:${STEGO_PORT:-3002}`.

Estado y logs:

```bash
docker compose ps
docker compose logs stego
docker compose logs stego-db
docker compose logs stego-migrate
```

`stego-migrate` puede aparecer como `Exited (0)`: significa que las migraciones
terminaron correctamente.

---

## 12. Scripts de npm

| Script | Accion |
| --- | --- |
| `npm run build` | Compila con Nest CLI a `dist/` |
| `npm run start` | Inicia la app |
| `npm run start:dev` | Inicia con watch |
| `npm run start:debug` | Inicia con debugger y watch |
| `npm run start:prod` | Ejecuta `dist/main` |
| `npm run lint` | Oxlint type-aware sobre `src/` y `test/` |
| `npm run format` | Prettier sobre `src/` y `test/` |
| `npm test` | Vitest unitario |
| `npm run test:watch` | Vitest en modo watch |
| `npm run test:cov` | Cobertura |
| `npm run test:e2e` | Vitest con `vitest.config.e2e.ts` |
| `npm run migration:run` | Build + migraciones (`dist/database/migrate.js`) |
| `npm run migration:revert` | Build + revierte la ultima migracion |
| `npm run db:setup` | Alias de `migration:run` |

> El script `test:e2e` usa el patron `**/*.e2e-spec.ts`. Si no existen archivos
> e2e en el proyecto, el comando termina sin ejecutar pruebas.

---

## 13. Pruebas automatizadas

```bash
npm ci
npm test
```

Cobertura unitaria actual:

- `auth/auth-client.service.spec.ts`
- `auth/strategies/jwt.strategy.spec.ts`
- `config/env.schema.spec.ts`
- `health/health.controller.spec.ts`
- `stego/stego.service.spec.ts`
- `stego/entities/stego-analysis.entity.spec.ts`
- `stego/services/file-validation.service.spec.ts`
- `stego/services/steganography.service.spec.ts`
- `stego/services/stego-analysis.service.spec.ts`
- `database/migrations/1760000001000-StegoAnalysisIdDefault.spec.ts`

Las pruebas unitarias no requieren PostgreSQL ni AUTH real: los servicios se
prueban con dobles. Las imagenes sinteticas de `test/fixtures/synthetic-images.ts`
se usan para validar las metricas.

Lint:

```bash
npm run lint
```

---

## 14. Seguridad

- **Fail-closed**: sin decision valida de AUTH no se procesa nada (`503`).
- **RS256**: STEGO solo verifica con la clave publica; no posee clave privada.
- **Validacion real de archivos**: extension + magic bytes, no `Content-Type`.
- **Limites anti pixel-bomb**: `MAX_FILE_SIZE_BYTES`, `MAX_IMAGE_WIDTH`,
  `MAX_IMAGE_HEIGHT`, `MAX_IMAGE_PIXELS`.
- **Carga en memoria** con Multer, sin escribir archivos en disco.
- **Nombre saneado** y limitado a 255 caracteres.
- **Identidad** tomada siempre del claim `sub`, nunca de la peticion.
- **CORS restrictivo** por lista de origenes.
- **Validacion estricta** con `whitelist`, `forbidNonWhitelisted` y
  `forbidUnknownValues`.
- **Cabeceras de seguridad** mediante `app.useSecurityHeaders()`.
- **Request ID** validado o generado, propagado en `X-Request-Id` y en errores.
- **Errores genericos** en produccion (sin detalles internos).
- **Sin secretos en el repositorio**: `.env`, `*.pem` y `keys/` no se versionan.
- **Usuario no privilegiado** (`stego`) en la imagen Docker.
- **`no-new-privileges`** en el Compose.

---

## 15. Codigos de respuesta relevantes

| Codigo | Caso |
| --- | --- |
| `201` | Analisis completado |
| `200` | Resultado consultado |
| `400` | Archivo ausente/vacio o UUID invalido |
| `401` | JWT ausente, invalido o expirado |
| `403` | Denegado por AUTH / sin permiso |
| `404` | Resultado no encontrado |
| `413` | Archivo o imagen excede limites |
| `415` | Extension o magic bytes no soportados |
| `422` | Imagen no decodificable o variante BMP no soportada |
| `503` | AUTH no disponible o respuesta invalida (fail-closed) |

Formato de error del filtro global:

```json
{
  "statusCode": 503,
  "message": "Servicio de autorizacion no disponible",
  "timestamp": "2026-11-05T00:00:00.000Z",
  "path": "/api/steganography/analyze",
  "requestId": "<uuid>"
}
```

---

## 16. Limitaciones conocidas

- El analisis estadistico es **indicativo**; no confirma ni descarta
  esteganografia con certeza.
- BMP con compresion RLE (`BI_RLE4` / `BI_RLE8`) o cabecera OS/2 de 12 bytes no
  esta soportado y se rechaza con `422`.
- Profundidades BMP soportadas: 1, 4, 8, 16, 24 y 32 bits; compresiones `BI_RGB`,
  `BI_BITFIELDS` y `BI_ALPHABITFIELDS`.
- Los umbrales por defecto son experimentales y requieren calibracion con un
  corpus representativo.
- No hay coleccion Postman propia de STEGO en el repositorio; las solicitudes
  deben crearse manualmente.

---

## 17. Documentacion relacionada

- `README.md` de la raiz: manual completo de ejecucion y pruebas de ambos
  microservicios.
- `ms-auth-nestjs/`: emisor de JWT y servicio de autorizacion.
- Swagger local: `http://localhost:3002/docs`.
