import { FlatList, StyleSheet, Text, View } from "react-native";
import type { EventFeature } from "@kkd/shared";
import EventCard from "./EventCard";
import { colors, fonts, spacing } from "../lib/theme";

interface Props {
  features: EventFeature[];
  selectedId?: number | null;
  onSelect: (id: number) => void;
  header?: React.ReactElement;
}

export default function EventList({ features, selectedId, onSelect, header }: Props) {
  return (
    <FlatList
      data={features}
      keyExtractor={(f) => String(f.properties.id)}
      ListHeaderComponent={header}
      renderItem={({ item }) => (
        <EventCard
          feature={item}
          active={item.properties.id === selectedId}
          onPress={() => onSelect(item.properties.id)}
        />
      )}
      ItemSeparatorComponent={() => <View style={{ height: spacing.md }} />}
      contentContainerStyle={styles.content}
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
      removeClippedSubviews
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
