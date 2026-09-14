import { Linking, Platform } from "react-native";
import type { MapsApp } from "./store";

/** Google Maps im Browser, Kartenmittelpunkt auf der Koordinate — der Web-Fallback für alle Plattformen. */
const GOOGLE_MAPS_SEARCH_URL = "https://www.google.com/maps/search/?api=1&query=";
const googleMapsWebUrl = (lat: number, lng: number) => `${GOOGLE_MAPS_SEARCH_URL}${lat},${lng}`;

/** Öffnet Koordinaten/Adresse in der gewählten Karten-App. */
export function openInMaps(
  app: MapsApp,
  lat: number,
  lng: number,
  label?: string
) {
  const q = encodeURIComponent(label ?? "Veranstaltung");

  // Web/Desktop: keine native App → immer Google Maps im Browser (neuer Tab).
  if (Platform.OS === "web") {
    const url = googleMapsWebUrl(lat, lng);
    if (typeof window !== "undefined") window.open(url, "_blank");
    else Linking.openURL(url);
    return;
  }

  if (app === "google") {
    // Google Maps App (falls installiert) sonst Web-Fallback.
    // iOS braucht „comgooglemaps" in LSApplicationQueriesSchemes, sonst liefert
    // canOpenURL immer false und es landet trotz App im Browser (siehe app.json).
    const appUrl = `comgooglemaps://?q=${q}&center=${lat},${lng}`;
    const webUrl = googleMapsWebUrl(lat, lng);
    Linking.canOpenURL(appUrl)
      .then((ok) => Linking.openURL(ok ? appUrl : webUrl))
      .catch(() => Linking.openURL(webUrl));
    return;
  }
  // Apple Karten
  if (Platform.OS === "ios") {
    Linking.openURL(`maps://?ll=${lat},${lng}&q=${q}`);
  } else {
    // Auf Android gibt es keine Apple-Karten-App. Die maps.apple.com-URL öffnete
    // hier nur eine Weboberfläche ohne Navigation — daher Google-Web, wie es der
    // Kommentar immer schon versprochen hat.
    Linking.openURL(googleMapsWebUrl(lat, lng));
  }
}
