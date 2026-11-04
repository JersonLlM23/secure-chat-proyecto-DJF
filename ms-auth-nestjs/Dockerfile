# syntax=docker/dockerfile:1

# ---------------------------------------------------------------------------
# Build: compila TypeScript a dist/
# ---------------------------------------------------------------------------
FROM node:24-alpine AS build

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY tsconfig.json tsconfig.build.json nest-cli.json ./
COPY src ./src

RUN npm run build

# ---------------------------------------------------------------------------
# Dependencias de producción
# ---------------------------------------------------------------------------
FROM node:24-alpine AS production-deps

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

# ---------------------------------------------------------------------------
# Runtime: imagen ligera, usuario no privilegiado
# ---------------------------------------------------------------------------
FROM node:24-alpine AS runtime

ENV NODE_ENV=production
WORKDIR /app

RUN addgroup -S auth && adduser -S auth -G auth

COPY --from=production-deps /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY package.json ./

# Montar aquí las claves RSA en tiempo de ejecución.
# La clave privada NUNCA se copia dentro de la imagen.
RUN mkdir -p /app/keys && chown -R auth:auth /app

USER auth

EXPOSE 3001

HEALTHCHECK --interval=15s --timeout=5s --start-period=20s --retries=5 \
  CMD node -e "fetch('http://127.0.0.1:3001/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

# Migraciones controladas antes de iniciar.
CMD ["sh", "-c", "node dist/database/migrate.js && node dist/main.js"]
