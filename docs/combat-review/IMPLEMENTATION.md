# 0.8.2q implementation checks

Implemented the approved combat fixes and the two follow-up annotations.

- NPC approach throttle now allows alignment with the unchanged forward-gun cone. Wing offsets fade before gun range; extensions have more room before early turn-back. Open-space braking no longer triggers the obstacle-stuck response.
- Ion shield multiplier is 8. The existing 0.8-second exposed-weapon disruption now doubles shot intervals and energy cost instead of stopping fire. The three-second recovery remains. Player and NPC guns, launchers and mounted turrets apply the interval penalty; launched escort drones remain independent.
- Patrol targeting excludes self and noncombatant states. Lost NPC positions persist for at most four seconds. Physical suppression fire lasts only 0.8 seconds, uses the remembered coordinates, and retains projectile collision. Beams, launchers and turrets do not track hidden targets through this memory.
- Automatic ship engagement rejects pirate demand/hold-fire, surrender, capture, powered-down and stand-down states. Incoming missile interception remains independent.

## Focused evidence

`node --import ./src/game/offlineImportHooks.mjs --test tests/combat-q.test.mjs tests/npc-gunnery.test.mjs tests/turret-overhaul.test.mjs`: 61 passed. This includes normal flight/retreat checks imported by the fixtures, stationary and crossing target reacquisition, player/NPC ion cadence and energy, patrol memory/suppression expiry, drone and turret standoff behavior, and single missile versus close-pair/swarm defense.

Four 30-second fixed-step full-simulation cases, one seed and a stationary non-retaliating target, production tactical roles, one gun each (implementation-check.json):

| Hull / gun | Rounds (pellets for ripper) | Last shot |
|---|---:|---:|
| Talon pulse | 38 | 26.40 s |
| Vanguard pulse | 37 | 29.97 s |
| Vanguard ion | 20 | 29.08 s |
| Vanguard ripper | 126 | 29.38 s |

Normal-capacitor Vanguard comparison, 30 seconds of continuous trigger with ideal connected shots and no shield recharge (ion-fit.json): two pulse guns deliver 95.33 damage/s against either shield or hull. Pulse plus ion delivers 114 shield damage/s (+19.6%) and 59.17 hull damage/s (-37.9%). This isolates resource-limited weapon output; it is not a duel win-rate estimate.

One real Chrome flight boot verified current ion/engagement modules and no browser errors. Desktop (1440×900) and landscape phone (844×390) screenshots are desktop.png and phone.png; both were visually inspected. These are boot/layout checks, not evidence of all combat behavior. `git diff --check` passed.

Local game: http://localhost:4184/game.html
Direct PDC flight setup: http://localhost:4184/game.html?turret-test=1&turret=pdc

No broad fleet matrix or balance ranking was rerun. The ×8 ion multiplier and slower alignment approaches should still receive hands-on combat feedback.
