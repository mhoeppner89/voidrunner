import * as THREE from 'three';
import { AudioManager } from './audio';
import { COMMODITIES, DOCK_LOCATION_IDS, EQUIPMENT, LOCATIONS, NAV_LOCATION_IDS, SHIPS, equipmentIds } from './data';
import { buyCommodity, cargoCapacity, cargoFree, cargoMass, sellCommodity, tickEconomy } from './economy';
import { InputManager } from './input';
import {
  acceptMission,
  awardCareerProgress,
  completeBountyMission,
  completeMissionsAtDock,
  failExpiredMissions,
  joinGuild,
  refreshMissionOffers,
} from './missions';
import { clamp, damp, formatCredits, hashString, pick, proceduralCallsign, randomBetween, randomInt, seededRandom } from './random';
import { SpaceRenderer } from './render';
import { saveGame } from './save';
import { equipmentUnlocked, getEffectiveShipStats, refillCost, repairCost } from './shipStats';
import type {
  AsteroidNode,
  CommodityId,
  DockLocationId,
  EquipmentId,
  FactionId,
  FlightMode,
  GameSave,
  GuildId,
  InputActions,
  LocationId,
  PickupEntity,
  ProjectileEntity,
  QuatTuple,
  ShipEntity,
  ShipId,
  Vec3Tuple,
  WreckNode,
  WorldZone,
} from './types';
import type { HudModel, RadarContact } from './ui';
import { GameUI } from './ui';
import { generateAsteroidField, generateGraveyardPieces, generateWreckNodes, type GraveyardPiece } from './worldData';

const FORWARD = new THREE.Vector3(0, 0, -1);
const UP = new THREE.Vector3(0, 1, 0);
const RIGHT = new THREE.Vector3(1, 0, 0);
const PLAYER_RADIUS = 1.25;

const vec = (value: Vec3Tuple, out = new THREE.Vector3()): THREE.Vector3 => out.set(value[0], value[1], value[2]);
const tuple = (value: THREE.Vector3): Vec3Tuple => [value.x, value.y, value.z];
const quat = (value: QuatTuple, out = new THREE.Quaternion()): THREE.Quaternion => out.set(value[0], value[1], value[2], value[3]);
const quatTuple = (value: THREE.Quaternion): QuatTuple => [value.x, value.y, value.z, value.w];

const segmentSphereHit = (start: THREE.Vector3, end: THREE.Vector3, center: THREE.Vector3, radius: number): number | undefined => {
  const direction = end.clone().sub(start);
  const offset = start.clone().sub(center);
  const a = direction.dot(direction);
  if (a < 1e-8) return undefined;
  const b = 2 * offset.dot(direction);
  const c = offset.dot(offset) - radius * radius;
  const discriminant = b * b - 4 * a * c;
  if (discriminant < 0) return undefined;
  const root = Math.sqrt(discriminant);
  const t1 = (-b - root) / (2 * a);
  const t2 = (-b + root) / (2 * a);
  if (t1 >= 0 && t1 <= 1) return t1;
  if (t2 >= 0 && t2 <= 1) return t2;
  return undefined;
};

interface TargetRef {
  kind: 'ship' | 'asteroid' | 'wreck';
  id: string;
  position: Vec3Tuple;
  name: string;
}

export class GameSession {
  readonly save: GameSave;
  private readonly renderer: SpaceRenderer;
  private readonly input: InputManager;
  private readonly audio = new AudioManager();
  private readonly asteroids: AsteroidNode[];
  private readonly graveyard: GraveyardPiece[];
  private readonly wreckNodes: WreckNode[];
  private readonly ships: ShipEntity[] = [];
  private readonly projectiles: ProjectileEntity[] = [];
  private readonly pickups: PickupEntity[] = [];
  private readonly extractionCarry = new Map<string, number>();
  private readonly tmpA = new THREE.Vector3();
  private readonly tmpB = new THREE.Vector3();
  private readonly tmpC = new THREE.Vector3();
  private readonly tmpQ = new THREE.Quaternion();
  private readonly tmpQ2 = new THREE.Quaternion();
  private frameId = 0;
  private lastFrame = performance.now();
  private active = true;
  private autopilot = false;
  private afterburning = false;
  private utilityActive = false;
  private utilitySoundCooldown = 0;
  private gunCooldown = 0;
  private missileCooldown = 0;
  private playerShieldDelay = 0;
  private collisionMessageCooldown = 0;
  private hintCooldown = 0;
  private scanCooldown = 0;
  private encounterCounter = 0;
  private entityCounter = 0;
  private projectileCounter = 0;
  private pickupCounter = 0;
  private nextEncounterAt = 0;
  private lastAutosaveAt = 0;
  private lastMissionCheck = 0;
  private lastHudUpdate = 0;
  private deathTimer = 0;
  private salvageAmbushTriggered = new Set<string>();
  private fpsAccumulator = 0;
  private fpsFrames = 0;
  private qualityScale = 1;

  constructor(save: GameSave, private readonly ui: GameUI, private readonly onQuit: () => void) {
    this.save = save;
    this.asteroids = generateAsteroidField(save.world.seed, save.world.depletedAsteroids, save.world.scannedNodes);
    this.graveyard = generateGraveyardPieces(save.world.seed);
    this.wreckNodes = generateWreckNodes(save.world.seed, save.world.depletedWrecks, save.world.scannedNodes);
    this.renderer = new SpaceRenderer(ui.viewport, save.world.seed, this.asteroids, this.graveyard, this.wreckNodes, save.settings.quality);
    this.input = new InputManager(ui.root);
    this.audio.setVolumes(save.settings.music, save.settings.effects);
    this.audio.setStationMode(Boolean(save.player.dockedAt));
    this.ui.setTouchScale(save.settings.touchScale);
    this.nextEncounterAt = save.world.time + 12 + seededRandom(`${save.world.seed}:next-encounter:${Math.floor(save.world.time)}`)() * 14;
    this.spawnInitialTraffic();
    this.restoreViewState();
    this.frameId = requestAnimationFrame(this.frame);
  }

  private restoreViewState(): void {
    if (this.save.player.dockedAt) {
      this.renderer.setCockpitVisible(false);
      const messages = completeMissionsAtDock(this.save, this.save.player.dockedAt);
      refreshMissionOffers(this.save);
      this.ui.showDock(this.save, this.save.player.dockedAt);
      messages.forEach((message) => this.ui.showToast(message, 'success', 5200));
      saveGame(this.save);
    } else {
      this.renderer.setCockpitVisible(true);
      this.ui.hideDock();
      this.ui.hideTitle();
      this.ui.showHud();
    }
  }

  async enableAudio(): Promise<void> {
    await this.audio.enable();
  }

  debugSnapshot(): {
    autopilot: boolean;
    afterburning: boolean;
    ships: ShipEntity[];
    projectiles: ProjectileEntity[];
    pickups: PickupEntity[];
  } {
    return {
      autopilot: this.autopilot,
      afterburning: this.afterburning,
      ships: this.ships.map((ship) => ({ ...ship, position: [...ship.position], velocity: [...ship.velocity], rotation: [...ship.rotation] })),
      projectiles: this.projectiles.map((projectile) => ({ ...projectile, position: [...projectile.position], velocity: [...projectile.velocity] })),
      pickups: this.pickups.map((pickup) => ({ ...pickup, position: [...pickup.position], velocity: [...pickup.velocity] })),
    };
  }

  dispose(): void {
    if (!this.active) return;
    this.active = false;
    cancelAnimationFrame(this.frameId);
    saveGame(this.save);
    this.input.dispose();
    this.renderer.dispose();
  }

  private frame = (now: number): void => {
    if (!this.active) return;
    const dt = clamp((now - this.lastFrame) / 1000, 0, 0.05);
    this.lastFrame = now;
    const actions = this.input.getActions();
    const flying = !this.save.player.dockedAt;

    if (flying) {
      if (this.ui.isModalOpen) {
        if (actions.pause) {
          this.ui.hidePause();
          this.ui.hideMap();
        }
      } else if (actions.pause) {
        this.ui.showPause();
      } else if (actions.map) {
        this.ui.showMap();
      } else {
        this.updateSimulation(dt, actions);
      }
    }

    const stats = getEffectiveShipStats(this.save.player);
    const damage = 1 - this.save.player.hull / stats.hull;
    this.audio.update(dt, this.save.player.throttle, this.afterburning, damage);
    this.syncRender(dt, now);
    this.frameId = requestAnimationFrame(this.frame);
  };

  private updateSimulation(dt: number, actions: InputActions): void {
    this.renderer.updateWorld(dt);
    this.save.world.time += dt;
    tickEconomy(this.save.world, dt);
    refreshMissionOffers(this.save);
    this.gunCooldown -= dt;
    this.missileCooldown -= dt;
    this.playerShieldDelay -= dt;
    this.collisionMessageCooldown -= dt;
    this.hintCooldown -= dt;
    this.scanCooldown -= dt;
    this.utilitySoundCooldown -= dt;

    if (this.deathTimer > 0) {
      this.deathTimer -= dt;
      this.updateDeathDrift(dt);
      if (this.deathTimer <= 0) this.recoverPlayer();
      return;
    }

    this.handleActions(actions);
    this.updatePlayer(dt, actions);
    this.updateBountySpawns();
    this.updateDynamicEncounters();
    this.updateShips(dt);
    this.updatePlayerWeapons(dt, actions);
    this.updateProjectiles(dt);
    this.updatePickups(dt);
    this.updateDiscovery();
    this.updateRegeneration(dt);
    this.cleanupEntities();

    if (this.save.world.time - this.lastMissionCheck > 0.8) {
      this.lastMissionCheck = this.save.world.time;
      failExpiredMissions(this.save).forEach((message) => this.ui.showToast(message, 'danger', 4800));
    }
    if (this.save.world.time - this.lastAutosaveAt > 12) {
      this.lastAutosaveAt = this.save.world.time;
      saveGame(this.save);
    }
  }

  private handleActions(actions: InputActions): void {
    if (actions.cycleMode) {
      const order: FlightMode[] = ['combat', 'mining', 'salvage'];
      const index = order.indexOf(this.save.player.mode);
      this.save.player.mode = order[(index + 1) % order.length]!;
      this.save.player.currentTargetId = undefined;
      this.renderer.setTarget();
      this.ui.showToast(`${this.save.player.mode.toUpperCase()} systems selected.`, 'info');
      this.audio.play('ui');
    }
    if (actions.navNext) {
      const index = NAV_LOCATION_IDS.indexOf(this.save.player.navTargetId);
      this.setNav(NAV_LOCATION_IDS[(index + 1) % NAV_LOCATION_IDS.length]!);
    }
    if (actions.targetNearestHostile) this.targetNearestHostile();
    else if (actions.targetNext) this.cycleTarget();
    if (actions.scan) this.scanTarget();
    if (actions.autopilot) this.toggleAutopilot();
    if (actions.interact) this.tryDock();
    if (actions.missile) this.fireMissile();
  }

  private updatePlayer(dt: number, actions: InputActions): void {
    const stats = getEffectiveShipStats(this.save.player);
    const position = vec(this.save.player.position, this.tmpA);
    const velocity = vec(this.save.player.velocity, this.tmpB);
    const orientation = quat(this.save.player.rotation, this.tmpQ);
    const angularVelocity = vec(this.save.player.angularVelocity, this.tmpC);

    if (actions.throttleSet !== undefined) this.save.player.throttle = actions.throttleSet;
    this.save.player.throttle = clamp(this.save.player.throttle + actions.throttleDelta * dt, 0, 1);

    const manualAuthority = Math.max(Math.abs(actions.pitch), Math.abs(actions.yaw), Math.abs(actions.roll));
    if (this.autopilot && manualAuthority > 0.35) {
      this.autopilot = false;
      this.ui.showToast('Autopilot disengaged by manual input.', 'warning');
    }

    if (this.autopilot) {
      if (this.hostilesNear(position, 175)) {
        this.autopilot = false;
        this.ui.showToast('AUTOPILOT BREAK: hostile contact.', 'danger', 4200);
        this.audio.play('warning');
      } else {
        this.steerAutopilot(position, orientation, angularVelocity, dt);
      }
    } else {
      angularVelocity.x += actions.pitch * stats.angularAcceleration * dt;
      angularVelocity.y += -actions.yaw * stats.angularAcceleration * dt;
      angularVelocity.z += -actions.roll * stats.angularAcceleration * dt;
      const dampingRate = stats.angularDamping * (this.save.settings.flightAssist ? 1 : 0.38);
      angularVelocity.multiplyScalar(Math.exp(-dampingRate * dt));
      const deltaRotation = this.tmpQ2.setFromEuler(
        new THREE.Euler(angularVelocity.x * dt, angularVelocity.y * dt, angularVelocity.z * dt, 'XYZ'),
      );
      orientation.multiply(deltaRotation).normalize();
    }

    const forward = FORWARD.clone().applyQuaternion(orientation).normalize();
    this.afterburning = !this.autopilot && actions.afterburner && this.save.player.throttle > 0.55 && this.save.player.fuel > 0.5;
    let targetSpeed = this.save.player.throttle * stats.maxSpeed;
    if (this.afterburning) targetSpeed = this.save.player.throttle * stats.afterburnSpeed;
    if (this.autopilot) {
      const nav = LOCATIONS[this.save.player.navTargetId];
      const distance = position.distanceTo(vec(nav.position));
      const approach = nav.kind === 'field' || nav.kind === 'graveyard' ? nav.radius * 0.62 : (nav.dockRadius ?? nav.radius * 1.7);
      const clearCruise = distance > approach + 135 && !this.obstacleAhead(position, forward, 90);
      targetSpeed = clearCruise ? stats.afterburnSpeed * 1.72 : Math.min(stats.maxSpeed * 0.72, Math.max(10, (distance - approach) * 0.34));
      this.save.player.throttle = clamp(targetSpeed / stats.maxSpeed, 0.15, 1);
    }

    const forwardSpeed = velocity.dot(forward);
    const lateral = velocity.clone().addScaledVector(forward, -forwardSpeed);
    const accelerationResponse = stats.acceleration / Math.max(12, stats.maxSpeed);
    const nextForwardSpeed = damp(forwardSpeed, targetSpeed, accelerationResponse * 2.2, dt);
    lateral.multiplyScalar(Math.exp(-(this.save.settings.flightAssist ? 1.45 : 0.16) * dt));
    velocity.copy(forward).multiplyScalar(nextForwardSpeed).add(lateral);

    if (this.afterburning) this.save.player.fuel = Math.max(0, this.save.player.fuel - dt * 2.05);
    else if (this.autopilot && targetSpeed > stats.afterburnSpeed) this.save.player.fuel = Math.max(0, this.save.player.fuel - dt * 0.72);
    else this.save.player.fuel = Math.max(0, this.save.player.fuel - dt * (0.008 + this.save.player.throttle * 0.018));
    if (this.save.player.fuel <= 0) {
      targetSpeed = Math.min(targetSpeed, 8);
      this.afterburning = false;
    }

    position.addScaledVector(velocity, dt);
    this.resolvePlayerCollisions(position, velocity);

    this.save.player.position = tuple(position);
    this.save.player.velocity = tuple(velocity);
    this.save.player.rotation = quatTuple(orientation);
    this.save.player.angularVelocity = tuple(angularVelocity);

    const nav = LOCATIONS[this.save.player.navTargetId];
    const navDistance = position.distanceTo(vec(nav.position));
    const arrivalRadius = nav.kind === 'field' || nav.kind === 'graveyard' ? nav.radius * 0.62 : (nav.dockRadius ?? nav.radius * 1.6);
    if (this.autopilot && navDistance <= arrivalRadius + 10) {
      this.autopilot = false;
      this.save.player.throttle = 0.25;
      this.ui.showToast(`Autopilot arrival: ${nav.name}.`, 'success');
      this.audio.play('success');
    }
  }

  private steerAutopilot(position: THREE.Vector3, orientation: THREE.Quaternion, angularVelocity: THREE.Vector3, dt: number): void {
    const nav = LOCATIONS[this.save.player.navTargetId];
    const desired = vec(nav.position).sub(position).normalize();
    const avoidance = this.getAvoidanceVector(position, desired, 65);
    desired.add(avoidance.multiplyScalar(0.85)).normalize();
    this.tmpQ2.setFromUnitVectors(FORWARD, desired);
    orientation.slerp(this.tmpQ2, 1 - Math.exp(-1.9 * dt));
    angularVelocity.multiplyScalar(Math.exp(-4.8 * dt));
  }

  private resolvePlayerCollisions(position: THREE.Vector3, velocity: THREE.Vector3): void {
    const collide = (center: Vec3Tuple, radius: number, label: string): void => {
      const obstacle = vec(center);
      const delta = position.clone().sub(obstacle);
      const minimum = radius + PLAYER_RADIUS;
      const distance = delta.length();
      if (distance >= minimum || distance < 0.0001) return;
      const normal = delta.multiplyScalar(1 / distance);
      position.copy(obstacle).addScaledVector(normal, minimum + 0.08);
      const impactSpeed = Math.max(0, -velocity.dot(normal)) + velocity.length() * 0.16;
      velocity.reflect(normal).multiplyScalar(0.32);
      if (impactSpeed > 4) {
        this.damagePlayer((impactSpeed - 3) * 1.65, label);
        if (this.collisionMessageCooldown <= 0) {
          this.collisionMessageCooldown = 1.4;
          this.ui.showToast(`Collision: ${label}`, 'danger');
        }
      }
      this.autopilot = false;
    };

    for (const id of DOCK_LOCATION_IDS) {
      const location = LOCATIONS[id];
      collide(location.position, location.radius * (location.kind === 'planet' ? 1.03 : 0.72), location.name);
    }
    for (const node of this.asteroids) collide(node.position, node.radius * 0.88, 'asteroid');
    for (const piece of this.graveyard) collide(piece.position, piece.collisionRadius, 'wreckage');
  }

  private updatePlayerWeapons(dt: number, actions: InputActions): void {
    this.utilityActive = false;
    if (this.save.player.mode === 'combat') {
      this.renderer.setUtilityBeam(false, 'combat', this.save.player.position);
      if (actions.fire && this.gunCooldown <= 0) this.firePlayerGuns();
      return;
    }
    this.updateUtilityTool(dt, actions.fire);
  }

  private firePlayerGuns(): void {
    const stats = getEffectiveShipStats(this.save.player);
    const position = vec(this.save.player.position);
    const orientation = quat(this.save.player.rotation);
    let direction = FORWARD.clone().applyQuaternion(orientation).normalize();
    const target = this.getTargetRef();
    if (this.save.settings.aimAssist && target?.kind === 'ship') {
      const ship = this.ships.find((entry) => entry.id === target.id);
      if (ship) {
        const targetPosition = vec(ship.position);
        const distance = position.distanceTo(targetPosition);
        const predicted = targetPosition.addScaledVector(vec(ship.velocity), distance / 205);
        const assistDirection = predicted.sub(position).normalize();
        if (direction.angleTo(assistDirection) < 0.18) direction.lerp(assistDirection, 0.34).normalize();
      }
    }
    const right = RIGHT.clone().applyQuaternion(orientation).normalize();
    const down = UP.clone().applyQuaternion(orientation).multiplyScalar(-0.24);
    for (const side of [-0.58, 0.58]) {
      const muzzle = position.clone().addScaledVector(right, side).add(down).addScaledVector(direction, 1.8);
      this.projectiles.push({
        id: `p-${++this.projectileCounter}`,
        kind: 'laser',
        ownerId: 'player',
        position: tuple(muzzle),
        velocity: tuple(direction.clone().multiplyScalar(205).add(vec(this.save.player.velocity))),
        damage: stats.gunDamage,
        life: 1.35,
        targetId: target?.kind === 'ship' ? target.id : undefined,
        faction: 'player',
      });
    }
    this.gunCooldown = 0.17;
    this.audio.play('laser', 0.72);
  }

  private fireMissile(): void {
    if (this.save.player.mode !== 'combat') {
      this.ui.showToast('Missile circuit available only in COMBAT mode.', 'warning');
      return;
    }
    if (this.missileCooldown > 0) return;
    if (this.save.player.missiles <= 0) {
      this.ui.showToast('Missile rack empty.', 'warning');
      return;
    }
    const target = this.getTargetRef();
    if (!target || target.kind !== 'ship') {
      this.ui.showToast('No ship target locked.', 'warning');
      return;
    }
    const ship = this.ships.find((entry) => entry.id === target.id);
    if (!ship || ship.hull <= 0) return;
    const position = vec(this.save.player.position);
    const orientation = quat(this.save.player.rotation);
    const direction = FORWARD.clone().applyQuaternion(orientation).normalize();
    this.projectiles.push({
      id: `p-${++this.projectileCounter}`,
      kind: 'missile',
      ownerId: 'player',
      position: tuple(position.clone().addScaledVector(direction, 2.2)),
      velocity: tuple(direction.multiplyScalar(72).add(vec(this.save.player.velocity))),
      damage: 42,
      life: 8,
      targetId: ship.id,
      faction: 'player',
    });
    this.save.player.missiles -= 1;
    this.missileCooldown = 1.1;
    this.audio.play('missile');
  }

  private updateUtilityTool(dt: number, firing: boolean): void {
    const target = this.getTargetRef();
    const stats = getEffectiveShipStats(this.save.player);
    const playerPosition = vec(this.save.player.position);
    const mode = this.save.player.mode;
    const range = mode === 'mining' ? (this.save.player.equipment.includes('mining-mk2') ? 62 : 48) : stats.salvageRange;

    if (!firing || !target || (mode === 'mining' && target.kind !== 'asteroid') || (mode === 'salvage' && target.kind !== 'wreck')) {
      this.renderer.setUtilityBeam(false, mode, this.save.player.position);
      return;
    }
    const distance = playerPosition.distanceTo(vec(target.position));
    if (distance > range) {
      this.renderer.setUtilityBeam(false, mode, this.save.player.position);
      if (this.hintCooldown <= 0) {
        this.hintCooldown = 1.2;
        this.ui.showToast(`Utility target out of range (${Math.round(distance)} / ${Math.round(range)}).`, 'warning');
      }
      return;
    }
    if (this.lineBlocked(playerPosition, vec(target.position), target.id)) {
      this.renderer.setUtilityBeam(false, mode, this.save.player.position);
      if (this.hintCooldown <= 0) {
        this.hintCooldown = 1.2;
        this.ui.showToast('Utility beam obstructed.', 'warning');
      }
      return;
    }

    if (mode === 'mining') {
      const node = this.asteroids.find((entry) => entry.id === target.id);
      if (!node || node.remaining <= 0) return;
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
    } else {
      const node = this.wreckNodes.find((entry) => entry.id === target.id);
      if (!node || node.remaining <= 0) return;
      if (!node.scanned) {
        this.requireScanHint();
        return;
      }
      this.utilityActive = true;
      this.renderer.setUtilityBeam(true, mode, this.save.player.position, node.position);
      this.extractWreck(node, dt, stats.salvageRate);
      if (node.hazard > 0.45) this.damagePlayer(node.hazard * dt * 1.25, 'radiation exposure', false);
      if (this.utilitySoundCooldown <= 0) {
        this.utilitySoundCooldown = 0.18;
        this.audio.play('salvage', 0.32);
      }
      this.triggerSalvageAmbush(node);
    }
  }

  private requireScanHint(): void {
    this.renderer.setUtilityBeam(false, this.save.player.mode, this.save.player.position);
    if (this.hintCooldown <= 0) {
      this.hintCooldown = 1.2;
      this.ui.showToast('SCAN REQUIRED before extraction.', 'warning');
    }
  }

  private extractAsteroid(node: AsteroidNode, dt: number, rate: number): void {
    const current = this.extractionCarry.get(node.id) ?? 0;
    let next = current + dt * 0.58 * rate * node.richness;
    while (next >= 1 && node.remaining > 0) {
      next -= 1;
      node.remaining = Math.max(0, node.remaining - 1);
      this.save.world.depletedAsteroids[node.id] = node.remaining;
      this.spawnPickup('ore', node.position, 'mining', node.richness > 1.75 ? 'uncommon' : 'common');
      this.ui.showToast('Ore fragment separated. Tractor field active.', 'success', 2400);
      if (node.remaining <= 0) {
        this.ui.showToast('Deposit exhausted.', 'info');
        this.save.player.currentTargetId = undefined;
        break;
      }
    }
    this.extractionCarry.set(node.id, next);
  }

  private extractWreck(node: WreckNode, dt: number, rate: number): void {
    const current = this.extractionCarry.get(node.id) ?? 0;
    let next = current + dt * 0.48 * rate * (node.rarity === 'rare' ? 0.78 : 1);
    while (next >= 1 && node.remaining > 0) {
      next -= 1;
      node.remaining = Math.max(0, node.remaining - 1);
      this.save.world.depletedWrecks[node.id] = node.remaining;
      this.spawnPickup(node.salvage, node.position, 'salvage', node.rarity);
      this.ui.showToast(`${COMMODITIES[node.salvage].name} recovered from the wreck.`, 'success', 2600);
      if (node.remaining <= 0) {
        if (node.rarity === 'rare') this.recoverRareEquipment(node);
        this.ui.showToast('Wreck section stripped.', 'info');
        this.save.player.currentTargetId = undefined;
        break;
      }
    }
    this.extractionCarry.set(node.id, next);
  }

  private recoverRareEquipment(node: WreckNode): void {
    const rng = seededRandom(`${this.save.world.seed}:rare-equipment:${node.id}`);
    if (rng() > 0.38) return;
    const candidates = equipmentIds.filter((id) => !this.save.player.equipment.includes(id));
    if (!candidates.length) return;
    const equipmentId = pick(rng, candidates);
    this.save.player.equipment.push(equipmentId);
    const stats = getEffectiveShipStats(this.save.player);
    this.save.player.shield = Math.min(stats.shield, this.save.player.shield + 12);
    this.ui.showToast(`Rare recovery: ${EQUIPMENT[equipmentId]!.name} installed.`, 'success', 6200);
    this.audio.play('success', 1.35);
  }

  private triggerSalvageAmbush(node: WreckNode): void {
    if (this.salvageAmbushTriggered.has(node.id)) return;
    const rng = seededRandom(`${this.save.world.seed}:salvage-ambush:${node.id}`);
    if (rng() > 0.34 + node.hazard * 0.18) return;
    this.salvageAmbushTriggered.add(node.id);
    const player = vec(this.save.player.position);
    const pirate = this.spawnShip('pirate', tuple(player.clone().add(new THREE.Vector3(90, 20, -75))));
    pirate.targetId = 'player';
    if (node.rarity === 'rare') {
      const escort = this.spawnShip('escort', tuple(player.clone().add(new THREE.Vector3(-75, -15, -95))));
      escort.targetId = 'player';
    }
    this.ui.showToast('Salvage claim challenged: hostile drives inbound.', 'danger', 5200);
    this.audio.play('warning');
  }

  private spawnPickup(commodity: CommodityId, origin: Vec3Tuple, source: PickupEntity['source'], rarity: PickupEntity['rarity']): void {
    const rng = seededRandom(`${this.save.world.seed}:pickup:${++this.pickupCounter}:${this.save.world.time}`);
    const drift = new THREE.Vector3(rng() - 0.5, rng() - 0.5, rng() - 0.5).normalize().multiplyScalar(randomBetween(rng, 0.8, 2.4));
    const offset = drift.clone().normalize().multiplyScalar(2.2 + rng() * 2.5);
    this.pickups.push({
      id: `pickup-${this.pickupCounter}`,
      commodity,
      position: tuple(vec(origin).add(offset)),
      velocity: tuple(drift),
      amount: 1,
      source,
      rarity,
      life: 140,
    });
  }

  private updatePickups(dt: number): void {
    const player = vec(this.save.player.position);
    for (const pickup of this.pickups) {
      pickup.life -= dt;
      const position = vec(pickup.position);
      const velocity = vec(pickup.velocity);
      const distance = position.distanceTo(player);
      const modeMatches =
        (this.save.player.mode === 'mining' && pickup.source === 'mining') ||
        (this.save.player.mode === 'salvage' && (pickup.source === 'salvage' || pickup.source === 'combat'));
      if ((this.utilityActive && modeMatches && distance < getEffectiveShipStats(this.save.player).salvageRange * 1.5) || distance < 7) {
        const pull = player.clone().sub(position).normalize().multiplyScalar((28 / Math.max(2, distance)) * dt);
        velocity.add(pull);
      }
      velocity.multiplyScalar(Math.exp(-0.18 * dt));
      position.addScaledVector(velocity, dt);
      pickup.position = tuple(position);
      pickup.velocity = tuple(velocity);
      if (distance < 3.2) this.collectPickup(pickup);
    }
  }

  private collectPickup(pickup: PickupEntity): void {
    if (pickup.life <= 0) return;
    const required = COMMODITIES[pickup.commodity].mass * pickup.amount;
    if (cargoFree(this.save.player) + 0.001 < required) {
      if (this.hintCooldown <= 0) {
        this.hintCooldown = 1.4;
        this.ui.showToast('Cargo hold full. Recovery remains outside.', 'warning');
      }
      return;
    }
    this.save.player.cargo[pickup.commodity] = (this.save.player.cargo[pickup.commodity] ?? 0) + pickup.amount;
    pickup.life = 0;
    if (pickup.source === 'mining') {
      this.save.player.stats.mined += pickup.amount;
      const rankMessage = awardCareerProgress(this.save, 'mining', 1, 'frontier-miners');
      if (rankMessage) this.ui.showToast(rankMessage, 'success', 5000);
    } else {
      this.save.player.stats.salvaged += pickup.amount;
      const rankMessage = awardCareerProgress(this.save, 'salvage', pickup.rarity === 'rare' ? 3 : 1, 'salvage-union');
      if (rankMessage) this.ui.showToast(rankMessage, 'success', 5000);
    }
    this.ui.showToast(`Tractor captured ${COMMODITIES[pickup.commodity].name}.`, 'success', 2200);
  }

  private scanTarget(): void {
    if (this.scanCooldown > 0) return;
    const target = this.getTargetRef();
    if (!target) {
      this.ui.showToast('No target selected for scan.', 'warning');
      return;
    }
    const stats = getEffectiveShipStats(this.save.player);
    const distance = vec(this.save.player.position).distanceTo(vec(target.position));
    if (distance > stats.scanRange) {
      this.ui.showToast(`Target outside scan range (${Math.round(distance)} / ${stats.scanRange}).`, 'warning');
      return;
    }
    if (target.kind === 'asteroid') {
      const node = this.asteroids.find((entry) => entry.id === target.id)!;
      node.scanned = true;
      if (!this.save.world.scannedNodes.includes(node.id)) this.save.world.scannedNodes.push(node.id);
      const grade = node.richness > 1.8 ? 'RICH' : node.richness > 1.2 ? 'VIABLE' : 'LEAN';
      this.ui.showToast(`Scan: ${grade} metallic deposit · ${Math.ceil(node.remaining)} recoverable units.`, 'success', 4600);
    } else if (target.kind === 'wreck') {
      const node = this.wreckNodes.find((entry) => entry.id === target.id)!;
      node.scanned = true;
      if (!this.save.world.scannedNodes.includes(node.id)) this.save.world.scannedNodes.push(node.id);
      this.ui.showToast(`Scan: ${node.rarity.toUpperCase()} ${COMMODITIES[node.salvage].name} · hazard ${Math.round(node.hazard * 100)}.`, 'success', 4800);
    } else {
      const ship = this.ships.find((entry) => entry.id === target.id)!;
      this.ui.showToast(`Scan: ${ship.name} · ${ship.role.toUpperCase()} · ${ship.hostile ? 'HOSTILE' : 'NO ACTIVE WARRANT'}.`, ship.hostile ? 'danger' : 'info', 4200);
    }
    this.scanCooldown = 0.55;
    this.audio.play('scan');
    this.renderer.setTarget(
      target.kind === 'ship' ? target.id : undefined,
      target.kind === 'asteroid' ? target.id : undefined,
      target.kind === 'wreck' ? target.id : undefined,
    );
  }

  private cycleTarget(): void {
    const candidates = this.targetCandidates();
    if (!candidates.length) {
      this.save.player.currentTargetId = undefined;
      this.renderer.setTarget();
      this.ui.showToast(`No ${this.save.player.mode} targets in sensor range.`, 'info');
      return;
    }
    const currentIndex = candidates.findIndex((entry) => entry.id === this.save.player.currentTargetId);
    const next = candidates[(currentIndex + 1) % candidates.length]!;
    this.selectTarget(next);
  }

  private targetNearestHostile(): void {
    const player = vec(this.save.player.position);
    const nearest = this.ships
      .filter((entry) => entry.hostile && entry.hull > 0)
      .sort((a, b) => player.distanceToSquared(vec(a.position)) - player.distanceToSquared(vec(b.position)))[0];
    if (!nearest) {
      this.ui.showToast('No hostile contact in sensor range.', 'info');
      return;
    }
    this.save.player.mode = 'combat';
    this.selectTarget({ kind: 'ship', id: nearest.id, position: nearest.position, name: nearest.name });
  }

  private targetCandidates(): TargetRef[] {
    const player = vec(this.save.player.position);
    const orientation = quat(this.save.player.rotation);
    const forward = FORWARD.clone().applyQuaternion(orientation);
    const stats = getEffectiveShipStats(this.save.player);
    const score = (position: Vec3Tuple): number => {
      const direction = vec(position).sub(player);
      const distance = direction.length();
      const angle = forward.angleTo(direction.normalize());
      return angle * 110 + distance * 0.12;
    };
    if (this.save.player.mode === 'combat') {
      return this.ships
        .filter((entry) => entry.hull > 0 && player.distanceTo(vec(entry.position)) < stats.scanRange * 2.2)
        .map((entry) => ({ kind: 'ship' as const, id: entry.id, position: entry.position, name: entry.name }))
        .sort((a, b) => score(a.position) - score(b.position));
    }
    if (this.save.player.mode === 'mining') {
      return this.asteroids
        .filter((entry) => entry.remaining > 0 && player.distanceTo(vec(entry.position)) < stats.scanRange)
        .map((entry) => ({ kind: 'asteroid' as const, id: entry.id, position: entry.position, name: entry.tunnelPart ? 'Rock Crown Deposit' : 'Asteroid Deposit' }))
        .sort((a, b) => score(a.position) - score(b.position));
    }
    return this.wreckNodes
      .filter((entry) => entry.remaining > 0 && player.distanceTo(vec(entry.position)) < stats.scanRange)
      .map((entry) => ({ kind: 'wreck' as const, id: entry.id, position: entry.position, name: entry.name }))
      .sort((a, b) => score(a.position) - score(b.position));
  }

  private selectTarget(target: TargetRef): void {
    this.save.player.currentTargetId = target.id;
    this.renderer.setTarget(
      target.kind === 'ship' ? target.id : undefined,
      target.kind === 'asteroid' ? target.id : undefined,
      target.kind === 'wreck' ? target.id : undefined,
    );
    this.ui.showToast(`Target: ${target.name}`, 'info', 1800);
    this.audio.play('ui');
  }

  private getTargetRef(): TargetRef | undefined {
    const id = this.save.player.currentTargetId;
    if (!id) return undefined;
    const ship = this.ships.find((entry) => entry.id === id && entry.hull > 0);
    if (ship) return { kind: 'ship', id, position: ship.position, name: ship.name };
    const asteroid = this.asteroids.find((entry) => entry.id === id && entry.remaining > 0);
    if (asteroid) return { kind: 'asteroid', id, position: asteroid.position, name: asteroid.tunnelPart ? 'Rock Crown Deposit' : 'Asteroid Deposit' };
    const wreck = this.wreckNodes.find((entry) => entry.id === id && entry.remaining > 0);
    if (wreck) return { kind: 'wreck', id, position: wreck.position, name: wreck.name };
    this.save.player.currentTargetId = undefined;
    this.renderer.setTarget();
    return undefined;
  }

  private toggleAutopilot(): void {
    if (this.autopilot) {
      this.autopilot = false;
      this.ui.showToast('Autopilot disengaged.', 'info');
      return;
    }
    const player = vec(this.save.player.position);
    if (this.hostilesNear(player, 180)) {
      this.ui.showToast('Autopilot unavailable under hostile threat.', 'danger');
      this.audio.play('warning');
      return;
    }
    const nav = LOCATIONS[this.save.player.navTargetId];
    if (player.distanceTo(vec(nav.position)) < nav.radius * 0.6) {
      this.ui.showToast('Already inside the selected nav zone.', 'info');
      return;
    }
    this.autopilot = true;
    this.ui.showToast(`Autopilot vector set: ${nav.name}.`, 'success');
    this.audio.play('ui');
  }

  private updateShips(dt: number): void {
    const playerPosition = vec(this.save.player.position);
    for (const ship of this.ships) {
      if (ship.hull <= 0) continue;
      ship.lifetime += dt;
      ship.fireCooldown -= dt;
      ship.missileCooldown -= dt;
      ship.shieldDelay -= dt;
      if (ship.shieldDelay <= 0) ship.shield = Math.min(ship.maxShield, ship.shield + dt * 3.8);

      const targetPosition = this.resolveShipTarget(ship);
      if (targetPosition) this.updateAttackAI(ship, targetPosition, dt);
      else this.updateTravelAI(ship, dt);

      const position = vec(ship.position);
      if (position.distanceTo(playerPosition) > 950 && ship.lifetime > 40 && !ship.missionId) ship.hull = -1;
    }
  }

  private resolveShipTarget(ship: ShipEntity): THREE.Vector3 | undefined {
    const playerPosition = vec(this.save.player.position);
    if ((ship.role === 'pirate' || ship.role === 'bounty' || ship.role === 'escort' || ship.hostile) && !ship.targetId) {
      const victim = this.ships
        .filter((entry) => !entry.hostile && entry.hull > 0 && (entry.role === 'trader' || entry.role === 'miner'))
        .sort((a, b) => vec(a.position).distanceToSquared(vec(ship.position)) - vec(b.position).distanceToSquared(vec(ship.position)))[0];
      ship.targetId = victim && vec(victim.position).distanceTo(vec(ship.position)) < 150 && playerPosition.distanceTo(vec(ship.position)) > 100 ? victim.id : 'player';
    }
    if (ship.role === 'patrol') {
      const hostile = this.ships
        .filter((entry) => entry.hostile && entry.hull > 0)
        .sort((a, b) => vec(a.position).distanceToSquared(vec(ship.position)) - vec(b.position).distanceToSquared(vec(ship.position)))[0];
      ship.targetId = hostile?.id;
    }
    if (!ship.targetId) return undefined;
    if (ship.targetId === 'player') return playerPosition;
    const target = this.ships.find((entry) => entry.id === ship.targetId && entry.hull > 0);
    if (!target) {
      ship.targetId = undefined;
      return undefined;
    }
    return vec(target.position);
  }

  private updateAttackAI(ship: ShipEntity, targetPosition: THREE.Vector3, dt: number): void {
    const position = vec(ship.position);
    const velocity = vec(ship.velocity);
    const orientation = quat(ship.rotation);
    const toTarget = targetPosition.clone().sub(position);
    const distance = toTarget.length();
    const direct = toTarget.normalize();
    const orbit = new THREE.Vector3(-direct.z, Math.sin(this.save.world.time * 0.7 + hashString(ship.id)) * 0.16, direct.x).normalize();
    let desired = direct.clone();
    if (distance < 42) desired.multiplyScalar(-0.85).addScaledVector(orbit, 0.55).normalize();
    else if (distance < 95) desired.addScaledVector(orbit, 0.5).normalize();
    desired.add(this.getAvoidanceVector(position, desired, 30)).normalize();

    this.tmpQ2.setFromUnitVectors(FORWARD, desired);
    orientation.slerp(this.tmpQ2, 1 - Math.exp(-ship.turnRate * dt));
    const desiredSpeed = distance < 35 ? ship.speed * 0.45 : ship.speed;
    velocity.lerp(desired.multiplyScalar(desiredSpeed), 1 - Math.exp(-0.9 * dt));
    position.addScaledVector(velocity, dt);
    ship.position = tuple(position);
    ship.velocity = tuple(velocity);
    ship.rotation = quatTuple(orientation);

    const facing = FORWARD.clone().applyQuaternion(orientation).dot(direct);
    if (distance < 175 && facing > 0.965 && ship.fireCooldown <= 0 && !this.lineBlocked(position, targetPosition, ship.id)) {
      this.fireNpcGun(ship, direct);
    }
  }

  private updateTravelAI(ship: ShipEntity, dt: number): void {
    const position = vec(ship.position);
    const velocity = vec(ship.velocity);
    const orientation = quat(ship.rotation);
    let destination = ship.destination ? vec(ship.destination) : undefined;
    if (!destination || position.distanceTo(destination) < 30) {
      const rng = seededRandom(`${this.save.world.seed}:route:${ship.id}:${Math.floor(ship.lifetime / 20)}`);
      if (ship.role === 'miner') {
        const center = vec(LOCATIONS.shardbelt.position);
        destination = center.add(new THREE.Vector3(randomBetween(rng, -110, 110), randomBetween(rng, -55, 55), randomBetween(rng, -110, 110)));
      } else if (ship.role === 'patrol') {
        const center = vec(LOCATIONS.rook.position);
        const angle = rng() * Math.PI * 2;
        destination = center.add(new THREE.Vector3(Math.cos(angle) * 95, randomBetween(rng, -35, 35), Math.sin(angle) * 95));
      } else {
        const dock = pick(rng, DOCK_LOCATION_IDS);
        destination = vec(LOCATIONS[dock].position).add(new THREE.Vector3(randomBetween(rng, -30, 30), randomBetween(rng, -20, 20), randomBetween(rng, -30, 30)));
      }
      ship.destination = tuple(destination);
    }
    const desired = destination.clone().sub(position).normalize();
    desired.add(this.getAvoidanceVector(position, desired, 28)).normalize();
    this.tmpQ2.setFromUnitVectors(FORWARD, desired);
    orientation.slerp(this.tmpQ2, 1 - Math.exp(-ship.turnRate * 0.62 * dt));
    velocity.lerp(desired.multiplyScalar(ship.speed * (ship.role === 'trader' ? 0.72 : 0.5)), 1 - Math.exp(-0.55 * dt));
    position.addScaledVector(velocity, dt);
    ship.position = tuple(position);
    ship.velocity = tuple(velocity);
    ship.rotation = quatTuple(orientation);
  }

  private fireNpcGun(ship: ShipEntity, direction: THREE.Vector3): void {
    const position = vec(ship.position).addScaledVector(direction, 2.4);
    this.projectiles.push({
      id: `p-${++this.projectileCounter}`,
      kind: 'laser',
      ownerId: ship.id,
      position: tuple(position),
      velocity: tuple(direction.clone().multiplyScalar(150).add(vec(ship.velocity))),
      damage: ship.gunDamage,
      life: 1.55,
      targetId: ship.targetId,
      faction: ship.faction,
    });
    ship.fireCooldown = ship.role === 'bounty' ? 0.28 : ship.role === 'pirate' ? 0.38 : 0.46;
  }

  private updateProjectiles(dt: number): void {
    for (const projectile of this.projectiles) {
      if (projectile.life <= 0) continue;
      projectile.life -= dt;
      const start = vec(projectile.position);
      const velocity = vec(projectile.velocity);
      if (projectile.kind === 'missile' && projectile.targetId) {
        const targetPosition = projectile.targetId === 'player'
          ? vec(this.save.player.position)
          : this.ships.find((entry) => entry.id === projectile.targetId && entry.hull > 0)
            ? vec(this.ships.find((entry) => entry.id === projectile.targetId)!.position)
            : undefined;
        if (targetPosition) {
          const desired = targetPosition.sub(start).normalize().multiplyScalar(92);
          velocity.lerp(desired, 1 - Math.exp(-2.8 * dt));
          projectile.velocity = tuple(velocity);
        }
      }
      const end = start.clone().addScaledVector(velocity, dt);
      let bestT = 2;
      let hitKind: 'obstacle' | 'player' | 'ship' | undefined;
      let hitShip: ShipEntity | undefined;

      const obstacleHit = this.firstObstacleHit(start, end, projectile.ownerId);
      if (obstacleHit !== undefined && obstacleHit < bestT) {
        bestT = obstacleHit;
        hitKind = 'obstacle';
      }

      if (projectile.ownerId !== 'player') {
        const playerT = segmentSphereHit(start, end, vec(this.save.player.position), PLAYER_RADIUS + (projectile.kind === 'missile' ? 0.8 : 0.25));
        if (playerT !== undefined && playerT < bestT) {
          bestT = playerT;
          hitKind = 'player';
        }
      }

      for (const ship of this.ships) {
        if (ship.id === projectile.ownerId || ship.hull <= 0) continue;
        if (projectile.ownerId !== 'player' && !this.projectileCanHitShip(projectile, ship)) continue;
        const radius = ship.role === 'trader' ? 3.8 : 2.4;
        const hit = segmentSphereHit(start, end, vec(ship.position), radius + (projectile.kind === 'missile' ? 0.8 : 0));
        if (hit !== undefined && hit < bestT) {
          bestT = hit;
          hitKind = 'ship';
          hitShip = ship;
        }
      }

      if (hitKind) {
        const hitPosition = start.clone().lerp(end, bestT);
        projectile.life = 0;
        this.renderer.spawnImpact(tuple(hitPosition), projectile.kind === 'missile' ? 0xff7a42 : 0xffcb62);
        if (hitKind === 'player') this.damagePlayer(projectile.damage, projectile.kind === 'missile' ? 'missile strike' : 'weapons fire');
        else if (hitKind === 'ship' && hitShip) this.damageShip(hitShip, projectile.damage, projectile.ownerId, tuple(hitPosition));
        if (projectile.kind === 'missile') {
          this.renderer.spawnExplosion(tuple(hitPosition), projectile.faction === 'red-talons', 0.65);
          this.audio.play('explosion', 0.7);
        } else this.audio.play('impact', 0.35);
      } else {
        projectile.position = tuple(end);
      }
    }
  }

  private projectileCanHitShip(projectile: ProjectileEntity, ship: ShipEntity): boolean {
    if (projectile.targetId === ship.id) return true;
    if (projectile.faction === 'red-talons') return ship.faction !== 'red-talons';
    if (ship.faction === 'red-talons') return true;
    return false;
  }

  private damageShip(ship: ShipEntity, amount: number, attackerId: string, position: Vec3Tuple): void {
    let remaining = amount;
    if (ship.shield > 0) {
      const absorbed = Math.min(ship.shield, remaining);
      ship.shield -= absorbed;
      remaining -= absorbed;
    }
    if (remaining > 0 && ship.armor > 0) {
      const absorbed = Math.min(ship.armor, remaining * 0.82);
      ship.armor -= absorbed;
      remaining -= absorbed * 0.72;
    }
    if (remaining > 0) ship.hull -= remaining;
    ship.shieldDelay = 4.5;

    if (attackerId === 'player' && !ship.hostile) {
      ship.hostile = true;
      ship.targetId = 'player';
      this.save.player.reputation[ship.faction] = clamp(this.save.player.reputation[ship.faction] - (ship.role === 'patrol' ? 16 : 9), -100, 100);
      this.ui.showToast(`Unauthorized attack: ${FACTION_LABEL(ship.faction)} reputation damaged.`, 'danger', 4500);
      this.alertPatrols(ship.position);
    }
    if (ship.hull <= 0) this.destroyShip(ship, attackerId, position);
  }

  private destroyShip(ship: ShipEntity, attackerId: string, position: Vec3Tuple): void {
    ship.hull = 0;
    this.renderer.spawnExplosion(ship.position, ship.hostile, ship.role === 'trader' ? 1.5 : 1);
    this.audio.play('explosion', 1.1);
    if (attackerId === 'player') {
      this.save.player.stats.kills += 1;
      if (ship.hostile || ship.faction === 'red-talons') {
        const payment = ship.bountyValue;
        this.save.player.credits += payment;
        this.save.player.reputation.concord = clamp(this.save.player.reputation.concord + 1, -100, 100);
        this.ui.showToast(`Hostile destroyed. ${formatCredits(payment)} defense bounty credited.`, 'success', 4200);
      } else {
        this.save.player.reputation[ship.faction] = clamp(this.save.player.reputation[ship.faction] - 18, -100, 100);
        this.ui.showToast('Civilian loss recorded. Faction standing severely reduced.', 'danger', 5200);
      }
      if (ship.missionId) {
        const result = completeBountyMission(this.save, ship.missionId);
        if (result.ok) this.ui.showToast(result.message, 'success', 6500);
      }
    }
    const rng = seededRandom(`${this.save.world.seed}:combat-drop:${ship.id}`);
    if (rng() < 0.64) this.spawnPickup(rng() > 0.8 ? 'electronics' : 'scrap', position, 'combat', rng() > 0.88 ? 'uncommon' : 'common');
    if (this.save.player.currentTargetId === ship.id) this.save.player.currentTargetId = undefined;
  }

  private damagePlayer(amount: number, source: string, feedback = true): void {
    if (this.deathTimer > 0 || amount <= 0) return;
    let remaining = amount;
    if (this.save.player.shield > 0) {
      const absorbed = Math.min(this.save.player.shield, remaining);
      this.save.player.shield -= absorbed;
      remaining -= absorbed;
    }
    if (remaining > 0 && this.save.player.armor > 0) {
      const absorbed = Math.min(this.save.player.armor, remaining * 0.85);
      this.save.player.armor -= absorbed;
      remaining -= absorbed * 0.72;
    }
    if (remaining > 0) this.save.player.hull -= remaining;
    this.playerShieldDelay = 5.2;
    this.autopilot = false;
    if (feedback && amount > 1.5) {
      this.audio.play('impact', clamp(amount / 18, 0.4, 1.4));
      if (navigator.vibrate && this.save.settings.vibration) navigator.vibrate(Math.min(90, 18 + amount * 2));
    }
    if (this.save.player.hull <= 0) {
      this.save.player.hull = 0;
      this.deathTimer = 2.1;
      this.renderer.spawnExplosion(this.save.player.position, false, 1.55);
      this.ui.showToast(`SHIP LOST: ${source}. Emergency beacon transmitting.`, 'danger', 6500);
      this.audio.play('explosion', 1.6);
    }
  }

  private updateRegeneration(dt: number): void {
    const stats = getEffectiveShipStats(this.save.player);
    if (this.playerShieldDelay <= 0) this.save.player.shield = Math.min(stats.shield, this.save.player.shield + dt * 5.3);
  }

  private updateDeathDrift(dt: number): void {
    const velocity = vec(this.save.player.velocity).multiplyScalar(Math.exp(-0.6 * dt));
    const position = vec(this.save.player.position).addScaledVector(velocity, dt);
    this.save.player.velocity = tuple(velocity);
    this.save.player.position = tuple(position);
    this.save.player.angularVelocity = [0.3, -0.22, 0.38];
  }

  private recoverPlayer(): void {
    const loss = Math.min(this.save.player.credits, Math.max(500, Math.floor(this.save.player.credits * 0.15)));
    this.save.player.credits -= loss;
    for (const id of Object.keys(this.save.player.cargo) as CommodityId[]) {
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
    const stats = getEffectiveShipStats(this.save.player);
    this.save.player.position = [...location.position];
    this.save.player.velocity = [0, 0, 0];
    this.save.player.angularVelocity = [0, 0, 0];
    this.save.player.rotation = [0, 0, 0, 1];
    this.save.player.throttle = 0;
    this.save.player.shield = 0;
    this.save.player.armor = stats.armor * 0.35;
    this.save.player.hull = stats.hull * 0.35;
    this.save.player.fuel = stats.fuel * 0.35;
    this.save.player.missiles = 0;
    this.save.player.dockedAt = dock;
    this.renderer.setCockpitVisible(false);
    this.audio.setStationMode(true);
    this.ui.hideHud();
    this.ui.showDock(this.save, dock);
    this.ui.showToast(`Emergency tow complete. Recovery fee: ${formatCredits(loss)}.`, 'danger', 6500);
    saveGame(this.save);
  }

  private updateBountySpawns(): void {
    const player = vec(this.save.player.position);
    for (const mission of this.save.activeMissions) {
      if (mission.kind !== 'bounty' || !mission.targetZone || !mission.targetName) continue;
      if (this.ships.some((entry) => entry.missionId === mission.id && entry.hull > 0)) continue;
      const zone = LOCATIONS[mission.targetZone];
      if (player.distanceTo(vec(zone.position)) > zone.radius + 190) continue;
      const rng = seededRandom(`${this.save.world.seed}:bounty:${mission.id}:${Math.floor(this.save.world.time / 60)}`);
      const offset = new THREE.Vector3(rng() - 0.5, (rng() - 0.5) * 0.45, rng() - 0.5).normalize().multiplyScalar(randomBetween(rng, 85, 145));
      const target = this.spawnShip('bounty', tuple(player.clone().add(offset)), mission.id, mission.targetName);
      target.targetId = 'player';
      if (this.save.player.guildRank.bounty >= 1 || mission.reward > 6500) {
        const escort = this.spawnShip('escort', tuple(vec(target.position).add(new THREE.Vector3(12, 7, -14))));
        escort.targetId = 'player';
      }
      this.ui.showToast(`Warrant target detected: ${mission.targetName}`, 'danger', 5600);
      this.audio.play('warning');
    }
  }

  private updateDynamicEncounters(): void {
    if (this.save.world.time < this.nextEncounterAt || this.ships.filter((entry) => entry.hull > 0).length > 13) return;
    const player = vec(this.save.player.position);
    if (DOCK_LOCATION_IDS.some((id) => player.distanceTo(vec(LOCATIONS[id].position)) < (LOCATIONS[id].dockRadius ?? 50) + 40)) {
      this.nextEncounterAt = this.save.world.time + 18;
      return;
    }
    const zone = this.getWorldZone(player);
    const rng = seededRandom(`${this.save.world.seed}:encounter:${++this.encounterCounter}:${Math.floor(this.save.world.time)}`);
    const roll = rng();
    if ((zone === 'asteroid-field' && roll < 0.42) || (zone === 'graveyard' && roll < 0.28) || (zone === 'open' && roll < 0.22)) {
      const miner = this.spawnShip('miner', this.encounterPosition(rng, 120));
      miner.destination = tuple(vec(LOCATIONS.shardbelt.position).add(new THREE.Vector3(randomBetween(rng, -70, 70), randomBetween(rng, -35, 35), randomBetween(rng, -70, 70))));
      this.ui.showToast(zone === 'graveyard' ? 'Independent recovery crew on sensors.' : 'Miner traffic crossing the lane.', 'info');
    } else if (roll < (zone === 'graveyard' ? 0.72 : zone === 'asteroid-field' ? 0.68 : 0.5)) {
      const trader = this.spawnShip('trader', this.encounterPosition(rng, 150));
      if (rng() < 0.55) {
        const pirate = this.spawnShip('pirate', this.encounterPosition(rng, 125));
        pirate.targetId = trader.id;
        this.ui.showToast('Distress traffic: pirates attacking a civilian vessel.', 'danger', 5200);
        this.audio.play('warning');
      } else {
        this.ui.showToast('Civilian trader entering local space.', 'info');
      }
    } else if (roll < 0.78) {
      this.spawnShip('patrol', this.encounterPosition(rng, 145));
      this.ui.showToast('Concord patrol sweep detected.', 'info');
    } else {
      const count = randomInt(rng, 1, zone === 'graveyard' ? 3 : 2);
      for (let i = 0; i < count; i += 1) {
        const pirate = this.spawnShip(i === 0 ? 'pirate' : 'escort', this.encounterPosition(rng, 105 + i * 18));
        pirate.targetId = 'player';
      }
      this.ui.showToast('Pirate intercept. Weapons free.', 'danger', 4800);
      this.audio.play('warning');
    }
    this.nextEncounterAt = this.save.world.time + randomBetween(rng, 24, 44);
  }

  private encounterPosition(rng: () => number, distance: number): Vec3Tuple {
    const player = vec(this.save.player.position);
    const orientation = quat(this.save.player.rotation);
    const forward = FORWARD.clone().applyQuaternion(orientation);
    const right = RIGHT.clone().applyQuaternion(orientation);
    const offset = forward.multiplyScalar(-distance * randomBetween(rng, 0.3, 1)).addScaledVector(right, randomBetween(rng, -distance, distance));
    offset.y += randomBetween(rng, -35, 35);
    if (offset.length() < distance * 0.75) offset.normalize().multiplyScalar(distance);
    return tuple(player.add(offset));
  }

  private spawnInitialTraffic(): void {
    const rng = seededRandom(`${this.save.world.seed}:initial-traffic:${Math.floor(this.save.world.time / 60)}`);
    const center = this.save.player.dockedAt ? vec(LOCATIONS[this.save.player.dockedAt].position) : vec(this.save.player.position);
    const trader = this.spawnShip('trader', tuple(center.clone().add(new THREE.Vector3(95, 25, -70))));
    trader.destination = LOCATIONS.azure.position;
    const patrol = this.spawnShip('patrol', tuple(vec(LOCATIONS.rook.position).add(new THREE.Vector3(-70, 20, 65))));
    patrol.destination = LOCATIONS.helix.position;
    const miner = this.spawnShip('miner', tuple(vec(LOCATIONS.shardbelt.position).add(new THREE.Vector3(randomBetween(rng, -60, 60), randomBetween(rng, -30, 30), randomBetween(rng, -60, 60)))));
    miner.destination = LOCATIONS.shardbelt.position;
  }

  private spawnShip(role: ShipEntity['role'], position: Vec3Tuple, missionId?: string, nameOverride?: string): ShipEntity {
    const index = ++this.entityCounter;
    const rng = seededRandom(`${this.save.world.seed}:ship:${index}:${Math.floor(this.save.world.time)}`);
    const faction: FactionId = role === 'pirate' || role === 'bounty' || role === 'escort' ? 'red-talons' : role === 'patrol' ? 'concord' : role === 'miner' ? 'frontier-miners' : 'free-merchants';
    const hostile = faction === 'red-talons';
    const maxShield = role === 'bounty' ? 105 : role === 'trader' ? 82 : role === 'patrol' ? 75 : role === 'miner' ? 50 : 58;
    const maxArmor = role === 'bounty' ? 105 : role === 'trader' ? 110 : role === 'patrol' ? 72 : role === 'miner' ? 76 : 62;
    const maxHull = role === 'bounty' ? 120 : role === 'trader' ? 145 : role === 'patrol' ? 90 : role === 'miner' ? 95 : 75;
    const direction = new THREE.Vector3(rng() - 0.5, (rng() - 0.5) * 0.4, rng() - 0.5).normalize();
    const rotation = new THREE.Quaternion().setFromUnitVectors(FORWARD, direction);
    const ship: ShipEntity = {
      id: `ship-${index}`,
      name: nameOverride ?? (hostile ? proceduralCallsign(rng) : `${role === 'trader' ? 'MV' : role === 'patrol' ? 'CPV' : role === 'miner' ? 'Prospector' : 'Escort'} ${randomInt(rng, 12, 997)}`),
      role,
      faction,
      position: [...position],
      velocity: tuple(direction.multiplyScalar(randomBetween(rng, 4, 12))),
      rotation: quatTuple(rotation),
      shield: maxShield,
      maxShield,
      armor: maxArmor,
      maxArmor,
      hull: maxHull,
      maxHull,
      speed: role === 'bounty' ? 43 : role === 'pirate' || role === 'escort' ? 38 : role === 'patrol' ? 36 : role === 'trader' ? 27 : 24,
      turnRate: role === 'bounty' ? 1.55 : role === 'pirate' || role === 'escort' ? 1.35 : role === 'patrol' ? 1.1 : 0.72,
      gunDamage: role === 'bounty' ? 10 : role === 'pirate' ? 7.5 : role === 'escort' ? 6.5 : role === 'patrol' ? 7 : 4,
      hostile,
      bountyValue: role === 'bounty' ? 900 : role === 'pirate' || role === 'escort' ? randomInt(rng, 170, 420) : 0,
      aiState: hostile ? 'attack' : role === 'miner' ? 'mine' : role === 'patrol' ? 'patrol' : 'travel',
      fireCooldown: randomBetween(rng, 0.2, 0.8),
      missileCooldown: randomBetween(rng, 1, 3),
      shieldDelay: 0,
      spawnTime: this.save.world.time,
      lifetime: 0,
      missionId,
    };
    this.ships.push(ship);
    return ship;
  }

  private alertPatrols(position: Vec3Tuple): void {
    for (const patrol of this.ships.filter((entry) => entry.role === 'patrol' && entry.hull > 0)) {
      if (vec(patrol.position).distanceTo(vec(position)) < 320) {
        patrol.hostile = true;
        patrol.targetId = 'player';
      }
    }
  }

  private updateDiscovery(): void {
    const player = vec(this.save.player.position);
    for (const id of NAV_LOCATION_IDS) {
      const location = LOCATIONS[id];
      const discoveryRadius = location.radius + (location.kind === 'planet' ? 160 : 120);
      if (player.distanceTo(vec(location.position)) <= discoveryRadius && !this.save.player.discovered.includes(id)) {
        this.save.player.discovered.push(id);
        this.ui.showToast(`NAV DISCOVERY: ${location.name}`, 'success', 4600);
        this.audio.play('success');
      }
    }
  }

  private cleanupEntities(): void {
    for (let index = this.projectiles.length - 1; index >= 0; index -= 1) {
      if (this.projectiles[index]!.life <= 0) this.projectiles.splice(index, 1);
    }
    for (let index = this.pickups.length - 1; index >= 0; index -= 1) {
      if (this.pickups[index]!.life <= 0) this.pickups.splice(index, 1);
    }
    for (let index = this.ships.length - 1; index >= 0; index -= 1) {
      if (this.ships[index]!.hull < 0 || (this.ships[index]!.hull === 0 && this.ships[index]!.lifetime > 1.3)) this.ships.splice(index, 1);
    }
  }

  private getWorldZone(position = vec(this.save.player.position)): WorldZone {
    if (position.distanceTo(vec(LOCATIONS.shardbelt.position)) < LOCATIONS.shardbelt.radius) return 'asteroid-field';
    if (position.distanceTo(vec(LOCATIONS['mourning-line'].position)) < LOCATIONS['mourning-line'].radius) return 'graveyard';
    if (DOCK_LOCATION_IDS.some((id) => position.distanceTo(vec(LOCATIONS[id].position)) < (LOCATIONS[id].dockRadius ?? 60) + 50)) return 'near-location';
    return 'open';
  }

  private hostilesNear(position: THREE.Vector3, radius: number): boolean {
    return this.ships.some((ship) => ship.hostile && ship.hull > 0 && position.distanceTo(vec(ship.position)) < radius);
  }

  private obstacleAhead(position: THREE.Vector3, direction: THREE.Vector3, distance: number): boolean {
    const end = position.clone().addScaledVector(direction, distance);
    return this.firstObstacleHit(position, end) !== undefined;
  }

  private getAvoidanceVector(position: THREE.Vector3, desired: THREE.Vector3, range: number): THREE.Vector3 {
    const avoidance = new THREE.Vector3();
    const inspect = (centerTuple: Vec3Tuple, radius: number): void => {
      const center = vec(centerTuple);
      const offset = position.clone().sub(center);
      const distance = offset.length();
      const clearance = radius + range;
      if (distance >= clearance || distance < 0.01) return;
      const ahead = desired.dot(center.clone().sub(position).normalize());
      if (ahead < -0.1) return;
      avoidance.add(offset.normalize().multiplyScalar((clearance - distance) / clearance));
    };
    for (const id of DOCK_LOCATION_IDS) inspect(LOCATIONS[id].position, LOCATIONS[id].radius);
    for (const node of this.asteroids) inspect(node.position, node.radius);
    for (const piece of this.graveyard) inspect(piece.position, piece.collisionRadius);
    return avoidance;
  }

  private lineBlocked(start: THREE.Vector3, end: THREE.Vector3, ignoreId?: string): boolean {
    return this.firstObstacleHit(start, end, ignoreId) !== undefined;
  }

  private firstObstacleHit(start: THREE.Vector3, end: THREE.Vector3, ignoreId?: string): number | undefined {
    let best: number | undefined;
    const test = (id: string, centerTuple: Vec3Tuple, radius: number): void => {
      if (id === ignoreId) return;
      const center = vec(centerTuple);
      if (start.distanceTo(center) < radius + 1.5) return;
      const hit = segmentSphereHit(start, end, center, radius);
      if (hit !== undefined && (best === undefined || hit < best)) best = hit;
    };
    for (const id of DOCK_LOCATION_IDS) {
      const location = LOCATIONS[id];
      test(id, location.position, location.radius * (location.kind === 'planet' ? 1.02 : 0.73));
    }
    for (const node of this.asteroids) test(node.id, node.position, node.radius * 0.9);
    for (const piece of this.graveyard) test(piece.id, piece.position, piece.collisionRadius);
    return best;
  }

  private tryDock(): void {
    const candidate = this.dockCandidate();
    if (!candidate) {
      this.ui.showToast('No docking or landing zone in range.', 'info');
      return;
    }
    const speed = vec(this.save.player.velocity).length();
    if (speed > 20) {
      this.ui.showToast(`Reduce speed below 20 before ${LOCATIONS[candidate].kind === 'planet' ? 'landing' : 'docking'}.`, 'warning');
      return;
    }
    if (this.hostilesNear(vec(this.save.player.position), 130)) {
      this.ui.showToast('Docking control denies approach while hostiles are close.', 'danger');
      return;
    }
    this.dockAt(candidate);
  }

  private dockCandidate(): DockLocationId | undefined {
    const player = vec(this.save.player.position);
    return DOCK_LOCATION_IDS
      .map((id) => ({ id, distance: player.distanceTo(vec(LOCATIONS[id].position)) }))
      .filter((entry) => entry.distance <= (LOCATIONS[entry.id].dockRadius ?? 55))
      .sort((a, b) => a.distance - b.distance)[0]?.id;
  }

  private dockAt(locationId: DockLocationId): void {
    this.autopilot = false;
    this.afterburning = false;
    this.save.player.dockedAt = locationId;
    this.save.player.lastDockedAt = locationId;
    this.save.player.velocity = [0, 0, 0];
    this.save.player.angularVelocity = [0, 0, 0];
    this.save.player.throttle = 0;
    const stats = getEffectiveShipStats(this.save.player);
    this.save.player.shield = stats.shield;
    completeMissionsAtDock(this.save, locationId).forEach((message) => this.ui.showToast(message, 'success', 6000));
    refreshMissionOffers(this.save);
    this.renderer.setCockpitVisible(false);
    this.renderer.setUtilityBeam(false, this.save.player.mode, this.save.player.position);
    this.audio.setStationMode(true);
    this.audio.play('dock');
    this.ui.hideHud();
    this.ui.showDock(this.save, locationId);
    saveGame(this.save);
  }

  launch(): void {
    const locationId = this.save.player.dockedAt;
    if (!locationId) return;
    const location = LOCATIONS[locationId];
    const outward = vec(location.position).normalize();
    if (outward.lengthSq() < 0.1) outward.set(0, 0, 1);
    const launchDistance = (location.dockRadius ?? location.radius * 1.7) + 8;
    const position = vec(location.position).addScaledVector(outward, launchDistance);
    const direction = outward.clone().normalize();
    const orientation = new THREE.Quaternion().setFromUnitVectors(FORWARD, direction);
    this.save.player.position = tuple(position);
    this.save.player.rotation = quatTuple(orientation);
    this.save.player.velocity = tuple(direction.multiplyScalar(6));
    this.save.player.angularVelocity = [0, 0, 0];
    this.save.player.throttle = 0.18;
    this.save.player.dockedAt = undefined;
    this.renderer.setCockpitVisible(true);
    this.audio.setStationMode(false);
    this.ui.hideDock();
    this.ui.showHud();
    this.ui.showToast(`Cleared for departure from ${location.name}.`, 'success');
    saveGame(this.save);
  }

  setNav(locationId: LocationId): void {
    this.save.player.navTargetId = locationId;
    this.autopilot = false;
    this.ui.showToast(`NAV set: ${LOCATIONS[locationId].name}.`, 'info');
    this.audio.play('ui');
  }

  trade(kind: 'buy' | 'sell', commodityId: CommodityId, quantity: number): void {
    const dock = this.save.player.dockedAt;
    if (!dock) return;
    const result = kind === 'buy' ? buyCommodity(this.save, dock, commodityId, quantity) : sellCommodity(this.save, dock, commodityId, quantity);
    this.ui.showToast(result.message + (result.ok ? ` ${formatCredits(result.total)}.` : ''), result.ok ? 'success' : 'warning');
    this.audio.play(result.ok ? 'ui' : 'warning', 0.55);
    this.ui.refreshDock(this.save);
    saveGame(this.save);
  }

  acceptMission(missionId: string): void {
    const dock = this.save.player.dockedAt;
    if (!dock) return;
    const result = acceptMission(this.save, dock, missionId);
    this.ui.showToast(result.message, result.ok ? 'success' : 'warning', result.ok ? 4300 : 3200);
    this.audio.play(result.ok ? 'success' : 'warning', 0.7);
    this.ui.refreshDock(this.save);
    saveGame(this.save);
  }

  repair(): void {
    const cost = repairCost(this.save.player);
    if (cost <= 0) return;
    if (this.save.player.credits < cost) {
      this.ui.showToast('Insufficient credits for full repair.', 'warning');
      return;
    }
    const stats = getEffectiveShipStats(this.save.player);
    this.save.player.credits -= cost;
    this.save.player.hull = stats.hull;
    this.save.player.armor = stats.armor;
    this.ui.showToast(`Repair complete. ${formatCredits(cost)} charged.`, 'success');
    this.audio.play('success');
    this.ui.refreshDock(this.save);
    saveGame(this.save);
  }

  refuel(): void {
    const cost = refillCost(this.save.player);
    if (cost <= 0) return;
    if (this.save.player.credits < cost) {
      this.ui.showToast('Insufficient credits for full refill.', 'warning');
      return;
    }
    const stats = getEffectiveShipStats(this.save.player);
    this.save.player.credits -= cost;
    this.save.player.fuel = stats.fuel;
    this.save.player.missiles = stats.missileCapacity;
    this.ui.showToast(`Fuel and ordnance loaded. ${formatCredits(cost)} charged.`, 'success');
    this.audio.play('success');
    this.ui.refreshDock(this.save);
    saveGame(this.save);
  }

  buyEquipment(equipmentId: EquipmentId): void {
    const item = EQUIPMENT[equipmentId]!;
    if (this.save.player.equipment.includes(equipmentId)) return;
    if (!equipmentUnlocked(this.save.player, equipmentId)) {
      this.ui.showToast('Guild rank requirement not met.', 'warning');
      return;
    }
    if (this.save.player.credits < item.price) {
      this.ui.showToast('Insufficient credits.', 'warning');
      return;
    }
    const before = getEffectiveShipStats(this.save.player);
    this.save.player.credits -= item.price;
    this.save.player.equipment.push(equipmentId);
    const after = getEffectiveShipStats(this.save.player);
    this.save.player.shield += after.shield - before.shield;
    this.save.player.armor += after.armor - before.armor;
    this.ui.showToast(`${item.name} installed.`, 'success');
    this.audio.play('success');
    this.ui.refreshDock(this.save);
    saveGame(this.save);
  }

  buyShip(shipId: ShipId): void {
    const dock = this.save.player.dockedAt;
    if (!dock || LOCATIONS[dock].shipForSale !== shipId) {
      this.ui.showToast('That hull is not for sale at this location.', 'warning');
      return;
    }
    const ship = SHIPS[shipId]!;
    if (this.save.player.ownedShips.includes(shipId)) return;
    if (this.save.player.credits < ship.price) {
      this.ui.showToast('Insufficient credits for this hull.', 'warning');
      return;
    }
    if (cargoMass(this.save.player) > ship.cargo + (this.save.player.equipment.includes('cargo-pods') ? 18 : 0)) {
      this.ui.showToast('Current cargo exceeds the new hull capacity.', 'warning');
      return;
    }
    this.save.player.credits -= ship.price;
    this.save.player.ownedShips.push(shipId);
    this.switchShip(shipId, true);
    this.ui.showToast(`${ship.name} purchased and commissioned.`, 'success', 6200);
    this.audio.play('success', 1.4);
  }

  switchShip(shipId: ShipId, purchased = false): void {
    if (!this.save.player.ownedShips.includes(shipId)) return;
    const previousId = this.save.player.shipId;
    this.save.player.shipId = shipId;
    const capacity = cargoCapacity(this.save.player);
    if (cargoMass(this.save.player) > capacity) {
      this.save.player.shipId = previousId;
      this.ui.showToast('Cargo mass exceeds this hull capacity.', 'warning');
      return;
    }
    const stats = getEffectiveShipStats(this.save.player);
    this.save.player.shield = stats.shield;
    this.save.player.armor = stats.armor;
    this.save.player.hull = stats.hull;
    this.save.player.fuel = stats.fuel;
    this.save.player.missiles = stats.missileCapacity;
    if (!purchased) this.ui.showToast(`${SHIPS[shipId]!.name} moved to active berth.`, 'success');
    this.ui.refreshDock(this.save);
    saveGame(this.save);
  }

  joinGuild(guildId: GuildId): void {
    const result = joinGuild(this.save, guildId);
    this.ui.showToast(result.message, result.ok ? 'success' : 'warning');
    this.audio.play(result.ok ? 'success' : 'warning', 0.7);
    this.ui.refreshDock(this.save);
    saveGame(this.save);
  }

  saveNow(): void {
    const ok = saveGame(this.save);
    this.ui.showToast(ok ? 'Career state saved locally.' : 'Save failed in this browser context.', ok ? 'success' : 'danger');
  }

  resumeFlight(): void {
    this.ui.hidePause();
    this.ui.hideMap();
  }

  quitToTitle(): void {
    saveGame(this.save);
    this.dispose();
    this.onQuit();
  }

  setSetting(key: 'music' | 'effects' | 'flightAssist' | 'aimAssist' | 'quality' | 'touchScale' | 'vibration', value: number | boolean | string): void {
    if (key === 'music' || key === 'effects' || key === 'touchScale') {
      this.save.settings[key] = Number(value);
    } else if (key === 'flightAssist' || key === 'aimAssist' || key === 'vibration') {
      this.save.settings[key] = Boolean(value);
    } else if (key === 'quality' && (value === 'auto' || value === 'low' || value === 'high')) {
      this.save.settings.quality = value;
      this.qualityScale = value === 'low' ? 0.72 : 1;
      this.renderer.setQualityScale(this.qualityScale);
    }
    this.audio.setVolumes(this.save.settings.music, this.save.settings.effects);
    this.ui.setTouchScale(this.save.settings.touchScale);
    saveGame(this.save);
  }

  private syncRender(dt: number, now: number): void {
    const stats = getEffectiveShipStats(this.save.player);
    const speed = vec(this.save.player.velocity).length();
    this.renderer.updateCamera(
      this.save.player.position,
      this.save.player.rotation,
      this.save.player.angularVelocity,
      clamp(speed / Math.max(1, stats.afterburnSpeed), 0, 2),
      this.afterburning || (this.autopilot && speed > stats.afterburnSpeed),
      dt,
    );
    this.renderer.setDamageWarning(1 - this.save.player.hull / stats.hull);
    this.renderer.syncShips(this.ships.filter((entry) => entry.hull >= 0));
    this.renderer.syncProjectiles(this.projectiles);
    this.renderer.syncPickups(this.pickups.filter((entry) => entry.life > 0));
    this.renderer.render();

    if (!this.save.player.dockedAt && now - this.lastHudUpdate > 42) {
      this.lastHudUpdate = now;
      this.ui.updateHud(this.buildHudModel());
    }

    if (this.save.settings.quality === 'auto') {
      this.fpsAccumulator += dt;
      this.fpsFrames += 1;
      if (this.fpsAccumulator > 2.5) {
        const fps = this.fpsFrames / this.fpsAccumulator;
        if (fps < 39) this.qualityScale = Math.max(0.62, this.qualityScale - 0.08);
        else if (fps > 56) this.qualityScale = Math.min(1, this.qualityScale + 0.04);
        this.renderer.setQualityScale(this.qualityScale);
        this.fpsAccumulator = 0;
        this.fpsFrames = 0;
      }
    }
  }

  private buildHudModel(): HudModel {
    const stats = getEffectiveShipStats(this.save.player);
    const player = vec(this.save.player.position);
    const speed = vec(this.save.player.velocity).length();
    const nav = LOCATIONS[this.save.player.navTargetId];
    const target = this.getTargetRef();
    let hudTarget: HudModel['target'];
    let scanText: string | undefined;
    if (target) {
      const projection = this.renderer.projectToScreen(target.position);
      const distance = player.distanceTo(vec(target.position));
      if (target.kind === 'ship') {
        const ship = this.ships.find((entry) => entry.id === target.id)!;
        hudTarget = {
          kind: 'ship',
          name: ship.name,
          subtitle: `${ship.role.toUpperCase()} · ${ship.hostile ? 'HOSTILE' : FACTION_LABEL(ship.faction)}`,
          distance,
          shield: ship.shield,
          maxShield: ship.maxShield,
          armor: ship.armor,
          maxArmor: ship.maxArmor,
          hull: ship.hull,
          maxHull: ship.maxHull,
          screenX: projection.x,
          screenY: projection.y,
          onScreen: projection.visible && !projection.behind,
        };
      } else if (target.kind === 'asteroid') {
        const node = this.asteroids.find((entry) => entry.id === target.id)!;
        hudTarget = { kind: 'asteroid', name: target.name, subtitle: node.scanned ? `${node.richness > 1.8 ? 'RICH' : node.richness > 1.2 ? 'VIABLE' : 'LEAN'} ORE` : 'MINERAL SIGNATURE', distance, scanned: node.scanned, screenX: projection.x, screenY: projection.y, onScreen: projection.visible && !projection.behind };
        scanText = node.scanned ? `ORE ${node.richness.toFixed(2)} · ${Math.ceil(node.remaining)} units` : 'V / SCAN to analyze deposit';
      } else {
        const node = this.wreckNodes.find((entry) => entry.id === target.id)!;
        hudTarget = { kind: 'wreck', name: node.name, subtitle: node.scanned ? `${node.rarity.toUpperCase()} ${COMMODITIES[node.salvage].name}` : 'UNRESOLVED WRECK', distance, scanned: node.scanned, screenX: projection.x, screenY: projection.y, onScreen: projection.visible && !projection.behind };
        scanText = node.scanned ? `HAZARD ${Math.round(node.hazard * 100)} · ${Math.ceil(node.remaining)} recoveries` : 'V / SCAN to identify salvage';
      }
    }
    const dock = this.dockCandidate();
    const dockPrompt = dock
      ? `${vec(this.save.player.velocity).length() > 20 ? 'REDUCE SPEED' : 'G / ACT'} — ${LOCATIONS[dock].kind === 'planet' ? 'LAND' : 'DOCK'} ${LOCATIONS[dock].shortName}`
      : undefined;
    return {
      speed,
      maxSpeed: this.afterburning || (this.autopilot && speed > stats.afterburnSpeed) ? stats.afterburnSpeed : stats.maxSpeed,
      throttle: this.save.player.throttle,
      afterburner: this.afterburning,
      fuel: this.save.player.fuel,
      maxFuel: stats.fuel,
      shield: this.save.player.shield,
      maxShield: stats.shield,
      armor: this.save.player.armor,
      maxArmor: stats.armor,
      hull: this.save.player.hull,
      maxHull: stats.hull,
      missiles: this.save.player.missiles,
      cargo: cargoMass(this.save.player),
      cargoCapacity: cargoCapacity(this.save.player),
      credits: this.save.player.credits,
      mode: this.save.player.mode,
      shipName: SHIPS[this.save.player.shipId].name,
      navName: nav.shortName,
      navDistance: player.distanceTo(vec(nav.position)),
      autopilot: this.autopilot,
      zone: this.zoneLabel(this.getWorldZone(player)),
      target: hudTarget,
      prompt: dockPrompt,
      objective: this.objectiveText(),
      scanText,
      contacts: this.radarContacts(),
    };
  }

  private objectiveText(): string {
    const mission = [...this.save.activeMissions].sort((a, b) => a.deadline - b.deadline)[0];
    if (!mission) {
      if (this.save.player.mode === 'mining') return 'Reach the Shardbelt. Target and scan a deposit, then hold FIRE to extract.';
      if (this.save.player.mode === 'salvage') return 'Reach Mourning Line. Scan a wreck, then hold FIRE to recover it.';
      return 'Trade, accept a contract, or hunt pirates for open bounties.';
    }
    if (mission.kind === 'bounty') return `WARRANT: locate ${mission.targetName} near ${LOCATIONS[mission.targetZone!].shortName}.`;
    if (mission.kind === 'procurement') return `PROCURE ${mission.quantity} ${COMMODITIES[mission.commodity!].name} for ${LOCATIONS[mission.destination!].shortName}.`;
    return `DELIVER ${mission.title} to ${LOCATIONS[mission.destination!].shortName} · ${Math.ceil(mission.deadline - this.save.world.time)}s.`;
  }

  private radarContacts(): RadarContact[] {
    const contacts: RadarContact[] = [];
    const player = vec(this.save.player.position);
    const inverse = quat(this.save.player.rotation).invert();
    const range = this.save.player.equipment.includes('radar-mk2') ? 280 : 190;
    const add = (position: Vec3Tuple, type: RadarContact['type'], selected: boolean): void => {
      const relative = vec(position).sub(player).applyQuaternion(inverse);
      const distance = Math.hypot(relative.x, relative.z);
      if (distance > range * 1.45) return;
      const scale = Math.max(range, distance);
      contacts.push({ x: clamp(relative.x / scale, -1, 1), y: clamp(relative.z / scale, -1, 1), type, selected, altitude: relative.y });
    };
    for (const ship of this.ships) {
      if (ship.hull <= 0) continue;
      add(ship.position, ship.hostile ? 'hostile' : ship.role === 'patrol' ? 'friendly' : 'neutral', ship.id === this.save.player.currentTargetId);
    }
    for (const id of NAV_LOCATION_IDS) add(LOCATIONS[id].position, 'location', false);
    if (this.save.player.mode === 'mining') {
      for (const node of this.asteroids) if (node.scanned || node.id === this.save.player.currentTargetId) add(node.position, 'resource', node.id === this.save.player.currentTargetId);
    }
    if (this.save.player.mode === 'salvage') {
      for (const node of this.wreckNodes) if (node.scanned || node.id === this.save.player.currentTargetId) add(node.position, 'wreck', node.id === this.save.player.currentTargetId);
    }
    for (const pickup of this.pickups) if (pickup.life > 0) add(pickup.position, 'pickup', false);
    return contacts;
  }

  private zoneLabel(zone: WorldZone): string {
    if (zone === 'asteroid-field') return 'SHARDBELT / COLLISION HAZARD';
    if (zone === 'graveyard') return 'MOURNING LINE / RADIATION';
    if (zone === 'near-location') return 'CONTROLLED APPROACH';
    return 'OPEN SPACE';
  }
}

const FACTION_LABEL = (faction: FactionId): string => {
  switch (faction) {
    case 'concord':
      return 'CONCORD';
    case 'free-merchants':
      return 'FREE MERCHANTS';
    case 'frontier-miners':
      return 'FRONTIER MINERS';
    case 'salvage-union':
      return 'SALVAGE UNION';
    case 'red-talons':
      return 'RED TALONS';
  }
};
