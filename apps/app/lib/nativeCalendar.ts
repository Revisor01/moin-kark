// System-Dialog „Termin anlegen“; die .ics-Datei würde iOS als Abo anbieten statt als einzelnen Termin.
import { Platform } from "react-native";
import * as Calendar from "expo-calendar/legacy";
import { nativeEventData, type CalendarEvent } from "./calendar";

/** true, wenn der Dialog gezeigt wurde; Abbrechen durch die Nutzerin zählt auch. */
export async function addEventNatively(p: CalendarEvent): Promise<boolean> {
  const data = nativeEventData(p, Platform.OS === "android" ? "android" : "ios");
  try {
    await Calendar.createEventInCalendarAsync(data);
    return true;
  } catch {
    // iOS unter 17 verlangt vorher Zugriff auf den Kalender, ab 17 nicht.
    if (Platform.OS !== "ios") return false;
    try {
      const { granted } = await Calendar.requestCalendarPermissionsAsync();
      if (!granted) return false;
      await Calendar.createEventInCalendarAsync(data);
      return true;
    } catch {
      return false;
    }
  }
}
