# API-Audit

Stand: 14.09.2026, Commit `c039724`. Umfang: `apps/api/src`, `apps/api/test`,
`packages/shared/src` (+ deren Tests), `docs/openapi.yaml`, `package.json`,
`tsconfig.json`. Jeder Befund wurde gegen den Code geprüft; wo möglich zusätzlich
gegen Produktion (`https://api.moin-kark.de`, Feed vom 14.09.2026, 883 Events)
oder per Skript belegt. Zahlen sind gemessen, nicht geschätzt.

## Zusammenfassung

Die API ist klein, gut kommentiert und in den Kernpfaden (Zeitzone, Cache-Dedup,
Totalausfall-Schutz, Admin-Auth, Escaping) sauber gebaut; 79 Tests und der
Typecheck sind grün, es liegen keine Secrets im Repo. Kritische Befunde gibt es
keine. Der gewichtigste Befund ist ein Konstruktionsfehler im Zusammenspiel von
Cache-Schlüssel und Stale-Logik: Weil der Schlüssel täglich wechselt, verliert die
API um Mitternacht Berliner Zeit ihren Stale-Schutz — bei einem nächtlichen
ChurchDesk-Ausfall antworten alle Feed-Routen mit 500, obwohl der Vortagesstand im
Speicher liegt. Dazu kommen vier mittlere Befunde (Datenverlust-Pfad bei
Admin-Korrekturen, zwei stille Fehlfunktionen der Admin-Pflege, ein
Versions-Fingerprint, der sichtbare Felder auslässt) und eine Testlücke genau dort,
wo die komplizierteste Logik sitzt (ChurchDesk-Zeitfenster-Splitting, Overrides).

## Befunde

### [SCHWERE: hoch] Stale-Schutz fällt um Mitternacht aus — Feed liefert 500 trotz vorhandenem Datenstand

- **Ort:** `apps/api/src/index.ts:63-75` (Schlüssel `${fmtDate(from)}_${fmtDate(to)}`), `apps/api/src/cache.ts:33-53` (`get` kennt nur den eigenen Schlüssel)
- **Status:** BESTÄTIGT
- **Was:** Der Cache-Schlüssel enthält den Berliner Kalendertag; nach Mitternacht ist der neue Schlüssel leer, und `get()` behandelt das als Kaltstart — der Vortagesstand unter dem alten Schlüssel wird weder ausgeliefert noch als Rückfall genutzt.
- **Fehlerpfad:** ChurchDesk ist von 23:30 bis 02:00 Berliner Zeit nicht erreichbar (Wartungsfenster liegen typischerweise nachts). Bis 00:00 liefert `get("2026-09-14_…")` den alten Wert (stale-while-revalidate, `cache.ts:46-52`). Ab 00:00 ist der Schlüssel `"2026-09-15_…"`, `entries.get(key)` ist `undefined` (`cache.ts:41-44`), `load()` wartet auf `buildFeatureCollection`, die wirft (`aggregate.ts:82-84`) → `/events.geojson`, `/version.json` und `/categories.json` antworten mit **500** für die gesamte restliche Ausfalldauer. Gleichzeitig meldet `/healthz` über `peekLatest()` weiter `ok` (`index.ts:104-110`) — das Monitoring sieht nichts. Auch ohne Ausfall wartet jede Anfrage nach Mitternacht bis zum nächsten Timer-Tick (bis zu 20 min) auf den vollen 14-Org-Fetch (bis zu 15 s), statt sofort den Vortagesstand zu bekommen. Das widerspricht `docs/openapi.yaml:53-55` („Fällt ChurchDesk vorübergehend aus, bleibt der letzte erfolgreiche Stand stehen").
- **Fix:** Bei leerem Schlüssel den jüngsten Eintrag (`peekLatest`) als Stale-Wert liefern und im Hintergrund laden — oder den Cache auf einen einzigen Schlüssel umstellen (das Fenster ist ohnehin serverseitig fest) und den Tageswechsel nur im Loader berücksichtigen. Test: Loader für Tag 2 lehnt ab, `get` muss den Wert von Tag 1 liefern.

### [SCHWERE: mittel] Unlesbare Overrides-Datei führt beim nächsten Speichern zum Datenverlust

- **Ort:** `apps/api/src/locations.ts:91-105` (`loadOverrides` fängt alles außer ENOENT und startet leer), `locations.ts:112-120` (`setOverrides` ersetzt die Datei komplett)
- **Status:** BESTÄTIGT
- **Was:** Ist die Datei beim Start nicht lesbar (Rechte, ungültiges JSON, ein von `sanitize` abgelehnter Alt-Eintrag), läuft der Server still mit leerem Stand; die Admin-Oberfläche zeigt dann nur die Code-Tabellen, und der nächste „Speichern"-Klick überschreibt die Datei mit diesem leeren Stand.
- **Fehlerpfad:** Volume-Rechte ändern sich (ist laut Deploy-Notizen bereits einmal passiert) → `readFileSync` wirft EACCES → Log-Zeile, `overrides` bleibt `{}` → `GET /admin/api/locations` liefert leere `overrides` → Admin speichert eine Kleinigkeit → `renameSync(tmp, FILE)` gelingt (Verzeichnis ist schreibbar) → alle bisherigen Korrekturen, Kategorie-Ausschlüsse und Highlights sind weg. Kein Backup, keine Warnung in der Oberfläche.
- **Fix:** Bei Lesefehler (≠ ENOENT) Schreiben verweigern (`setOverrides` wirft, solange nicht erfolgreich geladen) oder Start abbrechen; vor `renameSync` die alte Datei als `.bak` sichern. Test: Datei mit ungültigem JSON → PUT muss 409/500 liefern, Datei unverändert.

### [SCHWERE: mittel] Kategorie-Ausschluss über /admin greift nicht bei Doppel-Leerzeichen

- **Ort:** `apps/api/src/aggregate.ts:39-44` (`c.title.trim().toLowerCase()`), `apps/api/src/locations.ts:75-80` (`normalizeName` kollabiert innere Leerzeichen), `apps/api/src/aggregate.ts:116-119` (Vorschlagsliste behält Original-Schreibweise)
- **Status:** BESTÄTIGT
- **Was:** Der Feed vergleicht Kategorien mit `trim().toLowerCase()`, die Admin-Seite speichert sie mit `normalizeKey` (zusätzlich `\s+` → ein Leerzeichen). Beide Normalisierungen sind nicht identisch, obwohl `types.ts:92-97` genau diese Drift als Risiko benennt.
- **Fehlerpfad:** ChurchDesk-Kategorie `"Externe  Buchung"` (zwei Leerzeichen — der Produktions-Feed enthält heute z. B. den Ortsnamen `"St. Remigius-Kirche  Albersdorf"`, Doppel-Leerzeichen kommen in ChurchDesk-Daten also real vor). Admin klickt sie in der Vorschlagsliste an → gespeichert als `"externe buchung"` → `isExcluded` prüft `"externe  buchung"` → `isDynamicallyExcludedCategory("externe  buchung")` ist `false` → die Termine bleiben im Feed, die Oberfläche zeigt den Ausschluss aber als aktiv. Dasselbe gilt für die statische `EXCLUDED_CATEGORIES`.
- **Fix:** In `isExcluded` und `extractCategories` `normalizeKey` verwenden (aus `@moinkark/shared`, wie `locations.ts` es tut). Test: Kategorie mit Doppel-Leerzeichen muss über den Override ausgeschlossen werden.

### [SCHWERE: mittel] /version.json übersieht Änderungen an sichtbaren Feldern

- **Ort:** `apps/api/src/index.ts:184-192` (`fingerprint`), Vertrag in `docs/openapi.yaml:110-113`
- **Status:** BESTÄTIGT
- **Was:** Der Hash umfasst weder `allDay`, `showEndtime`, `contributor`, `city`, `zipcode` noch `parishes` — die App zeigt diese Felder aber an (`apps/app/components/EventSheet.tsx:172-174, 248`, `EventCard.tsx:22`) bzw. filtert danach (`apps/app/lib/filters.ts`).
- **Fehlerpfad:** Gemeinde ändert einen Termin von 10:00–11:00 auf „ganztägig" oder trägt „Mitwirkung: Kantorei" nach → `fingerprint` bleibt gleich → die App sieht in `/version.json` keine Änderung und zeigt die alte Zeit/keine Mitwirkung, bis irgendein anderer Termin sich ändert. Die OpenAPI verspricht ausdrücklich, dass jede in der App sichtbare Änderung die Kennung ändert.
- **Fix:** Die fehlenden Felder in die Hash-Zeile aufnehmen (Aufwand: eine Zeile; Kosten gemessen 0,72 ms pro Aufruf, bleibt vernachlässigbar). Test analog zu „ändert die Kennung, wenn ein Highlight gesetzt wird" für `allDay` und `contributor`.

### [SCHWERE: mittel] Ein einziges fehlerhaftes Event kippt den gesamten Refresh

- **Ort:** `apps/api/src/aggregate.ts:61-76` (Transformation läuft außerhalb von `Promise.allSettled`), `aggregate.ts:41` (`c.title.trim()`), `aggregate.ts:116` (`c.title.trim()`)
- **Status:** PLAUSIBEL (Codepfad bestätigt; ob ChurchDesk je `title: null` liefert, ist nicht belegt — im heutigen Produktions-Feed sind alle 883 Events vollständig)
- **Was:** Fehler beim Fetch sind je Org isoliert, Fehler in `isExcluded`/`toFeature` nicht: eine Exception dort bricht `buildFeatureCollection` komplett ab.
- **Fehlerpfad:** Eine Org liefert ein Event mit `categories: [{ id: 5, title: null }]` → `c.title.trim()` wirft `TypeError` → Refresh scheitert für alle 14 Orgs → Cache bleibt stale → nach 60 min `/healthz` 503 → bei Container-Neustart Kaltstart-500 für alle Clients, ausgelöst durch einen Datensatz einer Gemeinde.
- **Fix:** `toFeature`/`isExcluded` je Event in `try/catch` mit Log und `continue`, oder `title` defensiv als `String(c.title ?? "")` behandeln. Test: Event mit `title: null` in einer Kategorie darf den Feed nicht kippen.

### [SCHWERE: mittel] Keine Tests für Zeitfenster-Splitting, Overrides-Persistenz und Admin-PUT

- **Ort:** `apps/api/src/churchdesk.ts:95-131` (`fetchOrgEvents`), `apps/api/src/locations.ts` (komplett), `apps/api/src/index.ts:229-233, 297-308`
- **Status:** BESTÄTIGT
- **Was:** Die komplizierteste Logik der API — das rekursive Halbieren des Zeitfensters am 100er-Limit, die Dedup über `byId`, das Chunk-Timeout — hat keinen einzigen Test (`churchdesk.test.ts` prüft nur `fmtDate`). `locations.ts` (Validierung inkl. 0/0-Ablehnung, Bereichsgrenzen, atomares Schreiben, Laden von Platte, alle vier Lookup-Funktionen) ist ungetestet; `PUT /admin/api/locations` ebenso, und der 503-Pfad bei fehlendem `ADMIN_TOKEN` (`index.ts:230`) auch. Die Integration „Admin-Highlight → `highlight: true` im Feature" (`geojson.ts:149-152`) ist nur über den statischen Tag getestet.
- **Fehlerpfad:** Eine Regression im Split (z. B. `spanDays > 2` versehentlich `>= 2`, oder `mid` statt überlappend `mid+1`) verlöre still Events großer Orgs; die Tests blieben grün.
- **Fix:** `fetchOrgEvents` mit gemocktem `fetch` testen: 100 Items → Split, Überlappung am Mittag, Dedup, Warnung bei Tiefe/Kleinstfenster, Timeout. `locations.ts` mit `DATA_DIR` auf ein Temp-Verzeichnis: Roundtrip, Ablehnung von 0/0 und außerhalb ±90/±180, `__proto__`-Schlüssel, PUT-Route 200/400/503.

### [SCHWERE: niedrig] „Überstimmt ChurchDesk" lässt sich im Admin nicht abwählen

- **Ort:** `apps/api/src/geojson.ts:105-106` (`dynamicCoordOverrideForTitle(...) ?? coordOverrideForTitle(...)`), `apps/api/src/locations.ts:135-139` (findet nur `force`-Einträge)
- **Status:** BESTÄTIGT
- **Was:** Ein Laufzeit-Override mit `force: false` kann den statischen `force`-Eintrag nicht aufheben, weil die Kette bei `undefined` auf die Code-Tabelle zurückfällt.
- **Fehlerpfad:** Admin entfernt bei „willkommen in der kirchenkiste" das Häkchen „Überstimmt ChurchDesk" → `collect()` (`pages.ts:299-301`) schickt `{prefix, coords, force:false}` → Server speichert es → `dynamicCoordOverrideForTitle` liefert `undefined` (kein `force`-Treffer) → `coordOverrideForTitle` greift weiterhin aus `TITLE_OVERRIDES` → Häkchen wirkungslos, Oberfläche zeigt es aber als übernommen.
- **Fix:** Wenn ein dynamischer Eintrag mit passendem Präfix existiert, dessen `force`-Wert als maßgeblich behandeln (statischen Override nur konsultieren, wenn es keinen dynamischen Eintrag gibt).

### [SCHWERE: niedrig] Ortsname „Constructor" erzeugt `[null, null]`-Koordinaten

- **Ort:** `packages/shared/src/kirchen-coords.ts:244-247` (`LOCATION_COORD_FIXES[normalize(...)]`), `kirchen-coords.ts:259`, `kirchspiele.ts:118`, `apps/api/src/locations.ts:126`
- **Status:** BESTÄTIGT (per Skript: `coordFixFor("Constructor")` → `[Function: Object]`, `toFeature(...)` → `{"coordinates":[null,null]}`, `coordSource: "fix"`)
- **Was:** Alle Nachschlagetabellen sind einfache Objekte mit Index-Zugriff; Schlüssel aus `Object.prototype` (`constructor`, `__proto__`) treffen die Prototypkette statt der Tabelle.
- **Fehlerpfad:** ChurchDesk-Ort oder -Gemeinde heißt „Constructor" (oder ein Admin legt den Ort „__proto__" an) → `fix` ist die Funktion `Object` → `coords.lng`/`coords.lat` sind `undefined` → im Feed `[null, null]` → verletzt `docs/openapi.yaml:225-235` und lässt die Karten-Bibliothek der App auf ungültige Geometrie laufen. Bei `resolveKirchspiel` wird `kirchspiel` zur Funktion und fehlt im JSON (Pflichtfeld).
- **Fix:** `Object.hasOwn(table, key)` vor dem Zugriff oder Tabellen als `Map`/`Object.create(null)`; in `sanitize` Schlüssel `__proto__`/`constructor`/`prototype` ablehnen.

### [SCHWERE: niedrig] Zeitfenster ist je nach Sommerzeit 59 oder 61 Tage lang

- **Ort:** `apps/api/src/index.ts:64-65` (`to = from + DEFAULT_DAYS × 86 400 000 ms`), Doku `docs/openapi.yaml:20-21` („Standard 60 Tage")
- **Status:** BESTÄTIGT (per Skript: Start 25.10. 00:30 Berlin → Fenster 25.10.–23.12. = 59 Tage; Start 01.03. 23:30 Berlin → 01.03.–01.05. = 61 Tage)
- **Was:** 60 × 24 h sind über einen DST-Wechsel hinweg nicht 60 Berliner Kalendertage; nachts nahe Mitternacht kippt der Endtag.
- **Fehlerpfad:** Refresh am 25.10.2026 kurz nach Mitternacht → Termine vom 24.12. fehlen einen Tag lang im Feed; am Folgetag sind sie wieder da. Zusätzlich ändert sich der Cache-Schlüssel dadurch zu einer Uhrzeit ≠ Mitternacht (zweiter Kaltstart am Tag, s. Befund „hoch").
- **Fix:** Endtag als Kalenderdatum bilden (Berliner Tag von `from` + 60 Tage), nicht als Millisekunden-Offset.

### [SCHWERE: niedrig] Feed ohne Cache-Control/ETag — jede Anfrage serialisiert und komprimiert 673 KB neu

- **Ort:** `apps/api/src/index.ts:157-164, 208-215`; Produktion antwortet nur mit `content-type`, `vary`, `strict-transport-security`
- **Status:** BESTÄTIGT (gemessen am Produktions-Feed, 883 Events: `JSON.stringify` 0,99 ms + gzip 3,3 ms = **4,4 ms CPU pro Anfrage**; Antwortzeit aus dem Netz 0,24–0,51 s)
- **Was:** Die Antwort ist zwischen Refreshes byte-identisch, wird aber weder mit `ETag`/`Last-Modified` (bedingte Anfragen) noch mit `Cache-Control` (Apache/Browser-Cache) versehen; der Fingerprint existiert bereits und wäre ein fertiger ETag.
- **Fehlerpfad:** 100 parallele Feed-Abrufe (Newsletter-Link, Crawler) belegen ~0,5 s CPU eines Kerns; ein absichtlicher Dauerabruf ist ohne Rate-Limit der günstigste Weg, die API zu belasten.
- **Fix:** `ETag: "<fingerprint>"` + `If-None-Match` → 304 und `Cache-Control: public, max-age=60` auf `/events.geojson`, `/categories.json`, `/version.json`; optional die serialisierte Antwort pro Cache-Eintrag vorhalten.

### [SCHWERE: niedrig] Kein Rate-Limit auf dem Admin-Token

- **Ort:** `apps/api/src/index.ts:229-233`
- **Status:** BESTÄTIGT
- **Was:** Der Bearer-Vergleich ist konstantzeitig (gut), aber unbegrenzt oft probierbar; die Sicherheit hängt allein an der Entropie von `ADMIN_TOKEN`, die nirgends geprüft wird (auch ein einstelliger Wert wird akzeptiert).
- **Fehlerpfad:** Schwaches Token gesetzt → Wörterbuch-Angriff auf `/admin/api/locations` ohne Gegenwehr; bei Erfolg lassen sich Pins verschieben, Kategorien ausblenden, Highlights setzen — sichtbar in allen Apps.
- **Fix:** Mindestlänge beim Start erzwingen (z. B. ≥ 24 Zeichen, sonst Warnung + Admin aus), einfaches In-Memory-Limit pro IP für 401-Antworten (z. B. 10/min).

### [SCHWERE: niedrig] Doku-Lücken: `/` fehlt, `meta.from`/`meta.to` beschreiben nicht das gesendete Fenster

- **Ort:** `apps/api/src/index.ts:93` (Route `/` ohne Doku-Eintrag; `test/openapi.test.ts:22-30` zementiert die Fünferliste), `apps/api/src/aggregate.ts:94-95` vs. `docs/openapi.yaml:413-420`
- **Status:** BESTÄTIGT
- **Was:** `GET /` ist eine öffentliche JSON-Route ohne OpenAPI-Eintrag — und der Test würde einen Eintrag als Fehler werten. `meta.from` ist der Erzeugungszeitpunkt (`2026-09-14T10:26:18.447Z`), die Doku nennt es „Beginn des Zeitfensters"; das tatsächlich an ChurchDesk gesendete Fenster beginnt am Berliner Kalendertag (`churchdesk.ts:67-68`).
- **Fehlerpfad:** Ein Leser der Doku erwartet, dass Termine ab 10:26 UTC enthalten sind; tatsächlich sind auch die von heute 08:00 Berlin dabei.
- **Fix:** `/` dokumentieren und die Testliste erweitern; `meta.from`/`to` als Berliner Tagesgrenzen beschreiben oder als solche ausgeben (neues Feld, nicht Änderung — Vertrag).

### [SCHWERE: niedrig] Interne Fehlermeldungen gehen ungefiltert an Clients

- **Ort:** `apps/api/src/index.ts:162, 204, 213` (`e?.message` im 500-Body), `index.ts:305-307` (jeder Fehler beim PUT wird 400 mit Originaltext)
- **Status:** BESTÄTIGT
- **Was:** Die Nachrichten stammen aus dem Inneren (`orgs.ts:32-34` verrät das ENV-Schema `CD_TOKEN_<orgId>` und `.env`; ein `EACCES: … './data/location-overrides.json.tmp'` beim PUT nennt den Dateipfad und wird als 400 statt 500 klassifiziert).
- **Fehlerpfad:** Container ohne Tokens → `/events.geojson` liefert `{"error":"[orgs] Keine ChurchDesk-Tokens konfiguriert. Setze CD_TOKEN_<orgId> in der Umgebung (.env)."}` an jeden Aufrufer.
- **Fix:** Nach außen feste Texte (`"Datenstand nicht verfügbar"`), Details nur ins Log; beim PUT Validierungsfehler (400) von Schreibfehlern (500) trennen.

### [SCHWERE: niedrig] Fehlender Org-Token ist in `/healthz` unsichtbar

- **Ort:** `apps/api/src/orgs.ts:18-29` (Orgs ohne Token werden übersprungen), `apps/api/src/index.ts:109-110` (`degraded` nur bei `orgsFailed > 0`)
- **Status:** BESTÄTIGT
- **Was:** Eine Org ohne gesetztes `CD_TOKEN_<id>` zählt weder als ok noch als failed; der Status bleibt `ok` mit `orgsOk: 13`.
- **Fehlerpfad:** Beim Redeploy geht eine ENV-Zeile verloren → Termine einer ganzen Gemeinde fehlen dauerhaft, `/healthz` meldet `ok`, nur eine Log-Zeile alle 20 min weist darauf hin.
- **Fix:** `orgsConfigured`/`orgsMissing` in `meta` aufnehmen (additiv) und bei `orgsMissing > 0` `degraded` melden.

### [SCHWERE: niedrig] `engines: ">=20"` erlaubt Node-Versionen ohne `AbortSignal.any`

- **Ort:** `package.json` (Root) `engines.node: ">=20"`, `apps/api/src/churchdesk.ts:75` (`AbortSignal.any`, ab Node 20.3)
- **Status:** PLAUSIBEL (Docker `node:22-alpine` und CI `node-version: 22` sind nicht betroffen; nur lokale Entwicklung mit altem Node 20)
- **Was:** Auf Node 20.0–20.2 wirft jeder Chunk-Fetch `TypeError: AbortSignal.any is not a function` — nur, wenn ein externes Signal übergeben wird, was heute kein Aufrufer tut; ohne Signal greift `AbortSignal.timeout` (ab 17.3).
- **Fix:** `engines.node: ">=20.3"` oder `>=22`.

### [SCHWERE: niedrig] Produktionsstand: drei Orte liegen auf einem falschen Fallback-Pin

- **Ort:** Datenlage, nicht Code — sichtbar über `/status.json` (heute 6 Fallback-Events)
- **Status:** BESTÄTIGT (Feed vom 14.09.2026)
- **Was:** `"St. Remigius-Kirche  Albersdorf"` (Doppel-Leerzeichen; die Tabelle kennt nur `"st. remigius-kirche"` und `"albersdorf | st. remigius kirche"`) liegt auf dem Tellingstedt-Pin, ~7 km von der Kirche; `"Dankeskirche Pahlen"` ebenfalls auf Tellingstedt (~6 km); `"Busenwurth, Alte Landstraße 4"` auf dem Meldorfer Dom.
- **Fix:** Über `/admin` als Orts-Korrektur eintragen (kein Code nötig). Der Status-Monitor tut hier genau, was er soll.

## Was gut ist

- **Zeitzone ist richtig gelöst.** `fmtDate` bildet den Berliner Kalendertag über `Intl` statt `toISOString()`, unabhängig von `TZ`; die Tests decken Winter, Sommer und beide DST-Übergänge ab (`churchdesk.test.ts`).
- **Serientermine sind unproblematisch.** ChurchDesk liefert je Instanz eine eigene ID (Skill-Doku: `series_instances[{id,…}]`); der Produktions-Feed zeigt z. B. 14 „Gottesdienst"-Instanzen der Org 2720 mit verschiedenen IDs. Die ID-Dedup verschluckt keine Serien.
- **Cache-Kern ist solide.** In-flight-Dedup, stale-while-revalidate, `refreshAfterChange` wartet einen laufenden Durchlauf ab, Eviction gegen Key-Leck, Totalausfall wirft statt leer zu liefern — jeweils mit Test.
- **Admin-Auth ist sauber.** Konstantzeit-Vergleich über SHA-256, Bearer-Prefix-Prüfung, 503 ohne konfiguriertes Token, 401 mit Test für fehlendes und falsches Token; keine Secrets im Repo (`.gitignore` deckt `.env*`, Signing-Dateien; Scan über getrackte Dateien leer), Tokens tauchen in keiner Fehlermeldung auf.
- **Escaping stimmt.** `statusPage` escaped alle dynamischen Strings (`esc`), die Admin-Seite behandelt Attribut- und Textkontext getrennt und korrekt (`"` in Attributen, `<` in Text); keine bestätigte HTML-Injection gefunden.
- **Eingabe-Validierung der Overrides ist streng:** 0/0, Bereichsgrenzen, leere Schlüssel, nicht-ganzzahlige Highlight-IDs werden abgelehnt; das Schreiben ist atomar (tmp + rename).
- **CORS** gibt fremden Origins keinen Header statt fälschlich den ersten erlaubten — mit Test.
- **Tests sind hart.** 79 Tests, alle prüfen konkrete Werte (`toEqual`, `toBe`), keine Statuscode-Listen, kein `toBeDefined` auf Zählern; Vertragstests für Array-Form von `/categories.json` und leere `features`-Liste; die OpenAPI-Datei ist per Test an Code-Enums gebunden. Einzige weiche Stellen sind Vorbedingungen (`toBeDefined()` in `kirchen-coords.test.ts`, `size > 0` in `openapi.test.ts`), jeweils direkt neben einer exakten Prüfung.
- **Fingerprint ist billig:** 0,72 ms pro Aufruf bei 883 Events — der Verdacht „teuer pro Poll" hat sich nicht bestätigt.
- **Konfiguration ist robust:** `envInt` fängt `NaN`-Fallen ab, Timer ist `unref`'t, Server startet nicht beim Import (Tests laufen ohne Netz).
