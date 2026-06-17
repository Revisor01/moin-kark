import { Image, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import type { EventFeature } from "@kkd/shared";
import { formatEventTime } from "../lib/filters";
import { colorForCategory, colors, fonts, radius, shadow, spacing } from "../lib/theme";

interface Props {
  feature: EventFeature;
  active?: boolean;
  onPress: () => void;
}

export default function EventCard({ feature, active, onPress }: Props) {
  const p = feature.properties;
  const cat = p.categories[0]?.title;
  const accent = colorForCategory(cat);
  const time = formatEventTime(p.startUtc, p.endUtc, p.allDay, p.showEndtime);

  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.85}
      accessibilityRole="button"
      accessibilityLabel={`${p.title}, ${time}, ${p.parish ?? p.kirchspiel}`}
      style={[styles.card, active && styles.cardActive]}
    >
      <View style={[styles.accent, { backgroundColor: accent }]} />
      {p.image?.url ? (
        <Image source={{ uri: p.image.url }} style={styles.thumb} resizeMode="cover" />
      ) : (
        <View style={[styles.thumb, styles.thumbEmpty]}>
          <Text style={styles.thumbInitial}>{p.title.slice(0, 1)}</Text>
        </View>
      )}
      <View style={styles.body}>
        <Text style={styles.time}>{time}</Text>
        <Text style={styles.title} numberOfLines={2}>
          {p.title}
        </Text>
        <View style={styles.metaRow}>
          {cat ? (
            <View style={[styles.tag, { borderColor: accent }]}>
              <Text style={[styles.tagText, { color: accent }]} numberOfLines={1}>
                {cat}
              </Text>
            </View>
          ) : null}
          <Text style={styles.place} numberOfLines={1}>
            {p.parish ?? p.locationName ?? p.kirchspiel}
          </Text>
        </View>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: "row",
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: colors.border,
    ...shadow.card,
  },
  cardActive: {
    borderColor: colors.primary,
    borderWidth: 2,
  },
  accent: { width: 4 },
  thumb: { width: 96, alignSelf: "stretch", minHeight: 96 },
  thumbEmpty: {
    backgroundColor: colors.surfaceMuted,
    alignItems: "center",
    justifyContent: "center",
  },
  thumbInitial: { fontFamily: fonts.display, fontSize: 30, color: colors.faint },
  body: { flex: 1, padding: spacing.md, gap: 2, justifyContent: "center" },
  time: { fontFamily: fonts.bodySemibold, fontSize: 12, color: colors.primary },
  title: { fontFamily: fonts.serifBold, fontSize: 17, color: colors.foreground, lineHeight: 21 },
  metaRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, marginTop: 2 },
  tag: {
    borderWidth: 1,
    borderRadius: radius.sm,
    paddingHorizontal: 6,
    paddingVertical: 1,
    maxWidth: 130,
  },
  tagText: { fontFamily: fonts.bodyMedium, fontSize: 11 },
  place: { fontFamily: fonts.body, fontSize: 12, color: colors.muted, flexShrink: 1 },
});
