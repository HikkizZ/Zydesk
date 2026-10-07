# syntax=docker/dockerfile:1
# Imagen de producción de la web: build estático + nginx sin root en 8080 (Fase 9, §4.2).
# Contexto = raíz del repo.
# node:22-alpine
FROM node:22-alpine@sha256:0a7108bf6c7bf5de370ffb1a3ed6be93d405b43ff159f681a8d18c0e2bc2e402 AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY apps/bot/package.json apps/bot/
RUN npm ci --ignore-scripts
COPY tsconfig.base.json ./
COPY packages/shared packages/shared
COPY apps/web apps/web
# La ayuda importa los .md con ?raw y los PNG de img/ (ADR 0027.47, 0029.24)
COPY docs/manuales docs/manuales
RUN npm run build -w @zydesk/shared && npm run build -w @zydesk/web

# nginxinc/nginx-unprivileged:1.27-alpine
FROM nginxinc/nginx-unprivileged:1.27-alpine@sha256:65e3e85dbaed8ba248841d9d58a899b6197106c23cb0ff1a132b7bfe0547e4c0
COPY docker/nginx/zydesk.conf /etc/nginx/conf.d/default.conf
COPY docker/nginx/cabeceras.conf /etc/nginx/cabeceras.conf
COPY --from=build /app/apps/web/dist /usr/share/nginx/html
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=3s --retries=3 CMD wget -qO- http://127.0.0.1:8080/salud-web || exit 1
