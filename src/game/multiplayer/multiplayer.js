import { t } from '../i18n.js';
import { createMultiplayerMatch } from './matchRules.js';
import { createStarterPilotFitting } from './pilotFitting.js';
import { PeerLink, roomTokenFromUrl } from './peerLink.js';
import { MatchWorld } from './matchWorld.js';
import { MatchFlight } from './matchFlight.js';
import { MultiplayerView, matchClock } from './multiplayerView.js';

const PROTOCOL = 1;
const HOST = 'host';
const COMMAND_ERRORS = {
    'not-enough-pilots': 'More pilots are needed to start.',
    'team-full': 'That team already has two pilots.',
    'lobby-closed': 'This round has already started.',
    'lobby-full': 'All four pilot seats are booked.',
    'insufficient-credits': 'You need more credits for this upgrade.',
    'shop-closed': 'The shop opens after your ship is lost.',
};

export class Multiplayer {
    constructor(ui, startFlight, stopFlight) {
        this.ui = ui;
        this.startFlight = startFlight;
        this.stopFlight = stopFlight;
        this.view = new MultiplayerView(ui, (action, args) => void this.act(action, args));
        this.screen = '';
        this.name = '';
        this.joinCode = '';
        this.reply = '';
        this.remainingSeconds = 0;
    }

    open(fromInvite) {
        if (this.link) return;
        this.roomToken = fromInvite ? roomTokenFromUrl() : undefined;
        this.screen = this.roomToken ? 'join' : 'welcome';
        this.status = '';
        this.render();
    }

    render() {
        this.view.render({ ...this, pilot: this.localPilot(), busy: Boolean(this.busy) });
    }

    localPilot() {
        return this.state?.players.find(pilot => pilot.id === this.localId);
    }

    back() {
        if (this.screen === 'score') {
            this.screen = 'flight';
            this.render();
        } else if (this.screen === 'join' && !this.link && !this.roomToken) {
            this.screen = 'welcome';
            this.status = '';
            this.render();
        } else this.leave();
    }

    flightMenu() {
        if (!this.flight) return false;
        if (['flight', 'score'].includes(this.screen)) {
            this.screen = this.screen === 'score' ? 'flight' : 'score';
            this.status = '';
            this.render();
        }
        return true;
    }

    async act(action, args = {}) {
        if (action === 'field') {
            if (args.key === 'invite') this.joinCode = args.value;
            else if (args.key === 'name') this.name = args.value;
            else if (args.key === 'reply') this.reply = args.value;
            return;
        }
        if (action === 'leave') return this.leave();
        if (action === 'show-join') {
            this.screen = 'join';
            this.status = '';
            return this.render();
        }
        if (action.startsWith('copy-')) {
            const copied = await this.view.copy(action.slice(5));
            this.status = copied ? t('Copied.') : t('Select and copy the code.');
            return this.render();
        }
        if (action === 'setting') {
            const { key, value } = args;
            if (key === 'starter') return this.command('starter', { shipId: value });
            if (key === 'team') return this.command('team', { team: value || null });
            const typed = key === 'durationMinutes' ? Number(value) : key === 'friendlyFire' ? value === 'true' : value;
            return this.command('configure', { patch: { [key]: typed } });
        }
        if (action === 'buy-hull') return this.command(action, { shipId: args.matchId });
        if (action === 'buy-equipment') return this.command(action, { itemId: args.matchId, slot: args.matchSlot, index: Number(args.matchIndex) });
        if (['start', 'rematch', 'respawn'].includes(action)) return this.command(action);
        if (this.busy) return;
        const task = this.busy = {};
        this.status = '';
        this.render();
        try {
            if (action === 'host') this.hostRoom();
            if (action === 'join-code') await this.joinRoom();
            if (action === 'make-invite' && this.link) {
                const invite = await this.link.createInvite();
                if (this.busy === task) this.invite = invite;
            }
            if (action === 'accept-reply' && this.link) {
                await this.link.acceptReply(this.reply.trim());
                this.invite = '';
                this.reply = '';
            }
            if (action === 'cancel-invite' && this.link) {
                await this.link.cancelInvite(this.invite);
                this.invite = '';
                this.reply = '';
            }
        } catch (error) {
            if (this.busy === task) this.status = error.message;
        } finally {
            if (this.busy === task) {
                this.busy = undefined;
                this.render();
            }
        }
    }

    makeLink(role) {
        const link = new PeerLink({
            role,
            onOpen: id => { if (this.link === link) this.connected(id); },
            onMessage: (id, message) => { if (this.link === link) this.receive(id, message); },
            onClose: (id, reason) => { if (this.link === link) this.disconnected(id, reason); },
            onError: error => {
                if (this.link === link) {
                    if (this.host && error.status === 410) {
                        this.roomUrl = '';
                        if (this.screen === 'lobby') void this.openRoomLink(link);
                        return;
                    }
                    this.status = error.message;
                    this.render();
                }
            },
        });
        this.link = link;
        return link;
    }

    hostRoom() {
        const link = this.makeLink('host');
        this.host = true;
        this.localId = HOST;
        this.match = createMultiplayerMatch({ hostId: HOST, hostName: this.name, seed: Math.floor(Math.random() * 0x100000000) });
        this.distributeState();
        void this.openRoomLink(link);
    }

    openRoomLink(link) {
        void link.openRoom().then(url => {
            if (this.link !== link) return;
            this.roomUrl = url;
            if (this.screen === 'lobby') this.render();
        }).catch(() => {
            if (this.link !== link || this.screen !== 'lobby') return;
            this.status = t('Use invite codes to connect on this site.');
            this.render();
        });
    }

    async joinRoom() {
        const value = this.joinCode.trim();
        const room = this.roomToken ?? roomTokenFromUrl(value);
        if (!room && !value) throw new Error(t('Enter a room link or invite code.'));
        const link = this.makeLink('guest');
        this.host = false;
        this.status = t('Connecting to the host…');
        this.render();
        try {
            if (room) await link.joinRoom(room);
            else this.guestReply = await link.acceptInvite(value);
        } catch (error) {
            if (this.link === link) {
                this.link = undefined;
                link.close();
                throw error;
            }
        }
    }

    connected(id) {
        if (!this.host) this.send(id, { type: 'hello', name: this.name });
    }

    send(id, message, latest = false) {
        return this.link?.send(id, { v: PROTOCOL, ...message }, { latest });
    }

    broadcast(message, latest = false) {
        this.link?.broadcast({ v: PROTOCOL, ...message }, { latest });
    }

    receive(id, message) {
        if (message.v !== PROTOCOL) {
            if (this.host) this.send(id, { type: 'error', text: t('Reload both devices to the same build.') });
            return;
        }
        if (this.host) {
            if (message.type === 'hello') {
                if (this.match.players.has(id)) return;
                const joined = this.match.addPlayer(id, message.name);
                if (!joined.ok) {
                    this.send(id, { type: 'error', text: t(COMMAND_ERRORS[joined.code] ?? 'The room is unavailable.') });
                    return;
                }
                this.send(id, { type: 'assign', id });
                this.distributeState();
            } else if (this.match.players.get(id)?.connected) {
                if (message.type === 'command') this.handleCommand(id, message.action, message.args ?? {});
                if (message.type === 'ready' && message.round === this.match.round) this.markReady(id);
                if (message.type === 'leave') this.link.disconnect(id);
                if (message.type === 'input' && this.live && message.round === this.match.round)
                    this.world.receiveInput(id, message.input);
            }
            return;
        }

        if (message.type === 'error') {
            if (!this.localId) {
                const link = this.link;
                this.link = undefined;
                link.close();
                this.guestReply = '';
            }
            this.status = typeof message.text === 'string' ? message.text : t('The room is unavailable.');
            this.render();
        } else if (message.type === 'assign') {
            this.localId = message.id;
            this.status = '';
        } else if (message.type === 'state' && this.localId) {
            this.applyState(message.state, message.shop);
        } else if (this.state?.round === message.round && this.flight) {
            if (message.type === 'fit') this.flight.setFitting(message.fit);
            if (message.type === 'world') this.applyWorld(message.snapshot);
            if (message.type === 'events') this.flight.presentEvents(message.events);
        }
    }

    command(action, args = {}) {
        this.status = '';
        if (this.host) this.handleCommand(HOST, action, args);
        else this.send(HOST, { type: 'command', action, args });
    }

    handleCommand(id, action, args) {
        const { match } = this;
        let result;
        switch (action) {
            case 'configure': result = match.configure(id, args.patch); break;
            case 'starter': result = match.selectStarter(id, args.shipId); break;
            case 'team': result = match.setTeam(id, args.team); break;
            case 'start': result = match.start(id); break;
            case 'rematch': result = match.returnToLobby(id); break;
            case 'buy-hull': result = match.buyHull(id, args.shipId); break;
            case 'buy-equipment': result = match.buyEquipment(id, args.itemId, args.slot, args.index); break;
            case 'respawn': result = this.live && match.respawn(id); break;
            default: return;
        }
        if (!result?.ok) {
            const text = t(COMMAND_ERRORS[result?.code] ?? 'That action is unavailable.');
            if (id === this.localId) {
                this.status = text;
                this.render();
            } else this.send(id, { type: 'error', text });
            return;
        }
        if (action === 'start') this.ready = new Set();
        if (action === 'respawn') {
            this.world.spawn(result.actor);
            this.sendFit(id);
        }
        this.distributeState();
    }

    distributeState() {
        const state = this.match.snapshot();
        for (const peer of this.link.peerIds) {
            if (!this.match.players.get(peer)?.connected) continue;
            this.send(peer, { type: 'state', state, shop: this.match.shopFor(peer) });
        }
        this.applyState(state, this.match.shopFor(HOST));
    }

    applyState(state, shop) {
        if (!state?.players?.some(pilot => pilot.id === this.localId)) return;
        const previous = this.state;
        this.state = state;
        this.shop = shop;
        this.remainingSeconds = state.remainingSeconds;
        if (state.phase === 'lobby') {
            if (previous?.phase !== 'lobby' && this.flight) this.clearFlight();
            this.screen = 'lobby';
            if (this.host && previous?.phase === 'ended' && !this.roomUrl) void this.openRoomLink(this.link);
        } else if (state.phase === 'ended') {
            this.live = false;
            this.stopClock();
            this.screen = 'ended';
        } else if (state.phase === 'playing') {
            if (!this.flight) void this.prepareRound(state);
            else if (!this.localPilot().alive) this.screen = 'shop';
            else if (this.live && this.screen !== 'score') this.screen = 'flight';
        }
        if (this.screen !== 'flight' || !this.view.panel.classList.contains('is-hidden')) this.render();
    }

    async prepareRound(state) {
        const fit = createStarterPilotFitting(this.localPilot().starterShipId);
        const flight = new MatchFlight(this);
        this.flight = flight;
        this.screen = 'preparing';
        this.render();
        const session = await this.startFlight({
            multiplayer: flight, scenario: 'free-flight', site: state.settings.siteId, seed: state.seed, starterPlayer: fit.player,
        });
        if (this.flight !== flight) {
            if (session) this.stopFlight(session);
            return;
        }
        if (!session) {
            this.leave();
            this.screen = 'disconnected';
            this.status = t('Could not load the arena.');
            this.render();
            return;
        }
        flight.attach(session);
        if (this.host) {
            this.world = new MatchWorld(this.match, session, events => this.sendEvents(events), force => this.publishWorld(force));
            for (const actor of this.world.actors()) this.world.spawn(actor);
            this.loadTimeout = setTimeout(() => this.dropUnready(), 90_000);
            this.markReady(HOST);
        } else this.send(HOST, { type: 'ready', round: state.round });
    }

    markReady(id) {
        if (this.match.phase !== 'playing' || !this.ready || this.live) return;
        this.ready.add(id);
        if (!this.world || !this.match.connectedPlayers().every(pilot => this.ready.has(pilot.id))) return;
        clearTimeout(this.loadTimeout);
        this.live = true;
        for (const pilot of this.match.connectedPlayers()) this.sendFit(pilot.id);
        this.publishWorld(true);
        let last = performance.now();
        this.clock = setInterval(() => {
            const now = performance.now();
            this.world?.advance((now - last) / 1000);
            last = now;
        }, 1000 / 60);
    }

    dropUnready() {
        if (!this.live && this.match?.phase === 'playing')
            for (const pilot of this.match.connectedPlayers()) if (!this.ready.has(pilot.id)) this.link.disconnect(pilot.id, 'Arena loading timed out.');
    }

    sendFit(id) {
        const fit = this.world.fittingFor(id);
        if (id === this.localId) this.flight.setFitting(fit);
        else this.send(id, { type: 'fit', round: this.match.round, fit });
    }

    publishWorld(force) {
        if (force) this.distributeState();
        if (!this.world) return;
        const snapshot = this.world.snapshot();
        this.broadcast({ type: 'world', round: this.match.round, snapshot }, !force);
        this.applyWorld(snapshot);
    }

    applyWorld(snapshot) {
        if (this.state.phase === 'playing') this.live = true;
        else if (!this.live && this.state.phase !== 'ended') return;
        this.flight.updateSnapshot(snapshot, performance.now());
        if (this.screen === 'preparing' && this.live) {
            this.screen = 'flight';
            this.render();
        }
        const displayedTime = matchClock(this.remainingSeconds);
        if (this.screen === 'score' && displayedTime !== this.displayedTime) this.view.setClock(displayedTime);
        this.displayedTime = displayedTime;
    }

    sendInput(input, reliable) {
        if (this.host) this.world?.receiveInput(this.localId, input);
        else this.send(HOST, { type: 'input', round: this.state.round, input }, !reliable);
    }

    sendEvents(events) {
        this.broadcast({ type: 'events', round: this.match.round, events });
        this.flight.presentEvents(events);
        if (events.some(event => event.type === 'death')) this.distributeState();
    }

    disconnected(id, reason) {
        if (this.host) {
            if (!this.match.players.has(id)) {
                if (this.screen === 'lobby' && reason !== 'Invite cancelled.') {
                    this.status = reason;
                    this.render();
                }
                return;
            }
            this.match.removePlayer(id);
            this.distributeState();
            if (!this.live && this.match.phase === 'playing') this.markReady(HOST);
        } else {
            this.leave();
            this.screen = 'disconnected';
            this.status = reason || t('The host left the room.');
            this.render();
        }
    }

    stopClock() {
        clearInterval(this.clock);
        clearTimeout(this.loadTimeout);
        this.clock = undefined;
    }

    clearFlight() {
        this.stopClock();
        this.world = undefined;
        this.flight = undefined;
        this.live = false;
        this.stopFlight();
    }

    leave() {
        const link = this.link;
        if (link && !this.host) this.send(HOST, { type: 'leave' });
        this.link = undefined;
        link?.close();
        if (this.flight) this.clearFlight();
        Object.assign(this, {
            state: undefined, shop: undefined, match: undefined, host: false, localId: undefined,
            status: '', screen: '', invite: '', reply: '', roomUrl: '', roomToken: undefined, guestReply: '', busy: undefined,
        });
        if (roomTokenFromUrl()) history.replaceState(null, '', location.pathname + location.search);
        this.render();
        this.ui.root.querySelector('[data-ui-command="multiplayer"]')?.focus({ preventScroll: true });
    }
}
