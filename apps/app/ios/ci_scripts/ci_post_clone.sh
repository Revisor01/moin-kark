#!/bin/bash
# Xcode Cloud, nach dem Klonen: Abhängigkeiten, natives Projekt aus app.json,
# Pods und Signierung, mit denselben Schritten wie der iOS-Release auf GitHub.
# Ohne sie fehlen dem Projekt node_modules, Pods und die aktuelle Version.
set -euo pipefail

REPO="${CI_PRIMARY_REPOSITORY_PATH:?Nur fuer Xcode Cloud gedacht.}"
APP="$REPO/apps/app"
PBXPROJ="$APP/ios/MoinKark.xcodeproj/project.pbxproj"
RESOLVED="$APP/ios/MoinKark.xcworkspace/xcshareddata/swiftpm/Package.resolved"

export HOMEBREW_NO_AUTO_UPDATE=1 HOMEBREW_NO_INSTALL_CLEANUP=1
brew install node@26 cocoapods
export PATH="$(brew --prefix node@26)/bin:$PATH"
[ "$(node -p 'process.versions.node.split(".")[0]')" = 26 ] || { echo "FEHLER: Node 26 erwartet."; exit 1; }

# Xcode Cloud vergibt die Build-Nummer. Sie kommt in app.json, damit prebuild
# und apply-version.sh sie wie bisher ueberall eintragen; kleiner als die
# letzte von Hand gesetzte darf sie nicht sein.
node -e '
const fs = require("fs"); const datei = process.argv[1]; const neu = Number(process.env.CI_BUILD_NUMBER);
const app = JSON.parse(fs.readFileSync(datei, "utf8")); const alt = Number(app.expo.ios.buildNumber);
if (!(neu > alt)) { console.error(`FEHLER: Xcode-Cloud-Build ${neu} liegt nicht ueber buildNumber ${alt}. In App Store Connect unter Xcode Cloud > Settings > Build Number die naechste Nummer hoeher setzen.`); process.exit(1); }
app.expo.ios.buildNumber = String(neu); fs.writeFileSync(datei, JSON.stringify(app, null, 2) + "\n");
console.log(`Version ${app.expo.version}, iOS-Build ${neu}`);' "$APP/app.json"

cd "$REPO"
npm ci --no-audit --no-fund

# Xcode 27 laesst ExpoModulesJSI vor 57.0.5 Warnungen ausgeben, die der innere
# Build als "error:" meldet, und Xcode bricht die Skriptphase ab (expo/expo#49120).
# Diese Pruefung meldet einen Rueckfall auf eine solche Fassung frueh.
node -e '
const [xcode, jsi] = process.argv.slice(1);
const haupt = Number((/^Xcode (\d+)/.exec(xcode) || [])[1]);
const [a, b, c] = jsi.split(".").map(Number);
if (!(haupt > 0) || !/^\d+\.\d+\.\d+/.test(jsi)) { console.error(`FEHLER: Versionen nicht erkannt: "${xcode}", expo-modules-jsi "${jsi}".`); process.exit(1); }
const behoben = a > 57 || (a === 57 && (b > 0 || c >= 5));
if (haupt >= 27 && !behoben) { console.error(`FEHLER: ${xcode} bricht den Bau von expo-modules-jsi ${jsi} ab (behoben erst ab 57.0.5). Im Xcode-Cloud-Workflow Xcode 26.6 einstellen.`); process.exit(1); }
console.log(`${xcode}, expo-modules-jsi ${jsi}`);' "$(xcodebuild -version | sed -n 1p)" "$(node -p 'require("expo-modules-jsi/package.json").version')"
cd "$APP"
CI=1 npx expo prebuild --platform ios --no-install --no-clean
./scripts/apply-version.sh

cd "$APP/ios"
for versuch in 1 2 3; do
  pod install && break
  [ "$versuch" -lt 3 ] || { echo "FEHLER: pod install nach 3 Versuchen fehlgeschlagen."; exit 1; }
  sleep 20
done

# Xcode Cloud loest Swift-Pakete nicht selbst auf, sondern nimmt die
# eingecheckte Package.resolved. Sie muss die MapLibre-Version tragen, die das
# Projekt nach prebuild verlangt.
GEFORDERT=$(awk '/maplibre-gl-native-distribution/{f=1} f&&/version = /{gsub(/[^0-9.]/,"",$3); print $3; exit}' "$PBXPROJ")
AUFGELOEST=$(node -e 'const p=JSON.parse(require("fs").readFileSync(process.argv[1],"utf8")).pins.find(x=>x.identity==="maplibre-gl-native-distribution");console.log(p?p.state.version:"")' "$RESOLVED" 2>/dev/null || true)
[ -n "$GEFORDERT" ] && [ "$GEFORDERT" = "$AUFGELOEST" ] || { echo "FEHLER: Package.resolved nennt MapLibre ${AUFGELOEST:-nichts}, das Projekt verlangt ${GEFORDERT:-nichts}. Lokal im Workspace die Pakete aufloesen und Package.resolved committen."; exit 1; }

# Xcode Cloud signiert selbst und braucht dafuer automatisches Signieren; die
# Release-Konfiguration ist fest auf Profil und Distribution-Zertifikat gestellt.
for zeile in 'CODE_SIGN_STYLE = Manual;' 'CODE_SIGN_IDENTITY = "Apple Distribution";' 'PROVISIONING_PROFILE_SPECIFIER = "Moin Kark AppStore CI";'; do
  [ "$(grep -cF "$zeile" "$PBXPROJ")" = 1 ] || { echo "FEHLER: '$zeile' steht nicht genau einmal in project.pbxproj."; exit 1; }
done
sed -i '' \
  -e 's/CODE_SIGN_STYLE = Manual;/CODE_SIGN_STYLE = Automatic;/' \
  -e 's/CODE_SIGN_IDENTITY = "Apple Distribution";/CODE_SIGN_IDENTITY = "Apple Development";/' \
  -e 's/PROVISIONING_PROFILE_SPECIFIER = "Moin Kark AppStore CI";/PROVISIONING_PROFILE_SPECIFIER = "";/' \
  "$PBXPROJ"
echo "Signieren fuer Xcode Cloud auf automatisch gestellt."
