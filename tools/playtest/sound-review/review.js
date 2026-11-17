// Sound review stand: drives the real AudioManager from sliders and buttons.
import { AudioManager } from '/src/game/audio.js';
import { SOUND_EVENTS } from '/src/game/soundEvents.js';

const $ = (id) => document.getElementById(id);
const value = (id) => Number($(id).value);
const audio = new AudioManager();
const flight = { speed: 0, turn: 0, yaw: 0, shield: 1, hyper: false, missileThreat: 0, dockKind: undefined };
const PLACES = [['open', 'Deep space'], ['planet', 'Near a planet'], ['field', 'Asteroid belt'], ['graveyard', 'Ship graveyard'], ['stealth', 'Running dark'], ['dock:station', 'Docked · station'], ['dock:planet', 'Docked · planet']];
const GROUPS = [
    ['Weapons', ['laser', 'beam', 'gauss', 'pdc', 'ripper', 'ion', 'mortar', 'missile', 'capacitorEmpty']],
    ['Taking damage', ['shield', 'hit', 'shieldBreak', 'shieldRestore', 'targetShieldBreak', 'hullAlarm', 'spark', 'creak']],
    ['World', ['impact', 'rock', 'explosion', 'capitalExplosion', 'flyby', 'whizz']],
    ['Ship systems', ['afterburnerOn', 'afterburnerOff', 'scan', 'dock', 'pickup', 'salvage', 'mining', 'repair', 'hyperSpool', 'hyperActive', 'hyperDrop', 'slipstream']],
    ['Targeting & alerts', ['targetCycle', 'targetLock', 'lockWarning', 'missileAlert', 'alert', 'threat', 'kill', 'countdown', 'raceGo', 'commsOpen', 'commsClose', 'chatter']],
    ['Menus', ['ui', 'uiHover', 'uiTab', 'uiOpen', 'uiClose', 'confirm', 'deny', 'purchase', 'equip', 'weaponSwitch', 'success', 'reward', 'discovery']],
    ['Ambience details', ['clank', 'pneumatic', 'paChirp', 'rockKnock', 'metalGroan', 'voidWhisper']],
];
let place = 'open', analyser, samples, peakHold = 0, last = performance.now();

const listed = new Set(GROUPS.flatMap(([, ids]) => ids));
const extra = Object.keys(SOUND_EVENTS).filter((id) => !listed.has(id));
if (extra.length) GROUPS.push(['Other', extra]);
for (const [title, ids] of GROUPS) {
    const group = document.createElement('div');
    group.className = 'group';
    group.innerHTML = `<span>${title}</span><div class="grid">${ids.map((id) => `<button data-event="${id}" disabled>${id}</button>`).join('')}</div>`;
    $('events').append(group);
}
$('places').innerHTML = PLACES.map(([id, label]) => `<button data-place="${id}" disabled class="${id === place ? 'is-on' : ''}">${label}</button>`).join('');

function play(id) {
    const distance = value('distance');
    if (id === 'mining' || id === 'repair') { for (let i = 0; i < 6; i += 1) setTimeout(() => audio.play(id, 0.6), i * 300); return; }
    if (distance <= 0) audio.play(id, 0.8, value('side') * 0.8);
    else audio.playAtDirection(id, 1, distance, value('side') * distance, $('behind').checked ? distance * 0.8 : -distance * 0.4);
}

function frame(now) {
    const dt = Math.max(0, Math.min(0.1, (now - last) / 1000)); last = now;
    const docked = place.startsWith('dock:');
    if (audio.stationMode !== docked) audio.setStationMode(docked);
    const turn = value('turn');
    Object.assign(flight, { speed: docked ? 0 : value('speed'), turn: Math.abs(turn), yaw: turn, shield: value('shield'), hyper: $('hyper').checked, missileThreat: value('missile'), dockKind: docked ? place.slice(5) : undefined });
    audio.update(dt, value('throttle'), $('burn').checked, value('damage'), value('enemies'), docked ? 'open' : place, 0, flight);
    analyser.getFloatTimeDomainData(samples);
    let peak = 0;
    for (const sample of samples) peak = Math.max(peak, Math.abs(sample));
    peakHold = Math.max(peak, peakHold * 0.94);
    const bar = $('meter').firstElementChild;
    bar.style.width = `${Math.min(100, peakHold * 100)}%`; bar.classList.toggle('hot', peakHold > 0.89);
    $('s-context').textContent = audio.currentContext ?? '–'; $('s-tier').textContent = audio.currentContext === 'combat' ? audio.music.tier : '–';
    $('s-bar').textContent = audio.music.bar; $('s-voices').textContent = audio.activeVoices; $('s-bank').textContent = audio.bank.buffers.size;
    $('s-peak').textContent = peakHold > 0.0001 ? (20 * Math.log10(peakHold)).toFixed(1) : '−∞';
    requestAnimationFrame(frame);
}

$('start').addEventListener('click', async () => {
    $('start').disabled = true; $('start').textContent = 'Loading sounds …';
    audio.setVolumes(value('music'), value('effects'));
    await audio.enable();
    audio.setStationMode(false);
    await Promise.all([audio.samplesReady, audio.bank.load('music'), audio.bank.load('dock')]);
    analyser = audio.context.createAnalyser(); analyser.fftSize = 2048; samples = new Float32Array(analyser.fftSize);
    audio.master.connect(analyser);
    for (const button of document.querySelectorAll('button[disabled]')) button.disabled = false;
    $('start').hidden = true; $('status').hidden = false; $('meter').hidden = false;
    last = performance.now(); requestAnimationFrame(frame);
});
document.addEventListener('click', (event) => {
    const button = event.target.closest('button');
    if (!button || !audio.enabled) return;
    if (button.dataset.event) play(button.dataset.event);
    else if (button.dataset.stinger) audio.stinger(button.dataset.stinger);
    else if (button.dataset.place) {
        place = button.dataset.place;
        for (const other of document.querySelectorAll('[data-place]')) other.classList.toggle('is-on', other === button);
    }
});
for (const id of ['music', 'effects']) $(id).addEventListener('input', () => audio.setVolumes(value('music'), value('effects')));
$('paused').addEventListener('change', () => audio.setPaused($('paused').checked));
// Exposed for the automated check.
window.soundReview = { audio, play };
