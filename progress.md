Original prompt: Review and revise all equipment names for ambiguity and visible tiers.

- Replaced Arena-only shorthand with shared equipment names; revised all 27 definitions in English/German.
- Named loot retains hardware identity. Technology tier is separate from rarity and weapon model.
- 42 focused item, inventory, outfitting, localization and Arena presentation checks passed.
- Corrected vague utility stat labels and nonbreaking name/tier spacing; compact landscape reward titles adjusted.
- Muted desktop Chrome, Android Chrome and iPhone WebKit checks passed: all 27 equipment titles, reward selection, shop names/details, tier spacing and phone card containment. Final screenshots reviewed.
- Packaging and git diff checks passed. No outstanding work for this request.

Follow-up: use Regeneration terminology and provide an editable naming HTML.
- Updated energy/shield labels and Regenerationsreaktor.
- Added bilingual equipment/stat/affix/named editor with browser drafts and JSON import/export.
- 18 focused presentation checks and packaging passed.
- Desktop Chrome, Android Chrome and iPhone WebKit editor checks passed: edits, tier/language previews, JSON export/import, invalid input handling, local draft reload, search, category filters and no horizontal overflow.

Follow-up: apply exported naming edits and explain reinforced pulse laser overlap.
- Applied all exported names; preserved IDs and gameplay.
- Reinforced pulse is a legacy stat upgrade: same range/cadence, +17.4% damage and +12.5% energy at equal tier. Recommend consolidating into ordinary tiers in a separate change.
- 30 focused name, inventory and outfitting checks passed; packaging passed.
- Refreshed the editor and verified every exported name plus representative Arena labels on desktop, Android and iPhone. Screenshots reviewed.

Task: consolidate the reinforced pulse into technology tiers, then commit and push main.
- One catalog family; II preserves the former reinforced base firepower, III advances it.
- Migrating career inventory, locker stock, wreck loot, saved Arena offers and interrupted-wave checkpoints.
- Full suite: 692 tests passed. Packaging and staged diff checks passed.
- Muted desktop/Android/iPhone: pulse I–III cards and reward acceptance passed; live Arena Run III and career II projectile damage verified. Desktop spectator fits use the pulse family. Screenshots reviewed.
- Ready for the requested main commit and push.

Follow-up: rebuild the tutorial campaign around the agreed twelve-part route.
- Added the six-chapter state machine, real training trade/contract/fittings, graveyard survey, Paul rescue, stealth patrol and later black-box mission.
- Kept the existing 50k player-strength metric; separated guided restrictions from open-world story progress.
- Rewrote English/German conversations and instructions. Companions disable at 1 HP and recover after eight quiet seconds; their saved states survive hydration.
- Full suite: 680 checks passed. Runtime packaging and diff checks passed.
- Muted desktop Chrome, Android Chrome and iPhone WebKit campaign flows passed, including real mining-drone extraction, the PDC cargo transfer, both optional-Paul branches and the sealed recorder handoff. Travel and combat outcomes were advanced deterministically through the live runtime hooks.
- Reviewed desktop/phone dialogue, mission-board, drone and flight screenshots. Verified a collision-free carrier hiding position and actual cover across three debris seeds.
- New campaign actors use shared NPC flight/resources and fitted guns. The patrol has two Scrappers and three Demons, preserving pirate hull availability. Passing ships continue outbound; allies can help if the pilot fights instead of hiding.
- No outstanding work for this campaign request.

## 2026-10-15 — Correct missed cached-startup failure

- The user reported missing first-room background, portrait and ship art. The local preview server had stopped; the active browser was serving an old cached game at the report URL. The earlier QA bypassed service workers and missed this path.
- Restored the preview as a detached server. Restricted offline shell fallback to actual game entries, precached first-room artwork, and rejected HTML masquerading as image/model responses. Runtime 0.8.2gb.
- Added normal service-worker browser checks to test:browser: decoded images, disconnected-origin reload/resume, cached/uncached report navigation, reconnect and preserved career state. Desktop, Android and iPhone passed.
- Sixteen focused regressions, runtime packaging and diff checks passed. Corrected the earlier report and captured the actual offline opening screens.

## 2026-10-15 — Contextual tutorial guidance and easier equipment

- Replaced bundled flight instructions with a persistent next action driven by actual navigation, arrival, distance, speed, drone and cover state. Vesper progresses through alignment, hyperdrive, arrival, 5,000 km approach and braking; time alone never advances the instruction.
- Added small Rin, Mara and Paul portraits on the existing comms strip. Tutorial instructions return after temporary chatter without duplicating their log entries.
- Explained the gifted reactor and added a direct button to its item card. Owned equipment now offers installation directly from cargo/local storage into a free compatible mount; full fits require an explicit replacement choice. The same flow works for regular shop purchases.
- Nineteen focused integration checks passed. Muted desktop Chrome, Android Chrome and iPhone WebKit checks passed with normal service workers enabled and a returning-page reload: reactor explanation, free installation, shop installation, explicit replacements, staged flight guidance and decoded portraits. Screenshots inspected; corrected a clipped phone explanation.
- Full desktop campaign regression passed through real drone extraction, mining contract payment, the pirate standoff, Paul rescue, carrier hiding and recorder delivery. Travel/combat outcomes use deterministic live-runtime setup; reactor fitting uses the visible buttons. No browser errors.
- Runtime 0.8.2gc; packaging and diff checks passed. Local preview remains on port 4192. No commit requested.

## 2026-10-15 — Own-ship terminal and simpler drone controls

- Replaced the overflowing mixed ship-menu grid with Flight, Equipment & Cargo, Drones and Journal sections. One header and section bar stay fixed; only the selected content scrolls. Retained wing orders, transponder/turret controls, paint, weapon details, cargo jettison, tutorial objectives and contracts.
- Kept mining, PDC and repair drones after the user's correction. Removed attack-drone behavior and stock; old owned units, bay assignments and saved loot convert to PDC without losing hull/ammunition or duplicating ownership. NPC Wayfarers use PDC drones.
- Role switches work docked or in flight, queue automatic physical recall, deliver mining payloads and load owned matching cargo. Removed per-bay manual stow controls. Selecting an empty bay's existing role refills from available cargo. Pending switches clearly explain that flight must resume.
- Compacted bay summaries so all four Atlas bay controls fit on landscape phones. Reviewed desktop, Android and iPhone screenshots; fixed notification overlap and the original long weapon descriptions.
- At the user's request, removed the floating toast element, timers and CSS entirely. Notifications now feed the cockpit ticker and Journal; inline menu failures remain. Reset status history when a session changes.
- Full suite: 689 checks passed before the final visual/notification refinements; focused follow-ups passed, including new save migration, automatic payload return, PDC-to-repair operation, empty-bay refill and all notification severities. No outstanding failures.
- Muted desktop Chrome, Android Chrome and iPhone WebKit checks passed with service workers enabled: actual own-monitor opening, section controls, bounded layout, four Atlas bays, docked and airborne switches, real repair, and Arena Run. Final iPhone pass also confirmed no floating notifications for any severity. Screenshots inspected.
- Runtime 0.8.2gd; packaging and diff checks passed. Preview is on port 4192. No commit requested; no remaining work for this request.

## 2026-10-15 — Paul introduces repair drones

- Paul now carries two repair drones in his Torsas. His rescue dialogue explains hull repair, the owner's energy cost and automatic support for friendlies within 200 km; his Cairn offer reminds the player about that support.
- Shared player/NPC repair targeting prioritizes the owner's hull, keeps a valid friendly recipient, then chooses another damaged friendly in range. Drones physically approach hull contacts, lift off before changing recipients and render their existing repair sparks. Separate bay contacts avoid stacking Paul's pair. Missing contact rings are sampled from the current hull collider once and cached.
- Enforce range, friend/team eligibility, obstruction checks, hull cap and the existing 20% owner energy reserve. Repair does not recharge shields or heal/reactivate a disabled story companion. Paul's drones recall during the carrier hiding lesson; becoming disabled preserves his drones rather than destroying them.
- Seventy focused drone/tutorial/dialogue/service-worker checks passed. Seven affected physical-drone checks passed again after the final bay-index correction. Packaging and diff checks passed.
- Muted desktop Chrome and iPhone WebKit checks passed with service workers enabled: visible in-flight tutorial dialogue, automatic self-to-player repairs and rendered working drones/sparks. Inspected phone dialogue and repair captures. Full Android tutorial route passed with Paul invited to the recorder mission, including carrier hiding and final delivery; no browser errors.
- Runtime 0.8.2ge; preview remains on port 4192. No commit requested.

## 2026-10-15 — Compact commodity market

- Put prices beside commodity icons and names below; remove redundant per-card market/packaging text from the catalog while keeping full trade details on selection.
- Use two compact columns beside the desktop ticket and five columns on landscape touch screens. All ten cards fit without an internal catalog scrollbar; cargo counts and the optional cargo summary remain available.
- Muted desktop Chrome, Android Chrome and iPhone WebKit checks passed with normal service workers: all ten names/prices inside the viewport, price/icon alignment, no card clipping or catalog scroll, a real commodity purchase and the loaded-cargo view. Inspected desktop and phone screenshots.
- Runtime 0.8.2gf; packaging and diff checks passed. No commit requested.

## 2026-10-15 — Remove repeated menu information

- Removed the duplicate market cargo summary/manifest and its unused quote calculations. Commodity cards retain owned quantities; the trade ticket retains selling actions and total hold capacity.
- Reviewed the station, cockpit, options, map, Arena Run and spectator menus. Removed redundant shipyard prices, the extra current-ship placeholder, zero stat deltas, zero-value trade-in lines, the second Drones shortcut, the inactive All items filter, misleading empty-equipment copy below actual cargo, empty drone-cargo disclosures and unequipped launcher 0/0 rows.
- Simplified repeated spectator editor headings and stock-fit labels. Entering spectator mode now clears a stale Arena/fitting modal, matching its existing cleanup of pause, map, ship and chat overlays.
- Kept tutorial instructions, meaningful stats and actual transaction/ownership information. No floating notifications added.
- Forty-seven focused integration checks passed. Follow-up fitting/inventory checks (26) and observer checks (4) passed after the final changes. Packaging, syntax and diff checks passed.
- Muted desktop Chrome, Android Chrome and iPhone WebKit checks covered 30 menu states each: title; Vesper cargo and sale; equipment cargo/detail/shop; current and replacement shipyard; bar, contracts, guilds, services, concourse and dialogue; all settings tabs; all own-ship tabs; sector/galaxy maps; Arena hub and run hull/reward/ready/fitting states; spectator editor. No horizontal menu overflow or browser errors. Desktop/Android rechecked the final inventory and mode cleanup; the final iPhone observer transition passed and its screenshot was refreshed. Reviewed representative desktop/phone captures, including the reported Vesper case.
- Screenshot gallery and report: output/menu-clarity/index.html. Runtime 0.8.2gg; local preview remains port 4192. No commit requested.

## 2026-10-15 — Buy max tutorial cargo and boost on arrival

- The opening trade preselects Protein Packs and offers one Buy max action with the actual quantity and price; the quantity controls disappear for this guided purchase. Vesper offers Sell all for the matching guided sale. Other commodities retain normal trading controls.
- Updated Mara/Rin dialogue and bilingual objectives. Track the complete purchased load for Vesper rather than leaving the delivery goal fixed at sixteen. Existing deliveries keep their saved quantity. The launch guard uses that saved goal.
- Removed boost from the departure checklist. After the real Vesper hyperdrive drop at about 7,000 km, comms request full thrust, afterburn until 5,000 km, release, then braking as separate actions. Learning is recorded during this approach; it never blocks landing. Resumed departures waiting only for the obsolete boost check advance correctly.
- Sixty focused tutorial, dialogue and campaign checks passed, including complete-load purchase/sale, the relocated boost lesson, ordered landing guidance and the resumed-save edge case. Packaging, syntax and diff checks passed.
- Muted desktop Chrome, Android Chrome and iPhone WebKit checks passed with service workers enabled: actual Buy max click, purchased-load tracking, departure without boosting, real physical hyperdrive drop, timed normal/boosted approaches, release/brake/landing guidance and actual Sell all click leading to the reactor gift. Identical loaded approaches took about 41.5 seconds at cruise versus 28.7–28.8 seconds with boost. Screenshots reviewed; no browser errors.
- Runtime 0.8.2gh. Preview remains on port 4192. No commit requested.

## 2026-10-15 — Short commodity names

- Applied the requested German names to all ten commodities: Protein, Wasser, Medigel, Elektronik, Maschinen, Erz, Gold, Schrott, Luxusgüter and Waffen. Shortened English names too and retained the original IDs, economy and save compatibility. Legacy translation aliases resolve to the new names.
- Updated active tutorial objectives and Mara/Rin trade dialogue to use Protein. Rin explains that weapons are marked red and transporting them is illegal.
- Red weapons labels now carry through the market cards, trade detail, cargo and salvage list; the name no longer needs an illegal suffix.
- Focused economy, dialogue, localization, tutorial and presentation checks passed (39 distinct checks including the new exact-name assertion). Packaging and diff checks passed.
- Runtime 0.8.2gi; local preview remains port 4192. No commit requested.
- Muted desktop Chrome, Android Chrome and iPhone WebKit checks passed: all ten exact labels, red weapons list/detail text, clipping/scroll checks and actual Buy max purchase. Screenshots reviewed; no browser errors. Report and captures: output/commodity-cards/.

## 2026-10-15 — Three simple service cards

- Replaced the repair/refill/drone-service maze with three cards: combined ship and carried-drone repair; ship fuel/ammunition refill; and a paid hull-paint preview. Removed nested service breakdowns, recovery boilerplate and maintenance controls from the drone equipment panel. Drone purchases remain in Equipment.
- Repair quotes include active-bay and cargo drones, without assigning or buying replacement units or touching stored ships. The combined transaction checks affordability first and bills each cost once. Refueling is independent of drones.
- User clarification: drones do not need ammunition. Removed PDC ammo checks, consumption, empty recalls, refill charges and player ammo readouts. Player and NPC PDC drones use the same cooldown/targeting controller; old ammo metadata cannot prevent firing. Mining and repair drones retain their roles.
- Paint selection previews the equipped hull in neutral light at a fixed angle. Applying a different finish costs 1% of the hull price rounded to 50 cr, minimum 250 cr, at a repair dock. Removed the free in-flight paint selector; paid paint persists through save hydration.
- Focused maintenance/payment, affordability, docking, stale-quote, save, inventory/loot, drone combat/mining/role switching/repair support, ship-stat, phone equipment and preview-framing checks passed. Packaging and diff checks passed.
- Runtime 0.8.2gj. Browser capture/check output: output/dock-services/. No commit requested.
- Muted desktop Chrome, Android Chrome and iPhone WebKit checks passed for all three cards, actual combined repair/refill debits, paint preview and paid application, and preview disposal on leaving Service. Found and removed inherited bar margins that overflowed the short iPhone viewport. Final iPhone check also verified the enlarged fixed-angle preview. Screenshots inspected; no browser errors.

## 2026-10-15 — Story card instead of the tutorial strip

- Removed the persistent dock tutorial strip. The single station header now has a Story button for active/completed prologues; its card contains the current objective/progress and contextual instructions, including the gifted reactor shortcut. Retained the cockpit’s step-by-step comms guidance.
- New careers always ask once whether to play or skip the tutorial before creating a save. The existing-save overwrite warning shares that card; Back leaves the save untouched. The selected tutorial flag goes directly into new-save construction. Resume never asks again.
- Removed in-career skip/abort controls from both station UI and the ship journal, including their delegated actions. Internal migration/debug helpers remain for existing save/test compatibility.
- Story cards trap keyboard focus, close with Escape, disable background station controls and count as a modal. Closing restores focus to Story; following the reactor shortcut closes the card before fitting.
- Updated the existing browser entry flows for the new one-time choice. Fourteen focused confirmation, fitting, tutorial-guidance and campaign checks passed. Packaging and diff checks passed.
- Runtime 0.8.2gk. Browser check/capture output: output/story-card/. No commit requested.
- Muted desktop Chrome, Android Chrome and iPhone WebKit checks passed: first-career choice/cancel, no tutorial strip or abort control, compact headers across concourse/services/equipment/bar, Story open/close and background input lock, gifted-reactor installation from the card, resume without asking again, and skipping at creation followed by save/resume. Screenshots reviewed; no browser errors or clipped header/card controls. Follow-up dialogue and offline-cache checks (21) also passed.

## 2026-10-15 — Present-task Story cards

- Automatically open Story after a new tutorial career finishes loading; skipped careers and resumed careers do not open it. The first card contains exactly “Triff Mara und Rin in der Bar.” and “Klicke auf 'Story', um diese Hinweise zu sehen.”
- Reviewed every tutorial card. Added concise bilingual present-task copy without chapter counters, repeated quest titles, redundant summaries or previews of later tasks. Shared the same copy with the ship journal. Kept actual progress counts, necessary control instructions and the free-reactor fitting shortcut.
- Mining-contract and hiding cards respond to the current conversation/transponder state. In flight, the journal uses the matching current comms instruction rather than repeating a broad mission summary; stale hints from a different step are ignored.
- Updated browser entry flows to close the automatically shown card. Added checks for exact first-card text, translation coverage for every task, brevity, phase-aware copy and all-card desktop/phone fit. Focused campaign, guidance, localization, confirmation and fitting checks passed; packaging and diff checks passed.
- Runtime 0.8.2gl. Browser capture output remains output/story-card/. No commit requested.
- Muted desktop Chrome, Android Chrome and iPhone WebKit checks passed: automatic first-card opening with the exact two lines; all 33 task cards without horizontal or vertical clipping; Story close/reopen; reactor fitting; resume without reopening; and skip/free-play persistence. Representative opening, objective and phase cards visually inspected. No browser errors.

## 2026-10-15 — Compact map grid and overflow

- Confirmed the phone layout hid the tactical radar but retained its three-row grid, capping the contact list early and leaving a vacant bottom row. Compact navigation now uses a header plus a contact-list row filling the available panel height.
- Bound compact sector/galaxy cards to the available viewport, with internal contact scrolling. Destination labels wrap within their buttons; removed the protruding MISSION badge and stacked selection boxes in favour of a contained gold objective highlight. Corrected TRACKED to ERFASST in German.
- Muted desktop Chrome (1440×900 and reported 843×380), Android Chrome and iPhone WebKit checks passed across all four systems: map and label bounds, full contact-panel height, long-name overflow, scrolling through 32 contacts, reaching the last row, sector/galaxy switching and actual Vesper selection. Representative screenshots reviewed. Packaging and diff checks passed.
- Runtime 0.8.2gm. Output: output/navigation-layout/. No commit requested.
- Rechecked the exact reported 843×380 viewport with five contacts and refreshed its screenshot after repaint; the list reaches the panel bottom and all labels stay inside their buttons.
- Also verified Acheron (the fifth system) in desktop, reported-size, Android and iPhone layouts; its sector/galaxy views, contact scrolling and navigation selection passed without browser errors.

## 2026-10-15 — Vesper arrival and reactor lessons

- Added automatic bilingual Rin conversations on first Vesper arrival and after the full Protein sale. They explain the normal commodity market and Equipment → Storage → Install flow, including energy regeneration and free fitting of owned parts.
- Removed the Story fitting shortcut, tutorial-only commodity selection and simplified transaction buttons. The tutorial uses the standard trading and equipment interfaces. Kept normal Buy max/Sell all.
- Dock conversations wait for loading and other modals, then persist when shown; partial sales, return visits and reloads cannot replay them. The reactor remains a single gift in ordinary Vesper storage.
- 51 distinct focused campaign, dialogue, guidance, fitting, save and offline-cache checks passed. Muted desktop Chrome, Android Chrome and iPhone WebKit passed the actual arrival → dialogue → normal sale → dialogue → Storage → Install flow. Partial sale, dialogue reopening, persistent one-time flags, free installation and increased energy regeneration verified. Representative desktop/phone screenshots inspected; no browser errors.
- Added the Vesper browser flow to test:browser:tutorial. Desktop guidance/fitting and complete-campaign regression passed, including mining, Paul’s rescue, carrier hiding and black-box delivery. Updated one stale browser expectation for the existing afterburner lesson. Packaging and diff checks passed. Runtime 0.8.2gn. Output: output/vesper-lessons/. No commit requested.

## 2026-10-15 — Review all story instructions and ordinary menus

- Reviewed the opening trade and all authored story conversations. Split Mara’s trading motivation from Rin’s concrete Market → Commodity Market → Protein → Buy max instructions; kept the illegal-cargo explanation separate. Added short one-time launch, reactor-to-bar and mining-return handoffs.
- Replaced stale manual drone-recall instructions with automatic recovery. Explained normal Mission Board → Accept and Equipment → Drones → PDC controls, survey recording, desktop M/Space controls, Paul’s repair support and carrier sensor cover. Completed lessons and invited escorts give short reminders on repeat visits.
- Fixed extra Protein purchases not updating the delivery total, mining coaching asking for deployment outside the actual 100 km range, Equipment reopening stale item details, and Mara’s Cairn call being invisible while docked. The docked wealth milestone also waits for settlement receipts.
- 90 distinct focused story/campaign, localization, phone-menu and offline-cache checks passed, including the final docked-call regression. Complete deterministic campaign checks passed in desktop Chrome, Android Chrome and iPhone WebKit with and without Paul. Normal-menu walkthroughs also passed in desktop Chrome, Android Chrome and iPhone WebKit: actual family conversations, purchases, sale, fitting, contract acceptance and PDC switching; every later story introduction, Cairn call, optional Paul and final decoding conversation. Representative screenshots reviewed with no clipping or browser errors.
- Standard Buy max/Sell all buttons now show their transaction totals before activation, matching Rin’s explanation. Corrected the supplemental mining-radio line to describe automatic drone return. The opening dialogue compares Helix/Vesper sale prices instead of calling the local price cheap; the market may correctly label that price high. Fixed the mining contract type to use the noun Abbau rather than the AI state Baut ab. Packaging and diff checks passed. Runtime 0.8.2go. No commit requested.

## 2026-10-15 — Mining quota transition, nearby claim and quiet guidance

- Investigated the reported freeze with the complete simulation/HUD and the full animation-frame loop. Fresh-save reproductions did not produce a hard JavaScript failure, but showed the quota callback hijacking the asteroid target/navigation and repositioning the escort during active drone deliveries. Removed those side effects at the return-mining handoff and on resume; miners continue until the player chooses to leave or ordinary mining limits apply.
- The visible in-app tab was still BUILD 0.8.2gk. Bumped runtime/cache to 0.8.2gp for a fresh test build.
- New tutorial claims require six delivered ore for 3,000 cr. Choose an existing static rock roughly 1,000 km from the real Vesper-to-Shardbelt arrival, with extra ore for continued work. Accepted legacy contracts retain their existing terms and progress. Updated dialogue, objectives and tests.
- Learned instructions after the first flight are quiet until an action stalls for 60 simulation seconds; useful movement or ore delivery resets the timer. Each action gets one nudge. Passive scanning, cruising and drone work remain silent. Added the mining M/ABBAU control to its first dialogue introduction.
- Verification passed: 69 focused campaign/dialogue/localization and mining regression checks; complete animation-frame mining beyond the six-ore threshold, desktop keyboard/phone tilt steering, automatic recall and the pirate standoff in desktop Chrome, Android Chrome and iPhone WebKit. No browser or caught frame errors. Reviewed desktop/phone screenshots. The live-frame heartbeat allows for software-rendering speed. Packaging and diff checks passed. Evidence: output/tutorial-mining/report.json. No commit requested.
