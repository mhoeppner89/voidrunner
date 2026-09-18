"""Seamless spherical terrain textures, baked offline; no runtime noise cost."""
from pathlib import Path
import numpy as np
from PIL import Image
out=Path('assets/textures/worlds');out.mkdir(parents=True,exist_ok=True)
w,h=1024,512
u,v=np.meshgrid(np.linspace(0,2*np.pi,w),np.linspace(0,np.pi,h))
x=np.sin(v)*np.cos(u);y=np.cos(v);z=np.sin(v)*np.sin(u)
def noise(x,y,z):
 ix=np.floor(x);iy=np.floor(y);iz=np.floor(z);fx=x-ix;fy=y-iy;fz=z-iz
 fx=fx*fx*(3-2*fx);fy=fy*fy*(3-2*fy);fz=fz*fz*(3-2*fz);a=0
 for dx in [0,1]:
  for dy in [0,1]:
   for dz in [0,1]:
    q=np.sin((ix+dx)*127.1+(iy+dy)*311.7+(iz+dz)*74.7)*43758.5453;q=q-np.floor(q)
    a+=q*(fx if dx else 1-fx)*(fy if dy else 1-fy)*(fz if dz else 1-fz)
 return a

def fbm(scale,seed,octaves=6):
 a=np.zeros_like(x);weight=1;total=0
 for i in range(octaves):
  a+=weight*noise(x*scale+seed,y*scale+seed*.71,z*scale-seed*.3);total+=weight;weight*=.5;scale*=2.07
 return a/total

def mix(a,b,t):return np.array(a)*(1-t[...,None])+np.array(b)*t[...,None]
def save(id,name,a):
 if a.ndim==2:a=np.repeat(a[...,None],3,axis=2)
 im=Image.fromarray(np.uint8(np.clip(a,0,1)*255))
 if name=='roughness' and id in ['vesper','boreal','blackglass']:im=im.resize((1,1))
 im.save(out/f'{id}-{name}.webp',lossless=True)
for id,seed in [('azure',12),('meridian-prime',37),('vesper',53),('boreal',81),('blackglass',107)]:
 terrain=fbm(3.1,seed);fine=fbm(29,seed+6,4);height=terrain.copy();rough=np.full_like(x,.94)
 if id in ['azure','meridian-prime']:
  land=np.clip((terrain-(.50 if id=='azure' else .46))*45,0,1)
  dryness=fbm(5,seed+40);ice=np.clip((np.abs(y)-.91+(fine-.5)*.08)*23,0,1)
  vegetation=mix([.10,.23,.12],[.47,.40,.23],np.clip((dryness-.39)*3,0,1))
  high=np.clip((terrain-.61)*9,0,1);vegetation=vegetation*(1-high[...,None])+mix([.39,.38,.32],[.78,.78,.73],high)*high[...,None]
  ocean=mix([.025,.09,.19],[.07,.32,.39],np.clip((terrain-.40)*8,0,1))
  color=ocean*(1-land[...,None])+vegetation*land[...,None];color=color*(1-ice[...,None])+np.array([.85,.90,.92])*ice[...,None]
  # Fine broken weather fronts following warped latitude, blended into one opaque pass.
  warp=fbm(4,seed+71,4);cloud=fbm(12,seed+23,5)
  cloud=np.clip((cloud+.11*np.sin(y*22+warp*9)-.57)*7,0,.85)
  color=color*(1-cloud[...,None])+np.array([.91,.94,.96])*cloud[...,None]
  rough=.28+.59*land+.12*cloud;height=np.maximum(terrain-.5,0)*.4
 else:
  if id=='vesper':
   bands=np.sin((terrain*7+fine*.3)*25);color=mix([.22,.105,.065],[.65,.35,.17],np.clip(terrain*1.25+(fine-.5)*.25,0,1));color*=1+bands[...,None]*.07
  elif id=='boreal':
   cracks=np.clip((.022-np.abs(fbm(7,seed+10)-.5))*40,0,1)
   color=mix([.47,.61,.68],[.87,.91,.91],terrain);color*=1-cracks[...,None]*.42;height=terrain-cracks*.08
  else:color=mix([.095,.11,.13],[.32,.34,.35],terrain)
  # Crater bowls and raised rims measured on the sphere, seamless at the meridian.
  rng=np.random.default_rng(seed)
  for i in range(95 if id=='blackglass' else 35):
   c=rng.normal(size=3);c/=np.linalg.norm(c);r=rng.uniform(.018,.16)
   dist=np.sqrt(np.maximum(0,2*(1-(x*c[0]+y*c[1]+z*c[2]))))/r
   bowl=np.clip(1-dist*dist,0,1);rim=np.exp(-((dist-1)/.12)**2)
   height+=(-bowl*.055+rim*.03)*min(1,r*18)
   shade=1-bowl*.22+rim*.14;color*=shade[...,None]
  color*=.86+fine[...,None]*.28
 save(id,'color',color);save(id,'roughness',rough)
 # Restrained low-frequency relief avoids distance-dependent derivative sparkle.
 im=Image.fromarray(np.uint8(np.clip(height,0,1)*255)).resize((256,128),Image.Resampling.LANCZOS)
 im.save(out/f'{id}-height.webp',lossless=True)
 print(id)
