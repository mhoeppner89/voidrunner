"""Blender source + closed low-poly GLBs and identical synchronous game meshes.
Game convention: nose -Z, tail +Z, origin at projectile center, game world units.
Run: Blender --background --factory-startup --python scripts/build-ordnance-models.py
"""
import bpy, math, json, random
from pathlib import Path
from mathutils import Matrix

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'assets/models/ordnance'
OUT.mkdir(parents=True, exist_ok=True)
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)

# Eight 128x16 strips: enamel panels, seams, fasteners, caution bars and vents.
colors = [(0.78,.81,.78),(.045,.09,.18),(.72,.48,.10),(.07,.64,.84),(.025,.035,.045),(.38,.43,.48),(.64,.16,.08),(.80,.83,.80)]
image = bpy.data.images.new('Concord ordnance atlas 128', width=128, height=128)
rng=random.Random(71)
pixels=[]
for y in range(128):
    strip=y//16; v=y%16
    for x in range(128):
        base=colors[strip]; shade=1+rng.uniform(-.04,.04)
        if v in [1,14] or x%32 in [1,30]: shade=.43
        if v in [3,12] and x%32 in [4,27]: shade=1.3
        if strip==4 and x%8 in [0,1]: shade=2.2
        if strip==2 and (x+v)//7%2: shade=.40
        if strip==7 and 34<x<91 and v in [6,7,8,9]: shade=.12
        pixels.extend([min(1,c*shade) for c in base]+[1])
image.pixels.foreach_set(pixels)
image.filepath_raw=str(OUT/'ordnance-atlas.png');image.file_format='PNG';image.save();image.pack()
material=bpy.data.materials.new('Concord ordnance · 128px');material.use_nodes=True
bsdf=material.node_tree.nodes.get('Principled BSDF');bsdf.inputs['Metallic'].default_value=.45;bsdf.inputs['Roughness'].default_value=.52
node=material.node_tree.nodes.new('ShaderNodeTexImage');node.image=image;node.interpolation='Closest'
material.node_tree.links.new(node.outputs['Color'],bsdf.inputs['Base Color'])
data={}; report={}
parts=[]
def finish(o, strip):
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    o.data.materials.clear();o.data.materials.append(material)
    uv=o.data.uv_layers.active
    if not uv: uv=o.data.uv_layers.new()
    for face in o.data.polygons:
        # Face-local projection keeps panel lines sharp on the small fins.
        axis=max(range(3),key=lambda k:abs(face.normal[k]));dims=[k for k in range(3) if k!=axis]
        coords=[o.data.vertices[o.data.loops[i].vertex_index].co for i in face.loop_indices]
        lo=[min(p[k] for p in coords) for k in dims];hi=[max(p[k] for p in coords) for k in dims]
        for i,p in zip(face.loop_indices,coords):
            u=(p[dims[0]]-lo[0])/max(1e-8,hi[0]-lo[0]);v=(p[dims[1]]-lo[1])/max(1e-8,hi[1]-lo[1])
            uv.data[i].uv=((3+u*122)/128,(strip*16+3+v*10)/128)
    parts.append(o)
def cylinder(name,z,r1,r2,depth,strip,vertices=8):
    bpy.ops.mesh.primitive_cone_add(vertices=vertices,radius1=r1,radius2=r2,depth=depth,location=(0,0,z))
    o=bpy.context.object;o.name=name;finish(o,strip)
def box(name,loc,size,strip):
    bpy.ops.mesh.primitive_cube_add(size=1,location=loc);o=bpy.context.object;o.name=name;o.scale=size;finish(o,strip)
def fin(name,z,radius,length,angle,strip):
    # Closed swept trapezoid, with root overlapping the body.
    points=[(.10,-length*.5),(radius,-length*.12),(radius,length*.5),(.10,length*.5)]
    verts=[(x,y,z+zz) for y in [-.025,.025] for x,zz in points]
    faces=[(3,2,1,0),(4,5,6,7),(0,1,5,4),(1,2,6,5),(2,3,7,6),(3,0,4,7)]
    mesh=bpy.data.meshes.new(name);mesh.from_pydata(verts,[],faces);mesh.update()
    o=bpy.data.objects.new(name,mesh);bpy.context.collection.objects.link(o)
    o.rotation_euler.z=angle;bpy.context.view_layer.objects.active=o;o.select_set(True);finish(o,strip);o.select_set(False)

for kind in ['seeker','shield-seeker','swarm','shield-swarm','torpedo']:
    parts=[]
    collection=bpy.data.collections.new(kind);bpy.context.scene.collection.children.link(collection)
    heavy=kind=='torpedo';micro=kind in ['swarm','shield-swarm'];shield=kind.startswith('shield-')
    length=3.8 if heavy else 1.45 if micro else 2.4
    radius=.34 if heavy else .12 if micro else .20
    cylinder('Armored motor casing',.10,radius,radius,length*.58,0 if not shield else 1)
    cylinder('Faceted warhead',-length*.30,radius*.70,radius*.99,length*.24,1 if not shield else 0)
    cylinder('Nose sensor',-length*.46,radius*.15,radius*.70,length*.12,5 if not shield else 3)
    cylinder('Warhead identification band',-length*.22,radius*1.04,radius*1.04,.10 if not micro else .05,3 if shield else 6 if micro else 2)
    cylinder('Motor collar',length*.33,radius*1.08,radius*1.08,length*.07,1)
    cylinder('Nozzle housing',length*.42,radius*.85,radius*.68,length*.12,5)
    cylinder('Recessed exhaust',length*.485,radius*.52,radius*.52,.02,4)
    for i in range(4):
        fin('Swept stabilizer '+str(i),length*.27,radius*(2.25 if not heavy else 1.9),length*.26,i*math.pi/2,1)
        if shield:
            angle=i*math.pi/2
            box('Ion induction strip '+str(i),(math.cos(angle)*radius,math.sin(angle)*radius,-.18),(.06,.06,.6),3)
    if heavy:
        for x in [-1,1]: box('Armored guidance rail',(x*.34,0,-.08),(.13,.16,1.15),1)
        cylinder('Shield emitter collar',.61,.365,.365,.12,3)
    for o in parts:
        for c in list(o.users_collection):c.objects.unlink(o)
        collection.objects.link(o)
    positions=[];normals=[];uvs=[]
    for o in parts:
        o.data.calc_loop_triangles();uv=o.data.uv_layers.active
        for tri in o.data.loop_triangles:
            n=o.matrix_world.to_3x3()@tri.normal;n.normalize()
            for li in tri.loops:
                p=o.matrix_world@o.data.vertices[o.data.loops[li].vertex_index].co
                positions.extend(round(c,6) for c in p);normals.extend(round(c,6) for c in n)
                uvs.extend(round(c,6) for c in uv.data[li].uv)
    triangles=len(positions)//9
    data[kind]={'positions':positions,'normals':normals,'uvs':uvs,'length':length,'radius':radius,'triangles':triangles}
    # Runtime -Z corresponds to Blender +Y after the standard glTF conversion.
    bpy.ops.object.select_all(action='DESELECT')
    conversion=Matrix.Rotation(math.pi/2,4,'X')
    # Merge export copies into one textured mesh / draw call. Keep editable parts.
    copies=[]
    for o in parts:
        copy=o.copy();copy.data=o.data.copy();collection.objects.link(copy)
        copy.matrix_world=conversion@o.matrix_world;copy.select_set(True);copies.append(copy)
    bpy.context.view_layer.objects.active=copies[0];bpy.ops.object.join()
    exported=bpy.context.object;exported.name=kind+'-ordnance'
    bpy.ops.export_scene.gltf(filepath=str(OUT/(kind+'.glb')),use_selection=True,export_format='GLB',export_yup=True,export_extras=True)
    report[kind]={'polygons':sum(len(o.data.polygons) for o in parts),'triangles':triangles,'length':length,'texture':'128 × 128 shared atlas','bytes':(OUT/(kind+'.glb')).stat().st_size}
    bpy.data.objects.remove(exported,do_unlink=True)

(ROOT/'src/game/ordnanceModelData.js').write_text('// Generated from Blender: scripts/build-ordnance-models.py\nexport const ORDNANCE_MODEL_DATA='+json.dumps(data,separators=(',',':'))+';\n')
(OUT/'manifest.json').write_text(json.dumps(report,indent=2))
bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'ordnance.blend'))
print(json.dumps(report))
