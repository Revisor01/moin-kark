import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// Wächter für die Store-Releases. Hintergrund: `expo prebuild --clean` schreibt
// android/app/build.gradle neu und signiert das Release dann mit dem Debug-Key
// — das fällt sonst erst beim Play-Upload auf. Und die Version darf nur eine
// Quelle haben (app.json), sonst laufen Store und Repo auseinander.

const appDir = fileURLToPath(new URL("..", import.meta.url));
const read = (relative: string) => readFileSync(new URL(relative, `file://${appDir}`), "utf8");

const appJson = JSON.parse(read("app.json")) as {
  expo: { version: string; ios: { buildNumber: string }; android: { versionCode: number } };
};
const easJson = JSON.parse(read("eas.json")) as { cli: { appVersionSource: string } };
const buildGradle = read("android/app/build.gradle");
const infoPlist = read("ios/MoinKark/Info.plist");
const pbxproj = read("ios/MoinKark.xcodeproj/project.pbxproj");

describe("Versionsquelle app.json", () => {
  it("trägt Version, Build-Nummer und versionCode in gültiger Form", () => {
    expect(appJson.expo.version).toMatch(/^\d+\.\d+\.\d+$/);
    expect(appJson.expo.ios.buildNumber).toMatch(/^\d+$/);
    expect(Number.isInteger(appJson.expo.android.versionCode)).toBe(true);
    expect(appJson.expo.android.versionCode).toBeGreaterThan(0);
  });

  it("ist auch für EAS die lokale Quelle — sonst gäbe es zwei Wahrheiten", () => {
    expect(easJson.cli.appVersionSource).toBe("local");
  });

  it("steht so im Android-Projekt (prebuild nach dem Bump vergessen?)", () => {
    expect(buildGradle).toContain(`versionCode ${appJson.expo.android.versionCode}\n`);
    expect(buildGradle).toContain(`versionName "${appJson.expo.version}"`);
  });

  it("steht so im iOS-Projekt (scripts/apply-version.sh nach dem Bump vergessen?)", () => {
    const plistValue = (key: string) =>
      infoPlist.match(new RegExp(`<key>${key}</key>\\s*<string>([^<]*)</string>`))?.[1];
    expect(plistValue("CFBundleShortVersionString")).toBe(appJson.expo.version);
    expect(plistValue("CFBundleVersion")).toBe(appJson.expo.ios.buildNumber);

    const marketing = pbxproj.match(/MARKETING_VERSION = ([^;]+);/g) ?? [];
    const current = pbxproj.match(/CURRENT_PROJECT_VERSION = ([^;]+);/g) ?? [];
    expect(marketing.length).toBeGreaterThan(0);
    expect(current.length).toBeGreaterThan(0);
    expect(new Set(marketing)).toEqual(new Set([`MARKETING_VERSION = ${appJson.expo.version};`]));
    expect(new Set(current)).toEqual(
      new Set([`CURRENT_PROJECT_VERSION = ${appJson.expo.ios.buildNumber};`])
    );
  });
});

describe("Android-Release-Signing in build.gradle", () => {
  it("liest den Release-Keystore aus MOINKARK_*-Properties", () => {
    for (const name of [
      "MOINKARK_KEYSTORE_PATH",
      "MOINKARK_KEYSTORE_PASSWORD",
      "MOINKARK_KEY_ALIAS",
      "MOINKARK_KEY_PASSWORD",
    ]) {
      expect(buildGradle).toContain(`moinkarkSigning('${name}')`);
    }
    expect(buildGradle).toContain("signingConfig signingConfigs.release");
  });

  it("signiert nur den Debug-Build mit dem Debug-Key", () => {
    // Kommentarzeilen zählen nicht — nur Code. Genau einmal: im buildType
    // `debug`. Ein zweites Vorkommen wäre der von prebuild --clean
    // zurückgesetzte Release-Block.
    const code = buildGradle
      .split("\n")
      .filter((line) => !line.trim().startsWith("//"))
      .join("\n");
    const debugUses = code.match(/signingConfig signingConfigs\.debug/g) ?? [];
    expect(debugUses).toHaveLength(1);
    const buildTypes = code.indexOf("buildTypes {");
    expect(buildTypes).toBeGreaterThan(-1);
    const releaseBlock = code.slice(code.indexOf("release {", buildTypes));
    expect(releaseBlock).not.toContain("signingConfigs.debug");
  });

  it("hält keine Keystore-Zugangsdaten in gradle.properties", () => {
    const gradleProperties = read("android/gradle.properties");
    expect(gradleProperties).not.toMatch(/MOINKARK_|storePassword|keyPassword/);
  });
});

describe("iOS-Signing in der pbxproj", () => {
  it("nutzt automatisches Signing mit dem Apple-Team der App", () => {
    expect(pbxproj).toContain("CODE_SIGN_STYLE = Automatic;");
    expect(pbxproj).toContain("DEVELOPMENT_TEAM = J459G9CJT5;");
  });
});

describe("Release-Notes für Google Play", () => {
  it("bleiben unter der 500-Zeichen-Grenze", () => {
    // Darüber laufen Upload und Track-Zuweisung durch, und erst der Commit
    // scheitert mit einem irreführenden 403.
    const notes = read("release-notes-de.txt").trim();
    expect(notes.length).toBeGreaterThan(0);
    expect(notes.length).toBeLessThanOrEqual(500);
  });
});
