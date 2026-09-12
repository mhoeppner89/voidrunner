"""Blender MCP build: preserve source UVs, reduce hulls, fit framed glass.

Source models: glb_models/ships (archived originals, not the shipped exports).
X is forward, Y lateral, Z up in Blender; export preserves glTF Y-up.
Run with execute_blender_code. Outputs are candidates until visually approved.
"""
import bpy, bmesh, math, json
import numpy as np
from pathlib import Path
from mathutils import Vector
ROOT = Path('/Users/mhoeppner/Desktop/Voidrunner')
OUT = ROOT / '.freebuff/ship-cleanup/candidate'
OUT.mkdir(parents=True, exist_ok=True)
RATIOS = dict(wayfarer=.55, talon=.65, vanguard=.50, prospector=.50, lancer=.55, atlas=.55)

def roof(x0, x1, width0, width1, z0, z1):
    return [(x0,-width0,z0),(x0,width0,z0),(x1,width1,z1),(x1,-width1,z1)]

def mirrored(points):
    return [points, [(x,-y,z) for x,y,z in points]]

# Individual panes follow the original windows, leaving the painted canopy
# supports and bridge architecture intact. Talon's green canopy is preserved.
PANELS = {
    'wayfarer': [roof(.743,.816,.030,.032,.130,.099), roof(.828,.872,.032,.033,.094,.072), roof(.886,.931,.033,.032,.065,.046)]
        + mirrored([(.764,-.091,.112),(.802,-.084,.096),(.801,-.123,.052),(.768,-.126,.065)])
        + mirrored([(.817,-.086,.087),(.860,-.080,.068),(.856,-.120,.034),(.814,-.121,.049)]),
    'talon': [],
    'lancer': [roof(.49,.575,.045,.042,.168,.165),roof(.59,.654,.041,.034,.161,.109)]
        + mirrored([(.493,-.057,.161),(.57,-.053,.157),(.57,-.069,.124),(.525,-.075,.123)])
        + mirrored([(.585,-.054,.153),(.642,-.047,.115),(.593,-.067,.121),(.577,-.067,.125)]),
    'prospector': [roof(.81,.891,.079,.071,.146,.087)]
        + mirrored([(.79,-.224,.040),(.872,-.179,.025),(.874,-.203,-.012),(.805,-.244,-.009)]),
    'vanguard': [roof(.782,.859,.102,.086,.078,.038)],
    'atlas': [],
}
# Atlas has narrow wraparound bridge bands, not a raised fighter canopy.
for a,b in zip([-.17,-.125,-.075,-.025,.025,.075,.125],[-.125,-.075,-.025,.025,.075,.125,.17]):
    def ring(y,z): return (.984 - 1.7*y*y + (.085-z)*.4, y, z)
    PANELS['atlas'].append([ring(a,.084),ring(b,.084),ring(b,.061),ring(a,.061)])
for a,b in [(-.067,-.023),(-.019,.019),(.023,.067)]:
    PANELS['atlas'].append([(.858-.6*a*a,a,.175),(.858-.6*b*b,b,.175),(.866-.6*b*b,b,.158),(.866-.6*a*a,a,.158)])

def material(name, color, metal, rough):
    m=bpy.data.materials.get(name) or bpy.data.materials.new(name)
    m.use_nodes=True
    bs=m.node_tree.nodes.get('Principled BSDF')
    bs.inputs['Base Color'].default_value=(*color,1)
    bs.inputs['Metallic'].default_value=metal
    bs.inputs['Roughness'].default_value=rough
    return m

glass=material('VR_Canopy_Glass',(.025,.065,.095),.35,.16)
# Use real environment reflections; avoid painting reflection bands onto glass.
bs=glass.node_tree.nodes['Principled BSDF']
for link in list(bs.inputs['Base Color'].links): glass.node_tree.links.remove(link)
frame=material('VR_Canopy_Frame',(.54,.48,.36),.45,.33)
result={'ships':[]}
for name,ratio in RATIOS.items():
    source=bpy.data.objects.get('SourceTexture_'+name)
    if source is None:
        bpy.ops.object.select_all(action='DESELECT')
        bpy.ops.import_scene.gltf(filepath=str(ROOT/'glb_models/ships'/f'{name}.glb'))
        source=next(o for o in bpy.context.selected_objects if o.type=='MESH')
        source.name='SourceTexture_'+name
    old=bpy.data.objects.get('Optimized_'+name)
    if old: bpy.data.objects.remove(old,do_unlink=True)
    o=source.copy();o.data=source.data.copy();o.name='Optimized_'+name
    source.users_collection[0].objects.link(o)
    # A restrained source-resolution unsharp pass clarifies paint and panel
    # edges. Work on a copy, never repeatedly sharpen or upscale the original.
    if name != 'talon':
        paint=o.data.materials[0].copy();o.data.materials[0]=paint
        shader=paint.node_tree.nodes.get('Principled BSDF')
        tex=shader.inputs['Base Color'].links[0].from_node
        original=tex.image;img=original.copy();img.name='VR_'+name+'_Paint'
        w,h=img.size;pixels=np.empty(w*h*4,dtype=np.float32)
        original.pixels.foreach_get(pixels);pixels=pixels.reshape(h,w,4)
        rgb=pixels[:,:,:3];blur=rgb.copy()
        for axis in (0,1):blur=(np.roll(blur,1,axis)+2*blur+np.roll(blur,-1,axis))*.25
        strength=.25 if name=='wayfarer' else .4
        pixels[:,:,:3]=np.clip(rgb+strength*(rgb-blur),0,1)
        img.pixels.foreach_set(pixels.ravel());img.pack();tex.image=img
    bpy.ops.object.select_all(action='DESELECT');o.select_set(True);bpy.context.view_layer.objects.active=o
    o.data.calc_loop_triangles();before=len(o.data.loop_triangles)
    bm=bmesh.new();bm.from_mesh(o.data)
    # Retain duplicated seam vertices: welding them lets collapse cross UV islands.
    bmesh.ops.dissolve_degenerate(bm,edges=list(bm.edges),dist=.0000001)
    boundary=[v.index for v in bm.verts if v.is_boundary]
    bm.to_mesh(o.data);bm.free()
    dec=o.modifiers.new('Conservative hull reduction','DECIMATE')
    # UV islands share positions but have separate vertices. Lock their
    # boundaries so independent collapses cannot open cracks between islands.
    seam_group=o.vertex_groups.new(name='Protected UV boundaries')
    if boundary:seam_group.add(boundary,1,'REPLACE')
    dec.vertex_group=seam_group.name;dec.invert_vertex_group=True;dec.vertex_group_factor=1000
    dec.ratio=ratio;dec.use_collapse_triangulate=True
    bpy.ops.object.modifier_apply(modifier=dec.name)
    for poly in o.data.polygons: poly.use_smooth=True
    if hasattr(o.data,'set_sharp_from_angle'):o.data.set_sharp_from_angle(angle=math.radians(40))
    vertices=[];faces=[];mats=[]
    for points in PANELS[name]:
        pts=[Vector(p) for p in points]
        center=sum(pts,Vector())/4
        normal=(pts[1]-pts[0]).cross(pts[2]-pts[0]).normalized()
        if normal.z<0:pts.reverse();normal=-normal
        # Planar panes, inset into the old surface. Flatten only the covered
        # window vertices, not the surrounding hull or painted frames.
        pts=[p-normal*(p-center).dot(normal) for p in pts]
        for v in o.data.vertices:
            d=(v.co-center).dot(normal)
            if -.003<d<.035:
                projected=v.co-normal*d
                if all((pts[(i+1)%4]-pts[i]).cross(projected-pts[i]).dot(normal)>=-1e-8 for i in range(4)):
                    v.co-=normal*(d+.001)
        outer=[p+normal*.001 for p in pts]
        inner=[center+(p-center)*.94+normal*.0012 for p in pts]
        offset=len(vertices);vertices.extend([tuple(p) for p in outer+inner])
        faces.append(tuple(offset+i for i in (4,5,6,7)));mats.append(0)
        for i in range(4):
            j=(i+1)%4;faces.append((offset+i,offset+j,offset+j+4,offset+i+4));mats.append(1)
    if faces:
        mesh=bpy.data.meshes.new(name+'_canopy');mesh.from_pydata(vertices,[],faces)
        mesh.materials.append(glass);mesh.materials.append(frame)
        uv=mesh.uv_layers.new(name=o.data.uv_layers.active.name)
        for poly,mi in zip(mesh.polygons,mats):
            poly.material_index=mi
            for li in poly.loop_indices:uv.data[li].uv=[(0,0),(1,0),(1,1),(0,1)][mesh.loops[li].vertex_index%4]
        mesh.validate();mesh.update()
        canopy=bpy.data.objects.new(name+'_canopy',mesh);source.users_collection[0].objects.link(canopy)
        bpy.ops.object.select_all(action='DESELECT');o.select_set(True);canopy.select_set(True)
        bpy.context.view_layer.objects.active=o;bpy.ops.object.join()
    o.data.validate(clean_customdata=True);o.data.update();o.data.calc_loop_triangles()
    bpy.ops.export_scene.gltf(filepath=str(OUT/f'{name}.glb'),export_format='GLB',use_selection=True,export_yup=True,export_apply=True,export_image_format='AUTO')
    result['ships'].append({'name':name,'before':before,'after':len(o.data.loop_triangles),'fileBytes':(OUT/f'{name}.glb').stat().st_size})
(ROOT/'docs/ship-cleanup/candidate-stats.json').write_text(json.dumps(result,indent=2))
