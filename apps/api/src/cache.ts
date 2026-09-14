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
   *
   * Fehlt der Key, gilt der jüngste Eintrag unter einem anderen Key als
   * „abgelaufener Wert": Der Key trägt den Berliner Kalendertag, um Mitternacht
   * wechselt er — der Stand von gestern Abend liegt aber noch hier. Ohne den
   * Rückfall wartete die erste Anfrage nach Mitternacht auf den vollen Fetch
   * und bekäme bei einem ChurchDesk-Ausfall einen Fehler, obwohl Daten da sind.
   *
   * Der Vortagesstand ist dabei einen Tag „zu weit hinten": sein Fenster beginnt
   * gestern und endet einen Tag früher. Das ist für Minuten hinnehmbar — die App
   * blendet beendete Termine ohnehin selbst aus (isPast über die Endzeit), und
   * ein um einen Tag kürzerer Horizont fällt nicht auf; ein 500 dagegen leert
   * auf allen Geräten die Karte.
   *
   * Nur ganz ohne Eintrag (echter Kaltstart) wird synchron gewartet und ein
   * Fehler durchgereicht.
   */
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

    // Stale (oder Rückfall auf einen anderen Key): alten Wert sofort zurück,
    // im Hintergrund unter dem angefragten Key laden.
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
   * Wie `refresh`, hängt sich aber NICHT an einen bereits laufenden Ladevorgang:
   * der startete womöglich vor der auslösenden Änderung und trüge sie nicht mit.
   * Für den Admin-Speichern-Fall — dort muss der Durchlauf die neuen Overrides
   * garantiert gesehen haben, sonst erscheint die Korrektur erst beim nächsten
   * TTL-Tick, obwohl die Oberfläche „Refresh läuft" meldet.
   */
  async refreshAfterChange(key: string, loader: () => Promise<T>): Promise<T> {
    // Laufenden Durchlauf abwarten (Ergebnis verwerfen), damit er den frischen
    // Stand nicht nachträglich überschreibt; Fehler dort sind hier egal.
    const existing = this.inflight.get(key);
    if (existing) await existing.catch(() => undefined);
    return this.load(key, loader);
  }

  /**
   * Jüngster erfolgreich geladener Eintrag — egal unter welchem Key. Für
   * /healthz und /status: Direkt nach Mitternacht existiert der heutige Key
   * noch nicht, der Datenstand von gestern Abend ist aber der maßgebliche.
   */
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
