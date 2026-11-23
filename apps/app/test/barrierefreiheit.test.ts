import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// Befunde aus Lighthouse (Web-Karte, Barrierefreiheit 85): Wächter, damit sie nicht zurückkommen.

const read = (rel: string) => readFileSync(fileURLToPath(new URL(`../${rel}`, import.meta.url)), "utf8");

describe("Barrierefreiheit der Karte", () => {
  it("gibt dem Willkommen-Dialog einen Namen", () => {
    expect(read("components/OnboardingOverlay.tsx")).toContain('"aria-label": "Willkommen bei Moin Kark"');
  });

  it("nennt dem Listen-Griff Wert und Bereich auch im Browser", () => {
    const src = read("components/DraggableListSheet.tsx");
    for (const a of ["aria-valuemin={1}", "aria-valuemax={SHEET_STAGES.length}", "aria-valuenow=", "aria-valuetext="])
      expect(src).toContain(a);
  });

  it("macht das Herz in der Liste 44 pt groß und hält den Titel davon frei", () => {
    const src = read("components/EventCard.tsx");
    expect(src).toMatch(/heart: \{\s*position: "absolute",\s*top: 0,\s*right: 0,\s*width: 44,\s*height: 44,/);
    expect(src).toContain("paddingRight: 44");
  });

  it("liest die Karte in der sichtbaren Reihenfolge vor", () => {
    expect(read("components/EventCard.tsx")).toContain(
      "accessibilityLabel={[time, title, cat, place].filter(Boolean).join(\", \")}"
    );
  });

  it("setzt Kategorie-Schrift mit ausreichendem Kontrast", () => {
    expect(read("components/EventCard.tsx")).toContain("color: textColorForCategory(cat)");
  });

  it("erklärt im Willkommen, wo die Merkliste liegt", () => {
    expect(read("components/OnboardingOverlay.tsx")).toContain("oben rechts mit dem Herz");
  });
});
