# Testers-Community-Bericht — Inhalt und Abgleich mit dem Code

Stand: 23.09.2026. Quelle: drei Dokumente der Testers Community (Feedback-Report,
Production-Access-Questionnaire, ASO-Report), eingegangen im Rahmen des bezahlten
Closed-Testing-Durchlaufs für den Play-Store-Zugang.

Dieses Dokument hält fest, **was der Bericht sagt**, und daneben, **was davon im
Code tatsächlich fehlt**. Jeder Feature-Punkt wurde gegen `apps/app` geprüft;
Belege als Dateipfad. Was hier als „fehlt“ steht, ist gesucht und nicht gefunden
worden — nicht geschätzt.

## Zusammenfassung

Der Bericht nennt fünf Verbesserungspunkte. Zwei davon sind echte Lücken im Code
(**App bewerten**, **App teilen**), einer liegt bereits in Arbeit
(**Screenshots**), einer ist eine Sprachfrage (**ASO**), einer beruht auf einer
falschen Annahme über deutsche Typografie (**Gedankenstriche**).

Bei der Prüfung ist zusätzlich eine Lücke aufgefallen, die der Bericht **nicht**
nennt: Es gibt **keinerlei Teilen-Funktion**, auch nicht für einzelne Termine.
Für eine App, deren Zweck das Weitersagen von Veranstaltungen ist, wiegt das
schwerer als der App-Empfehlungs-Button, den der Bericht vorschlägt.

Der ASO-Report bewertet die App als englischsprachige App (Primär-Keyword
`local church events`, Titelvorschlag „Moin Kark: Local Church Events“) und
verwirft den vorgegebenen deutschen Suchbegriff mit der Begründung, er enthalte
einen fremdsprachigen Ortsnamen. Da Moin Kark eine deutschsprachige App für den
Kirchenkreis Dithmarschen ist, gehen alle sechs Keyword-Checks und damit die
Gesamtnote 47/100 an der App vorbei. **Entscheidung: ASO wird selbst gemacht.**

## Feature-Punkte: Soll und Ist

| Punkt aus dem Bericht | Stand im Code | Beleg |
|---|---|---|
| App bewerten | **fehlt** | kein `expo-store-review`, kein Store-Link, nichts in `package.json` |
| App teilen | **fehlt** | kein `Share`, kein `expo-sharing`, kein `ACTION_SEND` |
| Termin teilen (nicht im Bericht) | **fehlt** | `components/EventSheet.tsx` kennt nur Merken, Schließen, Karten-App |
| Onboarding einführen | **existiert** | `components/OnboardingOverlay.tsx`, 2 Schritte, einmalig per `kkd:onboardingSeen` |
| Benachrichtigungen konfigurierbar | **existiert** | `components/ProfileSheet.tsx:111` — Vorabend / 2 Std / Beides / Aus |
| Mehr Screenshots | offen, in Arbeit | wird mit Texten neu erstellt |
| Gedankenstriche ersetzen | **nicht umsetzen** | im Deutschen korrekte Typografie |
| Barrierefreiheit | teilweise | `fontScale` wird ausgewertet (Deckel 1.5), 13× `accessibilityLabel`, keine In-App-Schriftgröße, kein Dark Mode |

### Was fehlt, im Detail

**App bewerten.** Repo-weit kein Treffer für `expo-store-review`, `StoreReview`,
`requestReview`, `market://` oder einen Store-Link. Das Paket ist keine
Abhängigkeit in `apps/app/package.json`. Der Footer des Profil-Sheets
(`components/ProfileSheet.tsx:175–233`) enthält Datenschutz, Version, Träger und
Attribution — keinen Bewertungs-Eintrag.

**App teilen und Termin teilen.** Weder `Share.share` aus React Native noch
`expo-sharing`, `react-native-share`, `UIActivityViewController` oder
`Intent.createChooser`. Sämtliche „Share“-Treffer im Repo sind das
Workspace-Paket `@moinkark/shared` oder Reanimateds `useSharedValue`. Ausgehende
Links gibt es nur zu Karten-Apps (`lib/maps.ts`) und Webseiten im Footer.

### Was schon da ist

**Onboarding.** `components/OnboardingOverlay.tsx` — Vollbild-Modal mit zwei
Schritten (Merken, Erinnern lassen), beide untereinander auf einer Karte, kein
Slider. Erscheint nur beim ersten Start; der Standort-Dialog kommt bewusst erst
danach (`app/index.tsx:63–66`).

**Erinnerungen.** Rein lokale Benachrichtigungen über `expo-notifications`
(`lib/reminders.ts`), kein Server-Push. Global einstellbar im Profil-Sheet unter
„Erinnerung“, persistiert als `kkd:reminderPref`. Pro Termin gibt es keine
eigene Vorlaufzeit — Erinnerungen hängen am Merken (Herz) plus globaler
Voreinstellung. Auf Web sind die Funktionen No-ops mit Hinweistext.

**Profil-Sheet** (die faktischen Einstellungen, kein eigener Screen): Karten-App
(nur iOS), Erinnerung, gemerkte Veranstaltungen, Footer mit Datenschutz,
Version, Träger, Attribution. Nicht enthalten: Bewerten, Teilen, Impressum,
Feedback, Theme-Wahl, Schriftgröße.

## ASO-Report: warum die Bewertung nicht greift

Der Report vergibt 47/100 (Note F) mit folgender Aufteilung: Search & Keywords
7/24, Policy Compliance 12/12, Conversion 3/11.

Der Prüflauf ersetzt den vorgegebenen Suchbegriff „Veranstaltungen Dithmarschen“
durch `local church events` mit der Begründung, „kark“ sei kein englisches Wort
und der Ortsname sei fremdsprachig. Alle sechs Keyword-Checks werden anschließend
gegen den englischen Begriff gescort. Für eine deutschsprachige Regional-App ist
das Ergebnis damit gegenstandslos, ebenso der Titelvorschlag
„Moin Kark: Local Church Events“.

**Brauchbar aus dem Report, unabhängig von der Sprache:**

- Titel nutzt 9 von 30 Zeichen — Platz für einen deutschen Zusatz.
- Kurzbeschreibung nutzt 46 von 80 Zeichen.
- Beschreibung ist unstrukturiert; Gliederung mit Überschriften und Listen hilft.
- Store-Listing-Experimente in der Play Console (A/B-Test, kostenlos).
- Bewertungs-Abfrage nach einem positiven Moment auslösen, nicht beim Start.

**Nicht übernehmen:**

- Beschreibung auf 3.000 Zeichen aufblähen — Länge allein rankt nicht.
- Listing für „top 3 markets“ lokalisieren — die App bedient einen Landkreis.
- Gedankenstriche durch Bindestriche ersetzen — im Deutschen schlicht falsch.

## Production-Access-Fragebogen

Der Bericht liefert vorformulierte Antworten für Googles Formular. Diese Antworten
beschreiben Dinge, die so nicht stattgefunden haben: Umfragen und
Usability-Sitzungen mit Teilnehmenden, bereits umgesetzte Änderungen (Screenshots,
Bewerten, Teilen), eine Erwartung von 10k–100k Installationen im ersten Jahr.

Die Antworten werden **selbst geschrieben** und geben den tatsächlichen Verlauf
wieder. Die Fragenstruktur des Dokuments ist dafür nutzbar, der Text nicht.
Dithmarschen hat rund 133.000 Einwohner — die Installationsprognose ist
entsprechend zu wählen.

## Was der Testbericht wert ist

Der Feedback-Teil bescheinigt fehlerfreien Betrieb auf allen Geräten und
SDK-Konfigurationen, empfiehlt an anderer Stelle aber, ein Onboarding und
konfigurierbare Benachrichtigungen einzuführen — beides existiert. Die
Empfehlungen lesen sich als Textbausteine, nicht als Beobachtungen an dieser App.

Der geschäftliche Zweck des Dienstes ist erfüllt: Er stellt die zwölf Tester über
vierzehn Tage, die Google für den Production-Access verlangt. Die inhaltlichen
Berichte sind eine Dreingabe und ersetzen keine eigene Prüfung.

## Offene Punkte für die nächste Version

1. **App bewerten** — für beide Stores, im Profil-Sheet.
2. **Teilen** — Termin teilen wiegt schwerer als die App-Empfehlung.
3. **Screenshots** mit Texten (in Arbeit, außerhalb des Codes).
4. **Store-Texte** auf Deutsch überarbeiten: Titelbudget nutzen,
   Kurzbeschreibung füllen, Beschreibung gliedern.
5. **Fragebogen** wahrheitsgemäß selbst schreiben.

Für 1 und 2 sind `versionCode` und CHANGELOG-Eintrag mitzuziehen; die
Antwortformen der API sind davon nicht betroffen.
