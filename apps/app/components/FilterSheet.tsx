import {
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useState } from "react";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import DateTimePicker from "@react-native-community/datetimepicker";
import type { DateFilter } from "../lib/filters";
import { colorForCategory, colors, overlays, radius, shadow, sizes, spacing, text } from "../lib/theme";

/** `YYYY-MM-DD` in Berliner Zeit — dieselbe Form, die der Filter erwartet. */
function alsTag(d: Date): string {
  const p = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Berlin",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
  return p; // en-CA liefert genau YYYY-MM-DD
}

/** „Mo., 5. Okt." — kurz genug für den Knopf. */
function alsLabel(tag?: string): string {
  if (!tag) return "wählen";
  const [y, m, d] = tag.split("-").map(Number);
  return new Intl.DateTimeFormat("de-DE", {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: "Europe/Berlin",
  }).format(new Date(Date.UTC(y, m - 1, d, 12)));
}

function tagAlsDate(tag?: string): Date {
  if (!tag) return new Date();
  const [y, m, d] = tag.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d, 12));
}

interface Props {
  visible: boolean;
  onClose: () => void;
  date: DateFilter;
  onDate: (d: DateFilter) => void;
  /** Eigener Zeitraum als `YYYY-MM-DD`; leer, solange nichts gewählt ist. */
  rangeFrom?: string;
  rangeTo?: string;
  onRange: (von?: string, bis?: string) => void;
  // readonly, weil KIRCHSPIELE in @moinkark/shared ein `as const`-Tupel ist —
  // sonst braucht die Aufrufseite einen Cast, nur um Literale zu übergeben.
  kirchspiele: readonly string[];
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
  { key: "range", label: "Zeitraum" },
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
      // Chips sind 38 pt hoch; die 4 pt Zuschlag oben und unten bringen das
      // Tippziel auf die empfohlenen 44 pt — passt in den 8-pt-Abstand.
      hitSlop={{ top: 4, bottom: 4 }}
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
  rangeFrom,
  rangeTo,
  onRange,
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
  // Vor dem frühen Return: Hooks müssen in jedem Render laufen.
  const insets = useSafeAreaInsets();
  // Welcher Picker ist offen? Auf iOS bleibt er stehen, auf Android schliesst
  // ihn das System selbst — deshalb in beiden Faellen nach der Wahl zumachen.
  const [pickerFuer, setPickerFuer] = useState<"von" | "bis" | null>(null);
  if (!visible) return null;

  return (
    <Pressable style={styles.backdrop} onPress={onClose}>
      {/* Untere Safe Area (Home-Indicator, Gesten-Navigation) dazurechnen —
          sonst liegt der Button „… zeigen“ in der Zone der System-Geste. */}
      <Pressable
        style={[styles.sheet, { paddingBottom: spacing.lg + insets.bottom }]}
        onPress={(e) => e.stopPropagation()}
      >
        <View style={styles.grabber} />
        <View style={styles.headerRow}>
          <Text style={styles.heading}>Filter</Text>
          <TouchableOpacity onPress={onReset} accessibilityRole="button" hitSlop={12}>
            <Text style={styles.reset}>Zurücksetzen</Text>
          </TouchableOpacity>
        </View>

        <ScrollView
          style={styles.scrollView}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.scroll}
        >
          <Group label="Wann">
            {DATE_LABELS.map((d) => (
              <Chip key={d.key} label={d.label} active={date === d.key} onPress={() => onDate(d.key)} />
            ))}
          </Group>

          {date === "range" ? (
            <View style={styles.rangeRow}>
              <TouchableOpacity
                style={styles.rangeField}
                onPress={() => setPickerFuer("von")}
                accessibilityRole="button"
                accessibilityLabel={`Datum, aktuell ${alsLabel(rangeFrom)}`}
              >
                <Text style={styles.rangeCaption}>{rangeTo && rangeTo !== rangeFrom ? "von" : "am"}</Text>
                <Text style={styles.rangeValue}>{alsLabel(rangeFrom)}</Text>
              </TouchableOpacity>

              {/* „bis" erscheint erst, wenn ein erstes Datum steht — ein
                  einzelner Tag ist der häufigere Fall und braucht nur ein Feld. */}
              {rangeFrom ? (
                <TouchableOpacity
                  style={styles.rangeField}
                  onPress={() => setPickerFuer("bis")}
                  accessibilityRole="button"
                  accessibilityLabel={`Enddatum, aktuell ${rangeTo ? alsLabel(rangeTo) : "keins"}`}
                >
                  <Text style={styles.rangeCaption}>bis</Text>
                  <Text style={[styles.rangeValue, !rangeTo && styles.rangePlaceholder]}>
                    {rangeTo ? alsLabel(rangeTo) : "optional"}
                  </Text>
                </TouchableOpacity>
              ) : null}

              {rangeFrom || rangeTo ? (
                <TouchableOpacity
                  onPress={() => onRange(undefined, undefined)}
                  hitSlop={8}
                  accessibilityRole="button"
                  accessibilityLabel="Datum zurücksetzen"
                >
                  <Text style={styles.rangeClear}>✕</Text>
                </TouchableOpacity>
              ) : null}
            </View>
          ) : null}

          {/* Der Picker liegt in einem Modal und schließt sich nach der Wahl.
              `display="spinner"` statt `inline`: Der große Kalender von iOS
              rendert als eingebettetes Element, belegt den halben Filter und
              verschwindet nicht von selbst. */}
          <Modal
            visible={pickerFuer !== null}
            transparent
            animationType="fade"
            onRequestClose={() => setPickerFuer(null)}
          >
            <TouchableOpacity
              style={styles.pickerBackdrop}
              activeOpacity={1}
              onPress={() => setPickerFuer(null)}
            >
              <TouchableOpacity style={styles.pickerCard} activeOpacity={1}>
                <Text style={styles.pickerTitle}>
                  {pickerFuer === "bis" ? "Bis wann?" : "Ab wann?"}
                </Text>
                <DateTimePicker
                  value={tagAlsDate(pickerFuer === "bis" ? rangeTo ?? rangeFrom : rangeFrom)}
                  mode="date"
                  display={Platform.OS === "ios" ? "spinner" : "default"}
                  locale="de-DE"
                  themeVariant="light"
                  onChange={(ev, gewaehlt) => {
                    // Android schließt selbst und meldet auch den Abbruch;
                    // auf iOS macht das Modal zu, sobald ein Tag feststeht.
                    if (ev.type !== "set" || !gewaehlt) {
                      setPickerFuer(null);
                      return;
                    }
                    const tag = alsTag(gewaehlt);
                    if (pickerFuer === "bis") onRange(rangeFrom, tag);
                    else onRange(tag, rangeTo);
                    if (Platform.OS !== "ios") setPickerFuer(null);
                  }}
                />
                {Platform.OS === "ios" ? (
                  <TouchableOpacity
                    style={styles.pickerDone}
                    onPress={() => setPickerFuer(null)}
                    accessibilityRole="button"
                  >
                    <Text style={styles.pickerDoneText}>Fertig</Text>
                  </TouchableOpacity>
                ) : null}
              </TouchableOpacity>
            </TouchableOpacity>
          </Modal>

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
                // trim() wie im Filter (s. matchesCategory): ein Titel mit
                // Randleerzeichen matchte sonst nie und der Chip blieb inaktiv.
                active={activeCategory === c.trim().toLowerCase()}
                color={colorForCategory(c)}
                onPress={() => onCategory(c.trim().toLowerCase())}
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
  rangeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  rangeField: {
    flex: 1,
    backgroundColor: colors.surfaceMuted,
    borderRadius: radius.sm,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  rangeCaption: { ...text.caption, color: colors.muted },
  rangeValue: { ...text.bodyStrong, color: colors.ink },
  rangePlaceholder: { color: colors.muted, fontWeight: "400" },
  rangeClear: { ...text.body, color: colors.muted, paddingHorizontal: spacing.xs },
  pickerBackdrop: {
    flex: 1,
    backgroundColor: overlays.backdrop,
    justifyContent: "center",
    padding: spacing.xl,
  },
  pickerCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.lg,
    alignItems: "center",
    gap: spacing.sm,
  },
  pickerTitle: { ...text.title, color: colors.ink },
  pickerDone: {
    backgroundColor: colors.primary,
    borderRadius: radius.sm,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.xl,
    alignSelf: "stretch",
    alignItems: "center",
  },
  pickerDoneText: { ...text.bodyStrong, color: colors.onColor },
  backdrop: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: overlays.backdrop,
    justifyContent: "flex-end",
    alignItems: "center",
    zIndex: 1000,
  },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    width: "100%",
    maxWidth: sizes.sheetMaxWidth,
    maxHeight: "85%",
    // paddingBottom kommt inline (spacing.lg + Safe Area).
    borderWidth: 1,
    borderColor: colors.borderStrong,
    ...shadow.sheet,
  },
  grabber: {
    alignSelf: "center",
    ...sizes.grabber,
    borderRadius: radius.pill,
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
  heading: { ...text.heading, color: colors.ink },
  reset: { ...text.labelMedium, color: colors.primary },
  scrollView: { flexShrink: 1 },
  scroll: { paddingHorizontal: spacing.xl, paddingBottom: spacing.md, gap: spacing.lg },
  group: { gap: spacing.sm, marginTop: spacing.md },
  groupLabel: { ...text.eyebrow, color: colors.faint },
  chipWrap: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  chip: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceMuted,
    borderWidth: 1,
    borderColor: colors.border,
    minHeight: sizes.chipMinHeight,
    justifyContent: "center",
  },
  chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { ...text.bodyMedium, color: colors.ink },
  chipTextActive: { color: colors.onColor },
  apply: {
    marginHorizontal: spacing.xl,
    marginTop: spacing.md,
    backgroundColor: colors.accent,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    alignItems: "center",
  },
  applyText: { ...text.bodyStrong, color: colors.onColor },
});
