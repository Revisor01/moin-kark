<p align="center">
  <img src="apps/app/assets/icon.png" alt="Moin Kark" width="128" height="128">
</p>

<h1 align="center">Moin Kark</h1>

<p align="center">
  Was ist los in Dithmarschen? Gottesdienste, Konzerte, Gruppen und Feste<br>
  aller Kirchengemeinden des Kirchenkreises auf einer Karte.
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Plattform-Web%20%C2%B7%20iOS%20%C2%B7%20Android-blue" alt="Plattform">
  <img src="https://img.shields.io/badge/Expo-React%20Native-000020?logo=expo" alt="Expo">
  <img src="https://img.shields.io/github/license/Revisor01/moin-kark" alt="Lizenz">
</p>

## Worum es geht

Die Termine der Kirchengemeinden im Kirchenkreis Dithmarschen stehen in vielen
einzelnen Kalendern. Wer wissen will, was am Wochenende in der Nähe los ist,
muss sie alle einzeln aufrufen.

Moin Kark legt sie zusammen auf eine Karte: Jede Veranstaltung als Pin an
ihrem Ort, mit Gemeinde und Kirchspiel, filterbar nach Tag, Gemeinde und Art.
Die Termine kommen direkt aus den Kalendern der Gemeinden. Merken und
Erinnerungen bleiben auf dem eigenen Gerät; ein Konto gibt es nicht.

## Funktionen

- **Karte und Liste** — alle Termine als Pins, dazu eine ziehbare Liste; nahe
  beieinander liegende Termine werden gebündelt
- **Filter** — heute, diese Woche, Wochenende oder ein eigener Zeitraum; dazu
  Gemeinde, Kategorie und der sichtbare Kartenausschnitt
- **Standort** — wo bin ich, was ist in der Nähe
- **Merken und Erinnern** — gemerkte Termine bleiben auf dem Gerät, Erinnerungen
  kommen als lokale Mitteilung, ohne Server
- **Teilen** — jeder Termin lässt sich weitergeben; der Link öffnet ihn in der
  App oder auf der Karte im Browser
- **Navigation** — Weg zum Ort in Apple Karten oder Google Maps
- **Ohne Netz** — zuletzt geladene Termine bleiben lesbar
- Web, iOS und Android aus einer Codebasis

## Installation

**[Im Browser öffnen »](https://karte.moin-kark.de)**

Die Apps für iOS und Android liegen seit Oktober 2026 bei Apple und Google zur
Prüfung; die Links folgen hier, sobald sie erschienen sind.

## Versionen

Was sich wann geändert hat, steht in [CHANGELOG.md](CHANGELOG.md) — nach
[Keep a Changelog](https://keepachangelog.com/de/1.1.0/), aus Sicht der
Nutzer:innen geschrieben. Die
[Releases](https://github.com/Revisor01/moin-kark/releases) fassen jede Version
zusammen.

## Selbst betreiben

Zum Ausprobieren auf dem eigenen Rechner — die Lizenz erlaubt das. Nötig ist
Node 22 oder neuer. Das Repository ist ein npm-Workspace: `npm install` läuft
einmal im Wurzelverzeichnis und installiert alle Teile.

```bash
git clone https://github.com/Revisor01/moin-kark.git
cd moin-kark
npm install
```

**1. API starten.** Die API sammelt die Termine aus ChurchDesk ein, je
Gemeinde mit einem Lese-Token. Die Tokens gehören nur in die Umgebung der API,
nie in die App. Ohne Tokens startet die API trotzdem und liefert eine leere
Karte.

```bash
cd apps/api
cp .env.example .env    # Tokens und Einstellungen eintragen
npm run dev
# hört auf Port 8787 — Probe: curl localhost:8787/healthz
```

| Variable | Pflicht | Bedeutung |
|----------|---------|-----------|
| `CD_TOKEN_<org>` | nein | ChurchDesk-Lese-Token je Organisation |
| `ALLOWED_ORIGINS` | nein | erlaubte Herkunft für Browser, kommagetrennt |
| `ADMIN_TOKEN` | nein | schaltet die Orts-Verwaltung unter `/admin` frei |
| `DATA_DIR` | nein | Ablage der Ortskorrekturen aus `/admin` |
| `PORT`, `CACHE_TTL_MS`, `DEFAULT_WINDOW_DAYS` | nein | Port, Zwischenspeicher, Zeitfenster |

**2. App starten.** Ohne Angabe spricht die App die öffentliche API an; für die
eigene gilt `EXPO_PUBLIC_API_URL`. Die Herkunft der Web-App muss dann in
`ALLOWED_ORIGINS` stehen.

```bash
cd apps/app
EXPO_PUBLIC_API_URL=http://localhost:8787 npm run web
```

Für iOS und Android braucht es einen nativen Build (`npm run ios`,
`npm run android`) mit Xcode bzw. Android Studio.

**Tests.** `npm test` im Wurzelverzeichnis prüft das geteilte Paket, die API
und die App; `npm run typecheck` die Typen.

## Aufbau

```
moin-kark
├── apps/api/          — sammelt die Termine aus ChurchDesk, liefert GeoJSON
├── apps/app/          — die App (Expo / React Native, auch fürs Web)
├── apps/web/          — Landingpage, statisches HTML
├── packages/shared/   — Typen, Kirchspiel-Zuordnung, Kirchen-Koordinaten, Gestaltung
└── docs/              — API-Beschreibung (openapi.yaml)
```

Die Endpunkte der API beschreibt [docs/openapi.yaml](docs/openapi.yaml).

**Worauf es beim Bauen ankommt:**
- **Die Tokens bleiben auf dem Server.** Die App kennt nur die Adresse der API.
- **Gestaltung an einer Stelle.** Farben, Abstände und Schriftgrößen stehen nur
  in `packages/shared/src/theme.ts`. Die Landingpage liest sie über
  `apps/web/theme.css`; nach jeder Änderung `npm run sync:theme-css`, sonst
  schlägt ein Test fehl.
- **Fürs Web immer `npm run build:web`.** Der Befehl kopiert den Karten-Worker
  mit; ohne ihn bleibt die Karte leer, ohne Fehlermeldung.
- **Ausgelieferte Apps nie brechen.** Versionen in den Stores lesen die API mit;
  Antwortformen ändern sich nur additiv (siehe [CLAUDE.md](CLAUDE.md)).
- **Bundle-ID und Schema bleiben.** `de.godsapp.kkdithkarte` und `kkdith`
  stammen aus der Anfangszeit; eine Änderung machte die App im Store zu einer
  anderen und bräche geteilte Links.

## Mitmachen

Fehlermeldungen und Vorschläge sind willkommen — gern als
[Issue](https://github.com/Revisor01/moin-kark/issues). Sicherheitslücken bitte
vertraulich melden, wie in [SECURITY.md](SECURITY.md) beschrieben. Pull
Requests laufen durch Tests und einen Secret-Scan; die Grundsätze für Beiträge
stehen in [CLAUDE.md](CLAUDE.md).

## Datenschutz

Moin Kark braucht kein Konto und sammelt nichts über seine Nutzer:innen.
Gemerkte Termine und Erinnerungen bleiben auf dem Gerät. Der Standort wird nur
auf dem Gerät verwendet, um die Karte zu zentrieren.

Die vollständige Erklärung steht unter
[simonluthe.de/apps/moinkark/datenschutz](https://simonluthe.de/apps/moinkark/datenschutz/).

## Lizenz

Moin Kark steht unter der
[GNU Affero General Public License v3.0](LICENSE). Wer Moin Kark verändert und
anderen zur Verfügung stellt, auch als Webdienst, legt seinen Quelltext unter
derselben Lizenz offen. Wer das nicht möchte, bekommt auf Anfrage eine
kommerzielle Lizenz ([mail@simonluthe.de](mailto:mail@simonluthe.de)). Für
Beiträge gilt [CONTRIBUTING.md](CONTRIBUTING.md).

## Hinweis

Die Termine stammen aus den Kalendern der Kirchengemeinden im Kirchenkreis
Dithmarschen; für Inhalt und Richtigkeit sind die Gemeinden verantwortlich.

## Kontakt

Pastor Simon Luthe · [mail@simonluthe.de](mailto:mail@simonluthe.de) ·
[moin-kark.de](https://moin-kark.de)
