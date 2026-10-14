import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {BASE_OUTFIT_ITEMS} from '../../src/game/outfitting.js';
import {DE_CATALOG} from '../../src/game/i18n-de.js';
import {EQUIPMENT_AFFIXES,NAMED_EQUIPMENT} from '../../src/game/equipmentCatalog.js';
import {EQUIPMENT_STAT_FIELDS,equipmentEffectStats} from '../../src/game/equipmentStatPresentation.js';
import {equipmentIcon} from '../../src/game/itemIcons.js';
const de=key=>DE_CATALOG[key]??key;
const base={schema:'voidrunner-equipment-names-v1',revision:'0.8.2fz',equipment:{},terms:{},affixes:{},named:{}};
const rows=[];
for(const item of Object.values(BASE_OUTFIT_ITEMS)){
 base.equipment[item.id]={en:item.name,de:de(item.name)};
 rows.push({id:item.id,kind:'equipment',category:item.category,minTier:item.tier??1,icon:equipmentIcon(item),effects:equipmentEffectStats(item).filter(r=>Math.abs(r.value)>.001).map(r=>({label:r.label,value:r.value,unit:r.unit})),description:{en:item.description,de:de(item.description)},named:Boolean(NAMED_EQUIPMENT[item.id])});
}
for(const label of new Set([...EQUIPMENT_STAT_FIELDS.map(f=>f.label),'Damage','Shield damage','Hull damage','Energy per shot','Shot interval','Range','Weapon draw','Aim correction'])){
 base.terms[label]={en:label,de:de(label)};rows.push({id:label,kind:'terms',category:'terms'});
}
for(const [id,item] of Object.entries(EQUIPMENT_AFFIXES)){base.affixes[id]={en:item.name,de:de(item.name)};const sampleId=item.categories.includes('gun')?'pulse-cannon':'capacitor-bank';rows.push({id,kind:'affixes',category:'affixes',sampleId,icon:equipmentIcon({id:sampleId,tier:2,affixIds:[id]})});}
for(const [id,item] of Object.entries(NAMED_EQUIPMENT)){base.named[id]={en:item.name,de:de(item.name)};rows.push({id,kind:'named',category:'named',icon:equipmentIcon(BASE_OUTFIT_ITEMS[id]),minTier:BASE_OUTFIT_ITEMS[id].tier??1});}
const css=await readFile('src/style.css','utf8');
const iconCss=css.slice(css.indexOf('.item-icon {'),css.indexOf('.commodity-art > .commodity-icon',css.indexOf('.item-icon {')));
let template=await readFile(new URL('./equipment-names.html',import.meta.url),'utf8');
template=template.replace('/*__ICON_CSS__*/',iconCss).replace('/*__DATA__*/',JSON.stringify({base,rows}).replaceAll('<','\\u003c'));
await mkdir('output/equipment-names-review',{recursive:true});await writeFile('output/equipment-names-review/index.html',template);
console.log(`Naming editor: output/equipment-names-review/index.html (${Object.keys(base.equipment).length} equipment)`);
