import { useEffect } from "react";
import {
  Image,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from "react-native";
import { Gesture, GestureDetector, ScrollView } from "react-native-gesture-handler";
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { EventFeature } from "@moinkark/shared";
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

/**
 * Bereitet das Preis-Feld auf. ChurchDesk liefert es uneinheitlich:
 * „10,00 € / Monat" (hat schon €), „Eintritt frei …" (Text), oder „15" (nackte Zahl).
 * → „€" NUR an reine Zahlen anhängen, sonst unverändert lassen (kein „€€"/„frei €").
 */
function formatPrice(raw?: string): string {
  const v = raw?.trim();
  if (!v) return "";
  // Reine Zahl (ggf. mit Dezimalkomma/-punkt) → Euro anhängen.
  if (/^\d+([.,]\d{1,2})?$/.test(v)) return `${v} €`;
  return v;
}

export default function EventSheet({ feature, onClose, mapsApp, isSaved, onToggleSave }: Props) {
  const insets = useSafeAreaInsets();
  const { height: winH } = useWindowDimensions();
  // Feste Sheet-Höhe (statt maxHeight%) — nur so bekommt die ScrollView einen
  // klar begrenzten Raum und scrollt zuverlässig intern bis zum Maps-Button.
  const sheetHeight = Math.min(winH * 0.88, winH - insets.top - 24);

  // Swipe-down zum Schließen (nur Kopfbereich/Grabber, damit die desc-ScrollView frei bleibt).
  const translateY = useSharedValue(0);
  // translateY NICHT im close zurücksetzen → kein Aufblitzen (Sheet bliebe sonst 1 Frame oben sichtbar).
  // Beim Öffnen eines neuen Events wieder auf 0 (s. Effect unten).
  const swipeDown = Gesture.Pan()
    .onUpdate((e) => {
      translateY.value = Math.max(0, e.translationY);
    })
    .onEnd((e) => {
      if (e.translationY > 120 || e.velocityY > 800) {
        translateY.value = withTiming(sheetHeight, { duration: 180 }, () => runOnJS(onClose)());
      } else {
        translateY.value = withTiming(0, { duration: 150 });
      }
    });
  const sheetAnim = useAnimatedStyle(() => ({ transform: [{ translateY: translateY.value }] }));

  // Neues Event geöffnet → Sheet von oben einsetzen (translateY zurück auf 0).
  useEffect(() => {
    if (feature) translateY.value = 0;
  }, [feature, translateY]);

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
  const price = formatPrice(p.price);

  // Kopfbereich (Bild + Grabber + Kopfsektion) — hier greift der Swipe-down.
  const headerArea = (
    <View>
      {/* FIXES Bild — scrollt nicht mit. Kein Event-Bild → unser Marken-Motiv als Platzhalter. */}
      {p.image?.url ? (
        <Image source={{ uri: p.image.url }} style={styles.hero} resizeMode="cover" />
      ) : (
        <Image
          source={require("../assets/placeholder.png")}
          style={styles.hero}
          resizeMode="cover"
        />
      )}
      <View style={styles.grabber} pointerEvents="none" />

      {/* Fixe Kopfsektion — scrollt NICHT. */}
      <View style={styles.content}>
          <Text style={styles.time}>{time}</Text>
          <Text style={styles.title} numberOfLines={2}>
            {p.title}
          </Text>

          <View style={styles.badges}>
            {p.highlight ? (
              <View style={styles.highlightBadge}>
                <Text style={styles.highlightBadgeText}>★ Tipp</Text>
              </View>
            ) : null}
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
          {price ? <Meta label="Eintritt" value={price} highlight /> : null}
        </View>
      </View>
    </View>
  );

  return (
    <Pressable style={styles.backdrop} onPress={onClose}>
      <Animated.View style={[styles.sheet, { height: sheetHeight }, sheetAnim]}>
        {/* Tap auf das Sheet schließt NICHT (stopPropagation), Swipe-down am Kopf schließt. */}
        <Pressable onPress={(e) => e.stopPropagation()} style={styles.flex}>
          {/* Swipe-down nur auf dem Kopfbereich → die desc-ScrollView behält ihre Geste. */}
          <GestureDetector gesture={swipeDown}>{headerArea}</GestureDetector>

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

          {/* NUR die Beschreibung scrollt — eigener flex:1-Container, Maps-Button bleibt fix unten. */}
          <View style={styles.descArea}>
            {desc ? (
              <>
                <View style={styles.descDivider} />
                <ScrollView
                  style={styles.descScroll}
                  showsVerticalScrollIndicator
                  contentContainerStyle={styles.descScrollInner}
                >
                  <Text style={styles.desc}>{desc}</Text>
                </ScrollView>
              </>
            ) : null}
          </View>

          {/* Fixer Maps-Button unten. */}
          <View style={[styles.footer, { paddingBottom: spacing.lg + insets.bottom }]}>
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
        </Pressable>
      </Animated.View>
    </Pressable>
  );
}

function Meta({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <View style={styles.metaRow}>
      <Text style={styles.metaLabel}>{label}</Text>
      <Text style={[styles.metaValue, highlight && styles.metaValueHighlight]}>{value}</Text>
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
    backgroundColor: "rgba(28,43,43,0.6)",
    justifyContent: "flex-end",
    alignItems: "center",
    zIndex: 1000, // über Karten-Controls (Attribution etc.)
  },
  flex: { flex: 1 },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    width: "100%",
    maxWidth: 520,
    overflow: "hidden", // clippt das Hero-Bild auf die obere Rundung (kein weißer Strich)
    // Höhe wird inline gesetzt (feste Höhe → ScrollView scrollt zuverlässig).
    // Kein Rahmen/Schatten nötig: der dunkle Backdrop setzt das Sheet schon klar ab.
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
  // Nur die Beschreibung scrollt — nimmt den Restplatz zwischen fixer Kopf- und Fußsektion.
  // descArea füllt den Restraum zwischen fixer Kopf- und Fußsektion; die ScrollView darin scrollt.
  descArea: { flex: 1, minHeight: 0 },
  descScroll: { flex: 1 },
  descScrollInner: { paddingHorizontal: spacing.xl, paddingBottom: spacing.md },
  descDivider: {
    height: 1,
    backgroundColor: colors.border,
    marginHorizontal: spacing.xl,
    marginBottom: spacing.md,
  },
  footer: {
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.surface,
  },
  hero: {
    width: "100%",
    height: 200,
    flexShrink: 0, // fixes Bild — nicht zusammendrücken lassen
    // Bild selbst auf die obere Sheet-Rundung clippen (Web-Subpixel-Glitch vermeiden)
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
  },
  heroEmpty: {
    opacity: 0.25,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
  },
  content: { flexShrink: 0, paddingHorizontal: spacing.xl, paddingTop: spacing.xl, paddingBottom: spacing.md, gap: spacing.xs },
  time: { fontFamily: fonts.bodySemibold, fontSize: 13, color: colors.primary },
  title: {
    fontFamily: fonts.serifBold,
    fontSize: 26,
    color: colors.foreground,
    lineHeight: 30,
    marginBottom: spacing.xs,
  },
  badges: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  highlightBadge: {
    borderRadius: radius.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    backgroundColor: colors.accent,
  },
  highlightBadgeText: { fontFamily: fonts.bodySemibold, fontSize: 12, color: colors.onAccent },
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
  metaValueHighlight: { fontFamily: fonts.bodySemibold, color: colors.primary },
  desc: { fontFamily: fonts.serif, fontSize: 15, color: colors.foreground, lineHeight: 22 },
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
