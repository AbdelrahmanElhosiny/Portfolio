# Portfolio: design

Date: 2026-11-11. Status: approved in conversation, ready for a plan.
Companion page: "Portfolio Stack Picks" artifact (https://claude.ai/artifact/Te8hTPtCTtWUofbFiNuZSe).
Origin: "Developer portfolio: build spec" (Nov 8, 2026, Next.js on Vercel). This design replaces its platform choices and keeps its product ideas.

## 1. Intent

The project serves two purposes:

- **Show the work.** A polished one-page portfolio that recruiters open from a personal invite link. The owner can see who opened it and what they looked at.
- **Learn and prove the craft.** The owner is a frontend developer who has also done backend and DevOps. He knows Linux and Docker well and Kubernetes about halfway. He is now learning networking, CI/CD and AWS, which are part of his new career direction. This project is where he practises them for real. The repo and the running system are themselves evidence for recruiters.

The work is also a course. Claude writes the application code. The owner does the infrastructure steps himself, starting from a starter file Claude provides, and Claude reviews each step.

## 2. Goals, non-goals, anti-goals

**Goals**

- The public site is a single-scroll SPA that feels impressive on phones and desktops.
- The backend is a fully separate API service, its own container, talking to the frontends only over HTTP.
- The admin app lets him:
  - create and customise invites
  - choose what each invited visitor sees
  - track visits section by section
  - edit the site's content
- Everything runs on AWS: one small k3s server built with Terraform, deployed by GitHub Actions plus Flux.
- Every step ships something that works, and comes with a learning guide artifact.
- A recruiter can read the README, the CI history and the infra folder and see real skill.

**Non-goals**

- High availability, multiple nodes, multiple regions.
- Large traffic. Expect tens of visitors a day.
- A general CMS. The content editor covers only this site's sections.
- Third-party analytics, ads or session recording.

**Anti-goals.** These would make the project a failure even if it technically works:

- Infrastructure Claude wrote and he only copied. He must be able to explain every infra file.
- Spending past about $11/mo while on credits, or any surprise bill. An AWS Budget alarm is mandatory.
- Overclaiming on the CV. Say "single-node k3s on EC2", not "production Kubernetes".
- A visitor's scroll or tap held hostage by effects. No scroll snap, and no loader in front of the hero.
- Complexity that stalls progress. If a step takes more than a week, cut scope.

## 3. Constraints

- **Budget.** Roughly $11/month total, paid from new-account AWS credits:
  - EC2 t4g.small spot: about $5.60
  - public IPv4: $3.65
  - EBS: about $1.60
  - Route 53 hosted zone: $0.50

  New accounts get $100 at sign-up plus up to $100 for five setup activities. He must upgrade to the paid plan before the free plan's 6 months end, or the account is suspended. Credits last up to 12 months from sign-up. After that, he either pays about $11 or shuts the server down and rebuilds it from code for demos. A server that is usable for only a year or less is acceptable to the owner. The domain costs about $12–16/yr and is probably not covered by credits.
- **Memory.** 2 GB on the node. Budget for:
  - k3s: about 500 MB
  - Traefik, cert-manager and Flux: about 300 MB together
  - Postgres: about 150 MB
  - the API: about 120 MB
  - two nginx containers: about 20 MB

  Nothing heavy runs in the cluster: no Argo CD full mode, no Prometheus stack.
- **AWS only.** No other clouds (the owner rejected an Oracle hybrid). GitHub (code, Actions, GHCR) is allowed since it is the code host.
- **Architecture.** Two separate CPU types matter: the server is ARM (Graviton), the owner's Mac is Apple Silicon. Images are built for linux/arm64. Add amd64 only if needed.
- **Learning first.** Use plain manifests before Helm, and console clicks before Terraform, wherever that teaches more.

## 4. Architecture

```
Visitor ─(1 DNS)─> Route 53
Visitor ─(2 HTTPS)─> Elastic IP ─> EC2 t4g.small spot (VPC, public subnet, SG 80/443 in)
                                     └ k3s
                                        ├ Traefik (bundled): host/path routing, TLS via cert-manager (Let's Encrypt)
                                        │    yourname.dev        -> site  (nginx, static Vite build)
                                        │    admin.yourname.dev  -> admin (nginx, static Vite build)
                                        │    */api/*             -> api   (Node.js + Fastify)
                                        ├ Postgres StatefulSet (data on a separate EBS volume)
                                        ├ CronJobs: nightly pg_dump -> S3, nightly retention cleanup
                                        └ Flux: watches the repo's deploy/ folder, applies changes
Change: git push -> GitHub Actions (lint, test, build arm64 images, Trivy scan) -> GHCR
        -> Actions commits the new image tag to deploy/ -> Flux pulls and rolls out
```

**Components and picks**

| Area | Pick | Notes |
|---|---|---|
| Public site | React 19 + TypeScript + Vite, static build | Same stack as A-Store. Built files are served by nginx (non-root, about 25 MB image). |
| Scroll effects | GSAP ScrollTrigger + Motion | Rules from the original spec's cookbook, section 9. |
| Admin | Separate small React + Vite app at `admin.<domain>` | Visitors never download admin code. Shared UI and types come from a workspace package. |
| API | Node.js 22 LTS + TypeScript + Fastify | JSON over HTTP. Zod schemas shared with the frontends (`packages/shared`). |
| Database | PostgreSQL 17 + Drizzle ORM | SQL migrations run as a Kubernetes Job before each API rollout. |
| Monorepo | pnpm workspaces | `apps/site`, `apps/admin`, `apps/api`, `packages/shared`. Infra lives in `infra/` and `deploy/`. |
| Containers | Docker multi-stage, non-root, linux/arm64 | Docker Compose for local dev. |
| Kubernetes | k3s on the server, k3d on the Mac | Same distribution in both places. |
| Ingress / TLS | Traefik (bundled with k3s) + cert-manager, Let's Encrypt HTTP-01 | ingress-nginx retired in March 2026, so Traefik. Standard `Ingress` objects; Gateway API is a stretch lesson. |
| Deploys | Flux (GitOps) | Lighter than Argo CD. CI never holds cluster credentials. Rollback is `git revert`. |
| Packaging | Plain YAML first, then a Helm chart | The chart is applied by Flux's HelmRelease, or Kustomize, the builder's choice. |
| Registry | GHCR, public images | No pull secret is needed. |
| CI | GitHub Actions | Jobs: lint, typecheck, unit tests, image build with cache, Trivy scan (fail on HIGH/CRITICAL with a fix available), push, bump tag. |
| IaC | Terraform, state in S3 with native lockfile | Covers VPC, subnet, route table, IGW, security group, launch template, Auto Scaling group, EBS, Elastic IP, Route 53, S3, IAM. |
| Spot handling | Auto Scaling group of exactly 1, spot, pinned to one AZ, the same AZ as the data EBS volume (my call) | On boot, user-data attaches the data volume, associates the Elastic IP, and starts k3s with a fixed `--node-name`. k3s state and Postgres data both live on that volume, so a replacement instance resumes. |
| DNS | Domain from the cheapest registrar; NS records delegated to a Route 53 hosted zone that Terraform manages (my call) | The delegation is itself a DNS lesson. TLS stays on HTTP-01. |
| Server access | SSM Session Manager | Port 22 stays closed. |
| Secrets | Kubernetes Secrets encrypted in git with SOPS + age (Flux decrypts natively) | (my call: chose SOPS over Sealed Secrets because Flux supports it natively and it needs no extra controller.) |
| CI to AWS | GitHub OIDC to an IAM role | No long-lived keys. Used for Terraform plan and S3 access. |
| Backups | Nightly `pg_dump` CronJob to S3 | 30-day lifecycle on the bucket. A restore drill is documented in a runbook. |
| Monitoring | Health probes and `kubectl` first; Grafana Cloud free + Alloy agent in stage 8 | Only if memory allows; otherwise an external uptime check plus a CloudWatch alarm on the instance. |

The site and admin talk to the API on their own origin (`/api` via Traefik path routing), so no CORS is needed. The admin session cookie is host-only on `admin.<domain>`.

## 5. Product scope (v1)

### Public page

Sections from top to bottom. Layout and visual style come later, from a mockup session with the owner. Until then, build plain but good-looking placeholders that follow the cookbook rules.

0. Sticky top bar: name, section progress, a résumé button (static PDF in v1).
1. **Welcome:** a placeholder for now. Name, role line, one-line pitch, two buttons, and a greeting slot ("Hi Sam, thanks for taking a look.") for invited visitors. Readable within 1.5 s on a mid-range phone; a still version under reduced motion.
2. **About:** his path as a timeline: frontend → backend → DevOps → frontend with a wider view.
3. **Tech stack:** grouped chips with an honest level: daily, comfortable, familiar.
4. **Projects:** A-Store first:
   - a before/after compare slider
   - links to the classic and AI-enhanced versions, the repo, and the `v1-classic` tag
   - three real numbers
   - other projects as smaller cards
5. **How this site runs:** (new) a simplified architecture diagram, with links to the repo, CI and infra folders.
6. **Contact:** LinkedIn and email for everyone. Phone and WhatsApp only when the invite allows them. WhatsApp uses a `wa.me` link with a pre-filled message naming the code.
7. **Footer:** on invite links only: "This link is personal to you. I see when it is opened so I can follow up." Plus a link to the source.

All content (text, projects, contacts, section visibility) comes from the API, which reads it from Postgres.

**Visibility is enforced on the server (my call).**
- `GET /api/site?code=X` returns only what that invite may see. Hidden phone, WhatsApp, sections and projects are never sent to the browser.
- nginx serves `index.html` for `/c/*`, the usual single-page-app fallback.
- Unknown, blocked or locked-out codes get the same public payload, and the page renders identically. Admins edit it; a seed migration loads the first version.

### Admin v1

- **Sign-in:** password (argon2id hash from an env secret) plus a TOTP code from an authenticator app. Sessions are server-side in the `admin_sessions` table, with an httpOnly, Secure, SameSite=Strict cookie and a 7-day lifetime (my call). Login lockout: 5 failures per IP in 15 minutes locks that IP for 15 minutes.
- **Admin bootstrap (my call):** a one-off CLI, `pnpm admin:init`, which runs as a Kubernetes Job in prod.
  - It creates the admin from the env password hash.
  - It generates the TOTP secret and prints the otpauth QR in the terminal once.
  - It prints 10 one-time recovery codes, stored hashed in Postgres.

  The canonical auth tables are `admin_sessions` and `trusted_devices`.
- **Site content:** edit profile, each section's text, projects, contact channels, and default visibility of sections and channels on the public page.
- **Invites:** create one per recipient with:
  - label (private)
  - company
  - first name
  - role applied for
  - note
  - greeting on/off
  - **visibility overrides**: which sections, projects and contact channels this person sees

  Actions: copy link, copy a ready-made message, block or unblock, delete (cascades to visits and events).
- **Visits:**
  - Per invite: a timeline of visits, each with time, device, source tag, sections reached, seconds per section, and clicks with times. Devices the link was forwarded to show as separate devices on the same code.
  - Overview: opened vs not yet opened; a funnel of opened → reached Projects → opened a demo → contacted or downloaded the résumé; visits by source.
  - A switch for "include my devices" (his devices are excluded by default).

### Tracking rules (carried over)

- Invite code:
  - 6 characters from `ABCDEFGHJKMNPQRSTUVWXYZ23456789`
  - made with a CSPRNG and rejection sampling
  - stored uppercase without dashes, shown as `K7M-4QX`
  - input is normalised: uppercase, strip spaces, hyphens and smart dashes
- Routes:
  - `/c/<code>` serves the same SPA with a greeting. An unknown, blocked or locked-out code silently shows the public page, with the same response every time.
  - Pages under `/c/*` and the whole admin host are `noindex`.
- A visit counts **only** when the page's script sends `start`. A GET by itself never counts, so link-preview bots don't count.
- Beacon: `POST /api/t`
  - `text/plain` JSON via `sendBeacon`, with `fetch` + `keepalive` as the fallback
  - event kinds: `start`, `reached`, `click`, `enter` (2 s or more on a section), `time` (active ms, flushed on hide or pagehide)
- Server responses: 403 on a foreign Origin, 413 over 4 KB, 400 on a bad body, otherwise 204; never 500. Per-device caps as in the original spec.
- Device key: an httpOnly `dk` cookie holding a random UUID, set by the API.
- Real client IP: Traefik passes `X-Forwarded-For`, and Fastify's `trustProxy` is limited to the cluster CIDR. This is a networking lesson in stage 5.
- Source tags `?s=qr|cv|msg|wa`, removed from the URL with `history.replaceState` on the first interaction.
- Guessing guard: 20 refused codes per IPv4 address or IPv6 /64 in an hour locks code lookups for that client for an hour. If the database is down, fail open to the public page.

### Data model sketch (Postgres)

- `site_content(id, key, value jsonb, updated_at)`: one row per section/block.
- `invites(id, code unique, label, company, first_name, role, note, greeting bool, visibility jsonb, blocked bool, created_at, first_opened_at, last_seen_at)`
- `visits(id uuid, invite_id null, device_key, source, started_at, last_seen_at, device jsonb, tz, referrer, active_ms, reached jsonb, parent_visit_id null)`
- `events(id bigserial, visit_id, kind, section, target, active_ms, at)`
- `admin_sessions(id, device_key, created_at, expires_at)` and `trusted_devices(device_key, label, created_at)`
- `admin(id, password_hash, totp_secret_enc, created_at)` and `recovery_codes(id, code_hash, used_at)`
- `hits(id, at, path, class, code_attempt, ip, ua)`: guard counting and the bad-code log.
- Indexes:
  - `invites.code` (unique)
  - `visits(invite_id, started_at)`
  - `events(visit_id, at)`
  - `hits(ip, at)`

Store all times in UTC. The dashboard buckets by the browser's timezone.

### Privacy and retention

- Say it twice: once in the message sent with the link, and in the footer note.
- Visitors never type anything about themselves.
- A nightly retention CronJob deletes:
  - `visits` and `events` older than 365 days
  - `hits` older than 7 days (bots) or 90 days (others)
- Raw IPs live only in `hits`.

### Security basics

- Zod validation on every body. Cap user agents at 300 characters. Check IPs with `isIP` before storing.
- Headers set at Traefik or in nginx:
  - HSTS
  - `X-Content-Type-Options`
  - `Referrer-Policy`
  - `Permissions-Policy`
  - `frame-ancestors 'none'`
  - a strict CSP (static builds make hash-based CSP practical)
- Kubernetes:
  - every pod non-root, with a read-only root filesystem where possible
  - a NetworkPolicy so only the API reaches Postgres (k3s ships a NetworkPolicy controller)
- The repo is public, including `deploy/` and `infra/` (my call). No secrets are in git except SOPS-encrypted ones.
- Credentials (my call):
  - Actions bumps the image tag in `deploy/` with a commit, using the built-in short-lived `GITHUB_TOKEN`.
  - Flux reads the public repo with no credentials.
  - AWS access from Actions goes through OIDC.
  - There are no long-lived keys anywhere.
- The security group allows only 80 and 443 in.
- The IAM role for CI is scoped to the state bucket, the backup bucket and Route 53 records.
- Before launch: one security-review pass over the API's gate, guard, beacon and admin routes.

## 6. Later (not v1)

- Printable QR interview cards (pdf-lib).
- Résumé PDF stamped per invite.
- Email or Telegram alert on first open, and a "not opened after N days" reminder (CronJob).
- A log of link-preview hits ("pasted into WhatsApp at 14:02").
- City-level location (GeoLite2).
- The final Welcome design from its own session; the optional canvas flight (cookbook H).
- Stretch labs:
  - EKS weekend: Terraform up, deploy the same chart, destroy; about $10 from credits
  - Gateway API
  - CloudFront in front of the site

## 7. Learning model

- **Claude writes (my call):** all application code (site, admin, API, migrations, seed script, `.env.example`, tests), the step guides, and a **starter file** for each infra piece.
- **The owner writes:** he finishes each starter file and runs everything:
  - Dockerfiles and Compose
  - `nginx.conf`, including the security headers and CSP
  - Kubernetes YAML and the Helm chart
  - Terraform
  - GitHub Actions workflows
  - Flux configuration
  - AWS console work, DNS and TLS
- **Review:** after each step the owner pastes his file and the check command's output. Claude reviews it, explains every fix, and only then moves to the next step.

**Every starter file is delivered with:**

1. a two- or three-line summary of what the file does
2. why it's written this way: each choice and the alternative rejected
3. what each line means, in plain words
4. what to learn from it, plus three to five interview questions he can now answer
5. his part: the marked lines or blocks to fill in (`# TODO(you): ...`), and a check command with its expected output

**Every step also gets a guide artifact:**

- what and why, in plain words
- a diagram of what is being built
- the steps
- check-yourself commands with expected output
- what to paste for review
- common mistakes
- the interview questions

Guides are published as artifacts, and their text is also kept in `docs/learn/NN-<topic>.md` in the repo.

## 8. Stage order

Each stage ships something that works on its own.

1. **App on the Mac.**
   - Claude: monorepo, site, admin, API, schema and migrations, tests, placeholder sections with real copy.
   - Owner: Dockerfiles for site, admin and api, and a Compose file with Postgres; `docker compose up` runs everything.
2. **Kubernetes on the Mac (k3d).**
   - Claude: health and readiness endpoints, config read from env.
   - Owner: Deployments, Services, Ingress, a Postgres StatefulSet with a PVC, a migration Job, a NetworkPolicy, Secrets.
3. **AWS by hand.**
   - Owner, in the console: an AWS Budget alarm first, then VPC, subnet, route table, IGW, security group, EC2 spot instance, Elastic IP, IAM role for SSM; connect with Session Manager.
   - Then delete everything.
4. **The same AWS in Terraform.**
   - Owner: rewrite stage 3 as Terraform, plus the data EBS volume, launch template, spot ASG of 1 with user-data reattach, S3 state and backup buckets.
   - `terraform destroy` and rebuild once.
5. **Live on the domain.**
   - Owner: buy the domain, create the Route 53 zone and records, install k3s via user-data, install cert-manager, set up HTTPS, deploy the YAML from stage 2.
   - Claude: proxy-aware client IP handling.
6. **CI.**
   - Owner: an Actions workflow for lint, test, arm64 builds with cache, Trivy, push to GHCR, and GitHub OIDC to AWS for Terraform plan on pull requests.
7. **CD with GitOps.**
   - Owner: turn the YAML into a Helm chart, bootstrap Flux, add SOPS secrets, and the image-tag bump from CI.
   - Claude: a deliberately broken release for him to roll back with `git revert`.
8. **Run it.**
   - Owner: the backup CronJob to S3, a timed restore drill (written runbook), the retention CronJob, monitoring and one alert, and a spot-interruption drill (terminate the instance and watch it come back with its data).
9. **Stretch.** The EKS lab, Gateway API, CloudFront; then the Welcome design session and the cookbook effects.

Stage 1 ships the public site, the admin and the API together. Tracking may land in stage 2. All of it is Claude's code (my call).

**Known limits:**
- One node in one AZ, so no high availability. An AZ outage or a spot gap means downtime until the replacement instance boots. The scroll effects (cookbook A–G) are built by Claude alongside stages 5–8 as visual work, in small slices.

## 9. Carried over from the original spec, and dropped

**Kept:**

- the invite code format and normalisation
- the routes and the identical response for every bad code
- beacon-only counting and the event kinds
- the transport and response rules
- the guessing guard
- the privacy rules and retention lengths
- the whole scroll and effects cookbook (engine rules, effects A–H, tokens, reduced motion, compatibility, browserslist pins)
- the WhatsApp link format
- the known traps that still apply (`overflow: clip`, iOS share and `wa.me` timing, no negative dashoffset)

**Dropped or replaced:**

- Next.js, Vercel, `after()`, Vercel cron → Kubernetes CronJobs
- `x-vercel-ip-*` geo headers → later, GeoLite2
- middleware.ts → the API sets cookies; the admin is a separate host
- iron-session → server-side Postgres sessions
- email 2FA → TOTP
- MongoDB and TTL indexes → Postgres and a retention CronJob
- Vercel's Atlas integration → in-cluster Postgres
- `outputFileTracingIncludes` → the résumé is a static file in v1

## 10. Calls made without the owner (check these)

- SOPS + age for secrets, instead of Sealed Secrets (my call).
- Admin session lifetime of 7 days, no "trusted devices" UI in v1 beyond excluding his devices from stats (my call).
- Node.js 22 LTS, PostgreSQL 17, Drizzle ORM, pnpm workspaces (my call).
- Static résumé PDF in v1; the per-invite stamping moves to Later (my call).
- The "How this site runs" section added to the public page (my call).
- HTTP-01 challenge for Let's Encrypt; DNS-01 via Route 53 only if wildcard certificates become useful (my call).
- Domain placeholder `yourname.dev` until the owner picks one (needed by stage 5).
- Per-invite visibility enforced on the server through `GET /api/site?code=X`, with an nginx SPA fallback for `/c/*` and the same public payload for every bad code (my call).
- Ownership split (my call):
  - Claude writes the app code, migrations, seed script and `.env.example`.
  - The owner writes the infra files from starters, including `nginx.conf` with its headers and CSP.
  - Stage 1 ships the site, admin and API together.
- Admin bootstrap through `pnpm admin:init` (a Kubernetes Job in prod) with a one-time TOTP QR and 10 hashed recovery codes. The tables are `admin_sessions` and `trusted_devices` (my call).
- Public repo including `deploy/` and `infra/`. The tag bump uses the built-in `GITHUB_TOKEN`, Flux reads the repo with no credentials, AWS access goes through OIDC, and there are no long-lived keys (my call).
- Spot ASG pinned to the data volume's AZ, k3s with a fixed `--node-name`, and k3s state plus Postgres data on the data volume. Single-AZ is accepted. Stage 8 includes an interruption drill (my call).
- Domain from the cheapest registrar, with NS records delegated to a Route 53 zone managed by Terraform. HTTP-01 stays (my call).

## 12. Pace (owner's answer)

- No deadline. About 30+ hours a week. Keep the full scope, stages 1–9 (stage 9 stays optional). Size each guide for one to three focused days of work, so every stage ends in something working.

## 11. Left to the builder

- Exact folder layout inside each app, test tooling (Vitest is the default), and lint config.
- Helm vs. Kustomize under Flux for the final packaging, as long as plain YAML comes first.
- Exact Trivy thresholds and caching strategy in CI.
- Visual style of the placeholder sections, until the mockup session.
- Whether monitoring is Grafana Cloud + Alloy or the uptime-check fallback, decided by measured memory headroom.
- How the user-data script attaches the EBS volume and Elastic IP (AWS CLI with instance-role permissions is the default).
