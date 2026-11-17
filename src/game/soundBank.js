// Sound bank: every decoded buffer the game plays, loaded by group.
//
// Two sources feed it. RECORDED are the licensed/owner-supplied bodies in
// assets/audio (see SOURCES.md); FORGED_SOUNDS are the designed layers
// rendered by tools/audio/forge.mjs into assets/audio/fx. soundEvents.js
// stacks both into finished events.
import { FORGED_SOUNDS } from './soundBankManifest.js';

const recorded = (group, files, loop) => ({ files, group, ...(loop ? { loop } : {}) });
const RECORDED = {
    'laser': recorded('flight', ['laser-0.mp3']),
    'beam': recorded('flight', ['beam-0.mp3']),
    'gauss': recorded('flight', ['gauss-0.mp3']),
    'pdc': recorded('flight', ['pdc-0.mp3']),
    'ripper': recorded('flight', ['ripper-0.mp3']),
    'ion': recorded('flight', ['ion-0.mp3']),
    'mortar': recorded('flight', ['mortar-0.mp3']),
    'missile': recorded('flight', ['missile-0.mp3']),
    'shield': recorded('flight', ['shield-0.mp3', 'shield-1.mp3', 'shield-2.mp3']),
    'hit': recorded('flight', ['hit-0.mp3']),
    'impact': recorded('flight', ['impact-0.mp3']),
    'rock': recorded('flight', ['rock-0.mp3']),
    'explosion': recorded('flight', ['explosion-0.mp3', 'explosion-1.mp3', 'explosion-2.mp3']),
    'capitalExplosion': recorded('flight', ['capitalExplosion-0.mp3']),
    'repair': recorded('flight', ['repair-0.mp3']),
    'mining': recorded('flight', ['mining-0.mp3']),
    'salvage': recorded('flight', ['salvage-0.mp3']),
    'hyperSpool': recorded('flight', ['hyperSpool-0.mp3']),
    'hyperDrop': recorded('flight', ['hyperDrop-0.mp3']),
    'hyperActive': recorded('flight', ['hyperActive-0.mp3']),
    'slipstream': recorded('flight', ['slipstream-0.mp3']),
    'pickup': recorded('flight', ['pickup-0.mp3']),
    'dock': recorded('flight', ['dock-0.mp3']),
    'engine-idle': recorded('flight', ['engine-idle.mp3']),
    'engine-thrust': recorded('flight', ['engine-thrust.mp3']),
    'engine-afterburner': recorded('flight', ['engine-afterburner.mp3']),
};
export const SOUNDS = { ...RECORDED, ...FORGED_SOUNDS };
// Load order inside a group: what the first seconds of play need comes first.
const PRIORITY = ['ui-click', 'engine-idle', 'engine-thrust', 'engine-afterburner', 'loop-engine-sub', 'laser', 'hit', 'shield', 'explosion'];
const CONCURRENCY = 6;

export class SoundBank {
    constructor(context) {
        this.context = context;
        this.buffers = new Map();
        this.last = new Map();
        this.groups = new Map();
        this.failed = new Set();
    }
    // Idempotent: a second call for the same group returns the first promise.
    load(group) {
        if (this.groups.has(group)) return this.groups.get(group);
        const ids = Object.keys(SOUNDS).filter((id) => SOUNDS[id].group === group)
            .sort((a, b) => (PRIORITY.indexOf(a) + 1 || 99) - (PRIORITY.indexOf(b) + 1 || 99));
        const queue = ids.flatMap((id) => SOUNDS[id].files.map((file, index) => ({ id, file, index })));
        const worker = async () => {
            for (let job = queue.shift(); job; job = queue.shift()) {
                if (this.closed) return;
                try {
                    const response = await fetch(new URL(`../../assets/audio/${job.file}`, import.meta.url));
                    if (!response.ok) throw new Error(`${response.status}`);
                    const buffer = await this.context.decodeAudioData(await response.arrayBuffer());
                    let slots = this.buffers.get(job.id);
                    if (!slots) this.buffers.set(job.id, slots = []);
                    slots[job.index] = buffer;
                }
                catch (error) {
                    if (!this.closed && !this.failed.has(job.file)) console.warn('Could not load sound', job.file, error);
                    this.failed.add(job.file);
                }
            }
        };
        const ready = Promise.all(Array.from({ length: CONCURRENCY }, worker)).then(() => undefined);
        this.groups.set(group, ready);
        return ready;
    }
    has(id) {
        return this.buffers.has(id);
    }
    // A random variant that never repeats the previous pick, so rapid fire
    // cannot machine-gun one take.
    buffer(id) {
        const slots = this.buffers.get(id);
        if (!slots) return undefined;
        const loaded = slots.length === 1 ? slots : slots.filter(Boolean);
        if (loaded.length <= 1) return loaded[0];
        const previous = this.last.get(id);
        let index = Math.floor(Math.random() * (loaded.length - 1));
        if (index >= previous) index += 1;
        this.last.set(id, index);
        return loaded[index] ?? loaded[0];
    }
    // [startSeconds, periodSeconds] for forged loops; recorded loops span the file.
    loopOf(id, buffer) {
        const loop = SOUNDS[id]?.loop;
        return loop ? [loop[0], loop[0] + loop[1]] : [0, buffer.duration];
    }
    // A looping source, not yet started or connected.
    loopSource(id) {
        const buffer = this.buffer(id);
        if (!buffer) return undefined;
        const source = this.context.createBufferSource();
        source.buffer = buffer; source.loop = true;
        [source.loopStart, source.loopEnd] = this.loopOf(id, buffer);
        return source;
    }
    close() {
        this.closed = true;
        this.buffers.clear();
    }
}
