import { SHIPS, displaySpeed } from './data.js';
import { t } from './i18n.js';
import { HARDPOINT_SPECS } from './outfitting.js';
import { shipTopDownProfile, shipProfilePath } from './shipTopDownProfile.js';
import { uiIcon } from './uiIcons.js';

const esc = value => String(value ?? '').replace(/[&<>'"]/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;',
})[char]);
const roles = { allrounder: 'All-rounder', industrial: 'Industrial freighter', interceptor: 'Interceptor',
    fighter: 'Fighter', bomber: 'Bomber', transport: 'Transport' };
const tiers = ['', 'I', 'II', 'III'];
let rosterMax;

export function hullCardMaxima(ids) {
    return ids.reduce((max, id) => {
        const hull = SHIPS[id];
        return { shield: Math.max(max.shield, hull.shield), hull: Math.max(max.hull, hull.hull),
            speed: Math.max(max.speed, hull.maxSpeed), power: Math.max(max.power, hull.reactorOutput ?? 0) };
    }, { shield: 1, hull: 1, speed: 1, power: 1 });
}

// Use the silhouette's contours and details for framing. The profile bounds
// describe the source grid, which can leave the ship tiny inside the card.
function profileBox(profile) {
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    const add = (x, z) => {
        minX = Math.min(minX, x); maxX = Math.max(maxX, x);
        minZ = Math.min(minZ, z); maxZ = Math.max(maxZ, z);
    };
    for (const line of [...(profile.contours ?? []), ...(profile.details ?? [])])
        for (const [x, z] of line.points) add(x, z);
    for (const [x1, z1, x2, z2] of profile.edges ?? []) { add(x1, z1); add(x2, z2); }
    if (!Number.isFinite(minX)) return [profile.minX, profile.minZ, profile.maxX - profile.minX, profile.maxZ - profile.minZ];
    const pad = Math.max(maxX - minX, maxZ - minZ) * .06;
    return [minX - pad, minZ - pad, maxX - minX + pad * 2, maxZ - minZ + pad * 2];
}

export function renderHullCard(id, { num, pilot, caption, maxima, showMounts = true }) {
    const hull = SHIPS[id];
    const mounts = HARDPOINT_SPECS[id];
    const profile = shipTopDownProfile(hull.variant);
    const max = maxima ?? (rosterMax ??= hullCardMaxima(Object.keys(SHIPS)));
    const bar = (label, value, limit, shown) => `<span class="run-bar"><small>${esc(t(label))}</small><i style="--v:${Math.max(4, Math.min(100, value / limit * 100)).toFixed(1)}%"></i><b>${shown}</b></span>`;
    const counts = [['Guns', mounts.guns.length, 'equipment'], ['Missiles', mounts.launchers.length, 'missile'],
        ['Turrets', mounts.turrets.length], ['Systems', mounts.utility.length], ['Drones', mounts.droneBays.length]];
    const role = `T${hull.tier} · ${esc(t(roles[hull.role] ?? hull.role))}`;
    const silhouette = `<svg class="run-hull-image" viewBox="${profileBox(profile).map(value => +value.toFixed(2)).join(' ')}" preserveAspectRatio="xMidYMid meet" role="img" aria-label="${esc(hull.name)}"><path d="${shipProfilePath(profile)}" fill="rgba(105,228,242,.07)" stroke="currentColor" stroke-width="1.6" vector-effect="non-scaling-stroke" stroke-linejoin="round"/><path d="${shipProfilePath(profile, true)}" fill="none" stroke="currentColor" stroke-width="1" vector-effect="non-scaling-stroke" opacity=".6" stroke-linejoin="round"/></svg>`;
    return `<span class="run-hull-head"><b class="run-hull-name">${esc(hull.name)}</b><span class="run-hull-role">${role}</span>${pilot ? `<span class="run-pilot">${esc(pilot)}</span>` : ''}</span>
        <span class="run-hull-plate">${silhouette}<i class="run-tier">${tiers[hull.tier]}</i></span>
        <span class="run-bars">${bar('SHIELD', hull.shield, max.shield, num(hull.shield))}${bar('HULL', hull.hull, max.hull, num(hull.hull))}${bar('Speed', hull.maxSpeed, max.speed, num(displaySpeed(hull.maxSpeed)))}${bar('ENERGY', hull.reactorOutput ?? 0, max.power, `${num(hull.reactorOutput ?? 0)}/s`)}</span>
        ${showMounts ? `<span class="run-mount-counts">${counts.map(([label, count, icon]) => `<i title="${esc(t(label))}"><b>${icon ? uiIcon(icon, 12) : ''}${count}</b><small>${esc(t(label))}</small></i>`).join('')}</span>` : ''}
        ${caption ? `<span class="match-hull-points">${esc(caption)}</span>` : ''}`;
}
