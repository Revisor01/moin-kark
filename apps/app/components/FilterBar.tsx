import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { colors, fonts, radius, spacing } from "../lib/theme";

export interface ActiveFilterChip {
  key: string;
  label: string;
  onRemove: () => void;
}

interface Props {
  onOpenFilters: () => void;
  activeChips: ActiveFilterChip[];
}

export default function FilterBar({ onOpenFilters, activeChips }: Props) {
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
        {activeChips.length > 0 ? (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>{activeChips.length}</Text>
          </View>
        ) : null}
      </TouchableOpacity>

      {activeChips.length > 0 ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chipRow}
        >
          {activeChips.map((c) => (
            <TouchableOpacity
              key={c.key}
              style={styles.activeChip}
              onPress={c.onRemove}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel={`${c.label} entfernen`}
            >
              <Text style={styles.activeChipText}>{c.label}</Text>
              <Text style={styles.activeChipX}>✕</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
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
  chipRow: { gap: spacing.sm, alignItems: "center", paddingRight: spacing.lg },
  activeChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingLeft: spacing.md,
    paddingRight: spacing.sm,
    paddingVertical: 6,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    minHeight: 34,
  },
  activeChipText: { fontFamily: fonts.bodyMedium, fontSize: 13, color: colors.foreground },
  activeChipX: { fontSize: 12, color: colors.muted },
});
