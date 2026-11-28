import { t } from '../i18n.js';
import { SHIPS } from '../data.js';
import { createMultiplayerMatch } from './matchRules.js';
import { starterMultiplayerFit } from './matchShop.js';
import { createPilotFitting } from './pilotFitting.js';
import { PeerLink, roomTokenFromUrl } from './peerLink.js';
import { NativeLink, nativeBridgeAvailable } from './nativeLink.js';
import { MatchWorld } from './matchWorld.js';
import { MatchFlight } from './matchFlight.js';
import { MultiplayerView, matchClock } from './multiplayerView.js';

const PROTOCOL = 3;
const HOST = 'host';
const COMMAND_ERRORS = {
    'not-enough-pilots': 'More pilots are needed to start.',
    'loadouts-not-ready': 'Waiting for every pilot to confirm their loadout.',
    'team-full': 'That team already has two pilots.',
    'lobby-closed': 'This round has already started.',
    'lobby-full': 'All four pilot seats are booked.',
    'unknown-bot': 'That bot or difficulty is unavailable.',
    'insufficient-credits': 'You need more credits for this upgrade.',
    'shop-closed': 'The shop opens after your ship is lost.',
    'no-clear-spawn': 'No clear spawn is available. Try relaunching again.',
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
        this.native = nativeBridgeAvailable();
        this.nativeRooms = [];
    }

    open(fromInvite) {
        if (this.link || this.match) return;
        this.roomToken = !this.native && fromInvite ? roomTokenFromUrl() : undefined;
        this.screen = this.roomToken ? 'join' : 'welcome';
        this.status = '';
        this.render();
    }

    render() {
        this.view.render({ ...this, pilot: this.localPilot(), soloReady: this.soloReady(), busy: Boolean(this.busy) });
    }

    localPilot() {
        return this.state?.players.find(pilot => pilot.id === this.localId);
    }

    soloReady() {
        return this.host && this.state?.hasEnoughPilots && this.state.players.every(pilot => !pilot.connected || pilot.bot || pilot.id === HOST);
    }

    openLoadout(launchAfterLoadout = false) {
        this.screen = 'loadout';
        this.loadoutStage = 'hull';
        this.launchAfterLoadout = launchAfterLoadout;
        this.status = '';
        this.render();
    }

    back() {
        if (this.screen === 'loadout') {
            this.screen = 'lobby';
            this.launchAfterLoadout = false;
            this.status = '';
            this.render();
        } else if (this.screen === 'score') {
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
        if (action === 'open-loadout' && this.screen === 'lobby') return this.openLoadout();
        if (this.screen === 'loadout') {
            if (action === 'loadout-equipment' || action === 'loadout-hull') {
                this.loadoutStage = action === 'loadout-equipment' ? 'equipment' : 'hull';
                return this.render();
            }
            if (action === 'starter') return this.command(action, { shipId: args.matchId });
            if (action === 'starter-gear') return this.command(action, { slot: args.matchSlot, itemId: args.matchId || null });
            if (action === 'confirm-loadout') {
                const launch = this.launchAfterLoadout;
                this.launchAfterLoadout = false;
                this.screen = 'lobby';
                this.render();
                this.command(action);
                if (launch && this.soloReady() && this.state.canStart) this.command('start');
                return;
            }
        }
        if (action === 'show-join') {
            this.screen = 'join';
            this.status = '';
            return this.render();
        }
        if (action === 'refresh-nearby' && this.native && !this.host) {
            this.nativeRooms = [];
            this.status = '';
            (this.link ?? this.makeLink('guest')).browse();
            return this.render();
        }
        if (action === 'join-nearby' && this.native && !this.host && !this.joiningNearby
            && this.nativeRooms.some(room => room.id === args.matchId)) {
            this.joiningNearby = args.matchId;
            this.status = t('Connecting to the host…');
            if (!this.link?.join(args.matchId)) this.joiningNearby = undefined;
            return this.render();
        }
        if (action.startsWith('copy-')) {
            const copied = await this.view.copy(action.slice(5));
            this.status = copied ? t('Copied.') : t('Select and copy the code.');
            return this.render();
        }
        if (action === 'setting') {
            const { key, value, id } = args;
            if (key === 'team') return this.command('team', { team: value || null });
            if (key === 'bot-difficulty') return this.command('bot-difficulty', { id, difficulty: value });
            if (key === 'bot-team') return this.command('bot-team', { id, team: value || null });
            if (key === 'bot-character') {
                this.botCharacter = value;
                return;
            }
            const typed = key === 'durationMinutes' ? Number(value) : key === 'friendlyFire' ? value === 'true' : value;
            return this.command('configure', { patch: { [key]: typed } });
        }
        if (action === 'add-bot' && this.screen === 'lobby') {
            const characterId = this.view.panel.querySelector('[data-match-setting="bot-character"]')?.value;
            return this.command(action, { characterId });
        }
        if (action === 'remove-bot') return this.command(action, { id: args.matchId });
        if (action === 'fill-bots') return this.command(action);
        if (action === 'buy-hull') return this.command(action, { shipId: args.matchId });
        if (action === 'buy-equipment') return this.command(action, { itemId: args.matchId, slot: args.matchSlot, index: Number(args.matchIndex) });
        if (action === 'start' && this.screen === 'lobby' && this.soloReady() && !this.localPilot()?.starterReady)
            return this.openLoadout(true);
        if (['start', 'rematch', 'respawn'].includes(action)) return this.command(action);
        if (this.busy) return;
        const task = this.busy = {};
        this.status = '';
        this.render();
        try {
            if (action === 'host') this.hostRoom();
            if (action === 'solo-bots') this.hostRoom(true);
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
        const Transport = this.native ? NativeLink : PeerLink;
        const link = new Transport({
            role,
            onOpen: id => { if (this.link === link) this.connected(id); },
            onMessage: (id, message) => { if (this.link === link) this.receive(id, message); },
            onClose: (id, reason) => { if (this.link === link) this.disconnected(id, reason); },
            onRooms: rooms => {
                if (this.link !== link || this.screen !== 'welcome') return;
                this.nativeRooms = rooms;
                this.render();
            },
            onHosting: () => {
                if (this.link !== link) return;
                this.nativeHosting = true;
                this.status = '';
                if (this.screen === 'lobby') this.render();
            },
            onError: error => {
                if (this.link === link) {
                    if (this.native) {
                        this.joiningNearby = undefined;
                        this.nativeHosting = false;
                        this.status = error.code === 'permission'
                            ? t('Allow Voidrunner to access the local network, then try again.')
                            : t('Could not connect on Wi-Fi. Check the network and try again.');
                        this.render();
                        return;
                    }
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

    hostRoom(localOnly = false) {
        this.closeLink();
        const link = localOnly ? undefined : this.makeLink('host');
        this.localOnly = localOnly;
        this.host = true;
        this.localId = HOST;
        this.match = createMultiplayerMatch({ hostId: HOST, hostName: this.name, seed: Math.floor(Math.random() * 0x100000000) });
        if (localOnly) this.match.addBot(HOST, 'brick');
        else if (this.native) link.host(this.match.players.get(HOST).name);
        this.distributeState();
        if (link && !this.native) void this.openRoomLink(link);
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
            const text = t('Reload both devices to the same build.');
            if (this.host) {
                this.send(id, { v: message.v, type: 'error', text });
                return;
            }
            message = { type: 'error', text };
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
            } else if (this.match.players.get(id)?.connected && !this.match.players.get(id).bot) {
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
                this.closeLink();
                this.guestReply = '';
                this.joiningNearby = undefined;
                if (this.native && link) this.makeLink('guest').browse();
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
        let spawnPoint;
        switch (action) {
            case 'configure': result = match.configure(id, args.patch); break;
            case 'starter': result = match.selectStarter(id, args.shipId); break;
            case 'starter-gear': result = match.selectStarterGear(id, args.slot, args.itemId); break;
            case 'confirm-loadout': result = match.confirmStarter(id); break;
            case 'team': result = match.setTeam(id, args.team); break;
            case 'add-bot': result = match.addBot(id, args.characterId); break;
            case 'remove-bot': result = match.removeBot(id, args.id); break;
            case 'fill-bots': result = match.fillBotSeats(id); break;
            case 'bot-difficulty': result = match.setBotDifficulty(id, args.id, args.difficulty); break;
            case 'bot-team': result = match.setBotTeam(id, args.id, args.team); break;
            case 'start': result = match.start(id); break;
            case 'rematch': result = match.returnToLobby(id); break;
            case 'buy-hull': result = match.buyHull(id, args.shipId); break;
            case 'buy-equipment': result = match.buyEquipment(id, args.itemId, args.slot, args.index); break;
            case 'respawn': {
                const pilot = match.players.get(id);
                if (!this.live || !match.canRefit(pilot)) break;
                spawnPoint = this.world.chooseSpawn({ id, team: pilot.team, variant: SHIPS[pilot.shipId].variant });
                result = spawnPoint ? match.respawn(id) : { ok: false, code: 'no-clear-spawn' };
                break;
            }
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
            this.world.spawn(result.actor, spawnPoint);
            this.sendFit(id);
        }
        this.distributeState();
    }

    distributeState() {
        const state = this.match.snapshot();
        if (this.native) this.link?.setVisibility(state.phase === 'lobby' && state.players.length < 4);
        this.applyState(state, this.match.shopFor(HOST));
        for (const peer of this.link?.peerIds ?? []) {
            // A reliable send can close a slow peer and publish a newer roster immediately.
            if (this.state !== state) break;
            if (!this.match.players.get(peer)?.connected) continue;
            this.send(peer, { type: 'state', state, shop: this.match.shopFor(peer) });
        }
    }

    applyState(state, shop) {
        if (!state?.players?.some(pilot => pilot.id === this.localId)) return;
        const previous = this.state;
        this.state = state;
        this.shop = shop;
        this.remainingSeconds = state.remainingSeconds;
        if (state.phase === 'lobby') {
            if (previous?.phase !== 'lobby' && this.flight) this.clearFlight();
            if (previous?.phase !== 'lobby' || this.screen !== 'loadout') this.screen = 'lobby';
            if (!this.native && this.host && this.link && previous?.phase === 'ended' && !this.roomUrl) void this.openRoomLink(this.link);
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
        const { starterShipId, starterGear } = this.localPilot();
        const fit = createPilotFitting(starterShipId, starterMultiplayerFit(starterShipId, starterGear));
        const flight = new MatchFlight(this);
        this.flight = flight;
        this.screen = 'preparing';
        this.render();
        // Session startup is shared by the title and the arena. Let a cancelled load
        // finish and dispose its session before a rematch requests a new one.
        if (this.loadingFlight) {
            await this.loadingFlight;
            if (this.flight !== flight || this.state?.phase !== 'playing') return;
        }
        const loading = this.loadingFlight = this.startFlight({
            multiplayer: flight, scenario: 'free-flight', site: state.settings.siteId, seed: state.seed, starterPlayer: fit.player,
        });
        const session = await loading;
        this.loadingFlight = undefined;
        if (this.flight !== flight || this.state?.phase !== 'playing') {
            if (session) this.stopFlight(session);
            if (this.flight === flight) this.flight = undefined;
            if (this.screen) this.render();
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
            for (const actor of this.world.actors()) {
                if (this.world.spawn(actor)) continue;
                this.leave();
                this.screen = 'disconnected';
                this.status = t('Could not find a clear launch position.');
                this.render();
                return;
            }
            this.loadTimeout = setTimeout(() => this.dropUnready(), 90_000);
            this.markReady(HOST);
        } else this.send(HOST, { type: 'ready', round: state.round });
    }

    markReady(id) {
        if (this.match.phase !== 'playing' || !this.ready || this.live) return;
        this.ready.add(id);
        const humans = this.match.connectedHumans();
        if (!this.world || !humans.every(pilot => this.ready.has(pilot.id))) return;
        clearTimeout(this.loadTimeout);
        this.live = true;
        for (const pilot of humans) this.sendFit(pilot.id);
        this.publishWorld(true);
        if (!this.live) return;
        let last = performance.now();
        this.clock = setInterval(() => {
            const now = performance.now();
            this.world?.advance((now - last) / 1000);
            last = now;
        }, 1000 / 60);
    }

    dropUnready() {
        if (!this.live && this.match?.phase === 'playing')
            for (const pilot of this.match.connectedHumans()) if (!this.ready.has(pilot.id)) this.link?.disconnect(pilot.id, 'Arena loading timed out.');
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
        const now = performance.now();
        const jumpChanged = this.flight.updateSnapshot(snapshot, now);
        if (this.screen === 'preparing' && this.live) {
            this.screen = 'flight';
            this.render();
        }
        // Draw the boundary once when visible, even if the frame scheduler
        // is still waking up after the load or refit screen. The host starts
        // its round timer only after submitting this first cockpit frame.
        const session = this.flight.session;
        if (jumpChanged && !document.hidden && !session.ui.isModalOpen) session.syncRender(0, now);
        if (this.screen === 'score') {
            const displayedTime = matchClock(this.remainingSeconds);
            if (displayedTime !== this.displayedTime) this.view.setClock(displayedTime);
            this.displayedTime = displayedTime;
        }
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

    closeLink() {
        const link = this.link;
        this.link = undefined;
        link?.close();
    }

    leave() {
        if (this.link && !this.host) this.send(HOST, { type: 'leave' });
        this.closeLink();
        if (this.flight) this.clearFlight();
        Object.assign(this, {
            state: undefined, shop: undefined, match: undefined, host: false, localId: undefined,
            localOnly: false, launchAfterLoadout: false,
            status: '', screen: '', invite: '', reply: '', roomUrl: '', roomToken: undefined, guestReply: '', busy: undefined,
            nativeRooms: [], nativeHosting: false, joiningNearby: undefined,
        });
        if (roomTokenFromUrl()) history.replaceState(null, '', location.pathname + location.search);
        this.render();
        this.ui.root.querySelector('[data-ui-command="multiplayer"]')?.focus({ preventScroll: true });
    }
}
