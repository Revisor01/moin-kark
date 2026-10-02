import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, describe, expect, it } from "vitest";
import { parse } from "yaml";

// Wächter für das Audit in der CI (.github/scripts/audit.mjs): Ein Eintrag in
// der Allowlist lässt genau eine Meldung zu — nicht ein Paket, nicht eine
// Schwelle — und nur, solange sein Grund besteht.

const path = (rel: string) => fileURLToPath(new URL(`../../../${rel}`, import.meta.url));
const script = path(".github/scripts/audit.mjs");
const tmp = mkdtempSync(join(tmpdir(), "audit-"));
let files = 0;

afterAll(() => rmSync(tmp, { recursive: true, force: true }));

type Vuln = {
  name: string;
  severity: string;
  isDirect: boolean;
  via: unknown[];
  effects: string[];
  fixAvailable: unknown;
  nodes: string[];
  range: string;
};

type Entry = { id: string; package: string; onlyVia: string[]; reason: string; since: string };

const FORGE = "GHSA-86w9-cpqp-85rv";

const forgeEntry: Entry = {
  id: FORGE,
  package: "node-forge",
  onlyVia: ["@expo/cli", "@expo/code-signing-certificates"],
  reason: "nur im Expo-Kommandozeilenwerkzeug",
  since: "2026-10-02",
};

const allow = (...advisories: unknown[]) => ({ advisories });

const advisory = (name: string, ghsa: string, severity: string) => ({
  source: 1,
  name,
  dependency: name,
  title: `Lücke in ${name}`,
  url: `https://github.com/advisories/${ghsa}`,
  severity,
  range: "*",
});

const vuln = (name: string, severity: string, via: unknown[], extra: Partial<Vuln> = {}): Vuln => ({
  name,
  severity,
  isDirect: false,
  via,
  effects: [],
  fixAvailable: false,
  nodes: [`node_modules/${name}`],
  range: "*",
  ...extra,
});

const reportOf = (vulnerabilities: Record<string, Vuln>) => ({
  auditReportVersion: 2,
  vulnerabilities,
  metadata: {},
});

// Auszug aus dem echten Bericht vom 02.10.2026: node-forge (high) kommt über
// das Expo-Kommandozeilenwerkzeug, decode-uri-component (moderate) über
// expo-router. Die übrigen Einträge sind nur Weitergabe — samt des
// fixAvailable: true, das npm dort meldet, obwohl es keinen Fix gibt.
function today(): Record<string, Vuln> {
  return {
    "node-forge": vuln("node-forge", "high", [advisory("node-forge", FORGE, "high")], {
      effects: ["@expo/cli", "@expo/code-signing-certificates"],
      fixAvailable: { name: "expo", version: "44.0.6", isSemVerMajor: true },
    }),
    "@expo/code-signing-certificates": vuln("@expo/code-signing-certificates", "high", ["node-forge"], {
      fixAvailable: true,
    }),
    "@expo/cli": vuln("@expo/cli", "high", ["@expo/code-signing-certificates", "node-forge"], {
      effects: ["expo"],
    }),
    expo: vuln("expo", "high", ["@expo/cli"], { isDirect: true }),
    "decode-uri-component": vuln(
      "decode-uri-component",
      "moderate",
      [advisory("decode-uri-component", "GHSA-vcc3-ghjq-m6fr", "moderate")],
      { effects: ["query-string"] }
    ),
    "query-string": vuln("query-string", "moderate", ["decode-uri-component"], { effects: ["expo-router"] }),
    "expo-router": vuln("expo-router", "moderate", ["query-string"], { isDirect: true }),
  };
}

// Ohne allowlist-Argument gilt die echte Datei aus .github/.
function audit(report: unknown, allowlist?: unknown) {
  const reportFile = join(tmp, `report-${++files}.json`);
  writeFileSync(reportFile, typeof report === "string" ? report : JSON.stringify(report));
  const args = [script, "--report", reportFile];
  if (allowlist !== undefined) {
    const allowlistFile = join(tmp, `allowlist-${files}.json`);
    writeFileSync(allowlistFile, JSON.stringify(allowlist));
    args.push("--allowlist", allowlistFile);
  }
  const run = spawnSync(process.execPath, args, { encoding: "utf8" });
  return { code: run.status, out: run.stdout + run.stderr };
}

describe("Audit mit Allowlist", () => {
  it("lässt den Bericht vom 02.10.2026 mit dem node-forge-Eintrag durch", () => {
    const { code, out } = audit(reportOf(today()), allow(forgeEntry));
    expect(code).toBe(0);
    expect(out).toContain(`Zugelassen: high: node-forge — Lücke in node-forge (${FORGE})`);
    expect(out).toContain("Hinweis, nicht blockierend: moderate: decode-uri-component");
    expect(out).not.toContain("::error::");
  });

  it("ist ohne Eintrag rot — die Schwelle bleibt high", () => {
    const { code, out } = audit(reportOf(today()), allow());
    expect(code).toBe(1);
    expect(out).toContain(`::error::high: node-forge — Lücke in node-forge (${FORGE}) — nicht in der Allowlist`);
  });

  it("lässt nur die eine Meldung zu, nicht das ganze Paket", () => {
    const report = today();
    report["node-forge"].via.push(advisory("node-forge", "GHSA-2222-3333-4444", "critical"));
    const { code, out } = audit(reportOf(report), allow(forgeEntry));
    expect(code).toBe(1);
    expect(out).toContain(
      "::error::critical: node-forge — Lücke in node-forge (GHSA-2222-3333-4444) — nicht in der Allowlist"
    );
    expect(out).toContain(`Zugelassen: high: node-forge — Lücke in node-forge (${FORGE})`);
  });

  it("verlangt neben der ID auch das Paket", () => {
    const { code, out } = audit(reportOf(today()), allow({ ...forgeEntry, package: "node-forge-light" }));
    expect(code).toBe(1);
    expect(out).toContain(`::error::high: node-forge — Lücke in node-forge (${FORGE}) — nicht in der Allowlist`);
  });

  it("ist rot, sobald node-forge auch über ein anderes Paket hereinkommt", () => {
    const report = today();
    report["node-forge"].effects.push("some-server-lib");
    const { code, out } = audit(reportOf(report), allow(forgeEntry));
    expect(code).toBe(1);
    expect(out).toContain(
      "kommt jetzt auch über some-server-lib herein — zugelassen ist nur @expo/cli, @expo/code-signing-certificates"
    );
  });

  it("ist rot, sobald node-forge direkte Abhängigkeit wird", () => {
    const report = today();
    report["node-forge"].isDirect = true;
    const { code, out } = audit(reportOf(report), allow(forgeEntry));
    expect(code).toBe(1);
    expect(out).toContain(`(${FORGE}) — ist jetzt direkte Abhängigkeit`);
  });

  it("ist rot, sobald es einen Fix gibt", () => {
    const report = today();
    report["node-forge"].fixAvailable = true;
    const { code, out } = audit(reportOf(report), allow(forgeEntry));
    expect(code).toBe(1);
    expect(out).toContain(
      `(${FORGE}) — es gibt einen Fix: npm audit fix einspielen und den Allowlist-Eintrag entfernen`
    );
  });

  it("ist rot, wenn ein Eintrag nicht mehr gebraucht wird", () => {
    const report = today();
    for (const name of ["node-forge", "@expo/code-signing-certificates", "@expo/cli", "expo"]) {
      delete report[name];
    }
    const { code, out } = audit(reportOf(report), allow(forgeEntry));
    expect(code).toBe(1);
    expect(out).toContain(`::error::Allowlist-Eintrag ${FORGE} (node-forge) wird nicht mehr gemeldet`);
  });

  it("besteht nicht, wenn npm audit nicht lief", () => {
    const offline = {
      message: "request to https://registry.npmjs.org/-/npm/v1/security/audits/quick failed",
      error: { summary: "", detail: "" },
    };
    const run = audit(offline, allow(forgeEntry));
    expect(run.code).toBe(2);
    expect(run.out).toContain("::error::npm audit schlug fehl: request to https://registry.npmjs.org/");
    expect(audit("npm ERR! kaputt", allow(forgeEntry)).code).toBe(2);
    expect(audit({ auditReportVersion: 1, advisories: {} }, allow(forgeEntry)).code).toBe(2);
  });

  it("weist Einträge ohne Begründung, Weg oder Datum ab", () => {
    for (const field of ["reason", "onlyVia", "since"] as const) {
      const entry: Partial<Entry> = { ...forgeEntry };
      delete entry[field];
      const { code, out } = audit(reportOf(today()), allow(entry));
      expect(code).toBe(2);
      expect(out).toContain("::error::Allowlist-Eintrag unvollständig");
    }
  });

  it("nimmt jeden Eintrag der echten Allowlist an", () => {
    const real = JSON.parse(readFileSync(path(".github/audit-allowlist.json"), "utf8")).advisories as Entry[];
    const report: Record<string, Vuln> = {};
    for (const e of real) {
      report[e.package] ??= vuln(e.package, "high", [], { effects: e.onlyVia });
      report[e.package].via.push(advisory(e.package, e.id, "high"));
    }
    const { code, out } = audit(reportOf(report));
    expect(code).toBe(0);
    expect(out.match(/^Zugelassen: /gm)?.length ?? 0).toBe(real.length);
  });

  it("ersetzt in der CI den Aufruf mit eigener Schwelle", () => {
    const ci = parse(readFileSync(path(".github/workflows/ci.yml"), "utf8")) as any;
    const step = ci.jobs.audit.steps.find((s: any) => s.name === "Produktiv-Abhängigkeiten");
    expect(step.run).toBe("node .github/scripts/audit.mjs");
  });
});
