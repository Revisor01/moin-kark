import { describe, expect, it } from "vitest";
import { fmtDate } from "../src/churchdesk.js";

/** Das Abfragefenster beginnt am Berliner Kalendertag, nicht am UTC-Tag. */
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
    // 23:30 Berlin im Sommer, der Berliner Tag darf noch nicht weiter sein.
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
    // Container mit TZ=Europe/Berlin, CI mit UTC: beide gleich.
    expect(fmtDate(new Date("2026-06-14T22:30:00Z"))).toBe("2026-06-15");
  });
});
