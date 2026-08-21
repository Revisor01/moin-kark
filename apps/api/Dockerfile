# Moin Kark API — Read-Only ChurchDesk-Aggregator (Hono + tsx, kein Build-Step).
FROM node:22-alpine

# tzdata, damit TZ=Europe/Berlin im Container greift (Alpine hat es sonst nicht) — betrifft
# lokale Zeitausgaben und Logs. Das Datumsfenster selbst hängt NICHT daran: es wird in
# index.ts/churchdesk.ts explizit über Intl mit Europe/Berlin gebildet (toISOString() wäre UTC).
RUN apk add --no-cache tzdata
ENV TZ=Europe/Berlin

WORKDIR /app

# Monorepo-Manifeste + Lockfile zuerst (Layer-Caching).
COPY package.json package-lock.json ./
COPY packages/shared/package.json ./packages/shared/package.json
COPY apps/api/package.json ./apps/api/package.json

# Nur API-Workspace + dessen Abhängigkeiten installieren. `npm ci` statt `npm install`,
# damit ein Redeploy exakt die Versionen aus dem Lockfile zieht und nicht stillschweigend
# neuere Caret-Stände (sonst kann Prod brechen, ohne dass sich das Repo geändert hat).
RUN npm ci --omit=dev --workspace apps/api --include-workspace-root

# Quellcode (shared + api).
COPY packages/shared ./packages/shared
COPY apps/api ./apps/api

ENV NODE_ENV=production
ENV PORT=8787
EXPOSE 8787

# Nicht als root laufen. /data ist der Volume-Mountpoint der Admin-Korrekturen —
# er muss dem Laufzeit-User gehören, sonst schlägt das Schreiben fehl.
RUN mkdir -p /data && chown -R node:node /data /app
USER node

WORKDIR /app/apps/api
CMD ["npm", "run", "start"]
