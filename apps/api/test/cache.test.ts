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
    // Sonst ersetzen alle Geräte ihren Bestand durch nichts.
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
    // Der laufende Durchlauf kennt die Admin-Änderung nicht.
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
    // Nach Mitternacht zählt für /healthz der Stand von gestern Abend.
    const cache = new SwrCache<string>({ ttlMs: 60_000 });
    expect(cache.peekLatest()).toBeUndefined();
    await cache.get("gestern", () => Promise.resolve("A"));
    await new Promise((r) => setTimeout(r, 2));
    await cache.get("heute", () => Promise.resolve("B"));
    expect(cache.peekLatest()?.value).toBe("B");
  });

  it("fällt bei neuem Schlüssel auf den jüngsten alten Stand zurück, statt zu scheitern", async () => {
    // Fällt ChurchDesk nach Mitternacht aus, darf das kein 500 werden.
    const cache = new SwrCache<string>({ ttlMs: 60_000 });
    await cache.get("gestern", () => Promise.resolve("A"));

    const loader = vi.fn().mockRejectedValue(new Error("ChurchDesk weg"));
    expect(await cache.get("heute", loader)).toBe("A");
    // Der neue Schlüssel wird trotzdem im Hintergrund geladen (und scheitert hier).
    await vi.waitFor(() => expect(loader).toHaveBeenCalledTimes(1));
    // Nach dem Fehlschlag steht der alte Stand weiterhin.
    expect(await cache.get("heute", loader)).toBe("A");
  });

  it("lädt einen neuen Schlüssel im Hintergrund und wechselt danach auf den neuen Stand", async () => {
    // Die erste Anfrage nach Mitternacht bekommt den Vortagesstand sofort.
    let resolve!: (v: string) => void;
    const cache = new SwrCache<string>({ ttlMs: 60_000 });
    await cache.get("gestern", () => Promise.resolve("A"));

    const loader = vi.fn(() => new Promise<string>((r) => (resolve = r)));
    // Zwei parallele Anfragen: beide sofort bedient, nur ein Ladevorgang.
    expect(await Promise.all([cache.get("heute", loader), cache.get("heute", loader)])).toEqual([
      "A",
      "A",
    ]);
    expect(loader).toHaveBeenCalledTimes(1);

    resolve("B");
    await vi.waitFor(async () => expect(await cache.get("heute", loader)).toBe("B"));
    expect(loader).toHaveBeenCalledTimes(1);
  });

  it("wartet beim echten Kaltstart weiterhin synchron und reicht den Fehler durch", async () => {
    // Ohne jeden Eintrag kein Rückfall.
    const cache = new SwrCache<string>({ ttlMs: 60_000 });
    await expect(cache.get("gestern", () => Promise.reject(new Error("weg")))).rejects.toThrow("weg");
    await expect(cache.get("heute", () => Promise.reject(new Error("immer noch weg")))).rejects.toThrow(
      "immer noch weg"
    );
  });

  it("wirft alte Schlüssel über dem Deckel weg", async () => {
    // Ohne Deckel bliebe der Eintrag von gestern für immer.
    const cache = new SwrCache<string>({ ttlMs: 60_000, maxEntries: 2 });
    for (const k of ["tag1", "tag2", "tag3"]) {
      await cache.get(k, () => Promise.resolve(k));
      await new Promise((r) => setTimeout(r, 2));
    }
    const loader = vi.fn().mockResolvedValue("neu geladen");
    // Bis tag1 neu geladen ist, gilt tag3 als Rückfall.
    expect(await cache.get("tag1", loader)).toBe("tag3");
    expect(loader).toHaveBeenCalledTimes(1);
    await vi.waitFor(async () => expect(await cache.get("tag1", loader)).toBe("neu geladen"));
    // … tag3 liegt noch im Cache.
    expect(await cache.get("tag3", loader)).toBe("tag3");
    expect(loader).toHaveBeenCalledTimes(1);
  });
});
