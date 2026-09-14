# Weapon accuracy and pilot skill — local 0.8.2q

Implemented the four annotations on the accuracy review. The changes are local; no commit or push was requested.

## Behavior

- **Forward beams:** retain the shared acquisition cone and instant travel. The actual ray has a small pointing error, with occasional larger errors. Novices make those errors more often, veterans less, aces rarely. Damage still comes from physical ray contact, not a hit/miss roll that overrides collision.
- **Magrail:** retains its fast projectile. Pilot spread now scales from 0.45× at point-blank range to 1.05× at maximum range; angular error also produces a larger positional miss farther away. Novices miss regularly even near the target; trained pilots improve substantially.
- **NPC turrets against ships:** pilot skill affects tracking error, acquisition delay and traverse. Error multipliers are 1.25 / 0.65 / 0.35 for novice / veteran / ace; acquisition is 0.45 / 0.30 / 0.18 seconds. Player turrets retain their prior behavior. Missile-interception solutions, energy limits, assignment sharing and the 2.5-second shared recovery retain their previous rules.
- **Speculative fire:** pulse variants can briefly fire within 7° and Ripper within 9° when alignment is improving or a recent firing window just passed. Windows last 0.28 / 0.35 seconds and cannot restart for 1.5 seconds. Ordinary 4° aim correction does not expand: speculative rounds follow the barrel. Weapon cooldowns, burst pauses, energy, cover collision and ally checks still apply. Ion, Magrail and Sunlance remain more selective.
- **Imperfect tracking:** small continuous pointing drift varies over time, including for aces. The visible-target planner estimates acceleration from successive observed velocities, at its existing 3.3/5 Hz cadence. It clamps acceleration to 40 km/s², prediction time to 0.75 seconds, and correction to 12 km or 2° (whichever is smaller). Compensation is weaker for novices. Lost sight, a target change or stale observations discard it; it never reads player inputs or future movement.

No weapon damage, projectile speed, hull stats or player aim-assist settings changed.

## Focused measurements

Real NPC gun and turret entry points, measured against an already aligned, stationary player-sized Talon target in clear space. Beam/physical projectile collision radii are 1.5/1.75 km. Forward gun samples use 2,000 independent triggers per condition with energy restored between shots. Turret cases run for 60 seconds with sufficient energy. These isolate pointing accuracy; they are not duel hit rates or DPS measurements.

| Check | Novice | Veteran | Ace |
|---|---:|---:|---:|
| Beam at 250 km | 85.7% | 96.5% | 99.7% |
| Magrail at 100 km | 61.5% | 100% | 100% |
| Magrail at 550 km | 0.5% | 9.4% | 96.5% |
| PDC turret at 250 km | 6.1% | 27.8% | 83.9% |
| Tracking turret at 250 km | 5.9% | 23.5% | 74.1% |

Large distant targets are easier to hit than this small target. Skill differences in ship movement, actual target maneuvers, range choice and resource recovery remain additional factors.

## Verification

- 57 focused gunnery, accuracy and planning checks passed after the final firing-line guard (`weapon-skill-final.log`). They cover physical misses by skill/range, bounded speculative bursts, no broadened aim correction, ally obstruction on the barrel line, observed-turn improvement, stale/hidden target reset, and the moving-target pursuit regression.
- The preceding 92-check combat/turret run passed (`weapon-skill-turrets.log`), including standoff rules, finite energy, physical single-missile interception, volley penetration and shared drone/turret recovery. NPC interception solutions were also identical across tiers in the added accuracy test.
- Three browser campaign encounters passed without page or console errors, with novice/veteran/ace pilots using the selected pulse/beam fit against a turning Vanguard for 20 simulated seconds. They fired 6 / 22 / 32 forward beam pulses and 14 / 33 / 74 physical rounds; mean beam pointing errors were 0.338° / 0.103° / 0.027°. All three used brief speculative windows and finite observed-motion estimates. These encounters verify integration, not general win rates.
- Desktop and 844×390 landscape-phone screenshots were inspected; the cockpit, target telemetry, enemy-fit selector and fullscreen control rendered correctly. Results: `weapon-skill-browser.json`; screenshots: `weapon-skill-desktop.png`, `weapon-skill-phone.png`.
- The first browser pass caught a test-page timing bug: enemy fits were applied before the delayed spawn. The selector now applies each override as the enemy enters, and the corrected pass verified the requested loadouts.

Local test: http://localhost:4184/.freebuff/combat-review/play.html?revision=weapon-skill

Choose a pilot tier through **Fight**, choose **Enemy fit**, and click **Start / restart**. The override uses legal hull fittings and preserves the campaign's missile allowance. **Campaign** keeps the authored equipment; **Expand game** fills the landscape cockpit.
