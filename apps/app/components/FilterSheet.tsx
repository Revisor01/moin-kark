import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import type { DateFilter } from "../lib/filters";
import { colorForCategory, colors, fonts, radius, shadow, spacing } from "../lib/theme";

interface Props {
  visible: boolean;
  onClose: () => void;
  date: DateFilter;
  onDate: (d: DateFilter) => void;
  kirchspiele: string[];
  activeKirchspiel: string | null;
  onKirchspiel: (k: string | null) => void;
  gemeinden: string[];
  activeGemeinde: string | null;
  onGemeinde: (g: string | null) => void;
  categories: string[];
  activeCategory: string | null;
  onCategory: (c: string | null) => void;
  onReset: () => void;
  resultCount: number;
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
  color,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
  /** Optionale Kategorie-Farbe für den aktiven Zustand. */
  color?: string;
}) {
  const activeBg = color
    ? { backgroundColor: color, borderColor: color }
    : styles.chipActive;
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.7}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      style={[styles.chip, active && activeBg]}
    >
      <Text style={[styles.chipText, active && styles.chipTextActive]}>{label}</Text>
    </TouchableOpacity>
  );
}

function Group({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={styles.group}>
      <Text style={styles.groupLabel}>{label}</Text>
      <View style={styles.chipWrap}>{children}</View>
    </View>
  );
}

export default function FilterSheet({
  visible,
  onClose,
  date,
  onDate,
  kirchspiele,
  activeKirchspiel,
  onKirchspiel,
  gemeinden,
  activeGemeinde,
  onGemeinde,
  categories,
  activeCategory,
  onCategory,
  onReset,
  resultCount,
}: Props) {
  if (!visible) return null;

  return (
    <Pressable style={styles.backdrop} onPress={onClose}>
      <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
        <View style={styles.grabber} />
        <View style={styles.headerRow}>
          <Text style={styles.heading}>Filter</Text>
          <TouchableOpacity onPress={onReset} accessibilityRole="button">
            <Text style={styles.reset}>Zurücksetzen</Text>
          </TouchableOpacity>
        </View>

        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>
          <Group label="Wann">
            {DATE_LABELS.map((d) => (
              <Chip key={d.key} label={d.label} active={date === d.key} onPress={() => onDate(d.key)} />
            ))}
          </Group>

          <Group label="Kirchspiel">
            <Chip label="Alle" active={activeKirchspiel === null} onPress={() => onKirchspiel(null)} />
            {kirchspiele.map((k) => (
              <Chip key={k} label={k} active={activeKirchspiel === k} onPress={() => onKirchspiel(k)} />
            ))}
          </Group>

          {gemeinden.length > 0 ? (
            <Group label="Gemeinde">
              <Chip label="Alle" active={activeGemeinde === null} onPress={() => onGemeinde(null)} />
              {gemeinden.map((g) => (
                <Chip key={g} label={g} active={activeGemeinde === g} onPress={() => onGemeinde(g)} />
              ))}
            </Group>
          ) : null}

          <Group label="Art">
            <Chip label="Alle" active={activeCategory === null} onPress={() => onCategory(null)} />
            {categories.map((c) => (
              <Chip
                key={c}
                label={c}
                active={activeCategory === c.toLowerCase()}
                color={colorForCategory(c)}
                onPress={() => onCategory(c.toLowerCase())}
              />
            ))}
          </Group>
        </ScrollView>

        <TouchableOpacity style={styles.apply} onPress={onClose} activeOpacity={0.9}>
          <Text style={styles.applyText}>
            {resultCount} {resultCount === 1 ? "Veranstaltung" : "Veranstaltungen"} zeigen
          </Text>
        </TouchableOpacity>
      </Pressable>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(28,43,43,0.6)",
    justifyContent: "flex-end",
    alignItems: "center",
    zIndex: 1000,
  },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    width: "100%",
    maxWidth: 520,
    maxHeight: "85%",
    paddingBottom: spacing.lg,
    ...shadow.sheet,
  },
  grabber: {
    alignSelf: "center",
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.borderStrong,
    marginTop: spacing.sm,
  },
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
  },
  heading: { fontFamily: fonts.displayBold, fontSize: 22, color: colors.foreground },
  reset: { fontFamily: fonts.bodyMedium, fontSize: 14, color: colors.primary },
  scroll: { paddingHorizontal: spacing.xl, paddingBottom: spacing.md, gap: spacing.lg },
  group: { gap: spacing.sm, marginTop: spacing.md },
  groupLabel: {
    fontFamily: fonts.bodySemibold,
    fontSize: 12,
    letterSpacing: 0.5,
    textTransform: "uppercase",
    color: colors.faint,
  },
  chipWrap: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  chip: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceMuted,
    borderWidth: 1,
    borderColor: colors.border,
    minHeight: 38,
    justifyContent: "center",
  },
  chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { fontFamily: fonts.bodyMedium, fontSize: 14, color: colors.foreground },
  chipTextActive: { color: colors.onPrimary },
  apply: {
    marginHorizontal: spacing.xl,
    marginTop: spacing.md,
    backgroundColor: colors.accent,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    alignItems: "center",
  },
  applyText: { fontFamily: fonts.bodySemibold, fontSize: 16, color: colors.onAccent },
});
