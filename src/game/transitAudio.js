import {sampleBufferFor} from './sampleSfx.js';
const clamp=t=>Math.max(0,Math.min(1,t));
const ramp=(a,b,t)=>{const x=clamp((t-a)/(b-a));return x*x*(3-2*x);};
// Animation progress drives the mix. No wall-clock timers schedule future
// cues, so skipping, waiting for assets or hiding the tab cannot desync it.
export function transitMix(phase,kind,t,out={}){
 t=clamp(t);const planet=kind.startsWith('planet'),pad=kind.endsWith('pad');
 let thrust,near,air=0;
 if(phase==='landing'){
  thrust=.10+.42*Math.sin(Math.PI*ramp(.02,.98,t));near=ramp(0,.16,t);
  out.pitch=.82+.30*Math.sin(Math.PI*t)-.18*ramp(.60,1,t);
 }else if(phase==='takeoff'){
  thrust=.12+.76*ramp(.02,.48,t);near=1-ramp(.45,1,t);
  out.pitch=.76+.58*ramp(0,.62,t)-.16*ramp(.68,1,t);
 }else{
  const departing=phase==='exit';thrust=departing?.68:.42;
  near=departing?1-ramp(.62,1,t):ramp(0,.24,t);
  out.pitch=departing?.92+.28*t:1.12-.32*t;
  if(planet)air=departing?(1-ramp(.20,.85,t))*.55:Math.sin(Math.PI*ramp(0,.96,t))*.6;
 }
 out.engine=thrust*near*(pad?.65:.55);out.wash=thrust*near*.38;
 out.air=air;out.cutoff=280+thrust*1150;out.room=kind.startsWith('station')?.12:.025;
 return out;
}
export function createTransitVoice(manager,phase,kind,progress=0){
 const c=manager.context;if(!c||!manager.effectsGain||!manager.pinkBuffer)return;
 const bus=c.createGain(),pan=c.createStereoPanner(),wet=c.createGain(),engineGain=c.createGain(),engineFilter=c.createBiquadFilter(),washGain=c.createGain(),windGain=c.createGain(),washFilter=c.createBiquadFilter(),windFilter=c.createBiquadFilter();
 bus.gain.value=0;bus.connect(pan);pan.connect(manager.effectsGain);pan.connect(wet);wet.connect(manager.effectsReverbGain??manager.effectsGain);
 engineFilter.type='lowpass';engineFilter.Q.value=.65;engineGain.gain.value=0;engineFilter.connect(engineGain);engineGain.connect(bus);
 washFilter.type='lowpass';washFilter.frequency.value=750;washGain.gain.value=0;washFilter.connect(washGain);washGain.connect(bus);
 windFilter.type='bandpass';windFilter.frequency.value=680;windFilter.Q.value=.65;windGain.gain.value=0;windFilter.connect(windGain);windGain.connect(bus);
 const nodes=[bus,pan,wet,engineGain,engineFilter,washGain,windGain,washFilter,windFilter],sources=[],cues=new Set(),mix={},sample=sampleBufferFor(manager,'engine-thrust');let engine;
 if(sample){engine=c.createBufferSource();engine.buffer=sample;engine.loop=true;engine.connect(engineFilter);sources.push(engine);}
 else{
  engine=c.createOscillator();engine.type='triangle';engine.frequency.value=67;engine.connect(engineFilter);sources.push(engine);
  const sub=c.createOscillator(),level=c.createGain();sub.type='sine';sub.frequency.value=34;level.gain.value=.35;sub.connect(level);level.connect(engineFilter);sources.push(sub);nodes.push(level);
 }
 for(const filter of [washFilter,windFilter]){const noise=c.createBufferSource();noise.buffer=manager.pinkBuffer;noise.loop=true;noise.connect(filter);sources.push(noise);}
 for(const source of sources)source.start();
 const voice={phase,kind,progress,cueCount:0,stopped:false};let previous=progress,timer;
 const target=(param,value)=>{param.cancelScheduledValues(c.currentTime);param.setTargetAtTime(value,c.currentTime,.045);};
 function mechanical(type){
  if(voice.stopped)return;voice.cueCount++;
  const now=c.currentTime,noise=c.createBufferSource(),filter=c.createBiquadFilter(),gain=c.createGain();noise.buffer=manager.pinkBuffer;
  filter.type=type==='contact'?'lowpass':'bandpass';filter.Q.value=.75;filter.frequency.setValueAtTime(type==='contact'?1100:1600,now);filter.frequency.exponentialRampToValueAtTime(type==='contact'?180:420,now+.24);
  gain.gain.setValueAtTime(0,now);gain.gain.linearRampToValueAtTime(type==='contact'?.65:.32,now+.008);gain.gain.exponentialRampToValueAtTime(.0001,now+.30);
  noise.connect(filter);filter.connect(gain);gain.connect(bus);noise.start(now);noise.stop(now+.32);
  const cueNodes=[noise,filter,gain];
  if(type==='contact'){
   const thud=c.createOscillator(),body=c.createGain();thud.frequency.setValueAtTime(96,now);thud.frequency.exponentialRampToValueAtTime(38,now+.13);body.gain.setValueAtTime(.13,now);body.gain.exponentialRampToValueAtTime(.0001,now+.20);thud.connect(body);body.connect(bus);thud.start(now);thud.stop(now+.22);cueNodes.push(thud,body);
  }
  const release=()=>{for(const n of cueNodes)n.disconnect();cues.delete(release);};cues.add(release);noise.onended=release;
 }
 voice.update=(t,position=0)=>{
  if(voice.stopped||!Number.isFinite(t))return;transitMix(phase,kind,t,mix);voice.progress=t;
  target(bus.gain,.9);target(pan.pan,Math.max(-.65,Math.min(.65,Number.isFinite(position)?position:0)));wet.gain.value=mix.room;
  target(engineGain.gain,mix.engine);target(engineFilter.frequency,mix.cutoff);target(washGain.gain,mix.wash);target(windGain.gain,mix.air);
  if(sample)target(engine.playbackRate,mix.pitch);else target(engine.frequency,67*mix.pitch);
  if(phase==='landing'){
   if(previous<.64&&t>=.64)mechanical('gear');
   if(previous<.82&&t>=.82)mechanical('contact');
  }else if(phase==='takeoff'&&previous<.38&&t>=.38)mechanical('gear');
  previous=t;
 };
 const release=()=>{clearTimeout(timer);for(const source of sources)source.disconnect();for(const n of nodes)n.disconnect();for(const end of cues)end();cues.clear();manager.effectReleases?.delete(release);};
 voice.stop=()=>{
  if(voice.stopped)return;voice.stopped=true;const now=c.currentTime;bus.gain.cancelScheduledValues(now);bus.gain.setTargetAtTime(0,now,.018);
  for(const source of sources)source.stop(now+.09);timer=setTimeout(release,130);manager.effectReleases??=new Set();manager.effectReleases.add(release);
 };
 voice.update(progress);return voice;
}
