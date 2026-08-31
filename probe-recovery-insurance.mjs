import { chromium } from '/Users/mhoeppner/.codex/node_modules/playwright/index.mjs';
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';

const baseUrl = process.env.VR_BASE_URL ?? 'http://127.0.0.1:4173/';
const appUrl = new URL('?recovery-insurance=1', baseUrl).href;
const chromePath = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const screenshotDir = '/private/tmp/voidrunner-recovery-insurance';
const cdpPort = 9350;

const passes = [];
const failures = [];
const browserErrors = [];
const check = (name, condition, detail = '') => {
  if (condition) {
    passes.push(name);
    console.log(`PASS ${name}`);
  } else {
    const message = detail ? `${name}: ${detail}` : name;
    failures.push(message);
    console.error(`FAIL ${message}`);
  }
};

const finite = (value) => Number.isFinite(Number(value));
const sameDigest = (left, right) => JSON.stringify(left) === JSON.stringify(right);

let server;
let browser;
let page;

const main = async () => {
  if (!existsSync(chromePath))
    throw new Error(`Chrome not found at ${chromePath}`);
  mkdirSync(screenshotDir, { recursive: true });

  if (!process.env.VR_BASE_URL) {
    server = spawn('python3', ['-m', 'http.server', '4173'], {
      cwd: process.cwd(),
      stdio: 'ignore',
    });
  }

  // A fresh Playwright context gives this run an empty localStorage and service
  // worker profile. The explicit port keeps it isolated from the other probes.
  browser = await chromium.launch({
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
      `--remote-debugging-port=${cdpPort}`,
    ],
  });
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  page = await context.newPage();
  page.on('pageerror', (error) => browserErrors.push(`pageerror: ${error.message}`));
  page.on('console', (message) => {
    if (message.type() === 'error')
      browserErrors.push(`console: ${message.text()}`);
  });
  page.on('requestfailed', (request) => browserErrors.push(`requestfailed: ${request.url()} — ${request.failure()?.errorText ?? 'unknown'}`));
  page.on('response', (response) => {
    if (response.status() >= 400)
      browserErrors.push(`http ${response.status()}: ${response.url()}`);
  });

  const waitFor = async (predicate, arg = undefined, timeout = 15000) => {
    await page.waitForFunction(predicate, arg, { timeout });
  };
  const click = async (selector) => {
    const target = page.locator(selector).first();
    await target.waitFor({ state: 'visible', timeout: 15000 });
    await target.click({ force: true });
  };
  const capture = async (name) => {
    await page.screenshot({ path: `${screenshotDir}/${name}.png`, animations: 'disabled' });
    console.log(`SHOT ${screenshotDir}/${name}.png`);
  };
  const snapshot = async () => page.evaluate(() => {
    const runtime = window.__VOID_PRIVATEER__?.getRuntime?.();
    const save = runtime?.save;
    const player = save?.player;
    const stats = runtime?.playerStats?.() ?? null;
    const finiteNumbers = [
      ...(player?.position ?? []), ...(player?.velocity ?? []), ...(player?.angularVelocity ?? []),
      player?.throttle, player?.credits, player?.shield, player?.hull,
      player?.energy, player?.fuel, player?.missiles, runtime?.deathTimer,
      save?.world?.time,
    ];
    const visible = (id) => {
      const node = document.getElementById(id);
      return Boolean(node && !node.classList.contains('is-hidden') && getComputedStyle(node).display !== 'none');
    };
    const visibleIds = ['title-screen', 'dock-screen', 'hud', 'map-panel', 'ship-panel', 'pause-panel', 'arena-panel', 'chat-panel', 'rotate-notice']
      .filter(visible);
    const modalIds = ['map-panel', 'ship-panel', 'pause-panel', 'arena-panel', 'chat-panel', 'rotate-notice']
      .filter(visible);
    return {
      runtime: Boolean(runtime),
      arena: Boolean(runtime?.arena),
      dockedAt: player?.dockedAt ?? null,
      lastDockedAt: player?.lastDockedAt ?? null,
      systemId: player?.systemId ?? null,
      credits: player?.credits,
      shield: player?.shield,
      hull: player?.hull,
      energy: player?.energy,
      fuel: player?.fuel,
      missiles: player?.missiles,
      throttle: player?.throttle,
      position: player?.position ? [...player.position] : null,
      rotation: player?.rotation ? [...player.rotation] : null,
      deathTimer: runtime?.deathTimer,
      worldTime: save?.world?.time,
      cargo: player?.cargo ? { ...player.cargo } : null,
      sealedCargo: player?.sealedCargo?.length ?? 0,
      activeMissions: save?.activeMissions?.length ?? 0,
      failedMissionIds: save?.world?.failedMissionIds ? [...save.world.failedMissionIds] : [],
      stats: stats ? { hull: stats.hull, shield: stats.shield, energyCapacity: stats.energyCapacity, fuel: stats.fuel, missileCapacity: stats.missileCapacity } : null,
      finite: finiteNumbers.every((value) => Number.isFinite(Number(value))),
      visibleIds,
      modalIds,
      dockText: document.querySelector('#dock-screen')?.innerText?.slice(-3000) ?? '',
      hudText: document.querySelector('#hud')?.innerText?.slice(-3000) ?? '',
      toastText: document.querySelector('#toast-stack')?.innerText?.slice(-1200) ?? '',
      recentEvents: runtime?.ui?.recentEvents?.slice(-6).map((entry) => entry.message) ?? [],
      bodyText: document.body.innerText.slice(-5000),
    };
  });
  const careerDigest = async () => page.evaluate(() => {
    try {
      const raw = localStorage.getItem('void-privateer-save-v1');
      const parsed = raw ? JSON.parse(raw) : null;
      const p = parsed?.player;
      if (!p)
        return null;
      return {
        credits: p.credits,
        cargo: Object.fromEntries(Object.entries(p.cargo ?? {}).sort(([a], [b]) => a.localeCompare(b))),
        dockedAt: p.dockedAt ?? null,
        lastDockedAt: p.lastDockedAt ?? null,
        systemId: p.systemId ?? null,
        hull: p.hull,
        energy: p.energy,
        fuel: p.fuel,
        shield: p.shield,
        missiles: p.missiles,
        shipId: p.shipId,
        activeMissions: parsed.activeMissions?.length ?? 0,
        sealedCargo: p.sealedCargo?.length ?? 0,
        arena: parsed.arena ?? null,
      };
    } catch {
      return null;
    }
  });
  const finishDeath = async () => page.evaluate(() => {
    const runtime = window.__VOID_PRIVATEER__?.getRuntime?.();
    if (!runtime)
      throw new Error('runtime unavailable while finishing death timer');
    const actions = { throttleDelta: 0, pitch: 0, yaw: 0, roll: 0 };
    let steps = 0;
    // Stop immediately when recovery/restart runs. Continuing to step after a
    // career tow would regenerate energy in the now-docked state and obscure
    // the exact 35% recovery contract being tested.
    while (runtime.deathTimer > 0 && steps < 240) {
      runtime.updateSimulation(1 / 60, actions);
      steps += 1;
    }
    runtime.syncRender(0, performance.now());
    return { steps, deathTimer: runtime.deathTimer };
  });

  try {
    await page.goto(appUrl, { waitUntil: 'domcontentloaded' });
    await waitFor(() => Boolean(window.__VOID_PRIVATEER__?.newGame), undefined, 30000);
    await page.evaluate(() => localStorage.clear());
    await page.reload({ waitUntil: 'domcontentloaded' });
    await waitFor(() => Boolean(window.__VOID_PRIVATEER__?.newGame), undefined, 30000);
    check('fresh profile starts at title', await page.evaluate(() => Boolean(document.querySelector('#title-screen') && !document.querySelector('#title-screen').classList.contains('is-hidden'))));
    check('fresh profile has no career save', await page.evaluate(() => !localStorage.getItem('void-privateer-save-v1')));

    // The recovery text is easier to audit in English, but this still uses the
    // real title-screen language toggle and its no-save persistence path.
    const language = await page.evaluate(() => document.documentElement.lang);
    if (language !== 'en') {
      await click('[data-ui-command="toggle-language"]');
      await waitFor(() => document.documentElement.lang === 'en' && Boolean(document.querySelector('#title-screen')), undefined, 30000);
    }
    check('title language is English for the readable recovery audit', await page.evaluate(() => document.documentElement.lang === 'en'));
    await capture('01-title');

    await click('[data-ui-command="new"]');
    await waitFor(() => Boolean(window.__VOID_PRIVATEER__?.getRuntime?.()?.save?.player?.dockedAt), undefined, 30000);
    let state = await snapshot();
    check('new career opens docked', state.dockedAt === 'helix' && state.visibleIds.includes('dock-screen'));
    check('new career state is finite', state.finite);

    // Cairn is deliberately used as the last safe dock so towing destination
    // is observable rather than silently passing the default Helix case.
    const fixture = await page.evaluate(() => {
      const runtime = window.__VOID_PRIVATEER__.getRuntime();
      const player = runtime.save.player;
      runtime.dockAt('cairn');
      for (const id of Object.keys(player.cargo))
        player.cargo[id] = 0;
      player.cargo.scrap = 10;
      player.cargo.ore = 4;
      player.credits = 10000;
      player.sealedCargo = [{ id: 'probe-sealed', commodityId: 'scrap', quantity: 2, mass: 4 }];
      runtime.save.activeMissions = [{ id: 'recovery-probe-contract', kind: 'transport', status: 'accepted', deadline: 999999, deposit: 100, reward: 300, origin: 'cairn', destination: 'rook', quantity: 1, commodityId: 'scrap' }];
      runtime.persistSave();
      return { dockedAt: player.dockedAt, credits: player.credits, cargo: { ...player.cargo }, activeMissions: runtime.save.activeMissions.length };
    });
    check('recovery fixture records Cairn as last safe dock', fixture.dockedAt === 'cairn' && fixture.credits === 10000 && fixture.cargo.scrap === 10 && fixture.cargo.ore === 4 && fixture.activeMissions === 1);

    await page.evaluate(() => window.__VOID_PRIVATEER__.launch());
    await waitFor(() => Boolean(window.__VOID_PRIVATEER__.getRuntime?.()?.save?.player && !window.__VOID_PRIVATEER__.getRuntime().save.player.dockedAt), undefined, 15000);
    state = await snapshot();
    check('career fixture is undocked before damage', state.dockedAt === null && state.finite);

    const damage = await page.evaluate(() => {
      const runtime = window.__VOID_PRIVATEER__.getRuntime();
      const player = runtime.save.player;
      player.shield = 40;
      player.hull = 185;
      runtime.damagePlayer(25, 'probe shield', false);
      const afterShield = { shield: player.shield, hull: player.hull };
      runtime.damagePlayer(30, 'probe hull', false);
      return { afterShield, afterHull: { shield: player.shield, hull: player.hull } };
    });
    check('shield damage is absorbed before hull', damage.afterShield.shield === 15 && damage.afterShield.hull === 185);
    check('overflow damage reaches hull exactly', damage.afterHull.shield === 0 && damage.afterHull.hull === 170);
    state = await snapshot();
    check('post-shield-to-hull state remains finite', state.finite);

    const death = await page.evaluate(() => {
      const runtime = window.__VOID_PRIVATEER__.getRuntime();
      runtime.damagePlayer(9999, 'probe lethal', false);
      const player = runtime.save.player;
      const before = { throttle: player.throttle, rotation: [...player.rotation], deathTimer: runtime.deathTimer, hull: player.hull };
      runtime.updateSimulation(1 / 60, { throttleDelta: 1, pitch: 1, yaw: 1, roll: 1 });
      return { before, afterInput: { throttle: player.throttle, rotation: [...player.rotation], deathTimer: runtime.deathTimer, hull: player.hull } };
    });
    check('lethal damage starts a finite death timer', death.before.hull === 0 && death.before.deathTimer > 2 && death.before.deathTimer < 2.2 && finite(death.before.deathTimer));
    check('death input is locked', death.afterInput.throttle === death.before.throttle && JSON.stringify(death.afterInput.rotation) === JSON.stringify(death.before.rotation) && death.afterInput.deathTimer < death.before.deathTimer);
    state = await snapshot();
    check('death state remains finite', state.finite);
    check('death outcome is localized and visible', /SHIP LOST|SCHIFF VERLOREN/.test(`${state.hudText} ${state.bodyText} ${state.recentEvents.join(' ')}`) && !/\{source\}/.test(`${state.hudText} ${state.bodyText} ${state.recentEvents.join(' ')}`), JSON.stringify({ recentEvents: state.recentEvents, hud: state.hudText.slice(-180) }));
    await capture('02-death');

    await finishDeath();
    await page.waitForTimeout(120);
    state = await snapshot();
    check('sufficient-credit tow returns to last safe dock', state.dockedAt === 'cairn' && state.lastDockedAt === 'cairn' && state.systemId === 'helios-verge');
    check('sufficient-credit recovery fee is exactly 15 percent', state.credits === 8500);
    check('recovery keeps 35 percent cargo units', state.cargo?.scrap === 3 && state.cargo?.ore === 1);
    check('recovery clears sealed cargo and fails active missions', state.sealedCargo === 0 && state.activeMissions === 0 && state.failedMissionIds.includes('recovery-probe-contract'));
    check('recovery restores damaged resources to finite 35 percent values', state.shield === 0 && state.missiles === 0 && Math.abs(state.hull - state.stats.hull * 0.35) < 1e-6 && Math.abs(state.energy - state.stats.energyCapacity * 0.35) < 1e-6 && Math.abs(state.fuel - state.stats.fuel * 0.35) < 1e-6 && state.finite, JSON.stringify({ hull: state.hull, energy: state.energy, fuel: state.fuel, stats: state.stats, finite: state.finite }));
    check('recovery UI has a readable dock and outcome message', state.visibleIds.includes('dock-screen') && state.dockText.length >= 80 && /CAIRN|Cairn/.test(state.dockText) && /Emergency tow complete|Notabschleppung abgeschlossen/.test(`${state.toastText} ${state.bodyText}`));
    check('recovery has no duplicate modal overlays', state.modalIds.length === 0 && state.visibleIds.filter((id) => id.endsWith('-panel')).length === 0);
    await capture('03-recovery-sufficient');

    // Exercise the player-facing save/resume path from the recovered dock.
    await click('.concourse-hover-ship');
    try {
      await waitFor(() => Boolean(window.__VOID_PRIVATEER__.getRuntime?.()?.save?.player && !window.__VOID_PRIVATEER__.getRuntime().save.player.dockedAt), undefined, 12000);
    } catch {
      check('concourse launch click leaves the recovery dock', false, 'ship preview did not leave dock within 12 seconds');
      await page.evaluate(() => window.__VOID_PRIVATEER__.launch());
      await waitFor(() => Boolean(window.__VOID_PRIVATEER__.getRuntime?.()?.save?.player && !window.__VOID_PRIVATEER__.getRuntime().save.player.dockedAt), undefined, 12000);
    }
    await click('#hud [data-ui-command="pause"]');
    await waitFor(() => !document.querySelector('#pause-panel')?.classList.contains('is-hidden'), undefined, 10000);
    await click('#pause-panel [data-ui-command="quit-title"]');
    await waitFor(() => Boolean(document.querySelector('#title-screen') && !document.querySelector('#title-screen').classList.contains('is-hidden')) && !window.__VOID_PRIVATEER__.getRuntime?.(), undefined, 15000);
    await click('[data-ui-command="resume"]');
    await waitFor(() => Boolean(window.__VOID_PRIVATEER__.getRuntime?.()?.save?.player), undefined, 15000);
    state = await snapshot();
    check('save/resume restores the recovered career', state.dockedAt === null && state.lastDockedAt === 'cairn' && state.credits === 8500 && state.cargo?.scrap === 3 && state.cargo?.ore === 1 && state.finite, JSON.stringify({ dockedAt: state.dockedAt, lastDockedAt: state.lastDockedAt, credits: state.credits, cargo: state.cargo }));

    // Return to the recovery destination before staging the near-broke case.
    // The preceding save/resume assertion intentionally proves the launched
    // flight can be resumed; this dock call keeps the next fee boundary
    // independent and deterministic.
    await page.evaluate(() => window.__VOID_PRIVATEER__.getRuntime().dockAt('cairn'));

    // Near-broke pilots pay all remaining credits, while cargo reduction and
    // destination remain the same. This is the second explicit fee boundary.
    await page.evaluate(() => {
      const runtime = window.__VOID_PRIVATEER__.getRuntime();
      const player = runtime.save.player;
      for (const id of Object.keys(player.cargo))
        player.cargo[id] = 0;
      player.cargo.scrap = 10;
      player.cargo.ore = 4;
      player.credits = 300;
      player.sealedCargo = [];
      runtime.save.activeMissions = [{ id: 'near-broke-probe-contract', kind: 'transport', status: 'accepted', deadline: 999999, origin: 'cairn', destination: 'rook' }];
      runtime.persistSave();
      runtime.launch();
    });
    await waitFor(() => Boolean(window.__VOID_PRIVATEER__.getRuntime?.()?.save?.player && !window.__VOID_PRIVATEER__.getRuntime().save.player.dockedAt), undefined, 15000);
    await page.evaluate(() => window.__VOID_PRIVATEER__.getRuntime().damagePlayer(9999, 'near-broke lethal', false));
    await finishDeath();
    await page.waitForTimeout(120);
    state = await snapshot();
    check('near-broke recovery charges all remaining credits', state.credits === 0 && state.dockedAt === 'cairn');
    check('near-broke recovery still reduces cargo and clears contracts', state.cargo?.scrap === 3 && state.cargo?.ore === 1 && state.activeMissions === 0 && state.finite);
    check('near-broke recovery outcome is readable', /Emergency tow complete|Notabschleppung abgeschlossen/.test(`${state.toastText} ${state.bodyText}`));
    await capture('04-recovery-near-broke');

    // Establish a recognizable career autosave, then enter the simulator from
    // the title screen. The arena save must not replace these career values.
    await page.evaluate(() => {
      const runtime = window.__VOID_PRIVATEER__.getRuntime();
      const player = runtime.save.player;
      player.credits = 7777;
      for (const id of Object.keys(player.cargo))
        player.cargo[id] = 0;
      player.cargo.scrap = 7;
      player.cargo.ore = 2;
      player.hull = 111;
      player.energy = 22;
      player.fuel = 55;
      runtime.persistSave();
      runtime.quitToTitle();
    });
    await waitFor(() => Boolean(document.querySelector('#title-screen') && !document.querySelector('#title-screen').classList.contains('is-hidden')) && !window.__VOID_PRIVATEER__.getRuntime?.(), undefined, 15000);
    const careerBeforeArena = await careerDigest();
    check('career autosave exists before arena', careerBeforeArena?.credits === 7777 && careerBeforeArena?.cargo?.scrap === 7 && careerBeforeArena?.cargo?.ore === 2 && careerBeforeArena?.dockedAt === 'cairn');

    await click('[data-ui-command="arena"]');
    await waitFor(() => !document.querySelector('#arena-panel')?.classList.contains('is-hidden'), undefined, 10000);
    await click('[data-arena-env="open"]');
    await click('[data-arena-scenario="1v1"]');
    await click('[data-arena-difficulty="novice"]');
    await click('[data-ui-command="launch-arena"]');
    await waitFor(() => Boolean(window.__VOID_PRIVATEER__.getRuntime?.()?.arena && window.__VOID_PRIVATEER__.getRuntime().save?.player && !window.__VOID_PRIVATEER__.getRuntime().save.player.dockedAt), undefined, 30000);
    state = await snapshot();
    check('arena launches as a separate undocked simulation', state.arena && state.dockedAt === null && state.finite);
    check('arena start leaves career autosave untouched', sameDigest(await careerDigest(), careerBeforeArena));
    check('arena launch clears the prior recovery toast', !/Emergency tow complete|Notabschleppung abgeschlossen/.test(state.toastText), state.toastText);

    await page.evaluate(() => window.__VOID_PRIVATEER__.getRuntime().damagePlayer(9999, 'arena lethal', false));
    state = await snapshot();
    check('arena death starts the same finite timer', state.arena && state.hull === 0 && state.deathTimer > 2 && state.finite);
    check('arena death outcome is localized and visible', /SHIP LOST|SCHIFF VERLOREN/.test(`${state.hudText} ${state.bodyText} ${state.recentEvents.join(' ')}`) && !/\{source\}/.test(`${state.hudText} ${state.bodyText} ${state.recentEvents.join(' ')}`), JSON.stringify({ recentEvents: state.recentEvents, toast: state.toastText }));
    check('arena death has no stale recovery overlay', !/Emergency tow complete|Notabschleppung abgeschlossen/.test(state.toastText), state.toastText);
    await capture('05-arena-death');
    await finishDeath();
    await page.waitForTimeout(120);
    state = await snapshot();
    check('arena death resets the sortie instead of towing', state.arena && state.dockedAt === null && state.deathTimer === 0 && state.hull === state.stats.hull && state.shield === state.stats.shield && state.energy === state.stats.energyCapacity && state.fuel === state.stats.fuel && state.missiles === state.stats.missileCapacity && state.finite);
    check('arena reset event is localized and visible', /Ship destroyed — arena reset\.|Schiff zerstört — Arena zurückgesetzt\./.test(`${state.hudText} ${state.bodyText} ${state.recentEvents.join(' ')}`), JSON.stringify({ recentEvents: state.recentEvents, toast: state.toastText }));
    check('arena reset remains consequence-free to career autosave', sameDigest(await careerDigest(), careerBeforeArena));
    check('arena reset has no duplicate modal overlays', state.modalIds.length === 0 && state.visibleIds.includes('hud'));
    await capture('06-arena-reset');

    await click('#hud [data-ui-command="pause"]');
    await waitFor(() => !document.querySelector('#pause-panel')?.classList.contains('is-hidden'), undefined, 10000);
    await click('#pause-panel [data-ui-command="quit-title"]');
    await waitFor(() => Boolean(document.querySelector('#title-screen') && !document.querySelector('#title-screen').classList.contains('is-hidden')) && !window.__VOID_PRIVATEER__.getRuntime?.(), undefined, 15000);
    await click('[data-ui-command="resume"]');
    await waitFor(() => Boolean(window.__VOID_PRIVATEER__.getRuntime?.()?.save?.player), undefined, 15000);
    state = await snapshot();
    check('resume after arena returns to the career autosave', state.dockedAt === 'cairn' && state.credits === 7777 && state.cargo?.scrap === 7 && state.cargo?.ore === 2 && state.hull === 111 && state.finite);
    check('final resumed career has no duplicate overlays', state.modalIds.length === 0 && state.visibleIds.includes('dock-screen'));
  } finally {
    if (browser)
      await browser.close().catch(() => undefined);
    server?.kill();
  }

  check('zero console, page, and network errors', browserErrors.length === 0, browserErrors.slice(0, 8).join(' | '));
  console.log(`SUMMARY ${passes.length} passed, ${failures.length} failed`);
  if (failures.length)
    process.exitCode = 1;
};

main().catch((error) => {
  console.error(`FATAL ${error.stack ?? error}`);
  process.exitCode = 1;
});
