import {
  Image,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { EventFeature } from "@moinkark/shared";
import type { MapsApp } from "../lib/store";
import type { ReminderPref } from "../lib/reminders";
import { rateApp, shareApp } from "../lib/share";
import { colors, glyph, overlays, radius, shadow, sizes, spacing, text } from "../lib/theme";
import Constants from "expo-constants";
import EventCard from "./EventCard";

const IS_WEB = Platform.OS === "web";

interface Props {
  visible: boolean;
  onClose: () => void;
  mapsApp: MapsApp;
  onMapsApp: (a: MapsApp) => void;
  reminderPref: ReminderPref;
  onReminderPref: (p: ReminderPref) => void;
  savedFeatures: EventFeature[];
  onSelectEvent: (id: number) => void;
  onToggleSave: (id: number) => void;
}

/**
 * Nur auf iOS gibt es überhaupt eine Wahl: Android hat keine Apple-Karten-App,
 * und im Web öffnet openInMaps ohnehin immer Google Maps im Browser. Wo nur eine
 * Möglichkeit bleibt, entfällt der Abschnitt ganz (statt eines wirkungslosen Schalters).
 */
const MAPS_CHOICES: MapsApp[] = Platform.OS === "ios" ? ["apple", "google"] : [];

export default function ProfileSheet({
  visible,
  onClose,
  mapsApp,
  onMapsApp,
  reminderPref,
  onReminderPref,
  savedFeatures,
  onSelectEvent,
  onToggleSave,
}: Props) {
  // Vor dem frühen Return: Hooks müssen in jedem Render laufen.
  const insets = useSafeAreaInsets();
  if (!visible) return null;

  return (
    <Pressable style={styles.backdrop} onPress={onClose}>
      {/* Untere Safe Area dazurechnen — sonst liegt die letzte Zeile hinter dem Home-Indicator. */}
      <Pressable
        style={[styles.sheet, { paddingBottom: spacing.lg + insets.bottom }]}
        onPress={(e) => e.stopPropagation()}
      >
        <View style={styles.grabber} />
        <View style={styles.headerRow}>
          <Text style={styles.heading}>Profil</Text>
          <TouchableOpacity
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel="Schließen"
            hitSlop={12}
          >
            <Text style={styles.close}>×</Text>
          </TouchableOpacity>
        </View>

        <ScrollView
          style={styles.scrollView}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.scroll}
        >
          {/* Karten-App — nur wo die Wahl etwas bewirkt (s. MAPS_CHOICES). */}
          {MAPS_CHOICES.length > 1 && (
          <>
          <Text style={styles.sectionLabel}>Karten-App</Text>
          <View style={styles.segment}>
            {MAPS_CHOICES.map((a) => (
              <TouchableOpacity
                key={a}
                style={[styles.segmentBtn, mapsApp === a && styles.segmentBtnActive]}
                onPress={() => onMapsApp(a)}
                activeOpacity={0.8}
                accessibilityRole="button"
                accessibilityState={{ selected: mapsApp === a }}
              >
                <Text style={[styles.segmentText, mapsApp === a && styles.segmentTextActive]}>
                  {a === "apple" ? "Apple Karten" : "Google Maps"}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
          <Text style={styles.hint}>
            Wird verwendet, wenn du in einer Veranstaltung „Auf Karte öffnen" tippst.
          </Text>
          </>
          )}

          {/* Erinnerungen — im Web gibt es keine: expo-notifications kann dort nicht
              planen (s. lib/reminders.ts, alle Funktionen sind auf Web No-ops). Den
              Wähler dort trotzdem zu zeigen, würde eine Funktion versprechen, die
              nicht stattfindet — deshalb an seiner Stelle die ehrliche Erklärung. */}
          <Text style={[styles.sectionLabel, { marginTop: spacing.xl }]}>Erinnerung</Text>
          {IS_WEB ? (
            <View style={styles.webNote}>
              <Text style={styles.webNoteText}>
                Erinnerungen gibt es nur in der App für iPhone und Android. Gemerkte
                Veranstaltungen bleiben hier auf diesem Gerät gespeichert.
              </Text>
            </View>
          ) : (
            <View style={styles.segment}>
              {(
                [
                  ["evening", "Vorabend"],
                  ["2h", "2 Std vorher"],
                  ["both", "Beides"],
                  ["off", "Aus"],
                ] as [ReminderPref, string][]
              ).map(([val, label]) => (
                <TouchableOpacity
                  key={val}
                  style={[styles.segmentBtn, reminderPref === val && styles.segmentBtnActive]}
                  onPress={() => onReminderPref(val)}
                  activeOpacity={0.8}
                  // Rolle + Zustand: VoiceOver las „Vorabend“ bisher als reinen
                  // Text, und welche Option aktiv ist, war nicht hörbar.
                  accessibilityRole="button"
                  accessibilityState={{ selected: reminderPref === val }}
                >
                  <Text
                    style={[styles.segmentSmall, reminderPref === val && styles.segmentTextActive]}
                  >
                    {label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          )}

          {/* Merkliste */}
          <Text style={[styles.sectionLabel, { marginTop: spacing.xl }]}>
            Gemerkte Veranstaltungen
          </Text>
          {savedFeatures.length === 0 ? (
            <Text style={styles.empty}>
              Noch nichts gemerkt. Tippe bei einer Veranstaltung auf das Herz, um sie hier zu sammeln.
            </Text>
          ) : (
            <View style={{ gap: spacing.md, marginTop: spacing.sm }}>
              {savedFeatures.map((f) => (
                <EventCard
                  key={f.properties.id}
                  feature={f}
                  saved
                  onToggleSave={onToggleSave}
                  onPress={(id) => {
                    onClose();
                    onSelectEvent(id);
                  }}
                />
              ))}
            </View>
          )}

          {/* App weitersagen und bewerten. Auf Web fehlt beides: der
              System-Teilen-Dialog ist dort nicht verlässlich, und eine
              Store-Bewertung ergibt ohne installierte App keinen Sinn. */}
          {IS_WEB ? null : (
            <>
              <Text style={[styles.sectionLabel, { marginTop: spacing.xl }]}>Moin Kark</Text>
              {/* Zwei gleich breite Knöpfe nebeneinander. Als Listenzeilen
                  gingen die beiden Aktionen zwischen Einstellungen und Footer
                  unter — als Knöpfe sind sie das, was sie sind: etwas zum
                  Antippen. */}
              <View style={styles.actionRow}>
                <TouchableOpacity
                  style={styles.actionButton}
                  onPress={shareApp}
                  accessibilityRole="button"
                  accessibilityLabel="App weiterempfehlen"
                  activeOpacity={0.85}
                >
                  <Text style={styles.actionButtonText}>App empfehlen</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.actionButton, styles.actionButtonGhost]}
                  onPress={rateApp}
                  accessibilityRole="button"
                  accessibilityLabel="App bewerten"
                  activeOpacity={0.85}
                >
                  <Text style={[styles.actionButtonText, styles.actionButtonGhostText]}>
                    App bewerten
                  </Text>
                </TouchableOpacity>
              </View>
            </>
          )}

          {/* Footer — drei klar getrennte Blöcke: Träger · Karte/Daten · Autor */}
          <View style={styles.footer}>
            {/* 1) Träger: Kirchenkreis */}
            <TouchableOpacity
              onPress={() => Linking.openURL("https://www.kirche-dithmarschen.de")}
              accessibilityRole="link"
              accessibilityLabel="Zur Website des Kirchenkreises Dithmarschen"
              activeOpacity={0.7}
            >
              <Image
                source={require("../assets/kkd-logo.png")}
                style={styles.kkdLogo}
                resizeMode="contain"
              />
            </TouchableOpacity>
            <Text style={styles.carrier}>Ein Projekt des Kirchenkreises Dithmarschen</Text>

            {/* 2) Karte & Daten */}
            <View style={styles.footerDivider} />
            <Text style={styles.attr}>
              Karte ©{" "}
              <Text
                style={styles.link}
                onPress={() => Linking.openURL("https://www.openstreetmap.org/copyright")}
              >
                OpenStreetMap
              </Text>
              -Mitwirkende · Tiles: OpenFreeMap · Daten: ChurchDesk
            </Text>
            {/* Die Stores verlangen eine erreichbare Datenschutzerklärung; sie
                gehört auch in die App, nicht nur in den Store-Eintrag. */}
            <Text
              style={styles.privacyLink}
              onPress={() => Linking.openURL("https://simonluthe.de/apps/moinkark/datenschutz/")}
              accessibilityRole="link"
              accessibilityLabel="Datenschutzerklärung öffnen"
            >
              Datenschutz
            </Text>

            {/* 3) Autor — Branding-Pattern: App+Version, roter Vogel, Friedensgruß. */}
            <View style={styles.footerDivider} />
            <Text style={styles.appVersion}>
              Moin Kark v{Constants.expoConfig?.version ?? "1.0"}
            </Text>
            <View style={styles.geistRow}>
              <Text style={styles.geistText}>Made with </Text>
              <Image source={require("../assets/bird.png")} style={styles.geistBird} resizeMode="contain" />
              <Text style={styles.geistText}> in Hennstedt</Text>
            </View>
            <Text style={styles.geistBlessing}>Friede. Schalom. Salam.</Text>
            <Text
              style={styles.copyright}
              onPress={() => Linking.openURL("https://simonluthe.de")}
              accessibilityRole="link"
            >
              © {new Date().getFullYear()}{" "}
              <Text style={styles.copyrightLink}>Simon Luthe</Text>
            </Text>
          </View>
        </ScrollView>
      </Pressable>
    </Pressable>
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
    zIndex: 1000,
  },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    width: "100%",
    maxWidth: sizes.sheetMaxWidth,
    maxHeight: "88%",
    // paddingBottom kommt inline (spacing.lg + Safe Area).
    borderWidth: 1,
    borderColor: colors.borderStrong,
    ...shadow.sheet,
  },
  grabber: {
    alignSelf: "center",
    ...sizes.grabber,
    borderRadius: radius.pill,
    backgroundColor: colors.borderStrong,
    marginTop: spacing.sm,
  },
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.md,
  },
  heading: { ...text.heading, color: colors.ink },
  close: { ...glyph.md, color: colors.muted },
  scrollView: { flexShrink: 1 },
  scroll: { paddingHorizontal: spacing.xl, paddingTop: spacing.md },
  sectionLabel: { ...text.eyebrow, color: colors.faint, marginBottom: spacing.sm },
  segment: {
    flexDirection: "row",
    backgroundColor: colors.surfaceMuted,
    borderRadius: radius.md,
    padding: spacing.xs,
    gap: spacing.xs,
  },
  segmentBtn: {
    flex: 1,
    paddingVertical: spacing.md,
    borderRadius: radius.sm,
    alignItems: "center",
  },
  segmentBtnActive: { backgroundColor: colors.surface, ...shadow.card },
  // Tippzeilen für App-Aktionen: 48 pt hoch, damit das Ziel groß genug ist.
  actionRow: {
    flexDirection: "row",
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  actionButton: {
    // flex:1 auf beiden — gleiche Breite, egal wie lang die Beschriftung ist.
    flex: 1,
    minHeight: sizes.sheetButton + spacing.sm,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing.sm,
    borderRadius: radius.md,
    backgroundColor: colors.primary,
  },
  actionButtonText: { ...text.bodyStrong, color: colors.onColor, textAlign: "center" },
  // Der zweite Knopf tritt zurück: Empfehlen ist der Hauptweg, Bewerten der
  // seltenere — zwei gleich laute Knöpfe nebeneinander konkurrieren sonst.
  actionButtonGhost: {
    backgroundColor: "transparent",
    borderWidth: 1,
    borderColor: colors.border,
  },
  actionButtonGhostText: { color: colors.primary },
  segmentText: { ...text.bodyMedium, color: colors.muted },
  segmentSmall: { ...text.captionMedium, color: colors.muted },
  segmentTextActive: { color: colors.ink },
  hint: { ...text.label, color: colors.faint, marginTop: spacing.sm },
  // Web-Hinweis an Stelle des Erinnerungs-Wählers.
  webNote: {
    marginTop: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceMuted,
    borderWidth: 1,
    borderColor: colors.border,
  },
  webNoteText: { ...text.label, color: colors.muted },
  empty: {
    ...text.body,
    color: colors.muted,
    marginTop: spacing.sm,
  },
  footer: {
    marginTop: spacing.xxl,
    paddingTop: spacing.lg,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    alignItems: "center",
    gap: spacing.sm,
  },
  footerDivider: {
    width: spacing.xxl,
    height: 1,
    backgroundColor: colors.border,
    marginVertical: spacing.sm,
  },
  kkdLogo: { width: 168, height: 59, marginBottom: spacing.xs },
  carrier: { ...text.labelMedium, color: colors.ink, textAlign: "center" },
  geistRow: { flexDirection: "row", alignItems: "center" },
  appVersion: { ...text.label, color: colors.muted, marginBottom: spacing.xs },
  geistText: { ...text.label, color: colors.muted },
  geistBird: { width: 14, height: 14 },
  geistBlessing: { ...text.caption, fontStyle: "italic", color: colors.faint },
  attr: { ...text.caption, color: colors.faint, textAlign: "center" },
  link: { color: colors.primary, textDecorationLine: "underline" },
  // Eigene Zeile unter der Attributionszeile — der Inline-„link"-Stil bringt
  // weder Größe noch Ausrichtung mit und stünde hier zu groß und linksbündig.
  privacyLink: {
    ...text.caption,
    color: colors.primary,
    textDecorationLine: "underline",
    textAlign: "center",
    marginTop: spacing.xs,
  },
  copyright: { ...text.caption, color: colors.faint, textAlign: "center", marginTop: spacing.xs },
  copyrightLink: { color: colors.primary, textDecorationLine: "underline" },
});
