# Moin Kark — Was ist los in Dithmarschen

Eine stilisierte Karte des Kirchenkreises Dithmarschen, die zeigt, was wo los ist —
Gottesdienste, Konzerte, Gruppen, Yoga … Jedes Event als exakter Pin, mit Kirchengemeinde
und Kirchspiel. Cross-Platform: Web + iOS + Android aus einer Codebasis.

| Was          | Wo                                              |
|--------------|-------------------------------------------------|
| Landingpage  | https://moin-kark.de                             |
| Web-App      | https://karte.moin-kark.de                       |
| API          | https://api.moin-kark.de                         |
| iOS          | App Store / TestFlight (`de.godsapp.kkdithkarte`)|

## Architektur

```
ChurchDesk REST API v3 (14 Orgs, geheime Read-Tokens)
        │  API aggregiert, dedupliziert, → GeoJSON, Cache
        ▼
apps/api     (Node + Hono)        →  api.moin-kark.de
        │  GET /events.geojson
        ▼
apps/app     (Expo / React Native + RN Web)
        │  MapLibre (Web: react-map-gl · Native: maplibre-react-native)
        ▼
   Web · iOS · Android
```

## Struktur

| Pfad               | Inhalt                                                              |
|--------------------|---------------------------------------------------------------------|
| `packages/shared/` | Geteilte TS-Typen, Kirchspiel-Mapping, Kirchen-Koordinaten-Fallback  |
| `apps/api/`        | Read-Only Aggregator (Hono). Hält die 14 Tokens server-seitig.       |
| `apps/app/`        | Expo-App (Web + iOS + Android).                                     |
| `apps/web/`        | Statische Landingpage für `moin-kark.de`.                           |

Ein Monorepo, weil App, API und Landingpage sich `packages/shared` teilen
(Typen, Kirchspiel-Mapping). Getrennte Repos müssten dieses Paket duplizieren
oder publizieren — beides ohne Gewinn.

### Namensgebung

Interne Pakete heißen `@moinkark/*`, der Container `moinkark-api`.

Nicht umbenannt und **bewusst so gelassen**: `slug` (`kkdith-karte`), `scheme`
(`kkdith`) und die Bundle-ID (`de.godsapp.kkdithkarte`) in `apps/app/app.json`.
Der Slug hängt am EAS-Projekt, Scheme und Bundle-ID an bereits ausgelieferten
Builds — eine Änderung würde die App im Store zu einer anderen App machen und
Deep-Links brechen.

## Wichtig: Secrets

Die 14 ChurchDesk-Read-Tokens sind **geheim** und dürfen **nie** ins Repo oder ins
App-Bundle. Sie leben ausschließlich als Container-ENV der API (`apps/api/.env`,
gitignored). Die App kennt nur die API-URL.

## Quickstart

Voraussetzung: Node ≥ 20. Das Repo ist ein npm-Workspace — `npm install` läuft
**im Root** und installiert alle Pakete. Maßgeblich ist allein die
`package-lock.json` im Root (die Apps haben bewusst keine eigene).

### API lokal

```bash
npm install
cd apps/api
cp .env.example .env   # 14 Tokens eintragen
npm run dev
curl localhost:8787/events.geojson | python3 -m json.tool
```

Ohne Tokens startet die API zwar, liefert aber ein leeres GeoJSON.

### App lokal

```bash
cd apps/app
npm run web       # Browser
npm run ios       # Simulator (erfordert vorheriges expo prebuild)
npm run android
```

Die App zieht ihre Daten aus der API. Für lokale Entwicklung die eigene Origin in
`ALLOWED_ORIGINS` eintragen; eine abweichende API-URL geht über
`EXPO_PUBLIC_API_URL`.

## Endpoints

| Route               | Inhalt                                              |
|---------------------|-----------------------------------------------------|
| `/events.geojson`   | Alle Termine als GeoJSON-FeatureCollection          |
| `/categories.json`  | Kategorien mit Farbe und Anzahl                     |
| `/healthz`          | Health-Check                                        |

Optional `?from=` / `?to=` (ISO oder `YYYY-MM-DD`). Das Fenster wird serverseitig
auf `MAX_WINDOW_DAYS` gedeckelt — das schützt die Tokens vor Abfrage-Exzessen.

## Android-Signing

Der Release-Keystore liegt **außerhalb des Repos**:

| Was | Wo |
|---|---|
| Keystore-Datei | `~/.claude/secrets/keystores/anders-erzaehlt-release.jks` |
| Alias für diese App | `moinkark` |
| Zugangsdaten | `~/.claude/secrets/keystores/moinkark-keystore.env` |
| EAS-Anbindung | `apps/app/credentials.json` (gitignored) |

Die Datei wird mit *anders erzählt* geteilt, Moin Kark hat darin aber einen
**eigenen Alias** — die Schlüssel sind getrennt, nur der Container ist derselbe.

> **Ohne diesen Schlüssel sind keine Play-Store-Updates mehr möglich.** Google
> akzeptiert Updates nur, wenn sie mit demselben Key signiert sind wie die
> Erstveröffentlichung. Geht er verloren, muss die App unter neuer Package-ID
> neu veröffentlicht werden und alle Installationen sind verloren.
> Die Datei gehört also ins Backup — ein Backup vom 2026-08-02 liegt neben ihr
> als `.bak-20260802`.

## iOS-Build: MapLibre-Workaround (wichtig)

Xcodes SwiftPM hängt auf diesem Rechner beim Laden des MapLibre-Binärartefakts:
`xcodebuild -resolvePackageDependencies` bleibt bei 0 % CPU in
`BinaryArtifactsManager.download` stehen — ohne offene Verbindung, ohne Timeout,
reproduzierbar auch ohne EAS. Der Download selbst funktioniert (per `curl` in
Sekunden, Prüfsumme korrekt), es ist ein Xcode-Problem.

Abhilfe ist ein lokaler SwiftPM-Mirror, der bereits eingerichtet ist:

| Was | Wo |
|---|---|
| Mirror-Repo (enthält das XCFramework als Datei) | `~/.local/share/moinkark-spm-mirror` |
| Mirror-Konfiguration | `~/.swiftpm/configuration/mirrors.json` |
| Gepinnter Commit | in `ios/MoinKark.xcworkspace/xcshareddata/swiftpm/Package.resolved` |

Beides liegt **außerhalb des Repos** und muss auf einem neuen Rechner neu
angelegt werden:

```bash
# 1. Original-Repo klonen, auf die benötigte Version wechseln
git clone https://github.com/maplibre/maplibre-gl-native-distribution ~/.local/share/moinkark-spm-mirror
cd ~/.local/share/moinkark-spm-mirror && git checkout 6.26.0

# 2. Artefakt herunterladen (URL steht in Package.swift des Tags)
curl -L -o MapLibre.dynamic.xcframework.zip \
  https://github.com/maplibre/maplibre-native/releases/download/ios-v6.26.0/MapLibre.dynamic.xcframework.zip

# 3. In Package.swift url+checksum durch path ersetzen:
#    .binaryTarget(name: "MapLibre", path: "MapLibre.dynamic.xcframework.zip")
git add -A && git commit -m "local artifact" && git tag -f 6.26.0

# 4. Mirror registrieren
mkdir -p ~/.swiftpm/configuration
cat > ~/.swiftpm/configuration/mirrors.json <<EOF
{"object":[{"original":"https://github.com/maplibre/maplibre-gl-native-distribution",
 "mirror":"$HOME/.local/share/moinkark-spm-mirror"}],"version":1}
EOF

# 5. Den neuen Commit-Hash in Package.resolved eintragen (git rev-parse HEAD)
```

Achtung: Das Format der `mirrors.json` ist ein **Objekt** mit `object`/`version`,
kein Array — ein Array wird stillschweigend ignoriert und die Auflösung meldet
fälschlich Erfolg mit leerem Ergebnis.

## iOS-Build: fastlane-Timeout

`xcodebuild -showBuildSettings` braucht auf diesem Rechner **~18 Sekunden**.
fastlane startet mit 3 s und gibt nach vier Versuchen bei 24 s auf — der Build
bricht dann mit „Run fastlane step failed with an unknown error" ab, obwohl
weder Code noch Signierung ein Problem haben. Darum vor dem Build setzen:

```bash
export FASTLANE_XCODEBUILD_SETTINGS_TIMEOUT=120
export FASTLANE_XCODEBUILD_SETTINGS_RETRIES=5
```

`expo-doctor` meldet außerdem einige Pakete, die ein paar Patch-Versionen hinter
dem SDK-Soll liegen (u.a. `expo-location`, `expo-notifications`). Der Schritt
schlägt fehl, **stoppt den Build aber nicht** — nicht mitten im Release
aktualisieren, sondern separat mit `npx expo install --check`.

## iOS-Build: „Your session has expired" beim Export

Der Build läuft durch, dann bricht `exportArchive` ab mit
`resultString = "Your session has expired. Please log in."` → `** EXPORT FAILED **`.
Ursache ist **nicht** die Signierung, sondern `uploadSymbols`: Das Hochladen der
dSYMs braucht eine gültige Xcode-Sitzung bei Apple, und die läuft still ab.

Das Archiv ist zu dem Zeitpunkt fertig — die IPA lässt sich ohne Apple-Kontakt
daraus exportieren:

```bash
cat > /tmp/export.plist <<'PLIST'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>method</key><string>app-store-connect</string>
  <key>teamID</key><string>J459G9CJT5</string>
  <key>signingStyle</key><string>manual</string>
  <key>provisioningProfiles</key>
  <dict><key>de.godsapp.kkdithkarte</key><string>Moin Kark AppStore 2</string></dict>
  <key>uploadSymbols</key><false/>
  <key>manageAppVersionAndBuildNumber</key><false/>
</dict></plist>
PLIST

xcodebuild -exportArchive \
  -archivePath ~/Library/Developer/Xcode/Archives/<datum>/MoinKark*.xcarchive \
  -exportPath /tmp/export -exportOptionsPlist /tmp/export.plist
```

Wichtig: **kein** `-allowProvisioningUpdates` — der Schalter erzwingt den
Apple-Kontakt und lässt den Export erneut scheitern. `uploadSymbols=false`
kostet nur die Crash-Symbolisierung in App Store Connect.

Danach normal hochladen:
`npx eas-cli submit --platform ios --profile production --path /tmp/export/MoinKark.ipa`

## Deployment

### API

Läuft auf `server.godsapp.de` (Apache/KeyHelp → Traefik:8888 → Container:8787),
Stack-Verzeichnis `/opt/stacks/moinkark-api/`.

```bash
# 1. Quellcode auf den Server spiegeln (ohne Secrets/node_modules)
rsync -az --delete --exclude node_modules --exclude .git --exclude .env \
  --exclude '*.log' --exclude apps/app \
  ./ root@server.godsapp.de:/opt/stacks/moinkark-api/build/

# 2. Image auf dem Server neu bauen
ssh root@server.godsapp.de \
  "cd /opt/stacks/moinkark-api/build && docker build -f apps/api/Dockerfile -t moinkark-api:latest ."

# 3. Container neu starten
ssh root@server.godsapp.de "docker restart moinkark-api"
```

Die 14 Tokens liegen als Portainer-Stack-ENV (`moinkark-api`), niemals im Repo.

### Landingpage

`apps/web/` ist statisches HTML ohne Build-Step und liegt im KeyHelp-Docroot von
`moin-kark.de`:

```bash
rsync -az --delete apps/web/ root@server.godsapp.de:/home/users/revisor/www/moin-kark.de/
```

### Web-App

`karte.moin-kark.de` wird aus dem Expo-Web-Export bedient:

```bash
cd apps/app && npx expo export --platform web --output-dir dist
rsync -az --delete dist/ root@server.godsapp.de:/home/users/revisor/www/karte.moin-kark.de/
```

## Versionierung

[SemVer](https://semver.org/lang/de/); Änderungen stehen im [CHANGELOG.md](CHANGELOG.md).
Jede ausgelieferte Version bekommt einen Tag `vX.Y.Z` und ein GitHub-Release.
