import {
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import type { EventFeature } from "@kkd/shared";
import { formatEventTime } from "../lib/filters";
import { openInMaps } from "../lib/maps";
import type { MapsApp } from "../lib/store";
import { colorForCategory, colors, fonts, radius, shadow, spacing } from "../lib/theme";

interface Props {
  feature: EventFeature | null;
  onClose: () => void;
  mapsApp: MapsApp;
  isSaved: boolean;
  onToggleSave: (id: number) => void;
}

/**
 * Entfernt interne Redaktions-Marker (z.B. „KAT: …", „URL: …", „INFO: …"),
 * die am Zeilenanfang stehen — die verwirren in der öffentlichen Ansicht.
 */
function stripMarkers(text: string): string {
  return text
    .split("\n")
    .filter((line) => !/^\s*[A-ZÄÖÜ]{2,}\s*:/.test(line))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** HTML grob zu Klartext + Marker-Bereinigung. */
function htmlToText(html?: string): string {
  if (!html) return "";
  const text = html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&[a-z]+;/gi, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return stripMarkers(text);
}

export default function EventSheet({ feature, onClose, mapsApp, isSaved, onToggleSave }: Props) {
  if (!feature) return null;
  const p = feature.properties;
  const cat = p.categories[0]?.title;
  const accent = colorForCategory(cat);
  const time = formatEventTime(p.startUtc, p.endUtc, p.allDay, p.showEndtime);
  const desc = stripMarkers(p.summary?.trim() ?? "") || htmlToText(p.descriptionHtml);
  const address = [p.address, [p.zipcode, p.city].filter(Boolean).join(" ")]
    .filter(Boolean)
    .join(", ");
  const [lng, lat] = feature.geometry.coordinates;

  return (
    <Pressable style={styles.backdrop} onPress={onClose}>
      <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
        {/* FIXES Bild — scrollt nicht mit */}
        {p.image?.url ? (
          <Image source={{ uri: p.image.url }} style={styles.hero} resizeMode="cover" />
        ) : (
          <View style={[styles.hero, styles.heroEmpty, { backgroundColor: accent }]} />
        )}
        <View style={styles.grabber} pointerEvents="none" />

        {/* Merken (Herz) */}
        <TouchableOpacity
          style={styles.heart}
          onPress={() => onToggleSave(p.id)}
          accessibilityRole="button"
          accessibilityLabel={isSaved ? "Nicht mehr merken" : "Merken"}
        >
          <Text style={[styles.heartIcon, isSaved && styles.heartActive]}>
            {isSaved ? "♥" : "♡"}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.close}
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel="Schließen"
        >
          <Text style={styles.closeText}>×</Text>
        </TouchableOpacity>

        {/* ALLES außer Bild scrollbar */}
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>
          <View style={styles.content}>
            <Text style={styles.time}>{time}</Text>
            <Text style={styles.title}>{p.title}</Text>

            <View style={styles.badges}>
              {cat ? (
                <View style={[styles.badge, { backgroundColor: accent }]}>
                  <Text style={styles.badgeText}>{cat}</Text>
                </View>
              ) : null}
              <View style={styles.badgeOutline}>
                <Text style={styles.badgeOutlineText}>{p.kirchspiel}</Text>
              </View>
            </View>

            <View style={styles.divider} />

            <View style={styles.metaBlock}>
              {p.parish ? <Meta label="Kirchengemeinde" value={p.parish} /> : null}
              <Meta label="Kirchspiel" value={p.kirchspiel} />
              {p.locationName ? <Meta label="Ort" value={p.locationName} /> : null}
              {address ? <Meta label="Adresse" value={address} /> : null}
              {p.contributor ? <Meta label="Mitwirkung" value={p.contributor} /> : null}
            </View>

            {desc ? (
              <>
                <View style={styles.divider} />
                <Text style={styles.desc}>{desc}</Text>
              </>
            ) : null}

            <TouchableOpacity
              style={styles.mapButton}
              activeOpacity={0.85}
              onPress={() => openInMaps(mapsApp, lat, lng, p.locationName ?? p.title)}
            >
              <Text style={styles.mapButtonText}>
                In {mapsApp === "google" ? "Google Maps" : "Apple Karten"} öffnen
              </Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </Pressable>
    </Pressable>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.metaRow}>
      <Text style={styles.metaLabel}>{label}</Text>
      <Text style={styles.metaValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(28,43,43,0.45)",
    justifyContent: "flex-end",
    alignItems: "center",
    zIndex: 1000, // über Karten-Controls (Attribution etc.)
  },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    width: "100%",
    maxWidth: 520,
    maxHeight: "88%",
    overflow: "hidden", // clippt das Hero-Bild auf die obere Rundung (kein weißer Strich)
    ...shadow.sheet,
  },
  grabber: {
    position: "absolute",
    top: spacing.sm,
    alignSelf: "center",
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: "rgba(255,255,255,0.85)",
    zIndex: 2,
  },
  scroll: { paddingBottom: spacing.xl },
  hero: {
    width: "100%",
    height: 200,
    // Bild selbst auf die obere Sheet-Rundung clippen (Web-Subpixel-Glitch vermeiden)
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
  },
  heroEmpty: {
    opacity: 0.25,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
  },
  content: { padding: spacing.xl, gap: spacing.xs },
  time: { fontFamily: fonts.bodySemibold, fontSize: 13, color: colors.primary },
  title: {
    fontFamily: fonts.serifBold,
    fontSize: 26,
    color: colors.foreground,
    lineHeight: 30,
    marginBottom: spacing.xs,
  },
  badges: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  badge: { borderRadius: radius.sm, paddingHorizontal: spacing.sm, paddingVertical: 4 },
  badgeText: { fontFamily: fonts.bodyMedium, fontSize: 12, color: colors.onAccent },
  badgeOutline: {
    borderRadius: radius.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: colors.borderStrong,
  },
  badgeOutlineText: { fontFamily: fonts.bodyMedium, fontSize: 12, color: colors.muted },
  divider: {
    height: 1,
    backgroundColor: colors.border,
    marginVertical: spacing.md,
  },
  metaBlock: { gap: spacing.sm },
  metaRow: { flexDirection: "row", justifyContent: "space-between", gap: spacing.lg },
  metaLabel: { fontFamily: fonts.bodyMedium, fontSize: 13, color: colors.faint },
  metaValue: {
    fontFamily: fonts.bodyMedium,
    fontSize: 13,
    color: colors.foreground,
    flexShrink: 1,
    textAlign: "right",
  },
  desc: { fontFamily: fonts.serif, fontSize: 17, color: colors.foreground, lineHeight: 25 },
  mapButton: {
    marginTop: spacing.lg,
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    alignItems: "center",
  },
  mapButtonText: { fontFamily: fonts.bodySemibold, fontSize: 15, color: colors.onPrimary },
  close: {
    position: "absolute",
    top: spacing.md,
    right: spacing.md,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "rgba(255,255,255,0.9)",
    alignItems: "center",
    justifyContent: "center",
    ...shadow.card,
  },
  closeText: { fontSize: 24, color: colors.foreground, lineHeight: 26, marginTop: -2 },
  heart: {
    position: "absolute",
    top: spacing.md,
    right: spacing.md + 44,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "rgba(255,255,255,0.9)",
    alignItems: "center",
    justifyContent: "center",
    ...shadow.card,
  },
  heartIcon: { fontSize: 20, color: colors.muted, lineHeight: 22 },
  heartActive: { color: colors.accent },
});
