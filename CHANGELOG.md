# Changelog

Alle nennenswerten Änderungen an diesem Projekt werden hier dokumentiert.

Das Format orientiert sich an [Keep a Changelog 1.1.0](https://keepachangelog.com/de/1.1.0/),
die Versionierung folgt [SemVer 2.0.0](https://semver.org/lang/de/).

## [Unreleased]

Noch nicht veröffentlicht. Die erste Store-Fassung wird **1.0.0** — bis dahin
sammelt sich hier alles, was seit Projektbeginn entstanden ist.

### Hinzugefügt

- **Termine teilen**: Jede Veranstaltung lässt sich über den Teilen-Knopf
  weitergeben. Beim Empfänger erscheint eine Vorschau mit Bild, Titel, Zeit und
  Ort; ein Tipp darauf öffnet genau diesen Termin — wer die App hat, landet
  direkt darin, alle anderen auf der Karte im Browser.
- **App weiterempfehlen und bewerten** im Profil.
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
  `karte.moin-kark.de` — mit eigens erstellten Dithmarschen-Illustrationen
  (Deich mit Schafen, Kohlfelder) und den Kirchen aller Gemeinden, jede mit
  ihrem Namen und alle gleich groß nebeneinander.
- Veranstaltungen ohne eigenes Foto zeigen die Kirche ihrer Gemeinde statt eines
  allgemeinen Landschaftsbildes — für 98 von 100 Terminen passt das Bild jetzt
  zum Ort.
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

- **Orts-Verwaltung `/admin`**: Koordinaten-Korrekturen lassen sich jetzt zur
  Laufzeit pflegen (Ortsname → Koordinate, Titel-Präfix → Koordinate, optional
  mit Vorrang vor ChurchDesk), statt nur hartkodiert in
  `kirchen-coords.ts`. Login per `ADMIN_TOKEN`, Ablage als JSON im
  Docker-Volume (übersteht Container-Neubauten), Speichern stößt sofort einen
  Daten-Refresh an. Die statischen Tabellen bleiben die Basis und werden in der
  Oberfläche mit angezeigt.
- **Status-Monitor `/status`** (öffentlich, auch als `/status.json`): Zustand
  der API auf einen Blick — erreichte Gemeinden, Datenstand-Alter, Eventzahl und
  vor allem die Liste aller Events, die mangels Koordinate auf einem
  Gemeinde-Fallback-Pin liegen. Neue Orte in ChurchDesk fallen damit beim
  Wochenblick auf, statt zufällig. Ein Klick in der Admin-Oberfläche übernimmt
  einen Fallback-Ort direkt als neue Korrektur.
- Kategorien-Ausschluss in der Orts-Verwaltung: `/admin` kann jetzt auch ganze
  Kategorien von der Karte nehmen (ergänzend zur festen Ausschlussliste im
  Code). Die aktuellen Feed-Kategorien werden als Klick-Vorschläge angeboten;
  „Kirchengemeinderatssitzung" ist zusätzlich fest ausgeschlossen — Nordhastedt
  pflegt KGR-Sitzungen als eigene Kategorie, und die sind nicht öffentlich.
- Orts-Verwaltung mit Minikarte und editierbaren Code-Einträgen: Die im Repo
  versionierten Korrektur-Tabellen (`kirchen-coords.ts`) erscheinen in `/admin`
  nicht mehr nur als Textliste, sondern als normale Tabellenzeilen (Herkunft
  „Code") und lassen sich direkt anpassen — gespeichert wird nur die Abweichung
  als Laufzeit-Override, Zurücksetzen auf die Originalwerte hebt sie wieder auf.
  Jede Koordinaten-Zeile hat einen 📍-Button, der die Position auf einer
  OSM-Minikarte zeigt.
- Highlight-Verwaltung in der Orts-Verwaltung: `/admin` zeigt alle Events je
  Gemeinde mit Highlight-Status (★ = ChurchDesk-Tag „KAT: Highlight", nur dort
  änderbar) und kann per Checkbox zusätzliche Admin-Highlights setzen — z.B. für
  Gemeinden, die das Tag nicht pflegen. Gespeichert wird als Event-ID-Liste in
  den Laufzeit-Overrides; Highlights zu Events außerhalb des aktuellen
  Zeitfensters bleiben beim Speichern erhalten. Die Apps sehen ein neues
  Highlight automatisch über den Versions-Hash.
- `/healthz` meldet jetzt echten Betriebszustand statt pauschal „ok":
  `ok`/`degraded` (mind. eine Gemeinde ausgefallen — z.B. abgelaufener
  Einzeltoken)/`stale` (Refresh hängt, HTTP 503) samt `orgsFailed` und
  Cache-Alter — als Andockpunkt für einen Uptime-Monitor.
- Die Datenschutzerklärung ist jetzt aus dem Profil heraus erreichbar und
  beschreibt, was die App tatsächlich tut: Standort und gemerkte Termine
  bleiben auf dem Gerät, es gibt kein Konto und keine Auswertung des
  Nutzungsverhaltens.

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

- Schutz gegen überlange Verarbeitungszeiten bei manipulierten Anfragen an die
  Termin-Schnittstelle (Sicherheitsupdate der Server-Bibliothek).
- Die Schriften der Startseite werden jetzt vom eigenen Server ausgeliefert
  statt von Google. Beim Aufruf der Seite wird damit keine Besucher-Adresse mehr
  an Dritte übertragen.
- Die Server-Umgebung ist so abgesichert, dass Zugangsdaten nicht versehentlich
  in eine ausgelieferte Fassung gelangen können, und läuft nicht mehr mit
  Vollzugriff.
- Die Kartendarstellung der Web-Fassung wurde auf eine Fassung ohne bekannte
  Sicherheitslücke gehoben. Über die alte ließ sich eingeschleuster Code
  ausführen, sobald eine Karte fremde Herkunftsangaben anzeigt — in Moin Kark
  sind diese Angaben abgeschaltet, der Weg stand hier also nicht offen.
- Sicherheitsupdates für die verwendeten Fremdbibliotheken eingespielt.
- Dependabot-Alerts und Security-Updates aktiviert.
- `apps/app/package-lock.json` entfernt — im npm-Workspace ist allein der
  Root-Lock maßgeblich.

### Geändert

- Das App-Symbol auf Android hat mehr Luft: Der Kartenzeiger saß zu dicht am
  Rand und wirkte gedrängt, jetzt steht er frei auf seinem Hintergrund.
- Auf der Karte hebt ein Tipp auf die freie Fläche die Auswahl jetzt auch in der
  iOS- und Android-Fassung wieder auf — wie in der Web-Fassung.
- Termindaten werden komprimiert übertragen: rund 90 % weniger Datenverbrauch
  beim Laden der Veranstaltungen im Mobilfunknetz.
- Änderungen an Beschreibung, Bild oder Kategorien eines Termins erreichen die
  App jetzt zuverlässig; zugleich lädt sie nicht mehr grundlos den gesamten
  Bestand neu, wenn sich inhaltlich nichts geändert hat.
- Lange Terminlisten scrollen flüssiger.
- Offline-Start am neuen Tag zeigt jetzt den letzten bekannten Stand (bis zu
  7 Tage alt) statt des Fehlerscreens. Der frühere harte Tageswechsel-Verwurf
  schützte vor falsch sortierten Vorwochen-Terminen — das erledigt inzwischen
  der `isPast`-Filter beim Laden, der Verwurf bestrafte nur noch den Start im
  Funkloch.
- Das API-Zeitfenster ist serverseitig fest (heute + 60 Tage). Die
  `?from=`/`?to=`-Parameter sind entfernt: Kein Client nutzte sie, aber jeder
  beliebige Wert erzeugte einen eigenen ~700-KB-Cache-Eintrag samt kompletter
  14-Org-Fetch-Kaskade — ein gefundenes Fressen für neugierige Skripte.
- Frühjahrsputz vor dem Launch: tote Props und Exports entfernt (u.a.
  `selectedId`/`dimmed` am Karten-Vertrag, `topInset`/`subtitle` am Sheet,
  Reste des nie gebauten Umkreisfilters), ungenutzte Font-Dependency
  `@expo-google-fonts/space-grotesk` raus, `isPast`-Duplikat im Event-Cache
  durch Import ersetzt, redundante Kategorie-Farben und CSS-Reste der
  Landingpage bereinigt. Netto −54 Zeilen, verhaltensgleich.
- Redaktionelle Änderungen kommen zeitnah an: Der Server erneuert seinen Cache
  jetzt alle 5 Minuten von selbst (vorher nur, wenn jemand die API aufrief), und
  die App fragt alle 5 Minuten still über den neuen Endpunkt `/version.json` nach,
  ob sich etwas geändert hat. Die Antwort ist **42 Bytes** statt 688 KB — das
  volle GeoJSON wird nur bei einer echten Änderung nachgeladen. Zusätzlich
  Pull-to-Refresh in der Liste und `staleTime: 0` für die Events-Query.
- Listen-Sheet hat eine vierte Snap-Stufe (fast volle Höhe) und mehr Leerraum am
  Listenende. Vorher endete es bei ~412 px — die Liste scrollte zwar, aber die
  letzten Einträge lagen im abgeschnittenen Bereich unterhalb des Bildschirms.
- Die Terminkarten in der Liste wachsen mit der Systemschriftgröße mit (bis
  150 %), damit Ort und Kategorie bei großer Schrift nicht abgeschnitten werden.
  Darüber bleibt die Schrift auf den Karten gedeckelt — sonst passte nur noch
  ein Eintrag ins Listen-Sheet.
- Kleine Bedienelemente reagieren jetzt auf eine größere Tippfläche:
  „Zurücksetzen“ und die Auswahl-Chips im Filter, „Schließen“ im Profil, Herz
  und „Schließen“ in der Terminansicht.
- Kartenschwenken mit offener Liste ruckelt weniger: Die sichtbaren Terminkarten
  rendern nicht mehr bei jeder Positionsmeldung und jedem Minutentakt neu, und
  die Zeitformatierung baut ihre Werkzeuge einmal statt vier neue je Karte und
  Render.
- Nebentexte (Datum, Ort, Hinweise, Fußzeilen) sind etwas dunkler und damit
  besser lesbar: Der Grauton erreicht jetzt das Kontrastverhältnis 4,5:1, das
  für Fließtext empfohlen wird — vorher waren es 2,9:1. Kleine Textgrößen sind
  zugleich auf wenige feste Stufen vereinheitlicht; einzelne Zeilen sind dadurch
  um ein Pixel größer oder kleiner als bisher.

### Behoben

- Beim Teilen aus der App kam auf dem iPhone nur eine graue Textblase an: kein
  Vorschaubild, und ein Tipp darauf öffnete weder die Seite noch die App. Jetzt
  erscheint die Vorschau mit Bild, und der Link führt zum Termin.
- Ein geteilter Termin-Link zeigte im Browser die Begrüßung statt des Termins:
  Wer ihn zum ersten Mal öffnete, landete hinter „Kirche. In deiner Nähe." und
  musste sie erst wegtippen. Jetzt öffnet sich der Termin sofort; die Begrüßung
  kommt beim nächsten Besuch ohne Link.
- In der Terminliste war von den Ortsbildern nur ein schmaler Ausschnitt zu
  sehen — bei Hennstedt etwa nur die Turmspitze statt der Kirche. Die Motive
  gibt es jetzt in einem eigenen Zuschnitt für die Liste; das Gebäude ist
  vollständig und unverzerrt zu sehen. In der Detailansicht bleibt das
  bisherige Breitbild.
- Die Web-Fassung startete nicht mehr: Beim Öffnen brach sie mit einem Fehler
  ab, weil sie eine Funktion für Mitteilungen aufrief, die es nur auf dem Handy
  gibt. Auch die Zurück-Navigation warf dort einen Fehler.
- Auf der Karte fehlten ausgerechnet die Namen der Orte, an denen etwas
  stattfindet — Büsum, Meldorf, Heide, Wesselburen und Albersdorf blieben
  unbeschriftet, während kleine Weiler ihren Namen trugen. Jetzt stehen die
  Städtenamen auf der Übersicht; Dörfer erscheinen erst, wenn man weit
  hineinzoomt.
- Beim Öffnen zeigt die Karte jetzt die eigene Umgebung, sobald der Standort
  freigegeben ist. Bisher blieb sie oft auf der Dithmarschen-Übersicht stehen,
  weil dafür zusätzlich ein Termin in der Nähe liegen musste.
- Erinnerungen konnten trotz Einstellung „Aus" verschickt werden, wenn die App
  gestartet wurde, bevor die gespeicherte Einstellung gelesen war.
- Wurde ein Termin schnell hintereinander gemerkt und wieder entfernt, blieb
  die Erinnerung mitunter bestehen und meldete sich für einen Termin, den man
  gar nicht mehr gemerkt hatte. Mehrfaches Planen konnte zudem doppelte
  Benachrichtigungen erzeugen.
- Erinnerungen sagten „Morgen", obwohl der Termin am Tag der Zustellung
  bereits „Heute" war.
- Zwischen Mitternacht und den frühen Morgenstunden konnten Termine des
  Vortags in der Liste auftauchen.
- Der Filter „Wochenende" zeigte am Wochenende selbst zusätzlich das
  übernächste Wochenende an.
- Blieb die App lange offen, verschwanden abgelaufene Termine nicht von selbst
  aus Liste und Karte.
- Auf Android war „Apple Karten" voreingestellt: „Auf Karte öffnen" landete im
  Browser statt in der installierten Karten-App. Die Auswahl erscheint jetzt
  nur noch dort, wo es wirklich etwas zu wählen gibt.
- Karte und Liste wurden bei eingeschaltetem Standort im Sekundentakt neu
  aufgebaut — spürbar als Ruckeln und erhöhter Akkuverbrauch beim Gehen.
- Sonderzeichen in Beschreibungen (Anführungszeichen, Gedankenstriche,
  Euro-Zeichen) erschienen als kryptische Zeichenfolgen. Zugleich wurden
  Hinweiszeilen wie „ACHTUNG: Einlass ab 19 Uhr" nicht mehr fälschlich
  ausgeblendet.
- Öffnete man über eine Mitteilung direkt einen anderen Termin, startete die
  Beschreibung mitten im Text.
- Die Standortabfrage erscheint jetzt erst nach der Einführung beim ersten
  Start — vorher schob sie sich darüber, bevor der Zweck erklärt war.
- Veranstaltungen auf Helgoland wurden rund 65 Kilometer entfernt in Büsum
  angezeigt. Auch Lohe-Rickelshof, Pahlen und Delve sitzen jetzt auf ihren
  tatsächlichen Kirchenstandorten.
- In der Ortsverwaltung führte ein leer gelassenes Koordinatenfeld dazu, dass
  alle Termine des Ortes stillschweigend in den Atlantik verschoben wurden;
  solche Eingaben werden jetzt mit einem Hinweis abgelehnt. Gespeicherte
  Korrekturen greifen außerdem zuverlässig sofort statt teils erst später.
- Endzeiten wurden bei Terminen über einen Monatswechsel hinweg falsch
  dargestellt.
- ChurchDesk-Totalausfall (Wartungsfenster, Netzstörung) hätte alle Karten
  geleert: Fielen alle 14 Gemeinden gleichzeitig aus, lieferte der Aggregator
  „erfolgreich" eine leere Collection — der Cache übernahm sie, der
  Versions-Hash änderte sich und jedes Gerät ersetzte seinen lokalen Bestand
  durch nichts. Jetzt wirft der Aggregator bei 0 erreichten Gemeinden einen
  Fehler und der Cache behält den letzten guten Stand (stale-while-revalidate
  wie designed).
- ChurchDesk-Requests haben jetzt ein 15-Sekunden-Timeout. Vorher galt der
  undici-Default (~5 Minuten) — ein einziges hängendes ChurchDesk blockierte
  jeden Cold-Start und Refresh-Durchlauf, und das In-flight-Dedup hielt den
  hängenden Promise zusätzlich fest.
- Cache-Speicherleck geschlossen: Das mit dem Datum wandernde Zeitfenster
  erzeugte täglich einen neuen Cache-Key, alte Einträge (~700 KB) blieben für
  immer liegen. Der Cache verwirft jetzt die ältesten Einträge über einem
  Deckel.
- Deploy-Anleitung im README deployte nicht: `docker restart` startet den
  alten Container mit dem alten Image neu — das frisch gebaute Image wurde nie
  übernommen. Dokumentierter Weg ist jetzt der Portainer-Redeploy.
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
- Termine bleiben nachts sichtbar, auch wenn ChurchDesk gerade nicht erreichbar
  ist: Bisher galt der Datenstand um Mitternacht als nicht vorhanden, die Karte
  bekam dann statt der Termine vom Abend einen Fehler — und die erste Abfrage
  nach Mitternacht wartete auf das komplette Neuladen aller Gemeinden. Jetzt
  liefert die Schnittstelle den letzten Stand sofort weiter und lädt den neuen
  Tag im Hintergrund nach.
- Das Zeitfenster der Termine umfasste rund um die Zeitumstellung einen Tag zu
  wenig oder zu viel; es sind jetzt immer genau 60 Kalendertage ab heute.
- Änderungen an Ganztägig-Kennzeichnung, Endzeit-Anzeige, Ansprechperson, Ort,
  Postleitzahl oder Gemeindezuordnung eines Termins kamen nicht bei den Geräten
  an, solange sich sonst nichts änderte.
- Die in der Orts-Verwaltung gepflegten Korrekturen, Kategorie-Ausschlüsse und
  Highlights konnten komplett verloren gehen: Ließ sich die Ablage nach einem
  Neustart nicht lesen, zeigte die Verwaltung nur den Code-Stand — und der
  nächste Klick auf „Speichern" überschrieb damit alles Gepflegte. Speichern ist
  in diesem Fall jetzt gesperrt und die Verwaltung sagt warum; außerdem bleibt
  vor jedem Speichern eine Sicherungskopie des vorherigen Stands liegen.
- Eine in der Orts-Verwaltung ausgeschlossene Kategorie mit doppeltem Leerzeichen
  im Namen (kommt in ChurchDesk vor) galt als ausgeschlossen, die Termine
  blieben aber auf der Karte. Der Ausschluss greift jetzt unabhängig von
  Leerzeichen; die Kategorienliste fasst solche Schreibweisen zusammen.
- Eine veraltete Vorgabe erlaubte der Kartendarstellung, hinter die gerade
  angehobene Fassung zurückzufallen — also genau in den Fehler, der zuvor
  behoben wurde. Die Vorgabe ist entfernt.
- Der eigene Standort fehlte manchmal komplett — kein blauer Punkt, kein
  Sprung in die Nähe — und kam erst nach einem Neustart der App wieder. Schlug
  die allererste Ortung nach dem Start fehl (kaltes GPS, im Gebäude), gab die
  App die Ortung still auf. Jetzt erscheint sofort der zuletzt bekannte
  Standort, die Ortung läuft unabhängig vom ersten Versuch weiter, und ein
  abgerissenes Standort-Signal wird von selbst wieder aufgenommen — auch beim
  Zurückkehren in die App. Im Browser bleibt die Ortung außerdem nicht mehr
  endlos in der Warteschleife hängen.
- Android: Die Zurücktaste schließt jetzt die offene Terminansicht, den Filter
  oder das Profil, statt die App in den Hintergrund zu schicken — beim
  Zurückholen war das Sheet dann noch offen.
- Filter und Profil endeten auf iPhones mit Home-Indicator zu dicht an der
  Bildschirmkante; der Button „… Veranstaltungen zeigen“ lag in der Zone der
  System-Geste.
- Screenreader: Der Griff des Listen-Sheets ist jetzt bedienbar — die Stufe
  wird angesagt, Wischen nach oben oder unten vergrößert oder verkleinert die
  Liste. Vorher blieb die Liste für VoiceOver-Nutzer ein Ein-Karten-Fenster.
  Die Auswahl-Schalter im Profil melden Rolle und aktiven Zustand, der
  Karten-Button in der Terminansicht seine Rolle.
- Ein Tipp auf eine Erinnerung öffnet den Termin jetzt auch, wenn die App zuvor
  vollständig beendet war — bisher startete sie dann nur auf der Karte.
- Schlägt das Laden der Schriften fehl, startet die App mit der Systemschrift,
  statt dauerhaft eine leere Fläche zu zeigen.
- Die Terminansicht sprang beim Lesen an den Anfang, sobald frische Daten den
  zwischengespeicherten Stand ablösten (etwa eine Sekunde nach dem Start).
- Beim schnellen Scrollen langer Listen erschienen die unteren Einträge
  verspätet: Die Positionsrechnung der Liste ließ Rahmen und oberen Abstand
  aus und lag nach 50 Einträgen über 100 Pixel daneben.
- Der Standort-Marker auf der Karte wurde bei jeder Kartenbewegung neu
  gesetzt, auch wenn sich die Position nicht geändert hatte.
- Fällt beim Aktualisieren eine einzelne Gemeinde aus, nennt die Schnittstelle
  jetzt, welche — die App kann deren gemerkte Termine damit schonen, statt sie
  für abgesagt zu halten und falsche Absage-Mitteilungen zu verschicken.
- Ein einziger unbrauchbarer Termin einer Gemeinde (etwa eine Kategorie ohne
  Namen) ließ die Aktualisierung für alle Gemeinden scheitern. Der Termin wird
  jetzt übersprungen, alle anderen kommen an.
- In der Orts-Verwaltung ließ sich „Überstimmt ChurchDesk" bei einem im Code
  vorgegebenen Eintrag nicht abwählen: Die Oberfläche zeigte das Häkchen als
  entfernt, die Karte verwendete weiterhin die überstimmende Position.
- Fehlte für eine Gemeinde der Zugang, meldete der Zustand der Schnittstelle
  weiter „ok", obwohl deren Termine dauerhaft fehlten. Das zählt jetzt als
  eingeschränkter Betrieb und steht in den Zustandsangaben.
- Fehlermeldungen der Schnittstelle nannten Einzelheiten aus dem Inneren des
  Servers (Namen von Umgebungsvariablen, Dateipfade). Nach außen gehen jetzt
  feste Texte; in der Orts-Verwaltung sind Eingabefehler von Speicherfehlern
  unterscheidbar.
- Die Orts-Verwaltung nahm ein beliebig kurzes Zugangs-Token an und ließ
  unbegrenzt viele Anmeldeversuche zu. Jetzt gilt eine Mindestlänge (sonst
  bleibt die Verwaltung abgeschaltet), und nach zehn Fehlversuchen von einer
  Adresse ist eine Minute Pause.
- Die Zustandsangaben des Feeds beschrieben `from`/`to` als Zeitfenster; sie
  sind aber Zeitpunkte. Das tatsächliche Fenster steht jetzt als Kalendertage
  in eigenen Feldern, und das Lebenszeichen unter `/` ist dokumentiert.
- Fiel bei der Aktualisierung eine einzelne Gemeinde vorübergehend aus, meldete
  die App für jeden gemerkten Termin dieser Gemeinde fälschlich „Veranstaltung
  entfällt“, löschte die Erinnerung und plante sie auch dann nicht mehr, wenn
  die Gemeinde wieder erreichbar war. Termine gerade nicht erreichbarer
  Gemeinden werden jetzt geschont, und fehlende Erinnerungen gemerkter Termine
  werden beim nächsten Abgleich nachgeplant.
- Verschobene oder abgesagte gemerkte Termine wurden erst beim übernächsten
  Start gemeldet — oft erst nach dem Termin — und die Erinnerung blieb bis dahin
  auf der alten Uhrzeit stehen. Der Abgleich läuft jetzt gegen die frisch
  geladenen Daten, auch bei jeder Aktualisierung in laufender Sitzung.
- Entfallene Termine blieben unsichtbar in der Merkliste und zählten im Profil
  weiter mit.
- Schlug bei „Vorabend und 2 Stunden vorher“ die zweite Planung fehl, ließ sich
  die erste Erinnerung nicht mehr abbrechen und meldete sich für einen längst
  entmerkten Termin.
- Ein Herz-Tipp direkt nach dem Start konnte die gespeicherte Merkliste
  überschreiben; ließ sich der Speicher nicht lesen, blieben Abgleich und
  Aufräumen dauerhaft stumm.
- Bei vielen gemerkten Terminen gingen auf iOS die spätesten Erinnerungen still
  verloren (Systemgrenze für ausstehende Mitteilungen). Geplant werden jetzt die
  nächsten 30 Termine; weitere rücken bei jedem Abgleich nach.

### Sonstiges

- Tests und Typecheck laufen bei jeder Änderung automatisch, dazu wöchentlich
  eine Prüfung auf neu gemeldete Sicherheitslücken in den verwendeten
  Fremdbibliotheken.
- Doppelte Logik zusammengeführt: Der Berliner Kalendertag, die Auswahl des
  nächsten Termins an einem Pin und die Kategorie-Form der Schnittstelle haben
  jetzt je eine gemeinsame Quelle für Server und App; intern genutzte Werte sind
  nicht mehr nach außen sichtbar. Verhaltensgleich.
- Der Feed trägt jetzt eine Kennung und darf eine Minute zwischengespeichert
  werden; wer den Stand schon hat, bekommt eine leere Kurzantwort statt der
  vollen Übertragung.
- Farben, Abstände, Schriften und Textgrößen von App, Startseite und
  Betriebsseiten kommen jetzt aus einer gemeinsamen Quelle; die Startseite
  bekommt ihre Werte als erzeugte Datei, ein Test hält beides auf einem Stand.
- Die Store-Fassungen für iOS und Android entstehen jetzt reproduzierbar aus
  einem festen Stand statt vom Entwickler-Rechner; Version und Build-Nummern
  haben dafür eine einzige Quelle, und ein Test wacht darüber, dass ein
  Android-Release nie mit dem Entwicklungsschlüssel signiert wird.

[Unreleased]: https://github.com/Revisor01/moin-kark/commits/main
