# GPS fällt gelegentlich aus

Stand: 14.09.2026. Geprüft gegen `expo-location` 56.0.25 (installiert), die
versionierte Doku unter https://docs.expo.dev/versions/v56.0.0/sdk/location/
und den nativen Quellcode des Moduls in `node_modules/expo-location`
(iOS: `ios/Providers/*.swift`, `ios/LocationModule.swift`; Android:
`android/.../LocationModule.kt`, `LocationHelpers.kt`; Web: `src/ExpoLocation.web.ts`).
Es wurde kein Code geändert.

## Symptom (wie gemeldet)

> „manchmal hab ich einfach kein gps dann aus an dann geht es wieder"

Was die Person dabei konkret sieht (aus dem Code abgeleitet):

- kein blauer „Du bist hier"-Punkt auf der Karte (`EventMap.*.tsx` zeichnet ihn
  nur, wenn `userLocation` gesetzt ist),
- kein automatischer Start-Zoom in die Nähe (`app/index.tsx:130-140`),
- „Zu meinem Standort" fliegt nicht hin.

Eine Umgebungs-Sortierung gibt es in der App nicht: `lib/filters.ts` nutzt den
Standort in keinem Filter, `distanceKm` wird nur für den Start-Zoom verwendet.
Der Standort ist also rein Anzeige + Fly-to.

„Aus/an" kann **kein Schalter in der App** sein — es gibt keinen. `lib/store.ts`
persistiert nur gemerkte Events, Karten-App und Erinnerungs-Präferenz. Gemeint
ist entweder der Standort-Schalter des Systems (Android-Schnelleinstellung /
iOS-Einstellungen) oder ein App-Neustart. Beides führt zum selben Effekt: Der
Hook wird neu durchlaufen bzw. der Systemdienst liefert wieder einen Fix.

## Wahrscheinlichste Ursache

**Die einmalige Erstortung ist der einzige Einstieg in die Ortung, und wenn sie
fehlschlägt, wird der Fehler verschluckt — es gibt danach keinen zweiten
Versuch, kein Live-Abo und keinen Rückgriff auf die letzte bekannte Position.**

Ablauf in `apps/app/lib/hooks/useLocation.ts`:

1. `request()` (Zeile 40) wird genau einmal beim Start aufgerufen
   (`app/index.tsx:82-89` bzw. nach dem Onboarding `index.tsx:91-96`).
2. Berechtigung wird geholt (Zeile 43). Ist sie erteilt, folgt sofort
   `Location.getCurrentPositionAsync({ accuracy: Balanced })` (Zeile 49).
3. **Erst wenn** dieser eine Aufruf eine Position liefert, wird `setLocation`
   gesetzt (Zeile 53) **und** danach das Live-Abo `startWatch()` gestartet
   (Zeile 56).
4. Wirft `getCurrentPositionAsync`, landet der Ablauf im `catch` (Zeile 58):
   `status = "error"`, `location` bleibt `null`, `startWatch()` wird **nie**
   aufgerufen. Kein Retry, kein Timer, kein AppState-Listener, kein
   `getLastKnownPositionAsync`.

Warum die Erstortung „manchmal" fehlschlägt — belegt im nativen Modul:

- **iOS** (`ios/Providers/LocationRequester.swift:14-35`): `getCurrentPositionAsync`
  ist ein `CLLocationManager.requestLocation()`. **Jeder** `didFailWithError`
  führt zum Reject mit „Cannot obtain current location" — auch
  `kCLErrorLocationUnknown` (Code 0), den CoreLocation bei kaltem GPS oder
  drinnen liefert. Bemerkenswert: Der Live-Stream des **selben** Moduls
  (`LocationsStreamer.swift:50-56`) ignoriert genau diesen Fehler ausdrücklich
  als „temporary issue" und ortet weiter. Die App hängt also den robusten
  Mechanismus (Watch) hinter den fragilen (One-Shot).
- **Android** (`LocationHelpers.kt:57-87`, `LocationModule.kt:478-505`):
  `getCurrentPositionAsync` baut ein `CurrentLocationRequest` mit
  `setMaxUpdateAgeMillis(3000)` (Balanced → Intervall 3 s). Ein gecachter Fix,
  der älter als 3 s ist, zählt nicht; es muss ein frischer her. Liefert der
  Fused Provider innerhalb seiner „zumutbaren Zeit" keinen, kommt `null` →
  `CurrentLocationIsUnavailableException` → Reject. Ist zusätzlich der
  Netzwerk-Provider aus, erscheint der Systemdialog; wird er abgelehnt →
  `LocationSettingsUnsatisfiedException` → Reject.
- **Web** (`src/ExpoLocation.web.ts:137-149`): `navigator.geolocation.getCurrentPosition`
  ohne `timeout` → Browser-Standard `Infinity`. Ohne Fix hängt der Aufruf
  ewig, `status` bleibt „loading".

Warum das exakt zu „manchmal weg, aus/an hilft" passt und nicht zu „GPS kaputt":

- Ob der **erste** Fix innerhalb weniger Sekunden nach App-Start gelingt, hängt
  vom Moment ab (kaltes GPS, Gebäude, WLAN-Ortung gerade nicht verfügbar). Das
  ist der Zufall hinter „manchmal".
- Nach dem Fehlschlag liegt der Hook dauerhaft in einem Endzustand ohne Abo.
  Die Umgebung kann sich beliebig verbessern — die App merkt es nicht.
- **App-Neustart** ruft `request()` erneut auf → neuer Versuch, meist
  erfolgreich. **System-Standort aus/an** auf Android setzt die Provider zurück
  (das bekannte Hausmittel) — hilft der App aber nur in Kombination mit einem
  Neustart oder einem Tipp auf „Zu meinem Standort", denn nichts in der App
  lauscht auf diese Änderung.
- Der Button „Zu meinem Standort" ist im Zustand `error` sichtbar (nur bei
  `denied` ausgeblendet, `index.tsx:354`) und ruft `location ?? requestLocation()`
  (`index.tsx:123`). Das ist der **einzige** Retry-Pfad — und für die Person
  nicht als solcher erkennbar.

Eine **zweite, seltenere Ursache** mit demselben Fix (siehe H1/H6): Das
Live-Abo wird ohne `errorHandler` erstellt (Zeile 22-32). Beendet iOS den
Stream mit einem anderen Fehler als `locationUnknown` (z. B. `kCLErrorDenied`,
wenn die Ortung systemweit ausgeschaltet wird oder eine „Einmal
erlauben"-Berechtigung ausläuft), räumt der native Streamer sich auf
(`LocationsStreamer.swift:57-59`), das Fehler-Event verpufft ohne Empfänger
(`LocationModule.swift:78-82`, JS-seitig `Location.ts:114` nur bei
`errorHandler`), und `watchRef` hält ein totes Abo. Der letzte Standort bleibt
stehen (Marker friert ein), es kommt nie wieder ein Update. Hier hilft nur der
Neustart — genau das Muster.

## Hypothesen-Prüfung

### H1 — Abo nach Hintergrund/Vordergrund nicht erneuert
**AUSGESCHLOSSEN als Hauptursache, BESTÄTIGT im Fehlerfall.**
Es gibt keinen AppState-Listener in `useLocation.ts` (der einzige in der App
sitzt in `lib/hooks/useEvents.ts:55` für den Tageswechsel-Refetch). Er ist im
Normalfall auch nicht nötig:
- iOS: `BaseLocationProvider.swift:12` setzt `allowsBackgroundLocationUpdates = false`.
  CoreLocation pausiert dann Updates im Hintergrund und liefert im Vordergrund
  selbstständig weiter; das Abo bleibt bestehen.
- Android: Das Modul pausiert und reaktiviert seine Watches selbst
  (`LocationModule.kt:373-386` `OnActivityEntersForeground/Background`,
  `resumeLocationUpdates` Zeile 741-751).
Bleibt der Fehlerfall: Stirbt der iOS-Stream (s. o.), wird er von niemandem
neu aufgebaut. Ein AppState-Listener wäre die richtige Stelle, ein totes Abo
zu erkennen (`status === "granted"` und kein lebendes Abo → neu starten).

### H2 — getCurrentPositionAsync ohne Timeout/Fallback
**BESTÄTIGT (Fallback fehlt; Hänger nur im Web).**
`useLocation.ts:49-51` ruft `getCurrentPositionAsync` ohne Fallback; nirgends
wird `getLastKnownPositionAsync` benutzt. Nativ hängt der Aufruf nicht
unbegrenzt — iOS `requestLocation()` endet in genau einem Delegate-Callback,
Android `getCurrentLocation` liefert nach zumutbarer Zeit `null` — aber beide
Enden sind ein **Reject**, und der landet in H3. Im Web fehlt das `timeout`
(`ExpoLocation.web.ts:143-147` reicht `...options` in `PositionOptions` durch,
die App übergibt aber keins) → dort hängt es tatsächlich ewig in „loading".
Die Expo-Doku dokumentiert für `getCurrentPositionAsync` kein Timeout-Feld
und warnt: „may take some time to resolve, especially when you're inside a
building".

### H3 — Fehler wird verschluckt, kein Retry
**BESTÄTIGT — Hauptursache.**
`useLocation.ts:58-61`: `catch { setStatus("error"); return null; }`. Kein
Retry, kein Backoff, kein Watch. `request()` wird nur beim Start
(`index.tsx:86`/`95`) und über den Button (`index.tsx:123`) aufgerufen. Ablauf
und native Belege siehe „Wahrscheinlichste Ursache".

### H4 — Race zwischen Berechtigung und Positionsabfrage
**AUSGESCHLOSSEN.**
`useLocation.ts:43-49`: `requestForegroundPermissionsAsync` wird `await`et und
auf `status !== "granted"` geprüft, bevor `getCurrentPositionAsync` läuft.
Streng sequenziell. Im Web löst `requestForegroundPermissionsAsync` selbst
bereits ein `getCurrentPosition` aus (`ExpoLocation.web.ts:78-108`); der
zweite Aufruf nutzt dank `maximumAge: Infinity` den Cache — unproblematisch.
(Eine andere Nebenläufigkeit — zwei parallele `request()` — s. Nebenbefund N1.)

### H5 — Berechtigungsstatus nur einmal geprüft
**AUSGESCHLOSSEN als Ursache dieses Symptoms; Schwäche vorhanden.**
Der Status wird nur in `request()` ermittelt und als `status` gehalten. Ein
„denied" ist bis zum Neustart endgültig: Button weg (`index.tsx:354`), kein
`getForegroundPermissionsAsync` beim Rückkehren in den Vordergrund. Auf iOS und
Android beendet das System die App aber ohnehin, wenn die Person die
Berechtigung in den Einstellungen ändert — beim nächsten Start wird neu
gefragt. Das erklärt nicht „manchmal kein GPS", sondern höchstens „Button
fehlt". Die Doku-Warnung zu „Allow Once" (iOS unterscheidet nicht zwischen
„Einmal" und „Beim Verwenden", beides ergibt `whenInUse`) ist für den
Vordergrund-Fall unkritisch — läuft die temporäre Freigabe mitten in der
Sitzung aus, greift H1/H6 (toter Stream).

### H6 — Cleanup-Fehler durch instabile Dependencies
**AUSGESCHLOSSEN.**
Der Cleanup-Effect hat `[]` als Dependencies (`useLocation.ts:66-72`) und
läuft nur beim Unmount. `request` ist `useCallback([startWatch])`, `startWatch`
ist `useCallback([])` — beide stabil; der Start-Effect in `index.tsx:82-89`
läuft genau einmal. `Home` wird nicht neu gemountet. Es gibt keine
mehrfach entfernten oder konkurrierenden Abos aus Effect-Läufen. (Die
Verwandte Lücke — kein `errorHandler` am Abo, totes Abo bleibt in `watchRef` —
ist unter H1 und „zweite Ursache" beschrieben.)

### H7 — Persistierter „Standort an"-Schalter läuft dem Abo-Zustand davon
**AUSGESCHLOSSEN.**
Es gibt keinen solchen Schalter, weder persistiert (`lib/store.ts`: nur
`kkd:savedEvents`, `kkd:mapsApp`, Erinnerungs-Präferenz) noch in der
Oberfläche (`FilterBar.tsx`, `ProfileSheet.tsx`, `OnboardingOverlay.tsx`
enthalten keinen). Der Ortungszustand lebt ausschließlich im Hook-State und
geht mit dem Prozess. Das „aus/an" der Meldung ist der System-Schalter oder
ein Neustart — und beides „hilft", weil `request()` dann neu läuft (s. o.).

## Fix-Vorschlag

**Datei:** `apps/app/lib/hooks/useLocation.ts` (plus kleine Anpassung in
`app/index.tsx`, s. Punkt 6).

**Grundidee:** Die Berechtigung entscheidet, ob geortet wird — nicht der
Erfolg eines einzelnen Fixes. Sobald sie erteilt ist, läuft das Live-Abo
immer; die Erstortung ist nur noch Beschleuniger.

1. **Reihenfolge umdrehen.** Nach erteilter Berechtigung zuerst
   `getLastKnownPositionAsync({ maxAge: 10 * 60_000 })` — liefert es etwas,
   sofort `setLocation` (Marker steht, Start-Zoom greift). Dann
   **unabhängig davon** `startWatch()` starten. Erst danach
   `getCurrentPositionAsync` als nicht-blockierenden Beschleuniger
   (`.then(setLocation).catch(() => {})`). Ein Fehler dort ändert `status`
   nicht mehr — die Berechtigung ist ja da.
2. **`status`-Modell anpassen:** `"granted"` sobald die Berechtigung da ist
   (unabhängig vom Fix), `"error"` nur noch, wenn selbst `watchPositionAsync`
   nicht startet. Der Button bleibt damit sinnvoll: bei `granted` ohne
   `location` zeigt er „noch kein Fix" statt still zu scheitern.
3. **`errorHandler` an `watchPositionAsync` übergeben.** Bei Fehler: Abo
   verwerfen, `watchRef = null`, nach 5 s (bei wiederholtem Fehler doppelnd,
   max. 60 s) `startWatch()` erneut. Damit heilt sich der tote iOS-Stream
   selbst, ohne Neustart.
4. **AppState-Listener** im Hook: bei `active` prüfen, ob `status === "granted"`
   und `watchRef.current === null` → `startWatch()`. Deckt Fälle ab, in denen
   der Fehler während des Hintergrunds kam und der Timer nicht lief.
5. **Web-Timeout:** `getCurrentPositionAsync` auf Web mit `timeout: 15_000`
   aufrufen (`Platform.OS === "web"`, Cast nötig, da `LocationOptions` das Feld
   nicht typisiert; nativ wird es ignoriert). Sonst bleibt „loading" ewig.
6. **Re-Entrancy-Guard:** ein `inFlightRef`, sodass ein zweiter `request()`
   (Button-Tipp während „loading") das laufende Promise mitbenutzt statt ein
   zweites Abo zu erzeugen (Nebenbefund N1). In `index.tsx:354` den Button
   auch bei `"loading"` erlauben, aber der Guard verhindert Doppelabos.
7. **Cleanup** wie bisher: `unmountedRef` + `remove()`, zusätzlich Timer und
   AppState-Subscription abräumen.

**Testplan — Fehler zuerst, dann Fix.**

Die App hat derzeit **kein Test-Setup** (Root-`npm test` läuft nur
`packages/shared` und `apps/api`; in `apps/app` gibt es keine Testdatei und
kein Test-Framework). Damit der Bugfix testbar wird, ohne React Native zu
mocken: die Ablauflogik aus dem Hook in eine reine Funktion herausziehen
(`apps/app/lib/locationController.ts`), die ihre Abhängigkeiten injiziert
bekommt (`requestPermission`, `getLastKnown`, `getCurrent`, `watch`,
`setTimeout`), und den Hook nur noch als dünne Hülle behalten. Dann `vitest`
(wie in `apps/api`) für `apps/app` einrichten und das Root-Script erweitern.

Tests (jede Erwartung mit konkretem Wert, keine weichen Assertions):

- **T1 (der Test, der den Fehler zeigt):** `getCurrent` rejected, `watch`
  liefert nach dem Start eine Position → erwartet: `location` gleich der
  Watch-Position, `status === "granted"`, `watch` genau **1×** aufgerufen.
  Mit dem heutigen Ablauf: `location === null`, `watch` 0× → rot.
- **T2:** `getLastKnown` liefert `{lat, lng}`, `getCurrent` bleibt pending →
  `location` sofort gleich dem Last-Known-Wert, `watch` 1×.
- **T3:** Watch-`errorHandler` feuert → Fake-Timer 5 s vor → `watch` 2× aufgerufen,
  neue Position aus dem zweiten Abo landet in `location`; das erste Abo hat
  `remove()` genau 1× gesehen.
- **T4:** Berechtigung `denied` → `getCurrent` 0×, `watch` 0×,
  `status === "denied"`, Rückgabe `null`.
- **T5:** zwei gleichzeitige `request()` → `watch` genau 1×, kein verwaistes Abo.
- **T6:** AppState `active` bei `granted` ohne lebendes Abo → `watch` erneut 1×;
  bei lebendem Abo 0× zusätzlich.
- **T7:** Unmount während `watch` noch pending → sobald es auflöst, `remove()`
  1× (bestehendes Verhalten, bleibt erhalten).
- **T8 (Web):** `getCurrent` erhält bei `platform === "web"` `timeout: 15000`;
  nativ kein `timeout`-Feld.

Zusätzlich manuell auf Gerät messen (Konsole/`adb logcat`), wie lange
`getCurrentPositionAsync` bei kaltem GPS drinnen bis zum Reject braucht — die
Angaben „einige Sekunden" (iOS) und „zumutbare Zeit" (Android) stammen aus
Apples/Googles Doku bzw. dem Modulcode, sind hier nicht gemessen.

CHANGELOG (Behoben): „Der eigene Standort erscheint jetzt auch dann, wenn die
erste Ortung nach dem Start fehlschlägt — die App ortet weiter, statt bis zum
Neustart zu warten."

## Nebenbefunde zum Standort-Code

- **N1 — Doppeltes Abo bei parallelem `startWatch`** (`useLocation.ts:20-38`):
  `watchRef.current?.remove()` läuft **vor** dem `await`. Zwei gleichzeitige
  Aufrufe (Start + Button-Tipp während „loading") sehen beide `null`, erzeugen
  beide ein Abo; das erste wird von `watchRef.current = sub` des zweiten
  überschrieben und nie entfernt → zwei native Streams, einer leckt bis zum
  Prozessende. Fix: siehe Punkt 6 oben.
- **N2 — `denied` ist endgültig** (`index.tsx:354`): Auf Web (kein
  Prozess-Neustart bei Berechtigungsänderung) bleibt der Button bis zum
  Reload verschwunden. Beim `active`-Wechsel `getForegroundPermissionsAsync`
  prüfen wäre billig.
- **N3 — Android-Systemdialog beim Start**: `mayShowUserSettingsDialog` ist
  standardmäßig `true` (`LocationModule.kt:489`). Ist die
  Netzwerk-Ortung aus, erscheint direkt nach dem Berechtigungsdialog ein
  zweiter Systemdialog. Lehnt die Person ab → Reject → derselbe Endzustand wie
  H3. Nach dem Fix fängt das Watch-Abo das auf (dort gilt dieselbe Prüfung,
  `LocationModule.kt:231`; ggf. `mayShowUserSettingsDialog: false` erwägen).
- **N4 — Web-Watch ohne Fehler-Callback** (`ExpoLocation.web.ts:165-180`):
  Das Modul reicht keinen `error`-Callback an `navigator.geolocation.watchPosition`.
  Auch mit `errorHandler` in der App kommen Web-Watch-Fehler nie an. Der
  AppState-/Sichtbarkeits-Check (Punkt 4) ist deshalb im Web der einzige
  Heilungsweg.
- **N5 — `app.json` deklariert „Always"-Berechtigungen** (`NSLocationAlways*`,
  `locationAlwaysPermission`), die App nutzt nur Vordergrund-Ortung. Kein
  Fehler, aber unnötig und ein möglicher Rückfrage-Punkt im App-Review.
- **N6 — Kartenkomponenten sind sauber**: `EventMap.native.tsx` und
  `EventMap.web.tsx` haben keine eigene Standort-Logik; sie zeichnen
  `userLocation` und halten es bewusst in einer Ref, damit Watch-Updates die
  Kamera nicht zurückziehen (`native:74-79`, `web:61-64`). Passt.
- **N7 — Kommentar in `index.tsx:224-226`** begründet, warum `location` nicht
  in den Filter-Dependencies steht. Korrekt und wichtig: Nach dem Fix kommen
  Watch-Updates häufiger (auch ohne Erstfix); nichts daran ändern.
- **N8 — Android `resumeLocationUpdates`** (`LocationModule.kt:743-744`):
  `?: return` innerhalb der Schleife bricht bei einem fehlenden Eintrag die
  gesamte Wiederaufnahme ab. Mit genau einem Abo (wie hier) ohne Wirkung —
  ein Grund mehr, nicht mehrere Abos entstehen zu lassen (N1).
