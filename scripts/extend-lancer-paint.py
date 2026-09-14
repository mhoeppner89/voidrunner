"""Blender MCP: Lancer full hull paint extension, preserving shipped assets.
Re-unwrap only repainted hull faces; rasterize deliberate markings in object space.
"""
import bpy, math, json
import numpy as np
from pathlib import Path
ROOT=Path('/Users/mhoeppner/Desktop/Voidrunner');OUT=ROOT/'.freebuff/lancer-paint'
bpy.ops.object.select_all(action='DESELECT')
bpy.ops.import_scene.gltf(filepath=str(OUT/'approved-nose.glb'))
obj=next(o for o in bpy.context.selected_objects if o.type=='MESH');obj.name='Lancer_Full_Paint_Preview'
mesh=obj.data
original_uv=np.array([l.uv[:] for l in mesh.uv_layers.active.data])
original_material=mesh.materials[0]
original_bs=next(n for n in original_material.node_tree.nodes if n.type=='BSDF_PRINCIPLED')
original_image=original_bs.inputs['Base Color'].links[0].from_node.image
original_pixels=np.empty(original_image.size[0]*original_image.size[1]*4,dtype=np.float32)
original_image.pixels.foreach_get(original_pixels)
original_pixels=original_pixels.reshape(original_image.size[1],original_image.size[0],4)

mat=bpy.data.materials.new('VR_Lancer_Hull_Armor');mat.use_nodes=True
mesh.materials.append(mat);slot=len(mesh.materials)-1
selected=[]
for p in mesh.polygons:
    c=p.center
    if mesh.materials[p.material_index].name.startswith('painted'):
        p.material_index=slot;selected.append(p.index)
    p.select=p.index in selected
bpy.context.view_layer.objects.active=obj
# Retain the established non-overlapping original hull UV atlas. The
# approved nose has its own 2K atlas and is preserved without re-encoding.
N=2048
color=np.zeros((N,N,4),dtype=np.float32);mr=np.zeros_like(color);mask=np.zeros((N,N),dtype=bool)
uv=mesh.uv_layers.active.data
# Surface design uses ship coordinates, so paired markings are truly mirrored.
def paint(p):
    x,y,z=p.T;ay=np.abs(y)
    col=np.broadcast_to(np.array([.72,.74,.73]),(len(x),3)).copy()
    rough=np.full(len(x),.51);metal=np.full(len(x),.12)
    # Match armor to the existing structural regions. X is noseward,
    # Y spans the wings, and Z is up. Paint design is mirrored about Y=0.
    wing=ay>.32
    pod=(ay>.13)&(ay<.34)&(x<.36)
    fin=(z>.17)&(x<.0)
    spine=(ay<.13)&(x<.458)
    lower=((z<-.075)&~wing)|((x<-.77)&~fin)
    machinery=lower|(pod&(((x>-.53)&(x<-.38))|((x>-.04)&(x<.045))))
    col[machinery]=[.055,.065,.072];metal[machinery]=.78;rough[machinery]=.40
    red=(wing&(ay>.66))|(wing&(np.abs(x+.14+ay*.36)<.022))
    red|=pod&((np.abs(x+.64)<.043)|(np.abs(x-.19)<.032))
    red|=spine&(ay<.03)&(((x>.10)&(x<.36))|((x>-.38)&(x<-.21)))
    red|=fin&(ay>.17)&(z>.24)
    red&=~machinery
    col[red]=[.48,.025,.018];rough[red]=.40
    # Long armor joints; wing joints follow the swept planform.
    body_distance=np.minimum.reduce([np.abs(x-a) for a in [-.72,-.54,-.34,-.12,.09,.29,.458]])
    wing_distance=np.minimum(np.abs(np.mod(ay-.34,.18)-.09),np.abs(x+.14+ay*.36)-.028)
    wing_distance=np.abs(wing_distance)
    joint_distance=np.where(wing,wing_distance,body_distance)
    seam=(joint_distance<.0011)&~machinery
    col[seam]=[.065,.078,.088];rough[seam]=.72
    # Service panels on wing roots and hull spine.
    hatch=wing&(ay>.37)&(ay<.48)&(x>-.13)&(x<-.025)
    hatch|=spine&(x>-.30)&(x<-.19)&(ay>.045)&(ay<.10)
    col[hatch]=[.45,.49,.50]
    vent=(pod&(x>-.31)&(x<-.16))|(spine&(x>-.68)&(x<-.44)&(ay>.038))
    col[vent]=[.032,.045,.053];rough[vent]=.76;metal[vent]=.55
    slat=vent&(np.mod(x,.013)<.003)
    col[slat]=[.22,.25,.27];metal[slat]=.8;rough[slat]=.4
    # Fasteners along the armor joints, and amber maintenance stripes.
    bolt=(joint_distance>.005)&(joint_distance<.007)&(np.mod(ay+z*.2,.035)<.002)
    col[bolt&~machinery]=[.16,.19,.21];metal[bolt]=.85
    caution=pod&(x>-.365)&(x<-.349)&(z>.035)
    col[caution]=[.64,.34,.025]
    col[caution&(np.mod(y+z,.018)<.008)]=[.035,.041,.045]
    # Large stencil identifiers on the wing panels; mirrored layout.
    glyphs={'L':['10000','10000','10000','10000','10000','10000','11111'],
      '0':['01110','10001','10011','10101','11001','10001','01110'],
      '7':['11111','00001','00010','00100','01000','01000','01000'],
      '-':['00000','00000','00000','11111','00000','00000','00000']}
    ix=np.floor((ay-.48)/.007).astype(int);iy=np.floor((.02-x)/.007).astype(int)
    valid=(ix>=0)&(ix<23)&(iy>=0)&(iy<7)&wing
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
    edge_distance=np.minimum(joint_distance,np.where(wing,np.abs(ay-.68),np.abs(ay-.13)))
    edge_wear=np.exp(-edge_distance/.0035)
    # Dirty seams, oily handling marks and uneven sun-bleached paint.
    dirt=.09+.24*broad+.40*edge_wear*(.4+.6*flake)
    soot=np.exp(-((ay-.059)/.014)**2)*np.clip((.79-x)/.085,0,1)*((x>.692)&(x<.79))
    dirt+=soot*.32
    dirt+=np.clip((-x-.56)/.25,0,.65)*(pod|lower)
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
# Replace the tiny original-paint transition carried by the nose study,
# keeping every pixel of the approved nose forward of the panel joint.
nose_mat=next(m for m in mesh.materials if m.name.startswith('VR_Lancer_Nose_Armor'))
nose_images=[n for n in nose_mat.node_tree.nodes if n.type=='TEX_IMAGE']
nose_base=next(n for n in nose_images if n.image.colorspace_settings.name=='sRGB')
nose_packed=next(n for n in nose_images if n.image.colorspace_settings.name!='sRGB')
def image_pixels(image):
    data=np.empty(N*N*4,dtype=np.float32);image.pixels.foreach_get(data);return data.reshape(N,N,4)
nose_color=image_pixels(nose_base.image);nose_mr=image_pixels(nose_packed.image)
for fi in [f.index for f in mesh.polygons if mesh.materials[f.material_index].name.startswith('VR_Lancer_Nose_Armor')]:
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
        keep=p[:,0]<.458
        if keep.any():
            nose_color[py[keep],px[keep]],nose_mr[py[keep],px[keep]]=paint(p[keep])
nose_base.image=image_map('Lancer_Nose_FullBase',nose_color,'sRGB')
nose_packed.image=image_map('Lancer_Nose_FullMetalRough',nose_mr,'Non-Color')
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
