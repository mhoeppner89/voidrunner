import { ARENA_SITES } from '../arenaSites.js';
import { runShipTotals } from '../arenaRunView.js';
import { SHIPS } from '../data.js';
import { hullCardMaxima, renderHullCard } from '../hullCardView.js';
import { getLanguage, t } from '../i18n.js';
import { equipmentIcon } from '../itemIcons.js';
import { OUTFIT_ITEMS } from '../outfitting.js';
import { formatCredits } from '../random.js';
import { BOT_CHARACTERS, BOT_DIFFICULTIES, BOT_DIFFICULTY_LABELS } from './botProfiles.js';
import { multiplayerKillPoints, starterMultiplayerFit, STARTER_GEAR } from './matchShop.js';
import { MULTIPLAYER_STARTER_IDS } from './pilotFitting.js';

const html = value => String(value ?? '').replace(/[&<>"']/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
})[char]);
const selected = (actual, choice) => actual === choice ? ' selected' : '';
const unavailable = condition => condition ? ' disabled' : '';
const option = (value, label, current) => `<option value="${html(value)}"${selected(current, value)}>${html(label)}</option>`;
const button = (action, label, { primary = false, disabled = false } = {}) => `<button type="button" data-match-action="${action}" class="match-button${primary ? ' match-primary' : ''}"${unavailable(disabled)}>${html(label)}</button>`;
const back = label => `<button type="button" class="match-button" data-ui-command="multiplayer-back">${html(label)}</button>`;
const literal = label => html(t(label));
const starterMaxima = hullCardMaxima(MULTIPLAYER_STARTER_IDS);
const gearNote = {
    'beam-emitter': 'Instant beam pulses', 'pulse-cannon': 'Steady projectile fire', 'ripper': 'Wide spread at close range',
    'capacitor-bank': 'More energy storage',
    'recovery-shield': 'Faster shield recovery', 'thrusters-mk2': 'Faster turns',
};

export function matchClock(seconds = 0) {
    const total = Math.max(0, Math.ceil(seconds - 1e-6));
    return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

const teamLabel = team => team === 'red' ? t('Red team') : t('Blue team');

function roster(state, localId, score = false) {
    const rows = score ? state.standings.players : state.players;
    const header = score ? `<th>${literal('Kills')}</th><th>${literal('Deaths')}</th><th>${literal('Points')}</th>`
        : `<th>${literal('Loadout')}</th><th>${literal('Points per kill')}</th>`;
    const body = rows.map(pilot => {
        const suffix = pilot.bot ? `${t('Bot')} · ${t(BOT_DIFFICULTY_LABELS[pilot.bot.difficulty])}`
            : pilot.id === localId ? t('You') : pilot.id === state.hostId ? t('Host') : '';
        const name = `<td><b>${html(pilot.name)}</b>${suffix ? ` <small>${html(suffix)}</small>` : ''}${pilot.connected ? '' : ` <small>${literal('Left')}</small>`}</td>`;
        const team = state.settings.mode === 'teams'
            ? `<td class="match-team ${html(pilot.team)}">${pilot.team ? html(teamLabel(pilot.team)) : '—'}</td>` : '';
        const hull = `<td>${html(SHIPS[pilot.shipId]?.name)}</td>`;
        const status = `<td class="${pilot.starterReady ? 'match-ready' : ''}">${literal(pilot.starterReady ? 'Ready' : 'Unconfirmed')}</td>`;
        return `<tr>${name}${team}${hull}${score ? `<td>${html(pilot.kills)}</td><td>${html(pilot.deaths)}</td><td><strong>${html(pilot.score)}</strong></td>` : `${status}<td>${html(pilot.pointsPerKill)}</td>`}</tr>`;
    }).join('');
    const teams = score && state.standings.teams.length ? `<div class="match-team-totals">${state.standings.teams.map(team =>
        `<span class="match-team ${html(team.id)}">${html(teamLabel(team.id))} <b>${html(team.score)}</b></span>`).join('')}</div>` : '';
    return `${teams}<table class="match-table"><thead><tr><th>${literal('Pilot')}</th>${state.settings.mode === 'teams' ? `<th>${literal('Team')}</th>` : ''}<th>${literal('Hull')}</th>${header}</tr></thead><tbody>${body}</tbody></table>`;
}

function settings(model) {
    const value = model.state.settings;
    return `<div class="match-settings">
        <label>${literal('Mode')}<select data-match-setting="mode"${unavailable(!model.host)}>
            ${option('ffa', t('Free-for-all'), value.mode)}${option('teams', t('Team deathmatch'), value.mode)}
        </select></label>
        <label>${literal('Arena')}<select data-match-setting="siteId"${unavailable(!model.host)}>
            ${Object.entries(ARENA_SITES).map(([id, site]) => option(id, t(site.name), value.siteId)).join('')}
        </select></label>
        <label>${literal('Round length')}<select data-match-setting="durationMinutes"${unavailable(!model.host)}>
            ${[5, 10].map(minutes => option(minutes, t('{minutes} min', { minutes }), value.durationMinutes)).join('')}
        </select></label>
        <label>${literal('Friendly fire')}<select data-match-setting="friendlyFire"${unavailable(!model.host || value.mode !== 'teams')}>
            ${value.mode === 'teams' ? option(false, t('Off'), value.friendlyFire) + option(true, t('On'), value.friendlyFire) : '<option>—</option>'}
        </select></label>
    </div>`;
}

const output = (key, label, value) => `<label class="match-field">${literal(label)}<input data-match-copy="${key}" type="text" value="${html(value)}" readonly></label>${button('copy-' + key, t('Copy'))}`;

function invitation(model) {
    const hasSeat = model.state.players.length < 4;
    if (!model.host || !hasSeat || model.localOnly) return '';
    if (model.native) return `<p class="match-invite">${literal(model.nativeHosting
        ? 'Pilots on this Wi-Fi can see your room in Nearby rooms.'
        : 'Opening this room on the local network…')}</p>`;
    return `<section class="match-invite">
        ${model.roomUrl ? `<div class="match-code-row">${output('room', 'Room link', model.roomUrl)}</div>` : ''}
        <details data-match-details="manual"${model.invite ? ' open' : ''}><summary>${literal('Invite with codes')}</summary>
        <p>${literal('Send the invite code to one pilot. Paste the reply they send back.')}</p>
        ${model.invite ? `<div class="match-code-row">${output('invite', 'Invite code', model.invite)}</div>
        <label class="match-field">${literal('Reply code')}<textarea data-match-field="reply" rows="2" spellcheck="false">${html(model.reply)}</textarea></label>
        <div class="match-actions">${button('accept-reply', t('Connect pilot'), { primary: true, disabled: model.busy })}${button('cancel-invite', t('Cancel invite'), { disabled: model.busy })}</div>`
        : button('make-invite', t('Create invite code'), { disabled: model.busy })}
        </details>
    </section>`;
}

function botControls(model, teamMode) {
    if (!model.host) return '';
    const bots = model.state.players.filter(pilot => pilot.bot);
    const available = Object.entries(BOT_CHARACTERS).filter(([id]) => !bots.some(pilot => pilot.bot.characterId === id));
    const character = available.some(([id]) => id === model.botCharacter) ? model.botCharacter : available[0]?.[0];
    const add = available.length ? `<div class="match-bot-add">
        <select aria-label="${literal('Bot character')}" data-match-setting="bot-character"${unavailable(model.state.players.length >= 4)}>
            ${available.map(([id, profile]) => option(id, `${profile.name} · ${t(profile.style)}`, character)).join('')}
        </select>${button('add-bot', t('Add bot'), { disabled: model.state.players.length >= 4 || model.busy })}
    </div>` : '';
    const rows = bots.map(pilot => {
        const id = html(pilot.id);
        const profile = BOT_CHARACTERS[pilot.bot.characterId];
        return `<div class="match-bot-row${teamMode ? ' has-team' : ''}"><span><b>${html(pilot.name)}</b><small>${literal(profile.style)}</small></span>
            <select aria-label="${html(t('{name} difficulty', { name: pilot.name }))}" data-match-setting="bot-difficulty" data-match-id="${id}">
                ${BOT_DIFFICULTIES.map(value => option(value, t(BOT_DIFFICULTY_LABELS[value]), pilot.bot.difficulty)).join('')}
            </select>
            ${teamMode ? `<select aria-label="${html(t('{name} team', { name: pilot.name }))}" data-match-setting="bot-team" data-match-id="${id}">
                ${option('', t('Choose team'), pilot.team ?? '')}${option('red', teamLabel('red'), pilot.team)}${option('blue', teamLabel('blue'), pilot.team)}
            </select>` : ''}
            <button type="button" class="match-button" data-match-action="remove-bot" data-match-id="${id}" aria-label="${html(t('Remove {name}', { name: pilot.name }))}">${literal('Remove bot')}</button></div>`;
    }).join('');
    const fill = teamMode && model.state.players.length < 4 ? button('fill-bots', t('Fill teams with bots'), { disabled: model.busy }) : '';
    return `<section class="match-bots" aria-label="${literal('Bots')}"><div class="match-nearby-heading"><h3>${literal('Bots')}</h3>${fill}</div>${rows}${add}</section>`;
}

function lobby(model) {
    const ready = model.state.canStart || model.soloReady;
    const teamMode = model.state.settings.mode === 'teams';
    const loadout = button('open-loadout', t(model.pilot.starterReady ? 'Review loadout' : 'Choose loadout'), { primary: !ready && !model.pilot.starterReady });
    const start = button('start', t('Start round'), { primary: ready, disabled: !ready || model.busy });
    return {
        title: t(model.localOnly ? 'Play vs bots' : 'Multiplayer lobby'),
        body: `${settings(model)}${roster(model.state, model.localId)}
            <div class="match-settings match-fit">
                ${teamMode ? `<label>${literal('Your team')}<select data-match-setting="team">
                    ${option('', t('Choose team'), model.pilot?.team ?? '')}${option('red', teamLabel('red'), model.pilot?.team)}${option('blue', teamLabel('blue'), model.pilot?.team)}
                </select></label>` : ''}
            </div>${botControls(model, teamMode)}${invitation(model)}`,
        footer: `${back(t('Leave room'))}${loadout}${model.host ? start : ''}`,
        hint: ready ? '' : model.state.hasEnoughPilots
            ? t(model.pilot.starterReady ? 'Waiting for every pilot to confirm their loadout.' : 'Choose and confirm your loadout to get ready.')
            : teamMode ? t('Two pilots per team are needed to start.') : t('Add a bot or invite a pilot to start.'),
    };
}

function startingLoadout(model) {
    const { starterShipId: shipId, starterGear, pointsPerKill } = model.pilot;
    const formatter = new Intl.NumberFormat(getLanguage(), { maximumFractionDigits: 1 });
    const num = value => formatter.format(value);
    const score = `<span class="match-loadout-score">${html(SHIPS[shipId].name)} <b>${html(pointsPerKill)} ${literal('pts / kill')}</b></span>`;
    if (model.loadoutStage !== 'equipment') {
        const cards = MULTIPLAYER_STARTER_IDS.map(id => {
            const active = shipId === id;
            const points = multiplayerKillPoints(id, starterMultiplayerFit(id, starterGear));
            return `<button type="button" class="run-offer run-hull-card${active ? ' is-selected' : ''}" data-match-action="starter" data-match-id="${html(id)}" aria-pressed="${active}">
                ${renderHullCard(id, { num, maxima: starterMaxima, showMounts: false, caption: `${num(points)} ${t('pts / kill')}` })}
            </button>`;
        }).join('');
        return {
            title: t('Choose a starting hull'),
            body: `<div class="run-offers match-hulls">${cards}</div>`,
            footer: `${score}${back(t('Back to lobby'))}${button('loadout-equipment', t('Fit equipment'), { primary: true })}`,
        };
    }

    const outfit = starterMultiplayerFit(shipId, starterGear);
    const fit = outfit.loadouts[shipId];
    const stock = starterMultiplayerFit(shipId).loadouts[shipId];
    const picker = (slot, title) => {
        const items = [stock[slot][0], ...STARTER_GEAR[slot].filter(id => id !== stock[slot][0])];
        return `<section class="match-gear-group" aria-label="${literal(title)}"><h3>${literal(title)}</h3>${items.map((id, index) => {
            const item = OUTFIT_ITEMS[id];
            const active = fit[slot][0] === id;
            const name = id ? t(item.name) : t('No module');
            const note = index === 0 ? t('Stock fit') : t(gearNote[id]);
            const image = item ? equipmentIcon(item, 'match-gear-image') : '<span class="match-gear-empty" aria-hidden="true">—</span>';
            return `<button type="button" class="match-gear-option" aria-pressed="${active}" data-match-action="starter-gear" data-match-slot="${slot}" data-match-id="${index ? html(id) : ''}">
                <span class="match-gear-icon" aria-hidden="true">${image}</span><span><b>${html(name)}</b><small>${html(note)}</small></span>
            </button>`;
        }).join('')}</section>`;
    };
    const stats = runShipTotals({ shipId, outfitting: outfit });
    const readout = [['Sustained fire', `${num(stats.sustained)}/s`], ['Energy capacity', num(stats.energy)],
        ['Shield recharge', `${num(stats.recharge)}/s`], ['Turning', `${num(stats.turn * 180 / Math.PI)}°/s²`]];
    const totals = `<dl class="match-fit-readout">${readout.map(([label, value]) => `<div><dt>${literal(label)}</dt><dd>${html(value)}</dd></div>`).join('')}</dl>`;
    return {
        title: t('Fit your starting equipment'),
        body: `<div class="match-gear-pickers"><div>${picker('guns', 'First gun mount')}${totals}</div>${picker('utility', 'Utility mount')}</div>`,
        footer: `${score}${button('loadout-hull', t('Back to hulls'))}${button('confirm-loadout', t(model.launchAfterLoadout && model.soloReady ? 'Launch round' : 'Confirm loadout'), { primary: true })}`,
    };
}

function joining(model) {
    return {
        title: t('Join multiplayer'),
        body: `<label class="match-field">${literal('Pilot name')}<input data-match-field="name" maxlength="24" autocomplete="nickname" value="${html(model.name)}"></label>
        ${model.roomToken ? `<p>${literal('Open this room while connected to the host’s Wi-Fi.')}</p>`
        : `<label class="match-field">${literal('Room link or invite code')}<textarea data-match-field="invite" rows="3" spellcheck="false">${html(model.joinCode)}</textarea></label>`}
        ${model.guestReply ? `<div class="match-code-row">${output('reply', 'Reply code', model.guestReply)}</div><p>${literal('Send the reply code to the host to finish joining.')}</p>` : ''}`,
        footer: `${back(t('Back'))}${model.guestReply ? '' : button('join-code', t(model.roomToken ? 'Join room' : 'Connect'), { primary: true, disabled: model.busy })}`,
    };
}

function shop(model) {
    const { pilot, shop } = model;
    const hulls = (shop?.hulls ?? []).map(hull => `<li class="match-shop-row"><span><b>${html(hull.name)}</b><small>${literal('Tier')} ${html(hull.tier)} · ${html(formatCredits(hull.price))}</small></span>
        <button type="button" class="match-button" data-match-action="buy-hull" data-match-id="${html(hull.id)}"${unavailable(!hull.affordable || hull.id === pilot.shipId)}>${hull.id === pilot.shipId ? literal('Current') : `+${html(hull.pointsPerKill)} ${literal('pts / kill')}`}</button></li>`).join('');
    const groups = new Map();
    for (const item of shop?.equipment ?? []) {
        const entries = groups.get(item.category) ?? [];
        entries.push(item);
        groups.set(item.category, entries);
    }
    const equipment = [...groups].map(([category, items]) => `<details data-match-details="gear-${html(category)}"><summary>${literal(category[0].toUpperCase() + category.slice(1))}</summary>
        <ul class="match-shop-list">${items.map(item => `<li class="match-shop-row"><span><b>${html(t(item.name))}</b><small>${item.spares ? literal('Owned spare') : html(formatCredits(item.price))}</small></span>
        <div class="match-shop-slots">${item.slots.map(slot =>
            `<button type="button" class="match-button" data-match-action="buy-equipment" data-match-id="${html(item.id)}" data-match-slot="${html(slot.slot)}" data-match-index="${html(slot.index)}"${unavailable(!item.affordable || slot.itemId === item.id)}>${literal('Slot')} ${Number(slot.index) + 1} · +${html(slot.pointsPerKill)} ${literal('pts / kill')}</button>`).join('')}</div></li>`).join('')}</ul>
    </details>`).join('');
    return {
        title: t('Refit before relaunch'),
        body: `<div class="match-bank"><b>${html(formatCredits(pilot.credits))}</b><span>${html(SHIPS[pilot.shipId]?.name)} · ${literal('Tier')} ${html(SHIPS[pilot.shipId]?.tier)}</span><span>+${html(pilot.pointsPerKill)} ${literal('pts / kill')}</span></div>
        <details data-match-details="hulls"><summary>${literal('Ships')}</summary><ul class="match-shop-list">${hulls}</ul></details>
        ${equipment}${roster(model.state, model.localId, true)}`,
        footer: `${back(t('Leave room'))}${button('respawn', t('Relaunch'), { primary: true, disabled: model.busy })}`,
    };
}

function scores(model, ended) {
    const { state } = model;
    const result = state.result;
    const winners = result?.winnerTeams.length ? result.winnerTeams.map(teamLabel)
        : (result?.winnerIds ?? []).map(id => state.players.find(pilot => pilot.id === id)?.name).filter(Boolean);
    const title = ended ? t('Round complete') : t('Scoreboard');
    const winner = winners.length > 1 ? t('Tie · {names}', { names: winners.join(' / ') }) : t('Winner · {name}', { name: winners[0] ?? '—' });
    return {
        title,
        body: `<p class="match-result">${html(ended ? winner : t('{time} remaining', { time: matchClock(model.remainingSeconds) }))}</p>${roster(state, model.localId, true)}`,
        footer: `${ended ? back(t('Leave room')) : button('leave', t('Leave room'))}${ended ? model.host ? button('rematch', t('Return to lobby'), { primary: true }) : '' : back(t('Resume flight'))}`,
        hint: ended && !model.host ? t('Waiting for the host to return to the lobby.') : '',
    };
}

function nearbyRooms(model) {
    const rooms = model.nativeRooms;
    const entries = rooms.map(room => `<li class="match-shop-row"><b>${html(room.name)}</b>
        <button type="button" class="match-button match-primary" data-match-action="join-nearby" data-match-id="${html(room.id)}"${unavailable(Boolean(model.joiningNearby))}>${literal('Join')}</button></li>`).join('');
    return `<section class="match-invite" aria-label="${literal('Nearby rooms')}">
        <div class="match-nearby-heading"><h3>${literal('Nearby rooms')}</h3>${button('refresh-nearby', t(model.link ? 'Refresh' : 'Find rooms'), { disabled: Boolean(model.joiningNearby) })}</div>
        ${rooms.length ? `<ul class="match-shop-list">${entries}</ul>` : model.link ? `<p>${literal('No open rooms found on this Wi-Fi.')}</p>` : ''}
    </section>`;
}

export class MultiplayerView {
    constructor(ui, action) {
        this.ui = ui;
        this.panel = ui.root.querySelector('#multiplayer-panel');
        this.panel.addEventListener('click', event => {
            const control = event.target.closest('[data-match-action]');
            if (control && !control.disabled) action(control.dataset.matchAction, control.dataset);
        });
        this.panel.addEventListener('change', event => {
            const field = event.target;
            if (field.dataset.matchSetting) action('setting', { key: field.dataset.matchSetting, value: field.value, id: field.dataset.matchId });
        });
        this.panel.addEventListener('input', event => {
            const field = event.target;
            if (field.dataset.matchField) action('field', { key: field.dataset.matchField, value: field.value });
        });
    }

    render(model) {
        const { screen } = model;
        let view;
        if (screen === 'welcome') {
            view = {
                title: t('Multiplayer'),
                body: `<p>${literal('Play against bots or with up to three friends on the same Wi-Fi.')}</p>
                    <label class="match-field">${literal('Pilot name')}<input data-match-field="name" maxlength="24" autocomplete="nickname" value="${html(model.name)}"></label>
                    ${model.native ? nearbyRooms(model) : ''}`,
                footer: `${back(t('Back'))}${model.native ? '' : button('show-join', t('Join'))}${button('host', t('Host room'))}${button('solo-bots', t('Play vs bots'), { primary: true })}`,
            };
        } else if (screen === 'join') view = joining(model);
        else if (screen === 'lobby') view = lobby(model);
        else if (screen === 'loadout') view = startingLoadout(model);
        else if (screen === 'shop') view = shop(model);
        else if (screen === 'score' || screen === 'ended') view = scores(model, screen === 'ended');
        else if (screen === 'preparing') view = {
            title: t('Preparing arena'),
            body: `<p>${literal(model.soloReady ? 'Loading ships and the arena…' : 'Waiting for every pilot to load the arena.')}</p>`,
            footer: back(t('Leave room')),
        };
        else if (screen === 'disconnected') view = {
            title: t('Room disconnected'), body: '', footer: back(t('Back to title')),
        };
        else return this.hide();
        const scroll = this.panel.querySelector('.match-scroll')?.scrollTop ?? 0;
        const openDetails = [...this.panel.querySelectorAll('details[open]')].map(item => item.dataset.matchDetails);
        const closeDetails = [...this.panel.querySelectorAll('details:not([open])')].map(item => item.dataset.matchDetails);
        const previous = this.panel.dataset.screen;
        const previousStage = this.panel.dataset.loadoutStage;
        const focus = document.activeElement;
        const keepNameFocus = previous === screen && focus?.matches('[data-match-field="name"]') && this.panel.contains(focus);
        const keepControl = this.panel.contains(focus) && (
            screen === 'loadout' && focus.matches('[data-match-action="starter"], [data-match-action="starter-gear"]')
            || screen === 'lobby' && focus.matches('[data-match-setting]')) ? focus.dataset : undefined;
        const selection = keepNameFocus ? [focus.selectionStart, focus.selectionEnd] : undefined;
        this.panel.dataset.screen = screen;
        this.panel.dataset.loadoutStage = screen === 'loadout' ? model.loadoutStage : '';
        this.panel.innerHTML = `<article class="match-card">
            <header><h2 id="multiplayer-heading" tabindex="-1">${html(view.title)}</h2></header>
            <div class="match-scroll">${view.body}</div>
            <p class="match-message" role="status">${html(model.status || view.hint || '')}</p>
            <footer class="match-actions">${view.footer}</footer>
        </article>`;
        this.panel.classList.remove('is-hidden');
        this.ui.root.querySelector('#title-screen').inert = true;
        if (previous !== screen || previousStage !== this.panel.dataset.loadoutStage) this.panel.querySelector('h2').focus({ preventScroll: true });
        else {
            this.panel.querySelector('.match-scroll').scrollTop = scroll;
            for (const details of this.panel.querySelectorAll('details')) {
                if (openDetails.includes(details.dataset.matchDetails)) details.open = true;
                else if (closeDetails.includes(details.dataset.matchDetails) && details.dataset.matchDetails !== 'manual') details.open = false;
            }
            if (selection) {
                const input = this.panel.querySelector('[data-match-field="name"]');
                input?.focus({ preventScroll: true });
                input?.setSelectionRange(...selection);
            }
            if (keepControl) {
                const replacement = [...this.panel.querySelectorAll('[data-match-action], [data-match-setting]')].find(({ dataset }) =>
                    dataset.matchAction === keepControl.matchAction && dataset.matchSetting === keepControl.matchSetting
                    && dataset.matchId === keepControl.matchId && dataset.matchSlot === keepControl.matchSlot);
                replacement?.focus({ preventScroll: true });
            }
        }
    }

    hide() {
        this.panel.classList.add('is-hidden');
        this.panel.dataset.screen = '';
        this.ui.root.querySelector('#title-screen').inert = false;
    }

    setClock(time) {
        const clock = this.panel.querySelector('.match-result');
        if (clock) clock.textContent = t('{time} remaining', { time });
    }

    async copy(key) {
        const control = this.panel.querySelector(`[data-match-copy="${key}"]`);
        if (!control) return false;
        try {
            await navigator.clipboard.writeText(control.value);
            return true;
        } catch {
            control.focus();
            control.select();
            return document.execCommand?.('copy') ?? false;
        }
    }
}
