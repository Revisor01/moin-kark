import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// prebuild --clean signiert das Release mit dem Debug-Key, und die Version hat nur eine Quelle (app.json).

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
    // Nur Code zählt; ein zweites Vorkommen wäre der zurückgesetzte Release-Block.
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
  // Manuell signieren, sonst legt Xcode über die ASC-API Development-Zertifikate an und füllt das Kontolimit.
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

/** Konfigurationsblock des App-Ziels, unterschieden am Bundle-Bezeichner. */
function blockFor(name: "Debug" | "Release", bundleId: string): string {
  const section = pbxproj.split("/* Begin XCBuildConfiguration section */")[1] ?? pbxproj;
  // Am Blockanfang trennen, die schließende Klammer sieht innen wie außen gleich aus.
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
    // Sonst scheitert erst der Commit mit einem irreführenden 403.
    const notes = read("release-notes-de.txt").trim();
    expect(notes.length).toBeGreaterThan(0);
    expect(notes.length).toBeLessThanOrEqual(500);
  });
});

describe("Nur iPhone, kein iPad", () => {
  // Keine Tablets, sonst verlangt Apple iPad-Screenshots.
  it("meldet in app.json keine Tablet-Unterstuetzung", () => {
    const ios = appJson.expo.ios as { supportsTablet?: boolean };
    expect(ios.supportsTablet).toBe(false);
  });

  it("zielt im Xcode-Projekt nur auf iPhone (Family 1)", () => {
    // prebuild schreibt den Wert je nach SDK mit oder ohne Anführungszeichen.
    const treffer = [...pbxproj.matchAll(/TARGETED_DEVICE_FAMILY = "?([^";]+)"?;/g)].map((m) => m[1]);
    expect(treffer.length).toBeGreaterThan(0);
    // "1" = iPhone, "2" = iPad. "1,2" hiesse beides.
    for (const t of treffer) expect(t).toBe("1");
  });
});

describe("Privacy-Angaben fuer den App Store", () => {
  // Apple verlangt die Angabe „Product Interaction“, sobald gemessen wird; muss zu lib/analytics.ts passen.
  const privacy = read("ios/MoinKark/PrivacyInfo.xcprivacy");
  const analytics = read("lib/analytics.ts");

  it("meldet Product Interaction, solange die App misst", () => {
    const misst = /export async function track\(/.test(analytics);
    expect(misst).toBe(true);
    expect(privacy).toContain("NSPrivacyCollectedDataTypeProductInteraction");
  });

  it("erklaert die Messung als nicht personenbezogen und ohne Tracking", () => {
    // Sonst verlangt Apple den Tracking-Dialog.
    expect(privacy).toMatch(/NSPrivacyCollectedDataTypeLinked<\/key>\s*<false\/>/);
    expect(privacy).toMatch(/NSPrivacyCollectedDataTypeTracking<\/key>\s*<false\/>/);
    expect(privacy).toMatch(/NSPrivacyTracking<\/key>\s*<false\/>/);
  });

  it("nennt als Zweck nur die App-Funktion", () => {
    expect(privacy).toContain("NSPrivacyCollectedDataTypePurposeAppFunctionality");
    // Keine Werbung, keine Produktpersonalisierung.
    expect(privacy).not.toContain("ThirdPartyAdvertising");
    expect(privacy).not.toContain("DeveloperAdvertising");
  });
});

describe("R8 im Android-Release", () => {
  // prebuild --clean schreibt gradle.properties neu, deshalb R8 hier festgenagelt.
  const props = read("android/gradle.properties");
  const rules = read("android/app/proguard-rules.pro");

  it("schaltet Minify und Shrink im Release ein", () => {
    expect(props).toMatch(/^android\.enableMinifyInReleaseBuilds=true$/m);
    expect(props).toMatch(/^android\.enableShrinkResourcesInReleaseBuilds=true$/m);
  });

  it("haelt die Klassen, die nur ueber Reflection gerufen werden", () => {
    // R8 räumt sie sonst weg, der Fehler zeigte sich erst im Release.
    for (const muster of [
      "com.facebook.react",
      "com.facebook.hermes",
      "org.maplibre.android",
      "expo.modules",
      "DoNotStrip",
    ])
      expect(rules).toContain(muster);
  });
});

describe("Mitteilungs-Symbol auf Android", () => {
  // Ohne eigenes Symbol zeigt Android nur die Silhouette des App-Icons.
  const plugins = (JSON.parse(read("app.json")) as { expo: { plugins: unknown[] } }).expo.plugins;
  const manifest = read("android/app/src/main/AndroidManifest.xml");

  it("konfiguriert expo-notifications mit Symbol und Farbe", () => {
    const eintrag = plugins.find((p) => Array.isArray(p) && p[0] === "expo-notifications") as
      | [string, { icon: string; color: string }]
      | undefined;
    expect(eintrag?.[1].icon).toBe("./assets/notification-icon.png");
    expect(eintrag?.[1].color).toMatch(/^#[0-9A-Fa-f]{6}$/);
    expect(() => read("assets/notification-icon.png")).not.toThrow();
  });

  it("traegt das Symbol im Android-Projekt (prebuild nach der Aenderung vergessen?)", () => {
    expect(manifest).toContain(
      'android:name="expo.modules.notifications.default_notification_icon" android:resource="@drawable/notification_icon"'
    );
    expect(manifest).toContain(
      'android:name="expo.modules.notifications.default_notification_color" android:resource="@color/notification_icon_color"'
    );
    for (const dichte of ["mdpi", "hdpi", "xhdpi", "xxhdpi", "xxxhdpi"])
      expect(() => read(`android/app/src/main/res/drawable-${dichte}/notification_icon.png`)).not.toThrow();
  });
});

// Ab dem iOS-27-SDK ist der UIScene-Lifecycle Pflicht.
describe("iOS: UIScene-Lifecycle", () => {
  const appDelegate = read("ios/MoinKark/AppDelegate.swift");
  const sceneDelegate = read("ios/MoinKark/SceneDelegate.swift");
  const scene = (appJson.expo.ios as any).infoPlist?.UIApplicationSceneManifest;

  it("meldet in der Info.plist den SceneDelegate an", () => {
    expect(infoPlist).toContain("<key>UIApplicationSceneManifest</key>");
    expect(infoPlist).toContain("<string>$(PRODUCT_MODULE_NAME).SceneDelegate</string>");
  });

  it("steht auch in app.json, damit prebuild ihn nicht verliert", () => {
    expect(scene).toEqual({
      UIApplicationSupportsMultipleScenes: false,
      UISceneConfigurations: {
        UIWindowSceneSessionRoleApplication: [
          {
            UISceneConfigurationName: "Default Configuration",
            UISceneDelegateClassName: "$(PRODUCT_MODULE_NAME).SceneDelegate",
          },
        ],
      },
    });
  });

  it("startet React über Expos SceneDelegate, nicht im AppDelegate", () => {
    expect(sceneDelegate).toMatch(/^class SceneDelegate: ExpoAppSceneDelegate \{$/m);
    expect(appDelegate).toContain("class AppDelegate: ExpoAppDelegate, ExpoReactNativeFactoryProvider {");
    // Ein zweites Fenster im AppDelegate liefe am Scene-Lifecycle vorbei.
    expect(appDelegate).not.toContain("UIWindow(frame: UIScreen.main.bounds)");
    expect(appDelegate).not.toContain("startReactNative(");
  });

  it("überlässt Links und Kaltstart der Expo-Basisklasse", () => {
    // ExpoAppSceneDelegate baut die launchOptions für getInitialURL und reicht URLs und Universal Links weiter.
    expect(sceneDelegate).not.toMatch(/func scene\(/);
  });
});

// Xcode 27 baut erst ab iOS 15.0, der post_install-Block hebt ältere Pod-Ziele an.
describe("iOS: Mindestziel der Pods", () => {
  const podfile = read("ios/Podfile");

  it("hebt im post_install alle Pod-Ziele auf das App-Ziel an", () => {
    const postInstall = podfile.slice(podfile.indexOf("post_install do |installer|"));
    expect(postInstall).toContain("installer.pods_project.targets.each");
    expect(postInstall).toContain("build_settings['IPHONEOS_DEPLOYMENT_TARGET'] = app_target");
    expect(podfile).toMatch(/platform :ios, podfile_properties\['ios.deploymentTarget'\] \|\| '16\.4'/);
  });
});

// Ohne deutsche Grundsprache hält iOS die App für englisch.
describe("iOS: Sprache Deutsch", () => {
  const ios = appJson.expo.ios as any;
  const pbxproj = read("ios/MoinKark.xcodeproj/project.pbxproj");

  it("app.json meldet Deutsch als einzige Sprache", () => {
    expect(ios.infoPlist.CFBundleDevelopmentRegion).toBe("de");
    expect(ios.infoPlist.CFBundleLocalizations).toEqual(["de"]);
  });

  it("Info.plist und Projekt stehen auf Deutsch", () => {
    expect(infoPlist).toMatch(/<key>CFBundleDevelopmentRegion<\/key>\s*<string>de<\/string>/);
    expect(infoPlist).toMatch(/<key>CFBundleLocalizations<\/key>\s*<array>\s*<string>de<\/string>\s*<\/array>/);
    expect(pbxproj).toContain("developmentRegion = de;");
    expect(pbxproj).not.toMatch(/knownRegions = \([^)]*\ben,/);
  });
});

