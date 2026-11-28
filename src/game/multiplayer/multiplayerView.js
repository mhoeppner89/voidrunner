import { ARENA_SITES } from '../arenaSites.js';
import { SHIPS } from '../data.js';
import { t } from '../i18n.js';
import { formatCredits } from '../random.js';
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

export function matchClock(seconds = 0) {
    const total = Math.max(0, Math.ceil(seconds - 1e-6));
    return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

const teamLabel = team => team === 'red' ? t('Red team') : t('Blue team');

function roster(state, localId, score = false) {
    const rows = score ? state.standings.players : state.players;
    const header = score ? `<th>${literal('Kills')}</th><th>${literal('Deaths')}</th><th>${literal('Points')}</th>` : `<th>${literal('Points per kill')}</th>`;
    const body = rows.map(pilot => {
        const suffix = pilot.id === localId ? t('You') : pilot.id === state.hostId ? t('Host') : '';
        const name = `<td><b>${html(pilot.name)}</b>${suffix ? ` <small>${html(suffix)}</small>` : ''}${pilot.connected ? '' : ` <small>${literal('Left')}</small>`}</td>`;
        const team = state.settings.mode === 'teams'
            ? `<td class="match-team ${html(pilot.team)}">${pilot.team ? html(teamLabel(pilot.team)) : '—'}</td>` : '';
        const hull = `<td>${html(SHIPS[pilot.shipId]?.name)}</td>`;
        return `<tr>${name}${team}${hull}${score ? `<td>${html(pilot.kills)}</td><td>${html(pilot.deaths)}</td><td><strong>${html(pilot.score)}</strong></td>` : `<td>${html(pilot.pointsPerKill)}</td>`}</tr>`;
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
    if (!model.host || !hasSeat) return '';
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

function lobby(model) {
    const ready = model.state.canStart;
    const teamMode = model.state.settings.mode === 'teams';
    return {
        title: t('Multiplayer lobby'),
        body: `${settings(model)}${roster(model.state, model.localId)}
            <div class="match-settings match-fit">
                <label>${literal('Starting hull')}<select data-match-setting="starter">
                    ${MULTIPLAYER_STARTER_IDS.map(id => option(id, SHIPS[id].name, model.pilot?.starterShipId)).join('')}
                </select></label>
                ${teamMode ? `<label>${literal('Your team')}<select data-match-setting="team">
                    ${option('', t('Choose team'), model.pilot?.team ?? '')}${option('red', teamLabel('red'), model.pilot?.team)}${option('blue', teamLabel('blue'), model.pilot?.team)}
                </select></label>` : ''}
            </div>${invitation(model)}`,
        footer: `${back(t('Leave room'))}${model.host ? button('start', t('Start round'), { primary: true, disabled: !ready || model.busy }) : ''}`,
        hint: ready ? '' : teamMode ? t('Two pilots per team are needed to start.') : t('At least two pilots are needed to start.'),
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
        <div class="match-nearby-heading"><h3>${literal('Nearby rooms')}</h3>${button('refresh-nearby', t('Refresh'), { disabled: Boolean(model.joiningNearby) })}</div>
        ${rooms.length ? `<ul class="match-shop-list">${entries}</ul>` : `<p>${literal('No open rooms found on this Wi-Fi.')}</p>`}
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
            if (field.dataset.matchSetting) action('setting', { key: field.dataset.matchSetting, value: field.value });
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
                body: `<p>${literal('Play with up to three friends on the same Wi-Fi.')}</p>
                    <label class="match-field">${literal('Pilot name')}<input data-match-field="name" maxlength="24" autocomplete="nickname" value="${html(model.name)}"></label>
                    ${model.native ? nearbyRooms(model) : ''}`,
                footer: `${back(t('Back'))}${model.native ? '' : button('show-join', t('Join'))}${button('host', t('Host room'), { primary: true })}`,
            };
        } else if (screen === 'join') view = joining(model);
        else if (screen === 'lobby') view = lobby(model);
        else if (screen === 'shop') view = shop(model);
        else if (screen === 'score' || screen === 'ended') view = scores(model, screen === 'ended');
        else if (screen === 'preparing') view = {
            title: t('Preparing arena'),
            body: `<p>${literal('Waiting for every pilot to load the arena.')}</p>`,
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
        const focus = document.activeElement;
        const keepNameFocus = previous === screen && focus?.matches('[data-match-field="name"]') && this.panel.contains(focus);
        const selection = keepNameFocus ? [focus.selectionStart, focus.selectionEnd] : undefined;
        this.panel.dataset.screen = screen;
        this.panel.innerHTML = `<article class="match-card">
            <header><h2 id="multiplayer-heading" tabindex="-1">${html(view.title)}</h2></header>
            <div class="match-scroll">${view.body}</div>
            <p class="match-message" role="status">${html(model.status || view.hint || '')}</p>
            <footer class="match-actions">${view.footer}</footer>
        </article>`;
        this.panel.classList.remove('is-hidden');
        this.ui.root.querySelector('#title-screen').inert = true;
        if (previous !== screen) this.panel.querySelector('h2').focus({ preventScroll: true });
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
