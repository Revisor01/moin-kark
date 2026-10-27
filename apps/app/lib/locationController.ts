// Ortung ohne React und expo, damit sie testbar ist; die Berechtigung entscheidet, nicht eine einzelne Messung.

import type { LatLng } from "./filters";

export type LocationStatus = "idle" | "loading" | "granted" | "denied" | "error";

export interface LocationState {
  location: LatLng | null;
  status: LocationStatus;
}

export interface WatchSubscription {
  remove: () => void;
}

/** Optionen für die Einmal-Ortung, die der Controller plattformabhängig vorgibt. */
export interface CurrentPositionOptions {
  timeout?: number;
}

export interface LocationDeps {
  /** Vordergrund-Berechtigung anfragen; `true` = erteilt. */
  requestPermission: () => Promise<boolean>;
  getLastKnown: () => Promise<LatLng | null>;
  getCurrent: (options: CurrentPositionOptions) => Promise<LatLng>;
  watch: (
    onPosition: (pos: LatLng) => void,
    onError: (reason: string) => void
  ) => Promise<WatchSubscription>;
  platform: "web" | "native";
  onState: (state: LocationState) => void;
}

export interface LocationController {
  /** Berechtigung holen, Ortung starten; liefert die beste gerade verfügbare Position. */
  request: () => Promise<LatLng | null>;
  /** App kommt in den Vordergrund: totes Abo erkennen und neu starten. */
  onAppStateActive: () => void;
  destroy: () => void;
  getState: () => LocationState;
}

// Neustart eines abgebrochenen Abos nach 5 s, doppelnd bis 60 s.
export const RETRY_MIN_MS = 5_000;
export const RETRY_MAX_MS = 60_000;
// Im Browser hängt getCurrentPosition ohne Timeout unbegrenzt (Standard: Infinity).
export const WEB_CURRENT_TIMEOUT_MS = 15_000;

export function createLocationController(deps: LocationDeps): LocationController {
  let state: LocationState = { location: null, status: "idle" };
  let destroyed = false;
  let permissionGranted = false;
  let inFlight: Promise<LatLng | null> | null = null;

  let watchSub: WatchSubscription | null = null;
  let watchPending = false;
  // Positionen und Fehler älterer Abos werden ignoriert.
  let generation = 0;
  let retryTimer: ReturnType<typeof setTimeout> | null = null;
  let retryDelay = RETRY_MIN_MS;

  const setState = (patch: Partial<LocationState>) => {
    state = { ...state, ...patch };
    deps.onState(state);
  };

  const clearRetry = () => {
    if (retryTimer !== null) {
      clearTimeout(retryTimer);
      retryTimer = null;
    }
  };

  const scheduleRestart = () => {
    if (destroyed || retryTimer !== null) return;
    const delay = retryDelay;
    retryDelay = Math.min(retryDelay * 2, RETRY_MAX_MS);
    retryTimer = setTimeout(() => {
      retryTimer = null;
      void startWatch();
    }, delay);
  };

  const dropWatch = () => {
    watchSub?.remove();
    watchSub = null;
    generation++;
  };

  const onWatchError = (gen: number) => {
    if (destroyed || gen !== generation) return;
    // Der native Stream ist beendet, mit Backoff neu aufbauen.
    dropWatch();
    scheduleRestart();
  };

  const startWatch = async () => {
    // Re-Entrancy-Guard gegen ein zweites, nie entferntes Abo.
    if (destroyed || watchSub !== null || watchPending) return;
    watchPending = true;
    const gen = ++generation;
    let sub: WatchSubscription;
    try {
      sub = await deps.watch(
        (pos) => {
          if (gen !== generation) return;
          retryDelay = RETRY_MIN_MS;
          setState({ location: pos });
        },
        () => onWatchError(gen)
      );
    } catch {
      watchPending = false;
      if (destroyed || gen !== generation) return;
      setState({ status: "error" });
      scheduleRestart();
      return;
    }
    watchPending = false;
    if (destroyed || gen !== generation) {
      // Zu spät gekommenes Abo sofort entfernen.
      sub.remove();
      if (!destroyed) scheduleRestart();
      return;
    }
    watchSub = sub;
    if (state.status === "error") setState({ status: "granted" });
  };

  const run = async (): Promise<LatLng | null> => {
    setState({ status: "loading" });
    let granted: boolean;
    try {
      granted = await deps.requestPermission();
    } catch {
      setState({ status: "error" });
      return null;
    }
    if (!granted) {
      permissionGranted = false;
      setState({ status: "denied" });
      return null;
    }
    permissionGranted = true;
    // „granted" hängt an der Berechtigung, nicht am Erfolg einer Messung.
    setState({ status: "granted" });

    // Letzte bekannte Position nur, solange nichts Frischeres da ist.
    const lastKnown = deps
      .getLastKnown()
      .then((loc) => {
        if (loc && state.location === null) setState({ location: loc });
      })
      .catch(() => {});

    // Das Live-Abo läuft IMMER, unabhängig von der Einmal-Ortung.
    clearRetry();
    void startWatch();

    // Scheitern ändert nichts, das Abo liefert nach.
    try {
      const loc = await deps.getCurrent(
        deps.platform === "web" ? { timeout: WEB_CURRENT_TIMEOUT_MS } : {}
      );
      setState({ location: loc });
      return loc;
    } catch {
      await lastKnown;
      return state.location;
    }
  };

  const request = () => {
    // Zwei parallele Anfragen (Start + Button-Tipp) teilen sich einen Durchlauf.
    if (inFlight) return inFlight;
    inFlight = run().finally(() => {
      inFlight = null;
    });
    return inFlight;
  };

  const onAppStateActive = () => {
    if (destroyed || !permissionGranted || watchSub !== null || watchPending) return;
    // Statt auf den Backoff-Timer zu warten: Die App ist sichtbar, also sofort.
    clearRetry();
    void startWatch();
  };

  const destroy = () => {
    destroyed = true;
    clearRetry();
    dropWatch();
  };

  return { request, onAppStateActive, destroy, getState: () => state };
}
