import { useEffect } from "react";
import {
  Image,
  Platform,
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
import { placeholderFor } from "../lib/placeholders";
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

const IS_WEB = Platform.OS === "web";

// Maße für die Abschätzung, ob die Beschreibung genug Platz hat (müssen grob zu
// den Styles unten passen — kleine Abweichungen sind unkritisch, es geht nur um
// die Entscheidung „fixer Kopf" vs. „alles scrollt").
const HERO_HEIGHT = 200; // styles.hero
const HEAD_BASE = 130; // Padding + Zeit + Titel + Badges + Trenner
const META_ROW = 24; // eine Meta-Zeile inkl. Abstand
const FOOTER_BASE = 86; // Maps-Button + Padding (ohne Safe Area)
// Darunter lohnt der fixe Kopf nicht mehr: weniger als ~6 Textzeilen im
// Scrollfenster liest sich schlechter, als das ganze Sheet zu scrollen.
const DESC_MIN_HEIGHT = 132;

export default function EventSheet({ feature, onClose, mapsApp, isSaved, onToggleSave }: Props) {
  const insets = useSafeAreaInsets();
  const { height: winH } = useWindowDimensions();
  // Feste Sheet-Höhe (statt maxHeight%) — nur so bekommt die ScrollView einen
  // klar begrenzten Raum und scrollt zuverlässig intern bis zum Maps-Button.
  const sheetHeight = Math.min(winH * 0.88, winH - insets.top - 24);

  // Swipe-down zum Schließen. Greift nur am oberen Rand (Grabber-Zone), damit die
  // Inhalts-ScrollView frei bleibt — sonst frisst die Pan-Geste das Scrollen.
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

  // Höhe des fixen Kopfbereichs abschätzen: Bild + Kopfsektion (Zeit, Titel, Badges,
  // Trenner) + eine Zeile je Meta-Angabe. Danach entscheidet sich, ob für die
  // Beschreibung genug Platz bleibt.
  const metaCount =
    (p.parish ? 1 : 0) + 1 + (p.locationName ? 1 : 0) + (address ? 1 : 0) +
    (p.contributor ? 1 : 0) + (price ? 1 : 0);
  const headerEstimate = HERO_HEIGHT + HEAD_BASE + metaCount * META_ROW;
  const footerHeight = FOOTER_BASE + insets.bottom;
  const descSpace = sheetHeight - headerEstimate - footerHeight;
  // Zu wenig Raum für den Text → lieber das ganze Sheet scrollen lassen, sonst
  // wären die letzten Zeilen praktisch unerreichbar (der Fehler aus v1.1.1).
  const scrollAll = !!desc && descSpace < DESC_MIN_HEIGHT;

  // Kopfbereich (Bild + Grabber + Kopfsektion).
  const headerArea = (
    <View>
      {/* Kein Event-Bild → wechselndes Dithmarschen-Motiv, stabil pro Event. */}
      <Image
        source={p.image?.url ? { uri: p.image.url } : placeholderFor(p.id)}
        style={styles.hero}
        resizeMode="cover"
      />
      <View style={styles.grabber} pointerEvents="none" />

      {/* Kopfsektion (Titel, Badges, Meta). */}
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

        {/* Im Web merkt das Herz nur lokal — es gibt dort keine Erinnerung
            (expo-notifications kann im Browser nicht planen). Der Hinweis
            erscheint erst nach dem Merken, damit er nicht ungefragt stört. */}
        {IS_WEB && isSaved ? (
          <View style={styles.savedNote}>
            <Text style={styles.savedNoteText}>
              Auf diesem Gerät gemerkt. Erinnerungen gibt es in der App.
            </Text>
          </View>
        ) : null}
      </View>
    </View>
  );

  return (
    <Pressable style={styles.backdrop} onPress={onClose}>
      <Animated.View style={[styles.sheet, { height: sheetHeight }, sheetAnim]}>
        {/* Tap auf das Sheet schließt NICHT (stopPropagation), Swipe-down am Kopf schließt. */}
        <Pressable onPress={(e) => e.stopPropagation()} style={styles.flex}>
          {/* Swipe-down-Zone: transparenter Streifen über dem Grabber, liegt über der
              ScrollView. Nur ~40pt hoch und endet links von Herz/Schließen-Button,
              damit weder Scrollen noch die Buttons blockiert werden. */}
          <GestureDetector gesture={swipeDown}>
            <View style={styles.swipeZone} />
          </GestureDetector>

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

          {/* Kopfbereich fix, NUR die Beschreibung scrollt.
              Wichtig: descArea bekommt eine Mindesthöhe (DESC_MIN_HEIGHT). Ohne die
              blieb auf kleinen Geräten fast kein Platz für den Text übrig (iPhone SE:
              ~37pt = keine zwei Zeilen), weil Bild + Meta-Block den Kopf sehr hoch
              machen. Reicht die Höhe nicht, scrollt stattdessen das ganze Sheet —
              so bleibt der Text immer erreichbar. */}
          {scrollAll ? (
            <ScrollView
              style={styles.descScroll}
              showsVerticalScrollIndicator
              contentContainerStyle={styles.descScrollInner}
            >
              {headerArea}
              {desc ? (
                <>
                  <View style={styles.descDivider} />
                  <Text style={styles.desc}>{desc}</Text>
                </>
              ) : null}
            </ScrollView>
          ) : (
            <>
              {headerArea}
              <View style={styles.descArea}>
                {desc ? (
                  <>
                    <View style={styles.descDivider} />
                    <ScrollView
                      style={styles.descScroll}
                      showsVerticalScrollIndicator
                      contentContainerStyle={styles.descOnlyInner}
                    >
                      <Text style={styles.desc}>{desc}</Text>
                    </ScrollView>
                  </>
                ) : null}
              </View>
            </>
          )}

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
  // Die ScrollView füllt den Restraum über dem fixen Maps-Button.
  descScroll: { flex: 1 },
  // Bereich zwischen fixem Kopf und Footer; minHeight:0 ist nötig, damit die
  // ScrollView darin überhaupt scrollt statt sich aufzublähen.
  descArea: { flex: 1, minHeight: 0 },
  // Nur-Beschreibung-Modus: hier braucht der Text sein eigenes Seitenpadding
  // nicht doppelt (styles.desc bringt es mit), unten etwas Luft zum Footer.
  descOnlyInner: { paddingBottom: spacing.md },
  // Web-Hinweis unter den Meta-Angaben, sobald das Event gemerkt ist.
  savedNote: {
    marginTop: spacing.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radius.sm,
    backgroundColor: colors.surfaceMuted,
  },
  savedNoteText: { fontFamily: fonts.body, fontSize: 12.5, color: colors.muted, lineHeight: 17 },
  // Bild und Kopfsektion bringen ihr eigenes Padding mit → hier nur unten Luft,
  // damit die letzte Textzeile nicht am Footer klebt.
  descScrollInner: { paddingBottom: spacing.xl },
  // Transparente Swipe-Zone über dem Grabber (schließt per Wischen nach unten).
  // right lässt Herz (right: 56) und Schließen (right: 12) frei — beide sind 36pt
  // breit und sitzen bei top: 12, würden also sonst von dieser Zone verdeckt.
  swipeZone: {
    position: "absolute",
    top: 0,
    left: 0,
    right: spacing.md + 44 + 36 + spacing.sm,
    height: 40,
    zIndex: 5,
  },
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
    flexShrink: 0, // im Scroll-Container nicht zusammendrücken lassen
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
  desc: {
    fontFamily: fonts.serif,
    fontSize: 15,
    color: colors.foreground,
    lineHeight: 22,
    paddingHorizontal: spacing.xl, // kam vorher vom Container (descScrollInner)
  },
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
    zIndex: 6, // über der Inhalts-ScrollView
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
    zIndex: 6, // über der Inhalts-ScrollView
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
