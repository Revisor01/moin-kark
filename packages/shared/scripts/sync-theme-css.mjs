// Schreibt die Design-Tokens nach apps/web/theme.css. Nach Änderungen an theme.ts: npm run sync:theme-css -w packages/shared

import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { tsImport } from "tsx/esm/api";

const here = dirname(fileURLToPath(import.meta.url));
const { themeCss } = await tsImport("../src/theme.ts", import.meta.url);
const ziel = join(here, "..", "..", "..", "apps", "web", "theme.css");

writeFileSync(ziel, themeCss());
console.log(`[theme-css] theme.css → apps/web/`);
