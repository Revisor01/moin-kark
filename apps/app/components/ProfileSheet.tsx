import {
  Image,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import type { EventFeature } from "@kkd/shared";
import type { MapsApp } from "../lib/store";
import type { ReminderPref } from "../lib/reminders";
import { colors, fonts, radius, shadow, spacing } from "../lib/theme";
import EventCard from "./EventCard";

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
  if (!visible) return null;

  return (
    <Pressable style={styles.backdrop} onPress={onClose}>
      <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
        <View style={styles.grabber} />
        <View style={styles.headerRow}>
          <Text style={styles.heading}>Profil</Text>
          <TouchableOpacity onPress={onClose} accessibilityRole="button" accessibilityLabel="Schließen">
            <Text style={styles.close}>×</Text>
          </TouchableOpacity>
        </View>

        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>
          {/* Karten-App */}
          <Text style={styles.sectionLabel}>Karten-App</Text>
          <View style={styles.segment}>
            {(["apple", "google"] as MapsApp[]).map((a) => (
              <TouchableOpacity
                key={a}
                style={[styles.segmentBtn, mapsApp === a && styles.segmentBtnActive]}
                onPress={() => onMapsApp(a)}
                activeOpacity={0.8}
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

          {/* Erinnerungen */}
          <Text style={[styles.sectionLabel, { marginTop: spacing.xl }]}>Erinnerung</Text>
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
              >
                <Text
                  style={[styles.segmentSmall, reminderPref === val && styles.segmentTextActive]}
                >
                  {label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

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
                  onPress={() => {
                    onClose();
                    onSelectEvent(f.properties.id);
                  }}
                />
              ))}
            </View>
          )}

          {/* Footer / Attribution */}
          <View style={styles.footer}>
            <View style={styles.geistRow}>
              <Text style={styles.geistText}>Made with </Text>
              <Image source={require("../assets/bird.png")} style={styles.geistBird} resizeMode="contain" />
              <Text style={styles.geistText}> in Hennstedt</Text>
            </View>
            <Text style={styles.geistBlessing}>Friede. Schalom. Salam.</Text>
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
    backgroundColor: "rgba(28,43,43,0.6)",
    justifyContent: "flex-end",
    alignItems: "center",
    zIndex: 1000,
  },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    width: "100%",
    maxWidth: 520,
    maxHeight: "88%",
    paddingBottom: spacing.lg,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    ...shadow.sheet,
  },
  grabber: {
    alignSelf: "center",
    width: 40,
    height: 4,
    borderRadius: 2,
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
  heading: { fontFamily: fonts.displayBold, fontSize: 24, color: colors.foreground },
  close: { fontSize: 28, color: colors.muted, lineHeight: 30 },
  scroll: { paddingHorizontal: spacing.xl, paddingTop: spacing.md },
  sectionLabel: {
    fontFamily: fonts.bodySemibold,
    fontSize: 12,
    letterSpacing: 0.5,
    textTransform: "uppercase",
    color: colors.faint,
    marginBottom: spacing.sm,
  },
  segment: {
    flexDirection: "row",
    backgroundColor: colors.surfaceMuted,
    borderRadius: radius.md,
    padding: 4,
    gap: 4,
  },
  segmentBtn: {
    flex: 1,
    paddingVertical: spacing.md,
    borderRadius: radius.sm,
    alignItems: "center",
  },
  segmentBtnActive: { backgroundColor: colors.surface, ...shadow.card },
  segmentText: { fontFamily: fonts.bodyMedium, fontSize: 15, color: colors.muted },
  segmentSmall: { fontFamily: fonts.bodyMedium, fontSize: 12, color: colors.muted },
  segmentTextActive: { color: colors.foreground },
  hint: { fontFamily: fonts.body, fontSize: 13, color: colors.faint, marginTop: spacing.sm },
  empty: {
    fontFamily: fonts.body,
    fontSize: 14,
    color: colors.muted,
    marginTop: spacing.sm,
    lineHeight: 20,
  },
  footer: {
    marginTop: spacing.xxl,
    paddingTop: spacing.lg,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    alignItems: "center",
    gap: spacing.sm,
  },
  geistRow: { flexDirection: "row", alignItems: "center" },
  geistText: { fontFamily: fonts.body, fontSize: 13, color: colors.muted },
  geistBird: { width: 14, height: 14 },
  geistBlessing: {
    fontFamily: fonts.body,
    fontStyle: "italic",
    fontSize: 12,
    color: colors.faint,
  },
  attr: {
    fontFamily: fonts.body,
    fontSize: 11,
    color: colors.faint,
    textAlign: "center",
    lineHeight: 16,
  },
  link: { color: colors.primary, textDecorationLine: "underline" },
});
