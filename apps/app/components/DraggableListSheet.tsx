import { useMemo } from "react";
import { StyleSheet, View, useWindowDimensions } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";
import { colors, fonts, radius, spacing } from "../lib/theme";
import { Text } from "react-native";

interface Props {
  /** Höhe des Bereichs, über dem das Sheet liegt (Karte sichtbar dahinter). */
  availableHeight: number;
  /** Headerhöhe oben (Titel + Filterleiste), bestimmt obere Grenze. */
  topInset: number;
  /** Untere Safe-Area (Home-Indicator) — Griff muss darüber greifbar bleiben. */
  bottomInset?: number;
  children: React.ReactNode;
  /** Optionaler Untertitel im Griffbereich (z.B. Anzahl). */
  subtitle?: string;
}

// Maße der Liste (müssen zu EventCard/EventList passen):
const HANDLE_HEIGHT = 44;
const CARD_HEIGHT = 104; // EventCard.pressArea.height
const CARD_GAP = 12; // EventList ItemSeparator (spacing.md)
const LIST_PADDING_TOP = 16; // EventList content padding (spacing.lg)

// Drei feste Stufen (sichtbare Sheet-Höhe von unten gemessen):
//  1) nur der Griff (über der Safe Area greifbar)
//  2) Griff + 1 voller Eintrag
//  3) Griff + 3 volle Einträge (Karte NICHT verdeckt)
const SNAP_MID_PX = HANDLE_HEIGHT + LIST_PADDING_TOP + CARD_HEIGHT + 20; // ≈ 184
const SNAP_LARGE_PX =
  HANDLE_HEIGHT + LIST_PADDING_TOP + CARD_HEIGHT * 3 + CARD_GAP * 2 + 20; // ≈ 412, 3 Einträge

const SPRING = { damping: 20, stiffness: 200, mass: 0.6 };

export default function DraggableListSheet({
  availableHeight,
  topInset,
  bottomInset = 0,
  children,
  subtitle,
}: Props) {
  const heights = useMemo(() => {
    // Stufe 1: nur Griff, aber über dem Home-Indicator (sonst nicht wischbar).
    const small = HANDLE_HEIGHT + bottomInset;
    // Obergrenze: nie höher als verfügbarer Platz (kleine Screens).
    const cap = availableHeight * 0.92;
    const large = Math.min(SNAP_LARGE_PX + bottomInset, cap);
    const mid = Math.min(SNAP_MID_PX + bottomInset, large);
    return { small, mid, large };
  }, [availableHeight, bottomInset]);

  // sheetHeight = aktuell sichtbare Höhe des Sheets (von unten gemessen).
  // Start in Stufe 2 (erster Eintrag lesbar).
  const sheetHeight = useSharedValue(heights.mid);
  const startHeight = useSharedValue(heights.mid);

  const snapTo = (target: number) => {
    "worklet";
    sheetHeight.value = withSpring(target, SPRING);
  };

  // Tipp auf den Griff → nächstgrößere Stufe (small→mid→large), von large zurück auf small.
  const tap = Gesture.Tap()
    .maxDuration(250)
    .onEnd(() => {
      const v = sheetHeight.value;
      // Aktuelle Stufe grob bestimmen und eine hochschalten (wrap-around).
      const midThreshold = (heights.small + heights.mid) / 2;
      const largeThreshold = (heights.mid + heights.large) / 2;
      let target: number;
      if (v < midThreshold) target = heights.mid;
      else if (v < largeThreshold) target = heights.large;
      else target = heights.small;
      snapTo(target);
    });

  const pan = Gesture.Pan()
    .onStart(() => {
      startHeight.value = sheetHeight.value;
    })
    .onUpdate((e) => {
      // Nach oben ziehen (negatives translationY) → höher.
      const next = startHeight.value - e.translationY;
      sheetHeight.value = Math.max(
        heights.small * 0.6,
        Math.min(heights.large, next)
      );
    })
    .onEnd((e) => {
      const v = sheetHeight.value;
      const velocity = e.velocityY;
      // Ziel anhand Position + Wurfrichtung wählen.
      let target = heights.mid;
      if (velocity < -500) {
        target = v < heights.mid ? heights.mid : heights.large;
      } else if (velocity > 500) {
        target = v > heights.mid ? heights.mid : heights.small;
      } else {
        const dS = Math.abs(v - heights.small);
        const dM = Math.abs(v - heights.mid);
        const dL = Math.abs(v - heights.large);
        target = dS < dM && dS < dL ? heights.small : dL < dM ? heights.large : heights.mid;
      }
      snapTo(target);
    });

  const animatedStyle = useAnimatedStyle(() => ({
    height: sheetHeight.value,
  }));

  return (
    // Äußere View: trägt Schatten + Position, KEIN overflow:hidden (sonst wird Schatten weggeclippt).
    <Animated.View style={[styles.sheetShadow, animatedStyle]}>
      {/* Innere View: clippt die runden Ecken + Liste, trägt Rahmen/Hintergrund. */}
      <View style={styles.sheetInner}>
        {/* Griffbereich: Drag ODER Tipp (Tipp = eine Stufe größer) */}
        <GestureDetector gesture={Gesture.Race(pan, tap)}>
          <View style={styles.handleArea}>
            <View style={styles.grabber} />
            {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
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
    bottom: 0,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    // Kräftiger, klar sichtbarer Schatten nach OBEN — das Sheet schwebt über der Karte
    // ohne Backdrop, also muss die Kante allein durch Schatten + Linie deutlich werden.
    shadowColor: "#0A1F1F",
    shadowOpacity: 0.35,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: -8 },
    elevation: 28,
  },
  sheetInner: {
    flex: 1,
    backgroundColor: colors.background,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    borderTopWidth: 1.5,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderColor: colors.borderStrong,
    overflow: "hidden",
  },
  handleArea: {
    alignItems: "center",
    justifyContent: "center",
    height: 44, // große, leicht greifbare Drag-Zone
    backgroundColor: colors.background,
  },
  grabber: {
    width: 52,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.borderStrong,
  },
  subtitle: {
    fontFamily: fonts.bodyMedium,
    fontSize: 13,
    color: colors.muted,
    marginTop: spacing.xs,
  },
  body: { flex: 1 },
});
