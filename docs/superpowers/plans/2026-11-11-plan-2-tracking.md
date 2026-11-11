# Plan 2: Tracking API Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The API records what invited visitors actually do (beacon `POST /api/t`), keeps the owner's own devices out of the numbers, serves the per-invite timeline and the overview funnel to the admin, and runs a retention job.

**Architecture:** The beacon is a Fastify plugin with its own content-type parser (text/plain, 4 KB) and its own error handler, so it can only answer 204, 400, 403 or 413. The client generates the visit id (UUID), so later events reference it without the server ever replying with data. Processing is split into `ingest/*` functions that take `(db, ctx, event)` and never throw to the route. Stats are SQL over `visits` and `events`, excluding devices in `trusted_devices` unless `includeMine=true`. Wire formats and DTOs are Zod schemas in `@pf/shared`, so Plan 3 (site) and Plan 4 (admin) import the same types.

**Tech Stack:** Same as Plan 1. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-11-11-portfolio-design.md` (section 5: tracking rules, visits, privacy and retention). Tracking details carried over from the original Nov 8 build spec ("Personal links and tracking"); the values used are copied into Global Constraints below. Builds on `docs/superpowers/plans/2026-11-11-plan-1-api-foundation.md`.

## Reconsider before executing

Nothing below is approved yet. The owner answers each before Task 1 starts.

1. **Owner's-devices recognition (open decision).** `dk` is host-only, so in prod the admin host (`admin.<domain>`) and the site host (`<domain>`) never share it. On localhost, cookies ignore ports, so `:5173` and `:5174` *do* share it; nothing here may rely on that. Chosen: a one-time **mark link**. The admin calls `POST /api/admin/devices/mark-link`, gets a URL on the site host valid for 10 minutes, opens it on the phone or laptop to mark, and `GET /api/t/mark?token=…` adds that browser's `dk` to `trusted_devices`. Simpler alternative rejected: "exclude by IP", because his phone's IP changes and IPs are only kept in `hits`.
2. **New env var `SITE_ORIGINS`** (comma-separated full origins allowed to send beacons). It defaults to the origin of `PUBLIC_SITE_URL`. This modifies Plan 1's `Config` and `.env.example` (Task 2).
3. **`GET /api/site` also sets `dk`** when it is missing. This modifies Plan 1's `routes/site.ts`. It sets the cookie on code and no-code requests alike, so it reveals nothing about codes. The reason: Safari's handling of `Set-Cookie` on `sendBeacon` responses is not something to rely on.
4. **One new table, `device_mark_tokens`, in migration `0001`.** Plan 1's tables stay as they are.
5. **Caps not in either spec (my values):** `time` events capped at 300 per visit, like `enter`; mark tokens expire after 10 minutes.
6. **Click targets are an allow-listed format** (`demo:<id>`, `repo:<id>`, `link:<id>`, `contact:<channel>`, `resume`). The funnel is defined from these prefixes. Plan 3 must emit exactly these.
7. **Funnel unit is invites (people), not visits.** "Opened" means the invite has at least one counted visit in the range. "Not opened" is total invites minus opened.
8. **Dropped from the original spec for v1:** visits by hour of day, the recent-visits log, the access-log screen, and the link-preview log. The design spec does not list them for v1 (previews are in "Later"). Rows are still in `hits`, so they can be added later.
9. **Bots:** an API-side UA check only catches script-running bots (e.g. Googlebot sending `start`). Their `start` is logged as a `bot` hit and creates no visit. Page GETs are served by nginx and never reach the API.
10. **Owner-device side effects:** a trusted device's visits are still stored (and shown with `mine: true` when `includeMine` is on), but they never set `invites.first_opened_at` or `last_seen_at`.
11. **Cross-refs into Plan 1's Reconsider list:** the proposed link `kind` field (the "opened a demo" funnel step should read it instead of the `demo:` click prefix alone once it exists) and the proposed `GET /api/health` route. Neither changes this plan's tasks unless approved.

## Global Constraints

- **Everything in Plan 1's Global Constraints still applies** (git rule, ownership, versions, ESM, test DB, ports, cookies, `hits.class`, client key, time via injected `now()`, error JSON).
- **Beacon transport:** `POST /api/t`. Accepted content types are `text/plain` (any charset). The body is JSON text. The body limit is 4096 bytes.
- **Beacon answers, in check order:**
  1. Origin check (in `onRequest`, before the body is read): use `Origin`, or else the origin of `Referer`. Neither present, or not in `config.siteOrigins` → 403, empty body.
  2. Body over 4096 bytes → 413, empty body.
  3. Unsupported content type, unparsable JSON, or a body failing `beaconEventSchema` → 400, empty body.
  4. Otherwise → 204, empty body, even when the event is dropped by a cap, refers to an unknown visit, or the DB is down.
  5. Never 5xx. Any other error → 204.
- **Caps (from the original spec):** 30 `start` per device per hour; 10 `click` per target per visit; 300 `enter` per visit. Plan 2 adds: 300 `time` per visit. Over-cap events are dropped silently (204).
- **First-time fields** are written only while empty: `invites.first_opened_at`, and each key of `visits.reached` (e.g. `reached.projects`).
- **Active time:** the server caps the visit total at `now − started_at`, keeps the larger of stored vs capped (never decreases), and caps each per-section value the same way.
- **Device cookie `dk`:** a random UUID (`crypto.randomUUID()`), `HttpOnly`, `SameSite=Lax`, `Path=/`, `Max-Age=31536000` (1 year), no `Domain` (host-only), `Secure` from `COOKIE_SECURE`. When a request has no valid `dk`, the minted value is used for that same request.
- **Identity:** the visitor identity is `dk` only. IPs are never used as identity and are stored only in `hits`.
- **Events must match:** an event whose `visitId` doesn't exist, or whose visit has a different `device_key` than the request's `dk`, is dropped.
- **Source tags:** `qr | cv | msg | wa`; missing → `null` (shown as `none`).
- **Retention:** delete `visits` and `events` older than 365 days, `hits` with class `bot` older than 7 days, and other `hits` older than 90 days. Also delete expired `admin_sessions` and `device_mark_tokens` older than 1 day.
- **New env var:** `SITE_ORIGINS` (comma-separated origins; default `new URL(PUBLIC_SITE_URL).origin`). `.env.example` sets `SITE_ORIGINS=http://localhost:5173`.

## Review Focus

1. **A GET never counts.** `GET /api/site?code=K7M4QX` creates no `visits` row and leaves `first_opened_at` null. Only `start` does. Test: Task 4.
2. **Foreign or missing Origin is 403, before the body is read.** `Origin: https://evil.example` → 403 even with a 10 KB body. `Referer: http://localhost:5173/c/K7M-4QX` with no Origin → accepted. Test: Task 3.
3. **Caps are silent.** The 31st `start` in an hour, the 11th click on `demo:a-store`, and the 301st `enter` all answer 204 and add no row. Tests: Tasks 4 and 5.
4. **Never 500.** With the DB closed, a valid beacon answers 204. Test: Task 3.
5. **First-time fields stick.** A second device's `start` leaves `first_opened_at` unchanged; a second `reached projects` leaves `reached.projects` unchanged. Tests: Tasks 4 and 5.

### Task 1: Shared tracking schemas and DTOs

**Files:**
- Create: `packages/shared/src/tracking.ts`, `packages/shared/src/stats.ts`; modify `packages/shared/src/index.ts`
- Test: `packages/shared/test/tracking.test.ts`

**Interfaces:**
- Consumes: `SECTION_KEYS`, `SectionKey` (Plan 1 Task 2).
- Produces (`@pf/shared`):
  - `BEACON_PATH = '/api/t'`, `BEACON_MAX_BYTES = 4096`
  - `TRACK_SECTIONS = ['welcome', ...SECTION_KEYS] as const`; `type TrackSection`
  - `SOURCE_TAGS = ['qr','cv','msg','wa'] as const`; `type SourceTag`
  - `TRACK_TARGET_RE = /^(?:(?:demo|repo|link):[a-z0-9-]{1,40}|contact:(?:email|linkedin|phone|whatsapp)|resume)$/`
  - `targetKind(target: string): 'demo' | 'contact' | 'resume' | 'other'` (`demo:*` → demo; `contact:*` → contact; `resume` → resume; else other)
  - `beaconEventSchema`: a Zod discriminated union on `k`. Every member has `v: z.uuid()` (the visit id).
    - `{ k: 'start', v, code?: string ≤32, s?: SourceTag, tz?: /^[A-Za-z0-9_+\-/]{1,64}$/, ref?: string ≤500, dt: 'phone'|'tablet'|'desktop', sw: int 0–10000, sh: int 0–10000 }`
    - `{ k: 'reached', v, section: TrackSection }`
    - `{ k: 'click', v, target: string matching TRACK_TARGET_RE }`
    - `{ k: 'enter', v, section: TrackSection }`
    - `{ k: 'time', v, ms: int 0–86_400_000, per: Partial<Record<TrackSection, int 0–86_400_000>> (default {}) }`
    - `type BeaconEvent = z.infer<typeof beaconEventSchema>`
  - In `stats.ts`:
    - `statsQuerySchema = z.object({ includeMine: z.stringbool().default(false), range: z.enum(['7d','30d','all']).default('30d') })`
    - `type VisitDto = { id: string; deviceKey: string; parentVisitId: string | null; forwarded: boolean; mine: boolean; source: SourceTag | null; startedAt: string; lastSeenAt: string; device: { type: 'phone'|'tablet'|'desktop'; browser: string; os: string; sw: number; sh: number }; tz: string | null; referrer: string | null; activeMs: number; reached: Partial<Record<TrackSection, string>>; secondsBySection: Partial<Record<TrackSection, number>>; clicks: { target: string; at: string }[] }`
    - `type InviteVisitsDto = { inviteId: number; code: string /* formatted */; visits: VisitDto[] }` (visits newest first)
    - `type OverviewDto = { range: '7d'|'30d'|'all'; includeMine: boolean; invites: { total: number; opened: number; notOpened: number }; funnel: { opened: number; reachedProjects: number; openedDemo: number; contactedOrResume: number }; bySource: Record<SourceTag | 'none', number>; visits: { total: number; anonymous: number } }`
    - `type DeviceDto = { deviceKey: string; label: string; createdAt: string }`; `type MarkLinkDto = { url: string; expiresAt: string }`

- [ ] **Step 1: Write the failing tests** in `tracking.test.ts`:

```ts
test('start parses; dt required', ...)            // {k:'start', v:uuid, dt:'phone', sw:390, sh:844} ok; without dt → fails
test('unknown k fails', ...)                       // {k:'boom', v:uuid}
test('reached section allow-list', ...)            // 'projects' ok, 'admin' fails
test.each(['demo:a-store','repo:portfolio','link:x','contact:whatsapp','resume'])('target %s ok', ...)
test.each(['demo:', 'contact:fax', 'DEMO:a', 'javascript:x', 'demo:' + 'a'.repeat(41)])('target %s fails', ...)
test('targetKind', ...)                            // demo:a → 'demo'; contact:email → 'contact'; resume → 'resume'; repo:a → 'other'
test('statsQuery defaults', ...)                   // parse({}) → { includeMine:false, range:'30d' }; {includeMine:'true'} → true
```

- [ ] **Step 2:** Run `pnpm --filter @pf/shared test`. Expected: FAIL (missing module).
- [ ] **Step 3: Implement** `tracking.ts` and `stats.ts`, export them from `index.ts`. The DTO types are plain TS types (the API builds them; no runtime schema needed).
- [ ] **Step 4:** Run `pnpm --filter @pf/shared test && pnpm typecheck`. Expected: PASS.
- [ ] **Step 5: Checkpoint.** The owner reviews and commits. Suggested message: `feat(shared): beacon event schemas and stats DTOs`.

---

### Task 2: Mark-token table, `SITE_ORIGINS`, `dk` cookie

**Files:**
- Modify: `apps/api/src/db/schema.ts`, `apps/api/src/config.ts`, `apps/api/.env.example`, `apps/api/src/routes/site.ts`, `apps/api/test/helpers.ts`
- Create: `apps/api/src/net/device-key.ts`, `apps/api/drizzle/0001_*.sql` (generated)
- Test: `apps/api/test/device-key.test.ts`

**Interfaces:**
- Consumes: `Config`, `loadConfig`, `testConfig`, `testApp` (Plan 1 Task 4); `createTestDb`, `db:generate` (Plan 1 Task 3); `GET /api/site` (Plan 1 Tasks 5–6).
- Produces:
  - Table `deviceMarkTokens(id text pk /* sha256 hex */, label text not null, created_at timestamptz not null, expires_at timestamptz not null, used_at timestamptz null)`
  - `Config.siteOrigins: string[]`. `testConfig` sets `['http://localhost:5173']`.
  - `DK_COOKIE = 'dk'`, `DK_MAX_AGE_S = 31_536_000`
  - `ensureDeviceKey(request: FastifyRequest, reply: FastifyReply, config: Config): string` returns the request's `dk` when it is a valid UUID; otherwise mints one, sets the cookie (Global Constraints attributes) and returns it.
  - `GET /api/site` calls `ensureDeviceKey` before answering, on every branch.

- [ ] **Step 1: Write the failing tests:**

```ts
test('SITE_ORIGINS default = PUBLIC_SITE_URL origin', ...)   // PUBLIC_SITE_URL https://yourname.dev/x → ['https://yourname.dev']
test('SITE_ORIGINS parses list; bad origin throws /SITE_ORIGINS/', ...)
test('/api/site without dk sets cookie', ...)  // set-cookie matches /^dk=[0-9a-f-]{36}; Max-Age=31536000; Path=\/; HttpOnly; SameSite=Lax$/
test('/api/site with valid dk sets no cookie', ...)
test('/api/site with dk=garbage mints a new one', ...)
test('bad code and no code get the same Set-Cookie shape and body', ...)   // Review Focus 1 of Plan 1 still holds
test('migration 0001 creates device_mark_tokens', ...)
```

- [ ] **Step 2:** Run `pnpm --filter @pf/api test`. Expected: the new tests FAIL.
- [ ] **Step 3: Implement.** Add the table, run `pnpm db:generate` (expected: one `drizzle/0001_*.sql` creating only `device_mark_tokens`), add `siteOrigins` to the config schema, write `device-key.ts`, and call it from `routes/site.ts`. Add `SITE_ORIGINS` with a comment to `.env.example`.
- [ ] **Step 4:** Run `pnpm --filter @pf/api test && pnpm typecheck`. Expected: PASS, including all Plan 1 tests.
- [ ] **Step 5: Checkpoint.** The owner reviews `0001_*.sql` and commits. Suggested message: `feat(api): device cookie, beacon origins config, mark-token table`.

---

### Task 3: Beacon transport (`POST /api/t`)

**Files:**
- Create: `apps/api/src/routes/beacon.ts`, `apps/api/src/net/ua.ts`
- Modify: `apps/api/src/app.ts` (register the plugin), `apps/api/test/helpers.ts`
- Test: `apps/api/test/beacon-transport.test.ts`

**Interfaces:**
- Consumes: `beaconEventSchema`, `BEACON_PATH`, `BEACON_MAX_BYTES`, `BeaconEvent` (Task 1); `ensureDeviceKey`, `Config.siteOrigins` (Task 2); `buildApp`, `app.deps` (Plan 1 Task 4).
- Produces:
  - `type IngestCtx = { db: Db; now: Date; deviceKey: string; ip: string; ua: string /* capped to 300 */ }`
  - `type Ingest = (ctx: IngestCtx, ev: BeaconEvent) => Promise<void>`
  - `AppDeps.ingest?: Ingest` (default: the dispatcher from Tasks 4–5; until then a no-op). Tests can inject a spy.
  - `parseUa(ua: string): { browser: string; os: string }` (regex families: Edge, Chrome, Firefox, Safari, Samsung Internet / iOS, Android, Windows, macOS, Linux; else `'other'`)
  - `isBotUa(ua: string): boolean` (`/bot|crawl|spider|slurp|preview|facebookexternalhit|whatsapp|telegram|headless|lighthouse|curl|wget|python-requests/i`)
  - `test/helpers.ts` adds `beacon(app, body: unknown, opts?: { origin?: string | null; referer?: string; dk?: string; ip?: string; ua?: string }): Promise<LightMyRequest.Response>` (defaults: `origin 'http://localhost:5173'`, `content-type 'text/plain;charset=UTF-8'`, body `JSON.stringify(body)`).
- Route rules: the plugin is encapsulated (its own `addContentTypeParser('text/plain', { parseAs: 'string', bodyLimit: BEACON_MAX_BYTES })` and `setErrorHandler`). The error handler maps `FST_ERR_CTP_BODY_TOO_LARGE` → 413, `FST_ERR_CTP_INVALID_MEDIA_TYPE` and JSON/Zod failures → 400, anything else → 204. The handler: `ensureDeviceKey`, then `await deps.ingest(ctx, ev)` inside `try/catch` (catch → log, 204).

- [ ] **Step 1: Write the failing tests:**

```ts
test('valid start → 204, empty body, ingest called once', ...)
test('foreign Origin → 403 before body read', ...)        // origin 'https://evil.example', 10 KB body → 403 (not 413); ingest not called
test('no Origin, Referer from site → accepted', ...)       // origin null, referer 'http://localhost:5173/c/K7M-4QX' → 204
test('no Origin, no Referer → 403', ...)
test('4097-byte body → 413', ...)
test('application/json content type → 400', ...)
test('bad JSON → 400; schema failure → 400', ...)
test('ingest throws → 204', ...)                            // injected ingest rejects
test('DB closed → 204', ...)                                // real dispatcher (after Task 4) or no-op; client.close() first
test('no dk cookie → Set-Cookie dk on 204', ...)
test.each([['Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) … Version/18.0 Mobile/15E148 Safari/604.1', 'Safari', 'iOS'], ['… Chrome/140.0 Safari/537.36 Edg/140.0', 'Edge', 'Windows']])('parseUa', ...)
test('isBotUa', ...)                                        // 'Googlebot/2.1' true; 'WhatsApp/2.23' true; iPhone Safari false
```

- [ ] **Step 2:** Run the tests. Expected: FAIL.
- [ ] **Step 3: Implement** `ua.ts`, `beacon.ts` and the helper. The Origin check runs in an `onRequest` hook scoped to the plugin, so it fires before body parsing.
- [ ] **Step 4:** Run `pnpm --filter @pf/api test`. Expected: PASS.
- [ ] **Step 5: Checkpoint.** The owner reviews and commits. Suggested message: `feat(api): beacon transport with origin, size and body rules`.

---

### Task 4: Ingest `start` (visit creation)

**Files:**
- Create: `apps/api/src/ingest/start.ts`, `apps/api/src/ingest/trusted.ts`, `apps/api/src/ingest/index.ts`
- Modify: `apps/api/src/app.ts` (default `ingest`), `apps/api/test/helpers.ts`
- Test: `apps/api/test/ingest-start.test.ts`

**Interfaces:**
- Consumes: `IngestCtx`, `Ingest`, `isBotUa`, `parseUa` (Task 3); `normalizeCode` (Plan 1 Task 1); `visits`, `invites`, `trustedDevices` (Plan 1 Task 3); `recordHit` (Plan 1 Task 6).
- Produces:
  - `isTrusted(db: Db, deviceKey: string): Promise<boolean>`
  - `ingestStart(ctx: IngestCtx, ev: Extract<BeaconEvent, { k: 'start' }>): Promise<void>`
  - `dispatch: Ingest` in `ingest/index.ts` (switches on `ev.k`; Task 5 fills the other kinds)
  - `test/helpers.ts` adds `sendStart(app, opts?: { code?: string; dk?: string; s?: SourceTag; visitId?: string }): Promise<{ visitId: string; dk: string }>` (uses `beacon`; returns the dk it sent or the one set in the response).
- `ingestStart` rules, in order:
  1. `isBotUa(ua)` → `recordHit({ class: 'bot', path: '/api/t', ip, ua })`, stop.
  2. Cap: `count(visits where device_key = dk and started_at > now − 1 h) ≥ 30` → stop.
  3. `inviteId`: `normalizeCode(code)` → a matching invite that is not blocked, else `null`.
  4. `parentVisitId`: when `inviteId` is set and this `dk` has no earlier visit on that invite, the invite's earliest visit with a different `device_key`; else `null`.
  5. Insert the visit with `id = ev.v` (`on conflict do nothing`), `started_at = last_seen_at = now`, `device = { type: dt, sw, sh, ...parseUa(ua) }`, `source = s ?? null`, `tz`, `referrer = ref`.
  6. If `inviteId` and `!isTrusted(dk)`: `update invites set first_opened_at = coalesce(first_opened_at, now), last_seen_at = now`.

- [ ] **Step 1: Write the failing tests** (the setup creates invite `K7M4QX` directly in the DB):

```ts
test('GET /api/site?code alone creates no visit', ...)   // Review Focus 1: visits count 0; invites.first_opened_at null
test('start with code → visit linked, first_opened_at set', ...)
test('start with bad or blocked code → anonymous visit', ...)  // invite_id null; invite untouched
test('second device keeps first_opened_at; gets parentVisitId', ...)   // Review Focus 5; second visit.parent_visit_id === first visit id
test('same device second visit → parent null', ...)
test('31st start in an hour dropped, 204', ...)          // Review Focus 3; after now+61min → accepted
test('duplicate visitId ignored', ...)
test('bot UA → hit class bot, no visit', ...)
test('trusted device: visit stored, invite times untouched', ...)
test('source and device stored', ...)                    // s 'qr' → source 'qr'; device.os from UA
```

- [ ] **Step 2:** Run the tests. Expected: FAIL.
- [ ] **Step 3: Implement** the modules and make `dispatch` the default `ingest` in `buildApp`.
- [ ] **Step 4:** Run `pnpm --filter @pf/api test`. Expected: PASS (Task 3's "DB closed" test now exercises the real dispatcher).
- [ ] **Step 5: Checkpoint.** The owner reviews and commits. Suggested message: `feat(api): beacon start creates visits with caps and forwarding`.

---

### Task 5: Ingest `reached`, `click`, `enter`, `time`

**Files:**
- Create: `apps/api/src/ingest/events.ts`; modify `apps/api/src/ingest/index.ts`
- Test: `apps/api/test/ingest-events.test.ts`

**Interfaces:**
- Consumes: `dispatch`, `sendStart` (Task 4); `events`, `visits` (Plan 1 Task 3).
- Produces: `ingestEvent(ctx: IngestCtx, ev: Exclude<BeaconEvent, { k: 'start' }>): Promise<void>`. Every kind first loads the visit by `ev.v`; missing, or `device_key ≠ ctx.deviceKey` → stop. Accepted events set `visits.last_seen_at = now`, and (when `invite_id` is set and the device is not trusted) `invites.last_seen_at = now`.
  - `reached`: `reached = reached || {section: now}` only when the key is absent (one SQL `update … where not (reached ? section)`); insert event `{ kind:'reached', section }`.
  - `click`: cap 10 events with this `target` per visit; insert `{ kind:'click', target }`.
  - `enter`: cap 300 `enter` events per visit; insert `{ kind:'enter', section }`.
  - `time`: cap 300 `time` events per visit. `cap = now − started_at` in ms. `active_ms = greatest(active_ms, least(ms, cap))`. Insert one `time` event per `per` entry with `section` and `active_ms = least(value, cap)`.

- [ ] **Step 1: Write the failing tests:**

```ts
test('event for unknown visit dropped', ...)
test('event with another device key dropped', ...)       // visit by dk A; click sent with dk B → no event row
test('reached first time only', ...)                     // Review Focus 5: reached.projects keeps the first timestamp after a second send
test('11th click on same target dropped; other target ok', ...)   // Review Focus 3
test('301st enter dropped', ...)                         // Review Focus 3
test('time capped at elapsed and never decreases', ...)  // started 10 s ago: ms 999999 → active_ms 10000; then ms 5000 → stays 10000
test('per-section time stored as time events', ...)
test('last_seen_at moves on accepted events only', ...)
```

- [ ] **Step 2:** Run the tests. Expected: FAIL.
- [ ] **Step 3: Implement** `events.ts` and the dispatcher cases.
- [ ] **Step 4:** Run `pnpm --filter @pf/api test`. Expected: PASS.
- [ ] **Step 5: Checkpoint.** The owner reviews and commits. Suggested message: `feat(api): beacon events with per-visit caps and active time`.

---

### Task 6: Owner's devices (mark link)

**Files:**
- Create: `apps/api/src/routes/devices.ts`
- Modify: `apps/api/src/app.ts`
- Test: `apps/api/test/devices.test.ts`

**Interfaces:**
- Consumes: `deviceMarkTokens`, `ensureDeviceKey` (Task 2); `trustedDevices` (Plan 1 Task 3); `sha256Hex` (Plan 1 Task 7); `requireAdmin` (Plan 1 Task 8); `loginAs` (Plan 1 Task 9); `Config.publicSiteUrl` (Plan 1 Task 4).
- Produces:
  - `POST /api/admin/devices/mark-link`, body `{ label: string 1–60 }` → 201 `MarkLinkDto`, where `url = ${publicSiteUrl}/api/t/mark?token=<32 random bytes base64url>` and `expiresAt = now + 10 min`. Stores `sha256Hex(token)`.
  - `GET /api/t/mark?token=…` (public, on the site host): `ensureDeviceKey`; if the token hash exists, is unexpired and unused → set `used_at = now` and upsert `trusted_devices(device_key = dk, label)`. Always 302 `Location: /` and `Cache-Control: no-store`, whatever the token state.
  - `GET /api/admin/devices` → 200 `DeviceDto[]` (newest first).
  - `DELETE /api/admin/devices/:deviceKey` → 204; unknown key → 404 `{"error":"not_found"}`.

- [ ] **Step 1: Write the failing tests.** Use two separate cookie jars: `adminJar` (the `sid` from `loginAs`) and `siteJar` (no cookies at first). Never send one jar's cookies on the other's requests.

```ts
test('mark-link requires auth', ...)
test('mark flow marks the site device, not the admin one', ...)   // siteJar GET /api/t/mark?token → 302 /, Set-Cookie dk=X; trusted_devices has X only
test('existing site dk is reused', ...)                // siteJar already has dk=Y → trusted Y, no new Set-Cookie
test('token works once; expired after 10 min; garbage → 302 and nothing stored', ...)
test('mark response identical for good and bad tokens apart from Set-Cookie', ...)   // status 302, location '/'
test('list and delete devices', ...)
test('trusted device start leaves first_opened_at null', ...)   // ties to Task 4 rule 6 through the real HTTP flow
```

- [ ] **Step 2:** Run the tests. Expected: FAIL.
- [ ] **Step 3: Implement** `devices.ts`. Register the `/api/t/mark` route outside the beacon plugin (it is a GET with no body and no Origin rule).
- [ ] **Step 4:** Run `pnpm --filter @pf/api test`. Expected: PASS.
- [ ] **Step 5: Checkpoint.** The owner reviews and commits. Suggested message: `feat(api): mark own devices with a one-time link`.

---

### Task 7: Admin stats routes (timeline and overview)

**Files:**
- Create: `apps/api/src/stats/timeline.ts`, `apps/api/src/stats/overview.ts`, `apps/api/src/routes/admin-stats.ts`
- Modify: `apps/api/src/app.ts`
- Test: `apps/api/test/admin-stats.test.ts`

**Interfaces:**
- Consumes: `statsQuerySchema`, `VisitDto`, `InviteVisitsDto`, `OverviewDto`, `targetKind`, `formatCode` (Task 1, Plan 1 Task 1); `sendStart`, `beacon` (Tasks 3–4); `requireAdmin`, `loginAs` (Plan 1).
- Produces:
  - `inviteTimeline(db: Db, inviteId: number, includeMine: boolean): Promise<InviteVisitsDto | null>`
    - `mine` = the visit's `device_key` is in `trusted_devices`. Excluded unless `includeMine`.
    - `forwarded = parentVisitId !== null`.
    - `secondsBySection[s] = round(max(time.active_ms where section = s) / 1000)`.
    - `clicks` ordered by `at`.
  - `overview(db: Db, q: { range: '7d'|'30d'|'all'; includeMine: boolean }, now: Date): Promise<OverviewDto>`
    - Counted visits: `started_at ≥ now − range` (no lower bound for `all`), excluding trusted devices unless `includeMine`.
    - `invites.total` = all invites; `opened` = invites with ≥1 counted visit; `notOpened = total − opened`.
    - `funnel.reachedProjects`: opened invites with a counted visit whose `reached ? 'projects'`. `openedDemo`: with a counted `click` where `targetKind = 'demo'`. `contactedOrResume`: `targetKind ∈ {contact, resume}`.
    - `bySource`: counted visits per `source`, `null` → `none`, every key present (0 when empty).
    - `visits.total` and `visits.anonymous` (`invite_id is null`).
  - `GET /api/admin/invites/:id/visits?includeMine=` → 200 `InviteVisitsDto`; bad id 400; missing invite 404.
  - `GET /api/admin/overview?range=&includeMine=` → 200 `OverviewDto`; bad query 400 `invalid`.

- [ ] **Step 1: Write the failing tests.** The setup: 3 invites (A, B, C), plus HTTP-sent starts and events with an injected clock.

```ts
test('requires auth', ...)
test('timeline: two devices, forwarded flag, seconds and clicks', ...)
test('includeMine toggles trusted visits', ...)         // trusted visit absent by default; present with mine:true when includeMine=true
test('overview funnel', ...)                            // A: start+reached projects+click demo:a-store+click contact:email; B: start only; C: none → opened 2, notOpened 1, reachedProjects 1, openedDemo 1, contactedOrResume 1
test('overview range 7d excludes older visits', ...)    // a visit 8 days ago counts in 30d, not 7d
test('bySource has all keys', ...)                      // { qr, cv, msg, wa, none }
test('anonymous visits count in totals only', ...)
test('bad range → 400', ...)
```

- [ ] **Step 2:** Run the tests. Expected: FAIL.
- [ ] **Step 3: Implement** the two query modules (Drizzle `sql` templates are fine for the aggregates) and the routes.
- [ ] **Step 4:** Run `pnpm --filter @pf/api test`. Expected: PASS.
- [ ] **Step 5: Checkpoint.** The owner reviews and commits. Suggested message: `feat(api): admin visit timeline and overview`.

---

### Task 8: Retention job

**Files:**
- Create: `apps/api/src/retention.ts`, `apps/api/src/cli/retention.ts`
- Modify: `apps/api/package.json` (`retention` script), root `package.json` (`retention` → `pnpm --filter @pf/api retention`)
- Test: `apps/api/test/retention.test.ts`

**Interfaces:**
- Consumes: `visits`, `events`, `hits`, `adminSessions` (Plan 1 Task 3); `deviceMarkTokens` (Task 2); `loadConfig`, `createPgDb` (Plan 1 Tasks 3–4).
- Produces:
  - `runRetention(db: Db, now: Date): Promise<{ visits: number; events: number; hits: number; sessions: number; markTokens: number }>` (the deleted row counts; one transaction)
  - Script `retention` = `tsx --env-file=.env --conditions=development src/cli/retention.ts`. Prod: `node dist/cli/retention.js`, which prints the counts as one JSON line and exits 0 (exit 1 on a DB error). This is what the stage 8 CronJob runs.

- [ ] **Step 1: Write the failing tests:**

```ts
test('visits/events older than 365 d deleted, newer kept', ...)   // boundary: 364 d kept, 366 d deleted
test('old events on a recent visit deleted', ...)
test('bot hits > 7 d deleted; other hits kept until 90 d', ...)  // bot 8 d gone; code_refused 8 d kept; code_refused 91 d gone
test('expired sessions and old mark tokens deleted', ...)
test('returns counts', ...)
```

- [ ] **Step 2:** Run the tests. Expected: FAIL.
- [ ] **Step 3: Implement** `retention.ts` and the CLI.
- [ ] **Step 4:** Run `pnpm test && pnpm typecheck && pnpm lint && pnpm build`. Expected: all PASS.
- [ ] **Step 5 (manual smoke)**, with the dev Postgres and `pnpm dev:api` running:
  1. `curl -si -X POST localhost:3000/api/t -H 'Origin: http://localhost:5173' -H 'Content-Type: text/plain' -d '{"k":"start","v":"'$(uuidgen | tr A-Z a-z)'","dt":"desktop","sw":1440,"sh":900}'`. Expected: `HTTP/1.1 204` and a `set-cookie: dk=` line.
  2. The same with `-H 'Origin: https://evil.example'`. Expected: `403`.
  3. `pnpm retention`. Expected: one JSON line with five counts.
- [ ] **Step 6: Checkpoint.** The owner reviews and commits. Suggested message: `feat(api): retention job`.

---

## Done when

- `pnpm test`, `pnpm typecheck`, `pnpm lint` and `pnpm build` pass on Node 22 and Node 26, including every Plan 1 test.
- Every Review Focus line has a passing test in the named task.
- The owner has answered every item in "Reconsider before executing".
- Plan 3 consumes `beaconEventSchema`, `BEACON_PATH`, `TRACK_SECTIONS`, `TRACK_TARGET_RE`, `SOURCE_TAGS` and the `dk` behaviour of `GET /api/site`. Plan 4 consumes `statsQuerySchema`, `VisitDto`, `InviteVisitsDto`, `OverviewDto`, `DeviceDto`, `MarkLinkDto` and the routes in Tasks 6–7.
