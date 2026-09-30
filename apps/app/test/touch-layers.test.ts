import { readFileSync } from "node:fs";
import ts from "typescript";
import { describe, expect, it } from "vitest";

// Wächter für einen Android-Fehler, der erst im nativen View-Baum entsteht und
// sich hier nicht nachstellen lässt — deshalb prüft der Test den Aufbau von
// app/index.tsx.
//
// Eine View, die nur eine Hintergrundfarbe trägt, bildet in React Native (neue
// Architektur) keine eigene Ebene: Ihre Kinder hängen nativ direkt am nächsten
// Vorfahren, der eine bildet. So wurde das Listen-Sheet zum Geschwister der
// Sheets, die über der Karte aufgehen (Profil, Filter, Termin). Gezeichnet wird
// nach zIndex — die Sheets liegen sichtbar oben —, Touches verteilt Android
// unter Geschwistern aber zuerst nach `elevation`, und die hatte nur das
// Listen-Sheet (sein Schatten). Wo es verdeckt unter dem Profil lag, ging jeder
// Wisch an die unsichtbare Liste, und das Profil ließ sich dort nicht scrollen.
//
// Regel: Die View um ein Element mit Schatten bildet selbst eine Ebene —
// `collapsable={false}` oder ein zIndex im Stil. Dann bleibt der Schatten in
// ihr, und die Sheets bekommen ihre Touches.

const source = readFileSync(new URL("../app/index.tsx", import.meta.url), "utf8");
const file = ts.createSourceFile("index.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);

type Jsx = ts.JsxElement | ts.JsxSelfClosingElement;

const nodes: ts.Node[] = [];
(function collect(node: ts.Node) {
  nodes.push(node);
  ts.forEachChild(node, collect);
})(file);

const opening = (el: Jsx) => (ts.isJsxElement(el) ? el.openingElement : el);
const tag = (el: Jsx) => opening(el).tagName.getText(file);

/** Attributwert als Quelltext: `collapsable={false}` → "false"; fehlt es, undefined. */
function attr(el: Jsx, name: string): string | undefined {
  const a = opening(el).attributes.properties.find(
    (p): p is ts.JsxAttribute => ts.isJsxAttribute(p) && p.name.getText(file) === name
  );
  if (!a) return undefined;
  if (!a.initializer) return "true";
  return ts.isJsxExpression(a.initializer)
    ? a.initializer.expression?.getText(file)
    : a.initializer.getText(file);
}

/** Eigenschaften je Stil aus `StyleSheet.create({ … })`. */
const styleKeys = new Map<string, string[]>();
for (const n of nodes) {
  if (!ts.isCallExpression(n) || n.expression.getText(file) !== "StyleSheet.create") continue;
  const [arg] = n.arguments;
  if (!arg || !ts.isObjectLiteralExpression(arg)) continue;
  for (const p of arg.properties) {
    if (ts.isPropertyAssignment(p) && ts.isObjectLiteralExpression(p.initializer)) {
      styleKeys.set(
        p.name.getText(file),
        p.initializer.properties.map((q) => q.name?.getText(file) ?? "")
      );
    }
  }
}

/** Die nächste <View>, in der ein Element steckt. */
function enclosingView(node: ts.Node): ts.JsxElement | undefined {
  for (let p = node.parent; p; p = p.parent) {
    if (ts.isJsxElement(p) && tag(p) === "View") return p;
  }
  return undefined;
}

/** Bildet die View eine eigene Ebene? Ihr Stil steht in der Fehlermeldung. */
function layer(view: ts.JsxElement | undefined): { style: string; own: boolean } {
  if (!view) return { style: "(keine View)", own: false };
  const style = attr(view, "style") ?? "(ohne Stil)";
  const used = [...style.matchAll(/\bstyles\.(\w+)/g)].map((m) => m[1]);
  const own =
    attr(view, "collapsable") === "false" || used.some((s) => styleKeys.get(s)?.includes("zIndex"));
  return { style, own };
}

describe("Elemente mit Schatten liegen auf Android in einer eigenen Ebene", () => {
  it("das Listen-Sheet — sonst schluckt es verdeckt die Wischgesten über Profil und Filter", () => {
    const sheets = nodes.filter(
      (n): n is Jsx =>
        (ts.isJsxElement(n) || ts.isJsxSelfClosingElement(n)) && tag(n) === "DraggableListSheet"
    );
    expect(sheets).toHaveLength(1);
    const { style, own } = layer(enclosingView(sheets[0]));
    expect(own, style).toBe(true);
  });

  it("die Filterleiste mit ihren Knöpfen, über der Karte wie in der Breitansicht", () => {
    const uses = nodes.filter(
      (n) => ts.isJsxExpression(n) && n.expression?.getText(file) === "filterBar"
    );
    expect(uses).toHaveLength(2);
    for (const use of uses) {
      const { style, own } = layer(enclosingView(use));
      expect(own, style).toBe(true);
    }
  });
});
