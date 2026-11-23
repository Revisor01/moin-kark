import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// Liste, Blatt und Erinnerung zeigen die Anzeige-Namen; Filter und Merkliste vergleichen weiter mit den Rohnamen.

const read = (rel: string) => readFileSync(fileURLToPath(new URL(`../${rel}`, import.meta.url)), "utf8");

describe("Anzeige-Namen in der Oberfläche", () => {
  it("zeigt Titel über displayTitle, nie roh", () => {
    for (const f of ["components/EventCard.tsx", "components/EventSheet.tsx"]) {
      const src = read(f);
      expect(src).toContain("displayTitle(p)");
      expect(src).not.toMatch(/\{p\.title\}/);
    }
    expect(read("lib/reminders.ts")).toContain("title: displayTitle(f.properties)");
  });

  it("zeigt Gemeinden über die Anzeige-Namen", () => {
    expect(read("components/EventCard.tsx")).toContain("eventParishLabels(p)");
    expect(read("components/FilterSheet.tsx")).toContain("label={parishLabel(g)}");
  });

  it("filtert weiter über die Rohnamen, damit gemerkte Filter gültig bleiben", () => {
    expect(read("lib/filters.ts")).toContain("eventParishes(f.properties).includes(filters.parish)");
    expect(read("components/FilterSheet.tsx")).toContain("onPress={() => onGemeinde(g)}");
  });
});
