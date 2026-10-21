import {applyShipLivery, applyAuthoredAlliancePalette} from './shipLivery.js';
import {applyIndependentPaint, INDEPENDENT_PAINTS} from './independentPaints.js';
import {applyWayfarerLivery} from './wayfarerLiveries.js';
import {fleetHullId,resolveFleetPaint} from './fleetPaintCatalog.js';
import {applyCustomShipPaint,capturePaintSources,restorePaintSources} from './customShipPaint.js';
export function applyFleetPaint(root,hull,entity) {
 const id=fleetHullId(hull),paint=resolveFleetPaint(id,entity);
 if(paint==='custom'){applyCustomShipPaint(root,id,entity.livery);root.userData.livery='custom';return paint;}
 if(root.paintSources)restorePaintSources(root);
 if(entity.id==='player')capturePaintSources(root);
 delete root.userData.paintDesign;
 if(id==='scrapper'&&paint==='alliance')applyAuthoredAlliancePalette(root);
 else if(INDEPENDENT_PAINTS[paint])applyIndependentPaint(root,paint,id);
 else if(paint!=='original'&&id!=='scrapper') {
  if(id==='wayfarer'&&paint.startsWith('independent-'))applyWayfarerLivery(root,paint);
  else applyShipLivery(root,paint,id);
 }
 root.userData.livery=paint;return paint;
}
