// Cache mit TTL, stale-while-revalidate und Dedup, damit nicht jeder Request 14 ChurchDesk-Calls auslöst.

interface Entry<T> {
  value: T;
  freshUntil: number; // ms-Timestamp
  updatedAt: number; // ms-Timestamp des letzten erfolgreichen Ladens
}

export interface CacheOptions {
  /** Wie lange ein Wert als „frisch" gilt (ms). */
  ttlMs: number;
  /** Obergrenze der Einträge, weil jeder Tag einen neuen Key erzeugt. */
  maxEntries?: number;
}

export class SwrCache<T> {
  private entries = new Map<string, Entry<T>>();
  private inflight = new Map<string, Promise<T>>();

  constructor(private opts: CacheOptions) {}

  /** Liefert den Wert, notfalls den jüngsten unter anderem Key, damit nach Mitternacht kein Kaltstart-Fehler die Karte leert. */
  async get(key: string, loader: () => Promise<T>): Promise<T> {
    const now = Date.now();
    const entry = this.entries.get(key) ?? this.latestEntry();

    if (!entry) {
      // Cold start: warten (aber in-flight dedupen).
      return this.load(key, loader);
    }

    if (this.entries.get(key) === entry && entry.freshUntil > now) {
      return entry.value; // frisch
    }

    if (!this.inflight.has(key)) {
      void this.load(key, loader).catch((e) =>
        console.error(`[cache] background refresh '${key}' failed:`, e?.message ?? e)
      );
    }
    return entry.value;
  }

  /** Lädt unabhängig vom TTL neu und nutzt einen laufenden Ladevorgang mit. */
  refresh(key: string, loader: () => Promise<T>): Promise<T> {
    return this.load(key, loader);
  }

  /** Wie `refresh`, aber ohne sich an einen laufenden Ladevorgang zu hängen, der die Änderung noch nicht kennt. */
  async refreshAfterChange(key: string, loader: () => Promise<T>): Promise<T> {
    // Laufenden Durchlauf abwarten, damit er den frischen Stand nicht überschreibt.
    const existing = this.inflight.get(key);
    if (existing) await existing.catch(() => undefined);
    return this.load(key, loader);
  }

  /** Jüngster erfolgreicher Eintrag unter beliebigem Key, für /healthz und /status. */
  peekLatest(): { value: T; updatedAt: number } | undefined {
    const latest = this.latestEntry();
    return latest ? { value: latest.value, updatedAt: latest.updatedAt } : undefined;
  }

  private latestEntry(): Entry<T> | undefined {
    let latest: Entry<T> | undefined;
    for (const e of this.entries.values()) {
      if (!latest || e.updatedAt > latest.updatedAt) latest = e;
    }
    return latest;
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
