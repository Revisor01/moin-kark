import { useEffect, useRef } from "react";
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
import { eventParishes, parishesLabel, type EventFeature } from "@moinkark/shared";
import { formatEventTime } from "../lib/filters";
import { openInMaps } from "../lib/maps";
import { canShare, shareEvent } from "../lib/share";
import { placeholderFor } from "../lib/placeholders";
import type { MapsApp } from "../lib/store";
import { colorForCategory, colors, glyph, overlays, radius, shadow, sizes, spacing, text } from "../lib/theme";
import { track } from "../lib/analytics";

interface Props {
  feature: EventFeature | null;
  onClose: () => void;
  mapsApp: MapsApp;
  isSaved: boolean;
  onToggleSave: (id: number) => void;
}

/** Entfernt die in ChurchDesk gebräuchlichen Redaktions-Marker am Zeilenanfang, nicht jede Großbuchstaben-Zeile. */
const MARKER_LINE = /^\s*(KAT|URL|INFO|TAG|TAGS|LINK|BILD|FOTO|INTERN)\s*:/i;

function stripMarkers(text: string): string {
  return text
    .split("\n")
    .filter((line) => !MARKER_LINE.test(line))
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
    // ChurchDesk liefert numerische Entities wie &#8211;.
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(parseInt(code, 16)))
    .replace(/&(quot|apos|lsquo|rsquo|ldquo|rdquo|ndash|mdash|hellip|euro|szlig);/gi, (_, name) => {
      const map: Record<string, string> = {
        quot: '"', apos: "'", lsquo: "\u2018", rsquo: "\u2019",
        ldquo: "\u201C", rdquo: "\u201D", ndash: "\u2013", mdash: "\u2014",
        hellip: "…", euro: "€", szlig: "ß",
      };
      return map[name.toLowerCase()] ?? " ";
    })
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    // &amp; zuletzt, sonst würde „&amp;#8211;" vorzeitig zu „&#8211;".
    .replace(/&amp;/g, "&")
    .replace(/&[a-z]+;/gi, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return stripMarkers(text);
}

/** Hängt „€“ nur an nackte Zahlen. */
function formatPrice(raw?: string): string {
  const v = raw?.trim();
  if (!v) return "";
  // Reine Zahl (ggf. mit Dezimalkomma/-punkt) → Euro anhängen.
  if (/^\d+([.,]\d{1,2})?$/.test(v)) return `${v} €`;
  return v;
}

const IS_WEB = Platform.OS === "web";

// Grobe Maße zur Entscheidung „fixer Kopf“ oder „alles scrollt“.
const HERO_HEIGHT = sizes.heroHeight; // styles.hero
const HEAD_BASE = 130; // Padding + Zeit + Titel + Badges + Trenner
const META_ROW = 24; // eine Meta-Zeile inkl. Abstand
const FOOTER_BASE = 86; // Maps-Button + Padding (ohne Safe Area)
// Unter etwa 6 Zeilen scrollt besser das ganze Sheet.
const DESC_MIN_HEIGHT = 132;

export default function EventSheet({ feature, onClose, mapsApp, isSaved, onToggleSave }: Props) {
  const insets = useSafeAreaInsets();
  const { height: winH } = useWindowDimensions();
  // Feste Höhe, nur so scrollt die ScrollView zuverlässig bis zum Maps-Button.
  const sheetHeight = Math.min(winH * 0.88, winH - insets.top - spacing.xl);

  // Swipe zum Schließen simultan zur ScrollView, aber nur ganz oben.
  const translateY = useSharedValue(0);
  const scrollRef = useRef<ScrollView>(null);
  // Shared Value, weil der Gesture-Callback auf dem UI-Thread läuft.
  const atTop = useSharedValue(true);
  // Im close nicht zurücksetzen, sonst blitzt das Sheet einen Frame auf.
  const swipeDown = Gesture.Pan()
    .simultaneousWithExternalGesture(scrollRef)
    // Erst bei klarer Vertikalbewegung, damit Tipps nicht als Swipe gelten.
    .activeOffsetY(12)
    .failOffsetY(-12)
    .onUpdate((e) => {
      // Nur mitziehen, wenn oben angekommen UND nach unten gewischt wird.
      if (!atTop.value || e.translationY <= 0) return;
      translateY.value = e.translationY;
    })
    .onEnd((e) => {
      if (atTop.value && (e.translationY > 120 || e.velocityY > 800)) {
        translateY.value = withTiming(sheetHeight, { duration: 180 }, () => runOnJS(onClose)());
      } else {
        translateY.value = withTiming(0, { duration: 150 });
      }
    });

  // Hält atTop aktuell — bei beiden Scroll-Varianten (scrollAll / nur Beschreibung).
  const onScroll = (e: any) => {
    atTop.value = e.nativeEvent.contentOffset.y <= 0;
  };
  const sheetAnim = useAnimatedStyle(() => ({ transform: [{ translateY: translateY.value }] }));

  // An der ID statt am Objekt, sonst wirkt nach einem Refetch jedes Event neu und der Text springt.
  const featureId = feature?.properties.id ?? null;
  useEffect(() => {
    if (featureId !== null) {
      translateY.value = 0;
      atTop.value = true;
      // Auch die ScrollView zurücksetzen, sonst beginnt ein direkt gewähltes Event mittendrin.
      scrollRef.current?.scrollTo({ y: 0, animated: false });
    }
  }, [featureId, translateY, atTop]);

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

  // Alle Gemeinden ausschreiben, „Kirchspiel“ allein kennen viele nicht.
  const parishes = eventParishes(p);
  const multiParish = parishes.length > 1;
  const gemeindeValue = parishesLabel(p);

  // Höhe des fixen Kopfes grob schätzen.
  const metaCount =
    (multiParish ? 2 : (p.parish ? 1 : 0) + 1) + (p.locationName ? 1 : 0) + (address ? 1 : 0) +
    (p.contributor ? 1 : 0) + (price ? 1 : 0);
  const headerEstimate = HERO_HEIGHT + HEAD_BASE + metaCount * META_ROW;
  const footerHeight = FOOTER_BASE + insets.bottom;
  const descSpace = sheetHeight - headerEstimate - footerHeight;
  // Zu wenig Raum: alles scrollen, sonst sind die letzten Zeilen unerreichbar.
  const scrollAll = !!desc && descSpace < DESC_MIN_HEIGHT;

  // Kopfbereich (Bild + Grabber + Kopfsektion).
  const headerArea = (
    <View>
      {/* Kein Event-Bild → wechselndes Dithmarschen-Motiv, stabil pro Event. */}
      <Image
        source={
          p.image?.url ? { uri: p.image.url } : placeholderFor(p.id, p.parish, p.city, "wide")
        }
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
            {gemeindeValue ? (
              <Meta
                label={multiParish ? "Kirchengemeinden" : "Kirchengemeinde"}
                value={gemeindeValue}
              />
            ) : null}
            {/* Bei Mehrfachzuordnung steckt das Kirchspiel schon in der Gemeindezeile. */}
            {multiParish ? null : <Meta label="Kirchspiel" value={p.kirchspiel} />}
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
          {/* Merken (Herz) */}
          {/* Herz und Schließen sind 36 pt groß; 6 pt Zuschlag rundum → 48 pt Tippziel. */}
          <TouchableOpacity
            style={styles.heart}
            onPress={() => onToggleSave(p.id)}
            hitSlop={6}
            accessibilityRole="button"
            accessibilityLabel={isSaved ? "Nicht mehr merken" : "Merken"}
          >
            <Text style={[styles.heartIcon, isSaved && styles.heartActive]}>
              {isSaved ? "♥" : "♡"}
            </Text>
          </TouchableOpacity>

          {/* Teilen: links neben dem Herz. Auch im Browser — dort nutzt
              react-native-web `navigator.share` (alle mobilen Browser und
              Safari können das) und fällt sonst auf die Zwischenablage zurück.
              Der Knopf war hier anfangs pauschal ausgeblendet; das war falsch,
              denn gerade auf dem Handy im Browser will man teilen. */}
          {!canShare() ? null : (
            <TouchableOpacity
              style={styles.share}
              onPress={() =>
                shareEvent(
                  { id: p.id, title: p.title, parish: p.parish, locationName: p.locationName },
                  time
                ).then(() => track("geteilt", { weg: "system" }))
              }
              hitSlop={6}
              accessibilityRole="button"
              accessibilityLabel="Termin teilen"
            >
              <Text style={styles.shareIcon}>↗</Text>
            </TouchableOpacity>
          )}

          <TouchableOpacity
            style={styles.close}
            onPress={onClose}
            hitSlop={6}
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
          <GestureDetector gesture={swipeDown}>
            {scrollAll ? (
              <ScrollView
                ref={scrollRef}
                onScroll={onScroll}
                scrollEventThrottle={16}
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
              <View style={styles.flex}>
                {headerArea}
                <View style={styles.descArea}>
                  {desc ? (
                    <>
                      <View style={styles.descDivider} />
                      <ScrollView
                        ref={scrollRef}
                        onScroll={onScroll}
                        scrollEventThrottle={16}
                        style={styles.descScroll}
                        showsVerticalScrollIndicator
                        contentContainerStyle={styles.descOnlyInner}
                      >
                        <Text style={styles.desc}>{desc}</Text>
                      </ScrollView>
                    </>
                  ) : null}
                </View>
              </View>
            )}
          </GestureDetector>

          {/* Fixer Maps-Button unten. */}
          <View style={[styles.footer, { paddingBottom: spacing.lg + insets.bottom }]}>
            <TouchableOpacity
              style={styles.mapButton}
              activeOpacity={0.85}
              accessibilityRole="button"
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
    backgroundColor: overlays.backdrop,
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
    maxWidth: sizes.sheetMaxWidth,
    overflow: "hidden", // clippt das Hero-Bild auf die obere Rundung (kein weißer Strich)
  },
  grabber: {
    position: "absolute",
    top: spacing.sm,
    alignSelf: "center",
    ...sizes.grabber,
    borderRadius: radius.pill,
    backgroundColor: overlays.onImage,
    zIndex: 2,
  },
  descScroll: { flex: 1 },
  // minHeight:0, sonst bläht sich die ScrollView auf statt zu scrollen.
  descArea: { flex: 1, minHeight: 0 },
  descOnlyInner: { paddingBottom: spacing.md },
  // Web-Hinweis unter den Meta-Angaben, sobald das Event gemerkt ist.
  savedNote: {
    marginTop: spacing.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radius.sm,
    backgroundColor: colors.surfaceMuted,
  },
  savedNoteText: { ...text.label, color: colors.muted },
  descScrollInner: { paddingBottom: spacing.xl },
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
    height: sizes.heroHeight,
    flexShrink: 0, // im Scroll-Container nicht zusammendrücken lassen
    // Bild selbst auf die obere Sheet-Rundung clippen (Web-Subpixel-Glitch vermeiden)
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
  },
  content: { flexShrink: 0, paddingHorizontal: spacing.xl, paddingTop: spacing.xl, paddingBottom: spacing.md, gap: spacing.xs },
  time: { ...text.labelStrong, color: colors.primary },
  title: {
    ...text.display,
    color: colors.ink,
    marginBottom: spacing.xs,
  },
  badges: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  highlightBadge: {
    borderRadius: radius.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    backgroundColor: colors.accent,
  },
  highlightBadgeText: { ...text.captionStrong, color: colors.onColor },
  badge: { borderRadius: radius.sm, paddingHorizontal: spacing.sm, paddingVertical: spacing.xs },
  badgeText: { ...text.captionMedium, color: colors.onColor },
  badgeOutline: {
    borderRadius: radius.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderWidth: 1,
    borderColor: colors.borderStrong,
  },
  badgeOutlineText: { ...text.captionMedium, color: colors.muted },
  divider: {
    height: 1,
    backgroundColor: colors.border,
    marginVertical: spacing.md,
  },
  metaBlock: { gap: spacing.sm },
  metaRow: { flexDirection: "row", justifyContent: "space-between", gap: spacing.lg },
  metaLabel: { ...text.labelMedium, color: colors.faint },
  metaValue: {
    ...text.labelMedium,
    color: colors.ink,
    flexShrink: 1,
    textAlign: "right",
  },
  metaValueHighlight: { ...text.labelStrong, color: colors.primary },
  desc: {
    ...text.body,
    color: colors.ink,
    paddingHorizontal: spacing.xl, // kam vorher vom Container (descScrollInner)
  },
  mapButton: {
    marginTop: spacing.lg,
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    alignItems: "center",
  },
  mapButtonText: { ...text.bodyStrong, color: colors.onColor },
  close: {
    position: "absolute",
    zIndex: 6, // über der Inhalts-ScrollView
    top: spacing.md,
    right: spacing.md,
    width: sizes.sheetButton,
    height: sizes.sheetButton,
    borderRadius: radius.pill,
    backgroundColor: overlays.onImage,
    alignItems: "center",
    justifyContent: "center",
    ...shadow.card,
  },
  closeText: { ...glyph.md, color: colors.ink, marginTop: -spacing.xxs },
  heart: {
    position: "absolute",
    zIndex: 6, // über der Inhalts-ScrollView
    top: spacing.md,
    // links neben dem Schließen-Button, mit einer Lücke sm
    right: spacing.md + sizes.sheetButton + spacing.sm,
    width: sizes.sheetButton,
    height: sizes.sheetButton,
    borderRadius: radius.pill,
    backgroundColor: overlays.onImage,
    alignItems: "center",
    justifyContent: "center",
    ...shadow.card,
  },
  heartIcon: { ...glyph.md, color: colors.muted },
  heartActive: { color: colors.accent },
  share: {
    position: "absolute",
    zIndex: 6, // über der Inhalts-ScrollView
    top: spacing.md,
    // eine Button-Breite weiter links als das Herz
    right: spacing.md + (sizes.sheetButton + spacing.sm) * 2,
    width: sizes.sheetButton,
    height: sizes.sheetButton,
    borderRadius: radius.pill,
    backgroundColor: overlays.onImage,
    alignItems: "center",
    justifyContent: "center",
    ...shadow.card,
  },
  shareIcon: { ...glyph.md, color: colors.muted },
});
