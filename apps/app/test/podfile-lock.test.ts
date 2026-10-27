import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// Hebt ein Update ein natives Paket, muss Podfile.lock mitziehen: in apps/app/ios `pod update <Pods> --no-repo-update`.

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
