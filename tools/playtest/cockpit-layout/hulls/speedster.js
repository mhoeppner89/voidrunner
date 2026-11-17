// Measured from assets/models/ships/speedster.glb, Speedster_Glass /
// VR_Canopy_Glass. Native nose is -X (the four engine markers are at +1.00012).
// The shallow roof and two side panes have a short flat front brow, rather
// than Mercury's rounded pane ring. Keep the four front-rim corners angular.
// Eye/look and projection stretch are explicit interior proposals, not a seat
// or interior supplied by the exterior model. See speedster.md for the survey.
export default {
    eye:[-.55,-.065,0],look:[-1.55,-.065,0],fov:64,
    target:[-.575,-.035,0],kx:3.4,ky:4,
    windowMinX:-.68,windowMaxX:-.47,
    // Looking -X makes +Z screen-left: this order also attaches the shared
    // lower jambs to the correct left/right monitor mounts.
    ribs:[[
        [-.67167354,-.07009790,.04784570],
        [-.67166018,-.05183148,.02342698],
        [-.67166018,-.05183148,-.02342698],
        [-.67167354,-.07009790,-.04784570],
    ]],
};
