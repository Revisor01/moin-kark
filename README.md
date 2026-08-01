# Was ist los in Dithmarschen

Eine stilisierte Karte des Kirchenkreises Dithmarschen, die zeigt, was wo los ist —
Gottesdienste, Konzerte, Gruppen, Yoga … Jedes Event als exakter Pin, mit Kirchengemeinde
und Kirchspiel. Cross-Platform: Web + iOS + Android aus einer Codebasis.

## Architektur

```
ChurchDesk REST API v3 (14 Orgs, geheime Read-Tokens)
        │  Read-Proxy aggregiert, dedupliziert, → GeoJSON, Cache
        ▼
apps/proxy   (Node + Hono)        →  kkkarte.godsapp.de
        │  GET /events.geojson
        ▼
apps/app     (Expo / React Native + RN Web)
        │  MapLibre (Web: react-map-gl · Native: maplibre-react-native)
        ▼
   Web · iOS · Android
```

## Struktur

| Pfad               | Inhalt                                                              |
|--------------------|--------------------------------------------------------------------|
| `packages/shared/` | Geteilte TS-Typen, Kirchspiel-Mapping, Kirchen-Koordinaten-Fallback |
| `apps/proxy/`      | Read-Only Aggregator (Hono). Hält die 14 Tokens server-seitig.     |
| `apps/app/`        | Expo-App (Web + iOS + Android).                                    |

## Wichtig: Secrets

Die 14 ChurchDesk-Read-Tokens sind **geheim** und dürfen **nie** ins Repo oder ins
App-Bundle. Sie leben ausschließlich als Container-ENV des Proxys (`apps/proxy/.env`,
gitignored). Die App kennt nur die Proxy-URL.

## Quickstart

Voraussetzung: Node ≥ 20. Das Repo ist ein npm-Workspace — `npm install` läuft
**im Root** und installiert alle drei Pakete. Maßgeblich ist allein die
`package-lock.json` im Root (die Apps haben bewusst keine eigene).

### Proxy lokal

```bash
npm install
cd apps/proxy
cp .env.example .env   # 14 Tokens eintragen
npm run dev
curl localhost:8787/events.geojson | python3 -m json.tool
```

Ohne Tokens startet der Proxy zwar, liefert aber ein leeres GeoJSON.

### App lokal

```bash
cd apps/app
npm run web       # Browser
npm run ios       # Simulator (erfordert vorheriges expo prebuild)
npm run android
```

Die App zieht ihre Daten vom Proxy. Für lokale Entwicklung muss die Proxy-URL
erreichbar und die eigene Origin in `ALLOWED_ORIGINS` eingetragen sein.

## Versionierung

[SemVer](https://semver.org/lang/de/); Änderungen stehen im [CHANGELOG.md](CHANGELOG.md).
Jede ausgelieferte Version bekommt einen Tag `vX.Y.Z` und ein GitHub-Release.

## Deployment (Proxy)

Live: **https://kkkarte.godsapp.de** (Apache/KeyHelp → Traefik:8888 → Container:8787).

Redeploy nach Code-Änderung am Proxy:

```bash
# 1. Quellcode auf den Server spiegeln (ohne Secrets/node_modules)
rsync -az --delete --exclude node_modules --exclude .git --exclude .env \
  --exclude '*.log' --exclude apps/app \
  ./ root@server.godsapp.de:/opt/stacks/kkdith-proxy/build/

# 2. Image auf dem Server neu bauen
ssh root@server.godsapp.de \
  "cd /opt/stacks/kkdith-proxy/build && docker build -f apps/proxy/Dockerfile -t kkdith-proxy:latest ."

# 3. Stack neu starten (Portainer: Stack 'kkdith-proxy' redeploy, oder:)
ssh root@server.godsapp.de "docker restart kkdith-proxy"
```

Die 14 Tokens liegen als Portainer-Stack-ENV (`kkdith-proxy`), niemals im Repo.
