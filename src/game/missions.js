import { COMMODITIES, DOCK_LOCATION_IDS, GUILD_RANK_NAMES, LOCATIONS, commodityIds, routeDistanceBetween } from './data.js';
import { cargoFree } from './economy.js';
import { clamp, pick, proceduralCallsign, randomBetween, randomInt, seededRandom } from './random.js';
const GUILD_NAMES_FALLBACK = (guild) => guild === 'merchant' ? 'Merchant Guild' : guild === 'bounty' ? 'Bounty Registry' : guild === 'mining' ? 'Prospectors Guild' : 'Salvage Union';
const merchantIssuers = ['Kestrel Freight', 'Orison Combine', 'Free Haulers Desk', 'Sable Route Logistics', 'Guild Dispatch'];
const bountyIssuers = ['Concord Warrant Desk', 'Frontier Security Office', 'Bounty Hunters Registry', 'Civil Claims Bureau'];
const cargoLabels = ['sealed diplomatic case', 'reactor-control package', 'medical coldbox', 'priority machine tooling', 'survey archive'];
const missionCycle = (worldTime) => Math.floor(worldTime / 150);
const chooseDestination = (rng, origin) => {
    const candidates = DOCK_LOCATION_IDS.filter((id) => id !== origin);
    return pick(rng, candidates);
};
const chooseCommodity = (rng, kind) => {
    if (kind === 'procurement') {
        return pick(rng, ['medicine', 'electronics', 'machinery', 'food', 'water', 'ore', 'scrap']);
    }
    return pick(rng, commodityIds.filter((id) => id !== 'arms'));
};
const contractReward = (distance, quantity, danger, rank) => Math.round(750 + distance * 3.3 + quantity * 90 + danger * 340 + rank * 520);
const bountyReward = (danger, rank, zone) => {
    const zoneFactor = zone === 'mourning-line' ? 1.25 : zone === 'shardbelt' ? 1.1 : 1;
    return Math.round((2600 + danger * 1650 + rank * 950) * zoneFactor);
};
export const generateMissionOffers = (locationId, save, count = 7) => {
    const cycle = missionCycle(save.world.time);
    const rng = seededRandom(`${save.world.seed}:missions:${cycle}:${locationId}`);
    const offers = [];
    const dangerBase = clamp(save.world.danger, 0.2, 3.5);
    for (let index = 0; index < count; index += 1) {
        const isBounty = index >= Math.ceil(count * 0.62);
        const id = `${locationId}-${cycle}-${index}-${Math.floor(rng() * 99999)}`;
        if (isBounty) {
            const rank = save.player.guildRank.bounty;
            const targetZone = pick(rng, ['shardbelt', 'mourning-line', 'vesper', 'azure']);
            const danger = dangerBase + randomBetween(rng, 0.35, 1.4) + rank * 0.25;
            const targetName = proceduralCallsign(rng);
            const reward = bountyReward(danger, rank, targetZone);
            const deposit = Math.round(reward * 0.05);
            offers.push({
                id,
                kind: 'bounty',
                title: `Warrant: ${targetName}`,
                issuer: pick(rng, bountyIssuers),
                origin: locationId,
                targetZone,
                targetName,
                reward,
                deposit,
                deadline: save.world.time + randomInt(rng, 300, 620),
                status: 'offered',
                guild: 'bounty',
                guildRep: 7 + Math.floor(danger * 3),
                faction: locationId === 'rook' ? 'concord' : LOCATIONS[locationId].faction,
                briefing: `${targetName} has been positively identified near ${LOCATIONS[targetZone].name}. Locate the ship, confirm identity, and destroy it. Expect armed resistance${danger > 2 ? ' and possible escorts' : ''}.`,
            });
            continue;
        }
        const kind = pick(rng, ['delivery', 'procurement', 'transport']);
        const destination = chooseDestination(rng, locationId);
        const distance = routeDistanceBetween(locationId, destination);
        const rank = save.player.guildRank.merchant;
        const danger = dangerBase + randomBetween(rng, 0.05, 0.8);
        const quantity = kind === 'transport' ? randomInt(rng, 2, 5) : randomInt(rng, 3, Math.min(10, 6 + rank * 2));
        const commodity = kind === 'transport' ? undefined : chooseCommodity(rng, kind);
        const reward = contractReward(distance, quantity, danger, rank) * (kind === 'transport' ? 1.15 : 1);
        const deposit = kind === 'delivery' ? Math.round(reward * 0.08) : kind === 'transport' ? Math.round(reward * 0.12) : 0;
        const title = kind === 'delivery'
            ? `Deliver ${quantity} ${COMMODITIES[commodity].name}`
            : kind === 'procurement'
                ? `Procure ${quantity} ${COMMODITIES[commodity].name}`
                : `Timed transport to ${LOCATIONS[destination].shortName}`;
        const cargoLabel = pick(rng, cargoLabels);
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
            deadline: save.world.time + Math.round(150 + distance * 0.4 + randomBetween(rng, 75, 190)),
            status: 'offered',
            guild: 'merchant',
            guildRep: 5 + Math.floor(distance / 170) + (kind === 'transport' ? 3 : 0),
            faction: LOCATIONS[destination].faction,
            briefing: kind === 'delivery'
                ? `${quantity} units of ${COMMODITIES[commodity].name} are sealed and waiting. Deliver them intact to ${LOCATIONS[destination].name}. Cargo mass is reserved on acceptance.`
                : kind === 'procurement'
                    ? `${LOCATIONS[destination].name} requires ${quantity} units of ${COMMODITIES[commodity].name}. Source them on the open market and deliver before the contract expires.`
                    : `Carry a ${cargoLabel} to ${LOCATIONS[destination].name}. The case occupies ${(quantity * 1.2).toFixed(1)} cargo mass and the client values punctuality above discretion.`,
        });
    }
    return offers;
};
export const refreshMissionOffers = (save, force = false) => {
    const cycle = missionCycle(save.world.time);
    for (const locationId of DOCK_LOCATION_IDS) {
        const existing = save.world.offers[locationId] ?? [];
        const existingCycle = existing[0]?.id.split('-')[1];
        if (force || existing.length === 0 || Number(existingCycle) !== cycle) {
            save.world.offers[locationId] = generateMissionOffers(locationId, save);
        }
    }
};
export const acceptMission = (save, locationId, missionId) => {
    const offered = save.world.offers[locationId]?.find((mission) => mission.id === missionId);
    if (!offered || offered.status !== 'offered')
        return { ok: false, message: 'Contract is no longer available.' };
    if (save.activeMissions.length >= 6)
        return { ok: false, message: 'Mission computer has reached its active-contract limit.' };
    if (save.player.credits < offered.deposit)
        return { ok: false, message: `A ${offered.deposit} credit bond is required.` };
    if (offered.kind === 'delivery' || offered.kind === 'transport') {
        const units = offered.quantity ?? 0;
        const massPerUnit = offered.kind === 'delivery' ? COMMODITIES[offered.commodity].mass : 1.2;
        const requiredMass = units * massPerUnit;
        if (cargoFree(save.player) + 0.001 < requiredMass) {
            return { ok: false, message: `Free ${requiredMass.toFixed(1)} cargo mass before accepting this contract.` };
        }
        save.player.sealedCargo.push({
            missionId: offered.id,
            label: offered.kind === 'delivery' ? COMMODITIES[offered.commodity].name : 'Priority sealed package',
            units,
            mass: massPerUnit,
        });
    }
    save.player.credits -= offered.deposit;
    offered.status = 'active';
    offered.acceptedAt = save.world.time;
    save.activeMissions.push({ ...offered });
    save.world.offers[locationId] = save.world.offers[locationId].filter((mission) => mission.id !== offered.id);
    return { ok: true, message: `Accepted: ${offered.title}`, mission: offered };
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
    save.player.guildRep[mission.guild] += mission.guildRep;
    save.player.reputation[mission.faction] = clamp(save.player.reputation[mission.faction] + Math.max(1, Math.floor(mission.guildRep / 3)), -100, 100);
    save.player.stats.contracts += 1;
    save.world.completedMissionIds.push(mission.id);
    save.activeMissions = save.activeMissions.filter((entry) => entry.id !== mission.id);
    const rank = updateGuildRank(save.player, mission.guild);
    return `${mission.title} complete. ${mission.reward + mission.deposit} credits transferred.${rank.rankedUp ? ` Rank advanced: ${rank.name}.` : ''}`;
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
        else if (mission.kind === 'procurement' && mission.commodity && mission.quantity) {
            if (consumeProcurementCargo(save.player, mission.commodity, mission.quantity)) {
                messages.push(awardMission(save, mission));
            }
        }
    }
    return messages;
};
export const completeBountyMission = (save, missionId) => {
    const mission = save.activeMissions.find((entry) => entry.id === missionId && entry.kind === 'bounty');
    if (!mission)
        return { ok: false, message: 'No matching active warrant.' };
    save.world.bountyKills.push(mission.targetName ?? mission.id);
    const message = awardMission(save, mission);
    save.player.guildRep.bounty += 2;
    save.player.reputation['red-talons'] = clamp(save.player.reputation['red-talons'] - 4, -100, 100);
    return { ok: true, message, mission };
};
export const failExpiredMissions = (save) => {
    const messages = [];
    for (const mission of [...save.activeMissions]) {
        if (save.world.time <= mission.deadline)
            continue;
        mission.status = 'failed';
        save.world.failedMissionIds.push(mission.id);
        save.activeMissions = save.activeMissions.filter((entry) => entry.id !== mission.id);
        save.player.sealedCargo = save.player.sealedCargo.filter((cargo) => cargo.missionId !== mission.id);
        save.player.guildRep[mission.guild] = Math.max(0, save.player.guildRep[mission.guild] - Math.max(2, Math.floor(mission.guildRep / 2)));
        save.player.reputation[mission.faction] = clamp(save.player.reputation[mission.faction] - 3, -100, 100);
        messages.push(`Contract failed: ${mission.title}`);
    }
    return messages;
};
export const guildJoinCost = (guild) => (guild === 'merchant' ? 500 : guild === 'bounty' ? 900 : 650);
export const joinGuild = (save, guild) => {
    if (save.player.guildRep[guild] > 0)
        return { ok: false, message: 'Guild membership already active.' };
    const cost = guildJoinCost(guild);
    if (save.player.credits < cost)
        return { ok: false, message: `Membership requires ${cost} credits.` };
    save.player.credits -= cost;
    save.player.guildRep[guild] = 1;
    updateGuildRank(save.player, guild);
    return { ok: true, message: `Joined ${guild}. Entry fee paid.` };
};
export const awardCareerProgress = (save, guild, amount, faction) => {
    save.player.guildRep[guild] += amount;
    save.player.reputation[faction] = clamp(save.player.reputation[faction] + Math.max(1, Math.floor(amount / 4)), -100, 100);
    const rank = updateGuildRank(save.player, guild);
    return rank.rankedUp ? `${GUILD_NAMES_FALLBACK(guild)} rank advanced: ${rank.name}.` : undefined;
};
