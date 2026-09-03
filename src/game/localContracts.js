// Authored multi-stage contracts.
//
// This file intentionally contains plain English source strings and no
// localization import.  The UI can pass title, briefing, issuer, and labels
// through t() when it renders them.  Stages are flat and JSON-shaped so they
// can later be copied into save data or combined with the procedural board.
//
// `progress` is a map from chainId to the highest completed stageIndex:
//     { 'mourning-ledger': 0 }
// A missing entry means that the first stage is eligible.  A chain is complete
// when its value is at least its final stageIndex.

const stage = (entry) => Object.freeze({ ...entry });

// The four chains follow the current line galaxy: Helios Verge -> Meridian ->
// Pale Ring -> Redwake.  Cross-system stages use existing route endpoints and
// every location below is already present in data.js/galaxy.js.
export const LOCAL_CONTRACT_CATALOG = Object.freeze([
    // Helios Verge — the Salvage Union's Mourning Line claim ledger.
    stage({
        id: 'mourning-ledger-1',
        chainId: 'mourning-ledger',
        stageIndex: 1,
        chainLabel: 'The Mourning Ledger',
        stageLabel: '1 · Carry the record',
        kind: 'transport',
        origin: 'cairn',
        destination: 'rook',
        guild: 'salvage',
        faction: 'salvage-union',
        issuer: 'Merrit Voss',
        title: 'Carry the recovery ledger',
        briefing: 'Merrit Voss needs a sealed recovery ledger moved from Cairn Yard to Rookhaven before a Concord claim hearing. Do not open the case or let the wreck crews learn which hulls are named inside.',
        quantity: 1,
        cargo: 'sealed recovery ledger',
        reward: 3200,
        deposit: 180,
        deadlineSeconds: 420,
        guildRep: 8,
        danger: 1.1,
    }),
    stage({
        id: 'mourning-ledger-2',
        chainId: 'mourning-ledger',
        stageIndex: 2,
        chainLabel: 'The Mourning Ledger',
        stageLabel: '2 · Silence the witness',
        kind: 'bounty',
        origin: 'rook',
        targetZone: 'mourning-line',
        targetName: 'Vigil-Actual',
        guild: 'bounty',
        faction: 'concord',
        issuer: 'Captain Elian Dorne',
        title: 'Warrant: Vigil-Actual',
        briefing: 'Vigil-Actual stole a claim beacon from the Mourning Line and is selling the recovery ledger to the highest bidder. Confirm the callsign, destroy the ship, and keep the beacon intact if you can.',
        reward: 5600,
        deposit: 280,
        deadlineSeconds: 540,
        guildRep: 12,
        danger: 1.8,
    }),
    stage({
        id: 'mourning-ledger-3',
        chainId: 'mourning-ledger',
        stageIndex: 3,
        chainLabel: 'The Mourning Ledger',
        stageLabel: '3 · Close the claim',
        kind: 'delivery',
        origin: 'rook',
        destination: 'cairn',
        commodity: 'electronics',
        quantity: 2,
        guild: 'salvage',
        faction: 'salvage-union',
        issuer: 'Merrit Voss',
        title: 'Close the wreck claim',
        briefing: 'Bring the recovered beacon cores back to Merrit Voss at Cairn Yard. Once the Union can read the cores, it can settle the Mourning Line claim without sending another crew into the carrier wake.',
        reward: 4800,
        deposit: 240,
        deadlineSeconds: 500,
        guildRep: 14,
        danger: 1.35,
    }),

    // Meridian — a customs discrepancy that ends as a clean prototype run.
    stage({
        id: 'foundry-audit-1',
        chainId: 'foundry-audit',
        stageIndex: 1,
        chainLabel: 'The Foundry Audit',
        stageLabel: '1 · Find the missing manifest',
        kind: 'delivery',
        origin: 'meridian-prime',
        destination: 'argent',
        commodity: 'machinery',
        quantity: 3,
        guild: 'merchant',
        faction: 'concord',
        issuer: 'Leon Vale',
        title: 'Find the missing manifest',
        briefing: 'Argent Shipworks is waiting on three crates of pressure-rated machinery, but Meridian customs says the shipment never left the planet. Deliver the sealed crates and ask no questions about the duplicate manifest.',
        reward: 4100,
        deposit: 300,
        deadlineSeconds: 390,
        guildRep: 9,
        danger: 0.85,
    }),
    stage({
        id: 'foundry-audit-2',
        chainId: 'foundry-audit',
        stageIndex: 2,
        chainLabel: 'The Foundry Audit',
        stageLabel: '2 · Find the ledger ghost',
        kind: 'bounty',
        origin: 'argent',
        targetZone: 'foundry-lanes',
        targetName: 'Ledger Ghost',
        guild: 'bounty',
        faction: 'concord',
        issuer: 'Sela Orrin',
        title: 'Warrant: Ledger Ghost',
        briefing: 'Ledger Ghost is the courier who has been rewriting customs records in the Foundry Lanes. Confirm the target before firing; the Concord wants the ship gone, but the identity record must survive the encounter.',
        reward: 6900,
        deposit: 350,
        deadlineSeconds: 600,
        guildRep: 14,
        danger: 1.7,
    }),
    stage({
        id: 'foundry-audit-3',
        chainId: 'foundry-audit',
        stageIndex: 3,
        chainLabel: 'The Foundry Audit',
        stageLabel: '3 · Ship the clean copy',
        kind: 'transport',
        origin: 'argent',
        destination: 'nacre',
        guild: 'merchant',
        faction: 'concord',
        issuer: 'Mira Kest',
        title: 'Ship the clean copy',
        briefing: 'Mira Kest has a prototype sensor core that must leave Meridian before the audit closes. Carry it across the jump to Nacre Station and deliver it without letting the old manifest follow it.',
        quantity: 1,
        cargo: 'prototype sensor core',
        reward: 7600,
        deposit: 520,
        deadlineSeconds: 720,
        guildRep: 17,
        danger: 1.25,
    }),

    // Pale Ring — a medical run, a stolen survey signal, and its safe return.
    stage({
        id: 'quiet-signal-1',
        chainId: 'quiet-signal',
        stageIndex: 1,
        chainLabel: 'The Quiet Signal',
        stageLabel: '1 · Keep Boreal breathing',
        kind: 'delivery',
        origin: 'nacre',
        destination: 'boreal',
        commodity: 'medicine',
        quantity: 3,
        guild: 'merchant',
        faction: 'frontier-miners',
        issuer: 'Tessa Rye',
        title: 'Keep Boreal breathing',
        briefing: 'Boreal is short on anti-radiation medigel after a fracture opened beneath the eastern settlement. Deliver three cold-chain cases before the clinic starts choosing who can wait.',
        reward: 4500,
        deposit: 240,
        deadlineSeconds: 520,
        guildRep: 10,
        danger: 1.15,
    }),
    stage({
        id: 'quiet-signal-2',
        chainId: 'quiet-signal',
        stageIndex: 2,
        chainLabel: 'The Quiet Signal',
        stageLabel: '2 · Track the silent beacon',
        kind: 'bounty',
        origin: 'boreal',
        targetZone: 'pale-rings',
        targetName: 'The Pale Listener',
        guild: 'bounty',
        faction: 'concord',
        issuer: 'Pavel Orn',
        title: 'Warrant: The Pale Listener',
        briefing: 'The Pale Listener is broadcasting a stolen survey signature from inside the rings. Find the ship before it sells the route to raiders, confirm the signal, and end the transmission.',
        reward: 7200,
        deposit: 360,
        deadlineSeconds: 660,
        guildRep: 15,
        danger: 2.05,
    }),
    stage({
        id: 'quiet-signal-3',
        chainId: 'quiet-signal',
        stageIndex: 3,
        chainLabel: 'The Quiet Signal',
        stageLabel: '3 · Return the survey',
        kind: 'transport',
        origin: 'boreal',
        destination: 'nacre',
        guild: 'mining',
        faction: 'frontier-miners',
        issuer: 'Soren Vek',
        title: 'Return the survey core',
        briefing: 'Soren Vek recovered the survey core from the dead beacon. Carry it back to Nacre Station so the scientists can close the exposed route before the next ring shift moves it again.',
        quantity: 1,
        cargo: 'ring survey core',
        reward: 6300,
        deposit: 380,
        deadlineSeconds: 620,
        guildRep: 16,
        danger: 1.45,
    }),

    // Redwake — a syndicate handoff that turns into an ugly belt cleanup.
    stage({
        id: 'cinder-crown-1',
        chainId: 'cinder-crown',
        stageIndex: 1,
        chainLabel: 'The Cinder Crown',
        stageLabel: '1 · Move the blackglass cores',
        kind: 'smuggle',
        origin: 'blackglass',
        destination: 'cinder',
        commodity: 'electronics',
        quantity: 2,
        guild: 'syndicate',
        faction: 'red-talons',
        issuer: 'Vesh Orr',
        title: 'Move the Blackglass cores',
        briefing: 'Two sealed sensor cores are leaving Blackglass without a manifest. Run dark to Cinder Station, keep the patrols from resolving you, and hand the crates to the refinery crew on the quiet side of the dock.',
        reward: 5900,
        deposit: 360,
        deadlineSeconds: 500,
        guildRep: 13,
        danger: 1.9,
    }),
    stage({
        id: 'cinder-crown-2',
        chainId: 'cinder-crown',
        stageIndex: 2,
        chainLabel: 'The Cinder Crown',
        stageLabel: '2 · Cut down the Ash Crown',
        kind: 'bounty',
        origin: 'cinder',
        targetZone: 'redwake-belt',
        targetName: 'Ash Crown',
        guild: 'bounty',
        faction: 'red-talons',
        issuer: 'Kellan Rusk',
        title: 'Warrant: Ash Crown',
        briefing: 'Ash Crown has been ambushing refinery haulers and selling their transponder keys. Find the raider in the Redwake Belt, confirm the callsign, and take back the keys before another convoy disappears.',
        reward: 8600,
        deposit: 430,
        deadlineSeconds: 700,
        guildRep: 18,
        danger: 2.35,
    }),
    stage({
        id: 'cinder-crown-3',
        chainId: 'cinder-crown',
        stageIndex: 3,
        chainLabel: 'The Cinder Crown',
        stageLabel: '3 · Pay the quiet debt',
        kind: 'smuggle',
        origin: 'cinder',
        destination: 'blackglass',
        commodity: 'medicine',
        quantity: 3,
        guild: 'syndicate',
        faction: 'red-talons',
        issuer: 'Mara Jen',
        title: 'Pay the quiet debt',
        briefing: 'Cinder owes Blackglass three cases of medigel after the belt attack. The shipment cannot pass through the Concord ledger; run dark to Blackglass and leave the cases with the clinic contact before anyone asks why they are free.',
        reward: 6800,
        deposit: 410,
        deadlineSeconds: 610,
        guildRep: 16,
        danger: 2.1,
    }),
].map((entry) => stage(entry)));

const stagesByChain = Object.freeze(LOCAL_CONTRACT_CATALOG.reduce((map, entry) => {
    const chain = map[entry.chainId] ?? [];
    chain.push(entry);
    map[entry.chainId] = chain;
    return map;
}, {}));

export const LOCAL_CONTRACT_CHAIN_IDS = Object.freeze(Object.keys(stagesByChain));
export const LOCAL_CONTRACT_STAGES = LOCAL_CONTRACT_CATALOG;

// Return the next stage for one chain.  `progress[chainId]` is the highest
// completed stageIndex, so a fresh chain uses 0 and returns stage 1.  The
// helper does not mutate the progress object or the catalogue.
export const findNextLocalContractStage = (chainId, progress = {}) => {
    const stages = stagesByChain[chainId];
    if (!stages)
        return undefined;
    const completed = Number.isFinite(Number(progress?.[chainId]))
        ? Math.max(0, Math.floor(Number(progress[chainId])))
        : 0;
    return stages.find((entry) => entry.stageIndex === completed + 1);
};

// Convert an authored stage into the mission shape consumed by missions.js.
// The authored deadline is relative; the runtime offer stores the absolute
// world-time deadline used by the existing completion/expiry code.
export const localContractToMissionOffer = (entry, worldTime = 0) => {
    if (!entry)
        return undefined;
    const now = Number.isFinite(Number(worldTime)) ? Number(worldTime) : 0;
    const deadlineSeconds = Number.isFinite(Number(entry.deadlineSeconds))
        ? Math.max(1, Number(entry.deadlineSeconds))
        : 1;
    const offer = {
        id: entry.id,
        kind: entry.kind,
        chainId: entry.chainId,
        stageIndex: entry.stageIndex,
        chainLabel: entry.chainLabel,
        stageLabel: entry.stageLabel,
        title: entry.title,
        briefing: entry.briefing,
        issuer: entry.issuer,
        origin: entry.origin,
        destination: entry.destination,
        targetZone: entry.targetZone,
        targetName: entry.targetName,
        commodity: entry.commodity,
        quantity: entry.quantity,
        cargo: entry.cargo,
        cargoLabel: entry.cargo,
        reward: entry.reward,
        deposit: entry.deposit,
        deadline: now + deadlineSeconds,
        deadlineSeconds,
        status: 'offered',
        active: false,
        authored: true,
        guild: entry.guild,
        faction: entry.faction,
        guildRep: entry.guildRep,
        danger: entry.danger,
    };
    // Keep the offer JSON-shaped without adding undefined fields for the
    // mission kind that does not use them (for example destination on bounty).
    return Object.fromEntries(Object.entries(offer).filter(([, value]) => value !== undefined));
};
