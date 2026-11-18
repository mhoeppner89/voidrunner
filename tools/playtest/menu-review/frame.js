// Style frames for the station menu overhaul. Renders Trade, Equipment and
// Missions with the new markup and real game data (a fresh career docked at
// a chosen port). Selection, quantity and filters are interactive; nothing
// is written to a save.
import {createNewSave} from '/src/game/save.js';
import {COMMODITIES, LOCATIONS, SHIPS, FACTION_NAMES, commodityIds} from '/src/game/data.js';
import {quoteCommodityTrade, cargoMass, cargoCapacity, knownMarketQuotes} from '/src/game/economy.js';
import {formatCredits, formatDuration} from '/src/game/random.js';
import {t, setLanguage} from '/src/game/i18n.js';
import {commodityIcon, equipmentIcon} from '/src/game/itemIcons.js';
import {generateMissionOffers, missionTitle, missionBriefing} from '/src/game/missions.js';
import {planRoute, SYSTEMS} from '/src/game/galaxy.js';
import {OUTFIT_ITEMS, BASE_OUTFIT_ITEMS, itemAvailable} from '/src/game/outfitting.js';
import {inventoryMounts, mountItemId, normalizeEquipmentInventory, shopEquipmentTiers, equipmentFitsMount} from '/src/game/equipmentInventory.js';
import {resolveEquipmentDefinition, registerEquipmentDefinition, equipmentName, EQUIPMENT_RARITIES} from '/src/game/equipmentCatalog.js';
import {getEffectiveShipStats} from '/src/game/shipStats.js';
import {weaponForOutfit, launcherForOutfit} from '/src/game/weapons.js';
import {equipmentEffectStats} from '/src/game/equipmentStatPresentation.js';

const params = new URLSearchParams(location.search);
const screen = params.get('screen') ?? 'trade';
const portId = params.get('port') ?? 'helix';
const lang = params.get('lang') === 'en' ? 'en' : 'de';
setLanguage(lang);
const FRAME_DE = {'Unit price': 'Stückpreis', Total: 'Gesamt', Loadout: 'Ausstattung', Ship: 'Schiff', All: 'Alle', Weapons: 'Waffen', Turrets: 'Türme', Systems: 'Systeme', Drones: 'Drohnen', 'Free mount': 'Frei', Replace: 'Ersetzen', 'No mount': 'Kein Platz', Gun: 'Kanone', Launcher: 'Werfer', Turret: 'Turm', Drone: 'Drohne', System: 'System', 'Compared with': 'Verglichen mit', Effect: 'Wirkung', 'Fits {mount}, which is empty.': 'Passt in {mount} – der Platz ist frei.', Contracts: 'Aufträge', Guilds: 'Gilden', People: 'Personen', Available: 'Verfügbar', Active: 'Aktiv', Race: 'Rennen', Express: 'Express', Delivery: 'Lieferung', Warrant: 'Kopfgeld', Salvage: 'Bergung', Mining: 'Bergbau', 'Dark run': 'Schmuggel', Reward: 'Belohnung', bonus: 'Bonus', From: 'Von', To: 'Nach', 'Deliver early to earn the bonus.': 'Früh liefern, um den Bonus zu erhalten.', 'Accepted contracts appear under Active and on your nav map.': 'Angenommene Aufträge erscheinen unter „Aktiv“ und auf der Navigationskarte.', Credits: 'Guthaben', Back: 'Zurück'};
const tr = (text, params) => lang === 'de' && FRAME_DE[text] ? t(FRAME_DE[text], params) : t(text, params);

// ------------------------------------------------------------------ state
const save = createNewSave(Number(params.get('seed') ?? 20261117));
const player = save.player;
player.dockedAt = portId;
player.credits = 48200;
player.cargo = {food: 6, ore: 4};
save.world.time = 3600;
// Two remembered quotes so the route intel has something to say.
for (const [id, age] of [['nacre', 900], ['vesper', 2400], ['rook', 5200]]) {
    const market = save.world.market[id];
    if (!market) continue;
    save.world.marketIntel[id] = Object.fromEntries(commodityIds.map((c) => [c, {price: market[c].lastPrice, seenAt: save.world.time - age}]));
}
normalizeEquipmentInventory(player);
const port = LOCATIONS[portId];
const state = {commodity: 'ore', qty: 4, eqView: params.get('eq') ?? 'shop', eqCat: 'all', eqItem: undefined, eqMount: undefined, msTab: 'available', msKind: 'all', mission: undefined};

// -------------------------------------------------------------- helpers
const html = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
const num = (n, d = 1) => Number(n ?? 0).toFixed(d).replace(/(\.\d*?[1-9])0+$|\.0+$/, '$1');
const cr = (n) => formatCredits(n);
const roman = (n) => ['', 'I', 'II', 'III', 'IV', 'V'][n] ?? String(n);
const svg = (d, size = 20, extra = '') => `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="square" ${extra} aria-hidden="true">${d}</svg>`;
const ICON = {
    back: svg('<path d="M15 5l-7 7 7 7"/>', 22),
    trade: svg('<path d="M3 8l9-4 9 4v9l-9 4-9-4z"/><path d="M3 8l9 4 9-4M12 12v9"/>'),
    equip: svg('<path d="M4 20l7-7M14 4l6 6-4 1-3 3-3-3 3-3z"/><circle cx="6.5" cy="17.5" r="1.2"/>'),
    yard: svg('<path d="M12 3l3 7 6 3-6 2-3 6-3-6-6-2 6-3z"/>'),
    contracts: svg('<path d="M6 3h9l4 4v14H6z"/><path d="M14 3v5h5M9 12h7M9 16h5"/>'),
    guilds: svg('<path d="M12 3l8 4v5c0 5-4 8-8 9-4-1-8-4-8-9V7z"/><path d="M9 12l2 2 4-4"/>'),
    people: svg('<circle cx="9" cy="8" r="3"/><path d="M3 20c0-3 3-5 6-5s6 2 6 5M16 5a3 3 0 010 6M18 15c2 1 3 3 3 5"/>'),
    gear: svg('<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M19 5l-2 2M7 17l-2 2"/>'),
    cargo: svg('<rect x="3" y="7" width="18" height="13"/><path d="M3 11h18M9 7V4h6v3"/>', 18),
    coin: svg('<circle cx="12" cy="12" r="8"/><path d="M9 9h5a2 2 0 010 4h-4a2 2 0 000 4h5M12 6v2M12 16v2"/>', 18),
    clock: svg('<circle cx="12" cy="12" r="8"/><path d="M12 8v4l3 2"/>', 13),
    info: svg('<circle cx="12" cy="12" r="8"/><path d="M12 11v5M12 8v.5"/>', 16),
};
const KIND = {
    race: {label: 'Race', color: '#d58cff', icon: svg('<path d="M4 20V4M4 4h12l-2 4 2 4H4"/>', 26)},
    delivery: {label: 'Delivery', color: '#69e4f2', icon: svg('<path d="M3 8l9-4 9 4v9l-9 4-9-4z"/><path d="M3 8l9 4 9-4"/>', 26)},
    transport: {label: 'Express', color: '#ffd05c', icon: svg('<path d="M3 12h13M12 6l6 6-6 6M20 5v14"/>', 26)},
    bounty: {label: 'Warrant', color: '#ff7d60', icon: svg('<circle cx="12" cy="12" r="7"/><path d="M12 2v5M12 17v5M2 12h5M17 12h5"/>', 26)},
    salvage: {label: 'Salvage', color: '#5ee0c0', icon: svg('<path d="M5 19l4-10 6 4 4-8"/><circle cx="5" cy="19" r="1.5"/>', 26)},
    mining: {label: 'Mining', color: '#f2c94c', icon: svg('<path d="M14 4l6 6M4 20l9-9M11 6l7 7"/>', 26)},
    smuggle: {label: 'Dark run', color: '#f05c43', icon: svg('<path d="M4 10h16v10H4zM8 10V7a4 4 0 018 0v3"/>', 26)},
};
const kindOf = (m) => KIND[m.kind] ?? KIND.delivery;
const riskOf = (m) => {
    if (m.kind === 'smuggle') return {label: t('ILLEGAL'), level: 4};
    const d = Number(m.danger) || 0;
    return d >= 2.5 ? {label: t('EXTREME'), level: 4} : d >= 1.65 ? {label: t('HIGH'), level: 3} : d >= 1 ? {label: t('GUARDED'), level: 2} : {label: t('ROUTINE'), level: 1};
};
const risk = (level) => `<span class="sx-risk" data-level="${level}" aria-hidden="true"><i></i><i></i><i></i><i></i></span>`;

// ---------------------------------------------------------------- header
function header(tabs, active) {
    const mass = cargoMass(player), capacity = cargoCapacity(player);
    const kind = port.kind === 'planet' ? t('PLANET') : t('STATION');
    return `<header class="sx-header">
      <button class="sx-back" aria-label="${tr('Back')}">${ICON.back}</button>
      <div class="sx-place"><span class="sx-eyebrow">${kind} · <b>${html(t(FACTION_NAMES[port.faction] ?? port.faction ?? ''))}</b></span><h1>${html(port.name)}</h1></div>
      <nav class="sx-tabs" role="tablist">${tabs.map(([id, label, icon, badge]) => `<button class="sx-tab" role="tab" aria-selected="${id === active}" data-tab="${id}">${icon}<span>${html(label)}</span>${badge ? `<i class="sx-badge">${badge}</i>` : ''}</button>`).join('')}</nav>
      <div class="sx-status">
        <div class="sx-chip sx-cargo" title="${t('Cargo')}">${ICON.cargo}<span class="sx-chip-copy"><small>${t('Cargo')}</small><b>${num(mass)}/${num(capacity)}</b></span><span class="sx-meter"><i style="width:${Math.min(100, mass / capacity * 100)}%"></i></span></div>
        <div class="sx-chip sx-credits">${ICON.coin}<span class="sx-chip-copy"><small>${tr('Credits')}</small><b>${cr(player.credits)}</b></span></div>
        <button class="sx-icon-btn" aria-label="${t('Options')}">${ICON.gear}</button>
      </div>
    </header>`;
}
const MARKET_TABS = () => [['trade', t('{ui.trade}'), ICON.trade], ['equipment', t('{ui.equipment}'), ICON.equip], ['shipyard', t('{ui.shipyard}'), ICON.yard]];

// ----------------------------------------------------------------- trade
function marketPrice(id) { return save.world.market[portId][id].lastPrice; }
function trade() {
    const market = save.world.market[portId];
    const ids = [...commodityIds].sort((a, b) => Number((player.cargo[b] ?? 0) > 0) - Number((player.cargo[a] ?? 0) > 0));
    const c = COMMODITIES[state.commodity], item = market[state.commodity], price = marketPrice(state.commodity);
    const owned = player.cargo[state.commodity] ?? 0;
    const band = price < c.basePrice * 0.9 ? {label: t('LOW'), cls: 'is-down', sym: '▼'} : price > c.basePrice * 1.15 ? {label: t('HIGH'), cls: 'is-up', sym: '▲'} : {label: t('NOMINAL'), cls: 'is-flat', sym: '■'};
    const spread = item.supply - item.demand;
    const condition = spread >= 16 ? t('SURPLUS') : spread <= -16 ? t('SHORTAGE') : t('BALANCED');
    const buy = quoteCommodityTrade(save, portId, state.commodity, 'buy', state.qty, price);
    const sell = quoteCommodityTrade(save, portId, state.commodity, 'sell', state.qty, price);
    const maxBuy = quoteCommodityTrade(save, portId, state.commodity, 'buy', 999, price);
    const mass = cargoMass(player), capacity = cargoCapacity(player), add = c.mass * state.qty;
    const quotes = knownMarketQuotes(save.world, state.commodity, portId).slice(0, 3);
    const rows = ids.map((id) => {
        const e = COMMODITIES[id], p = marketPrice(id), n = player.cargo[id] ?? 0;
        const b = p < e.basePrice * 0.9 ? ['is-down', '▼', t('LOW')] : p > e.basePrice * 1.15 ? ['is-up', '▲', t('HIGH')] : ['is-flat', '', ''];
        return `<button class="sx-row ${e.legal ? '' : 'is-illegal'}" role="option" aria-selected="${id === state.commodity}" data-commodity="${id}" style="--accent:${e.accent}">
          <span class="sx-row-icon">${commodityIcon(e)}${n ? `<i class="sx-hold">${n}</i>` : ''}</span>
          <span class="sx-row-main"><b>${html(t(e.name))}</b><small>${html(t(e.category))}</small></span>
          <span class="sx-row-side"><b class="sx-price">${cr(p)}</b>${b[1] ? `<em class="sx-tag ${b[0]}">${b[1]} ${b[2]}</em>` : ''}</span>
        </button>`;
    }).join('');
    const intel = quotes.length ? quotes.map((q, i) => {
        const margin = q.price - price;
        return `<div class="sx-intel-row ${i === 0 && margin > 0 ? 'is-best' : ''}"><span><b>${html(LOCATIONS[q.locationId]?.name ?? q.locationId)}</b><br><small>${t('{time} AGO', {time: formatDuration(save.world.time - q.seenAt)})}</small></span><span class="sx-price">${cr(q.price)}</span><em class="${margin < 0 ? 'is-loss' : ''}">${margin >= 0 ? '+' : '−'}${cr(Math.abs(margin))}</em></div>`;
    }).join('') : `<p class="sx-copy">${t('Visit another port to record a comparison price.')}</p>`;
    return `<main class="sx-body sx-trade">
      <section class="sx-panel">
        <header class="sx-panel-head"><h2>${t('Commodities')}</h2><span class="sx-spacer"></span><span class="sx-count">${ids.length}</span></header>
        <div class="sx-scroll"><div class="sx-list" role="listbox">${rows}</div></div>
      </section>
      <div class="sx-detail">
        <section class="sx-panel sx-hero" style="--accent:${c.accent}">
          <div class="sx-hero-top">
            <figure class="sx-art" style="margin:0">${commodityIcon(c)}</figure>
            <div class="sx-hero-copy">
              <span class="sx-label">${html(t(c.category))} · ${html(t(c.packaging))}</span>
              <h3 class="${c.legal ? '' : 'is-illegal'}">${html(t(c.name))}</h3>
              <p class="sx-copy">${html(t(c.description))}</p>
              <blockquote class="sx-quote">${html(t(c.flavor))}</blockquote>
            </div>
          </div>
          <div class="sx-hero-stats">
            <div class="sx-stats">
              <div class="sx-stat"><span class="sx-label">${t('PRICE')}</span><b class="sx-big">${cr(price)}</b><span class="sx-tag ${band.cls}">${band.sym} ${band.label}</span></div>
              <div class="sx-stat"><span class="sx-label">${t('MARKET')}</span><b>${condition}</b><div class="sx-dual"><i style="--v:${Math.min(100, item.supply)}%"></i><i style="--v:${Math.min(100, item.demand)}%"></i></div><small>${item.supply} ${t('SUPPLY')} · ${item.demand} ${t('DEMAND')}</small></div>
              <div class="sx-stat"><span class="sx-label">${t('DIRECTION')}</span><b>— ${t('STEADY')}</b><small>${t('FIRST RECORDED QUOTE')}</small></div>
              <div class="sx-stat"><span class="sx-label">${t('YOUR HOLD')}</span><b>${owned} ${t('UNITS')}</b><small>${num(owned * c.mass)} ${t('MASS')}</small></div>
            </div>
          </div>
          <div class="sx-intel"><span class="sx-label">${t('Market intel')}</span>${intel}</div>
        </section>
        <section class="sx-panel sx-ticket">
          <header class="sx-panel-head"><h2>${t('Trade')}</h2></header>
          <div class="sx-ticket-body">
            <span class="sx-label">${t('QUANTITY')}</span>
            <div class="sx-qty"><button data-qty="-1" aria-label="${t('Decrease quantity')}">−</button><output>${state.qty}</output><button data-qty="1" aria-label="${t('Increase quantity')}">+</button></div>
            <input class="sx-range" type="range" min="1" max="${Math.max(1, maxBuy.quantity, owned)}" value="${state.qty}" data-range aria-label="${t('QUANTITY')}">
            <div class="sx-presets">${[1, 5, 10].map((n) => `<button data-set="${n}" aria-pressed="${state.qty === n}">${n}</button>`).join('')}<button data-set="${Math.max(1, maxBuy.quantity)}">MAX</button></div>
            <div class="sx-summary">
              <div class="sx-summary-row"><span>${tr('Unit price')}</span><b>${cr(price)}</b></div>
              <div class="sx-summary-row is-total"><span>${tr('Total')}</span><b>${cr(price * state.qty)}</b></div>
              <div class="sx-summary-row"><span>${t('Cargo')}</span><b>${num(mass)} → ${num(mass + add)} / ${num(capacity)}</b></div>
              <div class="sx-bar"><i style="width:${mass / capacity * 100}%"></i><i class="${mass + add > capacity ? 'is-out' : ''}" style="--from:${mass / capacity * 100}%;width:${Math.min(100 - mass / capacity * 100, add / capacity * 100)}%"></i></div>
            </div>
            <div class="sx-actions">
              <button class="sx-btn sx-btn-primary" ${buy.quantity > 0 ? '' : 'disabled'}>${t('BUY')} ${buy.quantity || state.qty}<small>${buy.quantity ? cr(buy.total) : t('Insufficient credits.')}</small></button>
              <button class="sx-btn sx-btn-secondary" ${sell.quantity > 0 ? '' : 'disabled'}>${t('SELL')} ${sell.quantity || state.qty}<small>${sell.quantity ? cr(sell.total) : t('No matching cargo in the hold.')}</small></button>
            </div>
          </div>
        </section>
      </div>
    </main>`;
}

// ------------------------------------------------------------- equipment
const quality = (d) => Object.hasOwn(EQUIPMENT_RARITIES, d?.rarity) ? d.rarity : 'common';
const rarityVar = (d) => `--rarity:var(--sx-${quality(d)})`;
const flight = (d) => !d ? undefined : weaponForOutfit(d.id) ?? launcherForOutfit(d.id);
const mountLabel = (s) => t(s.key === 'weapons' ? 'Weapon' : s.key === 'turrets' ? 'Turret' : s.key === 'droneBays' ? 'Drone bay' : 'Utility') + ' ' + (s.index + 1);
const CATEGORY_GROUP = {gun: 'weapons', launcher: 'weapons', turret: 'turrets', drone: 'drones'};
const CATS = [['all', 'All'], ['weapons', 'Weapons'], ['turrets', 'Turrets'], ['systems', 'Systems'], ['drones', 'Drones']];
const GROUP_ORDER = ['weapons', 'turrets', 'systems', 'drones'];
const groupOf = (d) => CATEGORY_GROUP[d.category] ?? 'systems';
function shopRecords() {
    const shop = [];
    for (const base of Object.values(BASE_OUTFIT_ITEMS)) if (!base.lootOnly && itemAvailable(player, base, portId))
        for (const tier of shopEquipmentTiers(portId).filter((tier) => tier >= (base.tier ?? 1) && (base.category !== 'drone' || tier === 1))) {
            const id = `shop-${base.id}-${tier}`;
            registerEquipmentDefinition(id, resolveEquipmentDefinition(base, {id, baseId: base.id, tier, rarity: 'common', affixes: []}));
            shop.push({id, baseId: base.id, tier, shop: true});
        }
    return shop;
}
function equipment() {
    const fit = player.outfitting.loadouts[player.shipId], stats = getEffectiveShipStats(player), mounts = inventoryMounts(player.shipId);
    const owned = Object.values(player.inventory.items);
    const shop = shopRecords();
    const records = state.eqView === 'shop' ? shop : owned.filter((i) => state.eqView === 'cargo' ? i.location.kind === 'cargo' : i.location.kind === 'station');
    const visible = records.filter((r) => state.eqCat === 'all' || groupOf(OUTFIT_ITEMS[r.id]) === state.eqCat)
        .sort((a, b) => GROUP_ORDER.indexOf(groupOf(OUTFIT_ITEMS[a.id])) - GROUP_ORDER.indexOf(groupOf(OUTFIT_ITEMS[b.id])) || OUTFIT_ITEMS[a.id].price - OUTFIT_ITEMS[b.id].price);
    if (!state.eqItem || !visible.some((r) => r.id === state.eqItem)) state.eqItem = visible.find((r) => OUTFIT_ITEMS[r.id].category === 'gun' && r.tier === 2)?.id ?? visible[0]?.id;
    const freeMount = (d) => mounts.find((s) => equipmentFitsMount(d, s) && !mountItemId(fit, s));
    const anyMount = (d) => mounts.find((s) => equipmentFitsMount(d, s));
    const fitTag = (d) => freeMount(d) ? `<em class="sx-fit is-free">${tr('Free mount')}</em>` : anyMount(d) ? `<em class="sx-fit is-swap">${tr('Replace')}</em>` : `<em class="sx-fit">${tr('No mount')}</em>`;
    const cards = visible.map((r) => {
        const d = OUTFIT_ITEMS[r.id];
        return `<button class="sx-item" style="${rarityVar(d)}" aria-selected="${r.id === state.eqItem}" data-item="${html(r.id)}">
          <span class="sx-art">${equipmentIcon(d)}<i class="sx-tier-badge">${roman(d.tier ?? r.tier ?? 1)}</i></span>
          <b>${html(equipmentName(d, {affixes: false}))}</b>
          <small class="sx-label">${html(tr(d.category === 'gun' ? 'Gun' : d.category === 'launcher' ? 'Launcher' : d.category === 'turret' ? 'Turret' : d.category === 'drone' ? 'Drone' : 'System'))} · ${num(d.mass)} ${t('MASS')}</small>
          <span class="sx-item-foot"><b class="sx-price">${state.eqView === 'shop' ? cr(d.price) : num(d.mass) + ' ' + t('MASS')}</b>${fitTag(d)}</span>
        </button>`;
    }).join('') || `<p class="sx-copy" style="padding:8px">${t('No equipment here.')}</p>`;
    const slot = (s) => {
        const d = OUTFIT_ITEMS[mountItemId(fit, s)];
        return `<button class="sx-slot ${d ? '' : 'is-empty'}" style="${d ? rarityVar(d) : ''}" aria-selected="${state.eqMount === s.mount.id}" data-mount="${html(s.mount.id)}">
          <span class="sx-row-icon" style="--accent:var(--rarity, var(--sx-text-3))">${d ? equipmentIcon(d) : svg('<path d="M12 6v12M6 12h12"/>', 20)}</span>
          <span style="min-width:0"><small>${html(mountLabel(s))}</small><b>${d ? html(equipmentName(d, {affixes: false})) : t('EMPTY')}</b></span>
          ${d ? `<span class="sx-tier">${roman(d.tier ?? 1)}</span>` : ''}
        </button>`;
    };
    const groups = [['weapons', tr('Weapons')], ['turrets', tr('Turrets')], ['utility', tr('Systems')], ['droneBays', tr('Drones')]]
        .map(([key, label]) => [label, mounts.filter((s) => s.key === key)]).filter(([, list]) => list.length)
        .map(([label, list]) => `<div class="sx-slot-group"><span class="sx-label">${label}</span>${list.map(slot).join('')}</div>`).join('');
    // detail
    const d = OUTFIT_ITEMS[state.eqItem];
    let detail = '';
    if (d) {
        const target = freeMount(d) ?? anyMount(d), old = target ? OUTFIT_ITEMS[mountItemId(fit, target)] : undefined;
        const w = flight(d), before = flight(old);
        const rows = [];
        const add = (label, a, b, digits = 1, lowerBetter = false) => rows.push({label, a, b, digits, lowerBetter});
        if (w) {
            add('Damage', before ? (before.damageFlat ?? before.damage) : 0, w.damageFlat ?? w.damage);
            add('Energy per shot', before?.energyCost ?? 0, w.energyCost, 1, true);
            add('Shot interval', before?.cooldown ?? before?.shotInterval ?? 0, w.cooldown ?? w.shotInterval, 2, true);
            add('Range', before?.range ?? before?.lockRange ?? 0, w.range ?? w.lockRange, 0);
        }
        const compare = rows.length ? rows.map((r) => {
            const max = Math.max(r.a, r.b) * 1.15 || 1, diff = r.b - r.a, better = r.lowerBetter ? diff < 0 : diff > 0;
            const cls = Math.abs(diff) < 1e-6 ? '' : better ? 'is-better' : 'is-worse';
            return `<div class="sx-compare-row ${cls}"><span>${html(t(r.label))}</span><b>${old ? `<s>${num(r.a, r.digits)} →</s>` : ''}${num(r.b, r.digits)}${old && Math.abs(diff) > 1e-6 ? `<em>${diff > 0 ? '+' : '−'}${num(Math.abs(diff), r.digits)}</em>` : ''}</b><span class="sx-cmp"><i style="--a:${r.a / max * 100}%;width:${r.a / max * 100}%"></i><i style="--a:${r.a / max * 100}%;--b:${r.b / max * 100}%;width:${r.b / max * 100}%"></i></span></div>`;
        }).join('') : equipmentEffectStats(d).map((r) => `<div class="sx-compare-row is-better"><span>${html(t(r.label))}</span><b>${r.value > 0 ? '+' : ''}${num(r.value)}${r.unit}</b></div>`).join('');
        const rare = EQUIPMENT_RARITIES[quality(d)];
        detail = `<section class="sx-panel" style="${rarityVar(d)}">
          <div class="sx-detail-head">
            <span class="sx-art">${equipmentIcon(d)}</span>
            <div style="display:grid;gap:10px;align-content:start;min-width:0">
              <div class="sx-meta"><span class="is-rarity">${html(t(rare.name))}</span><span>${t('TIER')} ${roman(d.tier ?? 1)}</span><span>${num(d.mass)} ${t('MASS')}</span></div>
              <h3>${html(equipmentName(d))}</h3>
              <p class="sx-copy" style="font-size:14px">${html(t(d.description ?? ''))}</p>
            </div>
          </div>
          <div class="sx-detail-body">
            <span class="sx-label">${target ? `${tr('Compared with')} ${html(mountLabel(target))}${old ? ' · ' + html(equipmentName(old, {affixes: false})) : ' · ' + t('EMPTY')}` : tr('Effect')}</span>
            <div class="sx-compare">${compare}</div>
          </div>
          <div class="sx-detail-foot">
            ${target ? `<div class="sx-hint ${old ? 'is-warn' : ''}">${ICON.info}<span>${old ? t('Replaces {item}. The old item stays in station storage.', {item: equipmentName(old, {affixes: false})}) : tr('Fits {mount}, which is empty.', {mount: mountLabel(target)})}</span></div>` : ''}
            <button class="sx-btn sx-btn-primary" ${player.credits < d.price ? 'disabled' : ''}>${t('BUY')}<small>${cr(d.price)}</small></button>
            <button class="sx-btn sx-btn-ghost" data-only="phone">${t('Details')}</button>
          </div>
        </section>`;
    }
    const views = [['shop', t('SHOP'), shop.length], ['cargo', t('CARGO'), owned.filter((i) => i.location.kind === 'cargo').length], ['storage', t('STORAGE'), owned.filter((i) => i.location.kind === 'station').length]];
    const capacityPct = Math.min(100, stats.reactorOutput / Math.max(1, stats.reactorOutput) * 100);
    return `<main class="sx-body sx-equip">
      <section class="sx-panel sx-loadout">
        <header class="sx-panel-head"><h2>${tr('Loadout')}</h2></header>
        <div class="sx-ship-card"><span class="sx-label">${html(t(SHIPS[player.shipId].role ?? ''))} · T${SHIPS[player.shipId].tier ?? 1}</span><h3>${html(SHIPS[player.shipId].name)}</h3></div>
        <div class="sx-scroll">${groups}</div>
        <div class="sx-power">
          <div class="sx-power-row"><span>${t('Energy capacity')}</span><b>${num(stats.energyCapacity)}</b></div>
          <div class="sx-power-row"><span>${t('Energy regeneration')}</span><b>${num(stats.reactorOutput)}/s</b></div>
          <div class="sx-bar" style="height:6px"><i style="width:${capacityPct * 0.62}%"></i></div>
          <div class="sx-power-row"><span>${t('Cargo')}</span><b>${num(cargoMass(player))}/${num(stats.cargo)}</b></div>
        </div>
      </section>
      <section class="sx-panel">
        <div class="sx-catalog-tools"><div class="sx-seg">
          <button data-only="phone" data-eqview="ship" aria-pressed="${state.eqView === 'ship'}">${tr('Ship')}</button>
          ${views.map(([id, label, n]) => `<button data-eqview="${id}" aria-pressed="${state.eqView === id}">${label}<i class="sx-badge">${n}</i></button>`).join('')}
        </div></div>
        ${state.eqView === 'ship' ? `<div class="sx-scroll sx-slot-list">${groups}</div>` : `
        <div class="sx-chips">${CATS.map(([id, label]) => `<button class="sx-filter" data-eqcat="${id}" aria-pressed="${state.eqCat === id}">${tr(label)}</button>`).join('')}</div>
        <div class="sx-scroll"><div class="sx-grid">${cards}</div></div>`}
      </section>
      <div class="sx-detail">${detail}</div>
    </main>`;
}

// -------------------------------------------------------------- missions
const offers = generateMissionOffers(portId, save, 12);
function routeOf(m) {
    const targetId = m.kind === 'salvage' ? m.targetZone ?? 'mourning-line' : m.kind === 'bounty' ? m.targetZone : m.kind === 'mining' && m.claimNodeId ? 'shardbelt' : m.destination;
    const target = LOCATIONS[targetId];
    const plan = target ? planRoute(LOCATIONS[m.origin ?? portId]?.systemId ?? player.systemId, targetId) : undefined;
    return {targetId, target, hops: plan?.ok ? plan.hopCount : 0, system: SYSTEMS[target?.systemId]?.name ?? ''};
}
function missions() {
    const list = offers.filter((m) => state.msKind === 'all' || m.kind === state.msKind);
    if (!list.some((m) => m.id === state.mission)) state.mission = (list.find((m) => m.kind === 'transport') ?? list[0])?.id;
    const kinds = [...new Set(offers.map((m) => m.kind))];
    const rows = list.map((m) => {
        const k = kindOf(m), r = riskOf(m), route = routeOf(m);
        return `<button class="sx-row" role="option" aria-selected="${m.id === state.mission}" data-mission="${html(m.id)}" style="--accent:${k.color}">
          <span class="sx-row-icon">${k.icon}</span>
          <span class="sx-row-main"><span class="sx-kind">${tr(k.label)} · ${r.label}</span><b>${html(missionTitle(m))}</b><small>${html(route.target?.name ?? '')} · ${route.hops ? t(route.hops === 1 ? '1 jump' : '{count} jumps', {count: route.hops}) : t('LOCAL')}</small></span>
          <span class="sx-row-side"><b class="sx-price" style="color:var(--sx-gold)">${cr(m.reward + (m.complication?.bonus ?? 0))}</b>${risk(r.level)}</span>
        </button>`;
    }).join('');
    const m = offers.find((x) => x.id === state.mission);
    let dossier = '';
    if (m) {
        const k = kindOf(m), r = riskOf(m), route = routeOf(m);
        const hops = Math.max(0, route.hops);
        const deadline = Number.isFinite(m.deadline) ? formatDuration(m.deadline - save.world.time) : t('NO DEADLINE');
        const units = ['delivery', 'transport', 'smuggle'].includes(m.kind) ? Number(m.quantity) || 0 : 0;
        dossier = `<section class="sx-panel" style="--accent:${k.color}">
          <div class="sx-dossier-hero">
            <div style="min-width:0"><span class="sx-kind">${tr(k.label)} · ${r.label}</span> ${risk(r.level)}<h3>${html(missionTitle(m))}</h3><p>${html(t(m.issuer ?? ''))}</p></div>
            <div class="sx-reward"><span class="sx-label">${tr('Reward')}</span><b>${cr(m.reward)}</b>${m.complication ? `<small>+${cr(m.complication.bonus)} ${tr('bonus')}</small>` : ''}</div>
          </div>
          <div class="sx-dossier-body">
            <div class="sx-route">
              <div class="sx-route-node"><span class="sx-label">${tr('From')}</span><b>${html(LOCATIONS[m.origin ?? portId]?.shortName ?? port.shortName)}</b><small>${html(SYSTEMS[port.systemId]?.name ?? '')}</small></div>
              <div class="sx-route-line"><i></i>${Array.from({length: Math.min(3, hops)}, () => '<i></i>').join('')}<i></i><em>${hops ? t(hops === 1 ? '1 JUMP' : '{count} JUMPS', {count: hops}) : t('LOCAL')}</em></div>
              <div class="sx-route-node"><span class="sx-label">${tr('To')}</span><b>${html(route.target?.shortName ?? '—')}</b><small>${html(route.system)}</small></div>
            </div>
            <dl class="sx-terms" style="margin:0">
              <div><dt>${ICON.clock}${t('DEADLINE')}</dt><dd>${deadline}</dd></div>
              ${m.deposit > 0 ? `<div><dt>${t('BOND')}</dt><dd>${cr(m.deposit)}</dd></div>` : ''}
              ${units ? `<div><dt>${t('CARGO')}</dt><dd>${num(units)} ${t('MASS')}</dd></div>` : ''}
              ${m.guildRep > 0 ? `<div><dt>${t('GUILD REP')}</dt><dd>+${m.guildRep}</dd></div>` : ''}
            </dl>
            ${m.complication ? `<div class="sx-bonus"><span class="sx-label" style="color:var(--sx-warn)">${m.complication.kind === 'fragile' ? t('FRAGILE LOAD') : t('EARLY DELIVERY BONUS')}</span><span>${m.complication.kind === 'fragile' ? t('Keep structural damage at zero after acceptance.') : tr('Deliver early to earn the bonus.')}</span><b>+${cr(m.complication.bonus)}</b></div>` : ''}
            <p class="sx-copy">${html(missionBriefing(m))}</p>
          </div>
          <div class="sx-dossier-foot"><button class="sx-btn sx-btn-primary" ${player.credits < (m.deposit ?? 0) ? 'disabled' : ''}>${t('ACCEPT')}${m.deposit ? `<small>${t('BOND')} ${cr(m.deposit)}</small>` : ''}</button><p>${tr('Accepted contracts appear under Active and on your nav map.')}</p></div>
        </section>`;
    }
    return `<main class="sx-body sx-missions">
      <section class="sx-panel">
        <header class="sx-panel-head"><div class="sx-seg" style="flex:1"><button aria-pressed="true">${tr('Available')}<i class="sx-badge">${offers.length}</i></button><button aria-pressed="false">${tr('Active')}<i class="sx-badge">0</i></button></div></header>
        <div class="sx-chips">${['all', ...kinds].map((id) => `<button class="sx-filter" data-mskind="${id}" aria-pressed="${state.msKind === id}">${id === 'all' ? tr('All') : tr(KIND[id]?.label ?? id)}</button>`).join('')}</div>
        <div class="sx-scroll"><div class="sx-list" role="listbox">${rows}</div></div>
      </section>
      <div class="sx-detail">${dossier}</div>
    </main>`;
}

// ---------------------------------------------------------------- render
const art = {trade: 'market', equipment: 'market', missions: 'bar'};
function render() {
    const root = document.getElementById('app');
    const scroll = [...root.querySelectorAll('.sx-scroll')].map((e) => e.scrollTop);
    const bar = [['missions', tr('Contracts'), ICON.contracts, offers.length], ['guilds', tr('Guilds'), ICON.guilds], ['people', tr('People'), ICON.people]];
    const body = screen === 'trade' ? trade() : screen === 'equipment' ? equipment() : missions();
    root.innerHTML = `<div class="sx" data-screen="${screen}">
      <div class="sx-backdrop"><img src="/art/locations/v3/${art[screen]}-${portId}-hd-v1.png" alt=""></div>
      ${header(screen === 'missions' ? bar : MARKET_TABS(), screen === 'missions' ? 'missions' : screen)}
      ${body}
    </div>`;
    root.querySelectorAll('.sx-scroll').forEach((e, i) => { e.scrollTop = scroll[i] ?? 0; });
    root.querySelectorAll('.sx-panel').forEach((e) => { e.style.animation = render.done ? 'none' : ''; });
    render.done = true;
}
document.addEventListener('click', (event) => {
    const el = event.target.closest('button');
    if (!el) return;
    const d = el.dataset;
    if (d.commodity) { state.commodity = d.commodity; state.qty = Math.min(state.qty, 99); }
    else if (d.qty) state.qty = Math.max(1, state.qty + Number(d.qty));
    else if (d.set) state.qty = Number(d.set);
    else if (d.item) state.eqItem = d.item;
    else if (d.eqview) { state.eqView = d.eqview; state.eqItem = undefined; }
    else if (d.eqcat) { state.eqCat = d.eqcat; state.eqItem = undefined; }
    else if (d.mount) state.eqMount = d.mount;
    else if (d.mission) state.mission = d.mission;
    else if (d.mskind) state.msKind = d.mskind;
    else return;
    render();
});
document.addEventListener('input', (event) => { if (event.target.matches('[data-range]')) { state.qty = Number(event.target.value); render(); } });
await document.fonts.ready;
render();
window.styleFrame = {ready: true, screen, state, render};
