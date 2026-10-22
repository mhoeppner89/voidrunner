// Authored discoveries use world kilometres. Loot is collected by the normal
// swept-hull/collector mechanic; these records never grant a remote pickup.
import {LOCATIONS} from './data.js';
import {getLanguage} from './i18n.js';
export const explorationText = text => Array.isArray(text) ? text[getLanguage()==='de'?0:1] : text;
const at=(field,offset)=>offset.map((v,i)=>v+LOCATIONS[field].position[i]);
export const FREIGHTER_LOGS = Object.freeze([
 {id:'wake',position:at('shardbelt',[100,-177,-1192]),commodity:'electronics',quantity:1,
  title:['Kestrel Nine · Log 1/3','Kestrel Nine · log 1/3'],
  text:['Sie sind seit Azure hinter uns. Wir haben einen Frachtbehälter im ersten Tunnel abgeworfen. Vielleicht folgen sie dem Signal statt uns. Im Querbruch versuchen wir es noch einmal.','They have followed us since Azure. We dropped a cargo pod in the first tunnel. Perhaps they will follow its signal instead of ours. We will try again in the crosscut.']},
 {id:'silence',position:at('shardbelt',[1114,101,261]),commodity:'medicine',quantity:1,
  title:['Kestrel Nine · Log 2/3','Kestrel Nine · log 2/3'],
  text:['Transponder aus. Die Piraten sind über uns hinweggeflogen, aber ihr Suchschiff kehrt zurück. Wir steigen durch den engen Schacht auf. Nur noch ein Behälter, dann sind unsere falschen Spuren aufgebraucht.','Transponder off. The pirates flew over us, but their search ship is coming back. We are climbing through the narrow shaft. One more pod, then we are out of false trails.']},
 {id:'last-light',position:at('shardbelt',[230,750,931]),commodity:'gold',quantity:1,
  title:['Kestrel Nine · Log 3/3','Kestrel Nine · log 3/3'],
  text:['Sie haben den Antrieb getroffen. Wir kommen noch aus dem Feld, dann treiben wir. Die Crew geht in die Rettungskapseln. Ich lasse den letzten Behälter mit unserer Peilung zurück.','They hit the drive. We can clear the field, then we will be drifting. The crew is taking the escape pods. I am leaving the last pod with our bearing.']},
]);
// Recesses near broken capital hulls. Deliberately off the racing line.
export const GRAVEYARD_CACHES = Object.freeze([
 {id:'carrier',position:at('mourning-line',[-961,857,-2262]),commodity:'electronics',quantity:2},
 {id:'battleship',position:at('mourning-line',[516,-408,1997]),commodity:'gold',quantity:1},
 {id:'cruiser',position:at('mourning-line',[2911,893,-1448]),commodity:'machinery',quantity:2},
]);
export const FREIGHTER_POSITION=at('shardbelt',[12500,4800,-11800]);
export const FREIGHTER_WRECK_ID='wreck-exploration-kestrel-nine';
export const CONVOY_POSITION=at('mourning-line',[3500,500,2100]);
export const explorationLootId=id=>'wreck-exploration-'+id;
export function normalizeExploration(world){
 const raw=world.exploration??{};
 const finalStates=['locked','available','fighting','shared','won'];
 const convoyStates=['unseen','offered','active','rewarded','failed','declined'];
 const known=[...FREIGHTER_LOGS,...GRAVEYARD_CACHES].map(p=>p.id).concat('finale');
 const recovered=[...new Set((Array.isArray(raw.recovered)?raw.recovered:[]).filter(id=>known.includes(id)))];
 const finale=finalStates.includes(raw.finale)?raw.finale:'locked';
 const actors={};
 for(const group of ['salvagers','convoy'])if(Array.isArray(raw.actors?.[group]))actors[group]=raw.actors[group].slice(0,4).filter(a=>a&&typeof a.key==='string'&&Number.isFinite(a.hull)&&Array.isArray(a.position)&&a.position.length===3&&a.position.every(Number.isFinite)).map(a=>({...a}));
 world.exploration={recovered,finale:finale==='locked'&&FREIGHTER_LOGS.every(p=>recovered.includes(p.id))?'available':finale,
  convoy:convoyStates.includes(raw.convoy)?raw.convoy:'unseen',actors,
  convoyDeadline:Number.isFinite(raw.convoyDeadline)?raw.convoyDeadline:0,
  convoyReward:Math.max(0,Math.min(4000,Number(raw.convoyReward)||0))};
 return world.exploration;
}
function explorationScript(id,save){
 const log=FREIGHTER_LOGS.find(p=>id==='exploration-log-'+p.id);
 if(log){const triangulated=save?.world.exploration?.finale!=='locked'&&FREIGHTER_LOGS.every(p=>save?.world.exploration?.recovered.includes(p.id));return {start:'log',nodes:{log:{text:triangulated?log.text.map((line,i)=>line+'\n\n'+['Peilung abgeschlossen. Du kannst das Wrack im Bordlogbuch anvisieren.','Triangulation complete. You can target the wreck from the ship journal.'][i]):log.text,next:'@end'}}};}
 if(id==='exploration-salvagers')return {start:'offer',nodes:{offer:{
  text:['Hier ist Sera, Driftglass-Bergung. Wir sind zuerst am Wrack. Teilen wir: Für deine Peilung bekommst du den Reaktor und zwei Goldbarren. Oder willst du die ganze Fracht mit Gewalt?',
        'Sera, Driftglass salvage. We reached the wreck first. Split it: for your bearings, you take the reactor and two gold bars. Or will you take the entire hold by force?'],
  choices:[{label:['Wir teilen.','We split it.'],explorationChoice:'share'},{label:['Die ganze Ladung gehört mir.','The entire cargo is mine.'],explorationChoice:'fight'}]}}};
 if(id==='exploration-convoy')return {start:'offer',nodes:{offer:{
  text:['Mayday! Hier ist der Prospektorenkonvoi Lantern. Zwei Piraten schneiden uns den Rückweg ab. Kannst du uns helfen? Wir zahlen 2.000 cr für jedes Schiff, das durchkommt.',
        'Mayday! This is the Lantern prospecting convoy. Two pirates are cutting off our retreat. Can you help us? We can pay 2,000 cr for each ship that makes it.'],
  choices:[{label:['Ich helfe euch.','I will help you.'],explorationChoice:'help'},{label:['Ich kann nicht eingreifen.','I cannot intervene.'],explorationChoice:'decline'}]}}};
}
export function explorationJournal(save){
 const state=save.world.exploration;if(!state)return [];
 const rows=FREIGHTER_LOGS.filter(log=>state.recovered.includes(log.id)).map(log=>({title:explorationText(log.title),text:explorationText(log.text)}));
 if(state.finale!=='locked')rows.push({title:'Kestrel Nine',text:explorationText(state.recovered.includes('finale')?['Fracht geborgen.','Cargo recovered.']:state.finale==='shared'?['Fracht mit Driftglass geteilt. Dein Anteil liegt am Wrack.','Cargo shared with Driftglass. Your share is at the wreck.']:state.finale==='won'?['Bergungscrew besiegt. Die Fracht liegt am Wrack.','Salvage crew defeated. The cargo is at the wreck.']:['Drei Peilungen ergeben die letzte Position im freien Raum.','Three bearings reveal the final position in deep space.']),action:state.recovered.includes('finale')?undefined:'navigate'});
 if(state.convoy==='offered'||state.convoy==='active')rows.push({title:'Lantern',text:explorationText(state.convoy==='offered'?['Ein Prospektorenkonvoi bittet um Hilfe.','A prospecting convoy needs help.']:['Schütze die beiden Prospektoren vor den Piraten.','Protect both prospectors from the pirates.']),action:'convoy'});
 if(['rewarded','failed','declined'].includes(state.convoy))rows.push({title:'Lantern',text:explorationText(state.convoy==='rewarded'?[`Konvoi gerettet · ${state.convoyReward.toLocaleString('de-DE')} cr erhalten.`,`Convoy rescued · ${state.convoyReward.toLocaleString('en-US')} cr received.`]:state.convoy==='failed'?['Der Konvoi konnte nicht gerettet werden.','The convoy could not be saved.']:['Der Notruf blieb unbeantwortet.','The distress call went unanswered.'])});
 return rows;
}

// Adventure dialogue expects strings or {de,en} pairs, never tuple arrays.
export function explorationDialogue(id,save){
 const script=explorationScript(id,save);if(!script)return;
 for(const node of Object.values(script.nodes)){node.text=explorationText(node.text);for(const choice of node.choices??[])choice.label=explorationText(choice.label);}
 return script;
}
