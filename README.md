# Secure Chat - Backend V1

**Materia:** Desarrollo Software Seguro 
**Proyecto:** Secure Chat - Backend V1  
**Arquitectura:** Microservicios AUTH + STEGO orquestados con Docker Compose
**Integrantes:** Chalacan Dennison, Llumiquinga M. Jerson, Sandoval Fernando

---

## 1. Descripción general del proyecto

Secure Chat Backend V1 es un backend compuesto por dos microservicios desacoplados:

- **AUTH (`ms-auth-nestjs`):** autenticación, usuarios, roles, asignaciones
  usuario-rol, emisión y validación de JWT firmados con **RS256** y
  autorización **RBAC dinámica** consultando PostgreSQL en cada solicitud.
- **STEGO (`ms-stego-nestjs`):** recepción y validación de imágenes, cálculo de
  SHA-256, análisis estadístico **LSB** para detectar posibles indicios de
  esteganografía y persistencia de resultados.

STEGO no concede permisos por sí mismo: antes de procesar una imagen consulta a
AUTH mediante su endpoint interno y aplica un enfoque **Fail-Closed**. AUTH
conserva la clave privada RSA; STEGO solo recibe la clave pública. Las bases de
datos no publican puertos al host y las APIs se exponen únicamente en loopback.

El proyecto aplica principios de **Zero Trust**, **Secure by Design**, separación
de responsabilidades, mínimo privilegio, validación estricta de entrada y
contenedores ejecutados con usuario no privilegiado.

### Flujo resumido

```text
Cliente / Swagger
      |
      |-- POST /api/auth/login ------------> AUTH (3001) ---> PostgreSQL AUTH
      |                                           |
      |                                           | JWT RS256
      |
      |-- POST /api/steganography/analyze -> STEGO (3002)
                                                  |
                                                  |-- valida JWT con clave pública
                                                  |-- consulta autorización a AUTH
                                                  |-- analiza imagen LSB
                                                  +--> PostgreSQL STEGO
```

---

## 2. Prerrequisitos del sistema

Instalar antes de comenzar:

| Herramienta | Versión / requisito |
| --- | --- |
| Git | Cualquier versión reciente |
| Docker Desktop | Docker Engine con Docker Compose v2 o superior |
| OpenSSL | Para generar las claves RSA |
| Node.js | **Opcional**, solo para ejecución local sin Docker. Recomendado Node.js 24 y npm 11 |
| Navegador | Para acceder a Swagger UI |

Comprobar las herramientas principales:

```bash
git --version
docker --version
docker compose version
openssl version
```

> En Windows se recomienda usar **PowerShell**. Los comandos OpenSSL son los
> mismos; solo cambia la creación de carpetas.

---

## 3. Paso a paso para recrear y poner en marcha el proyecto

### Paso 1: Clonar el repositorio

```bash
git clone https://github.com/JersonLlM23/secure-chat-proyecto-DJF.git
cd secure-chat-proyecto-dJF
```

### Paso 2: Generar las claves RSA (RS256) obligatorias

AUTH necesita una clave privada y una pública dentro de
`ms-auth-nestjs/keys/`.

En **Windows PowerShell**:

```powershell
New-Item -ItemType Directory -Force -Path .\ms-auth-nestjs\keys | Out-Null
openssl genpkey -algorithm RSA -out .\ms-auth-nestjs\keys\private.pem -pkeyopt rsa_keygen_bits:2048
openssl rsa -in .\ms-auth-nestjs\keys\private.pem -pubout -out .\ms-auth-nestjs\keys\public.pem
```

En **Linux/macOS**:

```bash
mkdir -p ms-auth-nestjs/keys
openssl genpkey -algorithm RSA -out ms-auth-nestjs/keys/private.pem -pkeyopt rsa_keygen_bits:2048
openssl rsa -in ms-auth-nestjs/keys/private.pem -pubout -out ms-auth-nestjs/keys/public.pem
```

Resultado esperado:

```text
ms-auth-nestjs/keys/private.pem   # solo AUTH; nunca se versiona
ms-auth-nestjs/keys/public.pem    # la usa AUTH y se monta en STEGO
```

Consideraciones de seguridad:

- `private.pem` **no debe subirse a Git**, compartirse por chat ni incluirse en
  una imagen Docker.
- El `.gitignore` excluye `*.pem`, `*.key` y la carpeta `keys/`.
- Docker monta `ms-auth-nestjs/keys` en AUTH como solo lectura y únicamente
  `public.pem` en STEGO.
- Si se regeneran las claves, los tokens emitidos anteriormente dejan de ser
  válidos.

### Paso 3: Configurar el archivo de entorno `.env`

Copiar la plantilla:

```powershell
Copy-Item .env.example .env
notepad .env
```

En Linux/macOS:

```bash
cp .env.example .env
```

Completar obligatoriamente:

| Variable | Descripción |
| --- | --- |
| `AUTH_DB_USERNAME` | Usuario de PostgreSQL de AUTH |
| `AUTH_DB_PASSWORD` | Contraseña de AUTH. Mínimo 12 caracteres |
| `AUTH_DB_DATABASE` | Base de datos de AUTH |
| `STEGO_DB_USERNAME` | Usuario de PostgreSQL de STEGO |
| `STEGO_DB_PASSWORD` | Contraseña de STEGO. Mínimo 12 caracteres |
| `STEGO_DB_DATABASE` | Base de datos de STEGO |
| `INTERNAL_API_KEY` | Clave de servicio compartida entre AUTH y STEGO. Mínimo 43 caracteres |

Generar una `INTERNAL_API_KEY` segura:

```bash
openssl rand -hex 32
```

Copiar el resultado en `.env`. La misma variable se inyecta en AUTH y STEGO, por
lo que ambos servicios usarán automáticamente la misma clave.

Ejemplo de valores (usar contraseñas distintas y seguras en producción):

```dotenv
AUTH_DB_USERNAME=user_app
AUTH_DB_PASSWORD=UnaClaveLargaYUnicaParaAUTH_2026
AUTH_DB_DATABASE=user_db

STEGO_DB_USERNAME=stego_user
STEGO_DB_PASSWORD=UnaClaveLargaYUnicaParaSTEGO_2026
STEGO_DB_DATABASE=stego_db

INTERNAL_API_KEY=<resultado_de_openssl_rand_hex_32>
```

Para habilitar Swagger:

```dotenv
SWAGGER_ENABLED=true
```

> `NODE_ENV=production` no deshabilita Swagger por sí solo: la documentación se
> controla con `SWAGGER_ENABLED`. En un entorno productivo real puede cambiarse
> a `false` cuando no se necesite exponer Swagger.
>
> Si una contraseña contiene `#`, `$`, espacios o comillas, conservar el
> entrecomillado del `.env` original, preferiblemente con comillas simples.
>
> `.env` está ignorado por Git. Nunca commitear secretos.

### Paso 4: Crear los volúmenes externos y levantar Docker Compose

El `docker-compose.yml` reutiliza volúmenes externos para no perder datos entre
despliegues:

```text
ms-auth-nestjs_users_postgres_data
ms-stego-nestjs_stego_postgres_data
```

En una máquina nueva hay que crearlos una vez:

```powershell
docker volume create ms-auth-nestjs_users_postgres_data
docker volume create ms-stego-nestjs_stego_postgres_data
```

Si los volúmenes ya existen, `docker volume create` no borra ni reemplaza los
datos. **No eliminar volúmenes** para "empezar limpio" si contienen información
que se quiera conservar.

Validar la configuración y levantar el entorno:

```powershell
docker compose config --quiet
docker compose up -d --build
```

El orden de arranque es automático:

1. `auth-db` y `stego-db` quedan saludables.
2. `auth-migrate` aplica las migraciones de AUTH y termina.
3. `auth` inicia cuando las migraciones terminaron correctamente.
4. `stego-migrate` aplica las migraciones de STEGO y termina.
5. `stego` inicia cuando su base y AUTH están saludables.

Las migraciones se ejecutan una sola vez en los servicios `auth-migrate` y
`stego-migrate`, no en cada reinicio de las APIs.

### Paso 5: Cargar los usuarios de ejemplo (primera instalación)

El Compose ejecuta migraciones, pero no ejecuta el seed de usuarios. Para poder
probar Swagger con `jperez` en una instalación nueva:

```powershell
docker compose exec auth node dist/database/seed.js
```

El seed crea los roles `ADMIN`, `ANALYST` y `USER`, y los usuarios de ejemplo.
Es idempotente: puede ejecutarse nuevamente sin duplicar los registros
existentes.

Usuarios de ejemplo, todos con contraseña `ClaveSegura2026!`:

| Usuario | Rol principal |
| --- | --- |
| `jperez` | ADMIN |
| `amendoza` | ANALYST |
| `mgomez` | USER |
| `cvega` | USER + ANALYST |
| `lcastro` | USER |

Si la base ya fue sembrada anteriormente, este paso no es necesario.

---

## 4. Verificación de salud de los servicios

### Estado de contenedores

```powershell
docker compose ps -a
```

Esperado:

- `secure-chat-auth-db`: `healthy`
- `secure-chat-stego-db`: `healthy`
- `secure-chat-auth`: `healthy`
- `secure-chat-stego`: `healthy`
- `secure-chat-auth-migrate`: `Exited (0)`
- `secure-chat-stego-migrate`: `Exited (0)`

Si un servicio de migración aparece con código distinto de `0`:

```powershell
docker compose logs auth-migrate
docker compose logs stego-migrate
```

### Endpoints de salud

```powershell
Invoke-RestMethod http://localhost:3001/api/health
Invoke-RestMethod http://localhost:3002/api/health
```

También se pueden abrir en el navegador:

- AUTH: <http://localhost:3001/api/health>
- STEGO: <http://localhost:3002/api/health>

### Documentación Swagger / OpenAPI

Con `SWAGGER_ENABLED=true`:

- AUTH: <http://localhost:3001/docs>
- STEGO: <http://localhost:3002/docs>

Si `/docs` devuelve 404, revisar que `.env` tenga `SWAGGER_ENABLED=true` y
recrear los servicios:

```powershell
docker compose up -d --force-recreate auth stego
```

Las APIs están publicadas únicamente en `127.0.0.1`; las bases de datos no
publican puertos al host.

---

## 5. Guía rápida para pruebas en Swagger (JWT + LSB)

### 5.1 Obtener un token en AUTH

1. Abrir <http://localhost:3001/docs>.
2. Desplegar `POST /api/auth/login`.
3. Presionar **Try it out** y enviar:

```json
{
  "identifier": "jperez",
  "password": "ClaveSegura2026!"
}
```

4. En la respuesta, copiar el valor de `accessToken`:

```json
{
  "accessToken": "<JWT>",
  "tokenType": "Bearer",
  "user": {
    "username": "jperez",
    "roles": ["ADMIN"]
  }
}
```

El usuario `jperez` debe existir; si se creó el entorno desde cero, ejecutar el
seed del Paso 5.

### 5.2 Autorizar Swagger

1. En Swagger de AUTH, presionar el botón verde **Authorize**.
2. Pegar el `accessToken` en el campo `Value`.
3. Confirmar con **Authorize** y cerrar el diálogo.

Swagger agrega automáticamente el prefijo `Bearer`, por lo que se debe pegar
solo el token, sin escribir `Bearer ` manualmente.

### 5.3 Probar el análisis LSB en STEGO

1. Abrir <http://localhost:3002/docs>.
2. Presionar **Authorize** y pegar el mismo `accessToken`.
3. Desplegar `POST /api/steganography/analyze`.
4. Presionar **Try it out**.
5. En el campo `file`, seleccionar una imagen **PNG** o **BMP**.
6. Presionar **Execute**.

Comportamiento esperado:

- Código `201 Created`.
- Respuesta con un `id` UUID generado por PostgreSQL.
- Campos como `filename`, `sha256`, `technique`, `status`, `indicators`,
  `action` y `limitations`.
- El estado y la acción dependen del puntaje estadístico LSB y de los umbrales
  configurados.

STEGO valida el JWT con la clave pública de AUTH y consulta la autorización
interna para la acción `steganography.analyze`. Los roles `ADMIN` y `ANALYST`
tienen permitido el análisis.

Errores frecuentes:

| Código | Causa probable |
| --- | --- |
| `401` | Token ausente, expirado o clave pública incorrecta |
| `403` | Usuario sin permiso o autorización denegada por AUTH |
| `413` | Archivo o imagen demasiado grande |
| `415` | Formato no soportado |
| `422` | Imagen no decodificable |
| `503` | AUTH no disponible; STEGO aplica Fail-Closed |

También se puede consultar un resultado:

```text
GET /api/steganography/results/{id}
```

El propietario del resultado requiere `steganography.results.read.own`; un
ADMIN puede consultar resultados de otros usuarios con
`steganography.results.read.any`.

---

## 6. Estructura del repositorio

```text
secure-chat-proyecto-DJF/
├── docker-compose.yml              # Stack integrado AUTH + STEGO
├── .env.example                    # Plantilla de variables de entorno
├── .env                            # Local, ignorado por Git
├── .gitignore
├── README.md
│
├── ms-auth-nestjs/
│   ├── Dockerfile
│   ├── .dockerignore
│   ├── package.json
│   ├── src/
│   │   ├── auth/                   # Login, JWT RS256, guards
│   │   ├── users/                  # CRUD de usuarios
│   │   ├── roles/                  # CRUD de roles
│   │   ├── user-roles/             # Asignación/revocación de roles
│   │   ├── internal/               # Autorización interna para STEGO
│   │   ├── database/
│   │   │   ├── migrations/
│   │   │   ├── data-source.ts
│   │   │   ├── migrate.ts
│   │   │   └── seed.ts
│   │   └── config/                 # Validación Zod y claves JWT
│   ├── keys/                       # Local, ignorado por Git
│   │   ├── private.pem
│   │   └── public.pem
│   └── test/
│
└── ms-stego-nestjs/
    ├── Dockerfile
    ├── .dockerignore
    ├── package.json
    ├── src/
    │   ├── auth/                   # Validación JWT y cliente de AUTH
    │   ├── stego/
    │   │   ├── entities/           # StegoAnalysis
    │   │   ├── services/           # Análisis LSB, validación, persistencia
    │   │   ├── dto/
    │   │   └── enums/
    │   ├── database/
    │   │   └── migrations/
    │   ├── health/
    │   └── config/
    └── test/
```

No se versionan:

- `.env`
- `ms-auth-nestjs/keys/*.pem`
- `node_modules/`
- `dist/`
- `coverage/`
- logs y archivos temporales

---

## 7. Servicios, puertos y persistencia

### Servicios del Compose

| Servicio | Función | Puerto en host |
| --- | --- | --- |
| `auth-db` | PostgreSQL de AUTH | No publicado |
| `auth-migrate` | Migraciones de AUTH, ejecución única | No publicado |
| `auth` | API AUTH | `127.0.0.1:3001` |
| `stego-db` | PostgreSQL de STEGO | No publicado |
| `stego-migrate` | Migraciones de STEGO, ejecución única | No publicado |
| `stego` | API STEGO | `127.0.0.1:3002` |

### Volúmenes persistentes

| Servicio | Volumen |
| --- | --- |
| AUTH | `ms-auth-nestjs_users_postgres_data` |
| STEGO | `ms-stego-nestjs_stego_postgres_data` |

El compose usa volúmenes externos para conservar los datos. Por eso:

- No ejecutar `docker compose down -v`.
- No ejecutar `docker volume rm`.
- No usar `docker system prune --volumes` sobre este entorno.
- `docker compose down` detiene y elimina contenedores, pero no debe eliminar
  los volúmenes externos.

### Migraciones

Aplicar migraciones pendientes sin reiniciar toda la plataforma:

```powershell
docker compose run --rm auth-migrate
docker compose run --rm stego-migrate
```

Los servicios de migración usan `restart: "no"`; las APIs esperan a que
terminen correctamente.

---

## 8. Comandos útiles

```powershell
# Ver estado
docker compose ps -a

# Ver logs de las APIs
docker compose logs -f auth stego

# Reiniciar solo AUTH
docker compose restart auth

# Reiniciar solo STEGO
docker compose restart stego

# Reconstruir tras cambiar código o Dockerfile
docker compose up -d --build

# Aplicar migraciones pendientes
docker compose run --rm auth-migrate
docker compose run --rm stego-migrate

# Cargar datos de ejemplo
docker compose exec auth node dist/database/seed.js

# Detener el stack sin tocar los volúmenes externos
docker compose down
```

---

## 9. Pruebas y desarrollo local

Node.js solo es necesario para ejecutar los microservicios o sus pruebas sin
Docker.

### AUTH

```powershell
cd ms-auth-nestjs
npm ci
npm test
npm run test:e2e
npm run lint
npm run build
```

### STEGO

```powershell
cd ms-stego-nestjs
npm ci
npm test
npm run lint
npm run build
```

STEGO no tiene actualmente una suite e2e; sus pruebas son unitarias.

### Ejecución local sin Docker

Cada microservicio puede ejecutarse con su propio PostgreSQL:

```powershell
cd ms-auth-nestjs
npm ci
npm run migration:run
npm run seed
npm run start:dev
```

```powershell
cd ms-stego-nestjs
npm ci
npm run migration:run
npm run start:dev
```

En ese caso se usa el `.env` interno de cada microservicio y STEGO debe apuntar
`AUTH_INTERNAL_URL` a la URL local de AUTH.

---

## 10. Seguridad implementada

- **Zero Trust:** STEGO no confía únicamente en la validez del JWT; consulta a
  AUTH antes de procesar una solicitud.
- **JWT RS256:** AUTH firma con clave privada; STEGO verifica con la pública.
- **RBAC dinámico:** los permisos se recalculan desde PostgreSQL en cada
  solicitud; desactivar una asignación revoca el acceso de inmediato.
- **Fail-Closed:** si AUTH no responde o la autorización falla, STEGO deniega.
- **Clave privada aislada:** solo AUTH puede leer `private.pem`; STEGO recibe
  únicamente `public.pem`.
- **Contenedores no privilegiados:** AUTH y STEGO ejecutan como usuarios sin
  privilegios y con `no-new-privileges`.
- **Superficie mínima:** PostgreSQL no publica puertos; las APIs solo escuchan en
  `127.0.0.1`.
- **Validación estricta:** DTOs, `ValidationPipe`, límites de tamaño de imagen,
  validación de formato y umbrales configurables.
- **Secretos fuera de Git:** `.env` y claves RSA están excluidos.
- **Credencial de servicio:** `INTERNAL_API_KEY` protege la comunicación
  servicio a servicio entre STEGO y AUTH.

Si las APIs se publican fuera del host, deben colocarse detrás de un gateway con
TLS. La red privada de Docker no sustituye TLS para tráfico externo.

---

## 11. Solución de problemas

### `external volume ... not found`

Crear los volúmenes externos una vez:

```powershell
docker volume create ms-auth-nestjs_users_postgres_data
docker volume create ms-stego-nestjs_stego_postgres_data
```

### `password authentication failed for user ...`

Las credenciales del `.env` no coinciden con las del volumen existente.
PostgreSQL aplica `POSTGRES_PASSWORD` solo cuando inicializa un volumen vacío.
Para conservar datos, ajustar `.env` a las credenciales originales; no borrar el
volumen.

### Las migraciones fallan

```powershell
docker compose logs auth-migrate
docker compose logs stego-migrate
```

Las APIs no inician hasta que el servicio de migración correspondiente termine
correctamente.

### Swagger devuelve 404

Verificar:

```dotenv
SWAGGER_ENABLED=true
```

Luego recrear:

```powershell
docker compose up -d --force-recreate auth stego
```

### Puerto ocupado

Revisar qué proceso usa `3001` o `3002` y detenerlo, o cambiar `AUTH_PORT` /
`STEGO_PORT` en `.env`.

### STEGO devuelve 401 o 503

- `401`: token inválido/expirado o clave pública distinta de la que firmó AUTH.
- `503`: AUTH no está disponible. Revisar:

```powershell
docker compose ps auth
docker compose logs auth
```

### Error de UUID en `stego_analysis`

Las migraciones de STEGO deben estar aplicadas. Verificar:

```powershell
docker compose run --rm stego-migrate
docker compose logs stego-migrate
```

La migración correctiva configura `stego_analysis.id` con
`DEFAULT gen_random_uuid()`, sin recrear la tabla ni modificar registros.

---

## 12. Créditos académicos

**Materia:** Desarrollo Software Seguro  
**Institución:** ESPE  
**Proyecto:** Secure Chat - Backend V1  
**Componentes:** Microservicio AUTH, microservicio STEGO y stack Docker Compose
integrado.
