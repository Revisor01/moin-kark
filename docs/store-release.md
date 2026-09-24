# Store-Release über GitHub Actions

iOS- und Android-Fassungen entstehen nicht mehr auf dem Entwickler-Mac, sondern
auf GitHub-Runnern — reproduzierbar aus einem Commit und auf Release-macOS
(Apple lehnt Builds von Beta-macOS mit ITMS-90111 ab).

Workflows: `.github/workflows/ios-release.yml`, `.github/workflows/android-release.yml`,
Play-Upload: `.github/scripts/upload-play.py`.

Der Upload läuft damit über diese Workflows, nicht über `eas submit`. Deshalb
hat `eas.json` bewusst **keinen** `submit`-Block für Android: Android geht über
die Play-API im Workflow, iOS über `altool`. Der iOS-Eintrag dort bleibt für den
Notfall stehen (Upload von Hand, falls der Runner ausfällt).

## Versionsquelle: `apps/app/app.json`

Es gibt genau eine Quelle für Version und Build-Nummern:

| Feld | Wofür |
|---|---|
| `expo.version` | Marketing-Version beider Plattformen (`x.y.z`) |
| `expo.ios.buildNumber` | iOS-Build-Nummer (`CFBundleVersion`), pro Upload höher |
| `expo.android.versionCode` | Android-versionCode, muss über **alle** Play-Tracks monoton steigen |

`expo prebuild` schreibt die Werte in `android/app/build.gradle` und die
`Info.plist`; `scripts/apply-version.sh` zieht die pbxproj nach und prüft beide
Stellen gegen. Die Workflows tun das selbst — lokal reicht nach dem Bump

```bash
cd apps/app && npm run sync:native-version
```

damit das versionierte native Projekt mitzieht (der Test
`test/release-config.test.ts` besteht sonst nicht).

`eas.json` steht deshalb auf `appVersionSource: "local"`. Die früheren
Remote-Stände waren iOS-Build 63 und versionCode 2 — die Zählung geht ab 64 / 3
weiter.

Aus demselben Grund steht `autoIncrement` im Produktions-Profil auf `false`:
Die Release-Builds entstehen in GitHub Actions, aber ein versehentlicher
`eas build` würde die Nummern in `app.json` sonst daneben hochzählen — danach
wüsste niemand mehr, welcher Stand gilt. Gebumpt wird von Hand, in einem
Commit.

## Release-Ablauf

1. **Bumpen und committen:** `app.json` (Version, `buildNumber`, `versionCode`),
   `apps/app/release-notes-de.txt` (Play, höchstens 500 Zeichen) und
   `CHANGELOG.md`. `npm run sync:native-version` in `apps/app`, dann Push.
2. **Workflows dispatchen:**
   ```bash
   gh workflow run ios-release.yml
   gh workflow run android-release.yml -f tracks=internal
   ```
   Android-Tracks als Input (`internal`, `alpha`, `production`, kommagetrennt);
   Standard ist `internal` — Produktion erst bewusst dazuschreiben.
3. **Einreichen:**
   - Android: nichts weiter — der Track-Commit startet Googles Prüfung.
   - iOS: per App-Store-Connect-API Version anlegen, Build binden,
     `reviewSubmissions` absenden (Skill `mobile-store-apis`).
4. **Tag und GitHub-Release:** `gh release create X.Y.Z --target <voller SHA>
   -t "X.Y.Z — Titel" -F notes.md` — Kurz-SHAs geben 422.

### Dry-Run (nach jedem Umbau der Workflows)

```bash
gh workflow run android-release.yml -f dry_run=true
```

Läuft die komplette Kette scharf (Build, Signatur, Play-Login, Upload,
Track-Zuweisung, `:validate`), verwirft die Play-Edit aber statt zu committen.
Der versionCode wird dafür nur auf dem Runner um 10000 angehoben und nicht
verbraucht. Für iOS gibt es keinen Dry-Run — jeder Lauf landet in TestFlight.

## GitHub-Secrets

Einmalig setzen (`-R Revisor01/moin-kark`); Werte kommen aus
`~/.claude/secrets.env` und `~/.claude/secrets/keystores/moinkark-keystore.env`.

```bash
# iOS-Signing: Distribution-Identität aus dem Schlüsselbund exportieren
P12PASS=$(openssl rand -hex 16)
security export -k login.keychain -t identities -f pkcs12 -P "$P12PASS" -o dist.p12
base64 -i dist.p12 | gh secret set IOS_DIST_P12_BASE64 -R Revisor01/moin-kark
gh secret set IOS_P12_PASSWORD -R Revisor01/moin-kark --body "$P12PASS"
rm dist.p12

# App Store Connect API (dasselbe Konto bedient alle Apps)
gh secret set ASC_KEY_ID        -R Revisor01/moin-kark --body "$APP_STORE_CONNECT_KEY_ID"
gh secret set ASC_ISSUER_ID     -R Revisor01/moin-kark --body "$APP_STORE_CONNECT_ISSUER_ID"
gh secret set ASC_KEY_P8_BASE64 -R Revisor01/moin-kark --body "$(base64 -i "$APP_STORE_CONNECT_KEY_PATH")"

# Android-Signing (gemeinsamer Keystore, eigener Alias — siehe README „Android-Signing")
source ~/.claude/secrets/keystores/moinkark-keystore.env
base64 -i "$MOINKARK_KEYSTORE_PATH" | gh secret set ANDROID_KEYSTORE_BASE64 -R Revisor01/moin-kark
gh secret set ANDROID_KEYSTORE_PASSWORD -R Revisor01/moin-kark --body "$MOINKARK_KEYSTORE_PASSWORD"
gh secret set ANDROID_KEY_ALIAS         -R Revisor01/moin-kark --body "$MOINKARK_KEY_ALIAS"
gh secret set ANDROID_KEY_PASSWORD      -R Revisor01/moin-kark --body "$MOINKARK_KEY_PASSWORD"

# Google Play Service-Account (androidpublisher-Scope, bedient alle Apps des Kontos)
gh secret set GPLAY_SA_JSON_BASE64 -R Revisor01/moin-kark --body "$(base64 -i "$GOOGLE_PLAY_SA_KEY_PATH")"
```

| Secret | Wofür |
|---|---|
| `IOS_DIST_P12_BASE64`, `IOS_P12_PASSWORD` | Apple-Distribution-Zertifikat samt Schlüssel |
| `ASC_KEY_ID`, `ASC_ISSUER_ID`, `ASC_KEY_P8_BASE64` | App-Store-Connect-API-Key (Profile ziehen, Upload) |
| `ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`, `ANDROID_KEY_PASSWORD` | Release-Keystore |
| `GPLAY_SA_JSON_BASE64` | Google-Play-Service-Account für den Upload |

Die Apple-Team-ID (`J459G9CJT5`) ist kein Geheimnis und steht direkt im
iOS-Workflow und in der pbxproj.

## Native Projekte sind versioniert

`apps/app/ios/` und `apps/app/android/` liegen im Repo. Ignoriert wird nur, was
Gradle, CocoaPods und Xcode erzeugen (`apps/app/.gitignore`). Die Workflows
laufen `expo prebuild` **ohne** `--clean` darüber — so bleiben erhalten:

- `android/app/build.gradle`: Release-Signing aus `MOINKARK_*`-Properties
  (Gradle-Property oder Umgebungsvariable). **`expo prebuild --clean` setzt das
  Release auf den Debug-Key zurück** — danach Signing-Block wiederherstellen;
  der Test `release-config.test.ts` und der Workflow-Schritt „Signing und
  Version im Gradle-Projekt prüfen“ schlagen sonst an.
- `ios/MoinKark.xcodeproj`: `CODE_SIGN_STYLE = Automatic`, `DEVELOPMENT_TEAM`.
- `android/gradle.properties` ist versioniert und enthält **keine** Passwörter.

Nicht im Repo: `ios/Pods/`, `ios/build/`, `android/build/`, `android/.gradle/`,
`android/local.properties` — und `ios/MoinKark.xcworkspace/xcshareddata/swiftpm/`,
weil der lokale MapLibre-Mirror (README „iOS-Build: MapLibre-Workaround“) dort
eine Revision pinnt, die es auf GitHub nicht gibt. Der Runner löst das Paket
direkt von GitHub auf (exakte Version im Podspec).

## Geteilte Links öffnen die App

Geteilt wird `https://moin-kark.de/event/<id>` — die Hauptdomain, nicht die
Karte und nicht die API. Zwei Gründe:

- Die Web-Karte ist eine Single-Page-App und liefert Crawlern nur ein leeres
  Grundgerüst; ein geteilter Link erschien in WhatsApp ohne Bild und Text.
- `api.moin-kark.de` las sich für Empfänger:innen technisch und wirkte wie ein
  Fehler.

Die Vorschauseite selbst liefert weiterhin die API; sie trägt die
OpenGraph-Angaben des Termins und leitet Menschen per `meta refresh` auf die
Karte weiter. Der Weg dorthin führt über zwei Stellen:

1. **KeyHelp-vHost** von `moin-kark.de` (`apache.https_directives`, gesetzt per
   KeyHelp-API): `ProxyPass` für `/event/` und die beiden `.well-known`-Dateien
   auf `127.0.0.1:8888`, mit `ProxyPreserveHost On`.
2. **Traefik-Router** `moinkark-share` am `moinkark-api`-Container:
   `Host(\`moin-kark.de\`) && (PathPrefix(\`/event/\`) || PathPrefix(\`/.well-known/\`))`,
   zeigt auf denselben Service. Ohne ihn antwortet Traefik mit 404, weil es nach
   Host-Header routet.

**Nicht per `.htaccess` lösbar** — nachgewiesen: `ProxyPass` ist dort nicht
erlaubt (Apache antwortet mit **500 auf jeden Pfad der Domain**, Landingpage
eingeschlossen), `SSLProxyEngine` ebenso wenig, und `RewriteRule [P]` auf den
internen Port scheitert am Host-Header.

Ist die App installiert, fängt sie den Link ab (iOS: Universal Link, Android:
App Link) und öffnet den Termin, ohne dass der Browser auch nur aufblitzt.

Dafür nötig:

- `apps/app/app.json`: `ios.associatedDomains` für **beide** Hosts und
  `android.intentFilters` mit `autoVerify` (api-Host auf `/event/` begrenzt).
- Auf `karte.moin-kark.de`: `apps/app/public/.well-known/…` — Expo kopiert
  `public/` beim Web-Export mit.
- Auf `api.moin-kark.de`: die Routen `/.well-known/apple-app-site-association`
  und `/.well-known/assetlinks.json` in `apps/api/src/index.ts`. Der vHost
  reicht alles an die API durch, statische Dateien gäbe es dort sonst nicht.

**Der Android-Fingerprint muss nach dem ersten Play-Upload ausgetauscht
werden.** Bislang steht dort der Upload-Schlüssel. Google signiert die App im
Store mit einem eigenen Schlüssel neu; maßgeblich ist der SHA-256 unter
*Play Console → Setup → App-Signatur → Zertifikat für die App-Signatur*.
Solange der falsche Wert steht, öffnet Android den Link im Browser statt in der
App — iOS ist davon nicht betroffen.

Zu ändern sind dann **zwei** Stellen:

- `apps/api`: Umgebungsvariable `ANDROID_CERT_SHA256` im Stack setzen (kein
  Code-Deploy nötig).
- `apps/app/public/.well-known/assetlinks.json` für die Karten-Domain.

Prüfen nach dem Deploy:

```
curl -s https://api.moin-kark.de/.well-known/assetlinks.json
curl -sI https://api.moin-kark.de/.well-known/apple-app-site-association | grep -i content-type
curl -s https://karte.moin-kark.de/.well-known/assetlinks.json
```

`apple-app-site-association` muss `application/json` sein und ohne Weiterleitung
kommen, sonst ignoriert Apple sie.

## Kosten

Ein Release (Android ~40 Min Linux, iOS ~25 Min macOS) kostet rund 1,80 $;
`timeout-minutes` (45 / 60) verhindert, dass ein hängender Job sechs Stunden
läuft.
