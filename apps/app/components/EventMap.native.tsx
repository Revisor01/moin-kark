// Native-Karte (iOS/Android) — Platzhalter für Phase 4.
// MapLibre-Native (@maplibre/maplibre-react-native) braucht einen Custom-Dev-Client
// (läuft NICHT in Expo Go), daher bewusst erst in Phase 4 implementiert.
import { StyleSheet, Text, View } from "react-native";
import { colors, fonts, spacing } from "../lib/theme";
import type { EventMapProps } from "./EventMap";

export default function EventMap(_props: EventMapProps) {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Karte</Text>
      <Text style={styles.note}>
        Die native Karte folgt in Phase 4 (MapLibre-Native, Custom-Dev-Client).
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.mapWater,
    padding: spacing.xl,
  },
  title: { fontFamily: fonts.display, fontSize: 24, color: colors.foreground },
  note: {
    fontFamily: fonts.body,
    fontSize: 14,
    color: colors.muted,
    textAlign: "center",
    marginTop: spacing.sm,
  },
});
