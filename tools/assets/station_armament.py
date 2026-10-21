"""Bake the game's approved Cruiser batteries/PDCs into military station shells.

Read the same mesh data as cruiserModels.js; retain its elevation pivots and
triangle shapes. Repaint through the station palette so no extra atlas, material
batch or runtime assembly is needed. This authors the station's visible hardware.
"""
import json,math,hashlib
from pathlib import Path
from mathutils import Vector,Matrix
import station_builder as B

SOURCE=Path(__file__).resolve().parents[2]/'src/game/cruiserModelData.js'

def source_data():
    text=SOURCE.read_text();decoder=json.JSONDecoder()
    def read(name):return decoder.raw_decode(text.split('export const '+name+'=',1)[1])[0]
    return {'battery':read('CRUISER_TURRET_DATA'),'pdc':read('CRUISER_PDC_DATA')}

def mount(name,kind,position,normal,forward,size,elevation,data):
    p,n,f=Vector(position),Vector(normal).normalized(),Vector(forward).normalized()
    assert abs(n.dot(f))<.00001
    right=f.cross(n).normalized()
    frame=Matrix(((right.x,n.x,-f.x),(right.y,n.y,-f.y),(right.z,n.z,-f.z)))
    assert frame.determinant()>.9999,'Mount frame must preserve model handedness'
    pivot=.72 if kind=='battery'else .5
    pitch=Matrix.Rotation(math.radians(elevation),3,'X')
    def placed(v,part):
        v=Vector(v)
        if part=='pitch':v=pitch@v+Vector((0,pivot,0))
        return p+frame@v*size
    # A short closed bearing sits partly inside the actual mounting surface.
    radius=(.67 if kind=='battery'else .46)*size+.22
    first=len(B.parts)
    # A real raised mounting flange. The former top ended only .005 units
    # above the hull, so the flight camera quantized both textured surfaces
    # to the same depth even though the source faces were not coplanar.
    B.lathe(name+' seated bearing',[(-.32,radius*.9),(-.12,radius),(.22,radius)],'metal',16)
    seat=B.parts[first];seat.matrix_world=Matrix.Translation(p)@Vector((0,0,1)).rotation_difference(n).to_matrix().to_4x4()
    groups={}
    # Preserve the authored face distinctions using existing station materials.
    tiles={0:'cool',9:'metal',10:'dark',16:'dark',25:'hull',40:'armor',41:'metal',42:'armor',62:'cool'}
    for part in data[kind]:
        vertices,uvs=part['positions'],part['uvs']
        for i in range(0,len(vertices),9):
            j=i//3*2;tile=int(uvs[j]*8)+8*int(uvs[j+1]*8)
            material=tiles.get(tile,'hull');vs,fs,lookup=groups.setdefault(material,([],[],{}));face=[]
            for k in range(3):
                point=placed(vertices[i+k*3:i+k*3+3],part['part']);key=tuple(round(v,7)for v in point)
                if key not in lookup:lookup[key]=len(vs);vs.append(tuple(point))
                face.append(lookup[key])
            fs.append(tuple(face))
    for material,(vs,fs,_)in groups.items():B.mesh(name+' weapon '+material,vs,fs,material)
    direction=(frame@pitch@Vector((0,0,-1))).normalized()
    reach=2.65 if kind=='battery'else 1.24
    muzzles=[list(placed((x,0,-reach),'pitch'))for x in ([-.34,.34]if kind=='battery'else[-.18,.18])]
    return {'name':name,'kind':kind,'modelFactory':'createCruiserTurret'if kind=='battery'else'createCruiserPdc',
            'position':list(p),'normal':list(n),'size':size,'elevationDegrees':elevation,'direction':list(direction),'muzzles':muzzles}

def rook(metadata):
    data=source_data();mounts=[]
    def add(label,kind,p,n,f,size,elevation):mounts.append(mount('Rook '+label,kind,p,n,f,size,elevation,data))
    for side in [-1,1]:
        label='port'if side<0 else'starboard'
        add(label+' upper cruiser battery','battery',(side*20,-12,37.52),(0,0,1),(side*.20,-1,0),3.9,8)
        add(label+' flank cruiser battery','battery',(side*38,-3,1.52),(0,0,1),(side*.22,-1,0),3.6,10)
        add(label+' hangar guard PDC','pdc',(side*7,-39.5,19.92),(0,0,1),(0,-1,0),1.8,35)
        add(label+' aft upper cruiser battery','battery',(side*20,6,37.52),(0,0,1),(side*.12,1,0),3.5,12)
        add(label+' aft flank cruiser battery','battery',(side*38,12,2.325),(0,0,1),(side, .3,0),3.2,15)
        add(label+' fore roof PDC','pdc',(side*24,-20,37.52),(0,0,1),(side*.15,-1,0),1.6,35)
        add(label+' outer flank PDC','pdc',(side*48.36,5,-8),(side,0,0),(0,-1,0),1.8,40)
        add(label+' ventral guard PDC','pdc',(side*20,-8,-22.02),(0,0,-1),(0,-1,0),1.8,35)
        add(label+' stern engineering PDC','pdc',(side*17,39.04,-8),(0,1,0),(0,0,1),1.7,40)
        add(label+' aft ventral guard PDC','pdc',(side*20,10,-22.02),(0,0,-1),(0,1,0),1.7,35)
        add(label+' forward bastion PDC','pdc',(side*20,-39.04,-4),(0,-1,0),(side,0,0),1.7,35)
        add(label+' rear command roof PDC','pdc',(side*13,25,23.02),(0,0,1),(side*.2,1,0),1.7,35)
    metadata['armament']={'source':'src/game/cruiserModelData.js','sourceSha256':hashlib.sha256(SOURCE.read_bytes()).hexdigest(),
                          'frame':'source Z-up','batteries':sum(m['kind']=='battery'for m in mounts),'pdcs':sum(m['kind']=='pdc'for m in mounts),'mounts':mounts}
