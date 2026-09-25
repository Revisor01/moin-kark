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
  // Der Release-Block der App muss MANUELL signieren. Mit `Automatic` nimmt
  // Xcode nicht das Distribution-Zertifikat aus dem Keychain, sondern legt
  // sich ueber die ASC-API ein Development-Zertifikat an — gemessen an den
  // Builds 69, 70 und 71, die alle mit "Apple Development: Created via API"
  // signiert wurden. Das fuellt das kontoweite Zertifikatslimit, an dem
  // saemtliche Apps des Kontos haengen.
  const appRelease = blockFor("Release", "de.godsapp.kkdithkarte");

  it("signiert das Release manuell mit der Distribution-Identitaet", () => {
    expect(appRelease).toContain("CODE_SIGN_STYLE = Manual;");
    expect(appRelease).toContain('CODE_SIGN_IDENTITY = "Apple Distribution";');
    expect(appRelease).toContain('PROVISIONING_PROFILE_SPECIFIER = "Moin Kark AppStore CI";');
    expect(appRelease).toContain("DEVELOPMENT_TEAM = J459G9CJT5;");
  });

  it("laesst Debug auf automatischem Signing", () => {
    // Lokale Entwicklung soll weiter ohne Profil-Gefummel laufen.
    expect(blockFor("Debug", "de.godsapp.kkdithkarte")).toContain("CODE_SIGN_STYLE = Automatic;");
  });
});

/**
 * Schneidet den Konfigurationsblock (Debug/Release) des App-Ziels aus der
 * pbxproj. Die Datei enthaelt mehrere gleichnamige Bloecke — auch fuer das
 * Projekt selbst —, deshalb wird am Bundle-Bezeichner unterschieden.
 */
function blockFor(name: "Debug" | "Release", bundleId: string): string {
  const section = pbxproj.split("/* Begin XCBuildConfiguration section */")[1] ?? pbxproj;
  // Bloecke beginnen mit „<id> /* Debug|Release */ = {" — daran trennen, nicht
  // am Ende: Die schliessende Klammer sieht innen wie aussen gleich aus.
  const treffer = section
    .split(/^\t\t[0-9A-F]{24} \/\* (?:Debug|Release) \*\/ = \{$/m)
    .filter((b) => b.includes(`name = ${name};`) && b.includes(`PRODUCT_BUNDLE_IDENTIFIER = ${bundleId};`));
  if (treffer.length !== 1) {
    throw new Error(`Erwartet genau einen ${name}-Block fuer ${bundleId}, gefunden: ${treffer.length}`);
  }
  return treffer[0];
}

describe("Release-Notes für Google Play", () => {
  it("bleiben unter der 500-Zeichen-Grenze", () => {
    // Darüber laufen Upload und Track-Zuweisung durch, und erst der Commit
    // scheitert mit einem irreführenden 403.
    const notes = read("release-notes-de.txt").trim();
    expect(notes.length).toBeGreaterThan(0);
    expect(notes.length).toBeLessThanOrEqual(500);
  });
});

describe("Nur iPhone, kein iPad", () => {
  // Bewusste Entscheidung: Die App wird nicht fuer Tablets ausgeliefert.
  // Wichtig fuers Einreichen — solange iPad deklariert ist, VERLANGT Apple
  // auch iPad-Screenshots, und `expo prebuild` schreibt die pbxproj aus
  // app.json neu. Beide Orte muessen zusammenpassen.
  it("meldet in app.json keine Tablet-Unterstuetzung", () => {
    const ios = appJson.expo.ios as { supportsTablet?: boolean };
    expect(ios.supportsTablet).toBe(false);
  });

  it("zielt im Xcode-Projekt nur auf iPhone (Family 1)", () => {
    const treffer = [...pbxproj.matchAll(/TARGETED_DEVICE_FAMILY = "([^"]+)"/g)].map((m) => m[1]);
    expect(treffer.length).toBeGreaterThan(0);
    // "1" = iPhone, "2" = iPad. "1,2" hiesse beides.
    for (const t of treffer) expect(t).toBe("1");
  });
});
