// Authored station front is +Z in the runtime. Yaw faces the populated part
// of each system, with level decks; shared by geometry, berths and films.
export const STATION_YAW_DEGREES = Object.freeze({
    helix:355, rook:203, haven:129, 'league-yard':253, cinderfall:325,
    cairn:135, argent:214, 'gatehouse-twelve':54, blackglass:88,
    cinder:320, torchwell:229, nacre:317, shepherd:172,
});
export const stationYaw = id => (STATION_YAW_DEGREES[id] ?? 0) * Math.PI / 180;
// Cold-path transform of a point about the location anchor. Inverse is used
// for parked-ship clearance in the authored station frame.
export function stationRotatePoint(id, point, origin=[0,0,0], inverse=false) {
    const yaw=stationYaw(id)*(inverse?-1:1),c=Math.cos(yaw),s=Math.sin(yaw),x=point[0]-origin[0],z=point[2]-origin[2];
    return [origin[0]+x*c+z*s,point[1],origin[2]+z*c-x*s];
}
