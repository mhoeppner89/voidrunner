import { ARENA_SITE_IDS } from '../arenaSites.js';
import { SHIPS } from '../data.js';
import { createPilotFitting, MULTIPLAYER_STARTER_IDS } from './pilotFitting.js';
import {
    MULTIPLAYER_DEATH_CREDITS, multiplayerKillPoints, multiplayerScorePreview, multiplayerShopFor,
    purchaseMultiplayerEquipment, purchaseMultiplayerHull, stockMultiplayerFit,
} from './matchShop.js';

export { MULTIPLAYER_DEATH_CREDITS, MULTIPLAYER_STARTER_IDS };
export const MULTIPLAYER_MODES = Object.freeze(['ffa', 'teams']);
export const MULTIPLAYER_TEAMS = Object.freeze(['red', 'blue']);
export const MULTIPLAYER_DURATIONS = Object.freeze([5, 10]);
export const DEFAULT_MULTIPLAYER_SETTINGS = Object.freeze({
    mode: 'ffa', durationMinutes: 5, friendlyFire: false, siteId: 'verge-lanes',
});

const slots = [0, 1, 2, 3];
const fail = code => ({ ok: false, code });
const pass = fields => ({ ok: true, code: 'ok', ...fields });
const validPlayerId = id => typeof id === 'string' && id.length > 0 && id.length <= 64;
const pilotName = (name, slot) => (typeof name === 'string' && name.replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, 24))
    || `Pilot ${slot + 1}`;
const legalSettings = settings => MULTIPLAYER_MODES.includes(settings.mode)
    && MULTIPLAYER_DURATIONS.includes(settings.durationMinutes)
    && typeof settings.friendlyFire === 'boolean'
    && ARENA_SITE_IDS.includes(settings.siteId);

function settingsWithPatch(settings, patch) {
    const next = { ...settings };
    for (const key of Object.keys(next)) if (Object.hasOwn(patch, key)) next[key] = patch[key];
    return legalSettings(next) ? Object.freeze(next) : null;
}

function clearPilotRound(pilot) {
    pilot.shipId = pilot.starterShipId;
    pilot.outfitting = stockMultiplayerFit(pilot.shipId);
    pilot.ownedFits = new Map([[pilot.shipId, pilot.outfitting]]);
    pilot.spareEquipment = new Map();
    pilot.paidMounts = new Set();
    pilot.credits = 0;
    pilot.score = 0;
    pilot.kills = 0;
    pilot.deaths = 0;
    pilot.life = 0;
    pilot.pointsByLife = [];
    pilot.actor = null;
    pilot.alive = false;
}

function spawnPilot(pilot) {
    const fitting = createPilotFitting(pilot.shipId, pilot.outfitting);
    pilot.life += 1;
    pilot.pointsByLife[pilot.life] = multiplayerKillPoints(pilot.shipId, pilot.outfitting);
    pilot.actor = {
        ...fitting.player, stats: fitting.stats, id: pilot.id, team: pilot.team, life: pilot.life,
        position: [0, 0, 0], velocity: [0, 0, 0], rotation: [0, 0, 0, 1], angularVelocity: [0, 0, 0],
        throttle: 0, variant: SHIPS[pilot.shipId].variant, targetId: null,
    };
    pilot.alive = true;
    return pilot.actor;
}

function pilotSnapshot(pilot) {
    const { id, name, slot, team, starterShipId, shipId, credits, score, kills, deaths, connected, alive, life } = pilot;
    return {
        id, name, slot, team, starterShipId, shipId, credits, score, kills, deaths, connected, alive, life,
        ...multiplayerScorePreview(multiplayerKillPoints(shipId, pilot.outfitting)),
    };
}

function scoreLeaders(rows) {
    const highScore = Math.max(...rows.map(row => row.score));
    return rows.filter(row => row.score === highScore).map(row => row.id);
}

class MultiplayerMatch {
    constructor(hostId, hostName, settings, seed) {
        this.hostId = hostId;
        this.seed = Number.isInteger(seed) ? seed >>> 0 : 1;
        this.round = 0;
        this.phase = 'lobby';
        this.settings = settings;
        this.players = new Map();
        this.remainingSeconds = 0;
        this.result = null;
        this.addPlayer(hostId, hostName);
    }

    addPlayer(id, name) {
        if (this.phase !== 'lobby') return fail('lobby-closed');
        if (!validPlayerId(id)) return fail('invalid-player');
        if (this.players.has(id)) return fail('already-joined');
        const used = new Set(Array.from(this.players.values(), pilot => pilot.slot));
        const slot = slots.find(value => !used.has(value));
        if (slot === undefined) return fail('lobby-full');
        const team = this.settings.mode === 'teams' ? this.availableTeam() : null;
        const pilot = { id, name: pilotName(name, slot), slot, team, connected: true, starterShipId: MULTIPLAYER_STARTER_IDS[0] };
        clearPilotRound(pilot);
        this.players.set(id, pilot);
        return pass();
    }

    removePlayer(id) {
        const pilot = this.players.get(id);
        if (!pilot?.connected) return fail('unknown-player');
        if (id === this.hostId) {
            this.phase = 'closed';
            for (const member of this.players.values()) this.disconnectPilot(member);
        } else if (this.phase === 'lobby') {
            this.players.delete(id);
        } else {
            this.disconnectPilot(pilot);
            if (this.phase === 'playing') {
                const connected = this.connectedPlayers();
                const teams = new Set(connected.map(member => member.team));
                if (connected.length < 2 || (this.settings.mode === 'teams' && teams.size < 2))
                    this.finish('players-left');
            }
        }
        return pass();
    }

    disconnectPilot(pilot) {
        pilot.connected = false;
        pilot.alive = false;
        pilot.actor = null;
    }

    connectedPlayers() {
        return [...this.players.values()].filter(pilot => pilot.connected);
    }

    availableTeam() {
        const members = this.connectedPlayers();
        const red = members.filter(pilot => pilot.team === 'red').length;
        const blue = members.filter(pilot => pilot.team === 'blue').length;
        return red <= blue ? 'red' : 'blue';
    }

    configure(id, patch) {
        if (id !== this.hostId) return fail('host-only');
        if (this.phase !== 'lobby') return fail('lobby-closed');
        if (!patch || typeof patch !== 'object' || Array.isArray(patch)) return fail('invalid-settings');
        const next = settingsWithPatch(this.settings, patch);
        if (!next) return fail('invalid-settings');
        if (next.mode !== this.settings.mode) {
            for (const [index, pilot] of this.connectedPlayers().entries())
                pilot.team = next.mode === 'teams' ? MULTIPLAYER_TEAMS[index % MULTIPLAYER_TEAMS.length] : null;
        }
        this.settings = next;
        return pass();
    }

    selectStarter(id, shipId) {
        if (this.phase !== 'lobby') return fail('lobby-closed');
        const pilot = this.players.get(id);
        if (!pilot?.connected) return fail('unknown-player');
        if (!MULTIPLAYER_STARTER_IDS.includes(shipId)) return fail('invalid-starter');
        pilot.starterShipId = shipId;
        clearPilotRound(pilot);
        return pass();
    }

    setTeam(id, team) {
        if (this.phase !== 'lobby') return fail('lobby-closed');
        if (this.settings.mode !== 'teams') return fail('not-team-mode');
        const pilot = this.players.get(id);
        if (!pilot?.connected) return fail('unknown-player');
        if (team !== null && !MULTIPLAYER_TEAMS.includes(team)) return fail('unknown-team');
        if (team !== null && this.connectedPlayers().filter(member => member.id !== id && member.team === team).length >= 2)
            return fail('team-full');
        pilot.team = team;
        return pass();
    }

    canStart() {
        if (this.phase !== 'lobby') return false;
        const members = this.connectedPlayers();
        if (this.settings.mode === 'ffa') return members.length >= 2;
        return MULTIPLAYER_TEAMS.every(team => members.filter(pilot => pilot.team === team).length === 2);
    }

    start(id) {
        if (id !== this.hostId) return fail('host-only');
        if (this.phase !== 'lobby') return fail('lobby-closed');
        if (!this.canStart()) return fail('not-enough-pilots');
        this.phase = 'playing';
        this.round += 1;
        this.remainingSeconds = this.settings.durationMinutes * 60;
        return pass({ actors: this.connectedPlayers().map(spawnPilot) });
    }

    tick(dtSeconds) {
        if (this.phase !== 'playing' || !Number.isFinite(dtSeconds) || dtSeconds <= 0) return false;
        this.remainingSeconds = Math.max(0, this.remainingSeconds - dtSeconds);
        if (this.remainingSeconds > 1e-8) return false;
        this.remainingSeconds = 0;
        this.finish('time');
        return true;
    }

    teamStandings() {
        if (this.settings.mode !== 'teams') return [];
        return MULTIPLAYER_TEAMS.map(id => {
            const standings = { id, score: 0, kills: 0, deaths: 0 };
            for (const pilot of this.players.values()) {
                if (pilot.team !== id) continue;
                standings.score += pilot.score;
                standings.kills += pilot.kills;
                standings.deaths += pilot.deaths;
            }
            return standings;
        });
    }

    finish(reason) {
        const pilots = this.connectedPlayers();
        const teams = this.teamStandings().filter(team => pilots.some(pilot => pilot.team === team.id));
        this.result = {
            reason,
            winnerIds: this.settings.mode === 'ffa' ? scoreLeaders(pilots) : [],
            winnerTeams: scoreLeaders(teams),
        };
        this.phase = 'ended';
    }

    canDamage(sourceId, targetId) {
        if (this.phase !== 'playing' || sourceId === targetId) return false;
        const source = this.players.get(sourceId);
        const target = this.players.get(targetId);
        return Boolean(source?.connected && target?.connected && target.alive
            && (this.settings.mode === 'ffa' || this.settings.friendlyFire || source.team !== target.team));
    }

    recordDeath(victimId, killerId, { victimLife, killerLife, round } = {}) {
        if (this.phase !== 'playing') return fail('round-inactive');
        const victim = this.players.get(victimId);
        if (!victim?.alive || (victimLife !== undefined && victim.life !== victimLife)
            || (round !== undefined && this.round !== round)) return fail('stale-life');
        const killer = this.players.get(killerId);
        const eligible = killer?.connected && killer.id !== victimId
            && (this.settings.mode === 'ffa' || killer.team !== victim.team);
        const sourceLife = killerLife ?? killer?.life;
        const points = eligible && Number.isSafeInteger(sourceLife) ? killer.pointsByLife[sourceLife] ?? 0 : 0;
        if (points) {
            killer.kills += 1;
            killer.score += points;
        }
        const actor = victim.actor;
        victim.actor = null;
        victim.alive = false;
        victim.deaths += 1;
        victim.credits += MULTIPLAYER_DEATH_CREDITS;
        return pass({ actor, victimId, killerId: points ? killerId : null, points, credits: victim.credits });
    }

    canRefit(pilot) {
        return this.phase === 'playing' && pilot?.connected && !pilot.alive;
    }

    respawn(id) {
        const pilot = this.players.get(id);
        if (!this.canRefit(pilot)) return fail('respawn-unavailable');
        return pass({ actor: spawnPilot(pilot) });
    }

    shopFor(id) {
        const pilot = this.players.get(id);
        return this.canRefit(pilot) ? multiplayerShopFor(pilot) : null;
    }

    buyHull(id, shipId) {
        const pilot = this.players.get(id);
        return this.canRefit(pilot) ? purchaseMultiplayerHull(pilot, shipId) : fail('shop-closed');
    }

    buyEquipment(id, itemId, slot, index) {
        const pilot = this.players.get(id);
        return this.canRefit(pilot) ? purchaseMultiplayerEquipment(pilot, itemId, slot, index) : fail('shop-closed');
    }

    returnToLobby(id) {
        if (id !== this.hostId) return fail('host-only');
        if (this.phase !== 'ended') return fail('round-unfinished');
        for (const [pilotId, pilot] of this.players) {
            if (pilot.connected) clearPilotRound(pilot);
            else this.players.delete(pilotId);
        }
        this.phase = 'lobby';
        this.remainingSeconds = 0;
        this.result = null;
        return pass();
    }

    snapshot() {
        const players = [...this.players.values()].map(pilotSnapshot);
        players.sort((a, b) => a.slot - b.slot);
        return {
            hostId: this.hostId, seed: this.seed, round: this.round, phase: this.phase,
            settings: { ...this.settings }, players, remainingSeconds: this.remainingSeconds, canStart: this.canStart(),
            standings: { players: [...players].sort((a, b) => b.score - a.score), teams: this.teamStandings() },
            result: this.result && {
                reason: this.result.reason, winnerIds: [...this.result.winnerIds], winnerTeams: [...this.result.winnerTeams],
            },
        };
    }
}

export function createMultiplayerMatch({ hostId, hostName, settings = {}, seed = 1 } = {}) {
    const configured = settings && typeof settings === 'object' && !Array.isArray(settings)
        && settingsWithPatch(DEFAULT_MULTIPLAYER_SETTINGS, settings);
    if (!validPlayerId(hostId) || !configured) return null;
    return new MultiplayerMatch(hostId, hostName, configured, seed);
}
