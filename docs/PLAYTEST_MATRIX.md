# Full-gameplay playtest matrix

This is the working checklist for the ongoing gameplay polish audit. A row is green only when the current build has deterministic logic coverage and, where the feature is visible or interactive, a live browser check. Passing an old or ignored probe alone is not enough.

Last updated: 2026-08-31, build 0.7.31.

| Player-facing area | Status | Current evidence | Next gap |
| --- | --- | --- | --- |
| New game, save, resume, migration, delete | Green | `save.test.mjs`; corrupt/non-finite state rejection; arena isolation | Recheck title/resume controls in the browser after the next menu change |
| Keyboard, touch, gamepad, tilt, focus loss | Green | `input.test.mjs`; tilt 14/14; fixed-step 26/26 | Manual physical-device feel remains subjective |
| Basic flight, throttle, afterburner, fuel, autopilot | Green | flight regression 15/15; fixed-step 26/26 | Add a long free-flight soak when performance work resumes |
| Galaxy routes and gate travel | Green | galaxy 54/54; both-direction automatic gate crossing; free jumps; cargo-scaled piracy | None in the current four-system network |
| Sector and galaxy maps | Green | desktop and 844×390 captures; route, orbit, sun, and label checks | Recheck after any location-count increase |
| Docking, landing, repair, refill | Green | career services 7/7; exact cost, state, persistence, refusal; flight regression docking | Add insurance recovery UI to the next lifecycle browser pass |
| Markets, cargo, remote intel, bar tips | Green | market 13/13; economy unit suite; desktop and phone captures | Full buy-fly-sell route remains a useful future economy soak |
| Shipyard, outfitting, fire groups | Green | station 291/291; outfitting and ship-trade suites; real install and A/B persistence | Exercise every hull/loadout combination in combat |
| Mining and scanning | Green | resource extraction 31/31; range, scan, LOS, cargo-full, yield, depletion, stats, guild progress | Live mining-contract payout at the issuing dock |
| Wreck salvage and scanning | Green | resource extraction 31/31; LOS, cargo-full, pickup, depletion, exact claim target and return vector | Inspect and improve the remaining generic salvage-node silhouettes |
| Contract generation and accounting | Green | mission suite: delivery, transport, smuggle, mining, bounty, race, salvage, expiry, bonds, ranks | Browser-complete delivery/smuggle/bounty/mining payouts |
| Salvage contracts | Green | exact real wreck target, integer progress, map/target/menu guidance, return vector; fractional-final-unit regression | Browser-click acceptance and final dock payout |
| Racing | Green | 26/26 live checks across all six courses; exact hollow-ring collision; 30-seed world geometry suite | Human handling/balance pass for each recommended ship |
| Player damage, death, towing, arena reset | Green | player lifecycle 19/19; layered damage and loss accounting | Visual insurance/recovery screen review |
| Missiles and torpedoes | Green | player lifecycle live homing, ammo, impact, and torpedo splash checks | Countermeasure/PDC interaction belongs with weapon-roster pass |
| Gun roster and special effects | Partial | combat-resource unit suite; older full roster probe exists | Promote and rerun current pulse/gauss/PDC/ripper/ion/mortar behavior |
| NPC combat and navigation | Partial | AI 100–102/102 with two known debris pursuit flakes; exact collision suites | Isolate the pursuit flakes and run longer mixed-field combat soaks |
| Surrender, capture, mugging, jettison, patrol comms | Partial | implementation and older focused probes exist | Current live end-to-end regression for every branch and localized action label |
| Pause, options, language, fullscreen, rotate/focus freeze | Partial | readability and input coverage; older rotate/pause probe | One current browser lifecycle probe covering every overlay and return path |
| Audio and music | Partial | older audio, station-music, and planet-music probes | Current settings persistence, context suspend/resume, and scene-transition pass |
| Station readability and location art | Green | 291/291 station checks; 29 station captures; current v5/v6 asset routing | Recheck only when copy, art, or responsive layout changes |
| Cockpit readability | Green | 139/139 across desktop, tablet, and landscape phone in English/German | Recheck when a new warning or telemetry state is added |
| Wreck-field collision and open hulls | Green | natural-wreck collision suite; 30-seed world geometry; shared client screenshot | Add a human high-speed race/fight pass through every open capital belly |
| Performance and long-session stability | Partial | fixed-step/store/perf architecture probes; clean focused browser consoles | Current 10–20 minute combat/travel soak and relative frame-time capture |

## Rule for closing the audit

The audit is complete only when every Partial row is green, all permanent root probes pass without unexplained red results, representative desktop and touch screenshots have been inspected, and a final clean full-suite run is recorded in `progress.md`.
