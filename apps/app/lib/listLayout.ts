// Die einzige Quelle für die Kartenhöhe der Terminliste.

import { spacing } from "./theme";

/** Bis zu dieser Schriftgröße wächst die Karte mit, darüber würde die Liste unbrauchbar. */
export const CARD_MAX_FONT_SCALE = 1.5;

/** Anteil der Karte, der NICHT mit der Schrift wächst: Innenabstand oben+unten + Rahmen. */
const CARD_FIXED_PX = 2 * spacing.md + 2;
/** Textblock bei 100 %: Zeit + zwei Titelzeilen + Meta-Zeile inklusive Abstände. */
const CARD_TEXT_PX = 80;

/** Außenhöhe einer Karte bei 100 % Systemschrift (inklusive Rahmen). */
export const CARD_OUTER_HEIGHT = CARD_FIXED_PX + CARD_TEXT_PX;
/** Abstand zwischen zwei Karten (EventList ItemSeparator). */
export const CARD_GAP = spacing.md;
/** Oberer Innenabstand der Liste (EventList contentContainerStyle). */
export const LIST_PADDING_TOP = spacing.lg;
/** Höhe des Griffbereichs am Listen-Sheet. */
export const HANDLE_HEIGHT = 44;

/** Systemschrift-Faktor auf den Bereich begrenzen, in dem die Karte mitwächst. */
export function clampFontScale(fontScale: number): number {
  if (!Number.isFinite(fontScale) || fontScale < 1) return 1;
  return Math.min(fontScale, CARD_MAX_FONT_SCALE);
}

/** Außenhöhe einer Karte bei gegebenem Systemschrift-Faktor. */
export function cardOuterHeight(fontScale = 1): number {
  return CARD_FIXED_PX + Math.round(CARD_TEXT_PX * clampFontScale(fontScale));
}

/** Höhe einer Listenzeile: Karte + Trenner. */
export function rowHeight(fontScale = 1): number {
  return cardOuterHeight(fontScale) + CARD_GAP;
}

/** Position für getItemLayout, mit oberem Innenabstand und Rahmen. */
export function listItemLayout(
  index: number,
  fontScale = 1
): { length: number; offset: number; index: number } {
  const length = rowHeight(fontScale);
  return { length, offset: LIST_PADDING_TOP + length * index, index };
}

/** Sichtbare Sheet-Höhe der Stufen „ein Eintrag“ und „drei Einträge“, mit 20 px Luft. */
export function sheetSnapPx(fontScale = 1): { mid: number; large: number } {
  const card = cardOuterHeight(fontScale);
  const base = HANDLE_HEIGHT + LIST_PADDING_TOP + 20;
  return { mid: base + card, large: base + card * 3 + CARD_GAP * 2 };
}

/** Die vier Ruhestufen des Listen-Sheets, von klein nach groß. */
export const SHEET_STAGES = ["small", "mid", "large", "full"] as const;
export type SheetStage = (typeof SHEET_STAGES)[number];

/** Nächste Stufe für die Screenreader-Aktionen „erhöhen“/„verringern“ — an den Enden bleibt es stehen. */
export function adjacentStage(stage: SheetStage, action: "increment" | "decrement"): SheetStage {
  const i = SHEET_STAGES.indexOf(stage);
  const next = action === "increment" ? i + 1 : i - 1;
  return SHEET_STAGES[Math.max(0, Math.min(SHEET_STAGES.length - 1, next))];
}

/** Sprechendes Label für den Griff („Veranstaltungsliste, Stufe 2 von 4“). */
export function sheetStageLabel(stage: SheetStage): string {
  return `Veranstaltungsliste, Stufe ${SHEET_STAGES.indexOf(stage) + 1} von ${SHEET_STAGES.length}`;
}
