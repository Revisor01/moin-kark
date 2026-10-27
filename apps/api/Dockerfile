# Moin Kark API — Read-Only ChurchDesk-Aggregator (Hono + tsx, kein Build-Step).
FROM node:26-alpine

# tzdata für Zeitausgaben und Logs; das Datumsfenster bildet der Code selbst über Intl.
RUN apk add --no-cache tzdata
ENV TZ=Europe/Berlin

WORKDIR /app

# Monorepo-Manifeste + Lockfile zuerst (Layer-Caching).
COPY package.json package-lock.json ./
COPY packages/shared/package.json ./packages/shared/package.json
COPY apps/api/package.json ./apps/api/package.json

# npm ci, damit ein Redeploy exakt das Lockfile zieht.
RUN npm ci --omit=dev --workspace apps/api --include-workspace-root

# Quellcode (shared + api).
COPY packages/shared ./packages/shared
COPY apps/api ./apps/api

ENV NODE_ENV=production
ENV PORT=8787

# Spät, damit ein neuer Commit den npm-ci-Layer nicht ungültig macht.
ARG GIT_SHA=unknown
ENV GIT_SHA=$GIT_SHA
EXPOSE 8787

# /data muss dem Laufzeit-User gehören, sonst scheitert das Schreiben der Korrekturen.
RUN mkdir -p /data && chown -R node:node /data /app
USER node

WORKDIR /app/apps/api
CMD ["npm", "run", "start"]
