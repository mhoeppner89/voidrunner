# 0.8.2q combat review — focused confirmation

Historical pre-implementation review. The statements and baseline numbers below describe the diagnostic stage before the 0.8.2q changes. See IMPLEMENTATION.md for the completed changes and current checks. The original GLM report and raw results remain untouched.

Checks performed: four 30-second fixed-step firing cases (one seed, one stationary non-retaliating target, production tactical-role classification), one direct patrol target-selection check, direct weaponDamage/rate calculations, and two existing PDC tests selected by name. These are diagnostic reproductions, not win-rate estimates. The baseline numbers are recorded below; confirmation.json was overwritten during an early implementation rerun and must not be used as a baseline.

## Major issues

1. **AI firing opportunities — confirmed, broader than the report's interceptor explanation.** A veteran Talon with pulse fired five rounds, all by 0.95 seconds, then none through 30 seconds. Veteran Vanguard pulse fired eight, last at 5.63 seconds. Vanguard ion fired once at 0.55 seconds; ripper emitted one seven-pellet burst. Nose errors varied greatly, rather than staying at 11 degrees. Fix approach/turning/extension and alignment time before changing gun accuracy or faction stats. The report's makeFit changes production midrange fighters into gunships; its hull and gun tier ordering is not an isolated measurement of production behavior.
2. **Ion fails its shield-specialist role — confirmed numerically.** Per-gun unconstrained shield DPS is ion 32.26, pulse 58.82, pulse Mk II 79.41. Ion spends 0.45 energy per shield point, versus 0.32 for pulse; it is worse at both shield throughput and efficiency. Its low hull DPS is intentional specialization, but its shield role needs improvement. A blanket 3–4x damage buff is not established. The proposed shield-regen-loop explanation is wrong for uninterrupted hits: damage resets shieldDelay to 4.5 seconds, while ion cooldown is 0.62 seconds. Weapon disruption is 0.8 seconds followed by a three-second recovery, so its utility cannot be inferred from lethal TTK alone.
3. **Patrol target selection — confirmed.** With hostile=true, the patrol selected itself; clearing that flag selected the nearby pirate. Occluding visibility then erased the NPC target immediately. Exclude self/noncombatants from candidate selection, and consider last-known-position pursuit for recently seen NPC threats. Preserve line-of-sight requirements for firing. The report's environment staging forces both patrols hostile, so its near-zero patrol output is confounded by self-targeting, not evidence that cover caused it (the open case also failed).

## Findings not sufficient to justify balance changes

- **PDC drone nerf:** not supported. Two spaced torpedoes do not test saturation. Existing focused tests pass: physical PDC stops a single seeker but a close pair/swarm penetrates; four escort drones share one mothership recovery channel and cannot fire concurrently through it. Current recovery is 1.25 seconds versus 2.6-second torpedo launcher cooldown. Reliable single-missile defense matches the user's stated design.
- **Civilian DPS caps / pirate buffs / patrol nerfs / exact 1.4:1 exchange rate:** defer. Forced combat, altered tactical profiles, stationary sinks and broken firing opportunities confound these recommendations. The report itself also lists escorts beating patrols 8/8 while saying patrols beat everything.
- **Mortar best at everything:** only an ideal-target result. Its raw 120 direct DPS and 180 alpha warrant watching, but stationary targets, perfect player aim and replenished energy omit slow-projectile counterplay and capacitor limits. No general nerf confirmed.
- **42-damage ram one-shot:** reject as stated. Collision damage is speed/mass dependent; NPC damage per contact is capped at max(10, 25% of maxHull). The report labels weapon-less damage calls as rams, which also includes seeker hits (42 damage), torpedoes and splash. Player collision damage is uncapped and asymmetric, a separate possible issue needing a player collision probe if it becomes a tuning priority.
- **Flamboyant strictly dominated / regeneration stalemate breaker / player 1v5 difficulty:** not independently established by these small checks. Resolve AI firing first; forced lethal fights and perfect-aim stationary player staging do not establish normal encounter difficulty or disengagement quality.

## Report reproducibility limits

The current docs/combat-balance-results.json contains only two seeds for hullArmor/hullFirepower (12 rows each), not the reported eight-seed complete matrix. The harness overwrites that file on each invocation. Its damage logger records the incoming amount before shield/hull modifiers, overkill and capping, rather than actual shield/hull loss. Fix measurement and preserve per-run results before using exact rankings for 0.8.2q tuning.

Commands:
- node .freebuff/combat-review/confirm.mjs
- node --import ./src/game/offlineImportHooks.mjs --test --test-name-pattern='physical PDC interception|four escort drones' tests/turret-overhaul.test.mjs
