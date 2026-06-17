// Die 14 ChurchDesk-Organisationen. Tokens kommen AUSSCHLIESSLICH aus ENV-Variablen
// (CD_TOKEN_<orgId>) — niemals im Code/Repo. Orgs ohne gesetzten Token werden übersprungen.

import { orgName } from "@kkd/shared";

/** Alle bekannten Org-IDs des Kirchenkreises Dithmarschen. */
export const ALL_ORG_IDS = [
  2596, 2619, 2715, 2718, 2720, 2722, 2723, 2724, 2725, 2729, 2753, 2936, 2940, 6572,
] as const;

export interface OrgConfig {
  id: number;
  name: string;
  token: string;
}

/** Liest die Org-Tokens aus der Umgebung. Loggt fehlende Tokens, ohne sie auszugeben. */
export function loadOrgs(): OrgConfig[] {
  const orgs: OrgConfig[] = [];
  const missing: number[] = [];
  for (const id of ALL_ORG_IDS) {
    const token = process.env[`CD_TOKEN_${id}`]?.trim();
    if (token) {
      orgs.push({ id, name: orgName(id), token });
    } else {
      missing.push(id);
    }
  }
  if (missing.length) {
    console.warn(
      `[orgs] Kein Token für ${missing.length} Org(s): ${missing.join(", ")} — werden übersprungen.`
    );
  }
  if (!orgs.length) {
    throw new Error(
      "[orgs] Keine ChurchDesk-Tokens konfiguriert. Setze CD_TOKEN_<orgId> in der Umgebung (.env)."
    );
  }
  console.log(`[orgs] ${orgs.length} Org(s) aktiv: ${orgs.map((o) => o.id).join(", ")}`);
  return orgs;
}
