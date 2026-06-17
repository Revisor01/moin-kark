import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import type { DateFilter } from "../lib/filters";
import { colors, fonts, radius, spacing } from "../lib/theme";

interface Props {
  date: DateFilter;
  onDate: (d: DateFilter) => void;
  nearby: boolean;
  onToggleNearby: () => void;
  nearbyAvailable: boolean;
  kirchspiele: string[];
  activeKirchspiel: string | null;
  onKirchspiel: (k: string | null) => void;
  categories: string[]; // nach Häufigkeit sortierte Titel
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
  tone = "neutral",
}: {
  label: string;
  active: boolean;
  onPress: () => void;
  tone?: "neutral" | "accent";
}) {
  const activeStyle =
    tone === "accent"
      ? { backgroundColor: colors.accent, borderColor: colors.accent }
      : { backgroundColor: colors.primary, borderColor: colors.primary };
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.7}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      style={[styles.chip, active && activeStyle]}
    >
      <Text style={[styles.chipText, active && styles.chipTextActive]}>{label}</Text>
    </TouchableOpacity>
  );
}

function Row({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <View style={styles.rowWrap}>
      <Text style={styles.rowLabel}>{label}</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
        {children}
      </ScrollView>
    </View>
  );
}

export default function FilterChips({
  date,
  onDate,
  nearby,
  onToggleNearby,
  nearbyAvailable,
  kirchspiele,
  activeKirchspiel,
  onKirchspiel,
  categories,
  activeCategory,
  onCategory,
}: Props) {
  return (
    <View style={styles.wrap}>
      <Row label="Wann">
        {DATE_LABELS.map((d) => (
          <Chip key={d.key} label={d.label} active={date === d.key} onPress={() => onDate(d.key)} />
        ))}
        {nearbyAvailable ? (
          <Chip label="In meiner Nähe" active={nearby} onPress={onToggleNearby} tone="accent" />
        ) : null}
      </Row>

      <Row label="Kirchspiel">
        <Chip label="Alle" active={activeKirchspiel === null} onPress={() => onKirchspiel(null)} />
        {kirchspiele.map((k) => (
          <Chip
            key={k}
            label={k}
            active={activeKirchspiel === k}
            onPress={() => onKirchspiel(k)}
          />
        ))}
      </Row>

      <Row label="Art">
        <Chip label="Alle" active={activeCategory === null} onPress={() => onCategory(null)} />
        {categories.map((c) => (
          <Chip
            key={c}
            label={c}
            active={activeCategory === c.toLowerCase()}
            onPress={() => onCategory(c.toLowerCase())}
          />
        ))}
      </Row>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    backgroundColor: colors.background,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    paddingVertical: spacing.sm,
    gap: spacing.xs,
  },
  rowWrap: { gap: 2 },
  rowLabel: {
    fontFamily: fonts.bodySemibold,
    fontSize: 11,
    letterSpacing: 0.5,
    textTransform: "uppercase",
    color: colors.faint,
    paddingHorizontal: spacing.lg,
    marginTop: spacing.xs,
  },
  row: {
    paddingHorizontal: spacing.lg,
    paddingVertical: 6,
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
    minHeight: 34,
    justifyContent: "center",
  },
  chipText: { fontFamily: fonts.bodyMedium, fontSize: 13, color: colors.foreground },
  chipTextActive: { color: colors.onPrimary },
});
