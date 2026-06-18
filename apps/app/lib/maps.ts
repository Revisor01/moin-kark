import { Linking, Platform } from "react-native";
import type { MapsApp } from "./store";

/** Öffnet Koordinaten/Adresse in der gewählten Karten-App. */
export function openInMaps(
  app: MapsApp,
  lat: number,
  lng: number,
  label?: string
) {
  const q = encodeURIComponent(label ?? "Veranstaltung");
  if (app === "google") {
    // Google Maps App (falls installiert) sonst Web-Fallback
    const appUrl = `comgooglemaps://?q=${lat},${lng}&center=${lat},${lng}`;
    const webUrl = `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
    Linking.canOpenURL(appUrl).then((ok) => Linking.openURL(ok ? appUrl : webUrl));
    return;
  }
  // Apple Karten
  if (Platform.OS === "ios") {
    Linking.openURL(`maps://?ll=${lat},${lng}&q=${q}`);
  } else {
    // Auf Android/Web kein Apple Maps → Google-Web als Fallback
    Linking.openURL(`https://maps.apple.com/?ll=${lat},${lng}&q=${q}`);
  }
}
