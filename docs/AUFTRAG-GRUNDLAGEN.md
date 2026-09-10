# Auftrag: Moin Kark projektreif machen

Du arbeitest im Repo `Revisor01/moin-kark` (privat). Ziel: Das Projekt bekommt die
Grundlagen, die bisher fehlen — **eine `CLAUDE.md`, Tests und API-Dokumentation**.

## Ausgangslage (Stand 10.09.2026)

- `main` ist gepusht, Arbeitsverzeichnis sauber. Du startest auf aktuellem Stand.
- Es gibt **keinen einzigen Test** und **keine `CLAUDE.md`** im Repo-Root.
  (`apps/app/CLAUDE.md` und `apps/app/AGENTS.md` existieren — lies sie, sie gelten
  weiter für den App-Teil. Die neue Datei im Root beschreibt das Ganze.)
- `npm run typecheck` läuft für `api` und `app` — das ist bisher die einzige Absicherung.

## Was das Projekt ist

npm-Workspaces mit vier Teilen:

| Teil | Was |
|---|---|
| `apps/api` | Hono-Server. Aggregiert ChurchDesk-Termine mehrerer Kirchspiele zu Feeds. |
| `apps/app` | Expo / React Native (managed, aber mit `ios/`-Ordner) |
| `apps/web` | Website |
| `packages/shared` | Gemeinsame Typen, Kirchspiel-Zuordnung, Koordinaten, Normalisierung |

API-Routen: `/events.geojson`, `/categories.json`, `/status.json`, `/version.json`,
`/healthz`, `/admin` mit `/admin/api/locations` und `/admin/api/highlights`.

## Aufgabe 1 — `CLAUDE.md` im Repo-Root

Knapp und in ganzen Sätzen:

1. **Aufbau** — die vier Teile oben, und dass es npm-Workspaces sind
   (`npm install` im Root, nicht je App).
2. **Wie man startet** — `npm run dev:api`, `npm run typecheck`. Vorher selbst
   nachlesen, was wirklich stimmt.
3. **CHANGELOG-Pflicht:** Bei jedem Commit, der Nutzer:innen betrifft, wird
   `CHANGELOG.md` im selben Commit mitgeschrieben. Keep a Changelog, deutsche
   Überschriften, ein knapper Satz pro Punkt **aus Nutzersicht**. Niemals
   Build-Nummern, Dateinamen, Framework-Namen oder Commit-Hashes — das gehört in
   die Commit-Message. **Der bestehende CHANGELOG ist der Maßstab für den Ton;
   lies ihn, bevor du schreibst.**
4. **Commits:** Conventional Commits mit Bereich (`fix(api):`, `fix(shared):`,
   `feat(app):` — so wie bisher). **Keinerlei Hinweis auf Claude, Anthropic oder
   KI-Werkzeuge.**
5. **Tests:** Jede Verhaltensänderung bekommt Tests im selben Commit. Bei einem
   Bugfix zuerst der Test, der den Fehler zeigt, dann der Fix. Weiche Assertions
   (`expect([200,500]).toContain(...)`, `toBeDefined()` auf einem Zähler) gelten
   als Fehler — auf den konkreten Wert prüfen.
6. **Ausgelieferte Apps nie brechen:** Die App ist im Store. Antwortformen der API
   sind ein Vertrag: aus einem Array wird kein Objekt, Felder verschwinden nicht,
   Typen ändern sich nicht. Neue Felder hinzufügen ist erlaubt. Wer die Form ändern
   will, macht eine neue, versionierte Route. **Das betrifft hier besonders
   `/events.geojson` und `/categories.json`** — die liest die App auf den Geräten.
7. **API-Doku-Pflicht:** Neue oder geänderte Route → Eintrag in der OpenAPI-Datei
   im selben Commit.
8. **iOS-Signing liegt nicht im Repo:** `apps/app/credentials.json` und
   `dist-cert.p12` sind bewusst ignoriert. iOS-Builds gehen daher nur auf Simons
   Mac oder über GitHub Actions — auf einer Linux-Maschine nicht. Android, API und
   Web laufen überall.
9. **Sprache:** Antworten auf Deutsch, Nutzertexte auf Deutsch, Code und Bezeichner
   auf Englisch (dem bestehenden Code folgen).

**Was NICHT hinein darf:** Server-IPs, SSH-Zugänge, API-Tokens, Passwörter,
ChurchDesk-Zugänge. Auch nicht als Beispiel. Stößt du im Code auf so etwas: melden,
nicht übernehmen.

## Aufgabe 2 — Tests einrichten

Bisher gibt es keine. Richte ein Testframework ein (Vitest passt zu TypeScript und
npm-Workspaces; begründe kurz, falls du anders entscheidest) und fang dort an, wo
zuletzt echte Fehler steckten. Die jüngsten Commits zeigen die wunden Punkte:

**`packages/shared`** — reine Funktionen, am leichtesten zu testen, größter Nutzen:
- `normalizeKey` — die Normalisierung wurde gerade erst zentralisiert. Umlaute,
  Bindestriche, Groß-/Kleinschreibung, Leerzeichen.
- `resolveKirchspiel` / `eventParishes` — welches Kirchspiel gehört zu welchem Ort;
  auch der Fall „kein Treffer".
- `coordFixForTitle` / `coordOverrideForTitle` / `fallbackCoords` — zuletzt wurden
  Helgoland und drei Kirchenstandorte korrigiert. Genau diese Fälle absichern,
  damit sie nicht zurückfallen.

**`apps/api`**:
- `/events.geojson` — gültiges GeoJSON, und **0/0-Koordinaten werden abgelehnt**
  (war ein Fehler, ist gefixt, gehört abgesichert).
- Zeitfenster **nach Berliner Datum**, nicht UTC — ebenfalls ein behobener Fehler.
  Test mit einem Zeitpunkt, an dem sich UTC- und Berliner Datum unterscheiden
  (z. B. 23:30 Uhr Ortszeit im Sommer).
- `/healthz`, `/status.json`, `/version.json` — Antwortform und Statuscode.
- `aggregate.ts` und `cache.ts` — was passiert, wenn ChurchDesk nicht antwortet?

Lieber zehn ernsthafte Tests, die echte Fehler finden, als fünfzig, die nur Zeilen
abdecken. Fang bei `packages/shared` an, dort ist das Verhältnis von Aufwand zu
Nutzen am besten.

Ergänze ein `test`-Skript im Root, das alle Workspaces durchläuft.

## Aufgabe 3 — API-Dokumentation

Lege `docs/openapi.yaml` an (OpenAPI 3.1) mit allen öffentlichen Routen:
`/events.geojson`, `/categories.json`, `/status.json`, `/version.json`, `/healthz`.

Je Route: Parameter, Antwortform, Statuscodes. Für `/events.geojson` die
GeoJSON-Struktur mit den tatsächlich gelieferten Eigenschaften — **die App auf den
Geräten liest genau diese Felder**, deshalb ist die Doku hier ein Vertrag, keine
Nettigkeit.

Die `/admin`-Routen brauchst du nur zu erwähnen, nicht auszudokumentieren — dass es
sie gibt und dass sie geschützt sind.

## Reihenfolge und Commits

Ein Commit je Schritt:

1. `docs: Projektregeln in CLAUDE.md festhalten`
2. `test: Testframework einrichten und shared-Paket absichern`
3. `test: API-Feeds, Zeitfenster und Koordinaten abdecken`
4. `docs: API-Routen als OpenAPI 3.1 dokumentieren`

Der CHANGELOG bekommt **nur** einen Eintrag, wenn eine Änderung Nutzer:innen
betrifft. Tests und Doku sind Interna — höchstens unter „Sonstiges", im Zweifel
weglassen.

## Wichtig

- **Nichts an der Logik ändern**, solange kein Test den bisherigen Stand absichert.
  Findest du dabei einen Fehler: melden, nicht nebenbei beheben.
- Schlägt ein Test fehl, **erst prüfen, ob er recht hat.** Erwartung nur aufweichen,
  wenn sie nachweislich falsch war — nie, um grün zu werden.
- `apps/app/CLAUDE.md` und `apps/app/AGENTS.md` gelten weiter. Widersprechen sie der
  neuen Root-Datei, sag Bescheid, statt eines von beidem still zu überschreiben.

## Wenn du fertig bist

Pushen. Danach kurz berichten: Was steht in der `CLAUDE.md`, welche Tests laufen
(mit Anzahl), was deckt die OpenAPI-Datei ab — und ob dir beim Testen etwas
aufgefallen ist, das nach einem echten Fehler aussieht.
