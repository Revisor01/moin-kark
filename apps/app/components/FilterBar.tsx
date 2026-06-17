import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { colors, fonts, radius, spacing } from "../lib/theme";

interface Props {
  activeCount: number;
  onOpenFilters: () => void;
  nearby: boolean;
  onToggleNearby: () => void;
  nearbyAvailable: boolean;
}

export default function FilterBar({
  activeCount,
  onOpenFilters,
  nearby,
  onToggleNearby,
  nearbyAvailable,
}: Props) {
  return (
    <View style={styles.bar}>
      <TouchableOpacity
        style={styles.filterBtn}
        onPress={onOpenFilters}
        activeOpacity={0.8}
        accessibilityRole="button"
        accessibilityLabel="Filter öffnen"
      >
        <Text style={styles.filterIcon}>⚲</Text>
        <Text style={styles.filterText}>Filter</Text>
        {activeCount > 0 ? (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>{activeCount}</Text>
          </View>
        ) : null}
      </TouchableOpacity>

      {nearbyAvailable ? (
        <TouchableOpacity
          style={[styles.nearby, nearby && styles.nearbyActive]}
          onPress={onToggleNearby}
          activeOpacity={0.8}
          accessibilityRole="button"
          accessibilityState={{ selected: nearby }}
        >
          <Text style={[styles.nearbyText, nearby && styles.nearbyTextActive]}>
            In meiner Nähe
          </Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    backgroundColor: colors.background,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  filterBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    backgroundColor: colors.primary,
    minHeight: 38,
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
  nearby: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    minHeight: 38,
    justifyContent: "center",
  },
  nearbyActive: { backgroundColor: colors.accent, borderColor: colors.accent },
  nearbyText: { fontFamily: fonts.bodyMedium, fontSize: 14, color: colors.foreground },
  nearbyTextActive: { color: colors.onAccent },
});
