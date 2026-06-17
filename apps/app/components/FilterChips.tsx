import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import type { DateFilter } from "../lib/filters";
import { colors, fonts, radius, spacing } from "../lib/theme";

interface Props {
  date: DateFilter;
  onDate: (d: DateFilter) => void;
  categories: string[]; // bereits nach Häufigkeit sortierte Titel
  activeCategory: string | null;
  onCategory: (c: string | null) => void;
}

const DATE_LABELS: { key: DateFilter; label: string }[] = [
  { key: "all", label: "Alle" },
  { key: "today", label: "Heute" },
  { key: "week", label: "Diese Woche" },
  { key: "weekend", label: "Wochenende" },
];

function Chip({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.7}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      style={[styles.chip, active && styles.chipActive]}
    >
      <Text style={[styles.chipText, active && styles.chipTextActive]}>{label}</Text>
    </TouchableOpacity>
  );
}

export default function FilterChips({
  date,
  onDate,
  categories,
  activeCategory,
  onCategory,
}: Props) {
  return (
    <View style={styles.wrap}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.row}
      >
        {DATE_LABELS.map((d) => (
          <Chip key={d.key} label={d.label} active={date === d.key} onPress={() => onDate(d.key)} />
        ))}
        <View style={styles.divider} />
        <Chip
          label="Alle Arten"
          active={activeCategory === null}
          onPress={() => onCategory(null)}
        />
        {categories.map((c) => (
          <Chip
            key={c}
            label={c}
            active={activeCategory === c.toLowerCase()}
            onPress={() => onCategory(c.toLowerCase())}
          />
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    backgroundColor: colors.background,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  row: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    gap: spacing.sm,
    alignItems: "center",
  },
  chip: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    minHeight: 36,
    justifyContent: "center",
  },
  chipActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  chipText: {
    fontFamily: fonts.bodyMedium,
    fontSize: 14,
    color: colors.foreground,
  },
  chipTextActive: {
    color: colors.onPrimary,
  },
  divider: {
    width: 1,
    height: 22,
    backgroundColor: colors.borderStrong,
    marginHorizontal: spacing.xs,
  },
});
