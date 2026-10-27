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
  /** Meldet nach dem Einrasten, wie viele Pixel unter der Kante liegen. */
  onHiddenBottomChange?: (px: number) => void;
}

// Vier Stufen: Griff, ein Eintrag, drei Einträge, fast voll; Maße aus lib/listLayout.
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

  // Feste Höhe und translateY, weil animierte Höhen auf iOS nicht zuverlässig im Layout ankamen.
  const sheetHeight = useSharedValue(heights.mid);
  const startHeight = useSharedValue(heights.mid);

  // Endabstand je Ruhestufe als Scroll-Inhalt, nie als Container-Padding.
  const reportHidden = (visible: number) => {
    onHiddenBottomChange?.(Math.max(0, heights.full - visible));
  };

  // Bei geänderter Höhe muss die Meldung zur eingerasteten Stufe passen.
  const restStage = useRef<SheetStage>("mid");
  // Als State, weil das Screenreader-Label neu rendern muss.
  const [stage, setStage] = useState<SheetStage>("mid");
  useEffect(() => {
    const visible = heights[restStage.current];
    sheetHeight.value = visible;
    startHeight.value = visible;
    reportHidden(visible);
    // Nur `heights`: restStage ist eine Ref, die Höhen sind Shared Values.
  }, [heights]);

  // Erster Frame statisch wegen eines Reanimated-4.3-Race beim Start (software-mansion/react-native-reanimated#9293).
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

  // Wischen am Griff schaltet eine Stufe; läuft auf dem JS-Thread, daher ohne runOnJS.
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
    // Fest unter der Fläche geparkt, translateY schiebt ins Bild; kein overflow:hidden, sonst fehlt der Schatten.
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
    // Auf Android entscheidet die elevation auch über Touches, deshalb braucht die Umgebung collapsable={false}.
    ...shadow.sheet,
  },
  sheetInner: {
    flex: 1,
    backgroundColor: colors.background,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    // Keine Rahmenlinie, mit dem Schatten wirkte sie wie ein Strich.
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
