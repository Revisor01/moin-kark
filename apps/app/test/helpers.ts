// Gemeinsame Fakes und ein minimaler Hook-Harness für die App-Tests.
//
// Die Module `store.ts`, `reminders.ts` und `savedSync.ts` hängen an AsyncStorage
// und expo-notifications. Beides wird hier durch In-Memory-Fakes ersetzt, die
// jede Testdatei per `vi.mock(..., async () => (await import("./helpers")).…)`
// einhängt. Weil derselbe Modul-Instanz auch im Test importiert wird, lassen
// sich die Aufrufe direkt prüfen.
import React, { act, useState } from "react";
// @ts-ignore — @types/react-dom ist in der App nicht installiert; react-dom
// selbst liegt im Root-node_modules und reicht als Renderer für Hook-Tests.
import { createRoot } from "react-dom/client";
import { vi } from "vitest";
import type { EventFeature } from "@moinkark/shared";

// --- AsyncStorage-Fake -------------------------------------------------------

function createMemoryStorage() {
  let store = new Map<string, string>();
  const api = {
    getItem: vi.fn(async (key: string): Promise<string | null> => store.get(key) ?? null),
    setItem: vi.fn(async (key: string, value: string): Promise<void> => {
      store.set(key, value);
    }),
    removeItem: vi.fn(async (key: string): Promise<void> => {
      store.delete(key);
    }),
    /** Direkter Blick in den Speicher, ohne die Mock-Zähler zu berühren. */
    peek: (key: string): string | null => store.get(key) ?? null,
    /** Direktes Vorbelegen, ohne die Mock-Zähler zu berühren. */
    seed: (key: string, value: string) => {
      store.set(key, value);
    },
    reset() {
      store = new Map();
      api.getItem.mockReset().mockImplementation(async (key: string) => store.get(key) ?? null);
      api.setItem.mockReset().mockImplementation(async (key: string, value: string) => {
        store.set(key, value);
      });
      api.removeItem.mockReset().mockImplementation(async (key: string) => {
        store.delete(key);
      });
    },
  };
  return api;
}

export const storage = createMemoryStorage();

// --- expo-notifications-Fake --------------------------------------------------

function createNotificationsFake() {
  let nextId = 1;
  const api = {
    scheduleNotificationAsync: vi.fn(async (_req: unknown): Promise<string> => `n${nextId++}`),
    cancelScheduledNotificationAsync: vi.fn(async (_id: string): Promise<void> => {}),
    cancelAllScheduledNotificationsAsync: vi.fn(async (): Promise<void> => {}),
    setNotificationHandler: vi.fn(),
    getPermissionsAsync: vi.fn(async () => ({ status: "granted" })),
    requestPermissionsAsync: vi.fn(async () => ({ status: "granted" })),
    addNotificationResponseReceivedListener: vi.fn(() => ({ remove: () => {} })),
    SchedulableTriggerInputTypes: { DATE: "date" },
    reset() {
      nextId = 1;
      api.scheduleNotificationAsync.mockReset().mockImplementation(async () => `n${nextId++}`);
      api.cancelScheduledNotificationAsync.mockReset().mockImplementation(async () => {});
      api.cancelAllScheduledNotificationsAsync.mockReset().mockImplementation(async () => {});
    },
  };
  return api;
}

export const notifications = createNotificationsFake();

/** Anfragen an scheduleNotificationAsync, aufgeschlüsselt nach sofort / geplant. */
export function scheduledRequests() {
  const all = notifications.scheduleNotificationAsync.mock.calls.map(
    (c) =>
      c[0] as {
        content: { title: string; body: string; data?: { eventId?: number } };
        trigger: null | { type: string; date: Date };
      }
  );
  return {
    immediate: all.filter((r) => r.trigger === null),
    timed: all.filter((r) => r.trigger !== null),
  };
}

// --- Event-Fabrik -------------------------------------------------------------

export function feature(over: {
  id: number;
  startUtc: string;
  title?: string;
  orgId?: number;
  locationName?: string | null;
}): EventFeature {
  const start = new Date(over.startUtc);
  return {
    type: "Feature",
    geometry: { type: "Point", coordinates: [9.0, 54.2] },
    properties: {
      id: over.id,
      title: over.title ?? `Termin ${over.id}`,
      startUtc: over.startUtc,
      endUtc: new Date(start.getTime() + 3600_000).toISOString(),
      allDay: false,
      showEndtime: true,
      categories: [],
      kirchspiel: "Kirchspiel Eider",
      orgId: over.orgId ?? 1,
      orgName: "Testgemeinde",
      locationName: over.locationName ?? undefined,
      coordSource: "event",
    },
  };
}

/** ISO-Zeitpunkt `days` Tage in der Zukunft (plus optional Stunden), ganze Stunde. */
export function inDays(days: number, hours = 0): string {
  const d = new Date(Date.now() + days * 86400_000 + hours * 3600_000);
  d.setMinutes(0, 0, 0);
  return d.toISOString();
}

// --- Hook-Harness -------------------------------------------------------------

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
if (typeof (globalThis as { window?: unknown }).window === "undefined") {
  (globalThis as { window?: unknown }).window = { event: undefined };
}

/** Gerade genug DOM, damit react-dom einen Root anlegen und committen kann. */
function fakeContainer() {
  const noop = () => {};
  const doc: Record<string, unknown> = {
    nodeType: 9,
    activeElement: null,
    body: null,
    addEventListener: noop,
    removeEventListener: noop,
    createElement: () => fakeContainer(),
    createTextNode: (t: string) => ({ nodeType: 3, textContent: t }),
  };
  const el: Record<string, unknown> = {
    nodeType: 1,
    nodeName: "DIV",
    tagName: "DIV",
    namespaceURI: "http://www.w3.org/1999/xhtml",
    ownerDocument: doc,
    childNodes: [],
    firstChild: null,
    addEventListener: noop,
    removeEventListener: noop,
    appendChild: noop,
    removeChild: noop,
    insertBefore: noop,
    setAttribute: noop,
    removeAttribute: noop,
    style: {},
    textContent: "",
  };
  doc.documentElement = el;
  doc.defaultView = { document: doc, HTMLIFrameElement: class {}, event: undefined };
  return el;
}

export interface RenderedHook<P, R> {
  /** Letzter Rückgabewert des Hooks. */
  current: () => R;
  rerender: (props: P) => Promise<void>;
  unmount: () => Promise<void>;
}

/** Rendert einen Hook in einer leeren Komponente; Effekte laufen unter `act`. */
export async function renderHook<P, R>(hook: (props: P) => R, initial: P): Promise<RenderedHook<P, R>> {
  let result!: R;
  let setProps!: (p: P) => void;
  function Probe({ props }: { props: P }) {
    result = hook(props);
    return null;
  }
  function Host() {
    const [p, set] = useState(initial);
    setProps = set;
    return React.createElement(Probe, { props: p });
  }
  const root = createRoot(fakeContainer());
  await act(async () => {
    root.render(React.createElement(Host));
  });
  return {
    current: () => result,
    rerender: (props) =>
      act(async () => {
        setProps(props);
      }),
    unmount: () =>
      act(async () => {
        root.unmount();
      }),
  };
}

/** Lässt anstehende Microtasks und I/O-Callbacks durchlaufen (ohne Timer). */
export const flush = () =>
  act(async () => {
    await new Promise<void>((r) => setImmediate(r));
  });
