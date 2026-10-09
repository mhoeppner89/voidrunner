import {applyShipLivery, applyAuthoredAlliancePalette} from './shipLivery.js';
import {applyIndependentPaint, INDEPENDENT_PAINTS} from './independentPaints.js';
import {applyWayfarerLivery} from './wayfarerLiveries.js';
import {fleetHullId,resolveFleetPaint} from './fleetPaintCatalog.js';
export function applyFleetPaint(root,hull,entity) {
 const id=fleetHullId(hull),paint=resolveFleetPaint(id,entity);
 if(id==='scrapper'&&paint==='alliance')applyAuthoredAlliancePalette(root);
 else if(INDEPENDENT_PAINTS[paint])applyIndependentPaint(root,paint,id);
 else if(paint!=='original'&&id!=='scrapper') {
  if(id==='wayfarer'&&paint.startsWith('independent-'))applyWayfarerLivery(root,paint);
  else applyShipLivery(root,paint,id);
 }
 root.userData.livery=paint;return paint;
}
