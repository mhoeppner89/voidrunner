import * as THREE from 'three';
import { AudioManager } from './audio.js';
import { COMMODITIES, DEFAULT_NAV_LOCATION_BY_SYSTEM, EQUIPMENT, GUILD_RANK_NAMES, LOCATIONS, MARKET_LOCATION_IDS, SHIPS, activityLocationIdsForSystem, displaySpeed, dockLocationIdsForSystem, hyperdriveArrivalRadius, locationInstanceRadius, navLocationIdsForSystem, sectorEncounterChance, spawnClearance } from './data.js';
import { SYSTEMS, getRoute, hasSystem, jumpPiracyRisk, planRoute } from './galaxy.js';
import { buyCommodity, cargoCapacity, cargoFree, cargoMass, denPrice, recordMarketVisit, refreshAllPrices, sellCommodity, SYNDICATE_DEN_FAVOR, tickEconomy } from './economy.js';
import { InputManager } from './input.js';
import { acceptMission, awardCareerProgress, completeBountyMission, completeMissionsAtDock, failExpiredMissions, joinGuild, refreshMissionOffers, VALUABLE_CARGO_LABELS, } from './missions.js';
import { RACE_QUEST_ID, createRaceRacers, crossedRaceGate, generateRaceCourse, normalizeRaceRecord, raceCourseUnlocked, racePayout, raceRankLabel, raceRacerTarget, recordRaceResult, stageRaceRacers, updateRaceRacer } from './racing.js';
import { clamp, damp, formatCredits, pick, proceduralCallsign, randomBetween, randomInt, seededRandom } from './random.js';
import { EntityStore } from './entityStore.js';
import { SpaceRenderer } from './render.js';
import { saveGame } from './save.js';
import { getQuest, setFlag, setStep, startQuest } from './quests.js';
import { getEffectiveShipStats, refillCost, repairCost } from './shipStats.js';
import { ammoCapacity, AMMO_CAPACITY, LAUNCHERS, WEAPON_ORDER, WEAPONS, launcherIdForOutfit, weaponForSlot, weaponIdForOutfit, weaponOwned } from './weapons.js';
import { HULL_HARDPOINTS, OUTFIT_ITEMS, OUTFIT_ITEM_IDS, canonicalOutfitId, collapseOutfittingToSingleShip, commitOutfitting, itemFitsMount, loadoutFor, normalizeOutfitting, outfitItem, projectLegacyEquipment, quoteOutfitting, outfittingUsage } from './outfitting.js';
import { combinedHullIntegrity, normalizeEnergy, regenerateCombatResources, spendEnergy } from './combatResources.js';
import { commitShipTrade, quoteShipTrade } from './shipTrade.js';
import { SHIP_MOUNT_ANCHORS } from './shipMounts.js';
import { asteroidCollisionMesh, asteroidCollisionRadius, ASTEROID_COLLISION_FACTOR, generateAsteroidField, generateGraveyardPieces, generateRegionalAsteroidField, generateWreckNodes, graveyardZoneAt, graveyardZoneLabel, GRAVEYARD_GEOMETRY_PROFILES, REGIONAL_ASTEROID_FIELD_IDS, wreckNodeCollisionRadius } from './worldData.js';
import { hullVsAsteroid, hullVsBox, hullVsEngine, hullVsHull, hullVsRing, hullVsSphere } from './hullCollision.js';
import { steerToward } from './npcNav.js';
import { PILOT_LINES, pilotMod, rollPilot, TIER_LABELS } from './pilots.js';
import { setLanguage, t } from './i18n.js';
import { MUG_CHANCE, SMUGGLE_CHANCE, createSmuggleTask, createTask, rebasePatrolTask, rollNpcCargo, updateShipAI } from './shipAI.js';
import { paletteForFaction, playerShipVariant, shipVariantForRole } from './voxelModels.js';
const FORWARD = new THREE.Vector3(0, 0, -1);
const UP = new THREE.Vector3(0, 1, 0);
const RIGHT = new THREE.Vector3(1, 0, 0);
// Keep the AI update callable with lightweight debug/test ship objects that do
// not carry the seeded runtime RNG used by spawned ships.
const FALLBACK_AI_RNG = () => 0.5;
// Situation lines that land at most once per ship (first contact, the player's
// rank, and the valuable-load callouts) — remembered in pilotLineHistory.said.
const PILOT_ONESHOT_KEYS = new Set(['contact', 'rank', 'case', 'cargo']);
const PLAYER_RADIUS = 1.25;
// The player's collision envelope is the GLB hull scaled down by this factor:
// near-misses that look like they clear usually do, while the wide Talon sweep
// still registers. NPCs collide at their full hull (no forgiveness).
const PLAYER_COLLISION_FORGIVENESS = 0.7;
// Fallback NPC collision radius for hulls without an explicit entry in
// HULL_FLIGHT_STATS. Debris boxes still resolve against their exact oriented
// surface, but the ship-side envelope is now per-hull so a freighter bumps at
// its corners and an interceptor slips through gaps the barge cannot.
const NPC_SHIP_RADIUS = 1.8;
// A ship below this hull ratio is "badly damaged" and, after clipping a rock,
// re-rolls toward clear open space instead of straight back into the field.
const NPC_BADLY_DAMAGED_HULL_RATIO = 0.6;
// Combat-sim field starts sit inside the cloud, but keep a generous bubble
// around the player so the first frame is a calm staging view rather than an
// immediate collision check. The candidate offsets make this robust to a
// depleted or drifting piece changing the exact centre pocket later.
const ARENA_FIELD_SAFE_CLEARANCE = 320;
const ARENA_FIELD_START_OFFSETS = [
    [0, 0, 0],
    [0, 160, 0],
    [0, -160, 0],
    [180, 0, 0],
    [-180, 0, 0],
    [0, 0, 180],
    [0, 0, -180],
    [120, 120, 120],
    [-120, 120, -120],
    [120, -120, -120],
    [-120, -120, 120],
];
// The widest rendered field obstacle (a scaled monolith ≈ 130u × 1.6) exceeds
// the old 140u collision margin, so grid queries must pad by this much to catch
// the surface of the biggest rocks before the ship is inside them.
const MAX_FIELD_OBSTACLE_RADIUS = 380;
// Asteroids render as a distorted sphere scaled per axis. Hard collision AND
// line of sight both test the rock's actual deformed-icosahedron mesh
// (worldData.asteroidCollisionMesh), so a shot is blocked only where rock is
// drawn — the old enclosing box's corners stuck out past the visible rock and
// ate shots in open space. The box survives only as the spawn-clearance
// envelope (derived from this per-axis factor, which sits just under the
// geometry's widest silhouette).
const ENTRY_CLEARANCE = 4;
const ENTRY_SEARCH_RADII = [64, 128, 256, 512, 1024];
const ENTRY_SEARCH_DIRECTIONS = [
    [1, 0, 0],
    [-1, 0, 0],
    [0, 1, 0],
    [0, -1, 0],
    [0, 0, 1],
    [0, 0, -1],
    [1, 1, 0],
    [-1, 1, 0],
    [1, -1, 0],
    [-1, -1, 0],
    [1, 0, 1],
    [-1, 0, 1],
    [1, 0, -1],
    [-1, 0, -1],
    [0, 1, 1],
    [0, -1, 1],
    [0, 1, -1],
    [0, -1, -1],
];
const HYPERDRIVE_THREAT_RADIUS = 360;
const HYPERDRIVE_CRUISE_SPEED = 50000;
const HYPERDRIVE_DISPLAY_SPEED = 1000;
const HYPERDRIVE_SPOOL_SECONDS = 2;
const HYPERDRIVE_FX_DURATION = 0.9;
const HYPERDRIVE_INTERRUPT_DURATION = 1.1;
const GATE_TRANSITION_SECONDS = 0.52;
// Give the player a short calm window after an intercept is resolved so a long
// route cannot immediately roll into another hyperdrive ambush.
const HYPERDRIVE_ENCOUNTER_COOLDOWN = 45;
// Salvage ambushes chase the hold's value: below SALVAGE_AMBUSH_FLOOR_WORTH
// claim-jumpers won't bother, and the odds scale linearly up to
// SALVAGE_AMBUSH_MAX_CHANCE at SALVAGE_AMBUSH_MAX_WORTH. The richest holds
// draw a second pirate, whose odds ramp across the escort worth band.
const SALVAGE_AMBUSH_FLOOR_WORTH = 200;
const SALVAGE_AMBUSH_MAX_WORTH = 1700;
const SALVAGE_AMBUSH_MAX_CHANCE = 0.5;
const SALVAGE_AMBUSH_ESCORT_MIN_WORTH = 500;
const SALVAGE_AMBUSH_ESCORT_MAX_WORTH = 1400;
// Claim-jumpers are not parked on the wreck: they only move once the beam has
// been running a while, so an ambush never opens the moment salvage starts.
const SALVAGE_AMBUSH_DELAY = 4;
// Mining jackpot: a fully depleted asteroid occasionally reveals a gold
// pocket (the mining mirror of the salvage equipment drop). Seeded per node,
// so the same rock strikes the same pocket every career.
const GOLD_POCKET_CHANCE = 0.08;
const GOLD_POCKET_MIN = 1;
const GOLD_POCKET_MAX = 3;
// A staked claim occasionally draws a rival prospector who contests the rock
// mid-cut. Seeded per claim node, so the same seam disputes the same way every
// career, and it fires at most once per claim.
const CLAIM_DISPUTE_CHANCE = 0.35;
// A rival doesn't contest the rock on the first ore out: they only move after
// a couple of units have been cut, so disputes land mid-seam, not at the start.
const CLAIM_DISPUTE_AFTER_UNITS = 2;
const CLAIM_DISPUTE_LINES = [
    t('That seam is under my crew\'s claim. Cut it any deeper and you will answer for it.'),
    t('You are on registered ground, spacer. My board holds the papers on this rock.'),
    t('Walk away from that cut and this stays civil.'),
    t('That is my ore you are beaming. Step off or get spaced.'),
    t('You have cut enough of my rock. Take what you have and go.'),
];
// Selling gold marks the player (see economy.js GOLD_HEAT_SECONDS). While the
// heat is fresh, the Shardbelt's ambient encounter windows shift so pirate
// intercepts roughly double — but from a low base, because mining is meant to
// be mostly safe: base windows are miner 0.42, trader 0.68, patrol 0.90
// (pirate 10%), and gold heat moves them to miner 0.36, trader 0.58, patrol
// 0.80 (pirate 20%).
const GOLD_HEAT_MINER_CUTOFF = 0.36;
const GOLD_HEAT_TRADER_CUTOFF = 0.58;
const GOLD_HEAT_PATROL_CUTOFF = 0.80;
const ASTEROID_PATROL_CUTOFF = 0.90;
// Most pirate encounters open with a standoff ("mugging") instead of gunfire:
// the lead hails and demands a share of the most valuable cargo — or, when the
// hold is empty, a toll priced off the ship and its outfit (never the pilot's
// wallet) — with a short window to comply. Compliance means the group takes its
// cut and breaks off; firing or letting the clock expire commits them to the
// fight. Gold-heat intercepts reuse the same machinery with a syndicate-tipped
// demand for every gram of gold aboard.
const MUG_STANDOFF_SECONDS = 9;
const MUG_CARGO_SHARE = 0.5;
const MUG_TOLL_MIN = 120;
const MUG_TOLL_MAX = 600;
const MUG_TOLL_SHARE = 0.06;
// How big a cut a mugger wants, by temperament: timid pirates settle for a
// light toll, aggressive ones try to take the hold's cream. Steady sits on
// the MUG_CARGO_SHARE baseline.
const MUG_TEMPERAMENT_SHARE = {
    timid: 0.35,
    steady: 0.5,
    aggressive: 0.7,
    flamboyant: 0.55,
};
const MUG_DEMAND_LINES = [
    t('Drop {demand} and keep the hull. {seconds} seconds.'),
    t('Nice hold you have there. Hand over {demand} and we fly on. {seconds} seconds.'),
    t('Toll time, spacer. {demand}, or we pry it out of your wreck. {seconds} seconds.'),
    t('We are not asking twice. {demand}. {seconds} seconds.'),
];
const MUG_EMPTY_LINES = [
    t('Nothing worth the fuel. Clear off, spacer.'),
    t('An empty hold. Not worth the ammo — fly on.'),
    t('You are not worth our time. Go.'),
];
// Claim-jumpers want the wreck, not a kill: they demand the salvage itself.
// They only move once the pilot has been cutting a while, so the lines own the
// timing — the pirates watched the work and are collecting the haul.
const SALVAGE_DEMAND_LINES = [
    t('Nice cutting, spacer. Drop {demand} and clear off. {seconds} seconds.'),
    t('We watched you work that wreck. Hand over {demand}. {seconds} seconds.'),
    t('You pulled the salvage. We will take {demand}. {seconds} seconds.'),
    t('That haul has our name on it. {demand}, now. {seconds} seconds.'),
];
// A show of force can end a standoff before it becomes a fight: a hit on a
// demanding pirate may scare the group off, with timid leads folding easiest
// and aggressive ones fighting to the last.
const MUG_SCARE_OFF = {
    timid: 0.5,
    steady: 0.18,
    aggressive: 0.02,
    flamboyant: 0.12,
};
const MUG_SCARE_LINES = [
    t('Forget it — this one fights. We will find easier prey.'),
    t('Not worth the hull damage. Break off!'),
    t('They shoot back! Disengage, disengage!'),
];
const GOLD_DEMAND_LINES = [
    t('Jettison the gold and we all fly home. {seconds} seconds.'),
    t('We know what you sold. Drop the gold, keep the ship. {seconds} seconds.'),
    t('The syndicate wants its cut. Eject the gold or we take it off the wreck. {seconds} seconds.'),
    t('Nice haul, miner. Leave the gold drifting and nothing gets scuffed. {seconds} seconds.'),
];
// Neutral traffic says one thing when the player slips close (see
// maybeNeutralChatter): patrols keep their official voice, everyone else greets
// by temperament from the PILOT_LINES pools.
const PATROL_GREET_LINES = [
    t('Concord patrol. Mind the cordon, pilot.'),
    t('Traffic control has you on approach. Keep it clean.'),
    t('Quiet night. Keep it that way, spacer.'),
    t('Civilian traffic is logged. Safe docking.'),
];
// Opportunists: spacers who saw the player at work (beaming ore, stripping a
// wreck, or hauling a valuable hold) occasionally decide the haul is worth
// taking — but only where the local patrols are not watching. The odds scale
// with how loud the work is (extracting now + a rich hold), and the lines own
// the "we watched you" timing.
const OPPORTUNITY_CHANCE = 0.22;
const OPPORTUNITY_HOLD_WORTH = 400;
const OPPORTUNITY_RECENT_SECONDS = 6;
const OPPORTUNITY_MAX_POLICE = 0.35;
const OPPORTUNITY_DEMAND_LINES = [
    t('Saw you working that rock. Drop {demand} and fly. {seconds} seconds.'),
    t('You have been busy, spacer. Leave {demand} and we all fly on. {seconds} seconds.'),
    t('Nice little haul you are building. Hand over {demand}. {seconds} seconds.'),
    t('We watched you fill that hold. {demand}, now. {seconds} seconds.'),
];
// A follow-on ambush (the player was seen working within SEEN_WORKING_SECONDS)
// that finds an empty hold breaks off with the "watched you work" voice too.
const OPPORTUNITY_EMPTY_LINES = [
    t('You worked all that for nothing? Not worth the fuel. Go.'),
    t('An empty hold after all that effort. Clear off.'),
    t('All that work and nothing to show. Fly on.'),
];
// Station-approach traders occasionally hail with market banter instead of a
// plain greet. The line keys off the live price at their station, so a
// commodity trading well draws a tip and one in the gutter draws a grumble —
// the traffic reads as working pilots, not scenery.
const MARKET_BANTER_CHANCE = 0.45;
const MARKET_BANTER_GOOD_PRICE = 1.12;
const MARKET_BANTER_BAD_PRICE = 0.9;
const MARKET_BANTER_COMMODITIES = ['medicine', 'electronics', 'machinery', 'luxuries', 'arms', 'ore'];
const MARKET_BANTER_TIP_LINES = [
    t('{commodity} is trading at {price} cr here. Worth a run if you have the hold.'),
    t('They are paying {price} cr for {commodity} right now. Do not tell everyone.'),
    t('Lucky break for you — {commodity} is going for {price} cr at {station}.'),
];
const MARKET_BANTER_GRUMBLE_LINES = [
    t('{price} cr for {commodity}? Highway robbery. I am flying out of here.'),
    t('They want {commodity} but only pay {price} cr. Not worth the fuel.'),
    t('Do not haul {commodity} to {station} — they are paying a pittance, {price} cr.'),
];
const MARKET_BANTER_FLAT_LINES = [
    t('{commodity} sits at {price} cr here. Nothing special, but it moves.'),
    t('Just offloaded {commodity} at {price} cr. Steady money, no fuss.'),
    t('{price} cr for {commodity} at {station}. Fair enough, I suppose.'),
];
// Station approach traffic keeps docks and planets feeling inhabited: a small
// rotating cast of traders, patrols, and miners working the approach lane.
const STATION_TRAFFIC_RANGE = 1500;
const STATION_TRAFFIC_TARGET = 3;
// Concord capital traffic is landmark-scale, not part of the random encounter
// table. One frigate may work Rook's Helios lanes; Meridian Prime also fields
// a frigate and its sole battleship guard. No other system can spawn one.
const CAPITAL_TRAFFIC_CHECK_SECONDS = 1;
const CAPITAL_HOMEWORLD_RANGE = 7000;
const CAPITAL_ROOK_RANGE = 3600;
// A patrol's passing greeting invites a reply while the call is up: a small
// Concord reputation courtesy for acknowledging the cordon pilot.
const PATROL_REPLY_SECONDS = 12;
const PATROL_REPLY_REP = 2;
const PATROL_REPLY_LINES = [
    t('Acknowledged, pilot. Concord appreciates the courtesy.'),
    t('Good flying, spacer. Report any trouble on the lanes.'),
    t('Noted. Keep the peace and we stay friendly.'),
];
// Search AI: only a ship that already had the player resolved — and then lost
// the signal — opens a search at the last-known position. A patrol that
// watched a dark contact vanish sweeps it (blue ring); a hostile actually
// targeting the player that lost the resolve sweeps it too (red ring). The
// searcher flies to the anchor, then randomly fans out across the sweep radius
// for a timed window before giving up for a cooldown. Being caught running
// dark dings Concord standing once per catch; re-resolving a searched contact
// closes the search with a hail (patrol) or an engagement (hostile).
const PATROL_CATCH_REP = -2;
const PATROL_CATCH_REPEAT = 12;
const SEARCH_RADIUS = 100;
const SEARCH_SWEEP_SECONDS = 12;
// How long the approach may take before the sweep starts anyway: a last-known
// position that sits inside a rock cluster is unreachable (avoidance orbits
// it), and a search that can never arrive must not circle forever — fan out
// from the nearest reachable point instead.
const SEARCH_APPROACH_TIMEOUT = 20;
const SEARCH_COOLDOWN = 28;
// The approach pass pushes harder than the patrol cruise (0.5x) but stays
// slower than any lit hull at full throttle (0.85 * 36 patrol = 30.6 vs the
// slowest player hull at 34), so a dark pilot who commits to running bleeds
// the distance past the dark-detection line and escapes to the last-known
// sweep.
const PATROL_SEARCH_SPEED_MUL = 0.85;
const PATROL_SEARCH_LINES = {
    catch: [
        t('Dark transponder logged. Hold position — Concord has you on file.'),
        t('Unlicensed squawk detected. You have been flagged, pilot.'),
        t('Running dark is logged, not ignored. Concord sees you.'),
    ],
    giveup: [
        t('Contact lost. Logging the sector and resuming patrol.'),
        t('Nothing here but noise. Resuming patrol route.'),
    ],
    firm: [
        t('Contact confirmed. Carry on — and mind the cordon.'),
        t('Identity logged. Fly clean and we are done here.'),
    ],
    // Spoken the moment the patrol loses a contact it had resolved and opens
    // the sweep — the player hears that they were just shaken, not silently
    // flagged and forgotten.
    lost: [
        t('Signal dropped. Sweeping the last-known position.'),
        t('Contact lost. Fanning out — there is no cover out here.'),
        t('Lost the signature. Sweeping the sector.'),
    ],
};
// A hostile that loses the resolve voices the same beat: it knows the pilot
// slipped away, and it says so before sweeping the last-known spot.
const SEARCH_LOST_HOSTILE_LINES = [
    t("Where'd you go? Rocks will not save you."),
    t('Lost you for a second. I will find you again.'),
    t('Slipped away, did you? Not far enough.'),
];
// A hunter's first hail on a fresh ship victim — the beat before the guns:
// the mark bolts, the pirate closes, then the fight starts (see hailHuntChase).
const PIRATE_CHASE_LINES = {
    timid: [t('Hold course and I will only take the cargo.'), t('Slow down. I want the hold, not the fight.')],
    steady: [t('You are hauling something worth my fuel. Hold course.'), t('Cut your engines. I will inspect the cargo.')],
    aggressive: [t('Run and I will burn your tail off. HOLD COURSE.'), t('Stop or I will shred you, freighter.')],
    flamboyant: [t('A ship like mine deserves a better cargo than yours. Hold still.'), t('Do not make me work for it, freighter.')],
};
// Rescue & distress. A civilian that takes a hit from a hostile NPC raises a
// distress beacon (DISTRESS_WINDOW seconds) that surfaces its position on the
// radar rim and the nav map even beyond the standard sensor horizon, with one
// MAYDAY callout per ship per DISTRESS_CALL_REPEAT. When the player destroys
// or drives off the attacker that was actively hitting that civilian (a hit
// within RESCUE_GRATITUDE_WINDOW), the saved pilot sends thanks and a small
// tip over the comms.
const DISTRESS_WINDOW = 60;
const DISTRESS_CALL_REPEAT = 90;
const RESCUE_GRATITUDE_WINDOW = 60;
const RESCUE_TIP_BASE = 140;
const RESCUE_TIP_RANGE = 240;
const RESCUE_GRATITUDE_LINES = [
    t('You saved my hull back there. Credits are on their way — stay sharp, spacer.'),
    t('That pirate was about to gut my hold. Thank you — really.'),
    t('I owe you one. The tip does not cover it, but it is something.'),
    t('Another few seconds and I was scrap. You fly like you mean it.'),
    t('My cargo is safe because of you. Wired what I could spare.'),
];
// A Concord patrol stops a dark smuggler: hail to stand by, then either the
// smuggler dumps the hold (the evidence hits space and the patrol breaks off)
// or bolts and the patrol gives chase until it gives up and returns to lane.
const PATROL_ARREST_LINES = {
    hail: [
        t('{smuggler}, this is Concord patrol. Cut your engines and hold for inspection.'),
        t('{smuggler}, you are running dark. Stop and stand by for a scan.'),
        t('Dark transponder, {smuggler}. Hold course or I will light you up.'),
        t('Concord patrol to {smuggler}: shut down and prepare to be boarded.'),
    ],
    giveup: [
        t('Lost the signal. Back on the lane.'),
        t('Nothing flagged aboard. Moving on.'),
        t('Slipped away in the dark. Resuming patrol.'),
    ],
};
// What a caught smuggler jettisons when it dumps the hold.
const SMUGGLER_HOLD_POOL = ['arms', 'luxuries', 'electronics', 'medicine'];
// How long a patrol keeps a caught smuggler in chase before giving up and
// returning to its lane, and how far away it can first resolve one.
const PATROL_ARREST_MIN_SECONDS = 14;
const PATROL_ARREST_MAX_SECONDS = 24;
const PATROL_ARREST_RANGE = 500;
// Odds a caught smuggler dumps the hold (the patrol breaks off with the
// evidence) rather than bolting for it.
const SMUGGLER_DUMP_CHANCE = 0.45;
// The player's smuggler bust: a flat fine plus a per-crate levy, and a
// Concord standing hit far heavier than a plain dark catch (PATROL_CATCH_REP).
const SMUGGLE_BUST_FINE = 500;
const SMUGGLE_BUST_PER_UNIT = 60;
const SMUGGLE_BUST_REP = -8;
const PATROL_BUST_LINES = [
    t('Sealed cargo logged. You are flagged, pilot — the cordon will not forget this.'),
    t('Cut engines. That hold is the syndicate\'s, and the fine is yours.'),
    t('Running dark with a sealed manifest. Consider this your one warning — logged and fined.'),
];
// How long "seen working" sticks after the player runs the beam: long enough
// for word to travel, so a follow-on hyperdrive ambush can use the opportunist
// lines instead of a plain mug.
const SEEN_WORKING_SECONDS = 120;
// How far "civilization" reaches: within POLICE_RADIUS of a dock the patrols
// own the lanes and the pirate window shrinks toward nothing.
const POLICE_RADIUS = 1400;
const ENCOUNTER_LOCK_RADIUS = 8000;
const AUTO_DOCK_SPEED = 8;
const DOCK_SAFE_RADIUS = 320;
const COMBAT_CALM_SECONDS = 40;
const HYPERDRIVE_ALIGNMENT = 0.88;
// The dark (transponder-off) visibility band, Star-Sector style: a ship
// running dark is only visible between the floor (200 km — reached at half
// max speed or slower) and the ceiling (400 km — at full throttle). Speed is
// the giveaway: a dark hull coasting slow is nearly invisible, one burning
// hard glows to the whole horizon. The radar's inner ring tracks the pilot's
// own place in that band (see playerVisibilityFraction).
const DARK_VIS_MIN = 200;
const DARK_VIS_MAX = 400;
const DARK_SPEED_FLOOR = 0.5;
// The radar's inner-disc expansion anchor: almost all combat happens inside
// this range (the guns' effective range sits around 140 km), a thin sliver of
// the 1000 km horizon — so drawRadar gives everything inside it extra space
// while the scan ring (500 km) and beyond stay on the linear scale.
const RADAR_COMBAT_RANGE = 200;
// NPCs carry the base sensor fit (no mk2): they resolve a broadcasting ship at
// this range and a dark one only inside its speed-scaled dark band.
const NPC_SENSOR_RANGE = 1000;
// The visual lock, Star-Sector style: a target the pilot has locked stays
// tracked to this range no matter how dark it runs, and only breaks when
// debris or an asteroid blocks the line of sight for this long. Both apply to
// the player's locks — a locked dark pirate is still readable to 1000 km; a
// rock hides it for at most 5 seconds before the lock drops to a last-known
// cross.
const VISUAL_LOCK_RANGE = 1000;
// Lost contacts: a signal the dish just stopped resolving lingers as a cross
// at its last known position — solid for the hold window, then fading out
// over the fade window (15 seconds total).
const LOST_CONTACT_HOLD_SECONDS = 5;
const LOST_CONTACT_FADE_SECONDS = 10;
const LOST_CONTACT_LIFETIME = LOST_CONTACT_HOLD_SECONDS + LOST_CONTACT_FADE_SECONDS;
// How long a ship that just had the pilot resolved keeps the resolve when the
// pilot slips behind a rock while still inside sensor range — breaking visual
// contact is a tracked maneuver (hold the line for a couple of seconds), not
// a one-frame flicker, Star-Sector style. Only occlusion earns the grace; a
// signature that simply vanishes (range) opens the search immediately.
const OCCLUSION_TRACK_SECONDS = 2.5;
// A dark (transponder-off) pilot is far harder to ambush: the pirate tail of
// the encounter table and hyperdrive intercept odds shrink to this fraction
// of their lit value, because nobody sees the ship jump or loiter.
const DARK_ENCOUNTER_MULT = 0.35;
// The threat-awareness multipliers: a hostile contact's broadcast can be
// resolved for targeting at 2.2x the radar horizon (nearest-hostile lock at
// 2.4x) — early warning the pilot can act on. Dark contacts bypass both and
// are only ever resolved inside their speed-scaled dark band (see
// playerSeesShip), unless the pilot holds a visual lock on them.
const THREAT_TARGET_MULT = 2.2;
const THREAT_NEAREST_MULT = 2.4;
// The syndicate berth: an unlicensed (transponder-off) ship cannot use the
// official dock, so it pays a flat handling fee plus a cut of everything in
// the hold. The fee is shown on the syndicate chip before committing.
const SYNDICATE_FEE_FLAT = 150;
const SYNDICATE_FEE_RATE = 0.12;
// The extraction beam broadcasts a working signature (see playerBroadcasting):
// while it actually runs in the asteroid field, pirates on the fringes
// converge on the work on this throttled seeded roll — a dark miner is lit by
// their own beam the whole time they cut.
const BEAM_AMBUSH_CHANCE = 0.3;
const BEAM_AMBUSH_MIN = 9;
const BEAM_AMBUSH_MAX = 15;
// Nav-map contact radii: ships track the full sensor horizon (radarRange, read
// in buildNavigationMapModel) so the map and radar show the same volume;
// resources and wrecks key to the shorter scan ranges instead.
const MAP_RESOURCE_CONTACT_RANGE = 300;
const MAP_RESOURCE_CONTACT_LIMIT = 48;
// Pickups (ejected cargo, combat drops) surface on the nav map like the radar
// shows them — any crate inside the sensor horizon — capped so a busy furball
// doesn't flood the contact list.
const MAP_PICKUP_CONTACT_LIMIT = 24;
// Staked claims surface on the nav map at an extended "from orbit" range so the
// pilot can find their rock without scanning half the field first.
const MAP_CLAIM_CONTACT_RANGE = 1000;
const MAP_WRECK_CONTACT_RANGE = 600;
const MAP_WRECK_CONTACT_LIMIT = 48;
const TARGET_TAP_DRIFT = 14;
// Fixed-timestep simulation: the sim advances in exact 1/60s steps regardless of
// render rate, so combat feel is frame-rate independent and headless probes are
// deterministic. Leftover frame time is carried in simAccumulator and the render
// interpolates between the previous and current sim states by that fraction.
const SIM_STEP = 1 / 60;
const MAX_SIM_STEPS = 6;
// Strafing-run dogfight pacing (WW2 fighter / Privateer jousting): close in, fire,
// blow past, then extend before turning back. No point-blank hugging, no endless circles.
const ATTACK_PASS_RANGE = 55;
// Beyond this range a timid pilot only calls for help when a hit actually
// bites hull — long-range potshots that just graze shields aren't worth a
// MAYDAY. Sits just past the player's max bolt range (~277), so the rule only
// bites when the fight is genuinely long.
const DISTRESS_CLOSE_RANGE = 300;
// How close the player must get before a pilot mutters a proximity line — an
// edge-triggered reaction to being noticed, separate from the timed chatter.
const PROXIMITY_RANGE = 350;
// Neutral/friendly traffic only speaks when the player is genuinely beside
// them — a passing line, not long-distance chatter.
const NEUTRAL_CHAT_RANGE = 50;
// One voice at a time: the minimum gap between pilot lines, so a furball of
// hostiles can't drown the comms bar — each line is fully visible before the
// next lands. Story lines bypass the gate (they mute everything else).
const CHATTER_GAP = 9;
// How often the first scan of a recognized pilot offers a favor (a valuable
// wreck tip or a market contact) instead of just a deferential scan.
const PILOT_FAVOR_CHANCE = 0.35;
// How much more likely a wary pilot (one who escaped after surrendering) is
// to give up on any hull hit than their temperament would normally allow.
const WARY_FLEE_MULTIPLIER = 1.5;
// Marker shown in the target monitor for a ship whose pilot remembers the
// player from a previous surrender (spared or escaped).
const SPARED_MARK = '✦';
const SCAN_COMMODITY_LABELS = {
    electronics: 'ELECTRONICS',
    machinery: 'MACHINERY',
    medicine: 'MEDIGEL',
    scrap: 'SCRAP',
    arms: 'ARMAMENTS',
    water: 'WATER',
    food: 'PROTEIN',
    luxuries: 'LUXURIES',
};
// Which surrender action a beaten pilot picks, weighted by temperament: run,
// jettison cargo or pay and run, or power down (optionally after dumping the
// hold). Timid pilots give up everything; aggressive pilots mostly run and
// almost never power down.
const SURRENDER_WEIGHTS = {
    timid: { flee: 1, eject: 3, pay: 3, down: 2, downEject: 4, downPay: 4 },
    steady: { flee: 3, eject: 2, pay: 2, down: 2, downEject: 1, downPay: 1 },
    aggressive: { flee: 6, eject: 2, pay: 1, down: 1, downEject: 0, downPay: 0 },
    flamboyant: { flee: 2, eject: 4, pay: 3, down: 1, downEject: 2, downPay: 1 },
};
// What a surrendering pilot jettisons, by role: the hold matches what the
// ship would actually be hauling — trade goods from a freighter, ore from a
// miner, looted tech (and the occasional smuggled arms, already a wreck-
// salvage type) from pirates and bounty targets.
const SURRENDER_EJECT_POOLS = {
    trader: ['water', 'food', 'medicine', 'electronics', 'machinery', 'luxuries'],
    miner: ['ore', 'machinery', 'scrap'],
    patrol: ['food', 'water', 'medicine'],
    pirate: ['electronics', 'machinery', 'scrap', 'luxuries'],
    bounty: ['electronics', 'machinery', 'luxuries', 'arms'],
    escort: ['electronics', 'machinery', 'scrap', 'luxuries'],
};
// Miners occasionally strike gold in the field, so a surrendered or destroyed
// miner rarely carries a nugget alongside its ore and scrap.
const MINER_GOLD_DROP_CHANCE = 0.12;
// Hull-appropriate flight tuning: the voxel model decides how a ship flies,
// not just what it looks like. Light interceptors turn on a dime; freighters
// wallow through their turns.
const HULL_FLIGHT_STATS = {
    // hullHalfExtents: the GLB hull's half-size in the ship frame —
    // [starboard X, up Y, forward Z] — measured from the baked models
    // (GLB_SHIP_CONFIG yaw + scale). The player's hard collision is an
    // oriented ellipsoid of these, so the ship bumps at its visible hull.
    kestrel: { speed: 40, afterburnSpeed: 60, turnRate: 1.5, collisionRadius: 1.3, hullHalfExtents: [1.38, 2.37, 6.09] }, // escort — light interceptor
    talon: { speed: 38, afterburnSpeed: 57, turnRate: 1.35, collisionRadius: 1.5, hullHalfExtents: [5.63, 1.37, 5.18] }, // pirate — baseline fighter
    lancer: { speed: 43, afterburnSpeed: 64, turnRate: 1.25, collisionRadius: 2.0, hullHalfExtents: [6.66, 2.02, 6.45] }, // bounty — gunship: fast, slower to turn
    warden: { speed: 36, afterburnSpeed: 0, turnRate: 1.1, collisionRadius: 1.9, hullHalfExtents: [4.8, 2.99, 5.9] }, // patrol — medium
    prospector: { speed: 24, afterburnSpeed: 0, turnRate: 0.9, collisionRadius: 2.2, hullHalfExtents: [3.46, 2.83, 6.7] }, // miner — agile industrial
    'atlas-freighter': { speed: 27, afterburnSpeed: 0, turnRate: 0.55, collisionRadius: 2.9, hullHalfExtents: [4.35, 4.13, 13.4] }, // trader — ponderous
    'concord-frigate': { speed: 18, afterburnSpeed: 0, turnRate: 0.34, collisionRadius: 56.5, hullHalfExtents: [18.73, 22.46, 56.45] },
    'concord-battleship': { speed: 5, afterburnSpeed: 0, turnRate: 0.055, collisionRadius: 565, hullHalfExtents: [301.84, 226.78, 564.92] },
};
const ATTACK_RESET_RANGE = 175;
const ATTACK_SEPARATION = 22;
const ATTACK_FIRE_RANGE = 140;
// Lateral aim offset so a strafing pass is a near-miss beside the target
// (WW2-style deflection joust) rather than a ram through its center.
const ATTACK_PASS_STANDOFF = 15;
const ATTACK_PASS_STANDOFF_FLOOR = 10;
// Ship-to-ship avoidance: when another ship (usually the player) is closing on a
// line that will cross within a few units, the pilot throws in a decisive evasive
// turn rather than riding the line into a collision. The separation threshold sits
// below the intended near-miss pass standoff so normal jousts are unaffected.
const SHIP_AVOID_SEPARATION = 10;
const SHIP_AVOID_HORIZON = 4.0;
const SHIP_AVOID_RANGE = 240;
const SHIP_AVOID_STEER = 1.8;
// Cover-seeking: a damaged ship with drained shields ducks behind a big rock
// or wreck to let shields regenerate before breaking out for another joust.
const COVER_MIN_RADIUS = 42;
const COVER_SEEK_RANGE = 720;
const COVER_ARRIVE_DIST = 48;
const COVER_RECHARGE_SHIELD = 0.8;
const COVER_HOLD_MAX = 9;
const vec = (value, out = new THREE.Vector3()) => out.set(value[0], value[1], value[2]);
const tuple = (value) => [value.x, value.y, value.z];
const quat = (value, out = new THREE.Quaternion()) => out.set(value[0], value[1], value[2], value[3]);
const quatTuple = (value) => [value.x, value.y, value.z, value.w];
// In-place variants: entities keep their transform arrays for the whole
// lifetime now, so writes mutate instead of replacing (zero allocation).
const tupleInto = (dst, value) => {
    dst[0] = value.x;
    dst[1] = value.y;
    dst[2] = value.z;
    return dst;
};
const quatTupleInto = (dst, value) => {
    dst[0] = value.x;
    dst[1] = value.y;
    dst[2] = value.z;
    dst[3] = value.w;
    return dst;
};
// Allocation-free segment/sphere intersection: scalar math only, no Vector3
// temporaries, because this runs over hundreds of field obstacles per frame.
const segmentSphereHit = (start, end, center, radius) => {
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const dz = end.z - start.z;
    const ox = start.x - center.x;
    const oy = start.y - center.y;
    const oz = start.z - center.z;
    const a = dx * dx + dy * dy + dz * dz;
    if (a < 1e-8)
        return undefined;
    const b = 2 * (ox * dx + oy * dy + oz * dz);
    const c = ox * ox + oy * oy + oz * oz - radius * radius;
    const discriminant = b * b - 4 * a * c;
    if (discriminant < 0)
        return undefined;
    const root = Math.sqrt(discriminant);
    const t1 = (-b - root) / (2 * a);
    const t2 = (-b + root) / (2 * a);
    if (t1 >= 0 && t1 <= 1)
        return t1;
    if (t2 >= 0 && t2 <= 1)
        return t2;
    return undefined;
};
// Segment against a ship's oriented ellipsoid. Fighters keep their measured
// hull envelope and capital ships gain accurate kilometre-scale hit detection
// without the enormous empty corners of a bounding sphere.
const segmentShipHullHit = (start, end, ship, halfExtents, padding = 0) => {
    const qx = ship.rotation[0];
    const qy = ship.rotation[1];
    const qz = ship.rotation[2];
    const qw = ship.rotation[3];
    const m00 = 1 - 2 * (qy * qy + qz * qz);
    const m01 = 2 * (qx * qy - qz * qw);
    const m02 = 2 * (qx * qz + qy * qw);
    const m10 = 2 * (qx * qy + qz * qw);
    const m11 = 1 - 2 * (qx * qx + qz * qz);
    const m12 = 2 * (qy * qz - qx * qw);
    const m20 = 2 * (qx * qz - qy * qw);
    const m21 = 2 * (qy * qz + qx * qw);
    const m22 = 1 - 2 * (qx * qx + qy * qy);
    const sx0 = start.x - ship.position[0];
    const sy0 = start.y - ship.position[1];
    const sz0 = start.z - ship.position[2];
    const ex0 = end.x - ship.position[0];
    const ey0 = end.y - ship.position[1];
    const ez0 = end.z - ship.position[2];
    const hx = Math.max(0.01, halfExtents[0] + padding);
    const hy = Math.max(0.01, halfExtents[1] + padding);
    const hz = Math.max(0.01, halfExtents[2] + padding);
    const sx = (m00 * sx0 + m10 * sy0 + m20 * sz0) / hx;
    const sy = (m01 * sx0 + m11 * sy0 + m21 * sz0) / hy;
    const sz = (m02 * sx0 + m12 * sy0 + m22 * sz0) / hz;
    const ex = (m00 * ex0 + m10 * ey0 + m20 * ez0) / hx;
    const ey = (m01 * ex0 + m11 * ey0 + m21 * ez0) / hy;
    const ez = (m02 * ex0 + m12 * ey0 + m22 * ez0) / hz;
    const dx = ex - sx;
    const dy = ey - sy;
    const dz = ez - sz;
    const c = sx * sx + sy * sy + sz * sz - 1;
    if (c <= 0)
        return 0;
    const a = dx * dx + dy * dy + dz * dz;
    if (a < 1e-8)
        return undefined;
    const b = 2 * (sx * dx + sy * dy + sz * dz);
    const discriminant = b * b - 4 * a * c;
    if (discriminant < 0)
        return undefined;
    const root = Math.sqrt(discriminant);
    const near = (-b - root) / (2 * a);
    const far = (-b + root) / (2 * a);
    if (near >= 0 && near <= 1)
        return near;
    if (far >= 0 && far <= 1)
        return far;
    return undefined;
};
// Allocation-free segment/OBB intersection for laser and hyperdrive line of
// sight. Graveyard pieces are rotated boxes; a bounding sphere can miss a flat
// face at its corners or make the beam pass through visible debris. The box
// half-extents mirror the rendered piece exactly, so the padding is only a tiny
// epsilon — enough to keep a muzzle resting on a face from self-hitting, not
// an inflation that blocks shots in empty space next to the debris.
const segmentBoxHit = (start, end, obstacle, padding = 0.05) => {
    const box = obstacle.box;
    const qx = box.qx;
    const qy = box.qy;
    const qz = box.qz;
    const qw = box.qw;
    const m00 = 1 - 2 * (qy * qy + qz * qz);
    const m01 = 2 * (qx * qy - qz * qw);
    const m02 = 2 * (qx * qz + qy * qw);
    const m10 = 2 * (qx * qy + qz * qw);
    const m11 = 1 - 2 * (qx * qx + qz * qz);
    const m12 = 2 * (qy * qz - qx * qw);
    const m20 = 2 * (qx * qz - qy * qw);
    const m21 = 2 * (qy * qz + qx * qw);
    const m22 = 1 - 2 * (qx * qx + qy * qy);
    const startX = start.x - obstacle.x;
    const startY = start.y - obstacle.y;
    const startZ = start.z - obstacle.z;
    const endX = end.x - obstacle.x;
    const endY = end.y - obstacle.y;
    const endZ = end.z - obstacle.z;
    const sx = m00 * startX + m10 * startY + m20 * startZ;
    const sy = m01 * startX + m11 * startY + m21 * startZ;
    const sz = m02 * startX + m12 * startY + m22 * startZ;
    const ex = m00 * endX + m10 * endY + m20 * endZ;
    const ey = m01 * endX + m11 * endY + m21 * endZ;
    const ez = m02 * endX + m12 * endY + m22 * endZ;
    const dx = ex - sx;
    const dy = ey - sy;
    const dz = ez - sz;
    const hx = box.hx + padding;
    const hy = box.hy + padding;
    const hz = box.hz + padding;
    // A projectile that starts inside a piece is already past that blocker;
    // ignore the exit face so a muzzle touching debris does not self-hit.
    if (Math.abs(sx) <= hx && Math.abs(sy) <= hy && Math.abs(sz) <= hz)
        return undefined;
    let near = 0;
    let far = 1;
    if (Math.abs(dx) < 1e-8) {
        if (sx < -hx || sx > hx)
            return undefined;
    }
    else {
        let t1 = (-hx - sx) / dx;
        let t2 = (hx - sx) / dx;
        if (t1 > t2) {
            const swap = t1;
            t1 = t2;
            t2 = swap;
        }
        near = Math.max(near, t1);
        far = Math.min(far, t2);
        if (near > far)
            return undefined;
    }
    if (Math.abs(dy) < 1e-8) {
        if (sy < -hy || sy > hy)
            return undefined;
    }
    else {
        let t1 = (-hy - sy) / dy;
        let t2 = (hy - sy) / dy;
        if (t1 > t2) {
            const swap = t1;
            t1 = t2;
            t2 = swap;
        }
        near = Math.max(near, t1);
        far = Math.min(far, t2);
        if (near > far)
            return undefined;
    }
    if (Math.abs(dz) < 1e-8) {
        if (sz < -hz || sz > hz)
            return undefined;
    }
    else {
        let t1 = (-hz - sz) / dz;
        let t2 = (hz - sz) / dz;
        if (t1 > t2) {
            const swap = t1;
            t1 = t2;
            t2 = swap;
        }
        near = Math.max(near, t1);
        far = Math.min(far, t2);
        if (near > far)
            return undefined;
    }
    return near >= 0 && near <= 1 ? near : undefined;
};
// Allocation-free segment/mesh intersection for laser and beam line of sight
// against asteroids. The rock's deformed-icosahedron collision mesh (shared
// with the renderer and hard collision) is the exact visible surface, so a
// shot is blocked only where rock is actually drawn — the old enclosing OBB
// stuck out past the silhouette at its corners (up to ~1.56× on a round rock)
// and ate shots in open space. The segment is transformed into the rock's
// local frame (translate + inverse rotation), then Möller–Trumbore tests each
// triangle; t is preserved by the rigid transform.
const segmentMeshHit = (start, end, obstacle) => {
    const mesh = obstacle.meshVerts;
    const indices = obstacle.meshIndices;
    if (!mesh || !indices)
        return undefined;
    // Cheap reject: the segment must pass within the rock's bounding reach
    // (losRadius is the OBB corner reach, which contains the whole mesh).
    // Use the closest-approach distance, NOT segmentSphereHit: that helper
    // returns undefined when BOTH endpoints are inside the sphere (both roots
    // fall outside [0, 1]) — exactly the case once a projectile's step-start
    // enters the rock's envelope. Treating that as a miss culled every shot
    // from the moment it entered the bounding reach (~3.4x the visible
    // surface along a diagonal) and let bolts sail clean through the rock.
    const ocx = start.x - obstacle.x;
    const ocy = start.y - obstacle.y;
    const ocz = start.z - obstacle.z;
    const sdx = end.x - start.x;
    const sdy = end.y - start.y;
    const sdz = end.z - start.z;
    const segLenSq = sdx * sdx + sdy * sdy + sdz * sdz;
    let closestSq;
    if (segLenSq < 1e-12) {
        closestSq = ocx * ocx + ocy * ocy + ocz * ocz;
    }
    else {
        const tc = Math.max(0, Math.min(1, -(ocx * sdx + ocy * sdy + ocz * sdz) / segLenSq));
        const ccx = ocx + sdx * tc;
        const ccy = ocy + sdy * tc;
        const ccz = ocz + sdz * tc;
        closestSq = ccx * ccx + ccy * ccy + ccz * ccz;
    }
    if (closestSq > obstacle.losRadius * obstacle.losRadius)
        return undefined;
    const box = obstacle.box;
    const qx = box.qx;
    const qy = box.qy;
    const qz = box.qz;
    const qw = box.qw;
    // World -> rock-local rotation (the same matrix segmentBoxHit builds).
    const m00 = 1 - 2 * (qy * qy + qz * qz);
    const m01 = 2 * (qx * qy - qz * qw);
    const m02 = 2 * (qx * qz + qy * qw);
    const m10 = 2 * (qx * qy + qz * qw);
    const m11 = 1 - 2 * (qx * qx + qz * qz);
    const m12 = 2 * (qy * qz - qx * qw);
    const m20 = 2 * (qx * qz - qy * qw);
    const m21 = 2 * (qy * qz + qx * qw);
    const m22 = 1 - 2 * (qx * qx + qy * qy);
    const sx = m00 * (start.x - obstacle.x) + m10 * (start.y - obstacle.y) + m20 * (start.z - obstacle.z);
    const sy = m01 * (start.x - obstacle.x) + m11 * (start.y - obstacle.y) + m21 * (start.z - obstacle.z);
    const sz = m02 * (start.x - obstacle.x) + m12 * (start.y - obstacle.y) + m22 * (start.z - obstacle.z);
    const ex = m00 * (end.x - obstacle.x) + m10 * (end.y - obstacle.y) + m20 * (end.z - obstacle.z);
    const ey = m01 * (end.x - obstacle.x) + m11 * (end.y - obstacle.y) + m21 * (end.z - obstacle.z);
    const ez = m02 * (end.x - obstacle.x) + m12 * (end.y - obstacle.y) + m22 * (end.z - obstacle.z);
    const dx = ex - sx;
    const dy = ey - sy;
    const dz = ez - sz;
    // A projectile starting inside the rock's envelope is already past the
    // blocker (a muzzle touching rock must not self-hit). The envelope is the
    // rock's INSCRIBED sphere (minReach), NOT the oriented box: the box's
    // corner reach overhangs the visible surface by up to ~2x along diagonals
    // (half-extents are 0.9x the mesh axes, but hypot(hx,hy,hz) spans the
    // corners), so a box test declared approaching shots "already past" once
    // their step-start entered the overhang and let them sail through the
    // rock. Any point within minReach is provably inside the closed mesh;
    // points beyond it are still tested against the real surface.
    if (Number.isFinite(obstacle.minReach) && ocx * ocx + ocy * ocy + ocz * ocz <= obstacle.minReach * obstacle.minReach)
        return undefined;
    let best;
    for (let t = 0; t < indices.length; t += 3) {
        const i0 = indices[t] * 3;
        const i1 = indices[t + 1] * 3;
        const i2 = indices[t + 2] * 3;
        const ax = mesh[i0];
        const ay = mesh[i0 + 1];
        const az = mesh[i0 + 2];
        const bx = mesh[i1];
        const by = mesh[i1 + 1];
        const bz = mesh[i1 + 2];
        const cx = mesh[i2];
        const cy = mesh[i2 + 1];
        const cz = mesh[i2 + 2];
        const e1x = bx - ax;
        const e1y = by - ay;
        const e1z = bz - az;
        const e2x = cx - ax;
        const e2y = cy - ay;
        const e2z = cz - az;
        const hx = dy * e2z - dz * e2y;
        const hy = dz * e2x - dx * e2z;
        const hz = dx * e2y - dy * e2x;
        const det = e1x * hx + e1y * hy + e1z * hz;
        if (det > -1e-9 && det < 1e-9)
            continue;
        const invDet = 1 / det;
        const ox = sx - ax;
        const oy = sy - ay;
        const oz = sz - az;
        const u = invDet * (ox * hx + oy * hy + oz * hz);
        if (u < 0 || u > 1)
            continue;
        // Möller–Trumbore: q = s × e1 (not e2), and t = f * (e2 · q). The two
        // are easy to swap, and doing so both misses real surface hits and
        // fabricates phantom ones.
        const qx2 = oy * e1z - oz * e1y;
        const qy2 = oz * e1x - ox * e1z;
        const qz2 = ox * e1y - oy * e1x;
        const v = invDet * (dx * qx2 + dy * qy2 + dz * qz2);
        if (v < 0 || u + v > 1)
            continue;
        const tt = invDet * (e2x * qx2 + e2y * qy2 + e2z * qz2);
        if (tt >= 0 && tt <= 1 && (best === undefined || tt < best))
            best = tt;
    }
    return best;
};
const segmentRadialBandAt = (s0, s1, d0, d1, t, innerSq, outerSq) => {
    const first = s0 + d0 * t;
    const second = s1 + d1 * t;
    const radiusSq = first * first + second * second;
    return radiusSq >= innerSq && radiusSq <= outerSq;
};
const segmentRadialBandRoot = (s0, s1, d0, d1, coefficientA, coefficientB, coefficientC, targetSq, t0, t1, innerSq, outerSq) => {
    if (Math.abs(coefficientA) < 1e-10)
        return undefined;
    const discriminant = coefficientB * coefficientB - 4 * coefficientA * (coefficientC - targetSq);
    if (discriminant < 0)
        return undefined;
    const root = Math.sqrt(discriminant);
    const first = (-coefficientB - root) / (2 * coefficientA);
    const second = (-coefficientB + root) / (2 * coefficientA);
    if (first >= t0 && first <= t1 && segmentRadialBandAt(s0, s1, d0, d1, first, innerSq, outerSq))
        return first;
    if (second >= t0 && second <= t1 && segmentRadialBandAt(s0, s1, d0, d1, second, innerSq, outerSq))
        return second;
    return undefined;
};
const segmentEngineShellAt = (sx, sy, sz, dx, dy, dz, t, radiusCenter, radiusSlope, halfHeight, padding) => {
    const y = sy + dy * t;
    if (y < -halfHeight - padding || y > halfHeight + padding)
        return false;
    const surfaceY = clamp(y, -halfHeight, halfHeight);
    const radius = radiusCenter + radiusSlope * surfaceY;
    return Math.abs(Math.hypot(sx + dx * t, sz + dz * t) - radius) <= padding;
};
const segmentEngineShellRoot = (sx, sy, sz, dx, dy, dz, radiusCenter, radiusSlope, halfHeight, padding, offset, t0, t1) => {
    const radiusAtStart = radiusCenter + radiusSlope * sy + offset;
    const radiusDelta = radiusSlope * dy;
    const coefficientA = dx * dx + dz * dz - radiusDelta * radiusDelta;
    const coefficientB = 2 * (sx * dx + sz * dz - radiusAtStart * radiusDelta);
    const coefficientC = sx * sx + sz * sz - radiusAtStart * radiusAtStart;
    if (Math.abs(coefficientA) < 1e-10) {
        if (Math.abs(coefficientB) < 1e-10)
            return undefined;
        const root = -coefficientC / coefficientB;
        return root >= t0 && root <= t1 && segmentEngineShellAt(sx, sy, sz, dx, dy, dz, root, radiusCenter, radiusSlope, halfHeight, padding) ? root : undefined;
    }
    const discriminant = coefficientB * coefficientB - 4 * coefficientA * coefficientC;
    if (discriminant < 0)
        return undefined;
    const root = Math.sqrt(discriminant);
    const first = (-coefficientB - root) / (2 * coefficientA);
    const second = (-coefficientB + root) / (2 * coefficientA);
    if (first >= t0 && first <= t1 && segmentEngineShellAt(sx, sy, sz, dx, dy, dz, first, radiusCenter, radiusSlope, halfHeight, padding))
        return first;
    if (second >= t0 && second <= t1 && segmentEngineShellAt(sx, sy, sz, dx, dy, dz, second, radiusCenter, radiusSlope, halfHeight, padding))
        return second;
    return undefined;
};
export class GameSession {
    ui;
    onQuit;
    save;
    renderer;
    input;
    audio = new AudioManager();
    asteroids;
    graveyard;
    wreckNodes;
    ships = [];
    projectiles = [];
    pickups = [];
    // Per-ship chat memory: the last pool key and line index used, so chatter
    // rotates through the pools instead of repeating the same line back to
    // back, and the one-shot first-contact line only lands once per ship.
    pilotLineHistory = new Map();
    // Story-mission seam: while a story line is up (storyLineUntil in the
    // future), every chatter emitter returns before rolling, so no combat
    // lines, mutters, taunts, or distress calls land and the seeded roll
    // streams stay untouched — chatter resumes where it left off.
    storyLineUntil;
    // Global one-voice gate: the world time at which the next pilot line may
    // land (see chatterOpen/sayPilotLine).
    nextChatterAt;
    // Flat component stores: projectile/pickup transforms live in Float32Array
    // channels keyed by slot; the renderer reads the same channels (no sync
    // arrays, no per-step tuple() allocations, no shared scratch objects).
    projStore = new EntityStore(256);
    pickupStore = new EntityStore(64);
    // Cached effective ship stats: getEffectiveShipStats allocates a ~15-key
    // object on every call, and it's called 10+ times per frame. Invalidate
    // via _statsDirty when equipment or shipId changes (only at dock).
    _cachedStats;
    _statsDirty = true;
    extractionCarry = new Map();
    tmpA = new THREE.Vector3();
    tmpB = new THREE.Vector3();
    tmpC = new THREE.Vector3();
    tmpQ = new THREE.Quaternion();
    tmpQ2 = new THREE.Quaternion();
    // Player orientation must not share the collision quaternion scratch:
    // resolvePlayerCollisions loads each debris box rotation into tmpQ.
    tmpPlayerOrientation = new THREE.Quaternion();
    tmpEuler = new THREE.Euler();
    // Scratch vectors/matrices reused across the per-ship AI so the flight loop
    // allocates almost nothing on the hot path (GC pauses were janking combat).
    tmpD = new THREE.Vector3();
    tmpE = new THREE.Vector3();
    tmpF = new THREE.Vector3();
    tmpG = new THREE.Vector3();
    tmpH = new THREE.Vector3();
    tmpI = new THREE.Vector3();
    tmpJ = new THREE.Vector3();
    tmpK = new THREE.Vector3();
    tmpL = new THREE.Vector3();
    tmpM4 = new THREE.Matrix4();
    tmpAvoidance = new THREE.Vector3();
    tmpShipAvoid = new THREE.Vector3();
    // NPC navigation controller output/goal scratch (npcNav.js). Lazily
    // created in Object.create-based headless harnesses via the callers.
    tmpNavDesired = new THREE.Vector3();
    tmpNavGoal = new THREE.Vector3();
    // Race steering and slipstream scratches. Keep these separate from the
    // player/collision vectors: updateRace runs after updatePlayer, while the
    // draft controller runs immediately before it.
    tmpRaceGoal = {
        x: NaN,
        y: NaN,
        z: NaN,
        0: NaN,
        1: NaN,
        2: NaN,
        set(x, y, z) {
            this.x = x;
            this.y = y;
            this.z = z;
            this[0] = x;
            this[1] = y;
            this[2] = z;
            return this;
        },
        copy(value) {
            return this.set(value?.x ?? value?.[0] ?? 0, value?.y ?? value?.[1] ?? 0, value?.z ?? value?.[2] ?? 0);
        },
    };
    tmpRaceGoalVector = new THREE.Vector3();
    tmpRaceSteer = new THREE.Vector3();
    tmpRaceForward = new THREE.Vector3();
    tmpRaceGathering = {
        id: '',
        position: [0, 0, 0],
        direction: [0, 0, 1],
        radius: 1,
        arrivalRadius: 2,
    };
    // Dedicated scratch for the collision normal: the player position vector in
    // updatePlayer aliases this.tmpA, so writing the normal into tmpA used to
    // overwrite the ship's position with a unit vector (teleport to open space).
    tmpCollide = new THREE.Vector3();
    // Entry-clearance scratches. These are separate from the live flight and
    // collision vectors because hyperdrive arrival can run inside updatePlayer.
    tmpEntryAnchor = new THREE.Vector3();
    tmpEntryCandidate = new THREE.Vector3();
    tmpEntryDirection = new THREE.Vector3();
    tmpEntryPreferredDirection = new THREE.Vector3();
    tmpEntryNormal = new THREE.Vector3();
    tmpEntryLocal = new THREE.Vector3();
    tmpEntryLocalDirection = new THREE.Vector3();
    tmpAudioLocal = new THREE.Vector3();
    tmpAudioOrientation = new THREE.Quaternion();
    tmpEntryQuaternion = new THREE.Quaternion();
    tmpEntryInverseQuaternion = new THREE.Quaternion();
    // Projectile/pickup step scratches (store reads/writes). Owned by
    // updateProjectiles/updatePickups so they never alias live sim state.
    tmpP0 = new THREE.Vector3();
    tmpP1 = new THREE.Vector3();
    tmpP2 = new THREE.Vector3();
    tmpP3 = new THREE.Vector3();
    tmpP4 = new THREE.Vector3();
    tmpP5 = new THREE.Vector3();
    // Over-penetration sweep anchor: holds the mid-flight restart position
    // while a piercing slug re-sweeps the rest of its step (updateProjectiles).
    tmpP6 = new THREE.Vector3();
    // Radar/HUD scratch: buildHudModel runs after sim steps, so these never
    // alias live flight/collision vectors.
    tmpRadarPlayer = new THREE.Vector3();
    tmpRadarInv = new THREE.Quaternion();
    tmpRadarRel = new THREE.Vector3();
    tmpRadarPos = new THREE.Vector3();
    // updateShips chatter scratch: canSee/lineBlocked never touch these.
    tmpShipPlayer = new THREE.Vector3();
    tmpShipPos = new THREE.Vector3();
    frameId = 0;
    lastFrame = performance.now();
    simAccumulator = 0;
    active = true;
    autopilot = false;
    galaxyJump = null;
    armedJumpPointId = null;
    armedJumpPointSide = 0;
    afterburning = false;
    utilityActive = false;
    utilityReadout = '';
    monitorStatus = '';
    monitorStatusUntil = 0;
    ownMonitorStatus = '';
    ownMonitorStatusUntil = 0;
    // Transient identity-card line: hyperdrive vector/arrival/break messages
    // land on the drive card's status line instead of the toast stack.
    hyperdriveStatus = '';
    hyperdriveStatusUntil = 0;
    utilitySoundCooldown = 0;
    gunCooldown = 0;
    missileCooldown = 0;
    activeGroupEmpty = false;
    playerShieldDelay = 0;
    collisionMessageCooldown = 0;
    hintCooldown = 0;
    scanCooldown = 0;
    encounterCounter = 0;
    stationTrafficCounter = 0;
    nextCapitalTrafficCheckAt = 0;
    capitalSpawnedHomes = new Set();
    // The last moment the player ran the mining/salvage beam, so opportunist
    // encounters can tell whether the pilot has been visibly at work recently.
    lastExtractionAt = undefined;
    // A patrol greeted the player and is waiting for a reply (see
    // maybeNeutralChatter / patrolReply).
    patrolReplyWindow = undefined;
    // When the extraction beam may next draw pirates in the field (see
    // updateDynamicEncounters). Zero while the beam is off; a standoff keeps
    // pushing it forward so the beam can't double-ambush a pilot mid-deal.
    beamAmbushNextAt = 0;
    // How long the player's work stays "fresh word" so a follow-on hyperdrive
    // ambush can use the opportunist lines.
    seenWorkingUntil = 0;
    jumpCounter = 0;
    interceptCounter = 0;
    hyperdriveEncounterAt = null;
    hyperdriveEncounterCooldownUntil = 0;
    hyperdriveInterceptIds = new Set();
    hyperdriveFx = 'none';
    hyperdriveSpoolStartedAt = 0;
    hyperdriveFxUntil = 0;
    tmpGateNormal = new THREE.Vector3();
    tmpGateRelative = new THREE.Vector3();
    // Throttle the ship was holding when the current jump started; restored on
    // every hyperdrive exit so a jump never silently changes the cruise speed.
    hyperdriveReturnThrottle = 0.35;
    lastCombatAt = -Infinity;
    entityCounter = 0;
    projectileCounter = 0;
    pickupCounter = 0;
    nextEncounterAt = 0;
    lastAutosaveAt = 0;
    lastMissionCheck = 0;
    lastHudUpdate = 0;
    deathTimer = 0;
    salvageAmbushTriggered = new Set();
    claimDisputesTriggered = new Set();
    npcCollisionCooldown = 0;
    targetClipUntil = 0;
    fpsAccumulator = 0;
    obstacleGrid = null;
    obstacleSegmentGrid = null;
    obstacleGridInstance = undefined;
    obstacleGridBuiltAt = -Infinity;
    obstacleCellSize = 256;
    obstacleQueryStamp = 0;
    fpsFrames = 0;
    qualityScale = 1;
    activeInstanceId;
    targetPointer;
    arena = null;
    activeRace = null;
    // Race slipstream assist is computed before updatePlayer and consumed by
    // that controller without changing the player's ship-class statistics.
    raceDraftStrength = 0;
    raceDraftFuelMultiplier = 1;
    // Emergent interactions (mid-flight mugs, smuggler flags) only run in the
    // live game — headless combat probes build sessions via Object.create and
    // never set this, so their pirates always fight straight (see shipAI.js).
    emergentMugs = true;
    constructor(save, ui, onQuit, arena = null, tiltGranted = false) {
        this.arena = arena;
        this.ui = ui;
        this.onQuit = onQuit;
        this.save = save;
        if (!hasSystem(this.save.player.systemId))
            this.save.player.systemId = LOCATIONS[this.save.player.dockedAt]?.systemId ?? 'helios-verge';
        // GameSession is also constructed directly by lightweight probes and
        // by older callers that bypass save hydration. Normalize once at the
        // runtime boundary so every flight path can treat hardpoints as the
        // source of truth instead of branching on the old equipment array.
        normalizeOutfitting(this.save.player);
        const activeShipId = SHIPS[this.save.player.shipId] ? this.save.player.shipId : 'wayfarer';
        this.save.player.shipId = activeShipId;
        this.save.player.outfitting = collapseOutfittingToSingleShip(this.save.player, activeShipId);
        this.save.player.ownedShips = [activeShipId];
        delete this.save.player.shipStates;
        normalizeOutfitting(this.save.player);
        this.save.player.equipment = projectLegacyEquipment(this.save.player, this.save.player.outfitting);
        const initialStats = getEffectiveShipStats(this.save.player);
        if (Number.isFinite(Number(this.save.player.armor)))
            this.save.player.hull = clamp(combinedHullIntegrity(this.save.player.hull, this.save.player.armor), 0, initialStats.hull);
        delete this.save.player.armor;
        this.save.player.energy = normalizeEnergy(this.save.player.energy, initialStats.energyCapacity);
        // Purge fleet-era snapshots at the runtime boundary too, so direct
        // debug/probe sessions follow the same one-ship rule as hydrated saves.
        this.ensureShipStates();
        this.syncActiveShipState();
        this.ensureRuntimeFireGroups();
        // Refresh the compatibility weapon projection immediately. This keeps
        // a genuinely empty canonical loadout from inheriting a stale/pulse
        // weaponId before the first HUD tick or trigger edge.
        this.syncWeaponProjection();
        this.ui.attachSave(save);
        this.asteroids = generateAsteroidField(save.world.seed, save.world.depletedAsteroids, save.world.scannedNodes);
        this.regionalFields = new Map(REGIONAL_ASTEROID_FIELD_IDS.map((id) => [id, generateRegionalAsteroidField(save.world.seed, id)]));
        this.graveyard = generateGraveyardPieces(save.world.seed);
        this.wreckNodes = generateWreckNodes(save.world.seed, save.world.depletedWrecks, save.world.scannedNodes);
        this.renderer = new SpaceRenderer(ui.viewport, save.world.seed, this.asteroids, this.graveyard, this.wreckNodes, save.settings.quality, save.player.systemId, this.regionalFields);
        this.renderer.setSystem?.(save.player.systemId);
        this.renderer.canvas.addEventListener('pointerdown', this.onSpacePointerDown, { passive: true });
        this.renderer.canvas.addEventListener('pointerup', this.onSpacePointerUp);
        this.renderer.canvas.addEventListener('pointercancel', this.onSpacePointerCancel);
        this.input = new InputManager(ui.root);
        this.input.configureTilt(save.settings);
        // Tilt steering auto-enables for players who asked for it — returning
        // players with a saved neutral, or anyone who granted gyroscope permission
        // from the title screen this session. New players fall back to the stick
        // until they tap ENABLE TILT STEER (which also calibrates neutral).
        if (save.settings.steering !== 'stick' && (save.settings.tiltNeutral || tiltGranted)) {
            void this.input.enableTilt(tiltGranted).then((active) => {
                if (active) {
                    if (!save.settings.tiltNeutral) {
                        save.settings.tiltNeutral = this.input.calibrateTilt();
                    }
                    save.settings.steering = 'tilt';
                    this.syncActiveShipState();
                    saveGame(save);
                    this.ui.setTouchSteering('tilt');
                }
                else {
                    // Permission refused (or revoked since the last session):
                    // correct the persisted setting too, so the pause menu's
                    // steering select doesn't claim Tilt while the stick is
                    // actually driving the ship.
                    save.settings.steering = 'stick';
                    this.syncActiveShipState();
                    saveGame(save);
                    this.ui.setTouchSteering('stick');
                }
            });
        }
        else {
            // No saved neutral and no fresh grant: tilt can't engage, so run
            // the stick and keep the persisted setting honest — otherwise the
            // pause menu shows Tilt selected while the stick steers.
            if (save.settings.steering !== 'stick') {
                save.settings.steering = 'stick';
                this.syncActiveShipState();
                saveGame(save);
            }
            this.ui.setTouchSteering('stick');
        }
        this.audio.setVolumes(save.settings.music, save.settings.effects);
        this.audio.setStationMode(Boolean(save.player.dockedAt));
        this.ui.setTouchScale(save.settings.touchScale);
        this.nextEncounterAt = save.world.time + 12 + seededRandom(`${save.world.seed}:next-encounter:${Math.floor(save.world.time)}`)() * 14;
        if (!arena && save.world.pendingJump)
            this.finishGalaxyJump(save.world.pendingJump, false, false);
        if (arena)
            this.setupArena(arena);
        else {
            this.spawnInitialTraffic();
        }
        this.updateActiveInstance(true);
        this.restoreViewState();
        this.restoreActiveRace();
        this.frameId = requestAnimationFrame(this.frame);
    }
    currentNavLocationIds() {
        return navLocationIdsForSystem(this.save.player.systemId);
    }
    currentDockLocationIds() {
        return dockLocationIdsForSystem(this.save.player.systemId);
    }
    currentActivityLocationIds() {
        return activityLocationIdsForSystem(this.save.player.systemId);
    }
    dockHasService(service) {
        const dock = this.save.player.dockedAt;
        return Boolean(dock && LOCATIONS[dock]?.services?.[service]);
    }
    // Fleet-era per-hull snapshots are obsolete: a career owns exactly one
    // ship, so the live resource fields are the only source of truth.
    ensureShipStates() {
        delete this.save.player.shipStates;
        return {};
    }
    syncActiveShipState() {
        delete this.save.player.shipStates;
    }
    initializeCommissionedShipState(stats) {
        const player = this.save.player;
        player.shield = stats.shield;
        player.hull = stats.hull;
        player.energy = stats.energyCapacity;
        player.fuel = stats.fuel;
        player.missiles = stats.missileCapacity;
        player.ammo = Object.fromEntries(Object.entries(AMMO_CAPACITY).map(([ammoId, capacity]) => [ammoId, capacity]));
    }
    resetArenaWeaponState() {
        const player = this.save.player;
        player.energy = this.playerStats().energyCapacity;
        player.ammo ??= {};
        for (const [ammoId, capacity] of Object.entries(AMMO_CAPACITY))
            player.ammo[ammoId] = capacity;
        this.gunCooldown = 0;
        this.missileCooldown = 0;
        this.pdcHeat = 0;
        this.pdcVentUntil = 0;
        this.pdcVentAnnounced = false;
        this.pdcInterceptAt = 0;
        this.activeGroupEmpty = false;
        this.ownMonitorStatus = '';
        this.ownMonitorStatusUntil = 0;
    }
    persistSave() {
        this.syncActiveShipState();
        return saveGame(this.save);
    }
    setupArena(config, announce = true) {
        // Every arena attempt is a clean sortie: restore all weapon pools and
        // clear session-only heat/cooldowns before spawning the player or
        // hostiles. Career snapshots are untouched because arena saves are
        // disposable.
        this.resetArenaWeaponState();
        const environment = config.environment ?? 'open';
        const scenario = config.scenario ?? '1v1';
        const centers = {
            open: new THREE.Vector3(0, 0, 0),
            'asteroid-field': vec(LOCATIONS.shardbelt.position),
            'debris-field': vec(LOCATIONS['mourning-line'].position),
        };
        const instanceId = environment === 'asteroid-field' ? 'shardbelt' : environment === 'debris-field' ? 'mourning-line' : undefined;
        const center = centers[environment]?.clone() ?? centers.open.clone();
        // Field combat sims begin in a protected pocket inside the cloud so
        // the player sees the relict scene immediately. Hyperdrive arrivals
        // still use the outer edge path below; this exception is only for the
        // deliberate arena staging start.
        if (instanceId) {
            if (environment === 'debris-field')
                this.setFieldArenaPosition(center, instanceId);
            else
                this.setFieldEntryPosition(center, instanceId, FORWARD);
        }
        const player = this.save.player;
        const stats = getEffectiveShipStats(player);
        player.dockedAt = undefined;
        // The arena undocks the player (a fresh save starts docked), so the
        // engine must come back on — otherwise the silo's stationMode leaves
        // the arena flight silent until the first restart.
        this.audio.setStationMode(false);
        player.position = tuple(center);
        // The interior debris arena faces the normal -Z scene direction. The
        // edge-start asteroid arena still turns inward from its boundary.
        if (instanceId && environment !== 'debris-field') {
            const inward = this.tmpEntryDirection.copy(FORWARD).multiplyScalar(-1);
            player.rotation = quatTuple(this.tmpQ.setFromUnitVectors(FORWARD, inward));
        }
        else {
            player.rotation = [0, 0, 0, 1];
        }
        player.velocity = [0, 0, 0];
        player.angularVelocity = [0, 0, 0];
        player.throttle = 0.35;
        player.fuel = stats.fuel;
        player.shield = stats.shield;
        player.hull = stats.hull;
        player.energy = stats.energyCapacity;
        player.missiles = stats.missileCapacity;
        player.navTargetId = environment === 'asteroid-field' ? 'shardbelt' : environment === 'debris-field' ? 'mourning-line' : 'helix';
        this.resetPlayerInterpolation(true);
        const hostileCount = scenario === '1v2' ? 2 : scenario === '1v3' || scenario === '2v3' ? 3 : 1;
        const withWingman = scenario === '2v3';
        // The difficulty selector pins the hostile pilot tier (temperament still
        // rolls per faction); ROOKIE / VETERAN / ACE map straight onto the pilot
        // tiers, so the arena is a clean skill ladder.
        const hostilePilot = { tier: config.difficulty ?? 'veteran' };
        let wingman;
        if (withWingman) {
            // 2v3 is two concurrent dogfights: a wingman pockets one hostile off
            // to the side while two hostiles press the player. The pair spawns
            // facing each other so they open with a head-on joust instead of a
            // slow conga-line tail chase.
            const wingDir = new THREE.Vector3(0, 0.15, -1).normalize();
            const wingmanPos = center.clone().addScaledVector(wingDir, 170);
            const attackerPos = center.clone().addScaledVector(wingDir, 360);
            wingman = this.spawnShip('patrol', tuple(wingmanPos));
            const wingAttacker = this.spawnShip('escort', tuple(attackerPos), undefined, undefined, hostilePilot);
            wingAttacker.targetId = wingman.id;
            const faceToward = (ship, toward) => {
                const dir = toward.clone().sub(vec(ship.position)).normalize();
                ship.rotation = quatTuple(new THREE.Quaternion().setFromUnitVectors(FORWARD, dir));
            };
            faceToward(wingman, attackerPos);
            faceToward(wingAttacker, wingmanPos);
        }
        if (withWingman) {
            // Two hostiles press the player from opposite flanks.
            const flanks = [new THREE.Vector3(1, 0, 0.25), new THREE.Vector3(-0.9, 0, -0.3)];
            flanks.forEach((dir, index) => {
                const hostile = this.spawnShip(index === 0 ? 'pirate' : 'escort', tuple(center.clone().addScaledVector(dir.normalize(), 220 + index * 40)), undefined, undefined, hostilePilot);
                hostile.targetId = 'player';
            });
        }
        else {
            for (let index = 0; index < hostileCount; index += 1) {
                const angle = (index / Math.max(1, hostileCount)) * Math.PI * 2 + 0.6;
                const offset = new THREE.Vector3(Math.cos(angle), index % 2 ? 0.5 : -0.35, Math.sin(angle)).normalize().multiplyScalar(220 + index * 40);
                const hostile = this.spawnShip(index === 0 ? 'pirate' : 'escort', tuple(center.clone().add(offset)), undefined, undefined, hostilePilot);
                hostile.targetId = 'player';
            }
        }
        if (announce) {
            const envLabel = t(environment === 'asteroid-field' ? 'ASTEROID FIELD' : environment === 'debris-field' ? 'DEBRIS FIELD' : 'OPEN SPACE');
            const difficultyLabel = t(TIER_LABELS[config.difficulty ?? 'veteran'] ?? 'Veteran').toUpperCase();
            this.ui.pushEvent(t('COMBAT SIMULATOR · {scenario} · {env} · {difficulty} PILOTS', { scenario: scenario.toUpperCase(), env: envLabel, difficulty: difficultyLabel }), 'info', 5200);
            this.ui.pushEvent(t('Hostiles inbound. Weapons free.'), 'danger', 3600);
        }
    }
    restartArena() {
        this.ships = [];
        this.projectiles = [];
        this.pickups = [];
        this.autopilot = false;
        this.armedJumpPointId = null;
        this.armedJumpPointSide = 0;
        this.renderer.setArmedJumpPoint?.();
        this.afterburning = false;
        this.hyperdriveFx = 'none';
        this.hyperdriveEncounterAt = null;
        this.hyperdriveEncounterCooldownUntil = 0;
        this.hyperdriveInterceptIds.clear();
        this.deathTimer = 0;
        this.renderer.setCockpitVisible(true);
        this.audio.setStationMode(false);
        this.ui.hideDock();
        this.ui.showHud();
        this.setupArena(this.arena, false);
        this.ui.pushEvent(t('Ship destroyed — arena reset.'), 'warning', 3600);
    }
    onSpacePointerDown = (event) => {
        if (event.button !== 0 || this.save.player.dockedAt || this.ui.isModalOpen)
            return;
        this.targetPointer = { id: event.pointerId, x: event.clientX, y: event.clientY, at: performance.now() };
    };
    onSpacePointerUp = (event) => {
        const start = this.targetPointer;
        this.targetPointer = undefined;
        if (!start || start.id !== event.pointerId || this.save.player.dockedAt || this.ui.isModalOpen)
            return;
        const drift = Math.hypot(event.clientX - start.x, event.clientY - start.y);
        if (drift > TARGET_TAP_DRIFT || performance.now() - start.at > 650)
            return;
        const picked = this.renderer.pickTarget(event.clientX, event.clientY);
        if (picked)
            this.selectPickedTarget(picked);
    };
    onSpacePointerCancel = () => {
        this.targetPointer = undefined;
    };
    selectPickedTarget(target) {
        this.selectTarget(target.kind, target.id);
    }
    updateActiveInstance(force = false) {
        const player = vec(this.save.player.position);
        let next;
        let nearestDistance = Number.POSITIVE_INFINITY;
        for (const id of this.currentNavLocationIds()) {
            const distance = player.distanceTo(vec(LOCATIONS[id].position));
            if (distance <= locationInstanceRadius(id) && distance < nearestDistance) {
                next = id;
                nearestDistance = distance;
            }
        }
        if (!force && next === this.activeInstanceId)
            return;
        this.activeInstanceId = next;
        this.renderer.setActiveInstance(next);
        const current = this.getTargetRef(false);
        if (current?.kind === 'asteroid' && next !== 'shardbelt')
            this.clearTarget();
        if (current?.kind === 'wreck' && next !== 'mourning-line')
            this.clearTarget();
    }
    restoreViewState() {
        if (this.save.player.dockedAt) {
            this.renderer.setCockpitVisible(false);
            const messages = completeMissionsAtDock(this.save, this.save.player.dockedAt);
            refreshMissionOffers(this.save);
            recordMarketVisit(this.save.world, this.save.player.dockedAt);
            this.ui.showDock(this.save, this.save.player.dockedAt);
            messages.forEach((message) => this.ui.showToast(message, 'success', 5200));
            this.persistSave();
        }
        else {
            this.renderer.setCockpitVisible(true);
            this.ui.hideDock();
            this.ui.hideTitle();
            this.ui.showHud();
        }
    }
    async enableAudio() {
        await this.audio.enable();
    }
    debugSnapshot() {
        return {
            systemId: this.save.player.systemId,
            galaxyJump: this.galaxyJump ? { ...this.galaxyJump } : null,
            plannedSystemId: this.save.world.plannedSystemId,
            autopilot: this.autopilot,
            afterburning: this.afterburning,
            ships: this.ships.map((ship) => ({ ...ship, position: [...ship.position], velocity: [...ship.velocity], rotation: [...ship.rotation] })),
            projectiles: this.projectiles.map((projectile) => ({ ...projectile, position: [...this.projStore.pos.subarray(projectile.slot * 3, projectile.slot * 3 + 3)], velocity: [...this.projStore.vel.subarray(projectile.slot * 3, projectile.slot * 3 + 3)] })),
            pickups: this.pickups.map((pickup) => ({ ...pickup, position: [...this.pickupStore.pos.subarray(pickup.slot * 3, pickup.slot * 3 + 3)], velocity: [...this.pickupStore.vel.subarray(pickup.slot * 3, pickup.slot * 3 + 3)] })),
            activeInstance: this.activeInstanceId,
        };
    }
    dispose() {
        if (!this.active)
            return;
        this.active = false;
        cancelAnimationFrame(this.frameId);
        this.persistSave();
        this.renderer.canvas.removeEventListener('pointerdown', this.onSpacePointerDown);
        this.renderer.canvas.removeEventListener('pointerup', this.onSpacePointerUp);
        this.renderer.canvas.removeEventListener('pointercancel', this.onSpacePointerCancel);
        this.input.dispose();
        this.renderer.dispose();
        this.audio.dispose();
    }
    // The rAF entry point. A throw anywhere in the frame body must never kill
    // the loop — a single bad value (e.g. a non-finite AudioParam) used to
    // propagate out, stop the next requestAnimationFrame from being scheduled,
    // and silently freeze the game mid-flight. Catch, log once (throttled), and
    // keep scheduling so the sim always continues.
    frame = (now) => {
        if (!this.active)
            return;
        try {
            this.frameBody(now);
        }
        catch (error) {
            if (!this.frameErrorAt || now - this.frameErrorAt > 1000) {
                this.frameErrorAt = now;
                console.error('Frame error (sim continues):', error);
            }
        }
        finally {
            this.frameId = requestAnimationFrame(this.frame);
        }
    };
    frameBody = (now) => {
        let dt = (now - this.lastFrame) / 1000;
        this.lastFrame = now;
        if (dt < 0 || !Number.isFinite(dt))
            dt = 0;
        if (dt > 0.25)
            dt = 0.25;
        this.simAccumulator += dt;
        // Hard cap so a stall/tab-switch can't queue an unbounded catch-up burst.
        if (this.simAccumulator > SIM_STEP * MAX_SIM_STEPS)
            this.simAccumulator = SIM_STEP * MAX_SIM_STEPS;
        // End a story line's mute when the player dismissed the bar or the
        // duration elapsed; runs before the sim so chatter can resume the
        // same frame the story clears.
        this.refreshStoryLine();
        const actions = this.input.getActions();
        const flying = !this.save.player.dockedAt;
        if (flying) {
            if (this.ui.isModalOpen) {
                // Pause/map freeze the sim: drop the accumulated time entirely.
                this.simAccumulator = 0;
                if (actions.pause) {
                    this.ui.hidePause();
                    this.ui.hideMap();
                    this.ui.hideShipMenu();
                    this.ui.hideChatLog?.();
                }
            }
            else if (actions.pause) {
                this.simAccumulator = 0;
                this.ui.showPause();
            }
            else if (actions.map) {
                this.simAccumulator = 0;
                this.openMap();
            }
            else {
                // Edge actions (target cycle, hyperdrive toggle, missile, capture…) run
                // exactly once per frame — never per sim step: a multi-step frame
                // would otherwise double-toggle the hyperdrive or double-cycle
                // targets, and a zero-step frame (120Hz displays) would drop the
                // press entirely. getActions() consumes each edge once.
                if (this.deathTimer <= 0)
                    this.handleActions(actions);
                let steps = 0;
                while (this.simAccumulator >= SIM_STEP && steps < MAX_SIM_STEPS) {
                    this.updateSimulation(SIM_STEP, actions);
                    this.simAccumulator -= SIM_STEP;
                    steps += 1;
                }
            }
        }
        else {
            this.simAccumulator = 0;
        }
        // Edge actions can fire between fixed steps on high-refresh displays;
        // keep the active snapshot current even when this frame advanced no
        // simulation step.
        this.syncActiveShipState();
        const stats = this.playerStats();
        // Audio params must stay finite: a NaN throttle or hull ratio would
        // throw inside the Web Audio graph and (before the frame guard) freeze
        // the whole sim. Clamp to safe numbers before touching the graph.
        const hullRatio = stats.hull > 0 ? this.save.player.hull / stats.hull : 1;
        const damage = Number.isFinite(hullRatio) ? 1 - hullRatio : 0;
        // Docked ships have no engines running: the last in-flight throttle
        // must not keep the engine wash alive on landing screens. (`flying`
        // is already declared above — same frame-gating value.)
        const throttle = flying && Number.isFinite(this.save.player.throttle) ? this.save.player.throttle : 0;
        let nearbyEnemies = 0;
        if (!this.save.player.dockedAt && this.ships) {
            const px = this.save.player.position[0];
            const py = this.save.player.position[1];
            const pz = this.save.player.position[2];
            for (const ship of this.ships) {
                if ((ship.hostile || ship.role === 'pirate' || ship.role === 'bounty') && ship.targetId === 'player') {
                    const dx = px - ship.position[0];
                    const dy = py - ship.position[1];
                    const dz = pz - ship.position[2];
                    if (dx * dx + dy * dy + dz * dz < 625 * 625)
                        nearbyEnemies += 1;
                }
            }
        }
        // Ambient music context by nearest region: planets, the belt and the
        // graveyard each get their own ambience; everything else is open space.
        // Combat music overrides it inside the audio manager while hostiles
        // are close.
        let musicContext = 'open';
        if (!this.save.player.dockedAt) {
            const px = this.save.player.position[0];
            const py = this.save.player.position[1];
            const pz = this.save.player.position[2];
            let bestSq = Infinity;
            for (const id of this.currentNavLocationIds()) {
                const location = LOCATIONS[id];
                if (location.kind === 'station')
                    continue;
                const near = location.kind === 'planet' ? location.radius * 3 : location.radius * 2.2;
                const dx = px - location.position[0];
                const dy = py - location.position[1];
                const dz = pz - location.position[2];
                const distSq = dx * dx + dy * dy + dz * dz;
                if (distSq < near * near && distSq < bestSq) {
                    bestSq = distSq;
                    musicContext = location.kind === 'planet' ? 'planet' : (id === 'shardbelt' ? 'field' : 'graveyard');
                }
            }
        }
        this.audio.update(dt, throttle, flying && this.afterburning, damage, nearbyEnemies, musicContext);
        this.syncRender(dt, now);
    };
    // Copy current entity transforms into prev* slots so the renderer can
    // interpolate. Zero-allocation: the slots are preallocated per entity.
    snapshotInterpolationState() {
        const player = this.save.player;
        player.prevPosition = player.prevPosition ?? new Float64Array(3);
        player.prevRotation = player.prevRotation ?? new Float64Array(4);
        player.prevPosition.set(player.position);
        player.prevRotation.set(player.rotation);
        for (const ship of this.ships) {
            ship.prevPosition = ship.prevPosition ?? new Float64Array(3);
            ship.prevRotation = ship.prevRotation ?? new Float64Array(4);
            ship.prevPosition.set(ship.position);
            ship.prevRotation.set(ship.rotation);
        }
        for (const projectile of this.projectiles)
            this.projStore.snapshot(projectile.slot);
        for (const pickup of this.pickups)
            this.pickupStore.snapshot(pickup.slot);
    }
    resetPlayerInterpolation(resetClock = false) {
        const player = this.save.player;
        player.prevPosition = player.prevPosition ?? new Float64Array(3);
        player.prevRotation = player.prevRotation ?? new Float64Array(4);
        player.prevPosition.set(player.position);
        player.prevRotation.set(player.rotation);
        if (resetClock) {
            this.simAccumulator = 0;
            this.lastFrame = performance.now();
        }
    }
    updateSimulation(dt, actions) {
        // Headless drivers (probes, tests) may pass sparse action objects:
        // default the numeric axes in place so a missing field can't NaN the
        // throttle and freeze the ship. The frame path always supplies all of
        // these; in-place defaulting allocates nothing. (Ported from the
        // parallel 0.7.7a branch, agent B.)
        if (actions.throttleDelta === undefined)
            actions.throttleDelta = 0;
        if (actions.pitch === undefined)
            actions.pitch = 0;
        if (actions.yaw === undefined)
            actions.yaw = 0;
        if (actions.roll === undefined)
            actions.roll = 0;
        this.snapshotInterpolationState();
        this.renderer.updateWorld(dt);
        this.save.world.time += dt;
        tickEconomy(this.save.world, dt);
        refreshMissionOffers(this.save);
        this.gunCooldown -= dt;
        this.missileCooldown -= dt;
        this.playerShieldDelay -= dt;
        this.collisionMessageCooldown -= dt;
        this.npcCollisionCooldown -= dt;
        this.hintCooldown -= dt;
        this.scanCooldown -= dt;
        this.utilitySoundCooldown -= dt;
        if (this.galaxyJump) {
            if (this.save.world.time >= this.galaxyJump.completeAt)
                this.finishGalaxyJump(this.galaxyJump);
            this.syncActiveShipState();
            return;
        }
        if (this.deathTimer > 0) {
            this.deathTimer -= dt;
            this.updateDeathDrift(dt);
            if (this.deathTimer <= 0)
                this.recoverPlayer();
            this.syncActiveShipState();
            return;
        }
        // Drafting is a race-only assist and must be sampled from the previous
        // racer positions before the player's movement for this step. It feeds
        // updatePlayer's acceleration/speed/fuel terms without changing the
        // ship-class stats returned by playerStats().
        this.updateRaceSlipstreamState(dt);
        this.updatePlayer(dt, actions);
        this.autoScanTarget();
        this.maintainTargetLock();
        this.autoDockCheck();
        this.updateActiveInstance();
        this.updateBountySpawns();
        this.updateDynamicEncounters();
        this.updateRace(dt);
        this.updateShips(dt);
        // Ship-to-ship contacts resolve last, once every hull has settled its
        // position for the frame against the environment.
        this.resolveShipContacts();
        this.updatePlayerWeapons(dt, actions);
        this.updateProjectiles(dt);
        this.updatePickups(dt);
        this.updateDiscovery();
        this.updateRegeneration(dt);
        this.cleanupEntities();
        if (this.save.world.time - this.lastMissionCheck > 0.8) {
            this.lastMissionCheck = this.save.world.time;
            failExpiredMissions(this.save).forEach((message) => this.ui.pushEvent(message, 'danger', 4800));
        }
        this.syncActiveShipState();
        if (this.save.world.time - this.lastAutosaveAt > 12) {
            this.lastAutosaveAt = this.save.world.time;
            this.persistSave();
        }
    }
    handleActions(actions) {
        if (actions.cycleMode) {
            const order = ['combat', 'mining', 'salvage'];
            const index = order.indexOf(this.save.player.mode);
            this.save.player.mode = order[(index + 1) % order.length];
            this.save.player.currentTargetId = undefined;
            this.renderer.setTarget();
            this.audio.play('ui');
        }
        if (actions.transponder)
            this.toggleTransponder();
        if (actions.navNext) {
            const navIds = this.currentNavLocationIds();
            const index = navIds.indexOf(this.save.player.navTargetId);
            this.setNav(navIds[(index + 1) % navIds.length]);
        }
        if (actions.targetNearestHostile)
            this.targetNearestHostile();
        else if (actions.targetNext)
            this.cycleTarget();
        if (actions.capture)
            this.captureTarget();
        if (actions.scan)
            this.scanTarget();
        if (actions.jettison)
            this.jettisonCargo(this.activeMugCargoCommodity() ?? 'gold');
        if (actions.autopilot)
            this.toggleHyperdrive();
        if (actions.weaponSelect)
            this.switchWeapon(actions.weaponSelect);
        if (actions.weaponCycle)
            this.cycleWeapon();
        if (actions.missile) {
            const target = this.getTargetRef(false);
            const ship = target?.kind === 'ship' ? this.ships.find((entry) => entry.id === target.id) : undefined;
            if (ship?.surrendered && !ship.claimed && !ship.captured && (ship.bountyValue > 0 || ship.missionId))
                this.captureTarget();
            else if (!((this.save.player.mode === 'mining' && target?.kind === 'asteroid') || (this.save.player.mode === 'salvage' && target?.kind === 'wreck')))
                this.fireMissile();
        }
    }
    // Sample a narrow slipstream behind a visible race rival. The sample uses
    // the rival positions from the previous simulation state (this method runs
    // before updatePlayer), then exposes only scalar strength to the flight
    // controller. No allocations occur while a draft is being maintained.
    updateRaceSlipstreamState(dt) {
        const race = this.activeRace;
        const previousStrength = this.raceDraftStrength ?? 0;
        this.raceDraftStrength = 0;
        this.raceDraftFuelMultiplier = 1;
        if (!race || race.state !== 'running') {
            const draft = race?.draft;
            if (draft?.active) {
                draft.active = false;
                draft.strength = 0;
                draft.sourceId = undefined;
                draft.savePercent = 0;
                draft.lastStrength = 0;
            }
            return;
        }
        const draft = race.draft ?? race.slipstream ?? (race.draft = {
            active: false,
            sourceId: undefined,
            sourceName: undefined,
            strength: 0,
            savePercent: 0,
            lastStrength: 0,
            audioCooldownUntil: 0,
        });
        race.draft = draft;
        race.slipstream = draft;
        const player = this.save.player;
        const orientation = quat(player.rotation, this.tmpPlayerOrientation);
        const forward = this.tmpRaceForward.copy(FORWARD).applyQuaternion(orientation).normalize();
        const px = player.position[0];
        const py = player.position[1];
        const pz = player.position[2];
        const corridor = 22;
        const corridorSq = corridor * corridor;
        const minAhead = 18;
        const maxAhead = 150;
        let sourceId;
        let sourceName;
        let strength = 0;
        for (const racer of race.racers ?? []) {
            if (!racer || racer.hull <= 0 || racer.raceFinished)
                continue;
            const dx = racer.position[0] - px;
            const dy = racer.position[1] - py;
            const dz = racer.position[2] - pz;
            const ahead = dx * forward.x + dy * forward.y + dz * forward.z;
            if (ahead < minAhead || ahead > maxAhead)
                continue;
            const racerSpeed = Math.hypot(racer.velocity[0], racer.velocity[1], racer.velocity[2]);
            if (racerSpeed < 1)
                continue;
            // A ship crossing the player's nose is not a useful wake. Require
            // both pilots to be travelling broadly the same way, with the
            // player genuinely behind the rival along the rival's own line.
            const headingDot = (racer.velocity[0] * forward.x + racer.velocity[1] * forward.y + racer.velocity[2] * forward.z) / racerSpeed;
            const behindRacer = (dx * racer.velocity[0] + dy * racer.velocity[1] + dz * racer.velocity[2]) / racerSpeed;
            if (headingDot < 0.62 || behindRacer < minAhead * 0.7)
                continue;
            const distanceSq = dx * dx + dy * dy + dz * dz;
            const lateralSq = Math.max(0, distanceSq - ahead * ahead);
            if (lateralSq > corridorSq)
                continue;
            const lateral = Math.sqrt(lateralSq);
            const candidate = clamp((1 - (ahead - minAhead) / (maxAhead - minAhead)) * (1 - lateral / corridor), 0, 1);
            if (candidate <= strength)
                continue;
            strength = candidate;
            sourceId = racer.id;
            sourceName = racer.name;
        }
        const active = strength >= 0.08;
        const wasActive = Boolean(draft.active);
        const sourceChanged = active && sourceId !== draft.sourceId;
        draft.active = active;
        draft.sourceId = active ? sourceId : undefined;
        draft.sourceName = active ? sourceName : undefined;
        draft.strength = active ? strength : 0;
        // A perfect wake saves 38% (inside the requested 35–40% band); a weak
        // edge wake scales up smoothly instead of granting the full benefit.
        // The multiplier is consumed only by afterburning fuel.
        draft.savePercent = active ? Math.round(38 * strength) : 0;
        this.raceDraftStrength = active ? strength : 0;
        this.raceDraftFuelMultiplier = active ? 1 - 0.38 * strength : 1;
        const now = this.save.world.time;
        if (active && (!wasActive || sourceChanged || strength - (draft.lastStrength ?? previousStrength) >= 0.28)) {
            if (now >= (draft.audioCooldownUntil ?? 0)) {
                this.audio.play('slipstream', clamp(strength, 0.35, 1));
                draft.audioCooldownUntil = now + 1.2;
            }
            if (!wasActive || sourceChanged) {
                this.ui.pushSensor(t('SLIPSTREAM · {name}', { name: sourceName ?? t('RIVAL') }), 'success', 1000);
                if (this.save.settings.vibration)
                    try { globalThis.navigator?.vibrate?.(18); } catch { /* vibration is optional */ }
            }
        }
        else if (!active && wasActive) {
            this.ui.pushSensor(t('SLIPSTREAM LOST'), 'info', 700);
            if (this.save.settings.vibration)
                try { globalThis.navigator?.vibrate?.([10, 12, 10]); } catch { /* vibration is optional */ }
        }
        draft.lastStrength = active ? strength : 0;
    }
    // Return the authored gathering point. The fallback keeps old saved races
    // readable while the fixed course definitions are upgraded; it never
    // mutates a generated gate or course.
    raceGathering(course) {
        if (course?.gathering?.position)
            return course.gathering;
        const fallback = this.tmpRaceGathering;
        const gate = course?.gates?.[0];
        const zone = LOCATIONS[course?.zone];
        if (!gate?.position)
            return fallback;
        fallback.id = `${course.id}-start`;
        fallback.position[0] = gate.position[0];
        fallback.position[1] = gate.position[1];
        fallback.position[2] = gate.position[2];
        const center = zone?.position ?? [0, 0, 0];
        const dx = gate.position[0] - center[0];
        const dy = gate.position[1] - center[1];
        const dz = gate.position[2] - center[2];
        const length = Math.hypot(dx, dy, dz) || 1;
        fallback.direction[0] = dx / length;
        fallback.direction[1] = dy / length;
        fallback.direction[2] = dz / length;
        fallback.radius = gate.radius ?? course.gateRadius ?? 1;
        fallback.arrivalRadius = fallback.radius * 2.2;
        return fallback;
    }
    raceGatheringPosition(course, out = this.tmpRaceGoalVector) {
        const position = this.raceGathering(course).position;
        if (position?.isVector3)
            return out.copy(position);
        return out.set(position?.[0] ?? 0, position?.[1] ?? 0, position?.[2] ?? 0);
    }
    raceGatheringDirection(course, out = this.tmpRaceSteer) {
        const gathering = this.raceGathering(course);
        const direction = gathering.direction;
        if (direction?.isVector3)
            return out.copy(direction).normalize();
        out.set(direction?.[0] ?? 0, direction?.[1] ?? 0, direction?.[2] ?? 1);
        if (out.lengthSq() < 1e-6)
            out.set(0, 0, 1);
        return out.normalize();
    }
    createRaceState(course, racers, deadline) {
        const draft = {
            active: false,
            sourceId: undefined,
            sourceName: undefined,
            strength: 0,
            savePercent: 0,
            lastStrength: 0,
            audioCooldownUntil: 0,
        };
        return {
            state: 'travel',
            course,
            // Keep this exact array in both places: renderer/radar consume
            // this.ships while lifecycle/ranking consume activeRace.racers.
            racers,
            startedAt: 0,
            playerStartTime: undefined,
            playerRank: 4,
            lastCountdown: 99,
            deadline,
            playerSplits: [],
            centerFuelRewarded: new Set(),
            shortcut: undefined,
            draft,
            slipstream: draft,
            finishResult: undefined,
            cleanupAt: 0,
        };
    }
    raceGridSlot(gathering, out = this.tmpRaceGoalVector) {
        const slot = gathering?.playerSlot;
        let value = slot;
        if (Number.isInteger(slot))
            value = gathering.grid?.[slot] ?? gathering.slots?.[slot];
        else if (slot && !Array.isArray(slot) && !slot.isVector3 && slot.position)
            value = slot.position;
        if (!value && gathering?.grid) {
            value = gathering.grid.player ?? gathering.grid[0];
        }
        if (value?.position)
            value = value.position;
        if (value?.isVector3)
            return out.copy(value);
        if (Array.isArray(value) && value.length >= 3) {
            out.set(value[0], value[1], value[2]);
            return out;
        }
        return undefined;
    }
    raceShortcutForIndex(race, index) {
        const shortcuts = race?.course?.shortcuts;
        if (!Array.isArray(shortcuts))
            return undefined;
        for (const shortcut of shortcuts) {
            const entryIndex = shortcut?.entryIndex ?? shortcut?.entryGateIndex ?? shortcut?.atGateIndex;
            if (entryIndex === index && Array.isArray(shortcut.gates) && shortcut.gates.length)
                return shortcut;
        }
        return undefined;
    }
    raceActiveShortcut(race) {
        const active = race?.shortcut;
        if (active?.data?.gates?.length)
            return active;
        return undefined;
    }
    // Renderer-facing shortcut descriptors are only produced at the active
    // branch. Travel never calls this, so the full course remains hidden until
    // the player reaches the gathering and the race starts.
    raceShortcutRenderData(race) {
        const currentIndex = this.save.player.raceGateIndex ?? 0;
        const active = this.raceActiveShortcut(race);
        const shortcut = active?.data ?? this.raceShortcutForIndex(race, currentIndex);
        if (!shortcut)
            return [];
        const exitIndex = shortcut.exitIndex ?? shortcut.exitGateIndex ?? currentIndex + 1;
        return shortcut.gates.map((gate, index) => ({
            ...gate,
            id: gate.id ?? `${race.course.id}-shortcut-${shortcut.entryIndex ?? currentIndex}-${index}`,
            position: gate.position,
            radius: gate.radius ?? shortcut.radius ?? Math.max(4, race.course.gateRadius * 0.42),
            direction: gate.direction,
            atGateIndex: currentIndex,
            exitGateIndex: exitIndex,
            shortcutIndex: index,
            shortcutId: shortcut.id,
        }));
    }
    syncRaceCourse(race) {
        if (!race?.course || race.state === 'travel')
            return;
        const center = race.course.gateCenter?.position ?? LOCATIONS[race.course.zone]?.position ?? [0, 0, 0];
        this.renderer.syncRaceGates(race.course.gates, this.save.player.raceGateIndex ?? 0, center, { shortcuts: this.raceShortcutRenderData(race) });
    }
    raceVectorFromTarget(value, out = this.tmpRaceGoalVector) {
        const x = Number.isFinite(value?.x) ? value.x : value?.[0];
        const y = Number.isFinite(value?.y) ? value.y : value?.[1];
        const z = Number.isFinite(value?.z) ? value.z : value?.[2];
        if (Number.isFinite(x) && Number.isFinite(y) && Number.isFinite(z))
            return out.set(x, y, z);
        return undefined;
    }
    raceCrossedGate(previous, current, gate) {
        if (typeof crossedRaceGate === 'function')
            return crossedRaceGate(previous, current, gate);
        // Legacy fallback for a course without the directional helper. New
        // courses always use crossedRaceGate so a near miss cannot count.
        const dx = current[0] - gate.position[0];
        const dy = current[1] - gate.position[1];
        const dz = current[2] - gate.position[2];
        return Math.hypot(dx, dy, dz) <= (gate.radius ?? 0);
    }
    raceGateClosestDistanceSq(previous, current, gate) {
        const ax = previous[0];
        const ay = previous[1];
        const az = previous[2];
        const dx = current[0] - ax;
        const dy = current[1] - ay;
        const dz = current[2] - az;
        const ox = gate.position[0] - ax;
        const oy = gate.position[1] - ay;
        const oz = gate.position[2] - az;
        const lengthSq = dx * dx + dy * dy + dz * dz;
        const along = lengthSq > 1e-8 ? clamp((ox * dx + oy * dy + oz * dz) / lengthSq, 0, 1) : 1;
        const cx = ax + dx * along - gate.position[0];
        const cy = ay + dy * along - gate.position[1];
        const cz = az + dz * along - gate.position[2];
        return cx * cx + cy * cy + cz * cz;
    }
    raceAwardGate(gate, previous, current, centeredOnly = false) {
        const race = this.activeRace;
        if (!race || !gate)
            return false;
        const radius = gate.radius ?? race.course.gateRadius ?? 1;
        const centerRadius = gate.centerRadius ?? race.course.centerGateRadius ?? radius * 0.34;
        const centered = this.raceGateClosestDistanceSq(previous, current, gate) <= centerRadius * centerRadius;
        if (centeredOnly && !centered)
            return false;
        race.centerFuelRewarded ??= new Set();
        if (centered && !race.centerFuelRewarded.has(gate.id)) {
            const stats = this.playerStats();
            const reward = gate.centerFuelReward ?? race.course.centerFuelReward ?? 2.5;
            this.save.player.fuel = Math.min(stats.fuel, (this.save.player.fuel ?? 0) + reward);
            race.centerFuelRewarded.add(gate.id);
        }
        return centered;
    }
    raceAdvanceMainGate(race, previous, current, now) {
        const player = this.save.player;
        const currentIndex = player.raceGateIndex ?? 0;
        const mainGate = race.course.gates[currentIndex];
        if (!mainGate)
            return false;
        // The first tight branch gate is checked before the main checkpoint.
        // If the main gate is crossed first, the safe route wins and the branch
        // is no longer available for this segment.
        const candidate = this.raceShortcutForIndex(race, currentIndex);
        if (candidate && !race.shortcut) {
            const tightGate = candidate.gates[0];
            if (this.raceCrossedGate(previous, current, tightGate)) {
                this.raceAwardGate(tightGate, previous, current);
                race.shortcut = {
                    data: candidate,
                    id: candidate.id,
                    index: 1,
                    committed: true,
                    entryIndex: candidate.entryIndex ?? currentIndex,
                    exitIndex: candidate.exitIndex ?? candidate.exitGateIndex ?? currentIndex + 1,
                };
                this.ui.pushSensor(t('SHORTCUT COMMITTED · HOLD THE LINE'), 'success', 1500);
                this.audio.play('success', 0.85);
                if (candidate.gates.length <= 1)
                    this.raceCompleteShortcut(race, now);
                else
                    this.syncRaceCourse(race);
                return true;
            }
        }
        if (!this.raceCrossedGate(previous, current, mainGate))
            return false;
        const centered = this.raceAwardGate(mainGate, previous, current);
        player.raceGateIndex = currentIndex + 1;
        race.playerSplits ??= [];
        race.playerSplits[currentIndex] = Math.max(0, now - (race.playerStartTime ?? now));
        race.playerSplitDelta = this.raceSplitDelta(race, currentIndex);
        race.splitAt = now;
        this.renderer.pulseRaceGate?.(currentIndex, { centered, finish: mainGate.kind === 'finish' || player.raceGateIndex >= race.course.gates.length });
        if (player.raceGateIndex >= race.course.gates.length) {
            player.raceFinishTime = now;
            this.finishRace();
            return true;
        }
        this.syncRaceCourse(race);
        this.ui.pushSensor(t('GATE {current}/{total} · {rank}', { current: player.raceGateIndex + 1, total: race.course.gates.length, rank: raceRankLabel(this.racePlayerRank()) }), 'success', 1400);
        this.audio.play('success', centered ? 1 : 0.9);
        return true;
    }
    raceCompleteShortcut(race, now) {
        const shortcut = race.shortcut;
        if (!shortcut)
            return;
        const exitIndex = Number.isFinite(shortcut.exitIndex) ? shortcut.exitIndex : (this.save.player.raceGateIndex ?? 0) + 1;
        // The branch's final ring rejoins at the authored exit index. This is
        // the same next-gate semantics used by rival progression.
        this.save.player.raceGateIndex = Math.max(this.save.player.raceGateIndex ?? 0, exitIndex);
        race.shortcut = undefined;
        race.playerSplits ??= [];
        if (this.save.player.raceGateIndex > 0)
            race.playerSplits[this.save.player.raceGateIndex - 1] = Math.max(0, now - (race.playerStartTime ?? now));
        race.playerSplitDelta = this.raceSplitDelta(race, this.save.player.raceGateIndex - 1);
        race.splitAt = now;
        if (this.save.player.raceGateIndex >= race.course.gates.length) {
            this.save.player.raceFinishTime = now;
            this.finishRace();
            return;
        }
        this.ui.pushSensor(t('SHORTCUT COMPLETE · REJOIN AT GATE {gate}', { gate: this.save.player.raceGateIndex + 1 }), 'success', 1600);
        this.audio.play('success', 1);
        this.syncRaceCourse(race);
    }
    raceAdvanceShortcut(race, previous, current, now) {
        const shortcut = race.shortcut;
        if (!shortcut?.committed)
            return false;
        const gate = shortcut.data.gates[shortcut.index];
        if (!gate)
            return false;
        if (!this.raceCrossedGate(previous, current, gate))
            return false;
        const centered = this.raceAwardGate(gate, previous, current);
        shortcut.index += 1;
        this.renderer.pulseRaceGate?.(this.save.player.raceGateIndex ?? 0, { centered });
        if (shortcut.index >= shortcut.data.gates.length)
            this.raceCompleteShortcut(race, now);
        else
            this.syncRaceCourse(race);
        return true;
    }
    // Race lifecycle: 'travel' (fly to the gathering) → 'countdown' (grid
    // hold) → 'running' (directional gate crossings + live rank) → terminal.
    // Racers are ordinary rendered/radar ships, but updateShips and contact
    // resolution deliberately skip them so a race never becomes a combat.
    updateRace(dt) {
        const race = this.activeRace;
        if (!race)
            return;
        const player = this.save.player;
        const now = this.save.world.time;
        if (race.state === 'finished') {
            if (now >= (race.cleanupAt ?? Infinity))
                this.endRaceField();
            return;
        }
        if (race.state === 'failed')
            return;
        if (race.state === 'travel') {
            if (now > race.deadline) {
                this.failRace(t('RACE ENTRY EXPIRED · ENTRY FORFEIT'));
                return;
            }
            if (this.activeInstanceId !== race.course.zone)
                return;
            const gathering = this.raceGathering(race.course);
            const position = this.raceGatheringPosition(race.course);
            const arrivalRadius = gathering.arrivalRadius ?? Math.max(1, gathering.radius ?? race.course.gateRadius ?? 1) * 2.2;
            const dx = player.position[0] - position.x;
            const dy = player.position[1] - position.y;
            const dz = player.position[2] - position.z;
            if (dx * dx + dy * dy + dz * dz > arrivalRadius * arrivalRadius)
                return;
            this.startRaceAt(race.course);
            return;
        }
        // Leaving the zone mid-race kills the entry — the fee is the house's.
        if (this.activeInstanceId !== race.course.zone) {
            this.failRace(t('RACE ABANDONED · ENTRY FORFEIT'));
            return;
        }
        if (now < race.startedAt) {
            player.velocity[0] = 0;
            player.velocity[1] = 0;
            player.velocity[2] = 0;
            const remaining = Math.ceil(race.startedAt - now);
            if (remaining !== race.lastCountdown && remaining <= 3) {
                race.lastCountdown = remaining;
                this.ui.pushSensor(t('{count}…', { count: remaining }), 'info', 900);
                this.audio.play('ui', 0.8);
            }
            return;
        }
        if (race.state === 'countdown') {
            race.state = 'running';
            race.playerStartTime = now;
            player.prevPosition?.set?.(player.position);
            this.syncRaceCourse(race);
            this.ui.pushEvent(t('GO · PASS ALL {count} GATES', { count: race.course.gates.length }), 'success', 3200);
            this.audio.play('success', 1.2);
        }
        const previous = player.prevPosition ?? player.position;
        if (this.raceActiveShortcut(race))
            this.raceAdvanceShortcut(race, previous, player.position, now);
        else
            this.raceAdvanceMainGate(race, previous, player.position, now);
        if (!this.activeRace || this.activeRace.state !== 'running')
            return;
        // Track the authored course pace only. No player-ship class multiplier
        // or skill scaling leaks into these opponents.
        for (const racer of race.racers ?? []) {
            if (!racer || racer.hull <= 0 || racer.raceFinished)
                continue;
            this.tmpRaceGoal.x = NaN;
            this.tmpRaceGoal.y = NaN;
            this.tmpRaceGoal.z = NaN;
            this.tmpRaceGoal[0] = NaN;
            this.tmpRaceGoal[1] = NaN;
            this.tmpRaceGoal[2] = NaN;
            const returned = typeof raceRacerTarget === 'function' ? raceRacerTarget(racer, race.course, this.tmpRaceGoal) : undefined;
            const goal = this.raceVectorFromTarget(returned ?? this.tmpRaceGoal);
            const fallback = goal ?? this.raceVectorFromTarget(race.course.gates[racer.raceGateIndex ?? 0]?.position);
            if (!fallback)
                continue;
            const speed = Math.hypot(racer.velocity[0], racer.velocity[1], racer.velocity[2]);
            const brake = steerToward(this, racer, fallback, {
                route: true,
                speed,
                horizon: 1.8,
                brakeScale: 0.55,
                synthesize: true,
            }, this.tmpRaceSteer);
            updateRaceRacer(racer, race.course, dt, now, { direction: this.tmpRaceSteer, brake });
        }
        race.playerRank = this.racePlayerRank();
    }
    raceProgressForShip(ship, race) {
        if (ship.raceFinished)
            return race.course.gates.length + 2;
        let progress = ship.raceGateIndex ?? 0;
        const shortcut = ship === this.save.player ? race.shortcut : ship.raceShortcut;
        if (shortcut?.committed) {
            const count = shortcut.data?.gates?.length ?? 1;
            progress += (shortcut.index ?? 0) / Math.max(1, count + 1);
        }
        const gate = race.course.gates[ship.raceGateIndex ?? 0];
        if (gate) {
            const dx = ship.position[0] - gate.position[0];
            const dy = ship.position[1] - gate.position[1];
            const dz = ship.position[2] - gate.position[2];
            progress += 1e-4 / Math.max(1, Math.hypot(dx, dy, dz));
        }
        return progress;
    }
    // Live rank read: finished pilots that beat the player's finish time, or
    // unfinished pilots further along the authored route than the player.
    racePlayerRank() {
        const race = this.activeRace;
        if (!race)
            return 4;
        const player = this.save.player;
        const playerProgress = this.raceProgressForShip(player, race);
        let aheadCount = 0;
        for (const racer of race.racers ?? [])
            if (this.raceProgressForShip(racer, race) > playerProgress)
                aheadCount += 1;
        return aheadCount + 1;
    }
    finishRace() {
        const race = this.activeRace;
        if (!race || race.state === 'finished')
            return;
        // Anyone already across the line beat the player; everyone else is behind.
        const rank = this.racePlayerRank();
        const payout = racePayout(race.course, rank);
        this.save.player.credits += payout;
        const finishTime = this.save.world.time - (race.playerStartTime ?? this.save.world.time);
        const previous = normalizeRaceRecord(this.save.world.raceRecords[race.course.id]);
        const result = recordRaceResult(previous, {
            rank,
            time: finishTime,
            splits: race.playerSplits ?? [],
            at: this.save.world.time,
        }) ?? { ...previous, rank, time: finishTime, at: this.save.world.time };
        const quest = getQuest(this.save, RACE_QUEST_ID);
        if (quest) {
            quest.stepId = 'complete';
            quest.flags ??= {};
            quest.flags.finishTime = finishTime;
            quest.flags.rank = rank;
            quest.flags.splits = race.playerSplits ?? [];
            quest.completedAt = this.save.world.time;
        }
        race.state = 'finished';
        race.finishResult = {
            rank,
            rankLabel: raceRankLabel(rank),
            time: finishTime,
            payout,
            splits: race.playerSplits ?? [],
            splitDelta: race.playerSplitDelta,
            personalBest: !Number.isFinite(previous?.bestTime) || finishTime < previous.bestTime,
        };
        // Leave the finish gate, frozen field, and cockpit result visible long
        // enough to read before the racers jump out and the course clears.
        race.cleanupAt = this.save.world.time + 5;
        this.save.world.raceRecords[race.course.id] = { ...result, active: false, failed: false };
        this.renderer.pulseRaceGate?.(Math.max(0, race.course.gates.length - 1), { centered: true, finish: true });
        this.ui.pushSensor(t('FINISH LINE · RESULTS LOCKED'), 'success', 1800);
        this.ui.pushEvent(t('{course} FINISHED · {rank} · {amount}', { course: race.course.title.toUpperCase(), rank: raceRankLabel(rank), amount: `${payout >= 0 ? '+' : ''}${formatCredits(payout)}` }), payout >= 0 ? 'success' : 'danger', 8000);
        this.audio.play(payout >= 0 ? 'success' : 'warning', 1.1);
        this.persistSave();
    }
    failRace(message) {
        const race = this.activeRace;
        if (!race || race.state === 'finished' || race.state === 'failed')
            return;
        race.state = 'failed';
        this.endRaceField();
        // The board clears the live entry and the quest record closes, so a
        // reload can't resurrect a forfeit ticket (see restoreActiveRace).
        const record = this.save.world.raceRecords[race.course.id];
        if (record?.active)
            this.save.world.raceRecords[race.course.id] = recordRaceResult(record, { failed: true, at: this.save.world.time });
        const quest = getQuest(this.save, RACE_QUEST_ID);
        if (quest && quest.completedAt === undefined && quest.stepId !== 'complete')
            quest.completedAt = this.save.world.time;
        this.ui.pushEvent(message, 'danger', 6000);
        this.audio.play('warning', 1.0);
        this.persistSave();
    }
    // Despawn racers with warp streaks and drop the gate markers.
    endRaceField() {
        const race = this.activeRace;
        const gatheringId = race?.course ? this.raceGathering(race.course).id : undefined;
        this.renderer.clearRaceGates();
        this.renderer.clearRaceStart?.();
        if (race?.racers?.length) {
            for (const racer of race.racers) {
                this.renderer.spawnHyperdriveStreak?.(racer.position, racer.velocity, paletteForFaction(racer.faction, false).engine);
            }
        }
        this.ships = this.ships.filter((ship) => !ship.race);
        this.activeRace = null;
        // A gate lock must not outlive the entry (raceGateTarget now resolves
        // to undefined, but clear explicitly so the monitor drops immediately).
        if (this.save.player.currentTargetId && (this.save.player.currentTargetId.includes('-gate-') || this.save.player.currentTargetId.includes('-shortcut-') || this.save.player.currentTargetId === gatheringId || this.save.player.currentTargetId === `${race?.course?.id}-start`))
            this.clearTarget();
        delete this.save.player.raceGateIndex;
        delete this.save.player.raceFinishTime;
        this.raceDraftStrength = 0;
        this.raceDraftFuelMultiplier = 1;
    }
    // A paid-but-unraced entry survives a reload: rebuild the travel leg from
    // the persisted quest flags. Mid-race reloads downgrade to travel — grid,
    // racers and gate markers rebuild when the pilot re-reaches Gate 1.
    restoreActiveRace() {
        const quest = getQuest(this.save, RACE_QUEST_ID);
        const flags = quest?.flags ?? {};
        if (!quest || quest.completedAt !== undefined || !flags.paid || quest.stepId !== 'travel')
            return;
        const course = generateRaceCourse(flags.courseId, this.save.world.seed);
        if (!course)
            return;
        const racers = createRaceRacers(course, this.save.world.seed, this.save.world.time);
        const staged = stageRaceRacers(racers, course);
        const liveRacers = Array.isArray(staged) && staged.length === 3 ? staged : racers;
        this.ships = this.ships.filter((ship) => !ship.race);
        this.ships.push(...liveRacers);
        this.activeRace = this.createRaceState(course, liveRacers, flags.deadline ?? (this.save.world.time + course.deadlineSeconds));
        delete this.save.player.raceGateIndex;
        delete this.save.player.raceFinishTime;
        if (this.save.player.currentTargetId && (this.save.player.currentTargetId.includes?.('-gate-') || this.save.player.currentTargetId.includes?.('-shortcut-')))
            this.clearTarget();
        // Restore exactly the travel presentation: one gathering marker, no
        // course gates. The racers are already ordinary visible/radar ships at
        // their authored grid positions.
        this.renderer.clearRaceGates();
        this.renderer.syncRaceStart?.(this.raceGathering(course), 'travel');
        this.save.player.currentTargetId = this.raceGathering(course).id;
        // Keep the board consistent: an open ticket always reads as live so
        // the offer stays hidden until this entry resolves. Preserve any
        // earlier results on the same course (best rank/time history).
        const existingRecord = this.save.world.raceRecords[course.id];
        if (!existingRecord?.active)
            this.save.world.raceRecords[course.id] = { ...normalizeRaceRecord(existingRecord), active: true };
    }
    // Cockpit weapon readout: mounted gun name plus its ammo pool (or heat
    // state for the energy/heat weapons) for the own-ship monitor line.
    weaponHud() {
        // Reconcile a staged/loaded group before inspecting it. This makes a
        // selected empty A/B group follow its non-empty counterpart, while an
        // actually empty loadout remains an explicit no-weapon state.
        this.syncWeaponProjection();
        const loadout = this.save.player.outfitting?.loadouts?.[this.save.player.shipId];
        const spec = HULL_HARDPOINTS[this.save.player.shipId];
        let groupCount = 0;
        if (loadout && spec) {
            const active = this.activeFireGroup();
            let mounted = false;
            for (const [index, mount] of spec.guns.entries()) {
                if ((loadout.fireGroups?.assignments?.[mount.id] ?? 'A') !== active)
                    continue;
                if (weaponIdForOutfit(loadout.guns?.[index])) {
                    mounted = true;
                    groupCount += 1;
                }
            }
            if (!mounted)
                return undefined;
        }
        const weapon = this.currentWeapon();
        if (!weapon)
            return undefined;
        const ammoId = weapon.ammoId;
        const stock = ammoId ? Math.max(0, Math.floor(this.save.player.ammo?.[ammoId] ?? 0)) : null;
        return {
            // The outfitter keeps the full product name. The small cockpit
            // monitor uses the short instrument label so group + gun + ammo
            // remain identifiable without 7px type or opaque truncation.
            name: t(weapon.hudNameKey ?? weapon.nameKey),
            fullName: t(weapon.nameKey),
            slot: weapon.slot,
            venting: weapon.kind === 'pdc' ? this.save.world.time < (this.pdcVentUntil ?? 0) : false,
            heatPercent: weapon.kind === 'pdc' ? Math.round(Math.min(1, (this.pdcHeat ?? 0) / 3.5) * 100) : undefined,
            ammo: stock === null ? undefined : { current: stock, capacity: ammoCapacity(ammoId) },
            group: this.activeFireGroup(),
            // A/B groups can deliberately mix guns. The first mounted weapon
            // remains the compact readout identity, while this count lets the
            // cockpit/pause renderer disclose that a volley has more mounts.
            mountCount: loadout && spec ? groupCount : 1,
        };
    }
    // Resolve only the contacts that are currently part of the race phase. In
    // travel that is one gathering marker; course and shortcut contacts become
    // targetable only after the grid is reached.
    raceGateById(id) {
        const race = this.activeRace;
        const course = race?.course;
        if (!race || !course)
            return undefined;
        const gathering = this.raceGathering(course);
        const gatheringId = gathering.id ?? `${course.id}-start`;
        if (race.state === 'travel') {
            if (id === course.id || id === gatheringId || id === `${course.id}-start`)
                return { course, gate: gathering, index: 0, gathering: true };
            return undefined;
        }
        const gate = course.gates.find((entry) => entry.id === id);
        if (gate)
            return { course, gate, index: gate.index };
        const shortcut = this.raceActiveShortcut(race)?.data ?? this.raceShortcutForIndex(race, this.save.player.raceGateIndex ?? 0);
        if (shortcut?.gates) {
            const shortcutIndex = shortcut.gates.findIndex((entry) => entry.id === id);
            if (shortcutIndex >= 0)
                return { course, gate: shortcut.gates[shortcutIndex], index: this.save.player.raceGateIndex ?? shortcut.entryIndex ?? 0, shortcut, shortcutIndex };
        }
        return undefined;
    }
    // Course geometry is authored and deterministic. Older builds nudged gates
    // around live rocks here, which changed the meaningful line from run to run;
    // fixed courses now stay untouched and the route-aware racer steering handles
    // obstacle avoidance instead.
    hardenRaceCourse(course) {
        return course;
    }
    raceGateTarget(id) {
        const found = this.raceGateById(id);
        if (!found)
            return undefined;
        if (found.gathering) {
            return {
                kind: 'gate',
                id,
                position: found.gate.position,
                name: t('RACE START · {course}', { course: found.course.title }),
                gathering: true,
            };
        }
        const shortcut = found.shortcut;
        return {
            kind: 'gate',
            id,
            position: found.gate.position,
            name: shortcut
                ? t('SHORTCUT {n}/{total}', { n: found.shortcutIndex + 1, total: shortcut.gates.length })
                : t('GATE {n}/{total}', { n: found.index + 1, total: found.course.gates.length }),
            shortcut: Boolean(shortcut),
        };
    }
    raceSplitDelta(race, index) {
        if (!race || !Number.isFinite(index) || index < 0)
            return undefined;
        const record = normalizeRaceRecord(this.save.world.raceRecords[race.course.id]);
        const bestSplits = record?.bestSplits ?? record?.splits;
        const current = race.playerSplits?.[index];
        const best = bestSplits?.[index];
        if (!Number.isFinite(current) || !Number.isFinite(best))
            return undefined;
        return current - best;
    }
    // Cockpit race telemetry for the own-ship monitor strip. One small object
    // per HUD tick (~24 Hz) — cheap next to the rest of buildHudModel.
    raceHud() {
        const race = this.activeRace;
        if (!race || race.state === 'failed')
            return undefined;
        const player = this.save.player;
        const course = race.course;
        const record = normalizeRaceRecord(this.save.world.raceRecords[course.id]);
        const personalBest = Number.isFinite(record?.bestTime)
            ? record.bestTime
            : Number.isFinite(record?.time) && !record?.active ? record.time : undefined;
        if (race.state === 'finished') {
            return {
                phase: 'finished',
                title: course.title,
                rank: race.finishResult?.rank,
                rankLabel: race.finishResult?.rankLabel,
                time: race.finishResult?.time,
                payout: race.finishResult?.payout,
                personalBest: Boolean(race.finishResult?.personalBest),
                personalBestTime: personalBest,
                pbTime: personalBest,
                pbRank: record?.bestRank,
                splitDelta: race.finishResult?.splitDelta,
            };
        }
        if (race.state === 'travel') {
            const gathering = this.raceGatheringPosition(course);
            return {
                phase: 'travel',
                title: course.title,
                distance: Math.round(Math.hypot(gathering.x - player.position[0], gathering.y - player.position[1], gathering.z - player.position[2])),
                gathering: true,
            };
        }
        if (race.state === 'countdown') {
            return {
                phase: 'countdown',
                title: course.title,
                seconds: Math.max(1, Math.ceil(race.startedAt - this.save.world.time)),
                personalBest,
                pbTime: personalBest,
                pbRank: record?.bestRank,
                draft: 0,
            };
        }
        const shortcut = this.raceActiveShortcut(race);
        const availableShortcut = shortcut?.data ?? this.raceShortcutForIndex(race, player.raceGateIndex ?? 0);
        return {
            phase: 'running',
            title: course.title,
            gate: Math.min(player.raceGateIndex + 1, course.gates.length),
            gateCount: course.gates.length,
            rankLabel: raceRankLabel(this.racePlayerRank()),
            time: Math.max(0, this.save.world.time - (race.playerStartTime ?? this.save.world.time)),
            personalBest,
            pbTime: personalBest,
            pbRank: record?.bestRank,
            splitDelta: race.playerSplitDelta,
            splitAge: Number.isFinite(race.splitAt) ? Math.max(0, this.save.world.time - race.splitAt) : undefined,
            draft: race.draft?.active ? race.draft.strength : 0,
            draftSavePercent: race.draft?.active ? race.draft.savePercent : 0,
            draftSourceName: race.draft?.active ? race.draft.sourceName : undefined,
            shortcut: availableShortcut
                ? { active: Boolean(shortcut?.committed), available: !shortcut?.committed, entryIndex: availableShortcut.entryIndex, exitIndex: availableShortcut.exitIndex ?? availableShortcut.exitGateIndex, gate: (shortcut?.index ?? 0) + 1, gateCount: availableShortcut.gates.length }
                : undefined,
        };
    }
    updatePlayer(dt, actions) {
        const stats = this.playerStats();
        // A laden hold dulls the controls: turn rate and acceleration fall with cargo mass.
        const loadScale = this.flightLoadScale();
        // Slipstream is deliberately a small, universal race assist. It never
        // changes the selected hull's published stats; the transient strength
        // is computed by updateRaceSlipstreamState immediately before this
        // controller runs.
        const draftStrength = this.activeRace?.state === 'running'
            ? clamp(this.raceDraftStrength ?? 0, 0, 1)
            : 0;
        // playerStats() is cached for the flight. Never write load penalties
        // back into it: that compounded at 60 Hz until steering disappeared.
        const acceleration = stats.acceleration * loadScale * (1 + draftStrength * 0.08);
        const angularAcceleration = stats.angularAcceleration * loadScale;
        const position = vec(this.save.player.position, this.tmpA);
        const velocity = vec(this.save.player.velocity, this.tmpB);
        const orientation = quat(this.save.player.rotation, this.tmpPlayerOrientation);
        const angularVelocity = vec(this.save.player.angularVelocity, this.tmpC);
        if (actions.throttleSet !== undefined)
            this.save.player.throttle = actions.throttleSet;
        this.save.player.throttle = clamp(this.save.player.throttle + actions.throttleDelta * dt, 0, 1);
        const manualAuthority = Math.max(Math.abs(actions.pitch), Math.abs(actions.yaw), Math.abs(actions.roll));
        if (this.autopilot && manualAuthority > 0.35) {
            this.autopilot = false;
            this.hyperdriveEncounterAt = null;
            this.hyperdriveFx = 'drop';
            this.hyperdriveFxUntil = this.save.world.time + HYPERDRIVE_FX_DURATION;
            // A manual break must shed the cruise vector as fast as every other
            // exit (arrival drop, hyperdrive toggle, intercept): snap to combat
            // speed, then re-sync the local velocity captured before the break
            // so the stale cruise vector can't overwrite the snap below.
            this.snapToCombatSpeed();
            velocity.copy(vec(this.save.player.velocity));
            this.save.player.throttle = clamp(this.hyperdriveReturnThrottle, 0, 1);
            this.setHyperdriveStatus(t('DISENGAGED · MANUAL INPUT'));
            this.audio.play('hyperDrop');
        }
        // Afterburner: the burn is live whenever the button is held with fuel
        // (never in autopilot), at ANY throttle and ANY speed — turn authority
        // doubles and the burn visuals (FOV, cockpit zoom, engine audio) play
        // the whole time. Only the speed ceiling is gated: it rises to
        // afterburnSpeed once the ship is moving at >= 90% of max speed, so
        // below that the burn holds the current speed instead of adding to it.
        this.afterburning = !this.autopilot && actions.afterburner && this.save.player.fuel > 0.5;
        if (this.autopilot) {
            if (this.hyperdriveEncounterAt !== null && this.save.world.time >= this.hyperdriveEncounterAt) {
                this.hyperdriveEncounterAt = null;
                this.spawnHyperdriveIntercept();
            }
            if (this.hostilesVisibleNear(position, HYPERDRIVE_THREAT_RADIUS)) {
                this.autopilot = false;
                this.hyperdriveEncounterAt = null;
                this.hyperdriveFx = 'interrupt';
                this.hyperdriveFxUntil = this.save.world.time + HYPERDRIVE_INTERRUPT_DURATION;
                this.snapToCombatSpeed();
                this.save.player.throttle = clamp(this.hyperdriveReturnThrottle, 0, 1);
                // Re-sync the local velocity: it was captured before the break, so
                // otherwise the stale cruise vector would overwrite the combat-speed snap.
                velocity.copy(vec(this.save.player.velocity));
                this.setHyperdriveStatus(t('HYPERDRIVE BREAK · INTERCEPT'), 4200);
                this.audio.play('hyperDrop');
                this.audio.play('warning');
            }
            else {
                this.steerAutopilot(position, orientation, angularVelocity, dt);
            }
        }
        else {
            // Afterburn doubles turn authority so a boost is also a fight move,
            // not just a straight-line speedup.
            const burnBoost = this.afterburning ? 2 : 1;
            angularVelocity.x += actions.pitch * angularAcceleration * burnBoost * dt;
            angularVelocity.y += -actions.yaw * angularAcceleration * burnBoost * dt;
            angularVelocity.z += -actions.roll * angularAcceleration * burnBoost * dt;
            const dampingRate = stats.angularDamping * (this.save.settings.flightAssist ? 1 : 0.38);
            angularVelocity.multiplyScalar(Math.exp(-dampingRate * dt));
            const deltaRotation = this.tmpQ2.setFromEuler(this.tmpEuler.set(angularVelocity.x * dt, angularVelocity.y * dt, angularVelocity.z * dt, 'XYZ'));
            orientation.multiply(deltaRotation).normalize();
        }
        const forward = this.tmpD.copy(FORWARD).applyQuaternion(orientation).normalize();
        let targetSpeed = this.save.player.throttle * stats.maxSpeed;
        // Speed gate: below 90% of max speed the burn holds the current cruise
        // ceiling (turn move); past it the ceiling rises to afterburnSpeed and
        // the damped acceleration below ramps the boost in smoothly.
        if (this.afterburning && velocity.length() >= 0.9 * stats.maxSpeed)
            targetSpeed = this.save.player.throttle * stats.afterburnSpeed;
        // Apply the wake after selecting the normal/afterburn ceiling so the
        // player gets a readable slingshot in either mode. The small overrun is
        // transient and cannot modify the hull's published ship stats.
        if (draftStrength > 0)
            targetSpeed = Math.min(stats.afterburnSpeed * 1.06, targetSpeed * (1 + draftStrength * 0.06));
        if (this.autopilot) {
            // Charge-up hold: the ship stays put (steering only) while the drive spools,
            // then snaps to full cruise the moment the charge completes. This is the fix
            // for the drive accelerating during the load-up instead of after it.
            targetSpeed = this.hyperdriveFx === 'spooling' ? 0 : HYPERDRIVE_CRUISE_SPEED;
            this.save.player.throttle = 1;
        }
        const forwardSpeed = velocity.dot(forward);
        const lateral = this.tmpE.copy(velocity).addScaledVector(forward, -forwardSpeed);
        const accelerationResponse = acceleration / Math.max(12, stats.maxSpeed);
        // Hyperdrive engages and drops out at full cruise/approach speed instantly.
        const nextForwardSpeed = this.autopilot ? targetSpeed : damp(forwardSpeed, targetSpeed, accelerationResponse * 2.2, dt);
        if (this.autopilot) {
            // Cruise keeps the ship locked on its vector; lateral drift is a manual-flight term.
            velocity.copy(forward).multiplyScalar(nextForwardSpeed);
        }
        else {
            lateral.multiplyScalar(Math.exp(-(this.save.settings.flightAssist ? 1.45 : 0.16) * dt));
            velocity.copy(forward).multiplyScalar(nextForwardSpeed).add(lateral);
        }
        // Fuel is afterburner propellant and nothing else: normal flight and
        // the hyperdrive cruise never touch it. Running dry only kills the burn.
        if (this.afterburning)
            this.save.player.fuel = Math.max(0, this.save.player.fuel - dt * 1.025 * (this.raceDraftFuelMultiplier ?? 1));
        if (this.save.player.fuel <= 0)
            this.afterburning = false;
        let hyperdriveDropped = false;
        let hyperdriveArrived = false;
        if (this.autopilot && this.hyperdriveFx !== 'spooling') {
            // Predictive drop: settle exactly on the arrival sphere this frame instead of
            // overshooting it by up to a full frame step at 50000 u/s cruise.
            const nav = LOCATIONS[this.save.player.navTargetId];
            const arrivalRadius = hyperdriveArrivalRadius(nav);
            const navPos = this.tmpD.set(nav.position[0], nav.position[1], nav.position[2]);
            const approach = position.distanceTo(navPos);
            if (approach - arrivalRadius <= velocity.length() * dt) {
                const outward = nav.kind === 'jump-point'
                    ? this.tmpE.copy(navPos).normalize()
                    : this.tmpE.copy(position).sub(navPos).normalize();
                if (outward.lengthSq() < 0.0001)
                    outward.set(0, 0, 1);
                if (nav.kind === 'field' || nav.kind === 'graveyard' || nav.kind === 'rings')
                    this.setFieldEntryPosition(position, nav.id, outward);
                else {
                    position.copy(navPos).addScaledVector(outward, arrivalRadius + (nav.kind === 'jump-point' ? 0 : 8));
                    if (nav.kind === 'jump-point')
                        orientation.setFromUnitVectors(FORWARD, this.tmpF.copy(outward).negate());
                    // Arrival is a spawn event too. Check the destination
                    // instance, not just the source instance currently used by
                    // the obstacle grid.
                    this.ensurePlayerEntryClearance(position, nav.id, outward);
                }
                velocity.set(0, 0, 0);
                hyperdriveDropped = true;
            }
        }
        position.addScaledVector(velocity, dt);
        this.resolvePlayerCollisions(position, velocity);
        const pp = this.save.player.position;
        if (Number.isFinite(position.x) && Number.isFinite(position.y) && Number.isFinite(position.z)) {
            pp[0] = position.x; pp[1] = position.y; pp[2] = position.z;
            const pv = this.save.player.velocity;
            pv[0] = velocity.x; pv[1] = velocity.y; pv[2] = velocity.z;
        }
        else {
            // Belt-and-braces for the guard above: hold last known good state
            // instead of ever committing non-finite transforms to the save.
            position.set(pp[0], pp[1], pp[2]);
            velocity.set(0, 0, 0);
        }
        quatTupleInto(this.save.player.rotation, orientation);
        const pa = this.save.player.angularVelocity;
        pa[0] = angularVelocity.x; pa[1] = angularVelocity.y; pa[2] = angularVelocity.z;
        const nav = LOCATIONS[this.save.player.navTargetId];
        const np = nav.position;
        const navDistance = Math.hypot(position.x - np[0], position.y - np[1], position.z - np[2]);
        const arrivalRadius = hyperdriveArrivalRadius(nav);
        if (this.autopilot && (hyperdriveDropped || navDistance <= arrivalRadius + 10)) {
            hyperdriveArrived = true;
            if (!hyperdriveDropped) {
                const outward = this.tmpD.copy(position).sub(this.tmpE.set(nav.position[0], nav.position[1], nav.position[2])).normalize();
                if (nav.kind === 'field' || nav.kind === 'graveyard' || nav.kind === 'rings')
                    this.setFieldEntryPosition(position, nav.id, outward);
                else
                    this.ensurePlayerEntryClearance(position, nav.id, outward);
                this.save.player.position = tuple(position);
            }
            this.autopilot = false;
            this.hyperdriveEncounterAt = null;
            this.hyperdriveFx = 'drop';
            this.hyperdriveFxUntil = this.save.world.time + HYPERDRIVE_FX_DURATION;
            this.save.player.throttle = clamp(this.hyperdriveReturnThrottle, 0, 1);
            this.save.player.velocity = tuple(FORWARD.clone().applyQuaternion(orientation).multiplyScalar(10));
            this.resetPlayerInterpolation();
            this.setHyperdriveStatus(t('ARRIVAL · {name}', { name: nav.name }), 3400);
            this.audio.play('hyperDrop');
        }
        let armedThisStep = false;
        if (!this.armedJumpPointId) {
            const jumpPoint = this.readyJumpPoint(position);
            if (jumpPoint) {
                armedThisStep = this.startGalaxyJump(jumpPoint);
                // A manual pilot can enter and cross the aperture in one fixed
                // step, so preserve the side from the start of the step. A
                // local-hyperdrive arrival is different: it must stop at the
                // 1 km approach point and never count as a gate crossing.
                const previous = this.save.player.prevPosition;
                if (armedThisStep && previous && !hyperdriveArrived) {
                    const normal = this.jumpPointNormal(jumpPoint);
                    this.armedJumpPointSide = (previous[0] - jumpPoint.position[0]) * normal.x
                        + (previous[1] - jumpPoint.position[1]) * normal.y
                        + (previous[2] - jumpPoint.position[2]) * normal.z;
                }
            }
        }
        if (this.armedJumpPointId && !(armedThisStep && hyperdriveArrived))
            this.checkArmedGalaxyGateCrossing(position);
    }
    steerAutopilot(position, orientation, angularVelocity, dt) {
        const nav = LOCATIONS[this.save.player.navTargetId];
        const desired = this.tmpD.set(nav.position[0], nav.position[1], nav.position[2]).sub(position).normalize();
        const avoidance = this.getAvoidanceVector(position, desired, 65);
        desired.add(avoidance.multiplyScalar(0.85)).normalize();
        // Point the ship at the vector without rolling: keep the up axis as close to
        // world-up as possible, and take the full spool to settle rather than snapping.
        const right = this.tmpE.crossVectors(desired, UP);
        if (right.lengthSq() < 1e-6)
            right.set(1, 0, 0);
        right.normalize();
        const up = this.tmpF.crossVectors(right, desired).normalize();
        this.tmpQ2.setFromRotationMatrix(this.tmpM4.makeBasis(right, up, this.tmpG.copy(desired).negate()));
        orientation.slerp(this.tmpQ2, 1 - Math.exp(-1.15 * dt));
        angularVelocity.multiplyScalar(Math.exp(-4.8 * dt));
    }
    resolvePlayerCollisions(position, velocity) {
        // The player's collision envelope follows the outfitted hull: an
        // oriented ellipsoid with the GLB hull's half-extents in the ship
        // frame, scaled by PLAYER_COLLISION_FORGIVENESS so near-misses that
        // look like they clear usually do (the wide Talon sweep still counts).
        // Every contact test lives in hullCollision.js — the same module the
        // NPCs use — so the player and the ships share one geometry.
        const hullExtents = this.playerHullExtents();
        if (!(this.collisionShipQuat instanceof THREE.Quaternion))
            this.collisionShipQuat = new THREE.Quaternion();
        if (!(this.collisionShipQuatInv instanceof THREE.Quaternion))
            this.collisionShipQuatInv = new THREE.Quaternion();
        const shipQuat = quat(this.save.player.rotation, this.collisionShipQuat);
        const shipQuatInv = this.collisionShipQuatInv.copy(shipQuat).invert();
        const contact = this.tmpCollisionContact ?? (this.tmpCollisionContact = { x: 0, y: 0, z: 0, push: 0 });
        const resolveContact = (label) => {
            // Degenerate contacts (a spawn buried deep in a rock, zero-length
            // normals) used to poison position/velocity with NaN and take the
            // whole sim down with it. Skip instead of solve.
            if (!Number.isFinite(contact.x) || !Number.isFinite(contact.y) || !Number.isFinite(contact.z) || !Number.isFinite(contact.push))
                return;
            position.x += contact.x * contact.push;
            position.y += contact.y * contact.push;
            position.z += contact.z * contact.push;
            const impactSpeed = Math.max(0, -(velocity.x * contact.x + velocity.y * contact.y + velocity.z * contact.z)) + velocity.length() * 0.16;
            velocity.reflect(this.tmpCollide.set(contact.x, contact.y, contact.z)).multiplyScalar(0.32);
            if (impactSpeed > 4) {
                this.damagePlayer((impactSpeed - 3) * 1.65, label);
                if (this.collisionMessageCooldown <= 0) {
                    this.collisionMessageCooldown = 1.4;
                    this.ui.pushEvent(t('Collision: {label}', { label: t(label) }), 'danger');
                }
            }
            this.autopilot = false;
        };
        const dock = this.activeDockObstacle();
        if (dock) {
            if (hullVsSphere(position, hullExtents, shipQuatInv, dock.x, dock.y, dock.z, dock.collisionRadius, contact))
                resolveContact(LOCATIONS[dock.id].name);
        }
        else {
            const margin = MAX_FIELD_OBSTACLE_RADIUS;
            const label = this.activeInstanceId === 'shardbelt' ? 'asteroid' : 'wreckage';
            this.forEachObstacleInBox(position.x - margin, position.y - margin, position.z - margin, position.x + margin, position.y + margin, position.z + margin, (obstacle) => {
                let hit = false;
                if (obstacle.shape === 'ring')
                    hit = hullVsRing(position, hullExtents, shipQuatInv, obstacle, contact);
                else if (obstacle.shape === 'engine')
                    hit = hullVsEngine(position, hullExtents, shipQuatInv, obstacle, contact);
                else if (obstacle.shape === 'asteroid') {
                    const mesh = obstacle.meshVerts;
                    if (!this.asteroidScratch || this.asteroidScratch.length < mesh.length)
                        this.asteroidScratch = new Float32Array(mesh.length);
                    hit = hullVsAsteroid(position, hullExtents, shipQuat, shipQuatInv, obstacle, this.asteroidScratch, contact);
                }
                else if (obstacle.box)
                    hit = hullVsBox(position, hullExtents, shipQuatInv, obstacle, contact);
                else
                    hit = hullVsSphere(position, hullExtents, shipQuatInv, obstacle.x, obstacle.y, obstacle.z, obstacle.collisionRadius, contact);
                if (hit)
                    resolveContact(label);
            });
        }
    }

    updatePlayerWeapons(dt, actions) {
        this.utilityActive = false;
        this.utilityReadout = '';
        if (!Number.isFinite(Number(this.save.player.energy)))
            this.save.player.energy = this.playerStats().energyCapacity;
        // Keep the persisted group and the compatibility projection aligned
        // before the PDC heat/interception pass and before a trigger edge. A
        // refit can leave the selected group empty, in which case the other
        // non-empty group is the only legal firing source.
        this.syncWeaponProjection();
        const loadout = this.save.player.outfitting?.loadouts?.[this.save.player.shipId];
        const spec = HULL_HARDPOINTS[this.save.player.shipId];
        let pdcMounted = false;
        let pdcActive = false;
        if (loadout && spec) {
            const activeGroup = loadout.fireGroups?.activeGroup === 'B' ? 'B' : 'A';
            for (const [index, mount] of spec.guns.entries()) {
                const weaponId = weaponIdForOutfit(loadout.guns?.[index]);
                if (weaponId !== 'pdc')
                    continue;
                pdcMounted = true;
                if ((loadout.fireGroups?.assignments?.[mount.id] ?? 'A') === activeGroup)
                    pdcActive = true;
            }
        }
        // Keep lightweight legacy/arena harnesses usable while hydrated career
        // saves use only mounted hardpoints.
        if (!loadout && this.save.player.weaponId === 'pdc')
            pdcMounted = pdcActive = true;
        // Point-Defense Cluster heat: sustained fire builds pressure, 3.5s of
        // continuous trigger forces a 1.6s vent, off-trigger cools. Pressure
        // is session state — it means nothing between flights.
        if (pdcMounted) {
            this.pdcHeat ??= 0;
            this.pdcVentUntil ??= 0;
            if (this.save.world.time < this.pdcVentUntil) {
                if (actions.fire && !this.pdcVentAnnounced) {
                    this.setOwnMonitorStatus(t('PDC VENTING'), 1400);
                    this.pdcVentAnnounced = true;
                }
            }
            else if (pdcActive && actions.fire) {
                this.pdcHeat += dt;
                if (this.pdcHeat >= 3.5) {
                    this.pdcVentUntil = this.save.world.time + 1.6;
                    this.pdcVentAnnounced = false;
                    this.audio.play('warning', 0.4);
                }
            }
            else
                this.pdcHeat = Math.max(0, this.pdcHeat - dt * 0.8);
            // Passive interception remains live even while another group is
            // selected; venting pauses the tracker while the barrels cool.
            if (this.save.world.time >= (this.pdcInterceptAt ?? 0) && this.save.world.time >= (this.pdcVentUntil ?? 0)) {
                let bestMissile = null;
                let bestDistance = 60;
                for (const projectile of this.projectiles) {
                    if (projectile.ownerId === 'player' || projectile.kind !== 'missile' || projectile.life <= 0)
                        continue;
                    const p = this.projStore.getPos(projectile.slot, this.tmpP5);
                    const dxp = p.x - this.save.player.position[0];
                    const dyp = p.y - this.save.player.position[1];
                    const dzp = p.z - this.save.player.position[2];
                    const distance = Math.sqrt(dxp * dxp + dyp * dyp + dzp * dzp);
                    if (distance < bestDistance) {
                        bestDistance = distance;
                        bestMissile = { projectile, x: p.x, y: p.y, z: p.z };
                    }
                }
                if (bestMissile && spendEnergy(this.save.player, WEAPONS.pdc.energyCost ?? 0)) {
                    this.pdcInterceptAt = this.save.world.time + 0.25;
                    bestMissile.projectile.life = 0;
                    this.renderer.spawnExplosion([bestMissile.x, bestMissile.y, bestMissile.z], true, 0.5);
                    this.audio.play('impact', 0.55);
                }
            }
        }
        else {
            this.pdcHeat = Math.max(0, (this.pdcHeat ?? 0) - dt * 2);
        }
        if (actions.fire && this.gunCooldown <= 0)
            this.firePlayerGuns();
        if (this.save.player.mode === 'combat') {
            this.renderer.setUtilityBeam(false, 'combat', this.save.player.position);
            return;
        }
        this.updateUtilityTool(dt, actions.utility);
    }
    ensureRuntimeFireGroups() {
        const player = this.save.player;
        const loadout = player.outfitting?.loadouts?.[player.shipId];
        const spec = HULL_HARDPOINTS[player.shipId];
        if (!loadout || !spec)
            return;
        loadout.fireGroups ??= { activeGroup: 'A', assignments: {} };
        loadout.fireGroups.assignments ??= {};
        let hasA = false;
        let hasB = false;
        for (const [index, mount] of spec.guns.entries()) {
            if (!weaponIdForOutfit(loadout.guns?.[index]))
                continue;
            if (loadout.fireGroups.assignments[mount.id] === 'B')
                hasB = true;
            else
                hasA = true;
        }
        const active = loadout.fireGroups.activeGroup === 'B' ? 'B' : 'A';
        // Never rewrite a deliberate all-A/all-B fitting. Only redirect an
        // active group when that group is actually empty, so an untouched
        // legacy/default loadout still fires while user assignments persist.
        if (active === 'B' && !hasB && hasA)
            loadout.fireGroups.activeGroup = 'A';
        else if (active === 'A' && !hasA && hasB)
            loadout.fireGroups.activeGroup = 'B';
    }
    activeFireGroup() {
        const group = this.save.player.outfitting?.loadouts?.[this.save.player.shipId]?.fireGroups?.activeGroup;
        return group === 'B' ? 'B' : 'A';
    }
    syncWeaponProjection() {
        const player = this.save.player;
        const loadout = player.outfitting?.loadouts?.[player.shipId];
        const spec = HULL_HARDPOINTS[player.shipId];
        if (loadout && spec) {
            let active = this.activeFireGroup();
            let activeWeapon;
            for (const [index, mount] of spec.guns.entries()) {
                if ((loadout.fireGroups?.assignments?.[mount.id] ?? 'A') !== active)
                    continue;
                const weaponId = weaponIdForOutfit(loadout.guns?.[index]);
                if (weaponId && WEAPONS[weaponId]) {
                    activeWeapon = weaponId;
                    break;
                }
            }
            if (!activeWeapon) {
                const other = active === 'A' ? 'B' : 'A';
                for (const [index, mount] of spec.guns.entries()) {
                    if ((loadout.fireGroups?.assignments?.[mount.id] ?? 'A') !== other)
                        continue;
                    const weaponId = weaponIdForOutfit(loadout.guns?.[index]);
                    if (weaponId && WEAPONS[weaponId]) {
                        // A fitting can empty the selected group. Follow the
                        // remaining group automatically; only A+B empty keeps
                        // the explicit no-gun state.
                        loadout.fireGroups.activeGroup = other;
                        active = other;
                        activeWeapon = weaponId;
                        break;
                    }
                }
            }
            if (activeWeapon) {
                player.weaponId = activeWeapon;
                this.activeGroupEmpty = false;
                return activeWeapon;
            }
            // No mounted gun is a real state (for example while a pilot is
            // rebuilding a hull). Leave the compatibility projection empty so
            // paused/HUD views cannot advertise a phantom pulse laser.
            player.weaponId = undefined;
            this.activeGroupEmpty = true;
            return undefined;
        }
        this.activeGroupEmpty = false;
        return player.weaponId;
    }
    currentWeapon() {
        const projected = this.syncWeaponProjection();
        if (!projected && this.activeGroupEmpty)
            return undefined;
        return WEAPONS[projected] ?? WEAPONS.pulse;
    }
    // Weapon switches are EDGE actions: handleActions runs once per frame from
    // frame(), so a multi-step frame cannot double-fire and a zero-step frame
    // (120 Hz display) cannot drop the tap. In the hardpoint model a switch
    // selects the fire group containing the requested mounted gun.
    switchWeapon(selection) {
        const player = this.save.player;
        const loadout = player.outfitting?.loadouts?.[player.shipId];
        const spec = HULL_HARDPOINTS[player.shipId];
        if (selection === 'A' || selection === 'B') {
            if (!loadout || !spec)
                return;
            let found = false;
            for (const [index, mount] of spec.guns.entries()) {
                if ((loadout.fireGroups?.assignments?.[mount.id] ?? 'A') !== selection)
                    continue;
                if (weaponIdForOutfit(loadout.guns?.[index])) {
                    found = true;
                    break;
                }
            }
            if (!found) {
                this.setOwnMonitorStatus(t('FIRE GROUP EMPTY'), 1600);
                return;
            }
            loadout.fireGroups ??= { activeGroup: 'A', assignments: {} };
            loadout.fireGroups.activeGroup = selection;
            const weaponId = this.syncWeaponProjection();
            const weapon = WEAPONS[weaponId];
            this.gunCooldown = Math.max(this.gunCooldown, 0.12);
            if (weapon)
                this.setOwnMonitorStatus(t('WEAPON · {name}', { name: t(weapon.nameKey) }), 1600);
            this.audio.play('ui', 0.7);
            return;
        }
        const weapon = typeof selection === 'number' ? weaponForSlot(selection) : WEAPONS[selection];
        if (!weapon)
            return;
        if (loadout && spec) {
            let selectedGroup;
            for (const [index, mount] of spec.guns.entries()) {
                if (weaponIdForOutfit(loadout.guns?.[index]) === weapon.id) {
                    selectedGroup = loadout.fireGroups?.assignments?.[mount.id] === 'B' ? 'B' : 'A';
                    break;
                }
            }
            if (!selectedGroup) {
                this.setOwnMonitorStatus(t('{weapon} NOT INSTALLED', { weapon: t(weapon.nameKey) }), 2000);
                this.audio.play('warning', 0.5);
                return;
            }
            loadout.fireGroups ??= { activeGroup: 'A', assignments: {} };
            loadout.fireGroups.activeGroup = selectedGroup;
            this.syncWeaponProjection();
        }
        else if (!weaponOwned(player, weapon.id)) {
            this.setOwnMonitorStatus(t('{weapon} NOT INSTALLED', { weapon: t(weapon.nameKey) }), 2000);
            this.audio.play('warning', 0.5);
            return;
        }
        player.weaponId = weapon.id;
        this.gunCooldown = Math.max(this.gunCooldown, 0.12);
        this.setOwnMonitorStatus(t('WEAPON · {name}', { name: t(weapon.nameKey) }), 1600);
        this.ui.pushEvent(`${t('WEAPON · {name}', { name: t(weapon.nameKey) })} — ${t(weapon.envelopeKey, { range: Math.round(weapon.speed * weapon.life) })}`, 'info', 4200);
        this.audio.play('ui', 0.7);
    }
    // Tap the weapon readout (or press X / gamepad cycle). Prefer the two
    // authored fire groups; the old weapon roster remains a fallback for
    // imported lightweight harnesses without outfitting state.
    cycleWeapon() {
        const loadout = this.save.player.outfitting?.loadouts?.[this.save.player.shipId];
        const spec = HULL_HARDPOINTS[this.save.player.shipId];
        if (loadout && spec) {
            const other = this.activeFireGroup() === 'A' ? 'B' : 'A';
            for (const [index, mount] of spec.guns.entries()) {
                if ((loadout.fireGroups?.assignments?.[mount.id] ?? 'A') === other && weaponIdForOutfit(loadout.guns?.[index])) {
                    this.switchWeapon(other);
                    return;
                }
            }
            return;
        }
        const index = WEAPON_ORDER.indexOf(this.save.player.weaponId);
        this.switchWeapon(WEAPON_ORDER[(index + 1) % WEAPON_ORDER.length]);
    }
    // 2D cone spread with a gaussian-clumped center: the old single-axis tilt
    // fanned pellets vertically only (the roll around the direction axis was
    // a no-op — a vector rotated about itself is itself). The offset now
    // spreads evenly around the compass with density falling toward the cone
    // edge, seeded for headless reproducibility. Allocation-free: `out` and
    // `right`/`up` are caller-owned scratches.
    spreadDirection(direction, right, up, spread, rng, out) {
        const angle = rng() * Math.PI * 2;
        const radius = ((rng() + rng() + rng()) / 1.5 - 1) * spread;
        return out.copy(direction)
            .addScaledVector(right, Math.cos(angle) * radius)
            .addScaledVector(up, Math.sin(angle) * radius)
            .normalize();
    }
    firePlayerGuns() {
        return this.fireMountedPlayerGuns();
    }
    weaponAimDirection(position, velocity, weapon, target, baseDirection, out) {
        out.copy(baseDirection);
        if (!this.save.settings.aimAssist || target?.kind !== 'ship')
            return out;
        const ship = this.ships.find((entry) => entry.id === target.id);
        if (!ship)
            return out;
        const r = this.tmpP3.set(ship.position[0] - position.x, ship.position[1] - position.y, ship.position[2] - position.z);
        const distance = r.length();
        const sv = ship.velocity;
        const w = this.tmpP4.set(sv[0] - velocity[0], sv[1] - velocity[1], sv[2] - velocity[2]);
        const speed = weapon.speed;
        let intercept = distance / speed;
        const a = w.lengthSq() - speed * speed;
        if (Math.abs(a) > 1e-8) {
            const rw = r.dot(w);
            const discriminant = rw * rw - a * distance * distance;
            if (discriminant >= 0) {
                const root = Math.sqrt(discriminant);
                const first = (-rw - root) / a;
                const second = (-rw + root) / a;
                if (first > 0)
                    intercept = first;
                if (second > 0 && second < intercept)
                    intercept = second;
            }
        }
        const assisted = this.tmpP0.copy(r).addScaledVector(w, intercept).normalize();
        if (out.angleTo(assisted) < 0.18 * weapon.assist)
            out.lerp(assisted, 0.34).normalize();
        return out;
    }
    spawnPlayerGunProjectile(weapon, direction, muzzleX, muzzleY, muzzleZ, velocity, targetId, mountId) {
        const slot = this.projStore.alloc();
        this.projStore.setPos(slot, muzzleX, muzzleY, muzzleZ);
        const shotVel = this.tmpP0.copy(direction).multiplyScalar(weapon.speed).add(this.tmpP3.set(velocity[0], velocity[1], velocity[2]));
        this.projStore.setVel(slot, shotVel.x, shotVel.y, shotVel.z);
        const projectile = {
            id: `p-${++this.projectileCounter}`,
            kind: weapon.kind,
            ownerId: 'player',
            slot,
            damage: weapon.damageFlat ?? this.playerStats().gunDamage * weapon.damageMul,
            life: weapon.life,
            targetId,
            faction: 'player',
            weaponId: weapon.id,
            mountId,
        };
        if (weapon.pierce)
            projectile.pierce = weapon.pierce;
        if (weapon.splashRadius !== undefined)
            projectile.splashRadius = weapon.splashRadius;
        if (weapon.splashMin !== undefined)
            projectile.splashMin = weapon.splashMin;
        if (weapon.burnDps !== undefined)
            projectile.burnDps = weapon.burnDps;
        if (weapon.burnSeconds !== undefined)
            projectile.burnSeconds = weapon.burnSeconds;
        this.projectiles.push(projectile);
    }
    fireMountedPlayerGuns() {
        const stats = this.playerStats();
        const player = this.save.player;
        if (!Number.isFinite(Number(player.energy)))
            player.energy = stats.energyCapacity;
        const loadout = player.outfitting?.loadouts?.[player.shipId];
        const spec = HULL_HARDPOINTS[player.shipId];
        this.syncWeaponProjection();
        const activeGroup = this.activeFireGroup();
        const position = vec(player.position, this.tmpP1);
        const orientation = quat(player.rotation, this.tmpPlayerOrientation);
        const baseDirection = this.tmpP2.copy(FORWARD).applyQuaternion(orientation).normalize();
        const right = this.tmpP5.copy(RIGHT).applyQuaternion(orientation).normalize();
        const velocity = player.velocity;
        const target = this.getTargetRef();
        const targetId = target?.kind === 'ship' ? target.id : undefined;
        player.ammo ??= {};
        if (!loadout || !spec) {
            // Compatibility path for hand-built combat probes. Career saves
            // always normalize before flight and use mounted hardpoints below.
            const weapon = this.currentWeapon();
            if (!weapon) {
                this.setOwnMonitorStatus(t('NO WEAPON INSTALLED'), 1600);
                this.gunCooldown = 0.3;
                return;
            }
            if (!weaponOwned(player, weapon.id)) {
                this.setOwnMonitorStatus(t('{weapon} NOT INSTALLED', { weapon: t(weapon.nameKey) }), 2000);
                this.gunCooldown = 0.3;
                return;
            }
            if (weapon.ammoId && (player.ammo[weapon.ammoId] ?? 0) <= 0) {
                this.setOwnMonitorStatus(t('{weapon} EMPTY — SWAP', { weapon: t(weapon.nameKey) }), 1600);
                this.gunCooldown = 0.3;
                return;
            }
            const direction = this.weaponAimDirection(position, velocity, weapon, target, baseDirection, this.tmpP6);
            if (!spendEnergy(player, weapon.energyCost ?? 0)) {
                this.setOwnMonitorStatus(t('CAPACITOR LOW'), 1200);
                this.gunCooldown = 0.12;
                return;
            }
            const anchor = SHIP_MOUNT_ANCHORS[player.shipId]?.guns?.[0] ?? [0, -0.6, -2.8];
            const muzzle = this.tmpP0.set(anchor[0], anchor[1], anchor[2]).applyQuaternion(orientation).add(position);
            this.renderer.spawnMuzzleFlash(muzzle.x, muzzle.y, muzzle.z, weapon.kind === 'gauss' ? 0xbfe9ff : 0xffc35a);
            this.spawnPlayerGunProjectile(weapon, direction, muzzle.x, muzzle.y, muzzle.z, velocity, targetId, `${player.shipId}-gun-0`);
            if (weapon.ammoId)
                player.ammo[weapon.ammoId] -= 1;
            this.gunCooldown = weapon.cooldown;
            this.audio.play(weapon.audioKey, weapon.kind === 'gauss' ? 0.85 : 0.72);
            return;
        }
        let fired = false;
        let slowestCooldown = 0;
        let firstWeapon;
        for (const [index, mount] of spec.guns.entries()) {
            if ((loadout.fireGroups?.assignments?.[mount.id] ?? 'A') !== activeGroup)
                continue;
            const weaponId = weaponIdForOutfit(loadout.guns?.[index]);
            const weapon = weaponId ? WEAPONS[weaponId] : undefined;
            if (!weapon)
                continue;
            if (weapon.kind === 'pdc' && this.save.world.time < (this.pdcVentUntil ?? 0))
                continue;
            const ammoId = weapon.ammoId;
            if (ammoId && (player.ammo[ammoId] ?? 0) <= 0)
                continue;
            if (!spendEnergy(player, weapon.energyCost ?? 0))
                continue;
            const direction = this.weaponAimDirection(position, velocity, weapon, target, baseDirection, this.tmpP6);
            const localAnchor = SHIP_MOUNT_ANCHORS[player.shipId]?.guns?.[index] ?? [0, -0.6, -2.8];
            const anchorWorld = this.tmpP0.set(localAnchor[0], localAnchor[1], localAnchor[2]).applyQuaternion(orientation).add(position);
            const anchorX = anchorWorld.x;
            const anchorY = anchorWorld.y;
            const anchorZ = anchorWorld.z;
            if (weapon.kind === 'pdc') {
                const rng = seededRandom(`${this.save.world.seed}:wpn:${Math.floor(this.save.world.time * 1000)}:${this.projectileCounter}:${mount.id}`);
                const up = this.tmpP3.copy(UP).applyQuaternion(orientation);
                const bolt = this.spreadDirection(direction, right, up, weapon.spreadRad ?? 0, rng, this.tmpP0);
                const muzzleX = anchorX + bolt.x * 0.35;
                const muzzleY = anchorY + bolt.y * 0.35;
                const muzzleZ = anchorZ + bolt.z * 0.35;
                this.renderer.spawnMuzzleFlash(muzzleX, muzzleY, muzzleZ, 0xcfe4ff);
                this.spawnPlayerGunProjectile(weapon, bolt, muzzleX, muzzleY, muzzleZ, velocity, targetId, mount.id);
            }
            else if (weapon.kind === 'ripper') {
                const rng = seededRandom(`${this.save.world.seed}:wpn:${Math.floor(this.save.world.time * 1000)}:${this.projectileCounter}:${mount.id}`);
                const up = this.tmpP3.copy(UP).applyQuaternion(orientation);
                const pelletCount = weapon.pellets ?? 7;
                for (let pellet = 0; pellet < pelletCount; pellet += 1) {
                    const pelletDirection = this.spreadDirection(direction, right, up, weapon.spreadRad ?? 0, rng, this.tmpP0);
                    const pelletSpeed = weapon.speed + (rng() - 0.5) * 2 * (weapon.speedJitter ?? 0);
                    const muzzleX = anchorX + pelletDirection.x * 0.35;
                    const muzzleY = anchorY + pelletDirection.y * 0.35;
                    const muzzleZ = anchorZ + pelletDirection.z * 0.35;
                    if (pellet === 0)
                        this.renderer.spawnMuzzleFlash(muzzleX, muzzleY, muzzleZ, 0xffc9a0);
                    const slot = this.projStore.alloc();
                    this.projStore.setPos(slot, muzzleX, muzzleY, muzzleZ);
                    this.projStore.setVel(slot, pelletDirection.x * pelletSpeed + velocity[0], pelletDirection.y * pelletSpeed + velocity[1], pelletDirection.z * pelletSpeed + velocity[2]);
                    this.projectiles.push({ id: `p-${++this.projectileCounter}`, kind: weapon.kind, ownerId: 'player', slot, damage: stats.gunDamage * weapon.damageMul, life: weapon.life, targetId, faction: 'player', weaponId: weapon.id, mountId: mount.id });
                }
            }
            else {
                const color = weapon.kind === 'gauss' ? 0xbfe9ff : weapon.kind === 'ion' ? 0x9be8f2 : weapon.kind === 'mortar' ? 0xffb066 : 0xffc35a;
                this.renderer.spawnMuzzleFlash(anchorX, anchorY, anchorZ, color);
                this.spawnPlayerGunProjectile(weapon, direction, anchorX, anchorY, anchorZ, velocity, targetId, mount.id);
            }
            if (ammoId)
                player.ammo[ammoId] = Math.max(0, (player.ammo[ammoId] ?? 0) - 1);
            fired = true;
            firstWeapon ??= weapon;
            slowestCooldown = Math.max(slowestCooldown, weapon.cooldown);
        }
        if (!fired) {
            const weapon = this.currentWeapon();
            if (weapon?.ammoId && (player.ammo[weapon.ammoId] ?? 0) <= 0)
                this.setOwnMonitorStatus(t('{weapon} EMPTY — SWAP', { weapon: t(weapon.nameKey) }), 1600);
            else if ((player.energy ?? 0) < (weapon?.energyCost ?? 0))
                this.setOwnMonitorStatus(t('CAPACITOR LOW'), 1200);
            return;
        }
        this.gunCooldown = slowestCooldown;
        if (firstWeapon)
            this.audio.play(firstWeapon.audioKey, firstWeapon.kind === 'gauss' ? 0.85 : firstWeapon.kind === 'mortar' ? 0.95 : 0.72);
    }
    // Transient target-monitor status: missile and target-cycle errors land on
    // the TARGET monitor's readout line instead of the toast stack.
    setMonitorStatus(message, duration = 2800) {
        // Duration is in milliseconds; save.world.time runs in seconds.
        this.monitorStatus = message;
        this.monitorStatusUntil = this.save.world.time + duration / 1000;
    }
    // Transient own-ship monitor status: the HOLD cell flashes the message
    // (e.g. CARGO FULL) instead of the toast stack for floating-pickup errors.
    setOwnMonitorStatus(message, duration = 2400) {
        // Duration is in milliseconds; save.world.time runs in seconds.
        this.ownMonitorStatus = message;
        this.ownMonitorStatusUntil = this.save.world.time + duration / 1000;
    }
    // Transient hyperdrive-card status: vector set / arrival / break messages
    // render on the identity card's status line while the drive is idle.
    setHyperdriveStatus(message, duration = 3000) {
        this.hyperdriveStatus = message;
        this.hyperdriveStatusUntil = this.save.world.time + duration / 1000;
    }
    fireMissile() {
        return this.fireMountedMissiles();
    }
    fireMountedMissiles() {
        const player = this.save.player;
        if (player.mode !== 'combat') {
            this.setMonitorStatus(t('MISSILES: COMBAT MODE ONLY'));
            return;
        }
        if (this.missileCooldown > 0)
            return;
        const loadout = player.outfitting?.loadouts?.[player.shipId];
        const spec = HULL_HARDPOINTS[player.shipId];
        if (!loadout || !spec || !spec.launchers.length) {
            this.setMonitorStatus(t('NO MISSILE RACK INSTALLED'));
            return;
        }
        const target = this.getTargetRef();
        if (!target || target.kind !== 'ship') {
            this.setMonitorStatus(t('NO SHIP TARGET LOCKED'));
            return;
        }
        const ship = this.ships.find((entry) => entry.id === target.id);
        if (!ship || ship.hull <= 0)
            return;
        if (player.missiles <= 0) {
            this.setMonitorStatus(t('MISSILE RACK EMPTY'));
            return;
        }
        const position = vec(player.position, this.tmpP1);
        const orientation = quat(player.rotation, this.tmpPlayerOrientation);
        const baseDirection = this.tmpP2.copy(FORWARD).applyQuaternion(orientation).normalize();
        const right = this.tmpP5.copy(RIGHT).applyQuaternion(orientation).normalize();
        const velocity = player.velocity;
        let fired = false;
        let slowestCooldown = 0;
        for (const [index, mount] of spec.launchers.entries()) {
            if (player.missiles <= 0)
                break;
            const launcherId = launcherIdForOutfit(loadout.launchers?.[index]);
            const launcher = launcherId ? LAUNCHERS[launcherId] : undefined;
            if (!launcher)
                continue;
            const localAnchor = SHIP_MOUNT_ANCHORS[player.shipId]?.launchers?.[index] ?? [0, -0.6, -1.8];
            const anchorWorld = this.tmpP0.set(localAnchor[0], localAnchor[1], localAnchor[2]).applyQuaternion(orientation).add(position);
            const anchorX = anchorWorld.x;
            const anchorY = anchorWorld.y;
            const anchorZ = anchorWorld.z;
            const rng = seededRandom(`${this.save.world.seed}:launcher:${Math.floor(this.save.world.time * 1000)}:${this.projectileCounter}:${mount.id}`);
            const volley = Math.max(1, launcher.volley ?? 1);
            for (let micro = 0; micro < volley; micro += 1) {
                let direction = this.tmpP6.copy(baseDirection);
                if (launcher.spreadRad) {
                    const up = this.tmpP3.copy(UP).applyQuaternion(orientation);
                    direction = this.spreadDirection(direction, right, up, launcher.spreadRad, rng, this.tmpP0);
                }
                const slot = this.projStore.alloc();
                const muzzleX = anchorX + direction.x * 0.45;
                const muzzleY = anchorY + direction.y * 0.45;
                const muzzleZ = anchorZ + direction.z * 0.45;
                this.projStore.setPos(slot, muzzleX, muzzleY, muzzleZ);
                const missileVelocity = this.tmpP4.copy(direction).multiplyScalar(launcher.speed).add(this.tmpP3.set(velocity[0], velocity[1], velocity[2]));
                this.projStore.setVel(slot, missileVelocity.x, missileVelocity.y, missileVelocity.z);
                this.projectiles.push({
                    id: `p-${++this.projectileCounter}`,
                    kind: 'missile',
                    ownerId: 'player',
                    slot,
                    damage: launcher.damage,
                    life: launcher.life,
                    targetId: ship.id,
                    faction: 'player',
                    weaponId: launcher.id,
                    launcherId: launcher.id,
                    mountId: mount.id,
                    homingSpeed: launcher.homingSpeed,
                    homingTurn: launcher.homingTurn,
                    volleyIndex: micro,
                    splashRadius: launcher.splashRadius,
                    splashMin: launcher.splashMin,
                });
            }
            // One ammunition unit represents one rack firing cycle. A swarm
            // rack's four micro-warheads are a single expensive round.
            player.missiles = Math.max(0, player.missiles - 1);
            fired = true;
            slowestCooldown = Math.max(slowestCooldown, launcher.cooldown);
            this.renderer.spawnMuzzleFlash(anchorX, anchorY, anchorZ, launcher.id === 'torpedo' ? 0xffa65e : 0xff7a42);
        }
        if (!fired)
            return;
        this.missileCooldown = slowestCooldown;
        this.audio.play('missile');
    }
    updateUtilityTool(dt, active) {
        const target = this.getTargetRef();
        const stats = this.playerStats();
        const playerPosition = vec(this.save.player.position, this.tmpShipPlayer);
        const mode = this.save.player.mode;
        const range = mode === 'mining' ? stats.miningRange : stats.salvageRange;
        if (!active || !target || (mode === 'mining' && target.kind !== 'asteroid') || (mode === 'salvage' && target.kind !== 'wreck')) {
            this.renderer.setUtilityBeam(false, mode, this.save.player.position);
            return;
        }
        const distance = this.surfaceDistance(playerPosition, target);
        if (distance > range) {
            this.renderer.setUtilityBeam(false, mode, this.save.player.position);
            this.utilityReadout = t('OUT OF RANGE · {current}/{max} km', { current: Math.round(distance), max: Math.round(range) });
            return;
        }
        if (this.lineBlocked(playerPosition, this.tmpShipPos.set(target.position[0], target.position[1], target.position[2]), target.id)) {
            this.renderer.setUtilityBeam(false, mode, this.save.player.position);
            this.utilityReadout = t('BEAM OBSTRUCTED');
            return;
        }
        if (mode === 'mining') {
            const node = this.asteroids.find((entry) => entry.id === target.id);
            if (!node || node.remaining <= 0)
                return;
            if (!node.scanned) {
                this.requireScanHint();
                return;
            }
            this.utilityActive = true;
            this.renderer.setUtilityBeam(true, mode, this.save.player.position, node.position);
            this.extractAsteroid(node, dt, stats.miningRate);
            if (this.utilitySoundCooldown <= 0) {
                this.utilitySoundCooldown = 0.16;
                this.audio.play('mining', 0.34);
            }
        }
        else {
            const node = this.wreckNodes.find((entry) => entry.id === target.id);
            if (!node || node.remaining <= 0)
                return;
            if (!node.scanned) {
                this.requireScanHint();
                return;
            }
            this.utilityActive = true;
            this.renderer.setUtilityBeam(true, mode, this.save.player.position, node.position);
            this.extractWreck(node, dt, stats.salvageRate);
            if (this.utilitySoundCooldown <= 0) {
                this.utilitySoundCooldown = 0.18;
                this.audio.play('salvage', 0.32);
            }
            this.triggerSalvageAmbush(node);
        }
    }
    requireScanHint() {
        // An unscanned deposit already reads SCANNING… / OUT OF RANGE on
        // the target monitor, so there is nothing extra to pop up here.
        this.renderer.setUtilityBeam(false, this.save.player.mode, this.save.player.position);
    }
    extractAsteroid(node, dt, rate) {
        this.lastExtractionAt = this.save.world.time;
        this.seenWorkingUntil = this.save.world.time + SEEN_WORKING_SECONDS;
        if (cargoFree(this.save.player) < COMMODITIES.ore.mass + 0.001) {
            this.utilityReadout = t('CARGO FULL');
            return;
        }
        const current = this.extractionCarry.get(node.id) ?? 0;
        let next = current + dt * 0.58 * rate;
        while (next >= 1 && node.remaining > 0) {
            next -= 1;
            node.remaining = Math.max(0, node.remaining - 1);
            this.save.world.depletedAsteroids[node.id] = node.remaining;
            // Ore is tractored straight into the hold — no pickup to chase. The
            // monitor's remaining-units count ticks down, so no per-unit toast.
            this.collectExtraction('ore', 'mining', 1);
            this.recordClaimMining(node.id, 1);
            if (node.remaining <= 0) {
                this.strikeGoldPocket(node);
                this.setMonitorStatus(t('DEPOSIT EXHAUSTED'));
                this.clearTarget();
                this.obstacleGridBuiltAt = -Infinity;
                break;
            }
        }
        this.extractionCarry.set(node.id, next);
    }
    extractWreck(node, dt, rate) {
        this.lastExtractionAt = this.save.world.time;
        this.seenWorkingUntil = this.save.world.time + SEEN_WORKING_SECONDS;
        if (cargoFree(this.save.player) < COMMODITIES[node.salvage].mass + 0.001) {
            this.utilityReadout = t('CARGO FULL');
            return;
        }
        const current = this.extractionCarry.get(node.id) ?? 0;
        let next = current + dt * 0.48 * rate;
        while (next >= 1 && node.remaining > 0) {
            next -= 1;
            node.remaining = Math.max(0, node.remaining - 1);
            this.save.world.depletedWrecks[node.id] = node.remaining;
            // Recovered components go straight to the hold — no pickup to chase.
            // The monitor's remaining-recoveries count ticks down, so no per-unit toast.
            this.collectExtraction(node.salvage, 'salvage', 1);
            if (node.remaining <= 0) {
                if (node.salvage === 'electronics' || node.salvage === 'arms')
                    this.recoverWreckEquipment(node);
                this.setMonitorStatus(t('WRECK STRIPPED'));
                this.clearTarget();
                this.obstacleGridBuiltAt = -Infinity;
                break;
            }
        }
        this.extractionCarry.set(node.id, next);
    }
    strikeGoldPocket(node) {
        const rng = seededRandom(`${this.save.world.seed}:gold-pocket:${node.id}`);
        if (rng() >= GOLD_POCKET_CHANCE)
            return;
        const amount = randomInt(rng, GOLD_POCKET_MIN, GOLD_POCKET_MAX);
        const space = Math.floor(cargoFree(this.save.player) / COMMODITIES.gold.mass);
        const grant = Math.min(amount, space);
        if (grant <= 0)
            return;
        this.save.player.cargo.gold = (this.save.player.cargo.gold ?? 0) + grant;
        this.ui.pushEvent(t('Gold pocket struck: +{amount} GOLD.', { amount: grant }), 'success', 5600);
        this.audio.play('success', 1.35);
    }
    collectExtraction(commodity, source, amount) {
        this.save.player.cargo[commodity] = (this.save.player.cargo[commodity] ?? 0) + amount;
        if (source === 'mining') {
            this.save.player.stats.mined += amount;
            const rankMessage = awardCareerProgress(this.save, 'mining', 1, 'frontier-miners');
            if (rankMessage)
                this.ui.pushEvent(rankMessage, 'success', 5000);
        }
        else {
            this.save.player.stats.salvaged += amount;
            const rankMessage = awardCareerProgress(this.save, 'salvage', 1, 'salvage-union');
            if (rankMessage)
                this.ui.pushEvent(rankMessage, 'success', 5000);
        }
    }
    activeMiningClaim(nodeId) {
        return this.save.activeMissions.find((mission) => mission.kind === 'mining' && mission.claimNodeId === nodeId);
    }
    activeMiningClaims() {
        return this.save.activeMissions.filter((mission) => mission.kind === 'mining' && mission.claimNodeId);
    }
    claimNodePosition(nodeId) {
        const live = this.asteroids.find((node) => node.id === nodeId);
        if (live)
            return live.position;
        const mission = this.activeMiningClaim(nodeId);
        if (mission?.claimPosition)
            return mission.claimPosition;
        // Legacy claim without a stored position: derive it from the seeded field.
        const node = generateAsteroidField(this.save.world.seed, this.save.world.depletedAsteroids, this.save.world.scannedNodes).find((entry) => entry.id === nodeId);
        return node?.position;
    }
    recordClaimMining(nodeId, amount) {
        // Ore cut from a staked rock advances that contract's manifest. This is
        // the only way a claim completes — bought ore never moves the needle.
        let fulfilled;
        for (const mission of this.save.activeMissions) {
            if (mission.kind !== 'mining' || mission.claimNodeId !== nodeId)
                continue;
            const before = mission.mined ?? 0;
            mission.mined = Math.min(mission.quantity, before + amount);
            if (before < mission.quantity && mission.mined >= mission.quantity)
                fulfilled = mission;
        }
        if (fulfilled)
            this.ui.pushEvent(t('Claim met: {claim} is dry. Return the ore to {station}.', { claim: fulfilled.claimName ?? fulfilled.claimNodeId, station: LOCATIONS[fulfilled.destination].name }), 'success', 6200);
        if (this.activeMiningClaim(nodeId))
            this.triggerClaimDispute(nodeId);
    }
    triggerClaimDispute(nodeId) {
        // A staked rock occasionally draws a rival prospector who contests the
        // seam mid-cut. Seeded per node and gated to fire once per claim, so the
        // same rock disputes the same way every career.
        if (this.claimDisputesTriggered.has(nodeId))
            return;
        const mission = this.activeMiningClaim(nodeId);
        // The rival doesn't contest the rock the moment the first ore comes off
        // the seam: they only move once the pilot has actually cut into it.
        if (!mission || (mission.mined ?? 0) < CLAIM_DISPUTE_AFTER_UNITS)
            return;
        const rng = seededRandom(`${this.save.world.seed}:claim-dispute:${nodeId}`);
        if (rng() > CLAIM_DISPUTE_CHANCE)
            return;
        this.claimDisputesTriggered.add(nodeId);
        const node = this.asteroids.find((entry) => entry.id === nodeId);
        const spawnPosition = node ? this.claimDisputePosition(node, rng) : this.encounterPosition(rng, 150);
        const rival = this.spawnShip('miner', spawnPosition);
        rival.hostile = true;
        rival.targetId = 'player';
        rival.bountyValue = 0;
        this.sayPilotLine(rival, CLAIM_DISPUTE_LINES[Math.floor(rng() * CLAIM_DISPUTE_LINES.length)]);
        this.ui.pushEvent(t('Claim dispute: a rival prospector contests {claim}.', { claim: mission?.claimName ?? t('your staked rock') }), 'warning', 5600);
        this.audio.play('warning');
        this.threatAcquireTarget();
    }
    claimDisputePosition(node, rng) {
        // Spawn the rival just outside the rock's collision envelope so they
        // arrive beside the seam instead of materializing inside it.
        const direction = new THREE.Vector3(rng() - 0.5, (rng() - 0.5) * 0.4, rng() - 0.5).normalize();
        return tuple(vec(node.position).addScaledVector(direction, asteroidCollisionRadius(node) + 90));
    }
    recoverWreckEquipment(node) {
        const rng = seededRandom(`${this.save.world.seed}:wreck-equipment:${node.id}`);
        // Tech wrecks can surface an intact module, but the roll stays low so
        // the event is genuinely rare (only ~half of wrecks are tech).
        if (rng() > 0.08)
            return;
        const state = normalizeOutfitting(this.save.player);
        const candidates = OUTFIT_ITEM_IDS.filter((id) => !['pulse-cannon', 'gauss-cannon', 'seeker-launcher'].includes(id));
        if (!candidates.length)
            return;
        const equipmentId = pick(rng, candidates);
        state.locker[equipmentId] = (state.locker[equipmentId] ?? 0) + 1;
        this.save.player.equipment = projectLegacyEquipment(this.save.player, state);
        this.ui.pushEvent(t('Intact module recovered: {name} moved to locker.', { name: t(OUTFIT_ITEMS[equipmentId].name) }), 'success', 6200);
        this.audio.play('success', 1.35);
        this.persistSave();
    }
    triggerSalvageAmbush(node) {
        if (this.salvageAmbushTriggered.has(node.id))
            return;
        // The ambush waits for the pilot to commit: the first beaming frame
        // arms a short delay, and the roll only happens once the beam has been
        // running that long (while the wreck still has recoveries). So the
        // pirates arrive mid-salvage, having watched the work, not on the
        // first spark of the beam.
        if (node.ambushEligibleAt === undefined) {
            node.ambushEligibleAt = this.save.world.time + SALVAGE_AMBUSH_DELAY;
            return;
        }
        if (this.save.world.time < node.ambushEligibleAt)
            return;
        const rng = seededRandom(`${this.save.world.seed}:salvage-ambush:${node.id}`);
        // Claim-jumpers chase value, not wrecks: the hold's remaining worth
        // (commodity price × recoveries left) sets the odds. Cheap scrap draws
        // no one; the richest arms wreck tops out at 50%.
        const worth = COMMODITIES[node.salvage].basePrice * node.remaining;
        const span = SALVAGE_AMBUSH_MAX_WORTH - SALVAGE_AMBUSH_FLOOR_WORTH;
        const ambushChance = clamp(((worth - SALVAGE_AMBUSH_FLOOR_WORTH) / span) * SALVAGE_AMBUSH_MAX_CHANCE, 0, SALVAGE_AMBUSH_MAX_CHANCE);
        if (rng() > ambushChance)
            return;
        this.salvageAmbushTriggered.add(node.id);
        const player = vec(this.save.player.position);
        const lead = this.spawnShip('pirate', tuple(player.clone().add(new THREE.Vector3(90, 20, -75))));
        lead.targetId = 'player';
        const escorts = [];
        // The richest holds rate a two-ship team: the second pirate's odds
        // ramp across the escort worth band instead of cutting in at a hard
        // threshold.
        const escortSpan = SALVAGE_AMBUSH_ESCORT_MAX_WORTH - SALVAGE_AMBUSH_ESCORT_MIN_WORTH;
        const escortChance = clamp((worth - SALVAGE_AMBUSH_ESCORT_MIN_WORTH) / escortSpan, 0, 1);
        if (rng() < escortChance) {
            const escort = this.spawnShip('escort', tuple(player.clone().add(new THREE.Vector3(-75, -15, -95))));
            escort.targetId = 'player';
            escorts.push(escort);
        }
        // Claim-jumpers want the salvage, not a fight: if the pilot has already
        // pulled cargo from the wreck they open with a demand for it; otherwise
        // there is nothing to shake down and they attack immediately.
        const demand = this.salvageMugDemand(node, lead);
        if (demand) {
            this.beginMug(lead, escorts, demand, {
                lines: SALVAGE_DEMAND_LINES,
                sensor: t('Claim-jumpers inbound — they are hailing you.'),
                event: t('Standoff: drop the salvage or fight.'),
            });
        }
        else {
            this.ui.pushEvent(t('Salvage claim challenged: hostile drives inbound.'), 'danger', 5200);
        }
        this.threatAcquireTarget();
        this.audio.play('warning');
    }
    spawnPickup(commodity, origin, source, amount = 1) {
        const rng = seededRandom(`${this.save.world.seed}:pickup:${++this.pickupCounter}:${this.save.world.time}`);
        const drift = new THREE.Vector3(rng() - 0.5, rng() - 0.5, rng() - 0.5).normalize().multiplyScalar(randomBetween(rng, 0.8, 2.4));
        const offset = drift.clone().normalize().multiplyScalar(2.2 + rng() * 2.5);
        const slot = this.pickupStore.alloc();
        const originPos = this.tmpP0.copy(vec(origin)).add(offset);
        this.pickupStore.setPos(slot, originPos.x, originPos.y, originPos.z);
        this.pickupStore.setVel(slot, drift.x, drift.y, drift.z);
        this.pickups.push({
            id: `pickup-${this.pickupCounter}`,
            commodity,
            slot,
            amount,
            source,
            life: 140,
        });
    }
    updatePickups(dt) {
        const player = vec(this.save.player.position, this.tmpP3);
        const salvageRange = this.playerStats().salvageRange * 1.5;
        for (const pickup of this.pickups) {
            pickup.life -= dt;
            const position = this.pickupStore.getPos(pickup.slot, this.tmpP0);
            const velocity = this.pickupStore.getVel(pickup.slot, this.tmpP1);
            const distance = position.distanceTo(player);
            const modeMatches = (this.save.player.mode === 'mining' && pickup.source === 'mining') ||
                (this.save.player.mode === 'salvage' && (pickup.source === 'salvage' || pickup.source === 'combat'));
            if ((this.utilityActive && modeMatches && distance < salvageRange) || distance < 7) {
                const pull = this.tmpP2.copy(player).sub(position).normalize().multiplyScalar((28 / Math.max(2, distance)) * dt);
                velocity.add(pull);
            }
            velocity.multiplyScalar(Math.exp(-0.18 * dt));
            position.addScaledVector(velocity, dt);
            this.pickupStore.setPosV(pickup.slot, position);
            this.pickupStore.setVelV(pickup.slot, velocity);
            if (distance < 3.2)
                this.collectPickup(pickup);
        }
    }
    collectPickup(pickup) {
        if (pickup.life <= 0)
            return;
        if (pickup.commodity === 'credits') {
            // A surrendered pilot's transfer: credits, straight to the wallet —
            // no cargo space involved.
            this.save.player.credits += pickup.amount;
            pickup.life = 0;
            this.setOwnMonitorStatus(`+${formatCredits(pickup.amount)}`);
            return;
        }
        const required = COMMODITIES[pickup.commodity].mass * pickup.amount;
        if (cargoFree(this.save.player) + 0.001 < required) {
            // The HOLD cell on the own-ship monitor flashes CARGO FULL (it's
            // already red while full), so the pickup hint needs no toast.
            this.setOwnMonitorStatus(t('CARGO FULL'));
            return;
        }
        this.save.player.cargo[pickup.commodity] = (this.save.player.cargo[pickup.commodity] ?? 0) + pickup.amount;
        pickup.life = 0;
        this.audio.play('pickup', 0.7);
        if (pickup.source === 'mining') {
            this.save.player.stats.mined += pickup.amount;
            const rankMessage = awardCareerProgress(this.save, 'mining', 1, 'frontier-miners');
            if (rankMessage)
                this.ui.pushEvent(rankMessage, 'success', 5000);
        }
        else {
            this.save.player.stats.salvaged += pickup.amount;
            const rankMessage = awardCareerProgress(this.save, 'salvage', 1, 'salvage-union');
            if (rankMessage)
                this.ui.pushEvent(rankMessage, 'success', 5000);
        }
        this.setOwnMonitorStatus(t('+{commodity}', { commodity: t(COMMODITIES[pickup.commodity].name.toUpperCase()) }), 2200);
    }
    // The cockpit has no manual SCAN control anymore: a selected ship, asteroid,
    // or wreck is resolved automatically the moment the ship closes to scan
    // range. Out-of-range status is rendered on the target monitor.
    autoScanTarget() {
        if (this.scanCooldown > 0)
            return;
        const target = this.getTargetRef();
        if (!target || (target.kind !== 'ship' && target.kind !== 'asteroid' && target.kind !== 'wreck'))
            return;
        const entity = target.kind === 'ship'
            ? this.ships.find((entry) => entry.id === target.id)
            : (target.kind === 'asteroid' ? this.asteroids : this.wreckNodes).find((entry) => entry.id === target.id);
        if (!entity || entity.scanned)
            return;
        // A dark contact can only be resolved inside the dark-detection line,
        // so the auto-scan never reads a ship the sensors can't see.
        if (target.kind === 'ship' && !this.playerSeesShip(entity, 1))
            return;
        const stats = this.playerStats();
        if (this.surfaceDistance(vec(this.save.player.position), target) <= stats.scanRange)
            this.scanTarget();
    }
    scanTarget() {
        if (this.scanCooldown > 0)
            return;
        const target = this.getTargetRef();
        if (!target) {
            this.setMonitorStatus(t('NO SCAN TARGET'));
            return;
        }
        if (target.kind === 'location') {
            // Distance for a locked POI now lives on the target monitor heading;
            // the old NAV-database pop-up card is gone.
            this.scanCooldown = 0.35;
            this.audio.play('scan');
            return;
        }
        if (target.kind === 'pickup')
            return;
        const stats = this.playerStats();
        const distance = this.surfaceDistance(vec(this.save.player.position), target);
        if (target.kind === 'asteroid' || target.kind === 'wreck') {
            // Locked contacts scan automatically in range; the out-of-range
            // status lives on the target monitor, not a toast for resources.
            if (distance > stats.scanRange)
                return;
        }
        else if (distance > stats.scanRange) {
            this.setMonitorStatus(t('OUT OF RANGE · {current}/{max} km', { current: Math.round(distance), max: stats.scanRange }));
            return;
        }
        else if (target.kind === 'ship') {
            const locked = this.ships.find((entry) => entry.id === target.id);
            // A dark contact can only be resolved inside the dark-detection
            // line; a rock between pilot and target blocks the scan entirely.
            if (!locked || !this.playerSeesShip(locked, 1)) {
                this.setMonitorStatus(t('CONTACT LOST · SIGNAL BLOCKED'));
                return;
            }
        }
        if (target.kind === 'asteroid') {
            const node = this.asteroids.find((entry) => entry.id === target.id);
            node.scanned = true;
            if (!this.save.world.scannedNodes.includes(node.id))
                this.save.world.scannedNodes.push(node.id);
        }
        else if (target.kind === 'wreck') {
            const node = this.wreckNodes.find((entry) => entry.id === target.id);
            node.scanned = true;
            if (!this.save.world.scannedNodes.includes(node.id))
                this.save.world.scannedNodes.push(node.id);
        }
        else {
            const ship = this.ships.find((entry) => entry.id === target.id);
            // The scan result lands on the target monitor's readout line rather
            // than a toast: ordinary contacts flip from UNRESOLVED CONTACT to
            // the pilot profile once ship.scanned is set. Surrendered pilots
            // keep the claim decision separate instead.
            ship.scanned = true;
            if (!ship.surrendered && this.deferentialPilot(ship)) {
                // First scan of a spared pilot may pay a favor (wreck tip or
                // market contact); re-scans never re-roll. The ✦ marker already
                // in the readout signals they remember the player.
                if (!ship.favorGiven)
                    this.givePilotFavor(ship);
                ship.favorGiven = true;
            }
        }
        this.scanCooldown = 0.55;
        this.audio.play('scan');
        this.renderer.setTarget(target.kind === 'ship' ? target.id : undefined, target.kind === 'asteroid' ? target.id : undefined, target.kind === 'wreck' ? target.id : undefined);
    }
    captureTarget() {
        const target = this.getTargetRef();
        if (!target || target.kind !== 'ship') {
            this.setMonitorStatus(t('NO SURRENDERED SHIP LOCKED'));
            return;
        }
        const ship = this.ships.find((entry) => entry.id === target.id);
        if (!ship || ship.hull <= 0)
            return;
        if (!ship.surrendered || ship.captured) {
            this.setMonitorStatus(t('PILOT HAS NOT SURRENDERED'));
            return;
        }
        const stats = this.playerStats();
        const distance = this.surfaceDistance(vec(this.save.player.position), target);
        if (distance > stats.scanRange) {
            this.setMonitorStatus(t('OUT OF RANGE · {current}/{max} km', { current: Math.round(distance), max: stats.scanRange }));
            return;
        }
        if (!(ship.bountyValue > 0 || ship.missionId)) {
            this.setMonitorStatus(t('NO CAPTURE CLAIM AVAILABLE'));
            return;
        }
        this.claimSurrendered(ship);
    }
    cycleTarget() {
        const candidates = this.targetCandidates();
        if (!candidates.length) {
            this.clearTarget();
            this.setMonitorStatus(t('NO TARGETS IN SENSOR RANGE'));
            return;
        }
        let currentIndex = candidates.findIndex((entry) => entry.id === this.save.player.currentTargetId);
        // A ship that just surrendered drops out of the hostile tier, so the next
        // press restarts selection at the top of the hierarchy (closest remaining
        // threat) instead of stepping into the non-hostile contact list.
        if (this.ships.some((entry) => entry.id === this.save.player.currentTargetId && entry.surrendered))
            currentIndex = -1;
        const next = candidates[(currentIndex + 1) % candidates.length];
        // Mode follows the selected target so the touch pads and radar filters match.
        if (next.kind === 'ship')
            this.save.player.mode = 'combat';
        else if (next.kind === 'asteroid')
            this.save.player.mode = 'mining';
        else if (next.kind === 'wreck')
            this.save.player.mode = 'salvage';
        // Selecting a POI as a target also sets it as the hyperdrive nav point.
        if (next.kind === 'location') {
            if (next.remoteDestinationId) {
                const destination = LOCATIONS[next.remoteDestinationId];
                if (destination && this.plotSystemRoute(destination.systemId, destination.id))
                    return;
            }
            this.save.player.navTargetId = next.id;
            this.autopilot = false;
        }
        this.applyTarget(next);
    }
    targetNearestHostile() {
        // The nearest-hostile lock rides the wider threat multiplier for lit
        // contacts; dark ones are only ever resolved inside the dark-detection
        // line, so stealth is never leaked through the targeting UI.
        const nearest = this.ships
            .filter((entry) => entry.hostile && entry.hull > 0 && this.playerSeesShip(entry, THREAT_NEAREST_MULT))
            .sort((a, b) => vec(a.position).distanceToSquared(vec(this.save.player.position)) - vec(b.position).distanceToSquared(vec(this.save.player.position)))[0];
        if (!nearest) {
            this.setMonitorStatus(t('NO HOSTILE IN SENSOR RANGE'));
            return;
        }
        this.save.player.mode = 'combat';
        this.applyTarget({ kind: 'ship', id: nearest.id, position: nearest.position, name: nearest.name });
    }
    // When a fresh hostile spawns in while the pilot already has a lock, restart
    // target selection at the top of the hierarchy: the closest hostile takes
    // the reticle (tier 1 beats mission goals and other contacts). No-op with
    // no current lock or no hostile in sensor range.
    threatAcquireTarget() {
        if (!this.save.player.currentTargetId)
            return;
        const player = vec(this.save.player.position);
        const nearest = this.ships
            .filter((entry) => entry.hostile && entry.hull > 0 && this.playerSeesShip(entry, THREAT_TARGET_MULT))
            .sort((a, b) => player.distanceToSquared(vec(a.position)) - player.distanceToSquared(vec(b.position)))[0];
        if (!nearest || nearest.id === this.save.player.currentTargetId)
            return;
        this.save.player.mode = 'combat';
        this.applyTarget({ kind: 'ship', id: nearest.id, position: nearest.position, name: nearest.name });
    }
    // Pickup labels: a commodity name for cargo crates, CREDITS for a
    // surrendered pilot's transfer.
    pickupLabel(pickup) {
        return pickup.commodity === 'credits' ? t('CREDITS') : t(COMMODITIES[pickup.commodity].name);
    }
    pickupDetail(pickup) {
        return pickup.commodity === 'credits' ? formatCredits(pickup.amount) : `${pickup.amount} ${t('UNITS')}`;
    }
    targetCandidates() {
        const player = vec(this.save.player.position);
        const stats = this.playerStats();
        const byDistance = (a, b) => player.distanceToSquared(vec(a.position)) - player.distanceToSquared(vec(b.position));
        // Ships resolve through the sensor visibility gate: lit contacts at the
        // threat-aware multiplier (2.2x, see THREAT_TARGET_MULT), dark ones only
        // inside the dark-detection line — stealth is never leaked through the
        // targeting UI. A locked ship the pilot can no longer resolve stays in
        // the cycle as a hold so the lock isn't silently dropped mid-fight.
        const shipSeen = (entry) => this.playerSeesShip(entry, THREAT_TARGET_MULT) || entry.id === this.save.player.currentTargetId;
        // Tier 1 — opponents: hostile ships the pilot can resolve, closest first.
        const opponents = this.ships
            .filter((entry) => entry.hostile && entry.hull > 0 && shipSeen(entry))
            .sort(byDistance)
            .map((entry) => ({ kind: 'ship', id: entry.id, position: entry.position, name: entry.name }));
        // Tier 2 — mission goals: the thing each active contract points at (the
        // warrant target ship, or the destination POI to fly to).
        const goals = [];
        for (const mission of this.save.activeMissions) {
            if (mission.kind === 'bounty') {
                const target = this.ships.find((entry) => entry.missionId === mission.id && !entry.claimed && !entry.captured && entry.hull > 0);
                // Warrant ships are still ships: they follow the visibility
                // gate. Only POIs stay selectable at any distance.
                if (target && shipSeen(target))
                    goals.push({ kind: 'ship', id: target.id, position: target.position, name: target.name });
                // Before the warrant ship is spawned, the goal is the POI to
                // fly to — so target cycling still points you somewhere.
                else if (mission.targetZone && Object.prototype.hasOwnProperty.call(LOCATIONS, mission.targetZone)) {
                    const location = LOCATIONS[mission.targetZone];
                    goals.push({ kind: 'location', id: mission.targetZone, position: location.position, name: location.name });
                }
            }
            else if (mission.kind === 'mining') {
                // A claim contract points at the rock until it's dry, then at the
                // return dock. Before the pilot reaches the Shardbelt the goal is
                // the field itself, so target cycling still gives a fly-to point.
                const doneMining = (mission.mined ?? 0) >= mission.quantity;
                if (doneMining || !mission.claimNodeId) {
                    const destination = LOCATIONS[mission.destination];
                    goals.push({ kind: 'location', id: mission.destination, position: destination.position, name: destination.name });
                }
                else if (this.activeInstanceId === 'shardbelt') {
                    const claim = this.asteroids.find((node) => node.id === mission.claimNodeId && node.remaining > 0);
                    if (claim)
                        goals.push({ kind: 'asteroid', id: claim.id, position: claim.position, name: `Claim: ${mission.claimName ?? claim.id}`, scanned: claim.scanned });
                }
                else {
                    goals.push({ kind: 'location', id: 'shardbelt', position: LOCATIONS.shardbelt.position, name: LOCATIONS.shardbelt.name });
                }
            }
            else if (mission.destination && Object.prototype.hasOwnProperty.call(LOCATIONS, mission.destination)) {
                const location = LOCATIONS[mission.destination];
                goals.push({ kind: 'location', id: mission.destination, position: location.position, name: location.name });
            }
        }
        for (let index = 0; index < goals.length; index += 1) {
            const goal = goals[index];
            if (goal.kind === 'location' && LOCATIONS[goal.id]?.systemId !== this.save.player.systemId)
                goals[index] = this.localNavigationTarget(goal.id) ?? goal;
        }
        // Tier 3 — everything else: traffic, deposits, wrecks, and POIs.
        // Scanned deposits/wrecks cycle before unscanned ones (a scan already
        // invested makes them the priority), then nearest first.
        const others = [];
        for (const entry of this.ships)
            if (!entry.hostile && !entry.claimed && !entry.captured && entry.hull > 0 && shipSeen(entry))
                others.push({ kind: 'ship', id: entry.id, position: entry.position, name: entry.name });
        if (this.activeInstanceId === 'shardbelt') {
            for (const node of this.asteroids)
                if (node.remaining > 0 && player.distanceTo(vec(node.position)) - asteroidCollisionRadius(node) < stats.radarRange)
                    others.push({ kind: 'asteroid', id: node.id, position: node.position, name: t(node.tunnelPart ? 'Rock Crown Deposit' : 'Asteroid Deposit'), scanned: node.scanned });
        }
        if (this.activeInstanceId === 'mourning-line') {
            for (const node of this.wreckNodes)
                if (node.remaining > 0 && player.distanceTo(vec(node.position)) - node.radius < stats.radarRange)
                    others.push({ kind: 'wreck', id: node.id, position: node.position, name: node.name, scanned: node.scanned });
        }
        for (const pickup of this.pickups) {
            if (pickup.life <= 0)
                continue;
            const position = tuple(this.pickupStore.getPos(pickup.slot, this.tmpP1));
            if (player.distanceTo(vec(position)) < stats.radarRange)
                others.push({ kind: 'pickup', id: pickup.id, position, name: this.pickupLabel(pickup) });
        }
        for (const id of this.currentNavLocationIds()) {
            if (goals.some((goal) => goal.id === id))
                continue;
            const location = LOCATIONS[id];
            others.push({ kind: 'location', id, position: location.position, name: location.name });
        }
        others.sort((a, b) => Number(Boolean(b.scanned)) - Number(Boolean(a.scanned)) || byDistance(a, b));
        return [...opponents, ...goals, ...others];
    }
    localNavigationTarget(destinationId) {
        const destination = LOCATIONS[destinationId];
        if (!destination)
            return undefined;
        if (destination.systemId === this.save.player.systemId)
            return { kind: 'location', id: destination.id, position: destination.position, name: destination.name };
        const plan = planRoute(this.save.player.systemId, destinationId);
        const jumpPoint = LOCATIONS[plan?.nextJumpPointId];
        if (!plan?.ok || !jumpPoint)
            return undefined;
        return {
            kind: 'location',
            id: jumpPoint.id,
            position: jumpPoint.position,
            name: `${destination.name} via ${jumpPoint.name}`,
            remoteDestinationId: destination.id,
        };
    }
    plotSystemRoute(systemId, destinationId = null) {
        if (!hasSystem(systemId))
            return false;
        const plan = planRoute(this.save.player.systemId, destinationId ?? systemId);
        if (!plan?.ok)
            return false;
        this.save.world.plannedSystemId = systemId;
        this.save.world.plannedDestinationId = destinationId;
        if (plan.hopCount === 0) {
            const localId = destinationId ?? DEFAULT_NAV_LOCATION_BY_SYSTEM[systemId];
            if (localId && LOCATIONS[localId]?.systemId === this.save.player.systemId)
                this.setNav(localId);
            else {
                this.save.world.plannedSystemId = null;
                this.save.world.plannedDestinationId = null;
            }
            this.ui.pushSensor(t('Already in {system}.', { system: SYSTEMS[systemId].name }), 'info');
            return true;
        }
        const jumpPoint = LOCATIONS[plan.nextJumpPointId];
        if (!jumpPoint)
            return false;
        this.setNav(jumpPoint.id, { preservePlan: true });
        this.applyTarget({ kind: 'location', id: jumpPoint.id, position: jumpPoint.position, name: jumpPoint.name });
        this.ui.pushSensor(t('Route plotted: {system} · {hops} jump(s) · no travel cost.', {
            system: SYSTEMS[systemId].name,
            hops: plan.hopCount,
        }), 'success', 5200);
        return true;
    }
    selectTarget(kind, id) {
        let target;
        if (kind === 'system') {
            this.plotSystemRoute(id);
            return;
        }
        if (kind === 'location') {
            if (!Object.prototype.hasOwnProperty.call(LOCATIONS, id))
                return;
            const locationId = id;
            const location = LOCATIONS[locationId];
            if (location.systemId !== this.save.player.systemId) {
                this.plotSystemRoute(location.systemId, locationId);
                return;
            }
            this.save.world.plannedSystemId = null;
            this.save.world.plannedDestinationId = null;
            this.save.player.navTargetId = locationId;
            this.autopilot = false;
            target = { kind, id: locationId, position: location.position, name: location.name };
        }
        else if (kind === 'ship') {
            const ship = this.ships.find((entry) => entry.id === id && !entry.claimed && !entry.captured && entry.hull > 0);
            if (ship) {
                this.save.player.mode = 'combat';
                target = { kind, id, position: ship.position, name: ship.name };
            }
        }
        else if (kind === 'pickup') {
            const pickup = this.pickups.find((entry) => entry.id === id && entry.life > 0);
            if (pickup) {
                // A crate doesn't force a tool mode: ejected cargo can be
                // scooped in any mode.
                target = { kind, id, position: tuple(this.pickupStore.getPos(pickup.slot, this.tmpP0)), name: this.pickupLabel(pickup) };
            }
        }
        else if (kind === 'asteroid') {
            const node = this.asteroids.find((entry) => entry.id === id && entry.remaining > 0);
            if (node && this.activeInstanceId === 'shardbelt') {
                this.save.player.mode = 'mining';
                target = { kind, id, position: node.position, name: t(node.tunnelPart ? 'Rock Crown Deposit' : 'Asteroid Deposit') };
            }
            else {
                // Out of sensor range or not in the field yet: the claim lives in
                // the Shardbelt, so lock a jump vector to the field. Once there,
                // the claim marker re-resolves to the actual rock.
                const claim = this.activeMiningClaim(id);
                if (claim) {
                    this.save.player.navTargetId = 'shardbelt';
                    this.autopilot = false;
                    this.ui.pushSensor(t('NAV set: The Shardbelt — {claim} vector locked.', { claim: claim.claimName ?? t('claim') }), 'info');
                    target = { kind: 'location', id: 'shardbelt', position: LOCATIONS.shardbelt.position, name: LOCATIONS.shardbelt.name };
                }
            }
        }
        else if (kind === 'gate' || kind === 'raceGate') {
            // Race checkpoint: a mission anchor, lockable at any distance while
            // an entry is live (see raceGateById). No tool-mode change.
            const gateTarget = this.raceGateTarget(id);
            if (gateTarget)
                target = gateTarget;
        }
        else {
            const node = this.wreckNodes.find((entry) => entry.id === id && entry.remaining > 0);
            if (node && this.activeInstanceId === 'mourning-line') {
                this.save.player.mode = 'salvage';
                target = { kind, id, position: node.position, name: node.name };
            }
        }
        if (!target) {
            this.setMonitorStatus(t('TARGET NO LONGER AVAILABLE'));
            return;
        }
        this.applyTarget(target);
        // Locked contacts resolve automatically on the next sim step via
        // autoScanTarget, so selection needs no manual scan gate here.
    }
    applyTarget(target) {
        this.save.player.currentTargetId = target.id;
        // A fresh lock supersedes the previous target's transient readout
        // (DEPOSIT EXHAUSTED / WRECK STRIPPED) instead of letting it linger
        // over the new target for its full display window.
        this.monitorStatus = '';
        this.monitorStatusUntil = 0;
        // A fresh lock also clears a lingering clip-flash from the previous hull.
        this.targetClipUntil = 0;
        this.renderer.setTarget(target.kind === 'ship' ? target.id : undefined, target.kind === 'asteroid' ? target.id : undefined, target.kind === 'wreck' ? target.id : undefined, target.kind === 'location' ? target.id : undefined, target.kind === 'pickup' ? target.id : undefined);
        // No selection pop-up: the target monitor already shows the lock, and
        // the distance readout lives in its heading (below the label row).
        this.audio.play('ui');
    }
    clearTarget() {
        this.save.player.currentTargetId = undefined;
        this.renderer.setTarget();
    }
    // A locked ship is a visual lock: it survives until the target leaves its
    // tracked range (lockTrackedRange — the visual-lock 1000 km for dark
    // ships, the disc horizon for lit ones). Occlusion never breaks a lock —
    // rocks don't blind the pilot's eye, only distance does — so a target that
    // ducks behind debris stays tracked until it truly outruns the dish.
    // Losing it drops the target; the radar keeps the lost-contact cross at
    // the last known position on its own.
    maintainTargetLock() {
        const id = this.save.player.currentTargetId;
        if (!id)
            return;
        const stats = this.playerStats();
        const player = vec(this.save.player.position);
        const ship = this.ships.find((entry) => entry.id === id && entry.hull > 0);
        if (ship) {
            const distance = player.distanceTo(vec(ship.position));
            if (distance > this.lockTrackedRange(ship))
                this.dropTargetLock(ship);
            return;
        }
        // Anchored targets (deposits, wrecks, pickups) hold only while they're
        // inside the sensor horizon: flying away drops the lock so the marker
        // doesn't linger on the map. Depletion already clears via getTargetRef.
        const asteroid = this.asteroids.find((entry) => entry.id === id && entry.remaining > 0);
        if (asteroid && this.activeInstanceId === 'shardbelt' && player.distanceTo(vec(asteroid.position)) > stats.radarRange) {
            this.clearTarget();
            return;
        }
        const wreck = this.wreckNodes.find((entry) => entry.id === id && entry.remaining > 0);
        if (wreck && this.activeInstanceId === 'mourning-line' && player.distanceTo(vec(wreck.position)) > stats.radarRange) {
            this.clearTarget();
            return;
        }
        const pickup = this.pickups.find((entry) => entry.id === id && entry.life > 0);
        if (pickup && player.distanceTo(this.pickupStore.getPos(pickup.slot, this.tmpP0)) > stats.radarRange)
            this.clearTarget();
        // Race gates are mission anchors: the lock holds at any distance while
        // the entry is live (endRaceField invalidates it via raceGateTarget).
        if (this.raceGateById(id))
            return;
    }
    dropTargetLock(ship) {
        this.clearTarget();
        this.setMonitorStatus(t('CONTACT LOST · LOCK BROKEN'));
    }
    getTargetRef(clearInvalid = true) {
        const id = this.save.player.currentTargetId;
        if (!id)
            return undefined;
        if (Object.prototype.hasOwnProperty.call(LOCATIONS, id) && LOCATIONS[id].systemId === this.save.player.systemId) {
            const locationId = id;
            const location = LOCATIONS[locationId];
            return { kind: 'location', id: locationId, position: location.position, name: location.name };
        }
        const ship = this.ships.find((entry) => entry.id === id && !entry.claimed && !entry.captured && entry.hull > 0);
        if (ship)
            return { kind: 'ship', id, position: ship.position, name: ship.name };
        const pickup = this.pickups.find((entry) => entry.id === id && entry.life > 0);
        if (pickup)
            return { kind: 'pickup', id, position: tuple(this.pickupStore.getPos(pickup.slot, this.tmpP0)), name: this.pickupLabel(pickup) };
        const asteroid = this.asteroids.find((entry) => entry.id === id && entry.remaining > 0);
        if (asteroid && (!clearInvalid || this.activeInstanceId === 'shardbelt')) {
            return { kind: 'asteroid', id, position: asteroid.position, name: asteroid.tunnelPart ? 'Rock Crown Deposit' : 'Asteroid Deposit' };
        }
        const wreck = this.wreckNodes.find((entry) => entry.id === id && entry.remaining > 0);
        if (wreck && (!clearInvalid || this.activeInstanceId === 'mourning-line'))
            return { kind: 'wreck', id, position: wreck.position, name: wreck.name };
        const gate = this.raceGateTarget(id);
        if (gate)
            return gate;
        if (clearInvalid)
            this.clearTarget();
        return undefined;
    }
    readyJumpPoint(position = this.save.player.position) {
        const px = Number(position?.x ?? position?.[0]);
        const py = Number(position?.y ?? position?.[1]);
        const pz = Number(position?.z ?? position?.[2]);
        if (!Number.isFinite(px) || !Number.isFinite(py) || !Number.isFinite(pz))
            return undefined;
        let nearest;
        let nearestDistanceSq = Number.POSITIVE_INFINITY;
        for (const id of this.currentNavLocationIds()) {
            const jumpPoint = LOCATIONS[id];
            if (jumpPoint?.kind !== 'jump-point')
                continue;
            const dx = px - jumpPoint.position[0];
            const dy = py - jumpPoint.position[1];
            const dz = pz - jumpPoint.position[2];
            const distanceSq = dx * dx + dy * dy + dz * dz;
            const activationRadius = hyperdriveArrivalRadius(jumpPoint) + 0.5;
            if (distanceSq <= activationRadius * activationRadius && distanceSq < nearestDistanceSq) {
                nearest = jumpPoint;
                nearestDistanceSq = distanceSq;
            }
        }
        return nearest;
    }
    jumpPointNormal(jumpPoint, out = this.tmpGateNormal) {
        out.set(jumpPoint.position[0], jumpPoint.position[1], jumpPoint.position[2]);
        if (out.lengthSq() < 0.0001)
            out.set(0, 0, 1);
        return out.normalize();
    }
    disarmGalaxyJump(message) {
        if (!this.armedJumpPointId)
            return false;
        this.armedJumpPointId = null;
        this.armedJumpPointSide = 0;
        this.renderer.setArmedJumpPoint?.();
        if (message)
            this.setHyperdriveStatus(t(message), 2600);
        return true;
    }
    startGalaxyJump(jumpPoint) {
        const route = getRoute(jumpPoint.routeId);
        if (!route || !jumpPoint.destinationSystemId || !LOCATIONS[jumpPoint.destinationLocationId])
            return false;
        const playerPosition = vec(this.save.player.position, this.tmpGateRelative);
        const normal = this.jumpPointNormal(jumpPoint);
        this.armedJumpPointId = jumpPoint.id;
        this.armedJumpPointSide = playerPosition.sub(vec(jumpPoint.position)).dot(normal);
        this.renderer.setArmedJumpPoint?.(jumpPoint.id);
        this.setHyperdriveStatus(t('GATE LIVE · FLY THROUGH THE APERTURE'), 360000);
        this.audio.play('hyperSpool');
        return true;
    }
    beginGalaxyGateTransition(jumpPoint) {
        const route = getRoute(jumpPoint.routeId);
        if (!route || !jumpPoint.destinationSystemId || !LOCATIONS[jumpPoint.destinationLocationId])
            return false;
        const jump = {
            routeId: route.id,
            fromSystemId: this.save.player.systemId,
            toSystemId: jumpPoint.destinationSystemId,
            fromLocationId: jumpPoint.id,
            toLocationId: jumpPoint.destinationLocationId,
            startedAt: this.save.world.time,
            completeAt: this.save.world.time + GATE_TRANSITION_SECONDS,
            returnThrottle: this.save.player.throttle,
        };
        this.armedJumpPointId = null;
        this.armedJumpPointSide = 0;
        this.renderer.setArmedJumpPoint?.();
        this.galaxyJump = jump;
        this.save.world.pendingJump = { ...jump };
        this.save.world.plannedSystemId ??= jump.toSystemId;
        this.hyperdriveReturnThrottle = this.save.player.throttle;
        this.autopilot = true;
        this.hyperdriveFx = 'gate';
        this.hyperdriveSpoolStartedAt = this.save.world.time;
        this.hyperdriveFxUntil = jump.completeAt;
        this.hyperdriveEncounterAt = null;
        this.save.player.velocity = [0, 0, 0];
        this.save.player.angularVelocity = [0, 0, 0];
        this.setHyperdriveStatus(t('GATE TRANSIT · {system} · NO COST', { system: SYSTEMS[jump.toSystemId].name }), 1800);
        this.audio.play('hyperActive');
        this.persistSave();
        return true;
    }
    checkArmedGalaxyGateCrossing(position) {
        const jumpPoint = LOCATIONS[this.armedJumpPointId];
        if (!jumpPoint || jumpPoint.kind !== 'jump-point' || jumpPoint.systemId !== this.save.player.systemId) {
            this.disarmGalaxyJump();
            return false;
        }
        const normal = this.jumpPointNormal(jumpPoint);
        const relative = this.tmpGateRelative.copy(position).sub(vec(jumpPoint.position));
        const axial = relative.dot(normal);
        const distanceSq = relative.lengthSq();
        const activationRadius = hyperdriveArrivalRadius(jumpPoint);
        if (distanceSq > (activationRadius + 220) * (activationRadius + 220)) {
            this.disarmGalaxyJump('GATE DISARMED · RETURN WITHIN 1 KM');
            return false;
        }
        // Test the complete movement segment, not a dead zone around the gate
        // plane. The old ±1.5 threshold lost ordinary slow crossings: one
        // fixed step could move from +0.08 to -0.07, update the remembered
        // side, and then never satisfy either threshold.
        const previous = this.save.player.prevPosition ?? this.save.player.position;
        const previousX = Number(previous[0]);
        const previousY = Number(previous[1]);
        const previousZ = Number(previous[2]);
        const previousAxial = (previousX - jumpPoint.position[0]) * normal.x
            + (previousY - jumpPoint.position[1]) * normal.y
            + (previousZ - jumpPoint.position[2]) * normal.z;
        const crossedPlane = (previousAxial > 0 && axial <= 0)
            || (previousAxial < 0 && axial >= 0);
        this.armedJumpPointSide = axial;
        if (!crossedPlane)
            return false;
        // Evaluate the aperture at the exact point where the movement segment
        // intersects the plane. This remains correct for both a slow crawl and
        // a high-speed pass that ends well beyond the gate in one step.
        const denominator = previousAxial - axial;
        if (Math.abs(denominator) < 1e-9)
            return false;
        const fraction = clamp(previousAxial / denominator, 0, 1);
        const intersectionX = previousX + (position.x - previousX) * fraction - jumpPoint.position[0];
        const intersectionY = previousY + (position.y - previousY) * fraction - jumpPoint.position[1];
        const intersectionZ = previousZ + (position.z - previousZ) * fraction - jumpPoint.position[2];
        const radialSq = intersectionX * intersectionX + intersectionY * intersectionY + intersectionZ * intersectionZ;
        // Match the visible portal disc and the inner edge of the energized
        // ring: anything that looks like open aperture is traversable.
        const apertureRadius = jumpPoint.radius * 0.515;
        if (radialSq > apertureRadius * apertureRadius) {
            this.setHyperdriveStatus(t('MISSED APERTURE · TURN AND PASS THROUGH THE GATE'), 3200);
            this.audio.play('warning');
            return false;
        }
        if (this.hostilesVisibleNear(position, HYPERDRIVE_THREAT_RADIUS)) {
            this.setHyperdriveStatus(t('Jump unavailable while an enemy is close.'), 3400);
            this.audio.play('warning');
            return false;
        }
        if (this.activeRace) {
            this.setHyperdriveStatus(t('Finish or abandon the active race before jumping systems.'), 3800);
            this.audio.play('warning');
            return false;
        }
        return this.beginGalaxyGateTransition(jumpPoint);
    }
    clearTransientSpace() {
        for (const projectile of this.projectiles)
            if (this.projStore.isLive(projectile.slot))
                this.projStore.free(projectile.slot);
        for (const pickup of this.pickups)
            if (this.pickupStore.isLive(pickup.slot))
                this.pickupStore.free(pickup.slot);
        this.projectiles.length = 0;
        this.pickups.length = 0;
        this.ships.length = 0;
        this.capitalSpawnedHomes.clear();
        this.nextCapitalTrafficCheckAt = 0;
        // A system jump can replace one traffic population with another of the
        // same size. Reconcile the empty boundary now so the renderer's steady-
        // count fast path cannot retain meshes from the system we just left.
        this.renderer.syncShips(this.ships);
        this.renderer.syncProjectiles(this.projectiles, this.projStore);
        this.renderer.syncPickups(this.pickups, this.pickupStore);
        this.hyperdriveInterceptIds.clear();
        this.renderer.setTarget();
    }
    spawnJumpPointPirates(route) {
        const risk = jumpPiracyRisk(route.id, this.holdWorth());
        const rng = seededRandom(`${this.save.world.seed}:galaxy-intercept:${route.id}:${++this.interceptCounter}:${Math.floor(this.save.world.time)}`);
        if (rng() >= risk)
            return false;
        const player = vec(this.save.player.position);
        const count = risk > 0.48 && rng() < risk ? 2 : 1;
        const escorts = [];
        let lead;
        for (let index = 0; index < count; index += 1) {
            const offset = new THREE.Vector3(rng() - 0.5, (rng() - 0.5) * 0.45, rng() - 0.5)
                .normalize()
                .multiplyScalar(125 + index * 42 + rng() * 70);
            const pirate = this.spawnShip(index === 0 ? 'pirate' : 'escort', tuple(player.clone().add(offset)));
            pirate.targetId = 'player';
            if (index === 0)
                lead = pirate;
            else
                escorts.push(pirate);
        }
        if (lead && this.holdWorth() > 0)
            this.openMug(lead, escorts, {
                sensor: t('Raiders are waiting at the jump point — they scanned your cargo.'),
                event: t('Jump-point interception: your hold drew attention.'),
            });
        else
            this.ui.pushSensor(t('Raiders detected around the jump point.'), 'danger', 5200);
        this.audio.play('warning');
        return true;
    }
    finishGalaxyJump(jump, announce = true, spawnTraffic = true, rollPiracy = true) {
        const route = getRoute(jump?.routeId);
        const arrival = LOCATIONS[jump?.toLocationId];
        if (!route || !arrival || !hasSystem(jump?.toSystemId)) {
            this.galaxyJump = null;
            this.save.world.pendingJump = null;
            this.autopilot = false;
            this.hyperdriveFx = 'none';
            this.disarmGalaxyJump();
            return false;
        }
        this.clearTransientSpace();
        const player = this.save.player;
        player.systemId = jump.toSystemId;
        player.dockedAt = undefined;
        const outward = vec(arrival.position).normalize();
        if (outward.lengthSq() < 0.01)
            outward.set(0, 0, 1);
        const exitDirection = outward.clone().negate();
        const arrivalDistance = Math.max(180, arrival.radius * 0.82);
        const position = vec(arrival.position).addScaledVector(exitDirection, arrivalDistance);
        player.position = tuple(position);
        player.velocity = tuple(exitDirection.clone().multiplyScalar(28));
        player.angularVelocity = [0, 0, 0];
        player.throttle = clamp(jump.returnThrottle ?? this.hyperdriveReturnThrottle, 0, 1);

        const plannedSystemId = this.save.world.plannedSystemId;
        const plannedDestinationId = this.save.world.plannedDestinationId;
        const onward = plannedSystemId && plannedSystemId !== player.systemId
            ? planRoute(player.systemId, plannedDestinationId ?? plannedSystemId)
            : null;
        const localDestination = plannedDestinationId && LOCATIONS[plannedDestinationId]?.systemId === player.systemId
            ? plannedDestinationId
            : null;
        player.navTargetId = onward?.nextJumpPointId
            ?? localDestination
            ?? DEFAULT_NAV_LOCATION_BY_SYSTEM[player.systemId]
            ?? this.currentNavLocationIds()[0];
        player.currentTargetId = player.navTargetId;
        player.rotation = quatTuple(new THREE.Quaternion().setFromUnitVectors(FORWARD, exitDirection));
        if (!onward) {
            this.save.world.plannedSystemId = null;
            this.save.world.plannedDestinationId = null;
        }
        this.save.world.pendingJump = null;
        this.galaxyJump = null;
        this.armedJumpPointId = null;
        this.armedJumpPointSide = 0;
        this.autopilot = false;
        this.hyperdriveFx = 'none';
        this.hyperdriveFxUntil = 0;
        this.activeInstanceId = undefined;
        this.renderer.setSystem?.(player.systemId);
        this.renderer.setArmedJumpPoint?.();
        this.renderer.setTarget(undefined, undefined, undefined, player.navTargetId);
        this.updateActiveInstance(true);
        this.resetPlayerInterpolation(true);
        this.nextEncounterAt = this.save.world.time + 16;
        if (spawnTraffic)
            this.spawnInitialTraffic();
        const intercepted = rollPiracy ? this.spawnJumpPointPirates(route) : false;
        if (announce) {
            this.setHyperdriveStatus(t('JUMP COMPLETE · {system}', { system: SYSTEMS[player.systemId].name }), 4400);
            this.ui.pushEvent(t('Arrived in {system}. Inter-system travel cost: 0.', { system: SYSTEMS[player.systemId].name }), intercepted ? 'warning' : 'success', 5200);
            this.audio.play('hyperDrop');
        }
        this.persistSave();
        return true;
    }
    debugJumpToSystem(systemId) {
        const plan = planRoute(this.save.player.systemId, systemId);
        const point = LOCATIONS[plan?.nextJumpPointId];
        if (!plan?.ok || !point)
            return false;
        this.save.world.plannedSystemId = systemId;
        return this.finishGalaxyJump({
            routeId: point.routeId,
            fromSystemId: this.save.player.systemId,
            toSystemId: point.destinationSystemId,
            fromLocationId: point.id,
            toLocationId: point.destinationLocationId,
            startedAt: this.save.world.time,
            completeAt: this.save.world.time,
        }, false, true, false);
    }
    toggleHyperdrive() {
        if (this.armedJumpPointId) {
            // Gates are physical fly-through links, not another drive toggle.
            // Keep the proximity lock live if the player taps the monitor or
            // presses J out of habit; crossing the aperture is the action.
            this.setHyperdriveStatus(t('GATE LIVE · FLY THROUGH THE APERTURE'), 3200);
            return;
        }
        if (this.autopilot) {
            const cancelledGalaxyJump = Boolean(this.galaxyJump);
            if (cancelledGalaxyJump) {
                this.galaxyJump = null;
                this.save.world.pendingJump = null;
            }
            this.autopilot = false;
            this.hyperdriveEncounterAt = null;
            this.hyperdriveFx = 'drop';
            this.hyperdriveFxUntil = this.save.world.time + HYPERDRIVE_FX_DURATION;
            this.snapToCombatSpeed();
            this.save.player.throttle = clamp(this.hyperdriveReturnThrottle, 0, 1);
            this.setHyperdriveStatus(t('DISENGAGED'));
            this.audio.play('hyperDrop');
            if (cancelledGalaxyJump)
                this.persistSave();
            return;
        }
        const jumpPoint = this.readyJumpPoint();
        if (jumpPoint) {
            this.startGalaxyJump(jumpPoint);
            return;
        }
        const block = this.hyperdriveBlockReason();
        if (block) {
            this.setHyperdriveStatus(block.message, block.duration ?? 3000);
            if (block.kind !== 'info')
                this.audio.play('warning');
            return;
        }
        const player = vec(this.save.player.position);
        const nav = LOCATIONS[this.save.player.navTargetId];
        this.hyperdriveReturnThrottle = this.save.player.throttle;
        this.autopilot = true;
        this.hyperdriveFx = 'spooling';
        this.hyperdriveSpoolStartedAt = this.save.world.time;
        // Each local hyperdrive leg rolls from the destination's danger. Jump-point
        // approaches add cargo-sensitive pirate pressure from the connected route.
        // An encounter already in progress nearby keeps the leg clean.
        const hostileInSector = this.ships.some((ship) => ship.hostile && ship.hull > 0 && player.distanceTo(vec(ship.position)) < ENCOUNTER_LOCK_RADIUS);
        const rng = seededRandom(`${this.save.world.seed}:jump:${++this.jumpCounter}:${Math.floor(this.save.world.time)}`);
        // The calm window after a resolved intercept suppresses new ambushes
        // without touching the drive: jump away freely, just no immediate re-hit.
        // A dark pilot is far harder to intercept: nobody sees the jump, so the
        // odds shrink to the DARK_ENCOUNTER_MULT fraction.
        const broadcastMultiplier = this.playerBroadcasting() ? 1 : DARK_ENCOUNTER_MULT;
        const sectorRisk = sectorEncounterChance(nav.id) * this.combatEncounterScale() * broadcastMultiplier;
        const cargoRisk = nav.kind === 'jump-point'
            ? jumpPiracyRisk(nav.routeId, this.holdWorth(), { atJumpPoint: false }) * broadcastMultiplier
            : 0;
        const encounterRisk = 1 - (1 - clamp(sectorRisk, 0, 1)) * (1 - clamp(cargoRisk, 0, 1));
        if (!hostileInSector && this.hyperdriveCooldownRemaining() <= 0 && rng() < encounterRisk) {
            const travelSeconds = HYPERDRIVE_SPOOL_SECONDS + player.distanceTo(vec(nav.position)) / HYPERDRIVE_CRUISE_SPEED;
            this.hyperdriveEncounterAt = this.save.world.time + travelSeconds * randomBetween(rng, 0.4, 0.75);
        }
        this.setHyperdriveStatus(t('VECTOR SET · {name}', { name: nav.name }), 3200);
        this.audio.play('hyperSpool');
    }
    // Why a jump cannot start right now (null = clear). Shared by the toggle
    // (toast hints on press) and the HUD model (identity-card ready glow), so
    // the button light and the press feedback can never drift apart.
    // The drive itself is never gated by the post-intercept calm window: the
    // 45s encounter cooldown only suppresses NEW ambushes (see toggleHyperdrive),
    // so a resolved fight never strands the player from jumping away.
    hyperdriveBlockReason() {
        const player = vec(this.save.player.position);
        if (this.hostilesVisibleNear(player, HYPERDRIVE_THREAT_RADIUS))
            return { message: t('Hyperdrive unavailable while an enemy is close.'), kind: 'danger' };
        const nav = LOCATIONS[this.save.player.navTargetId];
        const arrivalRadius = hyperdriveArrivalRadius(nav);
        if (nav.kind === 'jump-point' && player.distanceTo(vec(nav.position)) <= arrivalRadius + 0.5)
            return null;
        if (player.distanceTo(vec(nav.position)) < arrivalRadius + 12)
            return { message: t('Already inside the selected nav drop zone.'), kind: 'info' };
        const toNav = vec(nav.position).sub(player);
        const forward = FORWARD.clone().applyQuaternion(quat(this.save.player.rotation)).normalize();
        if (forward.dot(toNav.clone().normalize()) < HYPERDRIVE_ALIGNMENT)
            return { message: t('Hyperdrive requires a clear vector: align your ship with the nav point.'), kind: 'warning', duration: 3800 };
        if (this.lineBlocked(player, vec(nav.position)))
            return { message: t('Hyperdrive path obstructed.'), kind: 'danger' };
        return null;
    }
    hyperdriveFxState() {
        const now = this.save.world.time;
        if (this.hyperdriveFx === 'gate')
            return {
                fx: 'gate',
                progress: clamp(1 - (this.hyperdriveFxUntil - now) / GATE_TRANSITION_SECONDS, 0, 1),
            };
        if (this.hyperdriveFx === 'spooling') {
            if (!this.autopilot) {
                this.hyperdriveFx = 'none';
                return { fx: 'none', progress: 0 };
            }
            const progress = clamp((now - this.hyperdriveSpoolStartedAt) / HYPERDRIVE_SPOOL_SECONDS, 0, 1);
            if (progress >= 1) {
                this.hyperdriveFx = 'active';
                this.audio.play('hyperActive');
                return { fx: 'active', progress: 1 };
            }
            return { fx: 'spooling', progress };
        }
        if (this.hyperdriveFx === 'drop' || this.hyperdriveFx === 'interrupt') {
            const duration = this.hyperdriveFx === 'interrupt' ? HYPERDRIVE_INTERRUPT_DURATION : HYPERDRIVE_FX_DURATION;
            if (now >= this.hyperdriveFxUntil) {
                this.hyperdriveFx = 'none';
                return { fx: 'none', progress: 0 };
            }
            return { fx: this.hyperdriveFx, progress: clamp((this.hyperdriveFxUntil - now) / duration, 0, 1) };
        }
        if (this.hyperdriveFx === 'active' && this.autopilot)
            return { fx: 'active', progress: 1 };
        return { fx: 'none', progress: 0 };
    }
    spawnHyperdriveIntercept() {
        const player = vec(this.save.player.position);
        const rng = seededRandom(`${this.save.world.seed}:intercept:${++this.interceptCounter}`);
        const count = rng() < 0.35 ? 2 : 1;
        const escorts = [];
        let lead;
        for (let index = 0; index < count; index += 1) {
            // The lead spawns inside the dark-detection line so a dark pilot can
            // always see — and target — who is hailing them; escorts may ride
            // the dark band and emerge as the fight develops.
            const spawnRange = index === 0 ? 100 + rng() * 95 : 140 + rng() * 160;
            const offset = new THREE.Vector3(rng() - 0.5, (rng() - 0.5) * 0.5, rng() - 0.5).normalize().multiplyScalar(spawnRange);
            const pirate = this.spawnShip(index === 0 ? 'pirate' : 'escort', tuple(player.clone().add(offset)));
            pirate.targetId = 'player';
            this.hyperdriveInterceptIds.add(pirate.id);
            if (index === 0)
                lead = pirate;
            else
                escorts.push(pirate);
        }
        // A jump ambush opens with the same standoff as ambient pirate traffic:
        // the crew wants cargo (or a hull-and-outfit toll), not necessarily a
        // wreck. The killer minority still jumps straight to weapons-free.
        // If the player was recently seen working (mining/salvaging), the
        // ambush carries the opportunist voice — they followed the work.
        if (lead && rng() < MUG_CHANCE)
            this.openMug(lead, escorts, this.save.world.time < this.seenWorkingUntil
                ? {
                    lines: OPPORTUNITY_DEMAND_LINES,
                    emptyLines: OPPORTUNITY_EMPTY_LINES,
                    sensor: t('Pirates closing — they were watching you work.'),
                    emptySensor: t('Pirates break off: your hold is empty.'),
                }
                : undefined);
        else
            this.ui.pushSensor(t('Pirate intercept. Weapons free.'), 'danger', 4800);
        this.threatAcquireTarget();
        this.audio.play('warning');
    }
    resolveHyperdriveIntercept(ship) {
        if (!this.hyperdriveInterceptIds.delete(ship.id) || this.hyperdriveInterceptIds.size > 0)
            return;
        this.hyperdriveEncounterCooldownUntil = this.save.world.time + HYPERDRIVE_ENCOUNTER_COOLDOWN;
    }
    hyperdriveCooldownRemaining() {
        return Math.max(0, this.hyperdriveEncounterCooldownUntil - this.save.world.time);
    }
    snapToCombatSpeed() {
        const velocity = vec(this.save.player.velocity);
        const cap = this.playerStats().maxSpeed * 1.05;
        if (velocity.length() > cap)
            this.save.player.velocity = tuple(velocity.normalize().multiplyScalar(cap));
    }
    updateShips(dt) {
        const playerPosition = vec(this.save.player.position, this.tmpShipPlayer);
        for (const ship of this.ships) {
            if (ship.hull <= 0)
                continue;
            // Race pilots are kinematic props of an active race: updateRaceRacer
            // drives them gate-to-gate, so the AI/collision/chatter stack must
            // not touch them (a trade AI would fly them off to a port mid-race).
            if (ship.race)
                continue;
            // Plasma burn chews the hull for a few seconds after a mortar hit:
            // ticked damage so the death/bounty pipeline sees normal hits.
            if (ship.burn !== undefined) {
                if (this.save.world.time < ship.burn.until) {
                    ship.burn.tick -= dt;
                    if (ship.burn.tick <= 0) {
                        ship.burn.tick = 0.5;
                        this.damageShip(ship, ship.burn.dps * 0.5, ship.burn.attackerId, undefined);
                    }
                }
                else
                    delete ship.burn;
            }
            ship.lifetime += dt;
            // ?? 0 guard: a spawn path that forgets these fields (probe seeds,
            // future spawners) must not NaN-poison the timers — a NaN
            // fireCooldown silently produced a pirate that NEVER fired.
            ship.fireCooldown = (ship.fireCooldown ?? 0) - dt;
            ship.missileCooldown = (ship.missileCooldown ?? 0) - dt;
            ship.shieldDelay = (ship.shieldDelay ?? 0) - dt;
            if (ship.shieldDelay <= 0)
                ship.shield = Math.min(ship.maxShield, ship.shield + dt * (ship.shieldRegen ?? 3.8));
            // The standoff clock runs down: once it expires the hunters open
            // fire (or they already did if the pilot shot first).
            if (ship.holdFire && this.save.world.time >= (ship.demandUntil ?? 0))
                this.endMugStandoff(ship);
        // The per-ship AI hierarchy — task (what the ship wants) → interaction
        // (tasks colliding) → behavior (how it moves this frame). See shipAI.js:
        // the old flat if/else dispatch (patrol-engage → search → attack →
        // travel) now lives there as updateShipAI, with the task layer feeding
        // travel waypoints and the interaction layer running emergent mugs.
        updateShipAI(this, ship, dt);
        // Interaction: a patrol that resolves the pilot while they carry
        // syndicate cargo busts them (seizure + fine + Concord hit).
        if (ship.role === 'patrol')
            this.checkSmugglerBust(ship);
        this.resolveNpcCollisions(ship);
        const position = vec(ship.position, this.tmpShipPos);
        // Priority order for the one-voice slot: the one-shot recognition
        // line lands first (a wary re-encounter shouldn't lose it to generic
        // combat chatter), then the proximity mutter, then the timed lines.
        this.maybeRecognitionLine(ship, position, playerPosition);
        this.maybeProximityLine(ship, position, playerPosition);
        this.maybePilotLine(ship, position, playerPosition);
        // Neutral/friendly passing lines sit at the bottom of the priority
        // stack: a greeting never steals the floor from a fight.
        this.maybeNeutralChatter(ship, position, playerPosition);
        if (position.distanceTo(playerPosition) > 950 && ship.lifetime > 40 && !ship.missionId && !ship.captured && !ship.capitalClass) {
            // An NPC hyperdrive hop: trade, smuggle, and flee pilots jump to
            // another port — mark the departure with a warp streak instead of
            // a silent cull (renderer.spawnHyperdriveStreak).
            const hopping = ship.task?.kind === 'trade' || ship.task?.kind === 'smuggle' || ship.task?.kind === 'flee';
            if (hopping) {
                const palette = paletteForFaction(ship.faction, ship.hostile);
                this.renderer.spawnHyperdriveStreak?.(ship.position, ship.velocity, palette.engine);
            }
            ship.hull = -1;
        }
        }
    }
    // The comms surfaces color each line by the speaker's relation to the
    // player: hostiles red, allies blue, neutral white. Hostile is the flag
    // itself; an unhostile patrol with a non-player target is actively
    // fighting on our side (wingman, friendly patrol) and reads as an ally.
    shipRelation(ship) {
        return ship.hostile ? 'hostile' : ship.role === 'patrol' && ship.targetId && ship.targetId !== 'player' ? 'ally' : 'neutral';
    }
    // A pilot who recognizes the player and was captured (not escaped) defers:
    // non-hostile, never re-engages, offers favors. Escaped pilots come back
    // wary instead — hostile and jumpy — so most gates key on this predicate.
    deferentialPilot(ship) {
        return ship.recognizesPlayer && !ship.waryOfPlayer;
    }
    // One voice at a time: a pilot line may only land when no story mute is
    // up and the previous line has had its full read time (CHATTER_GAP).
    // Every chatter emitter gates on this, so a 3v1 streams one readable
    // line at a time instead of a wall of overlapping callsigns.
    chatterOpen() {
        return !this.storyLineActive() && this.save.world.time >= (this.nextChatterAt ?? 0);
    }
    // The single path every pilot line lands through: stamps the global gap,
    // then shows the line with the speaker's relation color and chirp.
    sayPilotLine(ship, line, relation = this.shipRelation(ship)) {
        this.nextChatterAt = this.save.world.time + CHATTER_GAP;
        // Localize here — the single path every spoken line lands through.
        // Lines already localized at their pool definition pass through
        // unchanged (the catalog key is English; a German string simply has
        // no entry and renders as itself).
        this.ui.showPilotLine?.(ship.name, t(line), relation);
        this.audio?.playComms?.(ship.pilot.temperament);
    }
    // A line from a whole group (a scared-off mug): the comms bar shows every
    // callsign at once so the player sees who folded.
    sayGroupLine(ships, line) {
        this.nextChatterAt = this.save.world.time + CHATTER_GAP;
        this.ui.showGroupLine?.(ships.map((ship) => ship.name), t(line), this.shipRelation(ships[0]));
        this.audio?.playComms?.(ships[0].pilot.temperament);
    }
    playerLosing() {
        const stats = this.playerStats();
        return stats.hull > 0 && this.save.player.hull / stats.hull < 0.35;
    }
    // Whether the player's bounty rank is high enough to earn a name-drop, and
    // the actual title for the line.
    rankAware() {
        return (this.save.player.guildRank?.bounty ?? 0) >= 2;
    }
    rankTitle() {
        return GUILD_RANK_NAMES.bounty[this.save.player.guildRank?.bounty ?? 0];
    }
    // Valuable sealed load worth a callout: 'case' for the diplomatic case,
    // 'cargo' for other labeled contract goods, undefined for an empty or
    // mundane hold.
    cargoFlavor() {
        const labels = (this.save.player.sealedCargo ?? []).map((entry) => entry.label);
        if (labels.includes('sealed diplomatic case'))
            return 'case';
        return labels.some((label) => VALUABLE_CARGO_LABELS.includes(label)) ? 'cargo' : undefined;
    }
    // Pick a line from a pool with the ship's seeded RNG, stepping around the
    // previously used line so chatter rotates instead of repeating, and
    // remembering which one-shot situation lines have been said.
    pickPilotLine(ship, key, lines) {
        let index = Math.floor(ship.aiRng() * lines.length);
        const last = this.pilotLineHistory.get(ship.id);
        if (lines.length > 1 && last?.key === key && last.index === index)
            index = (index + 1) % lines.length;
        const said = new Set(last?.said ?? []);
        if (PILOT_ONESHOT_KEYS.has(key))
            said.add(key);
        this.pilotLineHistory.set(ship.id, { key, index, said });
        return lines[index];
    }
    storyLineActive() {
        return this.save.world.time < (this.storyLineUntil ?? 0);
    }
    // Story-mission entry point: pin a story transmission on the comms bar
    // and mute all chatter until the player dismisses it (or the duration
    // elapses). The mock story content proves the seam end-to-end; real
    // story missions call this with their own lines.
    playStoryLine(name, text, relation = 'neutral', duration = 12000) {
        this.storyLineUntil = this.save.world.time + duration;
        this.ui.showStoryLine?.(name, text, relation);
    }
    // Called every frame: lift the story mute when the player dismissed the
    // bar or the duration elapsed, and unpin the bar.
    refreshStoryLine() {
        if (this.ui.storyDismissed || (this.storyLineUntil !== undefined && this.save.world.time >= this.storyLineUntil)) {
            this.storyLineUntil = undefined;
            this.ui.dismissStory?.();
            this.ui.storyDismissed = false;
        }
    }
    // Combat comms: temperament-driven chatter while engaged with the player.
    // Timid pilots cry for help when hurt or fleeing, aggressive pilots
    // threaten, flamboyant pilots showboat; steady pilots stay silent
    // professionals. Lines roll on a per-ship seeded timer, so the chatter is
    // deterministic like every other pilot roll.
    maybePilotLine(ship, position, playerPosition) {
        if (!this.chatterOpen())
            return;
        const pilot = ship.pilot;
        const pool = pilot ? PILOT_LINES[pilot.temperament] : undefined;
        if (!pool || !ship.hostile || playerPosition.distanceTo(position) > 550)
            return;
        // Combat chatter still needs eyes on the target: a hostile can't taunt a
        // dark pilot it can't resolve (or a ship hiding behind a rock).
        if (!this.canSee(position, playerPosition, !this.playerBroadcasting(), ...this.playerSensorArgs()))
            return;
        const engaged = ship.targetId === 'player' || ship.fleeing;
        if (!engaged)
            return;
        const hullRatio = ship.maxHull > 0 ? ship.hull / ship.maxHull : 1;
        const said = this.pilotLineHistory.get(ship.id)?.said ?? new Set();
        const cargo = this.cargoFlavor();
        // Situation-aware pick: the pool follows the fight state, evaluated so
        // the most urgent read wins. Timid pilots only speak when things go
        // wrong (hurt, fleeing, or a nervous first line); the others talk
        // through the whole fight — first contact once, then one-shot lines
        // naming the player's bounty rank (when high) or valuable sealed
        // cargo, then threats/taunts, gloating when the player is falling
        // apart, desperate when their own hull is low.
        let key;
        if (pilot.temperament === 'timid') {
            if (ship.fleeing || hullRatio < 0.45)
                key = 'distress';
            else if (hullRatio < 0.7)
                key = 'pressed';
            else if (!said.has('contact') && pool.contact?.length)
                key = 'contact';
            else if (!said.has('rank') && this.rankAware() && pool.rank?.length)
                key = 'rank';
            else if (!said.has(cargo) && cargo && pool[cargo]?.length)
                key = cargo;
        }
        else if (hullRatio < 0.2 && pool.pressed?.length)
            key = 'pressed';
        else if (this.playerLosing() && pool.gloat?.length)
            key = 'gloat';
        else if (!said.has('contact') && pool.contact?.length)
            key = 'contact';
        else if (!said.has('rank') && this.rankAware() && pool.rank?.length)
            key = 'rank';
        else if (!said.has(cargo) && cargo && pool[cargo]?.length)
            key = cargo;
        else if (pool.threat?.length)
            key = 'threat';
        else if (pool.taunt?.length)
            key = 'taunt';
        const lines = key ? pool[key] : undefined;
        if (!lines?.length || this.save.world.time < (ship.nextLineAt ?? 0))
            return;
        ship.nextLineAt = this.save.world.time + 12 + ship.aiRng() * 12;
        const line = this.pickPilotLine(ship, key, lines);
        // Chatter goes to the top-center comms bar, not the toast stack —
        // several hostiles talking should never bury real alerts.
        this.sayPilotLine(ship, key === 'rank' ? t(line).replace('{rank}', t(this.rankTitle())) : t(line));
    }
    // Proximity mutter: a pilot says one thing when the player closes inside
    // PROXIMITY_RANGE — a reaction to being noticed, on top of the timed
    // combat chatter. Edge-triggered (fires when the player crosses into
    // range, not every frame) with a long cooldown, and rolled on its own
    // seeded stream so it never perturbs the combat rolls. Allies don't
    // mutter at you; steady pilots stay silent as always.
    maybeProximityLine(ship, position, playerPosition) {
        if (this.storyLineActive())
            return;
        // A surrendered pilot pleads once more when the player closes in — a
        // single follow-up to the surrender line, then silence. No proximity
        // mutter: a beaten ship has nothing to say but "please". Fires as
        // soon as the player is within range (no edge tracking), so the plea
        // lands even if the player was already beside the ship when it gave up.
        if (ship.captured)
            return;
        if (ship.surrendered) {
            if (!ship.saidSurrenderPlead && playerPosition.distanceTo(position) <= PROXIMITY_RANGE && this.canSee(position, playerPosition, !this.playerBroadcasting(), ...this.playerSensorArgs()) && this.chatterOpen()) {
                ship.saidSurrenderPlead = true;
                const pool = ship.pilot ? PILOT_LINES[ship.pilot.temperament]?.plead : undefined;
                if (pool?.length) {
                    const line = pool[Math.floor(ship.proxRng() * pool.length)];
                    this.sayPilotLine(ship, line);
                }
            }
            return;
        }
        if (!this.chatterOpen())
            return;
        // The edge is only tracked after a short spawn grace, so a ship that
        // spawns inside range still gets its mutter a beat later instead of
        // the flag eating the approach edge before it may speak. The pilot must
        // also be able to see the player: no mutter for a dark or occluded ship.
        const tracking = this.save.world.time >= ship.spawnTime + 2;
        const within = tracking && this.canSee(position, playerPosition, !this.playerBroadcasting(), ...this.playerSensorArgs()) && playerPosition.distanceTo(position) <= PROXIMITY_RANGE;
        const pool = ship.pilot ? PILOT_LINES[ship.pilot.temperament] : undefined;
        // Hostile ships mutter their wary proximity lines; neutral and friendly
        // traffic say a passing line instead (see maybeNeutralChatter).
        if (within && !ship.nearPlayer && !this.deferentialPilot(ship) && pool?.proximity?.length && this.shipRelation(ship) === 'hostile'
            && this.save.world.time >= (ship.nextProximityAt ?? 0)) {
            ship.nextProximityAt = this.save.world.time + 25 + ship.proxRng() * 20;
            const line = pool.proximity[Math.floor(ship.proxRng() * pool.proximity.length)];
            this.sayPilotLine(ship, line);
        }
        ship.nearPlayer = within;
    }
    // Neutral/friendly traffic: when the player slips close (<NEUTRAL_CHAT_RANGE)
    // a passing spacer says one line — patrols keep their official voice,
    // everyone else greets by temperament. Station-approach traders/miners
    // instead lead with market banter (a tip or grumble keyed to live prices)
    // about half the time, so the lanes sound like working pilots. A patrol
    // greet opens a short reply window (see patrolReply) that pays a tiny
    // Concord courtesy. Edge-triggered with a long cooldown and rolled on the
    // prox stream so it never perturbs the combat rolls.
    maybeNeutralChatter(ship, position, playerPosition) {
        if (this.storyLineActive() || !this.chatterOpen())
            return;
        if (ship.hostile || ship.surrendered || ship.captured || ship.standingDown || this.deferentialPilot(ship) || ship.search)
            return;
        const tracking = this.save.world.time >= ship.spawnTime + 2;
        // The greet only lands if the ship can actually see the pilot — a dark
        // or occluded player gets no hail until they're eyeball-close.
        const within = tracking && this.canSee(position, playerPosition, !this.playerBroadcasting(), ...this.playerSensorArgs()) && playerPosition.distanceTo(position) <= NEUTRAL_CHAT_RANGE;
        if (within && !ship.nearNeutral && this.save.world.time >= (ship.nextNeutralChatAt ?? 0)) {
            ship.nextNeutralChatAt = this.save.world.time + 40 + ship.proxRng() * 30;
            const banter = ship.role !== 'patrol' && ship.stationTraffic && ship.proxRng() < MARKET_BANTER_CHANCE
                ? this.marketBanterLine(ship)
                : undefined;
            if (banter)
                this.sayPilotLine(ship, banter);
            else if (ship.role === 'patrol') {
                const pool = PATROL_GREET_LINES;
                const line = pool[Math.floor(ship.proxRng() * pool.length)];
                this.sayPilotLine(ship, line);
                // The cordon pilot's greeting invites a courtesy reply while it
                // is still fresh (see patrolReply / ui REPLY chip).
                this.patrolReplyWindow = { shipId: ship.id, until: this.save.world.time + PATROL_REPLY_SECONDS };
            }
            else {
                const pool = ship.pilot ? PILOT_LINES[ship.pilot.temperament]?.greet : undefined;
                if (pool?.length)
                    this.sayPilotLine(ship, pool[Math.floor(ship.proxRng() * pool.length)]);
            }
        }
        ship.nearNeutral = within;
    }
    // Market banter for a station-approach trader/miner: pick a commodity at
    // their station, compare its live price to base, and say a tip, a grumble,
    // or a flat observation accordingly. Returns undefined when no station
    // market is available, so the caller falls back to a plain greet.
    marketBanterLine(ship) {
        const locationId = ship.stationTraffic;
        const market = this.save.world.market?.[locationId];
        const location = LOCATIONS[locationId];
        if (!market || !location)
            return undefined;
        const commodityId = MARKET_BANTER_COMMODITIES[Math.floor(ship.proxRng() * MARKET_BANTER_COMMODITIES.length)];
        const item = market[commodityId];
        if (!item)
            return undefined;
        const price = item.lastPrice;
        const base = COMMODITIES[commodityId].basePrice;
        const ratio = price / base;
        const pool = ratio >= MARKET_BANTER_GOOD_PRICE ? MARKET_BANTER_TIP_LINES
            : ratio <= MARKET_BANTER_BAD_PRICE ? MARKET_BANTER_GRUMBLE_LINES
            : MARKET_BANTER_FLAT_LINES;
        return pool[Math.floor(ship.proxRng() * pool.length)]
            .replace(/\{commodity\}/g, COMMODITIES[commodityId].name)
            .replace(/\{price\}/g, String(price))
            .replace(/\{station\}/g, location.shortName ?? location.name);
    }
    // The patrol greeting's reply window: live while a patrol is still waiting
    // for the courtesy. Expires on its own clock and is dropped when the ship
    // leaves the field.
    patrolReplyActive() {
        if (!this.patrolReplyWindow || this.save.world.time >= this.patrolReplyWindow.until)
            return undefined;
        const patrol = this.ships.find((ship) => ship.id === this.patrolReplyWindow.shipId && ship.hull > 0);
        if (!patrol)
            return undefined;
        return { seconds: Math.ceil(this.patrolReplyWindow.until - this.save.world.time), shipId: patrol.id };
    }
    // The player answers the cordon pilot: a brief official acknowledgment and
    // a small Concord reputation courtesy (see PATROL_REPLY_REP). One reply
    // per greeting — the window closes as soon as it is used.
    patrolReply() {
        if (!this.patrolReplyActive())
            return false;
        const patrol = this.ships.find((ship) => ship.id === this.patrolReplyWindow.shipId && ship.hull > 0);
        this.patrolReplyWindow = undefined;
        if (!patrol)
            return false;
        const line = PATROL_REPLY_LINES[Math.floor(patrol.proxRng() * PATROL_REPLY_LINES.length)];
        this.sayPilotLine(patrol, line);
        this.save.player.reputation.concord = clamp(this.save.player.reputation.concord + PATROL_REPLY_REP, -100, 100);
        this.ui.pushEvent(t('Acknowledged by {name}. Concord courtesy +{rep}.', { name: patrol.name, rep: PATROL_REPLY_REP }), 'success', 4200);
        this.audio.play('ui', 0.6);
        return true;
    }
    // A pilot the player has beaten before recognizes them on a later
    // encounter: one line when the player gets close, then silence. A captured
    // pilot defers (deference pool, never re-engages); one who escaped comes
    // back wary (wary pool, hostile and fighty). Fires once per ship, rolled
    // on the seeded aiRng like the rest of the chatter.
    maybeRecognitionLine(ship, position, playerPosition) {
        if (!this.chatterOpen() || ship.saidRecognition || !ship.recognizesPlayer)
            return;
        if (playerPosition.distanceTo(position) > PROXIMITY_RANGE)
            return;
        // Recognition needs eyes too: a dark pilot is just another blip until
        // the ship can resolve them.
        if (!this.canSee(position, playerPosition, !this.playerBroadcasting(), ...this.playerSensorArgs()))
            return;
        ship.saidRecognition = true;
        const pool = ship.pilot ? PILOT_LINES[ship.pilot.temperament]?.[this.deferentialPilot(ship) ? 'deference' : 'wary'] : undefined;
        if (!pool?.length)
            return;
        const line = pool[Math.floor(ship.aiRng() * pool.length)];
        this.sayPilotLine(ship, line);
    }
    // A pilot the player spared occasionally pays the debt when scanned: a tip
    // about a valuable wreck (flagged on the scanner, if any remain) or a
    // market contact (supply/demand nudged so the station actually honors the
    // tip). One roll per ship, on its own seeded stream — deterministic and
    // never touching the combat rolls.
    givePilotFavor(ship) {
        const rng = seededRandom(`${this.save.world.seed}:favor:${ship.id}`);
        if (rng() >= PILOT_FAVOR_CHANCE)
            return false;
        // Half the time the favor is a wreck tip; with no wrecks left it falls
        // back to a market contact so the favor always lands.
        const wreckTip = rng() < 0.5 && this.giveWreckTip();
        return wreckTip || this.giveMarketTip(rng);
    }
    // Flag the best unscanned wreck on the scanner: the player learns exactly
    // which wreck off Mourning Line is worth the trip (the map reads the
    // scanned flag live, and the 3D marker pops on the next target sync).
    giveWreckTip() {
        const unseen = this.wreckNodes.filter((node) => node.remaining > 0 && !node.scanned);
        if (!unseen.length)
            return false;
        // Flag the highest-value wreck left: the tip should point at the trip
        // that's actually worth making.
        const worth = (node) => COMMODITIES[node.salvage].basePrice * node.remaining;
        const node = unseen.reduce((best, candidate) => (worth(candidate) > worth(best) ? candidate : best));
        node.scanned = true;
        if (!this.save.world.scannedNodes.includes(node.id))
            this.save.world.scannedNodes.push(node.id);
        const tipCommodity = SCAN_COMMODITY_LABELS[node.salvage] ?? COMMODITIES[node.salvage].name.toUpperCase();
        this.ui.pushSensor(t('Tip: {name} carries {commodity}. Flagged on scanner.', { name: node.name, commodity: t(tipCommodity) }), 'success', 6500);
        return true;
    }
    // A trade contact: nudge one station's supply/demand so the tip is real
    // (they pay more for something, or have something below market). The price
    // drifts back toward the location's baseline over the next few cycles.
    giveMarketTip(rng) {
        const favorites = ['medicine', 'electronics', 'machinery', 'luxuries', 'arms'];
        const locationId = MARKET_LOCATION_IDS[Math.floor(rng() * MARKET_LOCATION_IDS.length)];
        const commodityId = favorites[Math.floor(rng() * favorites.length)];
        const sellTip = rng() < 0.5;
        const item = this.save.world.market[locationId][commodityId];
        if (sellTip)
            item.demand += 15;
        else
            item.supply += 15;
        refreshAllPrices(this.save.world.market, this.save.world.seed, this.save.world.economyClock);
        const tipCommodity = SCAN_COMMODITY_LABELS[commodityId] ?? COMMODITIES[commodityId].name.toUpperCase();
        this.ui.pushSensor(sellTip
            ? t('Tip: {station} pays top credit for {commodity}.', { station: LOCATIONS[locationId].shortName, commodity: t(tipCommodity) })
            : t('Tip: {station} sells {commodity} below market.', { station: LOCATIONS[locationId].shortName, commodity: t(tipCommodity) }), 'success', 6500);
        return true;
    }
    // Taunt on a landed hit: ace-tier and flamboyant pilots like to talk while
    // they're winning, so a successful shot at the player feels personal. The
    // chance and cooldown roll on the ship's seeded aiRng (deterministic like
    // every other pilot roll) and the chirp announces the transmission. A
    // temperament with its own taunts (flamboyant) uses those; silent
    // temperaments borrow the ace pool when the tier earns the right to brag.
    maybeHitTaunt(attackerId) {
        if (!this.chatterOpen() || attackerId === 'player' || this.deathTimer > 0)
            return;
        const ship = this.ships.find((entry) => entry.id === attackerId && entry.hull > 0);
        const pilot = ship?.pilot;
        if (!pilot || (pilot.tier !== 'ace' && !pilot.flamboyance && pilot.temperament !== 'aggressive'))
            return;
        if (this.save.world.time < (ship.nextHitTauntAt ?? 0))
            return;
        // Who talks and how often: aces and flamboyants brag on nearly a third
        // of their volleys; aggressive pilots threaten with a smaller chance so
        // their lines land as exclamation points, not static.
        const chance = pilot.tier === 'ace' || pilot.flamboyance ? 0.35 : pilot.temperament === 'aggressive' ? 0.18 : 0;
        if (chance === 0 || ship.aiRng() >= chance)
            return;
        ship.nextHitTauntAt = this.save.world.time + 6 + ship.aiRng() * 8;
        // Talk is backed by action: an aggressive pilot who lands a hit presses
        // the next pass — tighter standoff and a shorter extend while the press
        // window lasts (see updateAttackAI), so the threat is followed by a
        // real closing run, not just words.
        if (pilot.temperament === 'aggressive')
            ship.pressingUntil = this.save.world.time + 5;
        // The line follows the moment: when the player is falling apart a
        // landed hit earns a gloat; otherwise temperament flavor first
        // (flamboyant taunts, aggressive threats), with silent temperaments
        // borrowing the ace pool when the tier earns the right to brag.
        const ownPool = PILOT_LINES[pilot.temperament];
        const gloatPool = this.playerLosing() ? (ownPool?.gloat ?? PILOT_LINES.ace.gloat) : undefined;
        const lines = gloatPool?.length ? gloatPool
            : ownPool?.taunt ?? ((pilot.tier === 'ace' || pilot.temperament === 'aggressive') ? (ownPool?.threat ?? PILOT_LINES.ace.taunt) : undefined);
        if (!lines?.length)
            return;
        const line = this.pickPilotLine(ship, 'hittaunt', lines);
        // Chatter goes to the comms bar like the timer lines — a landed shot is
        // just a sharper moment to speak up.
        this.sayPilotLine(ship, line);
    }
    // Search AI. Only a ship that already had the player resolved and then lost
    // the signal opens a search: a patrol that watched a dark contact vanish
    // (the blue sweep ring) or a hostile actually targeting the player that
    // lost the resolve (the red sweep ring). The searcher flies to the
    // last-known waypoint, then randomly fans out across the 100-km sweep
    // radius for a timed window before giving up for a cooldown. A dark player
    // shakes the search by outrunning it (speed bleed — the approach is slower
    // than a lit hull's cruise), by breaking line of sight (occlusion — the
    // sweep ends at the last-known position), or by dropping the
    // beam/transponder at range (the vanished-signal trigger). Re-resolving
    // the player closes the search on the spot: a patrol hails a firm contact,
    // a hostile re-engages. Returns true while the ship is mid-search — its
    // movement is the travel AI on the sweep point, not a live chase.
    updateSearchAI(ship, dt) {
        if (this.arena)
            return false;
        const isPatrol = ship.role === 'patrol' && !ship.hostile;
        const huntingPlayer = (ship.hostile || ship.role === 'pirate' || ship.role === 'bounty' || ship.role === 'escort') && ship.targetId === 'player';
        if (!isPatrol && !huntingPlayer)
            return false;
        // Allocation-free (BUG-25): this runs per searching ship per step, so
        // player/position/anchor ride the session scratches (tmpA..tmpD — none
        // of the callees below touch them; beginSearch tuples its anchor on
        // entry). Only STORED tuples (lastResolvedPlayer, fanPoint) allocate.
        const player = this.tmpA.set(this.save.player.position[0], this.save.player.position[1], this.save.player.position[2]);
        const position = this.tmpB.set(ship.position[0], ship.position[1], ship.position[2]);
        const broadcasting = this.playerBroadcasting();
        const dark = !broadcasting;
        const [playerSpeed, playerMax] = this.playerSensorArgs();
        const withinRange = player.distanceTo(position) <= (dark ? this.darkVisibilityRange(playerSpeed, playerMax) : NPC_SENSOR_RANGE);
        const occluded = this.lineBlocked(position, player);
        let resolvedNow = withinRange && !occluded;
        if (!resolvedNow && ship.resolvedPlayerLast && withinRange && occluded) {
            // The pilot ducked behind a rock while still inside sensor range: a
            // ship that just had eyes on them keeps the resolve for a short
            // grace while the rock stays in the way — breaking visual contact
            // is a maneuver (hold the line for a couple of seconds), not a
            // one-frame flicker. Only occlusion earns the grace; a signature
            // that simply vanishes (range) opens the search immediately.
            if (ship.occludedUntil === undefined)
                ship.occludedUntil = this.save.world.time + OCCLUSION_TRACK_SECONDS;
            if (this.save.world.time < ship.occludedUntil)
                resolvedNow = true;
        }
        else {
            ship.occludedUntil = undefined;
        }
        if (resolvedNow)
            ship.lastResolvedPlayer = tuple(player);
        if (isPatrol) {
            // A dark contact the patrol can resolve is a catch, not a search:
            // warn and ding Concord standing, then hold. The sweep only opens
            // once the patrol loses a contact it had resolved (below).
            if (!ship.search && resolvedNow && dark && this.save.world.time >= (ship.catchCooldownUntil ?? 0))
                this.catchDarkPatrol(ship);
            // Vanished signal: the patrol that already saw the player
            // investigates the last-known position.
            if (!ship.search && ship.resolvedPlayerLast && !resolvedNow && dark && this.save.world.time >= (ship.searchCooldownUntil ?? 0)) {
                this.beginSearch(ship, ship.lastResolvedPlayer ?? player, 'patrol');
                this.announceSearchStart(ship, 'patrol');
            }
        }
        else if (!ship.search && ship.resolvedPlayerLast && !resolvedNow && this.save.world.time >= (ship.searchCooldownUntil ?? 0)) {
            // A hostile actually targeting the player that lost the resolve
            // sweeps the last-known spot instead of flying at the live chase.
            this.beginSearch(ship, ship.lastResolvedPlayer ?? player, 'hostile');
            this.announceSearchStart(ship, 'hostile');
        }
        ship.resolvedPlayerLast = resolvedNow;
        if (!ship.search)
            return false;
        const search = ship.search;
        // The pilot went lit mid-search: they are ordinary traffic again, so the
        // investigation closes quietly (the dark-contact rules no longer apply).
        if (isPatrol && broadcasting) {
            this.endSearch(ship, 'clear');
            return false;
        }
        // Found again: the search is over — a patrol hails a firm contact, a
        // hostile re-engages (the attack AI takes over this same frame).
        if (resolvedNow) {
            this.endSearch(ship, 'found');
            return false;
        }
        const anchor = this.tmpC.set(search.anchor[0], search.anchor[1], search.anchor[2]);
        if (search.phase === 'approach') {
            // Last-known-position waypoint: fly to the anchor, then sweep. If
            // the anchor is unreachable (tucked inside rocks the avoidance
            // orbits), the approach deadline hands off to the sweep anyway.
            ship.destination = search.anchor;
            ship.searchHold = true;
            // The approach completes on arrival, on the deadline, or when the
            // lane is genuinely blocked: after a few seconds of visibly trying,
            // a searcher that has a rock between it and the spot stops grinding
            // the rock (wasted time and a crash risk) and the sweep fans out
            // from the near side instead. "Blocked" means the lane has a rock
            // in it AND the searcher has stopped making progress toward the
            // anchor — a stall, not a proximity test — so a rock sitting 100+
            // units out can't keep the hull grinding outside the old 120 gate.
            // Stalled = no meaningful progress toward the anchor for 3 seconds.
            // The improvement timestamp only refreshes when the ship actually
            // beats its best distance by >1 unit, so a slow-but-closing weave
            // around a rock never misreads as stuck — only a hull grinding the
            // rock's face (or an orbit that stopped shrinking) hands off.
            const approachDist = position.distanceTo(anchor);
            if (approachDist < (search.approachNearest ?? Infinity) - 1) {
                search.approachNearest = approachDist;
                search.approachImprovedAt = this.save.world.time;
            }
            const stalled = this.save.world.time - (search.approachImprovedAt ?? search.startedAt) >= 3;
            // Two independent blocked-lane gates, either of which hands off to
            // the sweep: the stall detector catches a rock 100+ units out that
            // the hull grinds against (no progress for 3 s), and the proximity
            // gate catches a rock sitting near the anchor that the approach
            // orbits instead of closing (the orbit shrinks too slowly to read
            // as a stall, so the 20 s deadline would otherwise burn).
            const blockedNear = this.save.world.time - search.startedAt >= 3 && this.lineBlocked(position, anchor)
                && (stalled || position.distanceTo(anchor) < 120);
            if (position.distanceTo(anchor) < 26 || this.save.world.time >= (search.approachDeadline ?? Infinity) || blockedNear) {
                search.phase = 'sweep';
                search.sweepUntil = this.save.world.time + SEARCH_SWEEP_SECONDS;
                search.fanUntil = 0;
                search.fanPoint = undefined;
            }
        }
        else {
            // Random fan-out: pick a new waypoint inside the sweep radius on
            // arrival (or every few seconds) so the sweep reads as a widening
            // hunt rather than an orbit. All rolls use the ship's seeded rng so
            // headless probes stay deterministic.
            if (!search.fanPoint || this.save.world.time >= (search.fanUntil ?? 0) || position.distanceTo(this.tmpD.set(search.fanPoint[0], search.fanPoint[1], search.fanPoint[2])) < 26) {
                const rng = typeof ship.proxRng === 'function' ? ship.proxRng : ship.aiRng;
                // Fan points must be clear of field obstacles: a sweep that
                // aims a fast hull at a point inside a rock is a suicide run,
                // and not dying outranks the fan-out. Re-roll against the
                // seeded stream, so probes stay exact.
                const obstacles = this.activeFieldObstacles();
                const shipVariant = HULL_FLIGHT_STATS[ship.variant] ? ship.variant : shipVariantForRole(ship.role);
                const shipRadius = HULL_FLIGHT_STATS[shipVariant]?.collisionRadius ?? NPC_SHIP_RADIUS;
                let fan = undefined;
                for (let attempt = 0; attempt < 5; attempt += 1) {
                    const angle = rng() * Math.PI * 2;
                    const radial = SEARCH_RADIUS * (0.2 + rng() * 0.8);
                    this.tmpP2.set(
                        anchor.x + Math.cos(angle) * radial,
                        anchor.y + (rng() - 0.5) * SEARCH_RADIUS * 0.5,
                        anchor.z + Math.sin(angle) * radial,
                    );
                    if (!obstacles.length || this.entryPositionClear(this.tmpP2, obstacles, shipRadius + 16)) {
                        fan = tuple(this.tmpP2);
                        break;
                    }
                }
                if (!fan) {
                    // Every roll landed inside the cluster: climb to a clear
                    // altitude above (or below) the anchor instead of aiming a
                    // fast hull into a rock. The belt's rocks are thin in y, so
                    // the vertical escape is almost always free.
                    this.tmpP2.set(anchor.x, anchor.y + SEARCH_RADIUS * 0.5, anchor.z);
                    if (obstacles.length && !this.entryPositionClear(this.tmpP2, obstacles, shipRadius + 16))
                        this.tmpP2.set(anchor.x, anchor.y - SEARCH_RADIUS * 0.5, anchor.z);
                    fan = tuple(this.tmpP2);
                }
                search.fanPoint = fan;
                search.fanUntil = this.save.world.time + 3 + rng() * 2;
            }
            ship.destination = search.fanPoint;
            ship.searchHold = true;
            if (this.save.world.time >= search.sweepUntil)
                this.endSearch(ship, 'giveup');
        }
        return true;
    }
    // A patrol resolving a dark contact catches the pilot: warning, one Concord
    // rep ding, and a hail — but no sweep. The search only opens once the
    // patrol loses the contact (see updateSearchAI), and a fresh catch can't
    // re-ding faster than PATROL_CATCH_REPEAT seconds. A pilot actually
    // carrying syndicate cargo gets the full bust instead — the crate, the
    // fine, and the standing hit.
    catchDarkPatrol(ship) {
        if (this.holdingSmuggleCargo()) {
            this.bustSmuggler(ship);
            return;
        }
        this.save.player.reputation.concord = clamp(this.save.player.reputation.concord + PATROL_CATCH_REP, -100, 100);
        ship.catchCooldownUntil = this.save.world.time + PATROL_CATCH_REPEAT;
        this.ui.pushSensor(t('{name} flagged your dark transponder. Concord standing {rep}.', { name: ship.name, rep: PATROL_CATCH_REP }), 'warning', 5200);
        this.ui.pushEvent(t('Caught running dark by {name}. Concord reputation {rep}.', { name: ship.name, rep: PATROL_CATCH_REP }), 'danger', 4200);
        this.audio.play('warning');
        const lines = PATROL_SEARCH_LINES.catch;
        this.sayPilotLine(ship, lines[Math.floor(ship.proxRng() * lines.length)]);
    }
    // Whether the hold currently carries any syndicate-sealed cargo.
    holdingSmuggleCargo() {
        return (this.save.player.sealedCargo ?? []).some((cargo) => cargo.smuggled);
    }
    // A patrol resolving the player while they carry smuggled cargo busts them:
    // every crate is seized, the smuggle contracts fail, a fine is levied, and
    // Concord standing takes a hit far heavier than a plain dark catch. Gated
    // on a session cooldown so a resolved smuggler is busted once, not per frame.
    checkSmugglerBust(patrol) {
        if (!this.emergentMugs || this.arena || patrol.hostile || !this.holdingSmuggleCargo())
            return;
        if (this.save.world.time < (this.smugglerBustCooldownUntil ?? 0))
            return;
        const player = vec(this.save.player.position);
        if (vec(patrol.position).distanceTo(player) > NPC_SENSOR_RANGE)
            return;
        // A lit runner is resolved at the full sensor horizon; a dark one only
        // inside the dark-detection line — running dark genuinely hides the
        // crate, exactly like the stealth rules everywhere else.
        if (!this.canSee(patrol.position, player, !this.playerBroadcasting(), ...this.playerSensorArgs()))
            return;
        this.bustSmuggler(patrol);
    }
    bustSmuggler(patrol) {
        this.smugglerBustCooldownUntil = this.save.world.time + 45;
        const seized = this.save.player.sealedCargo.filter((cargo) => cargo.smuggled);
        this.save.player.sealedCargo = this.save.player.sealedCargo.filter((cargo) => !cargo.smuggled);
        // Every active dark-goods contract tied to the seized crates fails.
        const failed = [];
        for (const mission of [...this.save.activeMissions]) {
            if (mission.kind !== 'smuggle')
                continue;
            mission.status = 'failed';
            this.save.world.failedMissionIds.push(mission.id);
            this.save.activeMissions = this.save.activeMissions.filter((entry) => entry.id !== mission.id);
            this.save.player.guildRep.syndicate = Math.max(0, (this.save.player.guildRep.syndicate ?? 0) - Math.max(2, Math.floor(mission.guildRep / 2)));
            failed.push(mission.title);
        }
        const units = seized.reduce((sum, cargo) => sum + cargo.units, 0);
        const fine = SMUGGLE_BUST_FINE + units * SMUGGLE_BUST_PER_UNIT;
        const paid = Math.min(fine, this.save.player.credits ?? 0);
        this.save.player.credits = (this.save.player.credits ?? 0) - paid;
        this.save.player.reputation.concord = clamp(this.save.player.reputation.concord + SMUGGLE_BUST_REP, -100, 100);
        const line = PATROL_BUST_LINES[Math.floor(patrol.proxRng() * PATROL_BUST_LINES.length)];
        this.sayPilotLine(patrol, line);
        this.ui.pushEvent(t('Busted by {patrol}: {units} units of syndicate cargo seized, {fine} fine, Concord standing {rep}.{note}', { patrol: patrol.name, units, fine: formatCredits(paid), rep: SMUGGLE_BUST_REP, note: failed.length ? t(' Contract failed: {name}.', { name: failed[0] }) : '' }), 'danger', 6200);
        this.audio.play('warning');
    }
    // Comms the moment a ship that had the pilot resolved loses the signal and
    // opens a sweep: the player is told, in the searching ship's voice, that it
    // lost them. The patrol marks the search on the radar. The line pick is a
    // pure function of the search start time so it never perturbs a ship's roll
    // streams (headless probes stay bit-exact); the sensor note is
    // unconditional, the spoken line obeys the chatter gap like every other.
    announceSearchStart(ship, kind) {
        const started = ship.search?.startedAt ?? this.save.world.time;
        if (kind === 'patrol') {
            const pool = PATROL_SEARCH_LINES.lost;
            if (pool?.length && this.chatterOpen())
                this.sayPilotLine(ship, pool[Math.floor(started * 7) % pool.length]);
        }
        else {
            const pool = SEARCH_LOST_HOSTILE_LINES;
            if (pool?.length && this.chatterOpen())
                this.sayPilotLine(ship, pool[Math.floor(started * 7) % pool.length]);
        }
    }
    // Open a search at the last-known position. The anchor arrives as a tuple
    // (the recorded last-resolved position) or a Vector3 — normalize before
    // converting, since tuple() reads .x/.y/.z.
    beginSearch(ship, anchor, kind) {
        const anchorPoint = anchor instanceof THREE.Vector3 ? anchor : vec(anchor);
        ship.search = {
            phase: 'approach',
            kind,
            anchor: tuple(anchorPoint),
            startedAt: this.save.world.time,
            approachDeadline: this.save.world.time + SEARCH_APPROACH_TIMEOUT,
            // Closest the approach has reached so far, and when that best was
            // last beaten — a stall (no progress for 3 s) with a rock in the
            // lane hands off to the sweep.
            approachNearest: Infinity,
            approachImprovedAt: undefined,
            sweepUntil: 0,
            fanUntil: 0,
            fanPoint: undefined,
        };
        ship.searchHold = true;
        ship.destination = tuple(anchorPoint);
    }
    // Close a search. Every outcome sets the give-up cooldown so a fresh
    // trigger cannot re-open on the same spot immediately.
    endSearch(ship, outcome) {
        const kind = ship.search?.kind;
        ship.search = undefined;
        ship.searchHold = false;
        ship.destination = undefined;
        ship.resolvedPlayerLast = false;
        ship.searchCooldownUntil = this.save.world.time + SEARCH_COOLDOWN;
        if (kind === 'patrol') {
            if (outcome === 'found')
                this.sayPilotLine(ship, PATROL_SEARCH_LINES.firm[Math.floor(ship.proxRng() * PATROL_SEARCH_LINES.firm.length)]);
            // 'clear' ends quietly — the pilot went lit, so there is nothing to log.
        }
        // A hostile 'found' ends quietly — the re-engaged fight speaks for itself.
    }
    // Drop a search without the cooldown: used when a patrol acquires a fight
    // target and combat takes over.
    clearSearch(ship) {
        ship.search = undefined;
        ship.searchHold = false;
        ship.destination = undefined;
        ship.resolvedPlayerLast = false;
    }
    // A hunter's first hail on a fresh ship victim (see the pursuit hook in
    // shipAI.updateShipAI) — temperament-flavored, one voice at a time.
    hailHuntChase(ship) {
        if (!this.chatterOpen())
            return;
        const lines = PIRATE_CHASE_LINES[ship.pilot?.temperament] ?? PIRATE_CHASE_LINES.steady;
        if (lines?.length)
            this.sayPilotLine(ship, lines[Math.floor(ship.aiRng() * lines.length)]);
    }
    // A readable label for a ship's current task, for the target monitor's
    // readout once the ship is scanned (see buildHudModel). Trade and smuggle
    // legs name the ports so the hierarchy reads in-game.
    shipRoleLabel(ship) {
        return t(ship.capitalClass === 'battleship' ? 'BATTLESHIP' : ship.capitalClass === 'frigate' ? 'FRIGATE' : ship.role.toUpperCase());
    }
    shipTaskLabel(ship) {
        const task = ship.task;
        if (!task)
            return t('IN TRANSIT');
        const short = (id) => (id && LOCATIONS[id] ? LOCATIONS[id].shortName : undefined);
        switch (task.kind) {
            case 'trade': {
                const from = short(task.origin);
                const to = short(task.port);
                return from && to ? t('TRADING — {from} → {to}', { from, to }) : to ? t('TRADING — {to}', { to }) : t('IN TRANSIT');
            }
            case 'smuggle': {
                const to = short(task.port);
                return to ? t('SMUGGLING — {to}', { to }) : t('SMUGGLING');
            }
            case 'patrol':
                return t('ON PATROL LANE');
            case 'mine':
                return t('WORKING THE SHARDBELT');
            case 'salvage':
                return t('STRIPPING A WRECK');
            case 'hunt':
                return ship.hostile ? t('HUNTING') : t('IN TRANSIT');
            case 'flee':
                return t('FLEEING');
            default:
                return t('IN TRANSIT');
        }
    }
    // Interaction: patrols arrest dark smugglers. A patrol that resolves a
    // dark smuggler hails them to stop; the smuggler either dumps the hold
    // (drifting pickups) or bolts, and the patrol gives chase until the
    // window closes, then returns to its lane. Pure comms/ambient — the
    // player's standing is untouched. Returns true while a chase is active so
    // the dispatch sends the patrol after the smuggler instead of its lane.
    updatePatrolArrest(ship) {
        if (!this.emergentMugs || this.arena || ship.role !== 'patrol' || ship.hostile || ship.targetId)
            return false;
        const time = this.save.world.time;
        if (ship.arrest) {
            const smuggler = this.ships.find((entry) => entry.id === ship.arrest.smugglerId && entry.hull > 0);
            if (!smuggler || time >= ship.arrest.until) {
                this.endPatrolArrest(ship, smuggler);
                return false;
            }
            // Give chase: aim at a lead point ahead of the fleeing smuggler.
            const position = vec(ship.position);
            const lead = vec(smuggler.position).addScaledVector(vec(smuggler.velocity), 2.5);
            ship.destination = tuple(lead);
            return true;
        }
        if (time < (ship.arrestCooldownUntil ?? 0))
            return false;
        const position = vec(ship.position);
        const smuggler = this.ships.find((entry) => entry.hull > 0 && entry !== ship && entry.smuggling && entry.dark
            && !entry.surrendered && !entry.captured && !entry.poweredDown
            && time >= (entry.arrestCooldownUntil ?? 0)
            && vec(entry.position).distanceTo(position) < PATROL_ARREST_RANGE
            && this.canSee(position, entry.position, true, vec(entry.velocity).length(), entry.speed));
        if (!smuggler)
            return false;
        this.beginPatrolArrest(ship, smuggler);
        return true;
    }
    beginPatrolArrest(ship, smuggler) {
        const time = this.save.world.time;
        const rng = seededRandom(`${this.save.world.seed}:arrest:${ship.id}:${smuggler.id}:${Math.floor(time)}`);
        ship.arrest = { smugglerId: smuggler.id, until: time + randomBetween(rng, PATROL_ARREST_MIN_SECONDS, PATROL_ARREST_MAX_SECONDS) };
        ship.arrestCooldownUntil = time + 45 + rng() * 30;
        smuggler.arrestCooldownUntil = time + 60 + rng() * 40;
        smuggler.arrestedBy = ship.id;
        const line = PATROL_ARREST_LINES.hail[Math.floor(rng() * PATROL_ARREST_LINES.hail.length)].replace(/\{smuggler\}/g, smuggler.name);
        this.sayPilotLine(ship, line);
        if (rng() < SMUGGLER_DUMP_CHANCE) {
            // Dump the hold: the evidence hits space and the patrol breaks off
            // — the smuggler is burned, so it becomes ordinary traffic.
            smuggler.smuggling = false;
            if (smuggler.task?.kind === 'smuggle')
                smuggler.task.kind = 'trade';
            const commodity = SMUGGLER_HOLD_POOL[Math.floor(rng() * SMUGGLER_HOLD_POOL.length)];
            this.spawnPickup(commodity, smuggler.position, 'combat', 1 + Math.floor(rng() * 2));
            this.endPatrolArrest(ship, smuggler, true);
        }
        else {
            // Run: the smuggler bolts and the patrol gives chase.
            smuggler.task = { kind: 'flee', prior: smuggler.task, awayFrom: [...smuggler.position] };
        }
    }
    endPatrolArrest(ship, smuggler, quiet = false) {
        ship.arrest = undefined;
        if (smuggler) {
            smuggler.arrestedBy = undefined;
            if (smuggler.task?.kind === 'flee')
                smuggler.task = smuggler.task.prior ?? { kind: 'trade', phase: 'leg', origin: undefined, port: undefined, dwellUntil: 0, dwellPoint: undefined };
        }
        if (quiet)
            return;
        const rng = seededRandom(`${this.save.world.seed}:arrest-end:${ship.id}:${Math.floor(this.save.world.time)}`);
        this.sayPilotLine(ship, PATROL_ARREST_LINES.giveup[Math.floor(rng() * PATROL_ARREST_LINES.giveup.length)]);
    }
    // Active search sweeps for the radar: one ring per searching ship, drawn
    // at the last-known-position anchor at the sweep radius — blue for a
    // Concord patrol, red for a hostile — so a hunt near the pilot is visible
    // on the disc, not just a sensor-log note. A search whose anchor sits far
    // past the horizon still reads: the ring clamps to the disc rim in the
    // anchor's direction (like the distress beacon), carrying a distance
    // readout, so a sweep hundreds of km behind the pilot is never silently
    // culled.
    searchRings() {
        const rings = [];
        const player = vec(this.save.player.position);
        const inverse = quat(this.save.player.rotation).invert();
        const range = this.playerStats().radarRange;
        for (const ship of this.ships) {
            if (ship.hull <= 0 || !ship.search)
                continue;
            const relative = vec(ship.search.anchor).sub(player).applyQuaternion(inverse);
            const distance = Math.hypot(relative.x, relative.z);
            const scale = Math.max(range, distance);
            // Same normalization as radarContacts: far anchors compress toward
            // the disc edge, and the ring radius scales with that same scale.
            const beyond = distance > range * 1.45;
            rings.push({
                x: clamp(relative.x / scale, -1, 1) * (beyond ? 0.9 : 1),
                y: clamp(relative.z / scale, -1, 1) * (beyond ? 0.9 : 1),
                fraction: Math.max(SEARCH_RADIUS / scale, beyond ? 0.05 : 0),
                color: ship.search.kind === 'hostile' ? 'red' : 'blue',
                beyond,
                distance: Math.round(distance),
            });
        }
        return rings;
    }
    resolveShipTarget(ship) {
        const playerPosition = vec(this.save.player.position);
        const distSqTo = (from, p) => {
            const dx = p[0] - from[0];
            const dy = p[1] - from[1];
            const dz = p[2] - from[2];
            return dx * dx + dy * dy + dz * dz;
        };
        if (!ship.surrendered && !ship.standingDown && !this.deferentialPilot(ship) && (ship.role === 'pirate' || ship.role === 'bounty' || ship.role === 'escort' || ship.hostile) && !ship.targetId) {
            // Nearest non-hostile civilian mark in a single pass — the same
            // pick as the old filter+sort (a stable sort keeps the earliest
            // array index on ties, and a strict `<` scan keeps that match),
            // without allocating a sorted copy every frame.
            let victim;
            let bestDistSq = Infinity;
            for (const entry of this.ships) {
                if (entry.hostile || entry.hull <= 0 || (entry.role !== 'trader' && entry.role !== 'miner'))
                    continue;
                const d = distSqTo(ship.position, entry.position);
                if (d < bestDistSq) {
                    bestDistSq = d;
                    victim = entry;
                }
            }
            ship.targetId = victim && bestDistSq < 150 * 150 && distSqTo(ship.position, this.save.player.position) > 100 * 100 ? victim.id : 'player';
        }
        if (ship.role === 'patrol') {
            const playerPos = vec(this.save.player.position);
            // Patrols engage hostiles they can actually see: lit hostiles at the
            // standard sensor range, dark ones only inside the dark-detection
            // line, rocks blocking the view either way. If the player is under
            // attack and the patrol can see THEM, it answers the distress even
            // before it can resolve the attacker — that's the rescue leg, and it
            // costs a dark player their safety net. Nearest satisfying hostile
            // in a single pass (same pick as filter+sort+find); the player's
            // sensor args are hoisted out of the candidate loop.
            const playerBroadcasting = this.playerBroadcasting();
            const [playerSpeed, playerMax] = this.playerSensorArgs();
            let hostile;
            let bestDistSq = Infinity;
            for (const entry of this.ships) {
                if (!entry.hostile || entry.hull <= 0)
                    continue;
                const d = distSqTo(ship.position, entry.position);
                if (d >= bestDistSq)
                    continue;
                if (this.canSee(ship.position, entry.position, entry.dark, vec(entry.velocity).length(), entry.speed)
                    || (entry.targetId === 'player' && this.canSee(ship.position, playerPos, !playerBroadcasting, playerSpeed, playerMax))) {
                    bestDistSq = d;
                    hostile = entry;
                }
            }
            ship.targetId = hostile?.id;
        }
        if (!ship.targetId)
            return undefined;
        if (ship.targetId === 'player')
            return { position: playerPosition, velocity: vec(this.save.player.velocity) };
        const target = this.ships.find((entry) => entry.id === ship.targetId && entry.hull > 0);
        if (!target) {
            ship.targetId = undefined;
            return undefined;
        }
        return { position: vec(target.position), velocity: vec(target.velocity) };
    }
    updateAttackAI(ship, targetPosition, targetVelocity, dt) {
        const aiRng = typeof ship.aiRng === 'function' ? ship.aiRng : FALLBACK_AI_RNG;
        const position = this.tmpA.set(ship.position[0], ship.position[1], ship.position[2]);
        const velocity = this.tmpB.set(ship.velocity[0], ship.velocity[1], ship.velocity[2]);
        const orientation = this.tmpQ.set(ship.rotation[0], ship.rotation[1], ship.rotation[2], ship.rotation[3]);
        const toTarget = this.tmpD.subVectors(targetPosition, position);
        const distance = toTarget.length();
        const direct = this.tmpE;
        if (distance > 0.001)
            direct.copy(toTarget).multiplyScalar(1 / distance);
        else
            direct.copy(FORWARD).applyQuaternion(orientation).normalize();
        // Deflection shooting: aim where the target will be when the bolt arrives.
        // Aim quality scales the lead factor: aces read the target's vector and
        // land on the future position, novices undershoot it (their bolts fall
        // behind a crossing target even before the jitter in fireNpcGun).
        const aim = ship.pilot?.aim ?? 0.72;
        // Exact intercept time for a constant-velocity target, solved in the
        // ship's frame: the bolt leaves at 150 relative to the ship, so the bolt
        // meets the target when |r + wt| = 150t (r = target offset, w = target
        // velocity minus the ship's own). The old distance/150 ignored the
        // shooter's motion, so chases and head-on passes whiffed by a wide
        // margin. Aim quality scales how much of that lead the pilot actually
        // applies: novices undershoot the future position, aces land on it.
        const leadFactor = 0.6 + aim * 0.4;
        const r = this.tmpI.copy(targetPosition).sub(position);
        const w = this.tmpJ.set(0, 0, 0);
        if (targetVelocity)
            w.copy(targetVelocity);
        w.sub(velocity);
        const rr = r.lengthSq();
        const rw = r.dot(w);
        const a = w.lengthSq() - 150 * 150;
        let intercept = Infinity;
        if (a !== 0) {
            const disc = rw * rw - a * rr;
            if (disc >= 0) {
                const s = Math.sqrt(disc);
                const candidates = [(-rw - s) / a, (-rw + s) / a].filter((t) => t > 0);
                if (candidates.length)
                    intercept = Math.min(...candidates);
            }
        }
        // No geometric solution (target outruns the bolt): fall back to the
        // closing speed along the sightline so the pilot still aims plausibly.
        if (!isFinite(intercept)) {
            const closing = 150 + velocity.dot(direct) - (targetVelocity ? targetVelocity.dot(direct) : 0);
            intercept = Math.max(0.2, distance / Math.max(60, closing));
        }
        const leadTime = Math.max(0.2, intercept * leadFactor);
        // Aim where the bolt actually goes: it leaves at 150 PLUS the ship's
        // own velocity, so the lead direction must compensate for the shooter's
        // motion — normalize(r + w·t) — not just point at the future position.
        // Pointing at the raw future spot lets lateral velocity drift every bolt
        // wide by v·t, which the intercept time alone cannot correct (the
        // direction is what carries the shooter's drift). Lead factor scales
        // both: aces compensate fully, novices undershoot the correction.
        const predicted = this.tmpF.copy(r).addScaledVector(w, leadTime);
        const lead = this.tmpG.copy(predicted).normalize();
        // Strafing-run state machine (Privateer jousting): approach on a firing line,
        // then blow past at full speed and extend before turning back for the next pass.
        // The pilot never decelerates into a point-blank hug and never circles flat.
        const passRange = ship.passRange ?? ATTACK_PASS_RANGE;
        const resetRange = ship.resetRange ?? ATTACK_RESET_RANGE;
        // Aggressive pilots back their threats with action: while the press
        // window from a landed-hit threat lasts, the next pass commits deeper
        // (tighter standoff, 0.65x pass range) and the extend is abbreviated
        // (0.6x reset range), so the ship turns back and closes again sooner.
        const pressing = ship.pilot?.temperament === 'aggressive' && this.save.world.time < (ship.pressingUntil ?? 0);
        const effectivePassRange = pressing ? passRange * 0.65 : passRange;
        const effectiveResetRange = pressing ? resetRange * 0.6 : resetRange;
        if (!ship.attackPhase)
            ship.attackPhase = 'approach';
        if (ship.attackPhase === 'approach' && distance < effectivePassRange)
            ship.attackPhase = 'extend';
        else if (ship.attackPhase === 'extend' && distance > effectiveResetRange)
            ship.attackPhase = 'approach';
        if (distance < ATTACK_SEPARATION)
            ship.attackPhase = 'extend';
        // A lateral basis for near-miss passes and evasive jinks.
        const lateral = this.tmpH.crossVectors(toTarget, UP);
        if (lateral.lengthSq() < 1e-4)
            lateral.set(1, 0, 0);
        lateral.normalize();
        const hullRatio = ship.maxHull > 0 ? ship.hull / ship.maxHull : 1;
        const shieldFraction = ship.maxShield > 0 ? ship.shield / ship.maxShield : 1;
        // Reflex gates reaction: after taking fire the pilot waits out their
        // latency window (novices flinch late, aces react almost instantly),
        // then stays evasive for a reflex-scaled duration.
        const evasive = this.save.world.time >= (ship.evasiveLatencyUntil ?? 0) && this.save.world.time < (ship.evasiveUntil ?? 0);
        // damageThresholdMul: timid flinches at higher hull damage, aggressive
        // shrugs it off (this also raises/lowers the cover duck point).
        const damaged = hullRatio < pilotMod(ship, 0.45, 'damageThresholdMul');
        // Post-damage evasion comes in bursts: ~1.5-2.5s of hard jinking and
        // spiraling, then a few seconds flying straight to re-engage. A pilot
        // that dodges forever never shoots back, and a crippled ship becomes
        // unfinishable — fights stall with everyone at partial hull. Under
        // active fire (evasive) the pilot stays in the burst the whole time;
        // the cycle only paces the damaged-state dodges.
        const damagedCycle = damaged && !evasive && !ship.fleeing && !ship.covering;
        if (damagedCycle && this.save.world.time >= (ship.evadeCycleUntil ?? 0)) {
            const resting = ship.evadePhase === 'rest';
            ship.evadePhase = resting ? 'burst' : 'rest';
            ship.evadeCycleUntil = this.save.world.time + (resting ? randomBetween(aiRng, 1.2, 2) : randomBetween(aiRng, 4, 6));
        }
        const evading = evasive || (damagedCycle && ship.evadePhase === 'burst');
        const currentSpeed = velocity.length();
        // Cover & recharge: a damaged ship with drained shields ducks behind a big
        // rock or wreck to let shields regenerate, then breaks out for another run.
        const wantsCover = !ship.fleeing && damaged && shieldFraction < pilotMod(ship, COVER_RECHARGE_SHIELD, 'coverShieldMul') && distance > 140;
        if (wantsCover && !ship.covering) {
            const cover = this.findCoverPoint(position, targetPosition);
            if (cover) {
                ship.covering = true;
                ship.coverPoint = [cover.x, cover.y, cover.z];
                ship.coverHoldSince = 0;
            }
        }
        else if (ship.covering && (!wantsCover || (ship.coverHoldSince && this.save.world.time - ship.coverHoldSince > pilotMod(ship, COVER_HOLD_MAX, 'coverHoldMul'))))
            ship.covering = false, ship.coverPoint = undefined, ship.coverHoldSince = 0;
        // While hurt or under fire, commit to brief lateral jinks that spoil the
        // player's lead without collapsing into a wild spiral. Flamboyant pilots
        // also jink while healthy (showboating). The strength is capped so a
        // dodge bends the heading without steering the ship sideways harder
        // than it flies forward. All rolls use the ship's seeded aiRng so
        // headless probes are deterministic.
        let jink = 0;
        const showboating = !evasive && !damaged && (ship.pilot?.flamboyance ?? 0) > 0 && !ship.fleeing && !ship.covering;
        if ((evading || showboating) && !ship.fleeing && !ship.covering) {
            if (this.save.world.time > (ship.jinkUntil ?? 0)) {
                const reflex = ship.pilot?.reflex ?? 0.78;
                const evasion = ship.pilot?.evasion ?? 0.82;
                const jinkMul = pilotMod(ship, 1, 'jinkMul');
                ship.jinkDuration = (0.55 + aiRng() * 0.55) * (0.65 + reflex * 0.7) * jinkMul;
                ship.jinkUntil = this.save.world.time + ship.jinkDuration;
                ship.jinkSign = aiRng() < 0.5 ? 1 : -1;
                ship.jinkStrength = Math.min(0.6, (0.3 + aiRng() * 0.35) * (0.6 + evasion * 0.7) * jinkMul);
            }
            const jinkRemaining = Math.max(0, (ship.jinkUntil ?? 0) - this.save.world.time);
            const jinkDuration = ship.jinkDuration ?? 0.55;
            jink = (ship.jinkSign ?? 1) * (ship.jinkStrength ?? 0.45) * clamp(jinkRemaining / jinkDuration, 0, 1);
        }
        // Spiral evasion: under fire, the pilot sometimes commits to a corkscrew
        // (rotating perpendicular bias + matching roll) so the dodge works in
        // three dimensions. Gate rolls ~45% every few seconds while threatened
        // and then rests on a cooldown, so it reads as a natural combat reflex
        // rather than a permanent spin. The bias rotates slowly enough that the
        // nose can track it, and the roll is folded into the slerp target below
        // so the maneuver is one coordinated barrel roll, not a wobble.
        let spiraling = false;
        // Corkscrew gate: base 0.45, pushed by temperament (flamboyant showboats
        // at ~0.83, timid prefers cover at ~0.29). Reflex scales the cooldowns so
        // slow pilots commit less often; evasion scales duration. Healthy
        // flamboyant pilots roll a reduced showboating gate. Gated on the same
        // burst as jinks, so the corkscrew never outlasts the dodge window.
        if ((evading || showboating) && !ship.fleeing && !ship.covering) {
            if (!(ship.spiralT > 0) && this.save.world.time >= (ship.spiralCooldownUntil ?? 0)) {
                const gate = pilotMod(ship, 0.45, 'spiralMul') * (showboating ? 0.45 : 1);
                const reflex = ship.pilot?.reflex ?? 0.78;
                const evasion = ship.pilot?.evasion ?? 0.82;
                if (aiRng() < gate) {
                    ship.spiralT = (0.9 + aiRng() * 0.9) * (0.7 + evasion * 0.5) * (ship.pilot?.flamboyance ? 1.4 : 1);
                    ship.spiralSign = aiRng() < 0.5 ? 1 : -1;
                    ship.spiralPhase = 0;
                    ship.spiralCooldownUntil = this.save.world.time + (5 + aiRng() * 5) * (1.6 - reflex * 0.7);
                }
                else {
                    ship.spiralCooldownUntil = this.save.world.time + (2 + aiRng() * 3) * (1.6 - reflex * 0.7);
                }
            }
            if (ship.spiralT > 0) {
                ship.spiralT = Math.max(0, ship.spiralT - dt);
                spiraling = true;
            }
        }
        const desired = this.tmpI;
        if (ship.covering && ship.coverPoint) {
            const cover = this.tmpJ.set(ship.coverPoint[0], ship.coverPoint[1], ship.coverPoint[2]);
            const toCover = this.tmpK.subVectors(cover, position);
            const time = this.save.world.time;
            // Cover + peek: while holding cover the pilot periodically steers to
            // the cover edge until LOS opens, fires a burst, then ducks back —
            // a damaged ship behind a rock is a threat, not a parked target.
            // Timid pilots hide longer between peeks (coverHoldMul).
            if (ship.coverPeekPhase === undefined)
                ship.coverPeekPhase = 0;
            if (ship.coverPeekPhase === 1) {
                const peekLateral = this.tmpL.crossVectors(toTarget, UP);
                if (peekLateral.lengthSq() < 1e-4)
                    peekLateral.set(1, 0, 0);
                else
                    peekLateral.normalize();
                desired.copy(peekLateral);
                if (time >= (ship.coverPeekUntil ?? 0)) {
                    ship.coverPeekPhase = 0;
                    ship.coverPeekUntil = time + 2 + 2 * pilotMod(ship, 1, 'coverHoldMul');
                }
            }
            else if (toCover.lengthSq() > COVER_ARRIVE_DIST * COVER_ARRIVE_DIST) {
                desired.copy(toCover).normalize();
            }
            else {
                if (!ship.coverHoldSince)
                    ship.coverHoldSince = time;
                // Ducking: hold behind the rock facing away from the threat so
                // the nav controller keeps the ship tucked in at low speed.
                desired.copy(direct).negate();
                if (time >= (ship.coverPeekUntil ?? 0)) {
                    ship.coverPeekPhase = 1;
                    ship.coverPeekUntil = time + 1.2;
                }
            }
        }
        else if (ship.fleeing) {
            // Crippled and running: turn away from the target and burn for open
            // space, weaving lightly so a tail shot has to work for it.
            desired.copy(direct).negate();
            desired.addScaledVector(lateral, (ship.jinkSign ?? 1) * 0.3).normalize();
        }
        else if (ship.attackPhase === 'extend') {
            // Keep flying the current heading (away from the target after the pass)
            // with a gentle pull-away so separation keeps growing.
            if (velocity.lengthSq() > 0.5)
                desired.copy(velocity).normalize();
            else
                desired.copy(direct).negate();
            desired.addScaledVector(direct, -0.22).normalize();
        }
        else {
            // Aim at a point beside the target so the pass is a near-miss rather
            // than a ram. The bias direction is chosen once per approach line so
            // the ship commits to one side and doesn't jitter.
            // Commit to a fixed side. Opposing jousters build their lateral
            // vector from opposite `toTarget` directions, so a constant sign
            // guarantees they always pass on opposite sides instead of grazing.
            if (ship.passBiasSign === undefined)
                ship.passBiasSign = 1;
            const standoff = Math.max(ATTACK_PASS_STANDOFF_FLOOR, Math.min(ATTACK_PASS_STANDOFF, distance * 0.5));
            // `predicted` is the lead vector relative to the ship (target offset +
            // target-relative velocity lead), so the near-miss aim direction is
            // already a direction from the ship — subtracting the ship's world
            // position here aimed the ship at a point far from the arena (in a
            // field arena that point is the system origin, so hostiles broke off
            // toward (0,0,0) and read as fleeing on spawn).
            desired.copy(predicted).addScaledVector(lateral, ship.passBiasSign * standoff).normalize();
        }
        desired.addScaledVector(lateral, jink);
        if (spiraling) {
            ship.spiralPhase = (ship.spiralPhase ?? 0) + dt * 3.2;
            const s = Math.sin(ship.spiralPhase) * 0.55;
            const c = Math.cos(ship.spiralPhase) * 0.45;
            const upV = this.tmpL.crossVectors(lateral, direct);
            if (upV.lengthSq() < 1e-6)
                upV.set(0, 1, 0);
            else
                upV.normalize();
            desired.addScaledVector(lateral, s * (ship.spiralSign ?? 1)).addScaledVector(upV, c * (ship.spiralSign ?? 1));
        }
        // Terrain-aware steering (npcNav.js): the sampled controller keeps the
        // combat intent (jinks, spirals, cover, extend, flee) but picks a clear
        // line through the field. Approach lines route around blocking rocks
        // (pounce waypoints); evasion and extend keep pure steering so dodges
        // stay snappy.
        const navOut = this.tmpNavDesired ?? (this.tmpNavDesired = new THREE.Vector3());
        let navGoal = targetPosition;
        if (ship.fleeing)
            navGoal = (this.tmpNavGoal ?? (this.tmpNavGoal = new THREE.Vector3())).set(position.x + desired.x * 400, position.y + desired.y * 400, position.z + desired.z * 400);
        else if (ship.covering && ship.coverPoint)
            navGoal = (this.tmpNavGoal ?? (this.tmpNavGoal = new THREE.Vector3())).set(ship.coverPoint[0], ship.coverPoint[1], ship.coverPoint[2]);
        const navBrake = steerToward(this, ship, navGoal, {
            goalDir: desired,
            speed: currentSpeed,
            horizon: 1.4,
            brakeScale: 0.42,
            synthesize: ship.covering || (!evading && !ship.fleeing && ship.attackPhase === 'approach'),
        }, navOut);
        desired.copy(navOut);
        const shipAvoidance = this.getShipAvoidance(position, velocity, ship.id);
        if (shipAvoidance)
            desired.add(shipAvoidance);
        desired.normalize();
        // Smooth, no-roll turn toward the pursuit vector (this kills the old spin).
        const right = this.tmpJ.crossVectors(desired, UP);
        if (right.lengthSq() < 1e-6)
            right.set(1, 0, 0);
        right.normalize();
        const up = this.tmpK.crossVectors(right, desired).normalize();
        // A gentle bank into the horizontal turn: bake it into the target orientation
        // rather than adding an incremental roll each frame (which would accumulate).
        const headingChange = clamp(direct.angleTo(desired), 0, 1.2);
        this.tmpL.crossVectors(desired, direct);
        const turnSign = Math.sign(this.tmpL.y) || 1;
        const bankAngle = turnSign * headingChange * 0.45;
        const cosB = Math.cos(bankAngle);
        const sinB = Math.sin(bankAngle);
        this.tmpL.crossVectors(desired, right);
        const rightBanked = right.multiplyScalar(cosB).addScaledVector(this.tmpL, sinB);
        this.tmpL.crossVectors(desired, up);
        const upBanked = up.multiplyScalar(cosB).addScaledVector(this.tmpL, sinB);
        // Coordinated corkscrew roll: while spiraling, the target attitude rolls
        // around the flight axis at the same rate (and in the same sense) the nose
        // bias circles, so the dodge reads as a smooth barrel roll instead of a
        // wobble. The roll lives inside the slerp target, so the turn slerp below
        // carries it rather than fighting a per-frame post-roll. Guns stay forward.
        if (spiraling) {
            const rollAngle = (ship.spiralPhase ?? 0) * (ship.spiralSign ?? 1);
            const cosR = Math.cos(rollAngle);
            const sinR = Math.sin(rollAngle);
            // Stage the rotated right in tmpF (predicted is dead past the aim
            // point): the banked right/up must both be read pre-rotation.
            this.tmpF.copy(rightBanked).multiplyScalar(cosR).addScaledVector(upBanked, sinR);
            upBanked.multiplyScalar(cosR).addScaledVector(rightBanked, -sinR);
            this.tmpD.copy(desired).negate();
            this.tmpQ2.setFromRotationMatrix(this.tmpM4.makeBasis(this.tmpF, upBanked, this.tmpD));
        }
        else {
            this.tmpD.copy(desired).negate();
            this.tmpQ2.setFromRotationMatrix(this.tmpM4.makeBasis(rightBanked, upBanked, this.tmpD));
        }
        orientation.slerp(this.tmpQ2, 1 - Math.exp(-ship.turnRate * dt));
        orientation.normalize();
        // Fly where the nose points at a controlled speed. A scalar throttle damp
        // (rather than a vector lerp) means the nose can sweep a 180° yo-yo turn
        // without the velocity vector collapsing toward zero mid-turn.
        const forward = this.tmpC.copy(FORWARD).applyQuaternion(orientation).normalize();
        const corner = clamp(0.8 + 0.2 * Math.exp(-headingChange * 1.5), 0.66, 1);
        const fleeing = Boolean(ship.fleeing);
        const holdingCover = Boolean(ship.covering) && ship.coverPoint && this.tmpD.set(ship.coverPoint[0], ship.coverPoint[1], ship.coverPoint[2]).distanceTo(position) <= COVER_ARRIVE_DIST;
        // Afterburn: hostile fighters punch the throttle when the target sits on
        // their tail — a chase, an extension, or a rout — so they can outrun a
        // non-burning player and force a real pursuit instead of a free kill.
        const targetBehind = direct.dot(forward) < -0.25;
        // Aggressive pilots (afterburnMul > 1.2) burn afterburn in pursuit too,
        // not just when running or being chased.
        const burnInPursuit = (ship.pilot?.afterburnMul ?? 1) > 1.2 && ship.attackPhase === 'approach';
        ship.burning = Boolean(ship.afterburnSpeed) && !holdingCover && !ship.covering && (fleeing || targetBehind || burnInPursuit);
        const cruise = ship.burning ? ship.afterburnSpeed : ship.speed;
        // Brake only when a collision is truly imminent (rock dead ahead and close);
        // steering avoidance handles the rest so ships keep their combat speed.
        const brake = navBrake;
        let desiredSpeed = cruise * (holdingCover ? 0.12 : ship.attackPhase === 'extend' || fleeing ? 1.02 : corner) * (evasive ? 1.08 : 1) * (fleeing ? 1.06 : 1) * (1 - brake);
        // Never crawl mid-fight: a hard combat-speed floor keeps the strafing-run
        // energy up even while braking to dodge a rock (cover holds are exempt).
        if (!holdingCover)
            desiredSpeed = Math.max(desiredSpeed, ship.speed * 0.52);
        const nextSpeed = damp(currentSpeed, desiredSpeed, evasive || fleeing || ship.burning ? 1.6 : 1.25, dt);
        velocity.copy(forward).multiplyScalar(nextSpeed);
        position.addScaledVector(velocity, dt);
        tupleInto(ship.position, position);
        tupleInto(ship.velocity, velocity);
        quatTupleInto(ship.rotation, orientation);
        const facing = forward.dot(lead);
        // Fire discipline: aces snap shots off as soon as the nose is on the
        // deflection point; novices need a tighter alignment (and still spray,
        // see fireNpcGun). Fire range is temperament-driven: timid only commits
        // at short range, aggressive hoses from way out.
        const fireGate = 0.85 + (1 - aim) * 0.1;
        const fireRange = pilotMod(ship, ship.fireRange ?? ATTACK_FIRE_RANGE, 'fireRangeMul');
        // The pursuit hold-fire window (see the hunt-chase hook in shipAI) keeps
        // a hunter from shooting during the short chase before the guns come up.
        if (!fleeing && !ship.holdFire && !ship.pursuitHoldFire && distance < fireRange && facing > fireGate && ship.fireCooldown <= 0 && !this.lineBlocked(position, predicted, ship.id)) {
            this.fireNpcGun(ship, lead);
        }
    }
    updateTravelAI(ship, dt) {
        ship.burning = false;
        const position = this.tmpA.set(ship.position[0], ship.position[1], ship.position[2]);
        const velocity = this.tmpB.set(ship.velocity[0], ship.velocity[1], ship.velocity[2]);
        if (ship.captured) {
            // A captured hull is inert but remains in the scene. Preserve its
            // current momentum so the recovered ship keeps drifting instead of
            // disappearing or snapping onto a civilian route.
            position.addScaledVector(velocity, dt);
            tupleInto(ship.position, position);
            tupleInto(ship.velocity, velocity);
            return;
        }
        if (ship.poweredDown) {
            // Surrendered and dark: bleed off velocity and drift. The ship no
            // longer navigates, attacks, or evades.
            velocity.multiplyScalar(Math.max(0, 1 - dt * 0.6));
            position.addScaledVector(velocity, dt);
            tupleInto(ship.position, position);
            tupleInto(ship.velocity, velocity);
            return;
        }
        const orientation = this.tmpQ.set(ship.rotation[0], ship.rotation[1], ship.rotation[2], ship.rotation[3]);
        let destination = ship.destination ? this.tmpD.set(ship.destination[0], ship.destination[1], ship.destination[2]) : undefined;
        if (!destination || position.distanceTo(destination) < 30) {
            if (ship.seekClearSpace) {
                // A badly damaged ship limps toward open space before choosing
                // its next route instead of re-rolling straight into clutter.
                const clear = this.findClearSpace(ship);
                destination = this.tmpD.set(clear[0], clear[1], clear[2]);
                ship.seekClearSpace = false;
            }
            else if (ship.searchHold && ship.search) {
                // A ship holding a search keeps sweeping its point —
                // updateSearchAI refreshes the destination every frame, so do
                // not re-roll onto a route mid-sweep.
                destination = this.tmpD.set(ship.destination[0], ship.destination[1], ship.destination[2]);
            }
            else {
                // The task layer owns waypoints: tickTask (shipAI.js) refreshes
                // ship.destination whenever the ship needs one. A ship without
                // a task simply holds position — it never re-rolls on its own.
                destination = ship.destination
                    ? this.tmpD.set(ship.destination[0], ship.destination[1], ship.destination[2])
                    : this.tmpD.copy(position);
            }
            ship.destination = tuple(destination);
        }
        // Goal-directed navigation (npcNav.js): sample candidate headings,
        // score them against the actual nearby obstacles, and fly the best
        // clear line to the destination — including persisted tangent
        // waypoints around blockers so the ship orbits deliberately instead
        // of grinding a rock face. Ship-to-ship avoidance layers on top, and
        // the returned brake is predictive (from the chosen path's clearance).
        const navOut = this.tmpNavDesired ?? (this.tmpNavDesired = new THREE.Vector3());
        const brake = steerToward(this, ship, destination, {
            speed: velocity.length(),
            horizon: 2.0,
            brakeScale: 0.5,
            // Long-range legs plan through the coarse field grid (npcNav.js);
            // combat callers keep routing off because their goals move.
            route: true,
        }, navOut);
        const desired = this.tmpI.copy(navOut);
        const shipAvoidance = this.getShipAvoidance(position, velocity, ship.id);
        if (shipAvoidance)
            desired.add(shipAvoidance);
        desired.normalize();
        this.tmpQ2.setFromUnitVectors(FORWARD, desired);
        orientation.slerp(this.tmpQ2, 1 - Math.exp(-ship.turnRate * 0.62 * dt));
        orientation.normalize();
        // Fly where the nose points (matching combat AI), so a course change is
        // a real banked turn rather than a sideways slide onto the new heading.
        const forward = this.tmpC.copy(FORWARD).applyQuaternion(orientation).normalize();
        // A fleeing ship (or a patrol chasing an arrested smuggler) runs at
        // its full cruise capability: the flight is a chase, not a commute,
        // and half-throttle getaways feel broken. Everyone else cruises.
        const inChase = ship.task?.kind === 'flee' || (ship.role === 'patrol' && Boolean(ship.arrest));
        let travelSpeed = inChase ? ship.speed : ship.speed * (ship.role === 'trader' ? 0.72 : 0.5);
        // A search approach is an investigation, not a cruise: the patrol
        // pushes harder than its patrol speed — but still slower than any lit
        // hull at full throttle, so a running dark pilot bleeds the contact.
        if (ship.search?.phase === 'approach')
            travelSpeed = ship.speed * PATROL_SEARCH_SPEED_MUL;
        travelSpeed *= 1 - brake;
        velocity.lerp(forward.multiplyScalar(travelSpeed), 1 - Math.exp(-0.55 * dt));
        position.addScaledVector(velocity, dt);
        tupleInto(ship.position, position);
        tupleInto(ship.velocity, velocity);
        quatTupleInto(ship.rotation, orientation);
    }
    resolveNpcCollisions(ship) {
        // NPC hard-collision pass: the same hullCollision.js module the player
        // uses, with the NPC's FULL hull (no forgiveness) — an NPC only bumps
        // when its visible model touches. Rocks use the exact mesh, debris
        // panels their flat faces, wreck nodes a support-expanded sphere.
        if (ship.poweredDown)
            return;
        const hullExtents = this.npcHullExtents(ship);
        const position = this.tmpA.set(ship.position[0], ship.position[1], ship.position[2]);
        const velocity = this.tmpB.set(ship.velocity[0], ship.velocity[1], ship.velocity[2]);
        const speed = velocity.length();
        let impactDamage = 0;
        let clipped = false;
        const shipQuat = this.tmpQ.set(ship.rotation[0], ship.rotation[1], ship.rotation[2], ship.rotation[3]);
        const shipQuatInv = this.tmpQ2.copy(shipQuat).invert();
        const contact = this.tmpNpcContact ?? (this.tmpNpcContact = { x: 0, y: 0, z: 0, push: 0 });
        const resolveContact = () => {
            clipped = true;
            position.x += contact.x * contact.push;
            position.y += contact.y * contact.push;
            position.z += contact.z * contact.push;
            // Cancel the inward velocity and add a little outward rebound, so the
            // ship cannot tunnel into or grind along the obstacle's surface.
            const inward = -(velocity.x * contact.x + velocity.y * contact.y + velocity.z * contact.z);
            if (inward > 0)
                velocity.addScaledVector(this.tmpCollide.set(contact.x, contact.y, contact.z), inward * 1.5);
            const impactSpeed = inward + speed * 0.16;
            if (impactSpeed > 4) {
                const raw = (impactSpeed - 3) * 1.35;
                // A rock can bruise a hull, never one-shot it: cap each impact at
                // a quarter of the ship's max hull so a searcher that clips a
                // monolith walks away to seek open space instead of dying.
                const cap = Math.max(10, ship.maxHull * 0.25);
                impactDamage = Math.max(impactDamage, Math.min(raw, cap));
            }
        };
        const margin = MAX_FIELD_OBSTACLE_RADIUS + Math.max(hullExtents[0], hullExtents[1], hullExtents[2]);
        this.forEachObstacleInBox(position.x - margin, position.y - margin, position.z - margin, position.x + margin, position.y + margin, position.z + margin, (obstacle) => {
            let hit = false;
            if (obstacle.shape === 'ring')
                hit = hullVsRing(position, hullExtents, shipQuatInv, obstacle, contact);
            else if (obstacle.shape === 'engine')
                hit = hullVsEngine(position, hullExtents, shipQuatInv, obstacle, contact);
            else if (obstacle.shape === 'asteroid') {
                const mesh = obstacle.meshVerts;
                if (!this.npcAsteroidScratch || this.npcAsteroidScratch.length < mesh.length)
                    this.npcAsteroidScratch = new Float32Array(mesh.length);
                hit = hullVsAsteroid(position, hullExtents, shipQuat, shipQuatInv, obstacle, this.npcAsteroidScratch, contact);
            }
            else if (obstacle.box)
                hit = hullVsBox(position, hullExtents, shipQuatInv, obstacle, contact);
            else
                hit = hullVsSphere(position, hullExtents, shipQuatInv, obstacle.x, obstacle.y, obstacle.z, obstacle.collisionRadius, contact);
            if (hit)
                resolveContact();
        });
        tupleInto(ship.position, position);
        tupleInto(ship.velocity, velocity);
        if (impactDamage > 0)
            this.damageShip(ship, impactDamage, 'environment', tuple(position));
        if (clipped && impactDamage > 0.5) {
            ship.destination = undefined;
            // A badly damaged ship flees toward open space instead of re-rolling
            // straight back into the clutter it just bounced off.
            ship.seekClearSpace = ship.maxHull > 0 && ship.hull / ship.maxHull < NPC_BADLY_DAMAGED_HULL_RATIO;
            if (this.save.player.currentTargetId === ship.id)
                this.targetClipUntil = this.save.world.time + 1.4;
        }
    }
    // Ship-to-ship hard collision: once every ship (player included) has
    // settled its position for the frame, resolve every touching pair exactly
    // once — player × NPC and NPC × NPC. The push splits by hull volume (the
    // light ship gets thrown, the heavy one barely moves), both velocities
    // recoil, and a hard ram deals the same environment-style damage both
    // sides would take clipping a rock.
    resolveShipContacts() {
        const player = this.save.player;
        const playerPos = this.tmpP3.set(player.position[0], player.position[1], player.position[2]);
        const playerQuat = quat(player.rotation, this.collisionShipQuat);
        const playerExtents = this.playerHullExtents();
        const contact = this.tmpShipContact ?? (this.tmpShipContact = { x: 0, y: 0, z: 0, push: 0 });
        const playerVolume = playerExtents[0] * playerExtents[1] * playerExtents[2];
        // One side of a contact: apply the push, recoil the velocity, and
        // report the impact speed for damage. The impact uses the RELATIVE
        // closing velocity along the normal (a stationary freighter struck by
        // a fast fighter still takes the ram), and `sign` flips the normal for
        // the far side so each ship's recoil points away from the other.
        const apply = (posArr, velArr, otherVel, vol, otherVol, sign) => {
            // Degenerate contacts (deep spawn overlaps, zero normals) used to
            // write NaN straight into live tuples and kill the sim.
            if (!Number.isFinite(contact.x) || !Number.isFinite(contact.y) || !Number.isFinite(contact.z) || !Number.isFinite(contact.push))
                return 0;
            const share = otherVol / (vol + otherVol);
            const nx = contact.x * sign;
            const ny = contact.y * sign;
            const nz = contact.z * sign;
            posArr[0] += nx * contact.push * share;
            posArr[1] += ny * contact.push * share;
            posArr[2] += nz * contact.push * share;
            const vx = velArr[0];
            const vy = velArr[1];
            const vz = velArr[2];
            // Closing speed along this side's normal (self minus other).
            const rvx = vx - otherVel[0];
            const rvy = vy - otherVel[1];
            const rvz = vz - otherVel[2];
            const inward = -(rvx * nx + rvy * ny + rvz * nz);
            if (inward > 0) {
                velArr[0] += nx * inward * 1.5;
                velArr[1] += ny * inward * 1.5;
                velArr[2] += nz * inward * 1.5;
            }
            return inward + Math.hypot(rvx, rvy, rvz) * 0.16;
        };
        const ships = this.ships;
        for (let i = 0; i < ships.length; i += 1) {
            const ship = ships[i];
            if (ship.hull <= 0 || ship.poweredDown)
                continue;
            // Race pilots are kinematic props on a rail: they neither push the
            // player nor each other, and grid slots never overlap hulls.
            if (ship.race)
                continue;
            const shipExtents = this.npcHullExtents(ship);
            const shipVolume = shipExtents[0] * shipExtents[1] * shipExtents[2];
            // Player vs ship.
            const shipPos = this.tmpP0.set(ship.position[0], ship.position[1], ship.position[2]);
            const shipQuat = this.tmpQ.set(ship.rotation[0], ship.rotation[1], ship.rotation[2], ship.rotation[3]);
            if (hullVsHull(playerPos, playerExtents, playerQuat, shipPos, shipExtents, shipQuat, contact)) {
                // Snapshot both velocities before any recoil is applied, so each
                // side's impact reads the true pre-contact closing speed.
                const pv = player.velocity;
                const sv = ship.velocity;
                const playerVel0 = [pv[0], pv[1], pv[2]];
                const shipVel0 = [sv[0], sv[1], sv[2]];
                const playerImpact = apply(player.position, player.velocity, shipVel0, playerVolume, shipVolume, 1);
                const shipImpact = apply(ship.position, ship.velocity, playerVel0, shipVolume, playerVolume, -1);
                if (playerImpact > 4) {
                    this.damagePlayer((playerImpact - 3) * 1.65, ship.name);
                    if (this.collisionMessageCooldown <= 0) {
                        this.collisionMessageCooldown = 1.4;
                        this.ui.pushEvent(t('Collision: {label}', { label: ship.name }), 'danger');
                    }
                }
                this.autopilot = false;
                const raw = (shipImpact - 3) * 1.35;
                const cap = Math.max(10, ship.maxHull * 0.25);
                const dmg = shipImpact > 4 ? Math.min(raw, cap) : 0;
                if (dmg > 0)
                    this.damageShip(ship, dmg, 'player', tuple(playerPos));
                if (dmg > 0.5) {
                    ship.destination = undefined;
                    if (this.npcCollisionCooldown <= 0) {
                        this.npcCollisionCooldown = 2.5;
                        this.ui.pushEvent(t('{name} clipped you.', { name: ship.name }), 'warning', 3600);
                    }
                }
            }
            // Ship vs later ships (each pair exactly once).
            shipPos.set(ship.position[0], ship.position[1], ship.position[2]);
            for (let j = i + 1; j < ships.length; j += 1) {
                const other = ships[j];
                if (other.hull <= 0 || other.poweredDown || other.race)
                    continue;
                const otherExtents = this.npcHullExtents(other);
                const otherVolume = otherExtents[0] * otherExtents[1] * otherExtents[2];
                const otherPos = this.tmpP1.set(other.position[0], other.position[1], other.position[2]);
                const otherQuat = this.tmpQ2.set(other.rotation[0], other.rotation[1], other.rotation[2], other.rotation[3]);
                if (hullVsHull(shipPos, shipExtents, shipQuat, otherPos, otherExtents, otherQuat, contact)) {
                    const sv = ship.velocity;
                    const ov = other.velocity;
                    const shipVel0 = [sv[0], sv[1], sv[2]];
                    const otherVel0 = [ov[0], ov[1], ov[2]];
                    const shipImpact = apply(ship.position, ship.velocity, otherVel0, shipVolume, otherVolume, 1);
                    const otherImpact = apply(other.position, other.velocity, shipVel0, otherVolume, shipVolume, -1);
                    const shipDmg = shipImpact > 4 ? Math.min((shipImpact - 3) * 1.35, Math.max(10, ship.maxHull * 0.25)) : 0;
                    const otherDmg = otherImpact > 4 ? Math.min((otherImpact - 3) * 1.35, Math.max(10, other.maxHull * 0.25)) : 0;
                    if (shipDmg > 0)
                        this.damageShip(ship, shipDmg, other.id, tuple(otherPos));
                    if (otherDmg > 0)
                        this.damageShip(other, otherDmg, ship.id, tuple(shipPos));
                }
            }
        }
    }

    findClearSpace(ship) {
        // Search a fan of nearby points for the first pocket clear of field
        // obstacles, so a badly damaged ship can limp out of the clutter before
        // committing to its next route. Deterministic per ship/lifetime window.
        const obstacles = this.activeFieldObstacles();
        const origin = vec(ship.position, this.tmpP2);
        const shipVariant = HULL_FLIGHT_STATS[ship.variant] ? ship.variant : shipVariantForRole(ship.role);
        const shipRadius = HULL_FLIGHT_STATS[shipVariant]?.collisionRadius ?? NPC_SHIP_RADIUS;
        const clearance = shipRadius + 24;
        const rng = seededRandom(`${this.save.world.seed}:clearpath:${ship.id}:${Math.floor(ship.lifetime / 20)}`);
        const base = rng() * Math.PI * 2;
        if (!obstacles.length)
            return tuple(this.tmpP3.set(origin.x + Math.cos(base) * 320, origin.y + 160, origin.z + Math.sin(base) * 320));
        for (let ring = 0; ring < 4; ring += 1) {
            const distance = 160 + ring * 110;
            const rise = (ring % 2 === 0 ? 1 : -1) * (24 + ring * 40);
            for (let k = 0; k < 8; k += 1) {
                const angle = base + (k / 8) * Math.PI * 2;
                this.tmpP3.set(origin.x + Math.cos(angle) * distance, origin.y + rise, origin.z + Math.sin(angle) * distance);
                if (this.entryPositionClear(this.tmpP3, obstacles, clearance))
                    return tuple(this.tmpP3);
            }
        }
        // No pocket in range: climb above the field clutter.
        return tuple(this.tmpP3.set(origin.x, origin.y + 260, origin.z));
    }
    fireNpcGun(ship, direction) {
        // Aim quality: the AI's nose already aims at the deflection point, so the
        // only thing keeping novices honest is angular jitter on the shot
        // direction — aces shoot where they aim. Jitter is seeded per ship.
        const aim = ship.pilot?.aim ?? 0.72;
        let aimDir = direction;
        if (aim < 0.99) {
            const spread = (1 - aim) * 0.09;
            const axis = this.tmpP3.crossVectors(direction, UP);
            if (axis.lengthSq() < 1e-6)
                axis.set(1, 0, 0);
            else
                axis.normalize();
            aimDir = this.tmpP4.copy(direction).applyAxisAngle(axis, (ship.aiRng() - 0.5) * 2 * spread).normalize();
        }
        const position = vec(ship.position).addScaledVector(aimDir, ship.muzzleOffset ?? 2.4);
        const slot = this.projStore.alloc();
        this.projStore.setPos(slot, position.x, position.y, position.z);
        const shotVel = this.tmpP0.copy(aimDir).multiplyScalar(150).add(vec(ship.velocity));
        this.projStore.setVel(slot, shotVel.x, shotVel.y, shotVel.z);
        // Muzzle flash on every NPC shot: in a furball you should see WHERE
        // fire comes from, not just bolts in flight (faction-matched color).
        this.renderer.spawnMuzzleFlash(position.x, position.y, position.z, ship.faction === 'red-talons' ? 0xff4b39 : 0x75cfff);
        this.projectiles.push({
            id: `p-${++this.projectileCounter}`,
            kind: 'laser',
            ownerId: ship.id,
            slot,
            damage: ship.gunDamage,
            life: ship.projectileLife ?? 1.55,
            targetId: ship.targetId,
            faction: ship.faction,
            visualScale: ship.projectileVisualScale,
        });
        // Fire rate scales with aim: aces keep the trigger down, novices wait.
        ship.fireCooldown = (ship.fireInterval ?? (ship.role === 'bounty' ? 0.28 : ship.role === 'pirate' ? 0.38 : 0.46)) * (1 + (1 - aim) * 0.7);
    }
    updateProjectiles(dt) {
        const playerPos = vec(this.save.player.position, this.tmpP3);
        for (const projectile of this.projectiles) {
            if (projectile.life <= 0)
                continue;
            projectile.life -= dt;
            const start = this.projStore.getPos(projectile.slot, this.tmpP0);
            const velocity = this.projStore.getVel(projectile.slot, this.tmpP1);
            if (projectile.kind === 'missile' && projectile.targetId) {
                let targetPosition;
                if (projectile.targetId === 'player') {
                    targetPosition = this.tmpP4.copy(playerPos);
                }
                else {
                    const targetShip = this.ships.find((entry) => entry.id === projectile.targetId && entry.hull > 0);
                    if (targetShip)
                        targetPosition = vec(targetShip.position, this.tmpP4);
                }
                if (targetPosition) {
                    // Launcher identity travels with the projectile. Seeker,
                    // swarm, and torpedo racks therefore keep their own
                    // tracking envelope instead of sharing one hard-coded
                    // homing speed/turn rate.
                    const homingSpeed = projectile.homingSpeed ?? 92;
                    const homingTurn = projectile.homingTurn ?? 2.8;
                    const desired = targetPosition.sub(start).normalize().multiplyScalar(homingSpeed);
                    velocity.lerp(desired, 1 - Math.exp(-homingTurn * dt));
                    this.projStore.setVelV(projectile.slot, velocity);
                }
            }
            // Sweep the step in up to two passes: a slug with pierce budget
            // (magrail) resolves its first ship hit, then re-sweeps the rest of
            // the step from the impact point and can strike one more target.
            // Projectiles without pierce run pass 0 only — identical to the
            // historical single sweep.
            let sweepFrom = this.tmpP6.copy(start);
            let remaining = dt;
            let pierceLeft = projectile.pierce ?? 0;
            for (let pass = 0; pass < 2; pass += 1) {
                if (pass === 1 && pierceLeft <= 0)
                    break;
                const end = this.tmpP2.copy(sweepFrom).addScaledVector(velocity, remaining);
                let bestT = 2;
                let hitKind;
                let hitShip;
                let hitObstacle;
                const obstacleResult = this.firstObstacleHitInfo(sweepFrom, end, projectile.ownerId);
                if (obstacleResult !== undefined && obstacleResult.t < bestT) {
                    bestT = obstacleResult.t;
                    hitKind = 'obstacle';
                    hitObstacle = obstacleResult.obstacle;
                }
                if (projectile.ownerId !== 'player') {
                    const playerT = segmentSphereHit(sweepFrom, end, playerPos, this.playerCollisionRadius() + (projectile.kind === 'missile' ? 0.8 : 0.25));
                    if (playerT !== undefined && playerT < bestT) {
                        bestT = playerT;
                        hitKind = 'player';
                    }
                }
                for (const ship of this.ships) {
                    if (ship.id === projectile.ownerId || ship.hull <= 0)
                        continue;
                    if (ship.id === projectile.lastHitId)
                        continue;
                    if (projectile.ownerId !== 'player' && !this.projectileCanHitShip(projectile, ship))
                        continue;
                    const hit = ship.capitalClass
                        ? segmentShipHullHit(sweepFrom, end, ship, this.npcHullExtents(ship), projectile.kind === 'missile' ? 0.8 : 0.12)
                        : segmentSphereHit(sweepFrom, end, vec(ship.position, this.tmpP4), (ship.role === 'trader' ? 3.8 : 2.4) + (projectile.kind === 'missile' ? 0.8 : 0));
                    if (hit !== undefined && hit < bestT) {
                        bestT = hit;
                        hitKind = 'ship';
                        hitShip = ship;
                    }
                }
                if (hitKind) {
                    const hitPosition = this.tmpP4.copy(sweepFrom).lerp(end, bestT);
                    const playerPosition = vec(this.save.player.position, this.tmpP5);
                    const playerOrientation = quat(this.save.player.rotation, this.tmpAudioOrientation);
                    const localHit = this.tmpAudioLocal.copy(hitPosition).sub(playerPosition).applyQuaternion(playerOrientation.invert());
                    this.renderer.spawnImpact(tuple(hitPosition), projectile.kind === 'missile' ? 0xff7a42 : projectile.kind === 'gauss' ? 0xbfe9ff : projectile.kind === 'ion' ? 0x8fe4f0 : projectile.kind === 'mortar' ? 0xffa04d : 0xffcb62, projectile.kind === 'missile' || projectile.kind === 'mortar');
                    if (hitKind === 'player') {
                        this.damagePlayer(projectile.damage, projectile.kind === 'missile' ? 'missile strike' : 'weapons fire');
                        // A landed shot is a moment worth talking about: ace and
                        // flamboyant pilots get a seeded chance to rub it in.
                        this.maybeHitTaunt(projectile.ownerId);
                    }
                    else if (hitKind === 'ship' && hitShip && projectile.kind === 'ion') {
                        // Ion Lance: shields soak four times the bolt's base
                        // damage while the hull carryover stays at base rate,
                        // and the discharge jams the target's guns briefly.
                        const ship = hitShip;
                        const soaked = Math.min(Math.max(0, ship.shield), projectile.damage * 4);
                        ship.shield -= soaked;
                        const carried = projectile.damage - soaked / 4;
                        this.damageShip(ship, carried, projectile.ownerId, tuple(hitPosition));
                        ship.fireCooldown = Math.max(ship.fireCooldown ?? 0, 1.8);
                    }
                    else if (hitKind === 'ship' && hitShip && projectile.kind !== 'mortar')
                        this.damageShip(hitShip, projectile.damage, projectile.ownerId, tuple(hitPosition));
                    if (projectile.kind === 'mortar') {
                        // Sunlance detonation on any impact: splash with linear
                        // falloff to every hull near the blast, each ship left
                        // burning for a few seconds afterwards.
                        const radius = projectile.splashRadius ?? 26;
                        const minDamage = projectile.splashMin ?? 12;
                        for (const ship of this.ships) {
                            if (ship.hull <= 0 || ship.race)
                                continue;
                            const dxs = ship.position[0] - hitPosition.x;
                            const dys = ship.position[1] - hitPosition.y;
                            const dzs = ship.position[2] - hitPosition.z;
                            const distance = Math.sqrt(dxs * dxs + dys * dys + dzs * dzs);
                            if (distance > radius)
                                continue;
                            const falloff = 1 - distance / radius;
                            this.damageShip(ship, minDamage + (projectile.damage - minDamage) * falloff, projectile.ownerId, undefined);
                            ship.burn = { dps: projectile.burnDps ?? 6, until: this.save.world.time + (projectile.burnSeconds ?? 4), tick: 0.5, attackerId: projectile.ownerId };
                        }
                        this.renderer.spawnExplosion(tuple(hitPosition), false, 1.15);
                        if (hitKind === 'obstacle' && hitObstacle?.shape === 'asteroid')
                            this.renderer.spawnRockImpact(tuple(hitPosition), [hitObstacle.x, hitObstacle.y, hitObstacle.z]);
                    }
                    else if (projectile.kind === 'missile') {
                        // Heavy torpedoes detonate with a short hull-blast.
                        // The directly hit hull already took the warhead's
                        // direct damage above; nearby ships take the falloff
                        // component once, so a torpedo rewards a committed
                        // formation shot without double-counting its target.
                        if (projectile.splashRadius > 0) {
                            const radius = projectile.splashRadius;
                            const minDamage = projectile.splashMin ?? 0;
                            for (const ship of this.ships) {
                                if (ship.hull <= 0 || ship.race || ship === hitShip)
                                    continue;
                                const dxs = ship.position[0] - hitPosition.x;
                                const dys = ship.position[1] - hitPosition.y;
                                const dzs = ship.position[2] - hitPosition.z;
                                const distance = Math.sqrt(dxs * dxs + dys * dys + dzs * dzs);
                                if (distance > radius)
                                    continue;
                                const falloff = 1 - distance / radius;
                                this.damageShip(ship, minDamage + (projectile.damage - minDamage) * falloff, projectile.ownerId, undefined);
                            }
                        }
                        this.renderer.spawnExplosion(tuple(hitPosition), projectile.faction === 'red-talons', 0.65);
                        this.audio.playAtDirection('explosion', 0.8, playerPosition.distanceTo(hitPosition), localHit.x);
                    }
                    else if (hitKind === 'obstacle' && hitObstacle?.shape === 'asteroid') {
                        // Belt rock: the impact spark PLUS a matte chip/dust
                        // burst knocked off the surface, and a dry gravel
                        // crunch instead of the hull-impact crack.
                        this.renderer.spawnRockImpact(tuple(hitPosition), [hitObstacle.x, hitObstacle.y, hitObstacle.z]);
                        this.audio.playAtDirection('rock', projectile.kind === 'gauss' ? 0.6 : projectile.kind === 'ripper' || projectile.kind === 'pdc' ? 0.3 : 0.45, playerPosition.distanceTo(hitPosition), localHit.x);
                    }
                    else
                        this.audio.playAtDirection('impact', projectile.kind === 'gauss' ? 0.6 : projectile.kind === 'ripper' || projectile.kind === 'pdc' ? 0.3 : 0.45, playerPosition.distanceTo(hitPosition), localHit.x);
                    // Over-penetration: punch through the ship and keep the
                    // remaining step. Rocks, the player, and a spent pierce
                    // budget all end the slug here instead.
                    if (hitKind === 'ship' && hitShip && pierceLeft > 0) {
                        pierceLeft -= 1;
                        projectile.pierce = pierceLeft;
                        projectile.lastHitId = hitShip.id;
                        remaining *= 1 - bestT;
                        sweepFrom.copy(hitPosition);
                        continue;
                    }
                    projectile.life = 0;
                }
                else {
                    this.projStore.setPosV(projectile.slot, end);
                }
                break;
            }
        }
    }
    projectileCanHitShip(projectile, ship) {
        if (projectile.targetId === ship.id)
            return true;
        if (projectile.faction === 'red-talons')
            return ship.faction !== 'red-talons';
        if (ship.faction === 'red-talons')
            return true;
        return false;
    }
    damageShip(ship, amount, attackerId, position) {
        // A captured hull is still a hull: it takes damage like any other
        // ship. It stays inert — no AI, no retaliation, no comms (the pilot is
        // already in cuffs, so the reaction block below is skipped for it) —
        // and the surrender and unauthorized-attack gates are already guarded
        // on !ship.surrendered / !ship.hostile, so it cannot re-engage or
        // double its bounty — only die, and drop scrap on the way out.
        let remaining = amount;
        if (ship.shield > 0) {
            const absorbed = Math.min(ship.shield, remaining);
            ship.shield -= absorbed;
            remaining -= absorbed;
        }
        if (remaining > 0)
            ship.hull -= remaining;
        const hullDamaged = remaining > 0;
        ship.shieldDelay = 4.5;
        // An NPC attack on a civilian raises a distress beacon: the ship pings
        // its position on the radar rim and the nav map even beyond the normal
        // sensor horizon, and the player gets one MAYDAY callout with the
        // distance. (Player hits and environment damage don't beacon — the
        // pilot already knows exactly where those come from.) The victim also
        // remembers who is shooting it, so a successful rescue can be
        // acknowledged later (see tryRescueGratitude).
        if (attackerId !== 'player' && attackerId !== 'environment' && (ship.role === 'trader' || ship.role === 'miner') && ship.hull > 0) {
            const attacker = this.ships.find((entry) => entry.id === attackerId && entry.hull > 0);
            if (attacker && (attacker.hostile || attacker.role === 'pirate' || attacker.role === 'bounty' || attacker.role === 'escort')) {
                ship.attackerId = attacker.id;
                ship.lastAttackerHitAt = this.save.world.time;
                ship.distressUntil = this.save.world.time + DISTRESS_WINDOW;
                if (this.save.world.time >= (ship.nextDistressCallAt ?? 0)) {
                    ship.nextDistressCallAt = this.save.world.time + DISTRESS_CALL_REPEAT;
                    const distance = Math.round(vec(ship.position).distanceTo(vec(this.save.player.position)));
                    this.ui.pushSensor(t('DISTRESS CALL — {name} at {distance} km.', { name: ship.name, distance }), 'danger', 5200);
                    this.audio.play('warning');
                    const distressPool = PILOT_LINES.timid.distress;
                    if (distressPool?.length && this.chatterOpen())
                        this.sayPilotLine(ship, distressPool[Math.floor(ship.aiRng() * distressPool.length)]);
                }
            }
        }
        if (attackerId === 'player' && ship.hull > 0 && !ship.poweredDown && !ship.captured) {
            // A hostile mid-attack on another ship turns to defend itself: the
            // player engaging it draws its fire away from the victim. This is
            // self-defense — no unauthorized-attack penalty — and it frees the
            // mark to resume its course.
            const hostileFighter = ship.hostile || ship.role === 'pirate' || ship.role === 'bounty' || ship.role === 'escort';
            if (hostileFighter && ship.targetId && ship.targetId !== 'player') {
                ship.hostile = true;
                ship.targetId = 'player';
                ship.pursuitHoldFire = false;
                ship.pursuitUntil = 0;
            }
            // Firing on a demanding pirate ends the standoff one way or
            // another: a scared group breaks off, the rest commit to the fight.
            const brokeOff = ship.mug ? this.tryScareOffMug(ship) : false;
            if (!brokeOff) {
                this.endMugStandoff(ship);
                // Under fire: the pilot commits to evasion after their reaction
                // latency (reflex — novices flinch late, aces react fast) and stays
                // evasive for a reflex-scaled duration.
                const reflex = ship.pilot?.reflex ?? 0.78;
                ship.evasiveUntil = this.save.world.time + 2.5 * (0.6 + reflex * 0.5);
                ship.evasiveLatencyUntil = this.save.world.time + (1.2 - reflex) * 1.1;
                // Hull damage opens the surrender gate: instead of just running,
                // the pilot picks a surrender action (run, dump cargo or pay and
                // run, or power down). The gate is open from the first hull hit —
                // every hull hit rolls a personality-driven chance that climbs as
                // the hull degrades, so a timid pilot may give up at the first
                // scratch while an aggressive one fights on. fleeMul drives both
                // the starting odds and how fast they rise; a wary pilot who
                // escaped before gives up even sooner.
                const hullRatio = ship.maxHull > 0 ? ship.hull / ship.maxHull : 1;
                const stubborn = pilotMod(ship, 1, 'fleeMul');
                const chance = (0.04 + (1 - hullRatio) * 0.32) * stubborn * (ship.waryOfPlayer ? WARY_FLEE_MULTIPLIER : 1);
                if (hullDamaged && !ship.noSurrender && !ship.fleeing && !ship.surrendered && ship.aiRng() < chance) {
                    this.surrenderShip(ship);
                    // The attacker gave up: the mark it was shooting at was just
                    // saved — thank the pilot if the victim actually took hits.
                    this.tryRescueGratitude(ship);
                }
                // Timid pilots call for help when the player lands a hit: a seeded
                // chance with its own cooldown, routed through the comms bar like
                // the rest of the chatter. At close range any hit is worth
                // crying about; out past DISTRESS_CLOSE_RANGE a hit has to actually
                // bite hull (the ship closed in, shields are down, the fight is
                // real) before it earns a MAYDAY — long-range potshots that only
                // graze shields stay quiet.
                const dx = ship.position[0] - this.save.player.position[0];
                const dy = ship.position[1] - this.save.player.position[1];
                const dz = ship.position[2] - this.save.player.position[2];
                const closeRange = dx * dx + dy * dy + dz * dz <= DISTRESS_CLOSE_RANGE * DISTRESS_CLOSE_RANGE;
                if (this.chatterOpen() && ship.pilot?.temperament === 'timid' && (hullDamaged || closeRange) && this.save.world.time >= (ship.nextDistressAt ?? 0) && ship.aiRng() < 0.3) {
                    const distressPool = PILOT_LINES.timid.distress;
                    if (distressPool?.length) {
                        ship.nextDistressAt = this.save.world.time + 6 + ship.aiRng() * 8;
                        const line = distressPool[Math.floor(ship.aiRng() * distressPool.length)];
                        this.sayPilotLine(ship, line);
                    }
                }
            }
        }
        // Accidental fire doesn't end a career: player hits on a non-hostile
        // ship accumulate (playerDamageTaken), and only crossing a real damage
        // threshold counts as a deliberate unauthorized attack — one stray
        // bolt earns a throttled warning, sustained fire escalates to the
        // hostile tag, rep loss, and a patrol alert. A surrendered ship never
        // re-enters the fight (finishing it still pays the bounty via the
        // faction check in destroyShip), and a recognizing pilot defending
        // itself is self-defense, so neither is penalized here.
        // A ship that just stood down after a mug (complied or scared off) is
        // not a fresh civilian target: the hit that resolved the standoff is
        // self-defense, not an unauthorized attack — the tally was reset on
        // stand-down. But the break-off buys no immunity: keep firing and the
        // standing-down ship re-engages exactly like any other non-hostile
        // (warning first, then hostile once the damage threshold is crossed).
        if (attackerId === 'player' && !ship.hostile && !ship.surrendered && !ship.captured && !ship.recognizesPlayer) {
            ship.playerDamageTaken = (ship.playerDamageTaken ?? 0) + Math.max(0, amount);
            const threshold = Math.max(25, (ship.maxShield + ship.maxHull) * 0.15);
            if (ship.playerDamageTaken < threshold) {
                if (this.save.world.time >= (ship.fireWarningAt ?? 0)) {
                    ship.fireWarningAt = this.save.world.time + 6;
                    this.ui.pushEvent(t('Watch your fire — {vessel} hit!', { vessel: t(ship.role === 'patrol' ? 'patrol vessel' : 'civilian vessel') }), 'warning', 3600);
                }
            }
            else {
                ship.hostile = true;
                ship.targetId = 'player';
                this.save.player.reputation[ship.faction] = clamp(this.save.player.reputation[ship.faction] - (ship.role === 'patrol' ? 16 : 9), -100, 100);
                this.ui.pushEvent(t('Unauthorized attack: {faction} reputation damaged.', { faction: t(FACTION_LABEL(ship.faction)) }), 'danger', 4500);
                this.alertPatrols(ship.position);
            }
        }
        if (ship.hull <= 0)
            this.destroyShip(ship, attackerId, position);
    }
    // A beaten pilot gives up rather than fighting on. Every outcome ends the
    // fight: the ship stops counting as hostile (hyperdrive/landing unlock)
    // and turns orange on the HUD, with a fitting line per action. The action
    // follows the temperament weights, and cargo/credit dumps spawn pickups.
    surrenderShip(ship) {
        ship.surrendered = true;
        ship.hostile = false;
        ship.fleeing = false;
        ship.targetId = undefined;
        this.resolveHyperdriveIntercept(ship);
        const weights = SURRENDER_WEIGHTS[ship.pilot?.temperament] ?? SURRENDER_WEIGHTS.steady;
        const entries = Object.entries(weights);
        const total = entries.reduce((sum, [, weight]) => sum + weight, 0);
        let roll = ship.aiRng() * total;
        let action = entries[0][0];
        for (const [candidate, weight] of entries) {
            roll -= weight;
            if (roll < 0) {
                action = candidate;
                break;
            }
        }
        if (action === 'eject' || action === 'downEject')
            this.ejectCargo(ship);
        if (action === 'pay' || action === 'downPay')
            this.transferCredits(ship);
        if (action.startsWith('down'))
            ship.poweredDown = true;
        else
            ship.fleeing = true;
        // The pilot remembers the encounter: record the callsign and whether
        // they were captured in place (powered down) or got away (fled), so a
        // later spawn of the same name defers or comes back wary (see spawnShip
        // recognition).
        const surrenderedTo = this.save.world.surrenderedTo ?? (this.save.world.surrenderedTo = {});
        surrenderedTo[ship.name] = action.startsWith('down') ? 'captured' : 'fled';
        const pool = PILOT_LINES[ship.pilot?.temperament]?.surrender?.[action];
        if (pool?.length && this.chatterOpen()) {
            const line = pool[Math.floor(ship.aiRng() * pool.length)];
            this.sayPilotLine(ship, line);
        }
    }
    // Jettison the hold: a couple of salvage-grade pickups as the pilot runs.
    // A freighter with a real hold (ship.cargo — see rollNpcCargo) dumps what
    // it was actually carrying; the role pool remains the fallback for ships
    // without one, so the loot always reads like the ship's work.
    ejectCargo(ship) {
        const rng = seededRandom(`${this.save.world.seed}:surrender-eject:${ship.id}`);
        const cargo = ship.cargo;
        if (cargo && Object.keys(cargo).some((id) => cargo[id] > 0)) {
            const entries = Object.entries(cargo).filter(([, qty]) => qty > 0);
            const drops = Math.min(entries.length, 1 + Math.floor(rng() * Math.min(2, entries.length)));
            for (let index = 0; index < drops; index += 1) {
                const [commodity, qty] = entries[Math.floor(rng() * entries.length)];
                this.spawnPickup(commodity, ship.position, 'combat', Math.max(1, Math.round(qty / 2)));
            }
            if (ship.role === 'miner' && rng() < MINER_GOLD_DROP_CHANCE)
                this.spawnPickup('gold', ship.position, 'combat');
            return;
        }
        const pool = SURRENDER_EJECT_POOLS[ship.role] ?? ['electronics', 'scrap'];
        const drops = 1 + Math.floor(rng() * 2);
        for (let index = 0; index < drops; index += 1)
            this.spawnPickup(pool[Math.floor(rng() * pool.length)], ship.position, 'combat');
        if (ship.role === 'miner' && rng() < MINER_GOLD_DROP_CHANCE)
            this.spawnPickup('gold', ship.position, 'combat');
    }
    // Hand over the wallet: a credit pickup worth a slice of the bounty value.
    transferCredits(ship) {
        const amount = ship.bountyValue > 0 ? Math.round(ship.bountyValue * 0.6) : 60;
        this.spawnPickup('credits', ship.position, 'combat', amount);
    }
    // The live standoff, or undefined when no pirate is holding fire on the
    // player: the demand plus the seconds left on the window.
    activeMug() {
        const mugger = this.ships.find((ship) => ship.mug && ship.holdFire);
        if (!mugger)
            return undefined;
        return {
            demand: mugger.mug.demand,
            secondsLeft: Math.max(0, Math.ceil((mugger.demandUntil ?? 0) - this.save.world.time)),
        };
    }
    // The demand an active standoff is making, or undefined when no pirate is
    // holding fire on the player. The ship menu and keyboard use this to show
    // the compliance affordance (jettison this cargo, or pay the toll).
    activeMugDemand() {
        return this.activeMug()?.demand;
    }
    activeMugCargoCommodity() {
        const demand = this.activeMugDemand();
        return demand?.kind === 'cargo' ? demand.commodity : undefined;
    }
    // The cut a mugger wants, by temperament: aggressive pilots demand the
    // hold's cream, timid ones settle for a light toll.
    mugShare(temperament) {
        return MUG_TEMPERAMENT_SHARE[temperament] ?? MUG_CARGO_SHARE;
    }
    // What a mugger demands: the most valuable line in the hold (a temperament
    // share of it), or — with an empty hold — a toll priced off the hull and its
    // outfit rather than the pilot's wallet. A well-appointed ship draws a toll
    // even when the pilot is flying broke. Undefined when there is nothing worth
    // taking — the pirates break off instead of fighting a bare, empty ship.
    mugDemand(share = MUG_CARGO_SHARE) {
        const cargo = this.save.player.cargo ?? {};
        let best;
        for (const [id, qty] of Object.entries(cargo)) {
            if (qty <= 0)
                continue;
            const value = (COMMODITIES[id]?.basePrice ?? 0) * qty;
            if (!best || value > best.value)
                best = { commodity: id, qty, value };
        }
        if (best) {
            const quantity = Math.max(1, Math.ceil(best.qty * share));
            return { kind: 'cargo', commodity: best.commodity, quantity };
        }
        // No cargo: price the ship and its installed modules. Player credits
        // are deliberately ignored — the mugger wants what the hull is worth,
        // not what happens to be in the pilot's account.
        const assets = this.shipAssetValue();
        if (assets > 0)
            return { kind: 'credits', amount: clamp(Math.round(assets * MUG_TOLL_SHARE), MUG_TOLL_MIN, MUG_TOLL_MAX) };
        return undefined;
    }
    // The market value of the hull plus every module bolted to it — the only
    // wealth a mugger can actually see from outside.
    shipAssetValue() {
        const ship = SHIPS[this.save.player.shipId];
        let value = ship?.price ?? 0;
        const loadout = this.save.player.outfitting?.loadouts?.[this.save.player.shipId];
        if (loadout) {
            for (const key of ['guns', 'launchers', 'drive', 'defense', 'utility'])
                for (const id of loadout[key] ?? [])
                    value += OUTFIT_ITEMS[canonicalOutfitId(id)]?.price ?? 0;
        }
        else {
            for (const id of (this.save.player.equipment ?? []))
                value += EQUIPMENT[id]?.price ?? 0;
        }
        return value;
    }
    // Claim-jumpers demand the salvage the pilot has already pulled from the
    // wreck — never what is still aboard. Nothing extracted yet means there is
    // nothing to shake down, so the ambush falls back to a plain attack.
    salvageMugDemand(node, lead) {
        const share = this.mugShare(lead.pilot?.temperament);
        const held = this.save.player.cargo[node.salvage] ?? 0;
        if (held <= 0)
            return undefined;
        return { kind: 'cargo', commodity: node.salvage, quantity: Math.max(1, Math.ceil(held * share)) };
    }
    // Open a standoff: the lead hails a demand and the whole group holds fire
    // for the window. `demand` may be forced (gold-heat) or built from the hold.
    beginMug(lead, escorts, demand, options = {}) {
        const seconds = options.seconds ?? MUG_STANDOFF_SECONDS;
        const lines = options.lines ?? MUG_DEMAND_LINES;
        const rng = seededRandom(`${this.save.world.seed}:mug:${lead.id}:${Math.floor(this.save.world.time)}`);
        const mug = { demand };
        for (const ship of [lead, ...escorts]) {
            ship.mug = mug;
            ship.holdFire = true;
            ship.demandUntil = this.save.world.time + seconds;
        }
        const label = demand.kind === 'cargo'
            ? `${demand.quantity} ${t(COMMODITIES[demand.commodity].name)}`
            : formatCredits(demand.amount);
        const line = lines[Math.floor(rng() * lines.length)]
            .replace(/\{demand\}/g, label)
            .replace(/\{seconds\}/g, String(seconds));
        this.sayPilotLine(lead, line);
        if (options.sensor)
            this.ui.pushSensor(options.sensor, 'danger', 5200);
        if (options.event)
            this.ui.pushEvent(options.event, 'warning', 6000);
    }
    // Ambient intercepts default to mugging: demand whatever the hold will
    // bear, or break off when the pilot is flying empty and broke. `options`
    // lets a caller restyle the standoff (e.g. the "seen working" opportunist
    // voice) without duplicating the machinery.
    openMug(lead, escorts, options = {}) {
        const demand = this.mugDemand(this.mugShare(lead.pilot?.temperament));
        if (!demand) {
            for (const ship of [lead, ...escorts]) {
                ship.standingDown = true;
                ship.hostile = false;
                ship.targetId = undefined;
                this.resolveHyperdriveIntercept(ship);
            }
            const rng = seededRandom(`${this.save.world.seed}:mug-empty:${lead.id}:${Math.floor(this.save.world.time)}`);
            const emptyLines = options.emptyLines ?? MUG_EMPTY_LINES;
            this.sayPilotLine(lead, emptyLines[Math.floor(rng() * emptyLines.length)]);
            this.ui.pushSensor(options.emptySensor ?? t('Pirates closing — then breaking off: nothing worth the risk.'), 'info', 4800);
            return;
        }
        this.beginMug(lead, escorts, demand, {
            lines: options.lines,
            sensor: options.sensor ?? t('Pirates inbound — they are hailing you.'),
            event: t('Standoff: comply before they fire.'),
        });
    }
    // Compliance: the group takes its cut and leaves the field.
    standDownMug(mugShip) {
        const mug = mugShip.mug;
        for (const ship of this.ships) {
            if (!ship.mug || ship.mug !== mug)
                continue;
            ship.mug = undefined;
            ship.holdFire = false;
            ship.standingDown = true;
            ship.hostile = false;
            ship.targetId = undefined;
            ship.playerDamageTaken = 0;
            // A peaceful stand-down resolves a hyperdrive intercept too, so the
            // post-intercept calm window still triggers after a paid-off mug.
            this.resolveHyperdriveIntercept(ship);
        }
    }
    // A show of force: when the player lands a hit on a demanding pirate, the
    // group may lose its nerve and break off instead of committing to the
    // fight. Timid leads scare easily; aggressive ones rarely flinch.
    tryScareOffMug(ship) {
        const mug = ship.mug;
        if (!mug)
            return false;
        const group = this.ships.filter((entry) => entry.mug === mug);
        const lead = group[0] ?? ship;
        const chance = MUG_SCARE_OFF[lead.pilot?.temperament] ?? 0.15;
        if (ship.aiRng() >= chance)
            return false;
        this.standDownMug(lead);
        const line = MUG_SCARE_LINES[Math.floor(ship.aiRng() * MUG_SCARE_LINES.length)];
        // The whole crew folds together, so the comms bar names every ship
        // that is breaking off — not just the lead.
        this.sayGroupLine(group, line);
        return true;
    }
    // The window closed (or the pilot shot first): the whole group commits.
    endMugStandoff(ship) {
        const mug = ship.mug;
        if (!mug) {
            ship.holdFire = false;
            return;
        }
        for (const entry of this.ships) {
            if (entry.mug === mug) {
                entry.mug = undefined;
                entry.holdFire = false;
            }
        }
    }
    // Pay off a credit toll during a standoff: cheaper than a hull repair.
    payOffMug() {
        const mugger = this.ships.find((ship) => ship.mug && ship.holdFire && ship.mug.demand?.kind === 'credits');
        if (!mugger)
            return false;
        const amount = mugger.mug.demand.amount;
        if ((this.save.player.credits ?? 0) < amount)
            return false;
        this.save.player.credits -= amount;
        this.standDownMug(mugger);
        this.ui.pushEvent(t('Toll paid ({credits}). Pirates break off.', { credits: formatCredits(amount) }), 'info', 5200);
        this.audio.play('ui', 0.6);
        return true;
    }
    // The mugging out: hand over cargo to a demanding pirate group. If an
    // active standoff wants this commodity, the group takes the demanded share
    // and breaks off; otherwise the cargo becomes drifting pickups the pilot
    // can scoop back up.
    jettisonCargo(commodityId = 'gold') {
        const owned = this.save.player.cargo[commodityId] ?? 0;
        if (owned <= 0)
            return false;
        const mugger = this.ships.find((ship) => ship.mug && ship.holdFire && ship.mug.demand?.kind === 'cargo' && ship.mug.demand.commodity === commodityId);
        if (mugger) {
            const take = Math.min(owned, mugger.mug.demand.quantity);
            this.save.player.cargo[commodityId] = owned - take;
            this.standDownMug(mugger);
            this.ui.pushEvent(t('{commodity} jettisoned ({units}) — pirates take it and break off.', { commodity: t(COMMODITIES[commodityId].name), units: take }), 'info', 5200);
            this.audio.play('ui', 0.6);
            return true;
        }
        this.save.player.cargo[commodityId] = 0;
        this.spawnPickup(commodityId, this.save.player.position, 'combat', owned);
        this.ui.pushEvent(t('{commodity} jettisoned ({units} units).', { commodity: t(COMMODITIES[commodityId].name), units: owned }), 'info', 5200);
        this.audio.play('ui', 0.6);
        return false;
    }
    // A surrendered pilot is captured, not exploded: claiming the ship pays the
    // defense bounty, completes any active warrant into the registry, and counts
    // the capture — the surrender already ended the fight, so no explosion and
    // no civilian-loss penalty. The hull stays alive and drifts as a quiet scene
    // object after the transfer.
    // Only ships worth a bounty are claimable; a civilian the player beat down
    // has no payoff and stays unclaimed.
    claimSurrendered(ship) {
        if (!ship.surrendered || ship.claimed || ship.hull <= 0 || !(ship.bountyValue > 0 || ship.missionId))
            return false;
        ship.claimed = true;
        ship.captured = true;
        ship.hostile = false;
        ship.fleeing = false;
        ship.poweredDown = false;
        ship.targetId = undefined;
        ship.burning = false;
        ship.destination = undefined;
        // A powered-down surrender may have nearly zero momentum. Give the
        // recovered hull a small, forward drift so it visibly remains in space.
        if (Math.hypot(ship.velocity[0], ship.velocity[1], ship.velocity[2]) < 0.75) {
            const drift = FORWARD.clone().applyQuaternion(quat(ship.rotation)).multiplyScalar(2.4);
            ship.velocity = tuple(drift);
        }
        this.save.player.stats.kills += 1;
        if (ship.bountyValue > 0) {
            const payment = ship.bountyValue;
            this.save.player.credits += payment;
            this.save.player.reputation.concord = clamp(this.save.player.reputation.concord + 1, -100, 100);
            this.ui.pushEvent(t('Surrendered pilot captured. {credits} bounty credited.', { credits: formatCredits(payment) }), 'success', 4200);
        }
        if (ship.missionId) {
            const result = completeBountyMission(this.save, ship.missionId);
            if (result.ok)
                this.ui.pushEvent(result.message, 'success', 6500);
        }
        const surrenderedTo = this.save.world.surrenderedTo ?? (this.save.world.surrenderedTo = {});
        surrenderedTo[ship.name] = 'captured';
        if (this.save.player.currentTargetId === ship.id)
            this.clearTarget();
        return true;
    }
    // A civilian the player just saved thanks the pilot: a comms line and a
    // small credit tip. Fires when the player destroys (or drives off) a
    // hostile that was actively hitting that civilian — the victim has to
    // have taken a hit from that attacker within the gratitude window, so a
    // kill on a pirate that merely brushed past a trader stays silent.
    tryRescueGratitude(attacker) {
        const victim = this.ships.find((entry) => entry.attackerId === attacker.id && entry.hull > 0 && this.save.world.time - (entry.lastAttackerHitAt ?? -Infinity) < RESCUE_GRATITUDE_WINDOW);
        if (!victim)
            return;
        victim.attackerId = undefined;
        victim.lastAttackerHitAt = undefined;
        if (RESCUE_GRATITUDE_LINES.length && this.chatterOpen())
            this.sayPilotLine(victim, RESCUE_GRATITUDE_LINES[Math.floor(victim.aiRng() * RESCUE_GRATITUDE_LINES.length)]);
        const tip = Math.round(RESCUE_TIP_BASE + victim.aiRng() * RESCUE_TIP_RANGE);
        this.save.player.credits = (this.save.player.credits ?? 0) + tip;
        this.ui.pushEvent(t('{name} sends their thanks — {credits} tip wired.', { name: victim.name, credits: formatCredits(tip) }), 'success', 4200);
        this.audio.play('success');
    }
    // `position` defaults to the dying ship's own coordinates: mortar splash and
    // burn ticks call damageShip without a hit position, so a killing blow used
    // to hand `undefined` to spawnPickup's vec() — a TypeError inside the frame
    // guard that silently ate the combat drop and aborted the sim step.
    destroyShip(ship, attackerId, position = ship.position) {
        ship.hull = 0;
        this.resolveHyperdriveIntercept(ship);
        const explosionScale = ship.capitalClass === 'battleship' ? 8 : ship.capitalClass === 'frigate' ? 3.5 : ship.role === 'trader' ? 1.5 : 1;
        this.renderer.spawnExplosion(ship.position, ship.hostile, explosionScale);
        this.audio.play('explosion', 1.1);
        if (ship.hostile && attackerId === 'player') {
            // Just fought off a threat: calm the lanes for a while.
            this.lastCombatAt = this.save.world.time;
            // The mark that hostile was hitting is safe now — acknowledge the save.
            this.tryRescueGratitude(ship);
        }
        if (attackerId === 'player') {
            if (!ship.captured)
                this.save.player.stats.kills += 1;
            // The capture already paid the bounty (see claimSurrendered); a
            // hull destroyed after the fact is scrap, not a second paycheck.
            if (!ship.captured && (ship.hostile || ship.faction === 'red-talons')) {
                const payment = ship.bountyValue;
                this.save.player.credits += payment;
                this.save.player.reputation.concord = clamp(this.save.player.reputation.concord + 1, -100, 100);
                this.ui.pushEvent(t('Hostile destroyed: +{credits} bounty.', { credits: formatCredits(payment) }), 'success', 4200);
            }
            else if (!ship.captured) {
                this.save.player.reputation[ship.faction] = clamp(this.save.player.reputation[ship.faction] - 18, -100, 100);
                this.ui.pushEvent(t('Civilian loss. {faction} standing severely reduced.'), 'danger', 5200);
            }
            if (ship.missionId && !ship.captured) {
                const result = completeBountyMission(this.save, ship.missionId);
                if (result.ok)
                    this.ui.pushEvent(result.message, 'success', 6500);
            }
        }
        // A captured hull already paid out on claim — destroying the wreck is
        // scrap, not a second windfall, so no drop rolls fire for it.
        if (!ship.captured) {
            const rng = seededRandom(`${this.save.world.seed}:combat-drop:${ship.id}`);
            if (rng() < 0.64)
                this.spawnPickup(rng() > 0.8 ? 'electronics' : 'scrap', position, 'combat');
            if (ship.role === 'miner' && rng() < MINER_GOLD_DROP_CHANCE)
                this.spawnPickup('gold', position, 'combat');
        }
        if (this.save.player.currentTargetId === ship.id)
            this.save.player.currentTargetId = undefined;
    }
    damagePlayer(amount, source, feedback = true) {
        if (this.deathTimer > 0 || amount <= 0)
            return;
        let remaining = amount;
        if (this.save.player.shield > 0) {
            const absorbed = Math.min(this.save.player.shield, remaining);
            this.save.player.shield -= absorbed;
            remaining -= absorbed;
        }
        if (remaining > 0)
            this.save.player.hull -= remaining;
        this.playerShieldDelay = 5.2;
        this.autopilot = false;
        this.snapToCombatSpeed();
        if (feedback && amount > 1.5) {
            this.audio.play('hit', clamp(amount / 18, 0.4, 1.4));
            if (navigator.vibrate && this.save.settings.vibration)
                navigator.vibrate(Math.min(90, 18 + amount * 2));
        }
        if (this.save.player.hull <= 0) {
            this.save.player.hull = 0;
            this.deathTimer = 2.1;
            this.renderer.spawnExplosion(this.save.player.position, false, 1.55);
            this.ui.pushEvent(t('SHIP LOST: {source}. Emergency beacon transmitting.', { source }), 'danger', 6500);
            this.audio.play('explosion', 1.6);
        }
    }
    updateRegeneration(dt) {
        const stats = this.playerStats();
        regenerateCombatResources(this.save.player, stats, dt, this.playerShieldDelay);
    }
    updateDeathDrift(dt) {
        const velocity = vec(this.save.player.velocity).multiplyScalar(Math.exp(-0.6 * dt));
        const position = vec(this.save.player.position).addScaledVector(velocity, dt);
        this.save.player.velocity = tuple(velocity);
        this.save.player.position = tuple(position);
        this.save.player.angularVelocity = [0.3, -0.22, 0.38];
    }
    recoverPlayer() {
        if (this.arena) {
            this.restartArena();
            return;
        }
        const loss = Math.min(this.save.player.credits, Math.max(500, Math.floor(this.save.player.credits * 0.15)));
        this.save.player.credits -= loss;
        for (const id of Object.keys(this.save.player.cargo)) {
            this.save.player.cargo[id] = Math.floor((this.save.player.cargo[id] ?? 0) * 0.35);
        }
        for (const mission of this.save.activeMissions) {
            mission.status = 'failed';
            this.save.world.failedMissionIds.push(mission.id);
        }
        this.save.activeMissions = [];
        this.save.player.sealedCargo = [];
        const dock = this.save.player.lastDockedAt;
        const location = LOCATIONS[dock];
        const stats = this.playerStats();
        this.save.player.position = [...location.position];
        this.save.player.velocity = [0, 0, 0];
        this.save.player.angularVelocity = [0, 0, 0];
        this.save.player.rotation = [0, 0, 0, 1];
        this.save.player.throttle = 0;
        this.save.player.shield = 0;
        this.save.player.hull = stats.hull * 0.35;
        this.save.player.energy = stats.energyCapacity * 0.35;
        this.save.player.fuel = stats.fuel * 0.35;
        this.save.player.missiles = 0;
        this.save.player.dockedAt = dock;
        this.save.player.systemId = location.systemId;
        this.renderer.setSystem?.(location.systemId);
        this.renderer.setCockpitVisible(false);
        this.audio.setStationMode(true);
        this.ui.hideHud();
        recordMarketVisit(this.save.world, dock);
        this.ui.showDock(this.save, dock);
        this.ui.showToast(t('Emergency tow complete. Recovery fee: {credits}.', { credits: formatCredits(loss) }), 'danger', 6500);
        this.persistSave();
    }
    updateBountySpawns() {
        const player = vec(this.save.player.position);
        for (const mission of this.save.activeMissions) {
            if (mission.kind !== 'bounty' || !mission.targetZone || !mission.targetName)
                continue;
            if (this.ships.some((entry) => entry.missionId === mission.id && entry.hull > 0))
                continue;
            const zone = LOCATIONS[mission.targetZone];
            if (!zone || zone.systemId !== this.save.player.systemId)
                continue;
            // Trigger on the dock approach, not the body radius: for planets the
            // radius ring sits INSIDE the auto-dock zone, so a pilot flying in to
            // dock never crossed it and the warrant target never spawned.
            const approachRadius = zone.dockRadius ?? zone.radius;
            if (player.distanceTo(vec(zone.position)) > approachRadius + 190)
                continue;
            const rng = seededRandom(`${this.save.world.seed}:bounty:${mission.id}:${Math.floor(this.save.world.time / 60)}`);
            const offset = new THREE.Vector3(rng() - 0.5, (rng() - 0.5) * 0.45, rng() - 0.5).normalize().multiplyScalar(randomBetween(rng, 128, 218));
            const spawnPosition = player.clone().add(offset);
            this.clearSpawnPosition(spawnPosition, zone);
            // Warrants pin a pilot profile at offer time, so a named ace keeps
            // the same skill and temperament across every spawn of that warrant
            // (and across reloads): the player learns the name, not the roll.
            // Legacy saves without a pinned profile fall back to a name-seeded
            // roll so the callsign is still stable.
            const pinnedPilot = mission.pilot ?? (mission.targetName ? rollPilot(seededRandom(`${mission.targetName}:pilot`), this.spawnThreat(spawnPosition, mission.id), 'red-talons') : undefined);
            const target = this.spawnShip('bounty', tuple(spawnPosition), mission.id, mission.targetName, pinnedPilot);
            target.targetId = 'player';
            if (this.save.player.guildRank.bounty >= 1 || mission.reward > 6500) {
                const escort = this.spawnShip('escort', tuple(vec(target.position).add(new THREE.Vector3(12, 7, -14))));
                escort.targetId = 'player';
            }
            this.threatAcquireTarget();
            this.ui.pushEvent(t('Warrant target detected: {name}', { name: mission.targetName }), 'danger', 5600);
            this.audio.play('warning');
        }
    }
    updateDynamicEncounters() {
        // The combat simulator drives its own roster; ambient traffic stays out.
        if (this.arena)
            return;
        // A live race owns the zone: no pirate ambushes stack onto the parcours
        // (house rule — the run stays a test of flying, not of guns).
        if (this.activeRace)
            return;
        // A standoff pauses the beam clock: no second ambush while the player
        // is mid-deal. This runs before the nextEncounterAt gate and the
        // hostile lock (both return early during a mug) so the timer keeps
        // moving forward during the standoff — the moment the deal resolves,
        // the field doesn't instantly re-roll; the beam restarts from a short
        // grace instead.
        if (this.utilityActive && this.activeMug())
            this.beamAmbushNextAt = this.save.world.time + 4;
        // Keep the approach lanes populated: station traffic tops up before the
        // encounter timer (or the near-dock skip) decides anything.
        this.updateCapitalTraffic();
        this.updateStationTraffic();
        if (this.save.world.time < this.nextEncounterAt || this.ships.filter((entry) => entry.hull > 0).length > 16)
            return;
        // Jumps roll their own encounters; the ambient timer only applies to manual flight.
        if (this.autopilot)
            return;
        const player = vec(this.save.player.position);
        // Never stack a second pirate encounter on an active one (safe sectors require
        // this; it keeps every fight small everywhere).
        if (this.ships.some((ship) => ship.hostile && ship.hull > 0 && player.distanceTo(vec(ship.position)) < ENCOUNTER_LOCK_RADIUS)) {
            this.nextEncounterAt = this.save.world.time + 30;
            return;
        }
        if (this.currentDockLocationIds().some((id) => player.distanceTo(vec(LOCATIONS[id].position)) < (LOCATIONS[id].dockRadius ?? 50) + 40)) {
            this.nextEncounterAt = this.save.world.time + 18;
            return;
        }
        const zone = this.getWorldZone(player);
        const rng = seededRandom(`${this.save.world.seed}:encounter:${++this.encounterCounter}:${Math.floor(this.save.world.time)}`);
        const roll = rng();
        // Recently fought off an encounter? Let the lanes cool down before the next event.
        if (roll >= this.combatEncounterScale()) {
            this.nextEncounterAt = this.save.world.time + 26;
            return;
        }
        // Policing gradient: near a station or planet the local patrols own the
        // lanes and the pirate window shrinks toward nothing; far from
        // civilization the zone defaults stand.
        const police = this.policePresence(player);
        // Broadcast state drives both halves of the stealth trade: a lit ship
        // (transponder on, or the beam running) is a visible target for
        // opportunists and keeps the full pirate window; a dark idle ship is
        // nobody to ambush, so the pirate tail shrinks to a fraction.
        const broadcasting = this.playerBroadcasting();
        // The extraction beam broadcasts a working signature: while it actually
        // runs in the asteroid field, pirates on the fringes converge on the
        // work. A throttled seeded roll keeps a dark miner lit by their own
        // beam without stacking a second ambush on an active one. The timer
        // resets when the beam stops so the next session rolls fresh.
        if (!this.utilityActive)
            this.beamAmbushNextAt = 0;
        // A standoff pauses the beam clock: no second ambush while the player
        // is mid-deal, and the moment the deal resolves the field doesn't
        // instantly re-roll — the timer restarts from a short grace so the
        // standoff's own resolution never triggers a fresh window.
        if (this.utilityActive && this.activeMug())
            this.beamAmbushNextAt = this.save.world.time + 4;
        if (this.utilityActive && zone === 'asteroid-field' && police < OPPORTUNITY_MAX_POLICE && !this.activeMug() && this.save.world.time >= (this.beamAmbushNextAt ?? 0)) {
            this.beamAmbushNextAt = this.save.world.time + randomBetween(rng, BEAM_AMBUSH_MIN, BEAM_AMBUSH_MAX);
            if (rng() < BEAM_AMBUSH_CHANCE) {
                const count = randomInt(rng, 1, 2);
                const escorts = [];
                let lead;
                for (let i = 0; i < count; i += 1) {
                    const pirate = this.spawnShip(i === 0 ? 'pirate' : 'escort', this.encounterPosition(rng, 158 + i * 27));
                    pirate.targetId = 'player';
                    if (i === 0)
                        lead = pirate;
                    else
                        escorts.push(pirate);
                }
                const demand = lead ? this.mugDemand(this.mugShare(lead.pilot?.temperament)) : undefined;
                if (lead && demand) {
                    this.beginMug(lead, escorts, demand, {
                        lines: OPPORTUNITY_DEMAND_LINES,
                        sensor: t('Pirates closing — your beam is broadcasting your position.'),
                        event: t('Standoff: the beam drew a crowd.'),
                    });
                }
                else {
                    for (const ship of [lead, ...escorts])
                        if (ship) {
                            ship.standingDown = true;
                            ship.hostile = false;
                            ship.targetId = undefined;
                        }
                    if (lead)
                        this.sayPilotLine(lead, t('Nothing worth the wait. Fly on, spacer.'));
                    this.ui.pushSensor(t('Pirates closing — then breaking off: the beam lit the field but the hold is empty.'), 'info', 4800);
                }
                this.threatAcquireTarget();
                this.audio.play('warning');
                this.nextEncounterAt = this.save.world.time + randomBetween(rng, 24, 44);
                return;
            }
        }
        // Opportunists: a spacer who saw the player at work (beaming ore,
        // stripping a wreck, or hauling a rich hold) occasionally decides the
        // haul is worth taking — but only where the patrols are not watching.
        const recentlyWorking = this.save.world.time - (this.lastExtractionAt ?? Number.NEGATIVE_INFINITY) < OPPORTUNITY_RECENT_SECONDS;
        const haulWorth = this.holdWorth();
        const opportunity = (recentlyWorking ? 1 : 0) + (haulWorth >= OPPORTUNITY_HOLD_WORTH ? 1 : 0);
        if (broadcasting && opportunity > 0 && police < OPPORTUNITY_MAX_POLICE && rng() < OPPORTUNITY_CHANCE * (opportunity / 2) * (1 - police)) {
            const count = randomInt(rng, 1, 2);
            const escorts = [];
            let lead;
            for (let i = 0; i < count; i += 1) {
                const pirate = this.spawnShip(i === 0 ? 'pirate' : 'escort', this.encounterPosition(rng, 158 + i * 27));
                pirate.targetId = 'player';
                if (i === 0)
                    lead = pirate;
                else
                    escorts.push(pirate);
            }
            const demand = lead ? this.mugDemand(this.mugShare(lead.pilot?.temperament)) : undefined;
            if (lead && demand) {
                this.beginMug(lead, escorts, demand, {
                    lines: OPPORTUNITY_DEMAND_LINES,
                    sensor: t('Pirates closing — they saw your haul and are hailing you.'),
                    event: t('Standoff: an opportunist wants your haul.'),
                });
            }
            else {
                // They watched the work but there is nothing worth taking: break off.
                for (const ship of [lead, ...escorts])
                    if (ship) {
                        ship.standingDown = true;
                        ship.hostile = false;
                        ship.targetId = undefined;
                    }
                if (lead)
                    this.sayPilotLine(lead, t('Nothing worth the wait. Fly on, spacer.'));
                this.ui.pushSensor(t('Pirates closing — then breaking off: nothing worth the risk.'), 'info', 4800);
            }
            this.threatAcquireTarget();
            this.audio.play('warning');
            this.nextEncounterAt = this.save.world.time + randomBetween(rng, 24, 44);
            return;
        }
        const bucket = rng();
        // Selling gold is loud: while the sale is fresh (world.goldHeatUntil),
        // the syndicate has the miner's scent and pirates converge on the
        // Shardbelt lanes — the intercept window roughly doubles and the miner,
        // trader, and patrol windows shrink to make room.
        const goldHeat = zone === 'asteroid-field' && this.save.world.goldHeatUntil > this.save.world.time;
        const minerCutoff = zone === 'asteroid-field' ? (goldHeat ? GOLD_HEAT_MINER_CUTOFF : 0.42) : zone === 'graveyard' ? 0.28 : 0.22;
        const traderCutoff = zone === 'graveyard' ? 0.72 : zone === 'asteroid-field' ? (goldHeat ? GOLD_HEAT_TRADER_CUTOFF : 0.68) : 0.5;
        const patrolCutoff = zone === 'asteroid-field' ? (goldHeat ? GOLD_HEAT_PATROL_CUTOFF : ASTEROID_PATROL_CUTOFF) : 0.78;
        // Near civilization the patrol window widens, shrinking the pirate tail;
        // a dark pilot shrinks it further (nobody sees them to ambush). The gap
        // between the pirate cutoff and 1 becomes a quiet lane: nothing spawns.
        const patrolCutoffAdjusted = patrolCutoff + police * (1 - patrolCutoff) * 0.9;
        const pirateCutoff = patrolCutoffAdjusted + (1 - patrolCutoffAdjusted) * (broadcasting ? 1 : DARK_ENCOUNTER_MULT);
        if (bucket < minerCutoff) {
            const miner = this.spawnShip('miner', this.encounterPosition(rng, 180));
            const zone = LOCATIONS[this.currentActivityLocationIds()[0] ?? 'shardbelt'];
            miner.destination = tuple(vec(zone.position).add(new THREE.Vector3(randomBetween(rng, -70, 70), randomBetween(rng, -35, 35), randomBetween(rng, -70, 70))));
        }
        else if (bucket < traderCutoff) {
            const trader = this.spawnShip('trader', this.encounterPosition(rng, 225));
            if (rng() < 0.55) {
                const pirate = this.spawnShip('pirate', this.encounterPosition(rng, 188));
                pirate.targetId = trader.id;
                this.ui.pushSensor(t('Distress traffic: pirates attacking a civilian vessel.'), 'danger', 5200);
                this.audio.play('warning');
            }
            else {
                // The trader is on the radar; no ticker line needed.
            }
        }
        else if (bucket < patrolCutoffAdjusted) {
            this.spawnShip('patrol', this.encounterPosition(rng, 218));
        }
        else if (bucket < pirateCutoff) {
            const count = randomInt(rng, 1, zone === 'graveyard' ? 3 : 2);
            const escorts = [];
            let lead;
            for (let i = 0; i < count; i += 1) {
                const pirate = this.spawnShip(i === 0 ? 'pirate' : 'escort', this.encounterPosition(rng, 158 + i * 27));
                pirate.targetId = 'player';
                if (i === 0)
                    lead = pirate;
                else
                    escorts.push(pirate);
            }
            if (goldHeat && lead) {
                // Gold-heat keeps its syndicate flavor: a demand for every gram
                // of gold aboard, with the board-tip lines and messages.
                this.beginMug(lead, escorts, { kind: 'cargo', commodity: 'gold', quantity: Math.max(1, this.save.player.cargo.gold ?? 0) }, {
                    lines: GOLD_DEMAND_LINES,
                    sensor: t('Gold-hunters inbound — they are hailing you.'),
                    event: t('Standoff: jettison gold from the hold before they fire.'),
                });
            }
            else if (lead && rng() < MUG_CHANCE) {
                this.openMug(lead, escorts);
            }
            else {
                this.ui.pushSensor(t('Pirate intercept. Weapons free.'), 'danger', 4800);
            }
            this.audio.play('warning');
        }
        else {
            // Quiet lane: a dark ship nobody noticed, or simply an empty stretch.
            this.nextEncounterAt = this.save.world.time + randomBetween(rng, 24, 44);
            return;
        }
        this.threatAcquireTarget();
        this.nextEncounterAt = this.save.world.time + randomBetween(rng, 24, 44);
    }
    // 0..1 how much "civilization" is nearby: 1 at a dock, fading to 0 once
    // the player is POLICE_RADIUS past the station's own clearance. Drives the
    // encounter table so patrols own the lanes near stations and planets while
    // open space stays pirate country.
    policePresence(position) {
        let nearest = Infinity;
        for (const id of this.currentDockLocationIds()) {
            const location = LOCATIONS[id];
            const distance = position.distanceTo(vec(location.position)) - (location.dockRadius ?? location.radius ?? 0);
            if (distance < nearest)
                nearest = distance;
        }
        return clamp(1 - nearest / POLICE_RADIUS, 0, 1);
    }
    // The market value of everything in the hold: loose cargo plus sealed
    // contract goods. The number opportunist pirates "smell" before deciding
    // the player is worth the fuel.
    holdWorth() {
        const cargo = this.save.player.cargo ?? {};
        let value = 0;
        for (const [id, qty] of Object.entries(cargo))
            if (qty > 0)
                value += (COMMODITIES[id]?.basePrice ?? 0) * qty;
        // Sealed contract goods store a label, not a commodity id — value them
        // at a flat "valuable sealed load" rate so a timed transport of a few
        // units reads as worth an opportunist's fuel.
        for (const item of this.save.player.sealedCargo ?? [])
            value += item.units * 90;
        return value;
    }
    capitalApproachPosition(location, capitalClass, flankSign = 1) {
        const center = vec(location.position);
        const player = vec(this.save.player.position);
        const outward = player.clone().sub(center);
        if (outward.lengthSq() < 0.01)
            outward.set(0, 0, 1);
        else
            outward.normalize();
        const tangent = new THREE.Vector3().crossVectors(UP, outward);
        if (tangent.lengthSq() < 0.01)
            tangent.copy(RIGHT);
        else
            tangent.normalize();
        const battleship = capitalClass === 'battleship';
        return tuple(player.clone()
            .addScaledVector(outward, battleship ? 850 : 280)
            .addScaledVector(tangent, flankSign * (battleship ? 850 : 520))
            .addScaledVector(UP, battleship ? 250 : 120));
    }
    // Capital ships are authored landmarks with strict jurisdiction. The
    // battleship can only exist on Meridian Prime's orbital cordon; frigates
    // also work that cordon and Rookhaven's Helios patrol lane.
    updateCapitalTraffic(force = false) {
        if (this.arena || (!force && this.save.world.time < this.nextCapitalTrafficCheckAt))
            return;
        this.nextCapitalTrafficCheckAt = this.save.world.time + CAPITAL_TRAFFIC_CHECK_SECONDS;
        const player = vec(this.save.player.position);
        const ensure = (variant, capitalClass, homeId, name, flankSign) => {
            const key = `${this.save.player.systemId}:${homeId}:${capitalClass}`;
            if (this.capitalSpawnedHomes.has(key) || this.ships.some((ship) => ship.hull > 0 && ship.capitalHome === homeId && ship.capitalClass === capitalClass))
                return;
            this.capitalSpawnedHomes.add(key);
            const location = LOCATIONS[homeId];
            this.spawnCapitalShip(variant, this.capitalApproachPosition(location, capitalClass, flankSign), homeId, name);
        };
        if (this.save.player.systemId === 'meridian') {
            const home = LOCATIONS['meridian-prime'];
            const clearance = home.dockRadius ?? home.radius;
            if (player.distanceTo(vec(home.position)) <= clearance + CAPITAL_HOMEWORLD_RANGE) {
                ensure('concord-battleship', 'battleship', home.id, 'CNS Vigilance', 1);
                ensure('concord-frigate', 'frigate', home.id, 'CPV Resolute', -1);
            }
        }
        else if (this.save.player.systemId === 'helios-verge') {
            const home = LOCATIONS.rook;
            const clearance = home.dockRadius ?? home.radius;
            if (player.distanceTo(vec(home.position)) <= clearance + CAPITAL_ROOK_RANGE)
                ensure('concord-frigate', 'frigate', home.id, 'CPV Wayguard', 1);
        }
    }
    // Approach-lane traffic: when the player is near a dock or planet, top up a
    // small rotating cast of civilian ships working the lane (mostly traders,
    // patrols at the fort, miners at the mining world). The travel AI already
    // re-routes them by role once they arrive, so the lanes stay in motion
    // without any per-ship scripting. Ships are tagged so each station keeps
    // its own budget, and they despawn naturally when the player leaves.
    updateStationTraffic() {
        const player = vec(this.save.player.position);
        for (const id of this.currentDockLocationIds()) {
            const location = LOCATIONS[id];
            const clearance = location.dockRadius ?? location.radius ?? 0;
            // "Near" means within STATION_TRAFFIC_RANGE of the dock's approach
            // sphere (not the planet centre), so the lanes fill around planets
            // too, not just the small stations.
            if (player.distanceTo(vec(location.position)) - clearance > STATION_TRAFFIC_RANGE)
                continue;
            const existing = this.ships.filter((ship) => ship.hull > 0 && ship.stationTraffic === id).length;
            if (existing >= STATION_TRAFFIC_TARGET)
                continue;
            const rng = seededRandom(`${this.save.world.seed}:station-traffic:${id}:${++this.stationTrafficCounter}`);
            const role = id === 'rook' ? (rng() < 0.5 ? 'patrol' : 'trader')
                : id === 'vesper' ? (rng() < 0.5 ? 'miner' : 'trader')
                : rng() < 0.72 ? 'trader' : 'patrol';
            const direction = new THREE.Vector3(rng() - 0.5, (rng() - 0.5) * 0.5, rng() - 0.5).normalize();
            const ship = this.spawnShip(role, tuple(vec(location.position).clone().addScaledVector(direction, clearance + randomBetween(rng, 60, 260))));
            ship.stationTraffic = id;
            // A patrol posted here beats a lane around its own port, not Rook —
            // that is where the smugglers actually are (see updatePatrolArrest).
            if (role === 'patrol')
                rebasePatrolTask(ship, this, id);
            // A trader away from the bastion sometimes runs dark with a
            // restricted hold: a smuggle task keeps them off Rook's lanes and a
            // patrol that resolves them flags them (see shipAI.js).
            else if (role === 'trader' && id !== 'rook' && rng() < SMUGGLE_CHANCE) {
                ship.smuggling = true;
                ship.dark = true;
                ship.task = createSmuggleTask(ship, this, id);
            }
            else if (role === 'trader') {
                // Tag the home port so the trade task picks a market-aware next
                // leg (see shipAI.js nextTradeLeg) instead of the player's dock.
                ship.task.origin = id;
            }
            // Point the lane ship at the station itself so it visibly works the
            // approach; the task layer re-routes it once it arrives.
            ship.destination = tuple(vec(location.position).add(new THREE.Vector3(randomBetween(rng, -50, 50), randomBetween(rng, -25, 25), randomBetween(rng, -50, 50))));
        }
    }
    encounterPosition(rng, distance) {
        const player = vec(this.save.player.position);
        const orientation = quat(this.save.player.rotation);
        const forward = FORWARD.clone().applyQuaternion(orientation);
        const right = RIGHT.clone().applyQuaternion(orientation);
        const offset = forward.multiplyScalar(-distance * randomBetween(rng, 0.3, 1)).addScaledVector(right, randomBetween(rng, -distance, distance));
        offset.y += randomBetween(rng, -35, 35);
        if (offset.length() < distance * 0.75)
            offset.normalize().multiplyScalar(distance);
        const position = player.clone().add(offset);
        // Keep spawns clear of the huge planetary bodies and their landing zones.
        for (const id of this.currentDockLocationIds())
            this.clearSpawnPosition(position, LOCATIONS[id]);
        return tuple(position);
    }
    clearSpawnPosition(position, location) {
        const clearance = spawnClearance(location);
        const center = vec(location.position);
        const offset = position.clone().sub(center);
        const distance = offset.length();
        if (distance >= clearance)
            return position;
        if (distance < 0.001)
            offset.set(1, 0, 0);
        offset.normalize().multiplyScalar(clearance);
        return position.copy(center).add(offset);
    }
    spawnInitialTraffic() {
        const systemId = this.save.player.systemId;
        const rng = seededRandom(`${this.save.world.seed}:initial-traffic:${systemId}:${Math.floor(this.save.world.time / 60)}`);
        const docks = this.currentDockLocationIds();
        const activities = this.currentActivityLocationIds();
        const savedDock = this.save.player.dockedAt ?? this.save.player.lastDockedAt;
        const dockId = LOCATIONS[savedDock]?.systemId === systemId ? savedDock : docks[0];
        const around = (location) => {
            const direction = new THREE.Vector3(rng() - 0.5, (rng() - 0.5) * 0.5, rng() - 0.5).normalize();
            return tuple(vec(location.position).clone().addScaledVector(direction, spawnClearance(location) + randomBetween(rng, 60, 260)));
        };
        if (dockId) {
            const trader = this.spawnShip('trader', around(LOCATIONS[dockId]));
            trader.destination = LOCATIONS[docks.find((id) => id !== dockId) ?? dockId].position;
            const patrolHome = docks.find((id) => LOCATIONS[id].faction === 'concord') ?? dockId;
            const patrol = this.spawnShip('patrol', around(LOCATIONS[patrolHome]));
            patrol.destination = LOCATIONS[dockId].position;
            rebasePatrolTask(patrol, this, patrolHome);
        }
        if (activities.length) {
            const zone = LOCATIONS[activities[0]];
            const miner = this.spawnShip('miner', around(zone));
            miner.destination = zone.position;
        }
    }
    // How dangerous the surrounding fight is, 0..1. Feeds the pilot tier roll:
    // contract danger dominates (a fat warrant draws an ace), then the zone.
    spawnThreat(position, missionId) {
        if (missionId) {
            const mission = this.save.activeMissions.find((entry) => entry.id === missionId);
            if (mission?.kind === 'bounty') {
                const danger = mission.danger ?? 1.5;
                return clamp(0.35 + danger * 0.3, 0.2, 1);
            }
        }
        const zone = this.getWorldZone(position);
        if (zone === 'asteroid-field' || zone === 'graveyard')
            return 0.6;
        if (zone === 'near-location')
            return 0.35;
        return 0.45;
    }
    spawnShip(role, position, missionId, nameOverride, pilotOverride) {
        const index = ++this.entityCounter;
        const rng = seededRandom(`${this.save.world.seed}:ship:${index}:${Math.floor(this.save.world.time)}`);
        const faction = role === 'pirate' || role === 'bounty' || role === 'escort' ? 'red-talons' : role === 'patrol' ? 'concord' : role === 'miner' ? 'frontier-miners' : 'free-merchants';
        const hostile = faction === 'red-talons';
        // Every ship rolls a pilot at spawn (seeded, deterministic). The profile
        // is transient per-ship state — no save-schema change.
        const pilot = rollPilot(rng, this.spawnThreat(position, missionId), faction, pilotOverride);
        // Per-ship RNG for in-flight rolls (jinks, spirals, flee checks, shot
        // jitter): seeded like everything else so headless probes are exact.
        const aiRng = seededRandom(`${this.save.world.seed}:ai:${index}:${Math.floor(this.save.world.time)}`);
        // A separate seeded stream for the proximity mutter, so the ambient
        // line never perturbs the combat roll stream (headless probes stay
        // exact on the calibrated scenarios).
        const proxRng = seededRandom(`${this.save.world.seed}:prox:${index}:${Math.floor(this.save.world.time)}`);
        const maxShield = role === 'bounty' ? 105 : role === 'trader' ? 82 : role === 'patrol' ? 75 : role === 'miner' ? 50 : 58;
        const structuralArmor = role === 'bounty' ? 105 : role === 'trader' ? 110 : role === 'patrol' ? 72 : role === 'miner' ? 76 : 62;
        const pressureHull = role === 'bounty' ? 120 : role === 'trader' ? 145 : role === 'patrol' ? 90 : role === 'miner' ? 95 : 75;
        const maxHull = structuralArmor + pressureHull;
        const direction = new THREE.Vector3(rng() - 0.5, (rng() - 0.5) * 0.4, rng() - 0.5).normalize();
        const rotation = new THREE.Quaternion().setFromUnitVectors(FORWARD, direction);
        const shipName = nameOverride ?? (hostile ? proceduralCallsign(rng) : `${role === 'trader' ? 'MV' : role === 'patrol' ? 'CPV' : role === 'miner' ? 'Prospector' : 'Escort'} ${randomInt(rng, 12, 997)}`);
        // A pilot who surrendered to the player before remembers: when the same
        // callsign spawns again (outside an active warrant), it defers instead
        // of re-engaging — non-hostile, no combat target, and a one-shot line
        // when the player gets close (see maybeRecognitionLine). The memory
        // lives in the save (world.surrenderedTo) so it survives instance
        // resets and reloads.
        const prior = (this.save.world.surrenderedTo ?? {})[shipName];
        const recognizesPlayer = hostile && !missionId && prior !== undefined;
        // A pilot who fled after surrendering came back wary, not deferential:
        // hostile again, but they cut and run earlier than usual (see damageShip).
        const waryOfPlayer = recognizesPlayer && prior === 'fled';
        const isHostile = hostile && !(recognizesPlayer && !waryOfPlayer);
        const hullFlight = HULL_FLIGHT_STATS[shipVariantForRole(role)] ?? HULL_FLIGHT_STATS.talon;
        const ship = {
            id: `ship-${index}`,
            name: shipName,
            role,
            faction,
            position: [...position],
            velocity: tuple(direction.multiplyScalar(randomBetween(rng, 4, 12))),
            rotation: quatTuple(rotation),
            shield: maxShield,
            maxShield,
            hull: maxHull,
            maxHull,
            speed: hullFlight.speed,
            afterburnSpeed: hullFlight.afterburnSpeed,
            turnRate: hullFlight.turnRate,
            gunDamage: role === 'bounty' ? 10 : role === 'pirate' ? 7.5 : role === 'escort' ? 6.5 : role === 'patrol' ? 7 : 4,
            hostile: isHostile,
            // Transponder state: pirates and their escorts run dark (invisible
            // beyond the dark-detection line) — that's why they can surprise the
            // pilot from behind a rock. Warrants stay lit: a burned callsign can't
            // hide, which is exactly how the authorities found them. Civilians
            // and patrols squawk normally. The combat simulator keeps everyone
            // lit: the arena is about fighting, not sneaking.
            dark: !this.arena && (role === 'pirate' || role === 'escort'),
            bountyValue: role === 'bounty' ? 900 : role === 'pirate' || role === 'escort' ? randomInt(rng, 170, 420) : 0,
            // Hunters (pirates and their escorts) can roll an emergent mug when
            // they close on the player mid-lane (see shipAI.js). Patrols and
            // bounty hunters never shake anyone down.
            mugCapable: isHostile && (role === 'pirate' || role === 'escort'),
            nextMugAt: 0,
            smuggling: false,
            fireCooldown: randomBetween(rng, 0.2, 0.8),
            missileCooldown: randomBetween(rng, 1, 3),
            shieldDelay: 0,
            evasiveUntil: 0,
            fleeing: false,
            jinkUntil: 0,
            jinkSign: 1,
            jinkStrength: 0.45,
            covering: false,
            coverPoint: undefined,
            coverHoldSince: 0,
            spawnTime: this.save.world.time,
            lifetime: 0,
            missionId,
            attackPhase: 'approach',
            // Pass/reset range come from the pilot's temperament (timid keeps
            // distance, aggressive presses in) on top of the per-ship variance.
            passRange: (48 + rng() * 20) * pilot.passRangeMul,
            resetRange: (170 + rng() * 50) * pilot.resetRangeMul,
            passPhase: rng() * Math.PI * 2,
            pilot,
            aiRng,
            proxRng,
            recognizesPlayer,
            waryOfPlayer,
            scanned: false,
            surrendered: false,
            claimed: false,
            captured: false,
            poweredDown: false,
            saidRecognition: false,
            // Whether the pilot has already rolled (and possibly given) the
            // first-scan favor — one roll per ship, so re-scanning can't farm it.
            favorGiven: false,
            // Player-inflicted damage on a non-hostile ship, for the
            // accidental-fire escalation in damageShip.
            playerDamageTaken: 0,
            // Comms cadence: the first line lands a few seconds into a fight,
            // then every ~12-24s while engaged. The initial delay comes off the
            // spawn rng so it never perturbs the in-flight aiRng roll stream.
            nextLineAt: this.save.world.time + 2 + rng() * 5,
            // Search AI transient state: the active search (see updateSearchAI),
            // the give-up cooldown that gates fresh triggers, the catch cooldown
            // that spaces re-dings, whether the ship had the player resolved
            // last frame (the vanished-signal trigger), and the travel-AI hold
            // flag that keeps a searching ship on its sweep point instead of
            // re-rolling a route.
            search: undefined,
            searchCooldownUntil: 0,
            catchCooldownUntil: 0,
            resolvedPlayerLast: false,
            searchHold: false,
        };
        // Task layer: what this ship wants (trade, patrol, mine, salvage, hunt).
        // The dead aiState field this replaces was never read — the hierarchy
        // in shipAI.js drives the dispatch now. Tasks are transient per-ship
        // state (ships are never persisted) and every roll rides the ship's own
        // route stream, so headless probes stay deterministic.
        ship.task = createTask(ship, this);
        // A civilian freighter flies with a real hold: it ejects on death and
        // softens the destination market when its trade task delivers (see
        // shipAI.rollNpcCargo / economy.deliverCargo).
        if (role === 'trader' || role === 'miner')
            ship.cargo = rollNpcCargo(ship, this);
        this.ships.push(ship);
        return ship;
    }
    spawnCapitalShip(variant, position, homeId, name) {
        const capitalClass = variant === 'concord-battleship' ? 'battleship' : 'frigate';
        const battleship = capitalClass === 'battleship';
        const ship = this.spawnShip('patrol', position, undefined, name, { tier: 'ace', temperament: 'steady' });
        const flight = HULL_FLIGHT_STATS[variant];
        ship.variant = variant;
        ship.capitalClass = capitalClass;
        ship.capitalHome = homeId;
        ship.speed = flight.speed;
        ship.afterburnSpeed = 0;
        ship.turnRate = flight.turnRate;
        ship.velocity[0] = 0;
        ship.velocity[1] = 0;
        ship.velocity[2] = 0;
        ship.maxShield = battleship ? 12000 : 1400;
        ship.shield = ship.maxShield;
        ship.maxHull = battleship ? 24000 : 2600;
        ship.hull = ship.maxHull;
        ship.shieldRegen = battleship ? 24 : 8;
        ship.gunDamage = battleship ? 24 : 12;
        ship.fireInterval = battleship ? 1.05 : 0.62;
        ship.fireRange = battleship ? 1350 : 420;
        ship.muzzleOffset = battleship ? 545 : 54;
        ship.projectileLife = battleship ? 10 : 4;
        ship.projectileVisualScale = battleship ? 4 : 2;
        ship.passRange = battleship ? 1050 : 180;
        ship.resetRange = battleship ? 1900 : 600;
        ship.patrolAnchor = [...position];
        ship.patrolRadiusMin = battleship ? 450 : 260;
        ship.patrolRadiusMax = battleship ? 850 : 520;
        ship.patrolVertical = battleship ? 160 : 90;
        ship.noSurrender = true;
        ship.dark = false;
        ship.bountyValue = 0;
        ship.mugCapable = false;
        ship.fireCooldown = battleship ? 0.8 : 0.35;
        rebasePatrolTask(ship, this, homeId);
        // Begin the lazy fetch as soon as the landmark is authorized. The
        // correctly scaled voxel silhouette covers only the short load window.
        this.renderer.ensureGlbShipModel?.(variant);
        return ship;
    }
    alertPatrols(position) {
        for (const patrol of this.ships.filter((entry) => entry.role === 'patrol' && entry.hull > 0)) {
            // A patrol only turns hostile if it actually saw the incident: close
            // enough and with a clear line of sight to the ship that was hit.
            const witnessRange = patrol.capitalClass === 'battleship' ? 1400 : patrol.capitalClass === 'frigate' ? 650 : 320;
            if (vec(patrol.position).distanceTo(vec(position)) < witnessRange && this.canSee(patrol.position, position, false)) {
                patrol.hostile = true;
                patrol.targetId = 'player';
            }
        }
    }
    updateDiscovery() {
        if (this.arena)
            return;
        const player = vec(this.save.player.position);
        for (const id of this.currentNavLocationIds()) {
            const location = LOCATIONS[id];
            const discoveryRadius = location.radius + (location.kind === 'planet' ? 160 : 120);
            if (player.distanceTo(vec(location.position)) <= discoveryRadius && !this.save.player.discovered.includes(id)) {
                this.save.player.discovered.push(id);
                this.ui.pushSensor(t('NAV DISCOVERY: {name}', { name: location.name }), 'success', 4600);
                this.audio.play('success');
            }
        }
    }
    cleanupEntities() {
        for (let index = this.projectiles.length - 1; index >= 0; index -= 1) {
            if (this.projectiles[index].life <= 0) {
                this.projStore.free(this.projectiles[index].slot);
                this.projectiles.splice(index, 1);
            }
        }
        for (let index = this.pickups.length - 1; index >= 0; index -= 1) {
            if (this.pickups[index].life <= 0) {
                this.pickupStore.free(this.pickups[index].slot);
                this.pickups.splice(index, 1);
            }
        }
        for (let index = this.ships.length - 1; index >= 0; index -= 1) {
            if (this.ships[index].hull < 0 || (this.ships[index].hull === 0 && this.ships[index].lifetime > 1.3))
                this.ships.splice(index, 1);
        }
    }
    getWorldZone(position = this.save.player.position) {
        // Accept both tuple arrays (ship spawns pass encounterPosition tuples)
        // and THREE.Vector3 (player paths) so spawnThreat never crashes on a
        // bare array when a jump/encounter spawns inside a field.
        const p = Array.isArray(position) ? vec(position) : position;
        const active = LOCATIONS[this.activeInstanceId];
        if ((active?.kind === 'field' || active?.kind === 'rings') && p.distanceTo(vec(active.position)) < active.radius)
            return 'asteroid-field';
        if (active?.kind === 'graveyard' && p.distanceTo(vec(active.position)) < active.radius)
            return 'graveyard';
        const dockLocation = this.currentDockLocationIds().find((id) => id === this.activeInstanceId);
        if (dockLocation && p.distanceTo(vec(LOCATIONS[dockLocation].position)) < (LOCATIONS[dockLocation].dockRadius ?? 60) + 50)
            return 'near-location';
        return 'open';
    }
    hostilesNear(position, radius) {
        return this.ships.some((ship) => ship.hostile && ship.hull > 0 && position.distanceTo(vec(ship.position)) < radius);
    }
    // Hostiles the player can actually resolve near a position: lit ships at the
    // sensor horizon, dark ones only inside the dark-detection line. The
    // hyperdrive block and the autopilot break both ride this, so an unseen
    // dark pirate can't pin a dark pilot in place — they only stop you when
    // you can see them.
    hostilesVisibleNear(position, radius) {
        return this.ships.some((ship) => ship.hostile && ship.hull > 0 && position.distanceTo(vec(ship.position)) < radius && this.playerSeesShip(ship, 1));
    }
    // The player's ship is visible to sensors when the transponder is ON or the
    // extraction beam is running — the work broadcasts its own signature, so a
    // dark miner/salvager is lit up the whole time the beam is active.
    playerBroadcasting() {
        return Boolean(this.save.player.transponder !== false || this.utilityActive);
    }
    // The player's own visibility as a fraction of the radar horizon, for the
    // radar's inner ring: full range while broadcasting, and the speed-scaled
    // dark band otherwise — the ring visibly shrinks as the pilot goes dark
    // and slows, and swells back toward 400 km at full throttle.
    playerVisibilityFraction() {
        const stats = this.playerStats();
        if (this.playerBroadcasting())
            return 1;
        const visible = this.darkVisibilityRange(vec(this.save.player.velocity).length(), stats.maxSpeed);
        return clamp(visible / stats.radarRange, 0.05, 1);
    }
    // How far a dark (transponder-off) ship's signature carries at a given
    // speed: DARK_VIS_MIN at half max speed or slower, scaling up to
    // DARK_VIS_MAX at full throttle. Above max it clamps at the ceiling.
    darkVisibilityRange(speed, maxSpeed) {
        const frac = maxSpeed > 0 ? clamp(speed / maxSpeed, 0, 1) : 0;
        if (frac <= DARK_SPEED_FLOOR)
            return DARK_VIS_MIN;
        const t = clamp((frac - DARK_SPEED_FLOOR) / (1 - DARK_SPEED_FLOOR), 0, 1);
        return DARK_VIS_MIN + (DARK_VIS_MAX - DARK_VIS_MIN) * t;
    }
    // Can an observer's sensors resolve a target? A broadcasting target is
    // visible at the observer's standard sensor range (NPC_SENSOR_RANGE for
    // NPCs); a dark one only inside its speed-scaled dark band (the target's
    // speed and max speed decide how far its dark signature carries). Rocks and
    // wreckage block the line of sight either way. Positions may arrive as
    // tuples or THREE.Vector3 (patrol targeting passes ship tuples, chatter
    // passes scratch vectors), so both are normalized here.
    canSee(observerPosition, targetPosition, targetDark, targetSpeed = 0, targetMaxSpeed = 1) {
        // Radar scratch: safe in the sim path because HUD runs after.
        const observer = Array.isArray(observerPosition) ? vec(observerPosition, this.tmpRadarPlayer) : observerPosition;
        const target = Array.isArray(targetPosition) ? vec(targetPosition, this.tmpRadarPos) : targetPosition;
        const distance = observer.distanceTo(target);
        const range = targetDark ? this.darkVisibilityRange(targetSpeed, targetMaxSpeed) : NPC_SENSOR_RANGE;
        if (distance > range)
            return false;
        return !this.lineBlocked(observer, target);
    }
    // Speed + max speed for the player's own dark signature, for canSee gates.
    playerSensorArgs() {
        const v = this.save.player.velocity;
        return [Math.hypot(v[0], v[1], v[2]), this.playerStats().maxSpeed];
    }
    // How far a locked ship stays tracked: its own sensor ceiling (the radar
    // disc's 1.45x horizon for lit ships) or the visual-lock range for dark
    // ones. A lock never outlives what the dish can actually draw, and the
    // visual-lock floor (1000 km) is what keeps a dark target readable past
    // its speed band. Shared by the radar, the nav map, the target monitor
    // and the per-frame lock keeper so every view agrees on where a lock dies.
    lockTrackedRange(ship) {
        if (ship.dark)
            return VISUAL_LOCK_RANGE;
        return Math.max(this.playerStats().radarRange * 1.45, VISUAL_LOCK_RANGE);
    }
    // The player's sensor resolves a ship. Dark contacts exist inside their
    // speed-scaled dark band; lit contacts are resolved at the sensor horizon,
    // optionally boosted by a threat-awareness multiplier for hostile locks. A
    // locked ship is a visual lock instead: tracked to lockTrackedRange no
    // matter how dark it runs, and occlusion only breaks it after
    // occlusion never breaks a lock — only range does.
    playerSeesShip(ship, threatMult = 1) {
        const player = vec(this.save.player.position, this.tmpRadarPlayer);
        const locked = ship.id === this.save.player.currentTargetId;
        const shipPos = this.tmpRadarPos.set(ship.position[0], ship.position[1], ship.position[2]);
        const distance = player.distanceTo(shipPos);
        const range = locked ? this.lockTrackedRange(ship) : (ship.dark
            ? this.darkVisibilityRange(Math.hypot(ship.velocity[0], ship.velocity[1], ship.velocity[2]), ship.speed)
            : this.playerStats().radarRange * threatMult);
        if (distance > range)
            return false;
        // You must SEE a ship to acquire it, but a lock is the pilot's own eye:
        // once locked, occlusion never breaks it — only range does.
        if (locked)
            return true;
        return !this.lineBlocked(player, shipPos);
    }
    // Returns cached effective ship stats. Equipment and shipId only change
    // at dock, so the cache is valid for the entire flight. Replaces ~10
    // getEffectiveShipStats() calls per frame that each allocated a new
    // 15-key object. Call _invalidateStats() on equipment/ship changes.
    playerStats() {
        if (this._statsDirty || !this._cachedStats) {
            this._cachedStats = getEffectiveShipStats(this.save.player);
            this._statsDirty = false;
        }
        return this._cachedStats;
    }
    flightLoadScale() {
        const player = this.save.player;
        const capacity = cargoCapacity(player);
        if (capacity <= 0)
            return 1;
        return 1 - 0.10 * clamp(cargoMass(player) / capacity, 0, 1);
    }
    combatCalmFactor() {
        // Ramp from 0 right after a fight back to 1 over COMBAT_CALM_SECONDS.
        return clamp((this.save.world.time - this.lastCombatAt) / COMBAT_CALM_SECONDS, 0, 1);
    }
    combatEncounterScale() {
        return 0.3 + 0.7 * this.combatCalmFactor();
    }
    autoDockCheck() {
        if (this.save.player.dockedAt || this.deathTimer > 0)
            return;
        const candidate = this.dockCandidate();
        if (!candidate)
            return;
        // Entering a landing zone is not consent to land. The pilot must have
        // this exact location locked; a permanent nav vector or another active
        // target never counts as landing clearance.
        if (this.save.player.currentTargetId !== candidate)
            return;
        // A dark ship lands like anyone else — the syndicate collects its fee
        // as a starting card on the concourse (pay or launch back out), so the
        // approach itself is never blocked.
        const speed = vec(this.save.player.velocity).length();
        if (speed > AUTO_DOCK_SPEED)
            return;
        if (this.hostilesNear(vec(this.save.player.position), DOCK_SAFE_RADIUS))
            return;
        this.dockAt(candidate);
    }
    // An unlicensed arrival: the station lets the dark ship land, then the
    // concourse opens on a payment card — the pilot either pays the berth fee
    // or launches back into space. The pending fee is recorded at landing (see
    // dockAt) and collected by paySyndicateBerth, so the approach is never
    // blocked and the fee can't be dodged by docking.
    beginDarkArrival(locationId) {
        this.save.world.syndicatePending = {
            locationId,
            fee: this.syndicateFee(),
            at: this.save.world.time,
        };
    }
    // The concourse card's PAY button: collect the pending berth fee (flat fee
    // plus the cargo cut), bank it into the dock's underworld ledger, and stamp
    // the visit receipt. Refuses when the pilot can't cover the fee — the only
    // way out then is launching back into space.
    paySyndicateBerth() {
        const pending = this.save.world.syndicatePending;
        if (!pending || pending.locationId !== this.save.player.dockedAt)
            return false;
        const fee = pending.fee;
        if (this.save.player.credits < fee) {
            this.ui.showToast(t('The syndicate wants {credits} — not enough credits.', { credits: formatCredits(fee) }), 'warning', 4600);
            this.audio.play('warning');
            return false;
        }
        this.save.player.credits -= fee;
        const underworld = this.save.world.underworld ?? (this.save.world.underworld = {});
        underworld[pending.locationId] = (underworld[pending.locationId] ?? 0) + fee;
        // The berth's receipt: the dock screen shows this saved message for the
        // whole visit (see renderDockNotice) so the pilot knows what the berth
        // cost, and the ledger itself remembers every cr paid at this dock.
        this.save.world.syndicateArrival = { locationId: pending.locationId, fee, at: this.save.world.time };
        delete this.save.world.syndicatePending;
        this.ui.pushEvent(t('Syndicate berth paid: {credits}.', { credits: formatCredits(fee) }), 'warning', 4200);
        this.audio.play('ui');
        this.persistSave();
        // Re-render the dock so the payment card leaves and the receipt notice
        // takes its place.
        this.ui.showDock?.(this.save, pending.locationId);
        return true;
    }
    // The syndicate berth's price for an unlicensed arrival: a flat handling
    // fee plus a cut of everything in the hold (loose cargo and sealed goods).
    syndicateFee() {
        return SYNDICATE_FEE_FLAT + Math.round(this.holdWorth() * SYNDICATE_FEE_RATE);
    }
    // The local syndicate's ledger at this dock has crossed the favor line: the
    // fixer opens the smuggler's den to the pilot who paid for it. Paid fees
    // are the favor — no separate counter, the ledger remembers.
    denUnlockedAt(locationId) {
        return (this.save.world.underworld?.[locationId] ?? 0) >= SYNDICATE_DEN_FAVOR;
    }
    activeDockObstacle() {
        const dockLocation = this.currentDockLocationIds().find((id) => id === this.activeInstanceId);
        if (!dockLocation)
            return undefined;
        const location = LOCATIONS[dockLocation];
        return {
            id: dockLocation,
            x: location.position[0],
            y: location.position[1],
            z: location.position[2],
            radius: location.radius,
            losRadius: location.kind === 'planet' ? location.radius + 2 : location.radius * 0.73,
            collisionRadius: this.locationCollisionRadius(location),
        };
    }
    asteroidFieldObstacles(nodes = []) {
        return nodes.map((node) => {
                // The player's hard collision AND line of sight both test the
                // rock's ACTUAL deformed-icosahedron mesh (obstacle.shape =
                // 'asteroid', meshVerts/meshIndices from worldData) so a bump
                // lands on the visible surface from any angle, dents included,
                // and a beam is blocked only where rock is drawn. The box
                // survives for spawn clearance, where a conservative corner
                // reach is intentional.
                // The bounding sphere remains the spatial-grid/avoidance radius.
                const hx = node.radius * node.scale[0] * ASTEROID_COLLISION_FACTOR;
                const hy = node.radius * node.scale[1] * ASTEROID_COLLISION_FACTOR;
                const hz = node.radius * node.scale[2] * ASTEROID_COLLISION_FACTOR;
                const collisionMesh = asteroidCollisionMesh(node);
                const rotation = node.rotation ?? [0, 0, 0];
                const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(rotation[0], rotation[1], rotation[2], 'XYZ'));
                // Steering/avoidance treats the rock as a sphere of its widest
                // axis (same reach as the old radius × max-scale), while LOS and
                // the spatial grid use the full corner reach of the box so a
                // rotated rock never lets a beam slip past a visible corner.
                const widest = Math.max(hx, hy, hz);
                const cornerReach = Math.hypot(hx, hy, hz);
                return {
                    id: node.id,
                    x: node.position[0],
                    y: node.position[1],
                    z: node.position[2],
                    radius: widest,
                    losRadius: cornerReach,
                    collisionRadius: widest,
                    shape: 'asteroid',
                    meshVerts: collisionMesh.verts,
                    meshIndices: collisionMesh.indices,
                    minReach: collisionMesh.minReach,
                    box: { hx, hy, hz, qx: q.x, qy: q.y, qz: q.z, qw: q.w },
                };
        });
    }
    activeFieldObstacles(instanceId = this.activeInstanceId) {
        if (instanceId === 'shardbelt')
            return this.asteroidFieldObstacles(this.asteroids);
        const regionalField = this.regionalFields?.get(instanceId);
        if (regionalField)
            return this.asteroidFieldObstacles(regionalField);
        if (instanceId === 'mourning-line') {
            const obstacles = this.graveyard.filter((piece) => piece.collidable !== false).map((piece) => {
                const [hx, hy, hz] = piece.halfExtents;
                const q = this.tmpQ.setFromEuler(this.tmpEuler.set(piece.rotation[0], piece.rotation[1], piece.rotation[2], 'XYZ'));
                // radius is the bounding sphere used for the spatial grid and
                // avoidance; hard collision uses the oriented box so a flat
                // panel blocks its face without an inflated sphere around it.
                return {
                    id: piece.id,
                    x: piece.position[0],
                    y: piece.position[1],
                    z: piece.position[2],
                    radius: Math.hypot(hx, hy, hz),
                    losRadius: piece.collisionRadius,
                    collisionRadius: Math.hypot(hx, hy, hz),
                    shape: piece.kind === 'ring' || piece.kind === 'engine' ? piece.kind : undefined,
                    scale: piece.scale,
                    box: { hx, hy, hz, qx: q.x, qy: q.y, qz: q.z, qw: q.w },
                };
            });
            for (const node of this.wreckNodes) {
                if (node.remaining <= 0)
                    continue;
                const radius = wreckNodeCollisionRadius(node);
                obstacles.push({
                    id: node.id,
                    x: node.position[0],
                    y: node.position[1],
                    z: node.position[2],
                    radius,
                    losRadius: radius,
                    collisionRadius: radius,
                });
            }
            return obstacles;
        }
        return [];
    }
    // The player's collision envelope follows the outfitted hull: the same
    // per-hull collisionRadius the NPCs use, so an Atlas bumps at its full
    // 2.9 reach while a Wayfarer slips through the same gaps at 1.3.
    playerCollisionRadius() {
        return HULL_FLIGHT_STATS[playerShipVariant(this.save.player.shipId)]?.collisionRadius ?? PLAYER_RADIUS;
    }
    // The ship's collision hull as an oriented ellipsoid in the ship frame
    // [starboard X, up Y, forward Z] — measured from the baked GLB models. The
    // player's hard collision (rocks, debris boxes) tests this shape.
    playerHullExtents() {
        // The player's collision envelope is the GLB hull scaled by the
        // forgiveness factor — the same shape, just slimmer, so near-misses
        // that look like they clear usually do. NPCs use npcHullExtents (full
        // hull) instead.
        const base = HULL_FLIGHT_STATS[playerShipVariant(this.save.player.shipId)]?.hullHalfExtents ?? [1.4, 2.4, 6.1];
        return [base[0] * PLAYER_COLLISION_FORGIVENESS, base[1] * PLAYER_COLLISION_FORGIVENESS, base[2] * PLAYER_COLLISION_FORGIVENESS];
    }
    npcHullExtents(ship) {
        const variant = HULL_FLIGHT_STATS[ship?.variant] ? ship.variant : shipVariantForRole(ship?.role);
        return HULL_FLIGHT_STATS[variant]?.hullHalfExtents ?? [1.4, 2.4, 6.1];
    }

    // Entry/spawn clearance must cover the hull's longest reach, not the old
    // sphere radius, or a spawn could drop the Atlas's nose into a rock.
    playerSpawnClearance() {
        const hull = this.playerHullExtents();
        return Math.max(this.playerCollisionRadius(), hull[0], hull[1], hull[2]) + ENTRY_CLEARANCE;
    }
    entryPositionClear(position, obstacles, clearance = this.playerSpawnClearance()) {
        // Class fields initialize these in the real constructor, but headless
        // harnesses build sessions via Object.create — keep the box path robust
        // to whatever the caller left on the instance.
        if (!(this.tmpEntryQuaternion instanceof THREE.Quaternion))
            this.tmpEntryQuaternion = new THREE.Quaternion();
        if (!(this.tmpEntryInverseQuaternion instanceof THREE.Quaternion))
            this.tmpEntryInverseQuaternion = new THREE.Quaternion();
        this.tmpEntryLocal ??= new THREE.Vector3();
        const clearanceSq = clearance * clearance;
        for (const obstacle of obstacles) {
            if (obstacle.box) {
                const box = obstacle.box;
                this.tmpEntryQuaternion.set(box.qx, box.qy, box.qz, box.qw);
                this.tmpEntryInverseQuaternion.copy(this.tmpEntryQuaternion).invert();
                this.tmpEntryLocal.set(position.x - obstacle.x, position.y - obstacle.y, position.z - obstacle.z).applyQuaternion(this.tmpEntryInverseQuaternion);
                const closestX = clamp(this.tmpEntryLocal.x, -box.hx, box.hx);
                const closestY = clamp(this.tmpEntryLocal.y, -box.hy, box.hy);
                const closestZ = clamp(this.tmpEntryLocal.z, -box.hz, box.hz);
                const dx = this.tmpEntryLocal.x - closestX;
                const dy = this.tmpEntryLocal.y - closestY;
                const dz = this.tmpEntryLocal.z - closestZ;
                if (dx * dx + dy * dy + dz * dz < clearanceSq)
                    return false;
            }
            else {
                const dx = position.x - obstacle.x;
                const dy = position.y - obstacle.y;
                const dz = position.z - obstacle.z;
                const minimum = obstacle.collisionRadius + clearance;
                if (dx * dx + dy * dy + dz * dz < minimum * minimum)
                    return false;
            }
        }
        return true;
    }
    pushEntryPosition(position, obstacle, preferredDirection) {
        if (!(this.tmpEntryQuaternion instanceof THREE.Quaternion))
            this.tmpEntryQuaternion = new THREE.Quaternion();
        if (!(this.tmpEntryInverseQuaternion instanceof THREE.Quaternion))
            this.tmpEntryInverseQuaternion = new THREE.Quaternion();
        this.tmpEntryLocal ??= new THREE.Vector3();
        this.tmpEntryLocalDirection ??= new THREE.Vector3();
        const clearance = this.playerSpawnClearance();
        if (obstacle.box) {
            const box = obstacle.box;
            this.tmpEntryQuaternion.set(box.qx, box.qy, box.qz, box.qw);
            this.tmpEntryInverseQuaternion.copy(this.tmpEntryQuaternion).invert();
            this.tmpEntryLocal.set(position.x - obstacle.x, position.y - obstacle.y, position.z - obstacle.z).applyQuaternion(this.tmpEntryInverseQuaternion);
            const hx = box.hx + clearance;
            const hy = box.hy + clearance;
            const hz = box.hz + clearance;
            if (Math.abs(this.tmpEntryLocal.x) > hx || Math.abs(this.tmpEntryLocal.y) > hy || Math.abs(this.tmpEntryLocal.z) > hz)
                return false;
            const penetrationX = hx - Math.abs(this.tmpEntryLocal.x);
            const penetrationY = hy - Math.abs(this.tmpEntryLocal.y);
            const penetrationZ = hz - Math.abs(this.tmpEntryLocal.z);
            this.tmpEntryLocalDirection.copy(preferredDirection).applyQuaternion(this.tmpEntryInverseQuaternion);
            if (penetrationX <= penetrationY && penetrationX <= penetrationZ)
                this.tmpEntryLocal.x = (Math.abs(this.tmpEntryLocal.x) > 0.001 ? Math.sign(this.tmpEntryLocal.x) : (this.tmpEntryLocalDirection.x < 0 ? -1 : 1)) * (hx + 0.08);
            else if (penetrationY <= penetrationZ)
                this.tmpEntryLocal.y = (Math.abs(this.tmpEntryLocal.y) > 0.001 ? Math.sign(this.tmpEntryLocal.y) : (this.tmpEntryLocalDirection.y < 0 ? -1 : 1)) * (hy + 0.08);
            else
                this.tmpEntryLocal.z = (Math.abs(this.tmpEntryLocal.z) > 0.001 ? Math.sign(this.tmpEntryLocal.z) : (this.tmpEntryLocalDirection.z < 0 ? -1 : 1)) * (hz + 0.08);
            this.tmpEntryLocal.applyQuaternion(this.tmpEntryQuaternion);
            position.set(obstacle.x, obstacle.y, obstacle.z).add(this.tmpEntryLocal);
            return true;
        }
        const dx = position.x - obstacle.x;
        const dy = position.y - obstacle.y;
        const dz = position.z - obstacle.z;
        const minimum = obstacle.collisionRadius + clearance;
        const distanceSq = dx * dx + dy * dy + dz * dz;
        if (distanceSq >= minimum * minimum)
            return false;
        if (distanceSq > 1e-8)
            this.tmpEntryNormal.set(dx, dy, dz).multiplyScalar(1 / Math.sqrt(distanceSq));
        else
            this.tmpEntryNormal.copy(preferredDirection);
        if (this.tmpEntryNormal.lengthSq() < 1e-8)
            this.tmpEntryNormal.set(0, 0, -1);
        position.set(obstacle.x, obstacle.y, obstacle.z).addScaledVector(this.tmpEntryNormal, minimum + 0.08);
        return true;
    }
    setFieldEntryPosition(position, instanceId, preferredDirection = FORWARD) {
        const location = LOCATIONS[instanceId];
        if (!location)
            return false;
        const direction = this.tmpEntryPreferredDirection.copy(preferredDirection ?? FORWARD);
        if (direction.lengthSq() < 1e-8)
            direction.copy(FORWARD);
        direction.normalize();
        const obstacles = this.activeFieldObstacles(instanceId);
        let entryRadius = hyperdriveArrivalRadius(location);
        // The configured field radius is the normal cloud edge. Include the
        // live outermost object as well because drift and collectible chunks
        // can extend beyond that seed radius during a long session.
        const clearance = this.playerSpawnClearance();
        for (const obstacle of obstacles) {
            const dx = obstacle.x - location.position[0];
            const dy = obstacle.y - location.position[1];
            const dz = obstacle.z - location.position[2];
            entryRadius = Math.max(entryRadius, Math.hypot(dx, dy, dz) + obstacle.radius + clearance + 0.08);
        }
        position.set(location.position[0], location.position[1], location.position[2]).addScaledVector(direction, entryRadius);
        // Keep the exact oriented-box/sphere check as the final authority in
        // case a field generator ever produces geometry outside its bounds.
        this.ensurePlayerEntryClearance(position, instanceId, direction);
        return true;
    }
    setFieldArenaPosition(position, instanceId) {
        const location = LOCATIONS[instanceId];
        if (!location)
            return false;
        const obstacles = this.activeFieldObstacles(instanceId);
        this.tmpEntryAnchor.set(location.position[0], location.position[1], location.position[2]);
        for (const [x, y, z] of ARENA_FIELD_START_OFFSETS) {
            this.tmpEntryCandidate.set(this.tmpEntryAnchor.x + x, this.tmpEntryAnchor.y + y, this.tmpEntryAnchor.z + z);
            if (this.entryPositionClear(this.tmpEntryCandidate, obstacles, ARENA_FIELD_SAFE_CLEARANCE)) {
                position.copy(this.tmpEntryCandidate);
                return true;
            }
        }
        // If a future seed closes every interior candidate, preserve the
        // centre-first intent while still guaranteeing a collision-free start.
        position.copy(this.tmpEntryAnchor);
        this.ensurePlayerEntryClearance(position, instanceId, FORWARD);
        return false;
    }
    ensurePlayerEntryClearance(position, instanceId, preferredDirection = FORWARD) {
        if (!instanceId)
            return false;
        const obstacles = this.activeFieldObstacles(instanceId);
        if (obstacles.length === 0)
            return false;
        this.tmpEntryAnchor.copy(position);
        this.tmpEntryPreferredDirection.copy(preferredDirection ?? FORWARD);
        if (this.tmpEntryPreferredDirection.lengthSq() < 1e-8)
            this.tmpEntryPreferredDirection.copy(FORWARD);
        this.tmpEntryPreferredDirection.normalize();
        let moved = false;
        // Resolve several times because pushing away from one large piece can
        // put the player into a neighbouring piece in a dense field.
        for (let pass = 0; pass < 8; pass += 1) {
            let passMoved = false;
            for (const obstacle of obstacles) {
                if (this.pushEntryPosition(position, obstacle, this.tmpEntryPreferredDirection)) {
                    passMoved = true;
                    moved = true;
                }
            }
            if (!passMoved || this.entryPositionClear(position, obstacles))
                break;
        }
        if (this.entryPositionClear(position, obstacles))
            return moved;
        // If local resolution is trapped between overlapping pieces, search a
        // deterministic ring around the original entry point before resorting
        // to the field boundary. This keeps normal arrivals close to the nav
        // drop sphere while still guaranteeing a clean control hand-off.
        for (const radius of ENTRY_SEARCH_RADII) {
            this.tmpEntryCandidate.copy(this.tmpEntryAnchor).addScaledVector(this.tmpEntryPreferredDirection, radius);
            if (this.entryPositionClear(this.tmpEntryCandidate, obstacles)) {
                position.copy(this.tmpEntryCandidate);
                return true;
            }
            for (const rawDirection of ENTRY_SEARCH_DIRECTIONS) {
                this.tmpEntryCandidate.set(this.tmpEntryAnchor.x, this.tmpEntryAnchor.y, this.tmpEntryAnchor.z);
                this.tmpEntryDirection.set(rawDirection[0], rawDirection[1], rawDirection[2]).normalize();
                this.tmpEntryCandidate.addScaledVector(this.tmpEntryDirection, radius);
                if (this.entryPositionClear(this.tmpEntryCandidate, obstacles)) {
                    position.copy(this.tmpEntryCandidate);
                    return true;
                }
            }
        }
        // The generated field geometry is finite, so a point beyond the furthest
        // obstacle's bounding sphere is a mathematical guarantee, even after
        // long-running drift has moved pieces away from their seed positions.
        const location = LOCATIONS[instanceId];
        if (location) {
            const center = location.position;
            const clearance = this.playerSpawnClearance();
            let safeRadius = location.radius + clearance;
            for (const obstacle of obstacles) {
                const dx = obstacle.x - center[0];
                const dy = obstacle.y - center[1];
                const dz = obstacle.z - center[2];
                safeRadius = Math.max(safeRadius, Math.hypot(dx, dy, dz) + obstacle.radius + clearance + 0.08);
            }
            this.tmpEntryCandidate.set(center[0], center[1], center[2]).addScaledVector(this.tmpEntryPreferredDirection, safeRadius);
            position.copy(this.tmpEntryCandidate);
            return true;
        }
        return moved;
    }
    locationCollisionRadius(location) {
        return location.kind === 'planet' ? location.radius + 2 : location.radius * 0.72;
    }
    // Distance reads for large bodies are measured to the collidable surface,
    // not the center: scanning, mining, salvage, and landing all care how far
    // the hull is from the rock/body, not from an abstract center point.
    targetSurfaceRadius(target) {
        if (!target)
            return 0;
        if (target.kind === 'asteroid') {
            const node = this.asteroids.find((entry) => entry.id === target.id);
            return node ? asteroidCollisionRadius(node) : 0;
        }
        if (target.kind === 'wreck') {
            const node = this.wreckNodes.find((entry) => entry.id === target.id);
            return node ? wreckNodeCollisionRadius(node) : 0;
        }
        if (target.kind === 'location') {
            const location = LOCATIONS[target.id];
            return location ? this.locationCollisionRadius(location) : 0;
        }
        return 0;
    }
    surfaceDistance(position, target) {
        if (!target)
            return 0;
        const tp = target.position;
        return Math.max(0, Math.hypot(position.x - tp[0], position.y - tp[1], position.z - tp[2]) - this.targetSurfaceRadius(target));
    }
    ensureObstacleGrid() {
        // Drifting rocks and wreckage move slowly, so the grid is rebuilt at most
        // twice a second, or immediately after switching instances.
        if (this.obstacleGrid && this.obstacleGridInstance === this.activeInstanceId && this.save.world.time - this.obstacleGridBuiltAt < 0.5)
            return;
        const grid = new Map();
        const segmentGrid = new Map();
        const size = this.obstacleCellSize;
        for (const obstacle of this.activeFieldObstacles()) {
            // Keep the center-cell index for physical collision and steering
            // queries. Their box padding already accounts for obstacle radius,
            // and retaining this index keeps manual controls on the old exact
            // candidate set.
            const centerKey = this.cellKey(Math.floor(obstacle.x / size), Math.floor(obstacle.y / size), Math.floor(obstacle.z / size));
            let centerBucket = grid.get(centerKey);
            if (!centerBucket) {
                centerBucket = [];
                grid.set(centerKey, centerBucket);
            }
            centerBucket.push(obstacle);
            // Index an obstacle in every cell its bounding sphere touches. The
            // old query checked all 26 neighboring cells for every DDA step;
            // that was cheap in open space but became a repeated Map lookup
            // storm along weapon lines through the dense wreck field. Boxes use
            // their full corner reach so rotated rocks never let a beam slip
            // past a visible corner.
            const reach = Math.max(obstacle.radius, obstacle.losRadius ?? obstacle.radius);
            const cx0 = Math.floor((obstacle.x - reach) / size);
            const cy0 = Math.floor((obstacle.y - reach) / size);
            const cz0 = Math.floor((obstacle.z - reach) / size);
            const cx1 = Math.floor((obstacle.x + reach) / size);
            const cy1 = Math.floor((obstacle.y + reach) / size);
            const cz1 = Math.floor((obstacle.z + reach) / size);
            for (let cx = cx0; cx <= cx1; cx += 1) {
                for (let cy = cy0; cy <= cy1; cy += 1) {
                    for (let cz = cz0; cz <= cz1; cz += 1) {
                        const key = this.cellKey(cx, cy, cz);
                        let bucket = segmentGrid.get(key);
                        if (!bucket) {
                            bucket = [];
                            segmentGrid.set(key, bucket);
                        }
                        bucket.push(obstacle);
                    }
                }
            }
        }
        this.obstacleGrid = grid;
        this.obstacleSegmentGrid = segmentGrid;
        this.obstacleGridInstance = this.activeInstanceId;
        this.obstacleGridBuiltAt = this.save.world.time;
    }
    cellKey(cx, cy, cz) {
        // Numeric key instead of a "x,y,z" string: the obstacle grid is queried
        // tens of thousands of times a second, and the string version was the
        // top GC/CPU cost in flight.
        // Cell coords stay within ±4096 (the playable system spans ~±1M units at
        // a 256-unit cell size), so 13 bits per axis pack losslessly into a double.
        return (cx + 4096) * 16777216 + (cy + 4096) * 4096 + (cz + 4096);
    }
    forEachObstacleInBox(minX, minY, minZ, maxX, maxY, maxZ, callback) {
        this.ensureObstacleGrid();
        if (this.obstacleGrid.size === 0)
            return;
        const stamp = ++this.obstacleQueryStamp;
        const size = this.obstacleCellSize;
        const cx0 = Math.floor(minX / size);
        const cy0 = Math.floor(minY / size);
        const cz0 = Math.floor(minZ / size);
        const cx1 = Math.floor(maxX / size);
        const cy1 = Math.floor(maxY / size);
        const cz1 = Math.floor(maxZ / size);
        for (let cx = cx0; cx <= cx1; cx += 1) {
            for (let cy = cy0; cy <= cy1; cy += 1) {
                for (let cz = cz0; cz <= cz1; cz += 1) {
                    const bucket = this.obstacleGrid.get(this.cellKey(cx, cy, cz));
                    if (!bucket)
                        continue;
                    for (const obstacle of bucket) {
                        if (obstacle._queryStamp === stamp)
                            continue;
                        obstacle._queryStamp = stamp;
                        callback(obstacle);
                    }
                }
            }
        }
    }
    forEachObstacleAlongSegment(start, end, callback) {
        // Walk the grid along the segment instead of iterating its whole bounding
        // box. A hyperdrive vector can span a whole sector (~100k units), so the
        // box version touches tens of millions of cells and freezes the frame;
        // this DDA visits only the cells the ray actually crosses. Obstacles are
        // pre-indexed into every cell their bounding sphere touches, so no
        // neighboring-cell fan-out is needed here.
        this.ensureObstacleGrid();
        if (this.obstacleSegmentGrid.size === 0)
            return;
        const stamp = ++this.obstacleQueryStamp;
        const size = this.obstacleCellSize;
        let cx = Math.floor(start.x / size);
        let cy = Math.floor(start.y / size);
        let cz = Math.floor(start.z / size);
        const ex = Math.floor(end.x / size);
        const ey = Math.floor(end.y / size);
        const ez = Math.floor(end.z / size);
        const dx = end.x - start.x;
        const dy = end.y - start.y;
        const dz = end.z - start.z;
        const stepX = dx >= 0 ? 1 : -1;
        const stepY = dy >= 0 ? 1 : -1;
        const stepZ = dz >= 0 ? 1 : -1;
        const tDeltaX = dx !== 0 ? Math.abs(size / dx) : Infinity;
        const tDeltaY = dy !== 0 ? Math.abs(size / dy) : Infinity;
        const tDeltaZ = dz !== 0 ? Math.abs(size / dz) : Infinity;
        let tMaxX = dx !== 0 ? ((stepX > 0 ? (cx + 1) * size : cx * size) - start.x) / dx : Infinity;
        let tMaxY = dy !== 0 ? ((stepY > 0 ? (cy + 1) * size : cy * size) - start.y) / dy : Infinity;
        let tMaxZ = dz !== 0 ? ((stepZ > 0 ? (cz + 1) * size : cz * size) - start.z) / dz : Infinity;
        const visit = (x, y, z) => {
            const bucket = this.obstacleSegmentGrid.get(this.cellKey(x, y, z));
            if (!bucket)
                return;
            for (const obstacle of bucket) {
                if (obstacle._queryStamp === stamp)
                    continue;
                obstacle._queryStamp = stamp;
                callback(obstacle);
            }
        };
        visit(cx, cy, cz);
        while (cx !== ex || cy !== ey || cz !== ez) {
            // Never step an axis whose plane crossing lies beyond the ray's end
            // (tMax > 1): a ray landing exactly on a grid corner ties all three
            // tMax values at the endpoint, and stepping past it overshoots the
            // target cell forever (the DDA then grinds to its guard and eats
            // ~200k grid lookups per query — the player parked at the world
            // origin hits this constantly). Ties step X first.
            if (tMaxX <= tMaxY && tMaxX <= tMaxZ && tMaxX <= 1) {
                cx += stepX;
                tMaxX += tDeltaX;
            }
            else if (tMaxY <= tMaxZ && tMaxY <= 1) {
                cy += stepY;
                tMaxY += tDeltaY;
            }
            else if (tMaxZ <= 1) {
                cz += stepZ;
                tMaxZ += tDeltaZ;
            }
            else
                break;
            visit(cx, cy, cz);
        }
    }
    getShipAvoidance(position, velocity, shipId) {
        // Evasive turn away from any other ship (player included) that is closing
        // on a course whose closest approach is inside SHIP_AVOID_SEPARATION units.
        // Returns a steering vector scaled by urgency, or undefined if the lane is
        // clear. The turn is perpendicular to our heading (a bank, not a brake) and
        // biased away from the threat; dead-ahead threats fall back to the ship's
        // local right so two head-on jousters turn on opposite sides.
        let found = false;
        let bestUrgency = 0;
        const px = position.x;
        const py = position.y;
        const pz = position.z;
        const vx = velocity.x;
        const vy = velocity.y;
        const vz = velocity.z;
        const speed = Math.sqrt(vx * vx + vy * vy + vz * vz);
        const consider = (op, ov) => {
            const rx = op[0] - px;
            const ry = op[1] - py;
            const rz = op[2] - pz;
            const distSq = rx * rx + ry * ry + rz * rz;
            if (distSq >= SHIP_AVOID_RANGE * SHIP_AVOID_RANGE || distSq < 0.0001)
                return;
            const rvx = ov[0] - vx;
            const rvy = ov[1] - vy;
            const rvz = ov[2] - vz;
            const closing = rx * rvx + ry * rvy + rz * rvz;
            if (closing >= 0)
                return;
            const rvSq = rvx * rvx + rvy * rvy + rvz * rvz;
            const t = Math.min(-closing / Math.max(rvSq, 1e-4), SHIP_AVOID_HORIZON);
            const cax = rx + rvx * t;
            const cay = ry + rvy * t;
            const caz = rz + rvz * t;
            const ca = Math.sqrt(cax * cax + cay * cay + caz * caz);
            if (ca >= SHIP_AVOID_SEPARATION)
                return;
            const dist = Math.sqrt(distSq);
            const urgency = (1 - ca / SHIP_AVOID_SEPARATION) * (1 - t / SHIP_AVOID_HORIZON) * clamp(dist / SHIP_AVOID_RANGE, 0.35, 1);
            if (urgency <= bestUrgency)
                return;
            bestUrgency = urgency;
            const invDist = 1 / dist;
            const ax = rx * invDist;
            const ay = ry * invDist;
            const az = rz * invDist;
            const fx = speed > 1e-4 ? vx / speed : 0;
            const fy = speed > 1e-4 ? vy / speed : 0;
            const fz = speed > 1e-4 ? vz / speed : 0;
            const dot = ax * fx + ay * fy + az * fz;
            // Steer away from the threat, perpendicular to our heading.
            let ex = fx * dot - ax;
            let ey = fy * dot - ay;
            let ez = fz * dot - az;
            let len = Math.sqrt(ex * ex + ey * ey + ez * ez);
            if (len < 0.2) {
                // Threat dead ahead: fall back to the local right vector (cross of
                // forward with world-up), which is opposite for opposite facings.
                ex = -fz;
                ey = 0;
                ez = fx;
                len = Math.sqrt(ex * ex + ey * ey + ez * ez);
                if (len < 0.2) {
                    ex = 1;
                    ey = 0;
                    ez = 0;
                    len = 1;
                }
            }
            this.tmpShipAvoid.set(ex / len, ey / len, ez / len).multiplyScalar(urgency * SHIP_AVOID_STEER);
            found = true;
        };
        const player = this.save.player;
        consider(player.position, player.velocity);
        for (const other of this.ships) {
            if (other.id === shipId || other.hull <= 0)
                continue;
            consider(other.position, other.velocity);
        }
        return found ? this.tmpShipAvoid : undefined;
    }
    getAvoidanceVector(position, desired, range, speed = 0) {
        let ax = 0;
        let ay = 0;
        let az = 0;
        const px = position.x;
        const py = position.y;
        const pz = position.z;
        const ddx = desired.x;
        const ddy = desired.y;
        const ddz = desired.z;
        // Fast ships look further ahead so they have room to turn before a rock.
        const lookahead = speed * 1.05;
        const accumulate = (obstacle) => {
            const ox = px - obstacle.x;
            const oy = py - obstacle.y;
            const oz = pz - obstacle.z;
            const distSq = ox * ox + oy * oy + oz * oz;
            const clearance = obstacle.radius + range + lookahead;
            if (distSq >= clearance * clearance || distSq < 0.0001)
                return;
            const dist = Math.sqrt(distSq);
            const inv = 1 / dist;
            const ahead = (obstacle.x - px) * inv * ddx + (obstacle.y - py) * inv * ddy + (obstacle.z - pz) * inv * ddz;
            if (ahead < -0.1)
                return;
            const weight = (clearance - dist) / clearance * inv;
            ax += ox * weight;
            ay += oy * weight;
            az += oz * weight;
            // Dead ahead: brake-and-push alone leaves a fast hull sitting in
            // front of the rock grinding against it. Add a consistent-side
            // tangent sweep so the ship banks a smooth orbit around the rock
            // instead of bouncing off its face (the lateral push the radial
            // term can't provide when the nose is pointed at the center).
            if (ahead > 0.45) {
                const tl = Math.hypot(ox, oz) || 1;
                const tx = -oz / tl;
                const tz = ox / tl;
                ax += tx * weight * 1.7;
                az += tz * weight * 1.7;
            }
        };
        const dock = this.activeDockObstacle();
        if (dock)
            accumulate(dock);
        else {
            const margin = range + lookahead + MAX_FIELD_OBSTACLE_RADIUS;
            this.forEachObstacleInBox(px - margin, py - margin, pz - margin, px + margin, py + margin, pz + margin, accumulate);
        }
        return this.tmpAvoidance.set(ax, ay, az);
    }
    findCoverPoint(position, threatPosition) {
        const obstacles = this.activeFieldObstacles();
        if (!obstacles.length)
            return undefined;
        let best;
        let bestDist = Infinity;
        for (const obstacle of obstacles) {
            if (obstacle.radius < COVER_MIN_RADIUS)
                continue;
            let tx = obstacle.x - threatPosition.x;
            let ty = obstacle.y - threatPosition.y;
            let tz = obstacle.z - threatPosition.z;
            const len = Math.hypot(tx, ty, tz);
            if (len < 1)
                continue;
            tx /= len;
            ty /= len;
            tz /= len;
            const behind = obstacle.radius * 1.35 + 30;
            const cx = obstacle.x + tx * behind;
            const cy = obstacle.y + ty * behind;
            const cz = obstacle.z + tz * behind;
            const d = Math.hypot(cx - position.x, cy - position.y, cz - position.z);
            if (d > COVER_SEEK_RANGE || d >= bestDist)
                continue;
            if (this.lineBlocked({ x: threatPosition.x, y: threatPosition.y, z: threatPosition.z }, { x: cx, y: cy, z: cz }, undefined))
                best = { x: cx, y: cy, z: cz }, bestDist = d;
        }
        return best;
    }
    setSegmentShapeEndpoints(start, end, obstacle) {
        const box = obstacle.box;
        const scaleX = Math.max(0.001, obstacle.scale[0]);
        const scaleY = Math.max(0.001, obstacle.scale[1]);
        const scaleZ = Math.max(0.001, obstacle.scale[2]);
        const qx = box.qx;
        const qy = box.qy;
        const qz = box.qz;
        const qw = box.qw;
        const m00 = 1 - 2 * (qy * qy + qz * qz);
        const m01 = 2 * (qx * qy - qz * qw);
        const m02 = 2 * (qx * qz + qy * qw);
        const m10 = 2 * (qx * qy + qz * qw);
        const m11 = 1 - 2 * (qx * qx + qz * qz);
        const m12 = 2 * (qy * qz - qx * qw);
        const m20 = 2 * (qx * qz - qy * qw);
        const m21 = 2 * (qy * qz + qx * qw);
        const m22 = 1 - 2 * (qx * qx + qy * qy);
        const startX = start.x - obstacle.x;
        const startY = start.y - obstacle.y;
        const startZ = start.z - obstacle.z;
        const endX = end.x - obstacle.x;
        const endY = end.y - obstacle.y;
        const endZ = end.z - obstacle.z;
        this.tmpF.set((m00 * startX + m10 * startY + m20 * startZ) / scaleX, (m01 * startX + m11 * startY + m21 * startZ) / scaleY, (m02 * startX + m12 * startY + m22 * startZ) / scaleZ);
        this.tmpG.set((m00 * endX + m10 * endY + m20 * endZ) / scaleX, (m01 * endX + m11 * endY + m21 * endZ) / scaleY, (m02 * endX + m12 * endY + m22 * endZ) / scaleZ);
    }
    segmentRingHit(start, end, obstacle, padding = 1.5) {
        this.setSegmentShapeEndpoints(start, end, obstacle);
        const sx = this.tmpF.x;
        const sy = this.tmpF.y;
        const sz = this.tmpF.z;
        const dx = this.tmpG.x - sx;
        const dy = this.tmpG.y - sy;
        const dz = this.tmpG.z - sz;
        const scale = Math.min(obstacle.scale[0], obstacle.scale[1], obstacle.scale[2]);
        const localPadding = padding / Math.max(0.001, scale);
        let t0 = 0;
        let t1 = 1;
        const profile = GRAVEYARD_GEOMETRY_PROFILES.ring;
        const axialLimit = profile.tubeRadius + localPadding;
        if (Math.abs(dz) < 1e-10) {
            if (sz < -axialLimit || sz > axialLimit)
                return undefined;
        }
        else {
            let near = (-axialLimit - sz) / dz;
            let far = (axialLimit - sz) / dz;
            if (near > far) {
                const swap = near;
                near = far;
                far = swap;
            }
            t0 = Math.max(t0, near);
            t1 = Math.min(t1, far);
            if (t0 > t1)
                return undefined;
        }
        const inner = Math.max(0, profile.majorRadius - profile.tubeRadius - localPadding);
        const outer = profile.majorRadius + profile.tubeRadius + localPadding;
        const innerSq = inner * inner;
        const outerSq = outer * outer;
        const atStart = segmentRadialBandAt(sx, sy, dx, dy, t0, innerSq, outerSq);
        if (t0 <= 1e-6 && atStart)
            return undefined;
        if (atStart)
            return t0;
        if (segmentRadialBandAt(sx, sy, dx, dy, t1, innerSq, outerSq))
            return t1;
        const coefficientA = dx * dx + dy * dy;
        const coefficientB = 2 * (sx * dx + sy * dy);
        const coefficientC = sx * sx + sy * sy;
        const innerHit = segmentRadialBandRoot(sx, sy, dx, dy, coefficientA, coefficientB, coefficientC, innerSq, t0, t1, innerSq, outerSq);
        const outerHit = segmentRadialBandRoot(sx, sy, dx, dy, coefficientA, coefficientB, coefficientC, outerSq, t0, t1, innerSq, outerSq);
        if (innerHit === undefined)
            return outerHit;
        if (outerHit === undefined)
            return innerHit;
        return Math.min(innerHit, outerHit);
    }
    segmentEngineHit(start, end, obstacle, padding = 1.5) {
        this.setSegmentShapeEndpoints(start, end, obstacle);
        const sx = this.tmpF.x;
        const sy = this.tmpF.y;
        const sz = this.tmpF.z;
        const dx = this.tmpG.x - sx;
        const dy = this.tmpG.y - sy;
        const dz = this.tmpG.z - sz;
        const scale = Math.min(obstacle.scale[0], obstacle.scale[1], obstacle.scale[2]);
        const localPadding = padding / Math.max(0.001, scale);
        const profile = GRAVEYARD_GEOMETRY_PROFILES.engine;
        let t0 = 0;
        let t1 = 1;
        const yLimit = profile.halfHeight + localPadding;
        if (Math.abs(dy) < 1e-10) {
            if (sy < -yLimit || sy > yLimit)
                return undefined;
        }
        else {
            let near = (-yLimit - sy) / dy;
            let far = (yLimit - sy) / dy;
            if (near > far) {
                const swap = near;
                near = far;
                far = swap;
            }
            t0 = Math.max(t0, near);
            t1 = Math.min(t1, far);
            if (t0 > t1)
                return undefined;
        }
        const radiusCenter = (profile.radiusBottom + profile.radiusTop) * 0.5;
        const radiusSlope = (profile.radiusTop - profile.radiusBottom) / (profile.halfHeight * 2);
        const atStart = segmentEngineShellAt(sx, sy, sz, dx, dy, dz, t0, radiusCenter, radiusSlope, profile.halfHeight, localPadding);
        if (t0 <= 1e-6 && atStart)
            return undefined;
        if (atStart)
            return t0;
        if (segmentEngineShellAt(sx, sy, sz, dx, dy, dz, t1, radiusCenter, radiusSlope, profile.halfHeight, localPadding))
            return t1;
        const innerHit = segmentEngineShellRoot(sx, sy, sz, dx, dy, dz, radiusCenter, radiusSlope, profile.halfHeight, localPadding, -localPadding, t0, t1);
        const outerHit = segmentEngineShellRoot(sx, sy, sz, dx, dy, dz, radiusCenter, radiusSlope, profile.halfHeight, localPadding, localPadding, t0, t1);
        if (innerHit === undefined)
            return outerHit;
        if (outerHit === undefined)
            return innerHit;
        return Math.min(innerHit, outerHit);
    }
    lineBlocked(start, end, ignoreId) {
        return this.firstObstacleHit(start, end, ignoreId) !== undefined;
    }
    // The line-test entry point: returns the nearest obstacle hit's parameter
    // t along the segment (or undefined). Callers that need to know WHAT was
    // hit (projectile impact flavour) use firstObstacleHitInfo instead.
    firstObstacleHit(start, end, ignoreId) {
        return this.firstObstacleHitInfo(start, end, ignoreId)?.t;
    }
    firstObstacleHitInfo(start, end, ignoreId) {
        let best;
        let bestObstacle;
        const test = (obstacle) => {
            if (obstacle.id === ignoreId)
                return;
            if (obstacle.shape === 'ring') {
                const hit = this.segmentRingHit(start, end, obstacle);
                if (hit !== undefined && (best === undefined || hit < best)) {
                    best = hit;
                    bestObstacle = obstacle;
                }
                return;
            }
            if (obstacle.shape === 'engine') {
                const hit = this.segmentEngineHit(start, end, obstacle);
                if (hit !== undefined && (best === undefined || hit < best)) {
                    best = hit;
                    bestObstacle = obstacle;
                }
                return;
            }
            // Asteroids block line of sight on their ACTUAL surface (the
            // deformed-icosahedron collision mesh), never the enclosing box —
            // the box's corners stuck out past the visible rock and ate shots
            // in open space. Debris pieces keep the box, which mirrors their
            // rendered shape exactly.
            if (obstacle.shape === 'asteroid') {
                const hit = segmentMeshHit(start, end, obstacle);
                if (hit !== undefined && (best === undefined || hit < best)) {
                    best = hit;
                    bestObstacle = obstacle;
                }
                return;
            }
            if (obstacle.box) {
                const hit = segmentBoxHit(start, end, obstacle);
                if (hit !== undefined && (best === undefined || hit < best)) {
                    best = hit;
                    bestObstacle = obstacle;
                }
                return;
            }
            const sx = start.x - obstacle.x;
            const sy = start.y - obstacle.y;
            const sz = start.z - obstacle.z;
            const clearance = obstacle.losRadius + 1.5;
            if (sx * sx + sy * sy + sz * sz < clearance * clearance)
                return;
            const hit = segmentSphereHit(start, end, { x: obstacle.x, y: obstacle.y, z: obstacle.z }, obstacle.losRadius);
            if (hit !== undefined && (best === undefined || hit < best)) {
                best = hit;
                bestObstacle = obstacle;
            }
        };
        const dock = this.activeDockObstacle();
        if (dock)
            test(dock);
        else
            this.forEachObstacleAlongSegment(start, end, test);
        return best === undefined ? undefined : { t: best, obstacle: bestObstacle };
    }
    dockCandidate() {
        const locationId = this.currentDockLocationIds().find((id) => id === this.activeInstanceId);
        if (!locationId)
            return undefined;
        const pp = this.save.player.position;
        const lp = LOCATIONS[locationId].position;
        const dx = pp[0] - lp[0];
        const dy = pp[1] - lp[1];
        const dz = pp[2] - lp[2];
        const distance = Math.hypot(dx, dy, dz);
        return distance <= (LOCATIONS[locationId].dockRadius ?? 55) ? locationId : undefined;
    }
    dockAt(locationId) {
        this.autopilot = false;
        this.afterburning = false;
        this.save.player.systemId = LOCATIONS[locationId].systemId;
        this.save.player.dockedAt = locationId;
        this.save.player.lastDockedAt = locationId;
        this.save.player.velocity = [0, 0, 0];
        this.save.player.angularVelocity = [0, 0, 0];
        this.save.player.throttle = 0;
        const stats = this.playerStats();
        this.save.player.shield = stats.shield;
        // An unlicensed (transponder-off) arrival owes the syndicate berth: the
        // concourse opens on a payment card (pay or launch back out).
        if (this.save.player.transponder === false)
            this.beginDarkArrival(locationId);
        completeMissionsAtDock(this.save, locationId).forEach((message) => this.ui.showToast(message, 'success', 6000));
        refreshMissionOffers(this.save);
        this.renderer.setCockpitVisible(false);
        this.renderer.setUtilityBeam(false, this.save.player.mode, this.save.player.position);
        this.audio.setStationMode(true);
        this.audio.play('dock');
        this.ui.hideHud();
        recordMarketVisit(this.save.world, locationId);
        this.ui.showDock(this.save, locationId);
        this.persistSave();
    }
    launch() {
        const locationId = this.save.player.dockedAt;
        if (!locationId)
            return;
        const location = LOCATIONS[locationId];
        const center = vec(location.position);
        const launchDistance = (location.dockRadius ?? location.radius * 1.7) + 8;
        // Exit pointing at the cluster of points of interest that leaves the most of
        // them directly reachable, so the body you just left never blocks the first jump.
        const obstacleRadius = location.kind === 'planet' ? location.radius + 60 : location.radius * 0.73;
        const others = this.currentNavLocationIds().filter((id) => id !== locationId);
        let direction = center.clone().normalize();
        if (direction.lengthSq() < 0.1)
            direction.set(0, 0, 1);
        let bestCount = -1;
        for (const id of others) {
            const candidate = vec(LOCATIONS[id].position).sub(center).normalize();
            const point = center.clone().addScaledVector(candidate, launchDistance);
            let reachable = 0;
            for (const targetId of others) {
                if (segmentSphereHit(point, vec(LOCATIONS[targetId].position), center, obstacleRadius) === undefined)
                    reachable += 1;
            }
            if (reachable > bestCount) {
                bestCount = reachable;
                direction = candidate;
            }
        }
        const orientation = new THREE.Quaternion().setFromUnitVectors(FORWARD, direction);
        const position = center.clone().addScaledVector(direction, launchDistance);
        this.save.player.position = tuple(position);
        this.save.player.rotation = quatTuple(orientation);
        this.save.player.velocity = tuple(direction.clone().multiplyScalar(6));
        this.save.player.angularVelocity = [0, 0, 0];
        this.save.player.throttle = 0.18;
        this.save.player.dockedAt = undefined;
        // The syndicate receipt and any unpaid pending berth fee cover only the
        // visit they belong to — launching clears both.
        delete this.save.world.syndicateArrival;
        delete this.save.world.syndicatePending;
        // The body you just left is no longer the target: clear the selection so the
        // target monitor doesn't offer to hyperdrive back to the station you're
        // already standing next to. If the nav point was that location, reset it to
        // the default vector instead of keeping a dead "already inside drop zone".
        if (this.save.player.currentTargetId === locationId)
            this.clearTarget();
        if (this.save.player.navTargetId === locationId)
            this.save.player.navTargetId = DEFAULT_NAV_LOCATION_BY_SYSTEM[this.save.player.systemId] ?? this.currentNavLocationIds()[0];
        this.resetPlayerInterpolation(true);
        this.renderer.setCockpitVisible(true);
        this.audio.setStationMode(false);
        this.ui.hideDock();
        this.ui.showHud();
        this.ui.pushEvent(t('Cleared for departure from {name}.', { name: location.name }), 'success');
        this.updateActiveInstance(true);
        this.persistSave();
    }
    setNav(locationId, options = {}) {
        if (!LOCATIONS[locationId] || LOCATIONS[locationId].systemId !== this.save.player.systemId)
            return false;
        if (!options.preservePlan) {
            this.save.world.plannedSystemId = null;
            this.save.world.plannedDestinationId = null;
        }
        this.save.player.navTargetId = locationId;
        this.autopilot = false;
        this.ui.pushSensor(t('NAV set: {name}.', { name: LOCATIONS[locationId].name }), 'info');
        this.audio.play('ui');
        return true;
    }
    trade(kind, commodityId, quantity) {
        const dock = this.save.player.dockedAt;
        if (!dock)
            return;
        if (!this.dockHasService('market')) {
            this.ui.showToast(t('No commodity market is available at this dock.'), 'warning');
            return;
        }
        const den = kind === 'den-buy' || kind === 'den-sell';
        let price;
        if (den) {
            // The den only moves restricted goods: legal cargo gets a refusal
            // instead of a price. Its quote rides the station's live market
            // price (denPrice applies the untraceable premium on top).
            price = denPrice(dock, commodityId, this.save.world.market[dock][commodityId], this.save.world.seed, this.save.world.economyClock);
            if (price === undefined) {
                this.ui.showToast(t('The den does not trade legal goods.'), 'warning');
                this.audio.play('warning', 0.55);
                return;
            }
        }
        const result = kind === 'buy' || kind === 'den-buy'
            ? buyCommodity(this.save, dock, commodityId, quantity, price)
            : sellCommodity(this.save, dock, commodityId, quantity, price);
        if (result.ok)
            recordMarketVisit(this.save.world, dock);
        const goldHeatNote = result.ok && commodityId === 'gold' ? t(' The board marks the sale — expect company on the Shardbelt lanes.') : '';
        const denNote = result.ok && den ? t(' The den pays untraceable — no manifest entry.') : '';
        const holdNote = result.ok ? t(' Hold: {used}/{capacity} mass.', { used: result.postCargoMass.toFixed(1), capacity: cargoCapacity(this.save.player) }) : '';
        this.ui.showToast(result.message + (result.ok ? ` ${formatCredits(result.total)}.${holdNote}${goldHeatNote}${denNote}` : ''), result.ok ? 'success' : 'warning');
        this.audio.play(result.ok ? 'ui' : 'warning', 0.55);
        this.ui.refreshDock(this.save);
        this.persistSave();
    }
    acceptMission(missionId) {
        const dock = this.save.player.dockedAt;
        if (!dock)
            return;
        if (missionId?.startsWith?.('race-'))
            return this.acceptRace(missionId.slice(5));
        const result = acceptMission(this.save, dock, missionId);
        this.ui.showToast(result.message, result.ok ? 'success' : 'warning', result.ok ? 4300 : 3200);
        this.audio.play(result.ok ? 'success' : 'warning', 0.7);
        this.ui.refreshDock(this.save);
        this.persistSave();
    }
    acceptRace(courseId) {
        if (this.activeRace && this.activeRace.state !== 'finished' && this.activeRace.state !== 'failed') {
            this.ui.showToast(t('You already have a race entry on the books.'), 'warning');
            return;
        }
        if (this.activeRace)
            this.endRaceField();
        const course = generateRaceCourse(courseId, this.save.world.seed);
        if (!course)
            return;
        const expectedOrigin = typeof course.origin === 'string'
            ? course.origin
            : course.origin?.id ?? (course.zone === 'shardbelt' ? 'helix' : course.zone === 'mourning-line' ? 'rook' : undefined);
        if (expectedOrigin && this.save.player.dockedAt !== expectedOrigin) {
            this.ui.showToast(t('Race entries are accepted only at {origin}.', { origin: LOCATIONS[expectedOrigin]?.name ?? expectedOrigin.toUpperCase() }), 'warning');
            return;
        }
        if (typeof raceCourseUnlocked === 'function' && !raceCourseUnlocked(courseId, this.save.world.raceRecords ?? {})) {
            this.ui.showToast(t('That course is still locked. Finish the earlier circuit first.'), 'warning');
            return;
        }
        if (this.save.player.credits < course.entryFee) {
            this.ui.showToast(t('Not enough credits for the race entry.'), 'warning');
            return;
        }
        const now = this.save.world.time;
        this.save.player.credits -= course.entryFee;
        // Races are repeatable. Reset the prior quest run's transient flags so
        // a completion/forfeit cannot leak its course or deadline into a new
        // ticket, while the separate race record keeps the personal best.
        const quest = startQuest(this.save, RACE_QUEST_ID, now);
        quest.stepId = 'travel';
        quest.flags = {};
        quest.choices = {};
        quest.startedAt = now;
        quest.completedAt = undefined;
        setStep(this.save, RACE_QUEST_ID, 'travel');
        setFlag(this.save, RACE_QUEST_ID, 'courseId', courseId);
        setFlag(this.save, RACE_QUEST_ID, 'paid', true);
        setFlag(this.save, RACE_QUEST_ID, 'deadline', now + course.deadlineSeconds);
        this.save.world.raceRecords ??= {};
        const prior = normalizeRaceRecord(this.save.world.raceRecords[course.id]);
        this.save.world.raceRecords[course.id] = { ...prior, active: true };
        delete this.save.world.raceRecords[course.id].failed;
        const racers = createRaceRacers(course, this.save.world.seed, now);
        const staged = typeof stageRaceRacers === 'function' ? stageRaceRacers(racers, course) : racers;
        const liveRacers = Array.isArray(staged) && staged.length === 3 ? staged : racers;
        this.ships = this.ships.filter((ship) => !ship.race);
        this.ships.push(...liveRacers);
        this.activeRace = this.createRaceState(course, liveRacers, now + course.deadlineSeconds);
        // The approach shows exactly one gathering marker. Course gates stay
        // hidden until the player arrives, while all three racers are already
        // present in the same ships array used by rendering and radar.
        this.renderer.clearRaceGates();
        this.renderer.syncRaceStart?.(this.raceGathering(course), 'travel');
        this.save.player.currentTargetId = this.raceGathering(course).id;
        this.ui.showToast(t('{course} entry paid. Fly to the {zone} gathering marker.', { course: course.title, zone: LOCATIONS[course.zone].name.toUpperCase() }), 'success', 6200);
        if (LOCATIONS[course.zone])
            this.save.player.navTargetId = course.zone;
        this.ui.refreshDock(this.save);
        this.persistSave();
    }
    // Grid start: reuse the three racers staged at acceptance, place the player
    // in the authored gathering slot, then reveal the fixed course.
    startRaceAt(course) {
        const race = this.activeRace;
        if (!race || race.course !== course)
            return;
        const racers = Array.isArray(race.racers) ? race.racers : [];
        if (racers.length !== 3)
            return;
        const staged = typeof stageRaceRacers === 'function' ? stageRaceRacers(racers, course) : racers;
        const liveRacers = Array.isArray(staged) && staged.length === 3 ? staged : racers;
        race.racers = liveRacers;
        // Keep ambient traffic out of the course, but retain the exact racer
        // objects created during acceptance (no replacement grid ships).
        this.ships = this.ships.filter((ship) => liveRacers.includes(ship));
        for (const racer of liveRacers)
            if (!this.ships.includes(racer))
                this.ships.push(racer);
        const player = this.save.player;
        const gate0 = course.gates[0];
        const gathering = this.raceGathering(course);
        const gatePos = vec(gate0.position, this.tmpRaceGoalVector);
        let start = this.raceGridSlot(gathering, this.tmpEntryAnchor);
        const outward = this.raceGatheringDirection(course, this.tmpEntryDirection);
        if (!start) {
            // Legacy authored courses have no explicit grid array. Keep the
            // player in the gathering formation beside the staged racers rather
            // than falling back to the first course gate far away.
            start = this.tmpEntryAnchor.copy(this.raceGatheringPosition(course)).addScaledVector(outward, -30);
            const side = this.tmpEntryLocal.crossVectors(outward, UP);
            if (side.lengthSq() < 1e-8)
                side.set(1, 0, 0);
            start.addScaledVector(side.normalize(), 24);
        }
        this.ensurePlayerEntryClearance(start, course.zone, outward);
        player.dockedAt = undefined;
        player.position[0] = start.x;
        player.position[1] = start.y;
        player.position[2] = start.z;
        player.velocity[0] = 0;
        player.velocity[1] = 0;
        player.velocity[2] = 0;
        player.angularVelocity[0] = 0;
        player.angularVelocity[1] = 0;
        player.angularVelocity[2] = 0;
        player.throttle = 0;
        const towardGate = this.tmpEntryLocalDirection.copy(gatePos).sub(start);
        if (towardGate.lengthSq() < 1e-8)
            towardGate.copy(outward);
        towardGate.normalize();
        quatTupleInto(player.rotation, this.tmpQ.setFromUnitVectors(FORWARD, towardGate));
        player.currentTargetId = gate0.id;
        player.raceGateIndex = 0;
        this.resetPlayerInterpolation(true);
        this.projectiles = [];
        this.pickups = [];
        Object.assign(this.activeRace, {
            state: 'countdown',
            startedAt: this.save.world.time + 4,
            playerStartTime: undefined,
            playerRank: 4,
            lastCountdown: 99,
            playerSplits: [],
            shortcut: undefined,
        });
        this.autopilot = false;
        this.afterburning = false;
        this.renderer.setCockpitVisible(true);
        this.renderer.clearRaceStart?.();
        this.syncRaceCourse(this.activeRace);
        this.audio.setStationMode(false);
        this.ui.hideDock();
        this.ui.showHud();
        this.ui.pushEvent(t('{course} · FOUR SHIPS · PASS ALL {count} GATES', { course: course.title.toUpperCase(), count: course.gates.length }), 'info', 6200);
    }
    repair() {
        if (!this.dockHasService('repair')) {
            this.ui.showToast(t('Repair service is not available at this dock.'), 'warning');
            return;
        }
        const cost = repairCost(this.save.player);
        if (cost <= 0)
            return;
        if (this.save.player.credits < cost) {
            this.ui.showToast(t('Insufficient credits for full repair.'), 'warning');
            return;
        }
        const stats = this.playerStats();
        this.save.player.credits -= cost;
        this.save.player.hull = stats.hull;
        this.ui.showToast(t('Repair complete. {credits} charged.', { credits: formatCredits(cost) }), 'success');
        this.audio.play('success');
        this.ui.refreshDock(this.save);
        this.persistSave();
    }
    refuel() {
        if (!this.dockHasService('fuel')) {
            this.ui.showToast(t('Fuel service is not available at this dock.'), 'warning');
            return;
        }
        const cost = refillCost(this.save.player);
        if (cost <= 0)
            return;
        if (this.save.player.credits < cost) {
            this.ui.showToast(t('Insufficient credits for full refill.'), 'warning');
            return;
        }
        const stats = this.playerStats();
        this.save.player.credits -= cost;
        this.save.player.fuel = stats.fuel;
        this.save.player.missiles = stats.missileCapacity;
        // Weapon ammo pools top up with the ordnance (pricing in shipStats.refillCost).
        // Only ammo-fed guns installed on this hull get refilled; locker stock
        // is not a reason to charge the pilot at the service desk.
        if (!this.save.player.ammo)
            this.save.player.ammo = {};
        const loadout = this.save.player.outfitting?.loadouts?.[this.save.player.shipId];
        const spec = HULL_HARDPOINTS[this.save.player.shipId];
        if (loadout && spec) {
            for (const id of loadout.guns ?? []) {
                const weaponId = weaponIdForOutfit(id);
                const ammoId = weaponId ? WEAPONS[weaponId]?.ammoId : undefined;
                if (ammoId)
                    this.save.player.ammo[ammoId] = AMMO_CAPACITY[ammoId];
            }
        }
        this.ui.showToast(t('Fuel and ordnance loaded. {credits} charged.', { credits: formatCredits(cost) }), 'success');
        this.audio.play('success');
        this.ui.refreshDock(this.save);
        this.persistSave();
    }
    previewOutfitting(shipId, draft, options = {}) {
        return quoteOutfitting(this.save.player, shipId, draft, {
            ...options,
            locationId: options.locationId ?? this.save.player.dockedAt,
            cargoMass: options.cargoMass ?? cargoMass(this.save.player),
        });
    }
    applyOutfitting(shipId, draftOrQuote, options = {}) {
        if (!this.save.player.dockedAt) {
            this.ui.showToast?.(t('DOCK TO REFIT'), 'warning');
            return { ok: false, code: 'not-docked' };
        }
        if (!this.dockHasService('outfitting')) {
            this.ui.showToast?.(t('Outfitting is not available at this dock.'), 'warning');
            return { ok: false, code: 'service-unavailable' };
        }
        // Accept applyOutfitting(quote) as well as the UI's
        // applyOutfitting(shipId, draft, options) shape.
        let targetShipId = shipId;
        let staged = draftOrQuote;
        if (typeof shipId !== 'string') {
            staged = shipId;
            targetShipId = staged?.shipId ?? this.save.player.shipId;
        }
        const beforeStats = targetShipId === this.save.player.shipId ? this.playerStats() : undefined;
        const quote = staged?.quote?.afterState ? staged.quote : staged?.afterState ? staged : this.previewOutfitting(targetShipId, staged, options);
        if (!quote?.ok) {
            const code = quote?.code ?? 'invalid-quote';
            const message = code === 'insufficient-credits'
                ? t('Insufficient credits.')
                : code === 'mass-over-budget'
                        ? t('Fitting mass exceeded.')
                        : code === 'cargo-over-capacity'
                            ? t('Current cargo would exceed the new capacity.')
                            : code === 'stale-quote'
                                ? t('The fitting changed; review and apply again.')
                                : t('Fitting could not be applied.');
            this.ui.showToast?.(message, 'warning');
            return { ok: false, code, quote };
        }
        const result = commitOutfitting(this.save.player, quote, {
            locationId: this.save.player.dockedAt,
            cargoMass: cargoMass(this.save.player),
        });
        if (!result.ok) {
            this.ui.showToast?.(result.code === 'stale-quote' ? t('The fitting changed; review and apply again.') : t('Fitting could not be applied.'), 'warning');
            return { ...result, quote };
        }
        this._statsDirty = true;
        const afterStats = targetShipId === this.save.player.shipId ? this.playerStats() : undefined;
        if (beforeStats && afterStats) {
            // A refit changes the ceiling, not the live condition. Preserve
            // damage while fitting a larger grid; only clamp values that no
            // longer fit after an upgrade is removed. Repair/refill remains a
            // separate paid service at the berth.
            this.save.player.shield = clamp(this.save.player.shield, 0, afterStats.shield);
            this.save.player.hull = clamp(this.save.player.hull, 0, afterStats.hull);
            this.save.player.energy = clamp(this.save.player.energy, 0, afterStats.energyCapacity);
            this.save.player.missiles = clamp(this.save.player.missiles, 0, afterStats.missileCapacity);
            this.syncActiveShipState();
            this.syncWeaponProjection();
        }
        this.ui.showToast?.(t('Outfitting applied.'), 'success');
        this.ui.refreshDock?.(this.save);
        this.audio.play('success');
        this.persistSave();
        return { ok: true, code: 'committed', quote, result, credits: this.save.player.credits };
    }
    buyEquipment(equipmentId) {
        if (!this.save.player.dockedAt) {
            this.ui.showToast?.(t('DOCK TO REFIT'), 'warning');
            return { ok: false, code: 'not-docked' };
        }
        if (!this.dockHasService('outfitting')) {
            this.ui.showToast?.(t('Outfitting is not available at this dock.'), 'warning');
            return { ok: false, code: 'service-unavailable' };
        }
        const item = outfitItem(equipmentId);
        if (!item) {
            this.ui.showToast?.(t('Unknown module.'), 'warning');
            return { ok: false, code: 'unknown-item' };
        }
        const shipId = this.save.player.shipId;
        normalizeOutfitting(this.save.player);
        const loadout = loadoutFor(this.save.player, shipId);
        const spec = HULL_HARDPOINTS[shipId];
        const key = item.category === 'gun' ? 'guns' : item.category === 'launcher' ? 'launchers' : item.category;
        const mounts = spec?.[key] ?? [];
        const index = mounts.findIndex((mount, mountIndex) => !loadout[key]?.[mountIndex] && itemFitsMount(item, mount));
        if (index < 0) {
            this.ui.showToast?.(t('No compatible empty hardpoint.'), 'warning');
            return { ok: false, code: 'no-compatible-mount' };
        }
        loadout[key][index] = item.id;
        return this.applyOutfitting(shipId, loadout, { locationId: this.save.player.dockedAt });
    }
    buyShip(shipId) {
        const dock = this.save.player.dockedAt;
        if (!this.dockHasService('shipyard')) {
            this.ui.showToast(t('No shipyard is available at this dock.'), 'warning');
            return { ok: false, code: 'service-unavailable' };
        }
        if (!dock || !(LOCATIONS[dock].shipsForSale ?? []).includes(shipId)) {
            this.ui.showToast(t('That hull is not for sale at this location.'), 'warning');
            return { ok: false, code: 'not-for-sale' };
        }
        const ship = SHIPS[shipId];
        if (this.save.player.shipId === shipId)
            return { ok: false, code: 'already-owned' };
        const carriedMass = cargoMass(this.save.player);
        const quote = quoteShipTrade(this.save.player, shipId, { cargoMass: carriedMass });
        if (!quote.ok) {
            const message = quote.code === 'insufficient-credits'
                ? t('Insufficient credits after trade-in.')
                : quote.code === 'cargo-over-capacity'
                    ? t('Current cargo exceeds the new hull capacity.')
                    : t('Ship trade could not be completed.');
            this.ui.showToast(message, 'warning');
            return quote;
        }
        const result = commitShipTrade(this.save.player, quote, { cargoMass: carriedMass });
        if (!result.ok) {
            this.ui.showToast(t('Ship trade changed; review it again.'), 'warning');
            return result;
        }
        this._statsDirty = true;
        this.ui.setCockpitShip(shipId);
        this.initializeCommissionedShipState(this.playerStats());
        this.syncWeaponProjection();
        this.ui.showToast(t('{name} commissioned. Your old hull was credited at 50% value.', { name: ship.name }), 'success', 6200);
        this.audio.play('success', 1.4);
        this.ui.refreshDock(this.save);
        this.persistSave();
        return { ok: true, code: 'traded', shipId, quote: result.quote };
    }
    switchShip(shipId) {
        const player = this.save.player;
        return player.shipId === shipId && player.ownedShips?.length === 1;
    }
    joinGuild(guildId) {
        const result = joinGuild(this.save, guildId);
        this.ui.showToast(result.message, result.ok ? 'success' : 'warning');
        this.audio.play(result.ok ? 'success' : 'warning', 0.7);
        this.ui.refreshDock(this.save);
        this.persistSave();
    }
    openMap() {
        if (this.save.player.dockedAt)
            return;
        this.ui.showMap(this.buildNavigationMapModel());
    }
    toggleTransponder() {
        if (this.save.player.dockedAt)
            return;
        const dark = this.save.player.transponder !== false;
        this.save.player.transponder = !dark;
        this.ui.pushSensor(dark ? t('Transponder offline — dark to sensors. Slow to half speed to hide best.') : t('Transponder online — full sensor signature.'), dark ? 'warning' : 'success', 4200);
        this.audio.play('ui');
        this.persistSave();
    }
    saveNow() {
        const ok = this.persistSave();
        this.ui.showToast(ok ? t('Career state saved locally.') : t('Save failed in this browser context.'), ok ? 'success' : 'danger');
    }
    resumeFlight() {
        this.ui.hidePause();
        this.ui.hideMap();
        this.ui.hideShipMenu();
        this.ui.hideChatLog?.();
    }
    openShipMenu() {
        if (this.save.player.dockedAt)
            return;
        this.ui.showShipMenu();
    }
    quitToTitle() {
        this.persistSave();
        this.dispose();
        this.onQuit();
    }
    setSetting(key, value) {
        if (key === 'music' || key === 'effects' || key === 'touchScale') {
            this.save.settings[key] = Number(value);
        }
        else if (key === 'tiltSensitivity') {
            this.save.settings.tiltSensitivity = Number(value);
            this.input.configureTilt({ tiltSensitivity: this.save.settings.tiltSensitivity });
        }
        else if (key === 'steering') {
            this.save.settings.steering = value === 'stick' ? 'stick' : 'tilt';
            this.syncTiltSteering(this.save.settings.steering === 'tilt');
        }
        else if (key === 'tiltInvertPitch' || key === 'tiltInvertYaw') {
            this.save.settings[key] = Boolean(value);
            this.input.configureTilt({ [key]: this.save.settings[key] });
        }
        else if (key === 'flightAssist' || key === 'aimAssist' || key === 'vibration') {
            this.save.settings[key] = Boolean(value);
        }
        else if (key === 'quality' && (value === 'auto' || value === 'low' || value === 'high')) {
            this.save.settings.quality = value;
            // Apply the tier (640/720/1280 base) as well as the scale; 'auto'
            // restores the full resolution and lets the governor manage it.
            this.renderer.setQualityMode(value);
            this.qualityScale = value === 'low' ? 0.72 : 1;
            this.renderer.setQualityScale(this.qualityScale);
        }
        else if (key === 'language' && (value === 'de' || value === 'en')) {
            this.save.settings.language = value;
            setLanguage(value);
        }
        this.audio.setVolumes(this.save.settings.music, this.save.settings.effects);
        this.ui.setTouchScale(this.save.settings.touchScale);
        this.persistSave();
        // A language change reloads the page so the static HUD/title shell is
        // rebuilt in the new language; the save (position included) is already
        // persisted above, so the pilot resumes where they were.
        if (key === 'language' && typeof location !== 'undefined')
            location.reload();
    }
    syncTiltSteering(useTilt) {
        if (useTilt) {
            void this.input.enableTilt().then((active) => {
                if (active) {
                    const neutral = this.input.calibrateTilt();
                    // Persist the neutral alongside the mode (mirroring
                    // enableTilt) so a reload keeps tilt instead of falling
                    // back to the stick with no saved neutral.
                    this.save.settings.tiltNeutral = neutral;
                }
                // If permission was refused (or there is no gyro), fall back to
                // the stick and keep the persisted setting honest instead of
                // leaving the pause menu showing a tilt mode that never engaged.
                const mode = this.input.tiltActive ? 'tilt' : 'stick';
                this.save.settings.steering = mode;
                this.ui.setTouchSteering(mode);
                this.persistSave();
            });
        }
        else {
            // Actually switch off tilt input, not just the touch layout — the
            // joystick was appearing while tilt still steered the ship.
            this.input.disableTilt();
            this.save.settings.steering = 'stick';
            this.ui.setTouchSteering('stick');
        }
    }
    enableTilt() {
        return this.input.enableTilt().then((active) => {
            const neutral = active ? this.input.calibrateTilt() : undefined;
            this.save.settings.steering = this.input.tiltActive ? 'tilt' : 'stick';
            if (active)
                this.save.settings.tiltNeutral = neutral;
            this.ui.setTouchSteering(this.input.tiltActive ? 'tilt' : 'stick');
            this.persistSave();
            return this.input.tiltActive;
        });
    }
    calibrateTilt() {
        const neutral = this.input.calibrateTilt();
        this.save.settings.tiltNeutral = neutral;
        this.persistSave();
        return neutral;
    }
    syncRender(dt, now) {
        const stats = this.playerStats();
        const vv = this.save.player.velocity;
        const speed = Math.hypot(vv[0], vv[1], vv[2]);
        const fxState = this.hyperdriveFxState();
        // Interpolation fraction: where the next sim step sits between the last
        // completed step (prev*) and the current state. Zero when docked/paused.
        const alpha = clamp(this.simAccumulator / SIM_STEP, 0, 1);
        this.renderer.setHyperdriveFx(fxState.fx, fxState.progress);
        this.renderer.updateCamera(this.save.player.position, this.save.player.prevPosition, this.save.player.rotation, this.save.player.prevRotation, this.save.player.angularVelocity, clamp(speed / Math.max(1, stats.afterburnSpeed), 0, 2), this.afterburning || (this.autopilot && speed > stats.afterburnSpeed), dt, alpha);
        this.renderer.setDamageWarning(1 - this.save.player.hull / stats.hull);
        this.renderer.syncShips(this.ships, alpha);
        this.renderer.syncProjectiles(this.projectiles, this.projStore, alpha);
        this.renderer.syncPickups(this.pickups, this.pickupStore, alpha);
        this.renderer.render();
        if (!this.save.player.dockedAt && now - this.lastHudUpdate > 42) {
            this.lastHudUpdate = now;
            this.ui.updateHud(this.buildHudModel());
        }
        if (this.save.settings.quality === 'auto') {
            // Respond fast and deep: a dense debris field can halve a phone's
            // frame rate in a single step, and the old 2.5s / -0.08 reaction
            // left a long slideshow before resolution dropped. 1.2s windows,
            // larger steps, and a 0.5 floor catch the slowdown quickly.
            this.fpsAccumulator += dt;
            this.fpsFrames += 1;
            if (this.fpsAccumulator > 1.2) {
                const fps = this.fpsFrames / this.fpsAccumulator;
                if (fps < 45)
                    this.qualityScale = Math.max(0.5, this.qualityScale - 0.15);
                else if (fps > 56)
                    this.qualityScale = Math.min(1, this.qualityScale + 0.04);
                this.renderer.setQualityScale(this.qualityScale);
                this.fpsAccumulator = 0;
                this.fpsFrames = 0;
            }
        }
    }
    targetEdge(projection) {
        if (projection.visible && !projection.behind)
            return undefined;
        const width = this.renderer.viewportWidth;
        const height = this.renderer.viewportHeight;
        const cx = width / 2;
        const cy = height / 2;
        let vx = projection.x - cx;
        let vy = projection.y - cy;
        if (projection.behind) {
            vx = -vx;
            vy = -vy;
        }
        // The off-screen arrow is 84px across (see .target-edge-pointer); the
        // clamp keeps its center 69px from the edge so the whole pointer —
        // chevron, halo, and distance label — stays on screen.
        const margin = 69;
        const halfW = Math.max(1, width / 2 - margin);
        const halfH = Math.max(1, height / 2 - margin);
        let t = Number.POSITIVE_INFINITY;
        if (vx > 0.0001)
            t = Math.min(t, halfW / vx);
        else if (vx < -0.0001)
            t = Math.min(t, -halfW / vx);
        if (vy > 0.0001)
            t = Math.min(t, halfH / vy);
        else if (vy < -0.0001)
            t = Math.min(t, -halfH / vy);
        if (!Number.isFinite(t))
            t = 1;
        const angle = Math.atan2(vy, vx);
        return { x: cx + vx * t, y: cy + vy * t, angleDeg: (angle * 180) / Math.PI + 90 };
    }
    buildHudModel() {
        const stats = this.playerStats();
        const player = vec(this.save.player.position, this.tmpShipPlayer);
        const vv = this.save.player.velocity;
        const speed = Math.hypot(vv[0], vv[1], vv[2]);
        const nav = LOCATIONS[this.save.player.navTargetId];
        const target = this.getTargetRef();
        let hudTarget;
        if (target) {
            // Project the exact rendered transform. Moving contacts are drawn
            // between sim steps; using their newer raw state made the bracket
            // lead and wiggle around the visible target while steering.
            const projection = this.renderer.projectTargetToScreen(target.kind, target.id, target.position);
            const edge = this.targetEdge(projection);
            const distance = this.surfaceDistance(player, target);
            const screen = { screenX: projection.x, screenY: projection.y, onScreen: projection.visible && !projection.behind, edge };
            if (target.kind === 'ship') {
                const ship = this.ships.find((entry) => entry.id === target.id);
                const targetForward = FORWARD.clone().applyQuaternion(quat(ship.rotation, this.tmpRadarInv));
                const playerInv = quat(this.save.player.rotation, this.tmpRadarInv).invert();
                const targetLocal = targetForward.clone().applyQuaternion(playerInv);
                const heading = Math.atan2(targetLocal.x, -targetLocal.z);
                const claimable = ship.surrendered && !ship.claimed && !ship.captured && ship.hull > 0 && (ship.bountyValue > 0 || ship.missionId);
                const captureAvailable = claimable && distance <= stats.scanRange;
                const surrenderReadout = ship.captured
                    ? t('CAPTURED · HULL DRIFTING')
                    : claimable
                        ? captureAvailable
                            ? t('SURRENDERED · CLAIM READY')
                            : t('SURRENDERED · APPROACH TO CLAIM')
                        : t('SURRENDERED · NO CLAIM');
                hudTarget = {
                    kind: 'ship',
                    name: ship.name,
                    hostile: ship.hostile,
                    surrendered: ship.surrendered,
                    captured: ship.captured,
                    captureClaimable: Boolean(claimable),
                    captureAvailable,
                    variant: ship.variant ?? shipVariantForRole(ship.role),
                    heading,
                    subtitle: `${this.shipRoleLabel(ship)} · ${ship.surrendered ? t('SURRENDERED') : ship.hostile ? t('HOSTILE') : t(FACTION_LABEL(ship.faction))}${this.save.world.time < (ship.distressUntil ?? 0) ? ` · ${t('DISTRESS')}` : ''}`,
                    // The monitor's readout line carries the pilot profile so a
                    // locked target's habits are visible at a glance — job and
                    // skill tier, prefixed with the recognition marker when the
                    // pilot remembers the player (spared or escaped). Temperament
                    // stays off the HUD: it reads through behavior and comms.
                    readout: ship.captured || ship.surrendered
                        ? surrenderReadout
                        : ship.scanned
                            ? `${this.shipTaskLabel(ship)}${ship.pilot ? ` · ${ship.recognizesPlayer ? `${SPARED_MARK} ` : ''}${t(TIER_LABELS[ship.pilot.tier] ?? ship.pilot.tier)}` : ''}`
                            : distance > stats.scanRange
                                ? t('OUT OF RANGE · {current}/{max} km', { current: Math.round(distance), max: stats.scanRange })
                                : t('SCANNING…'),
                    distance,
                    clipFlash: this.save.world.time < this.targetClipUntil,
                    shield: ship.shield,
                    maxShield: ship.maxShield,
                    hull: ship.hull,
                    maxHull: ship.maxHull,
                    ...screen,
                };
            }
            else if (target.kind === 'asteroid') {
                const node = this.asteroids.find((entry) => entry.id === target.id);
                const claim = this.activeMiningClaim(node.id);
                const scanStatus = node.scanned
                    ? claim
                        ? t('CLAIM · {current}/{total} MINED', { current: claim.mined ?? 0, total: claim.quantity })
                        : t('ORE · {amount} LEFT', { amount: Math.ceil(node.remaining) })
                    : distance > stats.scanRange
                        ? t('OUT OF RANGE · {current}/{max} km', { current: Math.round(distance), max: stats.scanRange })
                        : t('SCANNING…');
                hudTarget = { kind: 'asteroid', name: target.name, subtitle: node.scanned ? (claim ? t('MINING CLAIM') : t('ORE')) : t('MINERAL SIGNATURE'), distance, scanned: node.scanned, readout: this.utilityReadout || scanStatus, ...screen };
            }
            else if (target.kind === 'wreck') {
                const node = this.wreckNodes.find((entry) => entry.id === target.id);
                const commodity = SCAN_COMMODITY_LABELS[node.salvage] ?? COMMODITIES[node.salvage].name.toUpperCase();
                // Scanned wrecks report only commodity + recoveries left.
                const scanStatus = node.scanned
                    ? t('{commodity} · {amount} LEFT', { commodity: t(commodity), amount: Math.ceil(node.remaining) })
                    : distance > stats.scanRange
                        ? t('OUT OF RANGE · {current}/{max} km', { current: Math.round(distance), max: stats.scanRange })
                        : t('SCANNING…');
                hudTarget = { kind: 'wreck', name: node.name, subtitle: node.scanned ? t(commodity) : t('UNRESOLVED WRECK'), distance, scanned: node.scanned, readout: this.utilityReadout || scanStatus, ...screen };
            }
            else if (target.kind === 'pickup') {
                const pickup = this.pickups.find((entry) => entry.id === target.id);
                const amount = pickup?.amount ?? 1;
                hudTarget = {
                    kind: 'pickup',
                    name: target.name,
                    subtitle: t('EJECTED CARGO'),
                    distance,
                    readout: pickup?.commodity === 'credits' ? formatCredits(amount) : `${amount} ${t('UNITS')}`,
                    ...screen,
                };
            }
            else if (target.kind === 'gate') {
                const found = this.raceGateById(target.id);
                if (found) {
                    const nextIndex = this.save.player.raceGateIndex ?? 0;
                    const passed = found.index < nextIndex;
                    hudTarget = {
                        kind: 'gate',
                        name: found.gathering
                            ? t('RACE START · {course}', { course: t(found.course.title) })
                            : t('GATE {n}/{total}', { n: found.index + 1, total: found.course.gates.length }),
                        subtitle: found.gathering
                            ? `${t(found.course.title.toUpperCase())} · ${t('START LINE')}`
                            : `${t(found.course.title.toUpperCase())} · ${t('RACE CHECKPOINT')}`,
                        distance,
                        objectKind: 'gate',
                        readout: found.gathering
                            ? t('GATHERING POINT · LINE UP TO START')
                            : passed
                            ? t('GATE CLEARED')
                            : found.index === nextIndex
                                ? t('NEXT CHECKPOINT · FLY THROUGH')
                                : t('UPCOMING CHECKPOINT'),
                        ...screen,
                    };
                }
            }
            else {
                const location = LOCATIONS[target.id];
                hudTarget = {
                    kind: 'location',
                    name: location.name,
                    subtitle: `${t(location.kind.toUpperCase())} · ${t('NAV POINT')}`,
                    objectKind: location.kind,
                    distance,
                    scanned: this.save.player.discovered.includes(location.id),
                    ...screen,
                };
                // POIs carry no readout card — the target monitor shows name and distance.
            }
        }
        const dock = this.dockCandidate();
        const dockTargeted = Boolean(dock && this.save.player.currentTargetId === dock);
        // The target monitor teaches the order explicitly: first lock the
        // location, then slow down. Short phrases stay intact on phone glass.
        let dockPrompt;
        if (dock && !this.save.player.currentTargetId) {
            dockPrompt = LOCATIONS[dock].kind === 'planet'
                ? t('LOCK {location} · LAND', { location: LOCATIONS[dock].shortName })
                : t('LOCK {location} · DOCK', { location: LOCATIONS[dock].shortName });
        }
        else if (dockTargeted && speed > AUTO_DOCK_SPEED) {
            dockPrompt = LOCATIONS[dock].kind === 'planet'
                ? t('SLOW TO LAND')
                : t('SLOW TO DOCK');
        }
        const mug = this.activeMug();
        const standoff = mug ? {
            kind: mug.demand.kind,
            label: mug.demand.kind === 'cargo'
                ? `${mug.demand.quantity} × ${SCAN_COMMODITY_LABELS[mug.demand.commodity] ?? COMMODITIES[mug.demand.commodity].name.toUpperCase()}`
                : formatCredits(mug.demand.amount),
            seconds: mug.secondsLeft,
        } : undefined;
        return {
            speed: this.autopilot ? speed / (HYPERDRIVE_CRUISE_SPEED / HYPERDRIVE_DISPLAY_SPEED) : displaySpeed(speed),
            maxSpeed: this.autopilot ? HYPERDRIVE_DISPLAY_SPEED : displaySpeed(this.afterburning && speed >= 0.9 * stats.maxSpeed ? stats.afterburnSpeed : stats.maxSpeed),
            throttle: this.save.player.throttle,
            afterburner: this.afterburning,
            fuel: this.save.player.fuel,
            maxFuel: stats.fuel,
            shield: this.save.player.shield,
            maxShield: stats.shield,
            hull: this.save.player.hull,
            maxHull: stats.hull,
            energy: this.save.player.energy,
            maxEnergy: stats.energyCapacity,
            missiles: this.save.player.missiles,
            maxMissiles: stats.missileCapacity,
            weaponRoster: WEAPON_ORDER.map((id) => ({
                id,
                name: t(WEAPONS[id].nameKey),
                envelope: t(WEAPONS[id].envelopeKey, { range: Math.round(WEAPONS[id].speed * WEAPONS[id].life) }),
                slot: WEAPONS[id].slot,
                owned: weaponOwned(this.save.player, id),
            })),
            cargo: cargoMass(this.save.player),
            cargoCapacity: cargoCapacity(this.save.player),
            credits: this.save.player.credits,
            mode: this.save.player.mode,
            shipName: SHIPS[this.save.player.shipId].name,
            shipId: this.save.player.shipId,
            playerVariant: playerShipVariant(this.save.player.shipId),
            navName: nav.shortName,
            navDistance: player.distanceTo(this.tmpRadarPos.set(nav.position[0], nav.position[1], nav.position[2])),
            autopilot: this.autopilot,
            hyperdrive: this.hyperdriveFxState(),
            hyperdriveStatus: this.save.world.time < this.hyperdriveStatusUntil ? this.hyperdriveStatus : undefined,
            // No hyperdriveCooldown field: the post-intercept calm window only
            // suppresses new ambushes (see toggleHyperdrive) and never blocks the
            // drive, so the card has nothing to count down.
            // Never advertise READY through a drop/interrupt flash. An
            // intercepting crew can transition into a non-hostile toll hail
            // immediately after breaking the drive; threat state alone would
            // otherwise produce READY and INTERRUPTED on the same card.
            gateArmed: Boolean(this.armedJumpPointId),
            hyperdriveReady: !this.armedJumpPointId && !this.autopilot && this.hyperdriveFx === 'none' && !this.hyperdriveBlockReason(),
            loadPercent: Math.round((cargoMass(this.save.player) / Math.max(1, cargoCapacity(this.save.player))) * 100),
            // Handling reflects the cargo-load penalty on turn/acceleration.
            handlingPercent: Math.round(this.flightLoadScale() * 100),
            zone: this.zoneLabel(this.getWorldZone(player)),
            target: hudTarget,
            dockPrompt,
            monitorStatus: this.save.world.time < this.monitorStatusUntil ? this.monitorStatus : undefined,
            ownMonitorStatus: this.save.world.time < this.ownMonitorStatusUntil ? this.ownMonitorStatus : undefined,
            standoff,
            patrolReply: this.patrolReplyActive(),
            race: this.raceHud(),
            weapon: this.weaponHud(),
            // Radar ring calibration as fractions of the outer (radarRange) ring:
            // [dark-visibility, scan range, full horizon]. The inner ring tracks
            // the pilot's own signature — full range while broadcasting, and the
            // speed-scaled dark band (200–400 km) while dark, so it visibly
            // shrinks as the pilot slows to hide. mk2 grows the outer and mid
            // rings.
            radarRings: [this.playerVisibilityFraction(), stats.scanRange / stats.radarRange, 1],
            // Combat-range anchor for the radar's non-linear radial scale, as
            // a fraction of the horizon (200 km on a 1000 km radar): the inner
            // disc is expanded up to this fraction (see drawRadar).
            radarWarp: RADAR_COMBAT_RANGE / stats.radarRange,
            // Transponder state for the radar chip: broadcasting is the actual
            // sensor signature (transponder ON or the extraction beam running).
            transponder: this.save.player.transponder !== false,
            broadcasting: this.playerBroadcasting(),
            contacts: this.radarContacts(),
            // Active search sweeps (see searchRings): colored rings at
            // last-known-position anchors so a hunt near the pilot shows on the
            // radar disc — blue for a Concord patrol, red for a hostile.
            searchRings: this.searchRings(),
        };
    }
    buildNavigationMapModel() {
        const contacts = [];
        const player = vec(this.save.player.position);
        const inverse = quat(this.save.player.rotation).invert();
        const stats = this.playerStats();
        const upgradedRadar = stats.radarRange > 1000;
        // Ship contacts ride the full sensor horizon so the map shows exactly
        // what the radar does; resources/wrecks stay on their scan-keyed ranges.
        const shipRange = stats.radarRange;
        const resourceRange = upgradedRadar ? MAP_RESOURCE_CONTACT_RANGE * 1.4 : MAP_RESOURCE_CONTACT_RANGE;
        const wreckRange = upgradedRadar ? MAP_WRECK_CONTACT_RANGE * 1.35 : MAP_WRECK_CONTACT_RANGE;
        const buildContact = (kind, id, name, subtitle, position, range, hostile = false, scanned = false, force = false) => {
            const relative = vec(position).sub(player);
            const distance = relative.length();
            if (!force && distance > range)
                return undefined;
            relative.applyQuaternion(inverse);
            return {
                kind,
                id,
                name,
                subtitle,
                distance,
                x: clamp(relative.x / range, -1, 1),
                y: clamp(relative.z / range, -1, 1),
                // Elevation angle — vertical offset over the true 3D distance —
                // the same distance-aware normalization the radar uses, so the
                // chart's out-of-plane cue shrinks as a marker recedes and
                // grows as it closes instead of scaling off the fixed range.
                altitude: relative.y / Math.max(distance, 1),
                hostile,
                scanned,
                selected: id === this.save.player.currentTargetId,
            };
        };
        // Selected lock first, then scanned deposits/wrecks above unscanned,
        // then nearest first.
        const prioritize = (a, b) => Number(b.selected) - Number(a.selected) || Number(Boolean(b.scanned)) - Number(Boolean(a.scanned)) || a.distance - b.distance;
        for (const ship of this.ships) {
            if (ship.hull <= 0)
                continue;
            // Mirror the radar: dark ships exist inside their speed-scaled dark
            // band, a locked ship is a visual lock (VISUAL_LOCK_RANGE, with a
            // a locked ship is tracked through occlusion — never broken by a
            // rock, only by range — and a signal the dish
            // just lost stays as a lost-contact cross at its last known
            // position instead of a dashed circle.
            const shipPos = vec(ship.position);
            const distance = player.distanceTo(shipPos);
            const occluded = this.lineBlocked(player, shipPos);
            const darkVis = ship.dark ? this.darkVisibilityRange(vec(ship.velocity).length(), ship.speed) : shipRange;
            const seen = !occluded && distance <= darkVis;
            const selected = ship.id === this.save.player.currentTargetId;
            // A locked ship is a visual lock: tracked through occlusion all
            // the way out to lockTrackedRange (see radarContacts).
            const tracked = selected && distance <= this.lockTrackedRange(ship);
            const ghost = !seen && !tracked && distance <= shipRange * 2.2 && this.save.world.time < (ship.lastSeenAt ?? 0) + LOST_CONTACT_LIFETIME;
            // A distress beacon surfaces the source even beyond the normal
            // horizon: the nav map shows it at its true position (clamped to
            // the frame) so the pilot can see where the attack is happening.
            const distressActive = this.save.world.time < (ship.distressUntil ?? 0);
            if (!seen && !tracked && !ghost) {
                if (distressActive) {
                    const beacon = buildContact('ship', ship.id, ship.name, `${this.shipRoleLabel(ship)} · ${t('DISTRESS CALL')}`, ship.position, shipRange, ship.hostile, false, true);
                    if (beacon) {
                        beacon.distress = true;
                        beacon.race = Boolean(ship.race);
                        beacon.racer = Boolean(ship.race);
                        contacts.push(beacon);
                    }
                }
                continue;
            }
            const subtitle = `${this.shipRoleLabel(ship)} · ${ship.hostile ? t('HOSTILE') : t(FACTION_LABEL(ship.faction))}${ghost ? ` · ${t('CONTACT LOST')}` : ''}${distressActive ? ` · ${t('DISTRESS CALL')}` : ''}`;
            const contact = buildContact('ship', ship.id, ship.name, subtitle, ghost ? (ship.lastSeenPosition ?? ship.position) : ship.position, shipRange, ship.hostile, false, ghost);
            if (contact) {
                contact.ghost = ghost;
                contact.race = Boolean(ship.race);
                contact.racer = Boolean(ship.race);
                if (ship.race)
                    contact.racerId = ship.id;
                if (distressActive)
                    contact.distress = true;
                if (ghost) {
                    const age = this.save.world.time - (ship.lastSeenAt ?? this.save.world.time);
                    let lostAlpha = 0.9;
                    if (age >= LOST_CONTACT_HOLD_SECONDS)
                        lostAlpha = 0.9 * Math.max(0, 1 - (age - LOST_CONTACT_HOLD_SECONDS) / LOST_CONTACT_FADE_SECONDS);
                    contact.lostAlpha = lostAlpha;
                }
                contacts.push(contact);
            }
        }
        if (this.activeInstanceId === 'shardbelt') {
            const claimNodes = new Set(this.activeMiningClaims().map((mission) => mission.claimNodeId));
            const resources = this.asteroids
                .filter((node) => node.remaining > 0 && !claimNodes.has(node.id))
                .map((node) => buildContact('asteroid', node.id, node.tunnelPart ? 'Rock Crown Deposit' : 'Asteroid Deposit', node.scanned ? 'ORE' : 'UNSCANNED MINERAL', node.position, resourceRange, false, node.scanned))
                .filter((contact) => Boolean(contact))
                .sort(prioritize)
                .slice(0, upgradedRadar ? MAP_RESOURCE_CONTACT_LIMIT + 16 : MAP_RESOURCE_CONTACT_LIMIT);
            contacts.push(...resources);
        }
        if (this.activeInstanceId === 'mourning-line') {
            const wrecks = this.wreckNodes
                .filter((node) => node.remaining > 0)
                .map((node) => buildContact('wreck', node.id, node.name, node.scanned ? (SCAN_COMMODITY_LABELS[node.salvage] ?? COMMODITIES[node.salvage].name.toUpperCase()) : 'UNSCANNED WRECK', node.position, wreckRange, false, node.scanned))
                .filter((contact) => Boolean(contact))
                .sort(prioritize)
                .slice(0, MAP_WRECK_CONTACT_LIMIT);
            contacts.push(...wrecks);
        }
        // Ejected cargo and combat drops surface like the radar shows them:
        // any crate inside the sensor horizon, capped so a busy furball
        // doesn't flood the contact list.
        const pickups = this.pickups
            .filter((pickup) => pickup.life > 0)
            .map((pickup) => buildContact('pickup', pickup.id, this.pickupLabel(pickup), this.pickupDetail(pickup), tuple(this.pickupStore.getPos(pickup.slot, this.tmpP0)), stats.radarRange))
            .filter((contact) => Boolean(contact))
            .sort(prioritize)
            .slice(0, MAP_PICKUP_CONTACT_LIMIT);
        contacts.push(...pickups);
        // Staked claims always surface — even far beyond sensor range — so the
        // pilot can see where the rock is and lock a hyperdrive jump to it.
        for (const mission of this.activeMiningClaims()) {
            const position = this.claimNodePosition(mission.claimNodeId);
            if (!position)
                continue;
            const liveScanned = this.activeInstanceId === 'shardbelt' ? Boolean(this.asteroids.find((node) => node.id === mission.claimNodeId)?.scanned) : false;
            const contact = buildContact('asteroid', mission.claimNodeId, `Claim: ${mission.claimName ?? mission.claimNodeId}`, `MINING CLAIM · ${mission.mined ?? 0}/${mission.quantity} MINED`, position, MAP_CLAIM_CONTACT_RANGE, false, liveScanned, true);
            if (contact) {
                contact.claim = true;
                contacts.push(contact);
            }
        }
        // Race contacts are intentionally phase-scoped. During travel the
        // chart exposes one gathering marker; once the grid starts it exposes
        // the authored course plus only the shortcut branch at the current
        // entry, never a hidden full route during the approach.
        const race = this.activeRace;
        if (race && race.state !== 'finished' && race.state !== 'failed') {
            if (race.state === 'travel') {
                const gathering = this.raceGathering(race.course);
                const id = gathering.id ?? `${race.course.id}-start`;
                const contact = buildContact('gate', id, t('RACE GATHERING'), `${t(race.course.title.toUpperCase())} · ${t('START LINE')}`, gathering.position, stats.radarRange, false, true, true);
                if (contact) {
                    contact.gate = true;
                    contact.raceGathering = true;
                    contacts.push(contact);
                }
            }
            else {
                const nextIndex = this.save.player.raceGateIndex ?? 0;
                race.course.gates.forEach((gate, index) => {
                    const contact = buildContact('gate', gate.id, t('GATE {n}/{total}', { n: index + 1, total: race.course.gates.length }), `${t(race.course.title.toUpperCase())} · ${index < nextIndex ? t('CLEARED') : index === nextIndex ? t('NEXT CHECKPOINT') : t('RACE COURSE')}`, gate.position, stats.radarRange, false, true, true);
                    if (contact) {
                        contact.gate = true;
                        contact.raceGate = true;
                        contact.raceGateState = index < nextIndex ? 'passed' : index === nextIndex ? 'next' : 'future';
                        contacts.push(contact);
                    }
                });
                for (const shortcut of this.raceShortcutRenderData(race)) {
                    const contact = buildContact('gate', shortcut.id, t('SHORTCUT'), `${t(race.course.title.toUpperCase())} · ${t('TIGHT LINE')}`, shortcut.position, stats.radarRange, false, true, true);
                    if (contact) {
                        contact.gate = true;
                        contact.raceGate = true;
                        contact.raceShortcut = true;
                        contacts.push(contact);
                    }
                }
            }
        }
        contacts.sort((a, b) => Number(b.hostile) - Number(a.hostile) || prioritize(a, b));
        // Active search sweeps on the chart: one dashed ring per searching ship
        // at its last-known-position anchor, always visible (clamped to the
        // frame) so the pilot can see where a patrol or hostile is hunting even
        // when the search is far beyond the sensor horizon.
        const searchRings = [];
        for (const ship of this.ships) {
            if (ship.hull <= 0 || !ship.search)
                continue;
            const relative = vec(ship.search.anchor).sub(player).applyQuaternion(inverse);
            const distance = relative.length();
            searchRings.push({
                x: clamp(relative.x / shipRange, -1, 1),
                y: clamp(relative.z / shipRange, -1, 1),
                fraction: Math.max(SEARCH_RADIUS / Math.max(distance, shipRange), 0.06),
                color: ship.search.kind === 'hostile' ? 'red' : 'blue',
            });
        }
        const nearestThreat = contacts.find((contact) => contact.hostile && contact.distance <= HYPERDRIVE_THREAT_RADIUS);
        return {
            systemId: this.save.player.systemId,
            systems: Object.values(SYSTEMS).map((system) => ({
                id: system.id,
                name: system.name,
                shortName: system.shortName,
                visible: true,
            })),
            navLocationIds: this.currentNavLocationIds(),
            plannedSystemId: this.save.world.plannedSystemId,
            plannedDestinationId: this.save.world.plannedDestinationId,
            playerPosition: [...this.save.player.position],
            navTargetId: this.save.player.navTargetId,
            currentTargetId: this.save.player.currentTargetId,
            contacts,
            searchRings,
            autopilotAvailable: !nearestThreat,
            threatLabel: nearestThreat
                ? t('{name} at {units} units', { name: nearestThreat.name, units: Math.round(nearestThreat.distance) })
                : undefined,
        };
    }
    radarContacts() {
        const contacts = [];
        const player = vec(this.save.player.position, this.tmpRadarPlayer);
        const inverse = quat(this.save.player.rotation, this.tmpRadarInv).invert();
        // The radar normalizes to the full sensor horizon (radarRange), so the
        // outer ring is exactly the radarRange ring and the inner rings can be
        // calibrated against it (see radarRings in buildHudModel).
        const range = this.playerStats().radarRange;
        const add = (position, type, selected, surfaceOffset = 0, ghost = false, lostAlpha = 0, race = false) => {
            const relative = this.tmpRadarRel.set(position[0], position[1], position[2]).sub(player).applyQuaternion(inverse);
            const distance = Math.hypot(relative.x, relative.z) - surfaceOffset;
            if (!ghost && distance > range * 1.45)
                return;
            // Lost contacts are last-known traces: only draw them within a
            // generous window around the horizon so a ship that fled far doesn't
            // leave a permanent phantom on the disc.
            if (ghost && distance > range * 2.2)
                return;
            const scale = Math.max(range, distance);
            // Altitude is the contact's elevation angle — vertical offset over
            // the true 3D distance — so the out-of-plane tick shrinks as the
            // target recedes and grows as it closes: a target 100 km up at 800
            // km reads as a shallow climb, while the same offset next to you
            // reads as a steep one. It is bounded (sin of the angle) and the
            // drawer clamps it anyway.
            contacts.push({ x: clamp(relative.x / scale, -1, 1), y: clamp(relative.z / scale, -1, 1), type, selected, altitude: relative.y / Math.max(relative.length(), 1), ghost, lostAlpha, race, racer: race });
        };
        for (const ship of this.ships) {
            if (ship.hull <= 0)
                continue;
            // A dark ship exists inside its speed-scaled dark band (200 km at
            // half speed, 400 at full); lit ships ride the full radar horizon.
            // A locked ship is a visual lock: tracked to VISUAL_LOCK_RANGE
            // occlusion never breaks a lock — only range does.
            // Anything the dish just stopped resolving becomes a lost-contact
            // cross at its last known position — solid, then fading — instead
            // of a dashed circle (see drawRadar).
            const shipPos = this.tmpRadarPos.set(ship.position[0], ship.position[1], ship.position[2]);
            const distance = player.distanceTo(shipPos);
            const occluded = this.lineBlocked(player, shipPos);
            const selected = ship.id === this.save.player.currentTargetId;
            const darkVis = ship.dark ? this.darkVisibilityRange(Math.hypot(ship.velocity[0], ship.velocity[1], ship.velocity[2]), ship.speed) : range * 1.45;
            const seen = !occluded && distance <= darkVis;
            // A locked ship is a visual lock: tracked through occlusion (rocks
            // don't blind the eye) all the way out to lockTrackedRange.
            const tracked = selected && distance <= this.lockTrackedRange(ship);
            const type = ship.hostile ? 'hostile' : ship.role === 'patrol' ? 'friendly' : 'neutral';
            if (seen || tracked) {
                // tuple() reads .x/.y/.z, so convert the raw array first — a
                // NaN last-known position would draw the lost cross nowhere.
                ship.lastSeenPosition = [...ship.position];
                ship.lastSeenAt = this.save.world.time;
                add(ship.position, type, selected, 0, false, 0, Boolean(ship.race));
            }
            else if (this.save.world.time < (ship.lastSeenAt ?? 0) + LOST_CONTACT_LIFETIME) {
                // Lost contact: the cross rides the last known position and
                // carries a fade alpha so the radar can hold then fade it.
                const age = this.save.world.time - (ship.lastSeenAt ?? this.save.world.time);
                let lostAlpha = 0.9;
                if (age >= LOST_CONTACT_HOLD_SECONDS)
                    lostAlpha = 0.9 * Math.max(0, 1 - (age - LOST_CONTACT_HOLD_SECONDS) / LOST_CONTACT_FADE_SECONDS);
                add(ship.lastSeenPosition ?? ship.position, type, selected, 0, true, lostAlpha, Boolean(ship.race));
            }
            else if (this.save.world.time < (ship.distressUntil ?? 0)) {
                // A distress beacon surfaces the ship's position even beyond
                // the radar horizon: a pulsing diamond at the disc rim in the
                // source's direction, with a distance readout (see drawRadar).
                const relative = this.tmpRadarRel.set(ship.position[0], ship.position[1], ship.position[2]).sub(player).applyQuaternion(inverse);
                const horiz = Math.hypot(relative.x, relative.z);
                if (horiz > range * 1.45) {
                    contacts.push({
                        x: (relative.x / horiz) * 0.97,
                        y: (relative.z / horiz) * 0.97,
                        type: 'distress',
                        selected: false,
                        altitude: relative.y / Math.max(relative.length(), 1),
                        ghost: false,
                        distress: true,
                        distance: Math.round(horiz),
                    });
                }
            }
        }
        for (const id of this.currentNavLocationIds())
            add(LOCATIONS[id].position, 'location', id === this.save.player.currentTargetId, LOCATIONS[id].radius);
        if (this.save.player.mode === 'mining') {
            for (const node of this.asteroids)
                if (node.remaining > 0 && (node.scanned || node.id === this.save.player.currentTargetId))
                    add(node.position, 'resource', node.id === this.save.player.currentTargetId);
        }
        if (this.save.player.mode === 'salvage') {
            for (const node of this.wreckNodes)
                if (node.remaining > 0 && (node.scanned || node.id === this.save.player.currentTargetId))
                    add(node.position, 'wreck', node.id === this.save.player.currentTargetId);
        }
        for (const pickup of this.pickups)
            if (pickup.life > 0)
                add(this.pickupStore.pos.subarray(pickup.slot * 3, pickup.slot * 3 + 3), 'pickup', pickup.id === this.save.player.currentTargetId);
        // Race checkpoints on the disc are phase-scoped just like the nav map:
        // travel has one gathering contact; countdown/running expose the fixed
        // course and any currently available shortcut rings.
        const race = this.activeRace;
        if (race && race.state !== 'finished' && race.state !== 'failed') {
            if (race.state === 'travel') {
                const gathering = this.raceGathering(race.course);
                const relative = this.tmpRadarRel.set(gathering.position[0], gathering.position[1], gathering.position[2]).sub(player).applyQuaternion(inverse);
                const distance = Math.hypot(relative.x, relative.z);
                contacts.push({
                    x: clamp(relative.x / Math.max(range, distance), -1, 1),
                    y: clamp(relative.z / Math.max(range, distance), -1, 1),
                    type: 'racegate',
                    selected: gathering.id === this.save.player.currentTargetId,
                    altitude: relative.y / Math.max(relative.length(), 1),
                    ghost: false,
                    race: true,
                    raceGathering: true,
                    raceGate: {
                        state: 'next',
                        distance: Math.round(distance),
                        beyond: distance > range,
                    },
                });
            }
            else {
                // The disc shows only the next gate (green) and the one after
                // it (yellow), matching the in-world ring colors — a full line
                // of rings turns the radar into noise at race speed. The whole
                // course stays visible in the world and on the nav map.
                const nextIndex = this.save.player.raceGateIndex ?? 0;
                for (let index = nextIndex; index <= nextIndex + 1; index += 1) {
                    const gate = race.course.gates[index];
                    if (!gate)
                        continue;
                    const relative = this.tmpRadarRel.set(gate.position[0], gate.position[1], gate.position[2]).sub(player).applyQuaternion(inverse);
                    const distance = Math.hypot(relative.x, relative.z);
                    contacts.push({
                        x: clamp(relative.x / Math.max(range, distance), -1, 1),
                        y: clamp(relative.z / Math.max(range, distance), -1, 1),
                        type: 'racegate',
                        selected: gate.id === this.save.player.currentTargetId,
                        altitude: relative.y / Math.max(relative.length(), 1),
                        ghost: false,
                        race: true,
                        raceGate: {
                            state: index === nextIndex ? 'next' : 'upcoming',
                            distance: Math.round(distance),
                            beyond: distance > range,
                        },
                    });
                }
                for (const shortcut of this.raceShortcutRenderData(race)) {
                    const relative = this.tmpRadarRel.set(shortcut.position[0], shortcut.position[1], shortcut.position[2]).sub(player).applyQuaternion(inverse);
                    const distance = Math.hypot(relative.x, relative.z);
                    contacts.push({
                        x: clamp(relative.x / Math.max(range, distance), -1, 1),
                        y: clamp(relative.z / Math.max(range, distance), -1, 1),
                        type: 'racegate',
                        selected: shortcut.id === this.save.player.currentTargetId,
                        altitude: relative.y / Math.max(relative.length(), 1),
                        ghost: false,
                        race: true,
                        raceShortcut: true,
                        raceGate: {
                            state: 'shortcut',
                            distance: Math.round(distance),
                            beyond: distance > range,
                        },
                    });
                }
            }
        }
        return contacts;
    }
    zoneLabel(zone) {
        if (zone === 'asteroid-field')
            return t('SHARDBELT / COLLISION HAZARD');
        if (zone === 'graveyard')
            return t('MOURNING LINE / {zone}', { zone: graveyardZoneLabel(graveyardZoneAt(this.save.player.position)) });
        if (zone === 'near-location')
            return t('CONTROLLED APPROACH');
        return t('OPEN SPACE');
    }
}
const FACTION_LABEL = (faction) => {
    switch (faction) {
        case 'concord':
            return t('CONCORD');
        case 'free-merchants':
            return t('FREE MERCHANTS');
        case 'frontier-miners':
            return t('FRONTIER MINERS');
        case 'salvage-union':
            return t('SALVAGE UNION');
        case 'red-talons':
            return t('RED TALONS');
    }
};
