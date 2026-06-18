import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { colors, fonts, radius, shadow, spacing } from "../lib/theme";

interface Props {
  onOpenFilters: () => void;
  /** Anzahl aktiver Filter (für das Badge). 0 = kein Badge. */
  activeCount: number;
  /** „Zu meinem Standort“ — undefined wenn kein Standort verfügbar/erlaubt. */
  onJumpToLocation?: () => void;
}

/**
 * Schwebende Steuerleiste ÜBER der Karte — kein eigener Hintergrund, nur die
 * Buttons selbst (mit Shadow) heben sich ab. Wird absolut positioniert.
 */
export default function FilterBar({ onOpenFilters, activeCount, onJumpToLocation }: Props) {
  return (
    <View style={styles.bar} pointerEvents="box-none">
      <TouchableOpacity
        style={styles.filterBtn}
        onPress={onOpenFilters}
        activeOpacity={0.85}
        accessibilityRole="button"
        accessibilityLabel={
          activeCount > 0 ? `Filter (${activeCount} aktiv)` : "Filter öffnen"
        }
      >
        <Text style={styles.filterIcon}>⚲</Text>
        <Text style={styles.filterText}>Filter</Text>
        {activeCount > 0 ? (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>{activeCount}</Text>
          </View>
        ) : null}
      </TouchableOpacity>

      <View style={styles.spacer} pointerEvents="none" />

      {onJumpToLocation ? (
        <TouchableOpacity
          style={styles.locBtn}
          onPress={onJumpToLocation}
          activeOpacity={0.85}
          accessibilityRole="button"
          accessibilityLabel="Zu meinem Standort"
        >
          <Text style={styles.locIcon}>◎</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  filterBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    backgroundColor: colors.primary,
    minHeight: 40,
    ...shadow.card,
  },
  filterIcon: { color: colors.onPrimary, fontSize: 15, transform: [{ rotate: "45deg" }] },
  filterText: { fontFamily: fonts.bodySemibold, fontSize: 14, color: colors.onPrimary },
  badge: {
    marginLeft: 2,
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: colors.onPrimary,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 5,
  },
  badgeText: { fontFamily: fonts.bodySemibold, fontSize: 12, color: colors.primary },
  spacer: { flex: 1 },
  locBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.surface,
    alignItems: "center",
    justifyContent: "center",
    ...shadow.card,
  },
  locIcon: { fontSize: 20, color: colors.primary },
});
