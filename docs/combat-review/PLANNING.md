# Predictive flight decisions — local 0.8.2q

Follow-up: [Tracking moving opponents](MOVING_AIM.md) adjusts range control, pursuit priorities and capacitor recovery after testing against moving targets. The settings below describe the earlier checkpoint.

Requested: implement the seven suggested heuristics, building on the approved hunting, threat response, Talon and Sunlance changes.

## Implemented

1. Overshoot prediction uses closing speed, hull braking acceleration, reaction delay and the turn toward a future sightline. A hunting ship cancels boost when the remaining room is insufficient. Temporary braking may request 45% of cruise; normal hunting still requests at least 65%, and actual momentum remains governed by the shared flight integrator.
2. Distant moving targets invite an intercept approach. Close turning targets invite lag pursuit. These blend with the firing lead; a drift can aim its nose directly at the firing solution while preserving velocity.
3. Escape choices compare bounded estimates of motion, attacker facing and two segments of exit clearance. Novices compare left/right at a slower cadence; veterans and aces also consider above/below. A chosen direction is held briefly. Attacker orientation is read only with an unobstructed line of sight, and patrol memory cannot reveal a hidden ship's orientation.
4. Drifts/reversals can finish before their maximum duration when the firing attitude, distance and velocity are useful again. Unsafe trajectories cancel immediately. An opening gap can also end a maneuver.
5. Veterans and aces can hold a good firing opportunity for 0.45/0.65 seconds when their reserves allow it. Aces may commit against a visibly vulnerable target. Heavy incoming damage cancels the commitment, and novices still break under light PDC hits. Firing cones, dispersion, energy, cooldowns and cover remain active.
6. A chase with no shot or meaningful angle/range progress triggers a short change of approach after 7/5/4 seconds for novice/veteran/ace. Cover, navigation and target changes reset it. It cannot repeatedly restart without recovery time.
7. Nearby allies already attacking the same target share one pressure pilot. Others establish different flank approaches; the offset fades near firing range. A pilot withholds forward gunfire when an ally lies in its firing lane. Stand-down and surrender rules still gate participation.

The tactical planner runs at 3.3 Hz for novices and 5 Hz for trained pilots, with cached vectors. Team assignments refresh at 2 Hz and normally retain a leader for two seconds. Collision steering runs after tactical choices. Recovery from a blocked field route now checks 26 nearby exit directions only when stuck, allows hull-dependent turning time, and revalidates the corridor as residual drift moves the ship.

## Verification

- 132 combat, gunnery, flight, campaign and new planning checks passed across `combat-planning`, `combat-hunting`, `combat-q`, `npc-gunnery`, `flight-weapons-regression` and `arena-run`.
- 12 field checks passed, including 72 generated encounters: two seeds, asteroid/debris environments, six hulls and three pilot tiers. Mean time below 20% of cruise was 0.40% in debris and 8.03% among asteroids. Turns and stall durations stayed within existing regression bounds. Twelve collision events occurred across those 72 minutes; this is not a claim of collision-free flight.
- The first field run exposed long stalls on heavy hulls. Recovery previously changed direction before the turn finished and could retain a corridor invalidated by drift. The corrected recovery passes the same unchanged movement/stall assertions.
- Two browser checks passed without page or console errors: a veteran campaign duel and the Three aces preset, each run for up to 20 simulated seconds with a bounded scripted player. All three group opponents fired and shared pressure/flank roles. Direct/lead/lag pursuit, overshoot braking, drift, reversal and chase recovery were observed. The scripted player died in the group test; this is not a human difficulty measurement. Results: `planning-browser.json`.
- Desktop and 844×390 landscape-phone screenshots were inspected (`planning-desktop.png`, `planning-phone.png`). The group screenshots capture the final lethal hit before the delayed defeat overlay. The preset and fullscreen controls worked.

These are behavioral checks and short scripted encounters, not human win-rate measurements. No weapon damage or hull stats changed in this follow-up. The work remains local and uncommitted.

Play: http://localhost:4184/.freebuff/combat-review/play.html — choose a campaign wave or Three aces. Expand game fills the landscape cockpit; exit fullscreen to change presets. Uses separate simulator state.
