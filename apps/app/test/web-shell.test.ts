import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// Ladezeit der Web-Karte: Seitenhülle, Cache-Regeln und das, was nicht ins Startpaket darf.

const appDir = fileURLToPath(new URL("..", import.meta.url));
const read = (relative: string) => readFileSync(new URL(relative, `file://${appDir}`), "utf8");

const indexHtml = read("public/index.html");
const htaccess = read("public/.htaccess");

/** Muster aus den FilesMatch-Blöcken, in der Reihenfolge der Datei. */
function filesMatchRules(src: string): { pattern: RegExp; cacheControl: string }[] {
  const rules: { pattern: RegExp; cacheControl: string }[] = [];
  const block = /<FilesMatch "([^"]+)">\s*Header set Cache-Control "([^"]+)"\s*<\/FilesMatch>/g;
  for (const m of src.matchAll(block)) rules.push({ pattern: new RegExp(m[1]), cacheControl: m[2] });
  return rules;
}

/** Wie Apache: der letzte passende Block gewinnt. */
function cacheControlFor(file: string): string | undefined {
  let result: string | undefined;
  for (const r of filesMatchRules(htaccess)) if (r.pattern.test(file)) result = r.cacheControl;
  return result;
}

describe("Seitenhülle der Web-Karte", () => {
  it("ist deutsch, mit Titel und Beschreibung", () => {
    expect(indexHtml).toContain('<html lang="de">');
    expect(indexHtml).toMatch(/<title>Moin Kark – [^<]+<\/title>/);
    expect(indexHtml).toMatch(/<meta name="description" content="[^"]{80,160}" \/>/);
  });

  it("hat kein falsch geschriebenes Meta-Attribut aus der Vorlage", () => {
    expect(indexHtml).not.toContain("httpEquiv");
  });

  it("lädt den Feed vor, mit derselben CORS-Art wie fetch in der App", () => {
    expect(indexHtml).toContain(
      '<link rel="preload" href="https://api.moin-kark.de/events.geojson" as="fetch" crossorigin="anonymous" />'
    );
  });

  it("zeigt vor dem Skript schon etwas an", () => {
    expect(indexHtml).toMatch(/<div id="root"><div class="mk-start"[^>]*>.*Moin Kark.*<\/div><\/div>/);
  });
});

describe("Cache-Regeln der Web-Karte", () => {
  it("hält Dateien mit Prüfsumme ein Jahr", () => {
    const immutable = "public, max-age=31536000, immutable";
    expect(cacheControlFor("entry-f8596695fec6dbc7a3351a97f868fb2f.js")).toBe(immutable);
    expect(cacheControlFor("maplibre-gl-dc3f9f1339c2c312db0e4c8f314a98f9.css")).toBe(immutable);
    expect(cacheControlFor("ph-heide.71ebacb762caac6c6685212ad8adcd75.jpg")).toBe(immutable);
    expect(cacheControlFor("DMSans_400Regular.74f9bb7405caec741a24db735b2c5733.ttf")).toBe(immutable);
  });

  it("fragt Seite, Worker und Zuordnungsdateien jedes Mal nach", () => {
    expect(cacheControlFor("index.html")).toBe("no-cache");
    expect(cacheControlFor("maplibre-gl-worker.mjs")).toBe("no-cache");
    expect(cacheControlFor("assetlinks.json")).toBe("no-cache");
  });

  it("hält Dateien ohne Prüfsumme nicht ein Jahr fest", () => {
    expect(cacheControlFor("entry.js")).toBeUndefined();
    expect(cacheControlFor("ph-heide.jpg")).toBeUndefined();
  });
});

describe("Startpaket im Browser", () => {
  const components = fileURLToPath(new URL("../components/", import.meta.url));
  const webFiles = readdirSync(components).filter((f) => f.endsWith(".tsx") && !f.endsWith(".native.tsx"));

  it("zieht keine Symbolschrift: Steuerleiste nutzt BarIcon", () => {
    expect(read("components/FilterBar.tsx")).not.toContain("@expo/vector-icons");
    expect(read("components/BarIcon.web.tsx")).not.toContain("@expo/vector-icons");
  });

  it("hat für jedes Symbol der Steuerleiste einen Umriss", () => {
    const names = [...read("components/BarIcon.tsx").matchAll(/"(\w+)"/g)].map((m) => m[1]);
    const web = read("components/BarIcon.web.tsx");
    for (const n of ["search", "star", "navigate"]) {
      expect(names).toContain(n);
      expect(web).toMatch(new RegExp(`\\b${n}:\\s*\\n?\\s*"M`));
    }
  });

  it("lädt MapLibre nur dynamisch", () => {
    const statisch = /^import[^;]*from "maplibre-gl";/m;
    for (const f of webFiles) expect(read(`components/${f}`)).not.toMatch(statisch);
    expect(read("components/WebMap.tsx")).toContain('import("maplibre-gl")');
    expect(read("components/EventMap.web.tsx")).toContain('lazy(() => import("./WebMap"))');
  });
});

describe("Landingpage", () => {
  const webDir = fileURLToPath(new URL("../../web/", import.meta.url));
  const landing = readFileSync(`${webDir}index.html`, "utf8");
  const files = new Set(readdirSync(webDir));

  it("bietet jedes Kirchenbild auch in 800 px an, und die Datei liegt bereit", () => {
    const bilder = [...landing.matchAll(/<img[^>]*src="\/([a-z]+)\.jpg"[^>]*>/g)];
    expect(bilder.length).toBe(20);
    for (const [tag, name] of bilder) {
      expect(tag).toContain(`srcset="/${name}-800.jpg 800w, /${name}.jpg 1600w"`);
      expect(files.has(`${name}-800.jpg`)).toBe(true);
    }
  });

  it("hält Bilder eine Woche im Cache, die Seite nicht", () => {
    const rules = filesMatchRules(readFileSync(`${webDir}.htaccess`, "utf8"));
    const forFile = (f: string) => rules.filter((r) => r.pattern.test(f)).at(-1)?.cacheControl;
    expect(forFile("heide-800.jpg")).toBe("public, max-age=604800, stale-while-revalidate=86400");
    expect(forFile("index.html")).toBe("no-cache");
  });
});

describe("Landingpage: Texte, Kontrast, Kalender-Abos", () => {
  const webDir = fileURLToPath(new URL("../../web/", import.meta.url));
  const landing = readFileSync(`${webDir}index.html`, "utf8");

  it("nennt keine feste Gemeindezahl und verspricht nicht „kein Tracking“", () => {
    expect(landing).not.toMatch(/\d+ Kirchengemeinden/);
    expect(landing).not.toContain("kein Tracking");
    expect(landing).toContain("Helgoland");
  });

  it("setzt den Hauptknopf in Petrol, weil Weiß auf Orange nur 3,7:1 hat", () => {
    expect(landing).toContain(".btn-primary{background:var(--primary);color:var(--on-color)}");
  });

  it("bietet für jedes Kirchspiel ein Abo, zusammen alle Termine", () => {
    const abos = [...landing.matchAll(/href="webcal:\/\/api\.moin-kark\.de\/calendar\.ics(\?[^"]*)?"/g)].map(
      (m) => decodeURIComponent(m[1] ?? "")
    );
    expect(abos).toEqual([
      "?kirchspiel=Eider",
      "?kirchspiel=Geest",
      "?kirchspiel=Heide und Umgebung",
      "?kirchspiel=Mitte-Süd",
      "?kirchspiel=Süd",
      "?kirchspiel=West",
      "",
    ]);
  });

  it("hat robots.txt und Sitemap auf beiden Seiten", () => {
    expect(readFileSync(`${webDir}robots.txt`, "utf8")).toContain("Sitemap: https://moin-kark.de/sitemap.xml");
    expect(readFileSync(`${webDir}sitemap.xml`, "utf8")).toContain("<loc>https://moin-kark.de/</loc>");
    expect(read("public/robots.txt")).toContain("Sitemap: https://karte.moin-kark.de/sitemap.xml");
    expect(read("public/sitemap.xml")).toContain("<loc>https://karte.moin-kark.de/</loc>");
  });
});
