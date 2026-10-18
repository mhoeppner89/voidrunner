# Player ship balance

The fitting system keeps four mount types (weapons, turrets, drones, utilities), with no weapon-size restrictions. Hull cost, energy, handling and opportunity cost must support distinct roles.

## Test plan

1. Record every hull's current capacities, regeneration, price, mobility, cargo and physical mounts before changing them.
2. Search legal repeated-gun fits and every reactor/capacitor allocation at 40k, 80k, 140k and 200k **total hull + equipment cost**. Separately stress rare tier III equipment and recovered capital weapons. Include empty utility slots; buying unnecessary upgrades must not improve the result.
3. Use the actual weapon definitions, 60 Hz cooldowns, capacitor spending, pellet hits and shield activation rules. Measure 2.4-second opening volleys, 12-second uninterrupted fire and three 2.4-second passes over 24 seconds. Repeat with shield regeneration consuming the shared energy pool. Perfect aim is an equipment ceiling, not an AI win prediction.
4. Test defensive and utility extremes separately: shield/hull stacks, capacitor stacks, heavy recovered weapons, loaded handling, cargo and drone capacity. Compare fits at equal equipment technology and total price. Do not expect miners to win fighter duels merely because they cost more.
5. Run seeded moving combat through the live combat runtime for 1v1, 2v1 and groups, plus coordinated-pass survival checks. Keep pilot ability and starting conditions symmetric, reverse sides, and report stalemates as such. Inspect player fitting and resource behavior in career, Arena Run and spectator.
6. Preserve saves: reduced mounts return every displaced item to storage once, retaining physical item IDs and factory ownership. Clamp saved energy/shields to current limits without restoring damage or inventing resources.
7. Verify relevant resource, fitting, loot, NPC, Arena and tutorial regressions; run the full maintained Node suite once because shared stats touch all modes. Package the runtime and inspect desktop/phone screenshots.

## Acceptance criteria

- Base hull/shield/energy capacities are multiples of five; base reactor and shield regeneration are whole numbers.
- Stacking bonuses are independent of slot order and have diminishing, bounded returns. An extra utility slot must not multiply all previous bonuses.
- A starter reactor stack cannot sustain a full battery of heavy capital guns or duplicate an elite fighter's sustained fire and defenses at a fraction of its total cost.
- Interceptors retain mobility; fighters earn better combat endurance; bombers retain weapon flexibility and magazines; industrial upgrades buy cargo, drones, utility and protection.
- A healthy fighter survives one ordinary coordinated gun pass; sustained pressure still wins. Heavy deliberate hits remain dangerous.
- Every legal old module remains owned after loading, including repeated modules and loot variants in displaced slots.

Run `npm run balance:ships` for controlled fitting reports in ignored `output/player-balance/`. The report explicitly separates equipment ceilings from moving combat results.

## Implemented tuning (0.8.2gq)

- Utility counts are explicit: Wayfarer 3; Scrapper/Speedster/Demon/Talon 2; Legionary/Andromeda/Lancer 3; Torsas/Mule/Vanguard/Blade 4; Astra/Prospector 5; Atlas 6. Physical weapon, turret and drone positions remain intact.
- Each stat gets the strongest module's full bonus, then 50%, 25%, 12.5%, etc. of subsequent bonuses. Penalties use the same rule separately. Shield/hull module capacities also diminish; cargo expansions remain additive. Slot order does not matter.
- Ordinary reactor upgrades cost 6,000 cr and add 30%; capacitors cost 4,500 cr and add 40% capacity with a 10% regeneration penalty. Shield/hull reinforcement adds 60 before stacking. Heavy guns and power gear have explicit mass shared by ordinary and loot versions.
- Plasma uses 18 energy and costs 10,000 cr. Recovered frigate guns use 40 energy (24,000 cr), cruiser guns 80 (40,000 cr). Mounted capital-ship batteries retain their separate original power model.
- Schema-4 fits migrate without losing duplicate modules or physical loot IDs. Displaced equipment goes to local station storage when docked, cargo when flying. Existing resource damage stays; excess saved resources clamp to the revised capacities. The starter remains free.

| Hull | Price | Hull | Shield | Energy | Energy/s | Shield/s | Weapon / utility |
|---|---:|---:|---:|---:|---:|---:|---:|
| Blade | 120,000 | 420 | 420 | 140 | 35 | 8 | 4 / 4 |
| Speedster | 20,000 | 160 | 190 | 60 | 15 | 5 | 3 / 2 |
| Legionary | 50,000 | 300 | 300 | 100 | 25 | 6 | 3 / 3 |
| Andromeda | 55,000 | 300 | 280 | 100 | 25 | 6 | 4 / 3 |
| Torsas | 45,000 | 270 | 230 | 80 | 15 | 5 | 3 / 4 |
| Astra | 90,000 | 320 | 330 | 110 | 25 | 7 | 3 / 5 |
| Wayfarer | 0 | 190 | 200 | 60 | 10 | 5 | 3 / 3 |
| Scrapper | 18,000 | 180 | 180 | 60 | 15 | 5 | 5 / 2 |
| Demon | 45,000 | 220 | 260 | 80 | 20 | 6 | 5 / 2 |
| Mule | 65,000 | 350 | 260 | 90 | 20 | 6 | 3 / 4 |
| Talon | 40,000 | 210 | 280 | 80 | 20 | 6 | 4 / 2 |
| Vanguard | 105,000 | 440 | 400 | 120 | 30 | 7 | 5 / 4 |
| Prospector | 35,000 | 300 | 200 | 80 | 15 | 5 | 2 / 5 |
| Lancer | 90,000 | 300 | 360 | 100 | 30 | 7 | 4 / 3 |
| Atlas Hauler | 110,000 | 480 | 350 | 120 | 25 | 7 | 2 / 6 |

## Results

- All 15 hulls passed controlled fitting searches at the stated budgets plus rare III stress fits. The ordinary Wayfarer reactor maximum fell from 33.01 to 15.25 energy/s; Scrapper from 42.82 to 21.75. Blade's bare reactor increased from 20 to 35. The Wayfarer's capacitor stack fell from 240.11 to 102; Atlas from 487 to 214.5.
- 54 moving veteran comparisons covered three seeds and mirrored starting positions. Damage uses the actual shield activation, ion disruption and hit-reaction functions; flight, aim, projectile sweep and energy spending use the runtime. Guns only: these controlled comparisons exclude missiles, turrets, drones, morale, loot and obstacles. They are not a complete encounter-win prediction. The 90-second limit produced 16 unresolved fights; no unresolved fight was counted as a win.
- The reactor-stacked Wayfarer lost all six Blade comparisons; versus Legionary it lost five with one unresolved. The ordinary starter beat a basic Scrapper five times with one unresolved. Two attackers retained their advantage: six wins each for 2 Scrappers versus Legionary and 2 Talons versus Blade. Equal-weapon Talon/Lancer comparisons remained unresolved, demonstrating that base price alone does not guarantee a fast kill. Different weapon mixes produced wins for both hulls.
- Healthy Speedster, Scrapper, Talon, Legionary and Blade hulls survive the controlled 2.4-second two-Scrapper ordinary gun pass. The earliest kill in the moving comparison matrix was 17.07 seconds.
- Full maintained Node suite: **734 passed, zero failed**. Covers fitting, resources, inventory migration, NPCs, shield activation, capital combat, Arena Run, tutorial and performance regressions. A pre-existing commodity-dialogue test was corrected to check the actual legality dialogue node rather than the preceding trade instruction.
- Desktop Chrome, Android Chrome and iPhone WebKit passed normal career purchase/install, all 15 player/NPC base-stat comparisons, actual mounted heavy-weapon energy use, Arena Run and spectator combat. The 48,000 cr Wayfarer fit really fires 13 plasma shots over 12 seconds, with 15.25 energy/s; it does not sustain three guns' 36 energy/s demand. Screenshots and runtime errors were checked. These are browser-emulated phone checks, not physical-device measurements.
- Runtime packaging and diff checks passed. Local review: `output/player-balance/index.html`; raw baseline/current fits and moving-combat/browser reports are beside it. No Git commit or push was requested for this balance pass.

## NPC follow-up (0.8.2gr)

The NPC Wayfarer now carries one repair drone instead of a PDC drone; its PDC turret remains. Player fittings are unchanged. Repairs use the existing owner-first, 200 km friendly-support and shared-energy rules.

This check found that the spectator branch had omitted both NPC drone simulation and drone rendering. Both are fixed and covered by a simulation/render regression. The later 22-duel stock-NPC diagnostic in `output/npc-tier-balance/results.json` is annotated: its configured drones did not actually participate. The 54 controlled **guns-only** comparisons above are unaffected and were always documented as excluding drone support.

With actual drones active, the one-seed mirrored Wayfarer sample produced: repair fit beats Scrapper 2/2, splits Speedster and Demon 1/1 each, beats Talon 2/2. The matched PDC baseline beats Scrapper 2/2 but loses to Talon 2/2. This supports the repair/support identity; it does **not** establish a combat nerf. No further hull or repair-rate changes were made for this request. 67 focused loadout, repair, observer, inventory, drone and Arena Run checks passed. A live browser scene verified real repair and a rendered repair-drone visual. Data and screenshot: `output/npc-tier-balance/wayfarer-repair.json`, `wayfarer-pdc-baseline.json`, `repair-visual.json`, `wayfarer-repair.png`.
