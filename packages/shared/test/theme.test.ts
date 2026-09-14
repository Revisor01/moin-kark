import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  alpha,
  categoryColors,
  colorForCategory,
  colors,
  hexToRgb,
  mapColors,
  radius,
  shadows,
  spacing,
  themeCss,
  type,
  withAlpha,
} from "../src/theme";

// WCAG 2.x relatives Leuchtdichte-Verhältnis (AA für Fließtext: >= 4,5:1).
function luminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex).map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

describe("Farb-Tokens", () => {
  it("bleiben ein kleiner Satz: 20 Namen, 19 Werte (onColor = surface)", () => {
    const names = Object.keys(colors);
    expect(names).toHaveLength(20);
    expect(new Set(Object.values(colors)).size).toBe(19);
    expect(colors.onColor).toBe(colors.surface);
    for (const hex of Object.values(colors)) expect(hex).toMatch(/^#[0-9A-F]{6}$/);
  });

  it("Textfarben erreichen AA (4,5:1) auf Sand und auf Weiß", () => {
    const grounds = [colors.background, colors.surface];
    for (const ground of grounds) {
      expect(contrast(colors.ink, ground)).toBeGreaterThanOrEqual(4.5);
      expect(contrast(colors.muted, ground)).toBeGreaterThanOrEqual(4.5);
      expect(contrast(colors.faint, ground)).toBeGreaterThanOrEqual(4.5);
      expect(contrast(colors.primary, ground)).toBeGreaterThanOrEqual(4.5);
      expect(contrast(colors.accentDark, ground)).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("faint ist genau so weit abgedunkelt, dass es auf Sand 4,5:1 schafft", () => {
    // Vorher #8A9595 mit 2,86:1 — Nebentexte (Datum, Ort, Fußzeilen) fielen durch.
    expect(colors.faint).toBe("#687373");
    expect(contrast(colors.faint, colors.background)).toBeCloseTo(4.55, 2);
    expect(contrast(colors.faint, colors.surface)).toBeCloseTo(4.9, 2);
    // Klar dunkler als vorher, aber weiter heller als muted — die Hierarchie bleibt.
    expect(luminance(colors.faint)).toBeLessThan(luminance("#8A9595"));
    expect(luminance(colors.faint)).toBeGreaterThan(luminance(colors.muted));
  });

  it("weiße Schrift auf Primär erreicht AA", () => {
    expect(contrast(colors.onColor, colors.primary)).toBeCloseTo(6.04, 2);
  });
});

describe("Kategorie- und Kartenfarben referenzieren die Tokens", () => {
  it("Gottesdienst und Andacht bleiben unterscheidbar", () => {
    expect(categoryColors.Gottesdienst).toBe(colors.primary);
    expect(categoryColors.Andacht).toBe(colors.catAndacht);
    expect(categoryColors.Andacht).not.toBe(categoryColors.Gottesdienst);
  });

  it("die übrigen Kategorien hängen an ihren Rollen-Tokens", () => {
    expect(categoryColors.Treffpunkt).toBe(colors.accent);
    expect(categoryColors["Sela-Yoga"]).toBe(colors.success);
    expect(categoryColors.Senioren).toBe(colors.warning);
    expect(categoryColors.default).toBe(colors.muted);
  });

  it("colorForCategory matcht exakt, dann per Schlüsselwort", () => {
    expect(colorForCategory("Gottesdienst")).toBe(colors.primary);
    expect(colorForCategory("Abendandacht")).toBe(colors.catAndacht);
    expect(colorForCategory("Orgelmusik")).toBe(colors.catConcert);
    expect(colorForCategory("Kinderkirche")).toBe(colors.catKids);
    expect(colorForCategory("Seniorenkreis")).toBe(colors.warning);
    expect(colorForCategory(undefined)).toBe(colors.muted);
    expect(colorForCategory("Irgendwas")).toBe(colors.muted);
  });

  it("Kartenland = App-Hintergrund, Wasser = helles Teal, Standort bleibt eigenständig", () => {
    expect(mapColors.land).toBe(colors.background);
    expect(mapColors.water).toBe(colors.primarySoft);
    expect(mapColors.user).toBe(colors.location);
    expect(mapColors.user).not.toBe(mapColors.cluster);
    expect(mapColors.user).not.toBe(mapColors.pin);
  });
});

describe("Skalen", () => {
  it("Abstände 2/4/8/12/16/24/32/48/64, Radien 8/12/18/pill", () => {
    expect(Object.values(spacing)).toEqual([2, 4, 8, 12, 16, 24, 32, 48, 64]);
    expect(Object.values(radius)).toEqual([8, 12, 18, 999]);
  });

  it("Typo-Leiter hat genau sechs Stufen, absteigend in Größe, mit Zeilenhöhe", () => {
    const steps = Object.keys(type);
    expect(steps).toEqual(["display", "heading", "title", "body", "label", "caption"]);
    const sizes = Object.values(type).map((t) => t.size);
    expect(sizes).toEqual([26, 24, 17, 15, 13, 12]);
    for (const t of Object.values(type)) {
      expect(t.lineHeight).toBeGreaterThan(t.size);
      expect(Number.isInteger(t.size)).toBe(true); // keine 12.5 / 13.5 mehr
    }
  });

  it("zwei Schatten, beide aus ink", () => {
    expect(Object.keys(shadows)).toEqual(["card", "sheet"]);
    expect(shadows.card.color).toBe(colors.ink);
    expect(shadows.sheet.color).toBe(colors.ink);
  });

  it("withAlpha liefert rgba aus Hex", () => {
    expect(withAlpha(colors.ink, alpha.backdrop)).toBe("rgba(28,43,43,0.6)");
    expect(withAlpha(colors.onColor, alpha.overlay)).toBe("rgba(255,255,255,0.9)");
  });
});

describe("CSS-Ausgabe", () => {
  const css = themeCss();

  it("enthält jede Farbe als Hex und als RGB-Tripel", () => {
    expect(css).toContain("--ink:#1C2B2B;--ink-rgb:28,43,43;");
    expect(css).toContain("--accent-dark:#B8431F;--accent-dark-rgb:184,67,31;");
    expect(css).toContain("--border-strong:#D6C8B0;");
    expect(css).toContain("--cat-andacht:#3A8A8A;");
  });

  it("enthält Skalen und Textstufen", () => {
    expect(css).toContain("--space-xxs:2px;");
    expect(css).toContain("--space-4xl:64px;");
    expect(css).toContain("--radius-pill:999px;");
    expect(css).toContain("--text-body:15px;--leading-body:22px;--weight-body:400;");
    expect(css).toContain("--shadow-card:0 4px 12px rgba(28,43,43,0.08);");
    expect(css).toContain("--shadow-sheet:0 -6px 20px rgba(28,43,43,0.18);");
  });

  it("apps/web/theme.css ist auf dem Stand der Tokens (sonst: npm run sync:theme-css -w packages/shared)", () => {
    const here = dirname(fileURLToPath(import.meta.url));
    const file = readFileSync(join(here, "..", "..", "..", "apps", "web", "theme.css"), "utf8");
    expect(file).toBe(css);
  });
});
