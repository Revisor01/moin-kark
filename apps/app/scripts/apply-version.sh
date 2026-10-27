#!/usr/bin/env bash
# Schreibt Version und Build-Nummer aus app.json in Info.plist und pbxproj und liest gegen. Aufruf aus apps/app/: ./scripts/apply-version.sh
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_DIR="$(dirname "$SCRIPT_DIR")"
APP_JSON="$APP_DIR/app.json"
PBXPROJ="$APP_DIR/ios/MoinKark.xcodeproj/project.pbxproj"
INFO_PLIST="$APP_DIR/ios/MoinKark/Info.plist"

for f in "$APP_JSON" "$PBXPROJ" "$INFO_PLIST"; do
  if [ ! -f "$f" ]; then
    echo "FEHLER: $f nicht gefunden." >&2
    exit 1
  fi
done

VERSION="$(node -p "require('$APP_JSON').expo.version ?? ''")"
IOS_BUILD="$(node -p "require('$APP_JSON').expo.ios?.buildNumber ?? ''")"

if [ -z "$VERSION" ] || [ -z "$IOS_BUILD" ]; then
  echo "FEHLER: expo.version oder expo.ios.buildNumber fehlt in app.json." >&2
  exit 1
fi

# Apple lehnt Versionen ausserhalb x.y(.z) erst nach dem ganzen Build ab.
if ! printf '%s' "$VERSION" | grep -Eq '^[0-9]+\.[0-9]+(\.[0-9]+)?$'; then
  echo "FEHLER: version '$VERSION' ist kein gueltiges x.y bzw. x.y.z." >&2
  exit 1
fi
if ! printf '%s' "$IOS_BUILD" | grep -Eq '^[0-9]+$'; then
  echo "FEHLER: ios.buildNumber '$IOS_BUILD' ist keine ganze Zahl." >&2
  exit 1
fi

echo "Setze iOS-Version aus app.json: $VERSION ($IOS_BUILD)"

# 1. Info.plist — das ist der Wert, den der Build tatsaechlich verwendet.
/usr/libexec/PlistBuddy -c "Set :CFBundleShortVersionString $VERSION" "$INFO_PLIST"
/usr/libexec/PlistBuddy -c "Set :CFBundleVersion $IOS_BUILD" "$INFO_PLIST"

# 2. pbxproj — haelt die Build-Settings in Deckung mit der Plist.
sed -i '' -E "s/MARKETING_VERSION = [^;]+;/MARKETING_VERSION = $VERSION;/g" "$PBXPROJ"
sed -i '' -E "s/CURRENT_PROJECT_VERSION = [^;]+;/CURRENT_PROJECT_VERSION = $IOS_BUILD;/g" "$PBXPROJ"

# 3. Nachpruefen statt vertrauen.
FEHLER=0

PLIST_VERSION="$(/usr/libexec/PlistBuddy -c "Print :CFBundleShortVersionString" "$INFO_PLIST")"
PLIST_BUILD="$(/usr/libexec/PlistBuddy -c "Print :CFBundleVersion" "$INFO_PLIST")"
[ "$PLIST_VERSION" = "$VERSION" ]  || { echo "FEHLER: Info.plist CFBundleShortVersionString ist '$PLIST_VERSION', erwartet '$VERSION'." >&2; FEHLER=1; }
[ "$PLIST_BUILD" = "$IOS_BUILD" ]  || { echo "FEHLER: Info.plist CFBundleVersion ist '$PLIST_BUILD', erwartet '$IOS_BUILD'." >&2; FEHLER=1; }

# In der pbxproj darf KEIN abweichender Wert uebrigbleiben (Debug + Release).
if ! grep -q "MARKETING_VERSION = " "$PBXPROJ"; then
  echo "FEHLER: pbxproj enthaelt keine MARKETING_VERSION." >&2
  FEHLER=1
elif grep -E "MARKETING_VERSION = " "$PBXPROJ" | grep -qv "MARKETING_VERSION = $VERSION;"; then
  echo "FEHLER: pbxproj enthaelt noch abweichende MARKETING_VERSION-Eintraege:" >&2
  grep -nE "MARKETING_VERSION = " "$PBXPROJ" >&2
  FEHLER=1
fi
if ! grep -q "CURRENT_PROJECT_VERSION = " "$PBXPROJ"; then
  echo "FEHLER: pbxproj enthaelt keine CURRENT_PROJECT_VERSION." >&2
  FEHLER=1
elif grep -E "CURRENT_PROJECT_VERSION = " "$PBXPROJ" | grep -qv "CURRENT_PROJECT_VERSION = $IOS_BUILD;"; then
  echo "FEHLER: pbxproj enthaelt noch abweichende CURRENT_PROJECT_VERSION-Eintraege:" >&2
  grep -nE "CURRENT_PROJECT_VERSION = " "$PBXPROJ" >&2
  FEHLER=1
fi

if [ "$FEHLER" -ne 0 ]; then
  echo "ABBRUCH: Version wurde nicht sauber gesetzt." >&2
  exit 1
fi

echo "Fertig und geprueft: Info.plist und pbxproj stehen auf $VERSION ($IOS_BUILD)."
echo "app.json bleibt die Quelle der Wahrheit."
