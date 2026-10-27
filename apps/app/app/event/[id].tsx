import { useEffect } from "react";
import { View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { colors } from "../../lib/theme";

/** Ziel geteilter Links: reicht die ID an die Karte weiter, sonst zeigte der Router „Unmatched Route“. */
export default function EventDeepLink() {
  const { id } = useLocalSearchParams<{ id?: string }>();

  useEffect(() => {
    const clean = typeof id === "string" && /^\d+$/.test(id) ? id : undefined;
    // replace, damit die Zurück-Geste nicht auf der leeren Weiterleitung landet.
    router.replace(clean ? { pathname: "/", params: { event: clean } } : "/");
  }, [id]);

  return <View style={{ flex: 1, backgroundColor: colors.background }} />;
}
