import { FlatList, RefreshControl, StyleSheet, Text, View } from "react-native";
import type { EventFeature } from "@moinkark/shared";
import EventCard from "./EventCard";
import { colors, fonts, spacing } from "../lib/theme";

/**
 * Leerraum unter dem letzten Eintrag. Muss mindestens so hoch sein wie der Teil
 * des Sheets, der bei der mittleren Snap-Stufe unterhalb des Bildschirms liegt —
 * sonst lässt sich der letzte Termin nicht in den sichtbaren Bereich scrollen.
 */
const TAIL_SPACE = 280;

interface Props {
  features: EventFeature[];
  selectedId?: number | null;
  onSelect: (id: number) => void;
  header?: React.ReactElement;
  isSaved?: (id: number) => boolean;
  onToggleSave?: (id: number) => void;
  /**
   * Zusätzliche Reserve am Listenende (Safe Area / Home-Indicator). Gehört in den
   * Scroll-Inhalt — als Container-Padding würde es den sichtbaren Bereich
   * verkleinern und die letzten Einträge unerreichbar machen.
   */
  bottomInset?: number;
  /** Runterziehen erzwingt frische Daten — für die Redaktion, die gerade etwas geändert hat. */
  onRefresh?: () => void;
  refreshing?: boolean;
}

export default function EventList({
  features,
  selectedId,
  onSelect,
  header,
  isSaved,
  onToggleSave,
  bottomInset = 0,
  onRefresh,
  refreshing = false,
}: Props) {
  return (
    <FlatList
      data={features}
      keyExtractor={(f) => String(f.properties.id)}
      ListHeaderComponent={header}
      extraData={{ selectedId, isSaved }}
      renderItem={({ item }) => (
        <EventCard
          feature={item}
          active={item.properties.id === selectedId}
          onPress={() => onSelect(item.properties.id)}
          saved={isSaved?.(item.properties.id)}
          onToggleSave={onToggleSave}
        />
      )}
      ItemSeparatorComponent={() => <View style={{ height: spacing.md }} />}
      // Großzügige Reserve am Listenende: Das Sheet steht je nach Snap-Stufe nur
      // teilweise im Bild — ohne diesen Leerraum bleibt der letzte Eintrag im
      // abgeschnittenen Bereich hängen und ist nicht lesbar. Als Scroll-INHALT
      // (nicht als Container-Padding), sonst schrumpft der sichtbare Bereich.
      contentContainerStyle={[styles.content, { paddingBottom: TAIL_SPACE + bottomInset }]}
      ListEmptyComponent={
        <View style={styles.empty}>
          <Text style={styles.emptyTitle}>Nichts gefunden</Text>
          <Text style={styles.emptyText}>
            Für die gewählten Filter sind gerade keine Veranstaltungen eingetragen.
          </Text>
        </View>
      }
      initialNumToRender={12}
      windowSize={11}
      showsVerticalScrollIndicator
      refreshControl={
        onRefresh ? (
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.primary}
            colors={[colors.primary]}
          />
        ) : undefined
      }
    />
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.lg, paddingBottom: spacing.xxl, gap: 0 },
  empty: { alignItems: "center", paddingVertical: spacing.xxl, gap: spacing.sm },
  emptyTitle: { fontFamily: fonts.display, fontSize: 18, color: colors.foreground },
  emptyText: {
    fontFamily: fonts.body,
    fontSize: 14,
    color: colors.muted,
    textAlign: "center",
    maxWidth: 280,
  },
});
