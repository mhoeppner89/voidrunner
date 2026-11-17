// Validated against prospector.glb primitive 1: six window triangles (one roof
// quad and two side quads). The other 184 triangles are the shared nose sensor.
// +X is confirmed by the forward muzzle and the six -X exhaust sockets.
// Proposed seat/projection, not an authored interior; see prospector.md.
export default {
    // Raise the projected brow clear of desktop comms, retaining all model vertices.
    eye:[1.17,.02,0],look:[2.17,.02,0],fov:64,target:[1.32,.025,0],kx:1.5,ky:2.14,windowMaxX:1.45,
    glassMaterials:['VR_Canopy_prospector'],
    // Screen-left lower -> left roof -> right roof -> screen-right lower.
    // The posts bridge measured corners; they are proposed interior supports.
    ribs:[[
        [1.3593155145645142,-.009491314180195332,-.18769176304340363],
        [1.388384461402893,.08256077766418457,-.061400800943374634],
        [1.388384461402893,.08256077766418457,.061400800943374634],
        [1.3593155145645142,-.009491314180195332,.18769176304340363],
    ]],
};
