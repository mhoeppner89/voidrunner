# BUGLOG — Voidrunner Bug Hunt (Round 1)

**Date:** 2026-08-25 (session) · **Build:** 0.7.7 (`GAME_VERSION` ui.js:86, `CACHE voidrunner-v113-0-7-7-visual-gauntlet` sw.js:1) · **Commit:** 715d79e
**Method:** live headless-Chrome probes (CDP, SwiftShader) walking title → docked → map → ship menu → flight → comms story line at 1280×720, 844×390 (touch), 390×844 (portrait) + targeted DOM forensics + static review of style.css / ui.js / render.js / laserFx.js / random.js hot spots.
**Rule honored:** nothing in the game was modified. New files are probe tooling + this log only.
**Artifacts:** `.freebuff/probe-bughunt.mjs`, `.freebuff/bughunt-followup.mjs`, `.freebuff/bughunt-culprit.mjs`, `.freebuff/bughunt-results.json`, screenshots in `.freebuff/bughunt-shots/`.

Severity: **high** = player sees broken UI in normal play · **medium** = visible in common states or degrades long sessions · **low** = polish/hardening.

---

## ⚠ WORK SPLIT for the 0.7.7b fix session (two fix agents in parallel)

**Agent A (ox-alpha fix session) has CLAIMED — do not re-fix these, and coordinate before touching its areas:**

| Item | Status |
| --- | --- |
| BUG-01 (monitor clip/feedback loop) | **FIXED** — `grid-template-columns: minmax(0,1fr)` on `.screen-ship-layout`/`.screen-target-layout` (hunt round 9 verified: 252=252) |
| BUG-02 (comms bar FUNKLOG/CONTINUE stacks) | **FIXED** — active-suppressor matches the German rule's specificity + `nowrap`/`flex-shrink:0` on both pseudos |
| BUG-04 (comms-row wrap) | **FIXED** — `overflow-wrap: anywhere` + `min-width:0` on `.comms-row p` |
| BUG-24 (destroyShip splash/burn crash) | **FIXED** — `destroyShip(ship, attackerId, position = ship.position)` |
| BUG-03 (flight-monitor font floors) | claimed — same monitors as BUG-01, live size verification pending |
| BUG-20 (standoff strip truncation) | claimed — own-ship monitor strip family |
| BUG-21 (race strip truncation) | claimed — racing leg |
| BUG-25 (updateSearchAI allocations) | claimed — game.js AI hot path |
| Racing feature bugs: first gate not rendered/selectable during travel, gates as circle+tick on the radar, box overlay on the own monitor at accept | claimed (goal-list items; game.js racing + ui.js drawRadar + buildNavigationMapModel) |
| Azure ring renders THROUGH the planet (user screenshot) | **FIXED** — analytic ray-sphere occlusion in the ring shader (depth buffer cannot separate ring/surface at orbital range: near 0.08 / far 2e6) |
| Cloud layers scrapped for perf (user OK'd; no wave layers exist in the code) | **DONE** — render.js |
| Aim assist / NPC aim accuracy | claimed (goal-list item) |
| 0.7.7b version bump (ui.js `GAME_VERSION` + sw.js `CACHE`) + release docs | claimed |

**Agent A's active files:** `src/game/game.js` (racing/radar/AI sections), `src/game/render.js` (planet/ring sections), `src/game/ui.js` (`drawRadar`, race-strip block, outline draw), `src/style.css` (cockpit-screen + comms-bar sections).

**FREE for the second agent (no overlap expected):**

- **BUG-05** — map card clipped ≤520px height (style.css map modal block)
- **BUG-06 + BUG-16** — pause/settings card compact reflow + visible scroll affordance (style.css modal block; pairs with BUG-15)
- **BUG-07** — laser flash material clone leak — **FIXED (agent B, round 10)**: `flashMaterial` clears the clone's inherited `shared` flag (`laserFx.js`); verified by firing smoke test, 0 console errors
- **BUG-08** — portrait concourse preview overflow (style.css dock block)
- **BUG-09** (+ round-3 update: target distance `toLocaleString('en-US')` ui.js:1631) — **FIXED (agent B, round 10)**: locale-aware `formatNumber`/`formatCredits` in random.js (de-DE/en-US grouping, NaN→0, negatives clamp); target distance uses `formatNumber`. Verified live: DE "3.200 cr" / "261.368 km"
- **BUG-10** — title-screen control hint font floors (style.css title block)
- **BUG-11** — concourse hotspot label floors (style.css)
- **BUG-12** — system-map node label clip (style.css)
- **BUG-14** — market table SELL ALL clipped / hidden horizontal pan (style.css market block)
- **BUG-15** — dock-content scroll affordance (style.css)
- **BUG-17** — dock-wide tiny type floors (style.css dock blocks; verify at 844×390)
- **BUG-18** — race briefing untranslated EN fragments — **FIXED (agent B, round 10)**: entry fee + payout ladder go through `t()` with placeholders (missions.js), rank list is language-neutral ("1: 4.200"), DE catalog gains the two entries; verified live on the German board (see Round 10 section)
- **BUG-19** — mission-board cycle check NaN — **FIXED (agent B, round 10)**: `refreshMissionOffers` trusts only numeric dash segments, so race-first boards parse the real cycle (missions.js)
- **BUG-23** — probe language key overrides saved language — **FIXED (agent B, round 10)**: key is single-shot in `main.js` beginSession (forces the session language once, then clears itself); verified live (lang=en on first boot, key removed, stays removed)

**Ground rules for the second agent:** re-read any file immediately before editing (Agent A commits incrementally); keep fixes inside the listed areas; document completed fixes + verification evidence in a "Round 10 — agent B fixes" section here; do NOT bump `GAME_VERSION`/`CACHE` or edit `sw.js` (release protocol stays with Agent A).

---

## HIGH

### BUG-01 · Own-ship STATUS monitor clips its right side; ticker cut mid-word, FRACHT value invisible
- **Where:** `src/style.css:2495` (`overflow:hidden` on `.cockpit-screen`), `:2518-2522` (`.cockpit-screen-own` 20% × 26.8%), `:3147` (`.screen-ship-layout` grid with **auto columns**), `src/game/ui.js:348` (inline `<canvas class="hull-outline">`), `src/game/ui.js:1750-1758` (`drawObjectOutline` sizes bitmap from `clientWidth`).
- **Symptom:** In flight, the STATUS monitor loses its right ~50px on every viewport: the FRACHT readout shows the label but the value is cut off, and the event ticker ("Anflug von Helix Freeport freigegeben") is chopped mid-word with **no ellipsis**. Measured: monitor clientWidth **256px**, scrollWidth **307px** (desktop); 167 vs 218 (844×390); 76 vs 218 (390×844). Visible in `bughunt-shots/desktop-1280x720-flight.png`, `phone-landscape-844x390-flight.png`, `followup-storyline-desktop.png`.
- **Cause (traced empirically):** `.screen-ship-layout` is a grid with no `grid-template-columns`, so the single auto track sizes to the widest item's intrinsic contribution. The hull-outline **canvas** contributes its intrinsic bitmap width — 300px from the HTML default 300×150 before first draw — inflating the track to ~301px. `drawObjectOutline` then sets `canvas.width = clientWidth × dpr` (ui.js:1755), which re-locks the inflated width in a **feedback loop**. All rows lay out at 301px inside a 256px monitor; `overflow:hidden` silently clips the difference, and `.ticker-line`'s ellipsis (style.css:3394-3400) never triggers because its container is 301px wide, not the monitor's 256px.
- **Suggested fix (guess):** Constrain the track: `grid-template-columns: minmax(0, 1fr)` on `.screen-ship-layout` (own **and** target monitors), or take the canvas out of flow (`position:absolute` inside its grid row). Either kills the intrinsic-width feedback; the existing ellipsis then works as designed.
- **Confidence:** high (measured + screenshot + code path read).

### BUG-02 · Comms story bar: FUNKLOG hint never suppressed in German; CONTINUE ▸ wraps into vertical letter-stacks
- **Where:** `src/style.css:2825-2827` (`html[lang="de"] .comms-bar::before { content:"FUNKLOG" }`), `:2837-2839` (`.comms-bar.active::before { content:none }`), `:2857-2863+` (`.comms-bar.story::after { content:"CONTINUE ▸" }`), `:2792` (`width: min(620px, 68vw)` flex bar), `src/game/ui.js:2236` (`classList.add('active','story')`).
- **Symptom:** During a story transmission the bar shows **"FU/NK/LOG"** stacked vertically on the left and **"CON/TIN/UE ▸"** stacked on the right (screenshots `followup-storyline-desktop.png`, `phone-landscape-844x390-storyline.png`). In English the left hint disappears correctly — the defect is German-only.
- **Cause (two stacked defects):**
  1. Specificity: `html[lang="de"] .comms-bar::before` = **(0,2,1)** beats `.comms-bar.active::before` = **(0,2,0)**, so `content:none` loses in German. Verified live: `getComputedStyle(bar,'::before').content === '"FUNKLOG"'` while `className === "comms-bar active story"`.
  2. Flex squeeze: both pseudo-elements are flex items with no `white-space`/`flex-shrink` protection; measured widths **22.25px** (::before) and **31.875px** (::after) — far below their text, so they wrap per-letter.
- **Suggested fix (guess):** Give both pseudos `white-space: nowrap; flex-shrink: 0;` (message span already has `min-width:0` + `overflow-wrap:anywhere`), and make the suppressor win — e.g. `.comms-bar.active::before, html[lang="de"] .comms-bar.active::before { content: none }` or write the German rule with `:where(html[lang="de"])` to drop its specificity.
- **Confidence:** high (computed-style forensics).

### BUG-03 · Flight telemetry renders at 4.3–5.3px on phones — unreadable
- **Where:** `src/style.css:3279` (`.screen-flight { font-size: clamp(0.32rem, 0.58vw, 0.58rem) }`), `:3208` (`.screen-bars > div { font-size: clamp(0.33rem, 0.56vw, 0.56rem) }`).
- **Symptom:** At 844×390 the GESCHW./TREIBST./FRACHT values measure **5.12px**, the `/100` `small` **4.35px**, SCHILDE/PANZER/HULLE labels **5.28px**; desktop 720p gives only 7.4–8.2px. The clamp floors (0.32rem = 5.12px) are far below any readable size, and the `vw` term never lifts the value at phone widths. Since the user preference is "all telemetry lives on the cockpit monitors", this text is the primary flight readout.
- **Cause:** clamp minimums set for a worst-case squeeze that then actually happens; nothing reserves layout room at small viewports.
- **Suggested fix (guess):** Raise floors to ≈0.5rem (8px) minimum for values, ≈0.45rem for labels, and reclaim the space by shrinking the decorative hull-outline row (it's the flexible row) instead of the text; alternatively scale the whole monitor with a `transform: scale()` on a fixed readable base size.
- **Confidence:** high (measured across viewports).

---

## MEDIUM

### BUG-04 · Comms log rows can't wrap long tokens — horizontal clip
- **Where:** `src/style.css:3073-3076` (`.comms-row p` has no `overflow-wrap`/`word-break`), `.comms-log-list` `:3037` (only `overflow-y:auto`).
- **Symptom:** With a long unbroken token in a log entry (measured with a stress string): `.comms-log-list` scrollWidth **882 vs 556** client — text runs under the card edge and is unreachable. The live bar's `.talker-text` has `overflow-wrap:anywhere` (style.css:3083-3086) but the persisted log rows don't.
- **Cause:** missing soft-wrap policy on `.comms-row p` (and `.comms-row > b` is `nowrap`, so long callsigns also steal width).
- **Suggested fix (guess):** `overflow-wrap: anywhere` on `.comms-row p` (and consider `min-width:0` + ellipsis on the `b` column).
- **Confidence:** high.

### BUG-05 · Map card bottom row clipped on short viewports (≤520px height)
- **Where:** `src/style.css:7345-7353` media block: `@media (max-height: 520px) and (orientation: landscape) { .map-card { max-height: 96vh; overflow: hidden; } }`.
- **Symptom:** At 1280×520 (and any phone-landscape ≈390-430px tall), the map card's content below the two map stages is cut — a sliver of the next row (legend/jump info) peeks at the card's bottom edge with no way to scroll (`overflow:hidden`). Stage internals also clip: system-map 230>214, tactical-map 121>116.
- **Cause:** the compact-height media query switches the card from `overflow:auto` (base `.modal-card`, style.css:1786) to `hidden` while the fixed stage heights still exceed the budget.
- **Suggested fix (guess):** keep the card scrollable (`overflow:auto`) in the compact block, or shrink `.system-map`'s `height: min(560px, 66vh)` floor (style.css:4210-4212 `min-height: 350px` is too tall for 520px viewports once header + footer are added).
- **Confidence:** medium-high (screenshot `followup-map-desktop.png` + measured clips).

### BUG-06 · Pause/settings card cut mid-row at short viewports; scrollbar invisible
- **Where:** `.modal-card { max-height: 92vh; overflow: auto }` style.css:1782-1787; content measured **876px in a 474px** box at 1280×520.
- **Symptom:** Screenshot `followup-pause-desktop.png`: the AUDIO section's "Effekte" slider row is sliced at the card's bottom edge; the only affordance is a barely-visible scrollbar against the dark card. Data isn't lost (it scrolls) but it reads as broken and the scroll cue is effectively invisible.
- **Cause:** settings content is one tall grid; no compact layout for short viewports, and no custom scrollbar styling on `.modal-card`.
- **Suggested fix (guess):** two-column → single-column reflow under `@media (max-height: 600px)` plus a styled `::-webkit-scrollbar`/`scrollbar-width: thin` with visible thumb colors.
- **Confidence:** medium-high.

### BUG-07 · Laser flash materials leak — clones inherit `userData.shared` and are never disposed
- **Where:** `src/game/laserFx.js:89-97` (`materialFor` sets `userData.shared = true` on cached base), `:227-237` (`flashMaterial` returns `base.clone()`), `src/game/render.js:3196-3207` (`disposeObject` skips anything flagged shared).
- **Symptom:** None immediately visible; a slow accumulation — every muzzle flash and impact flash spawns a cloned `SpriteMaterial` that expiry never disposes, because three.js `Material.copy()` deep-copies `userData` (so the clone is *also* flagged `shared`). Long dogfights accumulate orphaned materials/program references until `laserFx.dispose()` — which only disposes the cached bases, never the clones.
- **Cause:** flag semantics collide with `clone()`; the clone is per-event state but carries shared-state immunity.
- **Suggested fix (guess):** after `base.clone()`, set `clone.userData.shared = false` (or track clones in a pool and dispose on expiry); alternatively fade opacity via a per-instance uniform/attribute instead of per-event material clones.
- **Confidence:** high (code path fully read; behavior of `Material.copy` w.r.t. userData is three.js-documented).

### BUG-08 · Portrait layout is broken behind the rotate gate
- **Where:** dock concourse preview, measured at 390×844: `.concourse-hover-preview` scrollWidth **731 vs 390**, `.concourse-hover-shadow` rect x≈455-731, `.concourse-hover-ship-flight` x≈482-704 (offscreen right).
- **Symptom:** Currently invisible to players because `#rotate-notice` (ui.js:423) covers portrait entirely. But the underlying dock UI lays out broken at 390px — any bypass (desktop narrow window, foldables/split-screen that report landscape-ish, dev previews) exposes a concourse with the ship preview half off-screen.
- **Cause:** the hover-preview block is sized in absolute px (ship + shadow sprites) without a portrait constraint; no `max-width` guard.
- **Suggested fix (guess):** cap `.concourse-hover-preview` to viewport width (`max-width: 100vw; overflow: hidden`) or scale it with the same `--touch-scale` factor the pads use.
- **Confidence:** medium (measured DOM; player impact currently gated).

---

## LOW

### BUG-09 · `formatCredits` — EN separators in the German UI, negatives masked, NaN prints "NaN cr"
- **Where:** `src/game/random.js:40` — `Math.max(0, Math.floor(value)).toLocaleString('en-US')`.
- **Symptom:** German dock screen shows **"3,200 cr"** (screenshot `desktop-1280x720-docked.png`); a corrupted negative balance would silently display "0 cr" hiding the bug; a NaN credits value renders "NaN cr".
- **Suggested fix (guess):** use the active locale (`toLocaleString(getLanguage() === 'de' ? 'de-DE' : 'en-US')`), and guard `Number.isFinite` with a fallback.
- **Confidence:** high for the separator (visible in screenshot); the NaN path is theoretical.

### BUG-10 · Title-screen control hints at 7.7-8.5px on phones
- **Where:** `.title-controls` / `.title-tilt button` font sizes (measured 7.68px at 844×390, 8.48px at 390×844, 8px buttons "NEIGUNGSSTEUERUNG AKTIVIEREN").
- **Symptom:** hint text and tilt buttons are borderline illegible on phone landscape.
- **Suggested fix (guess):** raise the clamp floor for `.title-controls` to ≥0.55rem and let the card wrap to two rows.
- **Confidence:** high (measured).

### BUG-11 · Concourse hotspot labels at 7.84px on phone landscape
- **Where:** `.scene-pointer b` (DIENSTE / MARKT / BAR headings) measured 7.84px at 844×390; `small` captions 7.68px in portrait.
- **Suggested fix (guess):** floor the label size ≈0.55rem; captions may stay smaller but ≥0.5rem.
- **Confidence:** high (measured).

### BUG-12 · System-map node labels clip at the stage edge
- **Where:** `.system-map.map-stage` measured scrollHeight 230 vs 214 client.
- **Symptom:** map node captions sitting at the stage's top/bottom edge lose their descenders/box shadow; cosmetic.
- **Suggested fix (guess):** a few px of stage padding or `overflow: visible` on the label layer only.
- **Confidence:** medium.

### BUG-13 · Informational: `#game-shell` scrollWidth exceeds viewport during flight (1505 vs 1280)
- **Where:** decorative `.hyperdrive-fx-streaks` layer intentionally oversized (rect −225,−463 → 1505×1183).
- **Symptom:** none — `#game-shell { overflow: hidden }` (style.css:51-57) contains it and it's pointer-transparent. Logged so future "page scrolls during flight" reports aren't misdiagnosed.
- **Confidence:** high that it's benign.

---

## Checked and healthy (no finding)

- **Console:** zero errors/warnings across all 3 viewports × 7 states, including THREE shader compiles under SwiftShader.
- **Shaders:** atmosphere (render.js:1149-1203), ring (1341-1397), bloom bright/blur/composite (2914-3016) reviewed — guarded clamps everywhere (no unguarded `pow`/`normalize(0)`/div-by-zero paths), fog/toneMapped flags consistent, HalfFloat targets with LinearFilter fine, fullscreen-trick vertex shader standard. The neutral-tone-mapping re-implementation matches three.js's reference closely.
- **FX hygiene:** `disposeObject` (render.js:3189-3210) correctly respects shared geometry/texture/material flags; spark bursts allocate per event but are disposed properly (only BUG-07's clones leak).
- **Sim hygiene:** `updatePlayer` only commits `Number.isFinite` positions to the save (game.js:1916-1927) — good NaN backstop.
- **Theme rule:** exactly one `:root` block (style.css:1); no mid-file `:root` regressions.
- **i18n attribute safety:** no `"` characters in any `i18n-de.js` value, so `aria-label="${t(...)}"` patterns can't break attributes today.
- **Panels verified:** map, pause, and comms-log modals all open during flight (not gated to dock as first probe assumed).
- **Portrait rotate gate:** itself renders correctly at 390×844.

## Round 2 additions (docked sub-screens, DE+EN, phone-landscape focus)

Matrix: concourse / market floor / commodities / equipment / shipyard / bar floor / missions / guilds / services / ship panel / chat / pause at 844×390 (de+en) and 1280×720 (de), stressed save (123,456,789 cr, 60.9/32 mass hold). Artifacts: `.freebuff/probe-bughunt2.mjs`, `.freebuff/bughunt-scroll.mjs`, `bughunt-results-2.json`, shots `phone-844x390-{de,en}-*.png`.

### BUG-14 · Commodity table needs an undiscoverable horizontal pan; SELL ALL sliced off-screen (phone landscape)
- **Where:** `.market-layout` (`overflow:auto`, scrollWidth 880 vs 841 client, **scrollbar width 0**) containing `.market-table` (876px wide) — measured live in `bughunt-scroll.mjs`.
- **Symptom:** Screenshot `phone-844x390-de-market-commodities.png`: the fourth action button per row ("ALLE VERKAUFEN" / "SELL ALL") is sliced in half by the right screen edge. The container does pan horizontally (touch/shift-wheel) but renders **no scrollbar**, so nothing tells a player the column exists. Same at EN.
- **Cause:** the 4-button action column's min-width pushes the table past the viewport; the scroll container hides its (overlay) scrollbar completely.
- **Suggested fix (guess):** let action buttons wrap to two rows under a phone breakpoint, or shrink the ANGEBOT/NACHFRAGE column; if horizontal scroll stays, add a visible edge-fade/scroll hint.
- **Confidence:** high (measured + screenshot).

### BUG-15 · Every tall dock screen scrolls with zero scroll affordance
- **Where:** `.dock-content` — `overflow: auto` with **scrollbarW = 0**; content heights vs 308px viewport: commodities 651, missions 1192, equipment **1566** (5 screens of scrolling).
- **Symptom:** long market/mission pages just cut at the bottom edge; on desktop the mouse wheel discovers the scroll by accident, on touch pan-y works, but there is no visual cue (no scrollbar, no fade) that more content exists below.
- **Cause:** scrollable containers rely on overlay scrollbars that headless/mobile themes render at 0 width; no `scrollbar-width`/custom scrollbar styling, no bottom fade.
- **Suggested fix (guess):** style a visible thin scrollbar for `.dock-content` (and `.modal-card`), and/or add a gradient fade at the container's bottom edge while `scrollHeight > clientHeight`.
- **Confidence:** high.

### BUG-16 · Pause/settings card: 825px of settings in a 363px card on phone landscape (updates BUG-06)
- **Where:** `.pause-card` — `overflow:auto`, scrollHeight 825 vs 363 client at 844×390 (desktop: 876 vs 658), scrollbarW 4px.
- **Symptom:** two-thirds of the settings are behind an effectively invisible 4px scrollbar inside the modal; the sliced "Effekte" row at the card's bottom edge (round-1 screenshot) reads as broken rather than scrollable. Confirmed on BOTH viewports now — this is systemic, not a short-viewport edge case.
- **Suggested fix (guess):** compact two-column→one-column reflow for the settings grid under `@media (max-height: 520px)`/phone widths + visible scrollbar styling (see BUG-15).
- **Confidence:** high.

### BUG-17 · Systemic tiny type across ALL docked commerce UI on phone landscape (extends BUG-03)
- **Where / measured (844×390, de+en identical):** market nav tabs `.market-points button` **7.36px**; commodity row meta `small` **8.48px**; KAUF/VERKAUF buttons **8.32px**; mission-card `dt` labels **7.68px**; shipyard `.ship-overview-meta` **8.32px**; scene return pointers **7.84px**; bar person names **7.84px**.
- **Symptom:** the entire trading/mission UI on a phone renders at 7.4–8.5px — primary interaction buttons (BUY 1 / BUY 5 / SELL) at barely-legible sizes. This is a dock-wide type-scale floor problem, not isolated widgets.
- **Cause:** the dock screens' rem/px scale bottoms out around 0.46–0.53rem with clamps that never lift at phone widths (same pattern as BUG-03's flight monitors).
- **Suggested fix (guess):** one audit pass raising all dock type floors to ≥0.55rem (8.8px) for labels and ≥0.52rem for meta text, verified against 844×390; the screens have vertical scroll room (BUG-15) so taller text costs only scrolling.
- **Confidence:** high (measured in two languages).

### Round-2 updates to round-1 findings
- **BUG-02 (comms bar):** EN forensics confirm the diagnosis — in English `::before` content is correctly `none` while active, but `::after` "CONTINUE ▸" still squeezes to **55.4px** and letter-wraps. So: FUNKLOG stacking = German-only (specificity); CONTINUE stacking = **both languages** (flex squeeze). Fix priority on the `nowrap`/`flex-shrink:0` half.
- **BUG-09 (formatCredits):** more evidence — stressed wallet renders "**123,456,789 cr**" with EN separators mid-German-UI (screenshot `phone-844x390-de-market-commodities.png`).
- **Coverage note (not a bug):** `openShipMenu()`/`openChatLog()` are no-ops while docked — ship panel and chat log only exist in flight; round-1 flight scans already covered them.
- **Static review (no findings):** `economy.js` read end-to-end — buy/sell quantities clamped by supply/credits/capacity, prices floored at 3cr (no div-by-zero), den premium path guarded against legal goods; race-gate `children[0]` access safe (groups always built with ring+glow).

## Round 3 additions (in-flight combat states, missions.js, sim hygiene)

Artifacts: `.freebuff/probe-bughunt3.mjs`, `.freebuff/probe-bughunt3b.mjs`, `.freebuff/bughunt-inflate.mjs`, `bughunt-results-3.json`, `bughunt-results-3b.json`, shots `*-arena-roster.png`, `*-target-far.png`, `*-damage.png`, `*-hyperdrive-*.png`.

### BUG-01 UPDATE · The STATUS-monitor clip is DYNAMIC and hi-DPI-amplified (was: static 315>252)
- **New measurements:** locking a far target (AZURE REACH, 261,368 km) grew the own-monitor scrollWidth **315 → 447** (desktop) mid-session (`bughunt-results-3b.json`, `target-locked-location-far`); on the dpr-2 phone the same monitor measured **308 content in 167px** (nearly double). A controlled re-run (`bughunt-inflate.mjs`) held 315 when no new ticker message fired, so the growth is content-dependent.
- **Refined cause:** two coupled mechanisms inside the same auto-sized grid track (`.screen-ship-layout`, no `grid-template-columns`):
  1. the canvas feedback loop (BUG-01 original) seeds ~301px — and `drawObjectOutline` sets the bitmap to `clientWidth × dpr` (ui.js:1750-1758, ratio capped at 2), so on dpr-2 devices the loop chases **2× the CSS width**;
  2. long one-line monitor messages (post-lock auto-scan/sensor lines land in `#screen-event-ticker`) push the track wider still — the ticker's `text-overflow: ellipsis` (style.css:3394-3400) cannot apply because the track inflates to the line's intrinsic width before the ellipsis has a constrained box.
- **Suggested fix (unchanged, now stronger):** `grid-template-columns: minmax(0, 1fr)` on `.screen-ship-layout` (both monitors) or take the canvas out of flow; that kills every variant at once. Additionally cap the bitmap at, say, `Math.min(2, dpr)` **of the fixed layout width**, not of the feedback-looped `clientWidth`.
- **Confidence:** high (three independent measurement runs).

### BUG-09 UPDATE · Target distance also localizes as EN
- `src/game/ui.js:1631`: `Math.round(target.distance).toLocaleString('en-US') + ' km'` → German UI shows "**261,368 km**" (measured live in the target monitor). Same root as the credits separator; fix once in a shared formatter.

### BUG-18 · Race briefings contain untranslated English fragments (low)
- **Where:** `src/game/missions.js:61` — race `briefing` is built from raw literals: `"Entry is ${fee} cr. Payouts by rank: 1st 4200, 2nd 1800, ..."` with EN ordinals (`['st','nd','rd','th']`) and no `t()` wrapping.
- **Symptom:** German mission board shows a German race title/issuer followed by an English sentence with EN ordinals.
- **Suggested fix (guess):** route through `t()` with placeholders (`t('Entry is {fee} cr. Payouts by rank: {ranks}.')`) and localize ordinals (German: "1."/"2.").
- **Confidence:** high (code read; consistent with the board's other strings being translated).

### BUG-19 · Mission-board cycle check parses `NaN` for race-first boards (low, latent)
- **Where:** `src/game/missions.js:246-249` — `existing[0]?.id.split('-')[1]` extracts the cycle from the first offer's id; race offers (`id: 'race-<course>'`, pushed first at line 46-62) yield `'shardbelt'`/`'helix-run'` → `Number(...) === NaN` → the `!== cycle` branch is always true.
- **Symptom:** none today — regeneration is seed-deterministic per cycle (`seededRandom(`${seed}:missions:${cycle}:${locationId}`)`), so re-generating produces byte-identical offers. But the guard is dead weight for race locations, and the board silently becomes a **live re-roll** the moment `generateMissionOffers` gains any nondeterminism (a `Math.random()` call, an ordering change).
- **Suggested fix (guess):** store the cycle explicitly (`save.world.offerCycle[locationId] = cycle`) instead of parsing ids.
- **Confidence:** high on the code path; impact currently zero.

### Round-3 health checks (no findings)
- `--damage-warning` CSS var responds to hull loss (measured 0.809-0.872 with hull 22) — damage vignette plumbing works.
- `Math.acos` call in npcNav.js:1244 is clamped to [-1,1] first; `cleanupEntities` splice loops iterate backwards (game.js:6280-6301); no raw `setTimeout`/`setInterval` in game.js (world-time scheduling only); save migrations initialize `reputation`/`guildRep`/`registry` (save.js:243-244, 265).
- Arena roster screen renders clean at desktop; only pre-existing title-screen tiny-font findings at phone.
- Hyperdrive blocked-vector path verified: tapping the card on a misaligned vector shows the full German status message ("Der Hyperantrieb braucht einen freien Vektor…") without overflow.
- Economy `trade()` toast composition and `acceptMission` guards (deposit, 6-mission cap, cargo mass epsilon) read clean.

### Coverage notes for round 4
- Ship-target monitor populated state: still uncovered — round-3b probe bug called `debugShips()` on the session (it lives on `window.__VOID_PRIVATEER__`, main.js:257); use `__VOID_PRIVATEER__.debugShips().find(s => s.hostile)`.
- Mining/salvage contextual pads: still uncovered — `renderer.locationMeshes` has no 'shardbelt' entry (fields aren't meshes); import `LOCATIONS` from `src/game/data.js` directly in the probe (pattern: capture-scenes.mjs:6) and teleport to `LOCATIONS.shardbelt.position + offset`.
- Event overlays (mug demand, syndicate berth, patrol reply chip) remain event-driven and untested.

## Round 4 additions (ship lock, mining pads, bar dialogue, mug standoff)

Artifacts: `.freebuff/probe-bughunt4.mjs` (imports `LOCATIONS` from data.js), `bughunt-results-4.json`, shots `*-target-ship.png`, `*-mining-pads.png`, `*-bar-dialogue.png`, `*-mug-standoff.png`.

### BUG-20 · Mug standoff: toll amount truncated on the HUD strip and buried below the fold in the ship menu (phone)
- **Where:** `.screen-standoff` strip (style.css:2619-2661: `white-space: nowrap` flex row `KONFRONTATION | ZAHLEN … | <timer>`, the `b` toll element with `overflow:hidden; text-overflow:ellipsis` but the row is absolute inside the already-narrow, feedback-looped monitor) + the actionable PAY row at `src/game/ui.js:2406` (`STANDOFF TOLL` in the ship menu's account section).
- **Symptom (measured, 844×390):** `#screen-standoff-demand` scrollWidth **79 in 55px** — the strip shows "ZAHLEN 1,2…" (ellipsis), so the demanded amount is unreadable on the monitor. The real PAY button exists only in the ship menu, where — at phone height — the account section sits below the fold of the internally-scrolling card (BUG-16), confirmed by screenshot `phone-844x390-mug-standoff.png` (menu shows contracts/cargo/weapons; no toll row visible). Net: during a pirate standoff on a phone, the player can't see the amount anywhere without hunting through a scroll.
- **Suggested fix (guess):** shorten the strip label at narrow widths (drop "KONFRONTATION" to an icon, or format the toll as "1,2k cr"), and surface the toll/jettison row at the TOP of the ship menu while `activeMug()` is live (it's transient, time-critical info — it shouldn't sit under contracts/cargo).
- **Confidence:** high on measurements; medium on how often players read the strip vs the menu.

### Round-4 coverage wins (previously unreached states, now verified)
- **Ship-target lock (arena):** `__VOID_PRIVATEER__.debugShips()` → `selectTarget('ship', id)` populates the target monitor cleanly — name with typographic quotes ("BRAM ESKA "HOLLOWPOINT""), distance "183 km", hull %, readout "AUF JAGD · Veteran". **No new clipping in the target monitor** beyond the known own-monitor issues. Both viewports.
- **Mining pads:** after `selectTarget('asteroid', …)` the contextual pads switch correctly (`touch-fire is-mining`, `touch-missile is-scan`) and the readout shows "ORE · 7 LEFT". Pads are target-driven, not proximity-driven — working as designed.
- **Bar dialogue:** clean scan at desktop (0 findings).
- **Mug seeding path:** standoff state is ship-driven (`ship.mug/holdFire/demandUntil`, game.js:5348-5357) and renders through both the strip and the menu — the seeding approach works for future probes.
- **Frame loop re-verified against house rules:** edge actions run once per frame outside the sim loop (game.js:1372-1384), sim accumulator capped, audio params NaN-guarded (game.js:1390-1399), modal-open freezes the accumulator.

### Round-4 notes
- Salvage pads did NOT switch at mourning-line — expected: like mining, they need an explicit `selectTarget('wreck', id)`; the probe only teleported. Not a bug; logged so the next probe locks a wreck first.
- Desktop mug seed found 6 ships but none hostile at mourning-line (neutral traffic) — seeding succeeded on the arena pass instead.
- Weapons list in the ship menu ellipsizes long descriptions ("REICHWEITE…", "DARÜBE…", "SPLASH + B…") at phone width — graceful, by design, but five of six visible rows are truncated; borderline cosmetic.


## Round 5 additions (race strip, salvage lock, patrol chip, syndicate card, EN dock pass)

Artifacts: `.freebuff/probe-bughunt5.mjs`, `bughunt-results-5.json`, shots `*-race-strip.png`, `*-salvage-locked.png`, `*-patrol-chip.png`, `*-syndicate-card.png`, `*-syndicate-broke.png`, `desktop-1280x720-en-*.png`.

### BUG-21 · Race strip truncates BOTH live readouts at every viewport (gate number + distance)
- **Where:** `.screen-race-strip` (style.css:2666-2709) — same pattern as the standoff strip: absolute row (`left:0; right:0`) inside the own-ship monitor, `white-space: nowrap`, `justify-content: space-between`, both children `overflow:hidden; text-overflow:ellipsis` — sitting inside the monitor whose width BUG-01's feedback loop already shrank.
- **Symptom (measured, race entry live):** desktop `#screen-race-label` **193>167** ("SHARD GAUNTLET · ZU TOR 1…" — the gate number cut) and `#screen-race-value` **73>63** ("380,0…" km cut); phone **146>106** and **53>39**. During a race, the two pieces of information the strip exists to show — which gate, how far — are both truncated at every viewport.
- **Cause:** nowrap + ellipsis inside a monitor narrowed by the BUG-01 canvas/ticker feedback loop; the strip has ~160-170px to fit ~265px of text.
- **Suggested fix (guess):** fixing BUG-01's track recovers most of the room; additionally shorten the label ("GAUNTLET · TOR 3") and prioritize the value (`b { flex-shrink: 0 }`, let only the label ellipsize) — distance is the time-critical half.
- **Confidence:** high (measured in both languages, both viewports).

### BUG-22 · CORRECTED (round 6): field-target lock drop is CORRECT range-gating, not an instance bug
- **Round-5 claim** (lock no-ops before the instance switches) **is refuted** by the round-6 diagnostic (`.freebuff/bughunt-wreck.mjs`): after teleporting into mourning-line, `activeInstanceId` flips to `'mourning-line'` within one sim step (updateActiveInstance runs per step off `save.player.position`, game.js:1251-1263, called at :1498), `selectTarget('wreck', …)` **succeeds** (`targetAfter: "salvage-node-0"`), and the lock is then dropped ~1 step later by `maintainTargetLock` because the wreck sits far outside `stats.radarRange` from the field center (game.js:3090-3119, anchored targets hold only inside the sensor horizon). That is correct behavior; the round-5 probe locked a random distant node.
- **Remaining truth in the original observation:** the failure mode is silent — the monitor shows "—" with no "target lost — out of sensor range" message, so a player who locked a far wreck sees the lock vanish with no explanation. Cosmetic UX gap only.
- **Verdict:** not a bug; kept here as a corrected hypothesis with evidence. Salvage-pad coverage still requires teleporting to `wreckNodes[i].position`, not the field center.

### BUG-23 · Probe language key overrides the player's saved language forever (low, latent footgun)
- **Where:** `src/main.js:71` — boot resolves `setLanguage(localStorage.getItem('__VOID_PRIVATEER_PROBE_LANG__') ?? save.settings?.language)`. The probe/dev key wins over the player's saved choice and is never cleared; i18n.js itself persists a THIRD key (`'voidrunner-lang'`, i18n.js:26). Any dev/probe run in a real browser profile permanently pins that profile's language until manual cleanup.
- **Suggested fix (guess):** drop the probe key from the boot path (probes can set `save.settings.language` before `beginSession`, as they already set localStorage anyway), or clear it after read.
- **Confidence:** high on the code path; impact limited to dev profiles.

### Round-5 health checks (no findings)
- **Patrol reply chip:** seeded window renders "ANTWORT 9" / "REPLY 9", timer counts down cleanly (9 → 5), no clipping at either viewport — digit-width churn is a non-issue.
- **Syndicate berth card:** renders correctly in both variants — affordable (PAY enabled, fee + ledger note) and broke (PAY `disabled`, "You have 120 — not enough" path); 0 overflow findings.
- **EN dock matrix (desktop):** mirrors the DE findings exactly (market v-clip 852>628, mission v-clip 972>628, same 7.7-8.5px tiny-font set); no EN-specific overflow anywhere — BUG-14/15/17 are language-independent.
- **Race flow:** `acceptMission('race-shard-gauntlet')` accepts (entry fee deducted via quest flags) and the strip activates in flight; `syncRaceGates` gate meshes verified present in earlier rounds.

## Round 6 additions (game.js core sim deep-read)

Sections read end-to-end this round (the AGENTS.md-documented historic bug habitats): `resolvePlayerCollisions` (1965-2028), `updateAttackAI` (4283-4646), `updateTravelAI` (4647-4737), `resolveNpcCollisions` (4738-4806), `updateProjectiles` (4985-5122), plus the frame loop (1340-1429) and `updateActiveInstance` (1251-1271) earlier.

**No new bugs found.** Specifics verified:
- **Scratch discipline holds everywhere:** every `tmpA…tmpL/tmpP0…tmpP6` scratch is consumed before reuse inside `updateAttackAI` (r→predicted→desired on tmpI; w→cover→right on tmpJ; toCover→up on tmpK; tmpL staged through four cross products in strict order); the spiral-roll staging at 4591-4596 documents its own ordering constraint and honors it. No write into a scratch that aliases live state; writes back via `tupleInto`/`quatTupleInto` only.
- **Zero-vector normalizes are all guarded** (`lateral`/`peekLateral` lengthSq checks at 4364/4471, `right` at 4566, `upV` at 4535); three.js `normalize()`'s divide-by-(length||1) covers the rest, and a degenerate `lead` vector can't reach `fireNpcGun` (facing gate 4643 can't pass with a zero dot).
- **Collision passes are NaN-hardened:** degenerate contacts skipped (1984), impact damage capped at 25% max hull for NPCs (4770), inward-velocity check before rebound (4762), finite-commit guard on the player transform (1916-1927, read round 3).
- **Projectile sweep:** pierce re-sweep bookkeeping (`lastHitId`, remaining-step math 5106-5112) is correct; missile homing handles dead/vanished targets by flying straight (4999-5002); mortar splash skips dead/race ships; slot store writes happen exactly once per terminal branch.
- **Frame loop:** edge actions per frame, sim per fixed step, accumulator capped and modal-frozen; audio params NaN-guarded before the Web Audio graph.

Combined with earlier rounds, the now-covered game.js surface includes: constructor/arena setup, frame loop, updateSimulation, updatePlayer, resolvePlayerCollisions, weapons/missiles, mining/salvage extraction entry points, targeting (select/apply/maintain/cycle), hyperdrive toggle + intercept, ship update dispatch, chatter lines, search/patrol-arrest AI, attack/travel AI, NPC collisions, projectiles, damage, mug standoff lifecycle. Remaining unread: encounter spawning internals, destroyShip aftermath, updateSearchAI details, save/load interplay in game.js — queued for round 7.

## Round 7 additions (BUG-24 confirmed, salvage pads verified, encounters/destroy read)

### BUG-24 · CONFIRMED: splash/burn kills throw inside the frame guard and silently lose the combat drop
- **Chain (empirically confirmed, full stack trace from `.freebuff/bughunt-killloop.mjs`):** mortar splash passes `position: undefined` to `damageShip` (game.js:5092) and burn ticks do the same (game.js:3309) → a killing blow reaches `destroyShip(ship, attackerId, undefined)` (game.js:5271) → the 64% combat-drop roll calls `spawnPickup(…, position, 'combat')` (game.js:5650) → `vec(origin)` dereferences `origin[0]` on undefined (game.js:583) → **`TypeError: Cannot read properties of undefined (reading '0')`**. Stack: `vec ← spawnPickup ← destroyShip ← damageShip`.
- **In-game surface:** the call happens inside `frameBody`, so the frame guard (game.js:1321-1335) catches it — no freeze, but that sim step aborts mid-way (subsystems after the throw skip a step), the throttled `console.error('Frame error (sim continues)')` fires, and **the combat drop loot never spawns**. Mortar is a standard purchase and burn (4s × 6dps) exists to finish softened ships, so this is a normal combat outcome: every mortar/burn kill loses its drop ~64% of the time.
- **Suggested fix (guess):** default the parameter — `destroyShip(ship, attackerId, position = ship.position)` — or pass `ship.position` at the two `damageShip(…, undefined)` call sites; hardening `vec()` to throw a clearer error is orthogonal.
- **Severity:** medium (lost loot + aborted sim step + error spam; not a crash thanks to the frame guard).
- **Confidence:** high — reproduced with stack trace.

### Round-7 coverage win: salvage pads verified (closes the round-4/5/6 gap)
- Teleporting to `wreckNodes[0].position` (not the field center) + `selectTarget('wreck', id)` → pads switch to **`touch-fire is-salvage` / `touch-missile is-scan`**, readout "MACHINERY · 4 LEFT" / "ARMAMENTS · 2 LEFT" across two runs. The contextual-pad design (target-driven, salvage flavor teal) works end to end. Scan shows only the known BUG-01/tiny-font findings.

### Round-7 static reads (no new bugs)
- **`updateDynamicEncounters` (game.js:5773-5989) + policePresence/holdWorth/updateStationTraffic:** all gates correct (arena/race/standoff suppression, encounter stacking lock at 5800, dock-proximity skip, seeded per-roll rng, quiet-lane tail). Notes: the beam-standoff timer reset appears twice (5787 and 5836 — redundant, idempotent, harmless); gold-heat demands 1 gold even from an empty hold (5968) — reads as intentional "suspected hoard" pressure; `holdWorth` guards unknown commodity ids.
- **`destroyShip`/`damagePlayer`/`recoverPlayer`/`updateBountySpawns` (5613-5762):** double-payout guards for captured ships correct; armor model (absorb 85%, leak 28% of absorbed) is deliberate tuning; `recoverPlayer` relies on `lastDockedAt` being migration-defaulted (save.js fallback covers it); bounty respawn only while the mission is active, so a player kill can't be farmed.
- **Ops note:** the :4173 dev server died between rounds (probes then failed confusingly — one probe hit the service-worker reload window first). Restarted as a background job; future probe runs should `curl -s http://127.0.0.1:4173/` first.


## Round 8 additions (racing gameplay leg, search AI)

### BUG-21 STRENGTHENED · In a live race the strip clips the rank+clock, not just distance
- Flying the actual Shard Gauntlet (entry accepted, countdown consumed, race `running`): the strip label reads "SHARD GAUNTLET · TOR 1/13" (**193>167**, gate counter cut) and the value segment carries **"4. · 00:06" — live rank + race clock** (**73>63**). The rank/time composition makes the value clip permanent (~10 chars at all times), so during a race the player loses gate count, rank AND clock on one viewport or the other. Same root (BUG-21/BUG-01 absolute strip in the narrowed monitor); the fix priority stands, with "value carries rank+clock" added to the case for `flex-shrink: 0` on the value.
- **Gate mechanics verified correct:** passage is an ordered pure-distance check (`playerDistance <= nextGate.radius`, game.js:1619) — no velocity/plane-crossing requirement; the grid countdown pins velocity and defers the gate check (1593-1602), so a 3s countdown eats gate 0 for a stationary ship (my probe out-ran it and skipped out of order — probe artifact, logged so the next racing probe waits out the countdown at gate 0). Zone-abandon fail (1589), travel-deadline fail (1576), countdown beeps ≤3s (1597) all behave.

### BUG-25 · `updateSearchAI` allocates per ship per step in a hot path (low, perf)
- **Where:** `src/game/game.js:3792-3793, 3816, 3852` — bare `vec(...)`/`tuple(...)` calls allocate fresh `Vector3`s/arrays every frame for every patrol and every hostile targeting the player (up to ~17 ships → ~40-70 small allocations/sec while contacts are active), plus more inside the search branches.
- **Symptom:** none directly measurable at current fleet sizes; it contradicts the documented allocation-free AI discipline (AGENTS.md: "adding `new THREE.Vector3()`/`clone()` into these hot paths reintroduces GC hitches") and grows linearly with encounter density on weak phones.
- **Suggested fix (guess):** route through the session's `tmpD..tmpL` scratches like the attack/travel AI does (`vec(ship.position, this.tmpX)`), keeping the tuples only where they're stored (`lastResolvedPlayer`).
- **Confidence:** high on the allocations (read); impact assessment is extrapolation.

### Round-8 notes
- Probe-environment quirk (not the game): some headless runs get a 520px-tall viewport instead of 720 despite `--window-size=1280,720` — the compact-layout media queries fire inconsistently between runs. Probe scripts should pin `Emulation.setDeviceMetricsOverride` explicitly (round-1/2 probes did; round-8's didn't).
- Race finish/rank toast remains unverified (requires flying all 13 gates in order; teleport skips the countdown-deferred gate). Queued with a corrected sequencing plan.


## Round 9 additions (racing finish leg — verified end to end, no new bugs)

- **Full race flow verified:** entry fee −500 cr at accept → travel state → grid placement + 3s countdown ("STARTGRID / T-n" on the strip) → running → 13 gates passed strictly in order → `finishRace` → **payout +4200 cr for rank 1** (2700 → 6900 measured), `activeRace` cleared, strip persists with the final result ("SHARD GAUNTLET · TOR 13/13 · 1. · 00:05"). Entry, countdown, ordered gate passage, rank, and payout all correct.
- **Documented for future probes (not a bug):** `startRaceAt` places the player on the start grid **1.8 × gateRadius behind gate 0** (measured exactly 94 ≈ 52 × 1.8 units), so a stationary ship at the gate center never crosses — the earlier "stuck at TOR 1" probe attempts were this correct behavior plus the countdown deferring the gate check. Gate passage itself is a plain ordered distance check (game.js:1619).
- Probe-side gap noted: the finish toast/announcement wasn't captured by the selector used (payout and strip prove the flow regardless).


## Fix verification (round 9)

- **BUG-01's suggested fix was applied to the working tree during the hunt** (not by this hunt — `git diff` shows `grid-template-columns: minmax(0, 1fr)` added to `.screen-ship-layout` in src/style.css with a comment citing the canvas-bitmap/ticker inflation mechanism). Verified empirically with the original measuring probes:
  - `bughunt-culprit.mjs`: monitor scrollWidth **252 = clientWidth 252** (was **315 > 252**) — the canvas no longer inflates the track.
  - `bughunt-inflate.mjs`: after locking a far target (the case that measured **447 > 252** in round 3), scrollWidth stays **252 = 252** with zero children exceeding the monitor — the dynamic inflation is gone too.
- Remaining watch-item: the race/standoff strips (BUG-20/21) sit inside the same monitor and should now have ~63px more room; their clipping should be re-measured in the next regression sweep.

## Round 10 — agent B fixes (BUG-07, BUG-09, BUG-18, BUG-19, BUG-23)

All four are **in the working tree, uncommitted** — Agent A, please fold them into your next incremental commit. Files touched by agent B: `src/game/laserFx.js`, `src/game/random.js`, `src/game/missions.js`, `src/main.js`, and exactly two lines in `src/game/ui.js` (random.js import gains `formatNumber`; `#screen-target-distance` uses `formatNumber(target.distance)`). Do not revert those two ui.js lines when editing the race-strip/drawRadar blocks.

| Bug | Fix | Verification |
| --- | --- | --- |
| BUG-07 (flash clone leak) | `flashMaterial` sets `clone.userData.shared = false` after `base.clone()` — the clone had inherited the cache flag through Material.copy's deep userData copy, so `disposeObject` skipped every per-shot flash material. The clone's map texture keeps its own `shared` flag (textureFor), so the cache survives disposal. | Firing smoke in arena: effects list alive (2 effects / 1 sprite at read), **0 console errors** across the session (`.freebuff/probe-round10-verify.mjs`) |
| BUG-09 (EN-only number formatting) | New locale-aware `formatNumber`/`formatCredits` in random.js (`de-DE`/`en-US` grouping, NaN → `'0'`, negatives clamp to 0); target-distance readout uses `formatNumber`. | Live in DE session: **"3.200 cr"**, distance **"261.368 km"**, `formatCredits(NaN) === '0 cr'`, `formatCredits(-50) === '0 cr'` |
| BUG-19 (cycle parse NaN on race-first boards) | `refreshMissionOffers` now extracts the cycle only from numeric dash segments, so `race-<course>` ids at index 0 no longer poison the guard. | Syntax-verified; behavioral note kept honest: the original defect was masked by seed-deterministic regeneration, so there is no observable before/after — the fix removes the latent re-roll trigger. Race flow re-verified working in round 9. |
| BUG-23 (probe key overrides saved language) | `beginSession` treats `__VOID_PRIVATEER_PROBE_LANG__` as single-shot: read → apply → `removeItem`. | Live: with key `en`, first boot's session language is `en` and the key is gone; later boots keep the key absent. |
| BUG-18 (untranslated race briefing) | Entry fee + payout ladder wrapped in `t()` with placeholders (missions.js); rank list language-neutral (`1: 4.200`); DE catalog gains `'Entry is {fee} cr. Payouts by rank: {ranks}.'` and `' (pay-in)'`. | Live German mission board: "Der Einsatz beträgt 500 cr. Auszahlungen nach Rang: 1: 4.200, 2: 1.600, 3: 300 (Einzahlung), 4: 800 (Einzahlung)." — zero EN fragments (`.freebuff/probe-bug18-verify.mjs`, 3/3 checks) |

Verification probe: `.freebuff/probe-round10-verify.mjs` — **8/8 checks pass**; BUG-18 probe `.freebuff/probe-bug18-verify.mjs` — **3/3**. Files touched by agent B now also include `src/game/i18n-de.js` (two catalog entries). Known pre-existing quirk left as-is (not in scope): the probe key path never writes `save.settings.language`, so a probe-forced language applies to the session but not to a *new* save's settings mirror (matches the pre-fix flow).


## Suggested next rounds

1. Agent B (next): BUG-18 (race briefing i18n — missions.js + i18n-de.js), then the CSS family (BUG-05/06/08/10/11/12/14/15/16/17) once Agent A's style.css sections settle; re-measure BUG-20/21 strips post-BUG-01-fix.
2. Regression sweep of all findings via the full probe suite (probe-bughunt 1-5, bughunt-followup/culprit/scroll/inflate/wreck/killloop/racefinish, probe-round10-verify — server on :4173, check it's alive first).
3. Remaining game.js corners: encounterPosition helpers, save/load interplay inside game.js.
4. Optional: audio subsystem pass (autoplay policy, node leaks) — audio.js untouched so far.
