import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// Wächter für ios/Podfile.lock: Hebt ein Update ein natives Paket, muss der
// Lock mitziehen. Sonst bricht der iOS-Build erst in der CI bei `pod install`
// ab („could not find compatible versions“) — so geschehen bei Build 87 nach
// dem Expo-Patch 56.0.23. Nachziehen in apps/app/ios mit
//   pod update <die gemeldeten Pods> --no-repo-update
//
// Geprüft werden die Pods, die aus node_modules kommen. Die von React Native
// selbst zählen nicht mit: Deren Pod-Versionen folgen eigenen Regeln (Yoga
// steht auf 0.0.0).

const iosDir = fileURLToPath(new URL("../ios/", import.meta.url));
const lock = `\n${readFileSync(resolve(iosDir, "Podfile.lock"), "utf8")}`;

function section(name: string): string {
  const start = lock.indexOf(`\n${name}:\n`);
  if (start < 0) throw new Error(`Abschnitt ${name} fehlt im Podfile.lock`);
  const rest = lock.slice(start + name.length + 3);
  const end = rest.search(/\n[A-Z][A-Z ]+:\n/);
  return end < 0 ? rest : rest.slice(0, end);
}

const locked = new Map(
  [...section("PODS").matchAll(/^ {2}- ([^\s(]+) \(([^)]+)\)/gm)].map((m) => [m[1], m[2]])
);

const fromNodeModules = [
  ...section("EXTERNAL SOURCES").matchAll(/^ {2}([^\s:]+):\n {4}:(?:path|podspec): "?([^"\n]+)"?/gm),
].flatMap(([, pod, path]) => {
  const pkg = /node_modules\/((?:@[^/]+\/)?[^/]+)/.exec(path)?.[1];
  return pkg && pkg !== "react-native" ? [{ pod, path, pkg }] : [];
});

function installedVersion(path: string, pkg: string): string {
  const root = path.slice(0, path.indexOf(`node_modules/${pkg}`) + `node_modules/${pkg}`.length);
  return (JSON.parse(readFileSync(resolve(iosDir, root, "package.json"), "utf8")) as { version: string })
    .version;
}

describe("Podfile.lock", () => {
  it("kennt die nativen Pakete der App", () => {
    expect(fromNodeModules.map((e) => e.pod)).toEqual(
      expect.arrayContaining(["Expo", "ExpoModulesCore", "MapLibreReactNative"])
    );
  });

  it("hält jeden Pod aus node_modules auf der installierten Version", () => {
    const stale = fromNodeModules
      .map(({ pod, path, pkg }) => ({ pod, lock: locked.get(pod), installed: installedVersion(path, pkg) }))
      .filter((e) => e.lock !== e.installed);
    expect(stale).toEqual([]);
  });
});
