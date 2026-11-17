// Ambience: the sound of *being somewhere*.
//
// Each place is a quiet continuous bed plus sparse, randomly placed detail
// one-shots. The beds are filtered from one shared noise loop (no decoded
// audio, no repetition); the details come from the sound bank. Nothing here
// plays on a fixed loop, so a long stay never reveals a pattern.
//
// Beds:     cockpit (life support, avionics hum), station hangar, planetside
//           wind, and a low "presence" near planets, the belt and the graveyard.
// Details:  [event, minSeconds, maxSeconds, level] per place.
const DETAILS = {
    station: [['clank', 6, 15, 0.5], ['pneumatic', 9, 22, 0.45], ['paChirp', 35, 75, 0.5]],
    planetDock: [['pneumatic', 14, 30, 0.35], ['clank', 12, 26, 0.3]],
    field: [['rockKnock', 5, 13, 0.6]],
    graveyard: [['metalGroan', 8, 18, 0.6]],
    open: [['voidWhisper', 16, 36, 0.55]],
    planet: [['voidWhisper', 22, 44, 0.4]],
};
const REGION_PRESENCE = { planet: 1, field: 0.7, graveyard: 0.85 };

export class AmbienceAudio {
    constructor(manager) {
        this.manager = manager;
        const context = manager.context;
        this.timers = new Map();
        this.sources = [];
        const noise = context.createBufferSource();
        noise.buffer = manager.pinkBuffer; noise.loop = true;
        this.sources.push(noise);
        const bed = () => { const node = context.createGain(); node.gain.value = 0; node.connect(manager.ambienceBus); return node; };
        const band = (type, frequency, q, level, target) => {
            const filter = context.createBiquadFilter(), gain = context.createGain();
            filter.type = type; filter.frequency.value = frequency; filter.Q.value = q; gain.gain.value = level;
            noise.connect(filter); filter.connect(gain); gain.connect(target);
            return gain;
        };
        const hum = (frequency, level, target) => {
            const oscillator = context.createOscillator(), gain = context.createGain();
            oscillator.frequency.value = frequency; gain.gain.value = level;
            oscillator.connect(gain); gain.connect(target); oscillator.start();
            this.sources.push(oscillator);
        };
        // Cockpit: air handling low and high, plus the faint mains of the avionics.
        this.cockpit = bed();
        band('lowpass', 360, 0.5, 0.11, this.cockpit); band('bandpass', 2600, 0.7, 0.022, this.cockpit);
        hum(58, 0.0045, this.cockpit); hum(116.3, 0.0022, this.cockpit); hum(174.6, 0.001, this.cockpit);
        // Station hangar: a big machine room heard through bulkheads.
        this.station = bed();
        band('lowpass', 230, 0.5, 0.29, this.station); band('bandpass', 900, 0.5, 0.054, this.station);
        hum(50, 0.011, this.station); hum(100.4, 0.0055, this.station);
        // Planetside pad: wind that breathes, over a low rumble.
        this.planet = bed();
        band('lowpass', 170, 0.5, 0.25, this.planet);
        const wind = band('bandpass', 480, 0.6, 0.125, this.planet);
        const gust = context.createOscillator(), depth = context.createGain();
        gust.frequency.value = 0.11; depth.gain.value = 0.08;
        gust.connect(depth); depth.connect(wind.gain); gust.start();
        this.sources.push(gust);
        // In flight near something massive: more felt than heard.
        this.region = bed();
        band('lowpass', 130, 0.6, 0.2, this.region);
        noise.start();
    }

    update(dt, context, dockKind) {
        const { manager } = this, now = manager.context.currentTime;
        const docked = manager.stationMode, planetside = docked && dockKind === 'planet';
        manager.setEngineTarget(this.cockpit.gain, docked ? 0 : 1, now, 0.4);
        manager.setEngineTarget(this.station.gain, docked && !planetside ? 1 : 0, now, 0.5);
        manager.setEngineTarget(this.planet.gain, planetside ? 1 : 0, now, 0.5);
        manager.setEngineTarget(this.region.gain, docked ? 0 : REGION_PRESENCE[context] ?? 0, now, 1.2);
        const place = docked ? (planetside ? 'planetDock' : 'station') : context;
        if (place !== this.place) { this.place = place; this.timers.clear(); }
        const details = DETAILS[place];
        for (let index = 0; details && index < details.length; index += 1) {
            const detail = details[index], event = detail[0], min = detail[1], max = detail[2];
            let remaining = this.timers.get(event);
            if (remaining === undefined) remaining = min * 0.4 + Math.random() * (max - min);
            remaining -= dt;
            if (remaining <= 0) {
                manager.play(event, detail[3] * (0.7 + Math.random() * 0.5), Math.random() * 1.7 - 0.85);
                remaining = min + Math.random() * (max - min);
            }
            this.timers.set(event, remaining);
        }
    }

    dispose() {
        for (const source of this.sources) { try { source.stop(); } catch { /* already stopped */ } }
        this.sources.length = 0;
    }
}
