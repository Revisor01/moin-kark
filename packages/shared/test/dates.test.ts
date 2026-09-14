import { describe, expect, it } from "vitest";
import { berlinDayKey } from "../src/dates";

/**
 * Der Berliner Kalendertag ist die empfindlichste Stelle der API: Aus ihm wird
 * das ChurchDesk-Abfragefenster gebildet, in der App hängen Tageswechsel-Refetch
 * und „heute/morgen" daran. Die Fälle hier sind dieselben, die vorher an
 * `fmtDate` in der API festgenagelt waren — Winter, Sommer, beide Umstellungen.
 */
describe("berlinDayKey", () => {
  it("liefert das Datum als YYYY-MM-DD", () => {
    expect(berlinDayKey(new Date("2026-06-15T12:00:00Z"))).toBe("2026-06-15");
  });

  it("nimmt im Sommer den Berliner Tag, wenn UTC noch beim Vortag steht", () => {
    // 15.06.2026, 00:30 Berlin (MESZ, UTC+2) = 14.06.2026, 22:30 UTC.
    expect(berlinDayKey(new Date("2026-06-14T22:30:00Z"))).toBe("2026-06-15");
  });

  it("nimmt im Winter den Berliner Tag, wenn UTC noch beim Vortag steht", () => {
    // 15.01.2026, 00:30 Berlin (MEZ, UTC+1) = 14.01.2026, 23:30 UTC.
    expect(berlinDayKey(new Date("2026-01-14T23:30:00Z"))).toBe("2026-01-15");
  });

  it("wechselt den Tag erst um Mitternacht Berliner Zeit, nicht um Mitternacht UTC", () => {
    // 23:30 Berliner Ortszeit im Sommer — UTC steht da schon auf 21:30 desselben
    // Tages, der Berliner Tag darf aber noch nicht weitergesprungen sein.
    expect(berlinDayKey(new Date("2026-06-15T21:30:00Z"))).toBe("2026-06-15");
    // Eine Stunde später ist es in Berlin der Folgetag, in UTC noch nicht.
    expect(berlinDayKey(new Date("2026-06-15T22:30:00Z"))).toBe("2026-06-16");
  });

  it("bildet den Sommerzeit-Umstieg korrekt ab", () => {
    // Nacht auf den 29.03.2026: Umstellung von UTC+1 auf UTC+2 um 02:00.
    expect(berlinDayKey(new Date("2026-03-28T23:30:00Z"))).toBe("2026-03-29");
    // 28.03. 23:00 UTC = 29.03. 00:00 MEZ — exakt die Tagesgrenze vor der Umstellung.
    expect(berlinDayKey(new Date("2026-03-28T23:00:00Z"))).toBe("2026-03-29");
    expect(berlinDayKey(new Date("2026-03-28T22:59:59Z"))).toBe("2026-03-28");
    // Nacht auf den 25.10.2026: Rückstellung auf UTC+1.
    expect(berlinDayKey(new Date("2026-10-24T22:30:00Z"))).toBe("2026-10-25");
    // 24.10. 22:00 UTC = 25.10. 00:00 MESZ — Tagesgrenze, noch in Sommerzeit.
    expect(berlinDayKey(new Date("2026-10-24T22:00:00Z"))).toBe("2026-10-25");
    expect(berlinDayKey(new Date("2026-10-24T21:59:59Z"))).toBe("2026-10-24");
  });

  it("füllt Monat und Tag auf zwei Stellen auf", () => {
    // 5. Januar — ohne 2-digit käme „2026-1-5" und kein Vergleich träfe mehr.
    expect(berlinDayKey(new Date("2026-01-05T12:00:00Z"))).toBe("2026-01-05");
  });

  it("hängt nicht an der TZ-Umgebungsvariable des Prozesses", () => {
    // Der Container läuft mit TZ=Europe/Berlin, Tests und CI oft mit UTC.
    // Beide müssen dasselbe liefern.
    expect(berlinDayKey(new Date("2026-06-14T22:30:00Z"))).toBe("2026-06-15");
  });
});
