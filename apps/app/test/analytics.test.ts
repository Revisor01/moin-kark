import { beforeEach, describe, expect, it, vi } from "vitest";

// Die Messung darf die App nie stören und nie identifizieren. Beides ist hier
// festgenagelt, zusammen mit den beiden Umami-Eigenheiten, die am 25.09.2026
// gegen t.godsapp.de gemessen wurden:
//
//  - Umami antwortet auf JEDE Anfrage mit HTTP 200, verwirft aber alles mit
//    einem User-Agent nach `okhttp` — genau den schickt React Native auf
//    Android. Ohne eigenen Header misst man dort nichts und merkt es nicht.
//  - Besucher zählt Umami NUR über Seitenaufrufe. Ein Seitenaufruf ist
//    `type:'event'` OHNE `name`; `type:'pageview'` lehnt Umami mit 400 ab.

// Die Messung laeuft nur im Release (AKTIV). Der Bundler setzt __DEV__;
// im Test setzen wir es selbst auf false, sonst prueften die Tests nichts.
vi.stubGlobal("__DEV__", false);

const platform = { OS: "ios" as string };
vi.mock("react-native", () => ({ Platform: platform }));

const fetchSpy = vi.fn(async () => ({ ok: true, status: 200 }) as never);
vi.stubGlobal("fetch", fetchSpy);

const { track, trackScreen, EREIGNISSE } = await import("../lib/analytics");

function letzterAufruf() {
  const [url, init] = fetchSpy.mock.calls.at(-1) as unknown as [string, RequestInit];
  return { url, init, body: JSON.parse(String(init.body)) as { type: string; payload: Record<string, unknown> } };
}

beforeEach(() => {
  fetchSpy.mockClear();
  platform.OS = "ios";
});

describe("Umami-Eigenheiten", () => {
  it("schickt einen browserartigen User-Agent", async () => {
    // Der Kern: Mit React Natives Standard-UA (`okhttp/...`) verwirft Umami
    // das Ereignis still und meldet trotzdem 200.
    await track("termin-geoeffnet", { quelle: "liste" });
    const ua = new Headers(letzterAufruf().init.headers).get("User-Agent") ?? "";
    expect(ua).toMatch(/^Mozilla\/5\.0 /);
    expect(ua).not.toMatch(/okhttp/i);
  });

  it("sendet einen Seitenaufruf ohne name", async () => {
    // Ohne name = Seitenaufruf (zählt Besucher), mit name = Ereignis.
    await trackScreen("karte");
    const { body } = letzterAufruf();
    expect(body.type).toBe("event");
    expect(body.payload.name).toBeUndefined();
  });

  it("nutzt nie type pageview", async () => {
    // Umami 3 lehnt das mit HTTP 400 ab.
    await trackScreen("karte");
    expect(letzterAufruf().body.type).toBe("event");
  });
});

describe("Was mitgeschickt wird", () => {
  it("haengt die Plattform an jedes Ereignis", async () => {
    platform.OS = "android";
    await track("termin-gemerkt", { aktion: "gemerkt" });
    expect(letzterAufruf().body.payload.data).toMatchObject({ plattform: "android" });
  });

  it("kennt web als eigene Plattform", async () => {
    platform.OS = "web";
    await track("geteilt", { weg: "system" });
    expect(letzterAufruf().body.payload.data).toMatchObject({ plattform: "web" });
  });
});

describe("Keine identifizierenden Daten", () => {
  it("laesst unbekannte Merkmale weg statt sie durchzureichen", async () => {
    // Positivliste statt Regex: Ein Regex liesse jede Kleinbuchstabenfolge
    // durch — also auch einen Termintitel.
    await track("termin-geoeffnet", {
      quelle: "liste",
      titel: "Konfisamstag in Hennstedt",
    } as never);
    const data = letzterAufruf().body.payload.data as Record<string, unknown>;
    expect(data.titel).toBeUndefined();
    expect(data.quelle).toBe("liste");
  });

  it("laesst unerlaubte Werte weg, sendet das Ereignis aber trotzdem", async () => {
    await track("filter-genutzt", { filter: "gottesdienst-in-huesby" } as never);
    const data = letzterAufruf().body.payload.data as Record<string, unknown>;
    expect(data.filter).toBeUndefined();
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("sendet unbekannte Ereignisnamen gar nicht", async () => {
    // Sonst ist jeder Tippfehler ein neuer Name im Dashboard.
    await track("tippfehlr" as never, {});
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("schickt keine Termin-ID mit", async () => {
    await track("termin-geoeffnet", { quelle: "liste", id: 50987060 } as never);
    expect(JSON.stringify(letzterAufruf().body)).not.toContain("50987060");
  });
});

describe("Die Messung stoert die App nicht", () => {
  it("verschluckt Netzfehler", async () => {
    fetchSpy.mockRejectedValueOnce(new Error("offline"));
    await expect(track("termin-gemerkt", { aktion: "gemerkt" })).resolves.toBeUndefined();
  });

  it("verschluckt einen Serverfehler", async () => {
    fetchSpy.mockResolvedValueOnce({ ok: false, status: 500 } as never);
    await expect(trackScreen("karte")).resolves.toBeUndefined();
  });
});

describe("Ereignisliste", () => {
  it("deckt ab, was gemessen werden soll", () => {
    for (const n of [
      "termin-geoeffnet",
      "termin-gemerkt",
      "erinnerung-gesetzt",
      "erinnerung-ausgeloest",
      "filter-genutzt",
      "geteilt",
      "bereich-geoeffnet",
    ])
      expect(Object.keys(EREIGNISSE)).toContain(n);
  });

  it("nutzt durchgehend Kleinbuchstaben ohne Umlaute", () => {
    // Auch keine Umschrift (ae/oe/ue) — ein Name, eine Schreibweise.
    for (const n of Object.keys(EREIGNISSE)) expect(n).toMatch(/^[a-z-]+$/);
  });
});
