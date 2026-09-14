# Tracking moving opponents — local 0.8.2q

The player's report was partly a range-control issue. In the controlled turning-target probe, the veteran spent 61% of the measured time inside 120 km. There were also two control conflicts: pursuit/standoff offsets could point the nose outside the forward firing cone, and an empty capacitor caused a two-second turn-away/boost recovery even when the pilot had a good firing solution.

## Change

Trained pilots use a wider preferred distance against a moving target, with more room for transverse speed relative to the hull's turn authority. The extra distance is capped at 100 km or 90% of the fitting's preferred range, whichever is smaller; the result also stays within 85% of the main weapon's reach. When already too close and tracking, the requested forward-speed floor falls smoothly from 65% to 25% of cruise. Actual velocity still follows the shared acceleration and drift physics.

A usable forward shot takes priority over lead/lag approach offsets; flank approaches retain their offset until closer to their preferred distance. Gun cooldowns do not change the tracking direction. An empty capacitor instead creates a 0.35–1.2-second firing pause while tracking continues. Damage, shield recovery and collision avoidance can still interrupt the attack.

Veteran lead compensation increases from 0.888 to 0.96, between the novice's 0.888 and ace's 0.988. Dispersion and firing cones are unchanged. No weapon damage or hull stats changed.

## Measurements

Four matched 30-second probes: veteran/ace × straight/turning target, with a controlled all-pulse loadout and 235 km preferred range, turrets/missiles disabled and no return fire. The target travels at 60 km/s on a straight path or a smooth turn with a small vertical component. Alignment and distance exclude the first four seconds. This isolates tracking; it is not a human difficulty or survival benchmark.

| Pilot / target | Median range before → after | Mean aim error before → after | Time inside 120 km before → after |
|---|---:|---:|---:|
| Veteran / straight | 210 → 258 km | 2.0° → <0.1° | 0% → 0% |
| Veteran / turning | 112 → 162 km | 5.3° → 1.1° | 61% → 13% |
| Ace / straight | 176 → 258 km | 3.7° → <0.1° | 0% → 0% |
| Ace / turning | 202 → 161 km | 19.3° → 1.1° | 5% → 13% |

The ace result shows why more distance alone was insufficient: tracking improved while its median distance fell. The aim error is relative to the pilot's calculated firing lead; that lead and the physical shots still contain skill error. The probe's swept-sphere hit estimate rose from 14 to 18 for the turning veteran and 6 to 33 for the turning ace; dispersion and target acceleration still cause misses. Raw results: `alignment-before.json`, `alignment-after.json`.

64 combat, planning, hunting and gunnery checks passed after the final change, including a new moving-target simulation regression checking sustained forward alignment and range through turns and energy recovery. Twelve field checks also passed during this pass, including the unchanged 72 generated-field scenarios; the final range-cap adjustment applies to moving targets and did not require repeating that stationary-target matrix.

Two actual browser campaign checks passed without page or console errors: wave 3 (veteran) and wave 6 (ace), each against a Vanguard flying at 70% throttle with a continuous 0.25 yaw input for 20 simulated seconds. Their actual ripper/ripper/ion fits fired 177 and 208 forward shots; mean aim error was 2.29° and 2.05°. Both still fought at about 76 km median range, so this verifies useful tracking with short-range fits rather than claiming every pilot now stays farther away. The player's automatic turret remained active. Results: `alignment-browser.json`.

Desktop and 844×390 landscape-phone screenshots were inspected (`alignment-desktop.png`, `alignment-phone.png`). The cockpit, target telemetry and local preset/fullscreen controls rendered correctly. These scripted trajectories do not establish human win rates or balance across every maneuver.

Local test: http://localhost:4184/.freebuff/combat-review/play.html?revision=range

Changes remain local and uncommitted.
