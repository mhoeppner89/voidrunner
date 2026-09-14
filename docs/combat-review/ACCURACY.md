# NPC firing accuracy review — local 0.8.2q

Follow-up: [Implemented weapon and skill changes](WEAPON_SKILL.md). The review and measurements below describe the earlier build.

Request: compare weapons and skill levels while retaining some speculative, imperfect firing and distinct weapon difficulty. Review only; no gameplay changes.

## Current rules

- Forward projectile spread half-angle: novice 2.5°, veteran 0.6°, ace 0.15°. Lead factors: 0.888 / 0.96 / 0.988. Burst lengths: 4 / 5 / 8 shots, with 1.2 / 0.35 / 0.15 second pauses. Weapon cooldowns and energy still limit output.
- Every non-beam forward weapon requires the estimated aim point within 4° of the nose. The firing direction receives 34% correction toward that point, followed by pilot spread. Weapon-specific `assist` values do not change this NPC gate. This limits speculative fire even for pulse and Ripper.
- Forward beams instead snap exactly to the current target from the muzzle within the shared 14.4° assistance cone. Pilot skill affects acquiring the shot and cadence, but adds no beam error.
- Pulse/Mk II and ion travel at 500 km/s; Magrail at 1,200; Sunlance at 300. Ripper adds seven pellets with a roughly 2° maximum, center-weighted spread. Pulse variants and ion otherwise share the same flight accuracy.
- Mounted PDC and tracking turrets have their own smooth tracking error and acquisition delay, independent of pilot tier. Precise missile interception uses its separate recovery rules. Guided missile flight uses launcher homing values; novice launch lock and spacing are slower than veteran/ace.

## Focused check

The probe calls real `fireNpcGun`, including its physical muzzle, pilot spread and Ripper pellet generation. It uses continuous relative-motion sphere sweeps at 60 Hz with the game's player Talon hit radius (1.5 km, plus 0.25 for projectiles). Each of 84 conditions samples 1,000 triggers: seven forward guns, three tiers, 100/250 km and two target paths. Energy is replenished between independent shots. The nose is aligned to the pilot's estimated lead, so this isolates firing rather than pursuit, DPS or duel difficulty. No cover or splash; beams use direct ray contact.

At 250 km, against a target crossing straight at 60 km/s:

| Weapon | Novice hit % | Veteran hit % | Ace hit % |
|---|---:|---:|---:|
| Beam | 100 | 100 | 100 |
| Pulse | 2.2 | 45.8 | 100 |
| Pulse Mk II | 2.1 | 48.3 | 100 |
| Magrail | 2.6 | 47.7 | 100 |
| Ion | 3.0 | 48.6 | 100 |
| Sunlance | 2.5 | 46.3 | 100 |
| Ripper, per pellet | 2.8 | 25.9 | 43.5 |
| Ripper, at least one pellet per trigger | 11.1 | 81.7 | 97.7 |

When the target instead follows a smooth transverse turn (160 km radius, 60 km/s), the 250 km pulse estimate becomes 2.4% / 17.8% / 0%. The tightly grouped ace shots all miss the curved path; veteran spread catches some. Magrail remains 3.8% / 46.2% / 100%, and Sunlance falls to 3% / 0% / 0%. An ace Ripper trigger still lands at least one pellet 53.6% of the time, but only 10.3% of its pellets hit. These are controlled single-geometry comparisons, not live-combat hit rates. Finite samples and different seeds explain small differences among weapons with identical flight parameters.

At 100 km, aligned veterans and aces land all sampled pulse/ion/Magrail rounds on both paths. Their turning-target Sunlance estimates are 66.9% / 70%. Range and target curvature therefore matter at least as much as raw pilot spread.

Probe: `.freebuff/combat-review/accuracy-review.mjs`; measurements: `accuracy-review.json`. It completed successfully; no browser rerun was needed for this review.

## Recommended direction

1. Keep novices visibly loose, veterans consistent and aces skilled but imperfect. Do not infer a need for a blanket accuracy increase from narrow missed volleys. Small time-varying tracking error and a bounded response to observed turns would avoid repeatedly shooting an identical wrong lead without knowing future input.
2. Separate the permission to attempt a shot from aim correction. Allow brief speculative bursts for pulse and Ripper near a firing opportunity; keep physical directions, cover and friendly-fire checks. Ion, Magrail and Sunlance should be more selective because misses cost a slower shot.
3. Preserve the weapon hierarchy: beam easiest, Magrail easiest physical projectile against evasive movement, pulse/ion intermediate, Ripper forgiving for partial close hits, Sunlance hardest at range. Beam's perfect lock is the main skill-independent outlier; mild acquisition/tracking lag is preferable to making it inaccurate like a projectile gun.
4. Do not widen every weapon's scatter together. Ripper already supplies real pellet coverage, and Magrail needs to retain precision. Leave PDC missile interception separate.
