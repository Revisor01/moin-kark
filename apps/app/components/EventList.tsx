import { useCallback } from "react";
import { FlatList, RefreshControl, StyleSheet, Text, View } from "react-native";
import type { EventFeature } from "@moinkark/shared";
import EventCard from "./EventCard";
import { colors, fonts, spacing } from "../lib/theme";

/**
 * Atempause unter dem letzten Eintrag. Die Liste endet exakt an der sichtbaren
 * Sheet-Kante (nachgemessen) — hier ist KEINE Kompensation für verdeckte Bereiche
 * nötig. Der frühere 280-px-Puffer stammte aus der Zeit, als der eigentliche
 * Scroll-Blocker (RefreshControl im Sheet) noch unerkannt war, und erzeugte am
 * Listenende eine bildschirmfüllende Leerfläche.
 */
const TAIL_SPACE = 24;

/** Kartenhöhe (s. EventCard styles.pressArea) + Trenner — für getItemLayout. */
const CARD_HEIGHT = 104;
const ROW_HEIGHT = CARD_HEIGHT + spacing.md;

const ItemSeparator = () => <View style={{ height: spacing.md }} />;

interface Props {
  features: EventFeature[];
  selectedId?: number | null;
  onSelect: (id: number) => void;
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
  /** Liste steckt im ziehbaren Sheet → kein RefreshControl (blockiert dort das Scrollen). */
  inSheet?: boolean;
}

export default function EventList({
  features,
  selectedId,
  onSelect,
  isSaved,
  onToggleSave,
  bottomInset = 0,
  onRefresh,
  refreshing = false,
  inSheet = false,
}: Props) {
  const renderItem = useCallback(
    ({ item }: { item: EventFeature }) => (
      <EventCard
        feature={item}
        active={item.properties.id === selectedId}
        onPress={() => onSelect(item.properties.id)}
        saved={isSaved?.(item.properties.id)}
        onToggleSave={onToggleSave}
      />
    ),
    [selectedId, onSelect, isSaved, onToggleSave]
  );

  return (
    <FlatList
      data={features}
      keyExtractor={(f) => String(f.properties.id)}
      extraData={{ selectedId, isSaved }}
      renderItem={renderItem}
      ItemSeparatorComponent={ItemSeparator}
      // Alle Karten sind exakt gleich hoch (CARD_HEIGHT + Trenner). Damit kann
      // FlatList Positionen ausrechnen, statt sie zu messen — spart Arbeit beim
      // Scrollen und macht scrollToIndex verlässlich.
      getItemLayout={(_, index) => ({
        length: ROW_HEIGHT,
        offset: ROW_HEIGHT * index,
        index,
      })}
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
      // Kein RefreshControl im ziehbaren Sheet: Auf iOS fängt er die Geste am
      // oberen Listenrand ab und federt zurück — die Liste sprang beim Scrollen
      // immer wieder nach oben und die unteren Einträge waren nicht erreichbar.
      // Pull-to-Refresh gibt es deshalb nur dort, wo die Liste fest steht
      // (Breitbild-Ansicht); im Sheet aktualisiert die App ohnehin alle 5 Minuten.
      refreshControl={
        onRefresh && !inSheet ? (
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
  content: { padding: spacing.lg },
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
