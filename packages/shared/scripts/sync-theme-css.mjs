// Schreibt die Design-Tokens als CSS-Custom-Properties nach apps/web/theme.css.
//
// Die Landingpage ist statisches HTML ohne Build-Step und kann aus dem
// TypeScript-Theme nichts importieren — sie bekommt deshalb eine erzeugte Datei,
// die mit ins Repo geht (das Deploy ist ein reines rsync). Nach jeder Änderung an
// packages/shared/src/theme.ts einmal laufen lassen:
//
//   npm run sync:theme-css -w packages/shared
//
// Vergisst man es, schlägt der Test in test/theme.test.ts an (Diff-Check).
// Muster: apps/app/scripts/sync-map-worker.mjs.

import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { tsImport } from "tsx/esm/api";

const here = dirname(fileURLToPath(import.meta.url));
const { themeCss } = await tsImport("../src/theme.ts", import.meta.url);
const ziel = join(here, "..", "..", "..", "apps", "web", "theme.css");

writeFileSync(ziel, themeCss());
console.log(`[theme-css] theme.css → apps/web/`);
