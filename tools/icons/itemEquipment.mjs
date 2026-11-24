// All equipment as crisp 45° pixel art (see
// diagonalSprites.mjs). Each part: [material, u0, u1, v0, v1, {taper}] with u
// along the barrel (muzzle at +u, up-right on screen) and v across it (−v is
// the lit top face). Features stay at least 2 units wide: thinner bands alias
// into dotted diagonals. Materials:
//   hull  — housings in the tier paint (blue steel, titanium, black alloy)
//   metal — barrels and rails in gunmetal, a step darker than the housing
//   dark  — vents, bores and recesses
//   trim  — bands and collars in the tier line colour (gold at tier III)
//   glow  — emitters, warheads and coils in the item's signature colour
// Tier II adds the first TIER_EQUIPMENT_PARTS entry, tier III both. Every tier
// is fitted at the tier-III scale so upgrades add hardware without shrinking.
export const EQUIPMENT_PARTS={
 // Pulse laser: blocky receiver on a mount, two gunmetal barrels in shrouds, cyan tips.
 'pulse-cannon':[['hull',-14,-1,-5,5],['dark',-12,-4,-3.5,-1.5],['hull',-9,-4,5,8],['metal',-1,11,-4.5,-1.5],['metal',-1,11,1.5,4.5],['dark',-1,8,-1.5,1.5],['trim',9,14,-5,-1],['trim',9,14,1,5],['glow',14,15.5,-4,-2],['glow',14,15.5,2,4],['glow',-13,-11,1,3.5]],
 // Beam laser: tapered emitter housing, barrel through two focusing rings, crystal lens.
 'beam-emitter':[['hull',-15,-4,-5,5,{taper:[-3.5,3.5]}],['dark',-13,-7,-1,1],['metal',-4,11,-2,2],['trim',-1,1.5,-4.5,4.5],['trim',4.5,7,-4.5,4.5],['hull',11,14,-3.5,3.5,{taper:[-2.2,2.2]}],['glow',13,16,-1.6,1.6,{taper:[0,0]}],['glow',-11,-8.5,1.8,3.8]],
 // Magrail: coil breech, long split rails with a glowing channel, capacitor fins.
 'gauss-cannon':[['hull',-15,-6,-4.5,4.5],['trim',-13,-10.5,-5,5],['trim',-9,-6.5,-5,5],['metal',-6,16,-4,-1.5],['metal',-6,16,1.5,4],['dark',-6,0,-1.5,1.5],['glow',0,16,-1,1],['hull',-2,.5,-6.5,6.5],['hull',5,7.5,-6,6]],
 // Scatter cannon: chunky receiver over a drum, short wide bore, flared bell with three bores.
 'ripper':[['hull',-15,-2,-5,5],['hull',-11,-5,4,8.5],['dark',-10,-6,5.5,7.5],['metal',-2,8,-4.5,4.5],['dark',0,7,-1,1],['hull',8,13,-4.5,4.5,{taper:[-7,7]}],['glow',11.5,13.5,-5,-2.5],['glow',11.5,13.5,-1,1],['glow',11.5,13.5,2.5,5],['dark',-13,-4,-3.5,-1.5]],
 // Ion cannon: housing, a projector wound with three coils, forked emitter.
 'ion-blaster':[['hull',-15,-4,-4.5,4.5],['dark',-13,-6,-2.5,-.5],['metal',-4,12,-2,2],['trim',-2,.5,-5.5,5.5],['trim',3,5.5,-5.5,5.5],['trim',8,10.5,-5.5,5.5],['glow',.5,3,-1,1],['glow',5.5,8,-1,1],['hull',12,16,-5,-2,{taper:[-6,-4]}],['hull',12,16,2,5,{taper:[4,6]}],['glow',13,16,-1,1]],
 // Plasma cannon: heavy breech with a glowing chamber slot, ribbed fat barrel, muzzle ring.
 'mortar':[['hull',-15,-3,-5.5,5.5],['dark',-13,-5,-2.5,-.5],['glow',-12,-6,1,3],['metal',-3,10,-4.5,4.5],['dark',-1,.5,-4.5,4.5],['dark',3,4.5,-4.5,4.5],['dark',7,8.5,-4.5,4.5],['hull',10,15,-6,6],['glow',14,15.5,-3,3]],
 // Seeking missile: body, nose cone with a glowing seeker, swept tail fins, mid band.
 'seeker-launcher':[['hull',-12,8,-2.5,2.5],['hull',8,16,-2.5,2.5,{taper:[0,0]}],['glow',11,16,-1.4,1.4,{taper:[0,0]}],['metal',-15,-8,-7.5,-2.5,{taper:[-3,-2.5]}],['metal',-15,-8,2.5,7.5,{taper:[2.5,3]}],['trim',-3,-.5,-2.5,2.5],['glow',-15,-13,-1.2,1.2]],
 // Anti-shield missile: the same airframe with a glowing ion collar.
 'shield-seeker-launcher':[['hull',-12,8,-2.5,2.5],['hull',8,16,-2.5,2.5,{taper:[0,0]}],['glow',11,16,-1.4,1.4,{taper:[0,0]}],['metal',-15,-8,-7.5,-2.5,{taper:[-3,-2.5]}],['metal',-15,-8,2.5,7.5,{taper:[2.5,3]}],['trim',2.5,7.5,-3.5,3.5],['glow',4,6,-3.5,3.5],['glow',-15,-13,-1.2,1.2]],
 // Swarm pod: armoured box with two bands, four rocket noses in dark tube mouths.
 'swarm-launcher':[['hull',-14,7,-6.5,6.5],['trim',-11,-8.5,-6.5,6.5],['trim',0,2.5,-6.5,6.5],['dark',7,8.5,-6,6],['metal',7,12,-6,-3.5,{taper:[-5,-4.5]}],['metal',7,12,-2.5,0,{taper:[-1.5,-1]}],['metal',7,12,1,3.5,{taper:[2,2.5]}],['metal',7,12,4,6.5,{taper:[5,5.5]}],['glow',10,12,-5.5,-4],['glow',10,12,-2,-.5],['glow',10,12,1.5,3],['glow',10,12,4.5,6]],
 // Anti-shield swarm: the same pod, its bands glowing.
 'shield-swarm-launcher':[['hull',-14,7,-6.5,6.5],['glow',-11,-8.5,-6.5,6.5],['glow',0,2.5,-6.5,6.5],['dark',7,8.5,-6,6],['metal',7,12,-6,-3.5,{taper:[-5,-4.5]}],['metal',7,12,-2.5,0,{taper:[-1.5,-1]}],['metal',7,12,1,3.5,{taper:[2,2.5]}],['metal',7,12,4,6.5,{taper:[5,5.5]}],['glow',10,12,-5.5,-4],['glow',10,12,-2,-.5],['glow',10,12,1.5,3],['glow',10,12,4.5,6]],
 // Torpedo: fat hull, ring tail, glowing warhead band, blunt nose.
 'torpedo-launcher':[['hull',-12,8,-4.5,4.5],['hull',8,15,-4.5,4.5,{taper:[-1.5,1.5]}],['glow',5,8,-4.5,4.5],['trim',-4,-1.5,-4.5,4.5],['metal',-16,-9,-8,-4.5,{taper:[-5,-4.5]}],['metal',-16,-9,4.5,8,{taper:[4.5,5]}],['glow',-16,-13,-1.5,1.5]],
 // PDC: rotary barrel cluster on a turret drum.
 'pdc':[['hull',-15,-9,-4,4],['hull',-9,-1,-6,6],['dark',-7,-3,-3.5,3.5],['glow',-6,-4,-1.3,1.3],['metal',-1,13,-4,4],['dark',-1,12,-2.8,-1.3],['dark',-1,12,1.3,2.8],['trim',3,5.5,-4.5,4.5],['trim',12,14.5,-4.5,4.5],['glow',14.5,16,-1.2,1.2]],
 // Laser turret: armoured dome with one lens barrel.
 'tracking-turret':[['hull',-15,-1,-7,7,{taper:[-5,5]}],['dark',-12,-4,2.5,5],['glow',-10,-6,-3.5,-1],['metal',-1,11,-2,2],['trim',4,6.5,-3.5,3.5],['hull',11,14,-3,3],['glow',14,16,-1.6,1.6]],
 // Speed Booster: armoured drive housing, flared nozzle bell, exhaust glow.
 'engine-mk2':[['hull',-4,14,-5.5,5.5],['trim',2,4.5,-6,6],['trim',9,11.5,-6,6],['dark',-2,1,-6,6],['metal',-13,-3,-7.5,7.5,{taper:[-4,4]}],['dark',-13,-11,-6,6],['glow',-15.5,-13,-5.5,5.5]],
 // Turning Thrusters: a block with nozzles firing four ways.
 'thrusters-mk2':[['hull',-8,8,-5.5,5.5],['trim',-2,2,-6,6],['metal',-2,2,-10,-5.5],['glow',-1.5,1.5,-12,-10],['metal',-2,2,5.5,10],['glow',-1.5,1.5,10,12],['metal',8,12,-3,3,{taper:[-4.5,4.5]}],['glow',12,14,-3.5,3.5],['metal',-12,-8,-4.5,4.5,{taper:[-3,3]}],['glow',-14,-12,-3.5,3.5]],
 // Reactor Upgrade: a cylinder with a glowing core band and cooling rings.
 'sustained-reactor':[['hull',-13,13,-6,6],['metal',-15,-13,-4.5,4.5],['metal',13,15,-4.5,4.5],['trim',-9,-6.5,-6.5,6.5],['trim',6.5,9,-6.5,6.5],['glow',-3,3,-6.5,6.5],['dark',-12,-10,-4,-2],['dark',10,12,-4,-2]],
 // Energy Storage: three charged cells in a frame, the charge glowing on top.
 'capacitor-bank':[['hull',-14,14,-6,6],['dark',-5.5,-4,-6,6],['dark',4,5.5,-6,6],['glow',-12,-7,-5,-3],['glow',-2.5,2.5,-5,-3],['glow',7,12,-5,-3],['metal',-15.5,-14,-3,3],['metal',14,15.5,-3,3]],
 // Shield Capacity Booster: projector housing, emitter stem, a glowing dish.
 'shield-mk2':[['hull',-14,-2,-5,5],['dark',-12,-5,-2,0],['metal',-2,6,-2.5,2.5],['hull',6,11,-2.5,2.5,{taper:[-8,8]}],['glow',11,15,-8,8,{taper:[-4,4]}]],
 // Shield Generator: the projector wound with regeneration coils.
 'recovery-shield':[['hull',-14,-4,-5,5],['metal',-4,6,-2.5,2.5],['trim',-1,1.5,-5,5],['trim',3,5.5,-5,5],['hull',6,11,-2.5,2.5,{taper:[-8,8]}],['glow',11,15,-8,8,{taper:[-4,4]}],['glow',-12,-7,-2.5,0]],
 // Capital Shield Booster: a twin-dish heavy projector.
 'capital-shield-generator':[['hull',-15,-1,-7,7],['dark',-13,-4,-3.5,-1.5],['metal',-1,6,-4.5,-1.5],['metal',-1,6,1.5,4.5],['hull',6,11,-4.5,4.5,{taper:[-9,9]}],['glow',11,15,-9,9,{taper:[-5,5]}],['trim',-11,-8.5,-7.5,7.5]],
 // Hull Reinforcement: two offset armour plates with rivet rows.
 // Hull Reinforcement: a thick chamfered slab, a raised inner plate, rivets.
 'armor-mk2':[['hull',-14,-10,-5,5,{taper:[-8,8]}],['hull',-10,10,-8,8],['hull',10,14,-8,8,{taper:[-5,5]}],['metal',-7,7,-5,5],['dark',-11,-9,-6.5,-4.5],['dark',9,11,-6.5,-4.5],['dark',-11,-9,4.5,6.5],['dark',9,11,4.5,6.5],['trim',-7,7,-1,1]],
 // Radar & Scanner: a mast and a broad dish with a glowing feed horn.
 'radar-mk2':[['metal',-15,-4,-2,2],['hull',-16,-11,-5,5],['hull',-4,4,-2,2,{taper:[-9,9]}],['dark',2,4,-8,8],['metal',4,10,-1,1],['glow',10,13,-1.8,1.8]],
 // Cargo Expansion: a ribbed container pod with a status light.
 'cargo-pods':[['hull',-14,14,-7,7],['trim',-14,14,-7,-5.5],['dark',-8,-6.5,-7,7],['dark',0,1.5,-7,7],['dark',8,9.5,-7,7],['glow',-12,-10,3,5]],
 // Fire Control: a targeting computer with an optic barrel and a lens.
 'fire-control':[['hull',-14,3,-6,6],['dark',-12,-3,-3.5,-.5],['glow',-11,-8,1.5,3.5],['metal',3,11,-3.5,3.5],['trim',6,8,-4,4],['hull',11,13,-4.5,4.5],['glow',13,15,-3,3],['metal',-9,-3,-8,-6]],
 // Tractor Beam: an emitter with two rings and a glowing beam aperture.
 'loot-collector':[['hull',-14,-3,-5,5],['metal',-3,10,-2.5,2.5],['trim',0,2,-6,6],['trim',5,7,-6,6],['hull',10,13,-4,4],['glow',13,15.5,-3,3,{taper:[-1.5,1.5]}],['glow',-12,-8,1,3]],
 // Salvage Targeting: an arm with a glowing cutting head.
 'salvage-mk2':[['hull',-14,-5,-5,5],['metal',-5,8,-2,2],['trim',-1,1,-3.5,3.5],['hull',8,12,-6,6],['glow',12,14,-5,-1.5],['glow',12,14,1.5,5],['dark',-12,-7,-2,0]],
 // Drones: a small craft with side pods; the payload glows by role.
 'mining-drone':[['hull',-10,8,-4,4],['metal',-6,4,-9,-4],['metal',-6,4,4,9],['hull',8,12,-2.5,2.5],['glow',12,15,-1.5,1.5,{taper:[0,0]}],['glow',-12,-10,-2,2]],
 'pdc-drone':[['hull',-10,8,-4,4],['metal',-6,4,-9,-4],['metal',-6,4,4,9],['metal',8,14,-1.2,1.2],['glow',14,15.5,-1,1],['glow',-12,-10,-2,2]],
 'repair-drone':[['hull',-10,8,-4,4],['metal',-6,4,-9,-4],['metal',-6,4,4,9],['glow',-2,2,-3,3],['hull',8,12,-2.5,2.5],['glow',-12,-10,-2,2]],
 // Capital anti-fighter cannon: twin heavy barrels on a broad mantlet.
 'frigate-battery':[['hull',-15,-2,-6.5,6.5],['dark',-13,-5,-3.5,-1.5],['metal',-2,13,-5,-1.5],['metal',-2,13,1.5,5],['dark',-2,10,-1.5,1.5],['trim',10,14,-5.5,-1],['trim',10,14,1,5.5],['glow',14,15.5,-4,-2.5],['glow',14,15.5,2.5,4]],
 // Capital rail cannon: a long armoured rail housing with a glowing channel.
 'cruiser-battery':[['hull',-15,-4,-6,6],['trim',-12,-9.5,-6.5,6.5],['metal',-4,16,-4.5,-1.2],['metal',-4,16,1.2,4.5],['glow',-1,16,-1.2,1.2],['hull',2,4.5,-6.5,6.5],['hull',9,11.5,-6,6]],
};
// Tier II adds the first entry's parts, tier III both.
export const TIER_EQUIPMENT_PARTS={
 'engine-mk2':[[['trim',6,8,-6,6]],[['hull',-2,10,-8,-5.5],['hull',-2,10,5.5,8]]],
 'thrusters-mk2':[[['metal',-6,-3,-8,-5.5]],[['metal',3,6,5.5,8],['trim',5,7,-6,6]]],
 'sustained-reactor':[[['metal',-4,4,-8.5,-6.5]],[['trim',-12,-10.5,-6.5,6.5],['trim',10.5,12,-6.5,6.5]]],
 'capacitor-bank':[[['trim',-14,14,5,6.5]],[['hull',-10,10,6.5,8.5]]],
 'shield-mk2':[[['trim',-6,-3.5,-5.5,5.5]],[['hull',-12,-5,-7.5,-5],['trim',3,5,-3,3]]],
 'recovery-shield':[[['hull',-12,-6,-7.5,-5]],[['hull',-12,-6,5,7.5]]],
 'armor-mk2':[[['trim',-1,1,-5,5]],[['hull',-6,6,-10,-8],['hull',-6,6,8,10]]],
 'radar-mk2':[[['trim',-13,-12,-5,5]],[['metal',-9,-5,-5,-2]]],
 'cargo-pods':[[['trim',-14,14,5.5,7]],[['hull',-10,10,7,9]]],
 'fire-control':[[['trim',-14,-11.5,-6,6]],[['hull',-12,-2,6,8],['glow',-1,1,-8,-6]]],
 'loot-collector':[[['trim',8,10,-6,6]],[['hull',-12,-5,-7.5,-5]]],
 'salvage-mk2':[[['trim',-8,-6,-5.5,5.5]],[['hull',-12,-6,5,7.5],['trim',4,6,-3,3]]],
 'pulse-cannon':[[['dark',-8,-6,-7,-5],['dark',-4,-2,-7,-5]],[['trim',-12,-10,-5.5,5.5],['hull',-9,-4,8,9.5]]],
 'beam-emitter':[[['hull',-12,-7,-7.5,-5]],[['trim',9,11,-4,4],['dark',-12,-7,5,7]]],
 'gauss-cannon':[[['hull',10,12.5,-5.5,5.5]],[['hull',-15,-8,-7,-4.5],['trim',14,16.5,-4.5,4.5]]],
 'ripper':[[['trim',-3,-.5,-5.2,5.2]],[['hull',-12,-4,-7.5,-5],['trim',4,6.5,-5.2,5.2]]],
 'ion-blaster':[[['hull',-12,-6,-7,-4.5]],[['trim',-7,-4.5,-5,5],['glow',-11,-8,-6.5,-5]]],
 'mortar':[[['trim',-14,-11.5,-6,6]],[['hull',-1,9,-6.5,-4.5],['hull',-1,9,4.5,6.5]]],
 'seeker-launcher':[[['metal',-6,-1,-5.5,-2.5]],[['metal',-6,-1,2.5,5.5],['trim',4,6,-2.5,2.5]]],
 'shield-seeker-launcher':[[['metal',-6,-1,-5.5,-2.5]],[['metal',-6,-1,2.5,5.5]]],
 'swarm-launcher':[[['hull',-12,-2,-8.5,-6.5]],[['hull',-12,-2,6.5,8.5],['trim',-4.5,-2.5,-6.5,6.5]]],
 'shield-swarm-launcher':[[['hull',-12,-2,-8.5,-6.5]],[['hull',-12,-2,6.5,8.5]]],
 'torpedo-launcher':[[['trim',0,2,-4.5,4.5]],[['hull',-10,2,-6.5,-4.5],['hull',-10,2,4.5,6.5]]],
 'pdc':[[['hull',-14,-10,-6,-4]],[['hull',-14,-10,4,6],['trim',7.5,10,-4.5,4.5]]],
 'tracking-turret':[[['hull',-13,-6,-9,-6.5]],[['trim',8,10.5,-3,3],['hull',-13,-6,6.5,9]]],
};
// Gunmetal per tier: blued steel, bright titanium, black alloy.
export const METAL_PAINT={
 1:['#b4c0cc','#7a8896','#4c5866','#29323d'],
 2:['#e2e8ef','#a6b1be','#6e7987','#424b57'],
 3:['#9097a8','#555b70','#33374a','#1b1d2a'],
};
