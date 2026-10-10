# Arena Run overhaul — design plan

Status: **implemented** (GAME_VERSION `0.8.2et`). See §5 for what shipped and
the deviations from this plan.
Decisions locked with the owner (see §1.0).

Owner-facing goals:

1. The run progresses **slowly** through **all ships** and **all factions**.
2. Waves are **determined** (authored, not random).
3. The pilot **switches their own ship, and combat tier**, as the run advances.
4. A permanent **wingman or two** joins and **persists for the rest of the run**.

---

## 0. What already exists (so the plan only adds what is missing)

Read from the shipping modules, not design notes.

| Concern | Current state | File |
|---|---|---|
| Wave list | `RUN_WAVES`, **10** fixed waves, each environment + enemy specs | `src/game/arenaRun.js` |
| Enemy spec | `enemy(role,tier,guns,delay,ordnance)`; hull comes from role (`pirate`→talon, `escort`→wayfarer, `bounty`→lancer, `patrol`→vanguard) or an `ordnance.hullId` override | `arenaRun.js`, `arenaRunSession.js` |
| Enemy faction | **always `'pirates'`** (hardcoded at spawn) | `arenaRunSession.spawnRunEnemy` |
| Own-ship switch | only at waves **3 and 6**; 5 hulls drawn from **all 15**, any tier | `runHullOffers`, `changeRunHull` |
| Wingmen | **already persist**: up to `MAX_RUN_WINGMEN = 2`, one hire per hull stage (waves 3 & 6), permanently lost when shot down, restored to the wave's start on retry | `arenaRunSession.js` |
| Wingman aggro | enemies re-target the **player** every tick (`ship.targetId='player'`) unless already locked on a living wingman, so a wing never *acquires* fire | `tickArenaRun` |
| Finale | wave 10 = Concord frigate boss | `arenaRun.js` |
| Hull origin | no hull→faction field; `FACTION_FLEETS` (faction→role→hulls) is the shipping source of truth, invert it for origins | `src/game/factions.js` |
| Tests | `tests/arena-run.test.mjs`, 584 lines, asserts the 10-wave shape, wave-3 hire, wave-6 hull change, offer legality, permanence | `tests/` |

So three of the four goals partially exist: waves are already deterministic,
wingmen already persist, and hull switching exists but is **random and tier-blind**.
The real gaps are **content coverage** (only 4 opponent hulls, 1 faction),
**progression shape** (2 arbitrary switch points, no tier ladder), and **wingman
aggro** (a hired wing cannot draw fire).

---

## 1. Target shape

### 1.0 Locked decisions

| Question | Decision |
|---|---|
| Run length | **~24 waves, 5 acts** |
| Hull-stage rule | **Tier-locked + faction-flavoured**: each stage declares a tier band and a faction bloc |
| Wingman aggro | **Yes** — enemies may acquire a living wingman as a target, so the wing soaks fire |
| Starting hull | **Player picks a tier-1 starter** (Wayfarer / Speedster / Scrapper) at a pre-run stage |

### 1.1 Acts

Wrap the flat wave list in **acts** — a named chapter with one faction and one
tier band. `RUN_WAVES` stays the exported flat list (so the UI, the countdown and
the tick loop are untouched); acts are metadata that *derive* it.

| Act | Faction | Waves | Opponent hulls | Pilot tiers |
|---|---|---|---|---|
| Start | — | pre-run stage | player's tier-1 pick | — |
| I — Red Talons | pirates | 1–4 | scrapper, speedster, demon | novice→veteran |
| **Stage A** | offers **tier 2**, bloc {pirates, independents} | — | demon, legionary, mule, prospector, torsas | — |
| II — Free Merchants | independents | 5–9 | wayfarer, prospector, mule, torsas, demon | veteran |
| **Stage B** | offers **tier 3**, bloc {alliance, concord} | — | astra, lancer, vanguard, blade, atlas | — |
| III — Frontier League | alliance | 10–14 | legionary, andromeda, speedster, astra, lancer | veteran→ace |
| IV — Concord Frontier Fleet | concord | 15–19 | talon, blade, vanguard, lancer, atlas, mule | ace |
| V — Concord capital | concord | 20–24 | frigate + escort hulls | ace |

Coverage check: **all 15 flyable hulls** appear as opponents
(scrapper, speedster, wayfarer, prospector, mule, torsas, demon, legionary,
andromeda, astra, lancer, talon, blade, vanguard, atlas) across **all 4
factions** (pirates, independents, alliance, concord).

Stage pools are **authored blocs**, derived by inverting `FACTION_FLEETS`
(plus `LEAGUE_HULLS.requiredFaction`). Verified against source:

- **Stage A**, tier 2, {pirates, independents} = **demon, legionary, mule,
  prospector, torsas** (5). Legionary is present because the independents fly it
  (`FACTION_FLEETS.independents.patrol`), which is the same "who flies what" rule
  the live world uses.
- **Stage B**, tier 3, {alliance, concord} = **astra, atlas, blade, lancer,
  vanguard** (5).

Plus the existing "keep your ship and hire a veteran instead" option.

### 1.2 Determined waves

Every wave names, explicitly: `hullId`, `faction`, `role` (doctrine), `tier`
(pilot), guns/turrets/ordnance, arrival delay, environment. No role→hull
inference, no randomness in *who* appears — only procedural callsigns and the
reward/hull/roster draws stay seeded.

### 1.3 Own-ship + combat-tier ladder

Hull stages are pinned to **tier climbs**:

- **Start**: pick a tier-1 hull.
- **Stage A** (after Act I): tier-2 hulls of the frontier/outlaw bloc (5).
- **Stage B** (after Act II): tier-3 hulls of the military bloc (5).

`runHullOffers` gains a tier + bloc filter; the stage records which tier/bloc it
offers; `changeRunHull` validates against it.

### 1.4 Permanent wing

Hire points move to the act **stages** (one hire per stage, still capped at
`MAX_RUN_WINGMEN = 2`). Persistence, loss-on-death and retry-restore are
unchanged. **New:** enemies may legally acquire a living wingman as a target, so
the wing actually draws fire.

---

## 2. Implementation plan

### Phase 1 — Data model (no visible change)
- Replace the positional `enemy(...)` tuple with a **named spec**:
  `{hullId, faction, role, tier, guns, turrets, launcher, missiles, delay}`.
- Make `spawnRunEnemy` read `spec.hullId` / `spec.faction`; delete the role→hull
  map and the `ordnance.hullId` overload.
- Make `preloadRunWaveModels` read `spec.hullId` / `spec.faction`.
- **Verify**: the existing 10 waves expressed in the new shape still pass
  `arena-run.test.mjs` unchanged (behaviour-preserving refactor).

### Phase 2 — Content
- Author the Act I–V wave list (24 waves) per §1.1.
- Draw each faction's opponents from `FACTION_FLEETS` so the arena and the live
  world agree on who flies what.
- Balance pass using the existing `HULL_NPC_FITS` / `createEnemyLoadout` path and
  the fleet hull-vs-hull ordering as the difficulty ramp.
- **Verify**: new tests assert *every* flyable hull and *every* faction appears in
  `RUN_WAVES`, and that no wave's opponent tier exceeds the player's expected tier
  by more than one band.

### Phase 3 — Progression + save migration
- Add `act`, `hullStage`, stage `offerTier` / `offerBlocs`, and the pre-run starter
  stage to `save.arenaRun`; bump `version` 2→3.
- Migration mirrors the existing v1→v2 precedent: map an old `wave` index onto the
  new list, keep `won`/`lost` frozen, never lose a checkpoint.
- `runHullOffers` filters by tier + bloc; `changeRunHull` validates against it.
- Move the hull-stage gate off the hardcoded `[3,6]` and onto the act stage list.
- **Verify**: migration test (old v2 checkpoint loads and resumes on the right
  wave); stage test (every offer is in the tier/bloc, current ship never offered).

### Phase 4 — Wing
- Hire points keyed to stages; keep the 2-cap, the roster draw and the
  permanence/checkpoint logic.
- **New:** let enemies acquire a living wingman as a target (replacing the
  unconditional `targetId='player'` reset with a player-preferred but
  wingman-capable acquisition).
- **Verify**: existing permanence tests, plus a test that a hired wing survives
  every subsequent hull change and wave, and that a wingman takes hostile fire.

### Phase 5 — UI, i18n, docs, release
- `showArenaRun`: show act name, tier/bloc on a hull stage, and the wing roster;
  replace the hardcoded wave-3/6 assumptions.
- New strings (act names, wave names/hints, faction labels, stage copy) added to
  the DE catalog — the existing test **`preparation screens render in both
  languages and every wave briefing is translated`** fails without them.
- Docs in lockstep: `README.md`, `PLAYABLE_README.md`, `progress.md`, a new
  section in `docs/FLEET_MATRIX.md`; bump `GAME_VERSION` (`src/game/ui.js`) and
  the `sw.js` `CACHE`.
- Add a headless probe that clears waves and asserts the act/tier transitions —
  current coverage is unit-level only.

---

## 3. Risks and constraints

- **Test churn.** `tests/arena-run.test.mjs` hard-codes 10 waves, wave-3 hire,
  wave-6 hull change and wave-9 frigate. Expect edits; keep the assertions
  meaningful (do not loosen them to pass).
- **Enemy hull legality.** A hull flown on a foreign role still needs a legal fit;
  `createEnemyLoadout` keys hardpoints/turrets off `hullId` and doctrine off the
  heaviest gun, and the wingman path already patches `variant`/`hullId` post-spawn
  — reuse that pattern.
- **Hauler AI cadence.** From the fleet balance work: haulers fly the civilian
  tree and fighters the combat tree, and point defence suppresses an NPC fighter's
  fire-commitment. The arena forces `holdFire=false` and `targetId='player'`, but a
  hauler wave may still read as passive — needs a per-wave balance check.
- **Save migration** must not strand an in-progress run.
- **Perf / preload.** More distinct hulls per run = more GLB/voxel models; the
  preload hook must cover every act up front.
- **Localization** is a hard gate (there is a test for it).
- **Release protocol**: version + SW cache + docs in lockstep.

## 4. Phasing order

Phase 1 → 2 → 3 → 4 → 5, each independently testable; Phase 1 is a pure refactor
that should leave the suite green, which de-risks everything after it.

## 5. What shipped (0.8.2et)

All five phases landed together, because the wave content and the stage logic are
one change in practice.

- **Named enemy spec.** `enemy(hullId,{faction,role,tier,delay,missiles,...})`,
  with guns/turrets/launchers defaulting to the hull's real stock fit via
  `runEnemyFit` + `HULL_NPC_FITS`. `spawnRunEnemy` no longer infers a hull from an
  NPC role, and `preloadRunWaveModels` reads `spec.hullId`/`spec.role`.
- **24 waves, 5 acts**, meeting **all 15 flyable hulls across all 4 factions**
  (asserted by a new test).
- **Tier ladder.** Stages at waves 1 / 10 / 15: a tier-1 starting pick, then
  tier 2 from {pirates, independents}, then tier 3 from {alliance, concord}. The
  pools come from inverting `FACTION_FLEETS` (`HULL_FACTIONS` in `shipPool.js`).
- **Save `version 3`.** Finished short runs keep their old totals; active
  checkpoints migrate to the same fractional position in the 24-wave run.
- **Wing.** Hires are keyed to the stage list; wave opponents target the nearest
  of the pilot and a living wingman; the wing's faction is chosen opposed to the
  wave's faction so NPC-on-NPC fire stays legal.

### Deviations from this plan

- Enemy durability still comes from the NPC **role** (spawnShip's role-based
  shield/hull), not from the hull table — unchanged from before, and deliberately
  not touched here to keep the change contained. A hull with the same role still
  differs in model, mounts, weapons and flight stats.
- The UI change is minimal: the run header names the act and hull cards print
  their tier. No new stage-screen copy beyond the localized act names.
- The plan's “~24 waves” landed at exactly 24; the frigate stays the finale.

### Defects found and fixed during the work

- An enemy spec without a `delay` never spawned (`elapsed >= undefined`); the
  `enemy()` helper now defaults it to 0.
- A fully-upgraded hull could reach a reward stage with an **empty** offer list,
  which blocked the run (`startRunWave` needs a chosen reward); `runOffers` now
  always offers at least a repair.
