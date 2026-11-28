import { Vector3 } from 'three';
import { arenaSite } from '../arenaSites.js';
import { SHIPS } from '../data.js';
import { FrameBudget } from '../frameBudget.js';
import { t } from '../i18n.js';
import { LAUNCHERS, WEAPONS } from '../weapons.js';
import { updateMissileWarning } from '../weaponFlight.js';
import { ARENA_LIMIT, MATCH_STEP } from './matchWorld.js';
import { createPilotFitting } from './pilotFitting.js';
import { matchClock } from './multiplayerView.js';

const EVENT_POSITION = new Vector3();
const BEAM_END = new Vector3();

function factionFor(actor, team) {
    return team && actor?.team === team ? 'concord' : 'pirates';
}

export class MatchFlight {
    constructor(controller) {
        this.controller = controller;
        this.pendingActions = {};
        this.nextInputAt = 0;
        this.sequence = 0;
        this.projectiles = new Map();
        this.matchTick = -1;
        this.audioFlight = {};
        this.fittingLife = 0;
    }

    attach(session) {
        this.session = session;
        this.center = [...session.save.player.position];
        session.save.player.mode = 'combat';
        session.save.player.transponder = true;
    }

    setFitting(fit) {
        this.fit = fit;
    }

    selectTarget(id) {
        const ship = this.session?.ships.find(entry => entry.id === id && entry.hull > 0);
        if (ship) this.pendingActions.targetId = id;
    }

    updateSnapshot(snapshot, time) {
        const { session, controller } = this;
        if (!session || snapshot.tick <= this.matchTick) return;
        const previousTick = this.matchTick;
        this.matchTick = snapshot.tick;
        this.snapshotTime = time;
        this.snapshotInterval = Math.max(1, snapshot.tick - Math.max(0, previousTick)) * MATCH_STEP;
        if (!controller.host) {
            session.save.world.time = snapshot.tick * MATCH_STEP;
            session.renderer.updateWorld(Math.max(0, snapshot.tick - Math.max(0, previousTick)) * MATCH_STEP);
        }
        controller.remainingSeconds = snapshot.remainingSeconds;
        const me = snapshot.actors.find(actor => actor.id === controller.localId);
        const enteredJump = me?.deployTicks > 0 && me.life !== this.me?.life;
        const exitedJump = me && me.life === this.me?.life && this.me.deployTicks > 0 && me.deployTicks === 0;
        if (exitedJump) session.finishDeployment();
        this.me = me;
        this.updateLocalPilot(me);
        const oldShips = new Map(session.ships.map(ship => [ship.id, ship]));
        session.ships = snapshot.actors.filter(actor => actor.id !== controller.localId && !(actor.deployTicks > 0)).map(actor => {
            const previous = oldShips.get(actor.id);
            const livePrevious = previous?.life === actor.life ? previous : undefined;
            const team = controller.localPilot()?.team;
            const hostile = !team || team !== actor.team;
            return {
                ...actor, matchPilot: true, identifiedByPlayer: true, scanned: true,
                role: hostile ? 'pirate' : 'patrol', hostile, faction: factionFor(actor, team),
                arenaFriendlyObjective: !hostile, playerSensorAwareness: 1,
                jumpArrivalAt: livePrevious ? livePrevious.jumpArrivalAt : snapshot.tick * MATCH_STEP,
                engineThrust: actor.throttle, burning: actor.afterburning,
                prevPosition: livePrevious?.position ?? actor.position,
                prevRotation: livePrevious?.rotation ?? actor.rotation,
                lastSeenPosition: livePrevious?.lastSeenPosition,
                lastSeenAt: livePrevious?.lastSeenAt,
            };
        });
        this.updateProjectiles(snapshot.projectiles);
        return enteredJump || exitedJump;
    }

    updateLocalPilot(me) {
        const { session } = this;
        const player = session.save.player;
        if (!me) {
            this.pendingActions = {};
            player.hull = 0;
            player.currentTargetId = undefined;
            session.afterburning = false;
            return;
        }
        const newLife = this.fittingLife !== me.life;
        if (newLife && this.fit?.life === me.life) {
            const fitting = createPilotFitting(me.shipId, this.fit.outfitting);
            if (fitting) {
                Object.assign(player, fitting.player);
                this.fittingLife = me.life;
                session._statsDirty = true;
                session.ui.setCockpitShip(me.shipId);
            }
        }
        // The ship may appear in a snapshot just before its reliable fit.
        if (this.fittingLife !== me.life) return;
        const lastPosition = player.position;
        const lastRotation = player.rotation;
        Object.assign(player, {
            position: me.position, rotation: me.rotation, velocity: me.velocity, angularVelocity: me.angularVelocity,
            throttle: me.throttle, hull: me.hull, shield: me.shield, energy: me.energy,
            missiles: me.missiles, currentTargetId: me.targetId ?? undefined,
            credits: this.controller.localPilot()?.credits ?? 0, mode: 'combat',
        });
        player.prevPosition.set(newLife ? me.position : lastPosition);
        player.prevRotation.set(newLife ? me.rotation : lastRotation);
        const groups = player.outfitting.loadouts[player.shipId].fireGroups;
        if (me.group) groups.activeGroup = me.group;
        if (me.rack && player.launcherMagazines[me.rack.mountId]) {
            player.activeLauncherMountId = me.rack.mountId;
            player.launcherMagazines[me.rack.mountId].rounds = me.rack.rounds;
        }
        session.rackProgress = me.lockProgress;
        session.afterburning = me.afterburning;
        session.renderer.setTarget?.(player.currentTargetId);
    }

    updateProjectiles(shots) {
        const { controller, session, projectiles } = this;
        const active = new Set(shots.map(shot => shot.id));
        const store = session.projStore;
        for (const [id, old] of projectiles) {
            if (active.has(id)) continue;
            store.free(old.slot);
            projectiles.delete(id);
        }
        session.projectiles = shots.map(shot => {
            let entry = projectiles.get(shot.id);
            if (entry) store.snapshot(entry.slot);
            else {
                const owner = session.ships.find(ship => ship.id === shot.ownerId);
                entry = {
                    id: shot.id, slot: store.alloc(), kind: shot.kind, launcherId: shot.launcherId, tint: shot.tint,
                    ownerId: shot.ownerId === controller.localId ? 'player' : shot.ownerId,
                    faction: shot.ownerId === controller.localId ? 'player' : factionFor(owner, controller.localPilot()?.team),
                    hitWeapon: LAUNCHERS[shot.launcherId] ?? WEAPONS[shot.weaponId],
                    salvo: shot.salvo,
                };
                projectiles.set(shot.id, entry);
            }
            store.setPos(entry.slot, ...shot.position);
            store.setVel(entry.slot, ...shot.velocity);
            if (entry.life === undefined) store.snapshot(entry.slot);
            entry.life = shot.life;
            entry.targetId = shot.targetId === controller.localId ? 'player' : shot.targetId;
            entry.lostTrack = shot.lostTrack;
            return entry;
        });
    }

    cycleTarget(nearest) {
        const { session } = this;
        const player = session.save.player;
        const distance = ship => Math.hypot(...ship.position.map((value, index) => value - player.position[index]));
        const candidates = session.ships.filter(ship => ship.hull > 0 && distance(ship) <= session.playerStats().radarRange * 1.45);
        candidates.sort((a, b) => Number(b.hostile) - Number(a.hostile) || distance(a) - distance(b));
        if (!candidates.length) return;
        const index = candidates.findIndex(ship => ship.id === (this.pendingActions.targetId ?? player.currentTargetId));
        this.pendingActions.targetId = candidates[nearest ? 0 : (index + 1) % candidates.length].id;
    }

    frame(session, now) {
        if (this.session !== session) return;
        const workStart = performance.now();
        const dt = Math.max(0, Math.min(.1, (now - session.lastFrame) / 1000));
        session.lastFrame = now;
        const modal = session.ui.isModalOpen;
        session.input.setGamepadBlocked(modal || session.ui.controller?.blocksFlight || !this.me);
        const actions = session.input.getActions();
        if (actions.pause || (!modal && this.me && (actions.shipMenu || actions.map || actions.controllerDisconnected)))
            this.controller.flightMenu();
        const flying = this.controller.live && this.me && !(this.me.deployTicks > 0)
            && !session.ui.isModalOpen && document.hasFocus();
        if (flying) session.ui.updateCockpitKit(dt, actions);
        if (this.me?.deployTicks > 0) this.pendingActions = {};
        else if (this.controller.live && this.me) this.sendInput(flying ? actions : {}, session.save.settings, now);
        if (this.matchTick < 0) return;
        this.updateAudio(dt);
        // Render between the two latest host snapshots. Local input continues
        // at frame cadence and edges are sent as soon as they're sampled.
        const alpha = Math.min(1, (now - this.snapshotTime) / Math.max(1, this.snapshotInterval * 1000));
        session.simAccumulator = Math.max(0, alpha) * MATCH_STEP;
        const revision = session.renderer.renderRevision ?? 0;
        const budget = session.renderBudget ??= new FrameBudget();
        if (session.ui.isModalOpen) {
            budget.reset();
            if (session.lastRenderRevision !== revision) session.syncRender(0, now);
        } else {
            const touch = session.renderer.touchDevice;
            const mode = session.save.settings.powerMode;
            const renderDt = budget.take(now, budget.target(mode, touch));
            if (renderDt !== null) session.syncRender(renderDt, now);
            if (mode === 'auto') budget.observe(now, performance.now() - workStart, renderDt !== null, touch);
        }
        session.lastRenderRevision = revision;
    }

    sendInput(actions, settings, now) {
        if (actions.targetNext || actions.targetNearestHostile) this.cycleTarget(actions.targetNearestHostile);
        const edges = this.pendingActions;
        for (const key of ['throttleSet', 'weaponSelect', 'weaponCycle', 'launcherCycle', 'missile']) {
            if (actions[key] !== undefined && actions[key] !== false && (key === 'throttleSet' || actions[key])) edges[key] = actions[key];
        }
        if (now < this.nextInputAt && Object.keys(edges).length === 0) return;
        this.nextInputAt = now + 1000 / 30;
        this.pendingActions = {};
        this.controller.sendInput({
            life: this.me.life, sequence: this.sequence++, ...edges,
            pitch: actions.pitch, yaw: actions.yaw, roll: actions.roll, throttleDelta: actions.throttleDelta,
            fire: actions.fire, afterburner: actions.afterburner, flightAssist: settings.flightAssist, aimAssist: settings.aimAssist,
        }, Object.keys(edges).length > 0);
    }

    updateAudio(dt) {
        const { session, audioFlight } = this;
        const player = session.save.player;
        const stats = session.playerStats();
        const alive = player.hull > 0;
        updateMissileWarning(audioFlight, alive ? session.projectiles : null, session.projStore, player, session.audio.outputLatency?.() ?? 0);
        if (audioFlight.missileBreak) session.ui.flashBreakCue?.();
        audioFlight.speed = Math.min(1.4, Math.hypot(...player.velocity) / Math.max(1, stats.maxSpeed));
        audioFlight.hyper = this.me?.deployTicks > 0;
        audioFlight.shield = player.shield / Math.max(1, stats.shield);
        const hostileLock = Math.max(0, ...session.ships.filter(ship => ship.hostile && ship.targetId === this.controller.localId).map(ship => ship.lockProgress));
        audioFlight.lockState = audioFlight.trackingMissile ? 'missile' : hostileLock === 1 ? 'locked' : hostileLock > 0 ? 'acquiring' : 'off';
        session.ui.cockpitArtwork?.setHardware(audioFlight.lockState, true, true, alive && !session.ui.isModalOpen);
        session.audio.update(dt, alive ? player.throttle : 0, alive && session.afterburning, 1 - player.hull / Math.max(1, stats.hull),
            session.ships.filter(ship => ship.hostile).length, arenaSite(this.controller.state.settings.siteId).environment, 0, audioFlight);
    }

    presentEvents(events) {
        const session = this.session;
        if (!session) return;
        for (const event of events) {
            if (!event.position) continue;
            const [x, y, z] = event.position;
            const own = event.ownerId === this.controller.localId;
            const weapon = WEAPONS[event.weaponId] ?? LAUNCHERS[event.weaponId];
            if (event.type === 'death') {
                const local = event.targetId === this.controller.localId;
                const victim = local ? this.me : session.ships.find(ship => ship.id === event.targetId);
                const pilot = this.controller.state.players.find(entry => entry.id === event.targetId);
                const ship = {
                    id: event.targetId, variant: event.variant ?? victim?.variant,
                    faction: local ? 'player' : factionFor(pilot, this.controller.localPilot()?.team),
                    position: event.position, rotation: event.rotation ?? victim?.rotation,
                    velocity: event.velocity ?? victim?.velocity,
                };
                const explosion = session.renderer.spawnExplosion(ship.position, !own, 1.35, ship.velocity);
                explosion.followObject = session.renderer.spawnPilotWreck(ship, 1.35);
                session.playWorldSound('explosion', 1, x, y, z);
                if (own && event.points) session.setOwnMonitorStatus(t('+{points} POINTS', { points: event.points }), 2400);
            } else if (event.type === 'beam' || event.type === 'shot') {
                if (event.type === 'beam' && event.end) {
                    session.renderer.showCombatBeam(`${event.ownerId}:${event.mountId}`, EVENT_POSITION.set(x, y, z),
                        BEAM_END.fromArray(event.end), own ? 0x7cffff : 0xff7050, own ? session.save.player : undefined);
                }
                session.renderer.spawnMuzzleFlash(x, y, z);
                const sound = weapon?.audioKey ?? (event.type === 'beam' ? 'beam' : LAUNCHERS[event.weaponId] ? 'missile' : 'laser');
                if (own) session.audio.play(sound, .75);
                else session.playWorldSound(sound, .7, x, y, z);
            } else if (event.type === 'impact') {
                session.renderer.spawnImpact(event.position, 0xffc36a, Boolean(LAUNCHERS[event.weaponId]));
            } else if (event.type === 'hit' && event.targetId === this.controller.localId) {
                session.kickCamera((event.shield + event.hull - 6) / 34);
                session.audio.play(event.hull > 0 ? 'hit' : 'shield', .8);
            }
        }
    }

    decorateHud(model) {
        const { controller, session } = this;
        const site = arenaSite(controller.state.settings.siteId);
        const player = session.save.player;
        model.multiplayer = true;
        model.zone = t(site.name);
        model.navName = t(site.name);
        model.navDistance = 0;
        model.hyperdriveReady = false;
        model.hyperdriveStatus = undefined;
        model.contacts = model.contacts.filter(contact => contact.type === 'friendly' || contact.type === 'hostile');
        if (model.target?.kind === 'ship') {
            const target = session.ships.find(ship => ship.id === player.currentTargetId);
            if (target) {
                model.target.subtitle = SHIPS[target.shipId]?.name ?? '';
                model.target.readout = target.team ? t(target.team === 'red' ? 'Red team' : 'Blue team').toUpperCase() : t('OPPONENT');
            }
        }
        const distance = Math.hypot(...player.position.map((value, index) => value - this.center[index]));
        const time = matchClock(controller.remainingSeconds);
        const points = controller.localPilot()?.score ?? 0;
        model.ownMonitorStatus ||= distance > ARENA_LIMIT - 150
            ? t('ARENA EDGE · {time}', { time }) : t('{time} · {points} PTS', { time, points });
    }
}
