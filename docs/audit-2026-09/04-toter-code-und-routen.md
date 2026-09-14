# Toter Code, Routen, Redundanz

Audit vom 2026-09-14. Umfang: `apps/api/src`, `apps/app` (ohne `ios/`, `android/`,
`node_modules/`), `packages/shared/src`, `apps/web/index.html`, `docs/openapi.yaml`,
alle `package.json`. Nur gelesen, nichts geändert.

**Methode.** Jeder Export in `packages/shared/src`, `apps/app/lib` und `apps/api/src`
wurde per `grep -rnw` über Quellcode, Tests, Landingpage und OpenAPI-Datei gezählt —
Definitionsdatei ausgenommen, Treffer nach Produktion/Tests getrennt. Zusätzlich
lief `tsc --noEmit --noUnusedLocals --noUnusedParameters` über API und App (beide
Exit 0). Abhängigkeiten wurden gegen die tatsächlichen `import`/`require`-Quellen
und `npm ls` / `npm explain` geprüft. Routen gegen Aufrufer in App, Landingpage,
Admin-Seite, Tests, Docker, CI, README und die Git-Historie der ausgelieferten
Builds.

**Kurzfazit.** Die Codebasis ist auffallend sauber: kein einziger ungenutzter
Import, keine tote Funktion, kein auskommentierter Code. Was es gibt, sind
elf `export`-Schlüsselwörter ohne Abnehmer, eine überholte npm-Override, ein
Typ-Duplikat (`LatLng`) und — der interessanteste Teil — eine Kategorie-
Normalisierung, die in der API zwischen Admin-Speicherung und Feed-Filter
auseinanderläuft.

---

## Routen-Inventar

Quelle: `apps/api/src/index.ts`. Ausgelieferte Builds laut Git-Historie: ein
TestFlight-Build vom 2026-06-18 (Commit `87b4314`) mit
`API_BASE = https://kkkarte.godsapp.de`; die Releases 1.1.0–1.2.2 vom 1./2.8.
wurden am 2.8. zurückgezogen (`8115901`, „Tags und Releases entfernt"). Das
Repo hat heute **keine Tags**. Der TestFlight-Build kannte nur
`/events.geojson` und `/categories.json` — `/version.json` kam erst am 2.8.
(`a0c7f1f`). `?from=`/`?to=` hat die App **nie** gesendet (`git log -S` über
`apps/app`: 0 Treffer).

| Route | Methode | Aufrufer im Repo | in openapi.yaml? | Urteil |
|---|---|---|---|---|
| `/` | GET | keiner (nur `test/routes.test.ts:292`) | nein | Service-Banner ohne Abnehmer. Harmlos — aber undokumentiert. Entweder als Betriebsroute dokumentieren oder so lassen. Kein Löschkandidat: Gewinn null, und ein Uptime-Monitor könnte darauf zeigen. |
| `/healthz` | GET | keiner im Repo (kein `HEALTHCHECK` im Dockerfile, kein `healthcheck:` in compose, kein Monitor-Config). README: „für Uptime-Monitore" | ja | **NICHT LÖSCHEN.** Aufrufer sitzen außerhalb des Repos (Monitoring). Antwortet 503 bei `stale`/`starting` — das ist der Vertrag mit dem Monitor. |
| `/status.json` | GET | Admin-Seite: `pages.ts:381` (`loadFallback`) | ja | genutzt |
| `/status` | GET (HTML) | Link aus `/admin` (`pages.ts:143`), README | nein — bewusst, HTML | genutzt |
| `/events.geojson` | GET | `apps/app/lib/api.ts:8` | ja | Kernroute. Store-/TestFlight-Builds lesen sie. Vertrag. |
| `/version.json` | GET | `apps/app/lib/api.ts:18` (seit 2026-08-02) | ja | genutzt; Builds vor dem 2.8. kennen sie nicht — unkritisch, nur der Poll fehlt dort. |
| `/categories.json` | GET | `apps/app/lib/api.ts:31` | ja | Kernroute. Store-/TestFlight-Builds lesen sie. **Array-Vertrag** (Test `openapi.test.ts` sichert das). |
| `/admin` | GET (HTML) | Browser, README | nein — bewusst (Kommentar Z. 524–530) | genutzt |
| `/admin/api/locations` | GET | Admin-JS `pages.ts:163` (`login`) | nein | genutzt, Token-geschützt |
| `/admin/api/highlights` | GET | Admin-JS `pages.ts:338` (`loadHighlights`) | nein | genutzt, Token-geschützt |
| `/admin/api/locations` | PUT | Admin-JS `pages.ts:325` (`save`) | nein | genutzt, Token-geschützt |

Middleware (`compress`, `cors`, Admin-Guard auf `/admin/api/*`): alle wirksam.

**Redundanz zwischen Routen:** `/healthz` und `/status.json` speisen sich aus
derselben `statusData()`; `/healthz` ist die Teilmenge mit HTTP-Semantik (503).
Das ist keine echte Redundanz, sondern zwei Verträge (Monitor vs. Mensch/Admin).
Zusammenlegen würde einen davon brechen. Lassen.

**Routen ohne Aufrufer im Repo: 2** (`/` und `/healthz`). Beide sind
Betriebsrouten, keine App-Routen. Für `/healthz` gilt: nur nach Traffic-Prüfung
anfassen. Für `/` gilt: kein Aufwand, kein Gewinn.

**Offene Traffic-Frage (nicht aus dem Repo beantwortbar):** Der TestFlight-Build
vom Juni ruft `https://kkkarte.godsapp.de/events.geojson`. Die Traefik-Regel in
`docker-compose.yml` lautet nur `Host(\`api.moin-kark.de\`)`; `kkkarte.godsapp.de`
steht dort nur noch in `ALLOWED_ORIGINS`. Ob der alte Host noch auf die API
zeigt, entscheidet, ob dieser Build überhaupt noch Daten bekommt — das ist
unabhängig von jedem Aufräumen und sollte einmal in den Server-Logs geprüft
werden.

---

## Toter Code

**Ergebnis der Werkzeuge:** `tsc --noUnusedLocals --noUnusedParameters` meldet in
API und App **nichts**. Auskommentierter Code: **0 Treffer** (Suche nach
`// const|let|import|export|return|if (|function|<Komponente`). `TODO`/`FIXME`/
`@ts-ignore`: **0**. Es gibt also keine tote Funktion und keinen toten Zweig.

Was es gibt: Exporte, die **nur in ihrer eigenen Datei** benutzt werden. Das ist
kein toter Code — die Symbole arbeiten —, aber das `export` hat keinen Abnehmer.

| Export | Datei:Zeile | Treffer im Repo (außer Definition) | Urteil |
|---|---|---|---|
| `ORG_NAMES` | `packages/shared/src/kirchspiele.ts:93` | **0** | intern von `orgName()` genutzt. `export` streichen. |
| `Kirchspiel` (Typ) | `packages/shared/src/kirchspiele.ts:18` | 0 Imports (Wort-Treffer sind Kommentare/Strings) | intern für die Tabellen. `export` kann bleiben (Typ-Oberfläche), ist aber ohne Abnehmer. |
| `PARISH_COORDS` | `packages/shared/src/kirchen-coords.ts:13` | **0** | intern für `PARISH_NORM`. `export` streichen. |
| `ORG_COORDS` | `packages/shared/src/kirchen-coords.ts:63` | 1 (nur Test) | intern für `fallbackCoords`. Export nur für den Test — vertretbar. |
| `DITHMARSCHEN_CENTER` | `packages/shared/src/kirchen-coords.ts:85` | 3 (nur Tests) | wie oben. |
| `CoordSource` (Typ) | `packages/shared/src/types.ts:22` | 1 (Kommentar in `openapi.test.ts`) | intern in `EventProps`. Als Vertragstyp sinnvoll exportiert — lassen. |
| `API_BASE` | `apps/app/lib/api.ts:4` | **0** | intern. `export` streichen. |
| `CategoryInfo` (Typ) | `apps/app/lib/api.ts:24` | **0** | intern als Rückgabetyp. Siehe „Duplizierte Typen" — gehört nach `shared`. |
| `FilterContext` (Typ) | `apps/app/lib/filters.ts:161` | **0** | intern in `applyFilters`. `export` streichen. |
| `SyncResult` (Typ) | `apps/app/lib/savedSync.ts:51` | **0** | intern. `export` streichen. |
| `LocationStatus` (Typ) | `apps/app/lib/hooks/useLocation.ts:5` | **0** | intern. `export` streichen. |
| `categoryColors` | `apps/app/lib/theme.ts:42` | **0** | intern von `colorForCategory`. `export` streichen. |
| `CacheOptions` (Typ) | `apps/api/src/cache.ts:11` | **0** | intern im Konstruktor. `export` streichen. |
| `LocationOverrides` (Typ) | `apps/api/src/locations.ts:17` | **0** | intern. `export` streichen. |

**Bilanz:** 11 Exporte mit 0 Imports außerhalb der Datei (ORG_NAMES, Kirchspiel,
PARISH_COORDS, API_BASE, CategoryInfo, FilterContext, SyncResult, LocationStatus,
categoryColors, CacheOptions, LocationOverrides), 3 weitere nur von Tests genutzt
(ORG_COORDS, DITHMARSCHEN_CENTER, CoordSource). **Echt toter Code: 0.**

Alle übrigen 80+ Exporte haben Produktions-Abnehmer (vollständige Zählung im
Audit-Lauf; z. B. `colors` 152×, `spacing` 99×, `EventFeature` 31×,
`buildFeatureCollection` 3× prod + 33× Tests).

**Wirkungsloser Kommentar:** `apps/app/components/DraggableListSheet.tsx:94`
trägt `// eslint-disable-next-line react-hooks/exhaustive-deps` — im Repo gibt es
**kein ESLint** (keine `.eslintrc*`, kein `eslint` in irgendeiner `package.json`).
Der Kommentar tut nichts. Entweder ESLint einführen oder den Kommentar in einen
Klartext-Hinweis umwandeln (die Begründung steht ohnehin drei Zeilen darüber).

---

## Doppelte Logik

Sortiert nach Relevanz. „Unterschiedlich" heißt: die Implementierungen liefern
in Randfällen verschiedene Ergebnisse.

### 1. Kategorie-Normalisierung — zwei Regeln, die sich widersprechen (UNTERSCHIEDLICH)

`packages/shared/src/types.ts:99` definiert `normalizeKey`:
`trim() → Whitespace-Folgen auf ein Leerzeichen → toLowerCase()`. Der
Kommentar dort sagt ausdrücklich: „Bewusst an EINER Stelle … Driftet eine
Kopie, greifen gepflegte Korrekturen still nicht mehr."

Genau das ist bei den Kategorien passiert. Es gibt eine **zweite Regel**
`title.trim().toLowerCase()` — **ohne** Whitespace-Zusammenfassung — an fünf
Stellen:

| Ort | Ausdruck |
|---|---|
| `apps/api/src/aggregate.ts:41` (`isExcluded`) | `c.title.trim().toLowerCase()` |
| `apps/api/src/aggregate.ts:116` (`extractCategories`) | `c.title.trim().toLowerCase()` |
| `apps/app/lib/filters.ts:158` (`matchesCategory`) | `c.title.trim().toLowerCase() === category` |
| `apps/app/components/FilterSheet.tsx:141,143` | `c.trim().toLowerCase()` |
| `apps/app/lib/placeholders.ts:33` | `name.trim().toLowerCase()` |

Die Admin-Seite speichert dagegen über `normalizeKey`
(`apps/api/src/locations.ts:77`, `sanitize`) — **mit** Zusammenfassung. Und das
Client-JS der Admin-Seite hat eine dritte Kopie (`pages.ts:218`,
`norm = s => s.trim().replace(/\s+/g, " ").toLowerCase()`), die zufällig mit
`normalizeKey` übereinstimmt.

**Konkrete Folge:** Ein ChurchDesk-Kategorietitel mit doppeltem Leerzeichen,
Tab oder Zeilenumbruch im Inneren (etwa `„Interne  Veranstaltungen"`) wird in
`/admin` als `interne veranstaltungen` gespeichert, im Feed aber als
`interne  veranstaltungen` verglichen (`aggregate.ts:42` →
`isDynamicallyExcludedCategory(t)` → `overrides.categories.includes(t)`) —
**der Ausschluss greift nie**, und die Oberfläche meldet trotzdem „gespeichert".
Die statische Liste `EXCLUDED_CATEGORIES` ist nicht betroffen (nur
Einzel-Leerzeichen). Der Test `aggregate.test.ts:131` prüft Randleerzeichen
und Großschreibung, nicht innere Whitespace-Folgen.

**Empfehlung:** In `aggregate.ts` beide Stellen auf `normalizeKey` umstellen
(ist bereits importierbar, `@moinkark/shared` ist Dependency). Zuerst der
Test, der den Fall zeigt. Für `/categories.json` ist das vertragssicher: die
Form bleibt ein Array, der Anzeigetitel bleibt der erste gesehene; es würden
nur Varianten zusammengeführt, die sich in innerem Whitespace unterscheiden.
Die App-Seite (`filters.ts`, `FilterSheet.tsx`) kann nachziehen — Store-Builds
vergleichen dann weiter mit der alten Regel, was im Randfall zu einem
nicht-matchenden Chip führt, nicht zu einem Absturz.

### 2. „Berliner Kalendertag" — vier Implementierungen (funktional gleich)

| Ort | Implementierung |
|---|---|
| `apps/api/src/churchdesk.ts:50` `fmtDate` | `Intl.DateTimeFormat("sv-SE", {timeZone})` → `YYYY-MM-DD` |
| `apps/app/lib/hooks/useEvents.ts:9` `berlinDay` | `Intl.DateTimeFormat("en-CA", {timeZone, year, month, day})` → `YYYY-MM-DD` |
| `apps/app/lib/reminders.ts:96` `dayKey` | `Intl.DateTimeFormat("en-CA", {timeZone})` → `YYYY-MM-DD` |
| `apps/app/lib/filters.ts:69` `berlinParts` | `en-CA` + `formatToParts` → `{y, m, d, dow}` |

Alle vier lösen dasselbe Problem (Tageswechsel in Europe/Berlin statt UTC),
alle vier liefern dasselbe Ergebnis; drei davon in der App. `sv-SE` vs. `en-CA`
ist Geschmackssache — beide geben ISO-Datum. Unterschied ohne Wirkung.

**Empfehlung:** Ein `berlinDayKey(d: Date): string` in `packages/shared`
(neben `normalizeKey`), von API und App genutzt. `berlinParts` kann darauf
aufsetzen. Risikolos, reine Refaktorierung; Tests für `fmtDate` existieren
(`churchdesk.test.ts`) und wandern mit.

### 3. „Zeitlich nächster Termin am selben Pin" — Native vs. Web (UNTERSCHIEDLICH)

- `apps/app/components/EventMap.native.tsx:28–54` `nearestEventId(hits, features)`:
  sammelt alle Features auf derselben Koordinate, fällt auf die gemeldeten IDs
  zurück, und fängt den Leerfall ab (Kommentar: „Number(undefined) wäre NaN").
- `apps/app/components/EventMap.web.tsx:111–126`: derselbe Algorithmus inline in
  `onClick`, **ohne** den ID-Fallback und **mit** `onSelect(Number(f.properties?.id))`
  im Leerfall — genau der NaN-Pfad, den die native Variante bewusst vermeidet.

Praktisch tritt der Leerfall kaum auf (die gerenderte Koordinate stammt aus
denselben Daten), aber es sind zwei Kopien mit unterschiedlicher Härtung.

**Empfehlung:** Reine Funktion `pickNearestAtSpot(features, [lng, lat], fallbackIds)`
in `apps/app/lib/` (z. B. `filters.ts`, dort liegt schon `sortByStart`), von
beiden Karten aufgerufen, mit Unit-Test. Risikolos.

### 4. Cluster-/Pin-Stile — Web aus `mapStyle.ts`, Native inline (UNTERSCHIEDLICH)

`apps/app/lib/mapStyle.ts:141–180` definiert `clusterLayer`, `clusterCountLayer`,
`pointLayer` (Web). `EventMap.native.tsx:232–265` wiederholt dieselben Werte
in camelCase (`circleRadius: ["step", ["get","point_count"], 16, 5, 20, 15, 26, 40, 34]`,
Stroke 3, Opacity 0.94, Text 13, Pin-Stroke 2.5).

Abweichung: Pin-Radius im Web zoom-abhängig `6 → 9` (`mapStyle.ts:176`), nativ
fest `8` (`EventMap.native.tsx:261`). Die Objekte selbst lassen sich wegen der
unterschiedlichen Schlüssel-Konventionen (kebab vs. camel) nicht teilen — die
**Zahlen** schon.

**Empfehlung:** Konstanten (`CLUSTER_RADIUS_STEPS`, `CLUSTER_OPACITY`,
`PIN_STROKE` …) einmal in `mapStyle.ts`, beide Layer-Definitionen leiten ab.
Dabei entscheiden, ob der Pin-Radius nativ ebenfalls interpoliert werden soll.

### 5. Koordinaten-Validierung — Server und Admin-Client (bewusst doppelt)

`apps/api/src/locations.ts:40` `isLatLng` und `pages.ts:275` `coordsOrThrow`
(Browser-JS) prüfen dieselben Regeln (Zahl, Bereich, nicht 0/0). Der Kommentar
bei `coordsOrThrow` erklärt das: Client-Fehler sollen am Feld erklärbar sein,
der Server lehnt trotzdem ab. Da die Admin-Seite ein Template-String ohne
Build-Step ist, lässt sich das nicht teilen. **Lassen.**

### 6. Statische vs. dynamische Koordinaten-Lookups (bewusst parallel)

`packages/shared/src/kirchen-coords.ts:223–247` (`coordFixFor`, `coordFixForTitle`,
`coordOverrideForTitle`) und `apps/api/src/locations.ts:124–139` (`dynamicCoordFixFor`,
`dynamicCoordFixForTitle`, `dynamicCoordOverrideForTitle`) sind Spiegelbilder;
`geojson.ts:93–106` verkettet sie mit `??`. Der Admin-GET (`index.ts:244–247`)
baut die Vereinigung bereits nach (`force: TITLE_OVERRIDES.includes(t.prefix)`).

Semantischer Unterschied: statisch hängt „überstimmt ChurchDesk" an der
separaten Liste `TITLE_OVERRIDES`, dynamisch am `force`-Flag je Eintrag. Beides
konsistent; die Trennung ist dokumentiert.

**Empfehlung (niedrig):** Eine Lookup-Funktion über eine zusammengeführte
Tabelle (`[...overrides.titles, ...TITLE_COORD_FIXES.map(withForce)]`) würde
sechs Funktionen auf drei reduzieren. Kein Fehler, nur Volumen.

### 7. „Ist der Termin vorbei?" — drei Definitionen (UNTERSCHIEDLICH, harmlos)

- `apps/app/lib/filters.ts:168` `isPast`: Ende (oder Start + 2 h) liegt zurück.
- `apps/app/lib/savedSync.ts:84`: `new Date(before.startUtc) > Date.now()` — Start-basiert.
- `apps/app/app/index.tsx:165`: `new Date(startUtc) < nowMs` — Start-basiert (verwaiste Likes).

Für den Snapshot gibt es kein `endUtc`, daher Start. Folge: Ein laufender
gemerkter Termin (Start vorbei, Ende nicht), der aus dem Feed verschwindet,
wird **nicht** als „entfällt" gemeldet. Vertretbar, aber nirgends
niedergeschrieben. **Empfehlung:** `Snap` um `endUtc` erweitern und `isPast`
auch dort nutzen — oder den Unterschied im Kommentar festhalten.

### 8. Weitere, bewusst verschiedene Formatierungen (kein Handlungsbedarf)

- `filters.ts:208` `formatEventTime` („Fr, 19. Jun · 12:00 Uhr") vs.
  `reminders.ts:79` `formatWhen` („Fr, 19. Juni · 12:00 Uhr") — Karte vs.
  Mitteilung, absichtlich verschieden.
- `apps/app/lib/maps.ts:15, 26, 39`: dieselbe Google-Maps-URL dreimal.
  Trivial, eine Konstante genügt.
- Farbpalette dreifach: `theme.ts` (App), `pages.ts:27` (Status/Admin-CSS),
  `apps/web/index.html:33` (Landingpage). **Drift:** Sand-Hintergrund ist in der
  App `#FBF6EE` (`theme.ts:16`), auf Status/Admin und Landingpage `#FBF2E3`,
  im Splash `#FCF3E4` (`app.json:57`). Drei „Sand"-Werte. Wenn eine Palette
  gelten soll, gehört sie an eine Stelle; die Landingpage und die Admin-Seite
  sind aber ohne Build-Step, also bleibt es bei Abschreiben — dann wenigstens
  denselben Wert.

---

## Abhängigkeiten

### Ungenutzt: 0

**`apps/app/package.json`** (29 Dependencies): 23 werden direkt importiert.
Die 6 ohne direkten Import sind alle nötig:

| Paket | Warum nötig |
|---|---|
| `@expo/metro-runtime` | Peer-Dependency von `expo-router` (Web-Runtime); `npm ls` bestätigt die Kante. |
| `expo-linking` | Peer-Dependency von `expo-router`. |
| `expo-splash-screen` | Config-Plugin in `app.json:53`. |
| `react-dom` | Peer für Web (`react-native-web`, `@vis.gl/react-maplibre`). |
| `react-native-screens` | Peer-Dependency von `expo-router` (`^4.26.0`). |
| `react-native-web` | Web-Plattform. |

`react-native-worklets` wird über `babel.config.js` (`react-native-worklets/plugin`)
genutzt. DevDependencies (`@types/react`, `typescript`): genutzt.

**`apps/api/package.json`**: `@hono/node-server`, `hono`, `@moinkark/shared`
importiert; `tsx` in den Scripts; `yaml` in `test/openapi.test.ts`;
`@types/node` für `node:*`-Imports; `vitest`, `typescript` genutzt.

**`packages/shared/package.json`**: nur `vitest` — genutzt.

### Phantom-Imports: 1 (formal)

`apps/app/babel.config.js` referenziert `babel-preset-expo`, das in keiner
`package.json` steht. Es kommt als Dependency von `expo@56` mit
(`npm ls babel-preset-expo` → `expo@56.0.21 └── babel-preset-expo@56.0.20`). Das
ist der Expo-Standard und kein Fehler; wer es explizit will, trägt es als
devDependency ein. `path` (`metro.config.js`) und `node:*` (`scripts/`) sind
Node-Builtins.

### Überholte Overrides

Root `package.json` und `apps/app/package.json` tragen **denselben**
`overrides`-Block (`nanoid ^3.3.18`, `uuid ^11.1.1`, `maplibre-gl ^6.4.1`).

- `nanoid` und `uuid`: wirksam und sinnvoll — sie pinnen transitive Stände
  (`expo-router`/`postcss` → nanoid 3.3.18, `xcode` → uuid 11.1.1).
- `maplibre-gl ^6.4.1`: **überholt.** Die direkte Dependency in `apps/app` ist
  inzwischen `^6.9.0` (Commit `bc05ef4`). `npm explain maplibre-gl` zeigt:
  `overridden maplibre-gl@"^6.4.1" (was "^6.9.0")` — die Override weicht die
  eigene Vorgabe **auf**, statt sie zu schärfen. Schaden entsteht keiner
  (Lockfile hält 6.9.0, es gibt nur eine Kopie im Baum), aber sie ist
  irreführend.
- Der Block in `apps/app/package.json`: npm wertet `overrides` laut Doku nur im
  Root-Manifest aus; Workspace-Overrides sind wirkungslos. Und selbst wenn sie
  wirkten, sind sie eine Kopie des Root-Blocks. **Entfernen.**

---

## Auffällige Dateien

### `apps/app/lib/dithmarschen-boundary.ts` — 3 Zeilen, 74 KB

Eine Kommentarzeile plus zwei einzeilige Konstanten `DITHMARSCHEN_MASK` und
`DITHMARSCHEN_OUTLINE` (GeoJSON der Kreisgrenze als Fog-of-War-Maske und
Umriss). **Nicht überflüssig:** beide werden in `EventMap.native.tsx:16` und
`EventMap.web.tsx:23` importiert und als Layer gerendert (4 Treffer, 0 in Tests).

Auffällig ist anderes: Der Kommentar sagt „Auto-generiert aus OSM-Relation
27028", aber **es gibt kein Generator-Script im Repo**. Wer die Grenze je
aktualisieren muss, weiß nicht wie. Als TS-Modul liegen die 74 KB außerdem im
JS-Bundle. **Empfehlung:** Generator-Script (oder wenigstens den Overpass-Query
und die Vereinfachungsstufe) im Kommentar festhalten; optional als
`.json`-Asset auslagern. Kein Löschkandidat.

### `apps/app/components/EventMap.tsx` — 20 Zeilen neben `.native.tsx` / `.web.tsx`

**Sinnvolles Muster, kein Rest.** Die Datei ist der plattformneutrale
Typ-Vertrag (`EventMapProps`, 5 Treffer, beide Implementierungen importieren
ihn) und der Fallback für den Typecheck: `tsconfig.json` der App setzt keine
`moduleSuffixes`, also löst `tsc` den Import `../components/EventMap` in
`app/index.tsx:14` auf **diese** Datei auf, während Metro zur Laufzeit
`.native.tsx`/`.web.tsx` bevorzugt. Ohne sie schlüge `npm run typecheck` fehl.
Das `export { default } from "./EventMap.web"` sorgt dafür, dass `index.tsx`
gegen eine reale Komponente geprüft wird.

Zwei Kleinigkeiten am Rande: Die Fly-to-Logik verschiebt nativ das Zentrum um
`LAT_OFFSET = 0.03` nach Süden, damit die Position über dem Listen-Sheet
erscheint (`EventMap.native.tsx:89`); Web tut das nicht — obwohl auch Web in
der Schmalansicht (`index.tsx`, `isWide` hängt an der Breite, nicht an der
Plattform) das Sheet zeigt. Und `EventMap.native.tsx:173` typisiert den
Standort-Punkt als `EventFeatureCollection | any` — das `| any` hebelt den
Typ aus. Insgesamt 25 `any`-Stellen in der App, davon 23 in den beiden Karten
und `mapStyle.ts` (MapLibre-Expression-Typen), 1 in `EventSheet.tsx`.

### `apps/web/index.html`

- **Zeile 379** `<!-- Version wird beim Deploy aus package.json gesetzt (s. README) -->`
  widerspricht **Zeile 361–363**, wo ausdrücklich steht, dass es diese
  Ersetzung *nicht* gibt (README beschreibt reines `rsync`). Der Kommentar in
  Zeile 379 ist der Rest, den der Kommentar in 361–363 gerade korrigiert hat.
  **Streichen.**
- Die Store-Badges (Z. 218–230: „Bald im App Store" / „Bald bei Google Play",
  `aria-disabled`) sagen „demnächst". `CLAUDE.md` und `docs/AUFTRAG-GRUNDLAGEN.md:49`
  sagen „Die App ist im Store". `CHANGELOG.md:10` sagt „Noch nicht
  veröffentlicht. Die erste Store-Fassung wird 1.0.0". Die Git-Historie zeigt
  einen TestFlight-Build (18.6.) und zurückgezogene Releases (2.8.). **Drei
  Quellen, drei Aussagen** — das kann dieses Audit nicht auflösen, aber die
  Landingpage sollte den tatsächlichen Stand zeigen.

### `apps/app/package.json` — `overrides`-Block

Siehe Abhängigkeiten: Kopie des Root-Blocks, ohne Wirkung. Entfernen.

### `CHANGELOG.md` — Versionsstand

`[Unreleased]` mit „noch nicht veröffentlicht" steht gegen die im Repo
dokumentierte Store-Regel. Für dieses Audit relevant, weil daran hängt, welche
Routen als „von Geräten gelesen" gelten. Ich habe konservativ angenommen: Es
gibt mindestens den TestFlight-Build vom Juni auf Geräten.

---

## Duplizierte Typen

| Typ | Definition 1 | Definition 2 | Befund |
|---|---|---|---|
| `LatLng` | `packages/shared/src/kirchen-coords.ts:7` | `apps/app/lib/filters.ts:7` | **Identisch** (`{lat: number; lng: number}`). Die App importiert ausschließlich ihre eigene Kopie (`EventMap.tsx:4`, `useLocation.ts:3`); die API die aus `shared` (`locations.ts:8`). Die App-Kopie durch `import type { LatLng } from "@moinkark/shared"` ersetzen — reines Typ-Alias, risikolos. |
| Kategorie-Eintrag | `apps/app/lib/api.ts:24` `CategoryInfo` `{title; color; count}` | `apps/api/src/aggregate.ts:112` (inline Rückgabetyp von `extractCategories`) — und `docs/openapi.yaml:380` Schema `Category` | Dieselbe Form dreimal, keine gemeinsame Quelle. Nach `packages/shared/src/types.ts` als `FeedCategory`; API und App importieren; der Contract-Test kann darauf typisieren. |
| Titel-Korrektur | `packages/shared/src/kirchen-coords.ts:174` `Array<{prefix; coords}>` (unbenannt) | `apps/api/src/locations.ts:11` `TitleFix {prefix; coords; force?}` | Gleiche Basis, `force?` dazu. Ein `TitleCoordFix` in `shared` mit optionalem `force` würde beide bedienen und Fall 6 unter „Doppelte Logik" vorbereiten. |
| `StatusData` / `Health` | `apps/api/src/pages.ts:11` | `docs/openapi.yaml:439, 459` | Code vs. Spezifikation — gewollt, `openapi.test.ts` hält sie zusammen. Kein Duplikat im schädlichen Sinn. |

Keine weiteren Doppelungen: `EventFeature`, `EventFeatureCollection`, `EventProps`,
`EventCategory`, `EventImage` existieren nur in `shared` und werden überall von
dort importiert. `CdEvent` und `OrgConfig` sind API-intern und haben keine
Entsprechung in `shared` — richtig so (Rohformat vs. Vertrag).

**Am Rande — Vertragsfelder ohne Leser in der App:** `coordSource`, `orgId`,
`orgName`, `image.title`, `image.copyright` und `meta` werden von der App
**nicht** gelesen (grep über `apps/app`: 0 Treffer). Das ist **kein**
Löschkandidat — sie sind Teil des Vertrags (`openapi.yaml`), dienen QA/Status
und alte Builds könnten sie lesen. Nur zur Kenntnis.

---

## Aufräum-Vorschläge, nach Risiko sortiert

### Risikolos (reine Interna, kein Vertrag, kein Verhalten)

1. `export` streichen bei den 9 nur intern genutzten Werten/Typen:
   `ORG_NAMES`, `PARISH_COORDS`, `API_BASE`, `FilterContext`, `SyncResult`,
   `LocationStatus`, `categoryColors`, `CacheOptions`, `LocationOverrides`.
   (`Kirchspiel`, `CoordSource`, `ORG_COORDS`, `DITHMARSCHEN_CENTER` als
   Typ-/Test-Oberfläche lassen.)
2. `LatLng` in `apps/app/lib/filters.ts` durch den Import aus `@moinkark/shared`
   ersetzen.
3. `overrides`-Block aus `apps/app/package.json` entfernen; `maplibre-gl` aus
   dem Root-`overrides` entfernen (direkte Dependency `^6.9.0` ist strenger).
   Danach `npm install` und prüfen, dass das Lockfile weiterhin 6.9.0 hält.
4. `apps/web/index.html:379` — widersprüchlichen Kommentar streichen.
5. `DraggableListSheet.tsx:94` — wirkungslosen `eslint-disable`-Kommentar in
   Klartext wandeln (oder ESLint einführen; dann aber überall).
6. Google-Maps-URL in `maps.ts` in eine Konstante ziehen.

### Geringes Risiko (Refaktorierung mit Tests, kein Vertrag betroffen)

7. `pickNearestAtSpot` als reine Funktion in `apps/app/lib/` mit Unit-Test;
   beide Karten darauf umstellen. Nebeneffekt: der NaN-Pfad im Web verschwindet.
8. `berlinDayKey` nach `packages/shared`; `fmtDate`, `berlinDay`, `dayKey`
   darauf umstellen (Test `churchdesk.test.ts` wandert mit).
9. Cluster-/Pin-Konstanten einmal in `mapStyle.ts`, Native-Layer daraus ableiten;
   dabei Pin-Radius-Abweichung (interpoliert vs. fest 8) bewusst entscheiden.
10. `FeedCategory` und `TitleCoordFix` nach `shared`; `CategoryInfo` und den
    Inline-Typ in `aggregate.ts` ersetzen.
11. `dithmarschen-boundary.ts`: Herkunft/Generator dokumentieren.

### Mittleres Risiko (Verhalten ändert sich im Randfall — zuerst Test)

12. **Kategorie-Normalisierung in `aggregate.ts:41` und `:116` auf `normalizeKey`
    umstellen.** Vorher ein Test in `aggregate.test.ts`, der einen über `/admin`
    ausgeschlossenen Titel mit innerem Doppel-Leerzeichen zeigt (schlägt heute
    fehl). `/categories.json` bleibt ein Array; nur Whitespace-Varianten werden
    zusammengeführt. App-Seite (`filters.ts:158`, `FilterSheet.tsx:141/143`)
    kann im selben Zug nachziehen — Store-Builds vergleichen dann im Randfall
    mit der alten Regel, was höchstens einen inaktiven Chip ergibt, nie einen
    Absturz.
13. `Snap` in `savedSync.ts` um `endUtc` erweitern und `isPast` nutzen, damit
    „vorbei" überall dasselbe bedeutet.

### Traffic-Prüfung nötig (Betriebsrouten, Aufrufer außerhalb des Repos)

14. `/` — undokumentiert, ohne Aufrufer im Repo. Nicht löschen, ohne die
    Access-Logs auf Aufrufe geprüft zu haben (Uptime-Monitore zeigen gern auf
    die Wurzel). Alternative ohne Risiko: unter „Betrieb" in `openapi.yaml`
    dokumentieren und den Test `openapi.test.ts:23` („dokumentiert alle
    öffentlichen Routen") entsprechend erweitern.
15. `/healthz` — **NICHT LÖSCHEN.** Dokumentierter Monitor-Endpunkt mit
    503-Semantik; die Aufrufer sind per Definition nicht im Repo.
16. Host `kkkarte.godsapp.de` — der TestFlight-Build vom Juni ruft dort
    `/events.geojson` und `/categories.json`. Ob der Host noch auf die API
    zeigt, entscheiden Server-Logs und Traefik/KeyHelp-Konfiguration, nicht
    dieses Repo. Solange das offen ist, gelten für beide Routen die
    Vertragsregeln uneingeschränkt.

**Nicht anfassen:** `/events.geojson`, `/categories.json`, `/version.json`,
`/status.json`, `/status`, `/admin`, `/admin/api/*` — alle haben Aufrufer im
Repo, die ersten beiden zusätzlich auf Geräten.
