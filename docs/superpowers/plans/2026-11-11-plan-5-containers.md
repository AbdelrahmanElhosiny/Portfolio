# Plan 5: Containers (owner's Stage 1 step)

> **For agentic workers:** this is a guide-and-review plan, not a TDD plan. Claude writes **starter files** (skeletons with `# TODO(you): ...` blocks), a guide artifact and `docs/learn/01-containers.md`. The owner writes the real file contents. Claude never writes a finished Dockerfile, `nginx.conf` or `compose.yaml`, not even as a "reference solution". Steps use checkbox (`- [ ]`) syntax.

**Goal:** `docker compose up` on the Mac runs Postgres 17, a one-shot migration, the API, the site and the admin, all built by the owner from Claude's starters.

**Architecture:** One API image (multi-stage, `pnpm deploy`, non-root). One web recipe built twice (`APP=site|admin`) onto unprivileged nginx :8080. Compose: `postgres` → `migrate` (one-shot) → `api` → `site` and `admin`. nginx proxies `/api` only in Compose, through an include file; Traefik takes over in Stage 2.

**Tech Stack:** Docker Desktop (Apple Silicon, so linux/arm64 natively), Compose v2, `node:22-alpine` (build and runtime), `nginxinc/nginx-unprivileged:1.29-alpine`, `postgres:17-alpine`, pnpm 12.

**Spec:** `docs/superpowers/specs/2026-11-11-portfolio-design.md` §3 (arm64, memory), §4 (containers row), §5 "Security basics", §7 (learning model), §8 stage 1. Inputs: Plans 1–4.

## Reconsider before executing

None of these are approved yet. Claude presents them with a summary and waits for the owner's OK.

1. **One shared web Dockerfile** (`docker/web.Dockerfile`, `ARG APP`) instead of two copies under `apps/site` and `apps/admin`. The builds differ only in app name and server conf, and copies drift. Rejected: per-app Dockerfiles.
2. **Base images:** Alpine for the API. `@node-rs/argon2` ships a `linux-arm64-musl` binary, which the review gate verifies. If it fails, fall back to `node:22-bookworm-slim`. The Node major (22 vs 24 LTS) is his pick, and the code supports both.
3. **pnpm inside Docker:** the `node:22` images still ship corepack, so either `corepack enable` with `packageManager` pinned, or `npm i -g pnpm@12`. `pnpm deploy` in pnpm ≥10 needs `inject-workspace-packages=true` in `.npmrc`, or `--legacy`. Verify on pnpm 12 before the starter is written.
4. **CSP:** hash-based only if Plans 3–4 emit inline scripts or styles. If the Vite builds have none, `script-src 'self'` with no hashes is stricter and simpler. Claude checks the built `index.html` files before writing the CSP starter. GSAP or Motion inline `style=` attributes may need `style-src 'self' 'unsafe-inline'`. Decide with evidence from the build, and record the choice in the guide. The admin host needs `style-src 'self' 'unsafe-inline'` regardless, because MUI/Emotion injects runtime `<style>` tags (Plan 4 Reconsider 2); `script-src` stays strict on both hosts.
5. **The `/api` proxy lives in an include file** (`docker/nginx/api-proxy.conf`) mounted only by Compose, so the same image runs under Traefik later. Rejected: baking it in (double hop under Ingress), and Traefik in Compose (Stage 2's lesson).
6. **Host ports:** site `8080`, admin `8081`, api not published (reachable only through `/api`). So `SITE_ORIGINS=http://localhost:8080` in his Compose `.env`, and `COOKIE_SECURE=false`. Both apps share `localhost` cookies (ports are ignored).
7. **Secrets:** Compose reads a git-ignored `.env` (`DATABASE_URL`, `TOTP_ENC_KEY`, `ADMIN_PASSWORD_HASH`, Postgres password) through `env_file`. An argon2 hash contains `$`: write it as `$$` in `compose.yaml`, or single-quote it in `.env`. The gate checks the value arrives intact.
8. **Risk: Docker Desktop is currently off on the Mac.** That's a prerequisite, not a task.
9. **Résumé PDF (from Plan 3 Reconsider 5):** `apps/site/public/resume.pdf` is git-ignored because the repo is public, so the site image build must copy the real file in. He picks the source (a git-ignored path in the build context, or a build secret/arg) and the `.dockerignore` must not exclude it.

## Global Constraints

- Plans 1 and 2's Global Constraints apply where they touch runtime: env var names, ports, `/healthz` and `/readyz`, the prod commands `node dist/server.js`, `node dist/cli/migrate.js`, `node dist/cli/admin-init.js`, `node dist/cli/retention.js`.
- **Ownership:** Claude delivers starters only. Every `TODO(you)` block in a starter is empty apart from a one-line hint. A starter with the TODOs filled in is a spec violation (anti-goal "infrastructure Claude wrote and he only copied").
- **Every starter file is delivered with the spec §7 five parts:**
  1. a 2–3 line summary
  2. why it's written this way, plus the rejected alternative
  3. plain-words meaning of each line
  4. what to learn, plus 3–5 interview questions
  5. his part (the TODO list), plus the check command with its expected output
- **Every image:** multi-stage, runs as non-root, linux/arm64, no secrets in `ARG`/`ENV`/layers, `HEALTHCHECK` where the base image allows it, and works with a read-only root filesystem when given a tmpfs for `/tmp` (prep for Stage 2).
- **Claude runs no git commands.** Each task ends with a checkpoint where the owner commits.

---

### Task 1: Guide artifact and `docs/learn/01-containers.md`

**Files:**
- Create: `docs/learn/01-containers.md`
- Publish: guide artifact "Containers: Stage 1" (through the Artifact tool, with the artifact-design skill loaded first)

- [ ] **Step 1: Verify the open facts from the Reconsider section.** Check pnpm 12 `deploy` flags, the argon2 musl binary, and any inline scripts or styles in `apps/site/dist/index.html` and `apps/admin/dist/index.html`. Record each answer in the guide.
- [ ] **Step 2: Write the guide.** Use these sections, per spec §7:
  1. what and why in plain words: image vs container, layers and cache, multi-stage, why non-root, why arm64
  2. a diagram of Compose: postgres → migrate → api ← site and admin nginx, with ports 8080 and 8081 and the internal network
  3. the steps (Tasks 2–5 below, in order)
  4. check-yourself commands with expected output (copied from each task)
  5. what to paste for review (Task 6)
  6. common mistakes: `COPY . .` before installing dependencies (cache busted), running as root, `latest` tags, secrets in `ARG`, `$` in the argon2 hash eaten by Compose, `depends_on` without a `condition`, forgetting `apps/api/drizzle` in the runtime image, nginx `try_files` missing the `/index.html` fallback
  7. interview questions: the union of the per-file questions
- [ ] **Step 3:** Save the same text to `docs/learn/01-containers.md`. Expected: the file and the artifact match section for section.
- [ ] **Step 4: Checkpoint.** The owner reads the guide and commits. Suggested message: `docs(learn): stage 1 containers guide`.

### Task 2: `.dockerignore` starter

**Files:** Create (starter): `.dockerignore` at the repo root, since the build context is the root for every image (the pnpm workspace needs the lockfile and `packages/shared`).

- [ ] **Step 1: Claude delivers the starter.** It contains comment headers for three groups: dependencies and build output, secrets, and noise.
  - `TODO(you): list what must never enter the build context`: the hint names the categories, not the paths.
  - Five-part notes. Interview questions include "why does `.dockerignore` speed up builds" and "how can a `.env` leak into an image".
- [ ] **Step 2: Owner fills it in.** Check: `docker build --no-cache -f - . <<<'FROM busybox
COPY . /ctx
RUN find /ctx -maxdepth 2 | sort'`. Expected: no `node_modules`, `dist`, `.env`, `.git` or `coverage` in the output.

### Task 3: API Dockerfile starter (`apps/api/Dockerfile`)

**Interfaces consumed:** `pnpm --filter @pf/api build` emits `apps/api/dist/**`. The runtime needs `apps/api/drizzle/**` (the `MIGRATIONS_DIR` is resolved relative to `dist/db`) and `packages/shared/dist`. Prod start is `node dist/server.js`, listening on `0.0.0.0:$PORT` (default 3000). Readiness is `GET /readyz` → 200 or 503.

- [ ] **Step 1: Claude delivers the starter.** Its skeleton has named stages with comment banners:
  - `base`: pinned Node image and the pnpm setup line. `TODO(you): enable pnpm 12 (corepack or npm -g)`
  - `deps`: copy only the manifests and lockfile, then fetch. `TODO(you): which files must be copied so this layer is cached until a dependency changes?`
  - `build`: copy the sources, build shared then api. `TODO(you): the build command(s)`
  - `deploy`: `TODO(you): pnpm deploy --prod of @pf/api into /out` (the hint names the flag question from Reconsider 3)
  - `runtime`: the base image line is given. `TODO(you): copy /out and the migrations dir; set NODE_ENV; drop to a non-root user; EXPOSE; HEALTHCHECK using node's fetch against /readyz (the image has no curl); CMD`
  - Five-part notes. Interview questions: layer caching order; why `pnpm deploy` instead of copying `node_modules`; `CMD` vs `ENTRYPOINT`; why PID 1 must handle SIGTERM (the API closes its pool on SIGTERM); why the healthcheck hits `/readyz` here but `/healthz` is the k8s liveness probe.
- [ ] **Step 2: Owner fills it in.** Checks:
  - `docker build -f apps/api/Dockerfile -t pf-api .`. Expected: success.
  - `docker image inspect pf-api --format '{{.Architecture}} {{.Config.User}}'`. Expected: `arm64` and a non-empty, non-root user.
  - `docker image ls pf-api`. Expected: under about 200 MB. Report the number, since the review compares it.
  - `docker run --rm pf-api node -e "require('@node-rs/argon2')"` (or the ESM equivalent). Expected: exit 0, proving the musl binary loads.
  - `docker run --rm pf-api ls drizzle`. Expected: the `0000_*.sql` and `0001_*.sql` migration files.

### Task 4: Web Dockerfile and nginx starters

**Files (starters):** `docker/web.Dockerfile`, `docker/nginx/common.conf` (headers), `docker/nginx/site.conf`, `docker/nginx/admin.conf`, `docker/nginx/api-proxy.conf` (Compose-only include).

**Interfaces consumed:** `pnpm --filter @pf/<app> build` emits `apps/<app>/dist` (Plans 3–4). The site's SPA routes are `/` and `/c/:code`. The admin host is wholly `noindex`.

- [ ] **Step 1: Claude delivers the starters.**
  - `web.Dockerfile`: `ARG APP` and the stage banners `deps` / `build` / `runtime`. The runtime base line is `nginxinc/nginx-unprivileged:1.29-alpine`.
    - `TODO(you): the build stage for apps/$APP`
    - `TODO(you): copy dist to the web root and the right server conf for $APP`
    - `TODO(you): site only: copy the résumé PDF into the web root as /resume.pdf` (Reconsider 9)
    - `TODO(you): HEALTHCHECK` (hint: `wget -q --spider` against a `/healthz` location you add)
  - `common.conf`:
    - `TODO(you): add_header lines` for HSTS (`max-age=63072000; includeSubDomains`, no `preload` until the domain is final), `X-Content-Type-Options`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy` (camera, microphone and geolocation off), and a `Content-Security-Policy` with `frame-ancestors 'none'`. The CSP sources follow Reconsider 4.
  - `site.conf`:
    - `listen 8080`, `server_tokens off`, `include common.conf` and `include /etc/nginx/conf.d/api-proxy*.conf` (the glob makes it optional) are given.
    - `TODO(you): long-cache for /assets/ (hashed names), no-cache for index.html`
    - `TODO(you): SPA fallback so /c/K7M4QX serves index.html`
    - `TODO(you): X-Robots-Tag noindex for /c/ only`
    - `TODO(you): /healthz location`
  - `admin.conf`: like `site.conf`, plus `TODO(you): noindex for the whole host`.
  - `api-proxy.conf`:
    - `TODO(you): location /api/ → http://api:3000, passing Host, X-Forwarded-For, X-Forwarded-Proto`
  - Five-part notes. Interview questions: why unprivileged nginx listens on 8080; `try_files` order; why hashed assets can be cached for a year; what HSTS breaks if set wrong; how CSP hashes work and why static builds make them practical.
- [ ] **Step 2: Owner fills them in.** Checks:
  - `docker build -f docker/web.Dockerfile --build-arg APP=site -t pf-site .`, and the same with `APP=admin -t pf-admin`.
  - `docker image ls | grep -E 'pf-(site|admin)'`. Expected: each about 25 MB (the spec target; ≤ 30 MB passes).
  - `docker run --rm -p 8080:8080 pf-site`, then `curl -sI localhost:8080/c/K7M4QX`. Expected: `200`, `Content-Type: text/html`, `X-Robots-Tag: noindex`, and every security header.
  - `curl -sI localhost:8080/`. Expected: the same headers, with no `X-Robots-Tag`.
  - `docker run --rm --read-only --tmpfs /tmp pf-site`. Expected: starts cleanly (prep for Stage 2's `readOnlyRootFilesystem`).

### Task 5: `compose.yaml` starter

**Files (starter):** `compose.yaml` at the repo root; the `.env` it reads is git-ignored and written by him from `apps/api/.env.example`.

- [ ] **Step 1: Claude delivers the starter.** It has service stubs with comments for `postgres`, `migrate`, `api`, `site` and `admin`, plus a top-level `volumes:` stub.
  - `TODO(you): postgres image, env from .env, named volume, healthcheck with pg_isready`
  - `TODO(you): migrate — reuse the api image, override the command, restart: "no"`
  - `TODO(you): depends_on with the right condition on each service` (hint: `service_healthy` vs `service_completed_successfully`)
  - `TODO(you): api env_file and DATABASE_URL using the service name as host`
  - `TODO(you): site and admin build args, published ports 8080 and 8081, and the api-proxy.conf bind mount`
  - `admin:init` and `retention` are documented as `docker compose run --rm api node dist/cli/<x>.js` comments, not services.
  - Five-part notes. Interview questions: why `depends_on` alone doesn't wait for readiness; Compose's DNS and the default network; named volume vs bind mount; how `$` is interpolated in Compose files; why `migrate` is a separate one-shot instead of running at API start.
- [ ] **Step 2: Owner fills it in.** Checks:
  - `docker compose config >/dev/null && echo ok`. Expected: `ok`.
  - `docker compose run --rm api node -e "console.log(process.env.ADMIN_PASSWORD_HASH.slice(0,10))"`. Expected: `$argon2id$`.

### Task 6: Review gate

- [ ] **Step 1: Owner pastes:** all six files, the output of every check in Tasks 2–5, `docker image ls | grep pf-`, and `docker compose ps -a` after `up`.
- [ ] **Step 2: Claude reviews against this checklist, explaining every fix:**
  - multi-stage everywhere, and the final stages carry no build tools or pnpm store
  - non-root `USER` in all three images, and `arm64` in `inspect`
  - layer order caches dependencies, and `.dockerignore` keeps out `.env`, `node_modules`, `dist` and `.git`
  - the API uses `pnpm deploy --prod`, includes the `drizzle/` dir, uses exec-form `CMD` (so SIGTERM reaches Node) and has a healthcheck on `/readyz`
  - no secrets in `ARG`/`ENV`/layers: `docker history --no-trunc pf-api` shows none
  - the nginx images are about 25 MB, the headers are present on every response including 404s (`always`), the CSP matches Reconsider 4, the `/c/*` fallback works, and noindex is set on `/c/*` and the whole admin host
  - Compose has `condition:` on every `depends_on`, a Postgres healthcheck, a named volume, the argon2 hash surviving interpolation (`$$` or single quotes), and api not published to the host
  - pinned image tags (no `latest`)
- [ ] **Step 3:** The owner applies the fixes and re-pastes until the review is clean.

### Task 7: Acceptance and retiring the `docker run` Postgres

- [ ] **Step 1:** `docker rm -f pf-pg` (Plan 1's dev database), then `docker compose up -d --build`. Expected: `docker compose ps -a` shows `migrate` `Exited (0)` and `postgres`, `api`, `site` and `admin` `healthy`.
- [ ] **Step 2:** `docker compose run --rm api node dist/cli/admin-init.js`. Expected: a QR and 10 recovery codes on first run; on a re-run, "already exists" with exit 1.
- [ ] **Step 3: End-to-end checks:**
  - `curl -s localhost:8080/api/site | head -c 60`. Expected: JSON starting `{"profile":`.
  - In a browser, `http://localhost:8080/c/<a real code>` shows the greeting, and `http://localhost:8081` signs in with password plus TOTP.
  - After one page view, `docker compose exec postgres psql -U postgres -c 'select count(*) from visits'` returns ≥ 1 (the beacon passed through nginx to the API).
- [ ] **Step 4:** `docker compose down && docker compose up -d`. Expected: the data persists (same invite still resolves). `docker compose down -v` wipes it, and he can say why.
- [ ] **Step 5:** The README's dev section changes from `docker run postgres:17` to `docker compose up`. Claude edits the README because it is documentation, not infra.
- [ ] **Step 6: Checkpoint.** The owner commits. Suggested message: `feat(infra): stage 1 containers with compose`.

## Done when

- `docker compose up -d --build` from a clean clone (plus his `.env`) runs all five services; site, admin and API work end to end through nginx.
- All three images are arm64, non-root and multi-stage. The nginx images are about 25 MB.
- The review gate is clean, the guide artifact and `docs/learn/01-containers.md` exist, and he can answer the interview questions without notes.
