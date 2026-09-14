import { useEffect, useMemo, useRef, useState } from "react";
import { StyleSheet, View, useWindowDimensions } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";
import {
  HANDLE_HEIGHT,
  SHEET_STAGES,
  adjacentStage,
  sheetSnapPx,
  sheetStageLabel,
  type SheetStage,
} from "../lib/listLayout";
import { colors, radius, shadow, sizes } from "../lib/theme";

interface Props {
  /** Höhe des Bereichs, über dem das Sheet liegt (Karte sichtbar dahinter). */
  availableHeight: number;
  /** Untere Safe-Area (Home-Indicator) — Griff muss darüber greifbar bleiben. */
  bottomInset?: number;
  children: React.ReactNode;
  /**
   * Meldet nach jedem Einrasten, wie viele Pixel des Sheets UNTER der
   * Bildschirmkante liegen. Die Liste im Sheet braucht genau diesen Wert als
   * Endabstand, damit der letzte Eintrag in den sichtbaren Bereich scrollt.
   */
  onHiddenBottomChange?: (px: number) => void;
}

// Vier feste Stufen (sichtbare Sheet-Höhe von unten gemessen):
//  1) nur der Griff (über der Safe Area greifbar)
//  2) Griff + 1 voller Eintrag
//  3) Griff + 3 volle Einträge (Karte noch gut sichtbar)
//  4) fast volle Höhe — zum Durchblättern langer Listen
// Die Kartenmaße für 2) und 3) kommen aus lib/listLayout (eine Quelle für
// EventCard, EventList und dieses Sheet) und folgen der Systemschrift.
// Stufe 4 als Anteil der verfügbaren Höhe: Bei vielen Treffern will man lesen,
// nicht die Karte sehen.
const SNAP_FULL_FRACTION = 0.92;

const SPRING = { damping: 20, stiffness: 200, mass: 0.6 };

export default function DraggableListSheet({
  availableHeight,
  bottomInset = 0,
  children,
  onHiddenBottomChange,
}: Props) {
  const { fontScale } = useWindowDimensions();
  const heights = useMemo(() => {
    const snap = sheetSnapPx(fontScale);
    // Stufe 1: nur Griff, aber über dem Home-Indicator (sonst nicht wischbar).
    const small = HANDLE_HEIGHT + bottomInset;
    // Obergrenze: nie höher als verfügbarer Platz (kleine Screens).
    const cap = availableHeight * SNAP_FULL_FRACTION;
    const full = cap;
    const large = Math.min(snap.large + bottomInset, cap);
    const mid = Math.min(snap.mid + bottomInset, large);
    return { small, mid, large, full };
  }, [availableHeight, bottomInset, fontScale]);

  // WICHTIG zur Architektur: Das Sheet hat eine FESTE Höhe (Vollstufe) und wird
  // per translateY ins Bild geschoben. Die Höhe selbst wird NICHT animiert —
  // animierte Layout-Höhen (useAnimatedStyle + height) kamen auf iOS nicht
  // zuverlässig im Yoga-Layout an: Das Sheet blieb inhaltsgroß, die Liste
  // überzog den ganzen Bildschirm und ihre letzten Einträge lagen dauerhaft
  // unterhalb der sichtbaren Kante (Web war korrekt, nur Native betroffen).
  // Transforms laufen dagegen am Layout vorbei und sind auf allen Plattformen
  // verlässlich — der Standardweg für Bottom-Sheets.
  // sheetHeight = aktuell sichtbare Höhe des Sheets (von unten gemessen).
  // Start in Stufe 2 (erster Eintrag lesbar).
  const sheetHeight = useSharedValue(heights.mid);
  const startHeight = useSharedValue(heights.mid);

  // Der unter der Bildschirmkante liegende Sheet-Anteil je Ruhestufe → als
  // Endabstand an die Liste melden (dort als Scroll-Inhalt, nie als Container-
  // Padding). Während des Ziehens bleibt der Wert der letzten Ruhestufe stehen;
  // nach dem Einrasten stimmt er wieder exakt.
  const reportHidden = (visible: number) => {
    onHiddenBottomChange?.(Math.max(0, heights.full - visible));
  };

  // Welche Ruhestufe zuletzt eingerastet ist. Ändert sich die verfügbare Höhe
  // (iPad-Split-View; die App ist sonst hochkant fixiert), muss die Meldung zu
  // DIESER Stufe passen — vorher ging pauschal `mid` raus, auch wenn das Sheet
  // gerade ganz offen stand, und die Liste bekam einen falschen Endabstand.
  const restStage = useRef<SheetStage>("mid");
  // Dieselbe Stufe noch einmal als State — nur für den Screenreader-Griff
  // (Label „Stufe 2 von 4“ muss neu rendern, die Ref tut das nicht).
  const [stage, setStage] = useState<SheetStage>("mid");
  useEffect(() => {
    const visible = heights[restStage.current];
    sheetHeight.value = visible;
    startHeight.value = visible;
    reportHidden(visible);
    // Absichtlich nur an `heights` gebunden: restStage ist eine Ref, die Höhen
    // sind Shared Values, reportHidden ändert sich nicht — nichts davon soll den
    // Effekt erneut auslösen.
  }, [heights]);

  // Reanimated 4.3.x hat beim allerersten Frame einen Race zwischen dem
  // AnimationFrameBatchinator (DisplayLink) und dem noch nicht registrierten
  // ShadowNode → EXC_BAD_ACCESS in REANodesManager::performOperations beim Start
  // (software-mansion/react-native-reanimated#9293 / #9402). Wir halten das Sheet
  // deshalb einen Frame lang statisch (fester Transform, kein animierter Style),
  // bis der native View sicher gemountet ist, und lassen erst dann Animationen zu.
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const raf = requestAnimationFrame(() => setReady(true));
    return () => cancelAnimationFrame(raf);
  }, []);

  /** Merkt sich die eingerastete Stufe (läuft auf dem JS-Thread). */
  const rememberStage = (target: number) => {
    const next: SheetStage =
      target === heights.full
        ? "full"
        : target === heights.large
          ? "large"
          : target === heights.small
            ? "small"
            : "mid";
    restStage.current = next;
    setStage(next);
    reportHidden(target);
  };

  const snapTo = (target: number) => {
    "worklet";
    sheetHeight.value = withSpring(target, SPRING);
    runOnJS(rememberStage)(target);
  };

  // Screenreader (VoiceOver/TalkBack): Der Griff ist als „anpassbar“ gemeldet;
  // Wischen nach oben/unten schaltet eine Stufe weiter. Läuft auf dem
  // JS-Thread, deshalb ohne runOnJS direkt zur Stufe springen.
  const onAccessibilityAction = (e: { nativeEvent: { actionName: string } }) => {
    const action = e.nativeEvent.actionName;
    if (action !== "increment" && action !== "decrement") return;
    const target = heights[adjacentStage(restStage.current, action)];
    sheetHeight.value = withSpring(target, SPRING);
    rememberStage(target);
  };

  // Tipp auf den Griff → nächstgrößere Stufe (small→mid→large→full), von full zurück auf small.
  const tap = Gesture.Tap()
    .enabled(ready)
    .maxDuration(250)
    .onEnd(() => {
      const v = sheetHeight.value;
      // Aktuelle Stufe grob bestimmen und eine hochschalten (wrap-around).
      const midThreshold = (heights.small + heights.mid) / 2;
      const largeThreshold = (heights.mid + heights.large) / 2;
      const fullThreshold = (heights.large + heights.full) / 2;
      let target: number;
      if (v < midThreshold) target = heights.mid;
      else if (v < largeThreshold) target = heights.large;
      else if (v < fullThreshold) target = heights.full;
      else target = heights.small;
      snapTo(target);
    });

  const pan = Gesture.Pan()
    .enabled(ready)
    .onStart(() => {
      startHeight.value = sheetHeight.value;
    })
    .onUpdate((e) => {
      // Nach oben ziehen (negatives translationY) → höher.
      const next = startHeight.value - e.translationY;
      sheetHeight.value = Math.max(
        heights.small * 0.6,
        Math.min(heights.full, next)
      );
    })
    .onEnd((e) => {
      const v = sheetHeight.value;
      const velocity = e.velocityY;
      // Ziel anhand Position + Wurfrichtung wählen.
      let target = heights.mid;
      if (velocity < -500) {
        // Nach oben geworfen → jeweils die nächsthöhere Stufe.
        target = v < heights.mid ? heights.mid : v < heights.large ? heights.large : heights.full;
      } else if (velocity > 500) {
        // Nach unten geworfen → nächstniedrigere Stufe.
        target = v > heights.large ? heights.large : v > heights.mid ? heights.mid : heights.small;
      } else {
        // Ohne Schwung: zur nächstgelegenen Stufe einrasten.
        const steps = [heights.small, heights.mid, heights.large, heights.full];
        target = steps[0];
        for (const s of steps) {
          if (Math.abs(v - s) < Math.abs(v - target)) target = s;
        }
      }
      snapTo(target);
    });

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: -sheetHeight.value }],
  }));

  return (
    // Äußere View: feste Höhe (Vollstufe), geparkt direkt UNTER der sichtbaren
    // Fläche; translateY schiebt den benötigten Anteil ins Bild. Trägt Schatten,
    // KEIN overflow:hidden (sonst wird der Schatten weggeclippt).
    // Vor `ready` fester Transform (kein shared-value-getriebener Style) → umgeht
    // den Reanimated-Start-Race.
    <Animated.View
      style={[
        styles.sheetShadow,
        { top: availableHeight, height: heights.full },
        ready
          ? animatedStyle
          : { transform: [{ translateY: -heights.mid }] },
      ]}
    >
      {/* Innere View: clippt die runden Ecken + Liste, trägt Rahmen/Hintergrund. */}
      <View style={styles.sheetInner}>
        {/* Griffbereich: Drag ODER Tipp (Tipp = eine Stufe größer) */}
        <GestureDetector gesture={Gesture.Race(pan, tap)}>
          <View
            style={styles.handleArea}
            accessible
            accessibilityRole="adjustable"
            accessibilityLabel={sheetStageLabel(stage)}
            accessibilityHint="Nach oben oder unten wischen, um die Liste zu vergrößern oder zu verkleinern"
            accessibilityValue={{
              min: 1,
              max: SHEET_STAGES.length,
              now: SHEET_STAGES.indexOf(stage) + 1,
            }}
            accessibilityActions={[{ name: "increment" }, { name: "decrement" }]}
            onAccessibilityAction={onAccessibilityAction}
          >
            <View style={styles.grabber} />
          </View>
        </GestureDetector>
        <View style={styles.body}>{children}</View>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  sheetShadow: {
    position: "absolute",
    left: 0,
    right: 0,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    // Weicher Schatten nach OBEN — setzt das Sheet gegen die Karte ab, ohne als
    // harte Linie zu lesen (die Rahmenkante ist bewusst entfallen).
    ...shadow.sheet,
  },
  sheetInner: {
    flex: 1,
    backgroundColor: colors.background,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    // Keine Rahmenlinie: Der warme Sand-Hintergrund setzt das Sheet gegen die
    // Karte schon deutlich genug ab. Zusammen mit dem Schatten wirkte die
    // 1.5pt-Kante wie ein dunkler Strich quer über dem Sheet.
    overflow: "hidden",
  },
  handleArea: {
    alignItems: "center",
    justifyContent: "center",
    height: HANDLE_HEIGHT, // große, leicht greifbare Drag-Zone
    backgroundColor: colors.background,
  },
  grabber: {
    ...sizes.grabber,
    borderRadius: radius.pill,
    backgroundColor: colors.borderStrong,
  },
  body: { flex: 1 },
});
