<p align="center">
  <img src="apps/app/assets/icon.png" alt="Moin Kark" width="128" height="128">
</p>

<h1 align="center">Moin Kark</h1>

<p align="center">
  What's on in Dithmarschen? Services, concerts, groups and festivals<br>
  of every parish in the church district, on one map.
</p>

<p align="center">
  <a href="README.md">Deutsch</a> · <b>English</b>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Platform-Web%20%C2%B7%20iOS%20%C2%B7%20Android-blue" alt="Platform">
  <img src="https://img.shields.io/badge/Expo-React%20Native-000020?logo=expo" alt="Expo">
  <img src="https://img.shields.io/github/license/Revisor01/moin-kark" alt="License">
</p>

## What it is about

The events of the parishes in the church district of Dithmarschen are spread
across many separate calendars. Anyone who wants to know what is happening
nearby at the weekend has to open each one of them.

Moin Kark brings them together on one map: every event as a pin at its
location, with its parish and parish group (Kirchspiel), filterable by day,
parish and type. The events come straight from the parishes' calendars.
Saved events and reminders stay on your own device; there is no account.

## Features

- **Map and list** — all events as pins, plus a list you can drag up; events
  close to each other are grouped
- **Filters** — today, this week, the weekend or a custom date range; plus
  parish, category and the visible map area
- **Location** — where am I, what is nearby
- **Save and remind** — saved events stay on the device, reminders arrive as a
  local notification, without a server
- **Share** — every event can be passed on; the link opens it in the app or on
  the map in the browser
- **Directions** — the way there in Apple Maps or Google Maps
- **Offline** — the most recently loaded events stay readable
- Web, iOS and Android from one codebase

## Installation

**[Open in the browser »](https://karte.moin-kark.de)**

The iOS and Android apps have been in review with Apple and Google since
October 2026; the links will follow here once they are published.

## Versions

What changed when is in [CHANGELOG.md](CHANGELOG.md) (in German, following
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), written from the
users' point of view). The
[releases](https://github.com/Revisor01/moin-kark/releases) summarise each
version.

## Running it yourself

To try it out on your own computer — the license allows that. You need Node 22
or newer. The repository is an npm workspace: run `npm install` once in the
root directory and it installs all parts.

```bash
git clone https://github.com/Revisor01/moin-kark.git
cd moin-kark
npm install
```

**1. Start the API.** The API collects the events from ChurchDesk, with one
read token per parish. The tokens belong only in the API's environment, never
in the app. Without tokens the API still starts and serves an empty map.

```bash
cd apps/api
cp .env.example .env    # fill in tokens and settings
npm run dev
# listens on port 8787 — check: curl localhost:8787/healthz
```

| Variable | Required | Meaning |
|----------|----------|---------|
| `CD_TOKEN_<org>` | no | ChurchDesk read token per organisation |
| `ALLOWED_ORIGINS` | no | allowed origins for browsers, comma-separated |
| `ADMIN_TOKEN` | no | enables the location admin under `/admin` |
| `DATA_DIR` | no | where the location corrections from `/admin` are stored |
| `PORT`, `CACHE_TTL_MS`, `DEFAULT_WINDOW_DAYS` | no | port, cache, time window |

**2. Start the app.** By default the app talks to the public API; for your own
one, set `EXPO_PUBLIC_API_URL`. The web app's origin then has to be listed in
`ALLOWED_ORIGINS`.

```bash
cd apps/app
EXPO_PUBLIC_API_URL=http://localhost:8787 npm run web
```

iOS and Android need a native build (`npm run ios`, `npm run android`) with
Xcode or Android Studio.

**Tests.** `npm test` in the root directory checks the shared package, the API
and the app; `npm run typecheck` checks the types.

## Structure

```
moin-kark
├── apps/api/          — collects the events from ChurchDesk, serves GeoJSON
├── apps/app/          — the app (Expo / React Native, also for the web)
├── apps/web/          — landing page, static HTML
├── packages/shared/   — types, parish group mapping, church coordinates, design
└── docs/              — API description (openapi.yaml)
```

The API endpoints are described in [docs/openapi.yaml](docs/openapi.yaml).

**What matters when building:**
- **The tokens stay on the server.** The app only knows the API's address.
- **Design in one place.** Colours, spacing and font sizes live only in
  `packages/shared/src/theme.ts`. The landing page reads them via
  `apps/web/theme.css`; run `npm run sync:theme-css` after every change,
  otherwise a test fails.
- **For the web, always `npm run build:web`.** The command copies the map
  worker along; without it the map stays empty, without an error message.
- **Never break shipped apps.** Versions in the stores read the API; response
  shapes only change additively (see [CLAUDE.md](CLAUDE.md)).
- **Bundle ID and scheme stay.** `de.godsapp.kkdithkarte` and `kkdith` date
  from the early days; changing them would make the app a different one in the
  stores and break shared links.

## Contributing

Bug reports and suggestions are welcome as an
[issue](https://github.com/Revisor01/moin-kark/issues). Please report security
issues privately as described in [SECURITY.md](SECURITY.md). Pull requests run
through tests and a secret scan; the principles for contributions are in
[CONTRIBUTING.md](CONTRIBUTING.md).

## Privacy

Moin Kark needs no account and collects nothing about its users. Saved events
and reminders stay on the device. Your location is used only on the device, to
centre the map.

The full privacy policy (in German) is at
[simonluthe.de/apps/moinkark/datenschutz](https://simonluthe.de/apps/moinkark/datenschutz/).

## License

Moin Kark is licensed under the
[GNU Affero General Public License v3.0](LICENSE). If you modify Moin Kark and
make it available to others, including as a web service, you publish your
source code under the same license. Contributions are covered by
[CONTRIBUTING.md](CONTRIBUTING.md).

## Note

The events come from the calendars of the parishes in the church district of
Dithmarschen; the parishes are responsible for their content and accuracy.

## Contact

Pastor Simon Luthe · [mail@simonluthe.de](mailto:mail@simonluthe.de) ·
[moin-kark.de](https://moin-kark.de)
