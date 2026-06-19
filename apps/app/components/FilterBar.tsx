import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
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
 * Schwebende Steuerleiste ÜBER der Karte. Buttons im Stil des Herz-Icons:
 * weißer Kreis + feine Umrandung + farbiges Icon. Jede Funktion eine eigene Icon-Farbe.
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
        style={styles.iconBtn}
        onPress={onOpenFilters}
        activeOpacity={0.85}
        accessibilityRole="button"
        accessibilityLabel={
          activeCount > 0 ? `Filter (${activeCount} aktiv)` : "Filter öffnen"
        }
      >
        <Ionicons name="search" size={22} color={colors.primary} />
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
        <Ionicons
          name="star"
          size={21}
          color={highlightsOnly ? colors.onAccent : colors.accent}
        />
      </TouchableOpacity>

      <View style={styles.spacer} pointerEvents="none" />

      {onJumpToLocation ? (
        <TouchableOpacity
          style={styles.iconBtn}
          onPress={onJumpToLocation}
          activeOpacity={0.85}
          accessibilityRole="button"
          accessibilityLabel="Zu meinem Standort"
        >
          <Ionicons name="navigate" size={22} color={colors.primary} />
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
  // Wie das Herz-Icon: weißer Kreis, feine Umrandung, kräftiger Schatten zur Karte.
  iconBtn: {
    width: BTN,
    height: BTN,
    borderRadius: BTN / 2,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    alignItems: "center",
    justifyContent: "center",
    ...shadow.card,
  },
  tipBtn: { marginLeft: spacing.sm },
  tipBtnActive: { backgroundColor: colors.accent, borderColor: colors.accent },
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
    borderColor: colors.surface,
  },
  badgeText: { fontFamily: fonts.bodySemibold, fontSize: 11, color: colors.onAccent },
  spacer: { flex: 1 },
});
