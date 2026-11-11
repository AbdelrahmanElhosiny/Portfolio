# Plan 1: API foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A pnpm monorepo with `packages/shared` and `apps/api`. The API serves the server-filtered public payload (`GET /api/site?code=X`), guards against code guessing, signs the admin in with password + TOTP, and lets the admin edit content and invites. Everything is tested against in-process Postgres.

**Architecture:** Fastify 5 app built by `buildApp({ db, config, now })`. The db handle is injected, so tests pass a PGlite-backed Drizzle instance and production passes node-postgres. The pure logic lives in `packages/shared` so the frontends (Plans 3–4) reuse it: code normalisation, Zod content schemas, visibility resolution, payload building and invite messages. Rate counters are `COUNT` queries over the `hits` table, with no Redis.

**Tech Stack:** Node.js ≥22 (ESM), TypeScript 6.0, Fastify 5.12, @fastify/cookie 11, Drizzle ORM 0.45 + drizzle-kit 0.31, PostgreSQL 17 (PGlite 0.5 in tests), Zod 4.6, @node-rs/argon2 2.2, otplib 13, qrcode-terminal 0.12, Vitest 5.1, tsx 4.23, ESLint 10 + typescript-eslint 8.72.

**Spec:** `docs/superpowers/specs/2026-11-11-portfolio-design.md` (sections 4, 5 and 10). Roadmap: `docs/superpowers/plans/2026-11-11-roadmap.md`.

## Reconsider before executing — APPROVED 2026-11-11 (all items)

The owner approved every item below on 2026-11-11 ("approve all, subagent-driven"). Proposals are folded into their tasks.

- **TypeScript 6.0, not 7.0:** typescript-eslint 8.72 peers on `typescript <6.1.0`. Revisit when typescript-eslint supports 7.
- **Guard lock is sliding:** the client stays locked while it has 20 or more refusals in the last 60 minutes, rather than a fixed hour from the 20th refusal.
- **Seed is not a migration file:** it runs inside `db:migrate` and inserts only into an empty table.
- **A-Store's "three real numbers" are seeded empty:** the owner fills them in through the admin.
- **`admin:init` rerun:** exits 1 with "already exists" unless `--force`. Prod: run it interactively (`kubectl run -it --rm` or `kubectl exec`) rather than as a Job, so the TOTP secret and recovery codes don't persist in pod logs (stage 2–5 proposal). (folded into Task 7)
- **Routed DB health path (folded into Task 4):** add `GET /api/health`, reusing `/readyz`'s logic (`select 1` → 200 `{"status":"ok"}`, else 503 `{"status":"db_unavailable"}`, `Cache-Control: no-store`). Reason: `/api/site` returns 200 with the public payload even when Postgres is down (fail open), and `/healthz`/`/readyz` aren't routed under `/api`, so no external check can see a DB outage. Stages 2, 5 and 8 check this path once it exists. Tests in Task 4.
- **`kind` field on links (folded into Tasks 2 and 3):** add `kind: 'demo' | 'repo' | 'other'` to the shared `Link` schema. Without it, Plans 3–4 guess demo vs repo from the hostname, and Plan 2's funnel ("opened a demo") depends on that guess.
- **`GET /api/admin/invites/:id` (folded into Task 10; proposed by Plan 4):** a single-invite read for the edit and timeline pages. Plan 1 only has the list route; Plan 4 works around it by filtering the list.
- **Plan 2 changes this plan's code:** it adds env `SITE_ORIGINS` (to `Config` and `.env.example`) and makes `GET /api/site` set the `dk` cookie. See Plan 2's Reconsider items 2–3.
- **Dev `PUBLIC_SITE_URL` (folded into Task 4):** `.env.example` should set `PUBLIC_SITE_URL=http://localhost:5173` for dev (Plan 4), or copied invite links point at the `yourname.dev` placeholder.
- **Seed name is a placeholder (`Your Name`):** the repo is public, so the owner's real name and contact details go in through the admin, not the seed. Plan 3's `FALLBACK_PAYLOAD` copies the seed strings, so it shows the placeholder until he edits `apps/site/src/fallback.ts` or the build injects it.
- **Node version:** code targets Node ≥22.12. The Mac has 26; the owner's Dockerfile picks the image (22 or 24 LTS).
- **Execution method:** subagent-driven (chosen).
- **Git baseline:** the owner runs `git init` and `npm install -g pnpm@12` before Task 1, and commits at each checkpoint.

## Global Constraints

- **Git: executors never run `git commit` or `git push`.** Each task ends with a checkpoint where the owner reviews and commits. If he asks you to commit, add no Claude/Anthropic attribution.
- **Ownership: create no Dockerfile, `compose.yaml` or `nginx.conf`.** Those are the owner's files (Plan 5).
- **Prerequisite (owner):** `npm install -g pnpm@12`. Node on the Mac is 26 and the target is Node 22 LTS, so set `"engines": { "node": ">=22.12" }` and use only APIs present in 22.
- **Versions** (caret ranges): fastify `^5.12.8`, @fastify/cookie `^11.1.5`, drizzle-orm `^0.45.4`, drizzle-kit `^0.31.11`, zod `^4.6.7`, vitest `^5.1.0`, typescript `~6.0.3`, @node-rs/argon2 `^2.2.2`, otplib `^13.6.0`, qrcode-terminal `^0.12.0`, @electric-sql/pglite `^0.5.16`, pg `^8.23.1`, tsx `^4.23.15`, eslint `^10.14.0`, typescript-eslint `^8.72.2`.
- **TypeScript is pinned to 6.0.** TS 7.0 is the latest release, but typescript-eslint 8.72 peers on `typescript <6.1.0`.
- **ESM everywhere:** `"type": "module"`, `module`/`moduleResolution` `nodenext`, relative imports end in `.js`, `strict`, `noUncheckedIndexedAccess`, `verbatimModuleSyntax`.
- **Package names:** `@pf/shared` and `@pf/api`. `@pf/shared` exports `{ "development": "./src/index.ts", "types": "./dist/index.d.ts", "default": "./dist/index.js" }`. `development` must come first: conditions resolve in key order and `tsc` always matches `types`, so with `types` first a clean typecheck would look for a `dist` that does not exist yet. Vitest sets `resolve.conditions: ["development"]`. Dev (tsx `--conditions=development`), Vitest and `tsc` (`customConditions: ["development"]`) read the source; production `node` reads `dist`.
- **Test DB:** in-process PGlite through `drizzle-orm/pglite`, with migrations and seed applied per test file. No test needs Docker.
- **Runtime DB:** `pg` Pool through `drizzle-orm/node-postgres`. Until the owner's Compose exists, use `docker run --name pf-pg -e POSTGRES_PASSWORD=dev -p 5432:5432 -d postgres:17`.
- **Ports:** api `:3000`, site `:5173` (Plan 3), admin `:5174` (Plan 4). Both Vite dev servers proxy `/api` to `http://localhost:3000`.
- **Env vars:**
  - API: `DATABASE_URL`, `TOTP_ENC_KEY` (base64 of exactly 32 bytes, used as the AES-256-GCM key), `COOKIE_SECURE` (default `true`), `TRUST_PROXY` (`false` | `true` | comma-separated CIDRs; default `false`), `PORT` (default `3000`), `PUBLIC_SITE_URL` (placeholder `https://yourname.dev`).
  - `ADMIN_PASSWORD_HASH` is read only by `admin:init`.
  - Config is parsed with Zod at startup. An invalid config exits non-zero and names the variable.
- **Cookies:**
  - Admin session `sid`: httpOnly, `SameSite=Strict`, `Path=/api/admin`, no `Domain` attribute (host-only), `Max-Age` 604800 (7 days), `Secure` set from `COOKIE_SECURE`.
  - The name `dk` is reserved for Plan 2's device cookie.
- **Invite codes:** 6 characters from `ABCDEFGHJKMNPQRSTUVWXYZ23456789`, built with `crypto.getRandomValues` and rejection sampling. Stored uppercase without dashes, displayed as `K7M-4QX`.
- **Code input normalisation:**
  - uppercase the input
  - strip all whitespace, including U+00A0 and U+202F
  - strip `-` and U+2010–U+2015 and U+2212
- **`hits.class` values:** `code_ok`, `code_refused`, `login_fail`, `bot` (`bot` is written only from Plan 2 on).
- **Client key:** an IPv4 address uses its `/32`. An IPv6 address uses its `/64`. An IPv4-mapped IPv6 (`::ffff:a.b.c.d`) counts as IPv4. Counting matches `hits.ip <<= key::cidr`.
- **Guessing guard:** a client is locked when it has ≥20 `code_refused` hits in the last 60 minutes.
  - While locked, every code lookup, even a valid one, is logged `code_refused` and gets the public payload.
  - So the lock lasts as long as the guessing continues and lifts within an hour of it stopping. This is how the plan reads the spec's "locks for an hour".
- **Login lockout:** ≥5 `login_fail` hits for the client key in the last 15 minutes returns 429 `{"error":"locked"}`. The check happens before the password is verified.
- **Bad codes:** unknown, malformed, blocked and guard-locked codes all get a response body byte-identical to `GET /api/site` with no code.
- **Fail open:** if the database fails during a lookup, the gate returns 200 with the public payload, never 5xx.
- **`/api/site` headers:** `Content-Type: application/json; charset=utf-8` and `Cache-Control: no-store`. All `/api/admin/*` responses also send `Cache-Control: no-store`.
- **Phone and WhatsApp:** never sent without a valid invite that allows them. WhatsApp link: `https://wa.me/<digits>?text=<encodeURIComponent(message with {code} → K7M-4QX)>`.
- **Time:** every timestamp column is `timestamptz` and stored in UTC. The app writes time-based rows with the injected `now()`, never the DB default, so tests can move the clock.
- **Errors:** JSON `{"error": "<snake_case>"}`. Validation failures return 400 `{"error":"invalid","issues":[...]}` (Zod issues).
- **Argon2id:** `memoryCost 19456`, `timeCost 2`, `parallelism 1`. The hash contains `$`, so `.env.example` notes it must be single-quoted (and written `$$` in Compose files).

## Review Focus

1. **One answer for every bad code.** `?code=ZZZZZZ`, `?code=abc`, a blocked invite's code and a guard-locked client's valid code must each return the exact bytes of the no-code response. Tests: Task 6.
2. **Hidden means absent.** A hidden section, project, phone or WhatsApp must be missing from the JSON keys, not present as `false`, `null` or `""`. Tests: Task 2 (pure) and Task 6 (HTTP).
3. **Database down.** A lookup with the DB closed must return 200 with the public payload: the last good one, or the seed if the cache is cold. Never 500. Tests: Task 5.
4. **IPv6 `/64` grouping.** `2001:db8:1:2::a` and `2001:db8:1:2:ffff::b` share a guard counter. `2001:db8:1:3::a` does not. Tests: Task 6 (pure, plus guard over HTTP).
5. **Messy code input.** `k7m–4qx` (en dash), ` K7M 4QX `, `k7m—4qx` (em dash), `K7M−4QX` (U+2212) and `k7m4qx` all resolve to `K7M4QX`. Tests: Task 1.

---

## File map

```
package.json  pnpm-workspace.yaml  tsconfig.base.json  eslint.config.js  .gitignore  .npmrc  .nvmrc  README.md
packages/shared/  package.json tsconfig.json tsconfig.build.json vitest.config.ts
  src/index.ts            re-exports
  src/code.ts             invite code gen / strip / normalise / format
  src/content.ts          Zod content schemas, SECTION_KEYS, ContentKey, SiteContent
  src/visibility.ts       VisibilityOverrides, resolveVisibility
  src/payload.ts          SitePayload, buildSitePayload, whatsappUrl
  src/invite.ts           InviteInput/InvitePatch schemas, InviteDto, buildInviteMessage
  test/*.test.ts
apps/api/  package.json tsconfig.json tsconfig.build.json vitest.config.ts drizzle.config.ts .env.example
  drizzle/                generated SQL migrations (drizzle-kit)
  src/config.ts           loadConfig, loadInitConfig
  src/app.ts              buildApp
  src/server.ts           process entry (pg pool, listen, SIGTERM)
  src/db/schema.ts        Drizzle tables
  src/db/client.ts        Db type, createPgDb
  src/db/paths.ts         MIGRATIONS_DIR
  src/db/seed.ts          seedIfEmpty
  src/content/seed-content.ts  SEED_CONTENT
  src/content/store.ts    ContentStore (cache + fail-open)
  src/net/client-key.ts   clientKey
  src/hits.ts             recordHit, countHits
  src/routes/health.ts  src/routes/site.ts
  src/auth/crypto.ts      encryptSecret/decryptSecret, sha256Hex
  src/auth/password.ts  src/auth/totp.ts  src/auth/recovery.ts  src/auth/sessions.ts
  src/auth/init-admin.ts  initAdmin
  src/routes/admin-auth.ts  src/routes/admin-content.ts  src/routes/admin-invites.ts
  src/cli/migrate.ts  src/cli/admin-init.ts  src/cli/hash-password.ts
  test/helpers.ts         createTestDb, testConfig, testApp
  test/*.test.ts
```

---

### Task 1: Monorepo scaffold + invite codes

**Files:**
- Create: the root files, `packages/shared/*` config, `packages/shared/src/{index,code}.ts`, `packages/shared/test/code.test.ts`, and the `apps/api` config files (`package.json`, `tsconfig*.json`, `vitest.config.ts`) with `apps/api/test/shared-import.test.ts`.

**Interfaces:**
- Produces (`@pf/shared`):
  - `CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'`
  - `randomCode(length: number): string`
  - `generateCode(): string` (6 characters)
  - `stripCodeInput(input: string): string` (uppercase + strip only, no validation)
  - `normalizeCode(input: string): string | null` (null unless the result is 6 characters from the alphabet)
  - `formatCode(code: string): string` (`'K7M4QX'` → `'K7M-4QX'`)
- Produces (root scripts):
  - `pnpm test` = `pnpm -r test`
  - `pnpm typecheck` = `pnpm -r typecheck`
  - `pnpm lint` = `eslint .`
  - `pnpm build` = `pnpm -r build`
  - `pnpm dev:api`, `pnpm db:generate`, `pnpm db:migrate`, `pnpm admin:init`, `pnpm admin:hash-password` (each `pnpm --filter @pf/api <script>`; the api scripts land in Tasks 3, 4 and 7)

- [ ] **Step 1 (owner): prerequisites.** Run `npm install -g pnpm@12` and `git init`, and check that `pnpm -v` prints `12.x`.
- [ ] **Step 2: Write the root and package config.**
  - `pnpm-workspace.yaml` lists `apps/*` and `packages/*`.
  - `.nvmrc` contains `22`.
  - `.gitignore` covers `node_modules`, `dist`, `.env`, `*.local` and `coverage`.
  - `.npmrc` contains `engine-strict=false`.
  - `tsconfig.base.json` carries the Global Constraints options plus `target es2023`, `declaration true` and `customConditions ["development"]`.
  - `eslint.config.js` is a flat config: `@eslint/js` recommended + `typescript-eslint` recommended (not type-checked), ignoring `**/dist` and `apps/api/drizzle`.
  - Each package's `vitest.config.ts` adds `development` to the resolve conditions for the node/SSR environment, keeping Vite's defaults.
  - `apps/api/package.json` depends on `"@pf/shared": "workspace:*"`.
- [ ] **Step 3: Write the failing tests** in `packages/shared/test/code.test.ts`:

```ts
test('generateCode: 6 chars from alphabet', () => { for (let i = 0; i < 2000; i++) expect(generateCode()).toMatch(/^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{6}$/) })
test('generateCode: every alphabet char appears over 20k codes', () => { /* Set of chars from 20k codes has size 31 */ })
test.each(['k7m–4qx', ' K7M 4QX ', 'k7m—4qx', 'K7M−4QX', 'k7m4qx', 'K7M-4QX', 'K7M 4QX'])('normalizeCode(%j) === K7M4QX', (s) => expect(normalizeCode(s)).toBe('K7M4QX'))
test.each(['', 'K7M4Q', 'K7M4QXX', 'K7M4Q0', 'K7M4QI', 'K7M4QL', 'K7M4QO', 'K7M4Q1'])('normalizeCode(%j) === null', (s) => expect(normalizeCode(s)).toBeNull())
test('formatCode', () => expect(formatCode('K7M4QX')).toBe('K7M-4QX'))
```

  In `apps/api/test/shared-import.test.ts`: `expect(formatCode('ABCDEF')).toBe('ABC-DEF')`, imported from `@pf/shared` while `packages/shared/dist` does not exist. This proves the `development` condition works.
- [ ] **Step 4:** Run `pnpm install && pnpm test`. Expected: FAIL, because `code.ts` does not exist yet.
- [ ] **Step 5: Implement `src/code.ts`.** Rejection sampling, the one non-obvious part:

```ts
// 31 symbols; 248 = 31*8 is the largest multiple of 31 ≤ 256 → bytes ≥248 are discarded to avoid modulo bias
export function randomCode(length: number): string {
  let out = ''
  const buf = new Uint8Array(length * 2)
  while (out.length < length) {
    crypto.getRandomValues(buf)
    for (const b of buf) { if (b < 248 && out.length < length) out += CODE_ALPHABET[b % 31] }
  }
  return out
}
```

- [ ] **Step 6:** Run `pnpm test && pnpm typecheck && pnpm lint`. Expected: all PASS, with 0 lint errors.
- [ ] **Step 7: Checkpoint.** The owner reviews and commits. Suggested message: `chore: monorepo scaffold and invite code utilities`.

---

### Task 2: Shared content schemas, visibility, payload builder

**Files:**
- Create: `packages/shared/src/{content,visibility,payload,invite}.ts`
- Test: `packages/shared/test/{content,payload,invite}.test.ts`

**Interfaces:**
- Consumes: `formatCode` (Task 1).
- Produces:
  - `SECTION_KEYS = ['about','stack','projects','howItRuns','contact'] as const`; `type SectionKey`.
    - Welcome, the top bar and the footer are always rendered, so they are not section keys.
  - `CONTENT_KEYS = ['profile','about','stack','projects','howItRuns','contact','defaults'] as const`; `type ContentKey`.
  - `contentSchemas: { [K in ContentKey]: ZodType }`; `type SiteContent = { [K in ContentKey]: z.infer<(typeof contentSchemas)[K]> }`; `siteContentSchema` (z.object of all seven).
  - The schemas below. `Link = { label: string 1–60, href: string 1–500, kind: 'demo' | 'repo' | 'other' }` (`linkKindSchema = z.enum(['demo','repo','other'])`, default `'other'`; Plan 2's funnel counts `kind: 'demo'` clicks as "opened a demo"). Strings are trimmed and must be non-empty unless marked optional.
    - `profile`: `{ name, role, pitch, resumeUrl, ctas: Link[] (max 2), greetingTemplate }`. `greetingTemplate` must contain `{firstName}`.
    - `about`: `{ title, intro, timeline: { id, phase, period, text }[] }`
    - `stack`: `{ title, groups: { name, items: { name, level: 'daily'|'comfortable'|'familiar' }[] }[] }`
    - `projects`: `{ title, items: Project[] }`
      - `Project = { id: /^[a-z0-9-]{1,40}$/, name, featured: boolean, summary, links: Link[], metrics: { label, value }[] (max 3), compare?: { before: { src, alt }, after: { src, alt } } }`
      - Project ids must be unique (refine).
    - `howItRuns`: `{ title, text, links: Link[] }`
    - `contact`: `{ title, text, linkedin: z.url(), email: z.email(), phone: /^\+[1-9]\d{6,14}$/, whatsapp: /^[1-9]\d{6,14}$/, whatsappMessage }`. `whatsappMessage` must contain `{code}`.
    - `defaults`: `{ sections: Record<SectionKey, boolean>, projects: Record<string, boolean>, channels: { phone: boolean, whatsapp: boolean } }`
  - `visibilityOverridesSchema` → `type VisibilityOverrides = { sections?: Partial<Record<SectionKey, boolean>>, projects?: Record<string, boolean>, channels?: { phone?: boolean, whatsapp?: boolean } }`
  - `type Visibility = { sections: Record<SectionKey, boolean>; isProjectVisible(id: string): boolean; phone: boolean; whatsapp: boolean }`
  - `resolveVisibility(defaults: SiteContent['defaults'], overrides: VisibilityOverrides | null): Visibility`
    - `null` means the public visitor.
    - The public visitor always gets `phone=false` and `whatsapp=false`. `defaults.channels` is the default for invites only.
    - A project missing from both maps is visible.
    - An override wins over the default.
  - `type PayloadInvite = { code: string; firstName: string; greeting: boolean; visibility: VisibilityOverrides }`
  - `type SitePayload = { profile: Omit<Profile,'greetingTemplate'>; greeting?: string; invite?: { code: string /* formatted */ }; sections: { about?: About; stack?: Stack; projects?: Projects; howItRuns?: HowItRuns; contact?: { title: string; text: string; linkedin: string; email: string; phone?: string; whatsappUrl?: string } } }`
  - `buildSitePayload(content: SiteContent, invite: PayloadInvite | null): SitePayload`
    - Key insertion order is fixed: the order above, with sections in `SECTION_KEYS` order.
    - `greeting` is present only when `invite.greeting` is true and `firstName` is non-empty. It is `greetingTemplate` with `{firstName}` replaced.
  - `whatsappUrl(digits: string, template: string, code: string): string`
  - `inviteInputSchema`:
    - `{ label: 1–80, company: 0–80, firstName: 0–40, role: 0–80, note: 0–1000, greeting: boolean (default true), visibility: visibilityOverridesSchema (default {}) }`
    - Plus `invitePatchSchema = inviteInputSchema.partial().extend({ blocked: z.boolean().optional() })`.
  - `type InviteDto = { id: number; code: string /* formatted */; label; company; firstName; role; note; greeting: boolean; visibility: VisibilityOverrides; blocked: boolean; createdAt: string; firstOpenedAt: string | null; lastSeenAt: string | null; link: string; message: string }` (times are ISO strings).
  - `buildInviteMessage(input: { firstName: string; code: string }, siteUrl: string): { link: string; message: string }`
    - `link = ${siteUrl}/c/${formatCode(code)}?s=msg`
    - `message`, exact copy: `Hi ${firstName || 'there'}, here is my portfolio: ${link}\nThis link is personal to you. I see when it is opened so I can follow up.`

- [ ] **Step 1: Write the failing tests.** Use a `fixtureContent(): SiteContent` in the test file with two projects (`a-store`, `other`).

```ts
test('public payload has no phone/whatsapp keys', () => { const p = buildSitePayload(c, null); expect(Object.keys(p.sections.contact!)).toEqual(['title','text','linkedin','email']); expect(p).not.toHaveProperty('invite'); expect(p).not.toHaveProperty('greeting') })
test('defaults.channels true still hidden for public', ...)        // set defaults.channels.phone=true → public contact has no 'phone' key
test('hidden section key is absent', ...)                           // defaults.sections.stack=false → !('stack' in p.sections)
test('hidden project is absent from items', ...)                    // overrides.projects.other=false → items.map(i=>i.id) toEqual ['a-store']
test('invite allows whatsapp', ...)                                 // whatsappUrl === 'https://wa.me/201000000000?text=' + encodeURIComponent(template.replace('{code}','K7M-4QX'))
test('greeting only with greeting=true and firstName', ...)          // 'Hi Sam, thanks for taking a look.'; firstName '' → no key
test('invite.code is formatted', ...)                               // { code: 'K7M-4QX' }
test('payload JSON is deterministic', ...)                          // JSON.stringify(build(c,null)) === JSON.stringify(build(structuredClone(c),null))
test('contentSchemas reject greetingTemplate without {firstName} and duplicate project ids', ...)
test('Link.kind defaults to other and rejects unknown kinds', ...)   // parse {label,href} → kind 'other'; kind 'video' → fails
test('buildInviteMessage exact copy', ...)                          // firstName '' → starts 'Hi there,' ; link 'https://yourname.dev/c/K7M-4QX?s=msg'
```

- [ ] **Step 2:** Run `pnpm --filter @pf/shared test`. Expected: FAIL (missing modules).
- [ ] **Step 3: Implement the four modules** with the signatures above. Re-export them from `src/index.ts`.
- [ ] **Step 4:** Run `pnpm --filter @pf/shared test && pnpm typecheck`. Expected: PASS.
- [ ] **Step 5: Checkpoint.** The owner reviews and commits. Suggested message: `feat(shared): content schemas, visibility and payload builder`.

---

### Task 3: Database schema, migrations, seed, test harness

**Files:**
- Create: `apps/api/src/db/{schema,client,paths,seed}.ts`, `apps/api/src/content/seed-content.ts`, `apps/api/drizzle.config.ts`, `apps/api/drizzle/*` (generated), `apps/api/src/cli/migrate.ts`, `apps/api/test/helpers.ts`
- Test: `apps/api/test/db.test.ts`

**Interfaces:**
- Consumes: `SiteContent`, `siteContentSchema`, `CONTENT_KEYS` (Task 2).
- Produces:
  - Tables in `schema.ts` (`snake_case` columns, camelCase TS fields):
    - `siteContent(id serial pk, key text unique not null, value jsonb not null, updated_at timestamptz not null)`
    - `invites(id serial pk, code char(6) unique not null, label text not null, company text not null default '', first_name …'', role …'', note …'', greeting bool not null default true, visibility jsonb not null default '{}', blocked bool not null default false, created_at timestamptz not null, first_opened_at timestamptz null, last_seen_at timestamptz null)`
    - `visits(id uuid pk default gen_random_uuid(), invite_id int null → invites.id ON DELETE CASCADE, device_key uuid not null, source text null, started_at, last_seen_at timestamptz not null, device jsonb not null default '{}', tz text null, referrer text null, active_ms int not null default 0, reached jsonb not null default '{}', parent_visit_id uuid null → visits.id ON DELETE SET NULL)`, index `visits_invite_started_idx(invite_id, started_at)`
    - `events(id bigserial pk, visit_id uuid not null → visits.id ON DELETE CASCADE, kind text not null, section text null, target text null, active_ms int null, at timestamptz not null)`, index `events_visit_at_idx(visit_id, at)`
    - `adminSessions(id text pk /* sha256 hex of the token */, device_key uuid null, created_at, expires_at timestamptz not null)`
    - `trustedDevices(device_key uuid pk, label text not null, created_at timestamptz not null)`
    - `admin(id int pk /* always 1 */, password_hash text not null, totp_secret_enc text not null, created_at timestamptz not null)`
    - `recoveryCodes(id serial pk, code_hash text unique not null, used_at timestamptz null)`
    - `hits(id bigserial pk, at timestamptz not null, path text not null, class text not null, code_attempt text null, ip inet null, ua text null)`, index `hits_ip_at_idx(ip, at)`
  - `type Db = PgDatabase<PgQueryResultHKT, typeof schema>` and `createPgDb(url: string): { db: Db; close(): Promise<void> }` in `client.ts`
  - `MIGRATIONS_DIR = fileURLToPath(new URL('../../drizzle', import.meta.url))` in `paths.ts`. It resolves the same way from `src/db` and `dist/db`.
  - `SEED_CONTENT: SiteContent`
  - `seedIfEmpty(db: Db, now: Date): Promise<boolean>` inserts one row per `CONTENT_KEYS` entry only when `site_content` has no rows, and returns whether it inserted.
  - `test/helpers.ts`: `createTestDb(): Promise<{ db: Db; client: PGlite }>` (in-memory PGlite, `drizzle-orm/pglite/migrator` `migrate` from `MIGRATIONS_DIR`, then `seedIfEmpty`)
  - API scripts:
    - `db:generate` = `drizzle-kit generate`
    - `db:migrate` = `tsx --conditions=development src/cli/migrate.ts`
    - In prod, `node dist/cli/migrate.js`. That is what the migration Job runs: node-postgres migrator, then `seedIfEmpty`, then exit 0.

**Seed copy** (`SEED_CONTENT`; real but placeholder copy that the owner edits in the admin later):
- `profile`:
  - name `Your Name` (placeholder; the owner sets his real name in the admin, so no personal data is committed to the public repo)
  - role `Frontend developer who also ships the backend and the infrastructure`
  - pitch `I build fast, polished interfaces — and I can run them in production.`
  - resumeUrl `/resume.pdf`
  - ctas `[{See my work, #projects, other}, {Get in touch, #contact, other}]`
  - greetingTemplate `Hi {firstName}, thanks for taking a look.`
- `about`:
  - title `How I got here`
  - intro `Every step widened what I can own end to end.`
  - timeline phases `Frontend`, `Backend`, `DevOps`, `Frontend, with a wider view` (period `—` for now; one sentence each)
- `stack`: groups
  - `Frontend`: React daily, TypeScript daily, Vite daily, MUI comfortable, Redux comfortable
  - `Backend`: Node.js comfortable, Fastify familiar, PostgreSQL comfortable
  - `Infra`: Linux daily, Docker daily, Kubernetes familiar, AWS familiar, Terraform familiar, GitHub Actions familiar
- `projects`:
  - `a-store` (featured; links Classic (`demo`) / AI-enhanced (`demo`) / Repo (`repo`) / `v1-classic` tag (`repo`), all `#` placeholders; `metrics: []` until the owner supplies the three real numbers)
  - `portfolio` (`This site`, links to the repo, `#`, kind `repo`)
- `howItRuns`: title `How this site runs`, two sentences naming single-node k3s on EC2, GitHub Actions and Flux; links Repo / CI / Infra as `#`, all kind `repo`
- `contact`:
  - linkedin `https://www.linkedin.com/in/yourname`
  - email `hello@yourname.dev`
  - phone `+10000000000`
  - whatsapp `10000000000`
  - whatsappMessage `Hi, I'm following up on your portfolio (code {code}).`
- `defaults`: every section `true`, `projects: {}`, channels `{ phone: false, whatsapp: false }`

Steps:

- [ ] **Step 1: Write the failing tests** in `test/db.test.ts`:

```ts
test('migrations create all tables', ...)        // select table_name from information_schema.tables where table_schema='public' ⊇ the 9 tables
test('seed inserts 7 rows once', ...)            // seedIfEmpty → true, count 7; second call → false, count 7
test('SEED_CONTENT is valid', () => expect(siteContentSchema.parse(SEED_CONTENT)).toEqual(SEED_CONTENT))
test('invite delete cascades to visits and events', ...)   // insert invite → visit → event; delete invite; both counts 0
test('hits.ip <<= cidr works for /64', ...)       // insert '2001:db8:1:2::a'; select count where ip <<= '2001:db8:1:2::/64' → 1
```

- [ ] **Step 2:** Run `pnpm --filter @pf/api test test/db.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement `schema.ts`,** then run `pnpm db:generate`. Expected: one `drizzle/0000_*.sql` that creates the 9 tables and 4 indexes.
- [ ] **Step 4: Implement** `client.ts`, `paths.ts`, `seed-content.ts`, `seed.ts`, `cli/migrate.ts` and `test/helpers.ts`.
- [ ] **Step 5:** Run `pnpm --filter @pf/api test && pnpm typecheck`. Expected: PASS.
- [ ] **Step 6: Checkpoint.** The owner reviews `drizzle/0000_*.sql` and commits. Suggested message: `feat(api): database schema, migrations and seed`.

---

### Task 4: Config, app factory, health probes, `.env.example`

**Files:**
- Create: `apps/api/src/{config,app,server}.ts`, `apps/api/src/routes/health.ts`, `apps/api/.env.example`, `README.md` (a "Local dev" section only)
- Test: `apps/api/test/config.test.ts`, `apps/api/test/health.test.ts`

**Interfaces:**
- Consumes: `Db`, `createPgDb`, `createTestDb` (Task 3).
- Produces:
  - `type Config = { databaseUrl: string; totpEncKey: Buffer; cookieSecure: boolean; trustProxy: boolean | string[]; port: number; publicSiteUrl: string }`
  - `loadConfig(env: Record<string, string | undefined>): Config` throws `Error` whose message names each invalid variable.
  - `loadInitConfig(env): { databaseUrl: string; totpEncKey: Buffer; adminPasswordHash: string }` (the hash must start with `$argon2id$`)
  - `type AppDeps = { db: Db; config: Config; now?: () => Date; logger?: boolean }`
  - `buildApp(deps: AppDeps): Promise<FastifyInstance>`
    - Registers @fastify/cookie, `trustProxy: config.trustProxy`, and every route plugin.
    - Decorates `app.deps` with `{ db, config, now }`, where `now` defaults to `() => new Date()`.
  - `test/helpers.ts` adds:
    - `testConfig(overrides?: Partial<Config>): Config` (fixed 32-byte key, `cookieSecure: false`, `publicSiteUrl: 'https://yourname.dev'`)
    - `testApp(opts?: { now?: () => Date; config?: Partial<Config> }): Promise<{ app: FastifyInstance; db: Db; client: PGlite }>`
  - `GET /healthz` → 200 `{"status":"ok"}`, with no DB call.
  - `GET /readyz` → 200 `{"status":"ok"}` after `select 1`, otherwise 503 `{"status":"db_unavailable"}`.
  - `GET /api/health` → same check and bodies as `/readyz` (one shared `checkDb(db): Promise<boolean>` in `routes/health.ts`), plus `Cache-Control: no-store`. It lives under `/api` so the Ingress exposes it to external uptime checks (stages 2, 5, 8); `/healthz` and `/readyz` stay unrouted for kubelet probes.
  - `server.ts` loads `loadConfig(process.env)` and `createPgDb`, listens on `0.0.0.0:${port}`, and on `SIGTERM`/`SIGINT` closes the app and then the pool.
  - API scripts:
    - `dev` = `tsx watch --env-file=.env --conditions=development src/server.ts`
    - `build` = `tsc -p tsconfig.build.json`
    - `start` = `node dist/server.js`
    - `test` = `vitest run`
    - `typecheck` = `tsc --noEmit`

- [ ] **Step 1: Write the failing tests:**

```ts
test('loadConfig defaults', ...)        // minimal env → cookieSecure true, trustProxy false, port 3000
test('TRUST_PROXY parses', ...)         // 'true' → true; '10.42.0.0/16,10.43.0.0/16' → ['10.42.0.0/16','10.43.0.0/16']; 'nonsense' → throws /TRUST_PROXY/
test('TOTP_ENC_KEY must be 32 bytes', ...)   // base64 of 16 bytes → throws /TOTP_ENC_KEY/
test('loadInitConfig rejects non-argon2id hash', ...)   // '$2b$10$…' → throws /ADMIN_PASSWORD_HASH/
test('/healthz 200', ...)
test('/readyz 200 then 503 after client.close()', ...)
test('/api/health 200 with no-store, then 503 db_unavailable after client.close()', ...)
```

- [ ] **Step 2:** Run `pnpm --filter @pf/api test`. Expected: the new tests FAIL.
- [ ] **Step 3: Implement** the modules above. In `.env.example`, list every env var with a one-line comment. Use `COOKIE_SECURE=false` (note: Safari refuses `Secure` cookies on `http://localhost`) and the `docker run` `DATABASE_URL` `postgres://postgres:dev@localhost:5432/postgres`. Set `PUBLIC_SITE_URL=http://localhost:5173` for dev, with a comment that prod uses `https://<domain>` (otherwise copied invite links point at the `yourname.dev` placeholder). Give the commands for generating `TOTP_ENC_KEY` (`openssl rand -base64 32`) and the hash (`pnpm admin:hash-password`), and the single-quote rule for `$`. The README's "Local dev" section covers the prerequisites, the `docker run` line, `cp apps/api/.env.example apps/api/.env`, `pnpm db:migrate` and `pnpm dev:api`.
- [ ] **Step 4:** Run `pnpm test && pnpm typecheck && pnpm lint`. Expected: PASS.
- [ ] **Step 5: Checkpoint.** The owner reviews and commits. Suggested message: `feat(api): config, app factory and health probes`.

---

### Task 5: Content store + public `GET /api/site` (no code yet)

**Files:**
- Create: `apps/api/src/content/store.ts`, `apps/api/src/routes/site.ts`
- Test: `apps/api/test/site-public.test.ts`

**Interfaces:**
- Consumes: `buildSitePayload`, `siteContentSchema` (Task 2); `SEED_CONTENT`, `Db` (Task 3); `buildApp` (Task 4).
- Produces:
  - `class ContentStore { constructor(db: Db); get(): Promise<SiteContent>; invalidate(): void }`
    - `get()` reads all `site_content` rows and validates them with `siteContentSchema`, then caches the result until `invalidate()`.
    - If the read or the validation fails, it returns the last good value, or `SEED_CONTENT` if none, and logs a warning. It never throws.
  - `app.deps.content: ContentStore`, created in `buildApp`.
  - `GET /api/site` → 200 with `JSON.stringify(buildSitePayload(content, null))` and the Global Constraints headers. Task 6 adds `?code`.

- [ ] **Step 1: Write the failing tests:**

```ts
test('public payload equals buildSitePayload(SEED_CONTENT, null)', ...)  // res.body === JSON.stringify(buildSitePayload(SEED_CONTENT, null))
test('headers', ...)                    // content-type 'application/json; charset=utf-8', cache-control 'no-store'
test('DB down, warm cache → same body', ...)    // first request, then client.close(), second request → 200 and identical body
test('DB down, cold cache → seed payload 200', ...)   // close before first request → 200, body === JSON.stringify(buildSitePayload(SEED_CONTENT, null))
test('invalid row → last good', ...)    // update site_content set value='{}' where key='about'; store.invalidate(); body unchanged
```

- [ ] **Step 2:** Run the tests. Expected: FAIL.
- [ ] **Step 3: Implement** `store.ts` and `routes/site.ts`.
- [ ] **Step 4:** Run `pnpm --filter @pf/api test`. Expected: PASS.
- [ ] **Step 5: Checkpoint.** The owner reviews and commits. Suggested message: `feat(api): public site payload with fail-open content cache`.

---

### Task 6: Invite gate + guessing guard

**Files:**
- Create: `apps/api/src/net/client-key.ts`, `apps/api/src/hits.ts`
- Modify: `apps/api/src/routes/site.ts`
- Test: `apps/api/test/client-key.test.ts`, `apps/api/test/site-gate.test.ts`

**Interfaces:**
- Consumes: `normalizeCode` (Task 1); `buildSitePayload`, `PayloadInvite` (Task 2); `hits`, `invites` (Task 3); `ContentStore` (Task 5).
- Produces:
  - `clientKey(ip: string): string | null` returns `'a.b.c.d/32'` or `'xxxx:xxxx:xxxx:xxxx::/64'`, or null when `isIP(ip) === 0`.
  - `type HitClass = 'code_ok' | 'code_refused' | 'login_fail' | 'bot'`
  - `recordHit(db: Db, hit: { at: Date; path: string; class: HitClass; codeAttempt?: string; ip: string; ua?: string }): Promise<void>`
    - Stores the IPv4 form for IPv4-mapped addresses and `null` for an invalid ip.
    - Caps `ua` to 300 characters and `codeAttempt` to 32.
    - Swallows DB errors.
  - `countHits(db: Db, key: string, cls: HitClass, since: Date): Promise<number>` (`ip <<= key::cidr and class = cls and at > since`)
  - Route flow for `GET /api/site?code=X`, where `ip = request.ip`:
    1. No `code` param: public payload.
    2. `key = clientKey(ip)`. If `key` is set and `countHits(key,'code_refused', now-60min) ≥ 20`: record `code_refused`, return public.
    3. `normalizeCode(code)` is null: record `code_refused`, return public.
    4. Look up the invite. Not found or `blocked`: record `code_refused`, return public.
    5. Otherwise: record `code_ok`, return `buildSitePayload(content, { code, firstName, greeting, visibility })`.
    6. Any thrown error in steps 2–5: return public. Never 5xx.
  - Every public result is the identical body string produced in Task 5. Every request that carries `?code` (good or bad) sends `X-Robots-Tag: noindex`, so headers never reveal whether a code exists.

- [ ] **Step 1: Write the failing tests.** `client-key.test.ts`:

```ts
test.each([
  ['203.0.113.7', '203.0.113.7/32'],
  ['::ffff:203.0.113.7', '203.0.113.7/32'],
  ['2001:db8:1:2::a', '2001:db8:1:2::/64'],
  ['2001:db8:1:2:ffff:ffff:ffff:b', '2001:db8:1:2::/64'],
  ['2001:db8::1', '2001:db8:0:0::/64'],
  ['::1', '0:0:0:0::/64'],
])('clientKey(%s)', (ip, key) => expect(clientKey(ip)).toBe(key))
test('clientKey(garbage) → null', ...)
```

  `site-gate.test.ts` (use `app.inject({ url, remoteAddress })` and an injected clock):

```ts
test('valid invite → personalised', ...)       // invite.code K7M4QX firstName Sam; body.greeting 'Hi Sam, thanks for taking a look.'; body.invite.code 'K7M-4QX'
test.each(['ZZZZZZ', 'abc', '', 'K7M4Q0'])('bad code %j → byte-identical public', ...)   // body === publicBody, status 200
test('blocked invite → byte-identical public', ...)
test('override shows whatsapp; others still hidden', ...)   // visibility.channels.whatsapp=true → 'whatsappUrl' in contact, !('phone' in contact)
test('hidden section absent over HTTP', ...)    // visibility.sections.stack=false → !('stack' in body.sections)
test('guard: 20 refusals lock the client, valid code → public', ...)   // 20× ZZZZZZ from 198.51.100.9, then K7M4QX → publicBody
test('guard: lock lifts after 60 quiet minutes', ...)   // advance clock 61 min → K7M4QX personalised
test('guard groups IPv6 /64', ...)              // 20 refusals from 2001:db8:1:2::a → K7M4QX from 2001:db8:1:2:ffff::b is public; from 2001:db8:1:3::a is personalised
test('lookup with DB closed → public 200', ...)    // warm, client.close(), ?code=K7M4QX → 200 publicBody
test('hits rows written', ...)                  // after one bad and one good lookup: classes ['code_refused','code_ok'], code_attempt stored
```

- [ ] **Step 2:** Run the tests. Expected: FAIL.
- [ ] **Step 3: Implement `clientKey`.** IPv6 expansion is the only non-obvious part:

```ts
// expand '::' into the missing zero groups, then keep the first 4 groups (hex, lowercase, no leading zeros)
const [head, tail = ''] = ip.toLowerCase().split('::')
const h = head ? head.split(':') : [], t = tail ? tail.split(':') : []
const groups = ip.includes('::') ? [...h, ...Array(8 - h.length - t.length).fill('0'), ...t] : h
return groups.slice(0, 4).map(g => parseInt(g, 16).toString(16)).join(':') + '::/64'
```

  Detect IPv4-mapped input (`/^::ffff:(\d+\.\d+\.\d+\.\d+)$/i`) before expanding. Then implement `hits.ts` and the route flow.
- [ ] **Step 4:** Run `pnpm --filter @pf/api test`. Expected: PASS.
- [ ] **Step 5: Checkpoint.** The owner reviews and commits. Suggested message: `feat(api): invite gate with server-side visibility and guessing guard`.

---

### Task 7: Auth primitives + `admin:init` and `admin:hash-password` CLIs

**Files:**
- Create: `apps/api/src/auth/{crypto,password,totp,recovery,init-admin}.ts`, `apps/api/src/cli/{admin-init,hash-password}.ts`
- Test: `apps/api/test/auth-primitives.test.ts`, `apps/api/test/init-admin.test.ts`

**Interfaces:**
- Consumes: `randomCode`, `stripCodeInput` (Task 1); `admin`, `recoveryCodes` (Task 3); `loadInitConfig` (Task 4).
- Produces:
  - `crypto.ts`:
    - `encryptSecret(plain: string, key: Buffer): string` returns the format `v1.<iv b64url>.<tag b64url>.<ct b64url>`, using AES-256-GCM with a 12-byte random IV.
    - `decryptSecret(enc: string, key: Buffer): string` throws on tampering or a wrong key.
    - `sha256Hex(s: string): string`
  - `password.ts`:
    - `hashPassword(pw: string): Promise<string>` (argon2id, the Global Constraints params)
    - `verifyPassword(hash: string, pw: string): Promise<boolean>` returns false, without throwing, for a malformed hash.
  - `totp.ts` wraps otplib 13. v13's API differs from v12's `authenticator` singleton, so read its README.
    - `newTotpSecret(): string`
    - `totpUri(secret: string, account: string, issuer: string): string`
    - `verifyTotp(secret: string, token: string, at: Date): Promise<boolean>` (30 s step, ±1 step tolerance)
    - `totpAt(secret: string, at: Date): Promise<string>` (test helper, exported)
  - `recovery.ts`:
    - `generateRecoveryCodes(n = 10): string[]` returns codes formatted `XXXXX-XXXXX` from `randomCode(10)`.
    - `hashRecoveryCode(input: string): string` = `sha256Hex(stripCodeInput(input))`
  - `init-admin.ts`:
    - `class AdminExistsError extends Error`
    - `initAdmin(db: Db, opts: { passwordHash: string; encKey: Buffer; force: boolean; now: Date; issuer?: string /* default 'Portfolio' */ }): Promise<{ otpauthUri: string; recoveryCodes: string[] }>`
    - It upserts `admin` id 1, replaces all `recovery_codes` with the 10 new hashes, and runs in one transaction.
  - CLI `admin:init` (`tsx --env-file=.env --conditions=development src/cli/admin-init.ts [--force]`; prod `node dist/cli/admin-init.js`, run interactively with `kubectl run -it --rm` or `kubectl exec`, never as a Job, so the TOTP secret and recovery codes don't persist in pod logs):
    - It prints the QR from `qrcode-terminal` (`{ small: true }`), the otpauth URI, the 10 codes, and `These are shown once. Store them in your password manager.`
    - It exits 1 with `Admin already exists. Re-run with --force to rotate the TOTP secret and recovery codes.` on `AdminExistsError`.
  - CLI `admin:hash-password` prompts twice without echo, exits 1 on a mismatch, and prints the hash.

- [ ] **Step 1: Write the failing tests:**

```ts
test('encrypt/decrypt round-trip; tamper throws; wrong key throws', ...)
test('hashPassword → $argon2id$v=19$m=19456,t=2,p=1$', ...)   // verifyPassword true/false; verifyPassword('garbage','x') false
test('verifyTotp accepts ±30s, rejects ±90s and non-digits', ...)  // uses totpAt(secret, t)
test('recovery codes: 10 unique, /^[A-Z2-9]{5}-[A-Z2-9]{5}$/, hash ignores case and dash', ...)
test('initAdmin stores encrypted secret and 10 hashes', ...)   // decryptSecret(row.totpSecretEnc) appears in otpauthUri
test('initAdmin twice without force → AdminExistsError; with force → new codes replace old', ...)
```

- [ ] **Step 2:** Run the tests. Expected: FAIL.
- [ ] **Step 3: Implement** the modules and the CLIs.
- [ ] **Step 4:** Run `pnpm --filter @pf/api test`. Expected: PASS.
- [ ] **Step 5 (manual):** With the dev Postgres from `docker run` running, run `pnpm db:migrate && pnpm admin:init`. Expected: a QR in the terminal, then 10 codes. Running it again prints the "already exists" message and exits 1.
- [ ] **Step 6: Checkpoint.** The owner reviews and commits. Suggested message: `feat(api): admin auth primitives and admin:init`.

---

### Task 8: Admin sessions, login, logout, auth guard

**Files:**
- Create: `apps/api/src/auth/sessions.ts`, `apps/api/src/routes/admin-auth.ts`
- Test: `apps/api/test/admin-auth.test.ts`

**Interfaces:**
- Consumes: `verifyPassword`, `verifyTotp`, `decryptSecret`, `hashRecoveryCode`, `sha256Hex`, `totpAt` (Task 7); `recordHit`, `countHits`, `clientKey` (Task 6).
- Produces:
  - `sessions.ts`:
    - `SESSION_TTL_MS = 7 * 24 * 3600 * 1000`
    - `createSession(db: Db, now: Date, deviceKey: string | null): Promise<{ token: string; expiresAt: Date }>`: the token is 32 random bytes in base64url, and the row id is `sha256Hex(token)`.
    - `findSession(db: Db, token: string, now: Date): Promise<{ id: string } | null>` deletes the row and returns null when it has expired.
    - `deleteSession(db: Db, token: string): Promise<void>`
  - Fastify `preHandler` hook `requireAdmin` applies to every `/api/admin/*` route except `POST /api/admin/login`. A missing or invalid `sid` returns 401 `{"error":"unauthorized"}`.
  - `POST /api/admin/login`:
    - Body: `{ password: string 1–200, totp?: /^\d{6}$/, recoveryCode?: string ≤ 20 }`, exactly one of `totp` or `recoveryCode` (otherwise 400).
    - Locked: 429 `{"error":"locked"}`. Attempts while locked record no hit, so the lock lifts 15 minutes after the 5th failure.
    - Any wrong factor, or no admin row: record `login_fail`, return 401 `{"error":"invalid_credentials"}`.
    - A used recovery code counts as wrong. On success the recovery code gets `used_at = now`.
    - Success: 204 with `Set-Cookie: sid=…` (Global Constraints attributes). `device_key` is null in v1 (Plan 2 decides the `dk` link).
  - `POST /api/admin/logout` → 204, deletes the session, clears `sid`.
  - `GET /api/admin/me` → 200 `{"ok":true}`.

- [ ] **Step 1: Write the failing tests.** The setup calls `initAdmin` with a known hash and gets `totpAt` for the current injected time.

```ts
test('login ok → 204 + cookie attrs', ...)   // set-cookie matches /^sid=[^;]+; Max-Age=604800; Path=\/api\/admin; HttpOnly; SameSite=Strict$/ (cookieSecure false); no 'Domain='
test('cookieSecure true adds Secure', ...)
test('me with cookie 200, without 401', ...)
test('wrong password / wrong totp → same 401 body', ...)
test('recovery code works once', ...)        // second use → 401
test('lockout: 5 failures → 6th with correct creds 429; after 16 min → 204', ...)
test('lockout is per client key', ...)       // 5 failures from 198.51.100.9 do not lock 198.51.100.10
test('session expires after 7 days', ...)    // advance clock 7d+1s → /me 401 and row deleted
test('logout clears session', ...)           // /me afterwards 401
test('login body with both totp and recoveryCode → 400', ...)
```

- [ ] **Step 2:** Run the tests. Expected: FAIL.
- [ ] **Step 3: Implement** `sessions.ts`, `requireAdmin` and the three routes. Register them under the `/api/admin` prefix and set `Cache-Control: no-store` there.
- [ ] **Step 4:** Run `pnpm --filter @pf/api test`. Expected: PASS.
- [ ] **Step 5: Checkpoint.** The owner reviews and commits. Suggested message: `feat(api): admin sign-in with TOTP, sessions and lockout`.

---

### Task 9: Admin content routes

**Files:**
- Create: `apps/api/src/routes/admin-content.ts`
- Test: `apps/api/test/admin-content.test.ts`

**Interfaces:**
- Consumes: `contentSchemas`, `CONTENT_KEYS` (Task 2); `ContentStore.invalidate` (Task 5); `requireAdmin` (Task 8).
- Produces:
  - `GET /api/admin/content` → 200 `SiteContent` (from the DB, not the cache).
  - `PUT /api/admin/content/:key`:
    - Unknown key: 404 `{"error":"not_found"}`.
    - Body fails `contentSchemas[key]`: 400 `invalid`.
    - Otherwise: upsert with `updated_at = now`, `content.invalidate()`, return 200 with the parsed value.
    - Body limit 64 KB.
  - Test helper `loginAs(app): Promise<string>` (a cookie header) goes in `test/helpers.ts`, for reuse in Task 10 and Plan 2.

- [ ] **Step 1: Write the failing tests:**

```ts
test('requires auth', ...)                      // GET and PUT without cookie → 401
test('GET returns 7 keys', ...)
test('PUT about.title shows on public /api/site', ...)
test('PUT defaults hiding projects→a-store removes it publicly', ...)
test('PUT invalid → 400 issues; unknown key → 404; public unchanged', ...)
```

- [ ] **Step 2:** Run the tests. Expected: FAIL.
- [ ] **Step 3: Implement** the routes.
- [ ] **Step 4:** Run `pnpm --filter @pf/api test`. Expected: PASS.
- [ ] **Step 5: Checkpoint.** The owner reviews and commits. Suggested message: `feat(api): admin content editing`.

---

### Task 10: Admin invite routes

**Files:**
- Create: `apps/api/src/routes/admin-invites.ts`
- Modify: `apps/api/src/app.ts` (add `codeGen` to `AppDeps`)
- Test: `apps/api/test/admin-invites.test.ts`

**Interfaces:**
- Consumes: `generateCode`, `formatCode`, `inviteInputSchema`, `invitePatchSchema`, `InviteDto`, `buildInviteMessage` (Tasks 1–2); `invites`, `visits`, `events` (Task 3); `loginAs` (Task 9).
- Produces:
  - `toInviteDto(row, siteUrl: string): InviteDto`
  - `GET /api/admin/invites` → 200 `InviteDto[]`, newest `created_at` first.
  - `GET /api/admin/invites/:id` → 200 `InviteDto`. An id that is not a positive int: 400 `{"error":"invalid"}`. A missing id: 404 `{"error":"not_found"}`.
  - `POST /api/admin/invites`:
    - Body `inviteInputSchema` → 201 `InviteDto`.
    - The code comes from `generateCode()`. On a unique violation (pg `23505`), retry up to 5 times, then 503 `{"error":"code_space_busy"}`.
  - `PATCH /api/admin/invites/:id`:
    - Body `invitePatchSchema` → 200 `InviteDto`. This includes `blocked: true|false` (block/unblock).
    - An id that is not a positive int: 400 `{"error":"invalid"}`. A missing id: 404 `{"error":"not_found"}`.
  - `DELETE /api/admin/invites/:id` → 204, which cascades to visits and events. A missing id: 404.

- [ ] **Step 1: Write the failing tests:**

```ts
test('requires auth', ...)
test('create → 201 dto with formatted code, link, message', ...)  // code /^[A-Z2-9]{3}-[A-Z2-9]{3}$/; link === `https://yourname.dev/c/${code}?s=msg`; message === buildInviteMessage(...).message
test('created invite works on /api/site', ...)    // ?code=<dto.code> → body.invite.code === dto.code
test('collision retry', ...)                      // vi.spyOn generateCode to return an existing code twice, then a fresh one → 201
test('block → public; unblock → personalised', ...)
test('patch visibility shows phone for that invite only', ...)
test('delete cascades', ...)                      // seed a visit + event for the invite; DELETE → 204; counts 0
test('bad id 400, missing id 404', ...)
test('list newest first', ...)
test('get one: 200 dto, 404 missing, 400 bad id, 401 without session', ...)   // body toEqual the matching list item
```

  For the collision test, `generateCode` must be called through an injectable seam. Put `codeGen?: () => string` on `AppDeps`, defaulting to `generateCode`, and set it in the test. Do not spy on the ESM export.
- [ ] **Step 2:** Run the tests. Expected: FAIL.
- [ ] **Step 3: Implement** the routes and add `codeGen` to `AppDeps` (Task 4's type).
- [ ] **Step 4:** Run `pnpm test && pnpm typecheck && pnpm lint && pnpm build`. Expected: all PASS, with `apps/api/dist/server.js` and `packages/shared/dist/index.js` present.
- [ ] **Step 5 (manual smoke):** with the dev Postgres running:
  1. Run `pnpm dev:api`, then `curl -s localhost:3000/api/site | head -c 200`. Expected: JSON starting `{"profile":{"name":"Your Name"`.
  2. Run `curl -si 'localhost:3000/api/site?code=ZZZZZZ' | grep -i cache-control`. Expected: `no-store`.
  3. Run `pnpm build && node apps/api/dist/server.js` with the same env. It should start without tsx, which proves the production `default` export condition.
- [ ] **Step 6: Checkpoint.** The owner reviews and commits. Suggested message: `feat(api): admin invite management`.

---

## Done when

- `pnpm test`, `pnpm typecheck`, `pnpm lint` and `pnpm build` all pass on Node 22 and Node 26.
- Every Review Focus line has a passing test in the named task.
- No Dockerfile, Compose or nginx file exists in the repo.
- The owner has run `admin:init` against the dev Postgres and signed in with `curl` (`POST /api/admin/login`, then `GET /api/admin/me` with the cookie).
- Plan 2 is written next, from the Produces blocks of Tasks 3, 6, 8 and 9 (`hits`, `recordHit`, `countHits`, `clientKey`, `loginAs`, `visits`/`events` tables).
