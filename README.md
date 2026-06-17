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

## Quickstart (Proxy lokal)

```bash
npm install
cd apps/proxy
cp .env.example .env   # 14 Tokens eintragen
npm run dev
curl localhost:8787/events.geojson | python3 -m json.tool
```
