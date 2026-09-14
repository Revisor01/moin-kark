import { afterEach, describe, expect, it, vi, type Mock } from "vitest";
import {
  RETRY_MAX_MS,
  RETRY_MIN_MS,
  WEB_CURRENT_TIMEOUT_MS,
  createLocationController,
  type LocationDeps,
  type LocationState,
  type WatchSubscription,
} from "../lib/locationController";

const HEIDE = { lat: 54.196, lng: 9.093 };
const BUESUM = { lat: 54.133, lng: 8.858 };
const MELDORF = { lat: 54.092, lng: 9.066 };

/** Ein Fake-Abo, dessen Positionen und Fehler der Test selbst auslöst. */
interface FakeWatch extends WatchSubscription {
  emit: (pos: { lat: number; lng: number }) => void;
  fail: (reason: string) => void;
  remove: Mock<() => void>;
}

function makeDeps(overrides: Partial<LocationDeps> = {}) {
  const watches: FakeWatch[] = [];
  const states: LocationState[] = [];
  const deps: LocationDeps = {
    requestPermission: vi.fn().mockResolvedValue(true),
    getLastKnown: vi.fn().mockResolvedValue(null),
    getCurrent: vi.fn().mockRejectedValue(new Error("Cannot obtain current location")),
    watch: vi.fn(async (onPosition, onError) => {
      const w: FakeWatch = { emit: onPosition, fail: onError, remove: vi.fn<() => void>() };
      watches.push(w);
      return w;
    }),
    platform: "native",
    onState: (s) => states.push(s),
    ...overrides,
  };
  return { deps, watches, states };
}

/** Lässt alle anstehenden Microtasks durchlaufen (ohne Timer). */
const flush = () => new Promise<void>((r) => setImmediate(r));

/** Nur setTimeout faken — `flush` (setImmediate) muss weiter echt laufen. */
const useFakeTimeouts = () => vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });

afterEach(() => {
  vi.useRealTimers();
});

describe("locationController", () => {
  it("T1: schlägt die Erstortung fehl, liefert das Live-Abo den Standort", async () => {
    // Der gemeldete Fehler: iOS meldet ein vorübergehendes „location unknown"
    // als harten Fehler — danach blieb der Standort bis zum Neustart leer.
    // Nativ braucht der Reject Sekunden; das Abo liefert in der Zeit bereits.
    let rejectCurrent!: (e: Error) => void;
    const { deps, watches } = makeDeps({
      getCurrent: vi.fn(() => new Promise<typeof HEIDE>((_, rej) => (rejectCurrent = rej))),
    });
    const controller = createLocationController(deps);

    const pending = controller.request();
    await flush();
    expect(deps.watch).toHaveBeenCalledTimes(1);
    watches[0].emit(HEIDE);
    rejectCurrent(new Error("Cannot obtain current location"));

    expect(await pending).toEqual(HEIDE);
    expect(controller.getState().location).toEqual(HEIDE);
    expect(controller.getState().status).toBe("granted");
    expect(deps.getCurrent).toHaveBeenCalledTimes(1);
    expect(deps.watch).toHaveBeenCalledTimes(1);
  });

  it("T1b: ohne jede Position bleibt der Status „granted“ und der Rückgabewert null", async () => {
    const { deps } = makeDeps();
    const controller = createLocationController(deps);
    expect(await controller.request()).toBeNull();
    expect(controller.getState()).toEqual({ location: null, status: "granted" });
    expect(deps.watch).toHaveBeenCalledTimes(1);
  });

  it("T2: die letzte bekannte Position steht sofort, bevor die Einmal-Ortung antwortet", async () => {
    let resolveCurrent!: (v: typeof HEIDE) => void;
    const { deps, watches } = makeDeps({
      getLastKnown: vi.fn().mockResolvedValue(BUESUM),
      getCurrent: vi.fn(() => new Promise<typeof HEIDE>((r) => (resolveCurrent = r))),
    });
    const controller = createLocationController(deps);

    const pending = controller.request();
    await flush();
    expect(controller.getState()).toEqual({ location: BUESUM, status: "granted" });
    expect(deps.watch).toHaveBeenCalledTimes(1);
    expect(watches).toHaveLength(1);

    resolveCurrent(HEIDE);
    expect(await pending).toEqual(HEIDE);
    expect(controller.getState().location).toEqual(HEIDE);
  });

  it("T2b: eine verspätete Last-Known-Position überschreibt keine frische Abo-Position", async () => {
    let resolveLastKnown!: (v: typeof BUESUM) => void;
    const { deps, watches } = makeDeps({
      getLastKnown: vi.fn(() => new Promise<typeof BUESUM>((r) => (resolveLastKnown = r))),
    });
    const controller = createLocationController(deps);

    const pending = controller.request();
    await flush();
    watches[0].emit(HEIDE);
    resolveLastKnown(BUESUM);

    expect(await pending).toEqual(HEIDE);
    expect(controller.getState().location).toEqual(HEIDE);
  });

  it("T3: ein abgebrochenes Abo wird nach 5 s neu aufgebaut", async () => {
    useFakeTimeouts();
    const { deps, watches } = makeDeps();
    const controller = createLocationController(deps);
    await controller.request();
    watches[0].emit(HEIDE);

    watches[0].fail("Location provider is unavailable");
    expect(watches[0].remove).toHaveBeenCalledTimes(1);
    expect(deps.watch).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(RETRY_MIN_MS - 1);
    expect(deps.watch).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    await flush();
    expect(deps.watch).toHaveBeenCalledTimes(2);

    watches[1].emit(BUESUM);
    expect(controller.getState().location).toEqual(BUESUM);
    expect(watches[0].remove).toHaveBeenCalledTimes(1);
    // Das alte Abo ist tot: eine Nachzügler-Position aus ihm zählt nicht mehr.
    watches[0].emit(MELDORF);
    expect(controller.getState().location).toEqual(BUESUM);
  });

  it("T3b: der Neustart-Abstand verdoppelt sich bis 60 s und fällt nach einer Position zurück", async () => {
    useFakeTimeouts();
    const { deps, watches } = makeDeps();
    const controller = createLocationController(deps);
    await controller.request();

    const delays = [5_000, 10_000, 20_000, 40_000, 60_000, 60_000];
    expect(delays[delays.length - 1]).toBe(RETRY_MAX_MS);
    for (const [i, delay] of delays.entries()) {
      watches[i].fail("x");
      await vi.advanceTimersByTimeAsync(delay - 1);
      expect(deps.watch).toHaveBeenCalledTimes(i + 1);
      await vi.advanceTimersByTimeAsync(1);
      await flush();
      expect(deps.watch).toHaveBeenCalledTimes(i + 2);
    }

    // Eine Position setzt den Abstand zurück auf 5 s.
    const last = watches[watches.length - 1];
    last.emit(HEIDE);
    last.fail("x");
    await vi.advanceTimersByTimeAsync(RETRY_MIN_MS);
    await flush();
    expect(deps.watch).toHaveBeenCalledTimes(delays.length + 2);
  });

  it("T3c: startet das Abo gar nicht erst, ist der Status „error“ — bis der Neustart gelingt", async () => {
    useFakeTimeouts();
    const { deps } = makeDeps({
      watch: vi
        .fn()
        .mockRejectedValueOnce(new Error("Location services are disabled"))
        .mockResolvedValue({ remove: vi.fn() }),
    });
    const controller = createLocationController(deps);
    await controller.request();
    expect(controller.getState().status).toBe("error");

    await vi.advanceTimersByTimeAsync(RETRY_MIN_MS);
    await flush();
    expect(deps.watch).toHaveBeenCalledTimes(2);
    expect(controller.getState().status).toBe("granted");
  });

  it("T4: ohne Berechtigung wird weder geortet noch ein Abo gestartet", async () => {
    const { deps } = makeDeps({ requestPermission: vi.fn().mockResolvedValue(false) });
    const controller = createLocationController(deps);
    expect(await controller.request()).toBeNull();
    expect(controller.getState()).toEqual({ location: null, status: "denied" });
    expect(deps.getLastKnown).toHaveBeenCalledTimes(0);
    expect(deps.getCurrent).toHaveBeenCalledTimes(0);
    expect(deps.watch).toHaveBeenCalledTimes(0);
    // Auch der Vordergrund-Wechsel startet ohne Berechtigung nichts.
    controller.onAppStateActive();
    await flush();
    expect(deps.watch).toHaveBeenCalledTimes(0);
  });

  it("T5: zwei gleichzeitige Anfragen teilen sich einen Durchlauf und ein Abo", async () => {
    const { deps, watches } = makeDeps({ getCurrent: vi.fn().mockResolvedValue(HEIDE) });
    const controller = createLocationController(deps);
    const beide = Promise.all([controller.request(), controller.request()]);
    expect(await beide).toEqual([HEIDE, HEIDE]);
    expect(deps.requestPermission).toHaveBeenCalledTimes(1);
    expect(deps.getCurrent).toHaveBeenCalledTimes(1);
    expect(deps.watch).toHaveBeenCalledTimes(1);
    expect(watches).toHaveLength(1);
    expect(watches[0].remove).toHaveBeenCalledTimes(0);
  });

  it("T5b: eine erneute Anfrage bei lebendem Abo erzeugt kein zweites Abo", async () => {
    const { deps, watches } = makeDeps();
    const controller = createLocationController(deps);
    await controller.request();
    expect(await controller.request()).toBeNull();
    expect(deps.watch).toHaveBeenCalledTimes(1);
    expect(watches[0].remove).toHaveBeenCalledTimes(0);
  });

  it("T6: im Vordergrund wird ein totes Abo sofort neu gestartet, ein lebendes bleibt", async () => {
    useFakeTimeouts();
    const { deps, watches } = makeDeps();
    const controller = createLocationController(deps);
    await controller.request();

    controller.onAppStateActive();
    await flush();
    expect(deps.watch).toHaveBeenCalledTimes(1);

    watches[0].fail("x");
    controller.onAppStateActive();
    await flush();
    expect(deps.watch).toHaveBeenCalledTimes(2);
    // Der Backoff-Timer wurde abgeräumt: kein drittes Abo hinterher.
    await vi.advanceTimersByTimeAsync(RETRY_MAX_MS);
    await flush();
    expect(deps.watch).toHaveBeenCalledTimes(2);
  });

  it("T7: ein Abo, das erst nach dem Unmount fertig wird, wird sofort wieder entfernt", async () => {
    let resolveWatch!: (w: FakeWatch) => void;
    const late: FakeWatch = { emit: () => {}, fail: () => {}, remove: vi.fn<() => void>() };
    const { deps } = makeDeps({
      watch: vi.fn((onPosition) => {
        late.emit = onPosition;
        return new Promise<FakeWatch>((r) => (resolveWatch = r));
      }),
    });
    const controller = createLocationController(deps);
    const pending = controller.request();
    await flush();
    controller.destroy();
    resolveWatch(late);
    await pending;
    await flush();
    expect(late.remove).toHaveBeenCalledTimes(1);
    late.emit(HEIDE);
    expect(controller.getState().location).toBeNull();
  });

  it("T7b: nach dem Unmount startet ein Abo-Fehler keinen Neuaufbau mehr", async () => {
    useFakeTimeouts();
    const { deps, watches } = makeDeps();
    const controller = createLocationController(deps);
    await controller.request();
    controller.destroy();
    expect(watches[0].remove).toHaveBeenCalledTimes(1);
    watches[0].fail("x");
    await vi.advanceTimersByTimeAsync(RETRY_MAX_MS);
    await flush();
    expect(deps.watch).toHaveBeenCalledTimes(1);
  });

  it("T8: im Browser bekommt die Einmal-Ortung ein Timeout von 15 s, nativ keins", async () => {
    const web = makeDeps({ platform: "web" });
    await createLocationController(web.deps).request();
    expect(web.deps.getCurrent).toHaveBeenCalledWith({ timeout: WEB_CURRENT_TIMEOUT_MS });
    expect(WEB_CURRENT_TIMEOUT_MS).toBe(15_000);

    const nativ = makeDeps({ platform: "native" });
    await createLocationController(nativ.deps).request();
    expect(nativ.deps.getCurrent).toHaveBeenCalledWith({});
  });
});
