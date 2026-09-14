// Einmaliges Onboarding-Overlay beim ersten App-Start.
// Weist auf das Merken (Herz) + lokale Erinnerungen hin — ohne Server/Login.
import { Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { colors, glyph, overlays, radius, shadow, spacing, text } from "../lib/theme";

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
    backgroundColor: overlays.backdrop,
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
  kicker: { ...text.eyebrow, color: colors.primary },
  heading: {
    ...text.display,
    color: colors.ink,
    marginTop: spacing.xxs,
    marginBottom: spacing.lg,
  },
  steps: { gap: spacing.lg },
  step: { flexDirection: "row", alignItems: "flex-start", gap: spacing.md },
  iconWrap: {
    width: 44,
    height: 44,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceMuted,
    alignItems: "center",
    justifyContent: "center",
  },
  icon: { ...glyph.md, color: colors.accent },
  stepText: { flex: 1 },
  stepTitle: {
    ...text.bodyStrong,
    color: colors.ink,
    marginBottom: spacing.xxs,
  },
  stepBody: { ...text.body, color: colors.muted },
  cta: {
    marginTop: spacing.xl,
    backgroundColor: colors.primary,
    paddingVertical: spacing.md,
    borderRadius: radius.md,
    alignItems: "center",
  },
  ctaText: { ...text.bodyStrong, color: colors.onColor },
});
