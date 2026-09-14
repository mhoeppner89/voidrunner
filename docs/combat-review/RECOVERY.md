# Combat movement and limited recovery — local 0.8.2q

The player found the complete challenge easy in a Wayfarer, with NPCs underusing speed and failing to escape for shield recovery. The follow-up sets the priority: avoid sitting ducks, but keep opponents willing to risk staying in weapon range and prevent repeated recovery from creating stalemates.

## Changes

- Ordinary boost commitments now account for time to accelerate and turn: 1.4–3 seconds for novices, 1.8–4 seconds for trained pilots. These are requests through the existing hull physics, finite fuel and obstacle-clearance checks.
- A damaged ship may temporarily withdraw when its visible opponent's hull and observed speed give it a usable speed advantage. Otherwise it can seek real nearby cover. There is no retreat solely because a shield timer elapsed.
- Start thresholds are 35% / 25% / 20% shields for novice / veteran / ace. Recovery targets only 30% / 35% / 40% shields, and the normal 4.5-second post-hit delay and energy cost apply. This is a partial reset, not a full refill requirement.
- Each withdrawal lasts at most 14 seconds. A failed range escape ends after seven seconds without enough separation. The next attempt has an 18-second cooldown; novices and veterans get one attempt per opponent, aces at most two. A viable finish against an exposed opponent below 40% hull takes priority over starting recovery.
- A clear oblique exit gives the turn time to complete, with modest weaving. Once outside the threat envelope, a broad arc limits return distance. Recovery does not inherit competing jinks, spirals or nose-to-target drift instructions.
- Trained pilots must have at least 85% cruise speed and useful transverse motion before starting a defensive drift. Offensive drift/reversal behavior remains available.
- A withdrawing wingman yields the group's attacking role to an ally. Offensive guns, turrets and missile locks pause to preserve energy and heading; defensive missile interception remains available.
- Search does not interrupt an active cover recovery. After contact is lost, its movement uses the last seen target point, with no new hidden velocity or shots. Normal search resumes after the bounded recovery.

No damage, hull, shield capacity, recharge rate or weapon-accuracy values were changed in this pass. The preview now offers Wayfarer, Beam/Ripper guns and a Damaged veteran preset alongside the challenge encounters.

## Focused movement comparison

Six 35-second deterministic probes: novice/veteran/ace Talons against either a parked or pursuing Wayfarer. A small simulated beam-pressure check applies one shield damage every 0.4 seconds when the pursuer is aligned and within 300 km; it resets the real recharge delay. The NPC uses real flight, intent and resource methods. This isolates movement/recovery, not combat win rates. The same pressure and pursuit controller run before and after.

Against the pursuing Wayfarer:

| Metric | Novice | Veteran | Ace |
|---|---:|---:|---:|
| Time above 90% of nominal boost speed, before | 0% | 0% | 0% |
| Time above 90% of nominal boost speed, after | 29% | 23% | 26% |
| Greatest separation before | 383 km | 365 km | 309 km |
| Greatest separation after | 589 km | 587 km | 586 km |
| Time withdrawing after | 12.5 s | 13.2 s | 13.6 s |

Nominal Talon boost speed is 128 km/s. Momentary total speed can exceed that during a turn because the existing player/NPC integrator preserves transverse momentum; this change does not raise the thrust ceiling. Baseline ships sometimes regained shields through missed shots, so the old behavior did not prevent all recharge. It failed to make a committed speed-based withdrawal.

Raw results: `escape-before.json`, `escape-after.json`. The first longer-recovery candidate was shortened and limited after the no-stalemate clarification.

## TTK and NPC finishing

Three legal paired-gun Wayfarer checks against a stationary Talon at 120 km, with normal capacitor/recharge and physical projectile/beam collision:

| Guns | Time to kill |
|---|---:|
| Paired pulse | 1.88 s |
| Paired beam | 5.00 s |
| Paired Ripper | 1.02 s |

These are lower bounds with a fixed target and perfect initial alignment, not human combat times. Ripper lands many pellets on the broad Talon at this distance. They confirm that concentrated damage can kill quickly; increasing shield regeneration would not solve this and could lengthen low-pressure fights.

Nine actual NPC duels used normal resources, physical damage and flight, opposing factions, three deterministic seeds, and no surrender. Same-hull Talon/Vanguard pulse/beam duels stripped turrets and ordnance; the mixed Talon Ripper/ion versus Vanguard pulse/Magrail cases retained normal turrets and finite ordnance. The staged director assigned enemies but did not remove fleeing.

- Six same-hull veteran duels all ended in a kill in 16.78–35.13 seconds.
- Three mixed-hull veteran duels all ended in a kill in 11.17–20.58 seconds.
- No timeout or morale exit occurred in these nine cases. This does not rule out stalls with other fits, novice pilots, dense fields or fleets.

Opposing factions matter: a probe that forces allied patrols to target each other conflicts with friendly-fire checks and does not measure a normal duel. Results: `finish-initial.json`, `finish-mixed.json`; scripts document each staging choice.

A separate bounded Wayfarer-versus-ace check, with default aim assist, normal turn/thrust controls, constant boost and held beam fire, ended after 81.78 seconds with the ace destroyed. The ace used two withdrawals totaling 20.27 seconds; neither side could repeat them indefinitely. The Wayfarer retained its hull. This is an inefficient scripted pursuit (it also fires outside range), not a player difficulty score. It demonstrates why a 5-second stationary-target beam TTK cannot be generalized to a moving fight, and why movement changes alone do not establish that the complete challenge is hard enough. Result: `wayfarer-finish.json`.

## Verification

- Recovery checks cover acceleration to boost speed, real recharge delay, partial recovery, resuming fire, speed advantage, finishing priorities, exhausted attempt limits, failed escape cancellation, cover and sensor memory, fuel/obstacle limits, defensive drift speed, and PDC interception during withdrawal.
- The combined combat/gunnery/navigation run passed all implementation checks. One new cover fixture initially used a Lancer against a slower Wayfarer, which correctly chose a range escape. It was corrected to a faster Talon opponent and all 27 checks in the focused rerun passed. The additional ace attempt-limit check passed separately.
- The field regression completed 72 generated encounters across six hulls, three skill tiers, debris and asteroids; existing movement, collision and turn bounds passed. Existing moving-target alignment and weapon-skill regressions passed.
- Two real browser encounters completed without page or console errors. The damaged veteran reached 128.9 km/s, withdrew for 6.87 seconds, recovered and resumed fire (114 rounds over 37 seconds). A healthy ace against a scripted, boosting beam Wayfarer used both permitted withdrawals (15.88 seconds total) and fired 136 rounds over 37 seconds; both ships were still alive at that checkpoint. These checks validate integration, not campaign difficulty.
- Desktop and 844×390 landscape-phone screenshots were inspected. The capture uses loaded assets and active WebGL frames; the first one-frame capture showed an empty drawing buffer and was replaced. Files: `recovery-desktop.png`, `recovery-phone.png`.
- Service worker cache is `voidrunner-v219-0-8-2q-combat-recovery`, with the new module included. Changes remain local and uncommitted.

Local test: http://localhost:4184/.freebuff/combat-review/play.html?revision=recovery
