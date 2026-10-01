# API-Deploy

Seit 01.10.2026 rollt GitHub Actions die API aus. Kein SSH, kein rsync, kein
Bauen auf dem Server — das geht damit auch aus einer Cloud-Sitzung ohne
Serverzugang.

## Ablauf

```
push auf main (apps/api, packages/shared, Lockfile …)   oder   Run workflow
        │
        ▼
.github/workflows/api-deploy.yml
  1. test     Typecheck + Tests (shared, api)
  2. deploy   Image bauen  →  ghcr.io/revisor01/moinkark-api:latest
                                                  :sha-<commit>
              Portainer-Webhook (Secret PORTAINER_WEBHOOK_API)
                 → Portainer zieht :latest neu, erstellt den Container neu
              warten, bis https://api.moin-kark.de/ "revision": "<commit>" meldet
              /healthz = 200 und /categories.json nicht leer
```

Grün heißt: **der gebaute Commit antwortet live.** Ein grüner Healthcheck
allein hieße das nicht — der alte Container antwortet genauso.

## Von Hand starten

```bash
gh workflow run api-deploy.yml          # baut den Stand von main
gh run watch                            # zusehen
curl -s https://api.moin-kark.de/       # {"service":…,"status":"ok","revision":"<commit>"}
```

Oder im Browser: Actions → „API Deploy" → Run workflow. Ein Push auf `main`,
der die API betrifft, startet ihn von selbst.

## Was wo liegt

| Was | Wo |
|---|---|
| Workflow | `.github/workflows/api-deploy.yml` |
| Stack-Vorlage | `apps/api/docker-compose.yml` — inhaltsgleich mit der Stack-Datei in Portainer |
| Stack | Portainer `server.godsapp.de`, Stack **271** `moinkark-api`, Umgebung 1 |
| Image | `ghcr.io/revisor01/moinkark-api` (Tags `latest`, `sha-<commit>`) |
| Registry-Zugang | in Portainer hinterlegt (Registry „github", ghcr.io), dem Stack zugeordnet |
| Webhook | GitHub-Secret `PORTAINER_WEBHOOK_API` = `https://docker.godsapp.de/api/stacks/webhooks/<uuid>` |
| Tokens (ChurchDesk, Admin) | **nur** im Stack-Env von Portainer — nicht im Repo, nicht in der CI |
| Daten (/admin-Korrekturen) | Volume `moinkark-api_moinkark-data`, überlebt jeden Deploy |

Der Wächter `apps/api/test/deploy-config.test.ts` hält Workflow, Vorlage und
Dockerfile zusammen (Image-Name, Build-Argument, Tokens nur als Platzhalter).

## Stack-Datei ändern

Die Stack-Datei lebt in Portainer, nicht im Repo. Wer z. B. ein Traefik-Label
ergänzt:

1. In Portainer: Stack `moinkark-api` → Editor → ändern → „Update the stack"
   (Registry „github" bleibt ausgewählt, „Re-pull image" an).
2. Dieselbe Änderung in `apps/api/docker-compose.yml` committen.

Ohne Portainer-Zugang (Cloud-Sitzung) geht das nicht — dann im Handoff
vermerken, Simon oder eine lokale Sitzung zieht es nach.

## Rollback

Jedes Image bleibt unter `sha-<commit>` liegen. Zurück auf einen Stand:
Stack-Datei in Portainer `image: ghcr.io/revisor01/moinkark-api:sha-<commit>`,
Update. Danach wieder auf `:latest` stellen — sonst bleibt der nächste Deploy
wirkungslos (der Webhook zieht nur das Tag, das in der Datei steht).

## Fehlerbilder

- **„Secret PORTAINER_WEBHOOK_API fehlt"** — Image liegt in GHCR, ausgerollt
  wurde nichts. Webhook-URL steht in Portainer am Stack (Abschnitt „Webhooks").
- **Warten auf den Commit läuft ab** — Portainer hat das Image nicht gezogen.
  Prüfen: Ist die Registry „github" dem Stack zugeordnet? Steht in der
  Stack-Datei `:latest`? Containerlog in Portainer ansehen.
- **/healthz bleibt 503** — der neue Container läuft, bekommt aber keine Daten
  (ChurchDesk weg oder Tokens fehlen). `https://api.moin-kark.de/status` zeigt,
  welche Gemeinde ausfällt.

## Notfallweg ohne CI

Wenn GitHub Actions nicht läuft — nur mit Serverzugang:

```bash
# im Monorepo-Root
docker build --platform linux/amd64 -f apps/api/Dockerfile \
  --build-arg GIT_SHA=$(git rev-parse HEAD) -t ghcr.io/revisor01/moinkark-api:latest .
docker push ghcr.io/revisor01/moinkark-api:latest
# dann Portainer: Stack moinkark-api → „Pull and redeploy"
```

`docker restart moinkark-api` übernimmt ein neues Image **nicht** — immer über
Portainer neu ausrollen.
