import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { colors, fonts, shadow, spacing } from "../lib/theme";

interface Props {
  onOpenFilters: () => void;
  /** Anzahl aktiver Filter (für das Badge). 0 = kein Badge. */
  activeCount: number;
  /** „Zu meinem Standort“ — undefined wenn kein Standort verfügbar/erlaubt. */
  onJumpToLocation?: () => void;
  /** „Tipps“-Modus aktiv? (nur Highlights, alle Zeiten) */
  highlightsOnly: boolean;
  /** Tipps-Modus umschalten. */
  onToggleHighlights: () => void;
}

/**
 * Schwebende Steuerleiste ÜBER der Karte — kein eigener Hintergrund, nur die
 * runden, farbigen Buttons (Icon in weiß) heben sich ab. Absolut positioniert.
 */
export default function FilterBar({
  onOpenFilters,
  activeCount,
  onJumpToLocation,
  highlightsOnly,
  onToggleHighlights,
}: Props) {
  return (
    <View style={styles.bar} pointerEvents="box-none">
      <TouchableOpacity
        style={[styles.iconBtn, styles.filterBtn]}
        onPress={onOpenFilters}
        activeOpacity={0.85}
        accessibilityRole="button"
        accessibilityLabel={
          activeCount > 0 ? `Filter (${activeCount} aktiv)` : "Filter öffnen"
        }
      >
        <Text style={styles.filterIcon}>⚲</Text>
        {activeCount > 0 ? (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>{activeCount}</Text>
          </View>
        ) : null}
      </TouchableOpacity>

      {/* Tipps-Toggle: nur Highlight-Events (★), über alle Zeiten */}
      <TouchableOpacity
        style={[styles.iconBtn, styles.tipBtn, highlightsOnly && styles.tipBtnActive]}
        onPress={onToggleHighlights}
        activeOpacity={0.85}
        accessibilityRole="button"
        accessibilityState={{ selected: highlightsOnly }}
        accessibilityLabel={highlightsOnly ? "Nur Tipps – aktiv" : "Nur Tipps anzeigen"}
      >
        <Text style={styles.tipIcon}>★</Text>
      </TouchableOpacity>

      <View style={styles.spacer} pointerEvents="none" />

      {onJumpToLocation ? (
        <TouchableOpacity
          style={[styles.iconBtn, styles.locBtn]}
          onPress={onJumpToLocation}
          activeOpacity={0.85}
          accessibilityRole="button"
          accessibilityLabel="Zu meinem Standort"
        >
          {/* Navigations-Pfeil wie in Apple/Google Maps */}
          <Text style={styles.locIcon}>➤</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

const BTN = 46;

const styles = StyleSheet.create({
  bar: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  iconBtn: {
    width: BTN,
    height: BTN,
    borderRadius: BTN / 2,
    alignItems: "center",
    justifyContent: "center",
    ...shadow.card,
  },
  // Alle Buttons farbig, Icons in weiß.
  filterBtn: { backgroundColor: colors.primary },
  tipBtn: { backgroundColor: colors.accent, marginLeft: spacing.sm },
  // Aktiv: weißer Ring → klares „an“, ohne neue Farbe.
  tipBtnActive: { borderWidth: 2.5, borderColor: colors.onAccent },
  locBtn: { backgroundColor: colors.primary },
  // Lupe: kleiner + Box drumherum, damit die rotierte Glyphe nicht abgeschnitten wird.
  filterIcon: {
    color: colors.onPrimary,
    fontSize: 19,
    lineHeight: 22,
    transform: [{ rotate: "45deg" }],
  },
  tipIcon: { color: colors.onAccent, fontSize: 20, lineHeight: 22 },
  // Pfeil leicht gedreht → zeigt nach oben-rechts wie das klassische „Locate me“-Icon.
  locIcon: {
    color: colors.onPrimary,
    fontSize: 18,
    lineHeight: 20,
    transform: [{ rotate: "-45deg" }],
  },
  badge: {
    position: "absolute",
    top: -2,
    right: -2,
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: colors.accent,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 5,
    borderWidth: 2,
    borderColor: colors.background,
  },
  badgeText: { fontFamily: fonts.bodySemibold, fontSize: 11, color: colors.onAccent },
  spacer: { flex: 1 },
});
