# Plan 6: Scroll effects (cookbook A–G) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Executors never run `git commit`/`git push`. Each task ends with a checkpoint where the owner reviews and commits, with no Claude attribution.

**Goal:** Turn Plan 3's plain placeholder sections into the cookbook's scroll experience, effects A–G, one effect per slice, built alongside stages 5–8. Every effect has a finished still state for reduced motion, and nothing ever blocks scrolling or tapping.

**Architecture:**
- Effects live in `apps/site/src/effects/<letter>-<name>/`. Each one wraps an existing Plan 3 section component without changing its data or its tracking calls.
- All numbers go in `apps/site/src/effects/tuning.ts` (`as const`; no React, no DOM, no colours).
- DOM marker attributes and timeline constants go in `apps/site/src/effects/contract.ts`.
- GSAP ScrollTrigger handles scrubbed timelines. Motion handles `useScroll`/`useTransform` (effect C). WAAPI handles the effect G overlay.

**Tech Stack:** As Plan 3, plus gsap `^3.15.1`, motion `^14.12.0` and @playwright/test `^1.65.0` (with Chromium, WebKit and the mobile emulation profiles).

**Spec:**
- `docs/superpowers/specs/2026-11-11-portfolio-design.md`: §2 anti-goals (no scroll snap, no loader before the hero, the hero readable within 1.5 s); §4 row Scroll effects; §5 Public page; §8 Known limits; §9 Kept.
- The cookbook in the original Nov 8 build spec (location pending the owner's decision; see roadmap). References below are "cookbook: <heading>":
  - Engine rules
  - Effects A–G
  - Tokens
  - Reduced motion
  - Compatibility
  - Known traps

**Depends on:**
- Plan 3: sections, layout shell, browserslist pin, beacon client
- Plan 2: click-target format `TRACK_TARGET_RE`
- Gate 0 below

## Gate 0: Welcome/mockup session (blocks every task)

- [ ] **The owner and Claude run the mockup session.** The output is approved mockups for each section: palette (including the "new palette" that D shifts to), type scale, the band colours and band order for C, the four icons for B, and the copy lengths for G's messages.
- [ ] **The owner supplies the assets:** A-Store "before" and "after" screenshots, each centred in its own file at aspect 1.05 (cookbook: E, "Pictures share one frame"), and the three A-Store numbers that the seed left empty (Plan 1).
- [ ] **Claude records the decisions** in `docs/superpowers/specs/<date>-visual-design.md`. Until that file exists, every task below is **blocked**.

## Reconsider before executing

- **The engine shell may be partly in Plan 3.** The cookbook's engine rules (the inner scroller with a locked window, `pageVh()`, `ScrollTrigger.config`, `overflow: clip`) shape the whole page layout. Before Task 1, read Plan 3's Produces. If Plan 3 shipped a normal document scroller, Task 1 retrofits the shell, and every Plan 3 e2e test must be re-run.
- **The inner scroller vs accessibility.** A locked window can break find-in-page scrolling, keyboard Page Up/Down focus, and some screen readers. Task 1 adds checks for these. If they fail, raise it with the owner rather than ship.
- **F may already exist.** The design spec puts the compare slider in v1 (Plan 3). If Plan 3 shipped it working, Task 7 is styling only.
- **F's tracking event.** The cookbook's `compare_drag` event is not in Plan 2's allow-list. Proposal: send `click` with target `link:compare-a-store` once per visit, which fits `TRACK_TARGET_RE`, so no Plan 2 change is needed. The owner confirms.
- **G's taps and sharing.** G's buttons send the existing `contact:<channel>` targets. Copy-email counts as `contact:email`. Share sends `link:share`.
- **Bundle budget.** GSAP + ScrollTrigger + Motion add about 60–70 KB gzip. The hero must still render from HTML and CSS with no effect JS (lazy-load the effect modules after first paint), so §2's 1.5 s readability holds. Measure at execution time.
- **iOS in an emulator is not iOS.** Playwright WebKit is a smoke test only. Each slice needs a pass on a real iPhone (Safari and Chrome) and a real mid-range Android, done by the owner on the live site (stage 5+).
- **Cadence:** one effect per slice, interleaved with stages 5–8. A slice ends with a deploy through the stage 6/7 pipeline once that exists.

## Global Constraints

- **Engine rules are verbatim from the cookbook:** CSS sticky only, never `ScrollTrigger.pin`; one scrubbed timeline per section; `fromTo` + `invalidateOnRefresh`; `tl.set({}, {}, 1)` to book the full length; scrub values 0.4 for drawings, 0.6 for scenes and `true` for spotlight steps, with `ease: "none"` under scrub; inside sticky boxes animate only opacity, clip-path, stroke-dashoffset and filter.
- **Reduced motion:** each effect's still state is its CSS default, and JS only adds motion. The still states are listed in cookbook: Reduced motion.
- **Never:** scroll snap; a loader in front of the hero; IntersectionObserver used to time reveals; negative `stroke-dashoffset`; rounding `getTotalLength()`; `overflow: hidden` on any sticky ancestor; `dvh`.
- **Tokens** (cookbook: Tokens): 120/200/320 ms; easeOut `cubic-bezier(0.22, 1, 0.36, 1)`; tablet 768 px; desktop 1024 px and `(min-aspect-ratio: 6/5)`; gutter `clamp(1.25rem, 5vw, 2.5rem)`; `fluid(phonePx, desktopPx)` from 390 to 1440 px.
- **Tracking is unchanged:** effects never add, remove or rename beacon calls beyond the two targets in Reconsider.

## Review Focus

1. **Reduced motion shows everything.** With `prefers-reduced-motion: reduce`, every section's text, every G message and the "after" picture are visible at load with no scrolling. Test: `e2e/reduced-motion.spec.ts`, Task 1, extended by each slice.
2. **No effect JS at all.** With the effect modules blocked (route-abort `effects-*.js`), the page is fully readable and the contact links work. Test: `e2e/no-effects.spec.ts`, Task 1.
3. **Short and tall screens.** At 360×640 and 1440×2560, no section is longer than its pixel budget, and nothing overlaps. Test: viewport matrix in each slice's e2e.
4. **Jumps.** Pressing End then Home leaves every effect in the correct state (all four enter/leave callbacks). Test: `e2e/jump.spec.ts`, Task 1, extended by each slice.
5. **Hidden contact.** A public visitor's G section renders no phone or WhatsApp button, because those keys are absent from the API payload. Test: Task 8.

---

### Task 1: Engine shell, tokens, tuning/contract, test harness

- **Files:** `apps/site/src/effects/{engine.ts,tokens.ts,tuning.ts,contract.ts}`, `apps/site/src/layout/PageScroller.tsx`, `apps/site/e2e/{reduced-motion,no-effects,jump}.spec.ts`, `apps/site/playwright.config.ts`.
- **Produces:**
  - `pageVh(f: number): string`
  - `measurePageVh(): void` (sets `--page-vh`)
  - `fluid(phonePx: number, desktopPx: number): string`
  - `media` and `queries` (each breakpoint exported twice, as in the cookbook)
  - `useScroller(): RefObject<HTMLElement>`
  - `registerSectionTimeline(el, build: (tl) => void, opts: { scrub: number | true }): () => void`
- [ ] **Unit tests** (Vitest):
  - `fluid(16, 24)` equals `clamp(1rem, <linear between 390 and 1440>, 1.5rem)`
  - `measurePageVh` picks the minimum of the probe, `visualViewport.height` and `innerHeight`
  - re-measuring happens only on a width change, plus once 350 ms later
- [ ] **Implement the cookbook's Engine rules.** `transform: translateZ(0)` applies only under `(hover: hover) and (pointer: fine)`. Refresh is debounced to 200 ms, only on a width change, and runs after `document.fonts.ready`.
- [ ] **The e2e tests from Review Focus 1, 2 and 4** pass on Chromium and WebKit, with mobile and desktop projects.
- [ ] **Accessibility checks:** Page Down/Space scroll the inner scroller once it has focus; Ctrl/Cmd+F finds text in a lower section and scrolls to it. If either fails, stop and raise it (Reconsider).
- [ ] **Checkpoint:** the owner reviews and commits (`feat(site): scroll engine shell`).

### Tasks 2–8: one effect per slice

Each slice has the same steps:
1. Write the unit tests for its pure math and the e2e tests for its still state.
2. Implement it per its cookbook heading.
3. Run `pnpm --filter @pf/site test && pnpm --filter @pf/site e2e`. Expected: PASS.
4. The owner runs the real-device check on the live site.
5. Checkpoint: the owner commits.

| Task | Effect (cookbook heading) | Section | Pure-math unit tests | Blocked on |
|---|---|---|---|---|
| 2 | A. Curtain reveal (CSS only) | Welcome→About, Projects→Contact | curtain-lifted check uses `{start, start + screen}` and not IntersectionObserver; z-index layers count down 2/1/0 | Gate 0 |
| 3 | B. Career line | About | dash setup `dasharray "L (L+pad)"`, offset from `L + pad/2` to `0`, never negative, L not rounded; stage budget 150–200 % per stage | Gate 0 icons (one M…C path each) |
| 4 | C. Tinted bands + sticky titles | Tech stack | colour at a scroll position: pure inside a band, a one-screen crossfade centred on each edge; title scale 1→0.55 over 250 px; `theme-color` per band | Gate 0 band colours |
| 5 | D. Before/after rising layer | Projects intro | pin at 10svh after 4svh, hold 200svh; accent class added `onEnter` and removed `onLeaveBack` | Gate 0 palette + screenshots |
| 6 | E. Spotlight steps | Projects detail | pixel budgets: roll 260, hold 340, exit 200; last group 380/560; reveal and exit share windows | three A-Store numbers |
| 7 | F. Compare slider | Projects | `--x` clamped 0–100; arrow keys ±5; `aria-valuenow` in sync; tracking once per visit (`link:compare-a-store`) | Reconsider (Plan 3 overlap) |
| 8 | G. Typed messages + circle takeover | Contact | typing time `clamp(800 + 12 × chars, 1000, 4000)`, 600 ms gap, buttons +650 ms; overlay radius `hypot(w, h)`; link opened once after ≤ 1 s | none beyond Gate 0 |

**Task 8 extras** (cookbook: G and Known traps):
- `navigator.share` is called inside the tap with no `await` before it. An `AbortError` is ignored, and any other error copies the link instead.
- Copy uses `navigator.clipboard` with an `execCommand("copy")` fallback, and "Copied" shows for 2.2 s.
- Coded visitors see their first name in the first message.
- Review Focus 5: the e2e test loads the public payload and finds 0 phone or WhatsApp buttons. With an invite payload that allows WhatsApp, it finds exactly 1, and its `href` starts with `https://wa.me/`.

**Effect H** (signature canvas flight) is not in this plan. See `2026-11-11-stage-9-stretch.md` / §6 Later. It reuses `tuning.ts` and `contract.ts` from Task 1 when it's built.

## Done when

- Tasks 1–8 pass their unit and e2e suites on Chromium and WebKit, at mobile and desktop sizes.
- The owner has signed off the real-device check for each effect.
- Lighthouse mobile on the live site shows the hero's LCP ≤ 1.5 s and no layout shift from the G message rows.
