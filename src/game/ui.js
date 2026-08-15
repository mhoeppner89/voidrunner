import { COMMODITIES, EQUIPMENT, FACTION_NAMES, GUILD_NAMES, GUILD_RANK_NAMES, LOCATIONS, SHIPS, SYSTEM_MAP_EXTENT, commodityIds, displaySpeed, equipmentIds } from './data.js';
import { cargoCapacity, cargoMass } from './economy.js';
import { formatCredits, formatDuration } from './random.js';
import { equipmentUnlocked, getEffectiveShipStats, refillCost, repairCost } from './shipStats.js';
import { shipTopDownProfile } from './voxelModels.js';
const escapeHtml = (value) => value.replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[char]);
const percent = (value, max) => (max <= 0 ? 0 : Math.max(0, Math.min(100, (value / max) * 100)));
const GAME_VERSION = '0.3.27';
export class GameUI {
    root;
    viewport;
    actions;
    save;
    dockLocation;
    dockTab = 'concourse';
    dockTerminal = 'concourse';
    marketPoint = '';
    barPanel = 'people';
    barPersonId;
    titleVisible = true;
    arenaEnv = 'open';
    arenaScenario = '1v1';
    radarContext;
    // DOM cache: the cockpit HUD is built once and never re-rendered, so the
    // per-frame updateHud path reads nodes from this map instead of re-querying
    // the document dozens of times per frame.
    elementCache = new Map();
    toastId = 0;
    mapPointer;
    lastMapPointerSelection;
    lastHud;
    npcLineIndex = new Map();
    constructor(host) {
        host.innerHTML = this.shellMarkup();
        this.root = host.querySelector('#game-shell');
        this.viewport = host.querySelector('#viewport');
        const radar = host.querySelector('#radar');
        this.radarContext = radar.getContext('2d');
        this.ownHullCanvas = host.querySelector('#own-hull-outline');
        this.targetHullCanvas = host.querySelector('#target-hull-outline');
        this.targetLayout = host.querySelector('.screen-target-layout');
        this.bindStaticEvents();
        this.syncFullscreenButton();
        document.addEventListener('fullscreenchange', this.syncFullscreenButton);
        this.updateOrientationNotice();
        window.addEventListener('resize', this.updateOrientationNotice);
    }
    setActions(actions) {
        this.actions = actions;
    }
    el(selector) {
        let node = this.elementCache.get(selector);
        if (node === undefined) {
            node = this.root.querySelector(selector);
            this.elementCache.set(selector, node);
        }
        return node;
    }
    attachSave(save) {
        this.save = save;
    }
    shellMarkup() {
        return `
      <main id="game-shell" class="steering-tilt">
        <div id="viewport"></div>
        <div class="global-crt-overlay" aria-hidden="true"></div>
        <section id="hud" class="hud is-hidden" aria-label="Cockpit heads-up display">
          <div class="cockpit-vignette" aria-hidden="true"></div>
          <div class="cockpit-art" aria-hidden="true"></div>
          <div class="cockpit-glass" aria-hidden="true"></div>
          <div class="hyperdrive-fx" aria-hidden="true">
            <i class="hyperdrive-fx-vignette"></i>
            <i class="hyperdrive-fx-ring"></i>
            <i class="hyperdrive-fx-streaks"></i>
            <i class="hyperdrive-fx-flash"></i>
          </div>
          <div class="cockpit-screen cockpit-screen-own" aria-label="Own ship status display">
            <div class="screen-heading"><span>OWN SHIP STATUS</span><b id="own-ship-name">WAYFARER</b></div>
            <div class="screen-ship-layout"><canvas class="hull-outline" id="own-hull-outline" aria-hidden="true"></canvas><div class="screen-bars"><div><span>SHIELDS</span><i><b id="screen-own-shield"></b></i><em id="screen-own-shield-value">90</em></div><div><span>ARMOR</span><i><b id="screen-own-armor"></b></i><em id="screen-own-armor-value">100</em></div><div><span>HULL</span><i><b id="screen-own-hull"></b></i><em id="screen-own-hull-value">100</em></div></div><div class="screen-flight"><div><span>SPD</span><b id="screen-own-speed">0</b><small id="screen-own-max-speed">/100</small></div><div><span>THR</span><b id="screen-own-throttle">0</b><small>%</small></div><div><span>FUEL</span><b id="screen-own-fuel">100</b><small>%</small></div><div><span>MSL</span><b id="screen-own-missiles">4</b></div><div><span>HOLD</span><b id="screen-own-cargo">0/32</b></div><div><span>LOAD</span><b id="screen-own-load">0</b><small>%</small></div><div><span>HND</span><b id="screen-own-handling">100</b><small>%</small></div><div><span>CR</span><b id="screen-own-credits">3,200</b></div></div></div>
          </div>
          <div class="cockpit-screen cockpit-screen-radar" aria-label="Radar display; tap to open navigation map">
            <div class="screen-heading"><span>RADAR · TAP MAP</span><b id="screen-radar-zone">OPEN SPACE</b></div>
            <div class="radar-screen-wrap"><canvas id="radar" width="220" height="220" role="button" tabindex="0" aria-label="Open navigation map"></canvas></div>
          </div>
          <div class="cockpit-screen cockpit-screen-target" aria-label="Target status display">
            <div class="screen-heading"><span>TARGET STATUS</span><b id="screen-target-name">NO LOCK</b></div>
            <div class="screen-target-layout"><canvas class="hull-outline" id="target-hull-outline" aria-hidden="true"></canvas><div class="screen-bars"><div><span>SHIELDS</span><i><b id="screen-target-shield"></b></i><em id="screen-target-shield-value">—</em></div><div><span>ARMOR</span><i><b id="screen-target-armor"></b></i><em id="screen-target-armor-value">—</em></div><div><span>HULL</span><i><b id="screen-target-hull"></b></i><em id="screen-target-hull-value">—</em></div></div></div>
            <div id="target-screen-hint" class="target-screen-hint is-hidden" aria-hidden="true"></div>
          </div>
          <div class="cockpit-identity" aria-hidden="true"><span>WAYFARER // HULL 07</span><b>VOIDRUNNER</b></div>

          <div class="hud-top-right target-panel is-hidden" id="target-panel" aria-hidden="true">
            <span class="eyebrow">TARGET</span>
            <strong id="hud-target-name">NO LOCK</strong>
            <span id="hud-target-subtitle">T selects contact</span>
            <div class="micro-bars" id="target-bars"></div>
          </div>
          <div id="target-bracket" class="target-bracket is-hidden" aria-hidden="true"><i></i><i></i><i></i><i></i></div>
          <div id="target-edge-pointer" class="target-edge-pointer is-hidden" aria-hidden="true"><i></i><span></span></div>
          <div class="reticle" aria-hidden="true"><span></span><span></span><span></span><span></span><b></b></div>
          <div class="hud-bottom-center">
            <div id="context-prompt" class="context-prompt is-hidden"></div>
            <div id="scan-readout" class="scan-readout is-hidden"></div>
          </div>
          <div class="touch-controls" aria-label="Touch flight controls">
            <div class="touch-left">
              <div class="touch-throttle" data-touch-throttle>
                <div class="touch-throttle-fill"></div>
                <div class="touch-throttle-thumb" data-touch-throttle-thumb></div>
                <span>THR</span>
              </div>
              <button class="touch-boost" data-touch-action="afterburner" aria-label="Afterburner — hold">AFTERBURN</button>
            </div>
            <div class="touch-right">
              <button id="touch-fire" class="touch-fire" data-touch-action="fire" aria-label="Fire — hold">FIRE</button>
              <button id="touch-missile" class="touch-missile" data-touch-action="missile" aria-label="Missile">MISSILE</button>
            </div>
          </div>
          <div class="hud-corner-buttons">
            <button class="pause-button" data-ui-command="pause" aria-label="Pause">Ⅱ</button>
            <button class="fullscreen-button" data-ui-command="toggle-fullscreen" aria-label="Toggle fullscreen">⛶</button>
          </div>
        </section>

        <section id="title-screen" class="title-screen">
          <div class="title-stars"></div>
          <div class="title-cockpit-frame" aria-hidden="true"></div>
          <div class="title-card">
            <span class="title-kicker">FRONTIER COMMERCE / WARRANTS / RECOVERY</span>
            <span class="title-version">BUILD ${GAME_VERSION}</span>
            <h1>VOID<br><b>RUNNER</b></h1>
            <p>Pilot. Trade. Fight. Survive. Make your name on the bright edge of a dangerous frontier.</p>
            <div class="title-actions">
              <button class="primary" data-ui-command="resume">RESUME FLIGHT</button>
              <button data-ui-command="new">NEW CAREER</button>
              <button data-ui-command="arena">COMBAT SIM</button>
              <button data-ui-command="fullscreen">FULLSCREEN</button>
            </div>
            <div class="title-controls">
              <span>TOUCH: tilt to steer · THRUST · AFTERBURN · FIRE · MISSILE</span>
              <span>KEYBOARD: WASD · Q/E · R/F · Space · T · J</span>
            </div>
            <div class="title-tilt">
              <button data-ui-command="enable-tilt">ENABLE TILT STEER</button>
              <button data-ui-command="calibrate-tilt">SET NEUTRAL</button>
            </div>
          </div>
          <div class="copyright-note">ORIGINAL RETRO-FUTURE ART · LOCAL AUTOSAVE · TOUCH / PAD / KEYBOARD</div>
        </section>

        <section id="dock-screen" class="dock-screen is-hidden" aria-label="Docked location"></section>
        <section id="map-panel" class="modal-panel is-hidden" aria-label="Navigation map"></section>
        <section id="pause-panel" class="modal-panel is-hidden" aria-label="Pause and settings"></section>
        <section id="arena-panel" class="modal-panel is-hidden" aria-label="Combat simulator"></section>
        <div id="toast-stack" class="toast-stack global-toasts" aria-live="polite"></div>
        <div id="rotate-notice" class="rotate-notice is-hidden"><strong>ROTATE DEVICE</strong><span>Landscape gives the cockpit room to breathe.</span></div>
      </main>
    `;
    }
    bindStaticEvents() {
        const mapTargetFromEvent = (event) => event.target.closest('[data-map-target-kind][data-map-target-id]');
        const mapTargetKey = (target) => `${target.dataset.mapTargetKind}:${target.dataset.mapTargetId}`;
        const selectMapTarget = (target) => {
            this.actions?.selectTarget(target.dataset.mapTargetKind, target.dataset.mapTargetId);
            this.hideMap();
        };
        this.root.addEventListener('pointerdown', (event) => {
            if (event.pointerType === 'mouse')
                return;
            const target = mapTargetFromEvent(event);
            if (!target)
                return;
            this.mapPointer = {
                pointerId: event.pointerId,
                x: event.clientX,
                y: event.clientY,
                key: mapTargetKey(target),
            };
        }, { passive: true });
        this.root.addEventListener('pointerup', (event) => {
            const start = this.mapPointer;
            this.mapPointer = undefined;
            if (!start || start.pointerId !== event.pointerId || event.pointerType === 'mouse')
                return;
            const target = mapTargetFromEvent(event);
            if (!target || mapTargetKey(target) !== start.key || Math.hypot(event.clientX - start.x, event.clientY - start.y) > 14)
                return;
            event.preventDefault();
            event.stopPropagation();
            this.lastMapPointerSelection = { key: start.key, at: performance.now() };
            selectMapTarget(target);
        });
        this.root.addEventListener('pointercancel', (event) => {
            if (this.mapPointer?.pointerId === event.pointerId)
                this.mapPointer = undefined;
        });
        this.root.addEventListener('click', (event) => {
            const target = event.target.closest('[data-ui-command], [data-dock-tab], [data-dock-terminal], [data-dock-hotspot], [data-market-point], [data-bar-panel], [data-nav-id], [data-trade], [data-mission-id], [data-equipment-id], [data-ship-id], [data-switch-ship], [data-guild-id], [data-person-id], [data-map-target-kind], [data-arena-env], [data-arena-scenario]');
            if (!target)
                return;
            if (target.dataset.uiCommand)
                this.handleCommand(target.dataset.uiCommand, target);
            else if (target.dataset.arenaEnv) {
                this.arenaEnv = target.dataset.arenaEnv;
                this.root.querySelectorAll('[data-arena-env]').forEach((button) => button.classList.toggle('selected', button === target));
            }
            else if (target.dataset.arenaScenario) {
                this.arenaScenario = target.dataset.arenaScenario;
                this.root.querySelectorAll('[data-arena-scenario]').forEach((button) => button.classList.toggle('selected', button === target));
            }
            else if (target.dataset.mapTargetKind && target.dataset.mapTargetId) {
                const key = mapTargetKey(target);
                const duplicatePointerClick = this.lastMapPointerSelection?.key === key && performance.now() - this.lastMapPointerSelection.at < 700;
                this.lastMapPointerSelection = undefined;
                if (!duplicatePointerClick)
                    selectMapTarget(target);
            }
            else if (target.dataset.barPanel) {
                const panel = target.dataset.barPanel;
                if (panel === 'people' || panel === 'missions' || panel === 'guilds')
                    this.switchToTerminal('bar', panel);
            }
            else if (target.dataset.dockTab) {
                const tab = target.dataset.dockTab;
                if (tab === 'concourse' || tab === 'bar' || tab === 'market')
                    this.switchToTerminal(tab);
            }
            else if (target.dataset.dockTerminal) {
                const terminal = target.dataset.dockTerminal;
                if (terminal === 'concourse' || terminal === 'bar' || terminal === 'market')
                    this.switchToTerminal(terminal);
            }
            else if (target.dataset.dockHotspot) {
                const hotspot = target.dataset.dockHotspot;
                if (hotspot === 'bar' || hotspot === 'market')
                    this.switchToTerminal(hotspot);
                else if (hotspot === 'services') {
                    this.dockTab = 'concourse';
                    this.dockTerminal = 'services';
                    this.renderDock();
                }
            }
            else if (target.dataset.marketPoint) {
                this.openMarketPoint(target.dataset.marketPoint);
            }
            else if (target.dataset.navId) {
                this.actions?.setNav(target.dataset.navId);
                this.hideMap();
            }
            else if (target.dataset.trade) {
                const [kind, commodityId, quantity] = target.dataset.trade.split(':');
                this.actions?.trade(kind, commodityId, Number(quantity));
            }
            else if (target.dataset.missionId) {
                this.actions?.acceptMission(target.dataset.missionId);
            }
            else if (target.dataset.equipmentId) {
                this.actions?.buyEquipment(target.dataset.equipmentId);
            }
            else if (target.dataset.shipId) {
                this.actions?.buyShip(target.dataset.shipId);
            }
            else if (target.dataset.switchShip) {
                this.actions?.switchShip(target.dataset.switchShip);
            }
            else if (target.dataset.guildId) {
                this.actions?.joinGuild(target.dataset.guildId);
            }
            else if (target.dataset.personId) {
                this.talkToPerson(target.dataset.personId);
            }
        });
        const radar = this.root.querySelector('#radar');
        radar?.addEventListener('pointerup', (event) => {
            event.preventDefault();
            event.stopPropagation();
            this.actions?.openMap();
        });
        radar?.addEventListener('keydown', (event) => {
            if (event.key !== 'Enter' && event.key !== ' ')
                return;
            event.preventDefault();
            this.actions?.openMap();
        });
        // Tapping the target monitor engages hyperdrive when a location is locked.
        const targetScreen = this.root.querySelector('.cockpit-screen-target');
        targetScreen?.addEventListener('pointerup', (event) => {
            event.preventDefault();
            event.stopPropagation();
            const id = this.save?.player.currentTargetId;
            if (id && Object.prototype.hasOwnProperty.call(LOCATIONS, id))
                this.actions?.engageHyperdrive();
        });
        this.root.addEventListener('input', (event) => {
            const element = event.target;
            const setting = element.dataset.setting;
            if (!setting)
                return;
            const value = element instanceof HTMLInputElement && element.type === 'checkbox' ? element.checked : element.type === 'range' ? Number(element.value) : element.value;
            this.actions?.setSetting(setting, value);
        });
        this.root.addEventListener('keydown', (event) => {
            if (event.key !== 'Enter' && event.key !== ' ')
                return;
            const target = event.target.closest('[data-ui-command], [data-dock-hotspot], [data-market-point], [data-bar-panel], [data-person-id]');
            if (!target)
                return;
            event.preventDefault();
            target.click();
        });
    }
    handleCommand(command, element) {
        switch (command) {
            case 'resume':
                this.actions?.resume();
                break;
            case 'new':
                if (!this.save || window.confirm('Start a new career and overwrite the local autosave?'))
                    this.actions?.startNew();
                break;
            case 'fullscreen':
                this.actions?.requestFullscreen();
                break;
            case 'arena':
                this.showArena();
                break;
            case 'close-arena':
                this.hideArena();
                break;
            case 'launch-arena':
                this.hideArena();
                this.actions?.startArena(this.arenaEnv, this.arenaScenario);
                break;
            case 'launch':
                this.actions?.launch();
                break;
            case 'pause':
                this.showPause();
                break;
            case 'toggle-fullscreen':
                this.actions?.toggleFullscreen();
                break;
            case 'enable-tilt':
                void this.actions?.enableTilt().then((active) => this.showToast(active ? 'Tilt steering engaged. Set neutral if the ship drifts.' : 'Tilt steering unavailable (no gyroscope, or permission denied).', active ? 'success' : 'warning', 4200));
                break;
            case 'calibrate-tilt':
                if (this.actions?.calibrateTilt())
                    this.showToast('Tilt neutral set: hold the phone level and fly.', 'success', 3200);
                break;
            case 'resume-flight':
                this.hidePause();
                this.actions?.resumeFlight();
                break;
            case 'map':
                this.actions?.openMap();
                break;
            case 'close-map':
                this.hideMap();
                break;
            case 'save':
                this.actions?.saveNow();
                break;
            case 'quit-title':
                this.hidePause();
                this.actions?.quitToTitle();
                break;
            case 'repair':
                this.actions?.repair();
                break;
            case 'refuel':
                this.actions?.refuel();
                break;
            case 'dock-concourse':
                this.dockTab = 'concourse';
                this.dockTerminal = 'concourse';
                this.marketPoint = '';
                this.barPanel = 'people';
                this.barPersonId = undefined;
                this.renderDock();
                break;
            case 'bar-scene':
                this.dockTab = 'bar';
                this.dockTerminal = 'bar';
                this.barPanel = 'people';
                this.barPersonId = undefined;
                this.renderDock();
                break;
            case 'market-overview':
                this.dockTab = 'market';
                this.dockTerminal = 'market';
                this.marketPoint = '';
                this.renderDock();
                break;
            default:
                console.debug('Unhandled UI command', command, element);
        }
    }
    showTitle(hasSave, save) {
        this.save = save;
        this.titleVisible = true;
        this.root.querySelector('#title-screen')?.classList.remove('is-hidden');
        this.root.querySelector('#hud')?.classList.add('is-hidden');
        this.root.querySelector('#dock-screen')?.classList.add('is-hidden');
        this.hideArena();
        const resume = this.root.querySelector('[data-ui-command="resume"]');
        if (resume) {
            resume.disabled = !hasSave;
            resume.textContent = hasSave ? 'RESUME CAREER' : 'NO AUTOSAVE FOUND';
        }
        this.updateOrientationNotice();
    }
    hideTitle() {
        this.titleVisible = false;
        this.root.querySelector('#title-screen')?.classList.add('is-hidden');
        this.updateOrientationNotice();
    }
    showHud() {
        this.root.querySelector('#hud')?.classList.remove('is-hidden');
        this.updateOrientationNotice();
    }
    hideHud() {
        this.root.querySelector('#hud')?.classList.add('is-hidden');
    }
    showDock(save, locationId) {
        this.save = save;
        this.dockLocation = locationId;
        this.dockTab = 'concourse';
        this.dockTerminal = 'concourse';
        this.marketPoint = '';
        this.barPanel = 'people';
        this.barPersonId = undefined;
        this.hideTitle();
        this.hideHud();
        this.root.querySelector('#dock-screen')?.classList.remove('is-hidden');
        this.renderDock();
        this.updateOrientationNotice();
    }
    refreshDock(save) {
        this.save = save;
        if (this.dockLocation)
            this.renderDock();
    }
    hideDock() {
        this.root.querySelector('#dock-screen')?.classList.add('is-hidden');
        this.dockLocation = undefined;
    }
    renderDock() {
        if (!this.save || !this.dockLocation)
            return;
        const dock = this.root.querySelector('#dock-screen');
        const location = LOCATIONS[this.dockLocation];
        dock.style.setProperty('--dock-accent', location.accent);
        dock.style.setProperty('--dock-secondary', location.secondary);
        dock.dataset.location = this.dockLocation;
        dock.dataset.tab = this.dockTab;
        const illustrationScreen = this.dockTerminal === 'bar'
            ? 'bar'
            : this.dockTerminal === 'market'
                ? 'market'
                : 'concourse';
        const terminal = this.dockTerminal ? this.renderDockTab(this.dockTerminal) : '';
        dock.innerHTML = `
      <div class="dock-backdrop">${this.locationIllustration(this.dockLocation, illustrationScreen)}</div>
      <div class="dock-scanlines" aria-hidden="true"></div>
      <header class="dock-header">
        <div><span>${location.kind.toUpperCase()} / ${FACTION_NAMES[location.faction]}</span><h2>${escapeHtml(location.name)}</h2></div>
        ${this.dockTerminal !== 'concourse' ? '<div class="dock-back-button dock-pointer" data-ui-command="dock-concourse" role="button" tabindex="0" aria-label="Return to the concourse">◀ CONCOURSE</div>' : ''}
        <div class="dock-wallet"><span>AVAILABLE CREDIT</span><strong>${formatCredits(this.save.player.credits)}</strong><small>${SHIPS[this.save.player.shipId].name} · ${cargoMass(this.save.player).toFixed(1)}/${cargoCapacity(this.save.player)} mass</small></div>
      </header>
      <div class="dock-content">${terminal}</div>
    `;
        const content = dock.querySelector('.dock-content');
        if (content)
            content.scrollTop = 0;
        if (this.dockTerminal === 'market' && this.marketPoint)
            this.renderMarketPoint(this.marketPoint);
    }
    renderLandingScene() {
        return this.renderConcourse();
    }
    renderDockTab(tab) {
        if (!this.save || !this.dockLocation)
            return '';
        if (tab === 'services')
            return this.renderServices();
        switch (tab) {
            case 'bar':
                return this.renderBar();
            case 'market':
                return this.renderMarket();
            case 'missions':
                return this.renderMissions();
            case 'guilds':
                return this.renderGuilds();
            case 'equipment':
                return this.renderEquipment();
            case 'shipyard':
                return this.renderShipyard();
            case 'concourse':
            default:
                return this.renderConcourse();
        }
    }
    renderConcourse() {
        return `
      <div class="concourse-screen station-scene" aria-label="Concourse points of interest">
        <div class="scene-pointers" aria-label="Concourse actions">
          <div class="scene-pointer concourse-pointer-ship" data-ui-command="launch" role="button" tabindex="0" aria-label="Launch the docked ship"><i>↗</i><b>YOUR SHIP</b><small>Launch</small></div>
          <div class="scene-pointer concourse-pointer-services" data-dock-hotspot="services" role="button" tabindex="0" aria-label="Open services"><i>⚙</i><b>SERVICES</b><small>Repair and refuel</small></div>
          <div class="scene-pointer concourse-pointer-market" data-dock-hotspot="market" role="button" tabindex="0" aria-label="Enter the market"><i>▣</i><b>MARKET</b><small>Trade and fit out</small></div>
          <div class="scene-pointer concourse-pointer-bar" data-dock-hotspot="bar" role="button" tabindex="0" aria-label="Enter the bar"><i>✦</i><b>BAR</b><small>Guilds and missions</small></div>
        </div>
      </div>
    `;
    }
    switchToTerminal(tab, panel = 'people') {
        this.dockTab = tab;
        this.dockTerminal = tab;
        if (tab === 'bar') {
            this.barPanel = panel;
            this.barPersonId = undefined;
        }
        else if (tab === 'market') {
            this.marketPoint = '';
        }
        else {
            this.marketPoint = '';
        }
        this.renderDock();
    }
    renderBar() {
        const people = LOCATIONS[this.dockLocation].people ?? [];
        if (this.barPanel === 'missions')
            return this.renderMissions();
        if (this.barPanel === 'guilds')
            return this.renderGuilds();
        if (this.barPersonId)
            return this.renderBarDialogue(this.barPersonId);
        return `
      <div class="bar-scene station-scene" aria-label="Bar points of interest">
        <div class="scene-pointers" aria-label="Bar actions">
          <div class="scene-pointer bar-pointer-missions" data-bar-panel="missions" role="button" tabindex="0" aria-label="Open the mission board"><i>✦</i><b>MISSION BOARD</b><small>Find work</small></div>
          <div class="scene-pointer bar-pointer-guilds" data-bar-panel="guilds" role="button" tabindex="0" aria-label="Open guilds"><i>◇</i><b>GUILDS</b><small>Find allies</small></div>
          ${people.map((person, index) => `
            <div class="scene-pointer bar-person-pointer bar-person-${index}" data-person-id="${person.id}" role="button" tabindex="0" aria-label="Talk to ${escapeHtml(person.name)}"><i>●</i><b>${escapeHtml(person.name)}</b><small>${escapeHtml(person.role)}</small></div>
          `).join('')}
        </div>
      </div>
    `;
    }
    talkToPerson(personId) {
        const person = LOCATIONS[this.dockLocation].people?.find((entry) => entry.id === personId);
        if (!person)
            return;
        const index = this.npcLineIndex.get(personId) ?? 0;
        this.npcLineIndex.set(personId, index + 1);
        this.barPanel = 'people';
        this.barPersonId = personId;
        this.renderDock();
    }
    renderBarDialogue(personId) {
        const person = LOCATIONS[this.dockLocation].people?.find((entry) => entry.id === personId);
        if (!person)
            return this.renderBar();
        const lineIndex = Math.max(0, (this.npcLineIndex.get(personId) ?? 1) - 1);
        const line = person.lines[lineIndex % person.lines.length];
        return `
      <div class="bar-dialogue-screen station-scene" aria-label="Conversation with ${escapeHtml(person.name)}">
        <div class="scene-pointer scene-return-pointer" data-ui-command="bar-scene" role="button" tabindex="0" aria-label="Return to the bar"><i>◀</i><b>BAR FLOOR</b><small>Back to the room</small></div>
        <section class="bar-dialogue-card" data-person-id="${person.id}" role="button" tabindex="0" aria-label="Continue talking to ${escapeHtml(person.name)}">
          ${this.portraitImage(person.id, person.name)}
          <div><span class="eyebrow">${escapeHtml(person.name)} / ${escapeHtml(person.affiliation)}</span><h3>${escapeHtml(person.role)}</h3><p>“${escapeHtml(line)}”</p><small>Click ${escapeHtml(person.name)} again for another topic.</small></div>
        </section>
      </div>
    `;
    }
    renderMarket() {
        if (!this.marketPoint) {
            return `
        <div class="market-scene station-scene" aria-label="Market points of interest">
          <div class="scene-pointers" aria-label="Market actions">
            <div class="scene-pointer market-pointer-commodities" data-market-point="commodities" role="button" tabindex="0" aria-label="Open commodity market"><i>▦</i><b>COMMODITY MARKET</b><small>Buy and sell cargo</small></div>
            <div class="scene-pointer market-pointer-equipment" data-market-point="equipment" role="button" tabindex="0" aria-label="Open ship parts"><i>⚙</i><b>SHIP PARTS</b><small>Fit out your ship</small></div>
            <div class="scene-pointer market-pointer-shipyard" data-market-point="shipyard" role="button" tabindex="0" aria-label="Open the ship dealer"><i>↗</i><b>NEW SHIP</b><small>One hull for sale</small></div>
          </div>
        </div>
      `;
        }
        return `
      <div class="market-screen market-menu-screen">
        <div class="scene-pointer scene-return-pointer" data-ui-command="market-overview" role="button" tabindex="0" aria-label="Return to the market floor"><i>◀</i><b>MARKET FLOOR</b><small>Back to the scene</small></div>
        <nav class="market-points" aria-label="Market points"><button class="${this.marketPoint === 'commodities' ? 'active' : ''}" data-market-point="commodities">COMMODITY MARKET</button><button class="${this.marketPoint === 'equipment' ? 'active' : ''}" data-market-point="equipment">SHIP PARTS</button><button class="${this.marketPoint === 'shipyard' ? 'active' : ''}" data-market-point="shipyard">NEW SHIP</button></nav>
        <div id="market-point-content"></div>
      </div>
    `;
    }
    openMarketPoint(point) {
        this.marketPoint = point;
        this.dockTab = 'market';
        this.dockTerminal = 'market';
        this.renderDock();
    }
    renderMarketPoint(point) {
        const content = this.root.querySelector('#market-point-content');
        const marketScreen = this.root.querySelector('.market-screen');
        if (!content || !marketScreen || !this.save || !this.dockLocation)
            return;
        this.marketPoint = point;
        marketScreen.querySelectorAll('[data-market-point]').forEach((button) => button.classList.toggle('active', button.dataset.marketPoint === point));
        if (point === 'equipment')
            content.innerHTML = this.renderEquipment();
        else if (point === 'shipyard')
            content.innerHTML = this.renderShipyard();
        else {
            const market = this.save.world.market[this.dockLocation];
            content.innerHTML = `
        <div class="market-layout">
          <div class="table-title"><div><span class="eyebrow">COMMODITY EXCHANGE</span><h3>Spot market</h3></div><div><span>HOLD</span><b>${cargoMass(this.save.player).toFixed(1)} / ${cargoCapacity(this.save.player)} mass</b></div></div>
          <div class="market-table">
          <div class="market-row market-head"><span>COMMODITY</span><span>PRICE</span><span>SUP / DEM</span><span>HOLD</span><span>ACTIONS</span></div>
          ${commodityIds.map((id) => {
                const item = market[id];
                const commodity = COMMODITIES[id];
                const owned = this.save.player.cargo[id] ?? 0;
                return `<div class="market-row ${commodity.legal ? '' : 'restricted'}">
              <span><b>${escapeHtml(commodity.name)}</b><small>${escapeHtml(commodity.category)} · ${commodity.mass} mass</small></span>
              <span><b>${formatCredits(item.lastPrice)}</b><small>${item.lastPrice < commodity.basePrice * 0.9 ? 'LOW' : item.lastPrice > commodity.basePrice * 1.15 ? 'HIGH' : 'NOMINAL'}</small></span>
              <span><b>${item.supply} / ${item.demand}</b><small>${item.supply > item.demand ? 'SURPLUS' : 'DEMAND'}</small></span>
              <span><b>${owned}</b><small>UNITS</small></span>
              <span class="market-actions"><button data-trade="buy:${id}:1">BUY 1</button><button data-trade="buy:${id}:5">BUY 5</button><button data-trade="sell:${id}:1" ${owned <= 0 ? 'disabled' : ''}>SELL 1</button><button data-trade="sell:${id}:999" ${owned <= 0 ? 'disabled' : ''}>SELL ALL</button></span>
            </div>`;
            }).join('')}
          </div>
        </div>`;
        }
    }
    missionBadge(mission) {
        return mission.kind === 'bounty' ? 'WARRANT' : mission.kind === 'transport' ? 'TIMED' : mission.kind.toUpperCase();
    }
    renderMissions() {
        const offers = this.save.world.offers[this.dockLocation] ?? [];
        const active = this.save.activeMissions;
        return `
      <div class="mission-layout">
        <section>
          <div class="table-title"><div><span class="eyebrow">CONTRACT TERMINAL</span><h3>Available work</h3></div><small>Maximum 6 active</small></div>
          <div class="mission-grid">
            ${offers.length ? offers.map((mission) => `<article class="mission-card ${mission.kind}">
              <header><span>${this.missionBadge(mission)}</span><b>${formatCredits(mission.reward)}</b></header>
              <h4>${escapeHtml(mission.title)}</h4>
              <p>${escapeHtml(mission.briefing)}</p>
              <dl><div><dt>ISSUER</dt><dd>${escapeHtml(mission.issuer)}</dd></div><div><dt>DEADLINE</dt><dd>${formatDuration(mission.deadline - this.save.world.time)}</dd></div><div><dt>BOND</dt><dd>${formatCredits(mission.deposit)}</dd></div><div><dt>GUILD REP</dt><dd>+${mission.guildRep}</dd></div></dl>
              <button class="primary compact" data-mission-id="${mission.id}">ACCEPT CONTRACT</button>
            </article>`).join('') : '<p>No fresh contracts. Launch, trade, or return after the board cycles.</p>'}
          </div>
        </section>
        <aside class="active-list"><span class="eyebrow">ACTIVE</span>${active.length ? active.map((mission) => `<article><b>${escapeHtml(mission.title)}</b><small>${formatDuration(mission.deadline - this.save.world.time)} · ${formatCredits(mission.reward)}</small></article>`).join('') : '<p>None.</p>'}</aside>
      </div>
    `;
    }
    renderServices() {
        const stats = getEffectiveShipStats(this.save.player);
        const repairs = repairCost(this.save.player);
        const refill = refillCost(this.save.player);
        return `
      <div class="service-grid">
        <article class="service-card"><span class="eyebrow">HULL / ARMOR</span><h3>Repair bay</h3><div class="service-bars"><label>HULL <i><b style="width:${percent(this.save.player.hull, stats.hull)}%"></b></i><em>${Math.ceil(this.save.player.hull)}/${stats.hull}</em></label><label>ARMOR <i><b style="width:${percent(this.save.player.armor, stats.armor)}%"></b></i><em>${Math.ceil(this.save.player.armor)}/${stats.armor}</em></label></div><p>Replace ablative plate, patch pressure structure, and clear combat faults.</p><button class="primary" data-ui-command="repair" ${repairs <= 0 ? 'disabled' : ''}>REPAIR · ${formatCredits(repairs)}</button></article>
        <article class="service-card"><span class="eyebrow">CONSUMABLES</span><h3>Fuel and ordnance</h3><div class="service-bars"><label>FUEL <i><b style="width:${percent(this.save.player.fuel, stats.fuel)}%"></b></i><em>${Math.ceil(this.save.player.fuel)}/${stats.fuel}</em></label><label>MISSILES <i><b style="width:${percent(this.save.player.missiles, stats.missileCapacity)}%"></b></i><em>${this.save.player.missiles}/${stats.missileCapacity}</em></label></div><p>Refill reactor mass, afterburn propellant, and standard seeker missiles.</p><button class="primary" data-ui-command="refuel" ${refill <= 0 ? 'disabled' : ''}>REFILL · ${formatCredits(refill)}</button></article>
        <article class="service-card danger-service"><span class="eyebrow">INSURANCE NOTE</span><h3>Emergency recovery</h3><p>A destroyed ship is towed to the last safe dock. The service retains cargo, mission bonds, and a percentage of liquid credit.</p><b>FLY WITH A RESERVE.</b></article>
      </div>
    `;
    }
    renderEquipment() {
        return `
      <div class="equipment-grid">
        ${equipmentIds.map((id) => {
            const item = EQUIPMENT[id];
            const owned = this.save.player.equipment.includes(id);
            const unlocked = equipmentUnlocked(this.save.player, id);
            return `<article class="equipment-card ${owned ? 'owned' : ''} ${unlocked ? '' : 'locked'}">
            <header><span>${item.category.toUpperCase()}</span><b>${owned ? 'INSTALLED' : formatCredits(item.price)}</b></header>
            <h3>${escapeHtml(item.name)}</h3><p>${escapeHtml(item.description)}</p><strong>${escapeHtml(item.stat)}</strong>
            ${item.requiredGuild ? `<small>Requires ${GUILD_NAMES[item.requiredGuild]} rank ${item.requiredRank}</small>` : '<small>Open market equipment</small>'}
            <button data-equipment-id="${id}" ${owned || !unlocked ? 'disabled' : ''}>${owned ? 'INSTALLED' : unlocked ? 'PURCHASE / INSTALL' : 'GUILD LOCKED'}</button>
          </article>`;
        }).join('')}
      </div>
    `;
    }
    renderShipyard() {
        const saleId = LOCATIONS[this.dockLocation].shipForSale ?? 'wayfarer';
        const ship = SHIPS[saleId];
        const owned = this.save.player.ownedShips.includes(saleId);
        const active = this.save.player.shipId === saleId;
        return `
      <div class="shipyard-grid">
        <article class="ship-card ${active ? 'active' : ''}">
          <div class="ship-silhouette ${saleId}">${this.shipArt(saleId, ship.name)}</div>
          <header><span>${escapeHtml(ship.className)}</span><b>${saleId === 'wayfarer' ? 'STARTER HULL' : formatCredits(ship.price)}</b></header>
          <h3>${escapeHtml(ship.name)}</h3><p>${escapeHtml(ship.description)}</p>
          <dl><div><dt>SPEED</dt><dd>${displaySpeed(ship.maxSpeed)}</dd></div><div><dt>SHIELD</dt><dd>${ship.shield}</dd></div><div><dt>ARMOR</dt><dd>${ship.armor}</dd></div><div><dt>CARGO</dt><dd>${ship.cargo}</dd></div><div><dt>MISSILES</dt><dd>${ship.missileCapacity}</dd></div><div><dt>GUN</dt><dd>${ship.gunDamage}</dd></div><div><dt>TURN</dt><dd>${ship.angularAcceleration.toFixed(2)}</dd></div><div><dt>ACCL</dt><dd>${ship.acceleration}</dd></div></dl>
          <p class="ship-handling-note">Handling falls up to 24% as the cargo hold fills — watch LOAD and HND on your flight readout.</p>
          ${active ? '<button disabled>ACTIVE SHIP</button>' : owned ? `<button data-switch-ship="${saleId}">SWITCH TO SHIP</button>` : `<button class="primary" data-ship-id="${saleId}">PURCHASE HULL</button>`}
        </article>
      </div>
    `;
    }
    renderGuilds() {
        return `
      <div class="guild-grid">
        ${Object.keys(GUILD_NAMES).map((id) => {
            const rep = this.save.player.guildRep[id];
            const rank = this.save.player.guildRank[id];
            const joined = rep > 0;
            const nextThreshold = [20, 65, 145, 145][rank];
            return `<article class="guild-card guild-${id}">
            <span class="eyebrow">${escapeHtml(GUILD_NAMES[id])}</span>
            <h3>${GUILD_RANK_NAMES[id][rank]}</h3>
            <div class="guild-meter"><i><b style="width:${rank >= 3 ? 100 : Math.min(100, (rep / nextThreshold) * 100)}%"></b></i><em>${rep} REP</em></div>
            <p>${id === 'merchant' ? 'Better route intelligence, cargo contracts, and external hold equipment.' : id === 'bounty' ? 'Higher-value warrants, combat equipment, and recognized kill authentication.' : id === 'mining' ? 'Survey claims, rich deposit data, and advanced extraction lances.' : 'Protected recovery claims, rare wreck data, and long-range tractor systems.'}</p>
            <button data-guild-id="${id}" ${joined ? 'disabled' : ''}>${joined ? 'MEMBERSHIP ACTIVE' : 'REGISTER'}</button>
          </article>`;
        }).join('')}
      </div>
    `;
    }
    portraitImage(personId, personName) {
        return `<img class="avatar" src="./art/portraits/${escapeHtml(personId)}.webp" alt="Pixel portrait of ${escapeHtml(personName)}" draggable="false">`;
    }
    shipArt(shipId, shipName) {
        const source = shipId === 'wayfarer'
            ? './art/sprites/player-courier/01.png'
            : './art/sprites/cargo-hauler/01.png';
        return `<img src="${source}" alt="Pixel ship profile of ${escapeHtml(shipName)}" draggable="false">`;
    }
    locationIllustration(locationId, screen = 'concourse') {
        const location = LOCATIONS[locationId];
        const file = screen === 'bar'
            ? `bar-${locationId}`
            : screen === 'market'
                ? `market-${locationId}`
                : locationId;
        const label = screen === 'bar'
            ? `${location.name} bar`
            : screen === 'market'
                ? `${location.name} market`
                : location.name;
        return `<img src="./art/locations/v3/${file}.png" alt="Pixel-art view of ${escapeHtml(label)}" draggable="false">`;
    }
    updateHud(model) {
        this.lastHud = model;
        const setText = (selector, value) => {
            const element = this.el(selector);
            if (element)
                element.textContent = value;
        };
        const setBar = (selector, value) => {
            const element = this.el(selector);
            if (element)
                element.style.width = `${Math.max(0, Math.min(100, value))}%`;
        };
        const targetHint = this.el('#target-screen-hint');
        if (targetHint) {
            const state = model.hyperdrive?.fx ?? 'none';
            const progress = Math.max(0, Math.min(1, model.hyperdrive?.progress ?? 0));
            let hint = '';
            if (model.target?.kind === 'location' && state === 'none')
                hint = 'ACTIVATE HYPERDRIVE';
            else if (state === 'spooling')
                hint = `CHARGING ${Math.round(progress * 100)}%`;
            else if (state === 'active')
                hint = 'HYPERDRIVE';
            else if (state === 'interrupt')
                hint = 'INTERRUPTED';
            targetHint.textContent = hint;
            targetHint.classList.toggle('is-hidden', !hint);
        }
        setText('#hud-zone', model.zone.toUpperCase());
        setText('#hud-mode', model.mode.toUpperCase());
        setText('#screen-own-speed', Math.round(model.speed).toString());
        setText('#screen-own-max-speed', `/${Math.round(model.maxSpeed)}`);
        setText('#screen-own-throttle', Math.round(model.throttle * 100).toString());
        setText('#screen-own-fuel', Math.round((model.fuel / model.maxFuel) * 100).toString());
        setText('#screen-own-missiles', model.missiles.toString());
        setText('#screen-own-cargo', `${model.cargo.toFixed(0)}/${model.cargoCapacity}`);
        setText('#screen-own-load', (model.loadPercent ?? 0).toString());
        setText('#screen-own-handling', (model.handlingPercent ?? 100).toString());
        setText('#screen-own-credits', Math.floor(model.credits).toLocaleString('en-US'));
        setText('#own-ship-name', model.shipName.toUpperCase());
        setText('#screen-radar-zone', model.zone.toUpperCase());
        setText('#screen-own-shield-value', Math.ceil(model.shield).toString());
        setText('#screen-own-armor-value', Math.ceil(model.armor).toString());
        setText('#screen-own-hull-value', Math.ceil(model.hull).toString());
        setBar('#screen-own-shield', percent(model.shield, model.maxShield));
        setBar('#screen-own-armor', percent(model.armor, model.maxArmor));
        setBar('#screen-own-hull', percent(model.hull, model.maxHull));
        const prompt = this.el('#context-prompt');
        if (prompt) {
            prompt.textContent = model.prompt ?? '';
            prompt.classList.toggle('is-hidden', !model.prompt);
        }
        const scan = this.el('#scan-readout');
        if (scan) {
            scan.textContent = model.scanText ?? '';
            scan.classList.toggle('is-hidden', !model.scanText);
        }
        this.updateTarget(model.target);
        this.drawRadar(model.contacts);
        this.drawHullOutline(this.ownHullCanvas, model.playerVariant ?? 'kestrel', 0, 'rgba(111, 216, 236, 0.9)', false);
        const throttleThumb = this.el('[data-touch-throttle-thumb]');
        const throttleFill = this.el('.touch-throttle-fill');
        if (throttleThumb)
            throttleThumb.style.bottom = `${model.throttle * 100}%`;
        if (throttleFill)
            throttleFill.style.height = `${model.throttle * 100}%`;
    }
    updateTarget(target) {
        const bracket = this.el('#target-bracket');
        const edgePointer = this.el('#target-edge-pointer');
        const targetPanel = this.el('#target-panel');
        if (!target) {
            this.el('#hud-target-name').textContent = 'NO LOCK';
            this.el('#hud-target-subtitle').textContent = 'T selects contact';
            this.el('#target-bars').innerHTML = '';
            this.setTargetScreenValue(undefined);
            this.updateWeaponButtons(undefined);
            bracket?.classList.add('is-hidden');
            bracket?.classList.remove('is-hostile');
            edgePointer?.classList.add('is-hidden');
            edgePointer?.classList.remove('is-hostile');
            targetPanel?.classList.remove('is-hostile');
            return;
        }
        const hostile = target.kind === 'ship' && target.hostile;
        bracket?.classList.toggle('is-hostile', hostile);
        edgePointer?.classList.toggle('is-hostile', hostile);
        targetPanel?.classList.toggle('is-hostile', hostile);
        this.el('#hud-target-name').textContent = target.name;
        this.el('#hud-target-subtitle').textContent = `${target.subtitle} · ${Math.round(target.distance)} km${target.scanned === false ? ' · UNSCANNED' : ''}`;
        const bars = this.el('#target-bars');
        bars.innerHTML = [
            target.maxShield ? `<i><b style="width:${percent(target.shield ?? 0, target.maxShield)}%"></b></i>` : '',
            target.maxArmor ? `<i><b style="width:${percent(target.armor ?? 0, target.maxArmor)}%"></b></i>` : '',
            target.maxHull ? `<i><b style="width:${percent(target.hull ?? 0, target.maxHull)}%"></b></i>` : '',
        ].join('');
        this.setTargetScreenValue(target);
        this.updateWeaponButtons(target.kind);
        if (bracket && target.onScreen && target.screenX !== undefined && target.screenY !== undefined) {
            bracket.style.transform = `translate(${target.screenX}px, ${target.screenY}px)`;
            bracket.classList.remove('is-hidden');
        }
        else {
            bracket?.classList.add('is-hidden');
        }
        if (target.edge && edgePointer) {
            edgePointer.style.transform = `translate(${target.edge.x}px, ${target.edge.y}px)`;
            const arm = edgePointer.querySelector('i');
            if (arm)
                arm.style.transform = `rotate(${target.edge.angleDeg}deg)`;
            const label = edgePointer.querySelector('span');
            if (label)
                label.textContent = `${Math.round(target.distance)} km`;
            edgePointer.classList.remove('is-hidden');
        }
        else {
            edgePointer?.classList.add('is-hidden');
        }
    }
    updateWeaponButtons(kind) {
        const fire = this.el('#touch-fire');
        const missile = this.el('#touch-missile');
        if (!fire || !missile)
            return;
        const mining = kind === 'asteroid';
        const salvage = kind === 'wreck';
        const utility = mining || salvage;
        fire.textContent = mining ? 'MINE' : salvage ? 'SALVAGE' : 'FIRE';
        missile.textContent = utility ? 'SCAN' : 'MISSILE';
        fire.classList.toggle('is-mining', mining);
        fire.classList.toggle('is-salvage', salvage);
        missile.classList.toggle('is-scan', utility);
        fire.setAttribute('aria-label', mining ? 'Mine — hold' : salvage ? 'Salvage — hold' : 'Fire — hold');
        missile.setAttribute('aria-label', utility ? 'Scan target' : 'Missile');
    }
    setTargetScreenValue(target) {
        const setText = (selector, value) => {
            const element = this.el(selector);
            if (element)
                element.textContent = value;
        };
        const setBar = (selector, value) => {
            const element = this.el(selector);
            if (element)
                element.style.width = `${Math.max(0, Math.min(100, value))}%`;
        };
        const clearHull = () => {
            const canvas = this.targetHullCanvas;
            if (canvas)
                canvas.getContext('2d').clearRect(0, 0, canvas.width, canvas.height);
        };
        const isShip = Boolean(target && target.kind === 'ship');
        // Ships show shield/armor/hull bars; stations, planets, asteroids and wrecks
        // are invulnerable, so the target monitor shows only their outline.
        this.targetLayout?.classList.toggle('no-bars', !isShip);
        if (!target) {
            setText('#screen-target-name', 'NO LOCK');
            setText('#screen-target-shield-value', '—');
            setText('#screen-target-armor-value', '—');
            setText('#screen-target-hull-value', '—');
            setBar('#screen-target-shield', 0);
            setBar('#screen-target-armor', 0);
            setBar('#screen-target-hull', 0);
            clearHull();
            return;
        }
        setText('#screen-target-name', target.name.toUpperCase());
        setText('#screen-target-shield-value', isShip ? Math.ceil(target.shield ?? 0).toString() : '—');
        setText('#screen-target-armor-value', isShip ? Math.ceil(target.armor ?? 0).toString() : '—');
        setText('#screen-target-hull-value', isShip ? Math.ceil(target.hull ?? 0).toString() : '—');
        setBar('#screen-target-shield', percent(target.shield ?? 0, target.maxShield ?? 0));
        setBar('#screen-target-armor', percent(target.armor ?? 0, target.maxArmor ?? 0));
        setBar('#screen-target-hull', percent(target.hull ?? 0, target.maxHull ?? 0));
        if (isShip) {
            this.drawHullOutline(this.targetHullCanvas, target.variant ?? 'kestrel', target.heading ?? 0, 'rgba(255, 192, 70, 0.92)', Boolean(target.hostile));
        }
        else {
            this.drawObjectOutline(this.targetHullCanvas, target.objectKind ?? target.kind);
        }
    }
    drawObjectOutline(canvas, kind, accent = 'rgba(255, 192, 70, 0.92)') {
        if (!canvas)
            return;
        const ctx = canvas.getContext('2d');
        const ratio = Math.min(2, window.devicePixelRatio || 1);
        const cssW = canvas.clientWidth || 150;
        const cssH = canvas.clientHeight || 110;
        const width = Math.max(60, Math.floor(cssW * ratio));
        const height = Math.max(60, Math.floor(cssH * ratio));
        if (canvas.width !== width || canvas.height !== height) {
            canvas.width = width;
            canvas.height = height;
        }
        ctx.clearRect(0, 0, width, height);
        const cx = width / 2;
        const cy = height / 2;
        const r = Math.min(width, height) * 0.32;
        ctx.strokeStyle = accent;
        ctx.fillStyle = accent;
        ctx.lineWidth = Math.max(1, ratio);
        if (kind === 'planet') {
            ctx.fillStyle = 'rgba(255, 192, 70, 0.14)';
            ctx.beginPath();
            ctx.arc(cx, cy, r, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = accent;
            ctx.beginPath();
            ctx.arc(cx, cy, r, 0, Math.PI * 2);
            ctx.stroke();
            ctx.beginPath();
            ctx.moveTo(cx - r, cy);
            ctx.lineTo(cx + r, cy);
            ctx.stroke();
            ctx.beginPath();
            ctx.ellipse(cx, cy, r * 1.55, r * 0.42, -0.4, 0, Math.PI * 2);
            ctx.stroke();
        }
        else if (kind === 'station') {
            const n = 6;
            ctx.beginPath();
            for (let i = 0; i < n; i += 1) {
                const a = (i / n) * Math.PI * 2 - Math.PI / 2;
                const x = cx + Math.cos(a) * r;
                const y = cy + Math.sin(a) * r;
                if (i === 0)
                    ctx.moveTo(x, y);
                else
                    ctx.lineTo(x, y);
            }
            ctx.closePath();
            ctx.stroke();
            ctx.beginPath();
            ctx.arc(cx, cy, r * 0.52, 0, Math.PI * 2);
            ctx.stroke();
            for (let i = 0; i < 3; i += 1) {
                const a = (i / 3) * Math.PI - Math.PI / 2;
                ctx.beginPath();
                ctx.moveTo(cx, cy);
                ctx.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
                ctx.stroke();
            }
            ctx.beginPath();
            ctx.arc(cx, cy, r * 0.12, 0, Math.PI * 2);
            ctx.fill();
        }
        else if (kind === 'asteroid') {
            const factors = [1.0, 0.66, 0.9, 0.72, 1.02, 0.8, 0.62, 0.94];
            const points = factors.map((f, i) => {
                const a = (i / factors.length) * Math.PI * 2;
                return [cx + Math.cos(a) * r * f, cy + Math.sin(a) * r * f];
            });
            ctx.fillStyle = 'rgba(255, 192, 70, 0.14)';
            ctx.beginPath();
            ctx.moveTo(points[0][0], points[0][1]);
            for (let i = 1; i < points.length; i += 1)
                ctx.lineTo(points[i][0], points[i][1]);
            ctx.closePath();
            ctx.fill();
            ctx.fillStyle = accent;
            ctx.beginPath();
            ctx.moveTo(points[0][0], points[0][1]);
            for (let i = 1; i < points.length; i += 1)
                ctx.lineTo(points[i][0], points[i][1]);
            ctx.closePath();
            ctx.stroke();
            for (const [dx, dy, cr] of [[-0.3, -0.15, 0.14], [0.2, 0.25, 0.1], [0.05, -0.32, 0.08]]) {
                ctx.beginPath();
                ctx.arc(cx + r * dx, cy + r * dy, r * cr, 0, Math.PI * 2);
                ctx.stroke();
            }
        }
        else {
            for (const [dx, dy, w, h, rot] of [[-0.4, 0.12, 0.5, 0.16, 0.5], [0.26, -0.26, 0.34, 0.12, -0.4], [0.05, 0.34, 0.2, 0.2, 0.1]]) {
                ctx.save();
                ctx.translate(cx + r * dx, cy + r * dy);
                ctx.rotate(rot);
                ctx.fillStyle = 'rgba(255, 192, 70, 0.14)';
                ctx.fillRect((-r * w) / 2, (-r * h) / 2, r * w, r * h);
                ctx.fillStyle = accent;
                ctx.strokeRect((-r * w) / 2, (-r * h) / 2, r * w, r * h);
                ctx.restore();
            }
        }
    }
    drawHullOutline(canvas, variant, heading = 0, accent = 'rgba(111, 216, 236, 0.9)', hostile = false) {
        if (!canvas)
            return;
        const ctx = canvas.getContext('2d');
        const profile = shipTopDownProfile(variant ?? 'kestrel');
        const ratio = Math.min(2, window.devicePixelRatio || 1);
        const cssW = canvas.clientWidth || 150;
        const cssH = canvas.clientHeight || 110;
        const width = Math.max(60, Math.floor(cssW * ratio));
        const height = Math.max(60, Math.floor(cssH * ratio));
        if (canvas.width !== width || canvas.height !== height) {
            canvas.width = width;
            canvas.height = height;
        }
        ctx.clearRect(0, 0, width, height);
        const cx = width / 2;
        const cy = height / 2;
        const centerX = (profile.minX + profile.maxX) / 2;
        const centerZ = (profile.minZ + profile.maxZ) / 2;
        const gridW = profile.maxX - profile.minX + 1;
        const gridH = profile.maxZ - profile.minZ + 1;
        const scale = Math.min((width * 0.8) / gridW, (height * 0.8) / gridH);
        ctx.save();
        ctx.translate(cx, cy);
        // Guard against NaN/Inf from a transiently bad target orientation so the
        // transform can never corrupt the whole canvas.
        ctx.rotate(Number.isFinite(heading) ? heading : 0);
        const mapX = (x) => (x - centerX) * scale;
        const mapZ = (z) => (z - centerZ) * scale;
        ctx.fillStyle = hostile ? 'rgba(255, 86, 78, 0.18)' : 'rgba(111, 216, 236, 0.15)';
        for (const [x, z] of profile.cells)
            ctx.fillRect(mapX(x), mapZ(z), scale * 0.96, scale * 0.96);
        ctx.strokeStyle = hostile ? 'rgba(255, 92, 84, 0.95)' : accent;
        ctx.lineWidth = Math.max(1, ratio);
        ctx.beginPath();
        for (const [x1, z1, x2, z2] of profile.edges) {
            ctx.moveTo(mapX(x1), mapZ(z1));
            ctx.lineTo(mapX(x2), mapZ(z2));
        }
        ctx.stroke();
        // Nose chevron marking the ship's forward (-Z) direction.
        const frontCells = profile.cells.filter((cell) => cell[1] === profile.minZ);
        const noseX = frontCells.length ? frontCells.reduce((sum, cell) => sum + cell[0], 0) / frontCells.length : 0;
        const noseY = mapZ(profile.minZ) - scale * 0.6;
        ctx.fillStyle = hostile ? 'rgba(255, 92, 84, 0.95)' : accent;
        ctx.beginPath();
        ctx.moveTo(mapX(noseX), noseY - scale * 1.6);
        ctx.lineTo(mapX(noseX) - scale * 0.9, noseY);
        ctx.lineTo(mapX(noseX) + scale * 0.9, noseY);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
    }
    drawRadar(contacts) {
        const canvas = this.radarContext.canvas;
        const rect = canvas.getBoundingClientRect();
        const ratio = Math.min(2, window.devicePixelRatio || 1);
        const width = Math.max(150, Math.floor(rect.width * ratio));
        const height = Math.max(150, Math.floor(rect.height * ratio));
        if (canvas.width !== width || canvas.height !== height) {
            canvas.width = width;
            canvas.height = height;
        }
        const ctx = this.radarContext;
        const cx = width / 2;
        const cy = height / 2;
        const radius = Math.min(width, height) * 0.44;
        ctx.clearRect(0, 0, width, height);
        ctx.save();
        ctx.translate(cx, cy);
        ctx.strokeStyle = 'rgba(115, 203, 185, .35)';
        ctx.lineWidth = Math.max(1, ratio);
        for (const ring of [0.33, 0.66, 1]) {
            ctx.beginPath();
            ctx.arc(0, 0, radius * ring, 0, Math.PI * 2);
            ctx.stroke();
        }
        ctx.beginPath();
        ctx.moveTo(-radius, 0);
        ctx.lineTo(radius, 0);
        ctx.moveTo(0, -radius);
        ctx.lineTo(0, radius);
        ctx.stroke();
        ctx.fillStyle = '#e0ba68';
        ctx.beginPath();
        ctx.moveTo(0, -7 * ratio);
        ctx.lineTo(-5 * ratio, 5 * ratio);
        ctx.lineTo(5 * ratio, 5 * ratio);
        ctx.closePath();
        ctx.fill();
        for (const contact of contacts) {
            const x = contact.x * radius;
            const y = contact.y * radius;
            const size = (contact.selected ? 5.5 : 3.2) * ratio;
            ctx.fillStyle = contact.type === 'hostile' ? '#ff5a43' : contact.type === 'friendly' ? '#6cc8e4' : contact.type === 'location' ? '#e6b95f' : contact.type === 'resource' ? '#b8c97b' : contact.type === 'wreck' ? '#87b5aa' : contact.type === 'pickup' ? '#f2df91' : '#c9cbc6';
            ctx.strokeStyle = ctx.fillStyle;
            ctx.globalAlpha = contact.altitude > 0 ? 1 : 0.62;
            if (contact.type === 'location') {
                ctx.strokeRect(x - size, y - size, size * 2, size * 2);
            }
            else {
                ctx.beginPath();
                ctx.arc(x, y, size, 0, Math.PI * 2);
                ctx.fill();
            }
            if (contact.selected) {
                ctx.globalAlpha = 0.85;
                ctx.strokeRect(x - size * 2, y - size * 2, size * 4, size * 4);
            }
            ctx.globalAlpha = 0.35;
            ctx.beginPath();
            ctx.moveTo(x, y);
            ctx.lineTo(x, y + Math.sign(contact.altitude || 1) * 7 * ratio);
            ctx.stroke();
            ctx.globalAlpha = 1;
        }
        ctx.restore();
    }
    showToast(message, tone = 'info', duration = 3400) {
        const stack = this.root.querySelector('#toast-stack');
        if (!stack)
            return;
        const id = ++this.toastId;
        const toast = document.createElement('div');
        toast.className = `toast ${tone}`;
        toast.dataset.toastId = String(id);
        toast.textContent = message;
        stack.appendChild(toast);
        requestAnimationFrame(() => toast.classList.add('visible'));
        window.setTimeout(() => {
            toast.classList.remove('visible');
            window.setTimeout(() => toast.remove(), 320);
        }, duration);
    }
    showMap(model) {
        if (!this.save)
            return;
        const panel = this.root.querySelector('#map-panel');
        const playerLeft = 50 + (model.playerPosition[0] / SYSTEM_MAP_EXTENT) * 42;
        const playerTop = 50 + (model.playerPosition[2] / SYSTEM_MAP_EXTENT) * 42;
        const contactTone = (contact) => contact.hostile ? 'hostile' : contact.kind === 'asteroid' ? 'resource' : contact.kind === 'wreck' ? 'wreck' : 'ship';
        panel.innerHTML = `
      <div class="modal-card map-card">
        <header><div><span class="eyebrow">NAVIGATION COMPUTER / PAUSED</span><h2>Helios Verge System</h2></div><button data-ui-command="close-map">CLOSE</button></header>
        <div class="navigation-map-layout">
          <section class="map-section system-map-section">
            <div class="map-section-heading"><span>SYSTEM POINTS</span><b>${escapeHtml(LOCATIONS[model.navTargetId].shortName)} VECTOR</b></div>
            <div class="system-map map-stage">
              <div class="map-orbit orbit-a"></div><div class="map-orbit orbit-b"></div><div class="map-star"></div>
              <div class="map-player-marker" style="left:${playerLeft.toFixed(2)}%;top:${playerTop.toFixed(2)}%" aria-label="Current position"><i></i><span>YOU</span></div>
              ${Object.keys(LOCATIONS).map((id) => {
            const location = LOCATIONS[id];
            const left = 50 + (location.position[0] / SYSTEM_MAP_EXTENT) * 42;
            const top = 50 + (location.position[2] / SYSTEM_MAP_EXTENT) * 42;
            const selected = model.navTargetId === id || model.currentTargetId === id;
            return `<button class="map-node kind-${location.kind} ${selected ? 'selected' : ''}" style="left:${left.toFixed(2)}%;top:${top.toFixed(2)}%" data-map-target-kind="location" data-map-target-id="${id}"><i></i><b>${escapeHtml(location.shortName)}</b><span>${this.save.player.discovered.includes(id) ? escapeHtml(location.kind) : 'UNSURVEYED'}</span></button>`;
        }).join('')}
            </div>
          </section>
          <section class="map-section local-map-section">
            <div class="map-section-heading"><span>LOCAL CONTACTS</span><b>${model.contacts.length} TRACKED</b></div>
            <div class="tactical-map map-stage">
              <div class="tactical-rings"></div><div class="tactical-player"></div>
              ${model.contacts.map((contact) => `<button class="tactical-contact ${contactTone(contact)} ${contact.selected ? 'selected' : ''}" style="left:${(50 + contact.x * 42).toFixed(2)}%;top:${(50 + contact.y * 42).toFixed(2)}%" data-map-target-kind="${contact.kind}" data-map-target-id="${escapeHtml(contact.id)}" aria-label="${escapeHtml(contact.name)}"><i></i></button>`).join('')}
            </div>
            <div class="contact-list">
              ${model.contacts.length ? model.contacts.map((contact) => `<button class="contact-row ${contactTone(contact)} ${contact.selected ? 'selected' : ''}" data-map-target-kind="${contact.kind}" data-map-target-id="${escapeHtml(contact.id)}"><i></i><span><b>${escapeHtml(contact.name)}</b><small>${escapeHtml(contact.subtitle)}</small></span><em>${Math.round(contact.distance)}u</em></button>`).join('') : '<div class="contact-empty"><b>NO LOCAL CONTACTS</b><span>Only contacts inside sensor range appear here.</span></div>'}
            </div>
          </section>
        </div>
        <footer><span>${model.autopilotAvailable ? 'HYPERDRIVE READY — select a point, close the map, then engage.' : `HYPERDRIVE LOCKED — ${escapeHtml(model.threatLabel ?? 'hostile proximity')}.`}</span><span>Tap any system point or local contact to select it.</span></footer>
      </div>`;
        this.hidePause();
        panel.classList.remove('is-hidden');
        this.updateOrientationNotice();
    }
    hideMap() {
        this.root.querySelector('#map-panel')?.classList.add('is-hidden');
        this.updateOrientationNotice();
    }
    showPause() {
        if (!this.save)
            return;
        const panel = this.root.querySelector('#pause-panel');
        const settings = this.save.settings;
        panel.innerHTML = `
      <div class="modal-card pause-card">
        <header><div><span class="eyebrow">SHIP COMPUTER</span><h2>Paused</h2></div><button data-ui-command="resume-flight">RESUME</button></header>
        <div class="pause-grid">
          <section><h3>FLIGHT</h3><label><span>Flight assist</span><input type="checkbox" data-setting="flightAssist" ${settings.flightAssist ? 'checked' : ''}></label><label><span>Aim assistance</span><input type="checkbox" data-setting="aimAssist" ${settings.aimAssist ? 'checked' : ''}></label><label><span>Quality</span><select data-setting="quality"><option value="auto" ${settings.quality === 'auto' ? 'selected' : ''}>Auto</option><option value="low" ${settings.quality === 'low' ? 'selected' : ''}>Low</option><option value="high" ${settings.quality === 'high' ? 'selected' : ''}>High</option></select></label><label><span>Touch scale</span><input type="range" min="0.8" max="1.3" step="0.05" value="${settings.touchScale}" data-setting="touchScale"></label></section>
          <section><h3>TILT STEER</h3><label><span>Steering</span><select data-setting="steering"><option value="tilt" ${settings.steering !== 'stick' ? 'selected' : ''}>Tilt</option><option value="stick" ${settings.steering === 'stick' ? 'selected' : ''}>Stick</option></select></label><label><span>Sensitivity</span><input type="range" min="0.4" max="1.8" step="0.05" value="${settings.tiltSensitivity}" data-setting="tiltSensitivity"></label><label><span>Invert pitch</span><input type="checkbox" data-setting="tiltInvertPitch" ${settings.tiltInvertPitch ? 'checked' : ''}></label><label><span>Invert yaw</span><input type="checkbox" data-setting="tiltInvertYaw" ${settings.tiltInvertYaw ? 'checked' : ''}></label><div class="tilt-actions"><button data-ui-command="enable-tilt">ENABLE</button><button data-ui-command="calibrate-tilt">SET NEUTRAL</button></div></section>
          <section><h3>AUDIO</h3><label><span>Music</span><input type="range" min="0" max="1" step="0.05" value="${settings.music}" data-setting="music"></label><label><span>Effects</span><input type="range" min="0" max="1" step="0.05" value="${settings.effects}" data-setting="effects"></label><label><span>Haptics</span><input type="checkbox" data-setting="vibration" ${settings.vibration ? 'checked' : ''}></label></section>
          <section class="controls-reference"><h3>KEYBOARD / CONTROLLER</h3><p>W/S pitch · A/D yaw · Q/E roll · R/F throttle · Shift afterburn · Space fire · M missile · T target · C mode · V scan · N nav · J hyperdrive · K map</p><p>Gamepad: left stick steer · right stick roll/throttle · RT fire · RB missile · LB afterburn · face buttons target/mode/hyperdrive · D-pad scan/hostile/nav.</p></section>
        </div>
        <footer><button data-ui-command="map">NAV MAP</button><button data-ui-command="save">SAVE NOW</button><button data-ui-command="quit-title">QUIT TO TITLE</button></footer>
      </div>`;
        panel.classList.remove('is-hidden');
        this.updateOrientationNotice();
    }
    hidePause() {
        this.root.querySelector('#pause-panel')?.classList.add('is-hidden');
        this.updateOrientationNotice();
    }
    showArena() {
        const panel = this.root.querySelector('#arena-panel');
        const envOptions = [['open', 'OPEN SPACE'], ['asteroid-field', 'ASTEROID FIELD'], ['debris-field', 'DEBRIS FIELD']];
        const scenarioOptions = [['1v1', '1V1'], ['1v2', '1V2'], ['1v3', '1V3'], ['2v3', '2V3']];
        const option = (key, value, label, selected) => `<button data-arena-${key}="${value}" class="${selected ? 'selected' : ''}">${label}</button>`;
        panel.innerHTML = `
      <div class="modal-card arena-card">
        <header><div><span class="eyebrow">TRAINING SIMULATION</span><h2>Dogfight Arena</h2></div><button data-ui-command="close-arena">CLOSE</button></header>
        <div class="arena-grid">
          <section>
            <h3>ARENA</h3>
            <div class="arena-options">${envOptions.map(([value, label]) => option('env', value, label, this.arenaEnv === value)).join('')}</div>
          </section>
          <section>
            <h3>SCENARIO</h3>
            <div class="arena-options">${scenarioOptions.map(([value, label]) => option('scenario', value, label, this.arenaScenario === value)).join('')}</div>
          </section>
        </div>
        <footer><span>Test AI, cover, and handling with zero career consequences.</span><button class="primary" data-ui-command="launch-arena">LAUNCH</button></footer>
      </div>`;
        panel.classList.remove('is-hidden');
        this.updateOrientationNotice();
    }
    hideArena() {
        this.root.querySelector('#arena-panel')?.classList.add('is-hidden');
        this.updateOrientationNotice();
    }
    setTouchScale(scale) {
        this.root.style.setProperty('--touch-scale', String(scale));
    }
    setTouchSteering(mode) {
        this.root.classList.toggle('steering-tilt', mode === 'tilt');
        this.root.classList.toggle('steering-stick', mode !== 'tilt');
    }
    syncFullscreenButton = () => {
        const button = this.root.querySelector('.fullscreen-button');
        if (!button)
            return;
        const full = Boolean(document.fullscreenElement);
        button.textContent = full ? '⤡' : '⛶';
        button.classList.toggle('is-fullscreen', full);
    };
    get isModalOpen() {
        return !this.root.querySelector('#map-panel')?.classList.contains('is-hidden') || !this.root.querySelector('#pause-panel')?.classList.contains('is-hidden') || !this.root.querySelector('#arena-panel')?.classList.contains('is-hidden');
    }
    get isTitleVisible() {
        return this.titleVisible;
    }
    updateOrientationNotice = () => {
        const notice = this.root.querySelector('#rotate-notice');
        if (!notice)
            return;
        const portrait = window.innerHeight > window.innerWidth && window.innerWidth < 900;
        notice.classList.toggle('is-hidden', !portrait || this.titleVisible || this.isModalOpen);
    };
}
