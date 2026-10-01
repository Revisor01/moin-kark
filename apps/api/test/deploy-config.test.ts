import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { parse } from "yaml";

// Wächter für den Deploy-Weg (docs/deploy.md): Workflow, Stack-Vorlage und
// Dockerfile müssen zueinander passen. Läuft einer davon auseinander, baut die
// CI ein Image, das Portainer nie zieht — oder der Workflow wartet auf einen
// Commit, den die API nie meldet.

const read = (rel: string) =>
  readFileSync(fileURLToPath(new URL(`../../../${rel}`, import.meta.url)), "utf8");

const workflow = parse(read(".github/workflows/api-deploy.yml")) as any;
const compose = parse(read("apps/api/docker-compose.yml")) as any;
const dockerfile = read("apps/api/Dockerfile");

const buildStep = workflow.jobs.deploy.steps.find((s: any) =>
  String(s.uses ?? "").startsWith("docker/build-push-action")
);

describe("API-Deploy", () => {
  it("baut genau das Image, das der Stack zieht", () => {
    expect(compose.services["moinkark-api"].image).toBe(`${workflow.env.IMAGE}:latest`);
    expect(buildStep.with.tags).toContain(`\${{ env.IMAGE }}:latest`);
  });

  it("baut aus dem API-Dockerfile im Monorepo-Root", () => {
    expect(buildStep.with.context).toBe(".");
    expect(buildStep.with.file).toBe("apps/api/Dockerfile");
  });

  it("gibt den Commit ins Image, auf den der Workflow danach wartet", () => {
    expect(buildStep.with["build-args"]).toBe("GIT_SHA=${{ github.sha }}");
    expect(dockerfile).toMatch(/^ARG GIT_SHA=unknown$/m);
    expect(dockerfile).toMatch(/^ENV GIT_SHA=\$GIT_SHA$/m);
  });

  it("rollt erst nach grünen Tests aus", () => {
    expect(workflow.jobs.deploy.needs).toBe("test");
  });

  it("hält die Tokens aus der Vorlage heraus", () => {
    const env = compose.services["moinkark-api"].environment as Record<string, string>;
    const tokens = Object.entries(env).filter(([k]) => k.startsWith("CD_TOKEN_") || k === "ADMIN_TOKEN");
    expect(tokens.length).toBe(15);
    for (const [k, v] of tokens) expect(v).toBe(`\${${k}}`);
  });
});
