import { describe, expect, it } from "vitest";
import { addressFor, pageTitleFor } from "../lib/webAddress";

describe("addressFor", () => {
  it("setzt und entfernt den Termin", () => {
    expect(addressFor("", 4711)).toBe("/?event=4711");
    expect(addressFor("?event=4711", null)).toBe("/");
    expect(addressFor("?event=1", 2)).toBe("/?event=2");
  });

  it("lässt andere Parameter stehen", () => {
    expect(addressFor("?kirchspiel=West", 5)).toBe("/?kirchspiel=West&event=5");
    expect(addressFor("?kirchspiel=West&event=5", null)).toBe("/?kirchspiel=West");
  });
});

describe("pageTitleFor", () => {
  it("nennt den Termin, sonst die Startseite", () => {
    expect(pageTitleFor("Orgelkonzert")).toBe("Orgelkonzert – Moin Kark");
    expect(pageTitleFor(null)).toBe("Moin Kark – Termine der Kirche in Dithmarschen auf einer Karte");
  });
});

describe("Seitentitel", () => {
  it("ist ohne Termin derselbe wie in der Seitenhülle", async () => {
    const { readFileSync } = await import("node:fs");
    const html = readFileSync(new URL("../public/index.html", import.meta.url), "utf8");
    expect(html).toContain(`<title>${pageTitleFor(null)}</title>`);
  });
});
