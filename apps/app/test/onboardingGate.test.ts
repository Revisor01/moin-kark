import { describe, expect, it, vi } from "vitest";

// react-native und expo-store-review ersetzt; geprüft wird die Link-Erkennung.
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
    // Wer über einen Link kommt, will den Termin sehen.
    expect(shouldShowOnboarding({ seen: false, hasDeepLink: true })).toBe(false);
  });

  it("bleibt auch mit Link aus, wenn sie schon gesehen wurde", () => {
    expect(shouldShowOnboarding({ seen: true, hasDeepLink: true })).toBe(false);
  });
});

describe("Deeplink-Erkennung für die Begrüßung", () => {
  // Der Ausdruck aus app/index.tsx: beide Link-Wege müssen die Begrüßung unterdrücken.
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
    // Dort ist `useURL` schon die Karten-URL ohne Termin.
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
