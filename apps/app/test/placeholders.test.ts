import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Die Platzhalter-Motive liegen in zwei Zuschnitten vor, weil Liste und
 * Detailansicht gegensätzliche Formate haben. Wird ein Motiv ausgetauscht und
 * dabei das Seitenverhältnis verfehlt, fällt das auf dem Gerät erst auf, wenn
 * jemand hinsieht: In der Liste blieb vom Panorama (2,36:1) im fast
 * quadratischen Rahmen nur ein Streifen übrig — bei Hennstedt die Turmspitze,
 * das Kirchenschiff lag außerhalb.
 */
const ASSETS = join(__dirname, "..", "assets");
const MOTIVE = [
  "deich",
  "kohl",
  "buesum",
  "meldorf",
  "wesselburen",
  "hennstedt",
  "brunsbuettel",
  "michaelisdonn",
  "marne",
  "albersdorf",
  "burg",
  "heide",
  "eddelak",
  "pahlen",
  "weddingstedt",
  "woehrden",
  "koege",
  "neuenkirchen",
  "wesseln",
  "hemmingstedt",
];

/** Breite/Höhe eines Bildes über `sips` (macOS) — auf anderen Systemen übersprungen. */
function seitenverhaeltnis(datei: string): number {
  const out = execFileSync("sips", ["-g", "pixelWidth", "-g", "pixelHeight", datei], {
    encoding: "utf8",
  });
  const w = Number(/pixelWidth:\s*(\d+)/.exec(out)?.[1]);
  const h = Number(/pixelHeight:\s*(\d+)/.exec(out)?.[1]);
  return w / h;
}

const hatSips = (() => {
  try {
    execFileSync("sips", ["--help"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
})();

describe("Platzhalter-Motive", () => {
  it("liegen in beiden Zuschnitten vor", () => {
    for (const m of MOTIVE) {
      expect(existsSync(join(ASSETS, `ph-${m}.jpg`)), `ph-${m}.jpg fehlt`).toBe(true);
      expect(existsSync(join(ASSETS, `ph-${m}-wide.jpg`)), `ph-${m}-wide.jpg fehlt`).toBe(true);
    }
  });

  it.skipIf(!hatSips)("sind in der Listen-Fassung nahezu quadratisch", () => {
    // Rahmen in EventCard: 96 pt breit, ~98 pt hoch → 0,98. Toleranz 0,1, damit
    // ein leicht anderer Zuschnitt nicht scheitert, ein Panorama (2,36) aber schon.
    for (const m of MOTIVE) {
      const v = seitenverhaeltnis(join(ASSETS, `ph-${m}.jpg`));
      expect(v, `ph-${m}.jpg ist ${v.toFixed(2)}:1 statt ~0,98:1`).toBeGreaterThan(0.88);
      expect(v, `ph-${m}.jpg ist ${v.toFixed(2)}:1 statt ~0,98:1`).toBeLessThan(1.08);
    }
  });

  it.skipIf(!hatSips)("sind in der Detail-Fassung breit", () => {
    // Detailansicht: volle Breite × 200 pt. Die Originale sind 900×381 ≈ 2,36:1.
    for (const m of MOTIVE) {
      const v = seitenverhaeltnis(join(ASSETS, `ph-${m}-wide.jpg`));
      expect(v, `ph-${m}-wide.jpg ist ${v.toFixed(2)}:1 statt ~2,36:1`).toBeGreaterThan(1.8);
    }
  });
});

describe("Zuordnung Gemeinde → Motiv", () => {
  // Die Schlüssel müssen exakt den Werten entsprechen, die aus ChurchDesk
  // kommen (kleingeschrieben). Zwei Fälle greifen sonst still daneben und
  // niemand merkt es, weil dann einfach ein Landschaftsmotiv erscheint:
  //   - „KG Heide" trägt das Präfix; ein Schlüssel „heide" träfe nie zu.
  //   - Bei St. Michaelisdonn schwankt die STADT zwischen „Sankt" und „St.",
  //     der Kirchspiel-Name nicht. Weil `parish` zuerst geprüft wird, genügt
  //     der eine Eintrag — solange er exakt so geschrieben ist.
  const schluessel = [
    "büsum",
    "meldorf",
    "wesselburen",
    "hennstedt",
    "brunsbüttel",
    "st. michaelisdonn",
    "marne",
    "albersdorf",
    "burg",
    "kg heide",
    "eddelak",
    "pahlen und delve",
    "weddingstedt",
    "wöhrden",
    "vereinigte süderdithmarscher köge",
    "neuenkirchen",
    "kirche wesseln",
    "kg hemmingstedt",
  ];

  // `placeholders.ts` lässt sich hier nicht importieren: `require()` auf ein
  // JPG kann nur der Metro-Bundler, nicht Vitest. Deshalb wie beim Bildrahmen
  // unten gegen den Quelltext prüfen.
  const quelle = readFileSync(join(__dirname, "..", "lib", "placeholders.ts"), "utf8");

  it("kennt jede Gemeinde in beiden Zuschnitten", () => {
    for (const k of schluessel) {
      // In der Objektliteral-Schreibweise steht der Schlüssel mit Punkt oder
      // Leerzeichen in Anführungszeichen, ein einfacher ohne.
      const muster = new RegExp(`(^|[{,\\s])"?${k.replace(".", "\\.")}"?:`, "gu");
      const treffer = quelle.match(muster)?.length ?? 0;
      expect(treffer, `„${k}" steht ${treffer}× statt 2× (Liste + Detail)`).toBe(2);
    }
  });

  it("verweist für jede Gemeinde auf beide Bilddateien", () => {
    // Datei fehlt → der Bundler bricht erst auf dem Gerät ab.
    for (const m of MOTIVE) {
      expect(quelle, `ph-${m}.jpg wird nirgends eingebunden`).toContain(`ph-${m}.jpg`);
      expect(quelle, `ph-${m}-wide.jpg wird nirgends eingebunden`).toContain(`ph-${m}-wide.jpg`);
    }
  });

  it("schreibt Schlüssel klein — sonst greift der Abgleich nie", () => {
    // placeholderFor() vergleicht gegen name.trim().toLowerCase(); ein Schlüssel
    // mit Großbuchstaben träfe niemals zu und fiele still auf Deich/Kohl zurück.
    for (const k of schluessel) {
      expect(k, `„${k}" ist nicht kleingeschrieben`).toBe(k.toLowerCase());
    }
  });
});

describe("Bildrahmen der Listenkarte", () => {
  it("setzt eine feste Bildhöhe statt alignSelf:stretch", () => {
    // Der Fehler, den das verhindert: Mit `alignSelf: "stretch"` und ohne Höhe
    // zog das Bild die Zelle im Web auf seine NATÜRLICHE Höhe (381 px). Die
    // Karte schnitt bei 106 px ab — sichtbar war nur das obere Viertel, bei
    // Hennstedt Himmel und Turmspitze. Im Browser gemessen: Rahmen 96×381
    // statt 96×106.
    const quelle = readFileSync(join(__dirname, "..", "components", "EventCard.tsx"), "utf8");
    const thumb = /thumb:\s*\{([^}]*)\}/.exec(quelle)?.[1] ?? "";
    expect(thumb, "thumb darf kein alignSelf:stretch haben").not.toMatch(/alignSelf/);
    // Die Höhe kommt inline aus cardOuterHeight() — dieselbe Quelle wie die Karte.
    expect(quelle, "Bild braucht eine explizite Höhe").toMatch(
      /style=\{\[styles\.thumb,\s*\{\s*height\s*\}\]\}/
    );
  });
});
