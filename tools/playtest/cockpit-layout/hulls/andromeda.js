// Thor's broad raked front screen, measured from the native +Z-facing GLB.
// The separate VR_Canopy_Glass primitive contains only ten glazing triangles.
export default {
    eye:[.00068411,-.199,.65],look:[.00068411,-.199,1.65],fov:64,
    target:[.00068411,-.18,.79],kx:1.25,ky:1.1,
    glassMaterials:['VR_Canopy_Glass'],
    windowBounds:{min:[-.167,-.216,.729],max:[.169,-.145,.861]},
    // Ordered screen-left lower -> roof -> screen-right lower. +Z-facing
    // cameras see native +X on the left. Keep the actual roof angular.
    ribs:[[
        [.12907615,-.2143829,.86021543],
        [.11910722,-.14565946,.77283847],
        [-.117739,-.14565946,.77283847],
        [-.12770793,-.2143829,.86021543],
    ]],
};
