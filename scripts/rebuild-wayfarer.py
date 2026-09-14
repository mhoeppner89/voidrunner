"""Author the Wayfarer from its reference through Blender MCP.
Clean hard-surface meshes; no inherited photogrammetry geometry or UVs.
Coordinates: +X nose, +/-Y sides, +Z dorsal. Native glTF Y-up export.
"""
import bpy, math, json
import numpy as np
from pathlib import Path
from mathutils import Vector, Matrix
ROOT=Path('/Users/mhoeppner/Desktop/Voidrunner')
OUT=ROOT/'.freebuff/wayfarer-rebuild';OUT.mkdir(parents=True,exist_ok=True)
if not bpy.data.objects.get('SourceTexture_wayfarer'):
    bpy.ops.object.select_all(action='DESELECT')
    bpy.ops.import_scene.gltf(filepath=str(ROOT/'glb_models/ships/wayfarer.glb'))
    source=next(o for o in bpy.context.selected_objects if o.type=='MESH');source.name='SourceTexture_wayfarer'
collection=bpy.data.collections.get('Wayfarer_Rebuild')
if collection:
    for o in list(collection.objects):bpy.data.objects.remove(o,do_unlink=True)
else:
    collection=bpy.data.collections.new('Wayfarer_Rebuild');bpy.context.scene.collection.children.link(collection)
parts=[]
# Shared original 1024px paint finish. Fine grain and sparse paint scuffs only;
# panel edges, stripes, windows, vents and lettering are explicitly authored.
image=bpy.data.images.get('WF_Paint_Finish') or bpy.data.images.new('WF_Paint_Finish',1024,1024)
rng=np.random.default_rng(731)
grain=rng.normal(0,.007,(1024,1024));tone=np.clip(.94+grain,.88,1)
for _ in range(130):
    x,y=rng.integers(8,1016,2);length=int(rng.integers(2,13))
    tone[y:y+1,x:min(1024,x+length)]-=rng.uniform(.07,.16)
pixels=np.ones((1024,1024,4),np.float32);pixels[:,:,:3]=tone[:,:,None]
image.pixels.foreach_set(pixels.ravel());image.pack()
def mat(name,color,metal,rough,paint=False,emission=0):
    m=bpy.data.materials.get(name) or bpy.data.materials.new(name);m.use_nodes=True;m.use_backface_culling=True
    n=m.node_tree.nodes;n.clear();out=n.new('ShaderNodeOutputMaterial');bs=n.new('ShaderNodeBsdfPrincipled')
    bs.inputs['Base Color'].default_value=(*color,1);bs.inputs['Metallic'].default_value=metal;bs.inputs['Roughness'].default_value=rough
    if emission:
        bs.inputs['Emission Color'].default_value=(*color,1);bs.inputs['Emission Strength'].default_value=emission
    if paint:
        # glTF multiplies the neutral finish map by the material base factor.
        tex=n.new('ShaderNodeTexImage');tex.image=image
        mix=n.new('ShaderNodeMixRGB');mix.blend_type='MULTIPLY';mix.inputs[0].default_value=1;mix.inputs[2].default_value=(*color,1)
        m.node_tree.links.new(tex.outputs['Color'],mix.inputs[1]);m.node_tree.links.new(mix.outputs[0],bs.inputs['Base Color'])
    m.node_tree.links.new(bs.outputs[0],out.inputs[0]);return m
ivory=mat('WF_Ivory_Paint',(.66,.61,.48),.32,.36,True)
navy=mat('WF_Navy_Paint',(.025,.065,.105),.38,.32,True)
yellow=mat('WF_Safety_Ochre',(.88,.48,.055),.25,.37,True)
rust=mat('WF_Tank_Terracotta',(.38,.09,.037),.48,.37,True)
steel=mat('WF_Brushed_Steel',(.23,.27,.29),.84,.26)
dark=mat('WF_Recesses',(.012,.019,.025),.3,.53)
glass=mat('VR_Canopy_Glass',(.025,.07,.10),.68,.12)
frame=mat('VR_Canopy_Frame',(.30,.33,.33),.8,.25)
light=mat('WF_Lamps',(.65,.86,1),.1,.18,emission=2)
engine=mat('WF_Engine_Core',(.08,.32,.48),.45,.25,.0,1.4)
def register(o,name,material):
    o.name=name
    for c in list(o.users_collection):c.objects.unlink(o)
    collection.objects.link(o)
    if material:o.data.materials.append(material)
    parts.append(o);return o

def finish(o,bevel=0,segments=1,smooth=False):
    bpy.context.view_layer.objects.active=o
    if bevel:
        mod=o.modifiers.new('Machined edge bevel','BEVEL');mod.width=bevel;mod.segments=segments
        bpy.ops.object.modifier_apply(modifier=mod.name)
    for p in o.data.polygons:p.use_smooth=smooth or bool(bevel)
    if hasattr(o.data,'set_sharp_from_angle'):o.data.set_sharp_from_angle(angle=math.radians(45))
    if bevel:
        mod=o.modifiers.new('Face weighted normals','WEIGHTED_NORMAL');mod.keep_sharp=True;mod.weight=50
        bpy.ops.object.modifier_apply(modifier=mod.name)
    return o

def box(name,loc,size,material,bevel=.004):
    bpy.ops.mesh.primitive_cube_add(size=1,location=loc);o=bpy.context.object;o.scale=size
    bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
    register(o,name,material);return finish(o,min(bevel,min(size)*.22))

def cyl(name,loc,radius,depth,material,axis=(1,0,0),sides=16,bevel=.002):
    bpy.ops.mesh.primitive_cylinder_add(vertices=sides,radius=radius,depth=depth,location=loc)
    o=bpy.context.object;o.rotation_mode='QUATERNION';o.rotation_quaternion=Vector((0,0,1)).rotation_difference(Vector(axis))
    register(o,name,material);return finish(o,min(bevel,depth*.15),smooth=True)

def beam(name,a,b,radius,material,sides=8):
    a,b=Vector(a),Vector(b);return cyl(name,(a+b)/2,radius,(b-a).length,material,(b-a).normalized(),sides,0)

def mesh(name,verts,faces,material):
    me=bpy.data.meshes.new(name);me.from_pydata(verts,[],faces);me.update()
    o=bpy.data.objects.new(name,me);collection.objects.link(o);parts.append(o)
    if material:me.materials.append(material)
    return o

def pane(name,pts):
    pts=[Vector(p) for p in pts];normal=(pts[1]-pts[0]).cross(pts[2]-pts[0]).normalized()
    if normal.z<0:pts.reverse();normal=-normal
    center=sum(pts,Vector())/4
    # Three rings: raised frame, inner bevel, recessed glass. No overlay sheet.
    rings=[pts,[center+(p-center)*.88 for p in pts],[center+(p-center)*.84-normal*.003 for p in pts]]
    verts=[tuple(p) for ring in rings for p in ring];faces=[]
    for r in range(2):
        for i in range(4):j=(i+1)%4;faces.append((r*4+i,r*4+j,(r+1)*4+j,(r+1)*4+i))
    o=mesh(name+' surround',verts,faces,ivory)
    o.data.materials.append(frame)
    for p in o.data.polygons:p.material_index=0 if p.index<4 else 1
    mesh(name+' glass',[tuple(p) for p in rings[-1]],[(0,1,2,3)],glass)

# Cabin shell with explicit roof shoulders. Canopy occupies the roof/shoulder
# faces of the forward stations; those faces are replaced, never overdrawn.
stations=[(.27,.19,.23,.125,-.27,.13),(.48,.215,.23,.12,-.27,.14),(.65,.205,.215,.105,-.25,.10),(.71,.198,.181,.077,-.239,.108),(.80,.188,.131,.037,-.223,.12),(.875,.180,.089,.012,-.204,.112),(.925,.174,.061,-.005,-.19,.105),(.985,.148,.015,-.015,-.158,.10)]
def section(s):
    x,w,top,cheek,bottom,rw=s
    return [(x,-rw,top),(x,rw,top),(x,w,cheek),(x,w,bottom+.032),(x,w-.03,bottom),(x,-w+.03,bottom),(x,-w,bottom+.032),(x,-w,cheek)]
verts=[p for s in stations for p in section(s)];faces=[tuple(range(8))]
for k in range(len(stations)-1):
    a,b=section(stations[k]),section(stations[k+1])
    for i in range(8):
        j=(i+1)%8
        points=[a[i],b[i],b[j],a[j]]
        if stations[k][0]>=.71 and stations[k+1][0]<=.925 and (i==0 or (i in (1,7) and stations[k][0]<.875)):
            if i==0:
                # Central spine divides each roof station into two panes.
                mid0=(a[i][0],0,a[i][2]);mid1=(b[i][0],0,b[i][2])
                pane('Canopy roof', [a[i],b[i],mid1,mid0]);pane('Canopy roof',[mid0,mid1,b[j],a[j]])
            else:pane('Canopy cheek',points)
        else:faces.append((k*8+i,(k+1)*8+i,(k+1)*8+j,k*8+j))
faces.append(tuple((len(stations)-1)*8+i for i in range(7,-1,-1)))
cabin=mesh('Pressure cabin',verts,faces,ivory)
finish(cabin,.003,segments=2)
def cabin_width(x):
    for a,b in zip(stations,stations[1:]):
        if a[0]<=x<=b[0]:return a[1]+(b[1]-a[1])*(x-a[0])/(b[0]-a[0])
    return stations[0][1]
# Armor seam lines follow the cabin's broad side faces.
for side in (-1,1):
    for x,w,top,cheek,bottom,rw in stations[1:4]:
        beam('Cabin panel joint',(x,side*(w+.0007),cheek-.015),(x,side*(w+.0007),bottom+.038),.0012,dark,6)
    for x in [.34,.48,.60]:
        w=cabin_width(x)
        for z in [-.20,.087]:cyl('Flush armor fastener',(x,side*(w+.001),z),.004,.002,steel,(0,side,0),8,0)
    for a,b in [(.29,.48),(.48,.64)]:
        mesh('Navy cabin belt',[(a,side*(cabin_width(a)+.0015),.078),(b,side*(cabin_width(b)+.0015),.078),(b,side*(cabin_width(b)+.0015),.018),(a,side*(cabin_width(a)+.0015),.018)],[(0,1,2,3) if side==1 else (3,2,1,0)],navy)
    # Navy rectangular side armor on the rear half; front hull stays tapered.
    box('Lower navy armor',(.43,side*.213,-.138),(.275,.012,.118),navy,.004)
    box('Side equipment locker',(.205,side*.211,-.035),(.20,.059,.16),navy,.008)
    box('Locker belt',(.205,side*.244,-.073),(.19,.004,.013),ivory,.001)
    for x in [.133,.277]:box('Locker latch',(x,side*.248,-.02),(.016,.007,.027),steel,.002)
    box('Cabin vent housing',(.42,side*.22,.125),(.085,.011,.045),steel,.003)
    box('Cabin vent recess',(.42,side*.228,.125),(.072,.003,.034),dark,.001)
    for x in np.linspace(.390,.450,7):box('Vent slat',(float(x),side*.232,.125),(.003,.004,.029),steel,0)
    box('Lower service grille',(.59,side*.214,-.188),(.12,.008,.040),dark,.001)
    for x in np.linspace(.54,.64,10):box('Service grille slat',(float(x),side*.220,-.188),(.004,.004,.033),steel,0)
    # Flat, sharp legible lettering: geometry avoids dependence on photo UVs.
    def label(body,x,z,size,material):
        curve=bpy.data.curves.new('Registration','FONT');curve.body=body;curve.size=size;curve.extrude=0;curve.offset=.00045;curve.resolution_u=1
        o=bpy.data.objects.new(body,curve);collection.objects.link(o)
        o.location=(x,side*(.215-.0588235*(x-.48)+.006),z)
        direction=1 if side==-1 else -1
        right=Vector((direction,-side*.0588235*direction,0)).normalized();up=Vector((0,0,1));normal=right.cross(up)
        o.rotation_mode='QUATERNION';o.rotation_quaternion=Matrix((right,up,normal)).transposed().to_quaternion()
        curve.materials.append(material);bpy.ops.object.select_all(action='DESELECT');o.select_set(True);bpy.context.view_layer.objects.active=o;bpy.ops.object.convert(target='MESH');parts.append(o)
    label('WAYFARER',.49 if side==-1 else .69,-.052,.037,navy)
    label('VR-07 / UTILITY',.50 if side==-1 else .68,-.079,.011,navy)
    # Painted warning chevron beside the name.
    y=side*.226
    mesh('Ochre direction chevron',[(x,side*(cabin_width(x)+.006),z) for x,z in [(.735,-.037),(.787,-.062),(.735,-.087)]],[(2,1,0) if side==-1 else (0,1,2)],yellow)

# Long structural spine, open cage and three distinct tank levels.
box('Central keel',(-.13,0,-.105),(.93,.095,.18),dark,.009)
for z,r,paint in [(.165,.108,rust),(-.04,.12,ivory),(-.215,.075,navy)]:
    cyl('Cargo pressure vessel',(-.10,0,z),r,.68,paint,sides=20,bevel=.009)
    for x in [-.40,-.15,.18]:cyl('Tank retaining hoop',(x,0,z),r+.004,.024,steel,sides=20,bevel=.001)
    for x in [-.443,.243]:cyl('Tank end dome',(x,0,z),r*.78,.018,dark,sides=16,bevel=.003)
# Side pipes reveal the industrial structure from either side.
for side in (-1,1):
    for z in [.284,-.164,-.30]:
        beam('Longitudinal pipe',(-.57,side*.143,z),(.32,side*.143,z),.009,steel,10)
        for x in [-.52,-.29,-.03,.24]:cyl('Pipe coupling',(x,side*.143,z),.012,.022,dark,sides=10,bevel=.001)
    for x in [-.42,.10]:
        beam('Cage upright',(x,side*.165,-.295),(x,side*.165,.285),.012,steel)
    beam('Upper diagonal brace',(-.42,side*.165,-.02),(-.15,side*.165,.28),.012,steel)
    beam('Lower diagonal brace',(-.42,side*.165,-.29),(-.15,side*.165,-.06),.012,steel)
    box('Aft blue service box',(-.43,side*.18,-.015),(.075,.06,.185),navy,.005)
    for z in [-.07,.04]:box('Service box latch',(-.43,side*.215,z),(.026,.007,.012),yellow,.001)
    box('Forward battery chest',(.23,side*.119,.191),(.115,.088,.09),yellow,.005)
    for x in [.192,.27]:box('Battery latch',(x,side*.166,.19),(.012,.006,.027),steel,.001)
    # Rigid bent coolant lines, readable at gameplay distances.
    points=[(-.56,side*.12,.12),(-.48,side*.13,.26),(-.27,side*.13,.30),(.20,side*.13,.30),(.30,side*.13,.22)]
    for a,b in zip(points,points[1:]):beam('Upper coolant line',a,b,.010,dark,10)

# Two vertical engine nacelles, faceted hard-surface shells with smooth barrels.
# Each radial ring has a different material/diameter for manufactured layering.
for z in (-.207,.207):
    beam('Engine yoke',(-.63,0,z*.8),(-.44,0,z*.72),.065,steel,12)
    rings=[(-.997,.138,steel),(-.982,.166,navy),(-.91,.174,navy),(-.69,.174,navy),(-.66,.174,yellow),(-.63,.174,ivory),(-.51,.16,ivory),(-.475,.13,steel)]
    n=16;v=[]
    for x,r,m in rings:
        for i in range(n):
            a=2*math.pi*(i+.5)/n;v.append((x,math.sin(a)*r,z+math.cos(a)*r))
    fs=[];mi=[];materials=[navy,ivory,yellow,steel]
    for j in range(len(rings)-1):
        for i in range(n):fs.append((j*n+i,(j+1)*n+i,(j+1)*n+(i+1)%n,j*n+(i+1)%n));mi.append(materials.index(rings[j+1][2]))
    o=mesh('Engine nacelle shell',v,fs,None)
    for m in materials:o.data.materials.append(m)
    for p,i in zip(o.data.polygons,mi):p.material_index=i;p.use_smooth=True
    o.data.set_sharp_from_angle(angle=math.radians(30))
    for x in [-.978,-.89,-.76,-.63,-.515]:cyl('Nacelle armor seam',(x,0,z),.1745 if -.92<x<-.63 else .166,.004,steel,sides=16,bevel=0)
    # Dark recessed rear nozzle, bright innermost throat, metallic rings.
    cyl('Engine nozzle outer',(-.999,0,z),.132,.012,steel,sides=20,bevel=.002)
    cyl('Engine nozzle recess',(-1.006,0,z),.115,.003,dark,sides=20,bevel=0)
    cyl('Exhaust glow throat',(-1.008,0,z),.074,.002,engine,sides=20,bevel=0)
    for side in (-1,1):
        box('Engine access panel',(-.565,side*.157,z),(.060,.012,.06),steel,.003)
        box('Engine panel inset',(-.565,side*.165,z),(.041,.003,.036),dark,.001)
        for x in [-.91,-.80,-.69]:
            for zz in [z-.08,z+.08]:cyl('Nacelle rivet',(x,side*.157,zz),.0035,.004,steel,(0,side,0),8,0)

# Roof electronics, mast and turret foundation behind the canopy.
box('Dorsal equipment plinth',(.43,0,.247),(.25,.14,.035),navy,.006)
box('Turret foundation',(.48,0,.2605),(.115,.095,.025),steel,.004)
# Mast deliberately sits aft of the turret anchor; canopy starts at x=.65.
cyl('Antenna socket',(.35,.025,.294),.024,.035,steel,(0,0,1),12)
beam('Radio mast',(.35,.025,.307),(.35,.025,.384),.004,steel,8)
beam('Radio whip',(.323,.062,.284),(.323,.062,.367),.0025,dark,6)
cyl('Communications dish',(.37,-.077,.308),.028,.008,steel,(.65,-.3,.7),16,.001)
box('Forward roof avionics',(.575,0,.246),(.11,.084,.036),ivory,.004)
box('Roof avionics inset',(.577,0,.267),(.076,.050,.005),dark,.001)
# Nose docking collar and symmetrical headlamp modules.
box('Forward navy armor plate',(.992,0,-.071),(.009,.275,.13),navy,.003)
cyl('Nose collar',(.992,0,-.075),.074,.022,steel,sides=20,bevel=.003)
cyl('Nose collar inset',(1.005,0,-.075),.057,.005,dark,sides=20,bevel=0)
cyl('Docking optical lens',(1.009,0,-.075),.034,.006,glass,sides=16,bevel=.002)
for side in (-1,1):
    box('Headlamp casing',(.994,side*.103,-.048),(.025,.042,.038),navy,.004)
    for y in [side*.094,side*.111]:box('Headlamp glass',(1.009,y,-.048),(.003,.011,.015),light,.001)
    beam('Lower nose guard',(.72,side*.158,-.24),(.97,side*.139,-.195),.009,steel,8)
# Aft bridge connects the stacked engine pods.
box('Aft nacelle bridge',(-.74,0,0),(.16,.07,.11),steel,.006)

# Reference-detail pass: layered pressure-cabin armor and dense service hardware.
def surface_y(x,z):
    for a,b in zip(stations,stations[1:]):
        if a[0]<=x<=b[0]:
            t=(x-a[0])/(b[0]-a[0]);_,w,top,cheek,bottom,rw=[u+(v-u)*t for u,v in zip(a,b)]
            return w if z<=cheek else rw+(w-rw)*(top-z)/(top-cheek)
    return cabin_width(x)
def armor_panel(name,points,paint,normal):
    normal=Vector(normal);ps=[Vector(p) for p in points];center=sum(ps,Vector())/4
    # Raised planar armor with a narrow visible bevel and recessed perimeter.
    rings=[[p+normal*.001 for p in ps],[center+(p-center)*.955+normal*.003 for p in ps]]
    verts=[tuple(p) for ring in rings for p in ring]
    fs=[(4,5,6,7)]+[(i,(i+1)%4,(i+1)%4+4,i+4) for i in range(4)]
    if (ps[1]-ps[0]).cross(ps[2]-ps[0]).dot(normal)<0:fs=[tuple(reversed(f)) for f in fs]
    o=mesh(name,verts,fs,paint)
    return o
for side in (-1,1):
    # Several separate upper and lower plates follow the cabin shoulders.
    for x0,x1 in [(.282,.395),(.402,.480),(.486,.575),(.582,.643)]:
        for z0,z1 in [(.105,.203),(-.238,-.133)]:
            if z0<0 and x0>.575:z0=-.220
            pts=[(x0,side*surface_y(x0,z0),z0),(x1,side*surface_y(x1,z0),z0),(x1,side*surface_y(x1,z1),z1),(x0,side*surface_y(x0,z1),z1)]
            armor_panel('Individual cabin armor tile',pts,ivory,(0,side,0))
            for x in [x0+.009,x1-.009]:
                for z in [z0+.01,z1-.01]:cyl('Armor screw',(x,side*(surface_y(x,z)+.005),z),.0031,.0024,steel,(0,side,0),6,0)
    # Frame around the name panel, with maintenance lines and small warning tags.
    for z in [-.101,.004]:
        beam('Cabin name panel seam',(.442,side*(cabin_width(.442)+.002),z),(.694,side*(cabin_width(.694)+.002),z),.0015,dark,6)
    box('Yellow hazard identification stripe',(.333,side*(cabin_width(.333)+.006),-.055),(.016,.006,.115),yellow,.001)
    for z in [-.09,-.055,-.02]:box('Identification stripe dark ticks',(.333,side*(cabin_width(.333)+.010),z),(.016,.002,.006),dark,0)
    # Utility door at the front lower corner and a narrow latch rail.
    x=.78;z=-.142;y=side*(cabin_width(x)+.004)
    box('Forward service door',(x,y,z),(.080,.012,.071),navy,.004)
    box('Service door inset',(x,y+side*.008,z),(.053,.004,.044),dark,.002)
    for zz in [z-.023,z+.023]:beam('Service door rail',(.741,y+side*.012,zz),(.815,y+side*.012,zz),.0025,steel,6)
    box('Door handle',(.811,y+side*.014,z),(.007,.006,.024),yellow,.001)
    # Hinged dorsal plates, a roof-side porthole and a ribbed blower assembly.
    cyl('Cabin auxiliary porthole',(.363,side*(surface_y(.363,.17)+.008),.17),.024,.009,steel,(0,side,0),12,.001)
    cyl('Porthole glass',(.363,side*(surface_y(.363,.17)+.014),.17),.017,.003,glass,(0,side,0),12,0)
    for xx in [.456,.470]:box('Roof armor hinge',(xx,side*.141,.225),(.008,.020,.010),steel,.001)
    # External sill pipes return into the nose, with brackets every few decimeters.
    path=[(.31,side*.23,-.258),(.58,side*.23,-.258),(.77,side*.199,-.222),(.96,side*.147,-.180)]
    for a,b in zip(path,path[1:]):beam('Cabin sill conduit',a,b,.007,steel,10)
    for x in [.34,.50,.63]:box('Sill conduit retaining clip',(x,side*.23,-.248),(.018,.026,.013),navy,.001)
    # Dense service spine: paired insulated lines, bent metal pipes and junctions.
    for lane,z in enumerate([.24,.095,-.125,-.254]):
        y=side*(.127+.010*(lane%2))
        path=[(-.55,y,z-.014),(-.47,y,z),(-.22,y,z),(.04,y,z),(.26,y,z-.018)]
        for a,b in zip(path,path[1:]):beam('Exposed service pipe',a,b,.0065,steel if lane%2 else dark,8)
        for x in [-.47,-.32,-.13,.06,.22]:cyl('Hose ferrule',(x,y,z),.009,.020,navy if lane%2 else steel,sides=8,bevel=0)
    # Ribbed hoses at both engine attachment points; valve bodies tie into tanks.
    for z in [-.19,.18]:
        y=side*.096
        beam('Flexible nacelle hose',(-.565,y,z),(-.335,y,z),.015,dark,10)
        for x in np.linspace(-.554,-.34,12):cyl('Hose corrugation',(float(x),y,z),.017,.006,steel,sides=10,bevel=0)
    for x,z in [(-.31,.17),(.08,.17),(-.27,-.04),(.10,-.21)]:
        y=side*(.111 if z>0 else .121)
        cyl('Tank valve body',(x,y,z),.015,.031,steel,(0,side,0),10,.002)
        cyl('Valve wheel hub',(x,y+side*.023,z),.005,.016,yellow,(0,side,0),8,0)
        for a in [0,math.pi/2]:
            d=Vector((math.cos(a)*.024,0,math.sin(a)*.024));c=Vector((x,y+side*.031,z));beam('Valve handwheel spoke',c-d,c+d,.003,yellow,6)
    # Small lower pressure bottles and fastened electrical boxes fill the frame.
    for x in [-.29,-.10,.10]:
        cyl('Auxiliary pressure bottle',(x,side*.115,-.26),.038,.14,ivory,sides=12,bevel=.004)
        for dx in [-.044,.043]:cyl('Bottle restraint',(x+dx,side*.115,-.26),.040,.009,steel,sides=12,bevel=0)
    for x,z in [(-.27,.05),(-.05,.025),(.12,-.12)]:
        box('Frame junction box',(x,side*.154,z),(.063,.046,.055),navy,.003)
        box('Junction cover',(x,side*.180,z),(.050,.006,.040),ivory,.001)
        for dx in [-.019,.019]:box('Cover screw',(x+dx,side*.185,z),(.005,.002,.005),steel,0)
    # Proper flat truss members and gussets, replacing a bare tube-only cage.
    for x in [-.445,.135]:
        box('Flat cage stanchion',(x,side*.175,-.018),(.027,.016,.55),steel,.003)
        for z in [-.265,-.015,.24]:
            box('Triangulated cage node',(x,side*.188,z),(.049,.010,.046),navy,.003)
            for dx in [-.013,.013]:cyl('Cage node bolt',(x+dx,side*.196,z),.0045,.005,steel,(0,side,0),6,0)
    # Short cross-members seat the blue external locker into the truss.
    for x in [.15,.26]:beam('Locker mounting outrigger',(x,side*.15,-.11),(x,side*.23,-.11),.011,steel,8)
    # Rigid diagonal struts across the upper and lower tank bays.
    for a,b in [((-.40,side*.18,.03),(-.22,side*.18,.26)),((-.20,side*.18,.26),(-.04,side*.18,.03)),((-.40,side*.18,-.26),(-.24,side*.18,-.065))]:
        strut=box('Rectangular truss diagonal',tuple((Vector(a)+Vector(b))/2),(.017,.016,(Vector(a)-Vector(b)).length),steel,.002)
        strut.rotation_mode='QUATERNION';strut.rotation_quaternion=Vector((0,0,1)).rotation_difference((Vector(b)-Vector(a)).normalized())

# Engine pods: individual armor panels, riveted leading bands, front plumbing,
# rear exhaust petals and an inner stator rather than featureless cylinders.
for zc in (-.207,.207):
    for i in range(16):
        a=2*math.pi*(i+.5)/16;b=2*math.pi*(i+1.5)/16
        n=Vector((0,math.sin((a+b)/2),math.cos((a+b)/2)))
        for xa,xb,paint,r in [(-.958,-.851,navy,.170),(-.845,-.716,navy,.174),(-.623,-.535,ivory,.166)]:
            points=[(xa,math.sin(a)*r,zc+math.cos(a)*r),(xb,math.sin(a)*r,zc+math.cos(a)*r),(xb,math.sin(b)*r,zc+math.cos(b)*r),(xa,math.sin(b)*r,zc+math.cos(b)*r)]
            armor_panel('Individual nacelle armor panel',points,paint,n)
        # Circumferentially spaced bolts on the engine collar.
        for x in [-.965,-.639]:
            r=.166;loc=(x,math.sin(a)*r,zc+math.cos(a)*r)
            cyl('Engine perimeter fastener',loc,.0035,.005,steel,(0,math.sin(a),math.cos(a)),6,0)
        # Straight cooling fins inside the rear nozzle rim.
        r=.099;loc=Vector((-1.010,math.sin(a)*r,zc+math.cos(a)*r))
        fin=box('Exhaust stator blade',loc,(.013,.031,.007),steel,.001)
        fin.rotation_euler.x=-a
    # Forward ring: layered annular fittings and closely spaced service studs.
    for x,r,depth,paint in [(-.497,.128,.028,dark),(-.485,.105,.036,steel),(-.461,.080,.018,navy),(-.449,.065,.018,steel)]:
        cyl('Engine forward manifold',(x,0,zc),r,depth,paint,sides=16,bevel=.002)
    for side in (-1,1):
        box('Nacelle stamped maintenance plate',(-.585,side*.165,zc+.008),(.065,.009,.073),ivory,.003)
        box('Maintenance grille surround',(-.589,side*.172,zc+.020),(.046,.004,.030),dark,.001)
        for x in np.linspace(-.606,-.572,6):box('Nacelle grille slat',(float(x),side*.176,zc+.020),(.003,.002,.022),steel,0)
        box('Nacelle warning tag',(-.583,side*.174,zc-.023),(.028,.003,.009),yellow,0)
        for zz in [zc-.07,zc+.07]:
            path=[(-.55,side*.14,zz),(-.50,side*.14,zz),(-.43,side*.13,zz-.025),(-.37,side*.13,zz-.025)]
            for a,b in zip(path,path[1:]):beam('Engine feed and return pipe',a,b,.008,steel,8)
    # Broad yellow identification band over the navy plating.
    for i in range(16):
        a=2*math.pi*(i+.5)/16;b=2*math.pi*(i+1.5)/16;r=.176
        mesh('Engine ochre band',[(-.705,math.sin(a)*r,zc+math.cos(a)*r),(-.669,math.sin(a)*r,zc+math.cos(a)*r),(-.669,math.sin(b)*r,zc+math.cos(b)*r),(-.705,math.sin(b)*r,zc+math.cos(b)*r)],[(0,1,2,3)],yellow)

# Rooftop detail clusters and an actual dish bowl/support, kept clear of turret.
for side in [-1,1]:
    cyl('Dorsal auxiliary cylinder',(.315,side*.095,.271),.023,.14,ivory,sides=12,bevel=.004)
    for x in [.265,.365]:cyl('Dorsal cylinder strap',(x,side*.095,.271),.025,.01,steel,sides=12,bevel=0)
    for x in [.396,.416,.436]:box('Avionics cooling fin',(x,side*.062,.272),(.007,.022,.018),steel,.001)
    beam('Roof conduit',(.30,side*.082,.241),(.62,side*.082,.241),.0045,dark,8)
    box('Canopy locking mechanism',(.695,side*.132,.170),(.044,.015,.019),steel,.002)
    for x in [.585,.607]:box('Roof warning stencil',(x,side*.025,.269),(.012,.018,.0015),yellow,0)
# Nose collar bolts and rectangular protective cage.
for a in np.linspace(0,2*math.pi,8,endpoint=False):
    cyl('Docking collar bolt',(1.006,math.sin(a)*.064,-.075+math.cos(a)*.064),.0034,.006,yellow,sides=6,bevel=0)
for side in [-1,1]:
    beam('Docking collar side guard',(1.013,side*.081,-.135),(1.013,side*.081,-.021),.0045,steel,8)
beam('Docking collar upper guard',(1.013,-.074,-.008),(1.013,.074,-.008),.0045,steel,8)
box('Nose identification strip',(1.001,0,.004),(.005,.195,.012),yellow,.001)
# Recessed maintenance vent on the brow ahead of the glazing.
box('Nose brow grille',(.957,0,.048),(.036,.105,.014),dark,.002)
for y in np.linspace(-.044,.044,9):box('Brow grille louver',(.957,float(y),.057),(.029,.003,.004),steel,0)

# Author consistent box-projected UVs for the shared surface finish. All visible
# markings have geometry and remain crisp even when mipmaps reduce grain.
for o in parts:
    if o.type!='MESH':continue
    if not o.data.uv_layers:
        uv=o.data.uv_layers.new(name='UVMap')
        for poly in o.data.polygons:
            n=poly.normal;axis=max(range(3),key=lambda i:abs(n[i]));axes=[i for i in range(3) if i!=axis]
            for li in poly.loop_indices:
                p=o.data.vertices[o.data.loops[li].vertex_index].co
                uv.data[li].uv=(p[axes[0]]*2.1+.37,p[axes[1]]*2.1+.23)
# Join by material into one static hull, keep its origin at the original game pivot.
bpy.ops.object.select_all(action='DESELECT')
for o in parts:o.select_set(True)
bpy.context.view_layer.objects.active=cabin;bpy.ops.object.join();ship=bpy.context.object;ship.name='Wayfarer_Rebuilt'
bpy.ops.object.transform_apply(location=True,rotation=True,scale=True)
ship.data.validate(clean_customdata=True);ship.data.update();ship.data.calc_loop_triangles()
# Bounds match the original footprint; no runtime scaling workaround required.
source=bpy.data.objects.get('SourceTexture_wayfarer')
if source:
    target=source.dimensions
    # Fixed factors computed once, rather than changing dimensions mid-loop.
    factors=[target[i]/ship.dimensions[i] for i in range(3)]
    minimum=[min(v.co[i] for v in ship.data.vertices) for i in range(3)]
    target_min=[min(v.co[i] for v in source.data.vertices) for i in range(3)]
    for v in ship.data.vertices:
        for i in range(3):v.co[i]=(v.co[i]-minimum[i])*factors[i]+target_min[i]
ship.data.update();ship.data.calc_loop_triangles()
# Consolidate the painted hull, metal fittings and lamps into one PBR atlas.
# Canopy glass/frame remain independent materials for untinted reflections.
# Tile padding protects material boundaries under mipmapping.
color_values=[(.66,.61,.48),(.025,.065,.105),(.88,.48,.055),(.38,.09,.037),(.23,.27,.29),(.012,.019,.025),(.08,.32,.48),(.65,.86,1)]
rough_values=[.36,.32,.37,.37,.26,.53,.25,.18]
metal_values=[.32,.38,.25,.48,.84,.30,.45,.10]
names=['WF_Ivory_Paint','WF_Navy_Paint','WF_Safety_Ochre','WF_Tank_Terracotta','WF_Brushed_Steel','WF_Recesses','WF_Engine_Core','WF_Lamps']
w,h=1024,512
albedo=np.ones((h,w,4),np.float32);mr=np.ones((h,w,4),np.float32);emit=np.zeros((h,w,4),np.float32);emit[:,:,3]=1
rng=np.random.default_rng(731)
for i,color in enumerate(color_values):
    y=(i//4)*256;x=(i%4)*256
    tile=albedo[y:y+256,x:x+256,:3]
    # Generated images store linear values; the color image is encoded to sRGB
    # by Blender when exported. Material data remains non-color linear data.
    finish=np.clip(rng.normal(.97,.007,(256,256)),.90,1) if i<4 else np.ones((256,256))
    tile[:]=np.array(color)*finish[:,:,None]
    if i<4:
        for _ in range(34):
            xx,yy=rng.integers(8,240,2);tile[yy,xx:xx+int(rng.integers(2,8))]*=.84
    mr[y:y+256,x:x+256,1]=rough_values[i];mr[y:y+256,x:x+256,2]=metal_values[i]
    if i==6:emit[y:y+256,x:x+256,:3]=np.array(color)*1.4
    if i==7:emit[y:y+256,x:x+256,:3]=np.array(color)
def atlas_image(name,pixels,data=False):
    img=bpy.data.images.get(name) or bpy.data.images.new(name,w,h)
    img.colorspace_settings.name='Non-Color' if data else 'sRGB'
    if not data:
        pixels=pixels.copy();c=np.clip(pixels[:,:,:3],0,1)
        pixels[:,:,:3]=np.where(c<=.0031308,c*12.92,1.055*np.power(c,1/2.4)-.055)
    img.pixels.foreach_set(pixels.ravel());img.pack();return img
base=atlas_image('WF_Authored_Color',albedo)
mask=atlas_image('WF_Authored_Metal_Rough',mr,True)
emission=atlas_image('WF_Authored_Emission',emit)
atlas=bpy.data.materials.get('WF_Hull_Atlas') or bpy.data.materials.new('WF_Hull_Atlas');atlas.use_nodes=True;atlas.use_backface_culling=True
nodes=atlas.node_tree.nodes;nodes.clear();outnode=nodes.new('ShaderNodeOutputMaterial');shader=nodes.new('ShaderNodeBsdfPrincipled');links=atlas.node_tree.links
links.new(shader.outputs[0],outnode.inputs[0])
for img,input_name in [(base,'Base Color'),(emission,'Emission Color')]:
    node=nodes.new('ShaderNodeTexImage');node.image=img;node.interpolation='Linear';links.new(node.outputs['Color'],shader.inputs[input_name])
shader.inputs['Emission Strength'].default_value=1
node=nodes.new('ShaderNodeTexImage');node.image=mask;sep=nodes.new('ShaderNodeSeparateColor');sep.mode='RGB';links.new(node.outputs['Color'],sep.inputs['Color']);links.new(sep.outputs['Green'],shader.inputs['Roughness']);links.new(sep.outputs['Blue'],shader.inputs['Metallic'])
old_materials=list(ship.data.materials);uv=ship.data.uv_layers.active
assignments=[]
for p in ship.data.polygons:
    name=old_materials[p.material_index].name
    if name in names:
        slot=names.index(name);assignments.append(0)
        for li in p.loop_indices:
            u,v=uv.data[li].uv
            # A face stays strictly inside its tile, including the UV gutter.
            u=.05+.90*(float(u)%1);v=.05+.90*(float(v)%1)
            uv.data[li].uv=((slot%4+u)/4,(slot//4+v)/2)
    else:assignments.append(1 if name=='VR_Canopy_Glass' else 2)
ship.data.materials.clear()
for m in [atlas,glass,frame]:ship.data.materials.append(m)
for p,index in zip(ship.data.polygons,assignments):p.material_index=index

bpy.ops.export_scene.gltf(filepath=str(OUT/'wayfarer.glb'),export_format='GLB',use_selection=True,export_yup=True,export_apply=True,export_image_format='AUTO')
result={'triangles':len(ship.data.loop_triangles),'vertices':len(ship.data.vertices),'materials':[m.name for m in ship.data.materials],'bounds':list(ship.dimensions),'file':str(OUT/'wayfarer.glb')}
(ROOT/'docs/wayfarer-rebuild/build.json').write_text(json.dumps(result,indent=2))
