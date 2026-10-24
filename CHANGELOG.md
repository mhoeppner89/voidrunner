## 0.8.2lf — One German table

- Merge the German catalog into a single ordered table. `DE_CATALOG` was a literal plus ~35 appended `Object.assign` blocks, so a key could sit in the file twice and the last definition silently won; the entries now live in one literal grouped by area (flight and cockpit, stations, missions, game data, then the later feature passes: outfitting, wingmen, capital combat, lore) and end with the two generated blocks that fold in the equipment naming table and the tutorial copy from their own modules. Entry-for-entry identical to the previous build — verified by comparing all 3,495 final entries before and after, with 0 changed and 0 lost.
- Remove the duplicates the merge exposed: 8 appended entries repeated the literal, and 5 pairs inside the literal repeated each other ("Radar range", "SHIELD", "Courier", one siege-ordinance line). Identical text, so no player-visible change.
- Add a fallback-coverage test: every literal key handed to `t()`/`translate()` anywhere in `src/` must have a German entry. It caught 16 labels that had been rendering in English — FIRE, PAUSE, PAUSED, RESTART, CONTINUE, SELECT, SWITCH, TORPEDO, LIVE, TEAMS, MISSION CARGO, "Scan this wreck first.", the ore-deposit toast, the race-time tooltip, the wing-order call for Rin Vek and the `{seconds}s` countdown suffix. All translated.
- Tighten the catalog guard: any duplicate key now fails (identical or not), as does a reassignment appended below the literal, an empty value, or a German value that drops or renames a `{placeholder}` of its key.

- Release identifiers: GAME_VERSION `0.8.2lf`, CACHE `voidrunner-v580-0-8-2lf-catalog-table`.

## 0.8.2le — Dialogue pass

- Read every authored line in both languages — distress variants, arrival briefings, adventure dialogue, tutorial coaching, radio traffic, bar conversations and contract briefs — and fixed the places where the German had drifted from what the game actually does or from how people speak.
- Stop translating names: a Vanguard pair is a “Vanguard-Paar” again instead of a “Vorhut-Paar”, the Shard Gauntlet and Hard Run keep their names, and “The Shardbelt” no longer carries its English article into a German sentence.
- Repair German that duplicate catalog keys had silently shadowed: the radar upgrade promised 25 % instead of 50 % target range, and the prologue completion line read “Das Prolog”. A unit test now fails when the catalog redefines a key with different text, so a later `Object.assign` block cannot overwrite a translation unnoticed.
- Fix meaning errors: the NPC observer reported “ships aiming at you” instead of ships holding fire, “kill the screen or the hunter” became “Erledige den Schirm” (a window screen) instead of the fighter screen, and a 40 % hull refill was phrased in “Prozentpunkte”.
- Say what the transponder button actually shows. The monitor button displays the current state, so Paul now points at “the button that currently reads TRANSPONDER ON” instead of telling the pilot to press a label that is already active; switching back on points at the OFF label.
- Replace literal calques with German that reads like speech: “Nicht mein Krieg” → “Nicht meine Schlacht”, “Mulis” → “unbewaffnete Frachter”, “Beacon” → “Bake”, “Metall berührt” → “an Metall geschrammt”, and the trade tip no longer says a station “gives” a commodity at a price.
- Repair German grammar and register in the coaching and radio lines: “Vergleich” → “Vergleiche”, “Klicke” → “Tippe”, “Erprobe” → “Probier … aus”, “Ziehe den Schub” → “Setze den Schub”, “Rin ist auf Cairn zurück” → “Rin ist zurück in Cairn”, and traffic control speaks instead of filing memos (“Freihaltung der Gasse”).
- Keep the flavour radio and bar lines in one voice across systems, and align the capital-ship item names (“Großkampfschiff-Gaußkanone” rather than “Kampfschiff-Gausskanone”).
- Add a German catalog guard test for conflicting keys, translated proper nouns and shifted numbers. Focused dialogue and localization suites: 70 tests.

- Release identifiers: GAME_VERSION `0.8.2le`, CACHE `voidrunner-v579-0-8-2le-dialogue-pass`.

## 0.8.2ld — Arrival briefings

- Open the channel for every distress variant on arrival, not just the debris escort. Once the pilot is in comms range the briefing opens itself — convoy attack, wreck, trap, fuel, accident, debris, cargo, dispute — with the variant's own choices (accept, scan, hand over, side with a crew, decline). The world pauses while the card is open, so the scenario starts after the decision instead of running behind the panel; closing without deciding leaves the journal answer live and the briefing never pops up again uninvited.
- Give each briefing a scenario card: who is transmitting and what the situation looks like, before the signal text and choices. It never names the authored variant, so a false distress call reads exactly like a real one.
- Wait for the right envelope before opening: fuel and repair briefings hold until transfer and repair range, and the hail is deferred (not spent) while another panel or conversation is open or while the pilot is under hyperdrive.
- Start the debris storm clock at the handover instead of acceptance. Signing the contract up to 1,400 km out no longer burns the 3:30 window while the transport is still holding position; the terms, the running card and the monitor now say the clock starts when you are alongside. A hyperdrive drop lands inside the handover radius, so accepting there links the transport on the spot and starts the clock at once, without a stale “come alongside” acknowledgement.
- Persist the briefing latch (`briefedAt`) so a reload does not re-open the same card, and let existing careers get their overdue briefing once.
- Add a wreck-arrival preset to the focused distress stand (50 presets) so the generic briefing can be checked next to the escort offer.
- Cover the arrival briefing for all eight variants, the non-spoiling scenario card, the fuel range gate, the deferral and the reload latch with integration tests. Focused distress suite: 42 tests.

- Release identifiers: GAME_VERSION `0.8.2ld`, CACHE `voidrunner-v578-0-8-2ld-arrival-briefing`.

## 0.8.2lc — Escort handover

- Fix the escort start when accepting from comms range (up to 1,400 km): the transport cannot fly without its nav and holds its patch of the pocket, so the run silently never began and the storm clock guaranteed a loss. The objective, journal, comms panel and target hint now ask for the handover (“come alongside”), and the transport’s own line says it is holding position.
- Arm the debris corridor on the handover and on first contact with the line, not on acceptance. Closing on a stranded hull no longer costs hull or the clean-run bonus, and joining within 700 km no longer counts as straying from a corridor that is 110 km wide.
- Keep the mission card honest mid-run: the objective row switches from “come alongside” to “follow the beacons” at the handover, and the HUD hint switches from “approach” to “follow the beacons” while an escort is running.
- Clear a finished event’s id from the player’s current target, so the map, radar and target panel cannot keep a dead contact selected.
- Teach the focused distress stand the real start sequence: escort presets now perform the handover and arm the corridor before asserting damage, and a new preset shows the accepted-but-not-yet-alongside state. The stand has 49 presets.
- Cover the handover, the pre-handover objective and the target cleanup with integration tests, and update the stray test to fly the line before leaving it. Focused distress suite: 37 tests.

- Release identifiers: GAME_VERSION `0.8.2lc`, CACHE `voidrunner-v577-0-8-2lc-escort-handover`.

## 0.8.2lb — Escort mission brief

- Open the debris escort as a mission, not a journal entry. Once the pilot is within comms range of the transport, the offer panel opens itself; closing it leaves the journal answer live, and it never pops back up uninvited.
- Give the offer a terms card: mission title, objective, the 3:30 solar-front window, the straying risk and the payout with its clean-run bonus, plus an explicit “accept mission” and “decline” choice.
- Keep the terms visible during the run: reopening comms mid-escort shows a running card with the live storm clock, transport hull and objective instead of restating the fiction.
- Close the panel on acceptance and let the transport acknowledge over the comms bar, so starting the escort puts the pilot back in the seat rather than behind a second continue card.
- Add the mission-offer preset to the focused distress stand, bring the scene count to 48, and cover the auto-offer range, the once-only hail, the terms and the accepted start with integration tests.

- Release identifiers: GAME_VERSION `0.8.2lb`, CACHE `voidrunner-v576-0-8-2lb-escort-brief`.

## 0.8.2la — Debris escort

- Turn the debris rescue into a timed escort. The transport now starts inside a local pocket of torn plating, its nav computer dead, and cannot plot a course out on its own.
- Project the route from the pilot's nav as amber beacons. Accepting builds a five-marker corridor from the stranded hull through the pocket to an open jump point; the beacons are advisory, not checkpoint gates.
- Fly the transport on the pilot's exact breadcrumb trail at a 150 m lag. It copies the line the pilot actually flew rather than chasing a formation slot, so a clean line proves the heavy hull fits and a corner cut swings the transport wide.
- Sweep a damage tube around the route. Leaving it warns first, then damages the pilot after a short grace; the transport takes its own hits when it reaches the same off-line breadcrumb. Accepting from behind the transport grants a short join window.
- Add a solar-front clock to the accept step. The sun swells over the final ninety seconds, the far beacons fail at one minute, and the transport is lost if it has not spun up and jumped by zero.
- End the run at a jump point outside the pocket: eight seconds of spin-up, a payout scaled by remaining hull, and a clean-run bonus. A late or destroyed transport leaves a persistent salvage wreck instead of a dead log entry.
- Extend the focused distress stand with escort scenes for the beacon route, a straying pilot, a damaged transport, the jump-point spin-up and a lost transport; update the README and review note.
- Add integration coverage for route generation, breadcrumb following, delayed shared corridor damage, the solar-front loss and the paid jump.

- Release identifiers: GAME_VERSION `0.8.2la`, CACHE `voidrunner-v575-0-8-2la-debris-escort`.

## 0.8.2kz — Procedural encounter portraits

- Add six individually prompted, anonymous cockpit portraits for each active faction: Concord, Alliance, Independents and Pirates. All 24 assets use the existing portrait dimensions and graphic style.
- Assign each procedural pilot a random portrait from their faction and reuse it across comms and random-encounter dialogue exchanges. Story characters keep their existing portraits.
- Release identifiers: GAME_VERSION `0.8.2kz`, CACHE `voidrunner-v574-0-8-2kz-encounter-portraits`.

## 0.8.2ky — Recurring distress calls

- Add eight recurring distress variants with two authored setups each: convoy attack, destroyed freighter, pirate trap, fuel shortage, disabled ship, debris escape, jettisoned cargo and disputed salvage. The first call arrives after 4–7 minutes of eligible flight, later calls follow after 6–10 minutes, only one event is active at a time, and the last two variants are not repeated. Genuine calls remain roughly 85% of events.
- Persist each event as a lifecycle record with actors, objectives, cargo and settlement so reloading never refills salvage, heals damage, revives raiders or pays twice. Existing Lantern convoy progress migrates once: a finished rescue becomes history, an active one keeps its damaged actors and deadline.
- Make assistance use real resources: fuel transfers show and deduct the reserve, parts come from the normal hold, repair drones accept neutral event ships, and crew repair is a slower fallback. Survivor pods use normal fly-over collection, reserve mission cargo and are paid on docking. A full hold is explained before cargo recovery.
- Integrate signals into the cockpit: one comms announcement, a journal entry, a selectable map/radar waypoint, hull-appropriate dialogue in German and English, and cockpit-monitor objectives. New signals are logged 3,000–10,000 km from the player, outside discovery range, so responding means setting the journal waypoint and making a local hyperdrive jump; answers still require closing to 1,400 km. Ignoring or declining a call carries no reputation penalty. Attacking a neutral or breaking a dispute agreement forfeits the payment.
- Hold neutral distress crews at their station while the player repairs, transfers fuel or recovers cargo. A parked ship no longer receives a zero-length travel destination that made damaged vessels orbit themselves; hostile raiders, fleeing convoy victims, escape-vector ships and departing supported claimants retain normal travel.
- Make raiders answer fire: the raider that is hit breaks off its convoy victim to engage the player or another attacking ship for 45 seconds, then resumes the encounter's target assignment. Other raiders keep pressing the transports.
- Keep unresolved signals cheap and quiet: no actors spawn until contact is answered, and an unanswered signal expires after ten minutes. Disguised raiders stay hidden until an actual scan exposes them.
- Extend the discovery review with distress presets, save/reload checks, full-hold and resource states, and integration coverage for pacing, migration, transfers, persistence and exactly-once rewards. The focused distress stand now has 42 scenes: every variant opens with a 6,800 km signal that requires the journal waypoint and hyperdrive, close-range interaction checks are marked as “Nahaufnahme”, and a convoy retaliation scene shows a raider breaking off its transport.
- Rewrite every distress transmission, follow-up and player reply as natural two-way radio traffic in German and English. Callers now have distinct voices, the quest-log objective stays on the cockpit monitor instead of appearing in spoken lines, and backing a claimant in a dispute gets that crew’s own reply and callsign. Signal-phase hull and container objectives report the authored manifest instead of zero, finishing an event clears its monitor line, and a dispute’s journal entry keeps the advance that was actually paid.
- Rewrite Sera’s salvage offer for Driftglass so it sounds like a working crew making a deal rather than a menu description. Fix the focused wreck-ambush preset so the returning raiders actually spawn (world time 0 made the scheduled deadline read as unscheduled).

## 0.8.2kx — Solid exploration wrecks

- Give the stationary Kestrel Nine fragments fitted ship/weapon collision. Invalidate the obstacle grid when their geometry becomes available; retain the wreck and collision after cargo recovery.
- Add three persistent burning/venting damage sites with moving, cooling smoke in one GPU draw. Keep the fracture pose fixed and pause the effects with the game.
- Rebuild carrier collision from its actual surfaces instead of decimating thin deck skins. Move the hidden carrier cargo outside an exposed deck edge and migrate existing uncollected containers without changing their contents. Warm carrier collision query structures during loading.

## 0.8.2kw — Cargo-view capacity

- Show used/total cargo mass, percentage and a fill bar directly in the Cargo inventory view, including the embedded cockpit menu on phones. Count commodities, carried equipment, spare drones and mission cargo through the normal hold calculation.

## 0.8.2kv — Equipment pickup names

- Resolve saved equipment and drone records through the inventory catalogue before building pickup receipts. Preserve names, tiers, rarity and modifier marks instead of showing “undefined”.

## 0.8.2ku — Pickup receipts and transient combat effects

- Fix stationary weapon flashes and impact particles after switching or replaying review scenes: preserve the shared effects list so later effects still move, fade and expire.
- Show recovered cargo, equipment and drones as icons with quantities on the own-ship monitor. Wait until story messages close; aggregate repeated pickups and keep flight telemetry visible. Include fly-over salvage, loose cargo, extraction and drone deliveries; report only quantities actually received.

## 0.8.2kt — Sheltered exploration containers

- Place discovery containers close against asteroid tunnel walls and broken capital hulls, away from open passage centres. Keep clear approaches for normal fly-over collection.
- Move uncollected containers in existing saves without refilling cargo or resetting discoveries.

## 0.8.2ks — Hidden freight, salvage claims and convoy distress

- Hide three Kestrel Nine cargo pods in Shardbelt's tunnels. Each carries a small reward and a saved log; all three triangulate a freighter wreck in deep space, targetable from the ship journal. At the wreck, share the hold with Driftglass or fight its two salvage ships for the full cargo.
- Place three additional cargo caches in capital-wreck recesses at Mourning Line. A nearby distress area offers a prospecting-convoy rescue with real attackers and a reward based on surviving prospectors.
- Preserve recovered cargo, partial manifests, encounter choices and damaged actors across saves. Use normal fly-over/collector recovery, short-range cache signals and the existing dialogue/journal interfaces. Keep exploration encounters out of guided lessons and races.
- Distinguish shield collapse, target shield collapse and depleted weapon energy with brief cockpit notices and separate, throttled sound cues. Preserve combat balance and the existing shield/hull hit effects.

## 0.8.2kr — Unified ship preview rotation and finish

- Give the repaint editor the shipyard's steady automatic turntable and fixed camera distance. Both support drag inspection, a smooth delayed return to turning and reduced-motion preferences.
- Apply spaceflight's final pixel shader to both previews, preserving transparent edges over the dock artwork. Use one neutral lighting setup and crisp texture filtering without palette changes or added noise.
- Reuse bounded render targets at an integer pixel scale. Keep the small service card idle and stop hidden or detached previews from drawing.

## 0.8.2kq — Four fitted patterns plus the original finish

- Give every playable hull four distinctive paint designs plus its exact original finish. Add eighteen new hull-specific designs, including split wings, crossbands, center spears, staggered cargo bays and offset nacelles.
- Keep all four saved pattern IDs valid on every hull and preserve chosen colors. Retain protected glass, machinery, PBR detail and the existing repaint fee.
- Show each original finish alongside all four custom patterns in the five-angle comparison gallery. Use new atlas URLs so returning previews load the expanded designs.

## 0.8.2kp — Hull-specific paint designs

- Replace the shared paint templates with individually authored panel shapes, wing strakes, nacelle finishes and matching side profiles on all fifteen player hulls. Offer two or three suitable designs per hull; remove weak or redundant choices.
- Generate the editor thumbnails from the same fitted artwork. Keep the three color controls, pricing, factory finish and scene continuity.
- Correct the Scrapper's paint axis and coating coverage. Preserve glazing, machinery, vents, texture wear and existing PBR maps. Retired pattern IDs migrate to suitable designs with their colors intact and no fee.
- Keep one shader program through pattern/color edits, the same two mask samples and no extra draw calls. Use physical surface normals for projection and new atlas URLs for cache updates.

## 0.8.2ko — Custom ship paint workshop

- Give all fifteen player hulls four fitted patterns and independent main, secondary and accent colors. Retain the exact factory finish and existing preset saves.
- Open a large rotatable preview from the repaint service card. Offer color pickers, suggested palettes and reset; preview/cancel for free and charge the existing hull-based fee once when applying a changed design.
- Save designs per hull and use the same masks and colors in flight, concourse views and departure/arrival scenes. Preserve glass, emissive areas, machinery, panel detail and existing PBR maps.
- Preload compact masks with the selected service preview. Color and pattern edits reuse the mesh, canvas and compiled shader; idle previews stop drawing. Original ship GLBs and material batches are unchanged.
- Add a temporary all-hull workshop under `output/repaint/` that does not read or overwrite the real career. Include muted desktop/Android/iPhone checks for controls, shader reuse, protected glass, transactions, persistence and scene continuity.

## 0.8.2kn — Compact Rook docks and Concord paint

- Replace Rook's long docking funnels and hanging gangways with short, pod-mounted pressure collars. Bring both frigates close and dock them belly-up against their ventral hulls. Shorten the available central heavy port too.
- Match the station and docking seals to Concord's navy hull, pale armor and brass trim. Keep the authored lighting, panel detail and material batches.
- Preserve station dimensions, landing lanes and flight physics. Check hull separation, weapon arcs and actual hull-fitted seal lengths.

## 0.8.2km — Helix conservatories and underside capital docking

- Move Helix's radar dishes onto supported outriggers clear of the command tower. Tilt the bowls slightly outward and check their actual clearance from the tower, deck bands, crown and service spines.
- Increase park conservatories from two to six, retaining 83 housing/courtyard sites. Add continuous glazing frames, bronze latitude bands and crown caps, varied broadleaf trees, rounded planting beds, benches, water basins and interior path lights. Make the glass more legible.
- Move all Rook capital ports underneath: two below the lower pressure pods and a heavy central port below the reactor keel. Move both frigates below their ports and fit vertical pressure gangways to their real hulls. Aim aft ventral PDCs outward to keep the moorings clear.
- Preserve station envelopes, landing lanes, one atlas, material limits and shipping model budgets. Use actual station triangles to check ship clearance beneath the concave lower hull.

## 0.8.2kl — Sealed Helix parks and Rook capital berths

- Extend every Helix housing foundation into its actual deck. Remove exposed house doors and exterior personnel entrances; keep access within pressure galleries and replace external plant doors with sealed inspection covers.
- Add two transparent park domes with planted terraces, trees, paths and sealed vestibules in upper-deck courtyards. Keep 81 housing blocks, one atlas and ten materials.
- Give Rook eight Cruiser batteries and sixteen capital PDCs. Add connected side docking ports, two real Concord frigates with hull-fitted pressure gangways, and an available heavy stern port. Visiting ships do not receive floating drydock lifts or repair cradles.
- Raise near-flush weapon flanges, portal lips, side armor and roof grille surfaces to address depth flicker. Check seven camera angles with the flight depth range, all gun lines against station and berthed ships, and actual desktop/phone landing routes.

## 0.8.2ki — Rook central armored roof

- Close the upper slot between Rook's bastions with a thick pitched armored roof and pressure gables seated in the command hulls.
- Add transverse armor ribs, longitudinal sills, fitted service panels, cooling grilles and small command-gallery windows. Seat the roof machinery and communications mast on the new ridge.
- Preserve the tall hangar doorway, shared flight route, weapon mounts and station envelope. Check both roof-to-bastion connections, gable supports and outward barrel clearance.

## 0.8.2kh — Dense Helix housing districts

- Increase Helix's city buildings from 52 to 83. Close the gaps in both outer housing rows and fill the inner upper deck while preserving elevator, radiator and landing clearances.
- Replace sparse room strips with full residential window patterns, selected lit rooms, facade floor divisions, doors and service risers. Retain roof equipment, structural piers and enclosed housing connections.
- Pack housing facades, quiet structural panels and tower plating into separate regions of the existing atlas. Most room windows are painted detail; selected lights retain emissive geometry. Keep one texture, ten material batches and the existing model budgets.
- Verify actual atlas isolation and dense-row spacing. Remove generated text UVs before authoring atlas coordinates so registry lettering samples the correct region.

## 0.8.2kg — Helix architectural detail

- Refine Helix's city buildings with recessed room bays, structural piers, roof cornices and seated rooftop service houses. Keep small individual windows and the connected housing layout.
- Give the station a cooler blue-gray industrial palette with restrained copper and ochre accents, following its concourse artwork.
- Add armored freight-lock actuators, transfer lintels, integrated HELIX registry panels and service spines following the tower's shoulders.
- Map larger quiet industrial panels and sparse service markings onto the main tower and crown, using the existing atlas. Broaden the deck-wall panel spacing.
- Lower tessellation on small landing circles and plant collars, and simplify repetitive window rows to keep the new detail inside the existing model budget. Preserve the main silhouette, landing space, material batches and atlas count.

## 0.8.2kf — Helix roof districts and Rook underside

- Replace Helix's exposed cargo slab, crane and outdoor containers with two mirrored enclosed freight holds and sealed transfer shutters embedded in the pressure decks.
- Populate the two marked roof levels with 52 closed urban buildings, varied roofs, small room windows and integrated street foundations. Eight enclosed housing wings join buildings into larger complexes. Reserve the main arrival route, elevator footprints and radiator engineering corridors.
- Close Rook's actual central underside gap with a continuous armored keel between the hangar floor, side hulls and reactor housing. Remove the former exposed support bars. Undo the preceding upper command-section change and restore its approach PDC positions.
- Check physical mounts, city clearances, bilateral district placement, filled underside geometry and all-hull docking. Keep the original station envelopes, one atlas, existing material batches and shipping budgets.

## 0.8.2ke — Restore Helix and complete Rook's center

- Restore Helix's original refinery spindle, three circular pressure decks, service crown, radiator wings and freight pier from the pre-expansion design. Remove the spiral galleries and later trading districts. Retain the smaller window/door scale and fix a small original reflector-support gap.
- Bring Rook's command section forward between the armored wings to close the recessed space above its hangar. Keep the narrow entrance and shared traffic route; relocate its two approach PDCs onto the command roof.
- Check source connections, weapon clearances, all playable hull approaches, landing/departure framing and surface stability. Refresh the station gallery and keep the rejected models available as Previous comparisons.

## 0.8.2kd — Station proportions and detail scale

- Widen Helix's twin spiral galleries and extend its central hull, roof control rooms and engineering keel. Keep the galleries separate from large buildings, linked through enclosed radial passages.
- Halve Rook's entrance width again, from 10.5 to 5.25 authoring units. Route traffic through one central opening before splitting into its internal berths; serialize arrivals and departures through the door. Keep the capital gun mounts.
- Calibrate ordinary windows, personnel doors, smaller utility equipment and panel spacing against fitted ships and capital-ship windows. Retain a few restrained panorama rooms instead of broad oversized glazing.
- Keep static material batching, one atlas and the existing shipping budgets. Audit native mesh contacts, large-structure clearances, window sizes and all-hull docking routes.

## 0.8.2kc — Rook capital armament

- Replace Rook's simple decorative cannon shapes with four heavy Cruiser batteries and eight capital-ship PDC mounts, using the same approved weapon mesh data as the ships.
- Place heavy batteries on the upper bastions and flank casemates. Position PDCs above the hangar, on the aft roofs, outer flanks and underside. Keep the arrival lane clear.
- Bake the visible hardware into Rook's existing material batches and station atlas. Check every bearing against the actual hull skin and every barrel's outward line against station geometry.

## 0.8.2kb — Helix spiral galleries and Rook entrance

- Give Helix a distinct double-helix silhouette with two enclosed trading galleries, room windows, armored sills and copper roof edges. Connect the galleries through occupied radial passages and terminal rooms; move the thermal bank clear of the lower gallery.
- Narrow Rook's vertical hangar entrance from 13 to 10.5 authoring units. Recenter its NPC lanes and parked ships so wide wings still clear the portal; keep the player pad and tall interior hall.
- Retain original station envelopes, one atlas and existing material counts. Refresh the station gallery and preserve the preceding Helix/Rook models for comparison.

## 0.8.2ka — Inhabited station architecture

- Rebuild Helix as a coherent trading drum with an integrated berth, merchant districts and freight handling. Give Rook tall armored arrival wings, recessed galleries and grounded defense casemates.
- Remove the repeated ornamental arches, fins, crowns and oversized utility pods. Organize each station around its artwork: workshop galleries, shipyard fabrication halls, customs inspection rooms, research laboratories, rock-cut market terraces or refinery equipment.
- Replace dense window speckle with larger architectural bays, floor divisions and quieter glazing. Add Nacre's curved picture windows and a staffed rear checkpoint at Gatehouse, with its scanner operating inside the hall.
- Preserve original station envelopes, landing floors, berths and traffic lanes. Raise Rook's hall to match the artwork. Retain baked contact shading, cleaned surfaces and the existing material/texture budgets; total station download size decreases.
- Strengthen source contact and mounting checks, and refresh the front, rear and underside review gallery. Keep the immediately preceding models available for comparison.

## 0.8.2jz — Stronger station landmarks

- Give all thirteen stations larger silhouettes with closed architectural volumes: Helix's fluted command crown and asymmetric freight keel, raised armored citadel wings at Rook, Cairn's cantilever engine hoist, deep fabrication keels at Argent, and Gatehouse's swept control tower.
- Build up Blackglass's broken rock shoulders and upper terraces. Add Cinder's deep smelting bowl, Torchwell's elevated depot bridge, Nacre's oblique observatory spire, Shepherd's phased-array sail, Haven's civic tower, League Yard's raised fabrication gatehouse, and Cinderfall's large induction furnace heart.
- Add seated structural roots, control-room glazing, personnel locks, lifting cables, heat-recovery vents and visible process connections. Preserve original station envelopes, landing floors, berths, traffic lanes and cinematic coordinates.
- Reroute Helix's gallery support below its radiator, separate Shepherd's array and Haven's tower from occupied decks, move Torchwell's fuel globe clear of its service building, and seat the hoist pivot and antenna assemblies. Check actual mesh separation and mount contact in the editable sources.
- Retain existing material counts and the 40,000-triangle / 2.5 MB limits. New detail remains in offline material-batched assets with baked contact shading and cleaned surfaces.

## 0.8.2jy — Larger station structures and inhabited machinery

- Add long merchant galleries to Helix, deeper bastion armor and a stern power casemate to Rook, a reclaimed freighter workshop at Cairn, and outboard fabrication halls at Argent and League Yard.
- Expand Gatehouse with occupied customs wings, Blackglass with a cantilever tavern and excavated lift tower, Cinder with a cross-station reaction kiln and reactor crown, and Torchwell with long side service hulls.
- Give Nacre optical sunshades and external instrument chambers, Shepherd an annular watch deck and counterweight hull, Haven a stepped upper residential crescent, and Cinderfall folded ceramic furnace mantles.
- Keep each original station envelope, berth, material count and rendering budget. Author closed pressure vessels, thick fairings, attached process mains and structural roots offline.
- Add a rear gallery view and tighter thumbnail framing. Show the model revision and version image requests so an older review tab cannot reuse the preceding thumbnails after refresh.

## 0.8.2jx — Distinct station silhouettes

- Give every port larger, connected superstructures: Helix's inhabited trading crescent, Rook's armored command halo, vaulted assembly structures at Argent and League Yard, and Cairn's reclaimed drive tower and crane crown.
- Add refinery reaction chambers, large Torchwell reservoirs, Nacre's instrument halo and observatory, Shepherd's asymmetric receiver and solar sails, Haven's split residential towers and promenades, and Cinderfall's forked furnace crown. Break Blackglass's straight rock skyline with crags and an embedded watchtower; give Gatehouse a stepped customs keep and armored shoulders.
- Keep original station envelopes, landing spaces, traffic routes and movie coordinates. All new structure is authored and batched offline, with existing contact shading and surface cleanup.
- Remove unused UV channels from untextured station material batches. Larger models remain within the existing triangle, material and file-size limits, without extra runtime update work.
- Update the multi-angle station gallery and retain the preceding station models for direct comparison.

## 0.8.2jw — Complete station hulls and orbital architecture

- Give all thirteen stations distinct complete structures: tapered hulls, inhabited pressure modules, reactor keels, reservoir globes and three-dimensional shipyard underframes. Keep Helix's established spindle; give Blackglass a natural rock foundation rather than an orbital hull.
- Add visible bow and side compartments to Cairn and Torchwell. Carry pipes, girders, heat sinks and vessels into the station structure instead of leaving a thin underside.
- Preserve existing landing floors, concourse spaces, traffic lanes, cinematic coordinates and outer envelopes. Retain baked contact shading, supported windows, cleaned surfaces, one atlas and at most ten material batches per station.
- Keep each model below the existing 40,000-triangle and 2.5 MB limits. Add geometry checks for substantial lower hulls and retain actual mesh-contact, berth and route audits.
- Add rear and underside views to the station workshop and an overview gallery.

## 0.8.2jv — Fly-over loot and automatic collectors

- Collect dropped cargo and equipment by flying over them, including fast passes between simulation steps. Selection, scanning and salvage controls are unnecessary.
- Add the Loot Collector / Beutesammler as normal purchasable utility equipment. Tiers I / II / III collect automatically at exactly 150 / 200 / 250 km; only the strongest fitted unit applies.
- Preserve stationary drops, item identity, partial cargo stacks, reserved drone capacity and obstacle checks. Ejected equipment has the same eight-second collection delay as ejected cargo.
- Update Rin’s loot explanation, target hints and equipment stats. Keep large-wreck salvage separate.

## 0.8.2ju — Carrier hiding simulation recovery

- Restore a companion’s formation destination when collision or search cleanup clears its travel leg. This fixes repeated flight-update exceptions while hiding with Paul in the carrier and also protects Rin’s formation flight.
- Reuse the restored destination buffer across repeated contacts.
- Add route-reset and real-contact regressions, including an extended muted carrier wait with desktop Chrome and iPhone WebKit.

## 0.8.2jt — Wreck survey travel and stealth guidance

- Replace survey rings with pulsing stars. Visits trigger within 100 km at any speed, including fast flybys between simulation steps.
- Use the normal hyperdrive controls for selected survey stars over 2,000 km away. Keep obstruction checks and drop around 500 km from the marker.
- Explain desktop and phone transponder controls before hiding. Add spaced, one-time Paul chatter and a sparse stealth music cue.
- After the patrol passes, explain switching the transponder back on, patrol scans and station access. Allow dark arrivals at Concord stations while retaining existing berth fees and patrol behavior.
- Add focused integration coverage and muted desktop, Android and iPhone browser checks of the survey, rescue, hiding and return sequence.

## 0.8.2js — First-fight coaching and stable lighting

- Preserve geometric lighting when ship, turret or wreck normal mapping becomes undefined. Keep invalid HDR values out of the glow filter and final colour conversion.
- Add native Chrome/Metal and WebKit GPU regressions for invalid normals, non-finite HDR inputs and retained healthy colour channels.
- Open Rin’s paused combat briefing four seconds after the first pirate arrives, down from eight.
- Begin with defensive covering fire. Rin uses occasional forward-gun shots in the first duel, with turrets and missiles held; an aggressive order increases support. Later battles retain normal weapons.
- Rename “Auswärts” to “Andere Stationen,” hide the empty section and show where each item is stored. Clear mount filters with “Alle Teile.”

## 0.8.2jr — Mining turn rendering stall

- Preserve borrowed hull textures when temporary turrets retire, including private damaged materials. Turning toward nearby ships no longer repeatedly uploads their unchanged hull maps.
- Expire turret meshes from their last simulation refresh. Catch-up time before a refresh cannot immediately remove the new mount at the next draw.
- Extend the mining navigation regression with actual desktop steering after selecting Vesper, checking continued mining, live hull texture ownership and repeat uploads.

## 0.8.2jq — Cockpit navigation guidance

- Retain the target arrow when opaque cockpit artwork or instruments cover the target. Keep the normal bracket through transparent cockpit windows, including each hull's phone layout.
- Keep a selected same-system destination at the radar rim beyond sensor range, following the ship's heading. Unselected distant contacts retain their normal range limit.
- Add desktop, Android and iPhone regressions for mining during radar selection, automatic recall before hyperdrive, distant bearings and all 11 cockpit plates.

## 0.8.2jp — Seamless cinematic handoffs

- Hide the reused cutscene canvas until its first new frame has been drawn, preventing stale location artwork from flashing during preparation.
- Keep the final departure shot over asynchronous launch work and release it only after the first cockpit frame. Refused or cancelled departures restore the dock normally.
- Cover arriving location screens until the exterior shot finishes and the pad landing starts. New careers, docked resumes and reduced-motion views still start parked.

## 0.8.2jo — Starter equipment and unified drone bays

- Start new careers without a launcher; retain launchers in existing saves. The first tutorial pirate drops exactly one green tier I missile launcher.
- Make beam lasers ordinary sellable equipment, including existing bundled copies. Require another installed ammo-free weapon before selling a beam laser.
- Show drone bays below utility mounts in the shared equipment inventory. Buy, install, store, carry and sell drones using ordinary item cards; retain health and station storage. In-flight swaps recall deployed drones and deliver carried ore automatically.
- Use one drone per bay and the same physical docking mouth for mining, PDC and repair. Miners carry up to two units per trip, with safe single-unit loads when ore or cargo space is limited. Retain surplus miners from older saves.
- Update the tutorial's loot and drone-fitting instructions and add distinct drone equipment icons.

## 0.8.2jn — Less repeated field collision work

- Reject distant ship/mesh pairs using conservative bounds from the actual geometry before building relative transforms.
- Use each fitted hull’s rotated bounds to narrow nearby surface queries, then reject unrelated triangles within the remaining leaves. Keep exact contacts and their original order.
- Preserve solid-core spawn recovery and open wreck/asteroid passages. Cache only one additional radius per existing surface index; add no query allocations or duplicate geometry.
- Add exhaustive contact comparisons across all 19 hulls and checks for sparse leaves, off-centre surfaces, cache invalidation and embedded recovery.

## 0.8.2jm — Less repeated cockpit work

- Update contextual touch controls only when their displayed state changes. Reuse the HUD drone snapshot; direct target-selection updates still query live drone state.
- Keep mining, recall, salvage, capture, magazine changes and racing brake/fire controls immediate. Preserve language and replaced-element invalidation.
- Reuse one bounded canvas drawing buffer through dock/cinematic switches. Retain each view’s scene resolution, integer pixel scale and crop; omit the unused depth buffer on the final colour-only canvas. Scene and reflection depth buffers remain.
- Wait asynchronously for the preceding GPU frame before resizing the canvas at either end of arrival, retaining skip/cancellation and the existing detail, lighting, camera paths and animation timing.
- Add muted cockpit work comparisons and control regressions for desktop, Android and iPhone browser profiles.

## 0.8.2jl — Less scenery rendering work

- Batch static wreck sections by finish and nearby region, preserving all geometry, UVs, normals, paint coordinates and jagged fracture surfaces. Share the resulting buffers between repeated arrangements and divide construction into short tasks.
- Render station cradles, gantries and work lights in two or three instanced batches instead of up to 42 individual draws. Preserve the original dimensions, materials and moving service lifts.
- Cache static local transforms and stop identity scene/container transforms from forcing world-matrix updates on every frame. Moving hulls, effects and station activity still update normally.
- Avoid drawing the previous dock while mounting and preparing the next one. Add geometry-equivalence checks, fixed-view pixel comparisons and more detailed station profiling.
- Upload the actual cached NPC hull geometry during preparation, retaining its existing buffers without duplication. Prepare newly loaded hull buffers before publishing their detailed models.
- Wait asynchronously for queued GPU preparation to finish before revealing flight or starting a cinematic clock. Keep skipping, cancellation, timeout recovery and loading-screen input responsive.

## 0.8.2jk — Smoother station approaches and films

- Prepare station textures, shader variants and off-camera geometry buffers before revealing them. Reuse the dormant concourse renderer to preload the selected station on approach.
- Prepare later NPC hulls, authored traffic paints and distant graveyard models before their first visible draw.
- Divide collision setup, texture uploads and shader-uniform setup into short tasks. Keep the exact station collision surfaces, models, artwork, lighting and camera paths.
- Prepare concourse and exterior material variants before playback, with cancellation, skip and timeout recovery. Retain one station assembly and one reusable tiny buffer-warmup target.
- Return completed departures directly to the cockpit; restore the dock only for cancelled or refused launches.
- Update station activity once per rendered frame and upload docking light colours only when their sequence changes. Share independent paint shaders across hulls while retaining their exact colours and pattern placement.
- Add muted station performance diagnostics for desktop, Android with CPU throttling and iPhone/WebKit. Shader-driver diagnostics are opt-in through `?debug-shaders`.

## 0.8.2ji — Station films in the game

- Use all updated station models in flight and arrival/departure films. Include their berthed ships and service cradles in the films, using the same hull scale as flight and the workshop.
- Reach the close arrival shot before the fade; use a three-quarter view for clearer small-ship silhouettes. Frame Blackglass’s elevated cave galleries in its wide arrival shot. Tighten departure framing and limit engine glow to the nearby deck.
- Check both film directions and real game transitions at every station on desktop and iPhone. Preserve approved concourse artwork, ship placements, berths, flight physics and career saves.

## 0.8.2jh — Station scale and inhabited facades

- Resize crew airlocks, elevator doors, frames and controls against the ships and existing glazing. Keep industrial freight shutters separate from personnel doors.
- Add side and rear windows to occupied modules, window banks in landing halls and courtyards, and glazing around the fortress and construction torus. Preserve unglazed processing vessels and tanks.
- Batch flush windows by material and discard panes without a supporting wall, including excavated hangar entrances. Retain mip filtering, surface depth bias, clear flight paths and existing export budgets.

## 0.8.2jg — Station detail and stable surfaces

- Add role-specific machinery, airlocks, gallery framing, service equipment, shopfronts, hoppers and reservoir fittings across all thirteen stations.
- Bake subtle contact shading into vertex colours. Retain at most ten material batches and one shared atlas per station.
- Quiet the repeated panel texture, remove overlapping coplanar export faces, and weld identical vertices while retaining UV and normal seams.
- Clear excavated station bodies below the finished landing floor, avoiding competing floor caps. Keep deck markings low enough for all fitted hulls; use depth bias for surface accents.
- Add motion-based surface stability checks at flight-camera depth precision, alongside existing docking, collision, camera and desktop/phone checks.

## 0.8.2jf — Station concourse architecture

- Match all thirteen station landing spaces to their existing concourse paintings. Connect broad portals to shared inhabited halls; use sheltered decks, exposed pads or open courtyards where shown.
- Rebuild Blackglass as an open cliff terrace with excavated tavern galleries, Torchwell as a broad fuel apron, Haven as a trading court and Cinderfall as an industrial courtyard.
- Align the actual landing floors, private berth, NPC routes, parked ships and tracking cameras. Preserve station locations, world radii, approved 2D art and docked ship placements.
- Add a concourse camera and artwork comparison to the station workshop. Verify real floors, roof/open-sky clearance, shared-floor access, source mesh contacts and resource budgets.

## 0.8.2je — Detailed stations and connected structures

- Complete the remaining twelve station models, each with architecture suited to its role. Keep existing locations and world radii.
- Fix Helix's detached roof shields, signage, vents, wall conduits, status lamps, freight connections and structural roots. Connect pipes to their equipment instead of leaving loose ends.
- Size small-ship doors in world units across every station. Preserve one private player berth, two NPC lanes, parked hull clearance and clear cinematic approaches.
- Seat capital-yard maintenance lifts on the drydock floor. Join Nacre's transfer corridor and Argent's terminal to the actual hull surfaces.
- Retain editable Blender sources, static exports, one panel atlas and at most ten station material batches. Add a mesh-contact audit so broad bounds cannot hide unsupported parts.
- Expand the responsive station workshop to all thirteen ports, with detail views and optional previous-model comparisons.

## 0.8.2jd — Helix station model

- Rebuild Helix with smaller individual berths, inhabited decks, cargo handling, refinery plumbing, thick radiator panels and a detailed command crown.
- Keep a private player berth and two NPC lanes; align parked ships, floor coordinates, collision surfaces and the cinematic camera with the new model.
- Preserve the station's world radius. Batch the shell into 10 materials with one shared panel atlas, and retain an editable Blender source and orbit review.
- Keep location buttons clear of the projected ship launch area, including large hulls on phones.

## 0.8.2jc — Cockpit comms

- Fit comms to each cockpit's free area, including separate phone positions and sizes.
- Shorten sender labels and let normal transmissions grow to their full height. Preserve portraits and full sender names in the log.
- Use automatic pages when longer transmissions exceed the available space, without scrolling. Clear wing-order buttons and refit on hull, viewport, wing or patrol-reply changes.

## 0.8.2jb — Story cast at the bar

- Remove filler bar contacts from all ports. Keep Mara, Rin and Paul's story appearances and existing quest progression.
- Remove generic news/advice topics and empty question menus. Keep family backstory and concrete contract/trading information.
- Preserve direct access to contract, race and guild boards.

## 0.8.2ja — Docked starts and location buttons

- Start new and resumed docked careers with the ship parked; play arrival animations only after an actual landing.
- Centre compact phone labels, remove unused icon/description space, and give desktop labels room beside their icons.
- Keep concourse, market and bar buttons inside their scenes and separate overlapping targets. Position additional bar contacts instead of leaving them in the top-left corner.
- Wrap long contact descriptions, shorten market labels and remove an obsolete tutorial callback that threw an error when opening Services.

## 0.8.2iz — Natural target colours

- Remove selection and scan tints from asteroids and the extra glow on selected pickups. Targeting keeps original surface colours, ship paint and loot rarity colours; brackets and cockpit instruments still identify the target.

## 0.8.2iy — Mining performance and cinematic sound

- Keep drone meshes, buffers and shader references across stow/deploy cycles, including NPC docking visuals. Remove the repeated shader stalls on each mining delivery; prepare drone/effect and environment shader variants before flight.
- Synchronize landing/departure engine passes, atmosphere, hangar reverb, gear and touchdown cues to animation progress. Replace the premature generic docking cue.
- Fade and stop film audio on completion, skip, cancellation, hidden views or context loss. Briefly duck music and reuse existing decoded engine sounds.
- Add an opt-in Sound control to the isolated landing review. Automated browser checks stay muted; audio waveforms are checked offline.

## 0.8.2ix — Clean pixels and original colours

- Remove ordered dithering, sprite recolouring and monitor palette filters. Keep the artwork's original colours without smoothing or palette reduction.
- Remove stacked location-art colour adjustments, screen blending and scanlines. Concourse backgrounds and ships share crisp, whole-number pixel scaling.
- Decode original sprites directly and remove the conversion worker/cache, avoiding duplicate images and conversion work.

## 0.8.2iw — Station approach and departure films

- Use each of the 13 authored station models for exterior docking and departure shots, joined to the existing concourse animations.
- Lock a station, approach within 200 km of its visible hull and slow below landing speed; docking control handles the final route. Launch returns control beyond the station, facing outward.
- Preserve transponder restrictions, drone recall, tutorial progression, skipping, reduced motion and cancellation recovery. Remove manual landing-guide prompts.

## 0.8.2iv — Outbound planetary departure

- Give departure its own front-quarter tracking camera and outward climb instead of reversing the arrival composition.
- Project the departing planet from a fixed point behind the flight path, so it recedes behind the engines while the nose points into open space.
- Match hull pitch to the climb and stream clouds past the tail. Preserve arrival, landing-pad poses and cockpit launch direction.

## 0.8.2iu — Smooth landing-pad shadows

- Pad shadows follow every rendered motion frame, soften and fade as the hull rises, and disappear before open flight.
- Shadows and floor reflections are clipped to each painted landing platform, including cropped phone views.
- Removed black floor blotches from collapsed normal-map UVs and invalid HDR reflection samples.
- Moving reflections follow landing/takeoff continuously; distant ships skip floor captures. Approved hull placements remain unchanged.

## 0.8.2it — Approved placements and full-screen dock flight

- Apply the approved desktop and smartphone ship/button placements at all 17 ports, preserving exact angles, scales and zoom values.
- Expand the 3D camera to the full painted backdrop while retaining the authored resting pose. Arrivals and departures now cross the actual screen edge instead of an internal preview boundary.
- Calculate off-screen entry/exit paths from each hull's bounds, heading and viewport. Remove departure shrinking and prevent a settled-hull flash before arrival.
- Keep atmosphere handoffs, cached reflections, reduced motion and cancelled-launch recovery. Seed and reset the placement editor from the approved layouts.

## 0.8.2is — Shared landing finish and placement editor

- Combine the painted concourse background, ship, shadow and reflection before a single pixel and colour shader, using the existing bounded renderer. Remove separate background filtering and palette conversion for these plates.
- Extend the landing editor with draggable ships and menu buttons, precise X/Y controls and separate desktop/smartphone placements. Keep approved hull angles fixed and allow per-view display size adjustment.
- Export both layouts in version 2 JSON; autosave drafts separately from careers and retain reset/undo and validated import.
- Preserve landing, atmosphere and departure poses, cached reflections and paused rendering outside the concourse.

## 0.8.2ir — Approved landing layouts

- Apply the final exported ship angles and scales to all 17 ports.
- Fit rotated hulls to the viewport and keep tilted hulls above the platform. Landings settle into the approved pose; departures follow the hull heading.
- Restore the same pose after atmosphere shots or cancelled departures. Keep dock rotation out of the atmosphere camera shots.
- Share pose and bounds handling with the editor; its defaults now match the approved layouts.

## 0.8.2iq — Ships matched to landing platforms

- Calibrate key light, sky/deck fill, exposure, shadow and ship scale for all 17 landing scenes.
- Reflect the painted room's actual colours on the hull and retain authored paint/metal roughness differences.
- Add subtle, softly filtered ship reflections on suitable floors, using a small cached target that pauses with the dock view.
- Lower the hover and fit larger hulls inside the available screen area, including landscape phones.
- Keep cropped landing pads visible on phones and place concourse actions clear of the settled hull.

## 0.8.2ip — Planet approach and ascent

- Add short, smoothly banked exterior atmosphere-entry and ascent shots around planetary platform landing/takeoff.
- Use the current hull, paint and equipment, the existing planet surface textures, curved horizons, atmospheric scattering, passing clouds and the shared pixel palette.
- Give all four planets distinct atmospheric colours. Keep station hangar sequences and already-docked resume behavior unchanged.
- Reuse the dock renderer, hull and cinematic scenery at bounded resolution/cadence; stop rendering when hidden and preserve progress across visibility/phone-orientation changes. Support skipping, reduced motion, cancellation and failed-launch recovery.

## 0.8.2io — Live concourse ships

- Replace limited landed-ship sprites with current 3D hulls, owned paints and fitted equipment at every port.
- Match the painted landing platforms with local lighting, pixel palette shading and a real cast shadow on a transparent ground receiver.
- Add a banked landing approach, gentle idle hover and turning, climbing departure. Reveal concourse actions after landing; respect reduced motion.
- Reuse one bounded dock renderer, pause it in other menus and flight, and retain the current hull between visits.

## 0.8.2in — Lighter flight display and fitted comms

- Remove the redundant full-screen compositor filter; retain the GPU world palette, cached sprite palette and bounded monitor finish.
- Prepare and decode converted cockpit/destination images with existing active/predicted asset bundles; release their cache leases when those bundles change.
- Restore compact Courier instrument and radar typography in flight. Keep menu typography.
- Replace scrolling flight transmissions with automatically advancing, fitted pages; retain complete messages in the paused log.
- Skip destruction-geometry preparation for indestructible racing hulls.

## 0.8.2im — Faster pixel rendering

- Replaced the changing full-page SVG finish with GPU world grading, worker-cached sprite conversion and small monitor filters, retaining a shared final colour grade.
- Preserved cockpit transparency and crisp bitmap instruments; original sprite sources remain untouched and converted images use a bounded cache.
- Removed the expensive 4x HDR multisampling fallback; supported 2x smoothing remains available.

## 0.8.2il — Unified cockpit and world finish

- Applied the final pixel grid and palette to cockpit sprites, monitors, menus and the world in every quality mode. Low/Auto now simplify dithering instead of bypassing the cockpit finish.
- Moved distance blur and procedural rock-detail softening out to 20,000–80,000 km, keeping normal flight, combat and field exploration crisp.

## 0.8.2ik — Unified pixel display

- Added a static pixel and colour finish across flight, cockpit art, monitors, menus and touch controls, with locally bundled bitmap typography.
- Reduced distant shimmer with mip blending, filtered procedural detail, multisampled scene edges and a depth-aware distance resolve; nearby geometry remains sharp.
- Reused bounded render targets, retained adaptive quality, added a lighter Low/Auto display path and removed animated CRT noise. iOS uses the resolve without bloom blur passes.

## 0.8.2ij — Asteroid sunlight occlusion

- Let large and small asteroid fragments cast and receive sunlight shadows, including across tunnel walls and neighboring chunks. Keep soft ambient fill for navigation.
- Use one cached, field-sized shadow map, refresh drifting casters at most four times per second, and use a smaller map on phones. Disable shadow rendering outside Shardbelt and dispose its GPU target with the renderer.

## 0.8.2ii — Softer asteroid shadow fill

- Reduce ambient reflection on large and small rocks while retaining tunnel visibility and direct sunlight.
- Reduce the review scene’s ambient and opposing rim lights so shadowed faces read as rock rather than glowing surfaces. No shadow-map passes, geometry changes or per-frame work added.

## 0.8.2ih — Larger race rings

- Increase checkpoint, finish and starting-ring diameter by 40% on all six courses. Space checkpoints about 20% farther apart along the same routes. Keep course shapes, lengths and flight physics unchanged.

## 0.8.2ig — Shared racing AI for the graveyard

- Apply continuous line anticipation, corner-skill braking, corner-exit control, predictive gate correction and missed-gate recovery to all three graveyard courses.
- Tune narrow-ring corner budgets and rival pace variation against real wreck collisions. Remove enlarged NPC apertures on authored tracks.
- Keep course geometry, checkpoints, player flight physics and race-hull capabilities unchanged.

## 0.8.2if — Faster, cleaner asteroid racing opponents

- Keep the three tracks, player flight physics and ship speed ceilings unchanged. Replace checkpoint-relative steering jumps with continuous anticipation of the physical racing line.
- Apply driver corner skill to braking plans, settle tight corners before accelerating, predict aperture misses and retain lateral correction while tracking the line.
- Remove the doubled pace penalty on slower rivals and improve missed-gate recovery. Shardbelt rivals now pass through the same visible aperture as the player, without an enlarged AI ring or recovery-plane allowance.
- Retain distinct rival skill tiers and seeded variation. Add player-time benchmarks, strict gate checks, recovery-time limits and tests across both field seeds and all four race models.

## 0.8.2ie — Racing through Shardbelt

- Rebuild all three Shardbelt races around the new asteroid: central-bore sprint and eastern rim, mineral-gallery climb and chimney descent, and a longer circuit linking all three tunnels.
- Space mandatory gates about 250 km apart, with 160 km clear apertures and no shortcuts. Reserve loose-rock clearance around the racing lines; extend rough tunnel mouths and remove the obsolete zigzag racing bores.
- Give tunnel racers a planned-path obstacle probe and line-following gate approach, retaining their normal thrust, drift, collisions and speed ceiling. Rivals keep different pace and seeded variation.
- Preserve earned race ranks/unlocks while clearing obsolete Shardbelt times and splits on older saves.
- Add an interactive route survey with X-ray, orbit, flythrough, scrubbing and a link to the isolated playable race with all four loaners.

## 0.8.2id — Clearer large asteroid surfaces

- Replace soft continuous surface grain on large fragments with position-based stone pixels, distinct mineral seams and restrained chips.
- Remove the soft shader relief; preserve smooth broad normals and sharp fracture edges. No geometry, collision or draw-count changes.

## 0.8.2ic — Small asteroid textures

- Give small asteroid fragments shared 64×64 rock textures in the game and field review, with iron, dark stone and ice finishes.
- Wrap each texture once, without tiled bump patterns; retain crisp nearby pixels and mipmaps for stable distant rocks. Preserve existing geometry, collisions and instanced draws.

## 0.8.2ib — Smooth rock surfaces, crisp fractures

- Smooth broad crust, crater and tunnel shading using normals from the continuous rock surface, avoiding the bias of long meshing triangles.
- Preserve hard normal splits at actual fracture corners. Retain the same positions, collision triangles, tunnel clearances and rendering draw count.

## 0.8.2ia — Natural asteroid surfaces

- Replace periodic sine-based rock deformation, crater-floor ripples and repeated mineral stripes with non-periodic spatial noise.
- Reduce fine bump strength and remove the stamped micro-pattern; keep broad rock variation, mineral patches and crater detail.
- Soften narrow fracture/crust junctions to avoid regular mesh sawteeth. Keep the visible terrain and collision geometry shared.

## 0.8.2hz — Asteroid surface variety

- Increase the parent asteroid from three impact bowls to 18 varied craters, with shallow broken rims, irregular floors and oblique shapes.
- Give the rock broad dark patches, dusty deposits, exposed pale crater interiors, stronger mineral seams and grain at several scales.
- Preserve the existing field boundary and clear tunnel cores; collision surfaces follow the revised crater geometry.

## 0.8.2hy — Shattered Shardbelt

- Rebuild Shardbelt as ten separated sections of one giant asteroid, with matching strata, exposed fracture faces, old impact bowls and 560 smaller fragments. Preserve the 2340 km field radius.
- Add three connected, uneven tunnel systems with roughly race-gate-sized openings. Carve the existing Shardbelt race routes through the same solid rock.
- Use the rendered triangles for tunnel, hull and projectile collisions. Cache terrain generation, warm collision indexes, and split collisions into local surface tiles while rendering the parent in ten draws.
- Share deposit generation with mining contracts, retain depletion/scans, and move embedded older saves to a safe nearby position.
- Add an interactive field review and muted desktop/phone checks.

## 0.8.2hx — Stabilizer racing pickups

- Replace the temporary speed surge from graveyard-race pickups with five seconds of stronger lateral-drift damping. The effect helps velocity follow the ship's nose without raising the speed ceiling or refilling thrust.
- Show a stabilizer timer in the cockpit monitor, tint it cyan, and give the pickup a gimbal-ring silhouette.
- Add regression checks for unchanged speed and thrust resources, improved heading alignment, pickup collection and the desktop/iPhone HUD.

## 0.8.2hw — Balanced rival pace and safer Gauntlet approaches

- Reduce race-hull turning response by about 27% across the field. A tested 50% cut made rivals miss too many gates and run far over target, so keep the smaller, stable reduction.
- On Relict Gauntlet, keep the final approach on the collision-checked racing line instead of aiming through gate normals that point into neighboring wreck sections.
- Set the posted rival targets to 40 / 50 / 60 seconds for Mourning Run, 50 / 60 / 70 for Breach Crossing, and 90 / 105 / 120 for Relict Gauntlet.
- Verified 24 full debris-field races across both world seeds and all four loaner choices with no wreck clipping. Finish times by place were 42–43 / 46–48 / 61–64s, 55 / 59–62 / 65–72s, and 99–112 / 112–122 / 121–126s respectively.

## 0.8.2hv — Faster, steadier race pilots

- Set dedicated race hulls to a shared 500 km/s afterburner ceiling for players and rivals.
- Tune the AI's corner-speed target by course: faster through the open Mourning Run, conservative around the tighter debris routes. Missed-gate recovery now uses the same small aperture margin as a normal NPC pass.
- Add deterministic launch-reaction variation; one rival hesitates longer each race so a small player mistake does not always put them last.
- Verified 18 full debris-field rival runs across both world seeds: Mourning Run 48.2–50.0s, Breach 57.3–59.0s and Gauntlet 107.2–118.9s, with no wreck clipping. Open-track Mourning Run benchmark: 44.5s.

## 0.8.2hu — More deliberate race handling

- Slightly reduce turn acceleration across all four dedicated race hulls.
- Give rivals more line lookahead, earlier corner braking and a longer obstacle-avoidance reaction window to keep their racing smooth and clear of wrecks.
- Preserve the race speed ceilings, hull identities, normal afterburner flight model and player controls.

## 0.8.2ht — Race flight-assist parity

- Race hulls now honor the player's normal Flight Assist setting instead of forcing course correction on. With assist enabled, they use the same afterburner turn and drift integrators; with it disabled, drift damping is off while the dedicated counterthrust brake still works.
- Race speed and the thrust/brake controls remain race-specific.
- Rivals now keep their obstacle-avoidance heading when checkpoint alignment would otherwise steer them back into wreck plating. Longer prediction gives them room to react at race speed.
- Verified all 18 rival runs across the three Mourning routes and two debris seeds; all complete without wreck clipping.

## 0.8.2hs — Afterburner drift assistance for racing

- Keep the normal afterburner's gentle lateral drift correction active on all four race hulls. It trims sideways momentum without damping forward coasting or snapping the nose to the velocity.
- Retuned the four hulls with the corrected flight model. All finish each of the three Mourning courses with under 7% clean-time spread; thrust, counterthrust braking and pickup boost still behave as intended.
- Verified rival steering, wreck clearance and ship contacts across all three routes and two debris seeds. Releasing throttle coasts while the shared afterburner drift assist gradually reduces sideslip.

## 0.8.2hr — Newtonian race hulls

- Choose Speedster R, Demon R, Talon R or Lancer R for every race. Fixed race frames share powered speed limits and differ in acceleration, braking, rotation and contact mass. Your own hull, equipment, cargo and resources are parked and restored safely.
- Hold the former afterburner button (Shift) for thrust, hold the fire button (Space) for counterthrust, release both to coast. Removed the race thrust slider and rechargeable boost reserve. Track pickups provide five seconds of extra engine power; expiry preserves existing momentum.
- Racers use bounded Newtonian torque and thrust. NPCs anticipate braking distance, steer against drift and use the same physical collision hulls and engine limits. Racing world impacts retain tangential momentum and use matching player/NPC damage caps.
- A cyan flight-path symbol shows actual velocity. Cockpit status shows thrust/brake/coast, and race-only weapons/hyperdrive controls are disabled. Added four-hull selection to the isolated race session and career entries.

## 0.8.2hq — Smoother close racing

- Prune separated hull regions and individual cells before detailed ship-contact tests. The current collision shapes, swept impacts and aggressive racing remain in use.
- Warm flight shaders for both canvas and bloom targets, including deferred shader validation. The isolated Talon race loads the actual rival models and prepares its graveyard scene, contact effects and speed streaks before enabling Start.
- Added collision-work regression coverage and flat-cell contact comparisons for rotated fighters of different sizes.

## 0.8.2hp — Contact racing

- Racers now collide using the current hull geometry, including swept high-speed contact, momentum transfer, shield/hull damage, impact sparks and a brief boost interruption. Gentle parallel rubbing does not deal damage based on absolute speed.
- Rivals draft, defend lanes and contest shoulders against other rivals and the player. A short recovery move after contact prevents continuous rubbing; environment steering still protects wreck clearances.
- Gate and pickup crossings resolve after ship contact, so a ram that stops a ship before a checkpoint cannot award it. Rivals recover missed checkpoint approaches, and the grid/restart clears contact state.
- Rival hulls now have real health and reactor-limited shield recovery. Racing impacts no longer force the player's speed down to the unrelated combat-speed cap. Non-racing collision behavior remains unchanged.

## 0.8.2ho — Boost and racing lines

- Graveyard rivals accelerate and brake, plan boost around bends, draft other pilots and move out to pass. Player and rivals share finite boost charge and recovery; no catch-up speed changes.
- Three optional boost pickups per graveyard course sit on precise detours beside physical machinery fragments. Collecting one replenishes boost and grants five seconds of enhanced afterburn. Each pilot can collect each pickup once.
- Cockpit monitors show boost charge/recovery, pickup seconds, estimated gap to the leading rival, race time and sector gains/losses. Peripheral speed streaks, engine pitch and a small extra FOV increase emphasize speed; reduced-motion mode suppresses the added motion.

## 0.8.2hn — Quiet checkpoints and clear cockpit comms

- Removed checkpoint/shortcut success sounds; start and final race-result feedback remain.
- Anchored the idle comms log to the upper-right corner across all cockpits. Live messages expand from that edge, with a separate clear gap below the Vanguard’s upper instruments and compact scrolling messages on phones.
- Moved the isolated race restart control beside the pause/fullscreen controls so it does not overlap comms.

## 0.8.2hm — Clear engine approach and five-gate race view

- Routed Breach Crossing gate 19 around the actual battleship engine geometry. Added rendered-triangle clearance checks for every graveyard racing line and direct checkpoint approach, including hull-width offsets; raised the carrier hangar exit clear of another tight deck edge.
- All race courses show only the next five rings: green for next, yellow for following and grey for the remaining three. Distant finish and passed rings stay hidden; the finish follows the same color priority.
- Approaching a race shows only its gathering marker. Phase transitions clear stale course rings, and the navigation chart lists only the next five main checkpoints.

## 0.8.2hl — Broader graveyard turns and spaced checkpoints

- Extended the Gauntlet’s cramped frigate-beta turn and rebuilt the smaller courses’ tight return bends around wrecks and substantial debris.
- Checkpoints are spaced about 300 m along the racing line; curve samples no longer each produce a ring. Rivals follow the cleared curve between rings.
- Added three physical wreckage assemblies with thick torn skins, exposed spars and machinery at otherwise empty bends. Existing instanced geometry batches are reused.
- Preserved enlarged rings, no Mourning shortcuts and approximately half-length shorter courses; adjusted checkpoint fuel rewards to match the reduced ring counts.

## 0.8.2hk — Race closer to the wreckage

- Pull carrier and battleship racing lines toward their hull flanks and existing break debris. Bring the longer course past two more frigate wrecks and the port debris cloud.
- Keep rounded bends, double-sized rings and no shortcuts. Lengths remain 11.1 km, 10.9 km and 21.5 km.
- Revise course briefings and target times, and preserve the fuel allowance with the additional turns.

## 0.8.2hj — Wider graveyard race rings

- Remove shortcuts from all three graveyard courses and their review controls/briefings.
- Double checkpoint and finish ring diameters and their crossing apertures. Preserve the routes and rival lane spacing.

## 0.8.2hi — Flowing graveyard race lines

- Replace abrupt checkpoint turns with tangent circular bends and longer approaches through the wrecks. Keep the Gauntlet at 20.8 km; reshape Mourning Run to 10.9 km and Breach Crossing to 10.6 km.
- Refit the shortcuts and race briefings, retune target times and keep fuel rewards proportional despite the additional curve checkpoints.
- Limit dense-course rendering to the nearby checkpoint sequence and finish; keep the full course in the review viewer.

## 0.8.2hh — Graveyard racing routes

- Build three courses around the current wrecks: a carrier hangar dive, a battleship fracture circuit and a longer multi-wreck gauntlet. Update shortcuts, target times and German briefings.
- Reserve room for racing lanes and turns around debris. Race pilots check actual hull surfaces so open hangars remain flyable instead of being blocked by enclosing navigation boxes.
- Add a reproducible 3D review with all three routes, checkpoint numbers, shortcuts, camera scrubbing and fly-throughs.

## 0.8.2hg — Distinct capital wrecks

- Replace repeated bow/middle/stern destruction with a collapsed carrier hangar and connected drive, an aft-sheared cruiser, a broadside-torn cruiser, and three frigate break patterns.
- Tilt complete command structures and retain displaced source hull surfaces as large fragments, with smaller debris around every capital command break.
- Match collision to each damage model; retain solid metal, shared instancing, mission bays and verified flight routes.

## 0.8.2hf — Solid wreck decks and debris

- Give open hull skins, exposed decks and detached support fragments real backings and metal edge faces across all six wreck sources. Preserve existing solid parts, paint and jagged passages.
- Keep small debris plates thick enough to remain readable from the side; rebuild matching collision without increasing its triangle budget.

## 0.8.2he — Solid torn armour

- Give peeled metal strips closed front/back skins and perimeter faces, including continuous thickness through their folds. Loose panels and folded debris retain their existing solid extrusions.
- Rebuild matching collision and verify fracture-route clearance after the thicker edges.

## 0.8.2hd — Routes between broken hull sections

- Remove the added rectangular tunnel cuts. Fly through the jagged bow and stern gaps instead, with wider section separation where NPC steering needs room.
- Tilt the battleship's broken bridge independently and retain its removed support geometry as displaced fragments, with small debris scattered nearby.
- Exercise normal NPC flight and full hull collision through both fracture gaps in both directions; preserve salvage, race paths and carrier hiding.

## 0.8.2hc — Torn wreck structure

- Replace flat section cuts with matching jagged fracture contours, pressure ruptures and peeled metal edges, using the current ship hulls.
- Separate damaged capital propulsion pods and add folded shards with varied debris orientations. Keep the existing travel, salvage and hiding routes.
- Concentrate soot and heat staining at breaks and impact areas using the shared plating texture. Rebuild simplified collision surfaces for the damaged hulls.

## 0.8.2hb — Fly-through wreck passages

- Cut horizontal passages through both side walls of the battleship, carrier and both cruisers. Reserve clear entrances and exits through the hull, fittings and collision surfaces.
- Tilt and separate detached bow and engine sections around their own centres, with different breakup poses for escorts and cruiser variants.
- Verify complete routes with rendered-surface rays and full-size player collision checks; preserve carrier hiding cover, salvage and race routes.

## 0.8.2ha — Surviving wreck interiors

- Rebuilt all six graveyard wreck assets from the currently shipped ship GLBs, with preserved hull details and new lined passages/breaches. Regenerated matching simplified surface collision.
- Added surviving machinery, pressure vessels, conduits, partial decks and bulkheads, fitted to the shell around the flyable corridors and salvage pockets. Carrier hiding cover remains usable.
- Added four dense pockets of 96 small fragments. Larger shards collide; tiny splinters are cosmetic. All use shared instanced batches, with clear race and arrival routes.

## 0.8.2gz — Mourning Line graveyard

- Rebuilt the battlefield around the capital wrecks and their escort screens, with directional armour and machinery trails, a clear arrival area, and separated exploration sites.
- Refinished the wrecks with shared 512² naval plating, exposed dark interiors, scorched breaks, and physical I-section frames lining the four flyable bays.
- Removed duplicate placeholder hulls and freestanding decorative hoops. Preserved salvage identities, tutorial landmarks, hiding cover and race routes; all new structure uses matching surface collision.

## 0.8.2gy — Model-based ship breakup

- Fracture current hulls into independently drifting and tumbling sections, retaining their paint and mounted hardware.
- Add scorched torn edges, recessed bulkheads, internal frames and bent armour debris; larger ships tumble more slowly.
- Cache fracture geometry through short idle jobs, share hull textures, and bound cosmetic wreck retention. Loot containers remain stationary and use a compact crate size.

## 0.8.2gx — Stationary loot

- Keep equipment wrecks and loose cargo stationary instead of inheriting ship velocity or drifting.
- Stop saved wrecks at their current position on reload. Cargo still moves toward the ship during collection.

## 0.8.2gw — Configure weapons from the cockpit

- Replace the static weapons list and placeholder help with a functional Weapons section in career and Arena Run.
- Reassign fitted guns to A/B, select the active group, and choose alternating or together firing for each group. Fire All respects both groups’ modes.
- Preserve independent mount cooldowns, shared energy costs and per-hull settings through saves. Launcher firing modes remain available separately.

## 0.8.2gv — Show loot rarity in space

- Replace plain grey loot rocks with salvage containers and white/green/blue/gold diamond beacons, with one to four rarity pips.
- Show the highest remaining equipment rarity and update it after collection; cargo-only wrecks use white.
- Share visual resources across drops and keep beacons depth-tested and limited to nearby loot.

## 0.8.2gu — Teach loot with the first pirate

- Guarantee one fitted uncommon tier I weapon survives the tutorial mining pirate’s destruction, including kills by Rin.
- Add Rin’s paused explanation of technology tiers, rarity colours and ordinary wreck recovery after the fight.
- Keep the item in the persistent wreck until collected through normal salvage.

## 0.8.2gt — Unfreeze the first tutorial fight

- Fix veteran story companions reading a missing combat profile when starting an attack, which repeatedly interrupted the flight frame.
- Present Rin’s first-combat and wing-order explanation in one normal paused dialogue instead of overlapping comms messages.
- Restore unfinished combat briefings when resuming a saved tutorial encounter.

## 0.8.2gs — Keep blocked tutorial departures usable

- Show a short keys message when clicking the Wayfarer before the opening conversations.
- Check tutorial departure requirements before animating, and restore ship and station controls after refused or failed launches.

## 0.8.2gr — Give NPC Wayfarers repair support

- Replace the stock NPC Wayfarer’s PDC drone with one repair drone, keeping its defensive turret.
- Reuse normal owner-first and nearby-friendly repairs with shared reactor energy; player drone choices remain unchanged.
- Fix spectator mode skipping NPC drone simulation and rendering, so repair and PDC support actually participate in spectator battles.

## 0.8.2gq — Balance player hulls and unrestricted fittings

- Give all flyable hulls rounded, explicit capacities and whole-number base energy/shield regeneration; strengthen expensive combat hulls and distinguish industrial endurance.
- Replace inherited utility counts with hull-specific counts. Repeated stat bonuses now diminish by half without multiplying previous upgrades or depending on slot order.
- Increase power-system and heavy-weapon costs; recovered capital guns demand substantial energy and mass. Use identical mass rules for ordinary and loot equipment.
- Preserve displaced modules and loot IDs on old-save loads; start new careers at their actual capacitor limit.
- Add equal-total-budget fitting searches, tier III stress checks, moving 1v1/2v1/group comparisons and save/resource regressions.

## 0.8.2gp — Keep the mining handoff under player control

- Preserve the asteroid target, navigation and working miners when the mining quota is met; avoid repositioning Rin during the delivery callback.
- Place the new tutorial deposit roughly 1,000 km from the Vesper approach exit, with extra ore for continued mining.
- New mining contracts require six ore and pay 3,000 cr. Already accepted older contracts keep their terms and progress.
- Keep learned travel controls quiet; nudge once after a minute without useful progress and stay silent during automatic drone work or travel.
- Add a full animation-frame regression covering continued mining, steering, automatic drone recovery and the return intercept.

## 0.8.2go — Clear story instructions through normal menus

- Split the family introduction from Rin’s practical market instructions; introduce launch, mining and the return to Vesper at the relevant moment.
- Teach normal contract acceptance and drone-role selection, automatic drone return, desktop mining/salvage/fire controls and carrier hiding.
- Replace repeated completed lessons with concise reminders and show Mara’s Cairn call as a real conversation, including when docked.
- Show Buy max/Sell all totals before trading; track additional opening Protein purchases in the delivery total, respect drone deployment range, and clear stale equipment details on re-entry.

## 0.8.2gn — Teach normal trade and fitting at Vesper

- Open Rin’s welcome dialogue after the first Vesper landing and her reactor-gift dialogue after selling the full Protein load.
- Explain the normal commodity market, sale controls and Equipment → Storage → Install flow.
- Remove Story’s reactor shortcut and tutorial-only trading controls; keep normal Buy max/Sell all actions.
- Persist shown dialogues so partial sales, repeated visits and resumed saves do not repeat them.

## 0.8.2gm — Fit compact navigation panels

- Remove the unused tactical-radar grid row on compact maps so the contact list fills its panel.
- Bound the compact map to the screen height, preserve contact scrolling, and wrap long destination/contact labels inside their controls.
- Use one contained objective highlight instead of protruding mission/selection boxes.
- Label tracked contacts correctly in German.

## 0.8.2gl — Clear current tasks

- Open the first Story card automatically when starting a tutorial career.
- Rewrite every Story/journal card around the present task, with no repeated chapter/title blocks or previews of later missions.
- Start with meeting Mara and Rin in the bar and the hint for reopening Story; keep reactor fitting and phase-specific mining/hiding instructions.

## 0.8.2gk — Story on demand

- Replace the dock tutorial strip with a Story button and current-objective card.
- Ask whether to play or skip the tutorial before starting a new career, retaining the autosave replacement warning on the same card.
- Remove tutorial-abort controls from station menus and the ship journal.

## 0.8.2gj — Simple dock services

- Replace the drone-service submenus with combined ship/drone repairs and ship fuel/ammunition refills; buy drones in Equipment.
- Remove drone ammunition limits, refill costs and ammo readouts for both player and NPC drones.
- Add a paid hull-paint preview and remove the free in-flight paint selector.
- Keep Service to three compact cards without explanatory disclosures or recovery boilerplate.

## 0.8.2gi — Clear commodity names

- Shorten commodity names across trading, cargo, loot and tutorial instructions.
- Mark weapons cargo red and have Rin explain that transporting it is illegal.

## 0.8.2gh — Faster tutorial trade and approach

- Offer a single Buy max action for the opening Protein Packs trade and Sell all at Vesper, tracking the actual purchased load.
- Move the afterburner lesson out of departure checks and into the Vesper approach after hyperdrive. Coach full thrust, sustained afterburn to 5,000 km, release and braking in sequence.

## 0.8.2gg — Remove repeated menu information

- Remove the duplicate commodity cargo summary and manifest; owned quantities stay on commodity cards and selling stays in the trade ticket.
- Consolidate shipyard prices around purchase/exchange actions, remove the extra current-ship placeholder and suppress zero stat differences.
- Remove inactive inventory filters, misleading empty-item text beneath cargo, empty drone-cargo disclosures and unequipped 0/0 launcher placeholders.
- Simplify repeated spectator-editor headings and default-loadout labels while retaining placement instructions. Clear stale Arena menus when entering spectator mode.

## 0.8.2gf — Compact commodity cards

- Put commodity prices beside their icons, with names below. Use compact grids so all ten commodities fit in landscape without a catalog scrollbar.
- Keep cargo counts, commodity selection and the full trade detail available.

## 0.8.2ge — Paul’s repair support

- Give Paul two repair drones and introduce hull repair in his rescue dialogue, with a reminder before the black-box mission.
- Repair drones service their owner first, then physically visit damaged friendlies within 200 km, using their owner's energy. They do not recharge shields or reactivate disabled story companions during combat.
- Recall Paul's drones during the carrier hiding lesson and pause them while he is disabled.

## 0.8.2gd — Clear ship controls and automatic drone switching

- Group the own-ship terminal into Flight, Equipment & Cargo, Drones and Journal, with a fixed section bar and bounded scrolling on desktop and landscape phones.
- Keep mining, PDC and repair drones. Remove attack drones; saved attack units and loot migrate to PDC while preserving ownership, hull and remaining ammunition.
- Switch bay roles docked or in flight. Deployed drones return automatically, deliver their payload and load the selected type from owned cargo; remove redundant manual stow controls from the bay UI.
- Remove floating toast notifications. Keep useful feedback on the cockpit status ticker and in the Journal; retain inline menu errors.

## 0.8.2gc — One task at a time and direct fitting

- Tutorial radio now follows actual travel, arrival, distance, drone and cover state. Instructions wait for the current action rather than bundling navigation, approach and landing into one transmission.
- Explain the gifted reactor at Vesper and open it directly from the objective. Owned equipment can be installed from cargo or local storage without an intermediate carry step; free compatible mounts are selected automatically, while replacements require a visible choice.
- Add small speaker portraits to story radio and persistent tutorial instructions. Keep the existing comms position and phone-sized strip.

## 0.8.2gb — Correct offline startup and asset verification

- Offline report and development URLs no longer fall back to a cached game at the wrong path. Uncached pages explain that the preview server or network must be restored.
- Cache the opening Helix room, bar, market, Mara/Rin portraits and landed Wayfarer with the shell. Reject HTML responses masquerading as cached image/model assets.
- Add service-worker regressions and normal cached-browser startup checks, including decoded images and offline reloads on desktop and phones.

## 0.8.2ga — New tutorial campaign

- Rebuilt the career prologue around trade, flight, a gifted reactor, a real mining contract, a return-drive pirate standoff, drone-bay switching and a solo graveyard survey.
- Added Paul’s Torsas rescue, five-ship patrol and carrier-hangar stealth lesson. Fighting or escaping the patrol remains possible.
- Unlocks normal career work in the starting system after Mara’s debrief. The unchanged 50k ship/equipment/half-cash value triggers the Cairn reunion; Rin then reopens the jump gate.
- Added the frigate-wreck black box, optional Paul escort, four-pirate fight and delivery to Mara for decoding. Rewrote English/German dialogue and kept flight instructions on the comms display.
- Story ships use shared NPC flight, regeneration and fitted weapons. The five-ship patrol keeps to pirate Scrapper/Demon hulls.
- Paul and Rin disable at 1 hull and recover after combat ends. Saved casualties and companion states prevent reloads from replaying kills or restoring disabled allies.

## 0.8.2fz — One pulse-laser progression

- Consolidated the reinforced pulse variant into Pulslaser I–III. Tier II matches the former reinforced base laser: 10.8 damage, 3.6 energy; tier III has 12.4 damage and costs 4 energy.
- Existing reinforced items migrate upward one tier, capped at III, retaining their physical IDs, rarity, affixes, factory state and storage/mount positions. Arena checkpoints and wreck loot migrate too.
- Arena rewards offer pulse II from wave 4 and III from wave 9, using the same weapon family and tier icons. NPC fits retain tier-II pulse firepower across career, Arena Run and spectator battles.
- Shops now sell the pulse family's normal technology tiers and prices; its old separate bounty gate is retired. The old ID remains compatibility-only.

## 0.8.2fy — Approved equipment names

- Applied the exported German/English naming review across all 27 equipment types and the stat, affix and unique-name catalogs.
- Approved names override old translation aliases. Item IDs, tiers, stats and save compatibility are preserved.

## 0.8.2fx — Regeneration terminology and naming editor

- Energy and shield recovery use “Regeneration” in labels; the reactor is now Regenerationsreaktor.
- Added a standalone bilingual naming editor for equipment, stat labels, affixes and named loot, with tier previews, local drafts and JSON import/export.

## 0.8.2fw — Clear equipment names

- Shared concrete equipment names and visible technology tiers across career shops, inventory, fitting and Arena Run.
- Distinguish stored energy, energy recharge, shield capacity and shield recharge; all weapons identify their weapon type.
- Named loot retains its equipment type and tier. Rarity and affix details remain separate from technology tier.
- Tier markers use the actual item tier, including legacy base equipment; no fitting or balance changes.

## 0.8.2fv — Colored equipment and cargo symbols

- Added metal casings, family-specific energy accents and commodity material colors to all 37 icons; rarity stays on tier and upgrade markers.
- Refined movement/recharge arrows and separated decorative marks from the hardware with consistent stroke-safe margins.
- Added a standalone HTML gallery with every icon, small-size samples, all seven upgrade marks, tier/rarity examples, search, size and background controls.
- Added a reusable browser bounds check that includes curved paths, strokes and SVG transforms.

## 0.8.2fu — Polished equipment and cargo icons

- Redesigned all 27 equipment and 10 commodity glyphs with transparent faceted surfaces, clearer hardware silhouettes and finer details.
- Retained white/green/blue rarity colors, tier pips and upgrade modifier marks. Icons share the same SVGs in career shops, cargo, loot and Arena Run.
- No bitmap downloads, gradients, filters or icon animations.

## Repository cleanup — 2026-10-14

- Retained the current editable ship/drone/station model sources and original references under local `authoring/`, with a versioned hash manifest.
- Removed superseded model revisions, development previews, screenshots and root experiments. Git history was preserved.
- Grouped tests by unit, integration, performance and browser coverage. Extracted shared session helpers to avoid duplicate suite registration.
- Consolidated asset and maintenance tools and added a pinned Playwright setup.
- GitHub Pages now publishes an explicit game-only `dist` package. Gameplay remains unchanged. Runtime 0.8.2ft also fixes missing title-screen dependencies in the first-visit offline cache.

## 0.8.2da — Aligned wing cards, wave-clear beat, dock-prompt and frigate-hull fixes

- The wing tactic cards now share the right screen edge with the flight controls: the rail uses the touch column's own safe-area offsets (8 px in the canopy, 3 px on short landscape phones), so both columns line up; the cards also hang a touch lower from the top edge so they clear the corner glass.
- The final kill of a wave gets its moment: after the last opponent dies the battlefield holds for two seconds — the death bloom plays out, incoming fire drops to zero — before the run flips to the preparation screen.
- Fixed a docking prompt leaking into Arena runs: the target monitor no longer offers "LOCK … · DOCK" while a run is active, even when the wave spawns inside a location's approach radius (the asteroid field sits inside the Shardbelt's).
- Fixed the wave-10 frigate boss staying a placeholder forever after a transient failure: a failed GLB hull fetch now re-arms its variant so the renderer retries on later syncs, and ships spawned during the outage (voxel placeholders) swap to the real hull once the retry resolves.
- Release identifiers: GAME_VERSION `0.8.2da`, CACHE `voidrunner-v337-0-8-2da-frigate-retry`.

## 0.8.2cz — One tactic card per wingman at the top-right screen edge

- The wing tactics control left the status monitors entirely: a rail of compact cards now hangs off the HUD's top-right screen edge, one card per wingman (at most two), each printing only its stance — AGG / DEF / OFF — above two slim fills for shield (top) and hull (bottom). Tapping a card cycles THAT wingman's order; the Y key cycles the whole crew. The monitors keep their gauge bars and hull outlines to themselves.
- Each wingman carries its own standing order, so a mixed-tactics wing is legal: one veteran can fly aggressive while the other breaks off. Orders persist per wingman with the run (older checkpoints fall back to the run default), the run default follows the lead wingman for the save migration, and the ship menu and run stage offer one order group per wingman.
- Rin's card follows her live state: dimmed with a drained shield bar while she is powered down, gone when she is not flying. Cards are keyed per wingman and only repaint when their state changes, so the per-frame publish does no DOM churn.
- Release identifiers: GAME_VERSION `0.8.2cz`, CACHE `voidrunner-v336-0-8-2cz-wing-tactic-cards`.

## 0.8.2cy — Corner wing switch, gauge bars, and a word for what the target is doing

- The wing switch moved to the top-right corner of BOTH status monitors — the own-ship screen and the target screen — so the control is the same wherever the pilot's eyes are. The survival bars got their full width back and no longer share their row.
- The monitors read like a gauge cluster now: the shield/energy/hull rows print only their initial (S / E / H) with no numeric readout — exact numbers stay on the docked screens — and the top-down hull schematics return beside the bars on both monitors, slimmed to fit short landscape phones.
- The target monitor's readout describes the locked ship with one clear word — ATTACKING, FLEEING, EVADE, DEMAND, MINING, PATROL, YIELDING, ADRIFT… — where the old full task line (TRADING — HELIX → VESPER) never fit the slot. Story states first, then combat, then the working legs; it is only published for identified contacts, so an unresolved track reads nothing. The pilot tier still follows after the word.
- Release identifiers: GAME_VERSION `0.8.2cy`, CACHE `voidrunner-v335-0-8-2cy-corner-wing-switch`.

## 0.8.2cx — Wing switch on the own-ship screen; Rin cannot be killed

- The wing's standing order now lives on the own-ship screen itself: a plaque beside the shield/energy/hull bars shows the wing and its order code (AGG / DEF / OFF) and cycles it on tap, so the order changes without leaving the canopy. It replaced the chip that floated over the canopy, which on short landscape screens sat on top of the hyperdrive plaque.
- The survival bars read by their initial — S / E / H — and are shorter, which is what frees the monitor column the plaque sits in. The full words stay in the markup, so the rows are still announced as SHIELDS / ENERGY / HULL.
- The paused ship menu repeats all three orders in full, highlights the standing one, and explains the selected gate.
- Rin Vek (and any story companion) can no longer be destroyed. At one point of hull she powers down instead: dark, unarmed and no longer a legal target, drifting until the last opponent within 1500 km of the pilot is beaten, then back online with the reactor restarted. Her hull stays at that one point for the rest of the mission, so from the next fight on her shield is the only thing a fight can spend.
- Release identifiers: GAME_VERSION `0.8.2cx`, CACHE `voidrunner-v334-0-8-2cx-own-ship-wing-switch`.

## 0.8.2cw — Wing orders reach the campaign

- The standing-order system is no longer an Arena Run exclusive: the vocabulary, the range gates and the target doctrine now live in one shared module, and the same cockpit chip and key serve both scenes.
- Rin Vek takes orders. From the prologue's combat step she can be told to fly aggressive, defensive or break off, with the same rules a hired veteran flies — your own target for defensive, self-defence inside the formation band, and a break-off station on the far side of you from the fight. Before that step she keeps her scripted help so the prologue's one fight cannot stall.
- The campaign order is remembered on the career save, so a reload keeps the wing's discipline; the Arena Run keeps its own run-scoped order.
- Release identifiers: GAME_VERSION `0.8.2cw`, CACHE `voidrunner-v333-0-8-2cw-campaign-wing-orders`.

## 0.8.2cv — Range-gated wing orders

- Standing orders are now measured against the pilot rather than the wingman. Aggressive engages hostiles within 1000 km of the pilot and re-forms past 1500 km; defensive engages the pilot's own target within 600 km and re-forms past 1000 km. Break off is unchanged.
- A wingman never lets itself be shot for free: anything attacking it inside its formation band is a legal target, and it drops that attacker the moment the attacker leaves the band instead of chasing it.
- The run screen explains the selected order in one line, and saved runs carrying the old engage/hold-formation orders migrate to aggressive/defensive on load.
- Release identifiers: GAME_VERSION `0.8.2cv`, CACHE `voidrunner-v332-0-8-2cv-range-gated-wing-orders`.

## 0.8.2cu — Veteran roster and wing orders

- The wingman option at a hull stage now puts forward three named veteran pilots, each with the hull they would fly, so the crew that joins the run is chosen rather than rolled. The roster is seeded with the run and held across reloads.
- Hired wingmen take standing orders in flight: engage, hold formation (station beside the pilot with every weapon held) or break off (run for open space). Cycle with Y, the gamepad stick click, or the cockpit WING chip; the run screen also sets the order from a row of three buttons.
- Orders persist with the run save, so a reloaded checkpoint keeps the wing's doctrine.
- Release identifiers: GAME_VERSION `0.8.2cu`, CACHE `voidrunner-v331-0-8-2cu-arena-wing-orders`.

## 0.8.2ct — Arena hull pool and hired wingmen

- Arena Run hull stages now offer five hulls drawn from the complete pool of eleven flyable ships, so the Frontier League hulls can appear mid-run. The current hull is never repeated: the sixth choice keeps your ship and hires a random veteran wingman instead.
- A hired wingman is a full allied fighter on the Free Merchants' colours with a veteran pilot and role-fitting equipment. It flies with you until it is shot down, and because there are two hull stages a run can end up flying two wingmen.
- Arena opponents now engage a wingman that draws their fire instead of ignoring it, while still pressing the player by default.
- The NPC combat observer can stage every player-flyable model, not just the six career hulls: the Frontier League line (Speedster, Legionary, Andromeda, Torsas, Astra) joins the palette from the shared hull pool.
- Release identifiers: GAME_VERSION `0.8.2ct`, CACHE `voidrunner-v330-0-8-2ct-arena-wingman`.

## 0.8.2ar — Tutorial value gate

- Mara's final tutorial handoff to Meridian now waits until the player's live combat-value proxy reaches 50,000.
- The threshold uses full ship and equipment value, half cash value and no cargo value, matching the dock combat-value display.
- Added regression coverage for the blocked and unlocked handoff states.
- Release identifiers: GAME_VERSION `0.8.2ar`, CACHE `voidrunner-v268-0-8-2ar-tutorial-value-gate`.

## 0.8.2aq — Player combat-value proxy

- Added a live combat-value number for the current hull and all owned equipment at full listed value, plus cash at half value.
- Cargo is deliberately excluded so profitable hauls do not inflate the combat-strength proxy.
- Release identifiers: GAME_VERSION `0.8.2aq`, CACHE `voidrunner-v267-0-8-2aq-player-combat-value`.

## 0.8.2ap — Single mission completion message

- Removed the small duplicate notification shown underneath the full mission payment screen.
- Mission completion now presents one clear payment screen instead of repeating the same information twice.
- Release identifiers: GAME_VERSION `0.8.2ap`, CACHE `voidrunner-v266-0-8-2ap-remove-mission-toast`.

## 0.8.2ao — Simpler dock screen

- Removed the automatic “last trip” report from the dock screen.
- Removed the automatic suggestion for which upgrade to buy next.
- Kept the useful before/after explanations inside Outfitting, where they support an actual purchase decision.
- Release identifiers: GAME_VERSION `0.8.2ao`, CACHE `voidrunner-v265-0-8-2ao-remove-sortie-debrief`.

## 0.8.2an — Career sortie pacing and mission pressure

- Added a persistent sortie ledger that measures real career sorties from launch through docking, including mission income, trade flow, repairs, refills, drone service, outfitting, ship trades, race fees/payouts, rescue/bounty income, losses and reputation changes.
- Added a dock debrief with duration, gross earnings, total costs, net credits, completed contracts, standing changes and the next meaningful compatible upgrade. Outfitting now shows plain-language before/after sortie impact for power, defense, drive and utility modules.
- Mission-linked pressure now follows mining claims, salvage claims and sealed cargo routes, while the encounter ledger distinguishes ambient traffic, patrols, distress calls, beam ambushes, opportunists, frigates and mission threats. Near-dock escape/resupply space remains intact.
- Added persistent-save normalization and focused career pacing tests. Save schema is 17; existing saves migrate with an empty sortie ledger.
- Release identifiers: GAME_VERSION `0.8.2an`, CACHE `voidrunner-v264-0-8-2an-career-loop`.

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
