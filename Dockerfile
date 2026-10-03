# syntax=docker/dockerfile:1
#
# Coolify on the shared Hetzner host. The base tag MUST stay `node:24-alpine`,
# identical across every app on the box, so Docker stores one base layer and
# reuses it (same rule as skaleclub's Dockerfile).
#
# The server runs as one always-on process: the QR/NFC redirects printed on
# physical pieces must answer instantly, which a cold serverless start cannot
# promise.

FROM node:24-alpine AS base
WORKDIR /app

FROM base AS deps
COPY package.json package-lock.json ./
RUN npm ci

FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# esbuild -> dist/index.cjs, vite build -> dist/public. No build-time env needed.
RUN npm run build

FROM base AS runner
ENV NODE_ENV=production
ENV PORT=8888
# scripts/build.ts keeps every package external, so runtime deps must exist.
# --ignore-scripts: nothing at runtime needs a postinstall.
# Run as the unprivileged `node` user that ships with node:alpine.
RUN chown node:node /app
USER node
COPY --chown=node:node package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force
COPY --from=builder --chown=node:node /app/dist ./dist
# Migrations are not run here: apply them with `npm run migrate` (README → Deploy).
EXPOSE 8888
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD wget -qO- http://127.0.0.1:8888/api/health || exit 1
CMD ["node", "dist/index.cjs"]
