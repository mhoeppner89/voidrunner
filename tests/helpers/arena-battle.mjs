// Drive only the sortie director. Physics and weapon paths have their own fixtures.
export function finishArenaLevel(s) {
 const run=s.save.arenaRun;
 for(let i=0;i<200 && run.phase==='combat';i++){
  const target=s.runBattle.target;
  if(target?.arenaFriendlyObjective)target.position=[...target.arenaJumpPoint];
  for(const ship of s.ships)if(ship.arenaRunEnemy)ship.hull=0;
  s.save.world.time+=1;s.tickArenaRun(1);
 }
 if(run.phase==='combat')throw Error('Arena level did not finish: '+(run.wave+1));
}
