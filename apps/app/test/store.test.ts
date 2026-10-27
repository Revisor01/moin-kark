import { beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { flush, renderHook, storage } from "./helpers";

vi.mock("react-native", () => ({ Platform: { OS: "ios" } }));
vi.mock("@react-native-async-storage/async-storage", async () => ({
  default: (await import("./helpers")).storage,
}));
vi.mock("expo-notifications", async () => (await import("./helpers")).notifications);

import { useMapsApp, useSavedEvents } from "../lib/store";

const SAVED_KEY = "kkd:savedEvents";
const writtenLists = () =>
  storage.setItem.mock.calls.filter((c) => c[0] === SAVED_KEY).map((c) => JSON.parse(c[1]) as number[]);

beforeEach(() => {
  storage.reset();
});

describe("useSavedEvents", () => {
  it("gilt auch bei einem Lesefehler als geladen (Abgleich und Aufräumen laufen dann trotzdem)", async () => {
    // Bei beschädigtem Speicher blieb `loaded` sonst für immer false.
    storage.getItem.mockRejectedValueOnce(new Error("Speicher defekt"));

    const hook = await renderHook(() => useSavedEvents(), undefined);
    await vi.waitFor(() => expect(hook.current().loaded).toBe(true));
    expect(hook.current().saved.size).toBe(0);
    await hook.unmount();
  });

  it("verliert keinen Herz-Tipp, der vor dem Laden der Merkliste kommt", async () => {
    // Ein Tipp vor dem ersten Lesen darf die gespeicherte Liste nicht überschreiben.
    let resolveRead!: (v: string | null) => void;
    storage.getItem.mockReturnValueOnce(new Promise<string | null>((r) => (resolveRead = r)));

    const hook = await renderHook(() => useSavedEvents(), undefined);
    expect(hook.current().loaded).toBe(false);

    await act(async () => hook.current().toggle(3));
    expect(hook.current().isSaved(3)).toBe(true);
    // Vor dem Laden darf nichts geschrieben werden — sonst ist die alte Liste weg.
    expect(writtenLists()).toEqual([]);

    await act(async () => resolveRead("[1,2]"));
    await vi.waitFor(() => expect(hook.current().loaded).toBe(true));

    expect([...hook.current().saved].sort()).toEqual([1, 2, 3]);
    expect(writtenLists()).toEqual([[1, 2, 3]]);
    expect(JSON.parse(storage.peek(SAVED_KEY) ?? "[]")).toEqual([1, 2, 3]);
    await hook.unmount();
  });

  it("merken und entfernen nach dem Laden schreibt sofort", async () => {
    storage.seed(SAVED_KEY, "[1]");
    const hook = await renderHook(() => useSavedEvents(), undefined);
    await vi.waitFor(() => expect(hook.current().loaded).toBe(true));

    await act(async () => hook.current().toggle(2));
    expect(JSON.parse(storage.peek(SAVED_KEY) ?? "[]")).toEqual([1, 2]);

    await act(async () => hook.current().removeMany([1, 99]));
    expect(JSON.parse(storage.peek(SAVED_KEY) ?? "[]")).toEqual([2]);
    expect(hook.current().isSaved(1)).toBe(false);
    await hook.unmount();
  });
});

describe("useMapsApp", () => {
  it("übersteht einen Lesefehler und bleibt bei der Vorbelegung", async () => {
    storage.getItem.mockRejectedValueOnce(new Error("Speicher defekt"));
    const hook = await renderHook(() => useMapsApp(), undefined);
    await flush();
    await flush();
    expect(hook.current().mapsApp).toBe("apple");
    await hook.unmount();
  });
});
