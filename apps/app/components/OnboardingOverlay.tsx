// Einmaliges Onboarding-Overlay beim ersten App-Start.
// Weist auf das Merken (Herz) + lokale Erinnerungen hin — ohne Server/Login.
import { Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { colors, fonts, radius, shadow, spacing } from "../lib/theme";

interface Props {
  visible: boolean;
  onDone: () => void;
}

const STEPS = [
  {
    icon: "♥",
    title: "Merk dir, was dich interessiert",
    body: "Tippe bei einer Veranstaltung auf das Herz. Deine Merkliste findest du oben rechts im Profil.",
  },
  {
    icon: "🔔",
    title: "Lass dich erinnern",
    body: "Zu gemerkten Veranstaltungen kannst du dich rechtzeitig erinnern lassen — am Vorabend oder 2 Stunden vorher. Alles bleibt auf deinem Gerät.",
  },
];

export default function OnboardingOverlay({ visible, onDone }: Props) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onDone}>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <Text style={styles.kicker}>Willkommen</Text>
          <Text style={styles.heading}>Kirche. In deiner Nähe.</Text>

          <View style={styles.steps}>
            {STEPS.map((s) => (
              <View key={s.title} style={styles.step}>
                <View style={styles.iconWrap}>
                  <Text style={styles.icon}>{s.icon}</Text>
                </View>
                <View style={styles.stepText}>
                  <Text style={styles.stepTitle}>{s.title}</Text>
                  <Text style={styles.stepBody}>{s.body}</Text>
                </View>
              </View>
            ))}
          </View>

          <Pressable
            style={styles.cta}
            onPress={onDone}
            accessibilityRole="button"
            accessibilityLabel="Los geht's"
          >
            <Text style={styles.ctaText}>Los geht's</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(28,43,43,0.6)",
    justifyContent: "center",
    alignItems: "center",
    padding: spacing.xl,
  },
  card: {
    width: "100%",
    maxWidth: 440,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.xl,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    ...shadow.sheet,
  },
  kicker: {
    fontFamily: fonts.bodySemibold,
    fontSize: 12,
    letterSpacing: 1,
    textTransform: "uppercase",
    color: colors.primary,
  },
  heading: {
    fontFamily: fonts.displayBold,
    fontSize: 26,
    color: colors.foreground,
    marginTop: 2,
    marginBottom: spacing.lg,
  },
  steps: { gap: spacing.lg },
  step: { flexDirection: "row", alignItems: "flex-start", gap: spacing.md },
  iconWrap: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.surfaceMuted,
    alignItems: "center",
    justifyContent: "center",
  },
  icon: { fontSize: 20, color: colors.accent },
  stepText: { flex: 1 },
  stepTitle: {
    fontFamily: fonts.bodySemibold,
    fontSize: 16,
    color: colors.foreground,
    marginBottom: 2,
  },
  stepBody: { fontFamily: fonts.body, fontSize: 14, color: colors.muted, lineHeight: 20 },
  cta: {
    marginTop: spacing.xl,
    backgroundColor: colors.primary,
    paddingVertical: spacing.md + 2,
    borderRadius: radius.md,
    alignItems: "center",
  },
  ctaText: { fontFamily: fonts.bodySemibold, fontSize: 16, color: colors.onPrimary },
});
