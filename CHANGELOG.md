# Changelog

Alle nennenswerten Änderungen an diesem Projekt werden hier dokumentiert.

Das Format orientiert sich an [Keep a Changelog 1.1.0](https://keepachangelog.com/de/1.1.0/),
die Versionierung folgt [SemVer 2.0.0](https://semver.org/lang/de/).

## [Unreleased]

Noch nicht veröffentlicht. Die erste Store-Fassung wird **1.0.0** — bis dahin
sammelt sich hier alles, was seit Projektbeginn entstanden ist.

### Hinzugefügt

- **Read-Only-API** (`apps/api`, Node + Hono): aggregiert die ChurchDesk-REST-API v3
  über 14 Kirchengemeinde-Organisationen, dedupliziert und liefert ein GeoJSON.
  Die 14 Read-Tokens bleiben server-seitig. Endpoints: `/events.geojson`,
  `/categories.json`, `/healthz`. SWR-Cache, serverseitig gedeckeltes Zeitfenster
  (Token-Schutz), CORS-Allowlist.
- **Expo-App** (`apps/app`): Karte, Liste, Filter und Detailansicht für Web, iOS
  und Android aus einer Codebasis. MapLibre (Web via `@vis.gl/react-maplibre`,
  nativ via `@maplibre/maplibre-react-native`).
- **Geteiltes Paket** (`packages/shared`): TypeScript-Typen, Kirchspiel-Mapping,
  Kirchen-Koordinaten als Fallback.
- **Landingpage** (`apps/web`) auf `moin-kark.de`, Web-App auf
  `karte.moin-kark.de` — mit sechs eigens erstellten Dithmarschen-Illustrationen
  (Deich mit Schafen, Büsumer Hafen, Meldorfer Dom, St. Bartholomäus
  Wesselburen, St. Secundus Hennstedt, Kohlfelder).
- Standort & Umkreis: Live-Standort, der Marker folgt der Bewegung; „Zu meinem
  Standort“ fällt bei fernem Standort auf die Dithmarschen-Übersicht zurück.
- Ziehbares Listen-Sheet mit drei Snap-Stufen.
- Filter: Gemeinde, Kategorie, Wochen-Vorauswahl, sichtbarer Kartenausschnitt.
- Merken & Erinnerungen: gemerkte Events persistent, lokale Benachrichtigungen
  on-device (kein Server). Im Web weisen Profil und Event-Modal darauf hin, dass
  es dort keine Erinnerungen gibt und nur lokal gemerkt wird.
- Event-Cache für Offline-Start, Onboarding-Overlay, Cluster-Tap.
- Kartenwahl: Apple/Google Maps nativ, auf Web/Desktop Google Maps im Browser.
- Branding: App-Name „Moin Kark“, Bricolage Grotesque + DM Sans,
  Küsten-Kartenstil, „Fog of War“ außerhalb Dithmarschens, App-Icon
  (Terracotta-Pin mit Kirche) in allen Varianten für iOS, Android und Web.
- Footer nach dem projektübergreifenden Branding-Pattern: App + Version,
  „Made with 🐦 in Hennstedt“, Friedensgruß.
- Mehrfach zugeordnete Events kennen jetzt alle ihre Gemeinden: Ein
  ChurchDesk-Termin kann mehreren Gemeinden gehören (die Sommerkirche hängt an
  allen sechs Eider-Gemeinden, der Abendsegen an Urlauberseelsorge + Büsum) —
  bisher zählte nur die erste. Die API liefert zusätzlich `parishes`, der
  Gemeindefilter findet den Termin über jede zugeordnete Gemeinde, die
  Detailansicht schreibt alle Namen aus („Kirchengemeinden: Kirchspiel Eider:
  Hennstedt, Weddingstedt, Lunden, Schlichting, St. Annen und Hemme“) und die
  Listenkarte zeigt kompakt „Kirchspiel Eider“. 16 Events im Feed betroffen.

### Infrastruktur

- Eigene Domain `moin-kark.de` mit vollständigem DNS (A/AAAA, Wildcard, MX, SPF,
  DKIM, DMARC, MTA-STS, TLS-RPT, CAA) und Let's-Encrypt-Zertifikaten.
- API unter `api.moin-kark.de` (Container `moinkark-api`, Apache/KeyHelp →
  Traefik). Die Alt-Domain `kkkarte.godsapp.de` bleibt vorerst in der
  CORS-Allowlist, solange Builds mit der alten URL im Umlauf sind.
- Mail-Weiterleitung `moin@moin-kark.de`.
- API läuft als Portainer-Stack `moinkark-api` (statt frei laufendem Container).
  Deploys gehen darüber, weil `docker-compose` 1.29 auf dem Server mit der
  neueren Docker-Engine bricht (`KeyError: 'ContainerConfig'`).

### Sicherheit

- `@hono/node-server` auf 2.x, `hono` auf 4.12.x, `expo` auf 56.0.18,
  `brace-expansion` auf 5.0.9, `shell-quote` auf 1.10.0.
- Dependabot-Alerts und Security-Updates aktiviert (17 → 1 offener Alert; der
  verbleibende betrifft `uuid` im Expo-Build-Tooling, kein Patch verfügbar).
- `apps/app/package-lock.json` entfernt — im npm-Workspace ist allein der
  Root-Lock maßgeblich.

### Geändert

- Redaktionelle Änderungen kommen zeitnah an: Der Server erneuert seinen Cache
  jetzt alle 5 Minuten von selbst (vorher nur, wenn jemand die API aufrief), und
  die App fragt alle 5 Minuten still über den neuen Endpunkt `/version.json` nach,
  ob sich etwas geändert hat. Die Antwort ist **42 Bytes** statt 688 KB — das
  volle GeoJSON wird nur bei einer echten Änderung nachgeladen. Zusätzlich
  Pull-to-Refresh in der Liste und `staleTime: 0` für die Events-Query.
- Listen-Sheet hat eine vierte Snap-Stufe (fast volle Höhe) und mehr Leerraum am
  Listenende. Vorher endete es bei ~412 px — die Liste scrollte zwar, aber die
  letzten Einträge lagen im abgeschnittenen Bereich unterhalb des Bildschirms.

### Behoben

- Listen-Sheet: Die letzten Einträge waren auf iOS in jeder Snap-Stufe
  unerreichbar (je nach Stufe 4–5 Termine), im Web ging alles. Wurzelursache:
  Die animierte Sheet-**Höhe** (Reanimated `useAnimatedStyle` + `height`) kam
  auf iOS nicht im Layout an — die Liste wurde inhaltsgroß und ihr Ende lag
  dauerhaft unterhalb der Bildschirmkante. Das Sheet hat jetzt eine feste Höhe
  und wird per `translateY` verschoben (Transforms laufen am Layout vorbei);
  der unter der Kante geparkte Anteil wird pro Stufe exakt berechnet und der
  Liste als Endabstand gemeldet. Der geratene 280-px-Puffer entfiel, ebenso
  der fälschlich in der Breitbild-Ansicht (statt im Sheet) deaktivierte
  Pull-to-Refresh. Mit echten Wisch-Gesten im Simulator und im Web verifiziert.
- Event-Modal: Kopfbereich fix, nur die Beschreibung scrollt; bei zu wenig Platz
  scrollt automatisch das gesamte Sheet (sonst waren die letzten Zeilen auf
  kleinen Geräten unerreichbar).
- Event-Liste im Sheet bis zum letzten Eintrag scrollbar — das Safe-Area-Padding
  saß am Container statt im Scroll-Inhalt und verkleinerte den sichtbaren
  Bereich dauerhaft.
- Reanimated-Crash beim Start; kein Fehler-Screen beim Offline-Start mit Cache.
- Erinnerungen brechen im Web nicht mehr ab (Platform-Guard).
- Dunkler Strich über dem Listen-Sheet (Rahmenkante + zu kräftiger Schatten).
- Kirche und Pastorat in Wesselburen lagen auf exakt derselben Koordinate — ein
  Pin verdeckte den anderen, der Gottesdienst war auf der Karte nicht auffindbar.
  Ursache: ChurchDesk geokodiert über die Adresse, und beide Orte sind unter
  „Marktstr. 2“ gepflegt. Neue Korrekturtabelle `LOCATION_COORD_FIXES` setzt die
  echte Position (Quelle: OpenStreetMap); `coordSource` kennt dafür den Wert `fix`.
- Neuenkirchen fehlte in der Fallback-Koordinaten-Tabelle: ChurchDesk liefert für
  diese Termine keine Koordinaten, und ohne Eintrag fiel die Gemeinde auf die
  orgId 2729 (Kirchspiel West) zurück — die Termine landeten rund 10 km entfernt
  in Büsum. St. Jacobi ist jetzt in `PARISH_COORDS` und `LOCATION_COORD_FIXES`.
- Tap auf einen Ort mit mehreren Terminen öffnete ein beliebiges Event: Bei
  deckungsgleichen Pins (St. Bartholomäus: 13 Termine) ist die vom Renderer
  gemeldete Reihenfolge zufällig. Jetzt öffnet der Tap den zeitlich nächsten
  Termin — nicht das Konzert nächste Woche statt des Gottesdienstes gleich.
- Karte sprang beim freien Navigieren ständig auf den eigenen Standort zurück:
  Der Fly-to-Effect hing an `userLocation`, und das Live-Tracking liefert alle
  25 m eine neue Position. Standort liegt jetzt in einer Ref, der Effect reagiert
  nur noch auf den Token (Start und „Zu meinem Standort“ wie bisher).
- Event-Modal ließ sich auf iOS nicht mehr scrollen und nur an einem schmalen
  Streifen zuwischen: Die Swipe-Zone lag als eigene Ebene über der ScrollView und
  hat die Touches abgefangen. Die Geste greift jetzt über das ganze Sheet, läuft
  simultan zur ScrollView und schließt nur, wenn die Liste schon oben steht.
- Platzhalterbilder zeigten irreführende Ortsmotive: Ein Meldorfer Dom stand auch
  über Terminen anderer Gemeinden. Ortsbilder erscheinen jetzt nur noch bei der
  zugehörigen Gemeinde (Büsum, Meldorf, Wesselburen, Hennstedt), alle anderen
  bekommen neutrale Landschaftsmotive.
- Veraltete Termine beim App-Start: Der Cache galt pauschal 24 Stunden und
  enthielt bei wöchentlichen Serien noch die Instanz der Vorwoche — am Sonntag
  stand dadurch ein Termin nächste Woche oben statt des Gottesdienstes am selben
  Vormittag. Der Cache gilt jetzt nur noch für den Tag, an dem er geschrieben
  wurde; zusätzlich wird beim Tageswechsel aus dem Hintergrund neu geladen.

[Unreleased]: https://github.com/Revisor01/moin-kark/commits/main
