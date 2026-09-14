/**
 * Alle Felder von `meta` im Feed, alphabetisch. aggregate.test.ts prüft die
 * Liste gegen das, was die API liefert; openapi.test.ts gegen die Doku. Wer ein
 * Feld ergänzt, muss beides nachziehen — sonst schlägt genau ein Test fehl.
 */
export const META_FIELDS = [
  "from",
  "generatedAt",
  "orgsConfigured",
  "orgsFailed",
  "orgsFailedIds",
  "orgsMissing",
  "orgsOk",
  "to",
  "total",
  "windowFrom",
  "windowTo",
  "withEventCoords",
  "withFallbackCoords",
];
