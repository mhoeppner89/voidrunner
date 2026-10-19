"""Shared offline station authoring tools. No runtime procedural geometry."""
from pathlib import Path
import bpy, math, json, random, struct
from mathutils import Vector
import numpy as np
ROOT = Path(__file__).resolve().parents[2]

def init(station_id, label, palette=None):
    global scene, rng, image, COLORS, M, parts
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.context.preferences.filepaths.save_version = 0
    scene = bpy.context.scene
    scene.name = label
    rng = random.Random(sum((i+1)*ord(c) for i,c in enumerate(station_id)))

    # Broad, quiet manufactured panels: no grain, dither or fine repeating scratches.
    image = bpy.data.images.new(station_id+' structural panels 1024', width=1024, height=1024)
    pixels = np.ones((1024, 1024, 4), dtype=np.float32)
    for row in range(8):
        for col in range(4):
            x, y = col * 256, row * 128
            tone = rng.choice([.87,.89,.91,.91,.91])
            pixels[y:y+128, x:x+256, :3] = tone
            pixels[y:y+2, x:x+256, :3] = .68
            pixels[y:y+128, x:x+2, :3] = .68
            pixels[y+3:y+5, x+4:x+252, :3] = min(1, tone+.04)
            if (row * 3 + col) % 7 == 0:
                pixels[y+38:y+92, x+152:x+232, :3] = tone * .95
    image.pixels.foreach_set(pixels.ravel())
    image.pack()

    COLORS = {
        'hull': (.24, .31, .37), 'armor': (.65, .65, .59),
        'metal': (.34, .40, .43), 'dark': (.028, .039, .049),
        'copper': (.39, .15, .072), 'ochre': (.72, .43, .09),
        'glass': (.025, .078, .10), 'warm': (.88, .58, .28),
        'cool': (.22, .66, .71), 'radiator': (.045, .075, .09),
    }
    COLORS.update(palette or {})
    M = {}
    for key, color in COLORS.items():
        m = bpy.data.materials.new(station_id+' · '+key)
        m.diffuse_color = (*color, 1)
        m.use_nodes = True
        p = m.node_tree.nodes.get('Principled BSDF')
        p.inputs['Base Color'].default_value = (*color, 1)
        p.inputs['Metallic'].default_value = .3 if key == 'armor' else .5
        p.inputs['Roughness'].default_value = .76
        if key in ['hull', 'armor', 'copper', 'ochre']:
            t = m.node_tree.nodes.new('ShaderNodeTexImage')
            t.image = image
            mix = m.node_tree.nodes.new('ShaderNodeMixRGB')
            mix.blend_type = 'MULTIPLY'
            mix.inputs[0].default_value = 1
            mix.inputs[2].default_value = (*color, 1)
            m.node_tree.links.new(t.outputs['Color'], mix.inputs[1])
            m.node_tree.links.new(mix.outputs[0], p.inputs['Base Color'])
        if key in ['warm', 'cool']:
            p.inputs['Emission Color'].default_value = (*color, 1)
            p.inputs['Emission Strength'].default_value = .65
            p.inputs['Metallic'].default_value = 0
        M[key] = m

    parts = []

def mesh(name, vertices, faces, material):
    data = bpy.data.meshes.new(name)
    data.from_pydata(vertices, [], faces)
    data.update()
    data.materials.append(M[material])
    obj = bpy.data.objects.new(name, data)
    scene.collection.objects.link(obj)
    parts.append(obj)
    return obj

def box(name, at, size, material='hull', yaw=0, chamfer=0):
    x, y, z = at
    w, d, h = (v/2 for v in size)
    if chamfer:
        c = min(chamfer, w*.4, d*.4)
        xy = [(-w+c,-d),(w-c,-d),(w,-d+c),(w,d-c),(w-c,d),(-w+c,d),(-w,d-c),(-w,-d+c)]
    else:
        xy = [(-w,-d),(w,-d),(w,d),(-w,d)]
    n = len(xy)
    co, si = math.cos(yaw), math.sin(yaw)
    vs = [(x+a*co-b*si, y+a*si+b*co, z+zz) for zz in [-h,h] for a,b in xy]
    fs = [tuple(reversed(range(n))), tuple(range(n,2*n))]
    fs += [(i,(i+1)%n,(i+1)%n+n,i+n) for i in range(n)]
    return mesh(name, vs, fs, material)

def beam(name, a, b, width, material='metal'):
    a, b = Vector(a), Vector(b)
    u = (b-a).normalized()
    v = u.cross(Vector((0,0,1)))
    if v.length < .01:
        v = u.cross(Vector((0,1,0)))
    v.normalize()
    w = u.cross(v).normalized()
    vs = [tuple(p+v*dv*width/2+w*dw*width/2) for p in [a,b] for dv,dw in [(-1,-1),(1,-1),(1,1),(-1,1)]]
    return mesh(name, vs, [(3,2,1,0),(4,5,6,7),(0,1,5,4),(1,2,6,5),(2,3,7,6),(3,0,4,7)], material)

def lathe(name, profile, material='hull', n=48, center=(0,0)):
    vs = [(center[0]+r*math.cos(i*math.tau/n), center[1]+r*math.sin(i*math.tau/n), z) for z,r in profile for i in range(n)]
    fs = [tuple(reversed(range(n))),tuple(range((len(profile)-1)*n,len(profile)*n))]
    for k in range(len(profile)-1):
        fs += [(k*n+i,k*n+(i+1)%n,(k+1)*n+(i+1)%n,(k+1)*n+i) for i in range(n)]
    return mesh(name, vs, fs, material)

def ring(name, r, width, z, height, material='armor', n=48, start=0, end=math.tau):
    full = abs(end-start-math.tau)<.001
    count = n if full else n+1
    vs = [(rr*math.cos(start+i*(end-start)/n),rr*math.sin(start+i*(end-start)/n),zz) for zz,rr in [(z-height/2,r-width/2),(z-height/2,r+width/2),(z+height/2,r-width/2),(z+height/2,r+width/2)] for i in range(count)]
    fs=[]
    for i in range(n):
        j=(i+1)%count
        fs += [(i,j,count+j,count+i),(2*count+i,3*count+i,3*count+j,2*count+j),(i,2*count+i,2*count+j,j),(count+i,count+j,3*count+j,3*count+i)]
    if not full:
        fs += [(0,count,3*count,2*count),(n,2*count+n,3*count+n,count+n)]
    return mesh(name,vs,fs,material)

def tube(name, points, radius=.2, material='metal', n=8):
    for k in range(len(points)-1):
        a,b=Vector(points[k]),Vector(points[k+1]);u=(b-a).normalized()
        v=u.cross(Vector((0,0,1)))
        if v.length<.01:v=u.cross(Vector((0,1,0)))
        v.normalize();w=u.cross(v).normalized()
        vs=[tuple(p+radius*(v*math.cos(i*math.tau/n)+w*math.sin(i*math.tau/n))) for p in [a,b] for i in range(n)]
        fs=[tuple(reversed(range(n))),tuple(range(n,2*n))]+[(i,(i+1)%n,(i+1)%n+n,i+n)for i in range(n)]
        mesh(name,vs,fs,material)

def text(name, words, at, size, material='armor'):
    curve=bpy.data.curves.new(name,'FONT');curve.body=words;curve.size=size;curve.align_x='CENTER';curve.extrude=.025;curve.resolution_u=2
    o=bpy.data.objects.new(name,curve);scene.collection.objects.link(o);o.location=at;o.rotation_euler.x=math.pi/2;curve.materials.append(M[material])
    bpy.context.view_layer.objects.active=o;o.select_set(True);bpy.ops.object.convert(target='MESH');o.select_set(False);parts.append(o)

def window_panes(name, panes, framed=True):
    """Flush framed glazing, batched by material; no boxes per window.

    A pane is (centre, horizontal tangent, outward normal, width, height).
    Vertical faces use Z up. Tangent cross Z must equal the outward normal.
    """
    batches={key:[] for key in ['dark','warm','glass','cool']}
    for i,(center,tangent,normal,w,h) in enumerate(panes):
        center,tangent,normal=Vector(center),Vector(tangent),Vector(normal)
        layers=([('dark',w+.055,h+.045,.022)] if framed else [])+[(
            'glass' if i%7 in [0,3] else 'cool' if i%13==5 else 'warm',w,h,.03)]
        for material,width,height,offset in layers:
            c=center+normal*offset
            batches[material].extend(tuple(c+tangent*dx+Vector((0,0,dz)))
                for dx,dz in [(-width/2,-height/2),(width/2,-height/2),(width/2,height/2),(-width/2,height/2)])
    for material,vertices in batches.items():
        if vertices:mesh(name+' windows · '+material,vertices,[tuple(range(i,i+4)) for i in range(0,len(vertices),4)],material)

def window_wall(name, center, tangent, normal, columns, rows, pitch=.8, row_pitch=.65, width=.38, height=.18):
    center,tangent=Vector(center),Vector(tangent)
    window_panes(name,[(center+tangent*((i-(columns-1)/2)*pitch)+Vector((0,0,j*row_pitch)),tangent,normal,width,height)
        for j in range(rows) for i in range(columns)])

def window_arc(name,radius,z,rows,n=48,center=(0,0),start=0,end=math.tau,inward=False,pitch=.85,row_pitch=.65):
    """Follow each actual polygon face, on either side of a pressure hull."""
    # Polygon vertices follow ring/lathe authoring exactly, including partial arcs.
    step=(end-start)/n;panes=[]
    for face in range(n):
        a=start+face*step;b=a+step;mid=(a+b)/2
        face_width=2*radius*math.sin(step/2)
        count=max(1,int((face_width-.12)/pitch))
        tangent=Vector((-math.sin(mid),math.cos(mid),0))*(-1 if inward else 1)
        normal=Vector((math.cos(mid),math.sin(mid),0))*(-1 if inward else 1)
        c=Vector((center[0]+radius*math.cos(step/2)*math.cos(mid),center[1]+radius*math.cos(step/2)*math.sin(mid),z))
        for row in range(rows):
            for i in range(count):panes.append((c+tangent*((i-(count-1)/2)*pitch)+Vector((0,0,row*row_pitch)),tangent,normal,.38,.18))
    window_panes(name,panes,framed=False)

def windows(radius,z,rows,name,n=48):
    window_arc(name,radius,z+.09,rows,n)

def tank(name, x,y,z,r,height):
    lathe(name,[(z-height/2,r*.68),(z-height/2+.5,r),(z+height/2-.5,r),(z+height/2,r*.68)],'copper',16,(x,y))
    for zz in [z-height*.32,z+height*.32]:
        o=ring(name+' collar',r+.07,.18,zz,.23,'metal',16);o.location.x=x;o.location.y=y
    tube(name+' bypass return',[(x+r,y,z),(x+r+.6,y,z),(x+r+.6,y,z-height/2-.8),(x,y,z-height/2-.8),(x,y,z-height/2+.1)],.13)

def container(name,x,y,z,w=1.05,d=2.5,h=1):
    box(name,(x,y,z+h/2),(w,d,h),'copper',chamfer=.09)
    for yy in [-d*.35,d*.35]:box(name+' bands',(x,y+yy,z+h/2),(w+.025,.07,h+.025),'metal')

# A crew door is about three window heights, not a ship-sized hangar portal.
CREW_DOOR_HEIGHT=.56
CREW_DOOR_WIDTH=.30

def crew_door(name,at,tangent,normal):
    """Small personnel airlock with proportional frame, leaves and controls."""
    at,t,n=Vector(at),Vector(tangent),Vector(normal)
    def piece(label,u,v,z,w,d,h,material):
        c=at+t*u+n*v+Vector((0,0,z))
        # Local X follows tangent and local -Y faces the normal.
        return box(name+' '+label,c,(w,d,h),material,yaw=math.atan2(t.y,t.x))
    def plate(label,u,v,z,w,h,material):
        c=at+t*u+n*v+Vector((0,0,z))
        return mesh(name+' '+label,[tuple(c+t*dx+Vector((0,0,dz))) for dx,dz in [(-w/2,-h/2),(w/2,-h/2),(w/2,h/2),(-w/2,h/2)]],[(0,1,2,3)],material)
    w,h=CREW_DOOR_WIDTH,CREW_DOOR_HEIGHT
    plate('recess',0,.018,h/2,w+.09,h+.04,'dark')
    for u in [-w/2-.022,w/2+.022]:piece('jamb',u,.015,h/2,.045,.09,h+.065,'metal')
    piece('header',0,.018,h+.025,w+.13,.10,.055,'armor')
    for u in [-w*.25,w*.25]:plate('pressure leaf',u,.04,h/2,w*.47,h-.025,'armor')
    plate('status lintel',0,.075,h+.026,w*.55,.018,'cool')
    piece('control',w/2+.085,.022,h*.55,.065,.08,.12,'metal')
    plate('control display',w/2+.085,.07,h*.59,.041,.044,'warm')

def block(name, at, size, material='hull', rows=3):
    """Occupied module with glazing on all four faces, seated roof and crew door."""
    x,y,z=at;w,d,h=size
    box(name,at,size,material,chamfer=min(.6,w*.07))
    box(name+' roof',(x,y,z+h/2+.18),(w+.5,d+.5,.4),'armor',chamfer=.25)
    for side in [-1,1]:
        box(name+' reinforced corner',(x+side*(w/2-.45),y-d/2-.06,z),(.3,.3,h-.5),'metal')
    crew_door(name+' crew airlock',(x,y-d/2,z-h/2),(1,0,0),(0,-1,0))
    # Keep the original storey pitch and window size. Add side/rear glazing
    # without quadrupling the old individual twelve-triangle window boxes.
    for dx,dy,t,n,span in [(0,-d/2,(1,0,0),(0,-1,0),w),(0,d/2,(-1,0,0),(0,1,0),w),
            (w/2,0,(0,1,0),(1,0,0),d),(-w/2,0,(0,-1,0),(-1,0,0),d)]:
        count=max(1,int((span-1.6)/.9))
        window_wall(name,(x+dx,y+dy,z-h/2+.92),t,n,count,min(rows,max(1,int((h-1.25)/.65))),pitch=.9)

def truss(name,a,b,width=2):
    a,b=Vector(a),Vector(b);u=(b-a).normalized();v=u.cross(Vector((0,0,1)))
    if v.length<.01:v=u.cross(Vector((0,1,0)))
    v.normalize();v*=width*.5
    for side in [-1,1]:beam(name+' chord',a+v*side,b+v*side,.4)
    count=max(2,int((b-a).length/3))
    for i in range(count):
        p=a.lerp(b,i/count);q=a.lerp(b,(i+1)/count)
        beam(name+' diagonal',p+v*(1 if i%2 else -1),q-v*(1 if i%2 else -1),.22)
    for p in [a,b]:beam(name+' end frame',p-v,p+v,.4)

def radiator(name,a,b,height=12):
    """A solid cooling panel with attached plumbing and a connected spar."""
    a,b=Vector(a),Vector(b);truss(name+' root',a,b,1.8)
    # Axially aligned panel seated on the end of the spar.
    x,y,z=b
    box(name+' thermal plate',(x,y,z),(.55,12,height),'radiator')
    for yy in [-5.7,5.7]:box(name+' manifold',(x,y+yy,z),(.85,.6,height+.4),'metal')
    for zz in range(int(-height/2+1),int(height/2),2):box(name+' rib',(x,y,z+zz),(.85,11.4,.15),'metal')
    tube(name+' coolant',[a, b],.18,'copper')

def dish(name,at,r=7):
    x,y,z=at;vs=[(x,y,z)]
    for rr in [r*.5,r]:vs += [(x+rr*math.cos(i*math.tau/24),y+rr*math.sin(i*math.tau/24),z+(rr/r)**2*r*.3)for i in range(24)]
    fs=[(0,1+i,1+(i+1)%24)for i in range(24)]+[(1+i,25+i,25+(i+1)%24,1+(i+1)%24)for i in range(24)]
    o=mesh(name,vs,fs,'armor');bpy.context.view_layer.objects.active=o;o.select_set(True)
    mod=o.modifiers.new('Solid reflector shell','SOLIDIFY');mod.thickness=.22;bpy.ops.object.modifier_apply(modifier=mod.name);o.select_set(False)
    for i in range(3):
        a=i*math.tau/3;beam(name+' feed strut',(x+r*.85*math.cos(a),y+r*.85*math.sin(a),z+r*.22),(x,y,z+r*.6),.16)

def berth(name,x,y,z,width=4.2,depth=10,height=3.4,closed=True):
    """Small service bay: front -Y, rear at y+depth/2. All fixtures touch structure."""
    front=y-depth/2;back=y+depth/2
    box(name+' deck',(x,y,z-.45),(width+2,depth,.9),'hull',chamfer=.25)
    box(name+' apron',(x,front-2,z-.45),(width+2,4,.9),'metal',chamfer=.25)
    for side in [-1,1]:
        xx=x+side*(width/2+.3)
        if closed:box(name+' side pressure wall',(xx,y,z+height/2),(.6,depth,height),'hull')
        box(name+' jamb',(xx,front+.4,z+height/2),(.8,.8,height),'armor')
        box(name+' guidance lamp',(xx,front-.025,z+height*.5),(.16,.08,height*.55),'cool')
        box(name+' deck stripe',(x+side*(width/2-.35),y-1,z+.025),(.065,depth-2,.05),'ochre')
        for yy in [front-3,front-1]:box(name+' inset apron lamp',(xx,yy,z+.035),(.13,.3,.07),'cool')
        # Apron ribs root in the pressure wall; no suspended deck outside the terminal.
        beam(name+' apron knee',(xx,front-3.7,z-.7),(xx,back,z-2.4),.45)
    box(name+' rear workshop',(x,back-.35,z+height/2),(width+1.2,.7,height),'hull')
    if closed:
        box(name+' roof',(x,y,z+height+.3),(width+2,depth,.6),'armor',chamfer=.25)
        for yy in [front+2,back-2]:box(name+' ceiling light',(x,yy,z+height-.035),(1.1,.16,.09),'warm')
    else:
        beam(name+' gantry',(x-width/2-.3,front+.4,z+height),(x+width/2+.3,front+.4,z+height),.6,'ochre')
    crew_door(name+' rear crew airlock',(x,back-.7,z),(1,0,0),(0,-1,0))
    return [x,y,z,width-.4,depth*.7]

def structural_audit():
    """Conservative authoring check for wholly detached groups, ignoring window sheets.

    AABB connectivity is a diagnostic, not the runtime collision model. Thin
    surface fixtures may not bridge unrelated structures with their broad bounds.
    """
    bpy.context.view_layer.update();bounds=[]
    for o in parts:
        pts=[o.matrix_world@Vector(v)for v in o.bound_box]
        bounds.append((np.array([min(p[k]for p in pts)for k in range(3)]),np.array([max(p[k]for p in pts)for k in range(3)])))
    lo=np.array([b[0]for b in bounds]);hi=np.array([b[1]for b in bounds]);parent=list(range(len(parts)))
    def find(i):
        while parent[i]!=i:parent[i]=parent[parent[i]];i=parent[i]
        return i
    for i,o in enumerate(parts):
        if 'windows' in o.name.lower():continue
        candidates=np.where(np.all(hi>=lo[i]-.06,axis=1)&np.all(lo<=hi[i]+.06,axis=1))[0]
        for j in candidates:
            if 'windows' in parts[j].name.lower():continue
            parent[find(int(j))]=find(i)
    groups={}
    for i,o in enumerate(parts):
        if 'windows' in o.name.lower():continue
        groups.setdefault(find(i),[]).append(i)
    main=max(groups.values(),key=len)
    detached=[]
    for indices in groups.values():
        if indices is main:continue
        span=np.max(hi[indices],axis=0)-np.min(lo[indices],axis=0)
        detached.append({'parts':[parts[i].name for i in indices],'span':span.tolist()})
    return detached

def seat_windows():
    """Discard panes across carved openings or hidden behind another component.

    The nearest solid face must support each pane centre. Windows never act
    as structural bridges and stay out of empty hangar entrances.
    """
    from mathutils.bvhtree import BVHTree
    bpy.context.view_layer.update();verts=[];faces=[]
    for o in parts:
        if 'windows' in o.name.lower():continue
        offset=len(verts);verts.extend(o.matrix_world@v.co for v in o.data.vertices)
        faces.extend(tuple(offset+i for i in p.vertices) for p in o.data.polygons)
    tree=BVHTree.FromPolygons(verts,faces);kept=removed=0;directions=[0]*4
    for o in parts:
        if 'windows' not in o.name.lower():continue
        accepted=[]
        for p in o.data.polygons:
            c=o.matrix_world@p.center;n=o.matrix_world.to_3x3()@p.normal
            hit,normal,idx,d=tree.find_nearest(c,.075)
            if hit is None or n.dot(normal)<.65:removed+=1;continue
            accepted.append(tuple(p.vertices));kept+=1
            axis=0 if abs(n.x)>abs(n.y) else 1
            directions[axis*2+(1 if n[axis]>0 else 0)]+=1
        data=bpy.data.meshes.new(o.name+' supported');data.from_pydata([v.co for v in o.data.vertices],[],accepted)
        data.materials.append(o.data.materials[0]);o.data=data
    return {'supportedFaces':kept,'discardedFaces':removed,'facadeFaces':directions,'maxStandOff':.075}

def export_model(station_id, metadata, description):
    source=ROOT/'authoring/models/stations'/station_id;source.mkdir(parents=True,exist_ok=True)
    window_support=seat_windows()
    bpy.context.view_layer.update()
    for o in parts:
        uv=o.data.uv_layers.new(name='Physical structural panels')
        for p in o.data.polygons:
            axis=max(range(3),key=lambda k:abs(p.normal[k]));axes=[k for k in range(3)if k!=axis]
            for li in p.loop_indices:
                v=o.matrix_world@o.data.vertices[o.data.loops[li].vertex_index].co
                uv.data[li].uv=(v[axes[0]]/14,v[axes[1]]/14)
    radius=max((o.matrix_world@v.co).length for o in parts for v in o.data.vertices)
    detached=structural_audit()
    assert not detached,[(g['parts'][0],len(g['parts']))for g in detached]
    scene['source_radius']=radius;scene['description']=description;scene['shipping_triangle_budget']=40000
    bpy.ops.wm.save_as_mainfile(filepath=str(source/(station_id+'.blend')))
    from station_surface_cleanup import clean
    copies=[]
    for o in parts:
        c=o.copy();c.data=o.data.copy();scene.collection.objects.link(c);copies.append(c)
        o.hide_render=True;o.hide_set(True)
    cleanup=clean(copies)
    batches={key:[o for o in copies if o.data.materials[0]==M[key]and len(o.data.polygons)]for key in M}
    for key,group in batches.items():
        if not group:continue
        bpy.ops.object.select_all(action='DESELECT')
        for c in group:c.select_set(True)
        bpy.context.view_layer.objects.active=c;bpy.ops.object.join();c.name=station_id+' / '+key
        c.location*=100/radius;c.scale*=100/radius
    bpy.ops.object.select_all(action='DESELECT')
    for o in scene.objects:
        if o.type=='MESH'and not o.hide_render:o.select_set(True)
    path=ROOT/'assets/models/stations'/(station_id+'.glb')
    bpy.ops.export_scene.gltf(filepath=str(path),export_format='GLB',use_selection=True,export_yup=True,export_extras=False,export_materials='EXPORT',export_cameras=False,export_lights=False)
    raw=path.read_bytes();jl=struct.unpack_from('<I',raw,12)[0];doc=json.loads(raw[20:20+jl]);binary=raw[20+jl+8:]
    for material in doc['materials']:
        key=material['name'].split(' · ')[-1]
        if key in COLORS:material.setdefault('pbrMetallicRoughness',{})['baseColorFactor']=[*COLORS[key],1]
        if key in ['warm','cool','glass','ochre']:material['extras']={'voidSurfaceOverlay':True}
    from station_occlusion import bake
    binary,occlusion=bake(doc,binary)
    from station_pack import pack
    binary,packing=pack(doc,binary)
    encoded=json.dumps(doc,separators=(',',':')).encode();encoded+=b' '*((-len(encoded))%4)
    body=struct.pack('<I4s',len(encoded),b'JSON')+encoded+struct.pack('<I4s',len(binary),b'BIN\0')+binary
    path.write_bytes(struct.pack('<4sII',b'glTF',2,12+len(body))+body)
    triangles=sum(doc['accessors'][p['indices']]['count']//3 for m in doc['meshes']for p in m['primitives'])
    assert triangles<=40000,(station_id,triangles)
    report={'id':station_id,'sourceRadius':radius,'triangles':triangles,'materials':len(doc['materials']),'bytes':path.stat().st_size,'sourceParts':len(parts),'detachedGroups':detached,'description':description,'windowSupport':window_support,'surfaceCleanup':cleanup,'contactOcclusion':occlusion,'packing':packing,**metadata}
    (source/'model-report.json').write_text(json.dumps(report,indent=2)+'\n')
    print('STATION_REPORT '+json.dumps(report),flush=True)
