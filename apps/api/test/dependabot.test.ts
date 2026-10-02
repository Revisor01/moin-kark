import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { parse } from "yaml";

// Wächter für .github/dependabot.yml: Was das Expo-SDK festlegt, darf
// Dependabot nicht über das SDK hinaus heben. Kommt ein SDK-Paket in die App,
// für das keine Regel greift, schlägt das hier an — nicht erst der Store-Build.

const path = (rel: string) => fileURLToPath(new URL(`../../../${rel}`, import.meta.url));
const read = (rel: string) => readFileSync(path(rel), "utf8");

const npm = (parse(read(".github/dependabot.yml")) as any).updates.find(
  (u: any) => u["package-ecosystem"] === "npm"
);
const app = JSON.parse(read("apps/app/package.json"));
const fromApp = createRequire(path("apps/app/package.json"));
const sdk = JSON.parse(
  readFileSync(fromApp.resolve("expo/bundledNativeModules.json"), "utf8")
) as Record<string, string>;

const MAJOR = "version-update:semver-major";
const MINOR = "version-update:semver-minor";
const PATCH = "version-update:semver-patch";

// Dependabot-Muster: * steht für beliebige Zeichen.
const matches = (pattern: string, name: string) =>
  new RegExp(
    `^${pattern
      .split("*")
      .map((part) => part.replace(/[.+?^${}()|[\]\\/]/g, "\\$&"))
      .join(".*")}$`
  ).test(name);

// Welche Update-Arten Dependabot für ein Paket auslässt. Regeln mit `versions`
// zählen nicht — sie sperren nur einzelne Fassungen.
function ignored(name: string): string[] {
  const types = new Set<string>();
  for (const rule of npm.ignore ?? []) {
    if (rule.versions || !matches(rule["dependency-name"], name)) continue;
    for (const t of rule["update-types"] ?? [MAJOR, MINOR, PATCH]) types.add(t);
  }
  return [...types].sort();
}

const sdkPackages = Object.keys({ ...app.dependencies, ...app.devDependencies }).filter(
  (name) => name in sdk
);

describe("Dependabot und Expo-SDK", () => {
  it("kennt die SDK-Pakete der App", () => {
    expect(sdkPackages).toContain("react-native");
    expect(sdkPackages).toContain("expo-router");
  });

  it.each(sdkPackages)("hebt %s nicht über das SDK hinaus", (name) => {
    const spec = sdk[name];
    let expected: string[];
    if (spec.startsWith("~")) expected = [MAJOR, MINOR];
    else if (spec.startsWith("^")) expected = [MAJOR];
    else if (/^\d/.test(spec)) expected = [MAJOR, MINOR, PATCH];
    else throw new Error(`Unbekannte SDK-Angabe für ${name}: ${spec}`);
    expect(ignored(name)).toEqual(expect.arrayContaining(expected));
  });

  it("gibt expo selbst nur Patches", () => {
    expect(ignored("expo")).toEqual([MAJOR, MINOR].sort());
  });

  it("lässt Pakete außerhalb des SDK in Ruhe", () => {
    for (const name of ["@maplibre/maplibre-react-native", "@tanstack/react-query", "@expo-google-fonts/dm-sans", "hono"]) {
      expect(ignored(name), name).toEqual([]);
    }
  });
});
