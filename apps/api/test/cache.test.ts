import { describe, expect, it, vi } from "vitest";
import { SwrCache } from "../src/cache.js";

describe("SwrCache", () => {
  it("lädt beim ersten Zugriff und liefert danach aus dem Cache", async () => {
    const loader = vi.fn().mockResolvedValue("A");
    const cache = new SwrCache<string>({ ttlMs: 60_000 });
    expect(await cache.get("k", loader)).toBe("A");
    expect(await cache.get("k", loader)).toBe("A");
    expect(loader).toHaveBeenCalledTimes(1);
  });

  it("bündelt gleichzeitige Zugriffe zu einem einzigen Ladevorgang", async () => {
    // Ohne das löste jeder parallele Request 14 ChurchDesk-Calls aus.
    let resolve!: (v: string) => void;
    const loader = vi.fn(() => new Promise<string>((r) => (resolve = r)));
    const cache = new SwrCache<string>({ ttlMs: 60_000 });
    const beide = Promise.all([cache.get("k", loader), cache.get("k", loader)]);
    resolve("A");
    expect(await beide).toEqual(["A", "A"]);
    expect(loader).toHaveBeenCalledTimes(1);
  });

  it("liefert abgelaufene Werte sofort und lädt im Hintergrund nach", async () => {
    vi.useFakeTimers();
    try {
      const loader = vi.fn().mockResolvedValueOnce("alt").mockResolvedValueOnce("neu");
      const cache = new SwrCache<string>({ ttlMs: 1_000 });
      expect(await cache.get("k", loader)).toBe("alt");

      vi.setSystemTime(Date.now() + 2_000);
      // Der abgelaufene Wert kommt ohne Wartezeit zurück …
      expect(await cache.get("k", loader)).toBe("alt");
      // … der Nachlader läuft im Hintergrund.
      await vi.waitFor(() => expect(loader).toHaveBeenCalledTimes(2));
      expect(await cache.get("k", loader)).toBe("neu");
    } finally {
      vi.useRealTimers();
    }
  });

  it("behält den alten Wert, wenn der Hintergrund-Nachlader scheitert", async () => {
    // ChurchDesk-Ausfall: Der Feed darf nicht leer werden, sonst ersetzen alle
    // Geräte ihren lokalen Bestand mit nichts.
    vi.useFakeTimers();
    try {
      const loader = vi
        .fn()
        .mockResolvedValueOnce("alt")
        .mockRejectedValue(new Error("ChurchDesk weg"));
      const cache = new SwrCache<string>({ ttlMs: 1_000 });
      await cache.get("k", loader);

      vi.setSystemTime(Date.now() + 2_000);
      expect(await cache.get("k", loader)).toBe("alt");
      await vi.waitFor(() => expect(loader).toHaveBeenCalledTimes(2));
      // Auch nach dem Fehlschlag steht der alte Stand noch.
      expect(await cache.get("k", loader)).toBe("alt");
    } finally {
      vi.useRealTimers();
    }
  });

  it("reicht den Fehler durch, wenn beim Kaltstart nichts geladen werden kann", async () => {
    const cache = new SwrCache<string>({ ttlMs: 60_000 });
    await expect(cache.get("k", () => Promise.reject(new Error("ChurchDesk weg")))).rejects.toThrow(
      "ChurchDesk weg"
    );
    // Ein gescheiterter Ladevorgang darf nicht als in-flight hängenbleiben.
    expect(await cache.get("k", () => Promise.resolve("A"))).toBe("A");
  });

  it("erneuert mit refresh auch einen noch frischen Eintrag", async () => {
    const loader = vi.fn().mockResolvedValueOnce("alt").mockResolvedValueOnce("neu");
    const cache = new SwrCache<string>({ ttlMs: 60_000 });
    await cache.get("k", loader);
    expect(await cache.refresh("k", loader)).toBe("neu");
    expect(await cache.get("k", loader)).toBe("neu");
  });

  it("wartet bei refreshAfterChange einen laufenden Ladevorgang ab", async () => {
    // Der laufende Durchlauf startete vor der Admin-Änderung und kennt sie nicht;
    // sein Ergebnis darf den frischen Stand nicht überschreiben.
    const reihenfolge: string[] = [];
    let ersterFertig!: (v: string) => void;
    const loader = vi
      .fn()
      .mockImplementationOnce(
        () =>
          new Promise<string>((r) => {
            ersterFertig = (v) => {
              reihenfolge.push("alt fertig");
              r(v);
            };
          })
      )
      .mockImplementationOnce(async () => {
        reihenfolge.push("neu gestartet");
        return "neu";
      });

    const cache = new SwrCache<string>({ ttlMs: 60_000 });
    void cache.get("k", loader);
    const nachher = cache.refreshAfterChange("k", loader);
    ersterFertig("alt");

    expect(await nachher).toBe("neu");
    expect(reihenfolge).toEqual(["alt fertig", "neu gestartet"]);
    expect(await cache.get("k", loader)).toBe("neu");
  });

  it("liefert mit peekLatest den jüngsten Stand über alle Schlüssel", async () => {
    // Direkt nach Mitternacht gibt es den heutigen Schlüssel noch nicht — für
    // /healthz und /status zählt der Stand von gestern Abend.
    const cache = new SwrCache<string>({ ttlMs: 60_000 });
    expect(cache.peekLatest()).toBeUndefined();
    await cache.get("gestern", () => Promise.resolve("A"));
    await new Promise((r) => setTimeout(r, 2));
    await cache.get("heute", () => Promise.resolve("B"));
    expect(cache.peekLatest()?.value).toBe("B");
  });

  it("wirft alte Schlüssel über dem Deckel weg", async () => {
    // Das Zeitfenster wandert täglich — ohne Deckel bliebe der Eintrag von
    // gestern für immer liegen.
    const cache = new SwrCache<string>({ ttlMs: 60_000, maxEntries: 2 });
    for (const k of ["tag1", "tag2", "tag3"]) {
      await cache.get(k, () => Promise.resolve(k));
      await new Promise((r) => setTimeout(r, 2));
    }
    const loader = vi.fn().mockResolvedValue("neu geladen");
    // tag1 ist verdrängt und muss neu geladen werden …
    expect(await cache.get("tag1", loader)).toBe("neu geladen");
    // … tag3 liegt noch im Cache.
    expect(await cache.get("tag3", loader)).toBe("tag3");
    expect(loader).toHaveBeenCalledTimes(1);
  });
});
