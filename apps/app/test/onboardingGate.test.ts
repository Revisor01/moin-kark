import { describe, expect, it, vi } from "vitest";

// Wie in share.test.ts: react-native und expo-store-review werden ersetzt,
// sonst zieht der Import von `share` beides herein. Geprüft wird die
// Link-Erkennung, nicht das System.
vi.mock("react-native", () => ({
  Share: { share: async () => ({ action: "sharedAction" }) },
  Linking: { canOpenURL: async () => true, openURL: async () => {} },
  Platform: { OS: "web" },
}));
vi.mock("expo-store-review", () => ({
  hasAction: async () => false,
  isAvailableAsync: async () => false,
  requestReview: async () => {},
}));

import { shouldShowOnboarding } from "../lib/onboardingGate";
import { eventIdFromUrl } from "../lib/share";

describe("shouldShowOnboarding (Begrüßung beim ersten Start)", () => {
  it("zeigt die Begrüßung beim allerersten Start", () => {
    expect(shouldShowOnboarding({ seen: false, hasDeepLink: false })).toBe(true);
  });

  it("zeigt sie nicht mehr, wenn sie schon gesehen wurde", () => {
    expect(shouldShowOnboarding({ seen: true, hasDeepLink: false })).toBe(false);
  });

  it("überspringt sie bei einem geteilten Termin-Link", () => {
    // Der Kern: Wer über einen geteilten Link kommt, will den Termin sehen.
    // Bisher lag die Begrüßung darüber — im Browser traf das jeden neuen
    // Besucher, weil dort nie ein Merker gesetzt war. Der Termin stand
    // unsichtbar dahinter und der Link wirkte kaputt.
    expect(shouldShowOnboarding({ seen: false, hasDeepLink: true })).toBe(false);
  });

  it("bleibt auch mit Link aus, wenn sie schon gesehen wurde", () => {
    expect(shouldShowOnboarding({ seen: true, hasDeepLink: true })).toBe(false);
  });
});

describe("Deeplink-Erkennung für die Begrüßung", () => {
  // Genau der Ausdruck aus app/index.tsx: Ein Termin-Link kommt über zwei Wege
  // herein, und beide müssen die Begrüßung unterdrücken. Bricht einer, fällt
  // ein neuer Besucher wieder hinter das Overlay.
  const hasDeepLink = (url: string | null, param?: string) =>
    (url != null && eventIdFromUrl(url) !== null) ||
    (typeof param === "string" && /^\d+$/.test(param));

  it("erkennt die Karten-URL aus dem Browser", () => {
    expect(hasDeepLink("https://karte.moin-kark.de/?event=50987060")).toBe(true);
  });

  it("erkennt den Pfad des geteilten Links", () => {
    expect(hasDeepLink("https://moin-kark.de/event/50987060")).toBe(true);
  });

  it("erkennt den aus der Router-Route gereichten Parameter", () => {
    // app/event/[id].tsx schickt die ID als Router-Parameter an die Karte —
    // dort ist `useURL` bereits die Karten-URL ohne Termin.
    expect(hasDeepLink("https://karte.moin-kark.de/", "50987060")).toBe(true);
  });

  it("meldet keinen Link beim gewöhnlichen Start", () => {
    expect(hasDeepLink(null)).toBe(false);
    expect(hasDeepLink("https://karte.moin-kark.de/")).toBe(false);
  });

  it("lässt sich von Unsinn im Parameter nicht täuschen", () => {
    expect(hasDeepLink("https://karte.moin-kark.de/", "abc")).toBe(false);
    expect(hasDeepLink("https://karte.moin-kark.de/?event=abc")).toBe(false);
  });
});
