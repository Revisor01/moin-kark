# Changelog

Alle nennenswerten Änderungen an diesem Projekt werden hier dokumentiert.

Das Format orientiert sich an [Keep a Changelog 1.1.0](https://keepachangelog.com/de/1.1.0/),
die Versionierung folgt [SemVer 2.0.0](https://semver.org/lang/de/).

## [Unreleased]

Noch nicht veröffentlicht. Die erste Store-Fassung wird **1.0.0** — bis dahin
sammelt sich hier alles, was seit Projektbeginn entstanden ist.

### Hinzugefügt

- **Read-Only-API** (`apps/api`, Node + Hono): aggregiert die ChurchDesk-REST-API v3
  über 14 Kirchengemeinde-Organisationen, dedupliziert und liefert ein GeoJSON.
  Die 14 Read-Tokens bleiben server-seitig. Endpoints: `/events.geojson`,
  `/categories.json`, `/healthz`. SWR-Cache, serverseitig gedeckeltes Zeitfenster
  (Token-Schutz), CORS-Allowlist.
- **Expo-App** (`apps/app`): Karte, Liste, Filter und Detailansicht für Web, iOS
  und Android aus einer Codebasis. MapLibre (Web via `@vis.gl/react-maplibre`,
  nativ via `@maplibre/maplibre-react-native`).
- **Geteiltes Paket** (`packages/shared`): TypeScript-Typen, Kirchspiel-Mapping,
  Kirchen-Koordinaten als Fallback.
- **Landingpage** (`apps/web`) auf `moin-kark.de`, Web-App auf
  `karte.moin-kark.de` — mit sechs eigens erstellten Dithmarschen-Illustrationen
  (Deich mit Schafen, Büsumer Hafen, Meldorfer Dom, St. Bartholomäus
  Wesselburen, St. Secundus Hennstedt, Kohlfelder).
- Standort & Umkreis: Live-Standort, der Marker folgt der Bewegung; „Zu meinem
  Standort“ fällt bei fernem Standort auf die Dithmarschen-Übersicht zurück.
- Ziehbares Listen-Sheet mit drei Snap-Stufen.
- Filter: Gemeinde, Kategorie, Wochen-Vorauswahl, sichtbarer Kartenausschnitt.
- Merken & Erinnerungen: gemerkte Events persistent, lokale Benachrichtigungen
  on-device (kein Server). Im Web weisen Profil und Event-Modal darauf hin, dass
  es dort keine Erinnerungen gibt und nur lokal gemerkt wird.
- Event-Cache für Offline-Start, Onboarding-Overlay, Cluster-Tap.
- Kartenwahl: Apple/Google Maps nativ, auf Web/Desktop Google Maps im Browser.
- Branding: App-Name „Moin Kark“, Bricolage Grotesque + DM Sans,
  Küsten-Kartenstil, „Fog of War“ außerhalb Dithmarschens, App-Icon
  (Terracotta-Pin mit Kirche) in allen Varianten für iOS, Android und Web.
- Footer nach dem projektübergreifenden Branding-Pattern: App + Version,
  „Made with 🐦 in Hennstedt“, Friedensgruß.

### Infrastruktur

- Eigene Domain `moin-kark.de` mit vollständigem DNS (A/AAAA, Wildcard, MX, SPF,
  DKIM, DMARC, MTA-STS, TLS-RPT, CAA) und Let's-Encrypt-Zertifikaten.
- API unter `api.moin-kark.de` (Container `moinkark-api`, Apache/KeyHelp →
  Traefik). Die Alt-Domain `kkkarte.godsapp.de` bleibt vorerst in der
  CORS-Allowlist, solange Builds mit der alten URL im Umlauf sind.
- Mail-Weiterleitung `moin@moin-kark.de`.

### Sicherheit

- `@hono/node-server` auf 2.x, `hono` auf 4.12.x, `expo` auf 56.0.18,
  `brace-expansion` auf 5.0.9, `shell-quote` auf 1.10.0.
- Dependabot-Alerts und Security-Updates aktiviert (17 → 1 offener Alert; der
  verbleibende betrifft `uuid` im Expo-Build-Tooling, kein Patch verfügbar).
- `apps/app/package-lock.json` entfernt — im npm-Workspace ist allein der
  Root-Lock maßgeblich.

### Behoben

- Event-Modal: Kopfbereich fix, nur die Beschreibung scrollt; bei zu wenig Platz
  scrollt automatisch das gesamte Sheet (sonst waren die letzten Zeilen auf
  kleinen Geräten unerreichbar).
- Event-Liste im Sheet bis zum letzten Eintrag scrollbar — das Safe-Area-Padding
  saß am Container statt im Scroll-Inhalt und verkleinerte den sichtbaren
  Bereich dauerhaft.
- Reanimated-Crash beim Start; kein Fehler-Screen beim Offline-Start mit Cache.
- Erinnerungen brechen im Web nicht mehr ab (Platform-Guard).
- Dunkler Strich über dem Listen-Sheet (Rahmenkante + zu kräftiger Schatten).

[Unreleased]: https://github.com/Revisor01/moin-kark/commits/main
