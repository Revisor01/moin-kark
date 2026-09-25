import { describe, expect, it, vi } from "vitest";

// Wie in den übrigen Tests: react-native wird ersetzt, hier reicht der
// Share-Dialog als Attrappe — geprüft wird die Textbildung, nicht das System.
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
    // Geteilt wird api.moin-kark.de/event/<id>; faengt die App den Link direkt
    // ab, kommt genau diese Form an — ohne Query-Parameter.
    expect(eventIdFromUrl("https://moin-kark.de/event/4711")).toBe(4711);
  });

  it("liest die ID aus dem eigenen Schema (kkdith://)", () => {
    // Universal Links landen als https in der App, das eigene Schema bleibt
    // der Rückfallweg — beide müssen dieselbe ID liefern.
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
  // Titel, Zeit und Ort stehen bewusst NICHT mehr im Text: iMessage und
  // WhatsApp zeigen die Linkvorschau nur, wenn die Nachricht im Wesentlichen
  // aus dem Link besteht. Mit Text davor blieb das Bild weg — dieselben
  // Angaben stehen ohnehin in der Vorschau (og:title/og:description).
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
    // Ort und Gemeinde kommen aus der Vorschau, nicht mehr aus dem Text — der
    // Aufbau darf davon nicht mehr abhängen.
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
    // Faengt die App https://moin-kark.de/event/4711 ab, bekommt der Router
    // den Pfad /event/4711 — dafuer braucht es app/event/[id].tsx, sonst zeigt
    // Expo Router "Unmatched Route", bevor der Deep-Link-Code laeuft.
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
