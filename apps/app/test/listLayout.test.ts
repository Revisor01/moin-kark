import { describe, expect, it } from "vitest";
import {
  CARD_GAP,
  CARD_MAX_FONT_SCALE,
  CARD_OUTER_HEIGHT,
  HANDLE_HEIGHT,
  LIST_PADDING_TOP,
  adjacentStage,
  cardOuterHeight,
  clampFontScale,
  listItemLayout,
  rowHeight,
  sheetSnapPx,
  sheetStageLabel,
} from "../lib/listLayout";

describe("cardOuterHeight", () => {
  it("entspricht bei 100 % Systemschrift der bisherigen Karte inklusive Rahmen", () => {
    // 104 px Inhalt + 2 × 1 px Rahmen — das war die tatsächliche Höhe, mit der
    // getItemLayout vorher NICHT gerechnet hat (dort standen 104).
    expect(CARD_OUTER_HEIGHT).toBe(106);
    expect(cardOuterHeight(1)).toBe(106);
    expect(cardOuterHeight()).toBe(106);
  });

  it("wächst bei iOS „Größerer Text“ 150 % über die im Audit gemessenen 127 px hinaus", () => {
    // Zeit (18) + zwei Titelzeilen (63) + Meta (22) + Innenabstand (24) ≈ 127.
    expect(cardOuterHeight(1.5)).toBe(146);
    expect(cardOuterHeight(1.5)).toBeGreaterThanOrEqual(127);
  });

  it("deckelt bei CARD_MAX_FONT_SCALE — darüber bleibt die Karte stehen", () => {
    expect(CARD_MAX_FONT_SCALE).toBe(1.5);
    expect(cardOuterHeight(2)).toBe(cardOuterHeight(1.5));
    expect(cardOuterHeight(3.5)).toBe(146);
  });

  it("schrumpft nie unter die 100-%-Höhe, auch bei verkleinerter Systemschrift", () => {
    expect(cardOuterHeight(0.85)).toBe(106);
    expect(clampFontScale(0.85)).toBe(1);
    expect(clampFontScale(Number.NaN)).toBe(1);
    expect(clampFontScale(1.2)).toBe(1.2);
  });
});

describe("listItemLayout", () => {
  it("rechnet den oberen Listenabstand und den Rahmen mit ein", () => {
    expect(LIST_PADDING_TOP).toBe(16);
    expect(CARD_GAP).toBe(12);
    expect(rowHeight(1)).toBe(118);
    expect(listItemLayout(0)).toEqual({ length: 118, offset: 16, index: 0 });
    expect(listItemLayout(1)).toEqual({ length: 118, offset: 134, index: 1 });
  });

  it("liegt nach 50 Einträgen nicht mehr 100–200 px daneben", () => {
    // Alte Rechnung: 116 × 50 = 5800. Tatsächlich: 16 + 118 × 50 = 5916.
    const alt = (104 + CARD_GAP) * 50;
    expect(listItemLayout(50).offset).toBe(5916);
    expect(listItemLayout(50).offset - alt).toBe(116);
  });

  it("folgt der Systemschrift", () => {
    expect(listItemLayout(2, 1.5)).toEqual({ length: 158, offset: 16 + 158 * 2, index: 2 });
  });
});

describe("sheetSnapPx", () => {
  it("liefert bei 100 % die bekannten Stufen für einen und drei Einträge", () => {
    expect(HANDLE_HEIGHT).toBe(44);
    // 44 + 16 + 20 + 106 = 186 (vorher 184 mit der um 2 px zu kleinen Karte).
    expect(sheetSnapPx(1)).toEqual({ mid: 186, large: 422 });
  });

  it("macht bei großer Schrift Platz für drei volle Karten", () => {
    const { mid, large } = sheetSnapPx(1.5);
    expect(mid).toBe(226);
    expect(large).toBe(44 + 16 + 20 + 146 * 3 + 12 * 2);
  });
});

describe("Screenreader-Stufen des Listen-Sheets", () => {
  it("schaltet eine Stufe hoch oder runter und bleibt an den Enden stehen", () => {
    expect(adjacentStage("mid", "increment")).toBe("large");
    expect(adjacentStage("mid", "decrement")).toBe("small");
    expect(adjacentStage("full", "increment")).toBe("full");
    expect(adjacentStage("small", "decrement")).toBe("small");
  });

  it("nennt die Stufe sprechend", () => {
    expect(sheetStageLabel("mid")).toBe("Veranstaltungsliste, Stufe 2 von 4");
    expect(sheetStageLabel("full")).toBe("Veranstaltungsliste, Stufe 4 von 4");
  });
});
