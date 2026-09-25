import { beforeEach, describe, expect, it, vi } from "vitest";

// Was die App dem System-Dialog uebergibt, entscheidet ueber die Linkvorschau:
// iOS kennt ein eigenes Feld `url` und behandelt `message` als reinen Text.
// Steht der Link nur im Text, erkennt iMessage ihn nicht als Link — keine
// Vorschau mit Bild, und ein Tipp darauf oeffnet nicht die App, sondern gar
// nichts. Android kennt kein `url`; dort MUSS der Link im Text stehen.
interface ShareArg {
  url?: string;
  message?: string;
  title?: string;
}

const shareSpy = vi.fn(async (_content: ShareArg) => ({ action: "sharedAction" as const }));
const platform = { OS: "ios" as string };

vi.mock("react-native", () => ({
  Share: { share: (content: ShareArg) => shareSpy(content) },
  Linking: { canOpenURL: async () => true, openURL: async () => {} },
  Platform: platform,
}));
vi.mock("expo-store-review", () => ({
  hasAction: async () => false,
  isAvailableAsync: async () => false,
  requestReview: async () => {},
}));

const { shareEvent } = await import("../lib/share");

const event = { id: 4711, title: "Orgelkonzert", parish: "Wesselburen", locationName: "St. Bartholomäus" };
const LINK = "https://moin-kark.de/event/4711";

beforeEach(() => {
  shareSpy.mockClear();
  platform.OS = "ios";
});

describe("shareEvent — was beim System-Dialog ankommt", () => {
  it("uebergibt auf iOS den Link im Feld url", async () => {
    await shareEvent(event, "Sa., 11. Okt., 18:00");
    const arg = shareSpy.mock.calls[0][0];
    // Der Kern: ohne `url` behandelt iOS den Link als Text — keine Vorschau,
    // kein Universal Link.
    expect(arg.url).toBe(LINK);
  });

  it("haengt auf iOS keinen zweiten Link in den Text", async () => {
    // Steht der Link zusaetzlich in `message`, zeigt iMessage ihn doppelt.
    await shareEvent(event, "Sa., 11. Okt., 18:00");
    const arg = shareSpy.mock.calls[0][0];
    expect(arg.message ?? "").not.toContain("https://");
  });

  it("stellt auf Android den Link in den Text, weil url dort nichts bewirkt", async () => {
    platform.OS = "android";
    await shareEvent(event, "Sa., 11. Okt., 18:00");
    const arg = shareSpy.mock.calls[0][0];
    expect(arg.message).toContain(LINK);
  });

  it("nennt die App auf beiden Plattformen", async () => {
    await shareEvent(event, "Sa., 11. Okt., 18:00");
    const ios = shareSpy.mock.calls[0][0];
    expect(ios.message).toContain("Moin Kark");

    shareSpy.mockClear();
    platform.OS = "android";
    await shareEvent(event, "Sa., 11. Okt., 18:00");
    const android = shareSpy.mock.calls[0][0];
    expect(android.message).toContain("Moin Kark");
  });
});

describe("shareEvent im Browser", () => {
  // react-native-web reicht `url` an navigator.share({url}) weiter — der
  // Browser kann also dasselbe wie iOS. Vorher lief Web im selben Zweig wie
  // Android und bekam den Link im Text: In iMessage kam dann der ganze
  // Infoblock als Text statt einer Vorschaukarte.
  it("uebergibt den Link im Feld url statt im Text", async () => {
    platform.OS = "web";
    await shareEvent(event, "Sa., 11. Okt., 18:00");
    const arg = shareSpy.mock.calls[0][0];
    expect(arg.url).toBe(LINK);
    expect(arg.message ?? "").not.toContain("https://");
  });

  it("nennt die App auch im Browser", async () => {
    platform.OS = "web";
    await shareEvent(event, "Sa., 11. Okt., 18:00");
    expect(shareSpy.mock.calls[0][0].message).toContain("Moin Kark");
  });
});
