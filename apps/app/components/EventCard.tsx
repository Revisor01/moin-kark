import { Image, Pressable, StyleSheet, Text, View } from "react-native";
import type { EventFeature } from "@kkd/shared";
import { formatEventTime } from "../lib/filters";
import { colorForCategory, colors, fonts, radius, shadow, spacing } from "../lib/theme";

interface Props {
  feature: EventFeature;
  active?: boolean;
  onPress: () => void;
  /** Ist das Event gemerkt? (zeigt Herz) */
  saved?: boolean;
  /** Herz antippen → merken/entfernen. Wenn nicht gesetzt, kein Herz. */
  onToggleSave?: (id: number) => void;
}

export default function EventCard({ feature, active, onPress, saved, onToggleSave }: Props) {
  const p = feature.properties;
  const cat = p.categories[0]?.title;
  const accent = colorForCategory(cat);
  const time = formatEventTime(p.startUtc, p.endUtc, p.allDay, p.showEndtime);

  return (
    <View style={[styles.card, p.highlight && styles.cardHighlight, active && styles.cardActive]}>
      {p.highlight ? (
        <View style={styles.highlightBadge} pointerEvents="none">
          <Text style={styles.highlightBadgeText}>★ Tipp</Text>
        </View>
      ) : null}
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={`${p.title}, ${time}, ${p.parish ?? p.kirchspiel}`}
        style={styles.pressArea}
      >
        <View style={[styles.accent, { backgroundColor: accent }]} />
        <Image
          source={p.image?.url ? { uri: p.image.url } : require("../assets/placeholder.png")}
          style={styles.thumb}
          resizeMode="cover"
        />
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
      </Pressable>
      {onToggleSave ? (
        <Pressable
          style={styles.heart}
          onPress={() => onToggleSave(p.id)}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={saved ? "Nicht mehr merken" : "Merken"}
        >
          <Text style={[styles.heartIcon, saved && styles.heartActive]}>
            {saved ? "♥" : "♡"}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: colors.border,
    ...shadow.card,
  },
  pressArea: { flexDirection: "row" },
  cardActive: {
    borderColor: colors.primary,
    borderWidth: 2,
  },
  cardHighlight: {
    borderColor: colors.accent,
    borderWidth: 2,
  },
  highlightBadge: {
    position: "absolute",
    top: 0,
    left: 0,
    zIndex: 2,
    backgroundColor: colors.accent,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderBottomRightRadius: radius.sm,
    borderTopLeftRadius: radius.md,
  },
  highlightBadgeText: {
    fontFamily: fonts.bodySemibold,
    fontSize: 11,
    color: colors.onAccent,
    letterSpacing: 0.3,
  },
  accent: { width: 4 },
  // alignSelf:stretch → Thumbnail folgt der vom Text bestimmten Kartenhöhe (cover füllt).
  // KEIN minHeight → das Bild-Seitenverhältnis bläht die Karte nicht mehr auf (Listen-Bug).
  thumb: { width: 96, alignSelf: "stretch" },
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
  heart: {
    position: "absolute",
    top: 6,
    right: 8,
    width: 28,
    height: 28,
    alignItems: "center",
    justifyContent: "center",
  },
  heartIcon: { fontSize: 18, color: colors.faint, lineHeight: 20 },
  heartActive: { color: colors.accent },
});
