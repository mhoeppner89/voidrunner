#!/usr/bin/env node

/*
 * Live-browser regression for the current weapon roster.
 *
 * This intentionally lives outside production. It uses the debug runtime
 * hooks, but fires and simulates through the same GameSession paths as play.
 */

import { spawn } from 'node:child_process';

let chromium;
try {
  ({ chromium } = await import('playwright'));
} catch {
  ({ chromium } = await import('/Users/mhoeppner/.codex/node_modules/playwright/index.mjs'));
}

const ROOT = '/Users/mhoeppner/Desktop/Voidrunner';
const BASE_URL = process.env.VOIDRUNNER_BASE_URL || 'http://127.0.0.1:4173/';
const SIM_STEP = 1 / 60;
const FLIGHT_SHOT = '/tmp/voidrunner-weapon-roster-flight.png';
const PDC_SHOT = '/tmp/voidrunner-weapon-roster-pdc.png';

const checks = [];
const consoleErrors = [];
const pageErrors = [];

function check(name, ok, detail) {
  checks.push({ name, ok: Boolean(ok), detail: detail || '' });
}

function format(value) {
  if (typeof value === 'string') return value;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

async function serverReady() {
  try {
    const response = await fetch(BASE_URL, { signal: AbortSignal.timeout(1000) });
    return response.ok;
  } catch {
    return false;
  }
}

async function ensureServer() {
  if (await serverReady()) return null;
  const port = new URL(BASE_URL).port || '4173';
  const child = spawn('python3', ['-m', 'http.server', port, '--bind', '127.0.0.1'], {
    cwd: ROOT,
    stdio: 'ignore',
  });
  for (let attempt = 0; attempt < 30; attempt += 1) {
    if (await serverReady()) return child;
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  child.kill();
  throw new Error('local server did not become ready at ' + BASE_URL);
}

function projectileData(projectiles, store) {
  const positions = [];
  const velocities = [];
  const damages = [];
  const kinds = [];
  for (const projectile of projectiles) {
    const base = projectile.slot * 3;
    positions.push([
      store.pos[base],
      store.pos[base + 1],
      store.pos[base + 2],
    ]);
    velocities.push([
      store.vel[base],
      store.vel[base + 1],
      store.vel[base + 2],
    ]);
    damages.push(projectile.damage);
    kinds.push(projectile.kind);
  }
  return { positions, velocities, damages, kinds };
}

let server = null;
let browser = null;

try {
  server = await ensureServer();
  browser = await chromium.launch({
    headless: true,
    args: [
      '--headless=new',
      '--disable-gpu',
      '--enable-unsafe-swiftshader',
      '--no-sandbox',
      '--disable-gpu-sandbox',
    ],
  });
  const context = await browser.newContext({
    viewport: { width: 1280, height: 720 },
    serviceWorkers: 'block',
  });
  const page = await context.newPage();
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  page.on('pageerror', (error) => pageErrors.push(String(error && error.stack ? error.stack : error)));

  const url = new URL(BASE_URL);
  url.searchParams.set('weapon-roster', String(Date.now()));
  await page.goto(url.href, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForFunction(() => Boolean(window.__VOID_PRIVATEER__), undefined, { timeout: 30000 });
  await page.evaluate(() => window.__VOID_PRIVATEER__.newGame());
  await page.waitForFunction(() => Boolean(window.__VOID_PRIVATEER__.getRuntime()), undefined, {
    timeout: 30000,
  });
  await page.evaluate(() => window.__VOID_PRIVATEER__.launch());
  await page.waitForFunction(
    () => Boolean(window.__VOID_PRIVATEER__.getRuntime() && !window.__VOID_PRIVATEER__.getRuntime().save.player.dockedAt),
    undefined,
    { timeout: 15000 },
  );
  // Freeze the live loop after entering flight so each scenario advances only
  // through explicit fixed-step calls below.
  await page.evaluate(() => {
    const runtime = window.__VOID_PRIVATEER__.getRuntime();
    if (runtime.frameId) cancelAnimationFrame(runtime.frameId);
    runtime.frameId = 0;
  });
  await page.waitForTimeout(250);
  await page.screenshot({ path: FLIGHT_SHOT });

  await page.evaluate(() => {
    const api = window.__VOID_PRIVATEER__;
    const runtime = api.getRuntime();
    const weaponItems = {
      pulse: 'pulse-cannon',
      gauss: 'gauss-cannon',
      pdc: 'pdc',
      ripper: 'ripper',
      ion: 'ion-blaster',
      mortar: 'mortar',
      'pulse-mk2': 'pulse-mk2',
    };
    const weaponSlots = {
      pulse: 0,
      gauss: 2,
      pdc: 1,
      ripper: 1,
      ion: 2,
      mortar: 2,
      'pulse-mk2': 2,
    };
    const ammoCapacity = { slugs: 48, shells: 36, cells: 60, pods: 10 };

    api.resetWeaponProbe = function resetWeaponProbe() {
      const player = runtime.save.player;
      player.dockedAt = undefined;
      player.mode = 'combat';
      player.position = [0, 0, 0];
      player.velocity = [0, 0, 0];
      player.rotation = [0, 0, 0, 1];
      player.throttle = 0;
      player.currentTargetId = undefined;
      runtime.autopilot = false;
      runtime.afterburning = false;
      runtime.hyperdriveFx = undefined;
      runtime.ships = [];
      runtime.projectiles.length = 0;
      runtime.gunCooldown = 0;
      runtime.pdcHeat = 0;
      runtime.pdcVentUntil = 0;
      runtime.pdcInterceptAt = 0;
      runtime.save.world.time = 0;
    };

    api.setProbeGun = function setProbeGun(weaponId) {
      const player = runtime.save.player;
      const loadout = player.outfitting.loadouts[player.shipId];
      if (!loadout || !Array.isArray(loadout.guns) || loadout.guns.length < 3) {
        throw new Error('Wayfarer test loadout is missing its three gun mounts');
      }
      loadout.guns[0] = null;
      loadout.guns[1] = null;
      loadout.guns[2] = null;
      const mountIndex = weaponSlots[weaponId];
      if (mountIndex === undefined) throw new Error('unknown probe weapon ' + weaponId);
      loadout.guns[mountIndex] = weaponItems[weaponId];
      if (!loadout.fireGroups) {
        loadout.fireGroups = { activeGroup: 'A', assignments: {} };
      }
      if (!loadout.fireGroups.assignments) loadout.fireGroups.assignments = {};
      const mountIds = [
        player.shipId + '-gun-0',
        player.shipId + '-gun-1',
        player.shipId + '-gun-2',
      ];
      for (const mountId of mountIds) loadout.fireGroups.assignments[mountId] = 'A';
      loadout.fireGroups.activeGroup = 'A';
      player.weaponId = weaponId;
      player.ammo = { slugs: ammoCapacity.slugs, shells: ammoCapacity.shells, cells: ammoCapacity.cells, pods: ammoCapacity.pods };
      runtime._statsDirty = true;
      player.energy = runtime.playerStats().energyCapacity;
      runtime.gunCooldown = 0;
      runtime.pdcHeat = 0;
      runtime.pdcVentUntil = 0;
      runtime.pdcInterceptAt = 0;
      runtime.syncWeaponProjection();
      runtime._statsDirty = true;
    };

    api.makeProbeShip = function makeProbeShip(id, z, x) {
      return {
        id,
        name: id,
        variant: 'kestrel',
        faction: 'red-talons',
        hostile: true,
        role: 'pirate',
        position: [x || 0, 0, z],
        velocity: [0, 0, 0],
        rotation: [0, 0, 0, 1],
        hull: 100,
        maxHull: 100,
        shield: 0,
        maxShield: 0,
        armor: 0,
        maxArmor: 0,
        lifetime: 0,
        fireCooldown: 9999,
        missileCooldown: 9999,
        shieldDelay: 0,
        holdFire: true,
        speed: 0,
        afterburnSpeed: 0,
        turnRate: 0,
        aiRng: () => 0.5,
        pilot: {
          aim: 1,
          tier: 'veteran',
          temperament: 'cautious',
          job: 'pirate',
        },
      };
    };
  });

  const registry = await page.evaluate(async () => {
    const weapons = await import('/src/game/weapons.js');
    return {
      ids: Object.keys(weapons.WEAPONS),
      order: weapons.WEAPON_ORDER.slice(),
      slots: weapons.WEAPON_ORDER.map((id) => weapons.WEAPONS[id].slot),
      cooldowns: [...new Set(weapons.WEAPON_ORDER.map((id) => weapons.WEAPONS[id].cooldown))],
      expected: {
        pulse: {
          speed: weapons.WEAPONS.pulse.speed,
          damageMul: weapons.WEAPONS.pulse.damageMul,
          ammoId: weapons.WEAPONS.pulse.ammoId,
        },
        gauss: {
          speed: weapons.WEAPONS.gauss.speed,
          damageMul: weapons.WEAPONS.gauss.damageMul,
          ammoId: weapons.WEAPONS.gauss.ammoId,
          pierce: weapons.WEAPONS.gauss.pierce,
        },
        pdc: {
          speed: weapons.WEAPONS.pdc.speed,
          ammoId: weapons.WEAPONS.pdc.ammoId,
          heatSeconds: 3.5,
        },
        ripper: {
          pellets: weapons.WEAPONS.ripper.pellets,
          spreadRad: weapons.WEAPONS.ripper.spreadRad,
          ammoId: weapons.WEAPONS.ripper.ammoId,
        },
        ion: {
          shieldMul: weapons.WEAPONS.ion.shieldMul,
          jamSeconds: weapons.WEAPONS.ion.jamSeconds,
          ammoId: weapons.WEAPONS.ion.ammoId,
        },
        mortar: {
          splashRadius: weapons.WEAPONS.mortar.splashRadius,
          damageFlat: weapons.WEAPONS.mortar.damageFlat,
          burnDps: weapons.WEAPONS.mortar.burnDps,
          ammoId: weapons.WEAPONS.mortar.ammoId,
        },
      },
    };
  });
  check(
    'weapon registry exposes all seven current weapons in slot order',
    registry.ids.length === 7 &&
      registry.order.join(',') === 'pulse,gauss,pdc,ripper,ion,mortar,pulse-mk2' &&
      registry.slots.join(',') === '1,2,3,4,5,6,7',
    registry,
  );
  check(
    'weapon registry has distinct cadence and mounted-special metadata',
    registry.cooldowns.length >= 6 &&
      registry.expected.gauss.pierce === 1 &&
      registry.expected.ripper.pellets === 7 &&
      registry.expected.ion.shieldMul === 4 &&
      registry.expected.mortar.splashRadius === 26 &&
      registry.expected.pdc.heatSeconds === 3.5,
    registry.expected,
  );

  const shots = await page.evaluate(() => {
    const api = window.__VOID_PRIVATEER__;
    const runtime = api.getRuntime();
    const weaponIds = ['pulse', 'gauss', 'pdc', 'ripper', 'ion', 'mortar', 'pulse-mk2'];
    const result = {};
    for (const weaponId of weaponIds) {
      api.resetWeaponProbe();
      api.setProbeGun(weaponId);
      const beforeAmmo = { ...runtime.save.player.ammo };
      const beforeEnergy = runtime.save.player.energy;
      runtime.firePlayerGuns();
      const data = [];
      for (const projectile of runtime.projectiles) {
        const base = projectile.slot * 3;
        const vx = runtime.projStore.vel[base];
        const vy = runtime.projStore.vel[base + 1];
        const vz = runtime.projStore.vel[base + 2];
        data.push({
          kind: projectile.kind,
          damage: projectile.damage,
          speed: Math.hypot(vx, vy, vz),
          angle: Math.atan2(Math.hypot(vx, vy), Math.max(1, -vz)),
        });
      }
      const afterAmmo = { ...runtime.save.player.ammo };
      result[weaponId] = {
        count: data.length,
        data,
        ammoSpent: {
          slugs: beforeAmmo.slugs - afterAmmo.slugs,
          shells: beforeAmmo.shells - afterAmmo.shells,
          cells: beforeAmmo.cells - afterAmmo.cells,
          pods: beforeAmmo.pods - afterAmmo.pods,
        },
        energySpent: beforeEnergy - runtime.save.player.energy,
      };
    }
    return result;
  });
  check(
    'pulse emits one fast laser with no ammo cost',
    shots.pulse.count === 1 &&
      shots.pulse.data[0].kind === 'laser' &&
      Math.abs(shots.pulse.data[0].speed - 205) < 1 &&
      Object.values(shots.pulse.ammoSpent).every((value) => value === 0),
    shots.pulse,
  );
  check(
    'gauss emits one high-speed penetrating slug and spends one slug',
    shots.gauss.count === 1 &&
      shots.gauss.data[0].kind === 'gauss' &&
      Math.abs(shots.gauss.data[0].speed - 620) < 1 &&
      shots.gauss.ammoSpent.slugs === 1,
    shots.gauss,
  );
  check(
    'PDC emits one spread projectile with no ammo cost',
    shots.pdc.count === 1 &&
      shots.pdc.data[0].kind === 'pdc' &&
      Math.abs(shots.pdc.data[0].speed - 170) < 2 &&
      Object.values(shots.pdc.ammoSpent).every((value) => value === 0),
    shots.pdc,
  );
  const ripperAngles = shots.ripper.data.map((item) => item.angle);
  check(
    'ripper emits seven pellets with real spread and spends one shell',
    shots.ripper.count === 7 &&
      shots.ripper.data.every((item) => item.kind === 'ripper' && item.speed >= 130 && item.speed <= 200) &&
      ripperAngles.some((angle) => angle > 0.002) &&
      Math.max(...ripperAngles) <= 0.14 &&
      shots.ripper.ammoSpent.shells === 1,
    shots.ripper,
  );
  check(
    'ion emits one shield-disrupting bolt and spends one cell',
    shots.ion.count === 1 &&
      shots.ion.data[0].kind === 'ion' &&
      Math.abs(shots.ion.data[0].speed - 240) < 2 &&
      shots.ion.ammoSpent.cells === 1,
    shots.ion,
  );
  check(
    'mortar emits one slow shell with fixed damage and spends one pod',
    shots.mortar.count === 1 &&
      shots.mortar.data[0].kind === 'mortar' &&
      Math.abs(shots.mortar.data[0].speed - 85) < 2 &&
      shots.mortar.data[0].damage === 30 &&
      shots.mortar.ammoSpent.pods === 1,
    shots.mortar,
  );
  check(
    'pulse Mk II remains mountable in the roster',
    shots['pulse-mk2'].count === 1 &&
      shots['pulse-mk2'].data[0].kind === 'laser' &&
      Math.abs(shots['pulse-mk2'].data[0].speed - 218) < 1,
    shots['pulse-mk2'],
  );

  const penetration = await page.evaluate(() => {
    const api = window.__VOID_PRIVATEER__;
    const runtime = api.getRuntime();
    api.resetWeaponProbe();
    api.setProbeGun('gauss');
    runtime.ships = [
      api.makeProbeShip('gauss-front', -40, 0),
      api.makeProbeShip('gauss-rear', -90, 0),
    ];
    runtime.firePlayerGuns();
    for (let step = 0; step < 18; step += 1) runtime.updateSimulation(1 / 60, {});
    return {
      frontHull: runtime.ships[0].hull,
      rearHull: runtime.ships[1].hull,
      remainingProjectiles: runtime.projectiles.length,
    };
  });
  check(
    'gauss penetrates the first ship and damages the ship behind it',
    penetration.frontHull < 100 &&
      penetration.rearHull < 100 &&
      penetration.remainingProjectiles === 0,
    penetration,
  );

  const pdcInterception = await page.evaluate(() => {
    const api = window.__VOID_PRIVATEER__;
    const runtime = api.getRuntime();
    api.resetWeaponProbe();
    api.setProbeGun('pdc');
    const missileSlot = runtime.projStore.alloc();
    runtime.projStore.setPos(missileSlot, 0, 0, -30);
    runtime.projStore.setVel(missileSlot, 0, 0, 120);
    runtime.projectiles.push({
      slot: missileSlot,
      id: 'probe-missile',
      kind: 'missile',
      damage: 20,
      life: 3,
      ownerId: 'red-talon-probe',
      faction: 'red-talons',
    });
    for (let step = 0; step < 12; step += 1) runtime.updateSimulation(1 / 60, {});
    const missile = runtime.projectiles.find((projectile) => projectile.id === 'probe-missile');
    const missileBase = missile ? missile.slot * 3 : 0;
    return {
      missileAlive: runtime.projectiles.some((projectile) => projectile.id === 'probe-missile'),
      pdcHeat: runtime.pdcHeat,
      interceptAt: runtime.pdcInterceptAt,
      playerPosition: runtime.save.player.position,
      missilePosition: missile ? [
        runtime.projStore.pos[missileBase],
        runtime.projStore.pos[missileBase + 1],
        runtime.projStore.pos[missileBase + 2],
      ] : null,
      mountedGuns: runtime.save.player.outfitting.loadouts[runtime.save.player.shipId].guns,
    };
  });
  check(
    'PDC automatically intercepts an incoming missile',
    pdcInterception.missileAlive === false && pdcInterception.interceptAt > 0,
    pdcInterception,
  );

  const pdcVent = await page.evaluate(() => {
    const api = window.__VOID_PRIVATEER__;
    const runtime = api.getRuntime();
    api.resetWeaponProbe();
    api.setProbeGun('pdc');
    runtime.pdcHeat = 3.45;
    let venting = false;
    for (let step = 0; step < 20; step += 1) {
      runtime.updateSimulation(1 / 60, { fire: true });
      if (runtime.pdcVentUntil > runtime.save.world.time) {
        venting = true;
        break;
      }
    }
    const projectilesBefore = runtime.projectiles.length;
    runtime.updateSimulation(1 / 60, { fire: true });
    return {
      venting,
      blockedWhileVenting: runtime.projectiles.length === projectilesBefore,
      pdcHeat: runtime.pdcHeat,
      ventUntil: runtime.pdcVentUntil,
      worldTime: runtime.save.world.time,
    };
  });
  check(
    'PDC enters a timed heat-vent state and blocks fire during venting',
    pdcVent.venting && pdcVent.blockedWhileVenting && pdcVent.ventUntil > pdcVent.worldTime,
    pdcVent,
  );

  const ionEffect = await page.evaluate(() => {
    const api = window.__VOID_PRIVATEER__;
    const runtime = api.getRuntime();
    api.resetWeaponProbe();
    api.setProbeGun('ion');
    const target = api.makeProbeShip('ion-target', -30, 0);
    target.shield = 100;
    target.maxShield = 100;
    target.fireCooldown = 0;
    runtime.ships = [target];
    const baseGunDamage = runtime.playerStats().gunDamage;
    runtime.firePlayerGuns();
    for (let step = 0; step < 12; step += 1) runtime.updateSimulation(1 / 60, {});
    return {
      shield: target.shield,
      hull: target.hull,
      jam: target.fireCooldown,
      shieldDelta: 100 - target.shield,
      expectedShieldSoak: baseGunDamage * 0.5 * 4,
      cells: runtime.save.player.ammo.cells,
    };
  });
  check(
    'ion applies its four-times shield multiplier, leaves hull intact, and jams fire',
    ionEffect.shieldDelta > 0 &&
      Math.abs(ionEffect.shieldDelta - ionEffect.expectedShieldSoak) < 0.01 &&
      ionEffect.hull === 100 &&
      ionEffect.jam > 1.4 &&
      ionEffect.cells === 59,
    ionEffect,
  );

  const mortarEffect = await page.evaluate(() => {
    const api = window.__VOID_PRIVATEER__;
    const runtime = api.getRuntime();
    api.resetWeaponProbe();
    api.setProbeGun('mortar');
    const direct = api.makeProbeShip('mortar-direct', -20, 0);
    const splash = api.makeProbeShip('mortar-splash', -26, 14);
    runtime.ships = [direct, splash];
    runtime.firePlayerGuns();
    for (let step = 0; step < 42; step += 1) runtime.updateSimulation(1 / 60, {});
    const hullAtImpact = [direct.hull, splash.hull];
    const burnAtImpact = [direct.burn ? direct.burn.until : 0, splash.burn ? splash.burn.until : 0];
    for (let step = 0; step < 90; step += 1) runtime.updateSimulation(1 / 60, {});
    return {
      directHull: direct.hull,
      splashHull: splash.hull,
      hullAtImpact,
      burnAtImpact,
      directBurnDps: direct.burn ? direct.burn.dps : 0,
      splashBurnDps: splash.burn ? splash.burn.dps : 0,
      pods: runtime.save.player.ammo.pods,
    };
  });
  check(
    'mortar applies direct and splash damage, then burns both nearby ships',
    mortarEffect.hullAtImpact[0] < 100 &&
      mortarEffect.hullAtImpact[1] < 100 &&
      mortarEffect.burnAtImpact[0] > 0 &&
      mortarEffect.burnAtImpact[1] > 0 &&
      mortarEffect.directHull < mortarEffect.hullAtImpact[0] &&
      mortarEffect.splashHull < mortarEffect.hullAtImpact[1] &&
      mortarEffect.pods === 9,
    mortarEffect,
  );

  const switching = await page.evaluate(() => {
    const api = window.__VOID_PRIVATEER__;
    const runtime = api.getRuntime();
    const player = runtime.save.player;
    api.resetWeaponProbe();
    const loadout = player.outfitting.loadouts[player.shipId];
    loadout.guns[0] = 'pulse-cannon';
    loadout.guns[1] = 'gauss-cannon';
    loadout.guns[2] = 'pdc-cluster';
    const mountIds = [
      player.shipId + '-gun-0',
      player.shipId + '-gun-1',
      player.shipId + '-gun-2',
    ];
    loadout.fireGroups.assignments[mountIds[0]] = 'A';
    loadout.fireGroups.assignments[mountIds[1]] = 'B';
    loadout.fireGroups.assignments[mountIds[2]] = 'B';
    loadout.fireGroups.activeGroup = 'A';
    runtime.syncWeaponProjection();
    const before = { weaponId: player.weaponId, group: loadout.fireGroups.activeGroup };
    runtime.handleActions({ weaponSelect: 'B' });
    const toGroupB = { weaponId: player.weaponId, group: loadout.fireGroups.activeGroup };
    runtime.handleActions({ weaponCycle: true });
    const cycledBack = { weaponId: player.weaponId, group: loadout.fireGroups.activeGroup };
    runtime.handleActions({ weaponSelect: 3 });
    const numericPdc = { weaponId: player.weaponId, group: loadout.fireGroups.activeGroup };
    loadout.fireGroups.activeGroup = 'A';
    loadout.fireGroups.assignments[mountIds[1]] = 'A';
    loadout.fireGroups.assignments[mountIds[2]] = 'A';
    runtime.syncWeaponProjection();
    const statusBeforeEmpty = runtime.ownMonitorStatus;
    runtime.handleActions({ weaponSelect: 'B' });
    const emptyGroup = {
      weaponId: player.weaponId,
      group: loadout.fireGroups.activeGroup,
      status: runtime.ownMonitorStatus,
      statusBeforeEmpty,
    };
    return { before, toGroupB, cycledBack, numericPdc, emptyGroup };
  });
  check(
    'fire groups switch, cycle, numeric weapon selection, and reject an empty group',
    switching.before.weaponId === 'pulse' &&
      switching.before.group === 'A' &&
      switching.toGroupB.weaponId === 'gauss' &&
      switching.toGroupB.group === 'B' &&
      switching.cycledBack.weaponId === 'pulse' &&
      switching.cycledBack.group === 'A' &&
      switching.numericPdc.weaponId === 'pdc' &&
      switching.numericPdc.group === 'B' &&
      switching.emptyGroup.group === 'A' &&
      switching.emptyGroup.status === 'FIRE GROUP EMPTY' || switching.emptyGroup.status === 'FEUERGRUPPE LEER',
    switching,
  );

  const saveRoundTrip = await page.evaluate(async () => {
    const api = window.__VOID_PRIVATEER__;
    const runtime = api.getRuntime();
    const { saveGame, hydrateSave } = await import('/src/game/save.js');
    api.resetWeaponProbe();
    api.setProbeGun('gauss');
    runtime.save.player.ammo = { slugs: 17, shells: 9, cells: 23, pods: 4 };
    runtime.save.player.prevPosition = [111, 222, 333];
    const saved = saveGame(runtime.save);
    let key = null;
    for (const candidate of Object.keys(localStorage)) {
      try {
        const parsed = JSON.parse(localStorage.getItem(candidate));
        if (parsed && parsed.player && parsed.player.ammo && parsed.player.ammo.slugs === 17) {
          key = candidate;
          break;
        }
      } catch {
        // Other app storage entries are not save payloads.
      }
    }
    const restored = key ? hydrateSave(JSON.parse(localStorage.getItem(key))) : null;
    return {
      saved,
      keyFound: Boolean(key),
      ammo: restored && restored.player.ammo,
      weaponId: restored && restored.player.weaponId,
      prevPosition: restored && restored.player.prevPosition,
    };
  });
  check(
    'save round-trip preserves ammo and selected weapon while omitting render-only history',
    saveRoundTrip.saved === true &&
      saveRoundTrip.keyFound &&
      saveRoundTrip.ammo.slugs === 17 &&
      saveRoundTrip.ammo.shells === 9 &&
      saveRoundTrip.ammo.cells === 23 &&
      saveRoundTrip.ammo.pods === 4 &&
      saveRoundTrip.weaponId === 'gauss' &&
      saveRoundTrip.prevPosition === undefined,
    saveRoundTrip,
  );

  await page.evaluate(() => {
    const api = window.__VOID_PRIVATEER__;
    const runtime = api.getRuntime();
    api.setProbeGun('pdc');
    runtime.ui.updateHud(runtime.buildHudModel());
    runtime.syncRender(0, performance.now());
  });
  await page.waitForTimeout(120);
  await page.screenshot({ path: PDC_SHOT });
  check('live browser reports no console or page errors', consoleErrors.length === 0 && pageErrors.length === 0, {
    consoleErrors,
    pageErrors,
  });
} catch (error) {
  check('probe completed without a harness error', false, error && error.stack ? error.stack : String(error));
} finally {
  if (browser) await browser.close();
  if (server) server.kill();
}

const passed = checks.filter((item) => item.ok).length;
const failed = checks.length - passed;
for (const item of checks) {
  console.log((item.ok ? 'PASS ' : 'FAIL ') + item.name + (item.detail ? ' :: ' + format(item.detail) : ''));
}
console.log('SCREENSHOTS ' + FLIGHT_SHOT + ' ' + PDC_SHOT);
console.log('RESULT ' + passed + '/' + checks.length + ' passed, ' + failed + ' failed');
if (consoleErrors.length || pageErrors.length) {
  console.log('CONSOLE_ERRORS ' + format({ consoleErrors, pageErrors }));
}
process.exitCode = failed ? 1 : 0;
