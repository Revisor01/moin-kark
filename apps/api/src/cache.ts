// In-Memory-Cache mit TTL + stale-while-revalidate + in-flight-Dedup.
// Verhindert, dass jeder Request 14 ChurchDesk-Calls auslöst, und dass parallele
// Requests gleichzeitig refreshen (Token-Hammering).

interface Entry<T> {
  value: T;
  freshUntil: number; // ms-Timestamp
  updatedAt: number; // ms-Timestamp des letzten erfolgreichen Ladens
}

export interface CacheOptions {
  /** Wie lange ein Wert als „frisch" gilt (ms). */
  ttlMs: number;
  /**
   * Obergrenze gespeicherter Einträge. Das Zeitfenster wandert mit dem Datum —
   * jeder Tag erzeugt einen neuen Key. Ohne Deckel bleibt der Eintrag von
   * gestern für immer liegen (~700 KB/Tag Leck im Dauerbetrieb).
   */
  maxEntries?: number;
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

  /**
   * Jüngster erfolgreich geladener Eintrag — egal unter welchem Key. Für
   * /healthz und /status: Direkt nach Mitternacht existiert der heutige Key
   * noch nicht, der Datenstand von gestern Abend ist aber der maßgebliche.
   */
  peekLatest(): { value: T; updatedAt: number } | undefined {
    let latest: Entry<T> | undefined;
    for (const e of this.entries.values()) {
      if (!latest || e.updatedAt > latest.updatedAt) latest = e;
    }
    return latest ? { value: latest.value, updatedAt: latest.updatedAt } : undefined;
  }

  private load(key: string, loader: () => Promise<T>): Promise<T> {
    const existing = this.inflight.get(key);
    if (existing) return existing;

    const p = loader()
      .then((value) => {
        const now = Date.now();
        this.entries.set(key, { value, freshUntil: now + this.opts.ttlMs, updatedAt: now });
        this.evict();
        return value;
      })
      .finally(() => {
        this.inflight.delete(key);
      });

    this.inflight.set(key, p);
    return p;
  }

  /** Älteste Einträge über dem Deckel verwerfen (Schutz gegen Key-Ansammlung). */
  private evict(): void {
    const max = this.opts.maxEntries ?? 4;
    while (this.entries.size > max) {
      let oldestKey: string | undefined;
      let oldestAt = Infinity;
      for (const [k, e] of this.entries) {
        if (e.updatedAt < oldestAt) {
          oldestAt = e.updatedAt;
          oldestKey = k;
        }
      }
      if (!oldestKey) break;
      this.entries.delete(oldestKey);
    }
  }
}
