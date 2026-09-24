import { useEffect } from "react";
import { View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { colors } from "../../lib/theme";

/**
 * Ziel der geteilten Links (`…/event/<id>`).
 *
 * Fängt die App den Universal Link ab, bekommt der Router diesen Pfad — ohne
 * eine Route dafür zeigte er „Unmatched Route", noch bevor der Deep-Link-Code
 * auf der Karte greifen konnte. Diese Seite nimmt die ID entgegen und schickt
 * sie als Parameter an die Karte, die den Termin dann öffnet.
 *
 * Sie rendert bewusst nichts als eine leere Fläche in der Hintergrundfarbe:
 * Sie ist nur für den Sekundenbruchteil bis zum Austausch sichtbar, und ein
 * aufblitzender Text oder Spinner wirkte wie ein Ladefehler.
 */
export default function EventDeepLink() {
  const { id } = useLocalSearchParams<{ id?: string }>();

  useEffect(() => {
    const clean = typeof id === "string" && /^\d+$/.test(id) ? id : undefined;
    // replace statt push: Diese Seite soll nicht im Verlauf stehen, sonst
    // landet die Zurück-Geste wieder auf der leeren Weiterleitung.
    router.replace(clean ? { pathname: "/", params: { event: clean } } : "/");
  }, [id]);

  return <View style={{ flex: 1, backgroundColor: colors.background }} />;
}
