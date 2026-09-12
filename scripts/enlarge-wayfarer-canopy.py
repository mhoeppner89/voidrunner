CANOPY_HULLS=['wayfarer']
"""Seat existing optimized canopies without changing the hull design.
Run through Blender MCP. Targets the optimized Wayfarer, Atlas and Lancer.
"""
import bpy,json,math
from pathlib import Path
from mathutils import Vector
ROOT=Path('/Users/mhoeppner/Desktop/Voidrunner')
OUT=ROOT/'.freebuff/canopy-symmetry';OUT.mkdir(parents=True,exist_ok=True)
collection=bpy.data.collections.get('Canopy_Seat_Fix') or bpy.data.collections.new('Canopy_Seat_Fix')
if not collection.users:bpy.context.scene.collection.children.link(collection)
HULLS=globals().get('CANOPY_HULLS',['wayfarer','atlas','lancer'])
for obj in list(collection.objects):
    if obj.name in ['Seated_'+name for name in HULLS]:bpy.data.objects.remove(obj,do_unlink=True)
result={'ships':[]}
for name in HULLS:
    bpy.ops.object.select_all(action='DESELECT')
    bpy.ops.import_scene.gltf(filepath=str(ROOT/'assets/models/ships'/f'{name}.glb'))
    obj=next(o for o in bpy.context.selected_objects if o.type=='MESH');obj.name='Seated_'+name
    for c in list(obj.users_collection):c.objects.unlink(obj)
    collection.objects.link(obj)
    me=obj.data
    # Rebuild the canopy around shared cross-section stations. Every roof
    # row and its two cheek panes use the same start/end X coordinates.
    import bmesh
    bm=bmesh.new();bm.from_mesh(me)
    canopy_materials={i for i,m in enumerate(me.materials) if m.name.startswith('VR_Canopy_')}
    old=[f for f in bm.faces if f.material_index in canopy_materials]
    bmesh.ops.delete(bm,geom=old,context='FACES')
    glass_index=next(i for i,m in enumerate(me.materials) if m.name.startswith('VR_Canopy_Glass'))
    frame_index=next(i for i,m in enumerate(me.materials) if m.name.startswith('VR_Canopy_Frame'))
    def section(x):
        t=(x-.740)/(.943-.740)
        return (.047+.004*t,.133-.090*t,.128-.020*t)
    perimeter_rims=[]
    def window(points):
        pts=[Vector(p) for p in points];center=sum(pts,Vector())/len(pts)
        normal=(pts[1]-pts[0]).cross(pts[2]-pts[0]).normalized()
        if normal.z<0:pts.reverse();normal=-normal
        # The cross-section profiles are linear, so each pane stays flat.
        pts=[p-normal*(p-center).dot(normal) for p in pts]
        outer=[bm.verts.new(p+normal*.001) for p in pts]
        inner=[bm.verts.new(center+(p-center)*.977+normal*.0012) for p in pts]
        face=bm.faces.new(inner);face.material_index=glass_index
        perimeter_rims.append(([v.co.copy() for v in outer],normal.copy()))
        for j in range(len(pts)):
            k=(j+1)%len(pts);face=bm.faces.new([outer[j],outer[k],inner[k],inner[j]]);face.material_index=frame_index
    for start,end in [(.740,.820),(.827,.878),(.885,.943)]:
        w0,z0,low0=section(start);w1,z1,low1=section(end)
        window([(start,-w0,z0),(start,w0,z0),(end,w1,z1),(end,-w1,z1)])
        for side in [-1,1]:
            points=[(start,side*(w0+.007),z0-.004),(end,side*(w1+.007),z1-.004)]
            if start<.88:points.append((end,side*low1,z1-.054))
            points.append((start,side*low0,z0-.054))
            window(points)
    bm.normal_update();bm.to_mesh(me);bm.free();me.update()
    glass_ids={i for i,m in enumerate(me.materials) if m.name.startswith('VR_Canopy_Glass')}
    frame_ids={i for i,m in enumerate(me.materials) if m.name.startswith('VR_Canopy_Frame')}
    glass_faces=[p for p in me.polygons if p.material_index in glass_ids]
    # Connected glass triangles form one planar window each.
    components=[]
    for p in glass_faces:
        ids=set(p.vertices);joined=[c for c in components if c & ids]
        for c in joined:ids|=c;components.remove(c)
        components.append(ids)
    hull_faces=[p for p in me.polygons if p.material_index not in glass_ids|frame_ids]
    # UV seams have separate vertex IDs at the same position. Move those
    # together without welding, so their texture coordinates stay intact.
    hull_ids={i for p in hull_faces for i in p.vertices}
    position_groups={}
    for i in hull_ids:
        key=tuple(round(x,6) for x in me.vertices[i].co)
        position_groups.setdefault(key,[]).append(i)
    seam_group={i:group for group in position_groups.values() for i in group}
    changed=set()
    def intersects(a,b):
        for poly in [a,b]:
            for i in range(len(poly)):
                edge=poly[(i+1)%len(poly)]-poly[i];axis=Vector((-edge.y,edge.x))
                pa=[p.dot(axis) for p in a];pb=[p.dot(axis) for p in b]
                if max(pa)<min(pb)-1e-8 or max(pb)<min(pa)-1e-8:return False
        return True
    for ids in components:
        points=[me.vertices[i].co.copy() for i in ids]
        center=sum(points,Vector())/len(points)
        normal=(points[1]-points[0]).cross(points[2]-points[0]).normalized()
        if normal.z<0:normal=-normal
        u=(points[0]-center).normalized();v=normal.cross(u).normalized()
        points.sort(key=lambda p:math.atan2((p-center).dot(v),(p-center).dot(u)))
        # Include the frame footprint, not just the smaller inset glass.
        panel=[Vector(((p-center).dot(u)/.977,(p-center).dot(v)/.977)) for p in points]
        for face in hull_faces:
            positions=[me.vertices[i].co for i in face.vertices]
            distances=[(p-center).dot(normal) for p in positions]
            if max(distances)<-.0015 or min(distances)>.04:continue
            projected=[Vector(((p-center).dot(u),(p-center).dot(v))) for p in positions]
            if not intersects(panel,projected):continue
            # The old pass moved vertices strictly inside the pane. Triangles
            # with vertices outside could still bridge across the glass. Move
            # all vertices of intersecting surface triangles below its plane.
            for i,d in zip(face.vertices,distances):
                if -.0015<d<.045:
                    # Distances may have changed through a coincident vertex
                    # earlier in this face. Recompute before moving the group.
                    distance=(me.vertices[i].co-center).dot(normal)
                    if distance<=-.0015:continue
                    displacement=normal*(distance+.0015)
                    for j in seam_group[i]:
                        me.vertices[j].co-=displacement;changed.add(j)
    # Eliminate sub-pixel asymmetry in exported glass/frame positions by using
    # exact mirrored pairs about local Y=0 (glTF Z=0).
    canopy_vertices={i for p in me.polygons if p.material_index in glass_ids|frame_ids for i in p.vertices}
    left=[i for i in canopy_vertices if me.vertices[i].co.y<-.000001]
    right=[i for i in canopy_vertices if me.vertices[i].co.y>.000001]
    max_error=0
    for i in left:
        p=me.vertices[i].co;mirror=Vector((p.x,-p.y,p.z))
        nearest=min(right,key=lambda k:(me.vertices[k].co-mirror).length_squared)
        error=(me.vertices[nearest].co-mirror).length;max_error=max(max_error,error)
        assert error<.0001,(name,'unexpected canopy mismatch',error)
        me.vertices[nearest].co=mirror
    for group in position_groups.values():
        assert all((me.vertices[j].co-me.vertices[group[0]].co).length<2e-6 for j in group), 'UV seam opened'
    me.update();me.validate(clean_customdata=False)
    # Build solid narrow frame returns that meet the actual hull. The old
    # flat frames had no thickness, exposing daylight wherever the hull dipped.
    # Sample both mirrored locations and embed both returns to the deeper hit,
    # preserving exact symmetry while following the original uneven surface.
    from mathutils.bvhtree import BVHTree
    hull_tree=BVHTree.FromPolygons([v.co.copy() for v in me.vertices],
        [list(f.vertices) for f in me.polygons if f.material_index not in glass_ids|frame_ids],all_triangles=False)
    bm=bmesh.new();bm.from_mesh(me);rim_depths=[]
    def seated_point(p,n):
        distances=[]
        for mirror in [False,True]:
            q=Vector((p.x,-p.y,p.z)) if mirror else p
            direction=Vector((n.x,-n.y,n.z)) if mirror else n
            hit,_,_,distance=hull_tree.ray_cast(q+direction*.0001,-direction,.16)
            assert hit is not None,('Frame misses hull',tuple(q))
            distances.append(distance)
        depth=max(distances)+.0005;rim_depths.append(depth)
        return p-n*depth
    for outline,normal in perimeter_rims:
        for j,a in enumerate(outline):
            b=outline[(j+1)%len(outline)]
            points=[a.lerp(b,k/12) for k in range(13)]
            tops=[bm.verts.new(p) for p in points]
            bases=[bm.verts.new(seated_point(p,normal)) for p in points]
            for k in range(12):
                f=bm.faces.new([tops[k],tops[k+1],bases[k+1],bases[k]]);f.material_index=frame_index
    bm.normal_update();bm.to_mesh(me);bm.free();me.update()
    bpy.ops.object.select_all(action='DESELECT');obj.select_set(True);bpy.context.view_layer.objects.active=obj
    bpy.ops.export_scene.gltf(filepath=str(OUT/f'{name}.glb'),export_format='GLB',use_selection=True,export_yup=True,export_apply=True,export_image_format='AUTO')
    result['ships'].append({'hull':name,'panes':len(components),'reseatedHullVertices':len(changed),'maxOriginalMirrorError':max_error,'maxFrameReturnDepth':max(rim_depths)})
report=ROOT/'docs/ship-cleanup/canopy-symmetry.json'
previous=json.loads(report.read_text()) if report.exists() else {'ships':[]}
previous['ships']=[r for r in previous['ships'] if r['hull'] not in HULLS]+result['ships']
report.write_text(json.dumps(previous,indent=2))
