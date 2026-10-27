import { describe, expect, it, vi } from "vitest";

// react-native ersetzt; geprüft wird die Textbildung.
vi.mock("react-native", () => ({
  Share: { share: async () => ({ action: "sharedAction" }) },
  Linking: { canOpenURL: async () => true, openURL: async () => {} },
  Platform: { OS: "ios" },
}));
// expo-store-review zieht sonst expo-modules-core herein, das __DEV__ erwartet.
vi.mock("expo-store-review", () => ({
  hasAction: async () => false,
  isAvailableAsync: async () => false,
  requestReview: async () => {},
}));

import { canShare, eventShareUrl, eventShareMessage, eventIdFromUrl } from "../lib/share";

const base = {
  id: 4711,
  title: "Orgelkonzert",
  startUtc: "2026-10-11T16:00:00.000Z",
  parish: "Wesselburen",
  locationName: "St. Bartholomäus",
};

describe("eventShareUrl", () => {
  it("baut eine Web-Karten-URL mit der Event-ID", () => {
    expect(eventShareUrl(4711)).toBe("https://moin-kark.de/event/4711");
  });

  it("nutzt dieselbe Form für jede ID", () => {
    expect(eventShareUrl(1)).toBe("https://moin-kark.de/event/1");
  });
});

describe("eventIdFromUrl", () => {
  it("liest die ID aus einer geteilten Web-URL", () => {
    expect(eventIdFromUrl("https://karte.moin-kark.de/?event=4711")).toBe(4711);
  });

  it("liest die ID aus dem Vorschau-Link der API", () => {
    // So kommt der Link an, wenn die App ihn abfängt.
    expect(eventIdFromUrl("https://moin-kark.de/event/4711")).toBe(4711);
  });

  it("liest die ID aus dem eigenen Schema (kkdith://)", () => {
    // https und eigenes Schema liefern dieselbe ID.
    expect(eventIdFromUrl("kkdith://?event=4711")).toBe(4711);
  });

  it("verträgt weitere Parameter in beliebiger Reihenfolge", () => {
    expect(eventIdFromUrl("https://karte.moin-kark.de/?foo=1&event=99")).toBe(99);
  });

  it("gibt null ohne event-Parameter", () => {
    expect(eventIdFromUrl("https://karte.moin-kark.de/")).toBeNull();
  });

  it("gibt null bei nicht-numerischer ID", () => {
    expect(eventIdFromUrl("https://karte.moin-kark.de/?event=abc")).toBeNull();
    expect(eventIdFromUrl("https://moin-kark.de/event/abc")).toBeNull();
  });

  it("gibt null bei leerem event-Parameter", () => {
    expect(eventIdFromUrl("https://karte.moin-kark.de/?event=")).toBeNull();
    expect(eventIdFromUrl("https://moin-kark.de/event/")).toBeNull();
  });

  it("gibt null bei Müll statt URL", () => {
    expect(eventIdFromUrl("nicht mal eine url")).toBeNull();
  });

  it("gibt null bei negativer oder Null-ID", () => {
    // ChurchDesk-IDs sind positiv; 0 oder negativ heißt: kaputter Link.
    expect(eventIdFromUrl("https://karte.moin-kark.de/?event=0")).toBeNull();
    expect(eventIdFromUrl("https://moin-kark.de/event/0")).toBeNull();
    expect(eventIdFromUrl("https://karte.moin-kark.de/?event=-5")).toBeNull();
  });

  it("gibt null bei Kommazahlen", () => {
    expect(eventIdFromUrl("https://karte.moin-kark.de/?event=12.5")).toBeNull();
    expect(eventIdFromUrl("https://moin-kark.de/event/12.5")).toBeNull();
  });
});

describe("eventShareMessage", () => {
  // Nur Link und Signatur, sonst lassen Messenger die Vorschau weg.
  it("stellt den Link voran, damit die Vorschau lädt", () => {
    const msg = eventShareMessage({ ...base }, "Sa., 11. Okt., 18:00");
    expect(msg).toBe("https://moin-kark.de/event/4711\n\nMoin Kark — Kirche. In deiner Nähe.");
  });

  it("beginnt mit dem Link, ohne jeden Text davor", () => {
    // Der Kern der Sache: ein einziges Zeichen vor der URL kostet die Vorschau.
    const msg = eventShareMessage({ ...base }, "Sa., 11. Okt., 18:00");
    expect(msg.startsWith("https://")).toBe(true);
  });

  it("baut denselben Text unabhängig von Ort und Gemeinde", () => {
    const ohneOrt = eventShareMessage({ ...base, locationName: undefined }, "Sa., 11. Okt., 18:00");
    const ohneBeides = eventShareMessage(
      { ...base, locationName: undefined, parish: undefined },
      "Sa., 11. Okt., 18:00"
    );
    const erwartet = "https://moin-kark.de/event/4711\n\nMoin Kark — Kirche. In deiner Nähe.";
    expect(ohneOrt).toBe(erwartet);
    expect(ohneBeides).toBe(erwartet);
  });
});

describe("Deep-Link-Pfade, die die App kennen muss", () => {
  it("liest die ID aus dem Pfad, den der Universal Link liefert", () => {
    // Ohne app/event/[id].tsx zeigt Expo Router "Unmatched Route".
    expect(eventIdFromUrl("https://moin-kark.de/event/4711")).toBe(4711);
    expect(eventIdFromUrl("/event/4711")).toBe(4711);
  });

  it("liest die ID auch mit angehaengtem Schraegstrich", () => {
    expect(eventIdFromUrl("https://moin-kark.de/event/4711/")).toBe(4711);
  });
});

describe("canShare (Teilen-Knopf zeigen oder nicht)", () => {
  it("ist auf nativen Plattformen immer verfügbar", () => {
    expect(canShare()).toBe(true);
  });
});
