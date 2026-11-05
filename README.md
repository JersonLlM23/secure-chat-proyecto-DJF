# Secure Chat - Backend V1  

**Materia:** Desarrollo Software Seguro  

**Proyecto:** Secure Chat - Backend V1  

**Arquitectura:** Microservicios AUTH + STEGO orquestados con Docker Compose  

**Integrantes:** Chalacan Dennison, Llumiquinga M. Jerson, Sandoval Fernando  

**Repositorios del proyecto:**
- **Repositorio principal:** [secure-chat-proyecto-DJF](https://github.com/JersonLlM23/secure-chat-proyecto-DJF)  
- **Repositorio aparte donde se evaluaron pruebas:** [proyecto-integrador](https://github.com/DennisonCc/proyecto-integrador)  

**Manual de Usuario / Guia de Ejecucion y Pruebas del Backend.**  

**Credenciales:** Se encuentran en la carpeta /Informe.

**Ultima actualizacion:** 2026-11-05

---

## 1. Introduccion

`secure-chat-proyecto-DJF` es el backend de Secure Chat. Esta compuesto por
dos microservicios NestJS independientes, cada uno con su propia base de datos
PostgreSQL:

| Microservicio | Funcion | Puerto en el host |
| --- | --- | --- |
| AUTH | Autenticacion, emision y validacion de JWT RS256, gestion de usuarios, roles y asignaciones. Expone el endpoint interno de autorizacion que consume STEGO. | `3001` |
| STEGO | Analisis de esteganografia LSB sobre imagenes PNG y BMP. Consulta a AUTH antes de procesar una solicitud. | `3002` |

Caracteristicas principales:

- Autenticacion con JWT firmados con **RS256**.
- AUTH firma con `private.pem`; STEGO verifica la firma con `public.pem`.
- AUTH no incluye roles dentro del JWT: la autorizacion se recalcula en cada
  solicitud contra PostgreSQL.
- **RBAC dinamico** con roles `ADMIN`, `ANALYST` y `USER`, y permisos por
  accion (`steganography.analyze`, `steganography.results.read.own`,
  `steganography.results.read.any`).
- AUTH y STEGO usan bases PostgreSQL independientes.
- Todo se orquesta con Docker Compose.
- La autorizacion de STEGO es **fail-closed**: si AUTH no responde o responde
  de forma invalida, STEGO no procesa la solicitud.

Arquitectura textual:

```text
Cliente (Swagger / Postman)
   |
   +--> AUTH :3001
   |       |
   |       +--> PostgreSQL AUTH (auth-db)
   |
   +--> STEGO :3002
           |
           +--> PostgreSQL STEGO (stego-db)
           |
           +--> consulta interna de autorizacion a AUTH :3001
                POST /internal/authorization/check
```

STEGO verifica localmente la firma del JWT con la clave publica de AUTH y,
ademas, consulta a AUTH para obtener una decision de autorizacion vigente.

---

## 2. Requisitos previos

### 2.1 Para ejecutar el proyecto

Solo es necesario:

- Git
- Docker
- Docker Compose v2 (`docker compose`, no `docker-compose` v1)
- OpenSSL, para generar las claves RSA la primera vez

Verificacion de versiones:

```bash
git --version
docker --version
docker compose version
openssl version
```

No se necesita Node.js ni npm para ejecutar los contenedores.

En Windows, si `openssl` no esta disponible en PowerShell, puede usarse
Git Bash o WSL para ejecutar los comandos de generacion de claves.

En Linux o macOS, los comandos de generacion de claves del paso 5 funcionan
directamente en la terminal (bash o zsh).

### 2.2 Para desarrollar o modificar el proyecto

Ademas de lo anterior:

- Node.js 24+
- npm 11+
- Las mismas bases PostgreSQL o Docker para levantarlas

Los `Dockerfile` de ambos microservicios usan `node:24-alpine`.

---

## 3. Clonar el repositorio

```bash
git clone https://github.com/JersonLlM23/secure-chat-proyecto-DJF.git
cd secure-chat-proyecto-DJF
```

Estructura esperada en la raiz:

```text
secure-chat-proyecto-DJF/
├── docker-compose.yml
├── .env.example
├── .gitignore
├── README.md
├── ms-auth-nestjs/
│   ├── Dockerfile
│   ├── package.json
│   ├── src/
│   └── ...
└── ms-stego-nestjs/
    ├── Dockerfile
    ├── package.json
    ├── src/
    └── ...
```

Las carpetas `ms-auth-nestjs/keys/` y los archivos `*.pem` no estan
versionados: se generan en el paso 5.

---

## 4. Configuracion del archivo `.env`

El archivo `.env` de la raiz no esta versionado (esta en `.gitignore`). Debe
crearse a partir de `.env.example`:

En Linux o macOS (bash/zsh):

```bash
cp .env.example .env
```

En Windows (PowerShell):

```powershell
Copy-Item .env.example .env
```

Edita `.env` y reemplaza todos los valores `CHANGE_ME_*`. No uses los valores
de ejemplo en produccion.

### 4.1 Variables de Compose y de los contenedores

| Variable | Obligatoria | Valor por defecto / ejemplo | Consumida por |
| --- | :---: | --- | --- |
| `NODE_ENV` | No | `production` | AUTH y STEGO |
| `SWAGGER_ENABLED` | No | `true` en Compose | AUTH y STEGO |
| `AUTH_PORT` | No | `3001` | Puerto publicado de AUTH en `127.0.0.1` |
| `STEGO_PORT` | No | `3002` | Puerto publicado de STEGO en `127.0.0.1` |
| `CORS_ORIGINS` | No | `http://localhost:3000` | AUTH y STEGO |
| `TRUST_PROXY` | No | vacio | AUTH y STEGO |
| `AUTH_DB_USERNAME` | Si | `user_app` | `auth-db` y AUTH |
| `AUTH_DB_PASSWORD` | Si | `CHANGE_ME_AUTH_DB_PASSWORD` | `auth-db` y AUTH (minimo 12 caracteres) |
| `AUTH_DB_DATABASE` | Si | `user_db` | `auth-db` y AUTH |
| `STEGO_DB_USERNAME` | Si | `stego_user` | `stego-db` y STEGO |
| `STEGO_DB_PASSWORD` | Si | `CHANGE_ME_STEGO_DB_PASSWORD` | `stego-db` y STEGO (minimo 12 caracteres) |
| `STEGO_DB_DATABASE` | Si | `stego_db` | `stego-db` y STEGO |
| `JWT_ISSUER` | No | `ms-auth` | AUTH y STEGO |
| `JWT_AUDIENCE` | No | `secure-chat-api` | AUTH y STEGO |
| `JWT_EXPIRES_IN_SECONDS` | No | `900` | AUTH (rango 60 a 3600) |
| `INTERNAL_API_KEY` | Si | `CHANGE_ME_WITH_A_RANDOM_64_HEX_CHAR_SERVICE_KEY` | AUTH y STEGO (minimo 43 caracteres) |
| `RATE_LIMIT_TTL_MS` | No | `60000` | AUTH |
| `RATE_LIMIT_MAX` | No | `100` | AUTH |
| `RATE_LIMIT_BLOCK_MS` | No | `60000` | AUTH |
| `AUTH_TIMEOUT_MS` | No | `3000` | STEGO |
| `MAX_FILE_SIZE_BYTES` | No | `10485760` (10 MiB) | STEGO |
| `MAX_IMAGE_WIDTH` | No | `10000` | STEGO |
| `MAX_IMAGE_HEIGHT` | No | `10000` | STEGO |
| `MAX_IMAGE_PIXELS` | No | `40000000` | STEGO |
| `STEGO_SUSPICIOUS_THRESHOLD` | No | `0.75` | STEGO |
| `STEGO_CLEAR_THRESHOLD` | No | `0.55` | STEGO |

Notas:

- `AUTH_DB_*` se inyectan en los contenedores de AUTH como `DB_*`.
- `STEGO_DB_*` se inyectan en los contenedores de STEGO como `DB_*`.
- `STEGO_CLEAR_THRESHOLD` debe ser estrictamente menor que
  `STEGO_SUSPICIOUS_THRESHOLD`.
- `INTERNAL_API_KEY` debe ser identica en AUTH y STEGO. Compose usa el mismo
  valor para ambos.
- Para generar una API key de servicio segura:

```bash
openssl rand -hex 32
```

Ese comando produce 64 caracteres hexadecimales (256 bits), suficiente para
`INTERNAL_API_KEY`. Copia el valor generado en `.env`.

- Los secretos de base de datos deben tener al menos 12 caracteres.
- No se deben versionar `.env`, claves privadas, tokens ni API keys reales.

### 4.2 Variables que Compose fija directamente

Compose fija internamente estas rutas y valores en los contenedores:

| Servicio | Variable | Valor |
| --- | --- | --- |
| AUTH | `PORT` | `3001` |
| AUTH | `JWT_PRIVATE_KEY_PATH` | `/app/keys/private.pem` |
| AUTH | `JWT_PUBLIC_KEY_PATH` | `/app/keys/public.pem` |
| STEGO | `PORT` | `3002` |
| STEGO | `JWT_PUBLIC_KEY_PATH` | `/app/keys/public.pem` |
| STEGO | `AUTH_INTERNAL_URL` | `http://auth:3001` |

---

## 5. Claves RSA para JWT RS256

El proyecto requiere dos claves RSA:

```text
ms-auth-nestjs/keys/private.pem
ms-auth-nestjs/keys/public.pem
```

Generacion desde la raiz del repositorio. En Linux o macOS (bash/zsh):

```bash
mkdir -p ms-auth-nestjs/keys
openssl genpkey -algorithm RSA -pkeyopt rsa_keygen_bits:2048 -out ms-auth-nestjs/keys/private.pem
openssl rsa -pubout -in ms-auth-nestjs/keys/private.pem -out ms-auth-nestjs/keys/public.pem
```

En Windows (PowerShell), para crear la carpeta:

```powershell
New-Item -ItemType Directory -Force -Path ms-auth-nestjs\keys
```

Despues de crear la carpeta, ejecuta los mismos comandos `openssl` mostrados
arriba desde PowerShell, Git Bash o WSL para generar `private.pem` y
`public.pem`.

Consideraciones:

- `private.pem` pertenece exclusivamente a AUTH y no debe compartirse.
- AUTH usa `private.pem` para firmar y `public.pem` para verificar sus JWT;
  STEGO usa `public.pem` para verificar los JWT emitidos por AUTH.
- La clave privada no debe subirse a Git.
- En este repositorio, `.gitignore` ignora `*.pem`, `*.key` y `keys/`. Las
  claves deben generarse despues de clonar.
- Compose monta las claves de solo lectura:
  - AUTH monta `./ms-auth-nestjs/keys` en `/app/keys:ro`.
  - STEGO monta **directamente**
    `./ms-auth-nestjs/keys/public.pem` en `/app/keys/public.pem:ro`.
- **No copies manualmente `public.pem` a STEGO**: el `docker-compose.yml`
  actual ya realiza ese montaje.
- Si regeneras las claves, reinicia ambos servicios para que carguen las
  nuevas claves:

```bash
docker compose restart auth stego
```

---

## 6. Levantar el proyecto con Docker Compose

### 6.1 Crear los volumenes externos (solo la primera vez)

El `docker-compose.yml` declara dos volumenes como `external: true`. Docker
Compose no los crea automaticamente. En una instalacion desde cero deben
crearse antes de levantar los servicios:

```bash
docker volume create ms-auth-nestjs_users_postgres_data
docker volume create ms-stego-nestjs_stego_postgres_data
```

Puedes verificar que existen con:

```bash
docker volume ls
```

No borres estos volumenes: contienen los datos persistentes de AUTH y STEGO.

> Si estos volumenes ya existen por ejecuciones anteriores del proyecto, no
> los vuelvas a crear. Asegurate de que las credenciales `AUTH_DB_*` y
> `STEGO_DB_*` del `.env` coincidan con las credenciales con las que fueron
> inicializados.

### 6.2 Construir y levantar

```bash
docker compose up -d --build
```

Servicios definidos por el Compose actual:

| Servicio | Funcion | Puerto |
| --- | --- | --- |
| `auth-db` | PostgreSQL de AUTH | interno, no publicado |
| `auth-migrate` | Ejecuta una vez las migraciones de AUTH | - |
| `auth` | Microservicio AUTH | `127.0.0.1:3001` (configurable con `AUTH_PORT`) |
| `stego-db` | PostgreSQL de STEGO | interno, no publicado |
| `stego-migrate` | Ejecuta una vez las migraciones de STEGO | - |
| `stego` | Microservicio STEGO | `127.0.0.1:3002` (configurable con `STEGO_PORT`) |

Los contenedores de migracion pueden aparecer como `Exited (0)`. Eso es
esperado si las migraciones terminaron correctamente. `auth-migrate` y
`stego-migrate` tienen `restart: "no"`.

Los puertos se publican unicamente en `127.0.0.1`, por lo que solo son
accesibles desde la misma maquina.

### 6.3 Cargar los usuarios de ejemplo

El Compose actual **no ejecuta el seed automaticamente**. Solo ejecuta las
migraciones. Para que existan los usuarios de ejemplo definidos en
`ms-auth-nestjs/src/database/seed.ts`, ejecuta una vez:

```bash
docker compose exec auth node dist/database/seed.js
```

Ejecuta este comando cuando el contenedor `auth` este levantado. El seed crea:

- Roles `ADMIN`, `ANALYST` y `USER`.
- Usuarios de ejemplo con sus asignaciones de rol.
- Todos los usuarios de ejemplo comparten la contrasena definida en
  `ms-auth-nestjs/src/database/seed.ts` (no se reproduce aqui).

El seed es idempotente en el sentido de que reutiliza roles y usuarios
existentes y reactiva asignaciones desactivadas. Volver a ejecutarlo
restablece los datos de los usuarios de ejemplo definidos en el seed.

---

## 7. Verificar el estado de los contenedores

```bash
docker compose ps
```

Interpretacion:

- `Up (healthy)`: el contenedor esta corriendo y su healthcheck responde.
- `Up`: el contenedor esta corriendo, aunque el healthcheck aun no haya
  pasado o no aplique.
- `Exited (0)` en `auth-migrate` o `stego-migrate`: las migraciones
  terminaron correctamente.
- `Exited` con codigo distinto de `0`: revisar logs del servicio.
- `Restarting` o `unhealthy`: revisar logs y configuracion.

Healthchecks HTTP reales:

```text
AUTH:  http://localhost:3001/api/health
STEGO: http://localhost:3002/api/health
```

Respuestas esperadas segun el codigo:

- AUTH debe responder `200` con un JSON similar a:

```json
{
  "status": "ok",
  "service": "ms-auth-nestjs",
  "timestamp": "2026-11-05T00:00:00.000Z"
}
```

El health de AUTH es superficial: no consulta PostgreSQL. La disponibilidad de
`auth-db` se valida con el healthcheck de ese contenedor y con el arranque de
TypeORM.

- STEGO ejecuta `SELECT 1` contra su base de datos. Debe responder `200` con:

```json
{
  "status": "ok",
  "database": "connected"
}
```

Si STEGO no puede consultar su base de datos, responde `503`. El filtro
global de excepciones de STEGO devuelve un cuerpo generico con `statusCode`,
`message`, `timestamp`, `path` y `requestId`.

Tambien puedes verificar desde la linea de comandos:

```bash
curl http://localhost:3001/api/health
curl http://localhost:3002/api/health
```

---

# 8. Escenario A - Pruebas mediante Swagger

Swagger esta disponible porque el Compose actual pasa
`SWAGGER_ENABLED=true` (con valor por defecto `true`). Las rutas son:

```text
AUTH:  http://localhost:3001/docs
STEGO: http://localhost:3002/docs
```

No es `/api/docs`; el prefijo `/api` aplica a las rutas de negocio, no a la
interfaz de Swagger.

## 8.1 Login en AUTH

1. Abre `http://localhost:3001/docs`.
2. Localiza `POST /api/auth/login`.
3. Pulsa `Try it out`.
4. Introduce el JSON que espera el DTO real:

```json
{
  "identifier": "jperez",
  "password": "<contrasena definida en el seed>"
}
```

`identifier` acepta `username` o `email` (se normaliza a minusculas) y debe
tener entre 4 y 150 caracteres. `password` debe tener entre 1 y 128
caracteres.

5. Ejecuta la solicitud.
6. La respuesta `200` tiene esta forma:

```json
{
  "accessToken": "<JWT>",
  "tokenType": "Bearer",
  "expiresIn": 900,
  "user": {
    "id": "<uuid>",
    "username": "jperez",
    "email": "jperez@example.com",
    "roles": ["ADMIN"]
  }
}
```

Copia el valor de `accessToken`. No lo publiques ni lo guardes en el
repositorio.

Usuarios de ejemplo creados por el seed (no se documentan contrasenas):

| Usuario | Rol(es) | Proposito de prueba |
| --- | --- | --- |
| `jperez` | `ADMIN` | Acceso completo, administracion y lectura de resultados de cualquier usuario |
| `amendoza` | `ANALYST` | Analisis de imagenes y lectura de resultados propios |
| `mgomez` | `USER` | Demostrar denegacion de `steganography.analyze` (HTTP 403) |
| `cvega` | `USER`, `ANALYST` | Usuario con varios roles |
| `lcastro` | `USER` | Segundo usuario sin permiso de analisis, util para pruebas de ownership |

El login tiene un limite de 5 solicitudes por minuto. Si se repite demasiado
rapido puede devolver HTTP 429.

## 8.2 Autorizar Swagger STEGO

1. Abre `http://localhost:3002/docs`.
2. Pulsa el boton `Authorize`.
3. En el campo del esquema `bearer`, pega unicamente el `accessToken`
   obtenido desde AUTH. No escribas manualmente `Bearer `; Swagger agrega el
   prefijo.
4. Pulsa `Authorize`.
5. Cierra el dialogo.

No se deben incluir tokens reales en este documento.

## 8.3 Ejecutar analisis de esteganografia

Endpoint real:

```text
POST /api/steganography/analyze
```

Pasos:

1. En Swagger STEGO, localiza `POST /api/steganography/analyze`.
2. Pulsa `Try it out`.
3. En el campo `file`, selecciona una imagen `.png` o `.bmp`.
4. Ejecuta la solicitud.

El campo del formulario es `file`. La solicitud es `multipart/form-data`. El
`Content-Type` declarado por el cliente no decide el formato: STEGO valida la
extension y los magic bytes reales del archivo.

Formatos y limites:

- Extensiones aceptadas: `.png` y `.bmp` (sin distinguir mayusculas).
- PNG debe comenzar con la firma PNG.
- BMP debe comenzar con `BM`.
- Tamano maximo de archivo: `MAX_FILE_SIZE_BYTES` (por defecto 10485760
  bytes).
- Dimensiones maximas: `MAX_IMAGE_WIDTH`, `MAX_IMAGE_HEIGHT` y
  `MAX_IMAGE_PIXELS`.
- BMP soporta profundidades de 1, 4, 8, 16, 24 y 32 bits.
- BMP soporta compresiones `BI_RGB` (0), `BI_BITFIELDS` (3) y
  `BI_ALPHABITFIELDS` (6).
- BMP con compresion RLE (`BI_RLE4`/`BI_RLE8`) o cabecera OS/2
  `BITMAPCOREHEADER` de 12 bytes no esta soportado y se rechaza con `422`.
- Formatos distintos de PNG/BMP se rechazan con `415`.

Respuesta esperada: `201 Created` con un objeto `AnalysisResponseDto`:

```json
{
  "id": "<uuid del analisis>",
  "userId": "<uuid del usuario autenticado>",
  "filename": "imagen.png",
  "sha256": "<sha-256 hexadecimal de los bytes originales>",
  "technique": "lsb_statistical_analysis",
  "status": "sin_indicios",
  "indicators": {
    "bitZeroCount": 0,
    "bitOneCount": 0,
    "lsbEntropy": 0,
    "poVScore": 0,
    "chiSquareValue": 0,
    "chiSquareDegreesOfFreedom": 0,
    "chiSquarePValue": 0,
    "width": 0,
    "height": 0,
    "analyzedPixels": 0,
    "analyzedBytes": 0,
    "analyzedBits": 0,
    "anomalyScore": 0,
    "threshold": 0.75,
    "perChannel": {
      "red": {},
      "green": {},
      "blue": {}
    },
    "method": "lsb_statistical_analysis",
    "metricModel": "aggregate_rgb_with_per_channel",
    "metricVersion": "1.0.0"
  },
  "action": "aceptado",
  "limitations": "Resultado indicativo mediante análisis estadístico de los bits menos significativos (PoV, chi-cuadrado y entropía) .",
  "createdAt": "2026-11-05T00:00:00.000Z"
}
```

Los valores numericos de `indicators` dependen de la imagen; no son fijos.

Campos importantes:

- `id`: UUID del resultado. Se usa en la consulta posterior.
- `userId`: identidad tomada del claim `sub` del JWT, no del cliente HTTP.
- `filename`: nombre saneado del archivo.
- `sha256`: SHA-256 calculado sobre los bytes originales recibidos, antes de
  decodificar o transformar la imagen.
- `technique`: valor fijo `lsb_statistical_analysis`.
- `status`: clasificacion del analisis.
- `indicators`: metricas reales del analisis. Incluye dimensiones
  (`width`, `height`, `analyzedPixels`, `analyzedBytes`, `analyzedBits`),
  metricas estadisticas (`lsbEntropy`, `poVScore`, `chiSquareValue`,
  `chiSquareDegreesOfFreedom`, `chiSquarePValue`, `anomalyScore`,
  `threshold`) y metricas por canal en `perChannel.red`, `perChannel.green`
  y `perChannel.blue`.
- `action`: politica asignada automaticamente segun `status`.
- `limitations`: texto que indica el alcance indicativo del analisis.

Relacion real entre clasificacion y accion:

| `status` | Condicion sobre `anomalyScore` | `action` |
| --- | --- | --- |
| `sospechoso` | `>= STEGO_SUSPICIOUS_THRESHOLD` (0.75 por defecto) | `cuarentena` |
| `sin_indicios` | `<= STEGO_CLEAR_THRESHOLD` (0.55 por defecto) | `aceptado` |
| `no_concluyente` | Entre ambos umbrales | `advertencia` |
| `error` | Fallo de decodificacion posterior a la validacion inicial | `rechazo` |

Significado:

- `sin_indicios`: el analisis no encontro indicios estadisticos compatibles
  con esteganografia LSB.
- `sospechoso`: el puntaje supera el umbral de sospecha.
- `no_concluyente`: el puntaje queda entre los dos umbrales.
- `error`: el archivo paso la validacion inicial, pero no pudo decodificarse.
  En este caso se conserva un registro en la base de datos con estado `error`
  y accion `rechazo`. Sus `indicators` contienen `stage: "decoding"`,
  `reason` y, cuando aplica, `format`. La respuesta HTTP es `422` con el
  mensaje del error. El filtro global de excepciones no incluye el
  `analysisId` en el cuerpo de la respuesta.

Politicas posibles: `aceptado`, `advertencia`, `cuarentena`, `rechazo`.

El resultado es **indicativo**. Las limitaciones del analisis estan
declaradas en el propio campo `limitations`.

## 8.4 Consultar un resultado

Endpoint real:

```text
GET /api/steganography/results/:id
```

Usa el UUID devuelto en `id` por el analisis. El parametro debe ser un UUID
valido; si no lo es, la respuesta es `400`.

Reglas de autorizacion:

- Si el resultado pertenece al usuario autenticado, STEGO consulta a AUTH la
  accion `steganography.results.read.own`.
- Si el resultado pertenece a otro usuario, STEGO consulta
  `steganography.results.read.any`, que solo concede `ADMIN`.
- Si el resultado no existe, responde `404`.
- Si el usuario no esta autorizado, responde `403`.

Flujo completo:

```text
Login AUTH
   |
   v
accessToken
   |
   v
Authorize en Swagger STEGO
   |
   v
POST /api/steganography/analyze
   |
   v
id del analisis
   |
   v
GET /api/steganography/results/:id
```

Respuesta `200`: mismo objeto `AnalysisResponseDto` descrito en 8.3.

---

# 9. Escenario B - Pruebas mediante Postman

El proyecto incluye una coleccion Postman para AUTH:

```text
ms-auth-nestjs/postman/ms-auth.postman_collection.json
ms-auth-nestjs/postman/ms-auth.postman_environment.json
```

Tambien existe una version YAML de la coleccion en:

```text
ms-auth-nestjs/postman/ms-auth-nestjs local.environment.yaml
ms-auth-nestjs/postman/ms-auth-nestjs/
```

No existe una coleccion Postman de STEGO en el repositorio, por lo que las
solicitudes de analisis y consulta deben crearse manualmente en Postman.

## 9.1 Importar la coleccion de AUTH y configurar variables

1. En Postman, importa `ms-auth.postman_collection.json` y
   `ms-auth.postman_environment.json`.
2. Selecciona el entorno `ms-auth-nestjs local`.
3. La coleccion usa `baseUrl = http://localhost:3001/api`.
4. Configura `internalApiKey` con el valor real de `INTERNAL_API_KEY` solo en
   tu entorno local de Postman. No lo guardes en el repositorio.

Variables recomendadas para las pruebas de STEGO:

```text
base_auth_url = http://localhost:3001
base_stego_url = http://localhost:3002
access_token = <token obtenido en el login>
result_id = <id obtenido del analisis>
```

Puedes usar `accessToken` (el nombre que ya usa la coleccion de AUTH) en lugar
de `access_token`. Lo importante es no almacenar tokens reales en archivos
versionados.

Si creas las solicitudes de STEGO dentro de la misma coleccion importada de
AUTH, el script de login dejara disponible `{{accessToken}}` como variable de
coleccion. Si creas una coleccion separada para STEGO, define `access_token`
y `result_id` como variables de entorno de Postman y ajusta las solicitudes
para usar esos nombres.

## 9.2 POST Login

Solicitud:

```text
POST {{base_auth_url}}/api/auth/login
```

Headers:

```text
Content-Type: application/json
```

Body real:

```json
{
  "identifier": "jperez",
  "password": "<contrasena definida en el seed>"
}
```

La coleccion existente ya incluye un script de post-respuesta que guarda el
token en la variable de coleccion `accessToken`:

```javascript
pm.test('login ok', () => pm.response.to.have.status(200));
const body = pm.response.json();
pm.collectionVariables.set('accessToken', body.accessToken);
if (body.user) { pm.collectionVariables.set('userId', body.user.id); }
```

Ese script coincide con la respuesta real, que contiene `accessToken` y
`user.id`.

## 9.3 POST Analyze

Solicitud:

```text
POST {{base_stego_url}}/api/steganography/analyze
```

Headers:

```text
Authorization: Bearer {{accessToken}}
```

No configures manualmente `Content-Type`; Postman lo genera al usar
`form-data`.

Body:

- Tipo: `form-data`
- Campo: `file`
- Tipo de campo: `File`
- Valor: archivo `.png` o `.bmp`

Script opcional de post-respuesta para guardar el ID:

```javascript
if (pm.response.code === 201) {
  const body = pm.response.json();
  if (body.id) {
    pm.collectionVariables.set('result_id', body.id);
  }
}
```

La respuesta `201` contiene los mismos campos documentados en 8.3.

## 9.4 GET Result

Solicitud:

```text
GET {{base_stego_url}}/api/steganography/results/{{result_id}}
```

Headers:

```text
Authorization: Bearer {{accessToken}}
```

Respuesta esperada: `200` con el `AnalysisResponseDto`.

---

# 10. Pruebas de seguridad para la sustentacion

Las pruebas siguientes permiten demostrar autenticacion, RBAC dinamico,
ownership, revocacion de sesion y fail-closed. Usa Swagger, Postman o `curl`.

## T01 - Token valido

**Procedimiento:** iniciar sesion como `jperez` o `amendoza`, autorizar STEGO
con el token y ejecutar `POST /api/steganography/analyze` con un PNG valido.

**Esperado:** HTTP `201` y un `AnalysisResponseDto` con `status` y `action`
calculados por el analisis.

## T02 - Sin token

**Procedimiento:** ejecutar `POST /api/steganography/analyze` sin cabecera
`Authorization`.

**Esperado:** HTTP `401`.

## T03 - Token invalido

**Procedimiento:** ejecutar `POST /api/steganography/analyze` con:

```text
Authorization: Bearer token-invalido
```

**Esperado:** HTTP `401`.

## T04 - USER intenta analizar

**Procedimiento:** iniciar sesion como `mgomez` o `lcastro` (rol `USER`) y
ejecutar `POST /api/steganography/analyze`.

**Esperado:** HTTP `403`. El cuerpo contiene el mensaje
`insufficient_permissions`, porque el rol `USER` no tiene el permiso:

```text
steganography.analyze
```

Esta comprobacion ocurre antes de validar o decodificar el archivo.

## T05 - Propiedad del resultado (ownership)

**Procedimiento:**

1. Inicia sesion como `amendoza` (`ANALYST`) y analiza una imagen. Guarda el
   `id` del resultado.
2. Inicia sesion como `lcastro` (usuario `USER`).
3. Con el token de `lcastro`, ejecuta:

```text
GET /api/steganography/results/<id del resultado de amendoza>
```

**Esperado:** HTTP `403` con el mensaje
`No autorizado para leer este resultado`.

Esto demuestra el control RBAC + ownership: el resultado existe, pero el
usuario no tiene `steganography.results.read.any`. Un `ADMIN` si puede leer
resultados de cualquier usuario.

## T06 - Revocacion mediante logout

**Procedimiento:**

1. Inicia sesion y guarda el `accessToken`.
2. Ejecuta `POST /api/auth/logout` con el token.
3. Reutiliza el mismo token.

Resultados reales:

- `POST /api/auth/logout` responde `204 No Content`.
- Al reutilizar el token en una ruta de AUTH, como
  `GET /api/auth/profile`, AUTH responde `401` con el mensaje
  `La sesión ha expirado`.
- Al reutilizar el token contra STEGO, la firma sigue siendo
  criptograficamente valida y STEGO la acepta localmente, pero la consulta de
  autorizacion a AUTH devuelve `allowed: false` con motivo `token_revoked`.
  STEGO responde `403` con el mensaje `token_revoked`.

El JWT puede seguir sin expirar criptograficamente, pero AUTH verifica el
claim `tokenVersion` contra la base de datos y lo rechaza.

## T07 - Revocacion de rol

**Procedimiento sin SQL, usando endpoints administrativos reales:**

1. Inicia sesion como `jperez` (`ADMIN`) y guarda su token.
2. Inicia sesion como `amendoza` (`ANALYST`) y guarda su token y su `user.id`.
3. Verifica que `amendoza` puede analizar una imagen (`201`).
4. Con el token de `jperez`, consulta las asignaciones del usuario:

```text
GET /api/user-roles/user/<userId de amendoza>
```

5. Localiza la asignacion del rol `ANALYST` y guarda su `id` (`assignmentId`).
6. Con el token de `jperez`, desactiva la asignacion:

```text
PATCH /api/user-roles/<assignmentId>
```

Body:

```json
{
  "estado": false
}
```

7. Repite el analisis con el mismo token de `amendoza` que seguia vigente.

**Esperado:** HTTP `403` con `insufficient_permissions`. AUTH consulta la
autorizacion vigente en PostgreSQL en cada solicitud y no confia unicamente
en roles almacenados en el token.

8. Para restaurar el estado, vuelve a activar la asignacion:

```json
{
  "estado": true
}
```

## T08 - AUTH no disponible / fail-closed

**Procedimiento seguro con el Compose actual:**

1. Verifica que AUTH y STEGO estan saludables:

```bash
docker compose ps
```

2. Deten solo el contenedor de AUTH, sin borrar volumenes:

```bash
docker compose stop auth
```

3. Con un token vigente, ejecuta `POST /api/steganography/analyze` contra
   STEGO.

**Esperado:** HTTP `503` con el mensaje
`Servicio de autorizacion no disponible`. STEGO no procesa la solicitud si no
obtiene una decision valida de autorizacion.

4. Vuelve a levantar AUTH:

```bash
docker compose start auth
```

5. Espera a que AUTH este nuevamente saludable:

```bash
docker compose ps auth
```

No se deben eliminar contenedores de base de datos ni volumenes para esta
prueba. La prueba solo detiene y vuelve a iniciar AUTH.

---

# 11. Pruebas de archivos e imagenes

Codigos HTTP reales de `POST /api/steganography/analyze`:

| Caso | Resultado esperado |
| --- | --- |
| PNG valido | `201` con `AnalysisResponseDto` |
| BMP valido de 24 bits | `201` con `AnalysisResponseDto` |
| BMP valido de 32 bits | `201` con `AnalysisResponseDto` |
| Imagen con esteganografia | `201`; `status` y `action` dependen del `anomalyScore` calculado, no hay un resultado garantizado |
| Sin archivo o archivo vacio | `400` con mensaje `Archivo requerido` |
| Archivo que excede `MAX_FILE_SIZE_BYTES` | `413` |
| Imagen que excede dimensiones o pixeles permitidos | `413` |
| Extension distinta de `.png` o `.bmp` | `415` con mensaje sobre formatos soportados |
| Extension correcta pero magic bytes no coinciden | `415` con mensaje de contenido no coincidente |
| PNG con firma valida pero contenido no decodificable | `422`; se persiste un registro con `status: "error"`; el cuerpo no incluye `analysisId` |
| BMP con variante no soportada (cabecera OS/2 de 12 bytes, compresion RLE, profundidad no soportada) | `422`; se persiste un registro con `status: "error"`; el cuerpo no incluye `analysisId` |
| Sin JWT o JWT invalido | `401` |
| Usuario sin `steganography.analyze` | `403` |
| AUTH no disponible o respuesta invalida | `503` |

Diferencias entre estados:

- `sin_indicios`: el analisis no encontro indicios compatibles con
  esteganografia LSB.
- `sospechoso`: el `anomalyScore` supera el umbral de sospecha.
- `no_concluyente`: el `anomalyScore` queda entre los umbrales.
- `error`: el archivo paso la validacion inicial, pero no pudo decodificarse.

Politicas asociadas:

- `aceptado`
- `advertencia`
- `cuarentena`
- `rechazo`

El orden de controles es importante:

1. Se valida el JWT.
2. Se consulta la autorizacion a AUTH (fail-closed).
3. Se valida el archivo: presencia, tamano, extension y magic bytes.
4. Se decodifica la imagen y se aplican limites de dimensiones y pixeles.
5. Se calculan las metricas y se persiste el resultado.

Por eso, un usuario sin permiso recibe `403` antes de que se valide el
archivo.

---

# 12. Verificacion de bases de datos

AUTH y STEGO usan bases PostgreSQL independientes:

| Base | Contenedor | Volumen externo |
| --- | --- | --- |
| AUTH | `auth-db` | `ms-auth-nestjs_users_postgres_data` |
| STEGO | `stego-db` | `ms-stego-nestjs_stego_postgres_data` |

Los volumenes contienen los datos persistentes. No los elimines como parte
del flujo normal.

Consultas seguras de verificacion (no requieren escribir la contrasena en el
comando):

```bash
docker compose exec auth-db sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "\dt"'
docker compose exec stego-db sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "\dt"'
```

Verificar los usuarios de ejemplo cargados por el seed:

```bash
docker compose exec auth-db sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "SELECT username, status FROM users ORDER BY username;"'
```

Verificar los resultados de STEGO:

```bash
docker compose exec stego-db sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "SELECT id, \"userId\", status, action, \"createdAt\" FROM stego_analysis ORDER BY \"createdAt\" DESC LIMIT 10;"'
```

En estos comandos no se escriben contrasenas: se usan las variables de entorno
del propio contenedor PostgreSQL.

No se debe usar `docker compose down -v` ni eliminar volumenes para
"reiniciar" el proyecto.

---

# 13. Detener y volver a levantar el proyecto

Detener los servicios sin eliminar datos:

```bash
docker compose stop
```

Volver a iniciarlos:

```bash
docker compose start
```

Los contenedores de migracion (`auth-migrate` y `stego-migrate`) pueden
volver a ejecutarse y terminar de nuevo con `Exited (0)`. Las migraciones ya
aplicadas no se repiten porque TypeORM las registra en su tabla de
migraciones.

Si se modifico codigo, Dockerfile o configuracion y se necesita reconstruir:

```bash
docker compose up -d --build
```

Diferencia:

- `docker compose stop` detiene contenedores y conserva contenedores, redes y
  volumenes.
- `docker compose start` inicia los contenedores detenidos previamente.
- `docker compose up -d --build` reconstruye imagenes si es necesario,
  recrea contenedores y respeta las dependencias del Compose.
- `docker compose down` elimina contenedores y la red, pero no elimina los
  volumenes externos de datos.

No se recomienda `docker compose down -v`.

---

# 14. Solucion de problemas

| Problema | Posible causa | Solucion |
| --- | --- | --- |
| Puerto 3001 ocupado | Otro proceso usa el puerto | Verificar el proceso o cambiar `AUTH_PORT` en `.env` |
| Puerto 3002 ocupado | Otro proceso usa el puerto | Verificar el proceso o cambiar `STEGO_PORT` en `.env` |
| `external volume ... not found` | No se crearon los volumenes externos | Ejecutar los `docker volume create` del paso 6.1 |
| AUTH unhealthy | Base de datos, credenciales o claves RSA | Revisar `docker compose logs auth` y `docker compose logs auth-db` |
| STEGO unhealthy | AUTH, base de datos STEGO o configuracion | Revisar `docker compose logs stego`, `docker compose logs stego-db` y `docker compose logs auth` |
| Swagger devuelve 404 | `SWAGGER_ENABLED` no es `true` | Revisar `.env` y `docker-compose.yml`; con el Compose actual el valor por defecto es `true` |
| JWT invalido | Claves RSA distintas, issuer/audience incorrectos o token expirado | Regenerar/verificar claves, revisar `JWT_ISSUER` y `JWT_AUDIENCE`, reiniciar `auth` y `stego` |
| STEGO no autoriza | AUTH caido, `INTERNAL_API_KEY` distinta o timeout | Verificar comunicacion interna y que la API key coincida en ambos servicios |
| Migracion fallida | Estado de la base o credenciales incorrectas | Revisar logs; no borrar el volumen |
| Login devuelve 429 | Se supero el limite de 5 intentos por minuto | Esperar antes de reintentar |
| Login devuelve 401 | Usuario inexistente, inactivo o contrasena incorrecta | Verificar que el seed se ejecuto y que la contrasena es la definida en el seed |
| Analisis devuelve 413 | Archivo o imagen excede los limites | Ajustar los limites en `.env` o usar una imagen menor |
| Analisis devuelve 415 | Extension o magic bytes no soportados | Usar un PNG o BMP real |
| Analisis devuelve 422 | Imagen no decodificable o variante BMP no soportada | Probar con otro PNG/BMP; revisar el registro con `status: "error"` en la base de STEGO |
| Seed falla por credenciales de BD | El volumen existente fue inicializado con otras credenciales | Ajustar `AUTH_DB_*` en `.env` a las credenciales del volumen existente; no borrar el volumen |

Comandos utiles:

```bash
docker compose logs auth
docker compose logs stego
docker compose logs auth-db
docker compose logs stego-db
docker compose logs auth-migrate
docker compose logs stego-migrate
docker compose ps
```

Para identificar un proceso que ocupa un puerto.

En Linux:

```bash
ss -ltnp | grep ':3001'
ss -ltnp | grep ':3002'
```

En macOS:

```bash
lsof -nP -iTCP:3001 -sTCP:LISTEN
lsof -nP -iTCP:3002 -sTCP:LISTEN
```

En Windows (PowerShell):

```powershell
netstat -ano | findstr :3001
netstat -ano | findstr :3002
```

---

# 15. Limpieza / reinstalacion

Operaciones seguras y su alcance:

| Operacion | Comando | Efecto |
| --- | --- | --- |
| Detener servicios | `docker compose stop` | Conserva contenedores, red y volumenes |
| Volver a iniciar | `docker compose start` | Inicia los contenedores detenidos |
| Reconstruir imagenes | `docker compose up -d --build` | Reconstruye y recrea lo necesario; conserva datos |
| Eliminar contenedores y red | `docker compose down` | Conserva los volumenes externos de datos |
| Eliminar datos persistentes | Requiere eliminar explicitamente los volumenes externos | No forma parte del flujo normal y no se recomienda |

Los volumenes `ms-auth-nestjs_users_postgres_data` y
`ms-stego-nestjs_stego_postgres_data` son externos y contienen los datos. No
se eliminan con `docker compose down`.

No existe en el repositorio un procedimiento automatico y seguro de
reinicializacion total de datos. Si realmente se necesitara descartar los
datos, seria una operacion destructiva fuera del alcance de este manual.

---

# 16. Checklist final

```text
[ ] Repositorio clonado
[ ] .env configurado
[ ] Valores CHANGE_ME_* reemplazados
[ ] Volumenes externos creados
[ ] Claves RSA generadas
[ ] Docker funcionando
[ ] auth-db healthy
[ ] stego-db healthy
[ ] Migraciones AUTH completadas (Exited 0)
[ ] Migraciones STEGO completadas (Exited 0)
[ ] AUTH healthy
[ ] STEGO healthy
[ ] Seed de usuarios ejecutado
[ ] Swagger AUTH disponible
[ ] Swagger STEGO disponible
[ ] Login funciona
[ ] JWT funciona
[ ] Analisis PNG funciona
[ ] Analisis BMP funciona
[ ] Consulta de resultado funciona
[ ] RBAC USER -> 403 funciona
[ ] Ownership -> 403 funciona
[ ] Logout/revocacion funciona
[ ] Postman funciona
```

---

## 17. Resumen de endpoints reales

### AUTH

| Metodo | Ruta | Acceso |
| --- | --- | --- |
| POST | `/api/auth/login` | Publico; limite 5/min |
| GET | `/api/auth/profile` | Cualquier usuario autenticado |
| GET | `/api/auth/me` | Alias de `/api/auth/profile` |
| POST | `/api/auth/logout` | Cualquier usuario autenticado; responde 204 |
| POST | `/api/users` | `ADMIN` |
| GET | `/api/users` | `ADMIN` |
| GET | `/api/users/:id` | `ADMIN` |
| GET | `/api/users/cedula/:cedula` | `ADMIN` |
| PATCH | `/api/users/:id` | `ADMIN` |
| DELETE | `/api/users/:id` | `ADMIN` |
| POST | `/api/roles` | `ADMIN` |
| GET | `/api/roles` | `ADMIN` |
| GET | `/api/roles/:id` | `ADMIN` |
| PATCH | `/api/roles/:id` | `ADMIN` |
| DELETE | `/api/roles/:id` | `ADMIN` |
| POST | `/api/user-roles` | `ADMIN` |
| GET | `/api/user-roles/user/:userId` | `ADMIN` |
| GET | `/api/user-roles/:id` | `ADMIN` |
| PATCH | `/api/user-roles/:id` | `ADMIN`; body `{ "estado": false }` |
| DELETE | `/api/user-roles/:id` | `ADMIN` |
| DELETE | `/api/user-roles/:userId/:roleId` | `ADMIN` |
| POST | `/internal/authorization/check` | `X-Service-Key` + `subject_token` |
| GET | `/api/health` | Publico |

### STEGO

| Metodo | Ruta | Acceso |
| --- | --- | --- |
| POST | `/api/steganography/analyze` | JWT; requiere `steganography.analyze` |
| GET | `/api/steganography/results/:id` | JWT; requiere `read.own` o `read.any` |
| GET | `/api/health` | Publico |

### Swagger

| Servicio | URL |
| --- | --- |
| AUTH | `http://localhost:3001/docs` |
| STEGO | `http://localhost:3002/docs` |

---

## 18. Matriz RBAC real para STEGO

La matriz se define en
`ms-auth-nestjs/src/internal/internal-authorization.service.ts`:

| Accion | ADMIN | ANALYST | USER |
| --- | :---: | :---: | :---: |
| `steganography.analyze` | Si | Si | No |
| `steganography.results.read.own` | Si | Si | Si |
| `steganography.results.read.any` | Si | No | No |

La Gestion de usuarios, roles y asignaciones en AUTH requiere `ADMIN`.
`/api/auth/profile`, `/api/auth/me` y `/api/auth/logout` requieren solamente
un usuario autenticado.

---

## 19. Pruebas automatizadas existentes

Para desarrollo local, cada microservicio incluye pruebas con Vitest.

AUTH:

```bash
cd ms-auth-nestjs
npm ci
npm test
```

Las pruebas unitarias no requieren PostgreSQL. Las pruebas e2e usan
PostgreSQL real, migraciones aplicadas, roles y usuarios del seed, y claves
RSA. Configura `ms-auth-nestjs/.env` con una base accesible y ejecuta:

```bash
npm run db:setup
npm run test:e2e
```

`npm run db:setup` ejecuta las migraciones y luego el seed. Las pruebas e2e
necesitan que existan los roles `ADMIN`, `ANALYST` y `USER`; por eso no basta
con ejecutar solo las migraciones.

STEGO:

```bash
cd ms-stego-nestjs
npm ci
npm test
```

Estas pruebas son opcionales para ejecutar el proyecto con Docker; estan
orientadas al desarrollo y a la verificacion del codigo.

---

## 20. Notas de seguridad

- No versionar `.env`, claves `*.pem`, tokens JWT ni API keys.
- No reutilizar los valores `CHANGE_ME_*` en produccion.
- La clave privada RSA solo debe existir en AUTH.
- STEGO solo recibe la clave publica mediante el montaje de Compose.
- La autorizacion se recalcula en cada solicitud contra PostgreSQL.
- El JWT no contiene roles; solo identifica al usuario y su `tokenVersion`.
- `logout` incrementa `tokenVersion` y revoca los tokens anteriores.
- Si AUTH no puede emitir una decision valida, STEGO deniega con `503`
  (fail-closed).
- Los secretos y credenciales reales no se incluyen en este documento.
