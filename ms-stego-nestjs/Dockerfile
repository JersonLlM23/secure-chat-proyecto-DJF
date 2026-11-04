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
# Dependencias de produccion (incluye el binario nativo de Sharp para musl)
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

RUN addgroup -S stego && adduser -S stego -G stego

COPY --from=production-deps /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY package.json ./

# Solo se monta public.pem en tiempo de ejecucion. La clave privada
# permanece exclusivamente en AUTH y nunca se copia a esta imagen.
RUN mkdir -p /app/keys && chown -R stego:stego /app

USER stego

EXPOSE 3002

HEALTHCHECK --interval=15s --timeout=5s --start-period=20s --retries=5 \
  CMD node -e "fetch('http://127.0.0.1:3002/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "dist/main.js"]
