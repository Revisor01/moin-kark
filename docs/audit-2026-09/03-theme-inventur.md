# Theme-Inventur

Stand: 2026-09-14. Reine Bestandsaufnahme — kein Code geändert.

Gelesen (vollständig): `apps/app/lib/theme.ts`, `apps/app/lib/mapStyle.ts`,
`apps/app/lib/placeholders.ts`, `apps/app/lib/filters.ts`, alle elf
`apps/app/components/*.tsx`, `apps/app/app/_layout.tsx`, `apps/app/app/index.tsx`,
`apps/app/app.json`, `apps/web/index.html`, `apps/api/src/pages.ts`,
`packages/shared/src/types.ts`. Ergänzend per Grep über das gesamte Repo (ohne
`node_modules`/`dist`) nach Hex-/rgba-Werten, `fontSize`, `padding`/`margin`/`gap`,
`borderRadius`, `shadow`/`elevation`, Icon-Bibliotheken und Dark-Mode-Hinweisen.
Außerhalb der genannten Dateien gibt es **keine** weiteren Farbwerte im Repo.

Drei Oberflächen teilen sich das Design, aber **nicht** eine Quelle:

| Oberfläche | Datei | Token-Quelle |
|---|---|---|
| App (iOS/Android/Web) | `apps/app/**` | `lib/theme.ts` (TS-Konstanten) |
| Landingpage | `apps/web/index.html` | eigene CSS-`:root`-Variablen |
| API-Seiten `/status`, `/admin` | `apps/api/src/pages.ts` | eigene CSS-`:root`-Variablen in `BASE_CSS` |

Die drei Paletten sind händisch abgeschrieben und bereits auseinandergelaufen
(Details unter „Farben").

---

## Bestehende theme.ts — was drin ist

`apps/app/lib/theme.ts`, 125 Zeilen. Exportiert sechs Dinge:

### `colors` (Zeilen 5–39)

| Token | Wert | Kommentar in der Datei | Nutzung in der App (Anzahl `colors.x`) |
|---|---|---|---|
| `primary` | `#0E6E6E` | Nordsee-Teal | 23 |
| `primaryDark` | `#0A5252` | — | **0** (nur Web-CSS nutzt den Wert als `--primary-dark`) |
| `onPrimary` | `#FFFFFF` | — | 4 |
| `accent` | `#E4572E` | Koralle (Pins, CTAs) | 15 |
| `onAccent` | `#FFFFFF` | — | 7 |
| `background` | `#FBF6EE` | warmer Sand | 9 |
| `surface` | `#FFFFFF` | — | 10 |
| `surfaceMuted` | `#F3ECE0` | — | 5 |
| `foreground` | `#1C2B2B` | tiefes Tannengrün-Schwarz | 14 |
| `muted` | `#5C6B6B` | — | 16 |
| `faint` | `#8A9595` | — | 8 |
| `border` | `#E6DCCB` | — | 11 |
| `borderStrong` | `#D6C8B0` | — | 9 |
| `danger` | `#C0392B` | Status | **0** |
| `success` | `#2E7D5B` | Status | **0** (Wert taucht aber als `categoryColors["Sela-Yoga"]`, Web `--green` und Admin `--ok` auf) |
| `mapWater` | `#A9D6D6` | Karten-Style | 4 (davon 2 als Hintergrund der Kartenfläche in `index.tsx`) |
| `mapLand` | `#FBF6EE` | Karten-Style | 2 — **identisch mit `background`** |
| `mapGreen` | `#E4EBDA` | Karten-Style | 2 |
| `mapRoad` | `#EAD9C0` | Karten-Style | 2 |
| `mapLabel` | `#3A4A4A` | Karten-Style | 1 |

### `categoryColors` + `colorForCategory()` (Zeilen 41–66)

| Schlüssel | Wert | Anmerkung |
|---|---|---|
| `Gottesdienst` | `#0E6E6E` | = `colors.primary` (Literal wiederholt, nicht referenziert) |
| `Andacht` | `#3A8A8A` | nur hier |
| `Konzerte` | `#8E44AD` | nur hier (Violett) |
| `Sela-Yoga` | `#2E7D5B` | = `colors.success` (Literal wiederholt) |
| `Treffpunkt` | `#E4572E` | = `colors.accent` (Literal wiederholt) |
| `Senioren` | `#C97B2C` | nur hier — Admin-CSS nutzt denselben Wert als `--warn` |
| `Kinder / Jugendliche` | `#D4A017` | nur hier |
| `default` | `#5C6B6B` | = `colors.muted` (Literal wiederholt) |

`colorForCategory(title)` matcht erst exakt, dann per Substring
(`gottesdienst`, `andacht`, `konzert`/`musik`, `yoga`, `kind`/`jugend`, `senior`,
`treff`). Aufrufer: `EventCard`, `EventSheet`, `FilterSheet` (Chip-Farbe).

### `fonts` (Zeilen 68–79)

| Token | Wert | Nutzung |
|---|---|---|
| `display` | `BricolageGrotesque_600SemiBold` | 1 (`EventList.emptyTitle`) |
| `displayBold` | `BricolageGrotesque_700Bold` | 4 (h1, Sheet-Headings) |
| `serif` | `DMSans_400Regular` | 1 (`EventSheet.desc`) — **Name irreführend**, ist identisch mit `body` |
| `serifBold` | `BricolageGrotesque_600SemiBold` | 2 (Event-Titel Karte + Sheet) — **identisch mit `display`** |
| `body` | `DMSans_400Regular` | 15 |
| `bodyMedium` | `DMSans_500Medium` | 10 |
| `bodySemibold` | `DMSans_600SemiBold` | 16 |

Der Kommentar „Lesetitel (Event-Titel)" erklärt die `serif*`-Namen als Überbleibsel
einer früheren Serifen-Variante. Es gibt effektiv fünf Schriftschnitte, sieben Namen.

### `spacing` (Zeilen 81–88)

`xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32`

Nutzung: `md` 28×, `sm` 26×, `xl` 18×, `lg` 15×, `xs` 5×, `xxl` 2×. Dazu zwei
Rechnungen: `spacing.md + 44` (Herz-Offset im EventSheet) und `spacing.md + 2`
(Onboarding-CTA).

### `radius` (Zeilen 90–95)

`sm: 8, md: 12, lg: 18, pill: 999` — Nutzung: `lg` 13×, `md` 7×, `sm` 7×, `pill` 1×.

### `shadow` (Zeilen 97–112)

| Token | shadowColor | Opacity | Radius | Offset | elevation | Nutzung |
|---|---|---|---|---|---|---|
| `card` | `#1C2B2B` (= foreground) | 0.08 | 12 | 0/4 | 3 | 6× (EventCard, FilterBar-Buttons, Sheet-Close/Herz, Segment aktiv) |
| `sheet` | `#0A1F1F` | 0.28 | 28 | 0/−10 | 24 | 3× (FilterSheet, ProfileSheet, Onboarding-Card) |

### `DITHMARSCHEN` (Zeilen 114–125)

`center: [9.0, 54.13]`, `zoom: 9.4`, `bounds: [8.3, 53.8, 9.6, 54.5]`. Kartengeometrie —
**kein Theme-Wert**, liegt nur zufällig in dieser Datei.

---

## Farben

### A. Hartkodierte Farben in der App (außerhalb von theme.ts)

Grep-Treffer `#9293`, `#9402` (DraggableListSheet.tsx:100, GitHub-Issue-Nummern im
Kommentar) und `#8211`, `#8220` (EventSheet.tsx:61–75, HTML-Entities) sind **keine
Farben** und hier ausgelassen.

| Wert | Vorkommen Datei:Zeile | Zweck | Duplikat von? |
|---|---|---|---|
| `#FFFFFF` | mapStyle.ts:151, :165, :178 | Cluster-Ring, Cluster-Zahl, Pin-Ring | `colors.surface` / `onPrimary` |
| `#FFFFFF` | EventMap.native.tsx:241, :251, :263, :283 | dieselben drei Layer nativ + Standort-Ring | dito — **Layer-Definitionen aus mapStyle.ts nativ nochmal abgeschrieben** |
| `#FFFFFF` | EventMap.web.tsx:182 | Standort-Marker Rand | dito |
| `#0A1F1F` @ 0.55 | EventMap.native.tsx:211, EventMap.web.tsx:154 | „Fog of War" außerhalb Dithmarschens | = `shadow.sheet.shadowColor`; Wert 4× im Repo, kein Token |
| `#0A1F1F` | DraggableListSheet.tsx:223 | Schatten des Listen-Sheets | dito |
| `#2563EB` | EventMap.native.tsx:274 (Halo, 0.2), :280 (Punkt) | „Du bist hier"-Marker | nicht im Theme (Tailwind blue-600) |
| `#2563EB` + `rgba(37,99,235,0.20)` | EventMap.web.tsx:181, :183 | dito Web (Halo als box-shadow) | dito — Halo-Farbe als rgba wiederholt |
| `rgba(28,43,43,0.6)` | EventSheet.tsx:374, FilterSheet.tsx:166, ProfileSheet.tsx:219, OnboardingOverlay.tsx:63 | Backdrop hinter Sheets/Modal | `colors.foreground` @ 60 % — **4× identisch hartkodiert** |
| `rgba(255,255,255,0.85)` | EventSheet.tsx:397 | Grabber auf dem Hero-Bild | surface @ 85 % |
| `rgba(255,255,255,0.9)` | EventSheet.tsx:508, :522 | Schließen-/Herz-Button auf dem Hero | surface @ 90 % — 2× |
| `#EFE6D6` @ 0.6 | mapStyle.ts:65 | Gebäude-Füllung ab Zoom 14 | nicht im Theme; liegt zwischen `surfaceMuted` und `border` |
| `#F4E8D0` | app.json:36 | Android Adaptive-Icon-Hintergrund | **vierter Sandton**, s. unten |
| `#FCF3E4` | app.json:57 | Splash-Hintergrund | **dritter Sandton** |

Dazu Farben, die nur über Tokens laufen, aber deren **Layer-Definition doppelt
existiert**: `EventMap.native.tsx:232–265` wiederholt `clusterLayer`,
`clusterCountLayer` und `pointLayer` aus `mapStyle.ts:141–180` als Inline-Styles
(gleiche Farben, `circleOpacity 0.94`, `circleStrokeWidth 3 / 2.5`, Step-Radien
`16/20/26/34`). Abweichung: Pin-Radius Web `interpolate 6→9`, nativ fest `8`.

### B. Landingpage `apps/web/index.html`

| Wert | Zeile | Zweck | Verhältnis zu theme.ts |
|---|---|---|---|
| `#0E6E6E` | 9 (`theme-color`), 33 (`--primary`) | Primär | = `primary` |
| `#0A5252` | 33 (`--primary-dark`) | Link-Hover | = `primaryDark` |
| `#E4572E` | 33 (`--accent`) | CTA, Koralle | = `accent` |
| `#FBF2E3` | 34 (`--bg`) | Seitenhintergrund | **≠ `background` #FBF6EE** — Drift (etwas gelber/dunkler) |
| `#FFFFFF` | 34 (`--surface`) | Karten, Panels | = `surface` |
| `#F3ECE0` | 34 (`--surface-muted`) | Features-Verlauf | = `surfaceMuted` |
| `#1C2B2B` | 35 (`--fg`) | Text, Footer-Hintergrund | = `foreground` |
| `#5C6B6B` | 35 (`--muted`) | Fließtext gedämpft | = `muted` |
| `#8A9595` | 35 (`--faint`) | Hinweise | = `faint` |
| `#E6DCCB` | 36 (`--border`) | Rahmen | = `border` |
| `#2E7D5B` | 38 (`--green`) | Panel-Kante, Icon-Stroke | = `success` = Kategorie Sela-Yoga |
| `#E4EBDA` | 38 (`--green-soft`) | Features-Verlauf | = `mapGreen` |
| `#73A89A` | 38 (`--marsch`) | Verlaufsstart Features | **nur hier** |
| `rgba(228,87,46,.12)` | 77 (`.launch` bg) | Launch-Pille | accent @ 12 % |
| `#B8431F` | 77 (`.launch` Text) | dunkle Koralle | = Admin `--bad`; **kein App-Token** |
| `#fff` | 90, 91, 168 | Button-Text, Logo-Kachel | = surface (Kurzschreibweise) |
| `#c9481f` | 91 (`.btn-primary:hover`) | dunkle Koralle Hover | **Beinahe-Duplikat von `#B8431F`** — zwei „Accent-Dark"-Werte |
| `rgba(14,110,110,.10)` | 125 (`.ico` bg) | Icon-Kachel | primary @ 10 % |
| `rgba(46,125,91,.12)` | 129 | Icon-Kachel grün | green @ 12 % |
| `rgba(228,87,46,.11)` | 131 | Icon-Kachel Koralle | accent @ 11 % — **Beinahe-Duplikat von .12 (Z. 77)** |
| `#D9E2E2` | 164 (footer color) | Footer-Text | nur hier (heller Ton auf `--fg`) |
| `#8FD3D3` | 165, 177 | Footer-Links, Segensgruß | nur hier („Teal hell") |
| `#B6E4E4` | 166 | Footer-Link-Hover | nur hier |
| `#EDF2F2` | 170 (`.carrier`) | Trägerzeile | nur hier |
| `#9FB0B0` | 171, 174, 175 | Attribution, Version, Made-with | nur hier, 3× |
| `rgba(255,255,255,.13)` | 179 (`hr.f-div`) | Footer-Trennlinie | surface @ 13 % |
| `#849494` | 371 (Inline-Style Impressum-Zeile) | Footer-Kleingedrucktes | **Beinahe-Duplikat von `#8A9595` (`--faint`)** und `#9FB0B0` |

Die Footer-Palette (`#D9E2E2 #EDF2F2 #9FB0B0 #8FD3D3 #B6E4E4 #849494`) ist faktisch
eine **Dunkel-Variante** der Textfarben auf `foreground`-Grund — das einzige
Stück „Dark Theme" im Repo, aber ohne Token-Namen.

### C. API-Seiten `apps/api/src/pages.ts` (`BASE_CSS`, Zeilen 26–51)

| Wert | Zeile | Zweck | Verhältnis zu theme.ts |
|---|---|---|---|
| `#0E6E6E` | 27 (`--primary`) | Buttons, Links | = `primary` |
| `#E4572E` | 27 (`--accent`) | deklariert, **nirgends benutzt** | = `accent` |
| `#FBF2E3` | 27 (`--bg`) | Seitenhintergrund | = Web `--bg`, **≠ App `background`** |
| `#fff` | 27 (`--surface`), 39, 46, 49 | Karten, Pill-Text, Button-Text, Inputs | = `surface` |
| `#1C2B2B` | 27 (`--fg`) | Text | = `foreground` |
| `#5C6B6B` | 28 (`--muted`) | gedämpft, Status `starting` | = `muted` |
| `#E6DCCB` | 28 (`--border`) | Rahmen | = `border` |
| `#2E7D5B` | 28 (`--ok`) | Status ok | = `success` |
| `#C97B2C` | 28 (`--warn`) | Status degraded | = `categoryColors.Senioren` — Kategorie-Farbe als Status-Farbe wiederverwendet |
| `#B8431F` | 28 (`--bad`) | Status stale, Danger-Buttons | = Web `.launch`-Text; **≠ `colors.danger` #C0392B** |
| `rgba(0,0,0,.2)` | 148 (Minikarte box-shadow) | Popup-Schatten | einziger Schwarz-Schatten im Repo |

### D. Zusammenfassung der Duplikate und Drifts

**Gezählt:** 36 verschiedene echte Farbwerte im Repo (Hex, normalisiert, `#fff` =
`#FFFFFF`), dazu 8 rgba-Varianten — zusammen 44 Schreibweisen. In `theme.ts`
definiert: 21 davon. Hartkodierte Farbstellen außerhalb von `theme.ts`:
**64** (App 21, Web 34, API 9 — Zeilen mit Farbwert; Mehrfachnennungen pro Zeile
als eine gezählt, `#fff` mitgezählt, `theme-color`-Meta mitgezählt).

**Identische Werte, mehrfach als Literal:**

| Wert | Anzahl Literale | Wo |
|---|---|---|
| `#FFFFFF` / `#fff` | 19 | theme 3×, mapStyle 3×, EventMap.native 5×, EventMap.web 1×, web 3×, pages 4× |
| `#0E6E6E` | 5 | theme 2× (primary + Gottesdienst), web 2×, pages 1× |
| `#E4572E` | 4 | theme 2× (accent + Treffpunkt), web, pages |
| `#2E7D5B` | 4 | theme 2× (success + Sela-Yoga), web, pages |
| `#1C2B2B` | 4 + 4× als rgba | theme 2×, web, pages; Backdrop `rgba(28,43,43,0.6)` 4× |
| `#5C6B6B` | 4 | theme 2× (muted + default), web, pages |
| `#0A1F1F` | 4 | theme (shadow.sheet), DraggableListSheet, EventMap.native, EventMap.web |
| `#E6DCCB` | 3 | theme, web, pages |
| `#2563EB` | 3 (+1 rgba) | EventMap.native 2×, EventMap.web 1× + rgba |
| `#9FB0B0` | 3 | web Footer |
| `#C97B2C` | 2 | theme (Senioren), pages (--warn) |
| `#B8431F` | 2 | web (.launch), pages (--bad) |
| `#FBF2E3` | 2 | web, pages |
| `#8FD3D3` | 2 | web Footer |

**Beinahe-Duplikate (wahrscheinlich ein Token gemeint):**

| Gruppe | Werte | Wo |
|---|---|---|
| Sand-Hintergrund | `#FBF6EE` (App), `#FBF2E3` (Web + Admin), `#FCF3E4` (Splash), `#F4E8D0` (Android-Icon-BG) | 4 Varianten für „warmer Sand" |
| Dunkle Koralle | `#B8431F` (Web-Launch, Admin-bad), `#c9481f` (Web-Hover), `#C0392B` (`colors.danger`, unbenutzt) | 3 Rottöne, keiner als `accentDark` benannt |
| Gedämpfter Text auf dunkel | `#849494`, `#8A9595` (faint), `#9FB0B0` | Web-Footer vs. `--faint` |
| Accent-Tint | `rgba(228,87,46,.12)` vs `.11` | Web Z. 77 vs 131 |
| Weiß-Overlay | `rgba(255,255,255,0.85)` vs `0.9` | EventSheet Grabber vs. Buttons |

---

## Abstände

### App (React Native)

Numerische Werte in `padding*`, `margin*`, `gap` (ohne Positionierung `top/left: 0`
und ohne feste Bauteilmaße, die weiter unten stehen):

| Wert | Anzahl | Vorkommen |
|---|---|---|
| **2** | 7 | EventCard `gap: 2`, `marginTop: 2`; index `marginTop: 2` (3×); Onboarding `marginTop: 2`, `marginBottom: 2`; dazu `spacing.md + 2` |
| **4** | 7 | index `paddingHorizontal: 4` (Badge); EventSheet `paddingVertical: 4` (3× Badges); ProfileSheet `padding: 4`, `gap: 4` (Segment) — obwohl `spacing.xs = 4` existiert |
| 1 | 1 | EventCard Tag `paddingVertical: 1` |
| 3 | 1 | EventCard Highlight-Badge `paddingVertical: 3` |
| 5 | 1 | FilterBar Badge `paddingHorizontal: 5` |
| 6 | 1 | EventCard Tag `paddingHorizontal: 6` |
| 8 | 1 | EventCard Highlight-Badge `paddingHorizontal: 8` — obwohl `spacing.sm = 8` existiert |
| −2 / −4 | 4 | Badge-Offsets FilterBar (`top/right: -2`), index (`top/right: -4`); EventSheet `closeText marginTop: -2` |
| 44 | 1 | `spacing.md + 44` (Herz sitzt links neben dem 36-px-Schließen-Button + 8) |
| 20 | 2 | DraggableListSheet Snap-Zugabe (`+ 20` in `SNAP_MID_PX`/`SNAP_LARGE_PX`) |
| 24 | 2 | EventList `TAIL_SPACE = 24`; EventSheet `winH - insets.top - 24` |

Token-Nutzung zum Vergleich: `spacing.md` 28×, `sm` 26×, `xl` 18×, `lg` 15×, `xs` 5×,
`xxl` 2× → **94 Token-Stellen gegen ~28 Zahlen-Stellen**. Die App ist zu rund 75 %
tokenisiert.

**Abgeleitete Skala:** Die bestehende `4/8/12/16/24/32` deckt alles ab bis auf
**2** (7×, Mikro-Abstand zwischen Textzeilen) und die Badge-Innenmaße **1/3/5/6**.
Empfehlung: `xxs: 2` ergänzen; 1/3/5/6 bleiben Bauteil-Feinjustage in den
Badge-Komponenten (oder werden auf 2/4/8 gerundet — Sichtprüfung nötig).

**Feste Bauteilmaße** (keine Abstände, aber Kandidaten für `sizes`):

| Maß | Wert | Wo |
|---|---|---|
| Runder Icon-Button | 46 | FilterBar `BTN` |
| Profil-Button | 42 | index |
| Icon-Kreis / Griffzone | 44 | Onboarding `iconWrap`, DraggableListSheet `HANDLE_HEIGHT` + `handleArea.height` |
| Sheet-Buttons (Schließen/Herz) | 36 | EventSheet |
| Herz auf Karte | 28 | EventCard |
| Badge | 18 (index), 20 (FilterBar) | zwei Größen für dasselbe Bauteil |
| Grabber | 40×4 (3×: EventSheet, FilterSheet, ProfileSheet), 52×6 (DraggableListSheet) | zwei Grabber-Formen |
| Kartenhöhe | 104 | EventCard `pressArea`, EventList `CARD_HEIGHT`, DraggableListSheet `CARD_HEIGHT` — **3× als Zahl abgeschrieben**, mit Kommentar „muss passen" |
| Thumbnail | 96×104 | EventCard |
| Hero-Bild | 200 | EventSheet (+ `HERO_HEIGHT = 200` nochmal als Konstante) |
| Chip-Mindesthöhe | 38 | FilterSheet |
| Sheet-Maximalbreite | 520 | EventSheet, FilterSheet, ProfileSheet (3×) |
| Onboarding-Karte | 440 | OnboardingOverlay |
| Listen-Spalte breit | 460 | index `listPane` |
| Text-Maximalbreite | 280, 300, 130 | EventList empty, index error, EventCard tag |
| Logo / Vogel | 168×59, 14×14 | ProfileSheet |
| Standort-Punkt Web | 18 | EventMap.web |
| Breakpoint | 900 | index `WIDE_BREAKPOINT` |
| Akzent-Streifen | 4 | EventCard `accent.width` |
| Trennlinien | 1 | 6× `height: 1` / `borderWidth: 1`; `borderWidth: 2` 4× (aktive Karte, Badges-Rand) |

### Landingpage (CSS, px)

Häufigkeit in `padding`/`margin`/`gap`: 22px 5×, 16px 5×, 14px 5×, 15px 4×, 8px 4×,
24px 3×, 10px 3×, 9px 3×, dann je 1–2×: 3, 4, 7, 11, 12, 17, 18, 20, 26, 30, 32, 34,
38, 40, 52, 62, 64, 66, 72, 150, 300. **Keine Skala erkennbar** — 29 verschiedene
Werte, überwiegend „nach Auge". Kein Bezug zur App-Skala.

### API-Seiten (CSS, px)

10px 9×, 8px 4×, 6px 3×, 4px 3×, 18px 3×, 12px 3×, 9px 2×, sonst 3, 7, 14, 16, 20,
22, 24, 28. Ebenfalls frei gewählt; Betriebs-UI, geringe Priorität.

---

## Textgrößen

### App — `fontSize` (Häufigkeit und Verwendung)

| Größe | Anzahl | Verwendung | Rolle |
|---|---|---|---|
| 10 | 1 | index `profileBadgeText` | Badge-Zahl |
| 11 | 5 | EventCard `highlightBadgeText`, `tagText`; FilterBar `badgeText`; Profile `attr`, `copyright` | Badge / Kleingedrucktes |
| 12 | 11 | index `kicker`; EventCard `time`, `place`; EventSheet `highlightBadgeText`, `badgeText`, `badgeOutlineText`; FilterSheet `groupLabel`; Onboarding `kicker`; Profile `sectionLabel`, `segmentSmall`, `geistBlessing` | Label / Kicker / Meta |
| 12.5 | 1 | EventSheet `savedNoteText` | Hinweis (Ausreißer) |
| 13 | 7 | EventSheet `time`, `metaLabel`, `metaValue`; Profile `hint`, `carrier`, `appVersion`, `geistText` | Meta / Hinweis |
| 13.5 | 1 | Profile `webNoteText` | Hinweis (Ausreißer) |
| 14 | 6 | index `sub`; EventList `emptyText`; FilterSheet `reset`, `chipText`; Onboarding `stepBody`; Profile `empty` | Body klein / Chip |
| 15 | 6 | index `loadingText`, `errorText`, `retryText`; EventSheet `desc`, `mapButtonText`; Profile `segmentText` | Body / Button |
| 16 | 3 | FilterSheet `applyText`; Onboarding `stepTitle`, `ctaText` | Button groß / Untertitel |
| 17 | 1 | EventCard `title` | Kartentitel |
| 18 | 2 | EventList `emptyTitle`; EventCard `heartIcon` | Titel klein / Glyph |
| 19 | 1 | index `profileIcon` (♥) | Glyph |
| 20 | 2 | EventSheet `heartIcon`; Onboarding `icon` | Glyph |
| 22 | 1 | FilterSheet `heading` | Sheet-Überschrift |
| 24 | 2 | ProfileSheet `heading`; EventSheet `closeText` (×) | Sheet-Überschrift / Glyph |
| 26 | 2 | EventSheet `title`; Onboarding `heading` | Titel groß |
| 28 | 2 | index `h1`; ProfileSheet `close` (×) | H1 / Glyph |

**Befunde:**
- Drei Sheet-Überschriften, drei Größen: Filter 22, Profil 24, Onboarding 26.
- Zwei Schließen-Kreuze, zwei Größen: EventSheet 24, ProfileSheet 28.
- Halbe Größen `12.5` und `13.5` sind Einzelfälle neben 12/13/14.
- Herz-Glyph in vier Größen: 18 (Karte), 19 (Header), 20 (Sheet), 20 (Onboarding).

**Vorschlag Skala** (aus den Häufigkeiten): `xs 11 · sm 12 · md 13 · base 14 · lg 15 · xl 16 · title 17 · h3 18 · h2 22–24 · h1 26–28`. Konkrete Bereinigung: 12.5→12 oder 13, 13.5→13 oder 14, Sheet-Headings auf einen Wert.

### App — `lineHeight`

| lineHeight | fontSize | Wo | Verhältnis |
|---|---|---|---|
| 32 | 28 | index h1 | 1.14 |
| 30 | 26 / 28 | EventSheet title / Profile close | 1.15 / 1.07 |
| 26 | 24 | EventSheet closeText | 1.08 |
| 22 | 15 / 20 | EventSheet desc / heartIcon | 1.47 / 1.1 |
| 21 | 17 | EventCard title | 1.24 |
| 20 | 14 / 18 | Onboarding stepBody, Profile empty / EventCard heartIcon | 1.43 / 1.1 |
| 19 | 13.5 | Profile webNoteText | 1.41 |
| 17 | 12.5 | EventSheet savedNoteText | 1.36 |
| 16 | 11 | Profile attr | 1.45 |

Nur 14 von 55 Text-Styles setzen `lineHeight`. Fließtext liegt bei ~1.4–1.47,
Titel bei ~1.15–1.25 — zwei Verhältnisse, die als Token (`lineHeight.tight`,
`lineHeight.body`) taugen.

### App — `letterSpacing`, `fontWeight`, `textTransform`

- `letterSpacing: 1` (index kicker, Onboarding kicker), `0.5` (FilterSheet groupLabel, Profile sectionLabel), `0.3` (EventCard highlightBadgeText).
- `textTransform: "uppercase"` an denselben vier Kicker/Label-Stellen — das ist ein **„Eyebrow"-Textstil**, viermal abgeschrieben.
- `fontWeight`: keine (Gewicht kommt aus dem Schriftschnitt). `fontStyle: "italic"` einmal (Profile `geistBlessing`).

### Landingpage — `font-size`

14px 5×, 15px 4×, dann je 1×: 11, 12, 13.5, 14.5, 15.5, 16, 17 (body), 19, `1rem`,
`1.12rem`, `clamp(1.06rem,2.2vw,1.3rem)`, `clamp(1.5rem,3vw,2rem)`,
`clamp(1.6rem,3.4vw,2.2rem)` 2×, `clamp(2.4rem,6.2vw,4.2rem)`. Mischung aus px,
rem und clamp; halbe px-Werte (13.5/14.5/15.5) wie in der App.
`font-weight`: 700 10×, 500 4×, 800 3×, 400 2×, 600 1×. `letter-spacing: -.02em`
(Headings, Brand), `.02em` (.launch), `.03em` (store-badge small).
`line-height`: 1.65 (body), 1.12 (Headings), 1.15 (store-badge).

### API-Seiten

`font: 16px/1.55 system-ui`, h1 `1.5rem`, h2 `1.05rem`, KPI `1.4rem`, sonst 14px 6×,
13px 2×. `font-weight` 600/700.

---

## Schriften

### App

Geladen in `app/_layout.tsx:21–27` über `expo-font` + `@expo-google-fonts/*`:

| Familie | Schnitte geladen | Paket |
|---|---|---|
| Bricolage Grotesque | 600 SemiBold, 700 Bold | `@expo-google-fonts/bricolage-grotesque ^0.4.1` |
| DM Sans | 400 Regular, 500 Medium, 600 SemiBold | `@expo-google-fonts/dm-sans ^0.4.2` |

Bis die Schriften geladen sind, rendert `_layout.tsx:30` eine leere View in
`colors.background`.

Karten-Labels: `"Noto Sans Bold"` (mapStyle.ts:114, :162; EventMap.native.tsx:252) —
kommt als Glyph-PBF von OpenFreeMap, keine App-Schrift.

### Landingpage

Lokal aus `apps/web/fonts/` per `@font-face` (index.html:24–29), bewusst nicht von
Google (Datenschutz-Kommentar Z. 19–22):

| Familie | Schnitte | Abweichung zur App |
|---|---|---|
| Bricolage Grotesque | **400**, 600, **800** | App hat 600 + **700**; Web nutzt 800 für h1/Brand und 700 (nicht geladen → Browser-Fallback auf 800 oder synthetisch) für h2/h3/Buttons |
| DM Sans | 400, 500, **700** | App hat 400/500/**600**; Web nutzt 700 für `.btn`, `.launch`, `figcaption` |

Fallback-Stack: `"DM Sans", system-ui, -apple-system, "Segoe UI", sans-serif`.
`h1,h2,h3`: `"Bricolage Grotesque","DM Sans",sans-serif`.

### API-Seiten

Nur `system-ui,-apple-system,"Segoe UI",sans-serif` — keine Webfonts (Betriebs-UI,
ohne externe Assets, so kommentiert in pages.ts:1–3).

---

## Radien & Schatten

### Radien — App

Token: `radius.lg = 18` 13×, `md = 12` 7×, `sm = 8` 7×, `pill = 999` 1×.

Numerisch daneben:

| Wert | Wo | Zweck | Bemerkung |
|---|---|---|---|
| 2 | EventSheet:396, FilterSheet:187, ProfileSheet:240 | Grabber 40×4 | Halbe Höhe → „rund" |
| 3 | DraggableListSheet:248 | Grabber 52×6 | dito |
| 9 | index:508 (Badge 18), EventMap.web:180 (Punkt 18) | Kreis | halbe Größe |
| 10 | FilterBar:110 (Badge 20) | Kreis | halbe Größe |
| 18 | EventSheet:507, :521 (Buttons 36) | Kreis | halbe Größe — zufällig = `radius.lg` |
| 21 | index:493 (Profil-Button 42) | Kreis | halbe Größe |
| 22 | Onboarding:97 (iconWrap 44) | Kreis | halbe Größe |
| `BTN / 2` = 23 | FilterBar:94 | Kreis | einzige Stelle, die rechnet |
| 12 | index:553 (`retry`-Button) | Button | **= `radius.md`, als Zahl statt Token** |

Alle Kreis-Radien sind „Größe / 2" — mit `radius.pill` (999) wären sie alle
ersetzbar; nur `index:553` ist ein echter Token-Verstoß.

Web: 16px 3× (Cards/Panels), 999px 2× (Pills/Buttons), 11px 2×, 9px, 8px, 12px.
API-Seiten: 12px 3×, 8px 2×, 999px. Beide weichen von der App-Skala (8/12/18) ab
(16 statt 18, 11 statt 12).

### Schatten

| Stelle | shadowColor | Opacity | Radius | Offset | elevation | Token? |
|---|---|---|---|---|---|---|
| `shadow.card` (theme) | `#1C2B2B` | 0.08 | 12 | 0/4 | 3 | ja |
| `shadow.sheet` (theme) | `#0A1F1F` | 0.28 | 28 | 0/−10 | 24 | ja |
| DraggableListSheet:223–227 | `#0A1F1F` | 0.18 | 20 | 0/−6 | 16 | **nein — dritter Schatten, inline** |
| EventMap.web:183 (CSS) | `rgba(37,99,235,.20)` | — | `0 0 0 6px` | — | — | Halo, kein Schatten im Sinn des Themes |
| pages.ts:148 (CSS) | `rgba(0,0,0,.2)` | — | `0 8px 30px` | — | — | nein |

Landingpage: **keine** box-shadows (nur Rahmen).

---

## Icons

### Bibliothek

`@expo/vector-icons ^15.0.2` → **Ionicons**, ausschließlich in `FilterBar.tsx`:

| Name | Größe | Farbe | Zweck |
|---|---|---|---|
| `search` | 22 | `colors.primary` | Filter öffnen |
| `star` | 21 | `colors.accent` / `onAccent` (aktiv) | Tipps-Toggle |
| `navigate` | 22 | `colors.primary` | Zum Standort |

### Text-Glyphen als Icons (App)

| Glyph | Wo | Größe / Farbe |
|---|---|---|
| `♥` / `♡` | index:298 (Profil-Button), EventCard:80, EventSheet:279 | 19 accent / 18 faint→accent / 20 muted→accent |
| `♥` | OnboardingOverlay:13 (STEPS) | 20, accent |
| `★` | EventCard:35, EventSheet:222 („★ Tipp"-Badge) | 11 / 12, onAccent |
| `×` | EventSheet:289, ProfileSheet:60 (Schließen) | 24 foreground / 28 muted |
| `🔔` (Emoji) | OnboardingOverlay:18 | 20 — einziges Emoji in der App; Farbe `accent` wirkt auf Emoji nicht |

Das Herz ist also an vier Stellen mit drei Größen und zwei Inaktiv-Farben (faint,
muted) gesetzt — Kandidat für eine `Icon`-Komponente oder zumindest `iconSize`-Tokens.

### Landingpage

Inline-SVGs (keine Bibliothek), `stroke: currentColor` bzw. `var(--primary)`,
`stroke-width 1.9`, 22px in 42px-Kachel (`.ico`): Pin, Filter-Linien, Uhr,
Pin-Variante, Aktivitätslinie, Schloss; im Hero-Button ein 19px-Pin; Store-Badges
Apple/Play als `fill: currentColor`. Motive entsprechen grob Feather/Lucide-Stil,
sind aber von Hand gezeichnet — keine Entsprechung zu den Ionicons der App.

### API-Seiten

Emoji/Unicode: `📍` (Minikarte-Button), `✕` (Löschen/Schließen), `★` (Highlight),
`🎉` (Leerzustand).

### Kategorie-Icons

**Gibt es nicht.** Kategorien werden ausschließlich über Farbe unterschieden
(`colorForCategory`), nicht über Symbole. Es existiert keine Zuordnung
„Gottesdienst → Symbol".

---

## Kategorie- und Kirchspiel-Farben

### Kategorien

Genau **eine** Definition: `theme.ts:42–66` (`categoryColors` + `colorForCategory`).
Verwendet in `EventCard` (Akzentstreifen + Tag-Rand/-Text), `EventSheet` (Badge-BG),
`FilterSheet` (Chip aktiv). Web und API-Seiten haben keine Kategorie-Farben.

Bemerkenswert: ChurchDesk liefert pro Kategorie ein Feld `color: number`
(`packages/shared/src/types.ts:8`, Kommentar: „ChurchDesk-Farbindex (0..n) — wird
im UI auf eine Palette gemappt"). Es wird über `apps/api/src/geojson.ts:135` und
`aggregate.ts:112–119` bis in `/events.geojson` und `/categories.json`
durchgereicht — **die App ignoriert es vollständig** und matcht stattdessen auf den
Titel. Die Palette-Zuordnung, die der Kommentar verspricht, existiert nicht.

Vier der acht Kategorie-Werte sind Kopien von `colors`-Werten (siehe oben), als
Literal statt als Referenz — ändert jemand `colors.primary`, bleibt Gottesdienst
auf dem alten Teal.

### Kirchspiele

**Keine Kirchspiel-Farben** im Repo. `KIRCHSPIELE` in `packages/shared` ist eine
reine Namensliste; der Kirchspiel-Badge im EventSheet (`badgeOutline`) nutzt
`borderStrong`/`muted`, der FilterSheet-Chip die Standard-Aktivfarbe `primary`.

### Orts-Platzhalterbilder

`lib/placeholders.ts` ordnet Gemeinden Bilder zu (büsum, meldorf, wesselburen,
hennstedt; neutral: deich, kohl). Das ist Asset-Zuordnung, keine Farbe — gehört
nicht ins Theme, könnte aber als „Brand-Assets" neben dem Theme liegen.

---

## Dark Mode

**Es gibt keinen.**

- `app.json:10` `"userInterfaceStyle": "light"` — die App erzwingt Hell; das System-
  Dark-Mode wird gar nicht erst durchgereicht.
- `_layout.tsx:37` `<StatusBar style="dark" />` — dunkle Statusbar-Icons, fest.
- Kein `useColorScheme`, kein `Appearance`, kein `prefers-color-scheme` in App,
  Web oder API-Seiten (Grep über das Repo). Einzige Media-Query im Web:
  `prefers-reduced-motion`.
- `app.json:14–18` liefert `icon-ios-light/dark/tinted.png` — das ist nur das
  Home-Screen-Icon (iOS 18), kein App-Theme.

**Vorbereitung:** Die `colors`-Tokens sind semantisch benannt (`background`,
`surface`, `foreground`, `muted`, `border`) — das ist die richtige Grundlage.
Gegen einen späteren Dark Mode sprechen aktuell:

1. Direkte Hex-Literale außerhalb des Themes (Backdrop-rgba 4×, Weiß-Overlays,
   `#0A1F1F`, `#2563EB`), die nicht mitschalten würden.
2. `shadow.card.shadowColor` und `mapLand` sind Kopien von `foreground`/`background`
   statt Referenzen.
3. Kategorie-Farben (`#D4A017` Gelb, `#8E44AD` Violett) sind auf hellem Grund
   abgestimmt; auf dunklem Grund bräuchten sie eigene Varianten.
4. Der Kartenstil (`mapStyle.ts`) hat nur eine Hell-Palette; ein Dark Mode bräuchte
   einen zweiten Layer-Satz.
5. Der Web-Footer (`index.html:164–179`) ist faktisch ein Dark-Farbsatz
   (`#D9E2E2`, `#8FD3D3`, `#9FB0B0`, …), aber ohne Namen — eine gute Vorlage für
   `dark.foreground`, `dark.link`, `dark.muted`.

---

## Nicht-Theme-Werte (bleiben hartkodiert)

Diese Werte sind Technik, Geometrie oder Verhalten — sie gehören **nicht** in die
Theme-Datei, auch wenn sie in derselben Datei stehen oder wie Design aussehen:

| Wert | Wo | Warum nicht Theme |
|---|---|---|
| `DITHMARSCHEN.center/zoom/bounds` | theme.ts:115–125 | Kartengeometrie. Gehört nach `lib/map*.ts`, nicht ins Theme — aktuell falsch einsortiert |
| `isInDithmarschen`-Box 53.7/54.6/8.2/9.7 | filters.ts:58 | Geodaten |
| `LAT_OFFSET = 0.03`, `zoom: 11.5`, `duration: 700/450/500`, `exp + 0.5 / + 0.2` | EventMap.native/web | Kamera-Verhalten |
| `clusterMaxZoom: 13`, `clusterRadius: 48`, Step-Radien `16/20/26/34`, `minzoom 11/14`, Linienbreiten-Interpolationen | mapStyle.ts | MapLibre-Layer-Technik (Radien/Strichbreiten sind zwar visuell, aber pro Layer spezifisch — höchstens `strokeWidth` und Farben tokenisieren) |
| `TILES`, `GLYPHS`-URLs, `"Noto Sans Bold"` | mapStyle.ts:8–9, :114 | externe Tile-Quelle; Schrift kommt vom Tile-Server |
| `SNAP_MID_PX`, `SNAP_LARGE_PX`, `SNAP_FULL_FRACTION 0.92`, `SPRING {20,200,0.6}`, `velocity ±500`, `heights.small * 0.6` | DraggableListSheet | Sheet-Physik |
| `HERO_HEIGHT 200`, `HEAD_BASE 130`, `META_ROW 24`, `FOOTER_BASE 86`, `DESC_MIN_HEIGHT 132`, `winH * 0.88` | EventSheet:101–114 | Layout-Schätzung für Scroll-Entscheidung (müssen zu Styles passen — Kandidat für Ableitung aus Tokens, aber selbst keine Tokens) |
| `activeOffsetY 12`, `failOffsetY -12`, `translationY > 120`, `velocityY > 800`, `withTiming 180/150` | EventSheet | Gesten-Schwellen |
| `hitSlop 8`, `activeOpacity 0.7/0.8/0.85/0.9` | mehrere | Interaktion (vier verschiedene `activeOpacity`-Werte — vereinheitlichen ja, aber als Interaktions-, nicht Farbkonstante) |
| `WIDE_BREAKPOINT 900`, `listPane.maxWidth 460`, `maxWidth 520` (Sheets), `440` (Onboarding) | index, Sheets | Layout-Breakpoints — sinnvoll als `layout.*`-Konstanten, aber getrennt vom Farb-/Typo-Theme |
| `CARD_HEIGHT 104`, `thumb 96×104`, `initialNumToRender 12`, `windowSize 11`, `getItemLayout` | EventCard/EventList/DraggableListSheet | Listen-Performance; die Höhe ist zwar 3× abgeschrieben, gehört aber als **eine** Konstante zur EventCard, nicht ins Theme |
| `zIndex 2/6/10/1000` | mehrere | Stapelreihenfolge |
| `0.28` / `184 / mapAreaHeight` | index:210 | Sichtbereichs-Berechnung |
| `--maxw: 1080px`, `clamp(150px,21vw,300px)`, `object-position: center 62%/70%` | index.html | Seitenlayout / Bildausschnitte |
| `imageWidth: 220` | app.json:58 | Splash-Bildbreite |
| `ONBOARDING_KEY`, `kkd:reminderFormatV2` | index.tsx | Storage-Schlüssel |
| Alle `require("../assets/*.png|jpg")` | placeholders.ts, ProfileSheet | Assets — allenfalls ein `assets`-Index, kein Theme |

Grenzfälle (beides vertretbar):

- `#2563EB` Standort-Blau: ist eine Markenfarbe der Karte („Du bist hier") — **ins
  Theme** als `colors.location`, weil sie auf zwei Plattformen dreimal steht.
- `#0A1F1F @ 0.55` Fog of War: **ins Theme** als `colors.mapFog` + Opacity, aus
  demselben Grund.
- `#EFE6D6` Gebäude: **ins Theme** als `mapBuilding`, weil alle anderen Kartenfarben
  dort liegen.
- Splash `#FCF3E4` und Android-Icon-BG `#F4E8D0`: app.json kann keine TS-Tokens
  lesen. Entweder auf `#FBF6EE` (= `background`) angleichen und im Theme als
  Kommentar „muss mit app.json übereinstimmen" vermerken, oder bewusst als
  Asset-Farben stehen lassen.

---

## Reduktion

Ziel dieses Abschnitts: nicht „alles an einen Ort", sondern **weniger**. Jede
Tabelle mappt jeden gefundenen Altwert auf genau einen neuen Token und nennt, ob
die Umstellung sichtbar wäre. Kontrastangaben sind WCAG-Verhältnisse (AA für
Fließtext: ≥ 4,5:1; für große/fette Schrift ≥ 3:1), aus den Hex-Werten gerechnet.

### 1. Farben: 17 Werte statt 36 Hex + 8 rgba

Die 36 Hex-Werte zerfallen nach Farbton in fünf Familien plus Einzelgänger:

| Familie | Altwerte | Erkenntnis |
|---|---|---|
| Teal (H≈180, gesättigt) | `#0A5252 #0E6E6E #3A8A8A #A9D6D6 #8FD3D3 #B6E4E4` | eine Marke, sechs Helligkeiten — zwei reichen (primär + hell) |
| Tinte (H≈180, entsättigt) | `#0A1F1F #1C2B2B #3A4A4A #5C6B6B #8A9595 #849494 #9FB0B0 #D9E2E2 #EDF2F2` | neun Grautöne — drei reichen (Text / gedämpft / schwach), der Rest ist Weiß-mit-Alpha auf Dunkel |
| Sand (H≈37–40) | `#FBF6EE #FBF2E3 #FCF3E4 #F4E8D0 #F3ECE0 #EFE6D6 #EAD9C0 #E6DCCB #D6C8B0` | neun Sandtöne — drei reichen (Hintergrund / Fläche gedämpft / Linie) |
| Koralle/Rot (H≈6–15) | `#E4572E #C9481F #B8431F #C0392B` | eine Akzentfarbe plus eine Text-taugliche dunkle Variante |
| Grün | `#2E7D5B #73A89A #E4EBDA` | Status-Grün + Karten-Grün; Marsch-Ton ist ableitbar |
| Einzelgänger | `#C97B2C #D4A017 #8E44AD #2563EB #FFFFFF` | Amber, Gold, Violett, Blau, Weiß |

**Neues Minimal-Set (17 Werte, 18 Namen — `onColor` teilt sich den Wert mit `surface`):**

| Token | Wert | Rolle |
|---|---|---|
| `ink` | `#1C2B2B` | Text, Schatten, Backdrop, Fog, Kartenlabels |
| `muted` | `#5C6B6B` | Sekundärtext (5,1:1 auf Sand — AA ok) |
| `faint` | `#8A9595` | Tertiärtext, Grabber (**2,9:1 auf Sand — fällt schon heute durch AA**; s. Hinweis unten) |
| `background` | `#FBF6EE` | Seiten-/Kartenland |
| `surface` | `#FFFFFF` | Karten, Sheets, Ringe |
| `onColor` | `#FFFFFF` | Text auf Primär/Akzent (eigener Name wegen Dark Mode) |
| `surfaceMuted` | `#F3ECE0` | Chips, Segmente, Gebäude |
| `border` | `#E6DCCB` | alle Linien und Rahmen, Straßen, Grenzen |
| `primary` | `#0E6E6E` | Marke, Cluster, Buttons, Links |
| `primarySoft` | `#A9D6D6` | Wasser, Links auf Dunkel |
| `accent` | `#E4572E` | Pins, CTAs, Tipp-Badges (**als Text auf Sand nur 3,4:1 → nur für Flächen/Icons, nie für Fließtext**) |
| `accentDark` | `#B8431F` | Akzent als Text (5,0:1), Hover, Danger |
| `success` | `#2E7D5B` | Status ok, Kategorie Yoga, Web-Grün |
| `warning` | `#C97B2C` | Status degraded, Kategorie Senioren |
| `location` | `#2563EB` | „Du bist hier" (muss sich von Cluster-Teal und Pin-Koralle unterscheiden — bleibt) |
| `mapGreen` | `#E4EBDA` | Grünflächen (kein UI-Gegenstück, bleibt) |
| `catConcert` | `#8E44AD` | Kategorie Konzerte |
| `catKids` | `#D4A017` | Kategorie Kinder/Jugend |

Alpha-Regeln statt weiterer Farben: `backdrop = ink @ 60 %`, `overlay = onColor @ 90 %`,
`tint = <Farbe> @ 12 %`, `onDark = onColor @ 95 / 85 / 60 / 50 %`, Schatten =
`ink @ 8 / 18 / 28 %`.

**Mapping aller Altwerte:**

| Altwert | Vorkommen | Neuer Token | Sichtbare Abweichung |
|---|---|---|---|
| `#1C2B2B` | 4 | `ink` | keine |
| `rgba(28,43,43,0.6)` | 4 | `ink @ 60 %` | keine |
| `#0A1F1F` (Schatten 3×, Fog 2×) | 4 Stellen (theme, DraggableListSheet, EventMap ×2) | `ink` | Schatten: nicht wahrnehmbar. Fog @ 55 %: L 8 → L 14, außerhalb Dithmarschens minimal heller — falls störend Alpha auf 0,6 |
| `#3A4A4A` (Kartenlabels) | 1 | `ink` | Ortsnamen dunkler (L 26 → 14); Halo bleibt — lesbarer, nicht schlechter |
| `#5C6B6B` | 4 | `muted` | keine |
| `#8A9595` | 2 | `faint` | keine |
| `#849494` (Web Impressum-Zeile auf Dunkel) | 1 | `onColor @ 50 %` | ≈ `#8E9595`, nicht wahrnehmbar |
| `#9FB0B0` (Web Footer Attribution/Version) | 3 | `onColor @ 60 %` | ≈ `#A4ACAC`, nicht wahrnehmbar (Kontrast 6,5:1 → 6,8:1) |
| `#D9E2E2` (Web Footer-Text) | 1 | `onColor @ 85 %` | ≈ `#DDE1E1`, nicht wahrnehmbar |
| `#EDF2F2` (Web Trägerzeile) | 1 | `onColor @ 95 %` | ≈ `#F1F4F4`, nicht wahrnehmbar |
| `rgba(255,255,255,.13)` (Web hr) | 1 | `onColor @ 12 %` | keine |
| `#FBF6EE` | 2 | `background` | keine |
| `#FBF2E3` (Web `--bg`, Admin `--bg`) | 2 | `background` | L 94 → 96, Web/Admin werden minimal heller — nicht wahrnehmbar, stellt Gleichheit mit der App her |
| `#FCF3E4` (Splash) | 1 | `background` | L 94 → 96, nicht wahrnehmbar |
| `#F4E8D0` (Android-Icon-BG) | 1 | `background` | **L 88 → 96, sichtbar**: Icon-Hintergrund wird deutlich heller; Vordergrund-Grafik wurde gegen den dunkleren Ton gebaut → Sichtprüfung oder bewusst als Asset-Farbe behalten |
| `#F3ECE0` | 2 | `surfaceMuted` | keine |
| `#EFE6D6` (Gebäude) | 1 | `surfaceMuted` | L 89 → 92 @ 60 % — nicht wahrnehmbar |
| `#E6DCCB` | 3 | `border` | keine |
| `#EAD9C0` (Straßen) | 1 | `border` | Straßen etwas weniger orange (Sättigung 50 → 35 %); auf Sand-Land weiter sichtbar. Sichtprüfung auf Zoom 12–14 |
| `#D6C8B0` (`borderStrong`: Sheet-Rahmen, Icon-Button-Rahmen, Kirchspiel-Badge, Kartengrenze) | 9 Stellen | `border` | Rahmen werden heller (L 76 → 85). Auf weißem Sheet subtil sichtbar, kein Funktionsverlust |
| `#D6C8B0` (`borderStrong` als Grabber 3×) | in den 9 enthalten | `faint` | **sichtbar**: Griff wird grau statt beige (wie iOS-Standard). Entscheidung nötig — Alternative: `borderStrong` als 18. Wert behalten |
| `#0E6E6E` | 5 | `primary` | keine |
| `#0A5252` (`primaryDark`, nur Web-Hover) | 2 | entfällt → Web: `color-mix(in srgb, var(--primary) 80%, black)` ≈ `#0B5858` | Hover-Farbe 2–3 % anders — nicht wahrnehmbar. Nativ nie benutzt |
| `#3A8A8A` (Kategorie Andacht) | 1 | `primary` | **sichtbar**: Andacht- und Gottesdienst-Pins/-Chips werden identisch. Inhaltlich beides Gottesdienstformen — vertretbar; wer die Unterscheidung braucht, behält `#3A8A8A` als `catAndacht` (dann 18 Werte) |
| `#A9D6D6` (Wasser) | 1 | `primarySoft` | keine |
| `#8FD3D3` (Web Footer-Links, Segensgruß) | 2 | `primarySoft` | Links etwas heller/weniger gesättigt (L 69 → 75); Kontrast auf Dunkel 9,3:1 — besser als vorher |
| `#B6E4E4` (Web Link-Hover) | 1 | `onColor` | Hover wird weiß statt hellteal — sichtbar, aber üblich |
| `rgba(14,110,110,.10)` (Web Icon-Kachel) | 1 | `primary @ 12 %` | Alpha +2 % — nicht wahrnehmbar |
| `#E4572E` | 4 | `accent` | keine |
| `rgba(228,87,46,.12)` / `.11` | 2 | `accent @ 12 %` | keine |
| `#B8431F` (Web Launch-Text, Admin `--bad`) | 2 | `accentDark` | keine |
| `#c9481f` (Web Button-Hover) | 1 | `accentDark` | Hover 3 % dunkler — nicht wahrnehmbar |
| `#C0392B` (`colors.danger`, unbenutzt) | 1 | `accentDark` | keine (nie gerendert) |
| `#2E7D5B` | 4 | `success` | keine |
| `rgba(46,125,91,.12)` | 1 | `success @ 12 %` | keine |
| `#73A89A` (Web Marsch-Verlauf) | 1 | `color-mix(in srgb, var(--success) 55%, var(--surface))` ≈ `#8CB8A5` | **sichtbar, dekorativ**: Verlaufsstart heller und grüner. Sichtprüfung; notfalls als einzigen Web-Sonderwert behalten |
| `#E4EBDA` | 2 | `mapGreen` | keine |
| `#C97B2C` | 2 | `warning` | keine |
| `#D4A017` | 1 | `catKids` | keine (Gold vs. Amber `warning` liegen nur 14° auseinander — die Unterscheidung Kinder/Senioren ist heute schon schwach, aber vorhanden; nicht zusammenlegen) |
| `#8E44AD` | 1 | `catConcert` | keine |
| `#2563EB` + `rgba(37,99,235,.20)` | 3 + 1 | `location` / `location @ 20 %` | keine |
| `#FFFFFF` / `#fff` | 19 | `surface` (Flächen, Ringe) bzw. `onColor` (Text auf Farbe) | keine |
| `rgba(255,255,255,0.9)` | 2 | `onColor @ 90 %` | keine |
| `rgba(255,255,255,0.85)` (Hero-Grabber) | 1 | `onColor @ 90 %` | Alpha +5 % — nicht wahrnehmbar |
| `rgba(0,0,0,.2)` (Admin-Minikarte-Schatten) | 1 | `ink @ 20 %` | Schatten minimal kühler — nicht wahrnehmbar |

**Was bewusst getrennt bleibt (und warum):** `muted`/`faint` (echte Text-Hierarchie),
`background`/`surfaceMuted` (L 96 vs. 92 — das Segment-Control lebt von diesem
Unterschied), `accent`/`accentDark` (Kontrast: Koralle als Text braucht die dunkle
Variante), `location` (muss neben Teal-Clustern und Koralle-Pins erkennbar sein),
`warning`/`catKids` (zwei Kategorien), `mapGreen` (kein UI-Äquivalent).

**Nebenbefund Kontrast:** `faint` (`#8A9595`) erreicht auf Sand/Weiß nur 2,9:1 und
wird heute für lesbaren Text benutzt (Meta-Labels 13, Hinweise 13, Attribution 11,
Abschnitts-Labels 12). Das ist ein bestehendes AA-Problem, unabhängig von der
Reduktion. Entweder `faint` auf ≈ `#6E7C7C` (4,5:1) abdunkeln oder für Text
konsequent `muted` nehmen und `faint` nur für Linien/Griffe.

### 2. Abstände: eine Skala `2 / 4 / 8 / 12 / 16 / 24 / 32 / 48 / 64`

Die App-Skala bleibt und bekommt `xxs: 2` (7× als Zahl vorhanden) sowie für die
Web-Sektionen `3xl: 48`, `4xl: 64`.

**App — Werte außerhalb der Skala (7 verschiedene):**

| Altwert | Vorkommen | Neuer Token | Sichtbare Abweichung |
|---|---|---|---|
| 2 (`gap`, `marginTop`, `marginBottom`) | 7 | `xxs` | keine |
| 1 (EventCard Tag `paddingVertical`) | 1 | `xxs` | +1 px, Tag 2 px höher — risikolos |
| 3 (EventCard Tipp-Badge `paddingVertical`) | 1 | `xs` | +1 px — risikolos |
| 5 (FilterBar Badge `paddingHorizontal`) | 1 | `xs` | −1 px — risikolos |
| 6 (EventCard Tag `paddingHorizontal`) | 1 | `sm` | +2 px je Seite, Tag 4 px breiter; `maxWidth 130` fängt lange Titel — risikolos |
| 6 (EventCard Herz `top`) | 1 | `sm` | Herz 2 px tiefer — risikolos |
| 8 (EventCard Tipp-Badge `paddingHorizontal`), 8 (Herz `right`) | 2 | `sm` | keine |
| 4 (Badges/Segment, obwohl `xs` existiert) | 7 | `xs` | keine |
| −2 / −4 (Badge-Offsets) | 4 | `-xxs` / `-xs` | keine |
| `spacing.md + 2` = 14 (Onboarding-CTA `paddingVertical`) | 1 | `md` (12, wie alle anderen Buttons) | **−2 px je Seite, Button 4 px niedriger** — sichtbar, aber angleichend |
| `spacing.md + 44` (Herz neben Schließen-Button) | 1 | `sizes.sheetButton + sm` (36 + 8 = 44) | keine |
| 20 (DraggableListSheet Snap-Zugabe) | 2 | `xl` (24) | **+4 px**: Listen-Sheet rastet 4 px höher — harmlos; oder als Physik-Konstante belassen |
| 24 (`TAIL_SPACE`, EventSheet-Höhenabzug) | 2 | `xl` | keine |

**Landingpage — 23 von 29 px-Werten außerhalb der Skala:**

| Altwert | Vorkommen | Neuer Token | Sichtbare Abweichung |
|---|---|---|---|
| 3 | 1 | `xxs` (2) | −1 px |
| 7 | 1 | `sm` (8) | +1 px |
| 9 | 3 | `sm` (8) | −1 px |
| 10 | 3 | `sm` (8) | −2 px |
| 11 | 2 | `md` (12) | +1 px |
| 14 | 5 | `lg` (16) | +2 px |
| 15 | 4 | `lg` (16) | +1 px |
| 17 | 1 | `lg` (16) | −1 px |
| 18 | 2 | `lg` (16) | −2 px |
| 20 | 1 | `xl` (24) | **+4 px** (Orte-Raster `gap`) |
| 22 | 5 | `xl` (24) | +2 px |
| 26 | 2 | `xl` (24) | −2 px (Card-Innenabstand, Button-Seiten) |
| 30 | 2 | `xxl` (32) | +2 px |
| 34 | 2 | `xxl` (32) | −2 px |
| 38 | 1 | `xxl` (32) | **−6 px** (Abstand unter Features-Untertitel) |
| 40 | 2 | `3xl` (48) | **+8 px** (Hero oben, Footer unten) — sichtbar, Sichtprüfung |
| 52 | 2 | `3xl` (48) | −4 px (Info-Raster-Gap, Footer oben) |
| 62 / 64 / 66 | 3 | `4xl` (64) | ±2 px |
| 72 | 1 | `4xl` (64) | **−8 px** (Features unten) — sichtbar, harmlos |
| 150 / 300 (`clamp` im Hero) | 1 | bleibt Layout (Bildband-Reserve) | — |
| 4 / 8 / 12 / 16 / 24 / 32 | 15 | bereits auf Skala | keine |

**API-Seiten — 10 von 15 außerhalb:** 3→2, 6→8 (+2), 7→8, 9→8, 10→8 oder 12 (je
nach Stelle ±2), 14→16, 18→16 (−2), 20→24 (+4), 22→24, 28→32 (+4). Alles ≤ 4 px auf
einer Betriebsseite — risikolos, niedrige Priorität.

### 3. Textgrößen: sechs Stufen

| Stufe | Größe | Schrift | lineHeight | Verwendung |
|---|---|---|---|---|
| `display` | 28 | Bricolage 700 | 32 (1,14) | H1, Sheet-Titel des Events, Onboarding-Überschrift |
| `heading` | 24 | Bricolage 700 | 28 (1,17) | Sheet-Überschriften (Filter, Profil) |
| `title` | 17 | Bricolage 600 | 21 (1,24) | Karten-Titel, Leerzustand-Titel |
| `body` | 15 | DM Sans 400 / 600 (Buttons) | 22 (1,47) | Fließtext, Buttons, Chips, Segmente |
| `label` | 13 | DM Sans 500 / 600 | 18 (1,38) | Meta-Zeilen, Hinweise, Zeitzeile, Zählzeile |
| `caption` | 12 | DM Sans 500 / 600 | 16 (1,33) | Badges, Kicker/Abschnitts-Label (uppercase, letterSpacing 0,5), Attribution |

Glyph-Icons (♥ ♡ × ★) sind keine Textstufen → `sizes.icon = { sm: 18, md: 22 }`
(deckt sich mit den Ionicons-Größen 21/22).

**Mapping aller 17 gefundenen `fontSize`-Werte (55 Stellen):**

| Altwert | Vorkommen | Neue Stufe | Sichtbare Abweichung |
|---|---|---|---|
| 28 (index h1) | 1 | `display` | keine |
| 28 (Profile `close` ×) | 1 | `sizes.icon.md` (22) | **−6 px**, Kreuz wird so groß wie im EventSheet (dort 24 → 22, −2) — angleichend |
| 26 (EventSheet `title`) | 1 | `display` | **+2 px und 600 → 700**: Event-Titel etwas größer/fetter, `numberOfLines 2` kann früher kürzen — Sichtprüfung mit langen Titeln. Alternative: `display` = 26 und h1 auf 26 (−2) |
| 26 (Onboarding `heading`) | 1 | `display` | +2 px — risikolos |
| 24 (Profile `heading`) | 1 | `heading` | keine |
| 24 (EventSheet `closeText` ×) | 1 | `sizes.icon.md` (22) | −2 px |
| 22 (Filter `heading`) | 1 | `heading` | +2 px — angleichend |
| 20 (EventSheet ♥, Onboarding-Icon) | 2 | `sizes.icon.md` (22) | +2 px |
| 19 (index Profil-♥) | 1 | `sizes.icon.md` (22) | +3 px im 42-px-Kreis — passt |
| 18 (EventList `emptyTitle`) | 1 | `title` | −1 px |
| 18 (EventCard ♥) | 1 | `sizes.icon.sm` (18) | keine |
| 17 (EventCard `title`) | 1 | `title` | keine |
| 16 (Filter `applyText`, Onboarding `stepTitle`, `ctaText`) | 3 | `body` 600 | −1 px; `stepTitle` bleibt DM Sans (nicht Bricolage) |
| 15 | 6 | `body` | keine |
| 14 (`emptyText`, `chipText`, `stepBody`, Profile `empty`) | 4 | `body` | +1 px; Chips werden ~2 px breiter — risikolos |
| 14 (index `sub`, Filter `reset`) | 2 | `label` | −1 px (sekundäre Zeilen) |
| 13.5 (Profile `webNoteText`) | 1 | `label` | −0,5 px |
| 13 | 7 | `label` | keine |
| 12.5 (EventSheet `savedNoteText`) | 1 | `label` | +0,5 px |
| 12 (Kicker ×2, Abschnitts-Label ×2, Badges ×3, `segmentSmall`, `geistBlessing`) | 9 | `caption` | keine |
| 12 (EventCard `time`, `place`) | 2 | `caption` | keine — die Kartenhöhe 104 bleibt |
| 11 (Karten-Badge, Tag, FilterBar-Badge, `attr`, `copyright`) | 5 | `caption` | +1 px; Badges 1–2 px breiter — risikolos |
| 10 (Profil-Badge-Zahl) | 1 | `caption` | **+2 px** im 18-px-Badge; Badge auf 20 vereinheitlichen (s. Radien) — dann passt es |

`lineHeight`: heute 9 verschiedene Werte an 14 Stellen, die übrigen 41 Text-Styles
ohne. Neu: jede Stufe bringt ihren `lineHeight` mit — die neun Altwerte (32, 30,
26, 22, 21, 20, 19, 17, 16) gehen in die sechs Stufenwerte (32, 28, 21, 22, 18, 16)
auf; größte Abweichung: 30 → 32 beim EventSheet-Titel (+2 px je Zeile).

`letterSpacing`: 1 / 0,5 / 0,3 → ein Wert **0,5** für alle Uppercase-Labels
(Kicker −0,5: minimal enger; Tipp-Badge +0,2: nicht wahrnehmbar).

Web: 16 verschiedene `font-size`-Angaben → dieselbe Leiter in rem
(`display` clamp 2,4–4,2 rem bleibt als einzige Web-Sonderstufe für den Hero-H1;
`heading` = clamp(1,5rem, 3vw, 2rem) für alle h2 statt zwei verschiedene clamps;
1,12 rem/1 rem h3 → `title` 17 px; 19 px Brand → `title`; 15,5/15/14,5 → `body`
15; 14/13,5 → `label` 13; 12/11 → `caption` 12). `font-weight` 800 → 700 (dann
reicht ein Bricolage-Schnitt weniger; Δ: H1 minimal leichter).

### 4. Radien und Schatten

**Radien — vier Stufen `sm 8 / md 12 / lg 18 / pill 999`, alle 24 Altwerte gemappt:**

| Altwert | Vorkommen | Neuer Token | Sichtbare Abweichung |
|---|---|---|---|
| 2, 3 (Grabber-Balken) | 4 | `pill` | keine (Balken 4/6 px hoch → voll rund = 2/3) |
| 9, 10, 18, 21, 22, `BTN/2` (Kreise) | 8 | `pill` | keine |
| 12 (index `retry`) | 1 | `md` | keine |
| 8 / 12 / 18 (Token) | 27 | `sm` / `md` / `lg` | keine |
| Web 8 | 1 | `sm` | keine |
| Web 9 (Brand-Icon) | 1 | `sm` | −1 px |
| Web 11 (Store-Badge, Icon-Kachel) | 2 | `md` | +1 px |
| Web 12 (Footer-Logo) | 1 | `md` | keine |
| Web 16 (Cards, Panel, Orte) | 3 | `lg` | +2 px — nicht wahrnehmbar |
| Web/Admin 999 | 3 | `pill` | keine |
| Admin 8 / 12 | 5 | `sm` / `md` | keine |

Bauteilgrößen dazu vereinheitlichen: Badge 18 (index) → 20 (FilterBar-Wert); Grabber
40×4 (3×) und 52×6 (1×) → **ein** Grabber 40×4 (Listen-Sheet-Griff wird kleiner;
die 44-px-Griffzone bleibt, nur der sichtbare Balken schrumpft — sichtbar, harmlos).

**Schatten — zwei Stufen statt fünf Definitionen:**

| Altwert | Vorkommen | Neuer Token | Sichtbare Abweichung |
|---|---|---|---|
| `shadow.card` (ink 8 %, r 12, y 4, el 3) | 6 | `shadow.card` | keine |
| DraggableListSheet inline (`#0A1F1F` 18 %, r 20, y −6, el 16) | 1 | `shadow.sheet` (übernimmt genau diese Werte) | keine |
| `shadow.sheet` (`#0A1F1F` 28 %, r 28, y −10, el 24) | 3 | `shadow.sheet` (18 %, r 20, y −6) | Filter-/Profil-Sheet und Onboarding-Karte liegen auf einem 60 %-Backdrop — der Unterschied 28 → 18 % ist dort **praktisch unsichtbar** |
| Admin `0 8px 30px rgba(0,0,0,.2)` | 1 | `shadow.sheet` als CSS (`0 -6px 20px ink@18%`) → für das Popup `0 6px 20px` | Popup-Schatten etwas kompakter — Betriebsseite |
| Web `box-shadow 0 0 0 6px rgba(37,99,235,.2)` (Standort-Halo) | 1 | kein Schatten → `location @ 20 %` Ring (s. Farben) | keine |

### 5. Drei CSS-Welten, eine Wahrheit

**Befund:** Von den Landingpage-Variablen sind 11 von 14 Werte-Kopien aus
`theme.ts` (davon eine gedriftet: `--bg`), 3 eigene Erfindungen (`--marsch`,
`--green-soft` = `mapGreen`, `--maxw`), plus 14 nackte Hex-Werte im Footer und
in Hover-Zuständen. Die API-Seiten kopieren 8 Werte (eine gedriftet: `--bg`), erfinden
`--warn`/`--bad` (die es im Theme als `warning`/`danger` sinngemäß gibt, mit anderem
Rot) und deklarieren `--accent` ungenutzt. Abstände und Radien beider CSS-Welten
folgen keiner Skala (s. 2 und 4).

**Technische Lage:**

- `packages/shared` wird als **rohes TypeScript** konsumiert (`main: src/index.ts`),
  die API läuft über `tsx` und importiert bereits `@moinkark/shared`
  (`apps/api/src/index.ts`, `geojson.ts`, `locations.ts`). → Die API kann Tokens
  **direkt importieren**, ohne Build-Schritt.
- Die App importiert `@moinkark/shared` ebenfalls (Metro löst Workspaces auf).
- `apps/web` ist **kein Workspace**, wird per `rsync apps/web/` deployt
  (README Z. 295) und kann nichts importieren. Für sie muss eine CSS-Datei
  **erzeugt** werden. Dafür gibt es im Repo schon das Muster
  `npm run sync:map-worker` (`apps/app/scripts/sync-map-worker.mjs`): ein
  Node-Skript kopiert vor `web`/`build:web` eine Datei nach `public/`.

**Vorschlag:**

1. `packages/shared/src/theme.ts` wird die einzige Quelle (Farben, Abstände,
   Typo-Leiter, Radien, Schatten als reine Daten, ohne React-Native-Typen).
   `apps/app/lib/theme.ts` re-exportiert daraus und ergänzt nur RN-spezifisches
   (`fonts`-Schnittnamen, `shadow`-Objekte mit `elevation`, `text`-Stile).
2. `packages/shared/src/themeCss.ts` exportiert `themeCss(): string`, das aus den
   Tokens `:root{--ink:#1C2B2B;…;--space-md:12px;…;--radius-lg:18px;…}` rendert.
   `pages.ts` setzt `BASE_CSS = themeCss() + eigene Regeln` — **kein
   Build-Schritt, kein Deploy-Risiko**, Angleichung sofort wirksam.
3. Ein Skript `scripts/sync-theme-css.mjs` (Root, ~30 Zeilen) schreibt dieselbe
   Ausgabe nach `apps/web/theme.css`; `index.html` ersetzt seinen `:root`-Block
   durch `<link rel="stylesheet" href="theme.css">` (eine zusätzliche Anfrage,
   < 1 KB — oder das Skript inlined zwischen `<!-- theme:start/end -->`-Markern,
   dann null Anfragen). Aufruf im README-Deploy-Befehl vor dem `rsync` und als
   CI-Check (`git diff --exit-code apps/web/theme.css` nach dem Lauf — analog zur
   bestehenden Abhängigkeitsprüfung in `ci`).
4. Die Alpha-Varianten kommen als CSS-Custom-Properties mit RGB-Tripeln
   (`--ink-rgb: 28,43,43` → `rgba(var(--ink-rgb),.6)`), damit Web und Admin dieselbe
   Backdrop-/Tint-Regel nutzen wie die App.

**Kosten:** Schritt 1–2 etwa zwei Stunden (Datei verschieben, Re-Exports,
`themeCss()`, Test der CSS-Ausgabe gegen einen Snapshot). Schritt 3 eine Stunde
(Skript, README, CI-Zeile). Die eigentliche Angleichung von `index.html` und
`pages.ts` auf die Variablen (Abstände, Radien, Footer-Farben) je ein bis zwei
Stunden mit Sichtprüfung. Laufzeitkosten: null (API rendert einen String, Web lädt
eine winzige Datei). Risiko: gering — die Antwortformen der API bleiben unberührt;
betroffen sind nur `/status` und `/admin` (HTML) und die statische Landingpage.

---

## Empfehlung für die Token-Struktur

Struktur der einen Theme-Datei (`packages/shared/src/theme.ts`), auf Basis der
Reduktion oben — bewusst ohne Primitiv-Palette, weil 17 Werte keine zweite Ebene
brauchen:

```ts
export const colors = {
  ink: "#1C2B2B", muted: "#5C6B6B", faint: "#8A9595",
  background: "#FBF6EE", surface: "#FFFFFF", onColor: "#FFFFFF", surfaceMuted: "#F3ECE0",
  border: "#E6DCCB",
  primary: "#0E6E6E", primarySoft: "#A9D6D6",
  accent: "#E4572E", accentDark: "#B8431F",
  success: "#2E7D5B", warning: "#C97B2C",
  location: "#2563EB", mapGreen: "#E4EBDA",
  catConcert: "#8E44AD", catKids: "#D4A017",
} as const;

export const alpha = { backdrop: 0.6, overlay: 0.9, tint: 0.12, halo: 0.2,
  onDark: { strong: 0.95, text: 0.85, muted: 0.6, faint: 0.5, line: 0.12 } } as const;

export const categoryColors = {
  Gottesdienst: colors.primary, Andacht: colors.primary, Konzerte: colors.catConcert,
  "Sela-Yoga": colors.success, Treffpunkt: colors.accent, Senioren: colors.warning,
  "Kinder / Jugendliche": colors.catKids, default: colors.muted,
} as const;

export const mapColors = {
  land: colors.background, water: colors.primarySoft, green: colors.mapGreen,
  road: colors.border, building: colors.surfaceMuted, boundary: colors.border,
  label: colors.ink, fog: colors.ink, cluster: colors.primary, pin: colors.accent,
  ring: colors.surface, user: colors.location,
} as const;

export const spacing = { xxs: 2, xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32, "3xl": 48, "4xl": 64 } as const;
export const radius = { sm: 8, md: 12, lg: 18, pill: 999 } as const;

export const type = {   // Größe, Zeilenhöhe, Gewicht je Stufe — plattformneutral
  display: { size: 28, lineHeight: 32, family: "display", weight: 700 },
  heading: { size: 24, lineHeight: 28, family: "display", weight: 700 },
  title:   { size: 17, lineHeight: 21, family: "display", weight: 600 },
  body:    { size: 15, lineHeight: 22, family: "body",    weight: 400 },
  label:   { size: 13, lineHeight: 18, family: "body",    weight: 500 },
  caption: { size: 12, lineHeight: 16, family: "body",    weight: 500, letterSpacing: 0.5 },
} as const;

export const shadows = {   // als Daten; RN-Objekte mit elevation baut apps/app/lib/theme.ts daraus
  card:  { color: colors.ink, opacity: 0.08, radius: 12, y: 4,  elevation: 3 },
  sheet: { color: colors.ink, opacity: 0.18, radius: 20, y: -6, elevation: 16 },
} as const;

export const sizes = {
  icon: { sm: 18, md: 22 }, iconButton: 46, sheetButton: 36, badge: 20,
  grabber: { width: 40, height: 4 }, sheetMaxWidth: 520, heroHeight: 200, chipMinHeight: 38,
} as const;
```

`apps/app/lib/theme.ts` behält nur, was React Native braucht: die
Schriftschnitt-Namen (`fonts`), die `shadow`-Objekte mit `shadowOffset`/`elevation`,
fertige `text.*`-StyleSheet-Einträge aus `type`, und `interaction`/`layout`
(`pressOpacity 0.85`, `wideBreakpoint 900`, `cardHeight 104`). `DITHMARSCHEN` zieht
nach `lib/mapGeo.ts` um. `fonts.serif`/`serifBold`, `primaryDark`, `danger`,
`borderStrong`, `mapLand`, `mapRoad`, `mapLabel`, `onPrimary`/`onAccent` entfallen
(Mapping s. Reduktion).

Dark Mode später: ein zweites `colors`-Objekt gleicher Form (Vorlage: die
Web-Footer-Töne, die jetzt als `onColor @ alpha` beschrieben sind) plus
`userInterfaceStyle: "automatic"` in `app.json` und ein zweiter `mapColors`-Satz.
