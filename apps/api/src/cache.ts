// In-Memory-Cache mit TTL + stale-while-revalidate + in-flight-Dedup.
// Verhindert, dass jeder Request 14 ChurchDesk-Calls auslöst, und dass parallele
// Requests gleichzeitig refreshen (Token-Hammering).

interface Entry<T> {
  value: T;
  freshUntil: number; // ms-Timestamp
}

export interface CacheOptions {
  /** Wie lange ein Wert als „frisch" gilt (ms). */
  ttlMs: number;
}

export class SwrCache<T> {
  private entries = new Map<string, Entry<T>>();
  private inflight = new Map<string, Promise<T>>();

  constructor(private opts: CacheOptions) {}

  /**
   * Liefert den gecachten Wert. Bei Ablauf wird im Hintergrund neu geladen
   * (stale-while-revalidate), der alte Wert aber sofort zurückgegeben.
   * Beim ersten Mal (kein Wert) wird synchron auf das Laden gewartet.
   */
  async get(key: string, loader: () => Promise<T>): Promise<T> {
    const now = Date.now();
    const entry = this.entries.get(key);

    if (entry && entry.freshUntil > now) {
      return entry.value; // frisch
    }

    if (!entry) {
      // Cold start: warten (aber in-flight dedupen).
      return this.load(key, loader);
    }

    // Stale: alten Wert sofort zurück, im Hintergrund refreshen.
    if (!this.inflight.has(key)) {
      void this.load(key, loader).catch((e) =>
        console.error(`[cache] background refresh '${key}' failed:`, e?.message ?? e)
      );
    }
    return entry.value;
  }

  /**
   * Lädt unabhängig vom TTL neu und ersetzt den Eintrag. Für den Auto-Refresh —
   * `get()` würde bei frischem Eintrag sofort zurückkehren und nie aktualisieren.
   * Läuft schon ein Ladevorgang, wird dessen Ergebnis mitgenutzt (kein Doppel-Call).
   */
  refresh(key: string, loader: () => Promise<T>): Promise<T> {
    return this.load(key, loader);
  }

  private load(key: string, loader: () => Promise<T>): Promise<T> {
    const existing = this.inflight.get(key);
    if (existing) return existing;

    const p = loader()
      .then((value) => {
        this.entries.set(key, { value, freshUntil: Date.now() + this.opts.ttlMs });
        return value;
      })
      .finally(() => {
        this.inflight.delete(key);
      });

    this.inflight.set(key, p);
    return p;
  }
}
