import { useMemo } from "react";
import { StyleSheet, View, useWindowDimensions } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";
import { colors, fonts, radius, shadow, spacing } from "../lib/theme";
import { Text } from "react-native";

interface Props {
  /** Höhe des Bereichs, über dem das Sheet liegt (Karte sichtbar dahinter). */
  availableHeight: number;
  /** Headerhöhe oben (Titel + Filterleiste), bestimmt obere Grenze. */
  topInset: number;
  children: React.ReactNode;
  /** Optionaler Untertitel im Griffbereich (z.B. Anzahl). */
  subtitle?: string;
}

// Snap-Punkte als Anteil der verfügbaren Höhe, gemessen als „sichtbare Sheet-Höhe".
const SNAP_SMALL = 0.16; // Karte groß, ~1 Event guckt raus
const SNAP_MID = 0.5;
const SNAP_LARGE = 0.92;

const SPRING = { damping: 20, stiffness: 200, mass: 0.6 };

export default function DraggableListSheet({
  availableHeight,
  topInset,
  children,
  subtitle,
}: Props) {
  const heights = useMemo(
    () => ({
      small: availableHeight * SNAP_SMALL,
      mid: availableHeight * SNAP_MID,
      large: availableHeight * SNAP_LARGE,
    }),
    [availableHeight]
  );

  // sheetHeight = aktuell sichtbare Höhe des Sheets (von unten gemessen).
  const sheetHeight = useSharedValue(heights.mid);
  const startHeight = useSharedValue(heights.mid);

  const snapTo = (target: number) => {
    "worklet";
    sheetHeight.value = withSpring(target, SPRING);
  };

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
    <Animated.View style={[styles.sheet, animatedStyle]}>
      {/* Griffbereich (nur dieser reagiert auf Drag → Liste bleibt scrollbar) */}
      <GestureDetector gesture={pan}>
        <View style={styles.handleArea}>
          <View style={styles.grabber} />
          {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
        </View>
      </GestureDetector>
      <View style={styles.body}>{children}</View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  sheet: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: colors.background,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    overflow: "hidden",
    ...shadow.sheet,
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
