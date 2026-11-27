// Runs inside the browser. The simulation and the renderer advance the same
// freshly generated field objects through SpaceRenderer.updateWorld each step.
export async function progressionSampleFactory(seed){
 const {GameSession}=await import('/src/game/game.js');
 const {newArenaRun}=await import('/src/game/arenaRun.js');
 let previous=__VOID_PRIVATEER__.getRuntime();
 cancelAnimationFrame(previous.frameId);
 const {renderer,ui}=previous;
 // This panel never draws. Keep a single WebGL context and its static
 // assets for this seed. Every sample owns a new full simulation, including
 // all moving geometry, navigation, spatial indices, pilots and clocks.
 class SampleSession extends GameSession {
  initializeFlightRuntime(){
   this.renderer=renderer;
   for(const key of ['asteroids','graveyard','wreckNodes','regionalFields'])renderer[key]=this[key];
   renderer.driftingAsteroids=renderer.driftingDebris=undefined;
   renderer.skyTime=renderer.pendingWorldVisualDt=0;
   renderer.setSystem(this.save.player.systemId);
   return renderer;
  }
 }
 return ()=>{
  previous.clearTransientSpace();
  const dispose=renderer.dispose;
  renderer.dispose=()=>{};
  try{previous.dispose();}finally{renderer.dispose=dispose;}
  // A reserved objective transmission belongs to the previous sortie.
  ui.clearPilotLine();
  const save=newArenaRun(false,seed);
  previous=new SampleSession(save,ui,()=>{},save.arena);
  cancelAnimationFrame(previous.frameId);
  previous.audio.setVolumes(0,0);
  return previous;
 };
}

export function movingTerrainSignature(runtime){
 return JSON.stringify([...runtime.asteroids,...runtime.graveyard].filter(body=>body.moving)
  .map(body=>[body.id,...body.position,...body.rotation]));
}
