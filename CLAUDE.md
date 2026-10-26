# Hinweise für Coding-Agenten

Projektanweisungen, Übergaben und Betriebswissen liegen nicht in diesem
Repository, sondern in einer privaten Ablage des Autors. Wer ohne diese Ablage
arbeitet, hält sich an die folgenden Regeln.

## Grundsätze

- Änderungen nur über einen Pull Request auf `main`. Ein Thema pro PR.
- Commits nach [Conventional Commits](https://www.conventionalcommits.org/de/),
  Betreff im Präsens, höchstens 72 Zeichen, auf Deutsch oder Englisch.
- Jede Änderung, die Nutzer:innen bemerken, kommt im selben PR in
  `CHANGELOG.md` unter `[Unreleased]`
  ([Keep a Changelog](https://keepachangelog.com/de/1.1.0/)).
- Neues Verhalten bekommt einen Test, eine Fehlerbehebung zuerst den Test, der
  den Fehler zeigt.
- Keine neuen Abhängigkeiten ohne Rücksprache.
- In dieses Repository gehören keine Zugangsdaten, Hostnamen privater Server,
  lokalen Pfade, Testkonten oder Arbeitsnotizen, auch nicht in
  Commit-Nachrichten, PR-Texten oder Kommentaren. Der Secret-Scan in CI prüft
  das.

## Kommentare

Ein Kommentar sagt, warum etwas so ist, nicht was der Code tut oder wie es
früher war. Höchstens drei Zeilen; was mehr braucht, gehört in die
Commit-Nachricht oder nach `docs/`. Keine Hostnamen, IPs oder Serverdetails,
kein `TODO` ohne Issue-Nummer, kein auskommentierter Code.

## Dieses Projekt

Ein npm-Workspace:

| Teil | Was |
|---|---|
| `apps/api` | Hono-Server, fasst die ChurchDesk-Termine aller Kirchspiele zu einem Feed zusammen. |
| `apps/app` | Expo / React Native: Web, iOS und Android aus einer Codebasis. |
| `apps/web` | Statische Landingpage (kein Workspace). |
| `packages/shared` | Gemeinsame Typen, Kirchspiel-Zuordnung, Koordinaten, Normalisierung. |

- `npm install` einmal im Wurzelverzeichnis, nicht je App.
- `npm test` für alle Tests, `npm run typecheck` für API und App.
- `npm run dev:api` braucht `apps/api/.env` mit ChurchDesk-Zugängen (siehe
  `.env.example`).
- API-Doku: [`docs/openapi.yaml`](docs/openapi.yaml), im selben PR pflegen wie
  jede Änderung an Routen.

## Ausgelieferte Apps nie brechen

Seit 1.0.0 liegen App-Versionen in den Stores. Sie lesen die API und lassen
sich nicht mitdeployen. Antwortformen sind deshalb ein Vertrag: Felder dürfen
dazukommen, aber nicht verschwinden, umbenannt werden oder ihren Typ ändern.
Wer die Form ändern will, legt eine neue, versionierte Route an und lässt die
alte stehen, bis keine App sie mehr ruft. Grüne Tests beweisen das nicht, sie
prüfen nur gegen den Stand im Repo.
