"""Blender MCP: isolated Lancer nose material study, preserving shipped assets.
Re-unwrap only repainted hull faces; rasterize deliberate markings in object space.
"""
import bpy, math, json
import numpy as np
from pathlib import Path
ROOT=Path('/Users/mhoeppner/Desktop/Voidrunner');OUT=ROOT/'.freebuff/lancer-paint'
bpy.ops.object.select_all(action='DESELECT')
bpy.ops.import_scene.gltf(filepath=str(ROOT/'assets/models/ships/lancer.glb'))
obj=next(o for o in bpy.context.selected_objects if o.type=='MESH');obj.name='Lancer_Nose_Paint_Preview'
mesh=obj.data
original_uv=np.array([l.uv[:] for l in mesh.uv_layers.active.data])
original_material=mesh.materials[0]
original_bs=next(n for n in original_material.node_tree.nodes if n.type=='BSDF_PRINCIPLED')
original_image=original_bs.inputs['Base Color'].links[0].from_node.image
original_pixels=np.empty(original_image.size[0]*original_image.size[1]*4,dtype=np.float32)
original_image.pixels.foreach_get(original_pixels)
original_pixels=original_pixels.reshape(original_image.size[1],original_image.size[0],4)

mat=bpy.data.materials.new('VR_Lancer_Nose_Armor');mat.use_nodes=True
mesh.materials.append(mat);slot=len(mesh.materials)-1
selected=[]
for p in mesh.polygons:
    c=p.center
    if not mesh.materials[p.material_index].name.startswith('VR_Canopy_') and c.x>.435 and abs(c.y)<.115:
        p.material_index=slot;selected.append(p.index)
    p.select=p.index in selected
bpy.context.view_layer.objects.active=obj
# Four orthographic UV tiles keep continuous paint over the source mesh's
# duplicated seam vertices. Only the new material's loops are touched.
uv=mesh.uv_layers.active.data
for fi in selected:
    face=mesh.polygons[fi];n=face.normal
    top=abs(n.z)>=abs(n.y)
    tile=0 if top and n.z>=0 else 1 if top else 2 if n.y>=0 else 3
    for li in face.loop_indices:
        p=mesh.vertices[mesh.loops[li].vertex_index].co
        u=(p.x-.435)/.62
        v=(p.y+.115)/.23 if top else (p.z+.14)/.34
        uv[li].uv=((tile%2)*.5+.025+.45*u,(tile//2)*.5+.025+.45*v)
N=2048
color=np.zeros((N,N,4),dtype=np.float32);mr=np.zeros_like(color);mask=np.zeros((N,N),dtype=bool)
uv=mesh.uv_layers.active.data
# Surface design uses ship coordinates, so paired markings are truly mirrored.
def paint(p):
    x,y,z=p.T;ay=np.abs(y)
    col=np.broadcast_to(np.array([.72,.74,.73]),(len(x),3)).copy()
    rough=np.full(len(x),.51);metal=np.full(len(x),.12)
    # Broad armor plates, rather than noisy faux dirt or baked highlights.
    shade=np.where((x>.665)&(x<.75),.035,0)+np.where(ay>.072,-.075,0)
    col+=shade[:,None]
    red=((ay<.019)&(((x>.672)&(x<.837))|((x>.444)&(x<.485))))&(z>.025)
    col[red]=[.48,.025,.018];rough[red]=.40
    lower=(z<.009)|(x>.862)
    col[lower]=[.045,.057,.065];rough[lower]=.34;metal[lower]=.78
    # Longitudinal cheek panels and precise transverse joints.
    seam=np.zeros(len(x),bool)
    for station in [.458,.667,.750,.838]:seam|=(np.abs(x-station)<.00075)
    seam|=(np.abs(ay-.072)<.0006)&(x>.667)&(x<.838)
    seam&=~lower
    col[seam]=[.065,.078,.088];rough[seam]=.68
    # Cheek service hatches and recessed cooling slots, mirrored on each side.
    hatch=(x>.687)&(x<.732)&(ay>.049)&(ay<.069)
    edge=hatch&((x<.6885)|(x>.7305)|(ay<.0505)|(ay>.0675))
    col[hatch]=[.51,.55,.56];col[edge]=[.065,.078,.085]
    vent=(x>.763)&(x<.817)&(ay>.050)&(ay<.068)
    col[vent]=[.065,.083,.093];metal[vent]=.65;rough[vent]=.7
    slat=vent&(np.mod(x-.763,.006)<.0016)
    col[slat]=[.25,.29,.31];rough[slat]=.38
    # Small fasteners, with a metal head and a narrow dark socket.
    for sx in [.680,.741,.826]:
        r=np.sqrt((x-sx)**2+(ay-.080)**2)
        col[r<.0014]=[.07,.08,.09]
        col[r<.0008]=[.34,.38,.40];metal[r<.0008]=.85
    # Paired amber caution triangles by the canopy sill.
    dx=(x-.677)/.012;dy=(ay-.036)/.009
    tri=(dx>0)&(dx<1)&(np.abs(dy)<(1-dx)*.5)
    inner=(dx>.17)&(dx<.74)&(np.abs(dy)<(1-dx)*.5-.10)
    col[tri]=[.65,.35,.025];col[inner]=[.07,.075,.075]
    # Crisp stencil identifier on the nose plate, in a compact 5x7 face.
    glyphs={'L':['10000','10000','10000','10000','10000','10000','11111'],
      '0':['01110','10001','10011','10101','11001','10001','01110'],
      '7':['11111','00001','00010','00100','01000','01000','01000'],
      '-':['00000','00000','00000','11111','00000','00000','00000']}
    # Text across the dorsal plate, behind the nose stripe.
    tx=(y+.026)/.0021;ty=(.475-x)/.0021
    ix=np.floor(tx).astype(int);iy=np.floor(ty).astype(int)
    valid=(ix>=0)&(ix<23)&(iy>=0)&(iy<7)&(z>.11)
    for j,ch in enumerate('L-07'):
        for row,bits in enumerate(glyphs[ch]):
            for k,bit in enumerate(bits):
                if bit=='1':col[valid&(ix==j*6+k)&(iy==row)]=[.045,.055,.064]
    # Wear stays in object space: continuous across UV tiles, deliberately
    # irregular between port and starboard, unlike the mirrored paint design.
    def noise(a,b):
        ia=np.floor(a);ib=np.floor(b);u=a-ia;v=b-ib
        u=u*u*(3-2*u);v=v*v*(3-2*v)
        def h(i,j):
            value=np.sin(i*127.1+j*311.7+17.3)*43758.5453
            return value-np.floor(value)
        return (h(ia,ib)*(1-u)+h(ia+1,ib)*u)*(1-v)+(h(ia,ib+1)*(1-u)+h(ia+1,ib+1)*u)*v
    surface=y+z*.61
    broad=noise(x*55,surface*55)
    grain=noise(x*950,surface*950)
    flake=noise(x*260,surface*260)
    seam_distance=np.minimum.reduce([np.abs(x-a) for a in [.458,.667,.750,.838]])
    sill=(x>.487)&(x<.657)
    edge_distance=np.minimum(seam_distance,np.where(sill,np.abs(ay-.049),np.abs(ay-.072)))
    edge_wear=np.exp(-edge_distance/.0035)
    # Dirty seams, oily handling marks and uneven sun-bleached paint.
    dirt=.09+.24*broad+.40*edge_wear*(.4+.6*flake)
    soot=np.exp(-((ay-.059)/.014)**2)*np.clip((.79-x)/.085,0,1)*((x>.692)&(x<.79))
    dirt+=soot*.32
    col*=np.clip(1-dirt,.22,1)[:,None]
    col+=((broad-.5)*.045)[:,None]
    rough=np.clip(rough+.13*broad+.12*edge_wear,.25,.9)
    # Broken primer margins surrounding sharp chips of exposed alloy.
    chip_signal=.54*flake+.36*broad+.10*grain+edge_wear*.38+np.where(x>.815,.07,0)
    primer=(chip_signal>.74)&~vent&~seam
    chips=(chip_signal>.81)&~vent&~seam
    col[primer]=[.19,.17,.135];rough[primer]=.78
    col[chips]=np.column_stack((.10+.10*grain[chips],.12+.11*grain[chips],.135+.12*grain[chips]))
    metal[chips]=.88;rough[chips]=.36+.18*broad[chips]
    # Fine longitudinal scuffs and scattered small impacts on exposed panels.
    scratch=(noise(x*75,surface*2100)>.90)&(broad>.64)&~lower&~vent
    col[scratch]=[.25,.27,.27];metal[scratch]=.64;rough[scratch]=.39
    col=np.clip(col,0,1)
    return np.column_stack((col,np.ones(len(x)))),np.column_stack((np.ones(len(x)),rough,metal,np.ones(len(x))))
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
        color[py,px],mr[py,px]=paint(p)
        # Keep the old paint outside a straight transverse panel boundary,
        # even on triangles crossing it. This avoids a jagged material edge.
        old_uv=w0[inside,None]*original_uv[li[0]]+w1[inside,None]*original_uv[li[1]]+w2[inside,None]*original_uv[li[2]]
        old_x=np.clip((old_uv[:,0]*original_image.size[0]).astype(int),0,original_image.size[0]-1)
        old_y=np.clip((old_uv[:,1]*original_image.size[1]).astype(int),0,original_image.size[1]-1)
        keep=p[:,0]<.458
        color[py[keep],px[keep]]=original_pixels[old_y[keep],old_x[keep]]
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
base=image_map('Lancer_Nose_BaseColor',color,'sRGB');packed=image_map('Lancer_Nose_MetalRough',mr,'Non-Color')
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
result={'paintedFaces':len(selected),'textureSize':N,'triangles':sum(len(p.vertices)-2 for p in mesh.polygons),'output':str(OUT/'lancer.glb')}
(ROOT/'docs/lancer-paint/build.json').write_text(json.dumps(result,indent=2))
