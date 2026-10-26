import { describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/**
 * Xcode Cloud baut den iOS-Release (26.10.2026). Das Skript nach dem Klonen
 * muss dieselben Schritte gehen wie ios-release.yml und darf nur im Klon auf
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

  it("stellt genau die drei festen Signier-Zeilen der Release-Konfiguration um", () => {
    for (const zeile of ['CODE_SIGN_STYLE = Manual;', 'CODE_SIGN_IDENTITY = "Apple Distribution";', 'PROVISIONING_PROFILE_SPECIFIER = "Moin Kark AppStore CI";']) {
      expect(pbxproj.split(zeile).length - 1, zeile).toBe(1);
      expect(text).toContain(zeile);
    }
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
