import { COMMODITIES, DOCK_LOCATION_IDS, GUILD_RANK_NAMES, LOCATIONS, MISSION_LOCATION_IDS, commodityIds, routeDistanceBetween } from './data.js';
import { miningClaimCandidates, miningClaimName } from './worldData.js';
import { cargoFree, SYNDICATE_DEN_FAVOR } from './economy.js';
import { clamp, formatNumber, pick, proceduralCallsign, randomBetween, randomInt, seededRandom } from './random.js';
import { rollPilot, TIER_LABELS, TEMPERAMENT_LABELS } from './pilots.js';
import { t } from './i18n.js';
import { RACE_COURSES, raceBriefingLine, raceOffersForLocation, raceCourseUnlocked, normalizeRaceRecord } from './racing.js';
const GUILD_NAMES_FALLBACK = (guild) => guild === 'merchant' ? 'Merchant Guild' : guild === 'bounty' ? 'Bounty Registry' : guild === 'mining' ? 'Prospectors Guild' : guild === 'syndicate' ? 'Red Talon Syndicate' : 'Salvage Union';
const merchantIssuers = ['Kestrel Freight', 'Orison Combine', 'Free Haulers Desk', 'Sable Route Logistics', 'Guild Dispatch'];
const bountyIssuers = ['Concord Warrant Desk', 'Frontier Security Office', 'Bounty Hunters Registry', 'Civil Claims Bureau'];
const miningIssuers = ['Frontier Miners Cooperative', 'Prospectors Guild', 'Coreward Refinery Trust', 'Vesper Smelting Desk'];
const syndicateIssuers = ['The Fixer', 'Den Concierge', 'Syndicate Broker'];
// Dark-goods runs only move what the manifest cannot show.
const SMUGGLE_COMMODITIES = ['arms', 'luxuries', 'electronics', 'medicine'];
// Special labeled cargo only comes from transport contracts; the game's AI
// reads this list to call out valuable sealed load (see game.js cargoFlavor).
export const VALUABLE_CARGO_LABELS = ['sealed diplomatic case', 'reactor-control package', 'medical coldbox', 'priority machine tooling', 'survey archive'];
const missionCycle = (worldTime) => Math.floor(worldTime / 150);
// Bonus bounty-guild reputation for taking down a named ace warrant: the
// registry pays extra for the hardest names on the board.
const ACE_WARRANT_REP = 10;
const chooseDestination = (rng, origin) => {
    const candidates = DOCK_LOCATION_IDS.filter((id) => id !== origin);
    return pick(rng, candidates);
};
const chooseCommodity = (rng) => {
    // Gold stays a mined jackpot — it never shows up as generic delivery cargo.
    return pick(rng, commodityIds.filter((id) => id !== 'arms' && id !== 'gold'));
};
// A claim contract pays like a delivery run plus the ore's value: mining is a
// safe-but-slower loop, so it has to land in the same cr/minute band as trading
// and bounty work or nobody leaves the board for it.
const miningReward = (quantity, rank) => Math.round(quantity * COMMODITIES.ore.basePrice * 2.6 + 2200 + rank * 380);
const contractReward = (distance, quantity, danger, rank) => Math.round(750 + distance * 3.3 + quantity * 90 + danger * 340 + rank * 520);
const bountyReward = (danger, rank, zone) => {
    const zoneFactor = zone === 'mourning-line' ? 1.25 : zone === 'shardbelt' ? 1.1 : 1;
    return Math.round((2600 + danger * 1650 + rank * 950) * zoneFactor);
};
export const generateMissionOffers = (locationId, save, count = 7) => {
    const cycle = missionCycle(save.world.time);
    const rng = seededRandom(`${save.world.seed}:missions:${cycle}:${locationId}`);
    const offers = [];
    // Races are repeatable events: the board always posts all three fixed
    // courses at the field's home dock. Later tiers remain visible so the
    // player can see the progression, but only a podium on the prerequisite
    // course unlocks acceptance. An active legacy entry is never hidden by the
    // unlock check, which keeps an in-flight ticket recoverable after reload.
    const raceRecords = save.world.raceRecords ?? {};
    for (const raceCourseId of raceOffersForLocation(locationId)) {
        const raceCourse = RACE_COURSES[raceCourseId];
        if (!raceCourse)
            continue;
        const record = normalizeRaceRecord(raceRecords[raceCourse.id]);
        const unlocked = raceCourseUnlocked(raceCourse.id, raceRecords);
        const active = record.active === true;
        const prerequisite = raceCourse.unlock ? RACE_COURSES[raceCourse.unlock.courseId] : undefined;
        const unlockLabel = !unlocked && !active && prerequisite
            ? t('Podium in {course} to unlock.', { course: prerequisite.title })
            : undefined;
        offers.push({
            id: `race-${raceCourse.id}`,
            kind: 'race',
            title: t('Race: {course}', { course: raceCourse.title }),
            issuer: raceCourse.issuer,
            origin: locationId,
            destination: raceCourse.zone,
            reward: Math.max(...raceCourse.payouts),
            deposit: raceCourse.entryFee,
            deadline: save.world.time + raceCourse.deadlineSeconds,
            status: active ? 'active' : 'offered',
            active,
            locked: !unlocked && !active,
            tier: raceCourse.tier,
            unlock: raceCourse.unlock ? { ...raceCourse.unlock } : null,
            target: raceCourse.target,
            targetText: raceCourse.targetText,
            targetTimeSeconds: raceCourse.targetTimeSeconds,
            recommendedShip: raceCourse.recommendedShip,
            recommendedShipText: raceCourse.recommendedShipText,
            centerFuelReward: raceCourse.centerFuelReward,
            record,
            bestTime: record.bestTime,
            bestRank: record.bestRank,
            personalBestTime: record.bestTime,
            personalBestRank: record.bestRank,
            personalBestSplits: record.bestSplits ? [...record.bestSplits] : undefined,
            pbTime: record.bestTime,
            pbRank: record.bestRank,
            attempts: record.attempts,
            unlockLabel,
            guild: 'merchant',
            guildRep: 4 + raceCourse.tier,
            faction: 'free-merchants',
            // Entry fee + payout ladder go through t() so the German board
            // stops appending an English sentence with EN ordinals; the rank
            // list itself is language-neutral ("1: 4200").
            briefing: `${raceBriefingLine(raceCourse)} ${t('Entry is {fee} cr. Payouts by rank: {ranks}.', {
                fee: formatNumber(raceCourse.entryFee),
                ranks: raceCourse.payouts
                    .map((amount, index) => t('{rank}: {amount}{loss}', {
                        rank: index + 1,
                        amount: formatNumber(Math.abs(amount)),
                        loss: amount < 0 ? t(' (pay-in)') : '',
                    }))
                    .join(', '),
            })} ${t(raceCourse.targetText)} · ${t(raceCourse.recommendedShipText)}`,
        });
    }
    if (!LOCATIONS[locationId].services?.missions)
        return offers;
    const dangerBase = clamp(save.world.danger, 0.2, 3.5);
    const claimedNodeIds = new Set();
    for (let index = 0; index < count; index += 1) {
        const isBounty = index >= Math.ceil(count * 0.62);
        const id = `${locationId}-${cycle}-${index}-${Math.floor(rng() * 99999)}`;
        if (isBounty) {
            const rank = save.player.guildRank.bounty;
            // Warrants always send you to a different dockable POI: a target in
            // your current system (or in a non-dock field) reads as "hunt near
            // the station you're standing at" and the encounter can never
            // trigger, because the spawn check sits inside the approach path.
            const targetZone = pick(rng, DOCK_LOCATION_IDS.filter((id) => id !== locationId));
            const danger = dangerBase + randomBetween(rng, 0.35, 1.4) + rank * 0.25;
            const targetName = proceduralCallsign(rng);
            const reward = bountyReward(danger, rank, targetZone);
            const deposit = Math.round(reward * 0.05);
            // Warrants pin a pilot profile at offer time: high-reward targets are
            // named aces, and the profile travels with the mission so the same
            // callsign flies the same way on every encounter (and after reloads).
            // Registry standing draws hotter prey: each bounty rank drops the
            // danger bar for a veteran/ace pin (a Marshal's board is thick with
            // named aces), and even below the bar there's a slim rank-scaled
            // chance the registry certifies a veteran name. The top tier stays
            // probabilistic so even the highest rank keeps some steady hands.
            const rankEdge = rank * 0.4;
            const aceChance = 0.8 + rank * 0.05;
            const pinnedTier = danger + rankEdge >= 2 ? (rng() < aceChance ? 'ace' : 'veteran')
                : danger + rankEdge >= 1.3 ? 'veteran'
                : rng() < 0.05 + rank * 0.08 ? 'veteran'
                : undefined;
            const pilot = rollPilot(rng, clamp(0.35 + (danger + rankEdge) * 0.3, 0.2, 1), 'red-talons', pinnedTier ? { tier: pinnedTier } : undefined);
            // The profile rides in the briefing so players can read a warrant's
            // habits before they accept: the callsign, its tier, and its
            // temperament are stable for the whole contract.
            const pilotProfile = pilot
                ? t(' Pilot profile: {tier} {temperament}{note}.', { tier: t(TIER_LABELS[pilot.tier]), temperament: t(TEMPERAMENT_LABELS[pilot.temperament]), note: pinnedTier === 'ace' ? t(' — expect relentless pursuit.') : '' })
                : '';
            offers.push({
                id,
                kind: 'bounty',
                title: t('Warrant: {name}', { name: targetName }),
                issuer: pick(rng, bountyIssuers),
                origin: locationId,
                targetZone,
                targetName,
                reward,
                deposit,
                danger,
                pilot,
                deadline: save.world.time + randomInt(rng, 300, 620),
                status: 'offered',
                guild: 'bounty',
                guildRep: 7 + Math.floor(danger * 3),
                faction: locationId === 'rook' ? 'concord' : LOCATIONS[locationId].faction,
                briefing: t('{name} has been positively identified near {station}. Locate the ship, confirm identity, and destroy it. Expect armed resistance{escorts}.{profile}', { name: targetName, station: LOCATIONS[targetZone].name, escorts: danger > 2 ? t(' and possible escorts') : '', profile: pilotProfile }),
            });
            continue;
        }
        // Ore-hungry stations (they import ore at a premium, so buying it
        // locally is the expensive route) post mining contracts: the board
        // stakes a specific Shardbelt claim, the pilot cuts it out, and the ore
        // is delivered back. No clock — and only rock actually cut from the
        // claim counts, so bought ore can't pad the manifest.
        // The smuggler's den opens once the berth ledger crosses the favor
        // line: paid dark-arrival fees buy access to restricted-cargo runs.
        // One or two appear on the board whenever the den is open.
        const denOpen = (save.world.underworld?.[locationId] ?? 0) >= SYNDICATE_DEN_FAVOR;
        if (denOpen && (index === 2 || index === 4)) {
            const commodity = pick(rng, SMUGGLE_COMMODITIES);
            const destination = pick(rng, DOCK_LOCATION_IDS.filter((id) => id !== locationId && id !== 'rook'));
            const distance = routeDistanceBetween(locationId, destination);
            const quantity = randomInt(rng, 3, 8);
            const rank = save.player.guildRank.syndicate ?? 0;
            const danger = dangerBase + randomBetween(rng, 0.3, 1.1);
            const reward = Math.round(contractReward(distance, quantity, danger, rank) * 1.3);
            offers.push({
                id,
                kind: 'smuggle',
                title: t('Dark run: {quantity} {commodity}', { quantity, commodity: t(COMMODITIES[commodity].name) }),
                issuer: pick(rng, syndicateIssuers),
                origin: locationId,
                destination,
                commodity,
                quantity,
                reward,
                deposit: Math.round(reward * 0.06),
                deadline: save.world.time + randomInt(rng, 240, 460),
                status: 'offered',
                guild: 'syndicate',
                guildRep: 8 + Math.floor(distance / 160) + Math.floor(quantity / 2),
                faction: 'red-talons',
                briefing: t('{quantity} units of {commodity} that the manifest cannot show. Collect the sealed crate, run dark, and deliver to {station}. A patrol that resolves you seizes the crate and fines you — stay off the cordon.', { quantity, commodity: t(COMMODITIES[commodity].name), station: LOCATIONS[destination].name }),
            });
            continue;
        }
        if (LOCATIONS[locationId].systemId === 'helios-verge' && (LOCATIONS[locationId].economy?.ore ?? 1) > 1 && index < 2) {
            const candidates = miningClaimCandidates(save.world.seed, save.world.depletedAsteroids, save.world.scannedNodes)
                .filter((node) => !claimedNodeIds.has(node.id));
            const claim = pick(rng, candidates);
            if (claim) {
                claimedNodeIds.add(claim.id);
                const quantity = Math.round(claim.remaining);
                const claimName = miningClaimName(claim.id);
                offers.push({
                    id,
                    kind: 'mining',
                    title: t('Mine the {claim} claim', { claim: t(claimName) }),
                    issuer: pick(rng, miningIssuers),
                    origin: locationId,
                    destination: locationId,
                    commodity: 'ore',
                    quantity,
                    claimNodeId: claim.id,
                    claimName,
                    claimPosition: [...claim.position],
                    mined: 0,
                    reward: miningReward(quantity, save.player.guildRank.mining),
                    deposit: 0,
                    // null = no deadline. Never Infinity: JSON.stringify turns
                    // Infinity into null on autosave, which used to read as
                    // "already expired" and fail the contract on the next load.
                    deadline: null,
                    status: 'offered',
                    guild: 'mining',
                    guildRep: 6 + Math.floor(quantity / 3) + (save.player.guildRank.mining >= 1 ? 1 : 0),
                    faction: 'frontier-miners',
                    briefing: t('{station} holds the papers on the {claim} in the Shardbelt. Cut the whole seam — {quantity} units — and deliver it back. No deadline: the claim is yours until it runs dry. Bought ore won\'t clear the manifest.', { station: LOCATIONS[locationId].name, claim: t(claimName), quantity }),
                });
                continue;
            }
            // No stakable claim left: fall through to a merchant contract.
        }
        // Merchant contracts always hand the cargo over at acceptance (sealed
        // goods) — the old "procure on the open market" run just re-bought
        // market cargo for a delivery fee, so it is gone. Getting cargo from a
        // specific rock is what the mining claims are for.
        const kind = pick(rng, ['delivery', 'transport']);
        const destination = chooseDestination(rng, locationId);
        const distance = routeDistanceBetween(locationId, destination);
        const rank = save.player.guildRank.merchant;
        const danger = dangerBase + randomBetween(rng, 0.05, 0.8);
        const quantity = kind === 'transport' ? randomInt(rng, 2, 5) : randomInt(rng, 3, Math.min(10, 6 + rank * 2));
        const commodity = kind === 'transport' ? undefined : chooseCommodity(rng);
        const reward = contractReward(distance, quantity, danger, rank) * (kind === 'transport' ? 1.15 : 1);
        const deposit = kind === 'delivery' ? Math.round(reward * 0.08) : Math.round(reward * 0.12);
        const title = kind === 'delivery'
            ? t('Deliver {quantity} {commodity}', { quantity, commodity: t(COMMODITIES[commodity].name) })
            : t('Express transport to {station}', { station: LOCATIONS[destination].shortName });
        const cargoLabel = pick(rng, VALUABLE_CARGO_LABELS);
        offers.push({
            id,
            kind,
            title,
            issuer: pick(rng, merchantIssuers),
            origin: locationId,
            destination,
            commodity,
            quantity,
            reward: Math.round(reward),
            deposit,
            // Express runs pay a premium (1.15x reward, +3 guild rep) but the
            // client is buying urgency: the clock is only ~60% of a delivery's,
            // so accepting one means committing to the destination. The floor
            // keeps a freshly posted express from reading as already expired
            // before the board cycles.
            deadline: save.world.time + (kind === 'transport'
                ? Math.max(150, Math.round((150 + distance * 0.4 + randomBetween(rng, 75, 190)) * 0.6))
                : Math.round(150 + distance * 0.4 + randomBetween(rng, 75, 190))),
            status: 'offered',
            guild: 'merchant',
            guildRep: 5 + Math.floor(distance / 170) + (kind === 'transport' ? 3 : 0),
            faction: LOCATIONS[destination].faction,
            briefing: kind === 'delivery'
                ? t('{quantity} units of {commodity} are sealed and waiting. Deliver them intact to {station}. Cargo mass is reserved on acceptance.', { quantity, commodity: t(COMMODITIES[commodity].name), station: LOCATIONS[destination].name })
                : t('Carry a {cargo} to {station}. The case occupies {mass} cargo mass and the client values punctuality above discretion.', { cargo: t(cargoLabel), station: LOCATIONS[destination].name, mass: (quantity * 1.2).toFixed(1) }),
        });
    }
    return offers;
};
export const refreshMissionOffers = (save, force = false) => {
    const cycle = missionCycle(save.world.time);
    for (const locationId of MISSION_LOCATION_IDS) {
        const existing = save.world.offers[locationId] ?? [];
        // The cycle lives in the second dash segment of mission ids
        // (`<location>-<cycle>-<index>-<rand>`), but race offers (pushed
        // first) id as `race-<course>` — parsing those yielded NaN, which
        // failed the `!== cycle` guard for every board refresh. Only trust
        // segments that are actually numeric.
        const existingCycle = existing
            .map((offer) => offer.id.split('-')[1])
            .find((segment) => /^\d+$/.test(segment));
        if (force || existing.length === 0 || Number(existingCycle) !== cycle) {
            save.world.offers[locationId] = generateMissionOffers(locationId, save);
        }
    }
};
export const acceptMission = (save, locationId, missionId) => {
    const offered = save.world.offers[locationId]?.find((mission) => mission.id === missionId);
    if (!offered || offered.status !== 'offered')
        return { ok: false, message: t('Contract is no longer available.') };
    if (save.activeMissions.length >= 6)
        return { ok: false, message: t('Mission computer has reached its active-contract limit.') };
    if (save.player.credits < offered.deposit)
        return { ok: false, message: t('A {credits} credit bond is required.', { credits: offered.deposit }) };
    if (offered.kind === 'delivery' || offered.kind === 'transport' || offered.kind === 'smuggle') {
        const units = offered.quantity ?? 0;
        const massPerUnit = offered.kind === 'transport' ? 1.2 : COMMODITIES[offered.commodity].mass;
        const requiredMass = units * massPerUnit;
        if (cargoFree(save.player) + 0.001 < requiredMass) {
            return { ok: false, message: t('Free {mass} cargo mass before accepting this contract.', { mass: requiredMass.toFixed(1) }) };
        }
        const smuggled = offered.kind === 'smuggle';
        save.player.sealedCargo.push({
            missionId: offered.id,
            label: smuggled
                ? t('{commodity} (syndicate)', { commodity: t(COMMODITIES[offered.commodity].name) })
                : offered.kind === 'delivery' ? t(COMMODITIES[offered.commodity].name) : t('Priority sealed package'),
            units,
            mass: massPerUnit,
            ...(smuggled ? { smuggled: true } : {}),
        });
    }
    save.player.credits -= offered.deposit;
    offered.status = 'active';
    offered.acceptedAt = save.world.time;
    save.activeMissions.push({ ...offered });
    save.world.offers[locationId] = save.world.offers[locationId].filter((mission) => mission.id !== offered.id);
    return { ok: true, message: t('Accepted: {title}', { title: offered.title }), mission: offered };
};
const consumeProcurementCargo = (player, commodity, quantity) => {
    const owned = player.cargo[commodity] ?? 0;
    if (owned < quantity)
        return false;
    player.cargo[commodity] = owned - quantity;
    return true;
};
const updateGuildRank = (player, guild) => {
    const thresholds = [0, 20, 65, 145];
    const oldRank = player.guildRank[guild];
    let nextRank = oldRank;
    thresholds.forEach((threshold, index) => {
        if (player.guildRep[guild] >= threshold)
            nextRank = index;
    });
    player.guildRank[guild] = Math.min(nextRank, GUILD_RANK_NAMES[guild].length - 1);
    return { rankedUp: player.guildRank[guild] > oldRank, name: GUILD_RANK_NAMES[guild][player.guildRank[guild]] };
};
const awardMission = (save, mission) => {
    mission.status = 'completed';
    save.player.credits += mission.reward + mission.deposit;
    save.player.guildRep[mission.guild] = (save.player.guildRep[mission.guild] ?? 0) + mission.guildRep;
    save.player.reputation[mission.faction] = clamp(save.player.reputation[mission.faction] + Math.max(1, Math.floor(mission.guildRep / 3)), -100, 100);
    save.player.stats.contracts += 1;
    save.world.completedMissionIds.push(mission.id);
    save.activeMissions = save.activeMissions.filter((entry) => entry.id !== mission.id);
    const rank = updateGuildRank(save.player, mission.guild);
    return t('{title} complete. {credits} credits transferred.{note}', { title: mission.title, credits: mission.reward + mission.deposit, note: rank.rankedUp ? t(' Rank advanced: {rank}.', { rank: t(rank.name) }) : '' });
};
export const completeMissionsAtDock = (save, locationId) => {
    const messages = [];
    const candidates = [...save.activeMissions];
    for (const mission of candidates) {
        if (mission.destination !== locationId)
            continue;
        if (mission.kind === 'delivery' || mission.kind === 'transport') {
            const cargoIndex = save.player.sealedCargo.findIndex((cargo) => cargo.missionId === mission.id);
            if (cargoIndex < 0)
                continue;
            save.player.sealedCargo.splice(cargoIndex, 1);
            messages.push(awardMission(save, mission));
        }
        else if (mission.kind === 'mining' && mission.commodity && mission.quantity) {
            // Claim contracts only clear on rock the pilot actually cut: bought
            // ore can pad a hold but never satisfies the manifest. Legacy mining
            // contracts (no claim) keep the old any-ore rule.
            const minedEnough = mission.claimNodeId ? (mission.mined ?? 0) >= mission.quantity : true;
            if (minedEnough && consumeProcurementCargo(save.player, mission.commodity, mission.quantity))
                messages.push(awardMission(save, mission));
        }
        else if (mission.kind === 'smuggle') {
            // The dark run clears on arrival: the crate is handed to the den.
            const cargoIndex = save.player.sealedCargo.findIndex((cargo) => cargo.missionId === mission.id);
            if (cargoIndex < 0)
                continue;
            save.player.sealedCargo.splice(cargoIndex, 1);
            messages.push(awardMission(save, mission));
        }
        else if (mission.kind === 'procurement' && mission.commodity && mission.quantity) {
            // Legacy contracts from before market-procure runs were removed:
            // old saves can still finish what they started.
            if (consumeProcurementCargo(save.player, mission.commodity, mission.quantity))
                messages.push(awardMission(save, mission));
        }
    }
    return messages;
};
export const completeBountyMission = (save, missionId) => {
    const mission = save.activeMissions.find((entry) => entry.id === missionId && entry.kind === 'bounty');
    if (!mission)
        return { ok: false, message: 'No matching active warrant.' };
    const callsign = mission.targetName ?? mission.id;
    save.world.bountyKills.push(callsign);
    // Registry: remember every cleared callsign with the pinned profile, so the
    // bounty board shows which named pilots the player has taken down. Legacy
    // warrants (no pinned pilot) still register under the callsign.
    const entry = save.world.registry[callsign] ?? {
        tier: mission.pilot?.tier,
        temperament: mission.pilot?.temperament,
        danger: mission.danger,
        count: 0,
    };
    if (mission.pilot?.tier)
        entry.tier = mission.pilot.tier;
    if (mission.pilot?.temperament)
        entry.temperament = mission.pilot.temperament;
    entry.danger = mission.danger ?? entry.danger;
    entry.count = (entry.count ?? 0) + 1;
    entry.clearedAt = save.world.time;
    save.world.registry[callsign] = entry;
    const aceKill = mission.pilot?.tier === 'ace';
    // Bonus rep lands before the award's rank check, so a rank-up earned from
    // an ace kill is reported in the same completion toast.
    if (aceKill)
        save.player.guildRep.bounty += ACE_WARRANT_REP;
    save.player.guildRep.bounty += 2;
    const message = awardMission(save, mission);
    save.player.reputation['red-talons'] = clamp(save.player.reputation['red-talons'] - 4, -100, 100);
    return {
        ok: true,
        message: aceKill ? `${message} ${t('Ace warrant confirmed — {rep} registry rep.', { rep: ACE_WARRANT_REP })}` : message,
        mission,
    };
};
export const failExpiredMissions = (save) => {
    const messages = [];
    for (const mission of [...save.activeMissions]) {
        // A null deadline is a no-deadline contract (mining claims): it never
        // expires. Legacy saves may also carry null from an Infinity round-trip.
        if (mission.deadline == null || save.world.time <= mission.deadline)
            continue;
        mission.status = 'failed';
        save.world.failedMissionIds.push(mission.id);
        save.activeMissions = save.activeMissions.filter((entry) => entry.id !== mission.id);
        save.player.sealedCargo = save.player.sealedCargo.filter((cargo) => cargo.missionId !== mission.id);
        save.player.guildRep[mission.guild] = Math.max(0, save.player.guildRep[mission.guild] - Math.max(2, Math.floor(mission.guildRep / 2)));
        save.player.reputation[mission.faction] = clamp(save.player.reputation[mission.faction] - 3, -100, 100);
        messages.push(t('Contract failed: {title}', { title: mission.title }));
    }
    return messages;
};
export const guildJoinCost = (guild) => (guild === 'merchant' ? 500 : guild === 'bounty' ? 900 : 650);
export const joinGuild = (save, guild) => {
    if (save.player.guildRep[guild] > 0)
        return { ok: false, message: t('Guild membership already active.') };
    const cost = guildJoinCost(guild);
    if (save.player.credits < cost)
        return { ok: false, message: t('Membership requires {credits} credits.', { credits: cost }) };
    save.player.credits -= cost;
    save.player.guildRep[guild] = 1;
    updateGuildRank(save.player, guild);
    return { ok: true, message: t('Joined {guild}. Entry fee paid.', { guild: t(GUILD_NAMES_FALLBACK(guild)) }) };
};
export const awardCareerProgress = (save, guild, amount, faction) => {
    save.player.guildRep[guild] += amount;
    save.player.reputation[faction] = clamp(save.player.reputation[faction] + Math.max(1, Math.floor(amount / 4)), -100, 100);
    const rank = updateGuildRank(save.player, guild);
    return rank.rankedUp ? t('{guild} rank advanced: {rank}.', { guild: t(GUILD_NAMES_FALLBACK(guild)), rank: t(rank.name) }) : undefined;
};
