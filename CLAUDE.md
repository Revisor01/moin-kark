# Moin Kark — Projektregeln

„Was ist los in Dithmarschen" — eine Karte des Kirchenkreises Dithmarschen mit
allem, was in den Gemeinden stattfindet. Web, iOS und Android aus einer Codebasis.

## Aufbau

Das Repo ist ein npm-Workspace mit vier Teilen:

| Teil | Was |
|---|---|
| `apps/api` | Hono-Server. Aggregiert die ChurchDesk-Termine aller Kirchspiele zu einem Feed. |
| `apps/app` | Expo / React Native — Web, iOS und Android aus einer Codebasis. |
| `apps/web` | Statische Landingpage. |
| `packages/shared` | Gemeinsame Typen, Kirchspiel-Zuordnung, Koordinaten, Normalisierung. |

Abhängigkeiten werden **im Root installiert** (`npm install`), nicht je App.
`apps/web` ist statisch und deshalb kein Workspace.

## Wie man arbeitet

- `npm install` — einmal im Root.
- `npm run dev:api` — API lokal starten. Braucht `apps/api/.env` mit den
  ChurchDesk-Tokens; ohne die startet der Server nicht.
- `npm test` — alle Tests über alle Workspaces.
- `npm run typecheck` — TypeScript für API und App.

## CHANGELOG

Jeder Commit, der Nutzer:innen betrifft, schreibt `CHANGELOG.md` im **selben
Commit** mit. Nicht erst beim Release.

- Format: [Keep a Changelog](https://keepachangelog.com/de/1.1.0/) mit deutschen
  Überschriften (Hinzugefügt / Geändert / Behoben / Sonstiges).
- Ein knapper Satz pro Punkt, **aus Nutzersicht**: was sich für jemanden ändert,
  der die App benutzt.
- Niemals Build-Nummern, Dateinamen, Framework-Namen oder Commit-Hashes — das
  gehört in die Commit-Message.
- Reine Interna (Tests, Refactoring, CI) höchstens unter „Sonstiges", im Zweifel
  weglassen.

Der bestehende CHANGELOG ist der Maßstab für den Ton. Vor dem Schreiben lesen.

## Commits

Conventional Commits mit Bereich, so wie bisher: `fix(api):`, `fix(shared):`,
`feat(app):`, `docs:`, `test:`, `chore:`. Betreffzeile knapp, Details in den Body.

Commits, Tags und PR-Beschreibungen enthalten **keinerlei Hinweis** auf Claude,
Anthropic oder KI-Werkzeuge.

## Tests

Jede Verhaltensänderung bekommt Tests im selben Commit.

- **Bugfix:** zuerst der Test, der den Fehler zeigt, dann der Fix.
- **Weiche Assertions sind ein Fehler.** `expect([200, 500]).toContain(...)` oder
  `toBeDefined()` auf einem Zähler verdecken echte Fehler. Auf den konkreten Wert
  prüfen.
- Schlägt ein Test nach einer Änderung fehl, erst prüfen, ob er recht hat. Eine
  Erwartung wird nur aufgeweicht, wenn sie nachweislich falsch war — nie, um grün
  zu werden.

## Ausgelieferte Apps nie brechen

Die App ist im Store. Auf den Geräten laufen Versionen, die sich nicht
mitdeployen lassen — sie sind Leserinnen dieser API. Die Antwortformen sind
deshalb ein **Vertrag**:

- Aus einem Array wird kein Objekt (und umgekehrt).
- Felder verschwinden nicht, Typen ändern sich nicht.
- Neue Felder hinzufügen ist erlaubt.
- Wer die Form ändern will, macht eine neue, versionierte Route und lässt die
  alte stehen, bis keine App sie mehr ruft.

Das betrifft besonders `/events.geojson` und `/categories.json` — die liest die
App auf den Geräten. Grüne Tests beweisen nichts über die Version im Store.

## API-Dokumentation

Neue oder geänderte Route → Eintrag in `docs/openapi.yaml` im selben Commit.
Geänderte Antwortform ebenso.

## iOS-Signing liegt nicht im Repo

`apps/app/credentials.json` und `dist-cert.p12` sind bewusst ignoriert. iOS-Builds
gehen deshalb nur auf Simons Mac oder über GitHub Actions — auf einer
Linux-Maschine nicht. Android, API und Web laufen überall.

## Sprache

Antworten auf Deutsch. Nutzertexte auf Deutsch. Code und Bezeichner auf Englisch,
dem bestehenden Code folgend.

## Was nicht ins Repo gehört

Server-IPs, SSH-Zugänge, API-Tokens, Passwörter, ChurchDesk-Zugänge — auch nicht
als Beispiel. Die ChurchDesk-Read-Tokens leben ausschließlich als Container-ENV
der API. Stößt du im Code auf so etwas: melden, nicht übernehmen.

## Weitere Regeln

`apps/app/CLAUDE.md` und `apps/app/AGENTS.md` gelten weiterhin für den App-Teil.
