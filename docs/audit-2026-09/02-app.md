# App-Audit

Stand: 14.09.2026. Geprüft wurde der App-Teil (`apps/app`: Expo 56 / React Native 0.85, Web + iOS + Android) vollständig: alle Dateien unter `app/`, `components/`, `lib/` sowie `package.json`, `app.json`, `metro.config.js`, `babel.config.js`, `CLAUDE.md`, `AGENTS.md`. Behauptungen über Bibliotheken wurden gegen die installierten Pakete (`expo-notifications` 56.0.25, Emitter-Quellcode iOS/Android) und gegen den API-Code (`apps/api/src/aggregate.ts`, `cache.ts`, `index.ts`) verifiziert. Es wurde kein Code geändert.

## Zusammenfassung

Die App ist insgesamt sorgfältig gebaut: Effekt-Cleanups sind vollständig, Web/Native-Verzweigungen sind bewusst gesetzt, das Bottom-Sheet läuft korrekt über `translateY`, die Reminder-Map ist gegen Races serialisiert. Die ernsthaften Befunde liegen im **Datenfluss der Merkliste**: Der Abgleich gemerkter Events läuft praktisch immer gegen den *alten* Cache statt gegen frische Daten, sodass Terminänderungen erst einen App-Start zu spät gemeldet werden und Erinnerungen bis dahin auf der alten Uhrzeit stehen. Zweitens meldet die App bei einem Teilausfall der API (eine ChurchDesk-Organisation antwortet nicht — die API liefert dann einen „degraded“-Feed mit Status 200) fälschlich „Veranstaltung entfällt“ und löscht die Erinnerung dauerhaft. Dazu kommen mittlere Befunde: Android-Zurücktaste schließt keine Sheets sondern die App, fehlende Rückmeldung bei verweigerter Mitteilungsberechtigung, wirkungsloses `memo` in der Liste, fehlende untere Safe-Area in zwei Sheets und abgeschnittene Kartentexte bei großer Systemschrift. Kritische Befunde (Absturz, Datenverlust im Normalbetrieb) gibt es nicht.

Befunde: 0 kritisch, 2 hoch, 9 mittel, 12 niedrig.

## Befunde

### [SCHWERE: hoch] Abgleich gemerkter Events läuft gegen den alten Cache, nicht gegen frische Daten
- **Ort:** `apps/app/app/index.tsx:144-193` (Effekt), `apps/app/lib/hooks/useEvents.ts:97` (`data = query.data ?? cached`)
- **Status:** BESTÄTIGT
- **Was:** Der einmalige Abgleich (`didSync`) startet, sobald `savedLoaded && reminderLoaded && allFeatures.length > 0` — und `allFeatures` ist zu diesem Zeitpunkt fast immer der AsyncStorage-Cache der letzten Sitzung, weil drei AsyncStorage-Lesevorgänge (Cache, Merkliste, Präferenz) lange vor der Netzantwort fertig sind. Der Snapshot wird anschließend aus denselben alten Daten neu gebaut. Trifft die Netzantwort ein, läuft kein zweiter Abgleich.
- **Fehlerpfad:** Redaktion verschiebt am Dienstagmittag den Gottesdienst von 18 auf 19 Uhr. Nutzerin öffnet die App am Dienstagnachmittag: Abgleich vergleicht Snapshot (Montagsstand) mit Cache (Montagsstand) → keine Änderung, keine Mitteilung, Erinnerung bleibt auf 15 Uhr (3 h vor 18 Uhr). Netzantwort ersetzt dann still die Anzeige. Erst beim *nächsten* Start (Cache = Dienstagsstand) kommt „Termin geändert“ — oft nach dem Event. Dasselbe gilt für `res.removed`/`res.changed` und damit für die Reminder-Neuplanung in Zeile 174-181.
- **Fix:** Abgleich erst auf `query.isSuccess`-Daten laufen lassen (z. B. `query.dataUpdatedAt > 0` als Bedingung, oder `didSync` erst setzen, wenn die Daten nicht aus dem Cache stammen). Alternativ: Abgleich bei jedem `dataUpdatedAt`-Wechsel wiederholen — der Snapshot verhindert Doppelmeldungen ohnehin.

### [SCHWERE: hoch] Teilausfall der API löst falsche „Veranstaltung entfällt“-Mitteilungen aus und löscht Erinnerungen dauerhaft
- **Ort:** `apps/app/lib/savedSync.ts:82-92`, `apps/app/app/index.tsx:174-175`; Ursache serverseitig `apps/api/src/aggregate.ts:61-66` (fehlgeschlagene Org wird übersprungen, Feed trotzdem mit Status 200 ausgeliefert, `meta.orgsFailed > 0`)
- **Status:** BESTÄTIGT
- **Was:** Fällt beim API-Refresh eine ChurchDesk-Organisation aus, fehlen deren Events im Feed, der Feed wird aber normal ausgeliefert (die API markiert das nur in `meta.orgsFailed`, `/status` sagt „degraded“). Die App wertet `meta` nicht aus: jedes gemerkte Event dieser Org gilt als „nicht mehr vorhanden“.
- **Fehlerpfad:** ChurchDesk Kirchspiel Eider antwortet einmal mit Timeout → API-Feed ohne Eider-Events → beim nächsten App-Start pro gemerktem Eider-Event eine Mitteilung „Veranstaltung entfällt“ (falsch), `cancelForEvent` löscht die Erinnerung, `rebuildSnapshot` wirft die IDs aus dem Snapshot. Kommt die Org zurück, gelten die Events als „erstmals gesehen“ (`if (!before) continue`) — die Erinnerung wird **nie** wieder geplant, obwohl das Herz noch gesetzt ist.
- **Fix:** Bei `data.meta?.orgsFailed > 0` den Wegfall-Zweig überspringen (oder nur Events aus erfolgreichen Orgs prüfen — `orgId` steht in den Properties, die Liste der ausgefallenen Orgs müsste die API mitliefern). Zusätzlich: beim Wiederauftauchen eines gemerkten Events ohne Snapshot-Eintrag die Erinnerung nachplanen.

### [SCHWERE: mittel] Änderungs-Abfrage übersieht Änderungen aus den ersten fünf Minuten nach dem Start
- **Ort:** `apps/app/lib/hooks/useEvents.ts:79-81`
- **Status:** BESTÄTIGT
- **Was:** Der erste Lauf des 5-Minuten-Polls merkt sich nur den aktuellen `version`-Hash, ohne ihn mit dem Stand der geladenen Events zu vergleichen.
- **Fehlerpfad:** App-Start 10:00 (Events-Stand A). Redaktion ändert 10:02 (Version B). Poll 10:05: `versionRef` ist null → merkt B, kein Refetch. Poll 10:10: B === B → kein Refetch. Die Änderung erreicht diese Sitzung nie (nur über Tageswechsel oder Neustart). Bei einem Tablet, das den Tag über offen liegt, ist das die Regel, nicht die Ausnahme.
- **Fix:** Version direkt nach erfolgreichem Events-Fetch einmal abfragen und als Basis setzen (oder den Fingerprint in `/events.geojson` als `meta.version` mitliefern — additiv, bricht keine alte App).

### [SCHWERE: mittel] Android-Zurücktaste schließt keine Sheets, sondern beendet die App
- **Ort:** `apps/app/components/EventSheet.tsx:267`, `FilterSheet.tsx:96`, `ProfileSheet.tsx:54` (absolut positionierte `Pressable`-Backdrops, keine `Modal`); kein `BackHandler` im gesamten App-Code (grep leer)
- **Status:** BESTÄTIGT
- **Was:** Die drei Sheets sind normale Views im einzigen Router-Screen. Der Hardware-/Gesten-Back auf Android geht an den Root-Stack, der keine History hat → App in den Hintergrund.
- **Fehlerpfad:** Android-Nutzer öffnet ein Event, drückt „Zurück“ → App verschwindet; beim Zurückholen ist das Sheet noch offen. Nur das Onboarding (echte `Modal` mit `onRequestClose`) verhält sich richtig.
- **Fix:** `BackHandler.addEventListener("hardwareBackPress", …)` in `index.tsx`, das offene Sheets in der Reihenfolge EventSheet → FilterSheet → ProfileSheet schließt und `true` zurückgibt.

### [SCHWERE: mittel] Verweigerte Mitteilungsberechtigung bleibt ohne jede Rückmeldung
- **Ort:** `apps/app/app/index.tsx:106-109` (`toggleSave`), `index.tsx:113-117` (`onReminderPref`), `apps/app/lib/reminders.ts:28-34`
- **Status:** BESTÄTIGT
- **Was:** `ensurePermission()` liefert `false`, wenn die Person ablehnt; die Aufrufer ignorieren das. In `onReminderPref` wird sogar trotz `false` `rescheduleAll` ausgeführt (der Rückgabewert wird nicht einmal gelesen).
- **Fehlerpfad:** Nutzerin lehnt beim ersten Herz-Tipp die Mitteilungen ab. Profil zeigt weiterhin „Vorabend“ als aktiv, Onboarding hat Erinnerungen versprochen — es kommt nie eine. Es gibt keinen Hinweis und keinen Weg in die Systemeinstellungen.
- **Fix:** Bei `false` einen Hinweis im Profil zeigen („Mitteilungen sind in den Einstellungen deaktiviert“ + `Linking.openSettings()`), Präferenz optisch auf „Aus“ setzen oder die Auswahl blockieren.

### [SCHWERE: mittel] `memo` auf `EventCard` ist wirkungslos — jede Karte rendert bei jedem Home-Render neu
- **Ort:** `apps/app/components/EventList.tsx:52-63` (inline `onPress={() => onSelect(...)}` pro Item), `apps/app/app/index.tsx:101` (`toggleSave` ohne `useCallback`), `index.tsx:402/441` (`onToggleSave={toggleSave}`)
- **Status:** BESTÄTIGT
- **Was:** `EventCard` ist `memo`-isiert, bekommt aber pro Render neue Funktions-Props (`onPress` inline, `onToggleSave` aus einer jedes Mal neu erzeugten Arrow-Function). Damit ändert sich `renderItem` bei jedem Render, und `FlatList` rendert alle sichtbaren Karten neu.
- **Fehlerpfad:** Der Kommentar in `index.tsx:224-226` nimmt `location` bewusst aus den Filter-Dependencies, „damit nicht bei jedem GPS-Update die Liste neu rendert“ — genau das passiert trotzdem: jede Positionsmeldung (alle 25 m / 5 s), jeder `nowTick` (jede Minute), jede Bounds-Änderung → alle sichtbaren Karten inklusive `formatEventTime` (mehrere `Intl.DateTimeFormat`-Instanzen pro Karte) rendern neu. Auf älteren Android-Geräten spürbares Ruckeln beim Kartenschwenken mit offener Liste.
- **Fix:** `toggleSave` in `useCallback` (Abhängigkeiten `isSaved`, `reminderPref`, `allFeatures`), `onPress` in `EventCard` auf `(id) => void` umstellen und `onSelect` direkt durchreichen; `Intl.DateTimeFormat`-Instanzen in `filters.ts` modulweit cachen.

### [SCHWERE: mittel] Filter- und Profil-Sheet ignorieren die untere Safe Area
- **Ort:** `apps/app/components/FilterSheet.tsx:178` (`paddingBottom: spacing.lg`, kein `useSafeAreaInsets`), `apps/app/components/ProfileSheet.tsx:231`
- **Status:** BESTÄTIGT
- **Was:** Beide Sheets enden 16 px über der Bildschirmkante; auf iPhones mit Home-Indicator (34 px) und Android mit Gesten-Navigation liegt der untere Rand darunter.
- **Fehlerpfad:** iPhone 15: Der Button „12 Veranstaltungen zeigen“ ragt in die Home-Indicator-Zone; ein Tipp am unteren Rand löst statt des Buttons die System-Geste aus. Im Profil liegt die Copyright-Zeile hinter dem Indicator. `EventSheet` und `DraggableListSheet` machen es richtig (`insets.bottom`).
- **Fix:** `paddingBottom: spacing.lg + insets.bottom` wie in `EventSheet.tsx:341`.

### [SCHWERE: mittel] Feste Kartenhöhe schneidet Text bei vergrößerter Systemschrift ab
- **Ort:** `apps/app/components/EventCard.tsx:99` (`pressArea: { height: 104 }`), `:129` (`thumb height 104`), `:132` (`title lineHeight 21`), `:89-96` (`overflow: hidden`); `EventList.tsx:17-18`, `DraggableListSheet.tsx:28` (Snap-Stufen aus derselben Konstante)
- **Status:** BESTÄTIGT
- **Was:** Schriftgrößen und `lineHeight` skalieren in RN standardmäßig mit der Systemeinstellung, die Kartenhöhe ist fix und clippt (`overflow: hidden`). `maxFontSizeMultiplier`/`allowFontScaling` sind nirgends gesetzt (grep leer).
- **Fehlerpfad:** iOS „Größerer Text“ 150 %: Zeit (18 px) + zwei Titelzeilen (63 px) + Meta-Zeile (~22 px) + Padding (24 px) ≈ 127 px > 104 px → Ort/Kategorie werden abgeschnitten, bei 200 % auch die zweite Titelzeile. Die Karte bleibt optisch „ganz“, der Inhalt fehlt.
- **Fix:** Entweder `maxFontSizeMultiplier={1.3}` auf den Karten-Texten (bewusster Kompromiss) oder Höhe aus `PixelRatio.getFontScale()` ableiten und die drei Stellen (Card, `ROW_HEIGHT`, Snap-Stufen) an eine gemeinsame Funktion hängen.

### [SCHWERE: mittel] Griff des Listen-Sheets ist für Screenreader nicht bedienbar
- **Ort:** `apps/app/components/DraggableListSheet.tsx:203-207`
- **Status:** BESTÄTIGT
- **Was:** Die Griff-View hat weder `accessible`, `accessibilityRole` noch `accessibilityLabel`/`accessibilityActions`; Vergrößern geht nur per Pan- oder Tap-Geste auf ein für VoiceOver/TalkBack unsichtbares Element.
- **Fehlerpfad:** VoiceOver-Nutzer startet in Stufe MID (eine Karte sichtbar) und kann das Sheet nicht öffnen; die Liste bleibt ein Ein-Karten-Fenster, durch das er sich Eintrag für Eintrag tasten muss, während die Karte den Rest verdeckt.
- **Fix:** `accessible`, `accessibilityRole="adjustable"`, Label „Veranstaltungsliste, Stufe 2 von 4“, `accessibilityActions` increment/decrement → `snapTo(nächste Stufe)`.

### [SCHWERE: mittel] Schriftladefehler lässt die App dauerhaft leer
- **Ort:** `apps/app/app/_layout.tsx:21-31`
- **Status:** PLAUSIBEL (Code bestätigt; Eintrittshäufigkeit nicht gemessen)
- **Was:** `useFonts` liefert `[loaded, error]`; nur `loaded` wird gelesen. Bei `error` bleibt `loaded` false → für immer die leere Sand-View.
- **Fehlerpfad:** Web: Font-Datei lädt wegen Netz-/Cache-Problem nicht → leere Seite ohne Fehlermeldung, kein Retry. Nativ sind die Fonts gebündelt, dort ist es unwahrscheinlich, aber ein `expo-font`-Fehler (z. B. beschädigter Cache) hätte dieselbe Folge.
- **Fix:** `if (!loaded && !error) return <View …/>` — bei Fehler mit System-Fallback-Schrift rendern.

### [SCHWERE: mittel] Tipp auf eine Mitteilung bei beendeter App öffnet das Event nicht
- **Ort:** `apps/app/app/index.tsx:196-202`; Bibliothek: `expo-notifications/ios/…/EmitterModule.swift:37-38`, `android/…/NotificationsEmitter.kt:68-79`
- **Status:** PLAUSIBEL
- **Was:** Es wird nur `addNotificationResponseReceivedListener` benutzt. Beide nativen Emitter senden das Response-Event genau einmal beim Eintreffen und speichern es zusätzlich als `lastResponse` — für den Fall, dass zu diesem Zeitpunkt noch kein JS-Listener registriert ist. Bei Kaltstart über eine Mitteilung trifft die Response ein, bevor Fonts geladen und `Home` gemountet sind; `getLastNotificationResponse()`/`useLastNotificationResponse` werden nirgends aufgerufen (grep leer).
- **Fehlerpfad:** Abend-Erinnerung um 18:00, App wurde vorher vom System beendet. Tipp auf die Mitteilung → App startet auf der Karte, das Event-Sheet öffnet nicht. Ist die App im Hintergrund, funktioniert es.
- **Fix:** Nach dem Mount einmal `Notifications.getLastNotificationResponse()` auswerten (und `clearLastNotificationResponse()`), oder `useLastNotificationResponse()`.

### [SCHWERE: niedrig] Entfallene Events bleiben für immer in der Merkliste
- **Ort:** `apps/app/app/index.tsx:174-175` (nur `cancelForEvent`, kein `removeMany(res.removed)`), `apps/app/lib/savedSync.ts:124-133` (Snapshot verliert die ID)
- **Status:** BESTÄTIGT
- **Was:** Nach „Veranstaltung entfällt“ bleibt die ID im Set `saved` und in AsyncStorage; der Aufräum-Zweig in Zeile 159-166 lässt verwaiste IDs ohne Snapshot-Startzeit ausdrücklich in Ruhe.
- **Fehlerpfad:** Das Set wächst über Monate; vor dem Laden der Daten zeigt das Profil-Badge `saved.size` (Zeile 243) mit Phantomeinträgen.
- **Fix:** `removeMany(res.removed)` im Sync-Effekt.

### [SCHWERE: niedrig] `getItemLayout` rechnet mit falscher Zeilenhöhe
- **Ort:** `apps/app/components/EventList.tsx:17-18,75-79`; tatsächliche Höhe aus `EventCard.tsx:93` (`borderWidth: 1`, bei Highlight/aktiv 2) + `:99` (`height: 104`)
- **Status:** BESTÄTIGT (Konstante); Folge PLAUSIBEL
- **Was:** Die Karte ist 106 px hoch (Highlight/aktiv: 108), nicht 104; zusätzlich fehlt das obere `padding: 16` des Containers im `offset`. `FlatList` vertraut `getItemLayout` und misst nicht nach — nach 50 Einträgen liegt die Rechnung 100-200 px daneben.
- **Fehlerpfad:** Beim schnellen Scrollen in einer langen Liste erscheinen die unteren Einträge verspätet (kurz leere Fläche), weil das Render-Fenster falsch positioniert ist.
- **Fix:** Eine Konstante `CARD_OUTER_HEIGHT` in `EventCard` exportieren und in `EventList`/`DraggableListSheet` verwenden; `offset = paddingTop + ROW_HEIGHT * index`.

### [SCHWERE: niedrig] Standort-Marker-Source wird bei jedem Render neu gesetzt
- **Ort:** `apps/app/components/EventMap.native.tsx:173-184`
- **Status:** BESTÄTIGT
- **Was:** `userPointFC` ist ein bei jedem Render neues Objekt → `GeoJSONSource data` ändert sich bei jedem Home-Render (jede Minute, jede Bounds-Änderung, jeder Sheet-Snap), obwohl der Kommentar in Zeile 67-68 genau das für `data` vermeidet.
- **Fehlerpfad:** Unnötige Native-Bridge-Aufrufe pro Render; keine sichtbare Fehlfunktion, aber Mehrarbeit auf dem UI-Thread während Kartengesten.
- **Fix:** `useMemo(() => …, [userLocation?.lat, userLocation?.lng])`.

### [SCHWERE: niedrig] Zu kleine Touch-Ziele und fehlende Rollen an Bedienelementen
- **Ort:** `FilterSheet.tsx:101` („Zurücksetzen“, ~17 px hoch, kein `hitSlop`), `FilterSheet.tsx:219` (Chips `minHeight: 38`), `ProfileSheet.tsx:59` („×“, ~30 px), `EventSheet.tsx:500-526` (Herz/Schließen 36 px, kein `hitSlop`), `ProfileSheet.tsx:75,115` (Segment-Buttons ohne `accessibilityRole`/`accessibilityState`), `EventSheet.tsx:342` (Maps-Button ohne `accessibilityRole`)
- **Status:** BESTÄTIGT
- **Was:** Mehrere Ziele unter 44 pt; Segment-Wähler melden dem Screenreader weder „Button“ noch „ausgewählt“.
- **Fehlerpfad:** VoiceOver liest im Profil „Vorabend“ als reinen Text; welche Option aktiv ist, ist nicht hörbar. Motorisch eingeschränkte Nutzer treffen „Zurücksetzen“ schlecht.
- **Fix:** `hitSlop={8-12}` an den kleinen Zielen, `accessibilityRole="button"` + `accessibilityState={{ selected }}` an den Segmenten.

### [SCHWERE: niedrig] Ungültige Startzeit aus der API wirft in der Filter-/Formatierlogik
- **Ort:** `apps/app/lib/filters.ts:69-79` (`formatToParts`), `:209-221` (`format`)
- **Status:** PLAUSIBEL (API-Vertrag garantiert gültige ISO-Strings; Verhalten von `Intl` bei `Invalid Date` in Node verifiziert: `RangeError: Invalid time value`)
- **Was:** Ein einziges Feature mit nicht parsebarem `startUtc` lässt `applyFilters` (im `useMemo`) und `EventCard` werfen. Keine eigene Error-Boundary; es greift nur die Standard-Fehlerseite von expo-router.
- **Fehlerpfad:** Fehlerhafter ChurchDesk-Datensatz → gesamte Route zeigt „Something went wrong“, nicht nur eine Karte.
- **Fix:** In der API sicherstellen (Test), in der App defensiv `Number.isFinite(Date.parse(startUtc))` vor Formatierung.

### [SCHWERE: niedrig] Kein Hinweis auf veraltete Daten / stiller Kategorien-Fehler
- **Ort:** `apps/app/lib/hooks/useEvents.ts:103` (`isError` unterdrückt bei Cache), `apps/app/app/index.tsx:53,253-256` (`useCategories` ohne Fehlerbehandlung)
- **Status:** BESTÄTIGT
- **Was:** Schlägt der Netzabruf fehl, zeigt die App still den bis zu 7 Tage alten Cache; schlägt `categories.json` fehl, ist die Gruppe „Art“ im Filter leer — jeweils ohne Rückmeldung.
- **Fehlerpfad:** Funkloch am Sonntagmorgen: Liste zeigt den Stand von Donnerstag als wäre er aktuell; die Nutzerin fährt zu einem inzwischen abgesagten Termin. Bewusste Designentscheidung laut Kommentar, aber ein kleiner „Stand: Do 11:32“-Hinweis fehlt.
- **Fix:** `dataUpdatedAt`/`cached.ts` als dezente Zeile im Header, wenn `query.isError && data`.

### [SCHWERE: niedrig] `timeZoneName: "longOffset"` auf Hermes nicht verifiziert
- **Ort:** `apps/app/lib/filters.ts:108-117`
- **Status:** PLAUSIBEL (kein Hermes-Runtime lokal verfügbar; Tests laufen in Node)
- **Was:** Die Wochenend-Berechnung liest den Berlin-Offset über `Intl.DateTimeFormat(…, { timeZoneName: "longOffset" })`. Liefert Hermes (Android-ICU-Bridge) diesen ES2021-Wert nicht, greift der stille Fallback `offsetMs = 0`.
- **Fehlerpfad:** Ein Samstagstermin um 00:30 Berlin-Zeit (Nachtwache o. ä.) fällt am Freitagabend aus dem „Wochenende“-Filter bzw. ein Sonntag-23:30-Termin bleibt bis Montag 01:00 drin. Wirft Hermes stattdessen einen `RangeError`, crasht der Filter — das wäre aber im Store längst aufgefallen.
- **Fix:** Einmal auf einem Android-Gerät `console.log` des Offsets prüfen; alternativ Offset aus `hour`/`minute` von `formatToParts` gegen UTC berechnen (ES2015, überall verfügbar).

### [SCHWERE: niedrig] Herz-Tipp vor dem Laden der Merkliste kann die gespeicherte Liste überschreiben
- **Ort:** `apps/app/lib/store.ts:17-39`
- **Status:** PLAUSIBEL
- **Was:** `toggle` schreibt `[...next]` aus dem *aktuellen* (noch leeren) Set nach AsyncStorage; kommt danach der Lesevorgang vom Mount zurück, überschreibt `setSaved(alteListe)` den State, während im Storage nur die eine neue ID steht.
- **Fehlerpfad:** Das Zeitfenster ist die AsyncStorage-Latenz beim Start (Millisekunden, die Liste rendert erst nach dem Cache-Load) — praktisch kaum erreichbar, aber ein verlorener Schreibvorgang ohne Schutz.
- **Fix:** `toggle` bis `loaded` puffern oder den Lade-Effekt mit `setSaved(prev => prev.size ? prev : geladen)` schützen.

### [SCHWERE: niedrig] Halbfertige Reminder-Planung hinterlässt Waisen-Benachrichtigungen
- **Ort:** `apps/app/lib/reminders.ts:129-155`, Aufrufer `apps/app/app/index.tsx:108,179` (nicht `await`ed, kein `catch`)
- **Status:** PLAUSIBEL
- **Was:** Wirft bei Präferenz „Beides“ der zweite `scheduleNotificationAsync`, wird `saveMap` übersprungen — die erste, bereits geplante ID landet nie in der Map und kann nicht mehr abgebrochen werden. Die Rejection erreicht den Aufrufer unbehandelt.
- **Fehlerpfad:** Nutzerin entmerkt das Event → `cancelForEvent` findet keine ID → die Erinnerung feuert trotzdem.
- **Fix:** In `withMap` das `saveMap` in `finally` ausführen; `scheduleForEvent`-Aufrufe mit `.catch(() => {})` versehen.

### [SCHWERE: niedrig] Cache-zu-Netz-Wechsel setzt ein offenes Event-Sheet zurück
- **Ort:** `apps/app/components/EventSheet.tsx:156-166` (Effekt auf `feature`), `apps/app/app/index.tsx:278-281`
- **Status:** BESTÄTIGT
- **Was:** Wird `data` von `cached` auf `query.data` umgestellt, sind alle Feature-Objekte neue Referenzen → `selectedFeature` ändert sich → Scroll auf 0, `translateY` auf 0.
- **Fehlerpfad:** App öffnen, sofort ein Event antippen und in der Beschreibung scrollen; ~1 s später springt der Text an den Anfang.
- **Fix:** Effekt an `feature?.properties.id` hängen statt am Objekt.

### [SCHWERE: niedrig] AsyncStorage-Lesefehler beim Start bleiben unbehandelt
- **Ort:** `apps/app/lib/store.ts:18,100` (`.then` ohne `.catch`)
- **Status:** BESTÄTIGT
- **Was:** Schlägt `getItem` fehl, bleibt `loaded` für immer `false` (→ kein Abgleich, keine Reminder-Migration) und es entsteht eine Unhandled-Promise-Rejection.
- **Fehlerpfad:** Selten (beschädigter Storage), aber dann ohne Diagnose: Merkliste leer, Abgleich stumm.
- **Fix:** `.catch(() => {}).finally(() => setLoaded(true))` wie in `useReminderPref`.

### [SCHWERE: niedrig] iOS-Limit von 64 ausstehenden Mitteilungen wird nicht berücksichtigt
- **Ort:** `apps/app/lib/reminders.ts:107-156`
- **Status:** PLAUSIBEL
- **Was:** Bei Präferenz „Beides“ entstehen zwei Mitteilungen pro Event; ab 33 gemerkten Events verwirft iOS die spätesten still.
- **Fehlerpfad:** Vielmerkerin mit 40 Terminen: Für die letzten fällt die Erinnerung ohne Hinweis aus.
- **Fix:** Nur die nächsten ~30 Events planen und beim Start nachplanen (der Abgleich läuft ohnehin), oder Hinweis im Profil.

## Was gut ist (kurz)

- **Effekt-Hygiene:** Alle Intervalle, AppState-/Notification-Listener und der Location-Watch haben Cleanups; `useLocation` fängt sogar den Fall ab, dass `watchPositionAsync` erst nach dem Unmount auflöst (`unmountedRef`).
- **Sheet-Architektur:** `DraggableListSheet` animiert ausschließlich `translateY` bei fester Höhe — die bekannte Höhen-Animations-Falle ist bewusst umgangen und dokumentiert; der Reanimated-Start-Race ist mit dem `ready`-Frame abgefangen.
- **Fly-to-Logik:** Standort liegt in einer Ref, die Effekte hängen nur am Token — die Karte springt bei Live-Tracking nicht zurück.
- **Reminder-Map:** `withMap` serialisiert alle Read-Modify-Write-Zyklen; doppelte Planungen werden vor dem Neu-Planen abgeräumt.
- **Plattform-Trennung:** Web-No-ops in `reminders.ts`/`savedSync.ts`, `Platform.OS`-abhängige Maps-Vorbelegung, `window`-Guard in `maps.ts`, Karten-App-Wahl nur dort, wo sie etwas bewirkt.
- **Zeitzonen:** Filter, Formatierung und Reminder-Texte rechnen konsequent in `Europe/Berlin`; „Heute/Morgen“ bezieht sich korrekt auf den Zustellzeitpunkt.
- **Standort-Berechtigung:** Anfrage erst nach dem Onboarding, Ablehnung blendet den Standort-Button aus, ferne Standorte fallen auf die Übersicht zurück statt die Liste zu leeren.
- **Offline-Start:** Persistierter Cache mit `isPast`-Filter und 7-Tage-Deckel; Fehlerseite nur, wenn wirklich nichts anzuzeigen ist.
- **Barrierefreiheit der Karten:** `EventCard` trägt Rolle, sprechendes Label (Titel, Zeit, Ort) und ein Herz mit Zustandslabel und `hitSlop`.
