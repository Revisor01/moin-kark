import { memo } from "react";
import { Image, Pressable, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import { eventParishes, type EventFeature } from "@moinkark/shared";
import { formatEventTime } from "../lib/filters";
import { CARD_MAX_FONT_SCALE, cardOuterHeight } from "../lib/listLayout";
import { colorForCategory, colors, glyph, radius, shadow, spacing, text } from "../lib/theme";
import { placeholderFor } from "../lib/placeholders";

interface Props {
  feature: EventFeature;
  active?: boolean;
  /**
   * Bekommt die Event-ID — so kann die Liste ihren `onSelect` direkt
   * durchreichen, statt pro Karte eine neue Funktion zu bauen (die machte
   * das `memo` unten wirkungslos).
   */
  onPress: (id: number) => void;
  /** Ist das Event gemerkt? (zeigt Herz) */
  saved?: boolean;
  /** Herz antippen → merken/entfernen. Wenn nicht gesetzt, kein Herz. */
  onToggleSave?: (id: number) => void;
}

function EventCard({ feature, active, onPress, saved, onToggleSave }: Props) {
  const p = feature.properties;
  // Systemschrift: Die Karte wächst bis 150 % mit (s. lib/listLayout), damit
  // Ort und Kategorie nicht abgeschnitten werden. fontScale kommt aus dem
  // Hook, damit ein Wechsel in den iOS-Einstellungen ohne Neustart greift.
  const { fontScale } = useWindowDimensions();
  const height = cardOuterHeight(fontScale);
  const cat = p.categories[0]?.title;
  const accent = colorForCategory(cat);
  const time = formatEventTime(p.startUtc, p.endUtc, p.allDay, p.showEndtime);
  // Mehrfach zugeordnete Events: auf der kompakten Karte „Kirchspiel Eider" statt
  // einer einzelnen (irreführend herausgegriffenen) Gemeinde; alle Namen stehen
  // in der Detailansicht.
  const place =
    eventParishes(p).length > 1
      ? `Kirchspiel ${p.kirchspiel}`
      : p.parish ?? p.locationName ?? p.kirchspiel;

  return (
    <View
      style={[styles.card, { height }, p.highlight && styles.cardHighlight, active && styles.cardActive]}
    >
      {p.highlight ? (
        <View style={styles.highlightBadge} pointerEvents="none">
          <Text style={styles.highlightBadgeText} maxFontSizeMultiplier={CARD_MAX_FONT_SCALE}>
            ★ Tipp
          </Text>
        </View>
      ) : null}
      <Pressable
        onPress={() => onPress(p.id)}
        accessibilityRole="button"
        accessibilityLabel={`${p.title}, ${time}, ${place}`}
        style={styles.pressArea}
      >
        <View style={[styles.accent, { backgroundColor: accent }]} />
        {/* Kein Foto → wechselndes Dithmarschen-Motiv (stabil pro Event, s.
            lib/placeholders.ts), hier quadratisch mittig zugeschnitten. */}
        <Image
          source={p.image?.url ? { uri: p.image.url } : placeholderFor(p.id, p.parish, p.city)}
          style={styles.thumb}
          resizeMode="cover"
        />
        <View style={styles.body}>
          <Text style={styles.time} maxFontSizeMultiplier={CARD_MAX_FONT_SCALE}>
            {time}
          </Text>
          <Text style={styles.title} numberOfLines={2} maxFontSizeMultiplier={CARD_MAX_FONT_SCALE}>
            {p.title}
          </Text>
          <View style={styles.metaRow}>
            {cat ? (
              <View style={[styles.tag, { borderColor: accent }]}>
                <Text
                  style={[styles.tagText, { color: accent }]}
                  numberOfLines={1}
                  maxFontSizeMultiplier={CARD_MAX_FONT_SCALE}
                >
                  {cat}
                </Text>
              </View>
            ) : null}
            <Text style={styles.place} numberOfLines={1} maxFontSizeMultiplier={CARD_MAX_FONT_SCALE}>
              {place}
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
  // Die Höhe kommt inline aus cardOuterHeight() — sie schließt den Rahmen mit
  // ein (Box-Modell in RN), darum sind alle Karten exakt gleich hoch, egal ob
  // der Rahmen 1 px (normal) oder 2 px (Tipp/aktiv) breit ist. Das braucht
  // EventList.getItemLayout, sonst rechnet die Liste beim Scrollen daneben.
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: colors.border,
    ...shadow.card,
  },
  // Füllt die Karte; ALLE Karten gleich hoch, Bild wird per cover zentriert
  // beschnitten (egal ob echtes Bild oder Querformat-Platzhalter).
  pressArea: { flexDirection: "row", flex: 1 },
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
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderBottomRightRadius: radius.sm,
    borderTopLeftRadius: radius.md,
  },
  highlightBadgeText: { ...text.captionStrong, color: colors.onColor },
  accent: { width: spacing.xs },
  // alignSelf:stretch → Thumbnail folgt der Kartenhöhe (cover füllt, beschneidet
  // mittig). KEIN minHeight → das Bild-Seitenverhältnis bläht die Karte nicht auf.
  thumb: { width: 96, alignSelf: "stretch" },
  body: { flex: 1, padding: spacing.md, gap: spacing.xxs, justifyContent: "center" },
  time: { ...text.captionStrong, color: colors.primary },
  title: { ...text.title, color: colors.ink },
  metaRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, marginTop: spacing.xxs },
  tag: {
    borderWidth: 1,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.sm,
    // 1 px statt spacing.xxs: Die Kartenhöhe (lib/listLayout) ist auf den Textblock
    // gerechnet — mehr Innenabstand am Tag würde die 104-px-Karte sprengen.
    paddingVertical: 1,
    maxWidth: 130,
  },
  tagText: text.captionMedium,
  place: { ...text.caption, color: colors.muted, flexShrink: 1 },
  heart: {
    position: "absolute",
    top: spacing.sm,
    right: spacing.sm,
    width: 28,
    height: 28,
    alignItems: "center",
    justifyContent: "center",
  },
  heartIcon: { ...glyph.sm, color: colors.faint },
  heartActive: { color: colors.accent },
});

/**
 * memo: In langen Listen rendert sonst jede Karte neu, sobald sich irgendetwas
 * am Bildschirm ändert — obwohl sich für die meisten Karten nichts geändert hat.
 * Wirkt nur, wenn die Funktions-Props stabil sind: `onPress` bekommt deshalb die
 * ID (kein Wrapper pro Karte), `onToggleSave` kommt als useCallback aus Home.
 */
export default memo(EventCard);
