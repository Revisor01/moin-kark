// Im Browser gibt es keinen System-Dialog; dort bleibt es bei .ics-Datei oder Google-Vorlage.
import type { CalendarEvent } from "./calendar";

export async function addEventNatively(_p: CalendarEvent): Promise<boolean> {
  return false;
}
