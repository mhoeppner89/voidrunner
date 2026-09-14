# 0.8.2q annotation follow-up

Implemented the user's PDC interval/damage change, novice alignment improvement, and shields-already-down requirement for ion disruption.

PDC: turret shot interval 0.07→0.14 s, burst pause 1→2 s, damage 1.1→2.2. Ten-round burst-cycle nominal hull DPS remains 6.748. Drone interval 0.2→0.4 s, damage 0.8→1.6, preserving 4 nominal hull DPS. Shared interception recovery 1.25→2.5 s. Magazine sizes and energy costs are unchanged, so reduced ammunition/energy spending per second is a consequence of the slower cadence.

Physical 280 km missile probe: one seeker stopped; second seeker at legal 1.1 s gap penetrated for 42 damage; swarm delivered 45; isolated torpedo stopped. A torpedo pair at 2.6 s remains interceptable. Latest results overwrite missile-cadence.json; NEXT_BALANCE.md retains the earlier baseline table.

Novice trial at six-degree trigger cone and 0.75 lead did not improve actual hits and was discarded. Final four-degree cone and 0.888 relative-motion lead retain 2.5-degree dispersion, four-shot bursts and 1.2 s pauses. In the same three 60-second stationary Wayfarer exposures, gun damage was 30, 10, 50 (previously 10, 20, 20). Projectiles fell from 72 each to 58, 56, 56. This is a modest aggregate improvement, not a claim of settled novice difficulty. Latest novice-guns.json contains final results; NEXT_BALANCE.md records the baseline.

Ion: snapshot shield level before damage at both damage entry points. Require ion identity, positive hit amount and shields already down; preserve 0.8 s disruption and three-second recovery. Tests cover shield-breaking hits, subsequent ion hits, non-ion hits, player and NPC parity.

63 focused checks passed, including DPS arithmetic and missile-volley regression coverage. Game remains a local 0.8.2q build; service-worker cache advanced.
