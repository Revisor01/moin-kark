import { describe, expect, it } from "vitest";
import { fmtDate } from "../src/churchdesk.js";

/**
 * Das Abfragefenster wird über den Berliner Kalendertag gebildet, nicht über UTC.
 * Regression: mit toISOString() begann das Fenster zwischen Mitternacht und
 * 01:00 (Winter) bzw. 02:00 (Sommer) Berliner Zeit noch beim Vortag und schloss
 * bereits gelaufene Events ein.
 */
describe("fmtDate", () => {
  it("liefert das Datum als YYYY-MM-DD", () => {
    expect(fmtDate(new Date("2026-06-15T12:00:00Z"))).toBe("2026-06-15");
  });

  it("nimmt im Sommer den Berliner Tag, wenn UTC noch beim Vortag steht", () => {
    // 15.06.2026, 00:30 Berlin (MESZ, UTC+2) = 14.06.2026, 22:30 UTC.
    expect(fmtDate(new Date("2026-06-14T22:30:00Z"))).toBe("2026-06-15");
  });

  it("nimmt im Winter den Berliner Tag, wenn UTC noch beim Vortag steht", () => {
    // 15.01.2026, 00:30 Berlin (MEZ, UTC+1) = 14.01.2026, 23:30 UTC.
    expect(fmtDate(new Date("2026-01-14T23:30:00Z"))).toBe("2026-01-15");
  });

  it("wechselt den Tag erst um Mitternacht Berliner Zeit, nicht um Mitternacht UTC", () => {
    // 23:30 Berliner Ortszeit im Sommer — UTC steht da schon auf 21:30 desselben
    // Tages, der Berliner Tag darf aber noch nicht weitergesprungen sein.
    expect(fmtDate(new Date("2026-06-15T21:30:00Z"))).toBe("2026-06-15");
    // Eine Stunde später ist es in Berlin der Folgetag, in UTC noch nicht.
    expect(fmtDate(new Date("2026-06-15T22:30:00Z"))).toBe("2026-06-16");
  });

  it("bildet den Sommerzeit-Umstieg korrekt ab", () => {
    // Nacht auf den 29.03.2026: Umstellung von UTC+1 auf UTC+2 um 02:00.
    expect(fmtDate(new Date("2026-03-28T23:30:00Z"))).toBe("2026-03-29");
    // Nacht auf den 25.10.2026: Rückstellung auf UTC+1.
    expect(fmtDate(new Date("2026-10-24T22:30:00Z"))).toBe("2026-10-25");
  });

  it("hängt nicht an der TZ-Umgebungsvariable des Prozesses", () => {
    // Der Container läuft mit TZ=Europe/Berlin, Tests und CI oft mit UTC.
    // Beide müssen dasselbe liefern.
    expect(fmtDate(new Date("2026-06-14T22:30:00Z"))).toBe("2026-06-15");
  });
});
