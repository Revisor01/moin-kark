// Reine, testbare Maße der Terminliste. Hier — und NUR hier — steht, wie hoch
// eine Karte ist. EventCard (Darstellung), EventList (getItemLayout) und
// DraggableListSheet (Snap-Stufen) leiten alles aus diesen Funktionen ab;
// vorher stand dieselbe Zahl dreimal im Code und stimmte nirgends genau.

import { spacing } from "./theme";

/**
 * Bis zu dieser Systemschriftgröße wächst die Karte mit (iOS „Größerer Text“
 * 150 %, Android „Schriftgröße: Größer“). Darüber bleibt sie stehen und die
 * Kartentexte werden gedeckelt (maxFontSizeMultiplier): eine Karte, die
 * doppelt so hoch ist wie ihr Bild, ließe im Listen-Sheet nur noch einen
 * Eintrag sichtbar — dann wäre die Liste als Liste nicht mehr benutzbar.
 */
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

/**
 * Position eines Eintrags für FlatList.getItemLayout. Der obere Innenabstand
 * der Liste gehört in den Offset — ohne ihn lag die Rechnung um 16 px daneben,
 * dazu 2 px pro Eintrag durch den Rahmen: nach 50 Einträgen über 100 px.
 */
export function listItemLayout(
  index: number,
  fontScale = 1
): { length: number; offset: number; index: number } {
  const length = rowHeight(fontScale);
  return { length, offset: LIST_PADDING_TOP + length * index, index };
}

/**
 * Sichtbare Sheet-Höhe (ohne Safe Area) der Stufen „ein Eintrag“ und „drei
 * Einträge“. Die 20 px sind Luft, damit die letzte Karte nicht an der Kante klebt.
 */
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
