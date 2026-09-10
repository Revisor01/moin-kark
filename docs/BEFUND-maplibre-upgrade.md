# Offen: maplibre-gl 6.x bricht die Web-Karte

**Stand:** 10.09.2026 · **Betrifft:** `apps/app` (Web-Fassung)

## Worum es geht

`maplibre-gl` 5.24.0 hat eine als kritisch eingestufte Lücke
([GHSA-jrc7-96c5-q579](https://github.com/advisories/GHSA-jrc7-96c5-q579), CVSS 10.0):
Der HTML-Sanitizer iteriert über eine lebende `NamedNodeMap`, während er
Attribute entfernt, und überspringt dabei jedes zweite. Behoben ab **6.4.1**
(`Array.from(t.attributes)` statt der lebenden Liste).

## Warum wir trotzdem auf 5.24 bleiben

Der Sprung auf 6.4.1 wurde versucht und **wieder zurückgenommen**: Die Karte
rendert damit nicht mehr.

Gemessen mit demselben Test gegen beide Fassungen (Web-Build, echter Browser,
API-Antworten abgefangen):

| | 5.24.0 | 6.4.1 |
|---|---|---|
| Karten-Container | ja | ja |
| Canvas (820×621, sichtbar) | ja | ja |
| TileJSON angefragt | ja | ja |
| **Kacheln angefragt** | **ja** | **nein** |
| **Karte sichtbar** | **ja** | **nein** |
| Konsolenfehler | 0 | 0 |

Die Karte bricht **still** ab: Sie holt noch die TileJSON von
`tiles.openfreemap.org/planet`, fragt danach aber keine einzige Kachel mehr an.
Keine Fehlermeldung, kein Absturz — die Fläche bleibt einfach leer.

## Einschätzung zum Risiko

Der Angriffsweg der Lücke führt über die Herkunftsangaben (Attribution) fremder
Kartenstile. In diesem Projekt ist die Attribution-Control in beiden Fassungen
abgeschaltet (`attributionControl={false}` in `EventMap.web.tsx`,
`attribution={false}` in `EventMap.native.tsx`), der Kartenstil steht in
`mapStyle.ts` im eigenen Code, und es gibt weder Popups noch `setHTML`.
**Der Weg steht hier nicht offen** — das ist eine Einschätzung, keine Garantie.

## Verdacht

`@vis.gl/react-maplibre@8.1.2` dürfte auf die 5.x-Interna angewiesen sein. Die
Peer-Angabe (`maplibre-gl: >=4.0.0`) ist zu weit gefasst und deckt den Bruch
nicht auf. Die Breaking Changes von 6.0, die das Projekt direkt beträfen
(`map.transform`, `styleimagemissing`, umbenannte Event-Klassen,
`GeoJSONSource.setData`, Legacy-Expressions), wurden geprüft und **werden nicht
genutzt** — der Bruch liegt tiefer, vermutlich in der Anbindung.

## Nächste Schritte

1. Prüfen, ob eine neuere `@vis.gl/react-maplibre` 6.x unterstützt (8.1.3 ist
   die neueste, Changelog schweigt dazu).
2. Notfalls beim Projekt nachfragen oder die Web-Karte direkt gegen
   `maplibre-gl` binden, ohne die React-Anbindung.
3. Bis dahin: auf 5.24 bleiben und die Einschätzung oben regelmäßig prüfen —
   sobald Popups, `setHTML` oder fremde Kartenstile dazukommen, gilt sie nicht
   mehr.
