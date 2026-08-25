# RELEASE_NOTES v0.6.0a — Bar Circuit Racing

## The race quest line

Two circuits are posted at the bars, run by the house:

| Circuit | Bar | Zone | Gates | Entry | 1st / 2nd / 3rd / 4th |
|---|---|---|---|---|---|
| Shard Gauntlet | Helix (Pit Boss) | Shardbelt | 13 · wide | 500 cr | +4200 / +1600 / −300 / −800 |
| Mourning Run | Rook (Union Steward) | Mourning Line | 18 · tight wreck corridor | 1200 cr | +9200 / +3400 / −600 / −1500 |

- Accept the contract at the bar; the entry fee is charged up front and the nav computer locks the course zone.
- Fly into the zone and approach Gate 1: the ship snaps to a grid slot beside three hired pilots, a countdown holds everyone on the mark, then green — pass every gate in order.
- Rank is live: finished pilots and track position decide who is ahead, gate by gate.
- Payout swings by rank — podium finishes pay hard, bottom spots cost the entry again. The board's clock starts at purchase (15 minutes); an expired or abandoned ticket is forfeit.
- Finishing writes rank and time to persistent per-course records; a paid-but-unraced entry survives a reload.

## Flight feel

- Ideal straight-line flight through the Shard Gauntlet measures ≈112 s on the regression seed; real flying with turns, rock avoidance, and racing traffic lands runs in the requested 2–3 minute window. The Mourning Run trades width for speed: small gates (34 u), dead hulls for cover, faster hired pilots.
- Difficulty scales by corridor: the Gauntlet's wide gates reward clean lines through drifting rocks, while the Run squeezes pilots between wrecks.

## Cockpit presentation

- Race telemetry rides the own-ship monitor as one compact strip: travel distance to Gate 1 → grid countdown (`T-3…`) → `GATE 4/13 · 2ND · 01:24`. No floating HUD cards.
- Gate markers are pooled glowing rings placed at render rate: next gate pulses bright teal, upcoming glow soft, passed fade dim. They are render-only and never tappable targets.
- Countdown ticks, gate chimes, and finish stingers reuse the existing audio chain (`ui`/`success`/`warning`), panned and distance-filtered like every other effect.

## Engineering

- New module `src/game/racing.js` (course generation from the world seed, racer grid construction, allocation-free kinematic pursuit driver, rank labels, payouts). Added to the service-worker cache list.
- `game.js`: `acceptRace` → travel leg → `startRaceAt` grid handoff → `updateRace` state machine (travel/countdown/running/terminal), `finishRace`/`failRace` settlement with records, `restoreActiveRace` reload recovery, and a no-ambush guard so dynamic encounters never stack onto a live run.
- Racers are excluded from the trade/combat AI, ship-ship contact resolution, and hyperdrive intercepts: they are props of the run, not combatants.
- Robustness: degenerate collision contacts (zero-length normals, buried spawns) are skipped in both player and NPC resolution paths instead of writing NaN into live transforms; race grid spawns request obstacle clearance and non-overlapping hull slots.
- German catalog entries added for all new strings; rank labels localize (`1.`–`4.`).

## Validation

- `.freebuff/probe-racing.mjs`: **19/19** headless checks on a pinned world seed — offer posting, fee deduction and double-entry refusal, travel handoff, grid start (racers on the radar, gates pooled), velocity-pinned countdown, full 13-gate run at cruise with live rank, payout-by-rank arithmetic, quest closure, field cleanup, paid-entry reload restore, expiry forfeit with re-offer, and save round-trip integrity. Zero page exceptions.
- Regression suites re-run after the collision hardening: theme **7/7**, sim-fixed **26/26**, store **8/8**; hyperdrive-fx **24/30** and ai **98/101** with every failure reproduced byte-identically on the untouched v0.5.0e baseline (stale English-string assertions and SwiftShader-timing flakes, documented, not chased).

Service-worker cache: `voidrunner-v105-0-6-0a-bar-circuit-racing`.
