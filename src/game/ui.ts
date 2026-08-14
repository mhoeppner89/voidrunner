import { COMMODITIES, EQUIPMENT, FACTION_NAMES, GUILD_NAMES, GUILD_RANK_NAMES, LOCATIONS, SHIPS, commodityIds, equipmentIds } from './data';
import { cargoCapacity, cargoMass } from './economy';
import { formatCredits, formatDuration } from './random';
import { equipmentUnlocked, getEffectiveShipStats, refillCost, repairCost } from './shipStats';
import type {
  CommodityId,
  DockLocationId,
  EquipmentId,
  FlightMode,
  GameSave,
  GuildId,
  LocationId,
  Mission,
  ShipId,
} from './types';

export interface RadarContact {
  x: number;
  y: number;
  type: 'hostile' | 'friendly' | 'neutral' | 'location' | 'resource' | 'wreck' | 'pickup';
  selected: boolean;
  altitude: number;
}

export interface HudTarget {
  kind?: 'ship' | 'asteroid' | 'wreck';
  name: string;
  subtitle: string;
  distance: number;
  shield?: number;
  maxShield?: number;
  armor?: number;
  maxArmor?: number;
  hull?: number;
  maxHull?: number;
  scanned?: boolean;
  screenX?: number;
  screenY?: number;
  onScreen?: boolean;
  spriteKey?: 'player-courier' | 'pirate-fighter' | 'cargo-hauler';
}

export interface HudModel {
  speed: number;
  maxSpeed: number;
  throttle: number;
  afterburner: boolean;
  fuel: number;
  maxFuel: number;
  shield: number;
  maxShield: number;
  armor: number;
  maxArmor: number;
  hull: number;
  maxHull: number;
  missiles: number;
  cargo: number;
  cargoCapacity: number;
  credits: number;
  mode: FlightMode;
  shipName: string;
  navName: string;
  navDistance: number;
  autopilot: boolean;
  zone: string;
  target?: HudTarget;
  prompt?: string;
  objective?: string;
  scanText?: string;
  contacts: RadarContact[];
}

export interface UIActions {
  startNew(): void;
  resume(): void;
  requestFullscreen(): void;
  launch(): void;
  setNav(locationId: LocationId): void;
  trade(kind: 'buy' | 'sell', commodityId: CommodityId, quantity: number): void;
  acceptMission(missionId: string): void;
  repair(): void;
  refuel(): void;
  buyEquipment(equipmentId: EquipmentId): void;
  buyShip(shipId: ShipId): void;
  switchShip(shipId: ShipId): void;
  joinGuild(guildId: GuildId): void;
  saveNow(): void;
  resumeFlight(): void;
  quitToTitle(): void;
  setSetting(key: 'music' | 'effects' | 'flightAssist' | 'aimAssist' | 'quality' | 'touchScale' | 'vibration', value: number | boolean | string): void;
}

const escapeHtml = (value: string): string =>
  value.replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[char]!);

const percent = (value: number, max: number): number => (max <= 0 ? 0 : Math.max(0, Math.min(100, (value / max) * 100)));

export class GameUI {
  readonly root: HTMLElement;
  readonly viewport: HTMLElement;
  private actions?: UIActions;
  private save?: GameSave;
  private dockLocation?: DockLocationId;
  private dockTab = 'concourse';
  private dockTerminal = 'concourse';
  private marketPoint = 'commodities';
  private barPanel = 'people';
  private titleVisible = true;
  private radarContext: CanvasRenderingContext2D;
  private toastId = 0;
  private lastHud?: HudModel;
  private npcLineIndex = new Map<string, number>();

  constructor(host: HTMLElement) {
    host.innerHTML = this.shellMarkup();
    this.root = host.querySelector<HTMLElement>('#game-shell')!;
    this.viewport = host.querySelector<HTMLElement>('#viewport')!;
    const radar = host.querySelector<HTMLCanvasElement>('#radar')!;
    this.radarContext = radar.getContext('2d')!;
    this.bindStaticEvents();
    this.updateOrientationNotice();
    window.addEventListener('resize', this.updateOrientationNotice);
  }

  setActions(actions: UIActions): void {
    this.actions = actions;
  }

  private shellMarkup(): string {
    return `
      <main id="game-shell">
        <div id="viewport"></div>
        <div class="global-crt-overlay" aria-hidden="true"></div>
        <section id="hud" class="hud is-hidden" aria-label="Cockpit heads-up display">
          <div class="cockpit-vignette" aria-hidden="true"></div>
          <div class="cockpit-art" aria-hidden="true"></div>
          <div class="cockpit-glass" aria-hidden="true"></div>
          <div class="cockpit-screen cockpit-screen-own" aria-label="Own ship status display">
            <div class="screen-heading"><span>OWN SHIP STATUS</span><b id="own-ship-name">WAYFARER</b></div>
            <div class="screen-ship-layout"><div class="own-ship-silhouette" aria-hidden="true"></div><div class="screen-bars"><div><span>SHIELDS</span><i><b id="screen-own-shield"></b></i><em id="screen-own-shield-value">90</em></div><div><span>ARMOR</span><i><b id="screen-own-armor"></b></i><em id="screen-own-armor-value">100</em></div><div><span>HULL</span><i><b id="screen-own-hull"></b></i><em id="screen-own-hull-value">100</em></div></div></div>
          </div>
          <div class="cockpit-screen cockpit-screen-radar" aria-label="Radar display">
            <div class="screen-heading"><span>RADAR</span><b id="screen-radar-zone">OPEN SPACE</b></div>
            <div class="radar-screen-wrap"><canvas id="radar" width="220" height="220"></canvas></div>
          </div>
          <div class="cockpit-screen cockpit-screen-target" aria-label="Target status display">
            <div class="screen-heading"><span>TARGET STATUS</span><b id="screen-target-name">NO LOCK</b></div>
            <div class="screen-target-layout"><div class="target-ship-silhouette" aria-hidden="true"></div><div class="screen-bars"><div><span>SHIELDS</span><i><b id="screen-target-shield"></b></i><em id="screen-target-shield-value">—</em></div><div><span>ARMOR</span><i><b id="screen-target-armor"></b></i><em id="screen-target-armor-value">—</em></div><div><span>HULL</span><i><b id="screen-target-hull"></b></i><em id="screen-target-hull-value">—</em></div></div></div>
          </div>
          <div class="cockpit-identity" aria-hidden="true"><span>WAYFARER // HULL 07</span><b>VOIDRUNNER</b></div>
          <div class="hud-top-left">
            <div class="objective-chip">
              <span class="eyebrow">ACTIVE VECTOR</span>
              <strong id="hud-nav">SHARDBELT</strong>
              <span id="hud-nav-distance">—</span>
            </div>
            <div class="objective-line" id="hud-objective">Choose a contract or make your own work.</div>
          </div>
          <div class="hud-top-right target-panel is-hidden" id="target-panel" aria-hidden="true">
            <span class="eyebrow">TARGET</span>
            <strong id="hud-target-name">NO LOCK</strong>
            <span id="hud-target-subtitle">T selects contact</span>
            <div class="micro-bars" id="target-bars"></div>
          </div>
          <div id="target-bracket" class="target-bracket is-hidden" aria-hidden="true"><i></i><i></i><i></i><i></i></div>
          <div class="reticle" aria-hidden="true"><span></span><span></span><span></span><span></span><b></b></div>
          <div class="hud-bottom-left is-hidden" aria-hidden="true">
            <div class="status-stack">
              <div class="status-row"><span>SHD</span><i><b id="bar-shield"></b></i><em id="text-shield">90</em></div>
              <div class="status-row"><span>ARM</span><i><b id="bar-armor"></b></i><em id="text-armor">100</em></div>
              <div class="status-row"><span>HUL</span><i><b id="bar-hull"></b></i><em id="text-hull">100</em></div>
            </div>
          </div>
          <div class="hud-bottom-center">
            <div id="context-prompt" class="context-prompt is-hidden">G — DOCK</div>
            <div id="scan-readout" class="scan-readout is-hidden"></div>
          </div>
          <div class="hud-bottom-right">
            <div class="flight-readout">
              <div><span>SPD</span><strong id="hud-speed">0</strong><small id="hud-max-speed">/42</small></div>
              <div><span>THR</span><strong id="hud-throttle">0</strong><small>%</small></div>
              <div><span>FUEL</span><strong id="hud-fuel">100</strong><small>%</small></div>
              <div><span>MSL</span><strong id="hud-missiles">4</strong></div>
              <div><span>HOLD</span><strong id="hud-cargo">0/32</strong></div>
              <div><span>CR</span><strong id="hud-credits">3,200</strong></div>
            </div>
          </div>
          <div class="touch-controls" aria-label="Touch flight controls">
            <div class="touch-left">
              <div class="touch-stick" data-touch-stick><div class="touch-stick-rings"></div><div class="touch-stick-knob" data-touch-stick-knob></div></div>
              <div class="roll-controls"><button data-touch-action="roll-left" aria-label="Roll left">↶</button><button data-touch-action="roll-right" aria-label="Roll right">↷</button></div>
            </div>
            <div class="touch-right">
              <div class="touch-throttle" data-touch-throttle><div class="touch-throttle-fill"></div><div class="touch-throttle-thumb" data-touch-throttle-thumb></div><span>THR</span></div>
              <div class="touch-action-cluster">
                <button class="touch-fire" data-touch-action="fire">FIRE</button>
                <button data-touch-action="missile">MSL</button>
                <button data-touch-action="afterburner">AB</button>
                <button data-touch-action="targetNext">TGT</button>
                <button data-touch-action="cycleMode">MODE</button>
                <button data-touch-action="scan">SCAN</button>
                <button data-touch-action="autopilot">AUTO</button>
                <button data-touch-action="interact">ACT</button>
                <button data-touch-action="navNext">NAV</button>
                <button data-touch-action="map">MAP</button>
              </div>
            </div>
          </div>
          <button class="pause-button" data-ui-command="pause" aria-label="Pause">Ⅱ</button>
        </section>

        <section id="title-screen" class="title-screen">
          <div class="title-stars"></div>
          <div class="title-cockpit-frame" aria-hidden="true"></div>
          <div class="title-card">
            <span class="title-kicker">FRONTIER COMMERCE / WARRANTS / RECOVERY</span>
            <h1>VOID<br><b>RUNNER</b></h1>
            <p>Pilot. Trade. Fight. Survive. Make your name on the bright edge of a dangerous frontier.</p>
            <div class="title-actions">
              <button class="primary" data-ui-command="resume">RESUME FLIGHT</button>
              <button data-ui-command="new">NEW CAREER</button>
              <button data-ui-command="fullscreen">FULLSCREEN</button>
            </div>
            <div class="title-controls">
              <span>TOUCH: stick · throttle · FIRE · MODE · AUTO</span>
              <span>KEYBOARD: WASD · Q/E · R/F · Space · T · J · G</span>
            </div>
          </div>
          <div class="copyright-note">ORIGINAL RETRO-FUTURE ART · LOCAL AUTOSAVE · TOUCH / PAD / KEYBOARD</div>
        </section>

        <section id="dock-screen" class="dock-screen is-hidden" aria-label="Docked location"></section>
        <section id="map-panel" class="modal-panel is-hidden" aria-label="Navigation map"></section>
        <section id="pause-panel" class="modal-panel is-hidden" aria-label="Pause and settings"></section>
        <div id="toast-stack" class="toast-stack global-toasts" aria-live="polite"></div>
        <div id="rotate-notice" class="rotate-notice is-hidden"><strong>ROTATE DEVICE</strong><span>Landscape gives the cockpit room to breathe.</span></div>
      </main>
    `;
  }

  private bindStaticEvents(): void {
    this.root.addEventListener('click', (event) => {
      const target = (event.target as HTMLElement).closest<HTMLElement>('[data-ui-command], [data-dock-tab], [data-dock-terminal], [data-dock-hotspot], [data-market-point], [data-bar-panel], [data-nav-id], [data-trade], [data-mission-id], [data-equipment-id], [data-ship-id], [data-switch-ship], [data-guild-id], [data-person-id]');
      if (!target) return;
      if (target.dataset.uiCommand) this.handleCommand(target.dataset.uiCommand, target);
      else if (target.dataset.barPanel) {
        const panel = target.dataset.barPanel;
        if (panel === 'people' || panel === 'missions' || panel === 'guilds') this.switchToTerminal('bar', panel);
      } else if (target.dataset.dockTab) {
        const tab = target.dataset.dockTab;
        if (tab === 'concourse' || tab === 'bar' || tab === 'market') this.switchToTerminal(tab);
      } else if (target.dataset.dockTerminal) {
        const terminal = target.dataset.dockTerminal;
        if (terminal === 'concourse' || terminal === 'bar' || terminal === 'market') this.switchToTerminal(terminal);
      } else if (target.dataset.dockHotspot) {
        const hotspot = target.dataset.dockHotspot;
        if (hotspot === 'bar' || hotspot === 'market') this.switchToTerminal(hotspot);
        else if (hotspot === 'services') {
          this.dockTab = 'concourse';
          this.dockTerminal = 'services';
          this.renderDock();
        }
      } else if (target.dataset.marketPoint) {
        this.renderMarketPoint(target.dataset.marketPoint);
      } else if (target.dataset.navId) {
        this.actions?.setNav(target.dataset.navId as LocationId);
        this.hideMap();
      } else if (target.dataset.trade) {
        const [kind, commodityId, quantity] = target.dataset.trade.split(':') as ['buy' | 'sell', CommodityId, string];
        this.actions?.trade(kind, commodityId, Number(quantity));
      } else if (target.dataset.missionId) {
        this.actions?.acceptMission(target.dataset.missionId);
      } else if (target.dataset.equipmentId) {
        this.actions?.buyEquipment(target.dataset.equipmentId as EquipmentId);
      } else if (target.dataset.shipId) {
        this.actions?.buyShip(target.dataset.shipId as ShipId);
      } else if (target.dataset.switchShip) {
        this.actions?.switchShip(target.dataset.switchShip as ShipId);
      } else if (target.dataset.guildId) {
        this.actions?.joinGuild(target.dataset.guildId as GuildId);
      } else if (target.dataset.personId) {
        this.talkToPerson(target.dataset.personId);
      }
    });

    this.root.addEventListener('input', (event) => {
      const element = event.target as HTMLInputElement | HTMLSelectElement;
      const setting = element.dataset.setting as Parameters<UIActions['setSetting']>[0] | undefined;
      if (!setting) return;
      const value = element instanceof HTMLInputElement && element.type === 'checkbox' ? element.checked : element.type === 'range' ? Number(element.value) : element.value;
      this.actions?.setSetting(setting, value);
    });

    this.root.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      const target = (event.target as HTMLElement).closest<HTMLElement>('[data-ui-command], [data-dock-hotspot], [data-person-id]');
      if (!target) return;
      event.preventDefault();
      target.click();
    });
  }

  private handleCommand(command: string, element: HTMLElement): void {
    switch (command) {
      case 'resume':
        this.actions?.resume();
        break;
      case 'new':
        if (!this.save || window.confirm('Start a new career and overwrite the local autosave?')) this.actions?.startNew();
        break;
      case 'fullscreen':
        this.actions?.requestFullscreen();
        break;
      case 'launch':
        this.actions?.launch();
        break;
      case 'pause':
        this.showPause();
        break;
      case 'resume-flight':
        this.hidePause();
        this.actions?.resumeFlight();
        break;
      case 'map':
        this.showMap();
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
        this.renderDock();
        break;
      default:
        console.debug('Unhandled UI command', command, element);
    }
  }

  showTitle(hasSave: boolean, save?: GameSave): void {
    this.save = save;
    this.titleVisible = true;
    this.root.querySelector('#title-screen')?.classList.remove('is-hidden');
    this.root.querySelector('#hud')?.classList.add('is-hidden');
    this.root.querySelector('#dock-screen')?.classList.add('is-hidden');
    const resume = this.root.querySelector<HTMLButtonElement>('[data-ui-command="resume"]');
    if (resume) {
      resume.disabled = !hasSave;
      resume.textContent = hasSave ? 'RESUME CAREER' : 'NO AUTOSAVE FOUND';
    }
    this.updateOrientationNotice();
  }

  hideTitle(): void {
    this.titleVisible = false;
    this.root.querySelector('#title-screen')?.classList.add('is-hidden');
    this.updateOrientationNotice();
  }

  showHud(): void {
    this.root.querySelector('#hud')?.classList.remove('is-hidden');
    this.updateOrientationNotice();
  }

  hideHud(): void {
    this.root.querySelector('#hud')?.classList.add('is-hidden');
  }

  showDock(save: GameSave, locationId: DockLocationId): void {
    this.save = save;
    this.dockLocation = locationId;
    this.dockTab = 'concourse';
    this.dockTerminal = 'concourse';
    this.marketPoint = 'commodities';
    this.barPanel = 'people';
    this.hideTitle();
    this.hideHud();
    this.root.querySelector('#dock-screen')?.classList.remove('is-hidden');
    this.renderDock();
    this.updateOrientationNotice();
  }

  refreshDock(save: GameSave): void {
    this.save = save;
    if (this.dockLocation) this.renderDock();
  }

  hideDock(): void {
    this.root.querySelector('#dock-screen')?.classList.add('is-hidden');
    this.dockLocation = undefined;
  }

  private renderDock(): void {
    if (!this.save || !this.dockLocation) return;
    const dock = this.root.querySelector<HTMLElement>('#dock-screen')!;
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
    const terminalTabs = [
      ['concourse', 'CONCOURSE'],
      ['bar', 'BAR'],
      ['market', 'MARKET'],
    ];
    dock.innerHTML = `
      <div class="dock-backdrop">${this.locationIllustration(this.dockLocation, illustrationScreen)}</div>
      <div class="dock-scanlines" aria-hidden="true"></div>
      <header class="dock-header">
        <div><span>${location.kind.toUpperCase()} / ${FACTION_NAMES[location.faction]}</span><h2>${escapeHtml(location.name)}</h2></div>
        ${this.dockTerminal !== 'concourse' ? '<button class="dock-back-button" data-ui-command="dock-concourse">◀ CONCOURSE</button>' : ''}
        <div class="dock-wallet"><span>AVAILABLE CREDIT</span><strong>${formatCredits(this.save.player.credits)}</strong><small>${SHIPS[this.save.player.shipId].name} · ${cargoMass(this.save.player).toFixed(1)}/${cargoCapacity(this.save.player)} mass</small></div>
      </header>
      <div class="dock-content">
        <nav class="dock-nav terminal-nav" aria-label="Station screens">${terminalTabs.map(([id, label]) => `<button class="${this.dockTab === id ? 'active' : ''}" data-dock-tab="${id}">${label}</button>`).join('')}</nav>${terminal}
      </div>
      <footer class="dock-footer"><span>AUTOSAVE ACTIVE · LOCAL DEVICE</span><button class="launch-button" data-ui-command="launch">LAUNCH</button></footer>
    `;
    const content = dock.querySelector<HTMLElement>('.dock-content');
    if (content) content.scrollTop = 0;
    if (this.dockTerminal === 'market') this.renderMarketPoint(this.marketPoint);
  }

  private renderLandingScene(): string {
    if (!this.save || !this.dockLocation) return '';
    const location = LOCATIONS[this.dockLocation];
    const active = this.save.activeMissions.slice(0, 2);
    const terminalTabs = [
      ['bar', 'BAR'],
      ['market', 'MARKET'],
    ];
    const traffic = this.dockLocation === 'rook' ? 'PATROLS HEAVY' : this.dockLocation === 'vesper' ? 'ORE CONVOYS ACTIVE' : this.dockLocation === 'azure' ? 'HARVEST LIFTS ON SCHEDULE' : 'FREEPORT VOLUME HIGH';
    return `
      <div class="landing-scene">
        <div class="landing-copy">
          <span class="eyebrow">ARRIVAL / ${location.kind.toUpperCase()}</span>
          <h3>${escapeHtml(location.shortName)} CONCOURSE</h3>
          <p>${escapeHtml(location.description)}</p>
          <div class="landing-signal"><b>LOCAL SIGNAL</b><span>${traffic}</span></div>
        </div>
        <div class="landing-hotspots" aria-label="Location actions">
          <div class="landing-hotspot hotspot-ship" data-ui-command="launch" role="button" tabindex="0" aria-label="Launch your ship"><i>↗</i><b>YOUR SHIP</b><small>Click to launch</small></div>
          <div class="landing-hotspot hotspot-services" data-dock-hotspot="services" role="button" tabindex="0" aria-label="Open services"><i>⚙</i><b>SERVICES</b><small>Repair and refuel</small></div>
          <div class="landing-hotspot hotspot-market" data-dock-hotspot="market" role="button" tabindex="0" aria-label="Open market"><i>▣</i><b>MARKET</b><small>Trade and fit out</small></div>
          <div class="landing-hotspot hotspot-bar" data-dock-hotspot="bar" role="button" tabindex="0" aria-label="Enter the bar"><i>✦</i><b>BAR</b><small>Guilds and missions</small></div>
          <div class="landing-hotspot hotspot-dock" data-ui-command="launch" role="button" tabindex="0" aria-label="Launch corridor"><i>⌂</i><b>DOCK</b><small>Launch corridor</small></div>
        </div>
        <aside class="landing-dialogue">
          <span class="eyebrow">DOCKMASTER // OPEN CHANNEL</span>
          <p>“Welcome back, pilot. The concourse is awake and the lanes are busy.”</p>
          <div class="landing-dialogue-meta"><span>${active.length ? `${active.length} ACTIVE CONTRACT${active.length === 1 ? '' : 'S'}` : 'NO ACTIVE CONTRACTS'}</span><span>${formatCredits(this.save.player.credits)} READY</span></div>
        </aside>
        <nav class="dock-nav landing-actions" aria-label="Station screens">
          <button data-dock-tab="concourse">CONCOURSE</button>
          ${terminalTabs.map(([id, label]) => `<button data-dock-tab="${id}">${label}</button>`).join('')}
        </nav>
      </div>
    `;
  }

  private renderDockTab(tab: string): string {
    if (!this.save || !this.dockLocation) return '';
    if (tab === 'services') return this.renderServices();
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

  private renderConcourse(): string {
    const location = LOCATIONS[this.dockLocation!]!;
    const active = this.save!.activeMissions.slice(0, 3);
    const ship = SHIPS[this.save!.player.shipId];
    return `
      <div class="concourse-screen landing-scene">
        <div class="landing-copy">
          <span class="eyebrow">ARRIVAL / ${location.kind.toUpperCase()}</span>
          <h3>${escapeHtml(location.shortName)} CONCOURSE</h3>
          <p>${escapeHtml(location.description)}</p>
          <div class="landing-signal"><b>LOCAL SIGNAL</b><span>${this.dockLocation === 'rook' ? 'PATROLS HEAVY' : this.dockLocation === 'vesper' ? 'ORE CONVOYS ACTIVE' : this.dockLocation === 'azure' ? 'HARVEST LIFTS ON SCHEDULE' : 'FREEPORT VOLUME HIGH'}</span></div>
        </div>
        <section class="concourse-ship-card" data-ui-command="launch" role="button" tabindex="0" aria-label="Launch the docked ship">
          <span class="eyebrow">DOCKED PLAYER SHIP</span>
          <div class="concourse-ship-art">${this.shipArt(this.save!.player.shipId, ship.name)}</div>
          <h3>${escapeHtml(ship.name)}</h3><p>${escapeHtml(ship.className)} · Ready for departure</p><small class="click-hint">CLICK SHIP TO LAUNCH</small>
        </section>
        <div class="landing-hotspots" aria-label="Concourse actions">
          <div class="landing-hotspot hotspot-ship" data-ui-command="launch" role="button" tabindex="0" aria-label="Launch your ship"><i>↗</i><b>YOUR SHIP</b><small>Click to launch</small></div>
          <div class="landing-hotspot hotspot-services" data-dock-hotspot="services" role="button" tabindex="0" aria-label="Open services"><i>⚙</i><b>SERVICES</b><small>Repair and refuel</small></div>
          <div class="landing-hotspot hotspot-market" data-dock-hotspot="market" role="button" tabindex="0" aria-label="Open market"><i>▣</i><b>MARKET</b><small>Trade and fit out</small></div>
          <div class="landing-hotspot hotspot-bar" data-dock-hotspot="bar" role="button" tabindex="0" aria-label="Enter the bar"><i>✦</i><b>BAR</b><small>Guilds and missions</small></div>
          <div class="landing-hotspot hotspot-dock" data-ui-command="launch" role="button" tabindex="0" aria-label="Launch corridor"><i>⌂</i><b>DOCK</b><small>Launch corridor</small></div>
        </div>
        <section class="concourse-info">
          <span class="eyebrow">${location.kind.toUpperCase()} / LOCAL FEED</span>
          <h3>${escapeHtml(location.shortName)} CONCOURSE</h3>
          <p>${escapeHtml(location.description)}</p>
          <div class="ticker"><b>TRAFFIC</b> ${this.dockLocation === 'rook' ? 'PATROLS HEAVY' : this.dockLocation === 'vesper' ? 'ORE CONVOYS ACTIVE' : this.dockLocation === 'azure' ? 'HARVEST LIFTS ON SCHEDULE' : 'FREEPORT VOLUME HIGH'}</div>
          <div class="snapshot-stats">
            <div><span>CREDITS</span><b>${formatCredits(this.save!.player.credits)}</b></div>
            <div><span>CARGO</span><b>${cargoMass(this.save!.player).toFixed(1)} / ${cargoCapacity(this.save!.player)}</b></div>
            <div><span>ACTIVE CONTRACTS</span><b>${active.length}</b></div>
            <div><span>CONTRACTS COMPLETE</span><b>${this.save!.player.stats.contracts}</b></div>
          </div>
        </section>
        <section class="concourse-services">
          <span class="eyebrow">SERVICES / NEAR SHIP</span>
          <h3>Keep the hull ready</h3>
          <div class="service-quick-actions"><button data-ui-command="repair">REPAIR · ${formatCredits(repairCost(this.save!.player))}</button><button data-ui-command="refuel">REFUEL · ${formatCredits(refillCost(this.save!.player))}</button></div>
          <p>Full repair and refuel services are available here before launch.</p>
        </section>
      </div>
    `;
  }

  private switchToTerminal(tab: 'concourse' | 'bar' | 'market', panel: 'people' | 'missions' | 'guilds' = 'people'): void {
    this.dockTab = tab;
    this.dockTerminal = tab;
    if (tab === 'bar') this.barPanel = panel;
    this.renderDock();
  }

  private renderBar(): string {
    const people = LOCATIONS[this.dockLocation!].people ?? [];
    if (this.barPanel === 'missions') return this.renderMissions();
    if (this.barPanel === 'guilds') return this.renderGuilds();
    return `
      <div class="bar-layout">
        <section class="bar-stage">
          <span class="eyebrow">BAR / GUILDS / OPEN CHANNELS</span>
          <h3>Buy a drink. Find work. Make allies.</h3>
          <div class="bar-shortcuts"><button data-dock-tab="bar" data-bar-panel="missions">MISSION BOARD</button><button data-dock-tab="bar" data-bar-panel="guilds">GUILDS</button></div>
          <div class="people-row">
            ${people.map((person) => `
              <article class="person-card" data-person-id="${person.id}" role="button" tabindex="0" aria-label="Talk to ${escapeHtml(person.name)}">
                ${this.portraitImage(person.id, person.name)}
                <span><b>${escapeHtml(person.name)}</b><small>${escapeHtml(person.role)}</small><em>${escapeHtml(person.affiliation)}</em></span>
              </article>
            `).join('')}
          </div>
        </section>
        <aside class="bar-dialogue" id="bar-dialogue"><span class="eyebrow">TABLE CHANNEL</span><p>Select someone to talk.</p></aside>
      </div>
    `;
  }

  private talkToPerson(personId: string): void {
    const person = LOCATIONS[this.dockLocation!].people?.find((entry) => entry.id === personId);
    const dialogue = this.root.querySelector<HTMLElement>('#bar-dialogue');
    if (!person || !dialogue) return;
    const index = this.npcLineIndex.get(personId) ?? 0;
    const line = person.lines[index % person.lines.length]!;
    this.npcLineIndex.set(personId, index + 1);
    dialogue.innerHTML = `<span class="eyebrow">${escapeHtml(person.name)} / ${escapeHtml(person.affiliation)}</span><p>“${escapeHtml(line)}”</p><small>Tap again for another topic.</small>`;
  }

  private renderMarket(): string {
    return `
      <div class="market-screen">
        <nav class="market-points" aria-label="Market points"><button class="${this.marketPoint === 'commodities' ? 'active' : ''}" data-market-point="commodities">COMMODITY MARKET</button><button class="${this.marketPoint === 'equipment' ? 'active' : ''}" data-market-point="equipment">SHIP PARTS</button><button class="${this.marketPoint === 'shipyard' ? 'active' : ''}" data-market-point="shipyard">NEW SHIP</button></nav>
        <div id="market-point-content"></div>
      </div>
    `;
  }

  private renderMarketPoint(point: string): void {
    const content = this.root.querySelector<HTMLElement>('#market-point-content');
    const marketScreen = this.root.querySelector<HTMLElement>('.market-screen');
    if (!content || !marketScreen || !this.save || !this.dockLocation) return;
    this.marketPoint = point;
    marketScreen.querySelectorAll<HTMLButtonElement>('[data-market-point]').forEach((button) => button.classList.toggle('active', button.dataset.marketPoint === point));
    if (point === 'equipment') content.innerHTML = this.renderEquipment();
    else if (point === 'shipyard') content.innerHTML = this.renderShipyard();
    else {
      const market = this.save.world.market[this.dockLocation]!;
      content.innerHTML = `
        <div class="market-layout">
          <div class="table-title"><div><span class="eyebrow">COMMODITY EXCHANGE</span><h3>Spot market</h3></div><div><span>HOLD</span><b>${cargoMass(this.save.player).toFixed(1)} / ${cargoCapacity(this.save.player)} mass</b></div></div>
          <div class="market-table">
          <div class="market-row market-head"><span>COMMODITY</span><span>PRICE</span><span>SUP / DEM</span><span>HOLD</span><span>ACTIONS</span></div>
          ${commodityIds.map((id) => {
            const item = market[id]!;
            const commodity = COMMODITIES[id]!;
            const owned = this.save!.player.cargo[id] ?? 0;
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

  private missionBadge(mission: Mission): string {
    return mission.kind === 'bounty' ? 'WARRANT' : mission.kind === 'transport' ? 'TIMED' : mission.kind.toUpperCase();
  }

  private renderMissions(): string {
    const offers = this.save!.world.offers[this.dockLocation!] ?? [];
    const active = this.save!.activeMissions;
    return `
      <div class="mission-layout">
        <section>
          <div class="table-title"><div><span class="eyebrow">CONTRACT TERMINAL</span><h3>Available work</h3></div><small>Maximum 6 active</small></div>
          <div class="mission-grid">
            ${offers.length ? offers.map((mission) => `<article class="mission-card ${mission.kind}">
              <header><span>${this.missionBadge(mission)}</span><b>${formatCredits(mission.reward)}</b></header>
              <h4>${escapeHtml(mission.title)}</h4>
              <p>${escapeHtml(mission.briefing)}</p>
              <dl><div><dt>ISSUER</dt><dd>${escapeHtml(mission.issuer)}</dd></div><div><dt>DEADLINE</dt><dd>${formatDuration(mission.deadline - this.save!.world.time)}</dd></div><div><dt>BOND</dt><dd>${formatCredits(mission.deposit)}</dd></div><div><dt>GUILD REP</dt><dd>+${mission.guildRep}</dd></div></dl>
              <button class="primary compact" data-mission-id="${mission.id}">ACCEPT CONTRACT</button>
            </article>`).join('') : '<p>No fresh contracts. Launch, trade, or return after the board cycles.</p>'}
          </div>
        </section>
        <aside class="active-list"><span class="eyebrow">ACTIVE</span>${active.length ? active.map((mission) => `<article><b>${escapeHtml(mission.title)}</b><small>${formatDuration(mission.deadline - this.save!.world.time)} · ${formatCredits(mission.reward)}</small></article>`).join('') : '<p>None.</p>'}</aside>
      </div>
    `;
  }

  private renderServices(): string {
    const stats = getEffectiveShipStats(this.save!.player);
    const repairs = repairCost(this.save!.player);
    const refill = refillCost(this.save!.player);
    return `
      <div class="service-grid">
        <article class="service-card"><span class="eyebrow">HULL / ARMOR</span><h3>Repair bay</h3><div class="service-bars"><label>HULL <i><b style="width:${percent(this.save!.player.hull, stats.hull)}%"></b></i><em>${Math.ceil(this.save!.player.hull)}/${stats.hull}</em></label><label>ARMOR <i><b style="width:${percent(this.save!.player.armor, stats.armor)}%"></b></i><em>${Math.ceil(this.save!.player.armor)}/${stats.armor}</em></label></div><p>Replace ablative plate, patch pressure structure, and clear combat faults.</p><button class="primary" data-ui-command="repair" ${repairs <= 0 ? 'disabled' : ''}>REPAIR · ${formatCredits(repairs)}</button></article>
        <article class="service-card"><span class="eyebrow">CONSUMABLES</span><h3>Fuel and ordnance</h3><div class="service-bars"><label>FUEL <i><b style="width:${percent(this.save!.player.fuel, stats.fuel)}%"></b></i><em>${Math.ceil(this.save!.player.fuel)}/${stats.fuel}</em></label><label>MISSILES <i><b style="width:${percent(this.save!.player.missiles, stats.missileCapacity)}%"></b></i><em>${this.save!.player.missiles}/${stats.missileCapacity}</em></label></div><p>Refill reactor mass, afterburn propellant, and standard seeker missiles.</p><button class="primary" data-ui-command="refuel" ${refill <= 0 ? 'disabled' : ''}>REFILL · ${formatCredits(refill)}</button></article>
        <article class="service-card danger-service"><span class="eyebrow">INSURANCE NOTE</span><h3>Emergency recovery</h3><p>A destroyed ship is towed to the last safe dock. The service retains cargo, mission bonds, and a percentage of liquid credit.</p><b>FLY WITH A RESERVE.</b></article>
      </div>
    `;
  }

  private renderEquipment(): string {
    return `
      <div class="equipment-grid">
        ${equipmentIds.map((id) => {
          const item = EQUIPMENT[id]!;
          const owned = this.save!.player.equipment.includes(id);
          const unlocked = equipmentUnlocked(this.save!.player, id);
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

  private renderShipyard(): string {
    const saleId = LOCATIONS[this.dockLocation!].shipForSale ?? 'wayfarer';
    const ship = SHIPS[saleId];
    const owned = this.save!.player.ownedShips.includes(saleId);
    const active = this.save!.player.shipId === saleId;
    return `
      <div class="shipyard-grid">
        <article class="ship-card ${active ? 'active' : ''}">
          <div class="ship-silhouette ${saleId}">${this.shipArt(saleId, ship.name)}</div>
          <header><span>${escapeHtml(ship.className)}</span><b>${saleId === 'wayfarer' ? 'STARTER HULL' : formatCredits(ship.price)}</b></header>
          <h3>${escapeHtml(ship.name)}</h3><p>${escapeHtml(ship.description)}</p>
          <dl><div><dt>SPEED</dt><dd>${ship.maxSpeed}</dd></div><div><dt>SHIELD</dt><dd>${ship.shield}</dd></div><div><dt>ARMOR</dt><dd>${ship.armor}</dd></div><div><dt>CARGO</dt><dd>${ship.cargo}</dd></div><div><dt>MISSILES</dt><dd>${ship.missileCapacity}</dd></div><div><dt>GUN</dt><dd>${ship.gunDamage}</dd></div></dl>
          ${active ? '<button disabled>ACTIVE SHIP</button>' : owned ? `<button data-switch-ship="${saleId}">SWITCH TO SHIP</button>` : `<button class="primary" data-ship-id="${saleId}">PURCHASE HULL</button>`}
        </article>
      </div>
    `;
  }

  private renderGuilds(): string {
    return `
      <div class="guild-grid">
        ${(Object.keys(GUILD_NAMES) as GuildId[]).map((id) => {
          const rep = this.save!.player.guildRep[id];
          const rank = this.save!.player.guildRank[id];
          const joined = rep > 0;
          const nextThreshold = [20, 65, 145, 145][rank]!;
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

  private portraitImage(personId: string, personName: string): string {
    return `<img class="avatar" src="./art/portraits/${escapeHtml(personId)}.webp" alt="Pixel portrait of ${escapeHtml(personName)}" draggable="false">`;
  }

  private shipArt(shipId: ShipId, shipName: string): string {
    const source = shipId === 'wayfarer'
      ? './art/sprites/player-courier/01.png'
      : shipId === 'vanguard'
        ? './art/sprites/cargo-hauler/01.png'
        : `./art/ships/${shipId}.webp`;
    return `<img src="${source}" alt="Pixel ship profile of ${escapeHtml(shipName)}" draggable="false">`;
  }

  private locationIllustration(locationId: DockLocationId, screen = 'concourse'): string {
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

  updateHud(model: HudModel): void {
    this.lastHud = model;
    const setText = (selector: string, value: string) => {
      const element = this.root.querySelector<HTMLElement>(selector);
      if (element) element.textContent = value;
    };
    const setBar = (selector: string, value: number) => {
      const element = this.root.querySelector<HTMLElement>(selector);
      if (element) element.style.width = `${Math.max(0, Math.min(100, value))}%`;
    };
    setText('#hud-nav', model.navName);
    setText('#hud-nav-distance', `${Math.round(model.navDistance)} km${model.autopilot ? ' · AUTOPILOT' : ''}`);
    setText('#hud-objective', model.objective ?? 'Choose a contract or make your own work.');
    setText('#hud-zone', model.zone.toUpperCase());
    setText('#hud-mode', model.mode.toUpperCase());
    setText('#hud-speed', Math.round(model.speed).toString());
    setText('#hud-max-speed', `/${Math.round(model.maxSpeed)}`);
    setText('#hud-throttle', Math.round(model.throttle * 100).toString());
    setText('#hud-fuel', Math.round((model.fuel / model.maxFuel) * 100).toString());
    setText('#hud-missiles', model.missiles.toString());
    setText('#hud-cargo', `${model.cargo.toFixed(0)}/${model.cargoCapacity}`);
    setText('#hud-credits', Math.floor(model.credits).toLocaleString('en-US'));
    setText('#own-ship-name', model.shipName.toUpperCase());
    setText('#screen-radar-zone', model.zone.toUpperCase());
    setText('#screen-own-shield-value', Math.ceil(model.shield).toString());
    setText('#screen-own-armor-value', Math.ceil(model.armor).toString());
    setText('#screen-own-hull-value', Math.ceil(model.hull).toString());
    setBar('#screen-own-shield', percent(model.shield, model.maxShield));
    setBar('#screen-own-armor', percent(model.armor, model.maxArmor));
    setBar('#screen-own-hull', percent(model.hull, model.maxHull));
    setText('#text-shield', Math.ceil(model.shield).toString());
    setText('#text-armor', Math.ceil(model.armor).toString());
    setText('#text-hull', Math.ceil(model.hull).toString());
    setBar('#bar-shield', percent(model.shield, model.maxShield));
    setBar('#bar-armor', percent(model.armor, model.maxArmor));
    setBar('#bar-hull', percent(model.hull, model.maxHull));

    const prompt = this.root.querySelector<HTMLElement>('#context-prompt');
    if (prompt) {
      prompt.textContent = model.prompt ?? '';
      prompt.classList.toggle('is-hidden', !model.prompt);
    }
    const scan = this.root.querySelector<HTMLElement>('#scan-readout');
    if (scan) {
      scan.textContent = model.scanText ?? '';
      scan.classList.toggle('is-hidden', !model.scanText);
    }
    this.updateTarget(model.target);
    this.drawRadar(model.contacts);

    const throttleThumb = this.root.querySelector<HTMLElement>('[data-touch-throttle-thumb]');
    const throttleFill = this.root.querySelector<HTMLElement>('.touch-throttle-fill');
    if (throttleThumb) throttleThumb.style.bottom = `${model.throttle * 100}%`;
    if (throttleFill) throttleFill.style.height = `${model.throttle * 100}%`;
  }

  private updateTarget(target?: HudTarget): void {
    const bracket = this.root.querySelector<HTMLElement>('#target-bracket');
    if (!target) {
      this.root.querySelector<HTMLElement>('#hud-target-name')!.textContent = 'NO LOCK';
      this.root.querySelector<HTMLElement>('#hud-target-subtitle')!.textContent = 'T selects contact';
      this.root.querySelector<HTMLElement>('#target-bars')!.innerHTML = '';
      this.setTargetScreenValue(undefined);
      bracket?.classList.add('is-hidden');
      return;
    }
    this.root.querySelector<HTMLElement>('#hud-target-name')!.textContent = target.name;
    this.root.querySelector<HTMLElement>('#hud-target-subtitle')!.textContent = `${target.subtitle} · ${Math.round(target.distance)} km${target.scanned === false ? ' · UNSCANNED' : ''}`;
    const bars = this.root.querySelector<HTMLElement>('#target-bars')!;
    bars.innerHTML = [
      target.maxShield ? `<i><b style="width:${percent(target.shield ?? 0, target.maxShield)}%"></b></i>` : '',
      target.maxArmor ? `<i><b style="width:${percent(target.armor ?? 0, target.maxArmor)}%"></b></i>` : '',
      target.maxHull ? `<i><b style="width:${percent(target.hull ?? 0, target.maxHull)}%"></b></i>` : '',
    ].join('');
    this.setTargetScreenValue(target);
    if (bracket && target.onScreen && target.screenX !== undefined && target.screenY !== undefined) {
      bracket.style.transform = `translate(${target.screenX}px, ${target.screenY}px)`;
      bracket.classList.remove('is-hidden');
    } else {
      bracket?.classList.add('is-hidden');
    }
  }

  private setTargetScreenValue(target?: HudTarget): void {
    const setText = (selector: string, value: string) => {
      const element = this.root.querySelector<HTMLElement>(selector);
      if (element) element.textContent = value;
    };
    const setBar = (selector: string, value: number) => {
      const element = this.root.querySelector<HTMLElement>(selector);
      if (element) element.style.width = `${Math.max(0, Math.min(100, value))}%`;
    };
    const silhouette = this.root.querySelector<HTMLElement>('.target-ship-silhouette');
    if (!target) {
      setText('#screen-target-name', 'NO LOCK');
      setText('#screen-target-shield-value', '—');
      setText('#screen-target-armor-value', '—');
      setText('#screen-target-hull-value', '—');
      setBar('#screen-target-shield', 0);
      setBar('#screen-target-armor', 0);
      setBar('#screen-target-hull', 0);
      silhouette?.style.setProperty('background-image', 'none');
      silhouette?.classList.add('is-empty');
      return;
    }
    setText('#screen-target-name', target.name.toUpperCase());
    setText('#screen-target-shield-value', target.maxShield ? Math.ceil(target.shield ?? 0).toString() : '—');
    setText('#screen-target-armor-value', target.maxArmor ? Math.ceil(target.armor ?? 0).toString() : '—');
    setText('#screen-target-hull-value', target.maxHull ? Math.ceil(target.hull ?? 0).toString() : '—');
    setBar('#screen-target-shield', percent(target.shield ?? 0, target.maxShield ?? 0));
    setBar('#screen-target-armor', percent(target.armor ?? 0, target.maxArmor ?? 0));
    setBar('#screen-target-hull', percent(target.hull ?? 0, target.maxHull ?? 0));
    const sprite = target.spriteKey ?? (target.kind === 'ship' ? 'pirate-fighter' : undefined);
    silhouette?.style.setProperty('background-image', sprite ? `url("./art/sprites/${sprite}/01.png")` : 'none');
    silhouette?.classList.toggle('is-empty', !sprite);
  }

  private drawRadar(contacts: RadarContact[]): void {
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
      } else {
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

  showToast(message: string, tone: 'info' | 'warning' | 'danger' | 'success' = 'info', duration = 3400): void {
    const stack = this.root.querySelector<HTMLElement>('#toast-stack');
    if (!stack) return;
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

  showMap(): void {
    if (!this.save) return;
    const panel = this.root.querySelector<HTMLElement>('#map-panel')!;
    panel.innerHTML = `
      <div class="modal-card map-card">
        <header><div><span class="eyebrow">NAVIGATION COMPUTER</span><h2>Helios Verge System</h2></div><button data-ui-command="close-map">CLOSE</button></header>
        <div class="system-map">
          <div class="map-orbit orbit-a"></div><div class="map-orbit orbit-b"></div><div class="map-star"></div>
          ${(Object.keys(LOCATIONS) as LocationId[]).map((id) => {
            const location = LOCATIONS[id];
            const x = 50 + location.position[0] / 14;
            const y = 50 + location.position[2] / 14;
            return `<button class="map-node kind-${location.kind} ${this.save!.player.navTargetId === id ? 'selected' : ''}" style="left:calc(50% + ${x - 50}px);top:calc(50% + ${y - 50}px)" data-nav-id="${id}"><i></i><b>${escapeHtml(location.shortName)}</b><span>${this.save!.player.discovered.includes(id) ? escapeHtml(location.kind) : 'UNKNOWN'}</span></button>`;
          }).join('')}
        </div>
        <footer><span>Select a nav point. Autopilot engages only when no immediate hostile threat is present.</span></footer>
      </div>`;
    panel.classList.remove('is-hidden');
  }

  hideMap(): void {
    this.root.querySelector('#map-panel')?.classList.add('is-hidden');
  }

  showPause(): void {
    if (!this.save) return;
    const panel = this.root.querySelector<HTMLElement>('#pause-panel')!;
    const settings = this.save.settings;
    panel.innerHTML = `
      <div class="modal-card pause-card">
        <header><div><span class="eyebrow">SHIP COMPUTER</span><h2>Paused</h2></div><button data-ui-command="resume-flight">RESUME</button></header>
        <div class="pause-grid">
          <section><h3>FLIGHT</h3><label><span>Flight assist</span><input type="checkbox" data-setting="flightAssist" ${settings.flightAssist ? 'checked' : ''}></label><label><span>Aim assistance</span><input type="checkbox" data-setting="aimAssist" ${settings.aimAssist ? 'checked' : ''}></label><label><span>Quality</span><select data-setting="quality"><option value="auto" ${settings.quality === 'auto' ? 'selected' : ''}>Auto</option><option value="low" ${settings.quality === 'low' ? 'selected' : ''}>Low</option><option value="high" ${settings.quality === 'high' ? 'selected' : ''}>High</option></select></label><label><span>Touch scale</span><input type="range" min="0.8" max="1.3" step="0.05" value="${settings.touchScale}" data-setting="touchScale"></label></section>
          <section><h3>AUDIO</h3><label><span>Music</span><input type="range" min="0" max="1" step="0.05" value="${settings.music}" data-setting="music"></label><label><span>Effects</span><input type="range" min="0" max="1" step="0.05" value="${settings.effects}" data-setting="effects"></label><label><span>Haptics</span><input type="checkbox" data-setting="vibration" ${settings.vibration ? 'checked' : ''}></label></section>
          <section class="controls-reference"><h3>KEYBOARD / CONTROLLER</h3><p>W/S pitch · A/D yaw · Q/E roll · R/F throttle · Shift afterburn · Space fire · M missile · T target · C mode · V scan · N nav · J autopilot · G dock/action · K map</p><p>Gamepad: left stick steer · right stick roll/throttle · RT fire · RB missile · LB afterburn · face buttons target/mode/action/autopilot · D-pad scan/hostile/nav.</p></section>
        </div>
        <footer><button data-ui-command="map">NAV MAP</button><button data-ui-command="save">SAVE NOW</button><button data-ui-command="quit-title">QUIT TO TITLE</button></footer>
      </div>`;
    panel.classList.remove('is-hidden');
  }

  hidePause(): void {
    this.root.querySelector('#pause-panel')?.classList.add('is-hidden');
  }

  setTouchScale(scale: number): void {
    this.root.style.setProperty('--touch-scale', String(scale));
  }

  get isModalOpen(): boolean {
    return !this.root.querySelector('#map-panel')?.classList.contains('is-hidden') || !this.root.querySelector('#pause-panel')?.classList.contains('is-hidden');
  }

  get isTitleVisible(): boolean {
    return this.titleVisible;
  }

  private updateOrientationNotice = (): void => {
    const notice = this.root.querySelector<HTMLElement>('#rotate-notice');
    if (!notice) return;
    const portrait = window.innerHeight > window.innerWidth && window.innerWidth < 900;
    notice.classList.toggle('is-hidden', !portrait || this.titleVisible);
  };
}
