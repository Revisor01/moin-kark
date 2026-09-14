// Design-Tokens für Moin Kark — die EINE Quelle für Farben, Abstände, Radien,
// Schatten, Schriften und Textstufen. Hier ändern, nirgends sonst:
//
//   App (React Native)   → apps/app/lib/theme.ts re-exportiert und baut daraus
//                          StyleSheet-Objekte (Schriftschnitte, elevation).
//   API-Seiten /status, /admin → rendern themeCss() direkt in ihr <style>.
//   Landingpage (statisch) → apps/web/theme.css wird aus themeCss() erzeugt
//                          (`npm run sync:theme-css -w packages/shared`); ein
//                          Test prüft, dass die Datei zum Stand hier passt.
//
// Küstlich-evangelischer, warm-redaktioneller Look: Nordsee-Teal + warmer Sand
// + Koralle. Plattformneutral — nur Daten, keine React-Native-Typen.

// ---------------------------------------------------------------------------
// Farben — 20 Namen, 19 Werte (onColor teilt sich den Wert mit surface).
// Alles Weitere (Backdrop, Tints, Overlays, Schatten) sind Alpha-Varianten
// dieser Werte, keine eigenen Farben — s. `alpha` und `withAlpha()`.
// Kontrastangaben: WCAG-Verhältnis auf Sand (`background`), AA für Fließtext
// ist 4,5:1. Der Test in test/theme.test.ts rechnet das nach.
// ---------------------------------------------------------------------------
export const colors = {
  // Text
  ink: "#1C2B2B", // Text, Schatten, Backdrop, Fog, Kartenlabels (13,7:1)
  muted: "#5C6B6B", // Sekundärtext (5,2:1)
  faint: "#687373", // Tertiärtext: Datum, Ort, Hinweise, Fußzeilen (4,5:1)

  // Flächen
  background: "#FBF6EE", // warmer Sand — Seiten, Sheets, Kartenland
  surface: "#FFFFFF", // Karten, Sheets, Ringe um Pins
  onColor: "#FFFFFF", // Text auf Primär/Akzent (eigener Name — im Dark Mode nicht mehr = surface)
  surfaceMuted: "#F3ECE0", // Chips, Segment-Control, Gebäude auf der Karte

  // Linien
  border: "#E6DCCB", // Rahmen, Trenner, Straßen
  borderStrong: "#D6C8B0", // Sheet-Rahmen, Griffe, Kirchspiel-Badge, Kartengrenzen — bewusst beige

  // Marke — Nordsee-Teal
  primary: "#0E6E6E", // Marke, Cluster, Buttons, Links (5,6:1)
  primarySoft: "#A9D6D6", // Wasser, Links auf dunklem Grund

  // Akzent — Koralle
  accent: "#E4572E", // Pins, CTAs, Tipp-Badges — als Text nur 3,4:1: nie für Fließtext
  accentDark: "#B8431F", // Akzent als Text (5,1:1), Hover, Fehlerzustände

  // Status
  success: "#2E7D5B",
  warning: "#C97B2C",

  // Karte
  location: "#2563EB", // „Du bist hier" — muss sich von Cluster-Teal und Pin-Koralle abheben
  mapGreen: "#E4EBDA", // Grünflächen, kein UI-Gegenstück

  // Kategorien, die keine andere Rolle haben. Gottesdienst = primary,
  // Treffpunkt = accent, Yoga = success, Senioren = warning (s. categoryColors).
  catAndacht: "#3A8A8A", // bewusst getrennt von Gottesdienst — auf der Karte unterscheidbar
  catConcert: "#8E44AD",
  catKids: "#D4A017",
} as const;

export type ColorName = keyof typeof colors;

/** Alpha-Regeln statt weiterer Farben. */
export const alpha = {
  backdrop: 0.6, // ink hinter Sheets und Modalen
  overlay: 0.9, // onColor für Buttons/Griff auf dem Hero-Bild
  tint: 0.12, // Farbe als Kachel-/Pillen-Hintergrund
  halo: 0.2, // Standort-Halo
  fog: 0.55, // ink über allem außerhalb Dithmarschens
  // Text auf dunklem Grund (Landingpage-Footer): onColor mit Alpha.
  onDark: { strong: 0.95, text: 0.85, muted: 0.6, faint: 0.5, line: 0.12 },
} as const;

/** `#RRGGBB` → `[r, g, b]`. */
export function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** `withAlpha(colors.ink, alpha.backdrop)` → `"rgba(28,43,43,0.6)"`. */
export function withAlpha(hex: string, a: number): string {
  const [r, g, b] = hexToRgb(hex);
  return `rgba(${r},${g},${b},${a})`;
}

// ---------------------------------------------------------------------------
// Kategorie-Farben (Pins/Chips/Badges) — Referenzen auf die Tokens oben,
// keine Kopien: ändert sich `primary`, wandert Gottesdienst mit.
// ---------------------------------------------------------------------------
export const categoryColors: Record<string, string> = {
  Gottesdienst: colors.primary,
  Andacht: colors.catAndacht,
  Konzerte: colors.catConcert,
  "Sela-Yoga": colors.success,
  Treffpunkt: colors.accent,
  Senioren: colors.warning,
  "Kinder / Jugendliche": colors.catKids,
  default: colors.muted,
};

export function colorForCategory(title?: string): string {
  if (!title) return categoryColors.default;
  // Erst exakter Match, dann grober Schlüsselwort-Match.
  if (categoryColors[title]) return categoryColors[title];
  const t = title.toLowerCase();
  if (t.includes("gottesdienst")) return categoryColors.Gottesdienst;
  if (t.includes("andacht")) return categoryColors.Andacht;
  if (t.includes("konzert") || t.includes("musik")) return categoryColors.Konzerte;
  if (t.includes("yoga")) return categoryColors["Sela-Yoga"];
  if (t.includes("kind") || t.includes("jugend")) return categoryColors["Kinder / Jugendliche"];
  if (t.includes("senior")) return categoryColors.Senioren;
  if (t.includes("treff")) return categoryColors.Treffpunkt;
  return categoryColors.default;
}

// ---------------------------------------------------------------------------
// Kartenfarben — Rollen auf der Karte, ebenfalls nur Referenzen.
// ---------------------------------------------------------------------------
export const mapColors = {
  land: colors.background,
  water: colors.primarySoft,
  green: colors.mapGreen,
  road: colors.border,
  building: colors.surfaceMuted,
  boundary: colors.borderStrong,
  label: colors.ink,
  fog: colors.ink,
  outline: colors.primary, // Umriss des Kirchenkreises
  cluster: colors.primary,
  pin: colors.accent,
  ring: colors.surface, // weißer Ring um Cluster, Pins und Standort
  user: colors.location,
} as const;

// ---------------------------------------------------------------------------
// Abstände, Radien, Bauteilmaße
// ---------------------------------------------------------------------------
export const spacing = {
  xxs: 2,
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
  "3xl": 48, // Landingpage-Sektionen
  "4xl": 64,
} as const;

export const radius = {
  sm: 8,
  md: 12,
  lg: 18,
  pill: 999, // Pillen und alle Kreise (statt „Größe / 2")
} as const;

/** Feste Maße wiederkehrender Bauteile. Layout-Geometrie (Kartenhöhe, Breakpoints) bleibt bei den Komponenten. */
export const sizes = {
  icon: { sm: 18, md: 22 }, // Glyph-Icons (♥ × ★) und Ionicons
  iconButton: 46, // runde Buttons über der Karte
  sheetButton: 36, // Schließen/Herz auf dem Event-Sheet
  badge: 20, // Zähler-Badge auf Buttons
  grabber: { width: 40, height: 4 },
  sheetMaxWidth: 520,
  heroHeight: 200,
  chipMinHeight: 38,
} as const;

// ---------------------------------------------------------------------------
// Schriften und Textstufen
// ---------------------------------------------------------------------------
export const fontFamilies = {
  display: "Bricolage Grotesque", // Headlines, Titel
  body: "DM Sans", // Fließtext, UI
} as const;

/**
 * Die Typo-Leiter: sechs Stufen, je Größe, Zeilenhöhe, Familie und Grundschnitt.
 * body/label/caption gibt es in der App zusätzlich als Medium (500) und
 * Strong (600); Größe und Zeilenhöhe bleiben dabei die der Stufe.
 *
 * caption hat bewusst eine knappe Zeilenhöhe (1,25): sie sitzt in Badges und
 * auf der 104 px hohen Terminkarte, wo jede Zeile zählt.
 */
export const type = {
  display: { size: 26, lineHeight: 30, family: "display", weight: 700 }, // H1, Event-Titel, Onboarding
  heading: { size: 24, lineHeight: 28, family: "display", weight: 700 }, // Sheet-Überschriften
  title: { size: 17, lineHeight: 21, family: "display", weight: 600 }, // Karten-Titel, Leerzustand
  body: { size: 15, lineHeight: 22, family: "body", weight: 400 }, // Fließtext, Buttons, Chips
  label: { size: 13, lineHeight: 18, family: "body", weight: 400 }, // Meta-Zeilen, Hinweise, Zählzeile
  caption: { size: 12, lineHeight: 15, family: "body", weight: 400 }, // Badges, Kicker, Attribution
} as const;

export type TypeStep = keyof typeof type;

/** Kicker und Abschnitts-Labels: caption, Versalien, leicht gesperrt. */
export const eyebrow = { letterSpacing: 0.5 } as const;

// ---------------------------------------------------------------------------
// Schatten — zwei Stufen, beide aus `ink`.
// ---------------------------------------------------------------------------
export const shadows = {
  card: { color: colors.ink, opacity: 0.08, blur: 12, y: 4, elevation: 3 },
  sheet: { color: colors.ink, opacity: 0.18, blur: 20, y: -6, elevation: 16 }, // nach oben, Sheet gegen die Karte
} as const;

// ---------------------------------------------------------------------------
// CSS-Ausgabe — dieselben Tokens als Custom-Properties für Landingpage und
// API-Seiten. Farben zusätzlich als RGB-Tripel (`--ink-rgb`), damit
// `rgba(var(--ink-rgb),var(--alpha-backdrop))` dieselbe Alpha-Regel nutzt wie
// die App.
// ---------------------------------------------------------------------------
const kebab = (s: string) => s.replace(/([a-z0-9])([A-Z])/g, "$1-$2").toLowerCase();

function cssShadow(s: (typeof shadows)[keyof typeof shadows]): string {
  return `0 ${s.y}px ${s.blur}px ${withAlpha(s.color, s.opacity)}`;
}

export function themeCss(): string {
  const lines: string[] = [];
  for (const [name, hex] of Object.entries(colors)) {
    lines.push(`--${kebab(name)}:${hex};--${kebab(name)}-rgb:${hexToRgb(hex).join(",")};`);
  }
  lines.push(
    [
      `--alpha-backdrop:${alpha.backdrop};--alpha-overlay:${alpha.overlay};--alpha-tint:${alpha.tint};--alpha-halo:${alpha.halo};`,
      ...Object.entries(alpha.onDark).map(([k, v]) => `--alpha-on-dark-${k}:${v};`),
    ].join("")
  );
  lines.push(Object.entries(spacing).map(([k, v]) => `--space-${k}:${v}px;`).join(""));
  lines.push(Object.entries(radius).map(([k, v]) => `--radius-${k}:${v}px;`).join(""));
  lines.push(
    `--font-display:"${fontFamilies.display}","${fontFamilies.body}",sans-serif;` +
      `--font-body:"${fontFamilies.body}",system-ui,-apple-system,"Segoe UI",sans-serif;`
  );
  for (const [step, t] of Object.entries(type)) {
    lines.push(`--text-${step}:${t.size}px;--leading-${step}:${t.lineHeight}px;--weight-${step}:${t.weight};`);
  }
  lines.push(`--tracking-eyebrow:${eyebrow.letterSpacing}px;`);
  lines.push(`--shadow-card:${cssShadow(shadows.card)};--shadow-sheet:${cssShadow(shadows.sheet)};`);
  return `/* Generiert aus packages/shared/src/theme.ts — dort ändern, nicht hier. */\n:root{\n  ${lines.join("\n  ")}\n}\n`;
}
