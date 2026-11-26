# Arena Run progression (design, 2026-11-25)

The lead designer wrote this; the user approved the direction: keep 25 levels, make levels longer through follow-up waves, add a few objective levels with the new big ships, and smooth the difficulty curve.

## Problems with the current run

- **Fights end fast.** Every reinforcement arrives 3–12 s after the first contact, so each level is one brawl.
- **Uneven curve.**
  - Level 13 (*Strike*) has two ships and plays easy.
  - Act V puts three aces in the air at once, which is very hard.
  - The final frigate level plays easier than the four before it.
- **Same goal every level.** Every level is "destroy everything".

## Rules for the new run

1. **Groups, not one wave.** A level is a list of groups.
   - **When the next group arrives:** once the groups already in play are down to **one survivor**, or after **60 s** (45 s in Act I), whichever comes first. An authored timer or objective event can also trigger the group. The first eligible trigger wins, with at least **15 s between group arrivals**.
   - **Warning:** about 5 s before a group arrives, the existing reinforcement marker shows its entry and one radio line announces it. The group uses the marked entry even if the pilot approaches it. An obstruction shifts the arrival to the nearest clear spot.
   - **Where it enters:** groups use the stage's reinforcement entries.
2. **What is in the air matters more than the total.** Later levels get harder mainly through more groups and better pilots, not through more aces at once.
   - At most **three hostile fighters** at a time until Act V. At most four in Act V, the frigate and launched fighters excluded.
   - In Act V, at most two aces at a time.
   - A group whose arrival would break these limits waits until it fits, even past its timer.
3. **The curve.**
   - Difficulty rises within each act. The first level after a decision stage (new hull or wingman) is a breather.
   - Each act's last level is its peak, and the final level is the hardest of the run.
   - The endurance panel measures median combat time over the three seeds below.

     | Act | Regular level |
     |---|---|
     | I | 0:45–1:30 |
     | II | 1:00–1:45 |
     | III | 1:15–2:00 |
     | IV | 1:30–2:15 |
     | V | 1:45–2:30 |

     Levels 5, 8, 10 and 13 can run up to 3:00. Level 25 targets 3:00–4:30.
   - Level 1 has at most two authored groups. Levels 2–4 have at most three. Later regular levels have at most four. Levels 5, 8, 10 and 13 have at most five authored groups, plus their objective events and timed support or launches. Level 25 retains its three authored groups and allows one extra escort screen.
4. **Objectives** appear on levels 4 (Red Njord Barrage, since 0.8.2pw), 5, 8, 10, 13 and 25. When an objective is decided, the remaining hostiles break off and jump out within 10 s. They never surrender; that rule holds in Arena.
   - **Failing an objective does not end the run.** The level still counts as cleared, but its reward pick is skipped. Losing the pilot still ends the run, as today.
   - **Objective status on screen:** short lines in the existing ticker and comms log, never a floating card. They show at the start, at 60/30/10 s left where a timer applies, and with the result. The objective target can be selected as usual.
5. **Big ships** use the corvette and frigate rules already in the game: subsystem damage, generator and engine subtargets, markers.
   - Level 9 uses the Caravan tender and its two physical repair drones. Level 10 uses the Rookery carrier and its two independent launch rails. Both hulls have three engines and two shield generators.

## Pilot power through the run (for reading the table)

| Levels | Player |
|---|---|
| 1–4 | Tier-1 hull, alone |
| 5–8 | Tier-2 hull, alone |
| 9–12 | Tier-2 hull + tier-1 wingman |
| 13–16 | Tier-2 hull + tier-2 wingman |
| 17–20 | Tier-3 hull + tier-2 wingman |
| 21–24 | Tier-3 hull + tier-3 wingman |
| 25 | Tier-3 hull + two tier-3 wingmen |

## Level table

Notation:
- **N / V / A:** novice / veteran / ace.
- **(m):** missile count, as today.
- **→:** the next group, arriving under rule 1.
- Sites are unchanged unless the table names a new one.

### Act I — Red Talons

| # | Name | Site | Groups |
|---|---|---|---|
| 1 | First contact | verge-lanes | Balor N |
| 2 | Scavengers | acheron-horizon | Balor N → Balor N → Loki N |
| 3 | Cut loose | mourning-carrier | Balor N → Morrigan V (4 guns, 1) as a duel |
| 4 | Hit and run (objective: destroy the Red Njord Barrage) | acheron-horizon | Loki V + Loki N → Barrage V + Balor N |
| 5 | **Ironjaw** (objective: destroy the Ironjaw) | redwake-belt | Ironjaw V + Balor N. While the Ironjaw lives, a Balor N arrives every 45 s, at most 3. |

### Act II — Free Merchants

| # | Name | Site | Groups |
|---|---|---|---|
| 6 | Freight lane | foundry-lanes | Argo N (trader) + Hestia V (1) → Hestia N + Freya V. This is the breather. |
| 7 | Claim jumpers | shardbelt-heart | Gaia V + Hestia N → Gaia N + Freya V (1) → Hestia V |
| 8 | **Convoy** (objective: stop the Drover) | pale-rings | Drover N running for its jump point (about 150 s away) + Hestia V + Loki V. After 40 s: Freya V + Hestia N. Success means the Drover is destroyed or both its engines are out before it jumps. |
| 9 | **Caravan** (kill all) | mourning-center | Caravan + Freya V + Argo V (1) → Hestia V ×2. The Caravan's repair drones keep its escorts alive, so its drone hangar is the first target. |
| 10 | **Rookery** (objective: destroy the carrier) | verge-lanes | Rookery + Balor V ×2. Each intact launch bay sends a pair of Balors every 25 s, at most 8 of its fighters alive. The level ends when the carrier and every fighter it launched are destroyed. Red Talons come for the merchant lanes, which closes the act. |

### Act III — Frontier League

| # | Name | Site | Groups |
|---|---|---|---|
| 11 | Patrol shift | acheron-horizon | Tyr V (1) + Loki V → Tyr V + Loki V (1). This is the breather. |
| 12 | Courier run | shardbelt-rim | Tyr V (1) + Loki V → Thor V (1) + Loki V → Tyr V |
| 13 | **Strike** (objective: defend the Drover) | pale-rings | A friendly merchant Drover must reach its jump point (about 150 s) while League bombers hunt it with torpedoes. Thor V (torpedoes) + Tyr V → after 40 s Thor A (torpedoes) + Loki V → after 80 s Thor V (torpedoes) + Tyr V. The Drover is slow and steady, so the Thors can lock it. The pilot must break them up first. Wingmen on *aggressive* reassess the bombers once a second, taking loaded tubes first and then the nearest bomber to the Drover within their standing range limits. |
| 14 | Honorguard | mourning-battleship | Artemis V (2) + Tyr V → Tyr V + Loki V (1) → Odin A |
| 15 | Veteran wing | shardbelt-chimney | Odin A (1) + Loki V → Tyr V (1) + Thor V (1) → Artemis A (2) |

### Act IV — Concord Frontier Fleet

| # | Name | Site | Groups |
|---|---|---|---|
| 16 | Show of force | verge-lanes | Mercury A (1) + Victoria V (1) → Mercury V ×2. This is the breather. |
| 17 | Victoria dance | mourning-carrier | Victoria A (2) + Mercury V → Victoria V (1) + Mercury V → Victoria V |
| 18 | Battery test | acheron-horizon | Bellona A (2) + Victoria V (1) → Mercury V (1) + Mercury V → Bellona V (2) + Mercury V |
| 19 | Screened | foundry-lanes | Artemis A (2) + Victoria V → Mercury V (1) + Artemis V → Victoria A (2) |
| 20 | Heavy metal | pale-rings | Victoria A (2) + Bellona V (1) → Mercury V (1) + Artemis V (1) → Victoria A + Bellona A (2) |

### Act V — Concord Capital

| # | Name | Site | Groups |
|---|---|---|---|
| 21 | Picket | mourning-battleship | Bellona A (2) + Mercury V → Artemis A (2) + Mercury V (1) → Victoria A (2). This is the breather; it was three aces at once. |
| 22 | Reserves | redwake-belt | Victoria A (2) + Artemis V (2) → Mercury A (1) + Mercury V → Artemis A (2) + Victoria V (1) |
| 23 | Ace screen | verge-lanes | Bellona A (2) + Victoria A (2) → Mercury A (1) + Artemis A → Victoria A (2) + Bellona A (2) |
| 24 | Elite guard | mourning-center | Artemis A (2) + Bellona A (2) → Victoria A (2) + Mercury A (1) → Artemis A (2) + Victoria A (2) + Mercury V (1) |
| 25 | **The line** (objective: destroy the frigate) | shardbelt-rim | Concord frigate A + Victoria A (2) ×2. When the frigate is below 60% hull or after 60 s: Mercury A ×2. When it is below 30% or after 120 s: Bellona A (2) + Victoria A (2). Destroying the frigate wins the run. |

## Measuring

Use the same three seeds (175, 718, 941), pilot hull, pulse fit and scheduled wingmen on both builds. Each sample starts in a freshly seeded session with its original terrain geometry. Run the engage probe once with endurance replenishment and once with ordinary health. Record combat duration, incoming damage, maximum simultaneous hostiles and the objective result for every sortie. Report median duration and damage, the maximum hostile count, and the number of pilot losses.

```sh
PILOT=engage OUT=output/arena-progression/new-endurance.json node tools/playtest/probes/arena-progression.mjs
PILOT=engage LETHAL=1 OUT=output/arena-progression/new-flight.json node tools/playtest/probes/arena-progression.mjs
```

Set `VR_BASE_URL` to the checkout being measured. The previous build completed 71 of its 75 ordinary-health sorties. The retuned run must complete at least 60.

| Levels | Maximum ordinary-health pilot losses on three seeds |
|---|---|
| 1–10 | Zero, except up to one each on 5, 8 and 10 |
| 11–20 | One per level |
| 21–24 | Two per level, with the average increase limited to one loss per level |
| 25 | Three, as on the previous build |

A Drover on a jump run keeps at least half cruise while either engine works. On the defend objective each engine retains at least one hull point. Hits still damage the ship and its destruction fails the escort, whoever fired.

Tune group contents against these measurements. Check that pressure builds through each act, that levels 6, 11, 16 and 21 give the pilot a breather, and that each finale deals the most damage in its act. Level 25 should deal the most damage of the run.

## Measured roster changes

The table lists all differences from the approved encounters above. N, V and A denote novice, veteran and ace. Parentheses give missile counts. The three Thor bombers carry three torpedoes each.

| Level | Groups | Changes from the approved table |
|---|---:|---|
| 1. First contact | 2 | G2 adds a group of Balor N + Balor N |
| 2. Scavengers | 3 | G3 changes from Loki N to Loki V |
| 3. Cut loose | 3 | G2 adds a group of Balor N |
| 4. Hit and run | 2 | G2 is the Red Njord Barrage V with a Balor N (0.8.2pw; before: Balor V (1) + Loki N in the heart tunnel) |
| 5. Ironjaw | 3 | G1 adds a group of Balor V + Loki N · G2 adds a group of Morrigan V (1) + Balor N · G3 adds Balor V |
| 6. Freight lane | 4 | G3 adds a group of Argo N + Hestia N · G4 adds a group of Hestia N |
| 7. Claim jumpers | 4 | G4 adds a group of Gaia V + Hestia V |
| 8. Convoy | 5 | G1 adds a group of Hestia V + Loki N · G2 adds a group of Gaia V + Freya V · G3 adds a group of Argo V + Hestia V |
| 9. Caravan | 4 | The Caravan enters first. Freya V + Argo V (1) arrive next, followed by two Hestia V and a final Atlas V + Hestia V (1). |
| 10. Rookery | 3 | A veteran Morrigan and a pair of novice Lokis arrive in successive groups. One veteran and one novice Balor escort the Rookery. Its bays launch veterans. |
| 11. Patrol shift | 4 | G3 adds a group of Tyr V + Loki V · G4 adds a group of Tyr N + Loki N + Loki N |
| 12. Courier run | 4 | G4 adds a group of Thor V + Tyr V + Loki V |
| 13. Strike | 3 | G1 adds Loki V (1) · G3 adds Tyr V (1) |
| 14. Honorguard | 4 | G3 adds a group of Artemis V + Tyr V + Loki V |
| 15. Veteran wing | 4 | G3 adds a group of Artemis V (1) + Loki V |
| 16. Show of force | 4 | G3 adds a group of Mercury N + Victoria N · G4 adds a group of Bellona N + Mercury N |
| 17. Victoria dance | 4 | G2 adds Victoria V · G4 adds a group of Victoria V + Victoria V + Mercury V |
| 18. Battery test | 4 | G2 adds Mercury N · G4 adds a group of Bellona V + Bellona N + Mercury V |
| 19. Screened | 4 | G3 adds a group of Artemis A (2) + Victoria V (2) + Victoria V (1) · G4 adds Victoria V (2) + Mercury V (1) |
| 20. Heavy metal | 4 | G2 adds Bellona N · G3 adds a group of Bellona V (2) + Mercury V (1) + Victoria V (1) |
| 21. Picket | 4 | G3 adds a group of Mercury N + Mercury N + Bellona N + Bellona N · G4 adds Mercury V + Victoria N + Mercury N |
| 22. Reserves | 4 | G2 adds Mercury N · G3 adds a group of Bellona V + Bellona N + Victoria N + Mercury N · G4 adds Victoria N + Mercury N |
| 23. Ace screen | 4 | G1 changes from Bellona A (2) + Victoria A (2) to Bellona A (2) + Victoria V (1) · G3 adds a group of Bellona V + Bellona V + Mercury V + Mercury N · G4 adds Victoria N |
| 24. Elite guard | 4 | G2 adds Bellona N · G3 adds a group of Bellona N + Victoria V + Mercury V + Mercury N · G4 changes from Artemis A (2) + Victoria A (2) + Mercury V (1) to Artemis A (2) + Victoria V (2) + Mercury V (1) + Bellona V |
| 25. The line | 3 | G1 adds Bellona V (2) + Victoria V (2) |

## Frigate integration measurements

Levels 9 and 10 were retested after the frigate fixes on seeds 175, 718 and 941. The other rows retain their original measurements. Values are medians, except peak hostiles and pilot losses. All duration medians meet their bands. Damage rises through level 10 in both panels and falls on level 11. The only ordinary-health loss in these 18 sorties was level 10, seed 941.

| Level | Endurance seconds | Endurance damage | Peak hostiles | Ordinary seconds | Ordinary damage | Pilot losses / 3 |
|---:|---:|---:|---:|---:|---:|---:|
| 6 | 75.35 | 114.2 | 2 | 81.18 | 177.1 | 0 |
| 7 | 95.75 | 146.8 | 3 | 95.75 | 186.1 | 0 |
| 8 | 88.27 | 247.2 | 3 | 87.83 | 290.1 | 0 |
| 9 | 85.72 | 259.3 | 3 | 89.85 | 390.7 | 0 |
| 10 | 101.95 | 439.3 | 5 | 98.07 | 432.8 | 1 |
| 11 | 87.60 | 168.8 | 3 | 92.17 | 188.4 | 0 |
