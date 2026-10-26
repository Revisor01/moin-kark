import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { parse } from "yaml";

// Wächter für den Android-Release: Upload über den Baustein play-upload.yml,
// mit denselben Eingaben wie vorher das eigene Skript.

const pfad = (rel: string) => fileURLToPath(new URL(`../../../${rel}`, import.meta.url));
const workflow = parse(readFileSync(pfad(".github/workflows/android-release.yml"), "utf8")) as any;
const { "tracks-pruefen": pruefen, build, upload } = workflow.jobs;
const BAUSTEIN = /^Revisor01\/workflows\/\.github\/workflows\/play-upload\.yml@[0-9a-f]{40}$/;

describe("Android-Release", () => {
  it("prüft Tracks und Neuigkeiten vor dem Bau, ohne Schlüssel", () => {
    expect(pruefen.uses).toMatch(BAUSTEIN);
    expect(pruefen.with["nur-pruefen"]).toBe(true);
    expect(pruefen.secrets).toBeUndefined();
    expect(build.needs).toEqual(["tracks-pruefen"]);
  });

  it("lädt das AAB aus dem Bau-Artefakt hoch, mit Status, Neuigkeiten und Dry-Run", () => {
    const schritt = build.steps.at(-1);
    expect(schritt.uses).toMatch(/^actions\/upload-artifact@[0-9a-f]{40}$/);
    expect(schritt.with).toMatchObject({ name: "aab", path: "apps/app/android/app/build/outputs/bundle/release/app-release.aab" });
    expect(upload.needs).toEqual(["build"]);
    expect(upload.uses).toBe(pruefen.uses);
    expect(upload.with).toEqual({
      paket: "de.godsapp.moinkark",
      tracks: "${{ inputs.tracks }}",
      status: "${{ inputs.release_status }}",
      "production-anteil": "1",
      "release-notes-datei": "apps/app/release-notes-de.txt",
      artefakt: "aab",
      "dry-run": "${{ inputs.dry_run }}",
    });
    expect(upload.secrets).toEqual({ dienstkonto: "${{ secrets.GPLAY_SA_JSON_BASE64 }}" });
  });

  it("der Schlüssel des Dienstkontos steht nicht im Bau-Job", () => {
    expect(JSON.stringify(build)).not.toContain("GPLAY_SA_JSON_BASE64");
    expect(existsSync(pfad(".github/scripts/upload-play.py"))).toBe(false);
  });
});
