"""Blender MCP: Lancer full hull paint extension, preserving shipped assets.
Re-unwrap only repainted hull faces; rasterize deliberate markings in object space.
"""
import bpy, math, json
import numpy as np
from pathlib import Path
ROOT=Path('/Users/mhoeppner/Desktop/Voidrunner');OUT=ROOT/'.freebuff/lancer-paint'
bpy.ops.object.select_all(action='DESELECT')
bpy.ops.import_scene.gltf(filepath=str(ROOT/'assets/models/ships/lancer.glb'))
obj=next(o for o in bpy.context.selected_objects if o.type=='MESH');obj.name='Lancer_Panel_Paint_Preview'
mesh=obj.data
original_uv=np.array([l.uv[:] for l in mesh.uv_layers.active.data])
original_material=mesh.materials[0]
original_bs=next(n for n in original_material.node_tree.nodes if n.type=='BSDF_PRINCIPLED')
original_image=original_bs.inputs['Base Color'].links[0].from_node.image
original_pixels=np.empty(original_image.size[0]*original_image.size[1]*4,dtype=np.float32)
original_image.pixels.foreach_get(original_pixels)
original_pixels=original_pixels.reshape(original_image.size[1],original_image.size[0],4)
# Suppress tiny baked-in grime flecks before recovering the livery regions.
for _ in range(2):
    original_pixels=(original_pixels*4+np.roll(original_pixels,1,0)+np.roll(original_pixels,-1,0)+np.roll(original_pixels,1,1)+np.roll(original_pixels,-1,1))/8


# Smooth short-scale surface bumps with coincident UV vertices locked
# together. Keep canopy geometry, hard ridges, extrema and silhouette tips.
from mathutils import Vector
import bmesh
canopy_ids={i for f in mesh.polygons if mesh.materials[f.material_index].name.startswith('VR_Canopy_') for i in f.vertices}
canopy_points=[mesh.vertices[i].co.copy() for i in canopy_ids]
groups={}
for v in mesh.vertices:
    if v.index not in canopy_ids:groups.setdefault(tuple(round(c,6) for c in v.co),[]).append(v.index)
keys=list(groups);lookup={vi:k for k,key in enumerate(keys) for vi in groups[key]}
coords=np.array(keys,dtype=float);initial=coords.copy();adj=[set() for _ in keys];normals=[[] for _ in keys]
for f in mesh.polygons:
    if any(i in canopy_ids for i in f.vertices):continue
    ids=[lookup[i] for i in f.vertices]
    for k in ids:
        adj[k].update(j for j in ids if j!=k);normals[k].append(np.array(f.normal))
lo=coords.min(axis=0);hi=coords.max(axis=0);movable=[]
for k,p in enumerate(coords):
    ns=np.array(normals[k]);avg=ns.mean(axis=0) if len(ns) else np.zeros(3)
    avg/=max(np.linalg.norm(avg),1e-9)
    hard=not len(ns) or (ns@avg).min()<.7
    near_glass=min((np.linalg.norm(p-np.array(v)) for v in canopy_points),default=1)<.023
    extremum=np.any(abs(p-lo)<.004)|np.any(abs(p-hi)<.004)
    if not hard and not near_glass and not extremum and len(adj[k])>2:movable.append(k)
for iteration in range(5):
    updated=coords.copy()
    for k in movable:
        delta=(coords[list(adj[k])].mean(axis=0)-coords[k])*.27
        target=coords[k]+delta;offset=target-initial[k];length=np.linalg.norm(offset)
        if length>.006:target=initial[k]+offset*.006/length
        updated[k]=target
    coords=updated
# Broad wing skins should read as manufactured planes. Fit each side's
# upper and lower skin independently, leaving roots and tips protected.
for side in [-1,1]:
    for upper in [False,True]:
        candidates=[k for k in movable if side*coords[k,1]>.40 and side*coords[k,1]<.84 and coords[k,0]<.25 and coords[k,0]>-.40 and (coords[k,2]>-.10)==upper]
        if len(candidates)<30:continue
        q=coords[candidates];A=np.column_stack((q[:,0],q[:,1],np.ones(len(q))))
        fit=np.linalg.lstsq(A,q[:,2],rcond=None)[0]
        residual=q[:,2]-A@fit
        good=np.abs(residual)<.018
        if good.sum()<20:continue
        fit=np.linalg.lstsq(A[good],q[good,2],rcond=None)[0]
        for k in np.array(candidates)[good]:
            target=coords[k,0]*fit[0]+coords[k,1]*fit[1]+fit[2]
            coords[k,2]+=np.clip(target-coords[k,2],-.007,.007)
for k,key in enumerate(keys):
    for vi in groups[key]:mesh.vertices[vi].co=coords[k]
mesh.update()
moved=int(np.sum(np.linalg.norm(coords-initial,axis=1)>1e-6))
# A small further reduction on interior vertices only. UV boundaries and
# canopy vertices are locked to avoid holes or altered window outlines.
bpy.context.view_layer.objects.active=obj
bm=bmesh.new();bm.from_mesh(mesh);bm.verts.ensure_lookup_table()
locked=[v.index for v in bm.verts if v.is_boundary or v.index in canopy_ids];bm.free()
vg=obj.vertex_groups.new(name='Protected seams and canopy');vg.add(locked,1,'REPLACE')
dec=obj.modifiers.new('Conservative surface reduction','DECIMATE');dec.ratio=.97;dec.use_collapse_triangulate=True
dec.vertex_group=vg.name;dec.invert_vertex_group=True;dec.vertex_group_factor=1000
bpy.ops.object.modifier_apply(modifier=dec.name)
mesh=obj.data
original_uv=np.array([l.uv[:] for l in mesh.uv_layers.active.data])
mat=bpy.data.materials.new('VR_Lancer_Hull_Armor');mat.use_nodes=True
mesh.materials.append(mat);slot=len(mesh.materials)-1
selected=[]
for p in mesh.polygons:
    c=p.center
    if not mesh.materials[p.material_index].name.startswith('VR_Canopy_'):
        p.material_index=slot;selected.append(p.index)
    p.select=p.index in selected
bpy.context.view_layer.objects.active=obj
# Retain the established non-overlapping original hull UV atlas. The
# approved nose has its own 2K atlas and is preserved without re-encoding.
N=2048
color=np.zeros((N,N,4),dtype=np.float32);mr=np.zeros_like(color);mask=np.zeros((N,N),dtype=bool)
uv=mesh.uv_layers.active.data
# Surface design uses ship coordinates, so paired markings are truly mirrored.
def paint(p,source):
    x,y,z=p.T
    ay=np.abs(y)
    # Deliberate panel shapes replace thresholds from the old shaded texture.
    wing=ay>.34
    fin=(z>.16)&(x<-.25)
    pod=(ay>.13)&(ay<.34)
    nose=(x>.458)&(ay<.13)
    band=np.minimum.reduce([np.abs(x-a) for a in [-.58,-.32,-.075,.17,.385]])
    dark=(band<.045)&~wing&~fin&~nose
    dark|=((z<-.078)&~wing)|((x<-.80)&~fin)
    dark|=pod&(z<.035)&(x<.40)
    dark|=(x>.862)&(ay<.115)
    # Narrow red wing stripes and small end caps, as on the original.
    red=wing&(np.abs(x+.025+ay*.24)<.018)
    red|=wing&(ay>.87)
    red|=(ay<.029)&((np.abs(x-.77)<.039)|(np.abs(x-.40)<.027)|(np.abs(x-.20)<.022)|(np.abs(x+.28)<.024))
    red|=pod&(np.abs(x-.26)<.027)&(z>.024)
    red|=fin&(source[:,0]>source[:,1]*1.5)&(source[:,0]>source[:,2]*1.4)
    red&=~dark
    col=np.broadcast_to(np.array([.60,.62,.61]),(len(p),3)).copy()
    col[dark]=[.045,.057,.066];col[red]=[.45,.025,.017]
    metal=np.where(dark,.58,.10);rough=np.where(dark,.43,.52)
    white=~dark&~red
    # Thin joints and framed access panels, independent of lighting.
    distance=np.minimum.reduce([np.abs(x-a) for a in [-.76,-.535,-.365,-.12,.125,.34,.458,.668,.84]])
    wing_joint=np.minimum(np.abs(ay-.50),np.abs(ay-.75))
    distance=np.where(wing,wing_joint,distance)
    seam=(distance<.0009)&~dark
    col[seam]=[.075,.09,.10];rough[seam]=.70
    hatch=(x>.693)&(x<.745)&(ay>.043)&(ay<.069)
    hatch_edge=hatch&((x<.695)|(x>.743)|(ay<.045)|(ay>.067))
    col[hatch]=[.42,.46,.48];col[hatch_edge]=[.065,.08,.09]
    vent=pod&(x>-.27)&(x<-.17)&(z>.03)
    vent|=(ay<.11)&(ay>.035)&(x>-.70)&(x<-.62)
    col[vent]=[.03,.043,.052]
    col[vent&(np.mod(x,.010)<.0025)]=[.22,.25,.27]
    # Small warning marks and fasteners provide scale without noisy paint.
    mark=(x>.675)&(x<.687)&(ay>.035)&(ay<.039)
    col[mark]=[.66,.36,.025]
    bolt=(np.abs(distance-.005)<.0007)&(np.mod(ay,.028)<.0012)&~dark
    col[bolt]=[.18,.21,.23];metal[bolt]=.85
    # Isotropic 3D noise avoids the stretched streaks of a 2D projection.
    def noise(q):
        cell=np.floor(q);f=q-cell;f=f*f*(3-2*f);value=np.zeros(len(q))
        for a in [0,1]:
            for b in [0,1]:
                for c in [0,1]:
                    h=np.sin((cell[:,0]+a)*127.1+(cell[:,1]+b)*311.7+(cell[:,2]+c)*74.7+17.3)*43758.5453
                    h-=np.floor(h)
                    value+=h*np.where(a,f[:,0],1-f[:,0])*np.where(b,f[:,1],1-f[:,1])*np.where(c,f[:,2],1-f[:,2])
        return value
    broad=noise(p*70);flake=noise(p*300);grain=noise(p*850)
    # Modest grime and localized chips, keeping broad areas of paint intact.
    dirt=.035+.12*broad
    soot=np.clip((-x-.63)/.3,0,.25)
    dirt+=soot
    col*=(1-dirt)[:,None]
    signal=.6*flake+.4*broad
    chips=(signal>.79)&(white|red)
    primer=(signal>.755)&(white|red)
    col[primer]=[.20,.18,.15];rough[primer]=.73
    col[chips]=[.17,.20,.22];rough[chips]=.43;metal[chips]=.86
    rough=np.clip(rough+.07*(grain-.5),.25,.8)
    return np.column_stack((col,np.ones(len(p)))),np.column_stack((np.ones(len(p)),rough,metal,np.ones(len(p))))
for fi in selected:
    face=mesh.polygons[fi];loops=list(face.loop_indices)
    for k in range(1,len(loops)-1):
        li=[loops[0],loops[k],loops[k+1]]
        t=np.array([uv[i].uv[:] for i in li])*N
        ps=np.array([mesh.vertices[mesh.loops[i].vertex_index].co[:] for i in li])
        lo=np.maximum(np.floor(t.min(axis=0)).astype(int),0);hi=np.minimum(np.ceil(t.max(axis=0)).astype(int),N-1)
        xx,yy=np.meshgrid(np.arange(lo[0],hi[0]+1),np.arange(lo[1],hi[1]+1))
        a,b,c=t;den=(b[1]-c[1])*(a[0]-c[0])+(c[0]-b[0])*(a[1]-c[1])
        if abs(den)<1e-10:continue
        w0=((b[1]-c[1])*(xx+.5-c[0])+(c[0]-b[0])*(yy+.5-c[1]))/den
        w1=((c[1]-a[1])*(xx+.5-c[0])+(a[0]-c[0])*(yy+.5-c[1]))/den;w2=1-w0-w1
        inside=(w0>=0)&(w1>=0)&(w2>=0)
        px,py=xx[inside],yy[inside]
        p=w0[inside,None]*ps[0]+w1[inside,None]*ps[1]+w2[inside,None]*ps[2]
        sample_uv=w0[inside,None]*original_uv[li[0]]+w1[inside,None]*original_uv[li[1]]+w2[inside,None]*original_uv[li[2]]
        sx=np.clip((sample_uv[:,0]*original_image.size[0]).astype(int),0,original_image.size[0]-1)
        sy=np.clip((sample_uv[:,1]*original_image.size[1]).astype(int),0,original_image.size[1]-1)
        color[py,px],mr[py,px]=paint(p,original_pixels[sy,sx])
        mask[py,px]=True
# Dilation supplies safe mip/filter padding without joining UV islands.
for iteration in range(14):
    old=mask.copy()
    for axis,shift in [(0,1),(0,-1),(1,1),(1,-1)]:
        spread=np.roll(old,shift,axis)&~mask
        color[spread]=np.roll(color,shift,axis)[spread];mr[spread]=np.roll(mr,shift,axis)[spread];mask[spread]=True
color[~mask]=[.72,.74,.73,1];mr[~mask]=[1,.51,.12,1]
def image_map(name,pixels,space):
    im=bpy.data.images.new(name,width=N,height=N,alpha=True);im.colorspace_settings.name=space
    im.pixels.foreach_set(pixels.ravel());im.filepath_raw=str(OUT/(name+'.png'));im.file_format='PNG';im.save();im.pack();return im
base=image_map('Lancer_Hull_BaseColor',color,'sRGB');packed=image_map('Lancer_Hull_MetalRough',mr,'Non-Color')
nodes=mat.node_tree.nodes;links=mat.node_tree.links;bs=nodes.get('Principled BSDF')
tex=nodes.new('ShaderNodeTexImage');tex.image=base;links.new(tex.outputs['Color'],bs.inputs['Base Color'])
tex=nodes.new('ShaderNodeTexImage');tex.image=packed;sep=nodes.new('ShaderNodeSeparateColor');links.new(tex.outputs['Color'],sep.inputs['Color']);links.new(sep.outputs['Green'],bs.inputs['Roughness']);links.new(sep.outputs['Blue'],bs.inputs['Metallic'])
# Smooth only the new finish across duplicate UV seam vertices. Retain
# hard changes above 45 degrees and all existing canopy/hull normals elsewhere.
from mathutils import Vector
corner=[n.vector.copy() for n in mesh.corner_normals]
adj={}
for f in mesh.polygons:
    if mesh.materials[f.material_index].name.startswith('VR_Canopy_'):continue
    for vi in f.vertices:
        key=tuple(round(v,6) for v in mesh.vertices[vi].co)
        adj.setdefault(key,[]).append((f.normal.copy(),f.area))
for fi in selected:
    f=mesh.polygons[fi];f.use_smooth=True
    for li in f.loop_indices:
        key=tuple(round(v,6) for v in mesh.vertices[mesh.loops[li].vertex_index].co)
        n=Vector()
        for normal,area in adj[key]:
            if normal.dot(f.normal)>.707:n+=normal*area
        if n.length:corner[li]=n.normalized()
mesh.normals_split_custom_set(corner)
bpy.ops.object.select_all(action='DESELECT');obj.select_set(True)
bpy.ops.export_scene.gltf(filepath=str(OUT/'lancer.glb'),export_format='GLB',use_selection=True,export_yup=True,export_image_format='AUTO')
result={'smoothedPositionGroups':moved,'paintedFaces':len(selected),'textureSize':N,'triangles':sum(len(p.vertices)-2 for p in mesh.polygons),'output':str(OUT/'lancer.glb')}
(ROOT/'docs/lancer-paint/build.json').write_text(json.dumps(result,indent=2))
