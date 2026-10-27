import { beforeEach, describe, expect, it, vi } from "vitest";

// iOS braucht den Link in `url`, Android im Text.
interface ShareArg {
  url?: string;
  /** Share.share von react-native. */
  message?: string;
  /** navigator.share im Browser — heisst dort `text`, nicht `message`. */
  text?: string;
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
    // Ohne `url` behandelt iOS den Link als Text.
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
  // navigator.share direkt im Klick, sonst lehnt Safari mit NotAllowedError ab.
  function browserMit(share?: (d: ShareArg) => Promise<void>) {
    const kopiert: string[] = [];
    // `navigator` hat hier nur einen Getter.
    Object.defineProperty(globalThis, "navigator", {
      value: { share, clipboard: { writeText: async (t: string) => void kopiert.push(t) } },
      configurable: true,
      writable: true,
    });
    return kopiert;
  }

  it("ruft navigator.share mit dem Link im Feld url", async () => {
    platform.OS = "web";
    const gesehen: ShareArg[] = [];
    browserMit(async (d) => void gesehen.push(d));

    await shareEvent(event, "Sa., 11. Okt., 18:00");

    expect(gesehen).toHaveLength(1);
    expect(gesehen[0].url).toBe(LINK);
    // Nicht zusätzlich im Text, sonst doppelt.
    expect(gesehen[0].text ?? "").not.toContain("https://");
    expect(gesehen[0].text).toContain("Moin Kark");
  });

  it("geht NICHT ueber Share.share von react-native-web", async () => {
    platform.OS = "web";
    browserMit(async () => {});
    await shareEvent(event, "Sa., 11. Okt., 18:00");
    expect(shareSpy).not.toHaveBeenCalled();
  });

  it("kopiert Link und Signatur, wenn der Dialog nicht geht", async () => {
    platform.OS = "web";
    const kopiert = browserMit(async () => {
      throw new Error("NotAllowedError");
    });

    await shareEvent(event, "Sa., 11. Okt., 18:00");

    expect(kopiert).toEqual([`${LINK}\n\nMoin Kark — Kirche. In deiner Nähe.`]);
    // Nicht der alte lange Infoblock.
    expect(kopiert[0]).not.toContain("Orgelkonzert");
  });

  it("kopiert auch ohne navigator.share", async () => {
    platform.OS = "web";
    const kopiert = browserMit(undefined);
    await shareEvent(event, "Sa., 11. Okt., 18:00");
    expect(kopiert).toHaveLength(1);
    expect(kopiert[0]).toContain(LINK);
  });
});
