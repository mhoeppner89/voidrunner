// Live regression for the player-facing encounter branches.  The probe uses
// public runtime methods and deterministic fixtures; it deliberately reports
// gameplay mismatches instead of changing the production runtime.
import { chromium } from '/Users/mhoeppner/.codex/node_modules/playwright/index.mjs';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';

const baseUrl = process.env.VR_BASE_URL ?? 'http://127.0.0.1:4173/';
const appUrl = new URL('?encounter-branches=1', baseUrl).href;
const chromePath = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const shotSurrender = '/private/tmp/voidrunner-encounter-surrender.png';
const shotMug = '/private/tmp/voidrunner-encounter-mug.png';

const passes = [];
const behaviorFailures = [];
const probeFailures = [];
const consoleErrors = [];

const server = process.env.VR_BASE_URL
  ? null
  : spawn('python3', ['-m', 'http.server', '4173'], { cwd: process.cwd(), stdio: 'ignore' });

const check = (name, condition, detail = '') => {
  if (condition) {
    passes.push(name);
    console.log(`PASS ${name}`);
  } else {
    const message = detail ? `${name}: ${detail}` : name;
    behaviorFailures.push(message);
    console.error(`FAIL ${message}`);
  }
};

const expectNoThrow = async (name, operation) => {
  try {
    return await operation();
  } catch (error) {
    const message = `${name}: ${error?.message ?? error}`;
    probeFailures.push(message);
    console.error(`PROBE ERROR ${message}`);
    return undefined;
  }
};

const labels = {
  mine: /Mine|Abbau/i,
  salvage: /Salvage|Bergung/i,
  scan: /Scan/i,
  capture: /Capture|übernehmen/i,
  fire: /Fire|Feuer/i,
};

const main = async () => {
  if (!existsSync(chromePath))
    throw new Error(`Chrome not found at ${chromePath}`);

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
    if (message.type() === 'error')
      consoleErrors.push(`console: ${message.text()}`);
  });

  const stopSession = async () => page.evaluate(() => {
    const runtime = window.__VOID_PRIVATEER__?.getRuntime?.();
    if (!runtime)
      return false;
    cancelAnimationFrame(runtime.frameId);
    runtime.active = false;
    runtime.simAccumulator = 0;
    return true;
  });

  // Dispose the stopped session before replacing it.  This keeps the repeated
  // arena fixtures from accumulating renderer/audio resources in one tab.
  const disposeSession = async () => page.evaluate(() => {
    const runtime = window.__VOID_PRIVATEER__?.getRuntime?.();
    if (!runtime)
      return false;
    if (!runtime.active)
      runtime.active = true;
    runtime.dispose?.();
    return true;
  });

  const startArena = async (environment, scenario = '1v1') => {
    await disposeSession();
    await page.evaluate(({ nextEnvironment, nextScenario }) => {
      window.__VOID_PRIVATEER__.startArena(nextEnvironment, nextScenario, 'rookie');
    }, { nextEnvironment: environment, nextScenario: scenario });
    await page.waitForFunction(() => Boolean(window.__VOID_PRIVATEER__?.getRuntime?.()?.renderer), undefined, { timeout: 60000 });
    await page.waitForTimeout(450);
    await stopSession();
  };

  const startCareer = async () => {
    await disposeSession();
    await page.evaluate(() => window.__VOID_PRIVATEER__.newGame());
    await page.waitForFunction(() => Boolean(window.__VOID_PRIVATEER__?.getRuntime?.()?.renderer), undefined, { timeout: 60000 });
    await page.waitForTimeout(450);
    await page.evaluate(() => {
      const runtime = window.__VOID_PRIVATEER__.getRuntime();
      runtime.launch();
      runtime.ui.dismissStory?.();
      cancelAnimationFrame(runtime.frameId);
      runtime.active = false;
      runtime.simAccumulator = 0;
    });
  };

  const updateHud = async () => page.evaluate(() => {
    const runtime = window.__VOID_PRIVATEER__.getRuntime();
    const model = runtime.buildHudModel();
    runtime.ui.updateHud(model);
    return {
      model,
      fire: {
        action: document.querySelector('#touch-fire')?.dataset.touchAction,
        aria: document.querySelector('#touch-fire')?.getAttribute('aria-label'),
      },
      missile: {
        action: document.querySelector('#touch-missile')?.dataset.touchAction,
        aria: document.querySelector('#touch-missile')?.getAttribute('aria-label'),
        disabled: document.querySelector('#touch-missile')?.disabled ?? false,
      },
    };
  });

  try {
    await page.goto(appUrl, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => Boolean(window.__VOID_PRIVATEER__?.startArena), undefined, { timeout: 60000 });
    check('browser boot exposes public encounter hooks', await page.evaluate(() => Boolean(window.__VOID_PRIVATEER__?.startArena && window.__VOID_PRIVATEER__?.getRuntime)));

    // --- Surrender, scan, capture, and kill branches --------------------
    await startArena('open', '1v1');
    const surrender = await expectNoThrow('configure surrender fixture', () => page.evaluate(() => {
      const runtime = window.__VOID_PRIVATEER__.getRuntime();
      const ship = runtime.ships.find((entry) => entry.hostile && entry.hull > 0);
      if (!ship)
        throw new Error('hostile fixture unavailable');
      const player = runtime.save.player.position;
      ship.position = [player[0], player[1], player[2] - 120];
      ship.velocity = [0, 0, 0];
      ship.shield = 0;
      ship.hull = Math.max(20, ship.maxHull * 0.3);
      ship.surrendered = false;
      ship.hostile = true;
      ship.fleeing = false;
      ship.poweredDown = false;
      ship.claimed = false;
      ship.captured = false;
      ship.noSurrender = false;
      ship.bountyValue = Math.max(250, ship.bountyValue || 0);
      ship.aiRng = () => 0;
      runtime.save.player.currentTargetId = ship.id;
      runtime.renderer.setTarget(ship.id);
      runtime.obstacleGridBuiltAt = -Infinity;
      return { id: ship.id, hull: ship.hull, bounty: ship.bountyValue };
    }));

    if (surrender) {
      const afterHit = await page.evaluate(() => {
        const runtime = window.__VOID_PRIVATEER__.getRuntime();
        const ship = runtime.ships.find((entry) => entry.id === runtime.save.player.currentTargetId);
        runtime.damageShip(ship, 1, 'player', ship.position);
        return {
          surrendered: ship.surrendered,
          hostile: ship.hostile,
          hull: ship.hull,
          fleeing: ship.fleeing,
          poweredDown: ship.poweredDown,
          memory: runtime.save.world.surrenderedTo?.[ship.name],
        };
      });
      check('low-hull player damage triggers a non-lethal surrender', afterHit.surrendered && !afterHit.hostile && afterHit.hull > 0 && (afterHit.fleeing || afterHit.poweredDown), JSON.stringify(afterHit));

      const scan = await page.evaluate(() => {
        const runtime = window.__VOID_PRIVATEER__.getRuntime();
        const ship = runtime.ships.find((entry) => entry.id === runtime.save.player.currentTargetId);
        runtime.save.player.currentTargetId = ship.id;
        runtime.renderer.setTarget(ship.id);
        ship.scanned = false;
        runtime.scanCooldown = 0;
        runtime.autoScanTarget();
        return { scanned: ship.scanned, claimed: ship.claimed, captured: ship.captured, hull: ship.hull };
      });
      check('scanning a surrendered pilot does not auto-claim the hull', scan.scanned && !scan.claimed && !scan.captured && scan.hull > 0, JSON.stringify(scan));

      const surrenderHud = await updateHud();
      check('surrendered target offers a claim-ready readout', surrenderHud.model.target?.readout === 'SURRENDERED · CLAIM READY' || /SURRENDERED.*CLAIM|ERGEBEN.*(ANSPRUCH|ÜBERNAHME)/i.test(surrenderHud.model.target?.readout ?? ''), surrenderHud.model.target?.readout);
      check('surrendered target switches the secondary pad to capture', surrenderHud.missile.action === 'capture' && surrenderHud.model.target?.captureAvailable === true, JSON.stringify(surrenderHud.missile));
      check('capture action label is localized and specific', labels.capture.test(surrenderHud.missile.aria ?? ''), surrenderHud.missile.aria);
      await page.screenshot({ path: shotSurrender });
      console.log(`SCREENSHOT surrender ${shotSurrender}`);

      const captured = await page.evaluate(() => {
        const runtime = window.__VOID_PRIVATEER__.getRuntime();
        const ship = runtime.ships.find((entry) => entry.id === runtime.save.player.currentTargetId);
        const hull = ship.hull;
        const credits = runtime.save.player.credits;
        const kills = runtime.save.player.stats.kills;
        const position = [...ship.position];
        const result = runtime.captureTarget();
        runtime.updateTravelAI(ship, 1);
        return {
          result,
          captured: ship.captured,
          claimed: ship.claimed,
          hull: ship.hull,
          hullBefore: hull,
          creditsDelta: runtime.save.player.credits - credits,
          killsDelta: runtime.save.player.stats.kills - kills,
          target: runtime.save.player.currentTargetId,
          drifted: ship.position.some((value, index) => Math.abs(value - position[index]) > 0.001),
        };
      });
      check('capture claims the surrendered hull without destroying it', captured.captured && captured.claimed && captured.hull === captured.hullBefore && captured.hull > 0, JSON.stringify(captured));
      check('capture pays the claim and records a capture', captured.creditsDelta === surrender.bounty && captured.killsDelta === 1, JSON.stringify(captured));
      check('captured hull clears the lock and drifts inertly', captured.target === undefined && captured.drifted, JSON.stringify(captured));
    }

    await startArena('open', '1v1');
    const kill = await expectNoThrow('configure kill fixture', () => page.evaluate(() => {
      const runtime = window.__VOID_PRIVATEER__.getRuntime();
      const ship = runtime.ships.find((entry) => entry.hostile && entry.hull > 0);
      if (!ship)
        throw new Error('hostile fixture unavailable');
      const player = runtime.save.player.position;
      ship.position = [player[0], player[1], player[2] - 120];
      ship.shield = 0;
      ship.hull = 45;
      ship.surrendered = true;
      ship.hostile = false;
      ship.claimed = false;
      ship.captured = false;
      ship.bountyValue = Math.max(300, ship.bountyValue || 0);
      runtime.save.player.currentTargetId = ship.id;
      runtime.renderer.setTarget(ship.id);
      return { id: ship.id, bounty: ship.bountyValue };
    }));
    if (kill) {
      const killed = await page.evaluate(() => {
        const runtime = window.__VOID_PRIVATEER__.getRuntime();
        const ship = runtime.ships.find((entry) => entry.id === runtime.save.player.currentTargetId);
        const credits = runtime.save.player.credits;
        const kills = runtime.save.player.stats.kills;
        runtime.damageShip(ship, ship.hull + 1, 'player', ship.position);
        return {
          hull: ship.hull,
          captured: ship.captured,
          claimed: ship.claimed,
          creditsDelta: runtime.save.player.credits - credits,
          killsDelta: runtime.save.player.stats.kills - kills,
          target: runtime.save.player.currentTargetId,
        };
      });
      check('kill choice destroys a surrendered hull', killed.hull <= 0 && !killed.captured && !killed.claimed, JSON.stringify(killed));
      check('kill choice pays a live bounty and records the kill', killed.creditsDelta === kill.bounty && killed.killsDelta === 1, JSON.stringify(killed));
      check('destroyed target clears the lock', killed.target === undefined, JSON.stringify(killed));
    }

    // --- Contextual touch labels for flight targets ----------------------
    await startArena('open', '1v1');
    const ordinary = await page.evaluate(() => {
      const runtime = window.__VOID_PRIVATEER__.getRuntime();
      const ship = runtime.ships.find((entry) => entry.hostile && entry.hull > 0);
      const player = runtime.save.player.position;
      ship.position = [player[0], player[1], player[2] - 120];
      runtime.selectTarget('ship', ship.id);
      return true;
    });
    if (ordinary) {
      const hud = await updateHud();
      check('ordinary ship keeps fire and missile actions', hud.fire.action === 'fire' && hud.missile.action === 'missile' && labels.fire.test(hud.fire.aria ?? ''), JSON.stringify(hud));
    }

    await startArena('asteroid-field', 'free-flight');
    const miningLabel = await page.evaluate(() => {
      const runtime = window.__VOID_PRIVATEER__.getRuntime();
      const node = runtime.asteroids.find((entry) => entry.remaining > 0);
      if (!node)
        return null;
      node.position = [runtime.save.player.position[0], runtime.save.player.position[1], runtime.save.player.position[2] - 90];
      node.scanned = true;
      runtime.selectTarget('asteroid', node.id);
      return node.id;
    });
    if (miningLabel) {
      const hud = await updateHud();
      check('asteroid target switches to mining and scan labels', hud.fire.action === 'utility' && hud.missile.action === 'scan' && labels.mine.test(hud.fire.aria ?? '') && labels.scan.test(hud.missile.aria ?? ''), JSON.stringify(hud));
    } else {
      check('asteroid fixture available for contextual labels', false);
    }

    await startArena('debris-field', 'free-flight');
    const salvageLabel = await page.evaluate(() => {
      const runtime = window.__VOID_PRIVATEER__.getRuntime();
      const node = runtime.wreckNodes.find((entry) => entry.remaining > 0);
      if (!node)
        return null;
      node.position = [runtime.save.player.position[0], runtime.save.player.position[1], runtime.save.player.position[2] - 90];
      node.scanned = true;
      runtime.selectTarget('wreck', node.id);
      return node.id;
    });
    if (salvageLabel) {
      const hud = await updateHud();
      check('wreck target switches to salvage and scan labels', hud.fire.action === 'utility' && hud.missile.action === 'scan' && labels.salvage.test(hud.fire.aria ?? '') && labels.scan.test(hud.missile.aria ?? ''), JSON.stringify(hud));
    } else {
      check('wreck fixture available for contextual labels', false);
    }

    // --- Pirate cargo mug, jettison, credit pay, and refusal --------------
    await startArena('open', '1v1');
    const mugCargo = await expectNoThrow('configure cargo mug fixture', () => page.evaluate(() => {
      const runtime = window.__VOID_PRIVATEER__.getRuntime();
      const pirate = runtime.ships.find((entry) => entry.hostile && entry.hull > 0);
      if (!pirate)
        throw new Error('pirate fixture unavailable');
      runtime.save.player.cargo = { electronics: 4, scrap: 1 };
      pirate.mug = undefined;
      pirate.holdFire = false;
      pirate.standingDown = false;
      runtime.openMug(pirate, [], { seconds: 9 });
      runtime.ui.showShipMenu();
      const demand = runtime.activeMugDemand();
      return {
        id: pirate.id,
        demand,
        jettisonButton: Boolean(document.querySelector(`[data-jettison="${demand?.commodity ?? ''}"]`)),
        standOff: Boolean(document.querySelector('#screen-standoff.is-visible')),
      };
    }));
    if (mugCargo) {
      check('pirates demand the highest-value cargo share', mugCargo.demand?.kind === 'cargo' && mugCargo.demand.commodity === 'electronics' && mugCargo.demand.quantity >= 1 && mugCargo.demand.quantity <= 4, JSON.stringify(mugCargo.demand));
      check('cargo mug exposes a jettison affordance in ship menu', mugCargo.jettisonButton, JSON.stringify(mugCargo));
      await page.screenshot({ path: shotMug });
      console.log(`SCREENSHOT mug ${shotMug}`);
      const jettison = await page.evaluate(() => {
        const runtime = window.__VOID_PRIVATEER__.getRuntime();
        const demand = runtime.activeMugDemand();
        const before = runtime.save.player.cargo[demand.commodity] ?? 0;
        const result = runtime.jettisonCargo(demand.commodity);
        return {
          result,
          before,
          after: runtime.save.player.cargo[demand.commodity] ?? 0,
          mug: runtime.activeMug(),
          standingDown: runtime.ships.some((entry) => entry.standingDown),
        };
      });
      check('jettisoning the demanded cargo resolves the standoff', jettison.result === true && jettison.after < jettison.before && !jettison.mug && jettison.standingDown, JSON.stringify(jettison));
    }

    await startArena('open', '1v1');
    const mugPay = await expectNoThrow('configure credit mug fixture', () => page.evaluate(() => {
      const runtime = window.__VOID_PRIVATEER__.getRuntime();
      const pirate = runtime.ships.find((entry) => entry.hostile && entry.hull > 0);
      if (!pirate)
        throw new Error('pirate fixture unavailable');
      runtime.save.player.cargo = {};
      runtime.save.player.credits = 1000;
      pirate.mug = undefined;
      pirate.holdFire = false;
      pirate.standingDown = false;
      runtime.beginMug(pirate, [], { kind: 'credits', amount: 400 }, { seconds: 9 });
      runtime.ui.showShipMenu();
      return {
        demand: runtime.activeMugDemand(),
        payButton: Boolean(document.querySelector('[data-pay-mug]')),
      };
    }));
    if (mugPay) {
      check('credit mug exposes a pay affordance', mugPay.demand?.kind === 'credits' && mugPay.payButton, JSON.stringify(mugPay));
      const paid = await page.evaluate(() => {
        const runtime = window.__VOID_PRIVATEER__.getRuntime();
        const before = runtime.save.player.credits;
        const result = runtime.payOffMug();
        return { result, creditsDelta: runtime.save.player.credits - before, mug: runtime.activeMug(), standingDown: runtime.ships.some((entry) => entry.standingDown) };
      });
      check('paying the credit demand subtracts credits and stands down', paid.result === true && paid.creditsDelta === -400 && !paid.mug && paid.standingDown, JSON.stringify(paid));
    }

    await startArena('open', '1v1');
    const mugRefusal = await expectNoThrow('configure insufficient-credit mug fixture', () => page.evaluate(() => {
      const runtime = window.__VOID_PRIVATEER__.getRuntime();
      const pirate = runtime.ships.find((entry) => entry.hostile && entry.hull > 0);
      if (!pirate)
        throw new Error('pirate fixture unavailable');
      runtime.save.player.cargo = {};
      runtime.save.player.credits = 100;
      runtime.beginMug(pirate, [], { kind: 'credits', amount: 400 }, { seconds: 9 });
      return true;
    }));
    if (mugRefusal) {
      const refused = await page.evaluate(() => {
        const runtime = window.__VOID_PRIVATEER__.getRuntime();
        const before = runtime.save.player.credits;
        const result = runtime.payOffMug();
        return { result, credits: runtime.save.player.credits, mug: runtime.activeMug(), holdingFire: runtime.ships.some((entry) => entry.holdFire) };
      });
      check('insufficient credit refuses payment and leaves the standoff live', refused.result === false && refused.credits === 100 && refused.mug?.demand?.kind === 'credits' && refused.holdingFire, JSON.stringify(refused));
    }

    // --- Patrol, transponder, reply, and dark-running consequences --------
    await startCareer();
    const patrol = await expectNoThrow('configure patrol fixture', () => page.evaluate(() => {
      const runtime = window.__VOID_PRIVATEER__.getRuntime();
      const player = runtime.save.player;
      player.position = [0, 0, 0];
      player.velocity = [0, 0, 0];
      player.transponder = false;
      runtime.utilityActive = false;
      runtime.updateActiveInstance(true);
      const ship = runtime.spawnShip('patrol', [0, 0, -100]);
      ship.hostile = false;
      ship.targetId = undefined;
      ship.spawnTime = runtime.save.world.time - 4;
      ship.nextNeutralChatAt = 0;
      ship.nearNeutral = false;
      ship.catchCooldownUntil = 0;
      ship.search = undefined;
      ship.resolvedPlayerLast = false;
      return { id: ship.id, rep: player.reputation.concord, broadcasting: runtime.playerBroadcasting() };
    }));
    if (patrol) {
      const caught = await page.evaluate((id) => {
        const runtime = window.__VOID_PRIVATEER__.getRuntime();
        const ship = runtime.ships.find((entry) => entry.id === id);
        runtime.updateSearchAI(ship, 1 / 60);
        return { rep: runtime.save.player.reputation.concord, delta: runtime.save.player.reputation.concord - 0, cooldown: ship.catchCooldownUntil, broadcasting: runtime.playerBroadcasting() };
      }, patrol.id);
      check('dark transponder is not broadcasting and a patrol catches it', !caught.broadcasting && caught.delta === -2 && caught.cooldown > 0, JSON.stringify(caught));

      const search = await page.evaluate((id) => {
        const runtime = window.__VOID_PRIVATEER__.getRuntime();
        const ship = runtime.ships.find((entry) => entry.id === id);
        runtime.save.player.position = [0, 0, 500];
        runtime.save.player.velocity = [0, 0, 0];
        runtime.updateSearchAI(ship, 1 / 60);
        return { search: ship.search, resolved: ship.resolvedPlayerLast };
      }, patrol.id);
      check('a patrol begins a search after a dark signal vanishes', search.search?.kind === 'patrol' && search.search?.phase === 'approach' && search.resolved === false, JSON.stringify(search));

      const rebroadcast = await page.evaluate((id) => {
        const runtime = window.__VOID_PRIVATEER__.getRuntime();
        runtime.toggleTransponder();
        const ship = runtime.ships.find((entry) => entry.id === id);
        runtime.updateSearchAI(ship, 1 / 60);
        return { transponder: runtime.save.player.transponder, broadcasting: runtime.playerBroadcasting(), search: ship.search };
      }, patrol.id);
      check('transponder restores the full signature and clears a patrol search', rebroadcast.transponder === true && rebroadcast.broadcasting && !rebroadcast.search, JSON.stringify(rebroadcast));

      const reply = await page.evaluate((id) => {
        const runtime = window.__VOID_PRIVATEER__.getRuntime();
        const ship = runtime.ships.find((entry) => entry.id === id);
        runtime.save.player.position = [0, 0, -70];
        runtime.save.player.transponder = true;
        runtime.save.world.time = Math.max(runtime.save.world.time, ship.spawnTime + 4);
        ship.search = undefined;
        ship.nearNeutral = false;
        ship.nextNeutralChatAt = 0;
        runtime.nextChatterAt = 0;
        const before = runtime.save.player.reputation.concord;
        const diagnostics = {
          time: runtime.save.world.time,
          spawnTime: ship.spawnTime,
          tracking: runtime.save.world.time >= ship.spawnTime + 2,
          story: runtime.storyLineActive(),
          chatter: runtime.chatterOpen(),
          hostile: ship.hostile,
          surrendered: ship.surrendered,
          captured: ship.captured,
          standingDown: ship.standingDown,
          search: Boolean(ship.search),
          deferential: runtime.deferentialPilot(ship),
          distance: Math.hypot(ship.position[0] - 0, ship.position[1] - 0, ship.position[2] + 70),
        };
        runtime.maybeNeutralChatter(
          ship,
          runtime.tmpB.set(ship.position[0], ship.position[1], ship.position[2]),
          runtime.tmpA.set(0, 0, -70),
        );
        const active = runtime.patrolReplyActive();
        const result = runtime.patrolReply();
        return { active, result, repDelta: runtime.save.player.reputation.concord - before, after: runtime.patrolReplyActive(), diagnostics };
      }, patrol.id);
      check('patrol greeting opens a reply and answering gives courtesy reputation', Boolean(reply.active) && reply.result === true && reply.repDelta === 2 && !reply.after, JSON.stringify(reply));

      const utilityBroadcast = await page.evaluate(() => {
        const runtime = window.__VOID_PRIVATEER__.getRuntime();
        runtime.save.player.transponder = false;
        runtime.utilityActive = true;
        const beamOn = runtime.playerBroadcasting();
        runtime.utilityActive = false;
        return { beamOn, beamOff: runtime.playerBroadcasting() };
      });
      check('an active extraction beam broadcasts a dark-running ship', utilityBroadcast.beamOn && !utilityBroadcast.beamOff, JSON.stringify(utilityBroadcast));

      const bust = await page.evaluate((id) => {
        const runtime = window.__VOID_PRIVATEER__.getRuntime();
        const ship = runtime.ships.find((entry) => entry.id === id);
        const player = runtime.save.player;
        player.position = [0, 0, 0];
        player.velocity = [0, 0, 0];
        player.transponder = false;
        runtime.utilityActive = false;
        player.credits = 5000;
        player.sealedCargo = [{ missionId: 'dark-contract', label: 'Sealed dark goods', units: 2, mass: 2, smuggled: true }];
        runtime.save.activeMissions = [{ id: 'dark-contract', kind: 'smuggle', title: 'Dark contract', guildRep: 8, status: 'active' }];
        runtime.save.world.failedMissionIds = [];
        runtime.save.player.reputation.concord = 0;
        runtime.save.player.guildRep.syndicate = 8;
        runtime.smugglerBustCooldownUntil = 0;
        ship.position = [0, 0, -100];
        ship.search = undefined;
        ship.resolvedPlayerLast = false;
        ship.catchCooldownUntil = 0;
        const beforeCredits = player.credits;
        runtime.updateSearchAI(ship, 1 / 60);
        return {
          cargo: player.sealedCargo.length,
          activeMissions: runtime.save.activeMissions.length,
          failed: runtime.save.world.failedMissionIds.includes('dark-contract'),
          rep: player.reputation.concord,
          creditsDelta: player.credits - beforeCredits,
          cooldown: runtime.smugglerBustCooldownUntil,
        };
      }, patrol.id);
      check('patrol bust seizes dark cargo and fails its smuggle contract', bust.cargo === 0 && bust.activeMissions === 0 && bust.failed && bust.rep === -8 && bust.creditsDelta === -620 && bust.cooldown > 0, JSON.stringify(bust));
    }

    check('browser reports no console errors', consoleErrors.length === 0, consoleErrors.join(' | '));
  } finally {
    server?.kill();
    // A long chain of WebGL arena replacements can leave Chrome taking longer
    // than usual to tear down.  Keep the regression result deterministic while
    // still giving the browser a short, bounded cleanup window.
    await Promise.race([
      browser.close(),
      new Promise((resolve) => setTimeout(resolve, 5000)),
    ]);
  }

  const summary = {
    passCount: passes.length,
    behaviorFailureCount: behaviorFailures.length,
    probeFailureCount: probeFailures.length,
    consoleErrors,
    behaviorFailures,
    probeFailures,
    screenshots: [shotSurrender, shotMug],
  };
  console.log(JSON.stringify(summary, null, 2));
  if (behaviorFailures.length || probeFailures.length || consoleErrors.length)
    process.exitCode = 1;
};

await main();
