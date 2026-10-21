"""Rebuild Helix. Run with Blender --background --python."""
import sys,math
from mathutils import Vector,Matrix
from mathutils.bvhtree import BVHTree
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
import station_builder as B
import station_concourses as C
import station_detailing as D
B.init('helix','Helix Freeport · inhabited commercial refinery',palette={
    'hull':(.20,.28,.34),'armor':(.46,.52,.55),'metal':(.32,.39,.43),
    'copper':(.42,.22,.10),'ochre':(.72,.46,.15)})
from station_builder import *
# Four quiet hero-panel variations share the existing atlas. Broad seams,
# access covers and sparse bronze service marks replace tiny mottled repeats
# on the tower shoulders. No additional texture, material or shader is needed.
pixels=B.np.array(B.image.pixels[:],dtype=B.np.float32).reshape(1024,1024,4)
for col in range(4):
    x=col*256;y=896
    tile=pixels[y:y+128,x:x+256,:3];tile[:]=.93
    tile[:3,:]=.56;tile[-3:,:]=.56;tile[:,:3]=.56;tile[:,-3:]=.56
    tile[5:7,6:-6]=.99
    if col in [1,3]:
        tile[24:100,37:42]=.72;tile[24:100,208:213]=.72
    if col==2:
        tile[29:95,58:198]=.70;tile[32:92,61:195]=.88
        tile[41:44,72:184]=.62;tile[48:51,72:184]=.62
        tile[82:87,78:107]=(.95,.68,.30)
    if col==0:
        tile[88:94,164:229]=(.95,.68,.30)
        tile[98:101,164:196]=.62
B.image.pixels.foreach_set(pixels.ravel());B.image.pack()

# Pack city glazing into the same atlas instead of spending two triangles on
# every dark room. A few lit rooms remain emissive geometry. This makes dense
# residential facades inexpensive, while preserving real crew-scale windows.
old=pixels.copy();pixels[:,:,:3]=.93
def atlas_cell(x,y,w,h):return[(x+1)/1024,(y+1)/1024,(x+w-1)/1024,(y+h-1)/1024]
hero_cells=[];quiet_cells=[];city_styles=[]
for i in range(4):
    x=512+i*128
    pixels[896:1024,x:x+128]=old[896:1024,i*256:(i+1)*256:2]
    hero_cells.append(atlas_cell(x,896,128,128))
    tile=pixels[0:256,x:x+128,:3];tile[:]=.90+i*.008
    tile[:2,:]=.62;tile[-2:,:]=.62;tile[:,:2]=.62;tile[:,-2:]=.62
    if i%2:tile[72:75,22:106]=.78
    quiet_cells.append(atlas_cell(x,0,128,256))
for level,maximum in enumerate([4.5,7.5,10,16]):
    for variant in range(2):
        x=variant*256;y=level*256;tile=pixels[y:y+256,x:x+256,:3]
        tile[:]=.89 if variant else .98
        tile[:3,:]=.60;tile[-3:,:]=.60;tile[:,:3]=.60;tile[:,-3:]=.60
        columns=7 if variant else 6;rows=max(7,int(maximum/.5))
        pw=B.detail_units(2.8)/6;ph=B.detail_units(1.2)/maximum;rooms=[]
        for row in range(rows):
            v=.13+.62*row/max(1,rows-1)
            if row%4==3:tile[max(0,int(v*256)-6):max(0,int(v*256)-4),5:251]=.77
            for column in range(columns):
                u=.11+.78*column/(columns-1)
                xx=round(u*254+1);yy=round(v*254+1);ww=max(2,round(pw*254));hh=max(2,round(ph*254))
                tone=(.10,.18,.23)if(row*7+column*3+variant)%5 else(.30,.40,.45)
                tile[yy-hh//2:yy+(hh+1)//2,xx-ww//2:xx+(ww+1)//2]=tone
                rooms.append((u,v,pw,ph))
        # Exterior faces are sealed pressure walls. Access to homes is through
        # the enclosed galleries and interdeck lifts, never a street in vacuum.
        tile[28:218,8:11]=.66
        city_styles.append({'maximum':maximum,'variant':variant,'cell':atlas_cell(x,y,256,256),'rooms':rooms})
# Small solid-color planting cells share the industrial atlas. No new foliage
# sampler or material is needed for the enclosed gardens.
garden_cells=[]
for i,color in enumerate([(.23,.68,.19),(.32,.85,.24),(.41,.60,.24)]):
    x=512+i*128;pixels[384:512,x:x+128,:3]=color
    garden_cells.append(atlas_cell(x+8,392,112,112))
pixels[384:512,896:1024,:3]=(.13,.58,.75)
water_cell=atlas_cell(904,392,112,112)
B.image.pixels.foreach_set(pixels.ravel());B.image.pack()
# A recognizable refinery spindle, enclosed occupied decks and exposed services.
lathe('Central refinery spindle',[(-48,7),(-43,10),(-32,12),(-19,12),(28,12),(35,9),(52,8)],'hull',32)
for z,r,h in [(-24,27,8),(-5,39,9),(17,31,8)]:
    deck=lathe('Pressure deck shell',[(z-h/2-1,r-2),(z-h/2,r),(z+h/2,r),(z+h/2+1,r-2)],'hull')
    deck['station_panel_scale']=4
    for zz in [z-h/2-.3,z+h/2+.3]:
        ring('Deck structural lip',r+.4,2.4,zz,.65,'metal')
    windows(r,z-h/2+1,2,'Occupied deck windows')
    ring('Continuous roof shield mounting saddle',r-1,3.2,z+h/2+.25,1,'metal')
    for i in range(12):
        a=i*math.tau/12
        ring('Ceramic pressure shield',r+.15,2.9,z+h/2+.95,.65,'armor',2,a+.018,a+math.tau/12-.018)
        # Real radial ribs and inset service panels interrupt the broad plating.
        beam('Deck radial girder',(11.5*math.cos(a),11.5*math.sin(a),z-h/2-4),((r-2)*math.cos(a),(r-2)*math.sin(a),z-h/2-.5),.85)
        if z!=-24:continue
        box('Roof maintenance hatch',((r-4)*math.cos(a),(r-4)*math.sin(a),z+h/2+1.08),(2.5,1.6,.19),'dark',yaw=a,chamfer=.15)
        box('Hatch rim',((r-4)*math.cos(a),(r-4)*math.sin(a),z+h/2+1.22),(1.9,1.1,.12),'metal',yaw=a)

# Vertical elevator towers tie the separate inhabited decks into one building.
for i in [0,2,3,5,6,8,9,11]:
    a=i*math.tau/12
    x,y=20*math.cos(a),20*math.sin(a)
    box('Interdeck elevator trunk',(x,y,-1),(3.4,4,43),'armor',yaw=a,chamfer=.4)
    box('Elevator machinery',(x*1.04,y*1.04,22),(3.9,4.5,3.2),'metal',yaw=a,chamfer=.4)
    for z in [-17,-11,2,9]:box('Elevator service collar',(x,y,z),(3.8,4.4,.55),'ochre',yaw=a)

# The side portal opens into a real shared multilevel atrium.
m=C.build('helix',('atlas','wayfarer'))

# Paired sealed freight holds replace the unsupported open cargo apron.
# Cargo is transferred behind closed pressure shutters; no containers in vacuum.
freight_parts=len(B.parts)
for side in [-1,1]:
    name='Helix port sealed freight hold'if side<0 else'Helix starboard sealed freight hold'
    B.pressure_building(name,[(-23,side*32,0,10,16),(-18,side*34,0,14,20),
        (-4,side*34,0,14,20),(-2,side*33,0,10,16)],'hull',1)
    x=side*41.04
    box(name+' pressure shutter',(x,0,-11.5),(.12,6.6,6.6),'dark')
    for y in [-3.45,3.45]:box(name+' shutter frame',(x+side*.04,y,-11.5),(.3,.3,7.1),'metal')
    for z in [-14.95,-8.05]:box(name+' pressure lintel',(x+side*.04,0,z),(.3,7.2,.3),'armor')
    for z in [-13.6,-12.5,-11.4,-10.3,-9.2]:box(name+' shutter reinforcement',(x+side*.09,0,z),(.12,6.4,.10),'metal')
    for y in [-3.45,3.45]:box(name+' transfer status',(x+side*.21,y,-11.5),(.08,.10,1.4),'cool')
    B.window_wall(name+' cargo control',(side*34,-10,-5.5),(1,0,0),(0,-1,0),3,1,pitch=.7,width=B.detail_units(3),height=B.detail_units(1.4))
    # Armored transfer machinery and color-coded door surrounds make these
    # working freight locks, rather than anonymous boxes attached to the ring.
    for y in [-4.1,4.1]:
        box(name+' lock actuator',(x-side*.18,y,-11.5),(.8,.65,8.5),'metal',chamfer=.12)
        box(name+' actuator shield',(x+side*.26,y,-11.5),(.16,.36,5.5),'copper')
    box(name+' freight lintel',(x+side*.09,0,-7.5),(.22,9,.35),'ochre')
    box(name+' registry backing',(side*34,-10.015,-7.0),(8,.07,1.65),'metal')
    text(name+' freeport registry','HELIX',(side*34,-10.052,-7.42),1.15,'armor',extrude=0)
    for y in [-6,6]:
        beam(name+' armored load root',(side*22,y,-8),(side*34,y,-14),1.5,'metal')
freight_parts=len(B.parts)-freight_parts

# Exposed refinery equipment below the occupied decks, with continuous plumbing.
for i in range(6):
    a=i*math.tau/6+.35;x,y=20*math.cos(a),20*math.sin(a)
    tank('Refinery pressure vessel',x,y,-34,2.3,13,collar_segments=8)
    beam('Pressure vessel structural mount',(x,y,-29.8),(x*.55,y*.55,-23),.8)
    tube('Refinery transfer main',[(x,y,-41),(x,y,-44),(x*.48,y*.48,-44)],.32,'copper')
ring('Ventral plant maintenance rim',12,2,-44,1.2,'metal',32)
for i in range(6):
    a=i*math.tau/6+.35
    beam('Ventral rim structural spoke',(8*math.cos(a),8*math.sin(a),-44),(12*math.cos(a),12*math.sin(a),-44),1.1)
for side in [-1,1]:
    beam('Radiator wing root',(side*17,13,14),(side*49,13,28),2,'hull')
    beam('Radiator wing brace',(side*17,13,-1),(side*49,13,20),1,'metal')
    for yy in [6,20]:
        box('Radiator manifold',(side*49,yy,29),(1.6,1.1,28),'metal')
        tube('Coolant riser',[(side*13,yy,14),(side*45,yy,25),(side*49,yy,25)],.28,'copper')
    box('Thick radiator plate',(side*49,13,29),(.62,15,25),'dark')
    for z in range(18,42,2):box('Radiator cooling ribs',(side*49,13,z),(1.03,14,.16),'metal')
    for yy in [8,13,18]:box('Radiator channels',(side*49,yy,29),(.8,.17,24),'dark')

# External plant has sealed inspection covers rather than personnel doors
# opening onto empty space. Crew access stays inside the inhabited galleries.
for i in [0,1,3,5,6,7,9,11]:
    a=i*math.tau/12+math.pi/48
    if i==9:continue
    rr=39*math.cos(math.pi/48)
    box('Sealed external plant inspection cover',((rr+.035)*math.cos(a),(rr+.035)*math.sin(a),-7),(.7,.13,.6),'metal',yaw=a+math.pi/2)
    box('Plant inspection latch',((rr+.11)*math.cos(a),(rr+.11)*math.sin(a),-7),(.35,.06,.08),'copper',yaw=a+math.pi/2)
# A separate navigation/communications crown, supported and visibly inhabited.
shroud=lathe('Upper services cone',[(30,13),(33,16),(37,16),(41,11),(48,10)],'armor',24)
shroud['station_panel_layout']='faceted';shroud['station_panel_scale']=6
# Longitudinal reinforced service spines follow the tower's actual hull
# profile. They break up its broad shoulders and terminate in the crown.
for i in range(8):
    a=(i*3+.5)*math.tau/24
    for z0,r0,z1,r1 in [(33,16,37,16),(37,16,41,11),(41,11,47.8,10.03)]:
        face=math.cos(math.pi/24)
        beam('Tower seated service spine',(r0*face*math.cos(a),r0*face*math.sin(a),z0),
            (r1*face*math.cos(a),r1*face*math.sin(a),z1),.28,'metal')
lathe('Command pressure cylinder',[(44,8),(56,8),(58,6)],'hull',24)
for z in [46,49,52]:
    ring('Command deck band',8.1,1.2,z,.4,'copper'if z==49 else'metal',24)
    windows(8,z+.65,1,'Command deck windows',24)
crown=lathe('Command crown',[(56,9),(58,9),(62,5)],'armor',24)
crown['station_panel_layout']='faceted';crown['station_panel_scale']=6
for x,y,h in [(-5,1,80),(4,2,73),(0,-2,84)]:
    beam('Communications mast',(x,y,60),(x,y,h),.25)
    for zz in [h-5,h-2]:beam('Mast antenna crossbar',(x-1.6,y,zz),(x+1.6,y,zz),.16)
    box('Navigation beacon',(x,y,h+.2),(.4,.4,.4),'warm')
for side in [-1,1]:
    x,y=side*16.4,7
    beam('Reflector seated outrigger',(side*11.5,y,37),(x,y,42.8),.85)
    beam('Reflector pedestal',(x,y,42.6),(x,y,46),.65)
    first=len(B.parts)
    vs=[(0,0,0)]
    for r in [2,4.5]:vs += [(r*math.cos(i*math.tau/24),r*math.sin(i*math.tau/24),(r/4.5)**2*1.4)for i in range(24)]
    fs=[(0,1+i,1+(i+1)%24)for i in range(24)]+[(1+i,25+i,25+(i+1)%24,1+(i+1)%24)for i in range(24)]
    dish=mesh('Communications reflector with thickness',vs,fs,'armor')
    bpy.context.view_layer.objects.active=dish;dish.select_set(True);mod=dish.modifiers.new('Reflector skin','SOLIDIFY');mod.thickness=.18;bpy.ops.object.modifier_apply(modifier=mod.name);dish.select_set(False)
    for i in range(3):
        a=i*math.tau/3
        beam('Reflector feed supports',(4.45*math.cos(a),4.45*math.sin(a),1.32),(0,0,3),.12)
    pose=Matrix.Translation(Vector((x,y,46)))@Matrix.Rotation(side*.20,4,'Y')
    for o in B.parts[first:]:o.matrix_world=pose@o.matrix_world


D.apply('helix',m)
city_start=len(B.parts);city_blocks=[];city_links=[];parks=[]
B.bpy.context.view_layer.update()
city_obstacles=[]
for o in B.parts:
    if o.name.startswith(('Interdeck elevator trunk','Elevator machinery','Upper services cone','Radiator wing root','Radiator wing brace','Coolant riser')):
        city_obstacles.append(BVHTree.FromPolygons([o.matrix_world@v.co for v in o.data.vertices],[tuple(f.vertices)for f in o.data.polygons]))


def city_block(name,roof,r,a,base,w,d,h):
    # Named, closed pressure buildings. Local X runs along the street;
    # local Y points radially. The foundation embeds in its supporting roof.
    x,y=r*math.cos(a),r*math.sin(a);yaw=a-math.pi/2
    co,si=math.cos(yaw),math.sin(yaw)
    corners=[(x+dx*co-dy*si,y+dx*si+dy*co)for dx in [-w/2,w/2]for dy in [-d/2,d/2]]
    if roof=='middle'and min(p[0]for p in corners)<14.5 and max(p[0]for p in corners)>-14.5 and min(p[1]for p in corners)<-6:return
    # The old body stopped at the raised street height even where that street
    # had a gap. Extend the *whole* pressure hull into the real deck instead.
    foot=.40 if roof=='middle'else 21.90
    h+=base-foot;base=foot
    first=len(B.parts)
    variant=int(abs(math.cos(a))*10)%3
    profile=[(base,0,0,w,d),(base+h,0,0,w,d)]if variant==1 else[
        (base,0,0,w,d),(base+h*.8,0,0,w,d),(base+h,0,0,w*.68,d*.72)]
    # Most dense housing uses economical rectangular pressure hulls. Taller
    # corner towers keep chamfered shoulders for a varied skyline.
    if h>10:
        body=B.pressure_building(name,profile,'hull',.22)
    else:
        vs=[(xx+dx,yy+dy,z)for z,xx,yy,ww,dd in profile for dx,dy in [(-ww/2,-dd/2),(ww/2,-dd/2),(ww/2,dd/2),(-ww/2,dd/2)]]
        fs=[(3,2,1,0),tuple(range((len(profile)-1)*4,len(profile)*4))]
        for level in range(len(profile)-1):
            fs.extend((level*4+j,level*4+(j+1)%4,(level+1)*4+(j+1)%4,(level+1)*4+j)for j in range(4))
        body=mesh(name,vs,fs,'hull')
    transform=Matrix.Translation(Vector((x,y,0)))@Matrix.Rotation(yaw,4,'Z')
    tree=BVHTree.FromPolygons([transform@v.co for v in body.data.vertices],[tuple(f.vertices)for f in body.data.polygons])
    if any(tree.overlap(other)for other in city_obstacles):
        B.parts.remove(body);B.bpy.data.objects.remove(body,do_unlink=True);return
    style=next(t for t in city_styles if t['maximum']>=h and t['variant']==variant%2)
    body['station_city_facade']=B.json.dumps([*style['cell'],w,d,base,h])
    lit_count=0
    for face,(dx,dy,t,n,span)in enumerate([(0,-d/2,(1,0,0),(0,-1,0),w),(0,d/2,(-1,0,0),(0,1,0),w),
        (w/2,0,(0,1,0),(1,0,0),d),(-w/2,0,(0,-1,0),(-1,0,0),d)]):
        panes={'warm':[],'cool':[]}
        count=1
        for k in range(count):
            index=(int(abs(x)*7+abs(y)*5)+face*13+k*23)%len(style['rooms'])
            u,v,pw,ph=style['rooms'][index];center=Vector((dx,dy,base+v*h))+Vector(t)*((u-.5)*span)+Vector(n)*.025
            material='cool'if(index+face)%5==0 else'warm'
            panes[material].extend(tuple(center+Vector(t)*xx+Vector((0,0,zz)))for xx,zz in [(-pw*span/2,-ph*h/2),(pw*span/2,-ph*h/2),(pw*span/2,ph*h/2),(-pw*span/2,ph*h/2)])
            lit_count+=1
        for material,vertices in panes.items():
            if vertices:mesh(name+' inhabited rooms windows · '+material,vertices,[tuple(range(i,i+4))for i in range(0,len(vertices),4)],material)
    if r>24:
        box(name+' facade structural pier',(0,-d/2,base+h*.39),(.18,.16,h*.77),'metal')
        if variant==0:box(name+' occupied roof cornice',(0,0,base+h*.79),(w+.12,d+.12,.16),'copper')
    if r>24 and variant==1:
        # Shared roof air-handling plant, seated on the flat roof and supplied
        # through a short protected riser rather than a freestanding prop.
        box(name+' rooftop service house',(0,0,base+h+.30),(w*.48,d*.38,.64),'metal',chamfer=.08)
        box(name+' plant grille',(0,0,base+h+.63),(w*.34,d*.28,.04),'dark')
    if int(abs(math.cos(a))*10)%3==0:
        box(name+' sealed rooftop plant',(0,0,base+h+.13),(w*.30,d*.35,.26),'dark')
    transform=Matrix.Translation(Vector((x,y,0)))@Matrix.Rotation(yaw,4,'Z')
    for o in B.parts[first:]:o.matrix_world=transform@o.matrix_world
    city_blocks.append({'name':name,'roof':roof,'center':[x,y,base],'yaw':yaw,'width':w,'depth':d,'height':h,'roomWindows':4*len(style['rooms']),'litWindows':lit_count})

# Wide pressure-street foundations sit on the existing circular decks. The
# middle streets stop at the arrival hall, preserving its roof and approach.
for label,r,width,z,start,end in [
    ('middle outer front right',32.2,7,.95,math.radians(-55),math.radians(18)),
    ('middle outer rear',32.2,7,.95,math.radians(31),math.radians(149)),
    ('middle outer front left',32.2,7,.95,math.radians(162),math.radians(235)),
    ('middle inner front right',25.5,5.4,.95,math.radians(-45),math.radians(22)),
    ('middle inner rear',25.5,5.4,.95,math.radians(42),math.radians(138)),
    ('middle inner front left',25.5,5.4,.95,math.radians(158),math.radians(225)),
    ('upper outer',21.55,12.5,22.6,0,math.tau)]:
    # Housing now sits directly on the real roof. Only the upper district
    # needs its common raised foundation; middle lanes remain inset markings.
    if label.startswith('upper'):ring('Helix city '+label+' pressure street',r,width,z,1.2,'hull',64,start,end)
# Narrow inset service lanes read as streets, rather than black plinths under
# each housing row. The engineering corridors remain open around their roots.
for label,r,z,start,end in [
    ('middle right',28.8,.512,math.radians(-50),math.radians(18)),
    ('middle rear',28.8,.512,math.radians(42),math.radians(138)),
    ('middle left',28.8,.512,math.radians(162),math.radians(230)),
    ('upper',22.4,23.212,0,math.tau)]:
    ring('Helix inset district service lane '+label,r,1.0,z,.025,'metal',max(8,round(64*(end-start)/math.tau)),start,end)
for roof,r,count,base,w,d,low,high in [
    ('middle',32.2,30,1.35,5.8,4.5,4,7.4),('middle',25.5,24,1.35,5.2,4.1,3.3,5.4),
    ('upper',25.4,28,23.15,5.0,4.1,6,13.5),('upper',16.6,20,23.15,4.6,2.6,2.5,4.5)]:
    for i in range(count):
        a=math.tau*(i+.5)/count;k=round(abs(math.cos(a))*12)
        h=low+(high-low)*((k*7+count)%9)/8
        if roof=='upper'and count==28 and i in [1,5,8,12,16,25]:
            variant=0 if i in [1,12]else 1 if i in [5,8]else 2
            parks.append({'center':[r*math.cos(a),r*math.sin(a),23.20],'yaw':a-math.pi/2,'width':5.1,'depth':4.1,'height':[3.7,3.3,4.0][variant],'variant':variant,'replacedBuildings':1})
        else:city_block('Helix city '+roof+' district '+str(count)+' block '+str(i).zfill(2),roof,r,a,base,w,d,h)

# Low inhabited wings join selected towers into long housing complexes. Their
# ends embed inside both buildings; the station has closed pressure passages,
# not exposed pedestrian bridges. Paired choices preserve bilateral symmetry.
for roof,count in [('middle',30),('upper',28)]:
    outer=[b for b in city_blocks if b['roof']==roof and 'district '+str(count)+' 'in b['name']]
    pairs=[]
    for target in [-.8,.8]:
        options=[]
        for left in outer:
            for right in outer:
                i,j=int(left['name'][-2:]),int(right['name'][-2:])
                if j!=(i+1)%count:continue
                angle=math.atan2(left['center'][1]+right['center'][1],left['center'][0]+right['center'][0])
                if abs(angle-target)<.7:options.append((abs(angle-target),i,j))
        _,i,j=min(options)
        pairs.extend([(i,j),((count//2-1-j)%count,(count//2-1-i)%count)])
    for i,j in pairs:
        names=['Helix city '+roof+' district '+str(count)+' block '+str(k).zfill(2)for k in [i,j]]
        ends=[next(b for b in city_blocks if b['name']==n)for n in names]
        a,b=[Vector(c['center'])for c in ends];delta=b-a;length=delta.length
        yaw=math.atan2(delta.y,delta.x);base=a.z;h=min(c['height']for c in ends)*.56
        name='Helix connected '+roof+' housing wing '+str(i).zfill(2)
        first=len(B.parts)
        body=box(name,((a.x+b.x)/2,(a.y+b.y)/2,base+h/2),(length,2.7,h),'hull',yaw=yaw,chamfer=.12)
        B.bpy.context.view_layer.update()
        tree=BVHTree.FromPolygons([body.matrix_world@v.co for v in body.data.vertices],[tuple(f.vertices)for f in body.data.polygons])
        assert not any(tree.overlap(other)for other in city_obstacles),(name,'crosses an engineering corridor')
        center=Vector(((a.x+b.x)/2,(a.y+b.y)/2,base+h*.48))
        tangent=Vector((math.cos(yaw),math.sin(yaw),0));normal=Vector((math.sin(yaw),-math.cos(yaw),0))
        for side in [-1,1]:
            B.window_wall(name+' common rooms',center+normal*side*1.35,tangent*side,normal*side,
                4,2,pitch=.62,row_pitch=.55,width=B.detail_units(3),height=B.detail_units(1.4))
        city_links.append({'name':name,'buildings':names,'roof':roof})

# Six sealed conservatories replace mirrored housing blocks. Their
# planted terraces, trees and internal paths are visible through one economical
# glass shell; perimeter frames and a pressure vestibule join each to its deck.
B.M['canopy']=B.M.pop('radiator');B.COLORS['canopy']=(.48,.72,.78);B.COLORS.pop('radiator')
canopy=B.M['canopy'];canopy.name='helix · canopy';canopy.diffuse_color=(.48,.72,.78,.26)
p=canopy.node_tree.nodes.get('Principled BSDF');p.inputs['Base Color'].default_value=(.48,.72,.78,.26)
p.inputs['Alpha'].default_value=.26;p.inputs['Metallic'].default_value=.08;p.inputs['Roughness'].default_value=.12
for i,park in enumerate(parks):
    first=len(B.parts);name='Helix enclosed park '+str(i+1);rx,ry=park['width']/2,park['depth']/2;z=park['center'][2];h=park['height']
    base=box(name+' full footprint foundation',(0,0,(21.90+z)/2),(rx*2+.22,ry*2+.22,z-21.90+.05),'hull',chamfer=.35)
    box(name+' occupied garden floor',(0,0,z+.04),(rx*1.78,ry*1.70,.18),'metal',chamfer=.3)
    def planting(obj,cell):obj['station_atlas_cells']=B.json.dumps([garden_cells[cell]])
    for side in [-1,1]:
        bed=lathe(name+' rounded planted terrace',[(z+.11,1),(z+.28,1)],'armor',8)
        bed.scale.x=rx*.39;bed.scale.y=ry*.66;bed.location.x=side*rx*.50;planting(bed,0)
    for k,(x,yy,height,radius)in enumerate([(-rx*.48,-.45,1.75,.54),(rx*.48,.45,1.95,.58),(-rx*.35,.85,1.45,.46)]):
        height*=1+park['variant']*.06
        beam(name+' tree trunk',(x,yy,z+.25),(x,yy,z+height*.77),.11,'copper')
        B.bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=1,radius=1,location=(x,yy,z+height*.76))
        tree=B.bpy.context.object;tree.name=name+' broadleaf tree canopy';tree.scale=(radius,radius*.85,height*.29);tree.rotation_euler.z=k*.71+park['variant']*.4
        tree.data.materials.append(B.M['armor']);B.parts.append(tree);planting(tree,1 if k%2 else 2);tree.select_set(False)
    box(name+' interior path',(0,0,z+.20),(.55,ry*1.76,.10),'armor')
    box(name+' garden bench plinth',(0,ry*.45,z+.15),(.85,.20,.05),'copper')
    box(name+' garden bench back',(0,ry*.45+.10,z+.19),(.85,.05,.13),'copper')
    pool=lathe(name+' reflecting water basin',[(z+.12,.33),(z+.36,.33)],'armor',8,(rx*.45,-.88))
    pool.scale.y=1.25;pool['station_atlas_cells']=B.json.dumps([water_cell])
    for side in [-1,1]:box(name+' interior path lamp',(side*.39,-ry*.30,z+.19),(.12,.48,.14),'warm')
    # Latitude rings and curved meridians follow the same elliptical shell.
    segments=16;levels=4
    vs=[(rx*math.cos(phi)*math.cos(a),ry*math.cos(phi)*math.sin(a),z+h*math.sin(phi))for j in range(levels)for phi in [j*math.pi/(2*levels)]for a in [k*math.tau/segments for k in range(segments)]]+[(0,0,z+h)]
    fs=[(j*segments+k,j*segments+(k+1)%segments,(j+1)*segments+(k+1)%segments,(j+1)*segments+k)for j in range(levels-1)for k in range(segments)]
    fs.extend(((levels-1)*segments+k,(levels-1)*segments+(k+1)%segments,levels*segments)for k in range(segments))
    mesh(name+' glass dome',vs,fs,'canopy')
    for k in range(6):
        a=k*math.tau/6
        points=[(rx*math.cos(phi)*math.cos(a),ry*math.cos(phi)*math.sin(a),z+h*math.sin(phi))for phi in [j*math.pi/(2*levels)for j in range(levels+1)]]
        vs=[]
        for phi,point in zip([j*math.pi/(2*levels)for j in range(levels+1)],points):
            tangent=Vector((-rx*math.sin(phi)*math.cos(a),-ry*math.sin(phi)*math.sin(a),h*math.cos(phi))).normalized()
            across=Vector((-math.sin(a),math.cos(a),0));normal=across.cross(tangent).normalized()
            vs.extend(tuple(Vector(point)+across*u*.042+normal*v*.042)for u,v in [(-1,-1),(1,-1),(1,1),(-1,1)])
        fs=[(3,2,1,0),tuple(range(levels*4,levels*4+4))]
        fs.extend((j*4+k,j*4+(k+1)%4,(j+1)*4+(k+1)%4,(j+1)*4+k)for j in range(levels)for k in range(4))
        mesh(name+' continuous pressure glazing rib',vs,fs,'metal')
    latitude=math.pi/4
    band=ring(name+' bronze glazing latitude',1,.025,z+h*math.sin(latitude),.075,'copper',16)
    band.scale.x=rx*math.cos(latitude);band.scale.y=ry*math.cos(latitude)
    rim=ring(name+' pressure glazing seat',1,.06,z,.16,'metal',16)
    rim.scale.x=rx;rim.scale.y=ry
    lathe(name+' crown pressure cap',[(z+h-.09,.17),(z+h+.10,.17)],'copper',6)
    box(name+' sealed access vestibule',(0,-ry+.20,z+.36),(1.25,1.3,.9),'hull',chamfer=.15)
    transform=Matrix.Translation(Vector((park['center'][0],park['center'][1],0)))@Matrix.Rotation(park['yaw'],4,'Z')
    for o in B.parts[first:]:o.matrix_world=transform@o.matrix_world

for o in B.parts:
    if not o.get('station_atlas_cells'):o['station_atlas_cells']=B.json.dumps(hero_cells if o.get('station_panel_layout')=='faceted'else quiet_cells)

m['architecture']={'revision':'inhabited-refinery-city-v3','originalRadius':84.42890708589043,
    'partsAdded':len(B.parts)-city_start+freight_parts,'strategy':'tiered refinery spindle with inhabited roof districts',
    'silhouettePartsAdded':len(B.parts)-city_start+freight_parts,
    'silhouette':'tiered refinery city, dense inhabited roof districts and paired sealed freight holds',
    'restoredFrom':'febb5f8','cityBlocks':city_blocks,'cityConnections':city_links,'parks':parks,'exteriorStreetDoors':False,'cityWindowCount':sum(b['roomWindows']for b in city_blocks),'cityLitWindowCount':sum(b['litWindows']for b in city_blocks),'enclosedFreightHolds':2}
export_model('helix',m,'Three circular refinery decks with dense enclosed urban districts, paired sealed freight holds and a clear shared arrival atrium.')
