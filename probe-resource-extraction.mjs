import { chromium } from '/Users/mhoeppner/.codex/node_modules/playwright/index.mjs';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';

const baseUrl = process.env.VR_BASE_URL ?? 'http://127.0.0.1:4173/';
const appUrl = new URL('?resource-extraction=1', baseUrl).href;
const chromePath = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const screenshotMining = '/private/tmp/voidrunner-resource-extraction-mining.png';
const screenshotSalvage = '/private/tmp/voidrunner-resource-extraction-salvage.png';

const pass = [];
const failures = [];
const consoleErrors = [];
const server = process.env.VR_BASE_URL
  ? null
  : spawn('python3', ['-m', 'http.server', '4173'], {
      cwd: process.cwd(),
      stdio: 'ignore',
    });

const check = (name, condition, detail = '') => {
  if (condition) {
    pass.push(name);
    console.log(`PASS ${name}`);
  } else {
    const message = detail ? `${name}: ${detail}` : name;
    failures.push(message);
    console.error(`FAIL ${message}`);
  }
};

const actions = (overrides = {}) => ({
  throttleDelta: 0,
  pitch: 0,
  yaw: 0,
  roll: 0,
  throttleSet: 0,
  afterburner: false,
  fire: false,
  utility: false,
  missile: false,
  targetNext: false,
  targetNearestHostile: false,
  cycleMode: false,
  navNext: false,
  autopilot: false,
  scan: false,
  pause: false,
  map: false,
  capture: false,
  jettison: false,
  transponder: false,
  weaponCycle: false,
  weaponSelect: undefined,
  ...overrides,
});

const main = async () => {
  if (!existsSync(chromePath)) throw new Error(`Chrome not found at ${chromePath}`);
  const browser = await chromium.launch({
    headless: true,
    executablePath: chromePath,
    args: [
      '--headless=new',
      '--disable-gpu',
      '--enable-unsafe-swiftshader',
      '--no-sandbox',
      '--disable-gpu-sandbox',
      '--use-gl=angle',
      '--use-angle=swiftshader',
    ],
  });
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const page = await context.newPage();
  page.on('pageerror', (error) => consoleErrors.push(`pageerror: ${error.message}`));
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(`console: ${message.text()}`);
  });

  const stopSession = async () => page.evaluate(() => {
    const runtime = window.__VOID_PRIVATEER__?.getRuntime?.();
    if (!runtime) return false;
    cancelAnimationFrame(runtime.frameId);
    runtime.active = false;
    runtime.simAccumulator = 0;
    return true;
  });

  const waitForArena = async (instanceId) => {
    await page.waitForFunction((expected) => {
      const runtime = window.__VOID_PRIVATEER__?.getRuntime?.();
      return Boolean(runtime?.renderer && runtime?.active && runtime?.activeInstanceId === expected);
    }, instanceId, { timeout: 60000 });
    await page.waitForTimeout(500);
    await stopSession();
  };

  const step = async (frames, override = {}) => page.evaluate(({ count, override: next }) => {
    const runtime = window.__VOID_PRIVATEER__?.getRuntime?.();
    if (!runtime) throw new Error('runtime unavailable');
    const input = {
      throttleDelta: 0,
      pitch: 0,
      yaw: 0,
      roll: 0,
      throttleSet: 0,
      afterburner: false,
      fire: false,
      utility: false,
      missile: false,
      targetNext: false,
      targetNearestHostile: false,
      cycleMode: false,
      navNext: false,
      autopilot: false,
      scan: false,
      pause: false,
      map: false,
      capture: false,
      jettison: false,
      transponder: false,
      weaponCycle: false,
      weaponSelect: undefined,
      ...next,
    };
    for (let index = 0; index < count; index += 1) runtime.updateSimulation(1 / 60, input);
    runtime.syncRender(0, performance.now());
    const lockedTarget = runtime.getTargetRef?.(false);
    return {
      utilityActive: runtime.utilityActive,
      utilityReadout: runtime.utilityReadout,
      target: lockedTarget ? { kind: lockedTarget.kind, id: lockedTarget.id } : null,
      cargo: { ...runtime.save.player.cargo },
      stats: { ...runtime.save.player.stats },
    };
  }, { count: frames, override });

  const configureMining = async () => page.evaluate(() => {
    const runtime = window.__VOID_PRIVATEER__.getRuntime();
    const player = runtime.save.player;
    const target = runtime.asteroids.find((node) => node.remaining > 0);
    const blocker = runtime.asteroids.find((node) => node !== target && node.remaining > 0);
    if (!target || !blocker) throw new Error('asteroid fixtures unavailable');
    const [px, py, pz] = player.position;
    for (const node of runtime.asteroids) {
      node.remaining = 0;
      node.scale = [0.0001, 0.0001, 0.0001];
      node._collisionMesh = undefined;
    }
    target.remaining = 4;
    target.scanned = false;
    target.radius = 5;
    target.scale = [1, 1, 1];
    target.position = [px, py, pz - 90];
    target.rotation = [0, 0, 0];
    target._collisionMesh = undefined;
    blocker.remaining = 3;
    blocker.radius = 6;
    blocker.scale = [1, 1, 1];
    blocker.position = [px, py, pz - 45];
    blocker.rotation = [0, 0, 0];
    blocker._collisionMesh = undefined;
    runtime.save.player.cargo = {};
    runtime.save.player.mode = 'mining';
    runtime.extractionCarry?.clear?.();
    runtime.scanCooldown = 0;
    runtime.renderer.updateAsteroidInstances();
    runtime.obstacleGridBuiltAt = -Infinity;
    runtime.selectTarget('asteroid', target.id);
    return {
      targetId: target.id,
      blockerId: blocker.id,
      scanRange: runtime.playerStats().scanRange,
      miningRange: runtime.playerStats().miningRange,
      playerPosition: [...player.position],
    };
  });

  const placeMiningTarget = async (position) => page.evaluate((nextPosition) => {
    const runtime = window.__VOID_PRIVATEER__.getRuntime();
    const target = runtime.asteroids.find((node) => node.id === runtime.save.player.currentTargetId);
    if (!target) throw new Error('mining target unavailable');
    target.position = nextPosition;
    target._collisionMesh = undefined;
    runtime.renderer.updateAsteroidInstances();
    runtime.obstacleGridBuiltAt = -Infinity;
    runtime.scanCooldown = 0;
    return [...target.position];
  }, position);

  const configureSalvage = async () => page.evaluate(() => {
    const runtime = window.__VOID_PRIVATEER__.getRuntime();
    const player = runtime.save.player;
    const target = runtime.wreckNodes.find((node) => node.remaining > 0);
    const blocker = runtime.wreckNodes.find((node) => node !== target && node.remaining > 0);
    if (!target || !blocker) throw new Error('wreck fixtures unavailable');
    const [px, py, pz] = player.position;
    for (const node of runtime.wreckNodes) {
      node.remaining = 0;
      node.scanned = true;
      node._collisionMesh = undefined;
    }
    target.remaining = 4;
    target.scanned = false;
    target.radius = 5;
    target.salvage = 'scrap';
    target.position = [px, py, pz - 90];
    target.rotation = [0, 0, 0];
    target._collisionMesh = undefined;
    blocker.remaining = 3;
    blocker.scanned = true;
    blocker.radius = 5;
    blocker.salvage = 'scrap';
    blocker.position = [px, py, pz - 45];
    blocker.rotation = [0, 0, 0];
    blocker._collisionMesh = undefined;
    runtime.save.player.cargo = {};
    runtime.save.player.mode = 'salvage';
    runtime.extractionCarry?.clear?.();
    runtime.scanCooldown = 0;
    runtime.renderer.updateWreckNodeInstances(1 / 60);
    runtime.obstacleGridBuiltAt = -Infinity;
    runtime.selectTarget('wreck', target.id);
    return {
      targetId: target.id,
      blockerId: blocker.id,
      scanRange: runtime.playerStats().scanRange,
      salvageRange: runtime.playerStats().salvageRange,
      playerPosition: [...player.position],
    };
  });

  const placeSalvageTarget = async (position) => page.evaluate((nextPosition) => {
    const runtime = window.__VOID_PRIVATEER__.getRuntime();
    const target = runtime.wreckNodes.find((node) => node.id === runtime.save.player.currentTargetId);
    if (!target) throw new Error('salvage target unavailable');
    target.position = nextPosition;
    target._collisionMesh = undefined;
    runtime.renderer.updateWreckNodeInstances(1 / 60);
    runtime.obstacleGridBuiltAt = -Infinity;
    runtime.scanCooldown = 0;
    return [...target.position];
  }, position);

  try {
    await page.goto(appUrl, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => Boolean(window.__VOID_PRIVATEER__?.startArena), undefined, { timeout: 60000 });
    await page.waitForTimeout(800);
    check('browser boot exposes the arena hook', await page.evaluate(() => Boolean(window.__VOID_PRIVATEER__?.startArena)));

    await page.evaluate(() => window.__VOID_PRIVATEER__.startArena('asteroid-field', 'free-flight', 'rookie'));
    await waitForArena('shardbelt');
    const mining = await configureMining();
    const scanDistance = mining.scanRange + 25;
    const [px, py, pz] = mining.playerPosition;

    await placeMiningTarget([px, py, pz - scanDistance]);
    await page.evaluate(() => window.__VOID_PRIVATEER__.getRuntime().autoScanTarget());
    check('mining target stays unscanned outside scan range', await page.evaluate(() => {
      const runtime = window.__VOID_PRIVATEER__.getRuntime();
      return !runtime.asteroids.find((node) => node.id === runtime.save.player.currentTargetId)?.scanned;
    }));

    await placeMiningTarget([px, py, pz - 90]);
    await page.evaluate(() => window.__VOID_PRIVATEER__.getRuntime().autoScanTarget());
    check('mining target auto-scans inside scan range', await page.evaluate(() => {
      const runtime = window.__VOID_PRIVATEER__.getRuntime();
      return runtime.asteroids.find((node) => node.id === runtime.save.player.currentTargetId)?.scanned === true;
    }));

    const noTargetBefore = await page.evaluate(() => {
      const runtime = window.__VOID_PRIVATEER__.getRuntime();
      const target = runtime.asteroids.find((node) => node.id === runtime.save.player.currentTargetId);
      runtime.clearTarget();
      runtime.updateUtilityTool(1, true);
      return { remaining: target.remaining, utilityActive: runtime.utilityActive };
    });
    check('mining requires a target', noTargetBefore.remaining === 4 && !noTargetBefore.utilityActive);

    await page.evaluate(() => {
      const runtime = window.__VOID_PRIVATEER__.getRuntime();
      const target = runtime.asteroids.find((node) => node.remaining > 0);
      runtime.selectTarget('asteroid', target.id);
      target.scanned = true;
      runtime.save.player.mode = 'combat';
      runtime.updateUtilityTool(1, true);
    });
    check('mining requires mining mode', await page.evaluate(() => {
      const runtime = window.__VOID_PRIVATEER__.getRuntime();
      const target = runtime.asteroids.find((node) => node.id === runtime.save.player.currentTargetId);
      return target.remaining === 4 && !runtime.utilityActive;
    }));

    const obstruction = await page.evaluate(() => {
      const runtime = window.__VOID_PRIVATEER__.getRuntime();
      const target = runtime.asteroids.find((node) => node.remaining > 0);
      const blocker = runtime.asteroids.find((node) => node !== target && node.remaining > 0);
      const [px, py, pz] = runtime.save.player.position;
      target.position = [px, py, pz - 90];
      blocker.position = [px, py, pz - 45];
      target.scanned = true;
      runtime.renderer.updateAsteroidInstances();
      runtime.obstacleGridBuiltAt = -Infinity;
      runtime.save.player.mode = 'mining';
      runtime.selectTarget('asteroid', target.id);
      runtime.updateUtilityTool(1, true);
      return { utilityActive: runtime.utilityActive, readout: runtime.utilityReadout };
    });
    check('mining beam is blocked by an intervening asteroid', !obstruction.utilityActive && /BLOCK|OBSTRUCT/i.test(obstruction.readout));

    const miningBefore = await page.evaluate(() => {
      const runtime = window.__VOID_PRIVATEER__.getRuntime();
      const target = runtime.asteroids.find((node) => node.remaining > 0);
      const blocker = runtime.asteroids.find((node) => node !== target && node.remaining > 0);
      blocker.remaining = 0;
      blocker.scale = [0.0001, 0.0001, 0.0001];
      blocker.position = [runtime.save.player.position[0] + 40, runtime.save.player.position[1], runtime.save.player.position[2] - 45];
      blocker._collisionMesh = undefined;
      target.remaining = 4;
      target.scanned = true;
      runtime.save.player.cargo = {};
      runtime.save.player.mode = 'mining';
      runtime.extractionCarry?.clear?.();
      runtime.renderer.updateAsteroidInstances();
      runtime.obstacleGridBuiltAt = -Infinity;
      runtime.selectTarget('asteroid', target.id);
      const start = { x: runtime.save.player.position[0], y: runtime.save.player.position[1], z: runtime.save.player.position[2] };
      const end = { x: target.position[0], y: target.position[1], z: target.position[2] };
      const hit = runtime.firstObstacleHitInfo(start, end, target.id);
      return {
        id: target.id,
        remaining: target.remaining,
        mined: runtime.save.player.stats.mined,
        guild: runtime.save.player.guildRep?.mining ?? 0,
        hit: hit?.obstacle?.id ?? null,
        blockerScale: [...blocker.scale],
        blockerRadius: hit?.obstacle?.radius ?? null,
        blockerLosRadius: hit?.obstacle?.losRadius ?? null,
      };
    });
    const miningYield = await step(120, { utility: true });
    check('mining extraction activates a clear beam', miningYield.utilityActive, miningYield.utilityReadout);
    check('mining yields an integer unit', miningYield.cargo.ore === 1 && Number.isInteger(miningYield.cargo.ore));
    const miningAfter = await page.evaluate((id) => {
      const runtime = window.__VOID_PRIVATEER__.getRuntime();
      const target = runtime.asteroids.find((node) => node.id === id);
      return {
        remaining: target.remaining,
        mined: runtime.save.player.stats.mined,
        guild: runtime.save.player.guildRep?.mining ?? 0,
      };
    }, miningBefore.id);
    check('mining updates deposit, stats, and guild progress',
      miningAfter.remaining === 3
      && miningAfter.mined === miningBefore.mined + 1
      && miningAfter.guild === miningBefore.guild + 1,
      JSON.stringify({ miningBefore, miningAfter }));
    check('mining render text remains available', await page.evaluate(() => typeof window.render_game_to_text?.() === 'string'));
    await page.screenshot({ path: screenshotMining });
    console.log(`SCREENSHOT mining ${screenshotMining}`);

    const miningFull = await page.evaluate(() => {
      const runtime = window.__VOID_PRIVATEER__.getRuntime();
      const target = runtime.asteroids.find((node) => node.remaining > 0);
      const capacity = runtime.playerStats().cargo;
      runtime.save.player.cargo = { ore: Math.ceil(capacity / 2.5) };
      target.remaining = 3;
      target.scanned = true;
      runtime.save.player.mode = 'mining';
      runtime.selectTarget('asteroid', target.id);
      runtime.updateUtilityTool(1, true);
      return { remaining: target.remaining, readout: runtime.utilityReadout };
    });
    check('mining refuses extraction when cargo is full', miningFull.remaining === 3 && /FULL|VOLL/i.test(miningFull.readout), miningFull.readout);

    const miningDepletion = await page.evaluate(() => {
      const runtime = window.__VOID_PRIVATEER__.getRuntime();
      const target = runtime.asteroids.find((node) => node.remaining > 0);
      const id = target.id;
      runtime.save.player.cargo = {};
      target.remaining = 1;
      target.scanned = true;
      runtime.save.player.mode = 'mining';
      runtime.extractionCarry?.clear?.();
      runtime.renderer.updateAsteroidInstances();
      runtime.obstacleGridBuiltAt = -Infinity;
      runtime.selectTarget('asteroid', id);
      return id;
    });
    await step(140, { utility: true });
    const miningDepletedState = await page.evaluate((id) => {
      const runtime = window.__VOID_PRIVATEER__.getRuntime();
      return {
        remaining: runtime.asteroids.find((node) => node.id === id)?.remaining,
        savedRemaining: runtime.save.world.depletedAsteroids?.[id],
        stillTargeted: runtime.save.player.currentTargetId === id,
        obstaclePresent: runtime.activeFieldObstacles('shardbelt').some((obstacle) => obstacle.id === id),
      };
    }, miningDepletion);
    check('depleted asteroid loses its deposit lock but remains physical cover',
      miningDepletedState.remaining === 0
      && miningDepletedState.savedRemaining === 0
      && !miningDepletedState.stillTargeted
      && miningDepletedState.obstaclePresent,
      JSON.stringify(miningDepletedState));

    await page.evaluate(() => window.__VOID_PRIVATEER__.startArena('debris-field', 'free-flight', 'rookie'));
    await waitForArena('mourning-line');
    const salvage = await configureSalvage();
    const salvageScanDistance = salvage.scanRange + 25;
    const [sx, sy, sz] = salvage.playerPosition;

    await placeSalvageTarget([sx, sy, sz - salvageScanDistance]);
    await page.evaluate(() => window.__VOID_PRIVATEER__.getRuntime().autoScanTarget());
    check('salvage target stays unscanned outside scan range', await page.evaluate(() => {
      const runtime = window.__VOID_PRIVATEER__.getRuntime();
      return !runtime.wreckNodes.find((node) => node.id === runtime.save.player.currentTargetId)?.scanned;
    }));

    await placeSalvageTarget([sx, sy, sz - 90]);
    await page.evaluate(() => window.__VOID_PRIVATEER__.getRuntime().autoScanTarget());
    check('salvage target auto-scans inside scan range', await page.evaluate(() => {
      const runtime = window.__VOID_PRIVATEER__.getRuntime();
      return runtime.wreckNodes.find((node) => node.id === runtime.save.player.currentTargetId)?.scanned === true;
    }));

    const salvageNoTarget = await page.evaluate(() => {
      const runtime = window.__VOID_PRIVATEER__.getRuntime();
      const target = runtime.wreckNodes.find((node) => node.id === runtime.save.player.currentTargetId);
      runtime.clearTarget();
      runtime.updateUtilityTool(1, true);
      return { remaining: target.remaining, utilityActive: runtime.utilityActive };
    });
    check('salvage requires a target', salvageNoTarget.remaining === 4 && !salvageNoTarget.utilityActive);

    await page.evaluate(() => {
      const runtime = window.__VOID_PRIVATEER__.getRuntime();
      const target = runtime.wreckNodes.find((node) => node.remaining > 0);
      runtime.selectTarget('wreck', target.id);
      target.scanned = true;
      runtime.save.player.mode = 'combat';
      runtime.updateUtilityTool(1, true);
    });
    check('salvage requires salvage mode', await page.evaluate(() => {
      const runtime = window.__VOID_PRIVATEER__.getRuntime();
      const target = runtime.wreckNodes.find((node) => node.id === runtime.save.player.currentTargetId);
      return target.remaining === 4 && !runtime.utilityActive;
    }));

    const salvageObstruction = await page.evaluate(() => {
      const runtime = window.__VOID_PRIVATEER__.getRuntime();
      const target = runtime.wreckNodes.find((node) => node.remaining > 0);
      const blocker = runtime.wreckNodes.find((node) => node !== target && node.remaining > 0);
      const [px, py, pz] = runtime.save.player.position;
      target.position = [px, py, pz - 90];
      blocker.position = [px, py, pz - 45];
      target.scanned = true;
      blocker.scanned = true;
      runtime.renderer.updateWreckNodeInstances(1 / 60);
      runtime.obstacleGridBuiltAt = -Infinity;
      runtime.save.player.mode = 'salvage';
      runtime.selectTarget('wreck', target.id);
      runtime.updateUtilityTool(1, true);
      return { utilityActive: runtime.utilityActive, readout: runtime.utilityReadout };
    });
    check('salvage beam is blocked by an intervening wreck', !salvageObstruction.utilityActive && /BLOCK|OBSTRUCT/i.test(salvageObstruction.readout));

    const salvageBefore = await page.evaluate(() => {
      const runtime = window.__VOID_PRIVATEER__.getRuntime();
      const target = runtime.wreckNodes.find((node) => node.remaining > 0);
      const blocker = runtime.wreckNodes.find((node) => node !== target && node.remaining > 0);
      blocker.remaining = 0;
      target.remaining = 4;
      target.scanned = true;
      target.salvage = 'scrap';
      runtime.save.player.cargo = {};
      runtime.save.player.mode = 'salvage';
      runtime.extractionCarry?.clear?.();
      runtime.renderer.updateWreckNodeInstances(1 / 60);
      runtime.obstacleGridBuiltAt = -Infinity;
      runtime.selectTarget('wreck', target.id);
      return {
        id: target.id,
        remaining: target.remaining,
        salvaged: runtime.save.player.stats.salvaged,
        guild: runtime.save.player.guildRep?.salvage ?? 0,
      };
    });
    const salvageYield = await step(140, { utility: true });
    check('salvage extraction activates a clear beam', salvageYield.utilityActive, salvageYield.utilityReadout);
    check('salvage yields an integer unit', salvageYield.cargo.scrap === 1 && Number.isInteger(salvageYield.cargo.scrap));
    const salvageAfter = await page.evaluate((id) => {
      const runtime = window.__VOID_PRIVATEER__.getRuntime();
      const target = runtime.wreckNodes.find((node) => node.id === id);
      return {
        remaining: target.remaining,
        salvaged: runtime.save.player.stats.salvaged,
        guild: runtime.save.player.guildRep?.salvage ?? 0,
      };
    }, salvageBefore.id);
    check('salvage updates wreck, stats, and guild progress',
      salvageAfter.remaining === 3
      && salvageAfter.salvaged === salvageBefore.salvaged + 1
      && salvageAfter.guild === salvageBefore.guild + 1,
      JSON.stringify({ salvageBefore, salvageAfter }));
    check('salvage render text remains available', await page.evaluate(() => typeof window.render_game_to_text?.() === 'string'));
    await page.screenshot({ path: screenshotSalvage });
    console.log(`SCREENSHOT salvage ${screenshotSalvage}`);

    const salvageFull = await page.evaluate(() => {
      const runtime = window.__VOID_PRIVATEER__.getRuntime();
      const target = runtime.wreckNodes.find((node) => node.remaining > 0);
      const capacity = runtime.playerStats().cargo;
      runtime.save.player.cargo = { scrap: Math.ceil(capacity / 1.8) };
      target.remaining = 3;
      target.salvage = 'scrap';
      target.scanned = true;
      runtime.save.player.mode = 'salvage';
      runtime.selectTarget('wreck', target.id);
      runtime.updateUtilityTool(1, true);
      return { remaining: target.remaining, readout: runtime.utilityReadout };
    });
    check('salvage refuses extraction when cargo is full', salvageFull.remaining === 3 && /FULL|VOLL/i.test(salvageFull.readout), salvageFull.readout);

    const salvageDepletion = await page.evaluate(() => {
      const runtime = window.__VOID_PRIVATEER__.getRuntime();
      const target = runtime.wreckNodes.find((node) => node.remaining > 0);
      const id = target.id;
      runtime.save.player.cargo = {};
      target.remaining = 1;
      target.salvage = 'scrap';
      target.scanned = true;
      runtime.save.player.mode = 'salvage';
      runtime.extractionCarry?.clear?.();
      runtime.renderer.updateWreckNodeInstances(1 / 60);
      runtime.obstacleGridBuiltAt = -Infinity;
      runtime.selectTarget('wreck', id);
      return id;
    });
    await step(160, { utility: true });
    const salvageDepletedState = await page.evaluate((id) => {
      const runtime = window.__VOID_PRIVATEER__.getRuntime();
      const batch = runtime.renderer.wreckBatches?.find((candidate) => candidate.entries?.some((entry) => entry.node.id === id));
      const entry = batch?.entries?.find((candidate) => candidate.node.id === id);
      return {
        remaining: runtime.wreckNodes.find((node) => node.id === id)?.remaining,
        savedRemaining: runtime.save.world.depletedWrecks?.[id],
        stillTargeted: runtime.save.player.currentTargetId === id,
        obstaclePresent: runtime.activeFieldObstacles('mourning-line').some((obstacle) => obstacle.id === id),
        hidden: Boolean(entry?.hidden),
      };
    }, salvageDepletion);
    check('depleted wreck is removed from targeting and collision obstacles',
      salvageDepletedState.remaining === 0
      && salvageDepletedState.savedRemaining === 0
      && !salvageDepletedState.stillTargeted
      && !salvageDepletedState.obstaclePresent,
      JSON.stringify(salvageDepletedState));
    check('depleted wreck render entry is hidden', salvageDepletedState.hidden, JSON.stringify(salvageDepletedState));

    const pickupResult = await page.evaluate(() => {
      const runtime = window.__VOID_PRIVATEER__.getRuntime();
      const capacity = runtime.playerStats().cargo;
      runtime.save.player.cargo = { scrap: Math.ceil(capacity / 1.8) };
      runtime.spawnPickup('scrap', runtime.save.player.position, 'salvage', 1);
      const pickup = runtime.pickups.at(-1);
      const fullBefore = runtime.save.player.cargo.scrap;
      runtime.pickupStore.setPos(pickup.slot, ...runtime.save.player.position);
      runtime.updatePickups(1 / 60);
      const refused = { life: pickup.life, cargo: runtime.save.player.cargo.scrap, fullBefore, monitor: runtime.ownMonitorStatus };
      runtime.save.player.cargo = {};
      const salvagedBefore = runtime.save.player.stats.salvaged;
      runtime.pickupStore.setPos(pickup.slot, ...runtime.save.player.position);
      runtime.updatePickups(1 / 60);
      return {
        refused,
        collected: { life: pickup.life, cargo: runtime.save.player.cargo.scrap, salvaged: runtime.save.player.stats.salvaged - salvagedBefore },
      };
    });
    check('salvage pickup refuses when cargo is full', pickupResult.refused.life > 0 && pickupResult.refused.cargo === pickupResult.refused.fullBefore && /FULL|VOLL/i.test(pickupResult.refused.monitor ?? ''), JSON.stringify(pickupResult.refused));
    check('salvage pickup collects and updates stats', pickupResult.collected.life === 0 && pickupResult.collected.cargo === 1 && pickupResult.collected.salvaged === 1, JSON.stringify(pickupResult.collected));

    // A fresh arena gives the live board a clean wreck ledger. Accept one of
    // its generated recovery offers at the issuing dock, then return to the
    // field and cut the exact node named by the contract. This is intentionally
    // driven through the public GameSession methods so the probe catches drift
    // between board generation, extraction bookkeeping, and the ship menu.
    await page.evaluate(() => window.__VOID_PRIVATEER__.startArena('debris-field', 'free-flight', 'rookie'));
    await waitForArena('mourning-line');
    const contractSetup = await page.evaluate(() => {
      const runtime = window.__VOID_PRIVATEER__.getRuntime();
      runtime.save.player.transponder = true;
      runtime.dockAt('rook');
      const offer = runtime.save.world.offers.rook?.find((entry) => entry.kind === 'salvage');
      if (!offer) return { offer: null };
      runtime.save.player.credits = Math.max(runtime.save.player.credits, offer.deposit + 10000);
      runtime.acceptMission(offer.id);
      const mission = runtime.save.activeMissions.find((entry) => entry.id === offer.id);
      if (!mission) return { offer: { id: offer.id, kind: offer.kind }, mission: null };

      // Leave the dock without running a second full flight transition: the
      // arena is already positioned at the Mourning Line center, so clearing
      // the dock flag and refreshing the active instance is equivalent to the
      // public launch path for this disposable test session.
      runtime.save.player.dockedAt = undefined;
      runtime.renderer.setCockpitVisible(true);
      runtime.ui.hideDock();
      runtime.ui.showHud();
      runtime.updateActiveInstance(true);
      const target = runtime.wreckNodes.find((node) => node.id === mission.targetNodeId);
      if (!target) return { offer: { id: offer.id, kind: offer.kind }, mission: { ...mission }, target: null };
      const [px, py, pz] = runtime.save.player.position;
      for (const node of runtime.wreckNodes) {
        node.remaining = 0;
        node.scanned = true;
        node._collisionMesh = undefined;
      }
      target.remaining = Number(mission.targetRemaining);
      target.salvage = mission.commodity;
      target.scanned = true;
      target.position = [px, py, pz - 90];
      target.rotation = [0, 0, 0];
      target._collisionMesh = undefined;
      runtime.save.player.cargo = {};
      runtime.save.player.mode = 'salvage';
      runtime.extractionCarry?.clear?.();
      runtime.renderer.updateWreckNodeInstances(1 / 60);
      runtime.obstacleGridBuiltAt = -Infinity;
      runtime.selectTarget('wreck', target.id);
      const hudTarget = runtime.buildHudModel().target;
      return {
        offer: { id: offer.id, kind: offer.kind, targetNodeId: offer.targetNodeId, quantity: offer.quantity, destination: offer.destination },
        mission: { id: mission.id, targetNodeId: mission.targetNodeId, targetRemaining: mission.targetRemaining, quantity: mission.quantity, salvaged: mission.salvaged },
        target: { id: target.id, remaining: target.remaining },
        hudTarget: hudTarget ? { subtitle: hudTarget.subtitle, readout: hudTarget.readout } : null,
      };
    });
    check('mission board posts a generated salvage recovery offer', contractSetup.offer?.kind === 'salvage', JSON.stringify(contractSetup));
    check('accepted salvage contract locks its exact wreck target',
      contractSetup.mission?.id === contractSetup.offer?.id
      && contractSetup.mission?.targetNodeId === contractSetup.offer?.targetNodeId
      && contractSetup.target?.id === contractSetup.mission?.targetNodeId,
      JSON.stringify(contractSetup));
    check('claimed wreck cockpit readout shows recovery progress',
      /SALVAGE CLAIM|BERGUNGSRECHT/i.test(contractSetup.hudTarget?.subtitle ?? '')
      && String(contractSetup.hudTarget?.readout ?? '').includes(`0/${contractSetup.mission?.quantity}`),
      JSON.stringify(contractSetup.hudTarget));
    if (contractSetup.mission && contractSetup.target) {
      await step(420, { utility: true });
      const contractProgress = await page.evaluate((missionId) => {
        const runtime = window.__VOID_PRIVATEER__.getRuntime();
        const mission = runtime.save.activeMissions.find((entry) => entry.id === missionId);
        const target = runtime.wreckNodes.find((node) => node.id === mission?.targetNodeId);
        const goals = runtime.targetCandidates();
        runtime.openShipMenu();
        return {
          mission: mission ? { ...mission } : null,
          target: target ? { id: target.id, remaining: target.remaining } : null,
          returnGoal: goals.find((goal) => goal.kind === 'location' && goal.id === mission?.destination) ?? null,
          shipMenu: document.querySelector('#ship-panel')?.innerText ?? '',
        };
      }, contractSetup.mission.id);
      check('salvage contract progress increments from its exact extraction',
        contractProgress.mission?.targetNodeId === contractSetup.target.id
        && contractProgress.mission.salvaged >= contractProgress.mission.quantity
        && contractProgress.target?.remaining < contractSetup.mission.targetRemaining,
        JSON.stringify(contractProgress));
      check('completed salvage contract navigates back to its issuing dock',
        contractProgress.returnGoal?.id === contractSetup.offer.destination
        && (contractProgress.shipMenu.normalize('NFC').includes('RETURN TO')
          || contractProgress.shipMenu.normalize('NFC').includes('ZURÜCK ZU')),
        JSON.stringify({ returnGoal: contractProgress.returnGoal, shipMenu: contractProgress.shipMenu }));
    }

    check('live browser console stays error-free', consoleErrors.length === 0, consoleErrors.slice(0, 5).join(' | '));
  } catch (error) {
    console.error(`browser diagnostics: ${JSON.stringify({
      url: page.url(),
      consoleErrors,
      title: await page.title().catch(() => ''),
      body: await page.locator('body').innerText().catch(() => ''),
    })}`);
    throw error;
  } finally {
    await browser.close();
    if (server) server.kill();
  }
};

main()
  .catch((error) => {
    failures.push(`probe crashed: ${error.stack || error.message}`);
    console.error(error.stack || error.message);
  })
  .finally(() => {
    console.log(`\n${pass.length} passed, ${failures.length} failed`);
    if (failures.length) {
      console.error(failures.map((failure) => `- ${failure}`).join('\n'));
      process.exitCode = 1;
    }
  });
