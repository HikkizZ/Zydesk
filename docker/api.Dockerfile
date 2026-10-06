# syntax=docker/dockerfile:1
# Imagen de producción de la API (Fase 9, §4.1). Contexto de construcción = raíz del repo.
# node:22-alpine
FROM node:22-alpine@sha256:0a7108bf6c7bf5de370ffb1a3ed6be93d405b43ff159f681a8d18c0e2bc2e402 AS base
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY apps/bot/package.json apps/bot/
# `--ignore-scripts`: el postinstall compila shared y aquí aún no hay fuentes (se compila en `build`)

# Dependencias de producción solo de este workspace (sin las de web ni las de desarrollo)
FROM base AS prod-deps
RUN npm ci --ignore-scripts --omit=dev -w @zydesk/api

# Todo para compilar
FROM base AS build
RUN npm ci --ignore-scripts
COPY tsconfig.base.json ./
COPY packages/shared packages/shared
COPY apps/api apps/api
RUN npm run build -w @zydesk/shared && npm run build -w @zydesk/api

# node:22-alpine
FROM node:22-alpine@sha256:0a7108bf6c7bf5de370ffb1a3ed6be93d405b43ff159f681a8d18c0e2bc2e402 AS runtime
ENV NODE_ENV=production TZ=UTC API_PUERTO=3000
WORKDIR /app
COPY --from=prod-deps --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/package.json ./package.json
COPY --from=build --chown=node:node /app/packages/shared/package.json ./packages/shared/package.json
COPY --from=build --chown=node:node /app/packages/shared/dist ./packages/shared/dist
COPY --from=build --chown=node:node /app/apps/api/package.json ./apps/api/package.json
COPY --from=build --chown=node:node /app/apps/api/dist ./apps/api/dist
# Archivos de ejemplo de la demo (PNG y EML): tsc no los copia a dist (F9-T10)
COPY --chown=node:node apps/api/src/database/semillas/demo/archivos ./apps/api/dist/database/semillas/demo/archivos
COPY --chown=node:node docs/legal ./docs/legal
COPY --chmod=755 docker/entrypoint-api.sh /usr/local/bin/entrypoint-api
RUN mkdir -p /datos/archivos && chown -R node:node /datos
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3000/api/salud | grep -q '"estado":"ok"' || exit 1
ENTRYPOINT ["entrypoint-api"]
CMD ["node", "apps/api/dist/server.js"]
