import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { parse } from "yaml";

// Wächter für den Deploy-Weg: Workflow, Stack-Vorlage und
// Dockerfile müssen zueinander passen. Läuft einer davon auseinander, baut die
// CI ein Image, das Portainer nie zieht — oder der Workflow wartet auf einen
// Commit, den die API nie meldet.

const read = (rel: string) =>
  readFileSync(fileURLToPath(new URL(`../../../${rel}`, import.meta.url)), "utf8");

const workflow = parse(read(".github/workflows/api-deploy.yml")) as any;
const compose = parse(read("apps/api/docker-compose.yml")) as any;
const dockerfile = read("apps/api/Dockerfile");

const image = workflow.jobs.image;
const deploy = workflow.jobs.deploy;

describe("API-Deploy", () => {
  it("baut genau das Image, das der Stack zieht", () => {
    expect(image.uses).toMatch(/^Revisor01\/workflows\/\.github\/workflows\/docker-image\.yml@[0-9a-f]{40}$/);
    expect(compose.services["moinkark-api"].image).toBe(`${image.with.image}:latest`);
    // Ohne eigene Tag-Regeln setzt der Baustein latest auf dem Standard-Branch.
    expect(image.with.tags).toBeUndefined();
  });

  it("baut aus dem API-Dockerfile im Monorepo-Root", () => {
    expect(image.with.kontext).toBeUndefined();
    expect(image.with.dockerfile).toBe("apps/api/Dockerfile");
  });

  it("gibt den Commit ins Image, auf den der Workflow danach wartet", () => {
    expect(image.with["build-args"]).toBe("GIT_SHA=${{ github.sha }}");
    expect(deploy.with["revision-feld"]).toBe(".revision");
    expect(deploy.with["pruef-url"]).toBe(`${workflow.env.API_URL}/`);
    expect(dockerfile).toMatch(/^ARG GIT_SHA=unknown$/m);
    expect(dockerfile).toMatch(/^ENV GIT_SHA=\$GIT_SHA$/m);
  });

  it("rollt erst nach grünen Tests aus", () => {
    expect(image.needs).toBe("test");
    expect(deploy.needs).toBe("image");
    expect(deploy.secrets.webhook).toBe("${{ secrets.PORTAINER_WEBHOOK_API }}");
  });

  it("hält die Tokens aus der Vorlage heraus", () => {
    const env = compose.services["moinkark-api"].environment as Record<string, string>;
    const tokens = Object.entries(env).filter(([k]) => k.startsWith("CD_TOKEN_") || k === "ADMIN_TOKEN");
    expect(tokens.length).toBe(15);
    for (const [k, v] of tokens) expect(v).toBe(`\${${k}}`);
  });
});
