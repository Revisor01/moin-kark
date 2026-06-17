// Design-Tokens für „Was ist los in Dithmarschen".
// Küstlich-evangelischer, warm-redaktioneller Look: Nordsee-Teal + warmer Sand + Koralle.
// Schriften: Bricolage Grotesque (Headlines) + DM Sans (Body).

export const colors = {
  // Marke / Primär — Nordsee-Teal
  primary: "#0E6E6E",
  primaryDark: "#0A5252",
  onPrimary: "#FFFFFF",

  // Akzent — Koralle (Pins, CTAs)
  accent: "#E4572E",
  onAccent: "#FFFFFF",

  // Flächen
  background: "#FBF6EE", // warmer Sand
  surface: "#FFFFFF",
  surfaceMuted: "#F3ECE0",

  // Text
  foreground: "#1C2B2B", // tiefes Tannengrün-Schwarz
  muted: "#5C6B6B",
  faint: "#8A9595",

  // Linien
  border: "#E6DCCB",
  borderStrong: "#D6C8B0",

  // Status
  danger: "#C0392B",
  success: "#2E7D5B",

  // Karten-Style-Farben (für map-style.json verwendet)
  mapWater: "#A9D6D6",
  mapLand: "#FBF6EE",
  mapGreen: "#E4EBDA",
  mapRoad: "#EAD9C0",
  mapLabel: "#3A4A4A",
} as const;

// Kategorie-Farben (Pins/Chips). Gemappt auf semantische Event-Gruppen.
export const categoryColors: Record<string, string> = {
  Gottesdienst: "#0E6E6E",
  Andacht: "#3A8A8A",
  Konzerte: "#8E44AD",
  Kirchenmusik: "#8E44AD",
  "Sela-Yoga": "#2E7D5B",
  Treffpunkt: "#E4572E",
  Treffen: "#E4572E",
  Senioren: "#C97B2C",
  "Kinder / Jugendliche": "#D4A017",
  Konzert: "#8E44AD",
  default: "#5C6B6B",
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

// Bricolage Grotesque = charaktervolle Display-Grotesk für Headlines + Lesetitel.
// DM Sans = ruhiger, gut lesbarer Body für Fließtext und UI.
export const fonts = {
  display: "BricolageGrotesque_600SemiBold",
  displayBold: "BricolageGrotesque_700Bold",
  // Lesetitel (Event-Titel).
  serif: "DMSans_400Regular",
  serifBold: "BricolageGrotesque_600SemiBold",
  body: "DMSans_400Regular",
  bodyMedium: "DMSans_500Medium",
  bodySemibold: "DMSans_600SemiBold",
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
} as const;

export const radius = {
  sm: 8,
  md: 12,
  lg: 18,
  pill: 999,
} as const;

export const shadow = {
  card: {
    shadowColor: "#1C2B2B",
    shadowOpacity: 0.08,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
  sheet: {
    shadowColor: "#1C2B2B",
    shadowOpacity: 0.14,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: -6 },
    elevation: 12,
  },
} as const;

// Dithmarschen-Kartengrenzen + Startansicht.
export const DITHMARSCHEN = {
  center: [9.0, 54.13] as [number, number], // [lng, lat]
  zoom: 9.4,
  bounds: [
    [8.3, 53.8], // SW
    [9.6, 54.5], // NE
  ] as [[number, number], [number, number]],
};
