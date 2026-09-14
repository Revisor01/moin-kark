import { describe, expect, it } from "vitest";
import { resolveBackPress } from "../lib/backNavigation";

describe("resolveBackPress (Android-Zurücktaste)", () => {
  it("lässt Zurück ans System, wenn nichts offen ist", () => {
    expect(
      resolveBackPress({ eventOpen: false, filtersOpen: false, profileOpen: false })
    ).toBeNull();
  });

  it("schließt zuerst die Terminansicht", () => {
    expect(resolveBackPress({ eventOpen: true, filtersOpen: true, profileOpen: true })).toBe(
      "event"
    );
  });

  it("schließt danach den Filter", () => {
    expect(resolveBackPress({ eventOpen: false, filtersOpen: true, profileOpen: true })).toBe(
      "filters"
    );
  });

  it("schließt zuletzt das Profil", () => {
    expect(resolveBackPress({ eventOpen: false, filtersOpen: false, profileOpen: true })).toBe(
      "profile"
    );
  });

  it("ein aus dem Profil geöffneter Termin schließt sich vor dem Profil", () => {
    // ProfileSheet ruft onClose vor onSelectEvent — sollte das Profil trotzdem
    // noch offen sein, geht Zurück zuerst an den Termin.
    expect(resolveBackPress({ eventOpen: true, filtersOpen: false, profileOpen: true })).toBe(
      "event"
    );
  });
});
