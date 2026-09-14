# Hunting and evasive flight — local 0.8.2q

Later changes and current verification: [Predictive flight decisions](PLANNING.md).

Approved work: replace slow predictable alignment with sustained hunting; break away readily for novices but use damage tolerance for trained pilots; add veteran/ace drift tactics, improve Talon high-speed handling, and halve Sunlance damage and energy cost.

## Behavior

Unthreatened pilots normally hunt, matching radial speed and adjusting closure toward their weapon's preferred range. Requested open-space speed stays at least 65% of cruise. Actual speed can fall during a reversal, obstacle braking or momentum recovery. Close clearance, dangerous incoming fire, low capacitor or shield recovery justify short breaks; they no longer extend simply because the ship crossed its old pass distance.

The steering controller anticipates changing firing attitude without exceeding the same angular acceleration limits as player flight. That anticipation is disabled while following obstacle routes. Threat sensors sample real approaching projectile trajectories at 5 Hz and check cover. They do not inspect player inputs. A projectile is counted once by the sensor; actual hits also contribute to recent damage pressure. Reaction delays are 0.3 s for novices, 0.18 s for veterans and 0.1 s for aces. Novices react to any positive hit, including shield-reduced PDC grazing fire. Trained pilots compare accumulated recent damage against a reserve derived from shields and hull; aces accept more risk.

Veterans and aces can preserve lateral velocity while rotating toward a firing solution. Aces additionally use a boost/reversal sequence with a coasting phase and field-specific rolling breaks. They only commit after a clear-path check that accounts for speed and acceleration. Fuel limits and recovery intervals remain active. Drifting is not a free lateral translation or an instant change of velocity.

Talon: cruise remains 76; afterburn speed 128, acceleration 46, angular acceleration 3.4, angular damping 3.15 and assisted lateral recovery multiplier 1.2. The same hull stats apply to player and NPCs.

Sunlance: 90 direct damage, 16 energy, 1.5-second cooldown. Splash remains 24 maximum within 18 km. A dual mounted salvo spends 32 energy and leaves the standard full-health NPC Talon (58 shield + 137 hull) at 15 hull if both rounds connect. Wounded ships can still be finished by one hit.

## Verification

141 focused tests passed with the Node offline-import hook, covering combat-hunting, combat-q, npc-gunnery, turret-overhaul, field-combat-nav, flight-weapons-regression and arena-run. The field test includes 72 generated encounters (two seeds × two environments × six hulls × three pilot tiers). It checks continued movement, stall duration, turn bounds, impacts and maneuver choices. New tests cover light versus heavy threat reactions, NPC/player damage parity, covered/near-miss projectile sensing, pursuit/boost decisions, bounded tracking and paired Sunlance hits.

Additional fixed-step firing probes use stationary, turning and fleeing targets plus isolated asteroid cover. They are limited trajectory checks with a non-retaliating target, not duel win-rate measurements. During development they caught a pilot orbiting one rock without firing and an interaction between target anticipation and obstacle steering; both were corrected. Intermediate hunting-probe JSON records are diagnostic, not a final balance table.

Six 30-second browser campaign checks passed without page or console errors: waves 1, 3 and 6, each with pulse and legal Sunlance/pulse fits. All three tiers used afterburner; veteran and ace cases included drift passes. The paired Sunlance hit left the ace Talon alive at 15 hull. These runs use a limited scripted player and do not establish human win rates or a final difficulty ranking. Results: `campaign-hunting.json`.

The separate capture check verified that the real animation loop exits the countdown and starts combat, and that Expand game fills a landscape-phone viewport. Desktop and phone screenshots were inspected. One capture attempt had an unidentified transient resource failure; the repeat with request logging completed without errors. Final capture state: `hunting-capture.json`.

The local review page stages genuine campaign waves with legal preset guns: Sunlance on medium mounts and pulse on small mounts. Choose Talon or Vanguard and novice/veteran/ace/final waves. It uses separate simulator state, not the career save. Use Expand game for the full cockpit, then exit fullscreen to change presets.

Play: http://localhost:4184/.freebuff/combat-review/play.html

No commit or push performed. Combat difficulty still needs hands-on feedback; these checks verify the intended behavior and eliminate the previously measured crawl and damage extremes.
