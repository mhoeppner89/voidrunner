# Voidrunner fleet matrix — role / tier roster and NPC standard fits

Game version `0.8.2es` (sw cache `voidrunner-v383-0-8-2es-fleet-ladder-draws`).
Everything below is read from the shipping modules, not from design notes:

- Hull stats, tier, role, price: `src/game/data.js` (`SHIPS`), `src/game/leagueContent.js` (`LEAGUE_HULLS`)
- Hardpoints: `src/game/outfitting.js` (`HULL_HARDPOINTS`, turret counts come from `src/game/turretLayouts.js`)
- NPC standard fits: `src/game/enemyLoadouts.js` (`HULL_NPC_FITS`) — resolved through `createEnemyLoadout()`
- Who flies what: `src/game/factions.js` (`FACTION_FLEETS`, `GUILD_SHIP_PREFERENCES`)
- `tier` reads as a career step **and** as a combat band: the fleet is balanced so a tier-3 combat hull out-fights a tier-2 and a tier-2 out-fights a tier-1, while a tier-3 hauler fights at the tier-2 combat level. `.freebuff/balance/main-loadouts.mjs` grades exactly that ladder on the shipping main loadouts; §6 of this file records where it stands.

19 hulls ship today: 15 player-flyable + 4 never-flyable Concord capitals. Two utility drones (mining, combat/PDC) round out the model set.

## 1. Flyable hulls — role / tier matrix

Cruise/boost are simulation units (HUD speed = ×2). `Reactor/cap` is reactor output per second over capacitor size: the reactor is the sustain rate, the capacitor is the burst budget that guns and shield recharge both spend from. Mounts are hardpoint sizes in order; `—` means no bay of that type.

| Hull | Class | Tier | Role | Built for | Price | Cruise/boost | Reactor/cap | Shield/hull | Cargo | Guns | Launchers | Turrets | Utility | Drone bays |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Wayfarer `wayfarer` | MPR-7 Utility Cutter | 1 | allrounder | Frontier starter | starter | 50/75 | 12/60 | 110/190 | 32 | S/S | S | S | M/S | 1 (mine) |
| Speedster `speedster` | Courier Interceptor | 1 | interceptor | Alliance (League) | 20,000 | 72/112 | 16/65 | 110/160 | 12 | S/S | S | — | S | 0 |
| Scrapper `scrapper` | Four-gun Pirate Fighter | 1 | fighter | Pirate yard | 18,000 | 62/100 | 18/70 | 105/180 | 12 | S/S/S/S | S | — | S | 0 |
| Talon `talon` | TX-4 Courier Interceptor | 2 | interceptor | Concord frontier | 40,000 | 76/128 | 26/80 | 165/215 | 16 | S/S/M | S | — | S | 0 |
| Demon `demon` | Twin-hull Interceptor | 2 | interceptor | Pirate yard | 44,000 | 78/132 | 22/80 | 155/215 | 14 | S/S/S/S | S | — | S | 0 |
| Legionary `legionary` | Alliance Line Fighter | 2 | fighter | Alliance (League) | 45,000 | 76/120 | 18/85 | 175/310 | 20 | M/M | M | S | S | 0 |
| Andromeda `andromeda` | Heavy Strike Fighter | 2 | bomber | Alliance (League) | 48,000 | 56/90 | 21/85 | 150/295 | 24 | M/M | M/M | S | S | 0 |
| Prospector `prospector` | BP-2 Rock Hauler | 2 | industrial | Concord frontier | 35,000 | 40/60 | 10/70 | 85/275 | 96 | S | S | S | M/M/S | 3 (mine) |
| Torsas `torsas` | Armed Transport | 2 | allrounder | Alliance (League) | 45,000 | 46/72 | 14/70 | 120/260 | 64 | S/S | S | S | M/S | 2 (mine) |
| Mule `mule` | Armored Medium Freighter | 2 | transport | Pirate yard / open | 62,000 | 40/60 | 12/80 | 115/310 | 128 | S/S | S | S/S | M/S | 0 |
| Lancer `lancer` | LN-9 Pursuit Hunter | 3 | interceptor | Concord frontier | 90,000 | 82/138 | 26/90 | 185/275 | 30 | M/M | M/M | M | S | 0 |
| Vanguard `vanguard` | VX-22 Frontier Heavy | 3 | bomber | Concord frontier | 95,000 | 48/72 | 24/100 | 200/390 | 42 | M/M | M/M/M | S/S | M/S | 0 |
| Atlas Hauler `atlas` | AT-5 Bulk Freighter | 3 | industrial | Concord frontier | 100,000 | 34/51 | 11/85 | 140/350 | 176 | M | M | S/S/S/S | M/M/S/S | 4 (mine) |
| Blade `blade` | BL-3 Heavy Fighter | 3 | fighter | Concord frontier | 120,000 | 61/98 | 20/95 | 205/345 | 22 | M/M | M/M | S/S/S | S | 0 |
| Astra `astra` | Expedition Cutter | 3 | allrounder | Alliance (League) | 90,000 | 60/96 | 17/85 | 165/285 | 88 | M/M | S | — | M/S | 2 (mine) |

Career progression (`progressesTo`): Wayfarer → Torsas / Prospector / Talon / Legionary / Andromeda; Speedster → Talon; Scrapper → Legionary; Demon → Lancer; Talon → Lancer; Mule → Atlas; Prospector → Atlas; Legionary → Blade; Andromeda → Vanguard; Torsas → Astra.

Sale locations: Speedster helix/haven/league-yard/cinderfall · Talon helix/azure/meridian-prime/blackglass/nacre · Legionary + Andromeda helix/league-yard · Mule helix · Atlas helix/vesper/meridian-prime/argent/cinder/boreal · Lancer rook/meridian-prime/argent · Vanguard rook/argent/blackglass · Blade rook/argent · Prospector vesper/blackglass/cinder/nacre/boreal · Torsas + Astra haven/league-yard/cinderfall · Scrapper + Demon blackglass.

## 2. Capital ships (authored, never player-flyable)

| Hull | Length | Cruise/turn | Shield/hull | Armament | Home / hull name |
|---|---|---|---|---|---|
| Concord Frigate `concord-frigate` | 213 u | 18 / 0.12 | 1,400 / 2,600 | Authored battery + PDC mount set (`FRIGATE_MOUNTS`), fire range 840 | CPV Resolute (meridian-prime), CPV Wayguard (rook) |
| Concord Cruiser `concord-cruiser` | 1,066 u | 9 / 0.12 | 5,800 / 10,500 | Cruiser armament + subtargets, fire range 1,900 | CNS Arbiter (gatehouse-twelve) |
| Concord Carrier `concord-carrier` | 1,803 u | 4.5 / 0.06 | 9,800 / 20,000 | Carrier armament, hangars, fire range 2,450 | CNS Aegis (meridian-prime) |
| Concord Battleship `concord-battleship` | 2,251 u | 5 / 0.055 | 12,000 / 24,000 | Capital battery, fire range 2,700 | CNS Vigilance (meridian-prime) |

Capitals keep their authored Concord paint, load on demand, and use the capital combat path (`capitalCombat.js` / `cruiserCombat.js`) instead of a fighter loadout.

## 3. NPC standard loadouts (every hull, one stock fit)

`HULL_NPC_FITS` is tier-independent: `novice`, `veteran` and `ace` pilots fly the **same** guns, racks, turrets and stores — only `pilot.tier` stats (aim/reflex/evasion) change. `fitId` is `<hull>-standard`; observer presets and arena scenarios override it with `scenario`/`balanced`/`assault`/`support`/`beam`. Doctrine role comes from the primary gun of the fit — the last filled forward mount (`profileForWeapons`): interceptor (<100 reach), fighter (100–299), gunship (≥300).

| Hull | Fit ID | Doctrine (range) | Guns | Launchers (racks × rounds) | Turrets | Power / drive / defense |
|---|---|---|---|---|---|---|
| Scrapper | `scrapper-standard` | fighter (235) | 4× Pulse Cannon | Seeker ×4 | — | — |
| Demon | `demon-standard` | interceptor (85) | 2× Pulse Cannon + 2× Ripper Scattergun | Seeker ×4 | — | — |
| Talon | `talon-standard` | interceptor (85) | 2× Pulse Cannon + Ion Projector | Anti-Shield Seeker ×4 | — | — |
| Speedster | `speedster-standard` | fighter (235) | 2× Pulse Cannon | Seeker ×4 | — | Fast-Recovery Shield |
| Legionary | `legionary-standard` | interceptor (85) | Pulse Mk II + Ripper Scattergun | Seeker ×4 | — | High-Output Reactor |
| Andromeda | `andromeda-standard` | gunship (410) | Pulse Mk II + Gauss Cannon | Torpedo ×2 **and** Swarm ×12 | 1× PDC | — |
| Lancer | `lancer-standard` | interceptor (85) | Pulse Mk II + Ion Projector | Seeker ×4 + Anti-Shield Seeker ×4 | 1× PDC | Manoeuvring Thrusters |
| Blade | `blade-standard` | gunship (410) | Pulse Mk II + Gauss Cannon | Seeker ×4 + Anti-Shield Seeker ×4 | 3× PDC | High-Output Reactor |
| Vanguard | `vanguard-standard` | gunship (300) | Pulse Mk II + Plasma Mortar | Torpedo ×2 + Torpedo ×2 + Swarm ×12 | 2× PDC | Dual-Layer Shield Grid |
| Wayfarer | `wayfarer-standard` | fighter (240) | 2× Beam Emitter | Seeker ×4 | 1× PDC | — · drones: 1× attack |
| Torsas | `torsas-standard` | fighter (240) | 2× Beam Emitter | Seeker ×4 | 1× PDC | — |
| Astra | `astra-standard` | gunship (410) | Beam Emitter + Gauss Cannon | Seeker ×4 | — | — |
| Prospector | `prospector-standard` | fighter (235) | Pulse Cannon | Seeker ×4 | 1× PDC | — · drones: 1× PDC |
| Atlas Hauler | `atlas-standard` | gunship (410) | Gauss Cannon | Seeker ×4 | 2× PDC (2 of 4 mounts manned) | Dual-Layer Shield Grid · drones: 2× PDC |
| Mule | `mule-standard` | fighter (235) | 2× Pulse Cannon | Seeker ×4 | 2× PDC | — |

Notes:
- Racks are **independent magazines**: `createEnemyLoadout` builds one rack per launcher bay, each with `LAUNCHERS[id].capacity` rounds (seeker/anti-shield 4, swarm 12, torpedo 2). The Andromeda picks torpedoes for capital targets and swarms for fighters, falling back to the remaining rack when depleted.
- Beams fire as separate pulses (`beam : 0.4 s` cadence), so a beam fit still counts as a two-gun forward battery.
- Utility and power/drive/defense bays are empty in most stock fits; only the hulls listed carry a stock module. A scenario/observer fit (`balanced`/`assault`/`support`/`beam`) can fill them, and `itemFitsMount` falls a too-large item back to the universal Pulse Cannon on a small bay rather than building an illegal ship.

### Weapon change with proximity role

| Doctrine | Driven by | Pass / reset spacing | Fits |
|---|---|---|---|
| interceptor | range < 100 | 30 / 140 | Demon, Talon, Lancer, Legionary |
| fighter | 100–299 | ~70–72 / ~188–192 | Scrapper, Mule, Wayfarer, Torsas, Speedster, Prospector |
| gunship | ≥ 300 | 90–123 / 240–328 | Vanguard, Atlas, Blade, Andromeda, Astra |

## 4. Who flies what (spawn tables)

Concord (`FACTION_FLEETS.concord`): patrol Talon / Blade / Vanguard · escort Talon / Blade · trader Mule / Atlas.
Alliance (League): patrol Legionary / Speedster / Andromeda / Lancer · escort Speedster / Legionary · trader Torsas / Astra.
Independents: trader Mule / Atlas / Torsas · miner Prospector / Atlas · bounty Demon / Lancer / Legionary · escort Wayfarer / Torsas / Astra · patrol Legionary / Lancer.
Pirates — only two hulls, ever: the pirate pool is `[Scrapper, Scrapper, Scrapper, Scrapper, Demon]` (index-cycled, so a five-ship group is four Scrappers and one Demon), while escort, bounty and trader roles alternate Scrapper/Demon. Career pirates, syndicate work and pirate warrants draw from that pair only.

Guild preference (independents): merchant Mule/Atlas/Torsas · bounty Demon/Lancer/Legionary · mining Prospector/Atlas · salvage Wayfarer/Torsas/Mule · syndicate Scrapper/Demon.

## 5. Arena wingman / observer fits

`HULL_WINGMAN_FIT` (`src/game/shipPool.js`) maps each hull onto an authored preset: Blade assault · Wayfarer balanced · Vanguard support · Talon assault · Prospector support · Lancer beam · Atlas support, while Scrapper, Demon, Mule and all five League hulls pass `varied` so they fly their real stock fit (an Andromeda wingman arrives with its torpedo and swarm racks). Wingmen are always `veteran`.

## 6. Combat ladder status

Measured 2026-10-10 on the shipping main loadouts (`.freebuff/balance/main-loadouts.mjs --suite ladder --seeds 4`, 368 fights; full table in `.freebuff/balance/results/main-loadouts.md`). **Fights are decided by kills only**: a duel still undecided at the 300 s draw limit is a draw for both hulls, and every relation is graded on win share over decided fights, never on remaining health. This pass produced no draws: every one of the 368 fights ended in a kill.

- **Combat tier order and allrounder-over-hauler: 29/29 hold.** Every tier-3 combat hull beats every tier-2 (shares 63–100%), and every tier-2 beats every tier-1 (38–100%); both allrounders out-fight the tier's haulers.
- **Hauler bands (`even`, ±25% share): 5/8 hold.** Inside: Atlas–Talon 63%, Atlas–Legionary 38%, Atlas–Andromeda 38%, Prospector–Speedster 75%, Mule–Speedster 63%. Still outside (declared in `KNOWN_GAPS`, printed by every run): Prospector–Scrapper 100%, Mule–Scrapper 100%, Atlas–Demon 25% (exactly on the edge).
- **Reported, not gated:** the allrounders out-fight their own tier's combat hulls (Wayfarer 100% over both tier-1 combat hulls, Torsas 79% overall). The Astra behaves as the tier pattern wants: it beats the Atlas and loses to all three tier-3 combat hulls.

The three gaps share one measured cause, and it is not the pool ratio: a stock fighter stops committing to firing passes once chip damage has taken its shield under the commit threshold, so a hauler's point defence suppresses it while the hauler keeps its guns on target. Against an unarmed target a veteran Scrapper fires 35–54 shots and lands 360–399 damage in 10–19 s; against the armed Prospector it fires 15–24 and lands 92–212, while the Prospector's single pulse cannon alone lands ~380 in 30 s. The tier-1 combat hulls fly the combat behaviour tree (break/evade/reposition); the haulers fly the civilian one (keep station and shoot). Closing that gap is an AI/planning change, not a hull-table change — the older "thin hauler" pass that made the numbers fit did so by making haulers flimsier than a tier-1 fighter.

Raw pools (base shield + hull, before the fitted modules and turrets a fight actually runs with): tier-1 combat 270–285, tier-2 combat 370–485, tier-3 combat 460–590; tier-2 haulers 360–425 plus a turret and one PDC drone (Prospector) or two PDC turrets (Mule); tier-3 hauler 490 plus two manned turrets and two PDC drones. **The haulers now hold the tier below them with armour** — every tier-2 hauler is tankier than either tier-1 combat hull — and their speed stays the lowest in the roster (34–40 cruise).

Energy is a hull profile, not a decoration: every hull runs a 10–26/s reactor against a 60–100 capacitor, so the capacitor is a burst budget that guns and shield recharge spend from rather than a number that never moves. A stock Scrapper's four pulse cannons draw 75/s against an 18/s reactor, and even the Atlas's single gauss cannon draws 12.7/s against its 14/s reactor: nobody sustains full-rate fire. Measured over eight ladder pairs (4 seeds, both orientations) the capacitor now visibly moves: mean 87–99% per hull, with the Atlas dipping to 5% (43 s of a 52 s fight under 75%), the Scrapper to 8%, the Speedster to 21%, the Prospector to 25% and the Talon to 40%, against 97–99% with no dip at all on the previous values. A slow two-gun hull such as the Legionary still rides near full (dip to 81%) because the combat AI fires ~1–2 shots/s in total; this axis shapes what a player can hold down the trigger for and only indirectly the duel numbers above. The Talon keeps its older 26/80 pair because two committed player-fire tests pin the fire-all rotation's cheap-plus-expensive-gun behaviour on that hull.

## 7. Known documentation drift

`docs/FRONTIER_LEAGUE.md` (0.8.2au) still lists League prices of 31,000 / 57,000 / 66,000 / 43,000 / 47,000 and standing gates of 0 / 12 / 20 / 0 / 0, and describes the Astra as "1 S + 1 M" guns. The shipping data is **20,000 / 45,000 / 48,000 / 45,000 / 90,000 with `requiredReputation: 0` on all five**, and the Astra carries two `M` gun mounts. The Speedster/Torsas/Astra table also omits the Astra's second drone bay. Worth reconciling in the next release pass.
