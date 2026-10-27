// Kopiert den MapLibre-Worker nach public/, weil Metro seine URL falsch auflöst und die Karte sonst leer bleibt.

import { copyFileSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const dist = dirname(require.resolve("maplibre-gl/dist/maplibre-gl.mjs"));
const ziel = join(dirname(fileURLToPath(import.meta.url)), "..", "public");

mkdirSync(ziel, { recursive: true });
// Der Worker lädt `maplibre-gl-shared.mjs` relativ zu sich selbst — beide brauchen wir.
for (const datei of ["maplibre-gl-worker.mjs", "maplibre-gl-shared.mjs"]) {
  copyFileSync(join(dist, datei), join(ziel, datei));
  console.log(`[map-worker] ${datei} → public/`);
}
