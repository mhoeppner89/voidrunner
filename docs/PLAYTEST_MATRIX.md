# Full-gameplay playtest matrix

This is the working checklist for the ongoing gameplay polish audit. A row is green only when the current build has deterministic logic coverage and, where the feature is visible or interactive, a live browser check. Passing an old or ignored probe alone is not enough.

Last updated: 2026-08-31, build 0.7.31.

| Player-facing area | Status | Current evidence | Next gap |
| --- | --- | --- | --- |
| New game, save, resume, migration, delete | Green | `save.test.mjs`; lifecycle 52/52; true first-run preferences; corrupt/non-finite state rejection; arena isolation | Recheck title/resume controls after the next menu change |
| Keyboard, touch, gamepad, tilt, focus loss | Green | `input.test.mjs`; tilt 14/14; lifecycle 52/52; blur/hidden-tab pause and deliberate resume | Manual physical-device feel remains subjective |
| Basic flight, throttle, afterburner, fuel, autopilot | Green | flight regression 15/15; fixed-step 26/26 | Add a long free-flight soak when performance work resumes |
| Galaxy routes and gate travel | Green | galaxy 54/54; both-direction automatic gate crossing; free jumps; cargo-scaled piracy | None in the current four-system network |
| Sector and galaxy maps | Green | desktop and 844×390 captures; route, orbit, sun, and label checks | Recheck after any location-count increase |
| Docking, landing, repair, refill | Green | career services 7/7; exact cost, state, persistence, refusal; flight regression docking | Add insurance recovery UI to the next lifecycle browser pass |
| Markets, cargo, remote intel, bar tips | Green | market 13/13; economy unit suite; desktop and phone captures | Full buy-fly-sell route remains a useful future economy soak |
| Shipyard, outfitting, fire groups | Green | station 291/291; fleet/loadout 41/41 across all six hulls and 18 items; every gun/launcher fired; A/B groups, invalid drafts, collision, damage, and save/resume persistence | Recheck when a hull, mount, or outfitting rule changes |
| Mining and scanning | Green | resource extraction 32/32; contract payout 61/61; range, scan, LOS, cargo-full, yield, depletion, payout, stats, guild progress | None in the current claim flow |
| Wreck salvage and scanning | Green | resource extraction 32/32; contract payout 61/61; LOS, cargo-full, pickup, depletion, exact claim target and return vector | Inspect and improve the remaining generic salvage-node silhouettes |
| Contract generation and accounting | Green | mission suite plus live payout 61/61: delivery, transport, smuggle, mining, bounty, salvage, expiry, bonds, stats, ranks | None in the current contract roster |
| Salvage contracts | Green | exact real wreck target, integer/fractional progress, cockpit/map/menu guidance, UI acceptance, return vector, final dock payout | Improve the generic salvage-node silhouettes |
| Racing | Green | 26/26 live checks across all six courses; exact hollow-ring collision; 30-seed world geometry suite | Human handling/balance pass for each recommended ship |
| Player damage, death, towing, arena reset | Green | player lifecycle 19/19; recovery/insurance 39/39; exact shield overflow, fees, cargo/mission loss, save/resume, Arena isolation, and inspected recovery/death captures | Recheck when recovery penalties or death presentation changes |
| Missiles and torpedoes | Green | player lifecycle live homing, ammo, impact, and torpedo splash checks | Countermeasure/PDC interaction belongs with weapon-roster pass |
| Gun roster and special effects | Green | weapon roster 17/17: all seven guns, ammo, gauss penetration, PDC intercept/vent, ripper spread, ion disruption, mortar splash/burn, fire groups, save round-trip | Recheck when a weapon or mount type changes |
| NPC combat and navigation | Green | AI 100–102/102 plus mixed-field soak 143/143 over ten fresh seeds and 1v1/1v3/2v3; pursuit, fire/damage, evasion, collision, cleanup, and slot recycling | Keep the characterized low-progress debris pursuit case in the soak when navigation changes |
| Surrender, capture, mugging, jettison, patrol comms | Green | encounter branches 28/28: surrender, scan/capture/kill, cargo/credit demands, refusal, jettison, searches, replies, dark-running consequences, localized controls | Recheck when an encounter branch changes |
| Pause, options, language, fullscreen, rotate/focus freeze | Green | lifecycle 52/52 on desktop and touch: first-run settings, reloads, focus/hidden freeze, deliberate resume, maps, overlays, orientation | Physical fullscreen/orientation permission prompts remain browser-specific |
| Audio and music | Green | audio scenes 32/32: dock/station identity, open/planet/field/graveyard/combat, all systems, volume/full mute persistence, graph reuse, context disposal, quit/resume | Recheck when a new music context or sound bus ships |
| Station readability and location art | Green | 291/291 station checks; 29 station captures; current v5/v6 asset routing | Recheck only when copy, art, or responsive layout changes |
| Cockpit readability | Green | 139/139 across desktop, tablet, and landscape phone in English/German | Recheck when a new warning or telemetry state is added |
| Wreck-field collision and open hulls | Green | natural-wreck collision suite; 30-seed world geometry; shared client screenshot | Add a human high-speed race/fight pass through every open capital belly |
| Performance and long-session stability | Green | performance/lifecycle soak 23/23 across open space, asteroid and debris fields, combat/entity churn, route/instance travel, pause/resume, save round-trip, stable DOM/listeners, bounded frame times, and clean diagnostics | Repeat after a renderer, entity-lifecycle, or navigation change |

## Rule for closing the audit

The audit is complete only when every Partial row is green, all permanent root probes pass without unexplained red results, representative desktop and touch screenshots have been inspected, and a final clean full-suite run is recorded in `progress.md`.
