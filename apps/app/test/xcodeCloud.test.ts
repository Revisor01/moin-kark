import { describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/**
 * Xcode Cloud baut den iOS-Release (26.10.2026). Das Skript nach dem Klonen
 * muss die Schritte des früheren GitHub-Release gehen und darf nur im Klon auf
 * automatisches Signieren umstellen.
 */
const APP = join(__dirname, "..");
const SKRIPT = join(APP, "ios/ci_scripts/ci_post_clone.sh");
const text = readFileSync(SKRIPT, "utf8");
const pbxproj = readFileSync(join(APP, "ios/MoinKark.xcodeproj/project.pbxproj"), "utf8");

function nummernPruefung(buildNummer: string, appJson: object) {
  const snippet = text.match(/node -e '\n([\s\S]*?)' "\$APP\/app.json"/)![1];
  const datei = join(mkdtempSync(join(tmpdir(), "xc-")), "app.json");
  writeFileSync(datei, JSON.stringify(appJson));
  const r = spawnSync("node", ["-e", snippet, datei], { encoding: "utf8", env: { ...process.env, CI_BUILD_NUMBER: buildNummer } });
  return { code: r.status, aus: r.stdout + r.stderr, app: JSON.parse(readFileSync(datei, "utf8")) };
}

function xcodePruefung(xcode: string, jsi: string) {
  const snippet = text.match(/node -e '\n(const \[xcode[\s\S]*?)' "\$\(xcodebuild/)![1];
  const r = spawnSync("node", ["-e", snippet, xcode, jsi], { encoding: "utf8" });
  return { code: r.status, aus: r.stdout + r.stderr };
}

describe("Xcode-Cloud-Skript", () => {
  it("ist ausfuehrbar und bricht bei jedem Fehler ab", () => {
    expect(statSync(SKRIPT).mode & 0o111).not.toBe(0);
    expect(text).toContain("set -euo pipefail");
  });

  it("geht die Schritte des GitHub-Release in derselben Reihenfolge", () => {
    const schritte = ["brew install node@22 cocoapods", "CI_BUILD_NUMBER", "npm ci", "npx expo prebuild --platform ios --no-install", "./scripts/apply-version.sh", "pod install", "CODE_SIGN_STYLE = Automatic;"];
    const stellen = schritte.map((s) => text.indexOf(s));
    for (const [i, s] of schritte.entries()) expect(stellen[i], s).toBeGreaterThan(-1);
    expect([...stellen].sort((a, b) => a - b)).toEqual(stellen);
  });

  // Xcode Cloud schaltet die automatische Paketaufloesung ab (Build 88,
  // 27.10.2026: „a resolved file is required"); die Datei muss im Repo liegen.
  it("Package.resolved liegt im Repo und nennt die MapLibre-Version des Projekts", () => {
    const resolved = JSON.parse(readFileSync(join(APP, "ios/MoinKark.xcworkspace/xcshareddata/swiftpm/Package.resolved"), "utf8"));
    const pin = resolved.pins.find((p: { identity: string }) => p.identity === "maplibre-gl-native-distribution");
    const gefordert = pbxproj.match(/maplibre-gl-native-distribution[\s\S]*?version = ([0-9.]+);/)?.[1];
    expect(gefordert).toMatch(/^\d+\.\d+\.\d+$/);
    expect(pin?.state.version).toBe(gefordert);
  });

  it("prueft die Version nach pod install und loest nicht selbst auf", () => {
    expect(text).not.toContain("-resolvePackageDependencies");
    expect(text.indexOf("GEFORDERT=")).toBeGreaterThan(text.indexOf("pod install"));
    expect(text.indexOf("GEFORDERT=")).toBeLessThan(text.indexOf("CODE_SIGN_STYLE = Automatic;"));
  });

  it("stellt genau die drei festen Signier-Zeilen der Release-Konfiguration um", () => {
    for (const zeile of ['CODE_SIGN_STYLE = Manual;', 'CODE_SIGN_IDENTITY = "Apple Distribution";', 'PROVISIONING_PROFILE_SPECIFIER = "Moin Kark AppStore CI";']) {
      expect(pbxproj.split(zeile).length - 1, zeile).toBe(1);
      expect(text).toContain(zeile);
    }
  });

  // Build 89 (27.10.2026) scheiterte unter Xcode 27.1 an der Skriptphase von
  // ExpoModulesJSI; SDK 56 hat keine Fassung mit der Korrektur aus 57.0.5.
  it("prueft Xcode und expo-modules-jsi gleich nach npm ci", () => {
    expect(text.indexOf("const [xcode, jsi]")).toBeGreaterThan(text.indexOf("npm ci"));
    expect(text.indexOf("const [xcode, jsi]")).toBeLessThan(text.indexOf("npx expo prebuild"));
  });

  it.each([["Xcode 26.6", "56.0.14"], ["Xcode 27.1", "57.0.5"], ["Xcode 27.1", "58.0.19"]])("laesst %s mit expo-modules-jsi %s bauen", (xcode, jsi) => {
    const { code, aus } = xcodePruefung(xcode, jsi);
    expect(code).toBe(0);
    expect(aus.trim()).toBe(`${xcode}, expo-modules-jsi ${jsi}`);
  });

  it.each([["Xcode 27.1", "56.0.14"], ["Xcode 27.0", "57.0.4"]])("bricht unter %s mit expo-modules-jsi %s ab", (xcode, jsi) => {
    const { code, aus } = xcodePruefung(xcode, jsi);
    expect(code).toBe(1);
    expect(aus).toContain("Xcode 26.6 einstellen");
  });

  it.each([["", "56.0.14"], ["Xcode 26.6", ""]])("bricht bei unbekannter Version (%j, %j) ab", (xcode, jsi) => {
    const { code, aus } = xcodePruefung(xcode, jsi);
    expect(code).toBe(1);
    expect(aus).toContain("Versionen nicht erkannt");
  });

  it("uebernimmt eine hoehere Build-Nummer von Xcode Cloud in app.json", () => {
    const { code, app } = nummernPruefung("88", { expo: { version: "1.0.0", ios: { buildNumber: "87" } } });
    expect(code).toBe(0);
    expect(app.expo.ios.buildNumber).toBe("88");
  });

  it.each(["87", "5", ""])("bricht bei Build-Nummer %j ab, ohne app.json zu aendern", (nummer) => {
    const { code, aus, app } = nummernPruefung(nummer, { expo: { version: "1.0.0", ios: { buildNumber: "87" } } });
    expect(code).toBe(1);
    expect(aus).toContain("Build Number");
    expect(app.expo.ios.buildNumber).toBe("87");
  });
});
