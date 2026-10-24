import {session} from '../../tests/helpers/session.mjs';
import {distressDialogue, DISTRESS_VARIANT_IDS, distressText} from '../../src/game/distressData.js';
import {setLanguage} from '../../src/game/i18n.js';
import {dialogueText} from '../../src/game/adventureDialogues.js';

function make() {
    const s = session();
    s.arena = null; s.save.arena = undefined; s.save.world.time = 100; s.persistSave = () => {};
    s.setMonitorStatus = () => {}; s.lineBlocked = () => false; s.activeFieldObstacles = () => [];
    s.ui = {pushEvent(){}, pushSensor(){}, showStoryLine(){}, hideShipMenu(){}, isShipMenuOpen(){return false;}, updateHud(){}};
    s.audio = {play(){}}; s.renderer = {}; s.wreckNodes = []; s.pickups = [];
    s.spawnShip = (role, position, missionId, name, pilot, options) => {
        const ship = {id:`actor-${s.ships.length}`, role, name, hullId: options?.hullId,
            position:[...position], velocity:[0,0,0], rotation:[0,0,0,1], hull:240, maxHull:240,
            shield:40, maxShield:40, faction: options?.faction ?? 'independents', hostile:false, destination:[...position], dark:false};
        s.ships.push(ship); return ship;
    };
    s.spawnPickup = () => ({id:'p', life:1});
    s.initializeDistress();
    return s;
}
const states = [['discovered-call', {phase:'discovered', distance:300}], ['discovered-arrival', {phase:'discovered', distance:300, followed:true}], ['involved', {phase:'involved', distance:300, followed:true}], ['pickup', {phase:'signal', distance:6800, pickup:true}]];
for (const [label, options] of states) {
  for (const variant of DISTRESS_VARIANT_IDS) {
    const s = make();
    s.debugStartDistress(variant, 0, options);
    const active = s.save.world.distress.active;
    if (options.followed) active.progress.pickupFollowed = true;
    s.save.player.position = [...active.position];
    if (options.phase === 'involved') { active.phase = 'involved'; active.actors = []; }
    if (variant === 'fuel') s.save.player.fuel = options.phase === 'involved' ? 80 : 5;
    for (const lang of ['de', 'en']) {
      setLanguage(lang);
      const script = distressDialogue(active.id, s.save);
      if (!script) { console.log(label, variant, '(no script)'); continue; }
      for (const [id, node] of Object.entries(script.nodes)) {
        console.log(`\n### ${label} · ${variant} · ${id} · ${lang}`);
        if (node.mission) console.log(`  [${node.mission.kicker}] ${node.mission.title} :: ${node.mission.rows.map(r => `${r.label}=${r.value}`).join(' | ')}`);
        console.log('  ' + dialogueText(node.text, lang).replace(/\n/g, '\n  '));
        console.log('  > ' + (node.choices ?? []).map(c => dialogueText(c.label, lang)).join(' / '));
      }
    }
  }
}
