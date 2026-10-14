// Minimal recognition cues in normalized top-down hull space: x is half-width,
// y is bow-to-stern length. These show existing structure, never change the hull.
const box=(x0,y0,x1,y1)=>[[x0,y0],[x1,y0],[x1,y1],[x0,y1],[x0,y0]];
export const SCHEMATIC_DETAILS={
 blade:{features:['twin launcher fairings','swept wing roots'],paths:[[[.25,.53],[.55,.59],[.55,.76],[.25,.73],[.25,.53]],[[.58,.77],[.78,.86]]]},
 speedster:{features:['paired compact drives'],paths:[box(.17,.80,.58,.94)]},
 legionary:{features:['diamond wing spars','paired rear drives'],paths:[[[.17,.42],[.67,.55],[.31,.68]],box(.12,.83,.39,.94)]},
 andromeda:{features:['four long engine pods','stepped command spine'],paths:[box(.18,.45,.43,.94),box(.63,.44,.89,.94),[[0,.23],[.17,.32],[.17,.70]],[[.18,.87],[.43,.87]],[[.63,.87],[.89,.87]]]},
 torsas:{features:['paired cargo containers','long outer drive rails'],paths:[box(.30,.30,.73,.51),box(.30,.59,.73,.83),[[.86,.26],[.86,.92]]]},
 astra:{features:['inner and outer engine banks','tapered central pressure cabin'],paths:[[[.28,.52],[.28,.87],[.48,.94]],[[.77,.46],[.77,.94]],[[.55,.89],[.94,.89]],[[0,.18],[.26,.40],[.26,.52]]]},
 kestrel:{features:['forward utility cabin','single narrow spine','paired stern drives'],paths:[box(0,.24,.23,.31),[[0,.41],[0,.68]],[[.16,.81],[.16,.93]]]},
 warden:{features:['armored bomber cockpit','broad shoulder plates','heavy twin drive housings'],paths:[[[0,.10],[.17,.10],[.20,.23],[0,.23]],[[.20,.29],[.44,.49],[.44,.59]],box(.27,.71,.67,.92)]},
 demon:{features:['rear twin drive rails'],paths:[box(.22,.77,.36,.93)]},
 mule:{features:['cargo hold','paired lateral weapon platforms'],paths:[box(0,.70,.46,.87),box(.45,.53,.73,.58)]},
 scrapper:{features:['chisel cockpit','paired intake mouths','broad wing spars'],paths:[[[0,.13],[.055,.13],[.09,.28],[0,.28]],box(.24,.38,.43,.48),[[.46,.48],[.78,.47]]]},
 talon:{features:['thin swept-wing spar','paired aft engines'],paths:[[[.19,.53],[.72,.59],[.28,.65]],box(.13,.82,.34,.95)]},
 prospector:{features:['armored cylindrical hold','central service hatch','three visible rear drive columns'],paths:[[[.57,.29],[.57,.84]],box(0,.43,.32,.69),[[0,.91],[0,.96]],[[.42,.91],[.42,.96]]]},
 lancer:{features:['canted wing carriers','main stern engine pair'],paths:[[[.26,.49],[.59,.61],[.29,.73]],box(.13,.83,.34,.93)]},
 'atlas-freighter':{features:['forward bridge','six cargo frames','twin outer engine banks'],paths:[box(0,.11,.27,.17),[[.20,.29],[.20,.80]],[[.72,.29],[.72,.80]],...[.30,.39,.48,.57,.66,.75].map(y=>[[.20,y],[.80,y]]),box(.19,.88,.60,.97)]},
 'concord-frigate':{features:['command island','broadside battery rows','paired main drives'],paths:[box(0,.26,.35,.38),...[.51,.56,.61].map(y=>[[.48,y],[.75,y]]),box(.30,.84,.65,.94)]},
 'concord-battleship':{features:['central armored citadel','forward and aft broadside batteries','four stern drives'],paths:[box(0,.43,.21,.71),box(.33,.50,.49,.56),box(.33,.76,.52,.81),[[.15,.91],[.15,.96]],[[.34,.91],[.34,.96]]]},
 'concord-carrier':{features:['long flight deck','three paired hangar rows'],paths:[[[.24,.32],[.24,.85]],...[.43,.59,.74].map(y=>box(.46,y,.78,y+.07)),box(0,.17,.18,.25)]},
 'concord-cruiser':{features:['long command prow','central armored neck','two broadside sections','paired aft drives'],paths:[box(0,.14,.22,.27),[[0,.47],[0,.62]],box(.61,.35,.82,.41),box(.65,.73,.85,.81),[[.28,.88],[.28,.96]]]},
};
