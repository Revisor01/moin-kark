# Changelog

Alle nennenswerten Änderungen an diesem Projekt werden hier dokumentiert.

Das Format orientiert sich an [Keep a Changelog 1.1.0](https://keepachangelog.com/de/1.1.0/),
die Versionierung folgt [SemVer 2.0.0](https://semver.org/lang/de/).

## [Unreleased]

## [1.0.0] – 2026-08-01

Erste offiziell versionierte Fassung. Die App lief bis hierher unversioniert als
`0.1.0` durch TestFlight; dieser Eintrag fasst den gesamten Stand zusammen und
markiert ihn als stabiles Release.

### Hinzugefügt

- **Read-Proxy** (`apps/proxy`, Node + Hono): aggregiert die ChurchDesk-REST-API v3
  über 14 Kirchengemeinde-Organisationen, dedupliziert und liefert ein GeoJSON.
  Die 14 Read-Tokens bleiben server-seitig. Endpoints: `/events.geojson`,
  `/categories.json`, `/healthz`. SWR-Cache, serverseitig gedeckeltes Zeitfenster
  (Token-Schutz), CORS-Allowlist.
- **Expo-App** (`apps/app`): Karte, Liste, Filter und Detailansicht für Web, iOS
  und Android aus einer Codebasis. MapLibre (Web via `@vis.gl/react-maplibre`,
  nativ via `@maplibre/maplibre-react-native`).
- **Geteiltes Paket** (`packages/shared`): TypeScript-Typen, Kirchspiel-Mapping,
  Kirchen-Koordinaten als Fallback.
- Standort & Umkreis: Live-Standort, der Marker folgt der Bewegung
  (`watchPositionAsync`); „Zu meinem Standort“ fällt bei fernem Standort auf die
  Dithmarschen-Übersicht zurück.
- Ziehbares Listen-Sheet mit drei Snap-Stufen (nur Griff / ein Eintrag lesbar /
  groß, Karte weiter sichtbar).
- Filter: Gemeinde, Kategorie, Wochen-Vorauswahl, Viewport („Liste zeigt den
  sichtbaren Kartenausschnitt“), schwebende Filterleiste mit Chips.
- Merken & Erinnerungen: gemerkte Events persistent, lokale Benachrichtigungen
  on-device (kein Server).
- Event-Cache für Offline-Start, Onboarding-Overlay, Cluster-Tap.
- Kartenwahl: Apple/Google Maps nativ, auf Web/Desktop immer Google Maps im Browser.
- Branding: App-Name „Moin Kark“, Bricolage-Grotesque + DM Sans, Küsten-Kartenstil,
  „Fog of War“ außerhalb Dithmarschens, App-Icon (Terracotta-Pin auf hellem
  Aqua-Teal, iOS light/dark/tinted + Android adaptiv) und passender Splash.
- Profil-Sheet mit Kirchenkreis-Trägerschaft, Copyright und Kartenattribution.

### Geändert

- Proxy: Zeitzone via `tzdata` im Container korrigiert.
- Kategorien werden nach Titel dedupliziert; `0/0`-Koordinaten gelten als Fallback.
- Vergangene Events werden ausgefiltert.
- Ausgeschlossen: interne Veranstaltungen, Amtshandlungen (intern), Konfirmanden,
  extern gebuchte Termine.

### Behoben

- Reanimated-Crash beim Start.
- Kein Fehler-Screen mehr beim Offline-Start, solange Cache-Daten vorliegen.
- Listen-Sheet bis zum Ende scrollbar — letzte Einträge werden nicht mehr abgeschnitten.
- Erinnerungen brechen im Web nicht mehr ab (Platform-Guard).
- Kein Flackern beim Schließen des Modals; Position wird im sichtbaren Bereich zentriert.
- Detail-Beschreibung scrollt korrekt; EventSheet per Swipe schließbar.

### Sicherheit

- `@hono/node-server` auf `2.x` und `hono` auf `4.12.x` angehoben (behebt die
  gemeldeten Advisories im Proxy). Verifiziert gegen die Live-ChurchDesk-API:
  861 Events, CORS-Allowlist und Fehlerpfad unverändert korrekt.
- `expo` auf `56.0.18` gepatcht (Web-Build verifiziert).
- Dependabot-Alerts und Security-Updates für das Repository aktiviert.
- `apps/app/package-lock.json` entfernt: In einem npm-Workspace ist allein der
  Root-Lock maßgeblich. Die Datei war auf einem veralteten Stand und erzeugte
  doppelte, irreführende Alerts.

[Unreleased]: https://github.com/Revisor01/moin-kark/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/Revisor01/moin-kark/releases/tag/v1.0.0
