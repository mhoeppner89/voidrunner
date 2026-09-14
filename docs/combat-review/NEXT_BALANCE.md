# Follow-up balance checks — 0.8.2q

Request: check the measurable next balance questions directly. No gameplay values changed.

Method: existing GameSession fixed-step harness, real projectile collision and resource regeneration, renderer/audio stubbed. Three deterministic seeds (11, 23, 37), empty-space staged fights. Damage logging measures actual shield/hull reductions, not pre-multiplier damage arguments. These small checks identify problems; they are not population win-rate estimates or human-player difficulty ratings.

## 1. Novice gun pressure is very weak

One Talon pirate with the production pulse/pulse/gauss fitting attacks a stationary fresh Wayfarer at an initial 350 km. The player does not shoot, steer, boost or deploy drones. NPCs keep normal movement and finite ordnance.

All three novice runs leave the Wayfarer's 185 hull intact after 60 seconds; shields never reach zero. Each novice emits 72 gun projectiles, including 27 gauss rounds, but guns inflict only 10, 20 and 20 points of actual damage. Missiles add 168 each, mostly absorbed by replenishing shields. Last gun shots occur at 58.8–59.9 seconds, so this is poor effective aim rather than the old opening-burst-only bug.

Veterans with the same fitting destroy the stationary target at 40.28 and 56.50 seconds; the third leaves 18.58 hull after 60 seconds. Their guns inflict 240–262.91 actual damage. This does not establish human encounter difficulty, but the novice/veteran pressure gap is large.

Next candidate: improve novice burst timing/alignment or close-range lead, retaining visible misses. No evidence here justifies raising all gun damage.

Evidence: balance-next.json and novice-guns.json. Harnesses: .freebuff/combat-review/balance-next.mjs and novice-guns.mjs.

## 2. The earlier short-gap PDC test is not a normal single-rack missile pair

Physical missile/PDC tests start at 280 km, with actual launcher speed, homing, acceleration and damage. The stationary defender has one PDC turret. This isolates interception; launch locking and launch animation are bypassed. The swarm uses four laterally separated micro-warheads, not the complete launch-spread animation.

| Incoming ordnance | Launch gap | PDC shots | Damage received |
|---|---:|---:|---:|
| One seeker | — | 1 | 0 |
| Two seekers, artificial close volley | 0.15 s | 1 | 42 |
| Two seekers, legal rack cooldown | 1.10 s | 2 | 0 |
| Four swarm micro-warheads | simultaneous | 1 | 45 |
| One torpedo | — | 1 | 0 |
| Two torpedoes, legal tube cooldown | 2.60 s | 2 | 0 |

The shared 1.25-second PDC recovery works, but a second seeker launched after 1.1 seconds still leaves enough flight time for another interception. The previous 0.15-second test demonstrates coordinated saturation, not a pair a single seeker rack can fire. Keep single-missile defense; if same-rack paired shots should overwhelm it, introduce a deliberately short two-shot burst or tune the cadence/travel-time relationship. Shorter launch distances may change the result and were not tested here.

Evidence: missile-cadence.json; .freebuff/combat-review/missile-cadence.mjs. Existing fixture tests execute as imports; the six rows above are the new measurements.

## 3. Keep ion at ×8 for now

Six moving Vanguard NPC duels: pulse/pulse versus pulse/pulse, then the same seeded pilots with one gun on side A changed to ion. Both use identical pulse-fighter flight profiles, normal energy regeneration, no turret or ordnance, no forced cancellation of fleeing, and no surrender. This isolates the gun swap from the production ion close-range tactical profile. Actual NPC hull pools apply (162 hull, 75 shield), not the player's Vanguard pools.

| Seed | Pulse-only outcome for A | Pulse + ion outcome for A |
|---|---|---|
| 11 | Win, 42.05 s; 73.11 hull left | Win, 53.18 s; 83.11 hull left |
| 23 | Win, 34.10 s; 107.17 hull left | Win, 29.47 s; 162 hull left |
| 37 | Loss, 28.25 s; enemy at full hull | Loss, 28.17 s; enemy at 121.38 hull |

Ion is useful without consistently speeding kills or changing who wins. Combined with the earlier resource-limited shield advantage and hull disadvantage, this gives no reason for another ion damage buff yet. Three pairs do not establish its win rate. Full hull/equipment progression remains untested.

Evidence: balance-next.json. No broad fleet matrix or new browser run was needed for these simulation-only measurements.
