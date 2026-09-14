#!/usr/bin/env python3
# Laedt ein signiertes AAB zu Google Play hoch und released es in die
# angegebenen Tracks (ein Edit, ein Commit). Reine Stdlib + openssl-Subprozess,
# keine Python-Abhaengigkeiten.
#
# Aufruf: upload-play.py <service-account.json> <app.aab> <notes.txt> <track1,track2,...> [commit|validate]
# validate: kompletter Durchlauf inkl. Upload + Track-Zuweisung + :validate,
# aber die Edit wird VERWORFEN statt committet (kein Release, versionCode
# bleibt unverbraucht) — fuer Workflow-Tests.
import base64
import json
import subprocess
import sys
import tempfile
import time
import urllib.parse
import urllib.request

SA_JSON, AAB, NOTES_FILE, TRACKS = sys.argv[1], sys.argv[2], sys.argv[3], sys.argv[4]
MODE = sys.argv[5] if len(sys.argv) > 5 else "commit"
PKG = "de.godsapp.kkdithkarte"
API = f"https://androidpublisher.googleapis.com/androidpublisher/v3/applications/{PKG}"
UP = f"https://androidpublisher.googleapis.com/upload/androidpublisher/v3/applications/{PKG}"


def b64url(data):
    return base64.urlsafe_b64encode(data).rstrip(b"=")


def get_token():
    with open(SA_JSON) as f:
        sa = json.load(f)
    now = int(time.time())
    header = b64url(json.dumps({"alg": "RS256", "typ": "JWT"}).encode())
    claims = b64url(json.dumps({
        "iss": sa["client_email"],
        "scope": "https://www.googleapis.com/auth/androidpublisher",
        "aud": sa["token_uri"],
        "iat": now,
        "exp": now + 3600,
    }).encode())
    signing_input = header + b"." + claims
    with tempfile.NamedTemporaryFile("w", suffix=".pem") as keyf:
        keyf.write(sa["private_key"])
        keyf.flush()
        sig = subprocess.run(
            ["openssl", "dgst", "-sha256", "-sign", keyf.name],
            input=signing_input, capture_output=True, check=True,
        ).stdout
    jwt = signing_input + b"." + b64url(sig)
    body = urllib.parse.urlencode({
        "grant_type": "urn:ietf:params:oauth:grant-type:jwt-bearer",
        "assertion": jwt.decode(),
    }).encode()
    req = urllib.request.Request(sa["token_uri"], data=body, method="POST")
    req.add_header("Content-Type", "application/x-www-form-urlencoded")
    with urllib.request.urlopen(req) as r:
        return json.loads(r.read())["access_token"]


TOKEN = get_token()


def call(method, url, data=None, ctype="application/json"):
    req = urllib.request.Request(url, data=data, method=method)
    req.add_header("Authorization", f"Bearer {TOKEN}")
    req.add_header("Content-Type", ctype)
    try:
        with urllib.request.urlopen(req) as r:
            body = r.read()
            return json.loads(body) if body else {}
    except urllib.error.HTTPError as e:
        # Google legt den GRUND in den Antwortkoerper; urllib zeigt nur den
        # Status. Ohne diese Zeilen stand im Log nur "HTTP Error 403:
        # Forbidden" -- ohne zu sagen, WAS verboten ist (Befund 04.09.2026,
        # versionCode 85 scheiterte zweimal am :commit).
        try:
            details = e.read().decode("utf-8", "replace")[:2000]
        except Exception:
            details = "(kein Antwortkoerper)"
        print(f"FEHLER {e.code} bei {method} {url}\n{details}", file=sys.stderr)
        raise


with open(NOTES_FILE) as f:
    notes = f.read().strip()

# Google Play erlaubt hoechstens 500 Zeichen je Sprache. Wird das ueberschritten,
# laufen Upload UND Track-Zuweisung durch und erst der :commit scheitert -- mit
# "403 PERMISSION_DENIED", was nach einem Rechteproblem aussieht und keines ist
# (Befund 04.09.2026: 517 Zeichen, zwei Builds verloren). Deshalb hier pruefen,
# bevor ueberhaupt ein Edit angelegt wird.
if len(notes) > 500:
    print(f"FEHLER: Release-Notes sind {len(notes)} Zeichen lang, Google Play "
          f"erlaubt hoechstens 500. Bitte {NOTES_FILE} kuerzen.", file=sys.stderr)
    sys.exit(1)

edit = call("POST", f"{API}/edits", b"")["id"]
print(f"Edit: {edit}")
try:
    with open(AAB, "rb") as f:
        aab_bytes = f.read()
    vc = call("POST", f"{UP}/edits/{edit}/bundles?uploadType=media",
              aab_bytes, "application/octet-stream")["versionCode"]
    print(f"Bundle hochgeladen: versionCode {vc}")

    release = {"releases": [{
        "status": "completed",
        "versionCodes": [str(vc)],
        "releaseNotes": [{"language": "de-DE", "text": notes}],
    }]}
    for track in TRACKS.split(","):
        call("PUT", f"{API}/edits/{edit}/tracks/{track}", json.dumps(release).encode())
        print(f"Track {track}: gesetzt")

    if MODE == "validate":
        call("POST", f"{API}/edits/{edit}:validate", b"")
        print("Validate OK — Edit wird verworfen (Dry-Run, kein Release)")
        call("DELETE", f"{API}/edits/{edit}")
    else:
        call("POST", f"{API}/edits/{edit}:commit", b"")
        print("Commit OK — Release eingereicht")
except Exception:
    try:
        call("DELETE", f"{API}/edits/{edit}")
        print("Edit verworfen (Fehlerfall)")
    except Exception:
        pass
    raise
