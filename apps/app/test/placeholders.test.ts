import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

/** Zwei Zuschnitte je Motiv; ein falsches Seitenverhältnis fiele erst auf dem Gerät auf. */
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
    // Rahmen 96 × ~98 pt, Toleranz 0,1.
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
  // Schlüssel exakt wie aus ChurchDesk, sonst erscheint still ein Landschaftsmotiv.
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

  // Gegen den Quelltext, weil Vitest kein `require()` auf JPGs kann.
  const quelle = readFileSync(join(__dirname, "..", "lib", "placeholders.ts"), "utf8");

  it("kennt jede Gemeinde in beiden Zuschnitten", () => {
    for (const k of schluessel) {
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
    // Großbuchstaben träfen nie, placeholderFor() vergleicht kleingeschrieben.
    for (const k of schluessel) {
      expect(k, `„${k}" ist nicht kleingeschrieben`).toBe(k.toLowerCase());
    }
  });
});

describe("Bildrahmen der Listenkarte", () => {
  it("setzt eine feste Bildhöhe statt alignSelf:stretch", () => {
    // Ohne feste Höhe zog das Bild die Zelle im Web auf 381 px.
    const quelle = readFileSync(join(__dirname, "..", "components", "EventCard.tsx"), "utf8");
    const thumb = /thumb:\s*\{([^}]*)\}/.exec(quelle)?.[1] ?? "";
    expect(thumb, "thumb darf kein alignSelf:stretch haben").not.toMatch(/alignSelf/);
    // Die Höhe kommt inline aus cardOuterHeight() — dieselbe Quelle wie die Karte.
    expect(quelle, "Bild braucht eine explizite Höhe").toMatch(
      /style=\{\[styles\.thumb,\s*\{\s*height\s*\}\]\}/
    );
  });
});
