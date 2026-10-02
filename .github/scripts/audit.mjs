// Audit der Produktiv-Abhängigkeiten, mit Allowlist für einzelne Meldungen.
//
//   node .github/scripts/audit.mjs [--report <datei>] [--allowlist <datei>]
//
// Ohne --report ruft das Skript selbst `npm audit --omit=dev --json` auf.
//
// Exit 1 bei jeder Meldung mit Schweregrad high oder critical, die nicht in
// .github/audit-allowlist.json steht. Ein Eintrag greift nur, solange
//   - GHSA-ID und Paket stimmen,
//   - es keinen Fix gibt, den `npm audit fix` einspielen könnte,
//   - das Paket keine direkte Abhängigkeit ist und nur über die Pakete in
//     `onlyVia` hereinkommt (npm führt jedes weitere unter `effects` auf).
// Ein Eintrag lässt also genau eine Meldung zu, nie ein ganzes Paket oder eine
// Schwelle. Wird er nicht mehr gebraucht, ist der Lauf ebenfalls rot — sonst
// überlebt die Ausnahme ihren Grund.
//
// Exit 2, wenn sich Bericht oder Allowlist nicht lesen lassen. Ein Audit, das
// nicht lief, ist kein bestandenes Audit.

import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

const BLOCKING = new Set(["high", "critical"]);
const GHSA = /^GHSA(-[23456789cfghjmpqrvwx]{4}){3}$/;

const { values: args } = parseArgs({
  options: {
    report: { type: "string" },
    allowlist: {
      type: "string",
      default: fileURLToPath(new URL("../audit-allowlist.json", import.meta.url)),
    },
  },
});

// GitHub-Annotation; Zeilenumbrüche würden sie abschneiden.
function error(message) {
  console.log(`::error::${message.replace(/%/g, "%25").replace(/\r/g, "%0D").replace(/\n/g, "%0A")}`);
}

function abort(message) {
  error(message);
  process.exit(2);
}

function readJson(label, text) {
  try {
    return JSON.parse(text);
  } catch {
    abort(`${label} ist kein JSON: ${String(text).slice(0, 300)}`);
  }
}

function loadReport() {
  if (args.report) return readJson("Bericht", readFileSync(args.report, "utf8"));
  // npm audit endet mit Exit 1, sobald es überhaupt etwas findet — geurteilt
  // wird hier, nicht dort.
  const run = spawnSync("npm", ["audit", "--omit=dev", "--json"], {
    // Immer der ganze Workspace, auch wenn jemand aus apps/… heraus aufruft.
    cwd: fileURLToPath(new URL("../..", import.meta.url)),
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
  if (run.error) abort(`npm audit ließ sich nicht starten: ${run.error.message}`);
  if (!run.stdout.trim()) abort(`npm audit lieferte keinen Bericht: ${run.stderr.trim().slice(0, 300)}`);
  return readJson("Bericht von npm audit", run.stdout);
}

function loadAllowlist() {
  const entries = readJson("Allowlist", readFileSync(args.allowlist, "utf8")).advisories;
  if (!Array.isArray(entries)) abort("Allowlist ohne advisories-Liste");
  for (const e of entries) {
    const complete =
      e !== null && typeof e === "object" &&
      GHSA.test(e.id ?? "") &&
      typeof e.package === "string" && e.package !== "" &&
      Array.isArray(e.onlyVia) && e.onlyVia.length > 0 &&
      typeof e.reason === "string" && e.reason.trim() !== "" &&
      /^\d{4}-\d{2}-\d{2}$/.test(e.since ?? "");
    if (!complete) {
      abort(`Allowlist-Eintrag unvollständig (id, package, onlyVia, reason, since): ${JSON.stringify(e)}`);
    }
  }
  return entries;
}

// GHSA-ID aus der Advisory-URL; Meldungen ohne GHSA behalten die npm-Nummer.
function advisoryId(advisory) {
  const match = /GHSA(-[a-z0-9]{4}){3}/i.exec(advisory.url ?? "");
  return match ? `GHSA${match[0].slice(4).toLowerCase()}` : `npm-${advisory.source}`;
}

// Warum ein Eintrag nicht (mehr) greift — null, wenn er greift.
function rejection(entry, vuln) {
  if (vuln.fixAvailable === true) {
    return "es gibt einen Fix: npm audit fix einspielen und den Allowlist-Eintrag entfernen";
  }
  if (vuln.isDirect) {
    return `ist jetzt direkte Abhängigkeit — zugelassen ist nur der Weg über ${entry.onlyVia.join(", ")}`;
  }
  const others = (vuln.effects ?? []).filter((name) => !entry.onlyVia.includes(name));
  if (others.length > 0) {
    return `kommt jetzt auch über ${others.join(", ")} herein — zugelassen ist nur ${entry.onlyVia.join(", ")}`;
  }
  return null;
}

const report = loadReport();
if (report?.error) {
  abort(`npm audit schlug fehl: ${report.message || report.error.summary || JSON.stringify(report.error)}`);
}
if (report?.auditReportVersion !== 2 || !report.vulnerabilities || typeof report.vulnerabilities !== "object") {
  abort("Unbekanntes Berichtsformat — erwartet auditReportVersion 2");
}
const allowlist = loadAllowlist();

// Nur Objekte in `via` sind Meldungen. Strings heißen „verwundbar über dieses
// Paket" — deren Meldung steht beim Paket selbst und wird dort beurteilt.
const findings = new Map();
for (const vuln of Object.values(report.vulnerabilities)) {
  for (const advisory of vuln.via ?? []) {
    if (typeof advisory === "string") continue;
    const id = advisoryId(advisory);
    findings.set(`${id} ${advisory.name}`, {
      id,
      advisory,
      vuln: report.vulnerabilities[advisory.name] ?? vuln,
    });
  }
}

let failed = false;
for (const { id, advisory, vuln } of findings.values()) {
  const label = `${advisory.severity}: ${advisory.name} — ${advisory.title} (${id})`;
  if (!BLOCKING.has(advisory.severity)) {
    console.log(`Hinweis, nicht blockierend: ${label}`);
    continue;
  }
  const entry = allowlist.find((e) => e.id === id && e.package === advisory.name);
  const why = entry ? rejection(entry, vuln) : "nicht in der Allowlist";
  if (why) {
    failed = true;
    error(`${label} — ${why}`);
  } else {
    console.log(`Zugelassen: ${label} — ${entry.reason}`);
  }
}

for (const entry of allowlist) {
  if (!findings.has(`${entry.id} ${entry.package}`)) {
    failed = true;
    error(`Allowlist-Eintrag ${entry.id} (${entry.package}) wird nicht mehr gemeldet — aus .github/audit-allowlist.json entfernen`);
  }
}

if (!failed) console.log("Audit bestanden.");
process.exit(failed ? 1 : 0);
