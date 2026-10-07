# syntax=docker/dockerfile:1
# Imagen de producción del bot de Telegram (Fase 9, §4.3). Contexto = raíz del repo.
# node:22-alpine
FROM node:22-alpine@sha256:0a7108bf6c7bf5de370ffb1a3ed6be93d405b43ff159f681a8d18c0e2bc2e402 AS base
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY apps/bot/package.json apps/bot/

# Dependencias de producción solo de este workspace (sin las de web ni las de desarrollo)
FROM base AS prod-deps
RUN npm ci --ignore-scripts --omit=dev -w @zydesk/bot

# Todo para compilar
FROM base AS build
RUN npm ci --ignore-scripts
COPY tsconfig.base.json ./
COPY packages/shared packages/shared
COPY apps/bot apps/bot
RUN npm run build -w @zydesk/shared && npm run build -w @zydesk/bot

# node:22-alpine
FROM node:22-alpine@sha256:0a7108bf6c7bf5de370ffb1a3ed6be93d405b43ff159f681a8d18c0e2bc2e402 AS runtime
ENV NODE_ENV=production TZ=UTC BOT_DATOS_DIR=/datos/bot
WORKDIR /app
COPY --from=prod-deps --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/package.json ./package.json
COPY --from=build --chown=node:node /app/packages/shared/package.json ./packages/shared/package.json
COPY --from=build --chown=node:node /app/packages/shared/dist ./packages/shared/dist
COPY --from=build --chown=node:node /app/apps/bot/package.json ./apps/bot/package.json
COPY --from=build --chown=node:node /app/apps/bot/dist ./apps/bot/dist
RUN mkdir -p /datos/bot && chown -R node:node /datos
USER node
# Sin EXPOSE ni HEALTHCHECK: el bot usa long polling y no escucha ningún puerto
CMD ["node", "apps/bot/dist/main.js"]
