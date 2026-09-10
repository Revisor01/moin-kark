// Kopiert den Web-Worker von MapLibre nach public/, damit er im Web-Export landet.
//
// MapLibre ab 6.0 bestimmt die URL seines Workers aus `import.meta.url`. Metro
// löst das zu einem Pfad auf, unter dem die Datei im Export nicht liegt — der
// Worker startet dann nie, und ohne ihn dekodiert MapLibre keine Vektorkacheln.
// Die Karte bleibt leer, ohne eine einzige Fehlermeldung zu erzeugen.
//
// Die Dateien werden bei jedem Build frisch aus dem installierten Paket geholt,
// statt im Repo zu liegen: Eine eingecheckte Kopie würde bei einem Update von
// MapLibre still veralten — und der Fehler zeigt sich nicht als Absturz,
// sondern als leere Karte.

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
