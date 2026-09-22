import { SAMPLE_FILES } from './sampleSfxManifest.js';
const banks = new WeakMap();
export const INDUSTRIAL_DURATIONS = {};
export function warmIndustrial(manager) {
    const context = manager.context;
    if (banks.has(context)) return banks.get(context).ready;
    const bank = {buffers: new Map(), next: new Map()};
    banks.set(context, bank);
    bank.ready = Promise.all(Object.entries(SAMPLE_FILES).map(async ([id, files]) => {
        try {
            const buffers = await Promise.all(files.map(async file => {
                const response = await fetch(new URL(`../../assets/audio/${file}`, import.meta.url));
                if (!response.ok) throw new Error(`Sound ${file}: ${response.status}`);
                return context.decodeAudioData(await response.arrayBuffer());
            }));
            bank.buffers.set(id, buffers);
            INDUSTRIAL_DURATIONS[id] = Math.max(...buffers.map(b => b.duration));
        } catch (error) { console.warn('Could not load sound', id, error); }
    }));
    return bank.ready;
}
function bufferFor(manager, id) {
    const bank = banks.get(manager.context), buffers = bank?.buffers.get(id);
    if (!buffers) return null;
    const next = bank.next.get(id) ?? Math.floor(Math.random()*buffers.length);
    bank.next.set(id, (next+1)%buffers.length);
    return buffers[next];
}
export function playIndustrial(manager,id,at,intensity,out) {
    const buffer = bufferFor(manager,id);
    if (!buffer) return;
    const source=manager.context.createBufferSource(),gain=manager.context.createGain();
    source.buffer=buffer; source.playbackRate.value=out?.pitchRatio??1;
    gain.gain.value=intensity; source.connect(gain); gain.connect(out??manager.effectsGain);
    source.onended=()=>{source.disconnect();gain.disconnect();};source.start(at);
}
export function stopSampleLoops(manager) {
    for (const voice of manager.sampleWork?.values() ?? []) { clearTimeout(voice.timer); voice.source.stop(); }
    manager.sampleWork?.clear();
    for(const voice of manager.sampleEngines ?? []) { voice.gain.gain.setTargetAtTime(0,manager.context.currentTime,.035); manager.engineTargets?.delete(voice.gain.gain); }
}
export function playWorkSample(manager,id,intensity,pan,distance) {
    manager.sampleWork ??= new Map();
    let voice=manager.sampleWork.get(id);
    if (!voice) {
        const buffer=bufferFor(manager,id); if(!buffer)return;
        const context=manager.context,source=context.createBufferSource(),gain=context.createGain();
        const chain=manager.eventChain(pan,distance);
        source.buffer=buffer;source.loop=true;
        // Stay within the steady working part of the recordings.
        source.loopStart=id==='mining'?.3:.12;source.loopEnd=buffer.duration-.12;
        source.connect(gain);gain.connect(chain.input);chain.output.connect(manager.effectsGain);
        voice={source,gain,chain};manager.sampleWork.set(id,voice);
        source.onended=()=>{source.disconnect();gain.disconnect();chain.input.disconnect();chain.filter.disconnect();chain.output.disconnect();};source.start();
    }
    const now=manager.context.currentTime;
    voice.gain.gain.cancelScheduledValues(now);voice.gain.gain.setTargetAtTime(intensity,now,.025);
    // Game repair pulses arrive every .34 seconds. Silence promptly if work stops.
    voice.gain.gain.setTargetAtTime(0,now+.4,.035);
    clearTimeout(voice.timer);voice.timer=setTimeout(()=>{voice.source.stop();manager.sampleWork.delete(id);},650);
}
export function updateSampleEngines(manager,throttle,burn) {
    if(!manager.sampleEngines){
        const buffers=['idle','thrust','afterburner'].map(id=>bufferFor(manager,'engine-'+id));
        if(buffers.some(b=>!b))return false;
        manager.sampleEngines=buffers.map(buffer=>{
            const source=manager.context.createBufferSource(),gain=manager.context.createGain();
            source.buffer=buffer;source.loop=true;source.loopStart=0;source.loopEnd=buffer.duration;
            gain.gain.value=0;source.connect(gain);gain.connect(manager.effectsGain);source.start();return {source,gain};
        });
    }
    const thrust=Math.max(0,Math.min(1,throttle));
    const levels=manager.stationMode?[0,0,0]:[(1-thrust)*.8,thrust*(burn?.25:.8),burn?.8:0];
    manager.sampleEngines.forEach((voice,i)=>manager.setEngineTarget(voice.gain.gain,levels[i],manager.context.currentTime,.15));
    return true;
}
