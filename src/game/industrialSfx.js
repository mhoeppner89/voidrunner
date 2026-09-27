// Original procedural Foley: filtered fractures, damped inharmonic structural
// modes and motor/arc textures. No recorded or third-party soundtrack samples.
// Mono 24 kHz buffers are cached per context; one source/gain per event.
const RATE = 24000;
const cache = new WeakMap();
// duration, output peak, [time, length, noise, frequency, body, texture]
// texture: 0=pressure, 1=metal, 2=electrical, 3=mechanism, 4=motor
const VOICES = {
    laser:[.22,.48,[[0,.045,.8,185,.55,3],[.008,.16,.22,130,.6,1],[.075,.05,.24,600,.12,3]]],
    beam:[.34,.38,[[0,.025,.45,380,.2,3],[.012,.29,.2,180,.5,4],[.02,.18,.28,900,.13,2]]],
    gauss:[.65,.72,[[0,.018,1.3,120,.25,3],[.005,.48,.35,78,1,1],[.025,.12,.6,640,.3,1],[.22,.13,.18,330,.18,3]]],
    pdc:[.09,.34,[[0,.013,1,280,.2,3],[.003,.06,.25,220,.45,1],[.025,.018,.45,780,.1,3]]],
    ripper:[.42,.62,[[0,.05,1,110,.65,3],[.009,.3,.45,95,.75,1],[.13,.08,.4,370,.23,3]]],
    ion:[.35,.42,[[0,.06,.5,780,.22,2],[.025,.27,.4,260,.48,2],[.11,.08,.3,1350,.12,2]]],
    mortar:[.7,.65,[[0,.035,.7,160,.4,3],[.012,.55,.65,66,.85,0],[.06,.36,.25,160,.35,1]]],
    missile:[.85,.58,[[0,.065,.6,210,.45,3],[.07,.68,1,85,.35,0],[.04,.25,.2,280,.25,1]]],
    shield:[.34,.48,[[0,.06,.6,360,.3,2],[.005,.3,.25,145,.65,1]]],
    hit:[.38,.69,[[0,.025,1.1,220,.5,3],[.005,.32,.3,102,.85,1],[.04,.16,.3,720,.3,1]]],
    impact:[.34,.54,[[0,.035,.8,240,.4,3],[.005,.28,.25,145,.7,1]]],
    rock:[.26,.4,[[0,.06,.7,120,.3,0],[.04,.09,.45,430,.1,3],[.08,.14,.35,240,.15,0]]],
    explosion:[1.65,.75,[[0,.035,1,100,.6,3],[.01,1.1,.75,52,1,0],[.03,.65,.35,140,.45,1],[.23,.48,.55,290,.2,1],[.6,.8,.28,80,.3,0]]],
    capitalExplosion:[5.1,.78,[[0,.04,1.1,100,.5,3],[.01,1.6,.75,48,1,0],[.08,.8,.35,160,.5,1],[.65,.7,.6,92,.65,1],[1.35,1.1,.65,65,.65,0],[2.15,.75,.48,150,.4,1],[2.85,1.8,.42,48,.55,0]]],
    repair:[.24,.14,[[0,.22,.45,1000,.12,2],[.06,.04,.35,1600,.1,2]]],
    mining:[.22,.24,[[0,.06,.6,130,.3,0],[.035,.16,.3,520,.2,3]]],
    salvage:[.32,.3,[[0,.05,.5,170,.4,3],[.015,.25,.2,240,.5,1],[.15,.12,.3,500,.1,3]]],
    hyperSpool:[2,.4,[[0,1.95,.25,70,.6,4],[.12,1.75,.4,180,.3,4]]],
    hyperDrop:[.55,.6,[[0,.04,.8,155,.35,3],[.018,.48,.6,72,.7,0]]],
    hyperActive:[3.8,.11,[[0,3.75,.65,62,.4,4]]],
    slipstream:[.6,.3,[[0,.55,.45,135,.3,4]]],
    pickup:[.22,.2,[[0,.04,.2,260,.25,3],[.065,.1,.04,760,.22,2]]],
    scan:[.42,.18,[[0,.07,.03,720,.3,2],[.16,.07,.03,950,.3,2],[.3,.1,.03,1200,.25,2]]],
    ui:[.05,.12,[[0,.04,.18,650,.18,3]]],
    warning:[.44,.27,[[0,.13,.04,530,.6,2],[.22,.13,.04,530,.6,2]]],
    success:[.35,.2,[[0,.11,.03,460,.4,2],[.14,.15,.03,690,.4,2]]],
    dock:[.9,.32,[[0,.09,.55,95,.5,3],[.055,.6,.25,120,.55,1],[.5,.16,.16,330,.2,3],[.72,.12,.025,660,.25,2]]],
};
export const INDUSTRIAL_DURATIONS = Object.fromEntries(Object.entries(VOICES).map(([id,v])=>[id,v[0]]));
function makeBuffer(context, id, variation) {
    const [duration, peak, layers] = VOICES[id];
    const buffer = context.createBuffer(1, Math.ceil(duration*RATE), RATE);
    const data=buffer.getChannelData(0);
    let seed=variation+131;
    for(const c of id) seed=(seed*31+c.charCodeAt(0))|0;
    const random=()=>{seed^=seed<<13;seed^=seed>>>17;seed^=seed<<5;return (seed>>>0)/4294967296*2-1;};
    for(const [start,length,noiseLevel,frequency,body,texture] of layers) {
        let low=0,mid=0,previous=0,phase=0;
        const count=Math.floor(length*RATE),offset=Math.floor(start*RATE);
        const tuning=1+random()*.025;
        for(let i=0;i<count&&i+offset<data.length;i++) {
            const t=i/RATE,u=i/count,n=random();
            low+=.035*(n-low);mid+=.25*(n-mid);
            const high=n-previous;previous=n;
            const attack=Math.min(1,t/(texture===4?.035:.0015));
            const envelope=texture===4 ? Math.sin(Math.PI*u)**.7 : attack*Math.exp(-u*(texture===0?4.2:6))*Math.min(1,(1-u)*30);
            // Near-stationary resonances instead of octave-spanning raygun slides.
            const f=frequency*tuning*(texture===4?1+u*.8:1-.12*Math.min(1,u*4));
            phase+=Math.PI*2*f/RATE;
            let resonance=Math.sin(phase)+.35*Math.sin(phase*2.37+.4)+.18*Math.sin(phase*4.13);
            let noise=texture===0?low*3.5:texture===1?mid*.9+high*.22:texture===3?high*.6+mid*.65:mid*.8+high*.28;
            if(texture===2){const gate=.35+.65*Math.max(0,Math.sin(t*173)*Math.sin(t*317));noise*=gate;resonance*=.65+.35*Math.sin(t*79);}
            if(texture===4){noise*=.75+.25*Math.sin(t*31);resonance*=.7+.3*Math.sin(t*43);}
            data[offset+i]+=(noise*noiseLevel+resonance*body*.55)*envelope;
        }
    }
    let max=0;for(let i=0;i<data.length;i++){data[i]=Math.tanh(data[i]*1.3);max=Math.max(max,Math.abs(data[i]));}
    const gain=peak/Math.max(.001,max);for(let i=0;i<data.length;i++)data[i]*=gain;
    return buffer;
}
export function playIndustrial(manager,id,at,intensity,out) {
    if(!VOICES[id])return;
    let bank=cache.get(manager.context);if(!bank){bank=new Map();cache.set(manager.context,bank);}
    const variant=['laser','gauss','pdc','ripper','hit','impact','rock'].includes(id)?Math.floor(Math.random()*2):0;
    const key=id+variant;let buffer=bank.get(key);if(!buffer){buffer=makeBuffer(manager.context,id,variant);bank.set(key,buffer);}
    const source=manager.context.createBufferSource(),gain=manager.context.createGain();
    source.buffer=buffer;source.playbackRate.value=out?.pitchRatio??1;
    gain.gain.value=intensity;
    source.connect(gain);gain.connect(out??manager.effectsGain);
    source.onended=()=>{source.disconnect();gain.disconnect();};source.start(at);
}

// Warm one voice at a time outside the simulation step. Stop on session change.
export function warmIndustrial(manager) {
    const context=manager.context;
    let bank=cache.get(context);if(!bank){bank=new Map();cache.set(context,bank);}
    const jobs=Object.keys(VOICES).flatMap(id=>['laser','gauss','pdc','ripper','hit','impact','rock'].includes(id)?[[id,0],[id,1]]:[[id,0]]);
    const next=()=>{
        if(manager.context!==context||!manager.enabled||!jobs.length)return;
        const [id,variant]=jobs.shift(),key=id+variant;
        if(!bank.has(key))bank.set(key,makeBuffer(context,id,variant));
        setTimeout(next,30);
    };
    setTimeout(next,0);
}
