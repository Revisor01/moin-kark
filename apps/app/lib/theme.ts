// React-Native-Seite des Themes. Die Werte kommen aus @moinkark/shared
// (packages/shared/src/theme.ts) — DORT ändern, nicht hier. Diese Datei
// re-exportiert die Tokens und baut daraus nur, was React Native konkret
// braucht: Schriftschnitt-Namen, Schatten mit `elevation`, fertige Textstufen.

import {
  colors,
  eyebrow,
  shadows,
  sizes,
  type,
  withAlpha,
  alpha,
  type TypeStep,
} from "@moinkark/shared";
import type { TextStyle, ViewStyle } from "react-native";

export {
  alpha,
  categoryColors,
  colorForCategory,
  colors,
  mapColors,
  radius,
  sizes,
  spacing,
  withAlpha,
} from "@moinkark/shared";

// Bricolage Grotesque = charaktervolle Display-Grotesk für Headlines + Titel.
// DM Sans = ruhiger, gut lesbarer Body für Fließtext und UI.
// Die Namen sind die Schnitte aus @expo-google-fonts (s. app/_layout.tsx).
export const fonts = {
  display: "BricolageGrotesque_600SemiBold",
  displayBold: "BricolageGrotesque_700Bold",
  body: "DMSans_400Regular",
  bodyMedium: "DMSans_500Medium",
  bodySemibold: "DMSans_600SemiBold",
} as const;

/** Schnittname zu Familie + Gewicht der Leiter. */
function fontFor(family: "display" | "body", weight: 400 | 500 | 600 | 700): string {
  if (family === "display") return weight >= 700 ? fonts.displayBold : fonts.display;
  return weight >= 600 ? fonts.bodySemibold : weight >= 500 ? fonts.bodyMedium : fonts.body;
}

function step(name: TypeStep, weight?: 400 | 500 | 600 | 700): TextStyle {
  const t = type[name];
  return { fontFamily: fontFor(t.family, weight ?? t.weight), fontSize: t.size, lineHeight: t.lineHeight };
}

/**
 * Fertige Textstufen fürs StyleSheet — Größe und Zeilenhöhe kommen aus der
 * Leiter, body/label/caption zusätzlich als Medium (500) und Strong (600).
 * Eigene fontSize/lineHeight in Komponenten sind seitdem ein Verstoß.
 */
export const text = {
  display: step("display"),
  heading: step("heading"),
  title: step("title"),
  body: step("body"),
  bodyMedium: step("body", 500),
  bodyStrong: step("body", 600),
  label: step("label"),
  labelMedium: step("label", 500),
  labelStrong: step("label", 600),
  caption: step("caption"),
  captionMedium: step("caption", 500),
  captionStrong: step("caption", 600),
  /** Kicker und Abschnitts-Labels: Versalien, leicht gesperrt. */
  eyebrow: { ...step("caption", 600), letterSpacing: eyebrow.letterSpacing, textTransform: "uppercase" },
} as const satisfies Record<string, TextStyle>;

/** Text-Glyphen als Icons (♥ ♡ × ★): Größe aus sizes.icon, Zeilenhöhe knapp darüber. */
export const glyph = {
  sm: { fontSize: sizes.icon.sm, lineHeight: sizes.icon.sm + 2 },
  md: { fontSize: sizes.icon.md, lineHeight: sizes.icon.md + 2 },
} as const satisfies Record<string, TextStyle>;

function rnShadow(s: (typeof shadows)[keyof typeof shadows]): ViewStyle {
  return {
    shadowColor: s.color,
    shadowOpacity: s.opacity,
    shadowRadius: s.blur,
    shadowOffset: { width: 0, height: s.y },
    elevation: s.elevation,
  };
}

export const shadow = {
  card: rnShadow(shadows.card),
  sheet: rnShadow(shadows.sheet),
} as const;

/** Halbtransparente Flächen — Alpha-Regeln aus dem Theme, fertig als rgba. */
export const overlays = {
  backdrop: withAlpha(colors.ink, alpha.backdrop),
  onImage: withAlpha(colors.onColor, alpha.overlay),
} as const;
