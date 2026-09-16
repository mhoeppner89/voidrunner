## 0.8.2am — Arena progression and utility balance

- Normal Arena Run waves now add 30% max hull between fights; Field Repairs add 50%. Hard mode keeps its 10% recovery, and the frigate transition still receives its full service.
- The late Vanguard pair is staged: the veteran enters first and the ace arrives after twelve seconds, creating a deliberate isolation window before the frigate.
- Softened the harsh penalties on power, drive and recovery modules while keeping their roles distinct: larger capacitors recover a little slower, high-output reactors keep the normal reserve, and engine/thruster upgrades give up less handling or speed.
- Updated the Arena reward descriptions and German strings to match the new effects.
- Release identifiers: GAME_VERSION `0.8.2am`, CACHE `voidrunner-v263-0-8-2am-arena-balance`.

## 0.8.2al — Smartphone edge control correction

- Removed the landscape safe-area inset from the touch-pad horizontal anchors so the joystick and thrust slider sit 3px from the physical left screen edge.
- Kept the maximum joystick size capped against the cockpit monitor and pinned fire, missile and afterburner 3px from the physical right screen edge.
- Release identifiers: GAME_VERSION `0.8.2al`, CACHE `voidrunner-v262-0-8-2al-mobile-edge-controls`.

## 0.8.2ak — Smartphone control alignment

- Aligned the mobile joystick and thrust slider to the left edge with a 3px margin and kept the joystick's maximum touch scaling clear of the cockpit monitor.
- Aligned the fire, missile and afterburner controls to the right edge with a 3px margin; the afterburner remains slightly elevated above the weapon stack.
- Release identifiers: GAME_VERSION `0.8.2ak`, CACHE `voidrunner-v261-0-8-2ak-mobile-control-alignment`.

## 0.8.2aj — Larger smartphone flight controls

- Enlarged the mobile joystick and thrust slider and moved both closer to the left edge for easier thumb access.
- Made the afterburner target slightly larger and positioned it higher and farther right above the weapon controls. Desktop layout and fire/missile placement are unchanged.
- Release identifiers: GAME_VERSION `0.8.2aj`, CACHE `voidrunner-v260-0-8-2aj-mobile-flight-controls`.

## 0.8.2ai — Wayfarer and frigate combat balance

- Trimmed the Wayfarer's base durability from 100 shield / 200 hull to 95 / 190. Weapon slots, weapon stats and NPC pilot-skill curves are unchanged; a fully fitted Wayfarer remains viable while giving heavy hulls a fairer matchup.
- Raised the frigate main-battery authored damage from 60 to 72 before the shared 0.8 weapon scale (48 to 57.6 applied damage). PDCs, player weapons, exposed-mount counterplay, cover and recovery windows are unchanged.
- Release identifiers: GAME_VERSION `0.8.2ai`, CACHE `voidrunner-v259-0-8-2ai-wayfarer-frigate-balance`.

## 0.8.2ah — Global NPC aim-error default

- Raised the default non-frigate NPC pointing-error multiplier from 1.35× player-only / 1.00× NPC-vs-NPC to 1.50× for all NPC targets. Weapon stats, damage, cooldowns and pilot-skill ordering are unchanged.
- The spectator slider remains adjustable from 1.00×–2.00× and now defaults to 1.50×; Concord frigates retain their authored accuracy and missile interception remains precise.
- Release identifiers: GAME_VERSION `0.8.2ah`, CACHE `voidrunner-v258-0-8-2ah-global-npc-aim-error`.

## 0.8.2ag — Observer modal reset and no-limit guard

- Observer entry, restart and battle start now clear stale player-facing pause, map, ship-menu and chat modals. A focus-loss pause can no longer leave the observer displaying LIVE while its simulation and controls are blocked.
- Added a regression proving an observer fight remains unresolved after 6000 seconds when both teams are still alive; results still occur only after a team is eliminated.
- Release identifiers: GAME_VERSION `0.8.2ag`, CACHE `voidrunner-v257-0-8-2ag-observer-modal-reset`.

## 0.8.2af — Preserve observer pilot tiers

- Observer draft units now retain the pilot tier selected when each ship was placed, so Restart and Fleet return preserve mixed Rookie/Veteran/Ace formations.
- Release identifiers: GAME_VERSION `0.8.2af`, CACHE `voidrunner-v256-0-8-2af-observer-draft-tiers`.

## 0.8.2ae — Observer end-state controls

- Finished spectator rounds now hide pause and speed controls that cannot change a completed fight; Restart, Fleet and Exit remain available.
- Rebuilding the observer panel applies its editor/live state immediately, preventing stale combat controls after Fleet return or restart.
- Release identifiers: GAME_VERSION `0.8.2ae`, CACHE `voidrunner-v255-0-8-2ae-observer-end-controls`.

## 0.8.2ad — General NPC target priority

- NPCs now share one target hierarchy in the live game and observer combat: recent attackers first, ships actively targeting them next, then a valid current lock, then the nearest opposing combatant.
- Observer ships retarget surviving opponents after every kill and never fall back to the hidden observer player. Normal-game civilians remain passive until attacked, while hostile hunters retain their player fallback when no opposing NPC is available.
- Added focused targeting regressions for retaliation, nearest-opponent acquisition, observer retargeting and the no-player fallback.
- Release identifiers: GAME_VERSION `0.8.2ad`, CACHE `voidrunner-v254-0-8-2ad-npc-target-priority`.

## 0.8.2ac — Observer controls and placement

- Live observer camera framing now runs once when combat begins instead of overwriting manual zoom every render frame. Pause remains available during combat, and Fleet is hidden while staging.
- The selected ship type remains active after placement, so consecutive canvas taps add additional copies of the same ship while the current team and fit remain selected.
- Release identifiers: GAME_VERSION `0.8.2ac`, CACHE `voidrunner-v253-0-8-2ac-observer-controls`.

## 0.8.2ab — Compact observer lifebars

- Reduced observer shield and hull bars to roughly 40% width, with a small minimum width for readability. Unit names and bars remain anchored directly above ships.
- Combat behavior and balance are unchanged.
- Release identifiers: GAME_VERSION `0.8.2ab`, CACHE `voidrunner-v252-0-8-2ab-compact-observer-bars`.

## 0.8.2aa — Combat sim polish

- Refined the observer staging editor with clearer section hierarchy, stronger selected states, a wider setup card and a sticky formation footer that keeps counts and Start Battle available while the ship palette scrolls.
- Grouped the live toolbar controls, improved status and camera readability, and kept the team legend visible beside the editor.
- Enlarged projected unit labels and lifebars with compact shield/hull markers. Combat rules and balance are unchanged.
- Browser smoke checks passed for editor launch, placement, manual start, live lifebars, Fleet return, desktop/touch sizing and clean browser logs.
- Release identifiers: GAME_VERSION `0.8.2aa`, CACHE `voidrunner-v251-0-8-2aa-combat-sim-polish`.

## 0.8.2z — NPC collision separation

- NPC-to-NPC avoidance now uses both ships' real hull envelopes, a longer look-ahead and a stronger lateral turn, so fighter, freighter and frigate attack lanes separate earlier.
- Added a small damage-free NPC clearance shell as a last-frame safeguard. It pushes NPCs apart before their physical hulls touch without changing player collisions, weapons, accuracy or pilot skill balance; already-overlapping hard contacts still use the existing collision damage rules.
- Added a focused clearance regression. The collision, frigate, recovery and variety suites pass 81/81, and the controlled 3v3 head-on diagnostic produced zero NPC contact events.
- Release identifiers: GAME_VERSION `0.8.2z`, CACHE `voidrunner-v250-0-8-2z-npc-separation`.

## 0.8.2y — Observer editor return

- The observer toolbar's FLOTTE button now returns to the paused formation editor instead of opening the regular player ship-status menu over the fight.
- The current staged formation is preserved for repositioning, removal or refitting; the next manual start rebuilds fresh units.
- Release identifiers: GAME_VERSION `0.8.2y`, CACHE `voidrunner-v249-0-8-2y-observer-editor-return`.

## 0.8.2x — Safer NPC hull contacts

- NPC ship avoidance now uses the combined hull envelopes and a longer look-ahead when a fighter approaches a large ship, so normal attack passes turn away before the frigate hull is reached.
- A rare NPC fighter–frigate contact still hurts the fighter normally, while the frigate's received collision damage is reduced to 20% to reflect its heavier plating. Player collision rules and weapon/NPC skill balance are unchanged.
- Added focused collision regressions and verified six frigate balance fights; the targeted collision/frigate recovery/variety suites pass.
- Release identifiers: GAME_VERSION `0.8.2x`, CACHE `voidrunner-v248-0-8-2x-npc-collision-safety`.

## 0.8.2w — Hands-on NPC combat staging editor

- The NPC combat view now opens directly in a paused staging editor instead of a scenario menu.
- Choose Open Space, Asteroid Field or Debris Field, select Blue or Red, set pilot tier and choose the next ship's fit.
- Add seven authored ship types — Wayfarer, Vanguard, Talon, Prospector, Lancer, Atlas and Concord Frigate — by tapping the map. Drag placed units to reposition them, remove individual units, clear the formation, and start the battle by hand.
- Staged units use the live flight, pilot, weapon, projectile, collision, shield, hull and capital-frigate systems. The editor is a camera/UI layer over the real 3D fields.
- Added wheel/± zoom and drag-to-pan camera controls. The mouse ray now places on the visible world X/Z plane with a fixed world-Y level.
- Added a Fleet button to the observer toolbar; it opens the paused ship/fleet layout and Close returns to combat.
- Added a 1.00×–2.00× NPC aim-error slider for ordinary observer opponents. Concord frigates ignore it and keep their tuned capital accuracy; observer rounds have no time-limit draw.
- Release identifiers: GAME_VERSION `0.8.2w`, CACHE `voidrunner-v247-0-8-2w-observer-editor-camera-aim`.

## 0.8.2v — Combat fairness and NPC combat observer

- NPC forward guns and ship-mounted laser/PDC fire use a modest player-only pointing-error buffer. Missile interception remains precise.
- Weapon stats, damage, cooldowns, hull values and the novice/veteran/ace skill ordering are unchanged; NPC-vs-NPC accuracy is unchanged.
- Added an RTS-style NPC combat observer with 1v1, 1v2, 1v3, 2v3 and 3v3 matchups, live game-time clock, pause, speed control, restart and result display.
- Observer fights run through the live flight, weapon, projectile, shield and hull systems. Blue and Red can use independent role-default, balanced, close-assault, defensive-support or beam fits with real mount validation and fitted stats.
- Targeted accuracy, combat, turret, weapon and observer-fitting regression tests pass; browser smoke checks cover live fights, lifebars, speed, pause, restart and asymmetric fits.

## 0.8.2r — Cockpit damage and the frigate arena finale

- Four hull-damage stages add canopy fractures, broken-glass edges, instrument faults and emergency lighting. Each hull uses its own canopy mask; repairs restore the appropriate stage. Reduced damage effects are available in Display settings and respect reduced-motion preferences.
- Arena wave 9 fields two Vanguards. Wave 10 is a frigate with four physical main batteries and four PDC mounts, visible charge-up, synchronized three-shot salvos, long pauses and destroyable exposed assemblies. Full repair/rearm precedes the boss.
- The frigate retains its design and UVs with near-planar cleanup, 37,921 triangles (from 150,000), 512² texture (from 2048²) and a 1.75 MB GLB (from 6.62 MB). Shared turrets add 4,752 triangles.
- Removed the fixed dorsal gun and twin nose barrels, closing their openings with hull panels. Turrets now follow each hull’s interpolated pose; removed decorative hull scaling and stabilized the frigate’s broadside choice.
- Frigate finale starts inside the asteroid field. Heavy batteries charge visibly, fire dangerous salvos and recover; cover interrupts their attack. The labelled aim button cycles the hull and visible surviving main batteries; turrets can also be tapped directly. Destroyed mounts leave burned bases and stop firing. Boss shields/hull are 650/1,400 with no shield regeneration. A shared 2.5-second charge, 1.3-second salvo and 5.5-second recovery gives a real opening; anti-ship PDC fire also stops during recovery. Batteries commit to the observed course before firing, so deliberate turns can evade them.
- Fixed an ion fitting bug that also multiplied the owner’s shield capacity by eight; the ×8 multiplier now applies only to shield damage.
- Active eight-wave checkpoints extend to ten waves; finished legacy records stay finished. Hostile patrols retain their player target instead of switching back to policing other hostiles.
- Local tests: `.freebuff/frigate-r/play.html` (levels 9/10 and hull-damage slider) and `.freebuff/frigate-r/review.html` (model comparison, turret layout and arcs).

## 0.8.2q — Combat movement and limited shield recovery

- Let NPC boost commitments last through hull acceleration and turning. Trained pilots avoid slow defensive drifts that leave them easy to track.
- Faster damaged ships can briefly withdraw; slower ships can seek nearby cover. Recovery aims for partial shields, with a 14-second cap, an 18-second cooldown, and one attempt per opponent (two for aces).
- Once clear, use a broad return arc. Do not abandon an affordable finish against an exposed, damaged opponent. A withdrawing wingman yields the pressure role to an ally.
- Preserve finite fuel, normal acceleration, turn limits, weapon accuracy and shield recharge. Offensive fire pauses during recovery; missile interception remains active. Cover recovery uses the last seen target position if contact is lost.
- Local test page now includes Wayfarer, Beam/Ripper options, and a Damaged veteran preset. See docs/combat-review/RECOVERY.md for movement checks, TTK limits and NPC duel results.

## 0.8.2q — Weapon accuracy and pilot skill

- NPC beams retain forgiving acquisition but gain physical pointing error: novices miss sometimes, veterans less often, aces rarely.
- Magrail spread accounts for range and pilot skill; its fast projectile remains useful against evasive targets.
- NPC PDC and tracking-turret accuracy, acquisition and traverse now depend on pilot skill when attacking ships. Missile-interception accuracy and shared recovery are preserved.
- Pulse and Ripper can attempt brief speculative bursts near a firing opportunity. The barrel remains physical, assistance stays narrow, and an ally in the actual firing line stops the shot.
- All pilots retain small changing aim errors. Limited turn compensation uses only recently observed target motion and resets after lost sight or a target change.

## 0.8.2q — Tracking moving opponents

- Give trained pilots more room against moving targets and let them match closure below the previous cruise floor when already too close.
- Prioritize the forward firing solution during a useful attack window; approach offsets no longer continually pull guns off target. Cooling weapons retain the same tracking geometry.
- Keep tracking through a short capacitor recharge pause instead of turning away and boosting. Threat and shield-recovery breaks remain active.
- Improve veteran motion lead from 0.888 to 0.96; novice lead, ace lead, dispersion, weapon damage and firing cones are unchanged.

## 0.8.2q — Predictive NPC flight decisions

- Anticipate overshoot using closing speed, hull braking and turn time; stop boost before a pass becomes unmanageable.
- Cut across distant targets' paths and use a shallower pursuit angle when following a close turn. Gun lead stays separate during drift.
- Choose escape directions from observed attacker geometry and clear corridors. Novices consider lateral exits; trained pilots can also break above or below.
- End drifts and reversals when a useful firing attitude returns. Trained pilots can briefly hold an affordable shot; heavy incoming damage still forces a break.
- Change approach after an unproductive chase. Groups share a pressure pilot and approach from separate flanks, withholding rounds when an ally crosses the firing line.
- Recover from blocked field routes by choosing a short clear exit, allowing enough turning time, and replacing an exit made unsafe by remaining drift.

## 0.8.2q — Hunting, evasive flight and Sunlance balance

- Replace crawl-speed alignment and automatic long strafing runs with speed-matched hunting, short clearance moves and finite boost bursts. Track moving firing solutions within the hull's normal turn authority.
- Novices break early under light fire. Veterans and aces judge recent damage against remaining reserves. Visible incoming projectile paths can trigger a delayed response; covered shots and harmless flybys do not.
- Give veterans deliberate drift passes. Aces also combine boost, coasting turns and reversals. Obstacle clearance cancels unsafe commitments; dense fields retain their escape steering.
- Improve Talon acceleration 36→46, angular acceleration 2.45→3.4, boost speed 114→128, and assisted lateral recovery. Applies to player and NPC Talons.
- Halve Sunlance direct damage 180→90 and energy per shot 32→16. Keep its 1.5-second interval and small splash. Two direct hits leave a fresh Talon with 15 hull.

## 0.8.2q — PDC cadence, novice alignment and ion hit rules

- Double mounted PDC shot/burst intervals and per-round damage (2.2), preserving nominal burst-cycle DPS. Double drone shot interval (0.4 s) and round damage (1.6), preserving 4 hull DPS. Shared missile-interception recovery is 2.5 s.
- Novices wait for the four-degree forward firing window and compensate for relative motion more accurately. Their wide dispersion and four-shot bursts with long pauses remain; gun damage is unchanged.
- Ion disruption requires shields to be down before the ion hit. A shield-breaking hit does not disrupt; a subsequent ion hit can. Non-ion damage cannot apply the effect.

## 0.8.2q — Combat recovery and engagement rules

- Give NPCs room to turn and reduce approach throttle while lining up narrow forward guns, restoring fire on later passes.
- Ion deals ×8 shield damage. Exposed weapons fire at half rate for 0.8 seconds, spending twice the energy per shot; the three-second disruption recovery remains.
- Patrols exclude themselves and disengaged ships. They pursue the last seen position for up to four seconds and may fire physical rounds toward it for 0.8 seconds; cover still blocks projectiles.
- PDC drones and mounted turrets respect pirate demands and stand-down states. Incoming missile defense remains active, with the existing shared recovery limiting volley interception.

## 0.8.2p — Wreck variety and smaller assets

- Give the eight repeated frigates four fixed section arrangements and the two cruisers distinct breakups, sharing GLB files, meshes, textures and collision buffers.
- Use matching section transforms for visuals and collisions. Keep cruiser interiors and salvage placement fixed.
- Install the reduced wrecks with faded 512px maps and an asymmetric Talon wing-root/nose breakup; regenerate collision surfaces.
- Combined wreck downloads fall from 12.81 to 9.62 MB. Unique triangles fall from 302,469 to 222,407.

## 0.8.2o — Compact, sharper ship textures

- Limit all six ships' color and material maps to 1024×1024. Apply modest contrast and restrained sharpening to color maps while preserving material masks.
- Preserve the approved original paint schemes, geometry, UVs and fitted canopies. Combined GLB downloads shrink from 15.03 to 11.50 MB (23.5%).
- Estimated RGBA8 texture memory including mipmaps falls from 144 to 64 MiB across the six hulls. This is not a measured FPS improvement.
- Refresh the service-worker cache so returning players receive the smaller models.

## 0.8.2n — Optimized ships with fitted canopies

- Ship all six optimized original hulls, retaining their original paint schemes. Combined geometry falls from 333,788 to 178,253 triangles (46.6%).
- Wayfarer has nine larger mirrored panes, triangular forward side windows, aligned dividers and solid frames fitted to the hull. It uses 22,900 triangles.
- Lancer retains its original textures with symmetrical glass and conservative hull/wing straightening, at 28,108 triangles. Atlas retains its symmetrical bridge windows.
- Preserve turret positions, rebuild hull obstruction clearance, and retain the cockpit turret visibility and canopy material fixes. Invalidate the service-worker cache for returning players.

## 0.8.2m — Lancer canopy correction

- Clear uneven hull triangles from Lancer's six mirrored glass panes, keeping UV seams closed and retaining its original textures and 28,978 triangles.
- Extend the canopy symmetry and obstruction regression check to Lancer. Keep its belly turret mount unchanged.

## 0.8.2l — Symmetrical Wayfarer and Atlas canopies

- Keep the optimized original hulls and their existing textures. Mirror canopy glass and frames precisely about each ship's centerline.
- Seat the hull surface below the windows so uneven triangles cannot cut across the panes. Move coincident UV-seam vertices together to avoid gaps without welding or changing UVs.
- Preserve polygon counts and turret positions. Add front/top canopy views to the local ship comparison.

## 0.8.2k — Cleaner ship models and sharper textures

Original prompt: Clean up the ship models in Blender, reduce polygons, add crisp reflective glass and frames, and sharpen the textures while preserving Talon's look.

- Reduce the six hulls from 333,788 to 178,293 triangles (46.6%), protecting UV boundaries to avoid cracks or distorted paint stripes.
- Restore 2048px source paint maps for five hulls; Wayfarer retains its native 1024px source. Apply restrained sharpening to the five non-Talon paint maps and enable 8× anisotropic filtering, capped by the GPU. Keep material masks at 1024px.
- Fit separate opaque reflective glass and frames into existing windows; preserve Talon's green canopy. Keep Atlas's two bridge window bands. Preserve canopy material colors under NPC faction tinting.
- Keep turret mounts fixed and rebuild obstruction clearance against the reduced hulls and canopy parts. Preserve the cockpit turret visibility fix from 0.8.2j.
- Local before/after review: `.freebuff/ship-cleanup/review.html`; drag to rotate and select any hull. Editable Blender source: `glb_models/ships-cleaned.blend` (local authoring archive).

## 0.8.2j — Cockpit turret visibility

Original prompt: The Wayfarer cockpit shows its turret even though the mount is behind the canopy.

- Omit own-ship exterior turret meshes from the cockpit renderer, which uses a ship-centre camera and does not draw the exterior hull. Retain turret combat logic, NPC models and exterior model inspection.

## 0.8.2i — Lower turret mounts

Original prompt: Wayfarer and Lancer turrets protrude too much.

- Remove the extra support pedestals on those hulls and seat the turret bases directly against the local hull surface. Rebuild clearance for the lower pivots.

## 0.8.2h — Revised turret positions

Original prompt: Move the Wayfarer turret forward onto the antenna area, put Vanguard turrets on the ship's sides, and move the Lancer turret underneath.

- Refit those three hulls and rebuild clearance from their meshes. Vanguard mounts now use port/starboard normals for aiming, model orientation and firing arcs. Lancer uses a lower mount.
- Updated local model inspection and regression checks for side and belly coverage.

## 0.8.2g — Turret overhaul

Original prompt: Review turret placement, logic and models on all hulls; reduce anti-ship accuracy, increase damage slightly, and let close missile pairs and swarms overwhelm point defence.

- Blender-authored laser and four-barrel PDC assemblies with fixed bases, independent yaw/elevation, fitted pedestals and rebuilt hull clearance. All five turret-capable hulls covered; Talon remains turret-free.
- Laser damage 4→6; turret PDC damage 0.8→1.1. Anti-ship tracking error grows with distance, with 0.3 s acquisition on a new target. Ship targeting remains selected-hostile support within 300 km.
- A mothership's PDC turrets and escort drones share a 1.25 s interception recovery. Precise single-missile shots remain; close pairs and swarms can penetrate.
- Local isolated sorties: `game.html?turret-test=1` (PDC), append `&turret=laser` for laser. Interactive model inspection: `.freebuff/turret-review.html`.
- Verification: 54 automated checks passed across weapon/turret and drone suites; affected turret cases rechecked after final barrel-clearance fix. 24 controlled damage scenarios and desktop/landscape-phone browser captures. Details: `docs/turret-review/IMPLEMENTED.md`.

## 0.8.2f — Clear radar

Original prompt: Remove tracking/signature status messages such as “Ortung · bekannt” to keep the radar clear.

- Remove the radar status strip and its HUD update. Detection and identity mechanics remain unchanged; the diagnostic status helper remains available.

## 0.8.2e — Hyperdrive console button

Original prompt: Lower the hyperdrive button and integrate its styling into the cockpit sprite.

- Lower the button into the centre console, with a brass bevel, recessed navy face and mounting screws. Preserve ready illumination and the touch hit area.

## 0.8.2d — Monitor fit and joystick travel

Original prompt: Align cockpit monitors with the painted sprite, halve the joystick centre knob, and let maximum touch scaling reach the own-ship display.

- Sprite and live monitors share one coordinate system and banking transform across screen sizes.
- Fit monitor rectangles to the sprite's actual display openings.
- Joystick knob is 21px; steering area grows with touch scale toward the own-monitor bezel.

## 0.8.2c — Automatic scans and clear radar

Original prompt: Remove redundant asteroid scan controls and remove ID/signature from the radar.

- Selected asteroids and wrecks already scan automatically in range. The secondary button now launches missiles, deploys/recalls mining drones, operates salvage, or captures surrendered pilots according to the target. The primary button always fires guns.
- Remove radar ID/signature text; move the transponder switch into the ship menu. Radar tap still opens navigation.

## 0.8.2b — Cockpit controls (local preview)

- Expose joystick selection on the title screen; retain tilt and existing saved preferences.
- Recessed cockpit controls, circular joystick travel, a small central deadzone, and reliable recentring.
- Move radar identity/signature to its lower edge and suppress quiet tracking text.
- Reduce repeated mining information and compact service/equipment spacing.
- Landscape-only play retained. Test at http://localhost:4184/game.html?drone-test=1; choose Joystick in Pause → steering.

# Changelog

## 0.8.2a — Drone mining and PDC escorts

- Mining is drone-only on Wayfarer and Prospector. Assignments survive retargeting; travel waits for drone recovery.
- Normalize cargo to one mass per unit, rebalance commodity prices, and refund the retired mining upgrade in existing saves.
- PDC drones defend against missiles first, attack hostile ships within 300 km, and use the new single/multiple-drone escort formations.
- Fix distant Azure ring holes in the fullscreen ring-volume pass.
- Keep the local drone-test launcher and isolated test-save mode. Include the interface review as documentation; its proposed redesign is not implemented.
- Build 0.8.2a; save schema 16; cache v194-0-8-2a-pdc-combat.

## PDC drones — automatic ship attacks

DEFEND now attacks the nearest unobstructed hostile ship within 300 km of each drone, without needing target selection. Incoming missiles/torpedoes remain first priority; interception range is also 300 km. Ship shots use physical PDC rounds, finite ammunition and the existing damage profile. Orbit/escort and empty-magazine recall remain unchanged. Mothership, intervening ships and world obstacles block firing. Ship attacks respect hold-fire flags; neutral, dead and racing ships are excluded. Updated English/German bay instructions. Cache v194-0-8-2a-pdc-combat.

Validation: drone combat tests cover the range boundary, hostile-only targeting, nearest clear target, missile priority, ammunition, reservation separation and hull occlusion. Existing drone and formation tests pass. Browser: 100 drone shots reduced a stationary test hostile from 1,000 to 920.8 hull while all three drones continued escorting; no browser errors. Artifacts in .freebuff/pdc-combat/. Local test remains port 4183.

## PDC escort formation — local follow-up

A single PDC drone holds beneath the deck turret, opposite its side of the hull and at the same fore/aft station. Two or three escorts are evenly spaced on a 12-second circular orbit around the ship's local Z axis at mid-hull: above, starboard, below, port. Radius clears the larger hull half-width/height by 15 simulation units. Anchor velocities include orbit motion, ship translation and rotation; drones physically fly to changing positions and recall normally. Targeting remains missile/torpedo defense, not attacks on enemy ships.

Validation: focused formation checks cover 1/2/3 drones, equal spacing, quarter-turn orbit, ship rotation, physical tracking and recall; existing drone assertions pass. Cache: v193-0-8-2a-pdc-formation. Local test remains port 4183.

## 0.8.2a local follow-up — Azure rings and PDC setup

Fixed the actual fullscreen ring-volume pass: stable depth reconstruction uses the far edge of a 24-bit depth sample, while analytic sphere intersection keeps the rear ring behind Azure. The previous planar-ring polygon offset did not affect this pass. Full-flight before/after screenshots reproduce and remove holes at 180,000 and 400,000 distance; a foreground-occluder check also covers nearby objects.

Outfitting → Ship systems now includes drone refill/repair/rearm and PDC DEFEND/STOW beside bay selection. PDC launch is automatic after takeoff in DEFEND mode. Browser testing selected PDC, bought a full 120-round drone for 1,500 credits, and verified automatic escort after launch. No browser page errors. Local test remains http://localhost:4183/game.html?drone-test=1; cache revision v192-0-8-2a-ring-depth. No GitHub publication.

## 0.8.2a — Streamlined drone mining (local test)
Validation for 0.8.2a: focused drone, cargo economy, save migration, fitting, ship stats/trade, input, tutorial and phone-dock checks passed. Browser: primary-pad mining, physical delivery, independent retargeting, queued hyperdrive engagement after recovery, ore sale and drone service passed at 844×390. Real generated deposits are rounded up to whole extractable units, including legacy remnants; this fixes the prior fractional-deposit rejection. Browser diagnostic checks were clean. Screenshot artifacts: `/tmp/vr-drone-final/` and `/tmp/vr-drone-browser/`. The live test server is port 4183. No GitHub push was made. SAVE_VERSION 16; GAME_VERSION 0.8.2a; CACHE voidrunner-v191-0-8-2a-drone-mining.


Only Wayfarer and Prospector can mine. Tap the primary MINE pad (or press M) to deploy miners; tap RECALL to recover them. The secondary pad remains SCAN. A mining assignment survives changing your selected contact. Hyperdrive recovers mining and PDC drones before departing; tap hyperdrive again to cancel the queued departure. Emergency abandonment is a deliberate two-step action in the ship menu.

All commodity and sealed-cargo units occupy one hold space. Ore has a base price of 315 credits: the actual Helix sale quote averages 6,338 credits for 32 ore across 32 initial market seeds; 29 ore plus 3 gold averages 11,350 credits. Other goods retain approximately their former base value per hold space (water 18, food 38, medicine 290, electronics 407, machinery 80, gold 1,800, scrap 43, luxuries 413, arms 439). Gold pockets retain their 8% chance and 1–3 unit yield; overflow appears as collectible cargo instead of disappearing.

The Resonant Mining Lance is retired. Save schema 16 refunds each installed or stored copy at 7,600 credits once. Existing cargo counts remain intact if the new total exceeds capacity; sell or jettison the excess before loading more. Inbound drone cargo reserves space against mining, salvage and pickups.

Bay configuration is in Outfitting. Services offers one default drone service action, with maintenance-only under Service options. Fleet details and emergency abandonment are in the ship menu. The distant-ring correction from 0.8.1a is included.


## 0.8.2 — local test, 2026-09-12

- Add mining drones that launch, cut ore, return it to the hold and repeat. The existing missile control starts mining on a scanned asteroid in range or recalls active miners. Leaving range also recalls them.
- Dedicated bay matrix: Wayfarer 1; Prospector 3; Talon, Vanguard, Lancer and Atlas 0. Each bay fits either 2 mining drones or 1 point-defense cannon (PDC) drone; Prospector can mix bay modes.
- PDC drones escort the ship and intercept hostile missiles and torpedoes with finite ammunition. Drone losses persist; station service supports replacement, repairs and PDC rearming, using compatible locker stock before buying replacements.
- Complete station and cockpit UI integration, including the asteroid SCAN fallback for PDC-only fits.
- Set ore mass to 1.0 per unit and base price to 520 credits. A stock Wayfarer's 32-mass hold now fits 32 ore units, targeting roughly 10,000 credits gross at Helix's refinery market before operating costs. Local supply, demand and market cycles determine the actual payout.
- Bump package metadata to 0.8.2 and the service-worker cache to `voidrunner-v189-0-8-2-mining-drones`. Precache all five drone modules (`droneData`, `droneMining`, `droneSystem`, `dronePdc`, `droneService`); other flight modules and optional art are cached after use.

Validation:

- Focused Luna Max unit test `src/game/drones.test.mjs`: 1/1 passed.
- Earlier Luna Max browser integration pass at `http://127.0.0.1:4182/game.html`: 15/15 passed, covering Wayfarer mining, out-of-range recall, PDC-only SCAN fallback, finite-ammo PDC, service UI, Prospector's three bays and clean browser diagnostics.
- A later manual CUA/Luna attempt was blocked by the harness and did not establish a product failure. Freebuff GLM 5.3 Flash exploratory checks were used via computer use.
- The old fleet-loadouts probe has stale 0.8.1 catalog assertions. These results do not claim a completed live-phone pass; the 0.8.1 validation below remains separate history.

Status: completed local 0.8.2 mining-drone test build on `codex/0.8.2-mining-drones`. No GitHub push or publication was made.

## 0.8.1 — 2026-09-11

- Add an eight-wave Arena Run with equipment sets, hull changes, saved preparation checkpoints and an unlockable hard mode.
- Preserve arena throttle, start wave one directly, simplify rewards and fix undocked outfitting. Replace repair rewards above 80% hull.
- Add hull-specific automatic PDC and tracking-laser turrets, equipment alternatives, two-beam starter and Fire all gun groups. Preserve displaced equipment in existing saves.
- Improve NPC field navigation, bounded steering and ace manoeuvres. Make novice gunfire less accurate and missile launches slower with fresh warnings.
- Set beam/PDC reach to 300 km, Ripper to 350 km, pulse/ion to 400 km, plasma to 450 km and Gauss to 600 km.
- Standardise projectile speed and lead: normal rounds 500 km/s, Gauss 1,200 km/s, plasma 300 km/s; beams remain instant.
- Restore original turret mounts, check forward hull clearance, and add missile-priority PDC interception plus ten-round anti-ship bursts.
- Fix Lancer beam convergence and plasma direct/splash damage. Increase missile speed while retaining bounded turns, finite magazines and early missile-free arena waves.

Validation: automated combat, save, arena, equipment and field-flight regression suites. Actual-model projections checked restored mounts. Live phone combat feel and layout still need verification.
