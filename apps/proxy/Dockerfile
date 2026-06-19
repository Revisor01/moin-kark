# Read-Only ChurchDesk-Aggregator (Hono + tsx, kein Build-Step).
FROM node:22-alpine

# tzdata, damit TZ=Europe/Berlin im Container wirklich greift (Alpine hat es sonst nicht →
# new Date() bliebe UTC → nachts würden Events vom Vortag im Datumsfenster landen).
RUN apk add --no-cache tzdata
ENV TZ=Europe/Berlin

WORKDIR /app

# Monorepo-Manifeste zuerst (Layer-Caching).
COPY package.json ./
COPY packages/shared/package.json ./packages/shared/package.json
COPY apps/proxy/package.json ./apps/proxy/package.json

# Nur Proxy-Workspace + dessen Abhängigkeiten installieren.
RUN npm install --omit=dev --workspace apps/proxy --include-workspace-root

# Quellcode (shared + proxy).
COPY packages/shared ./packages/shared
COPY apps/proxy ./apps/proxy

ENV NODE_ENV=production
ENV PORT=8787
EXPOSE 8787

WORKDIR /app/apps/proxy
CMD ["npm", "run", "start"]
