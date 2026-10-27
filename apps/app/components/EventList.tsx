import { useCallback } from "react";
import { FlatList, RefreshControl, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import type { EventFeature } from "@moinkark/shared";
import EventCard from "./EventCard";
import { CARD_GAP, LIST_PADDING_TOP, listItemLayout } from "../lib/listLayout";
import { colors, spacing, text } from "../lib/theme";

/** Kleine Atempause unter dem letzten Eintrag; die Liste endet exakt an der Sheet-Kante. */
const TAIL_SPACE = spacing.xl;

const ItemSeparator = () => <View style={{ height: CARD_GAP }} />;

interface Props {
  features: EventFeature[];
  selectedId?: number | null;
  onSelect: (id: number) => void;
  isSaved?: (id: number) => boolean;
  onToggleSave?: (id: number) => void;
  /** Reserve am Listenende im Scroll-Inhalt, als Container-Padding wären die letzten Einträge unerreichbar. */
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
  const { fontScale } = useWindowDimensions();

  // Direkt durchreichen, ein Wrapper je Karte hebelte deren memo aus.
  const renderItem = useCallback(
    ({ item }: { item: EventFeature }) => (
      <EventCard
        feature={item}
        active={item.properties.id === selectedId}
        onPress={onSelect}
        saved={isSaved?.(item.properties.id)}
        onToggleSave={onToggleSave}
      />
    ),
    [selectedId, onSelect, isSaved, onToggleSave]
  );

  // Gleich hohe Karten, damit FlatList rechnet statt misst.
  const getItemLayout = useCallback(
    (_: ArrayLike<EventFeature> | null | undefined, index: number) => listItemLayout(index, fontScale),
    [fontScale]
  );

  return (
    <FlatList
      data={features}
      keyExtractor={(f) => String(f.properties.id)}
      // Kein extraData, ein Objekt-Literal wäre bei jedem Render neu.
      renderItem={renderItem}
      ItemSeparatorComponent={ItemSeparator}
      getItemLayout={getItemLayout}
      // Reserve als Scroll-Inhalt, sonst bleibt der letzte Eintrag unter der Kante.
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
      // Kein RefreshControl im Sheet, er fängt auf iOS die Geste am oberen Rand ab.
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
  // paddingTop = LIST_PADDING_TOP: derselbe Wert steckt in getItemLayout.
  content: { paddingHorizontal: spacing.lg, paddingTop: LIST_PADDING_TOP },
  empty: { alignItems: "center", paddingVertical: spacing.xxl, gap: spacing.sm },
  emptyTitle: { ...text.title, color: colors.ink },
  emptyText: {
    ...text.body,
    color: colors.muted,
    textAlign: "center",
    maxWidth: 280,
  },
});
