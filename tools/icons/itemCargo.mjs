// Cargo as 45° pixel goods, in the same renderer and frame as the equipment
// (diagonalSprites.mjs: u along the diagonal, −v the lit top). Each good is
// painted with its CARGO_PAINT entry: hull and trim from the commodity's
// colours, metal in neutral gunmetal, glow in its accent.
const tooth=(angle,inner,outer,half)=>{const c=Math.cos(angle),s=Math.sin(angle),p=(r,w)=>[r*c-w*s,r*s+w*c];return ['hull','poly',[p(inner,-half),p(outer,-half*.8),p(outer,half*.8),p(inner,half)]];};
export const CARGO_PARTS={
 // Water: a ribbed tank with a sight glass and a valve.
 water:[['hull',-12,10,-6.5,6.5],['metal',-14.5,-12,-5,5],['metal',10,13,-4.5,4.5],['metal',13,15.5,-1.6,1.6],['trim',-8,-6,-7,7],['trim',4,6,-7,7],['glow',-5,3,-4.5,-2.5],['dark',-5,3,-2.5,-1.5]],
 // Food: two fat ration cans lying on their sides, lids and warm labels.
 food:[['hull',-11,3,-10,-1.5],['metal',3,6,-10,-1.5],['metal',-13,-11,-9,-2.5],['trim',-7,-1,-10,-1.5],['glow',-5.5,-2.5,-7.5,-4],['hull',-5,9,1.5,10],['metal',9,12,1.5,10],['metal',-7,-5,2.5,9],['trim',-1,5,1.5,10],['glow',.5,3.5,4,7.5]],
 // Medicine: an auto-injector, its dose glowing in the window.
 medicine:[['hull',-12,6,-4.5,4.5],['trim',-14.5,-12,-5,5],['dark',-7,3,-2.5,2.5],['glow',-6,2,-1.6,1.6],['metal',6,9,-3,3],['metal',9,15,-1,1]],
 // Electronics: a processor with pins on every side and a glowing die.
 electronics:[['hull',-9,9,-9,9],...[-6,0,6].flatMap(c=>[['metal',-12.5,-9,c-1.1,c+1.1],['metal',9,12.5,c-1.1,c+1.1],['metal',c-1.1,c+1.1,-12.5,-9],['metal',c-1.1,c+1.1,9,12.5]]),['dark',-5.5,5.5,-5.5,5.5],['glow',-3,3,-3,3]],
 // Machinery: a cog with eight teeth and a bored hub.
 machinery:[['hull','disc',0,0,9.5],...[0,1,2,3,4,5,6,7].map(i=>tooth(i*Math.PI/4,8.5,13,2.6)),['dark','disc',0,0,4.5],['metal','disc',0,0,2.6],['glow','disc',0,0,1.3]],
 // Ore: a faceted chunk with a glinting vein.
 ore:[['hull','poly',[[-13,1],[-6,-9],[5,-10],[13,-2],[9,8],[-3,10],[-12,6]],{tone:'mid'}],['hull','poly',[[-13,1],[-6,-9],[5,-10],[0,-1],[-6,2]],{tone:'lit'}],['hull','poly',[[5,-10],[13,-2],[6,1],[0,-1]],{tone:'hi'}],['hull','poly',[[-6,2],[0,-1],[6,1],[9,8],[-3,10],[-12,6]],{tone:'lo'}],['glow','poly',[[-9,-2],[-3,-5],[3,-3],[2,-1.5],[-3,-3.3],[-8,-.5]]]],
 // Gold: a stack of three cast bars, the top faces bright, one glint.
 gold:[['hull',-12,0,0,8,{taper:[1.5,7]}],['trim',-12,0,0,2,{taper:[1.5,3]}],['hull',1,13,0,8,{taper:[1.5,7]}],['trim',1,13,0,2,{taper:[1.5,3]}],['hull',-6,6,-8,0,{taper:[-6.5,-1]}],['trim',-6,6,-8,-6,{taper:[-6.5,-5]}],['glow',-3,-1,-7.5,-6]],
 // Scrap: torn plates and a bent pipe.
 scrap:[['hull','poly',[[-13,-6],[-2,-10],[4,-4],[-1,0],[-10,2]],{tone:'lit'}],['hull','poly',[[-4,1],[7,-3],[13,4],[6,9],[-5,8]],{tone:'mid'}],['metal',-9,12,-2.2,0.6],['metal',10,13,-4,2.6],['trim','poly',[[-9,-5],[-4,-7],[-3,-4],[-7,-3]],{tone:'mid'}],['dark','poly',[[2,3],[6,2],[7,5],[3,6]],{tone:'lo'}]],
 // Luxuries: a cut gem, crown and pavilion facets catching the light.
 luxuries:[['hull','poly',[[-13,0],[-7,-8],[7,-8],[13,0],[0,12]],{tone:'mid'}],['hull','poly',[[-7,-8],[7,-8],[4,-3],[-4,-3]],{tone:'hi'}],['hull','poly',[[-13,0],[-7,-8],[-4,-3],[-6,0]],{tone:'lit'}],['hull','poly',[[13,0],[7,-8],[4,-3],[6,0]],{tone:'lit'}],['hull','poly',[[-6,0],[6,0],[0,12]],{tone:'lo'}],['glow','poly',[[-4,-3],[4,-3],[6,0],[-6,0]]]],
 // Arms: an ammunition crate, three shell tips showing.
 arms:[['hull',-14,6,-7.5,7.5],['trim',-14,6,-7.5,-6],['dark',-10,-8,-7.5,7.5],['dark',0,2,-7.5,7.5],...[-4.5,0,4.5].flatMap(c=>[['metal',6,10,c-1.8,c+1.8],['glow',10,13.5,c-1.8,c+1.8,{taper:[c-.3,c+.3]}]])],
};
