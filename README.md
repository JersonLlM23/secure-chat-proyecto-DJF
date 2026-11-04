# Secure Chat - AUTH + STEGO

Backend en microservicios del proyecto Secure Chat:

- **AUTH** (`ms-auth-nestjs`): usuarios, roles, JWT RS256 y decisiones RBAC.
- **STEGO** (`ms-stego-nestjs`): analisis esteganografico LSB y consulta de
  autorizacion a AUTH.

El despliegue integrado se define en el `docker-compose.yml` de la raiz.

## Requisitos

- Docker Desktop con Docker Compose v2.
- OpenSSL para generar o inspeccionar claves RSA.
- Node.js 24 y npm 11 solo para desarrollo o pruebas fuera de Docker.

## Arquitectura de despliegue

| Servicio | Contenedor | Red | Puerto publicado |
| --- | --- | --- | --- |
| `auth-db` | `secure-chat-auth-db` | `backend` | No |
| `auth-migrate` | `secure-chat-auth-migrate` | `backend` | No |
| `auth` | `secure-chat-auth` | `backend` | `127.0.0.1:3001` |
| `stego-db` | `secure-chat-stego-db` | `backend` | No |
| `stego-migrate` | `secure-chat-stego-migrate` | `backend` | No |
| `stego` | `secure-chat-stego` | `backend` | `127.0.0.1:3002` |

STEGO consume AUTH mediante `http://auth:3001` dentro de la red privada. Las
bases de datos no publican puertos. AUTH y STEGO publican solo en loopback.

## Volumenes existentes

El compose reutiliza exactamente los volumenes externos ya creados:

| Servicio | Volumen externo |
| --- | --- |
| AUTH | `ms-auth-nestjs_users_postgres_data` |
| STEGO | `ms-stego-nestjs_stego_postgres_data` |

No se crean volumenes nuevos ni se eliminan los existentes. Para conservar
los datos, las credenciales del `.env` raiz deben coincidir con las usadas
cuando se inicializo cada volumen.

## Primer despliegue integrado

### 1. Crear el archivo de entorno

```powershell
Copy-Item .env.example .env
```

Completar en `.env` todos los valores obligatorios:

- `AUTH_DB_USERNAME`, `AUTH_DB_PASSWORD`, `AUTH_DB_DATABASE`.
  Para AUTH, tomar `DB_USERNAME`, `DB_PASSWORD` y `DB_DATABASE` del
  `ms-auth-nestjs/.env` existente.
- `STEGO_DB_USERNAME`, `STEGO_DB_PASSWORD`, `STEGO_DB_DATABASE`.
  Usar las mismas credenciales con las que se inicializo el volumen de STEGO.
- `INTERNAL_API_KEY`: mismo valor para AUTH y STEGO. Generar por ejemplo con
  `openssl rand -hex 32` (minimo 43 caracteres).

Las contrasenas de base de datos deben tener al menos 12 caracteres. El
compose falla antes de iniciar si falta una variable obligatoria o esta vacia.
Si un valor contiene `#`, `$`, espacios o comillas, conservar el entrecomillado
del `.env` original (preferiblemente con comillas simples).

`.env` esta ignorado por Git. No commitear secretos ni claves privadas.

### 2. Verificar las claves RSA

AUTH necesita:

```
ms-auth-nestjs/keys/private.pem
ms-auth-nestjs/keys/public.pem
```

Si no existen:

```powershell
mkdir .\ms-auth-nestjs\keys
openssl genpkey -algorithm RSA -pkeyopt rsa_keygen_bits:2048 -out .\ms-auth-nestjs\keys\private.pem
openssl rsa -pubout -in .\ms-auth-nestjs\keys\private.pem -out .\ms-auth-nestjs\keys\public.pem
```

AUTH monta todo `keys/` en modo lectura. STEGO monta unicamente
`public.pem`; la clave privada nunca entra en la imagen ni en STEGO.

### 3. Validar el compose

```powershell
docker compose config --quiet
```

Debe terminar sin errores. Si falla, revisar las variables marcadas como
obligatorias en `.env`.

### 4. Detener el despliegue anterior

El compose raiz usa los mismos volumenes que los contenedores anteriores. Si
siguen existiendo, detenerlos antes del primer arranque integrado:

```powershell
docker stop ms-auth-nestjs users-postgres stego-postgres
```

No ejecutar `docker volume rm` ni `docker compose down -v`. Los contenedores
anteriores pueden conservarse detenidos hasta validar el nuevo despliegue.

### 5. Construir e iniciar

```powershell
docker compose up -d --build
```

Secuencia esperada:

1. `auth-db` y `stego-db` quedan saludables.
2. `auth-migrate` aplica migraciones y termina con codigo 0.
3. `auth` inicia y responde su healthcheck.
4. `stego-migrate` aplica migraciones y termina con codigo 0.
5. `stego` inicia cuando AUTH esta saludable.

Las migraciones no se ejecutan en cada reinicio de las APIs: solo en los
servicios `*-migrate`, configurados con `restart: "no"`.

### 6. Verificar

```powershell
docker compose ps
Invoke-RestMethod http://127.0.0.1:3001/api/health
Invoke-RestMethod http://127.0.0.1:3002/api/health
docker compose logs -f auth stego
```

`auth-migrate` y `stego-migrate` deben aparecer como `Exited (0)`.

## Operacion

```powershell
# Reiniciar solo una API
docker compose restart auth
docker compose restart stego

# Reconstruir tras cambiar codigo o Dockerfile
docker compose up -d --build

# Ver logs
docker compose logs -f auth stego

# Aplicar migraciones pendientes
docker compose run --rm auth-migrate
docker compose run --rm stego-migrate

# Detener el stack sin tocar los volumenes externos
docker compose down
```

Despues de validar el despliegue integrado se pueden retirar los contenedores
anteriores con `docker rm ms-auth-nestjs users-postgres stego-postgres`. Esa
operacion no elimina los volumenes de datos.

## Seguridad

- AUTH y STEGO se ejecutan como usuarios no privilegiados.
- Todos los servicios usan `no-new-privileges`.
- Las APIs se publican solo en `127.0.0.1`; las bases de datos no se publican.
- AUTH y STEGO comparten una red privada de Docker.
- JWT se firma con RS256. AUTH conserva la clave privada; STEGO solo verifica
  con la clave publica.
- `INTERNAL_API_KEY` protege la comunicacion servicio a servicio y debe ser
  identica en AUTH y STEGO.
- Si las APIs se exponen fuera del host, colocar un gateway con TLS delante.

## Desarrollo local

Cada microservicio conserva su `.env.example` y puede ejecutarse fuera de
Docker con su propio PostgreSQL. Los compose internos de cada microservicio
fueron retirados; para el stack integrado usar el compose de la raiz.

```powershell
# AUTH
cd .\ms-auth-nestjs
npm ci
npm run migration:run
npm run seed
npm run start:dev

# STEGO
cd .\ms-stego-nestjs
npm ci
npm run migration:run
npm run start:dev
```

Pruebas:

```powershell
cd .\ms-auth-nestjs
npm run lint
npm test
npm run test:e2e

cd ..\ms-stego-nestjs
npm run lint
npm test
```

## Solucion de problemas

- **`password authentication failed`**: las credenciales no coinciden con las
  del volumen existente. PostgreSQL solo aplica `POSTGRES_PASSWORD` al
  inicializar un volumen vacio; cambiarla en `.env` no rota la clave actual.
- **`INTERNAL_API_KEY` invalida**: debe tener al menos 43 caracteres y ser
  identica en AUTH y STEGO.
- **STEGO no inicia**: revisar que `auth` este saludable y que
  `ms-auth-nestjs/keys/public.pem` exista y sea legible.
- **Puerto ocupado**: detener los contenedores anteriores o cambiar
  `AUTH_PORT` / `STEGO_PORT` en `.env`.
- **Migraciones fallidas**: revisar `docker compose logs auth-migrate` o
  `docker compose logs stego-migrate`; las APIs no inician hasta que el
  servicio de migracion termine correctamente.

## Rollback al despliegue anterior

Mientras los contenedores anteriores no se hayan eliminado:

```powershell
docker compose down
docker start users-postgres stego-postgres ms-auth-nestjs
```

Luego verificar el healthcheck de AUTH. No se debe eliminar ningun volumen
externo durante el rollback.
