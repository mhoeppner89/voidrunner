"""Bake unique-UV color and cavity shading for the reference-detail Wayfarer.
Run in Blender MCP after rebuild-wayfarer.py. Keeps the separate canopy PBR.
"""
import bpy, numpy as np, json
from pathlib import Path
ROOT=Path('/Users/mhoeppner/Desktop/Voidrunner')
ship=bpy.data.objects['Wayfarer_Rebuilt']
# Only the rebuilt object contributes to ambient occlusion; archived originals
# at the same origin must not cast fictitious occlusion onto it.
for o in bpy.context.scene.objects:o.hide_render=o!=ship
ship.hide_render=False
bpy.ops.object.select_all(action='DESELECT');ship.select_set(True);bpy.context.view_layer.objects.active=ship
old_uv=ship.data.uv_layers.active.name
for m in ship.data.materials:
    for n in list(m.node_tree.nodes):
        if n.type=='TEX_IMAGE' and n.image:
            uv=m.node_tree.nodes.new('ShaderNodeUVMap');uv.uv_map=old_uv;m.node_tree.links.new(uv.outputs['UV'],n.inputs['Vector'])
new_uv=ship.data.uv_layers.new(name='SurfaceBake');ship.data.uv_layers.active=new_uv
bpy.ops.object.mode_set(mode='EDIT');bpy.ops.mesh.select_all(action='SELECT')
bpy.ops.uv.smart_project(angle_limit=1.15192,island_margin=.008,area_weight=.2,correct_aspect=True,scale_to_bounds=True)
bpy.ops.object.mode_set(mode='OBJECT')
scene=bpy.context.scene;scene.render.engine='CYCLES';scene.cycles.device='CPU';scene.cycles.samples=24
scene.render.bake.margin=8;scene.render.bake.use_selected_to_active=False
# Work in linear color so AO multiplication does not change gamma.
def image(name,size):
    old=bpy.data.images.get(name)
    if old:bpy.data.images.remove(old)
    img=bpy.data.images.new(name,size,size,alpha=False,float_buffer=True);img.colorspace_settings.name='Non-Color';return img
base=image('WF_Baked_Color',2048);orm=image('WF_Baked_MetalRough',1024);emission=image('WF_Baked_Emission',512);ao=image('WF_Baked_Cavity',2048)
original=[]
for m in ship.data.materials:
    nodes=m.node_tree.nodes;out=next(n for n in nodes if n.type=='OUTPUT_MATERIAL');shader=out.inputs['Surface'].links[0].from_node
    original.append((m,out,shader))

def setup_emit(target,mode):
    for m,out,shader in original:
        nodes=m.node_tree.nodes;links=m.node_tree.links
        node=nodes.get('Baking Surface') or nodes.new('ShaderNodeEmission');node.name='Baking Surface'
        for link in list(node.inputs['Color'].links):links.remove(link)
        if mode=='COLOR':socket=shader.inputs['Base Color']
        elif mode=='EMISSION':socket=shader.inputs['Emission Color']
        else:socket=None
        if socket:
            if socket.is_linked:links.new(socket.links[0].from_socket,node.inputs['Color'])
            else:node.inputs['Color'].default_value=socket.default_value
        else:
            combine=nodes.get('Baking ORM') or nodes.new('ShaderNodeCombineColor');combine.name='Baking ORM';combine.mode='RGB';combine.inputs['Red'].default_value=1
            for channel,input_name in [('Green','Roughness'),('Blue','Metallic')]:
                socket=shader.inputs[input_name]
                if socket.is_linked:links.new(socket.links[0].from_socket,combine.inputs[channel])
                else:combine.inputs[channel].default_value=socket.default_value
            links.new(combine.outputs['Color'],node.inputs['Color'])
        links.new(node.outputs[0],out.inputs['Surface'])
        tex=nodes.get('Bake Target') or nodes.new('ShaderNodeTexImage');tex.name='Bake Target';tex.image=target;nodes.active=tex
    bpy.ops.object.bake(type='EMIT')
setup_emit(base,'COLOR');setup_emit(orm,'ORM');setup_emit(emission,'EMISSION')
for m,out,shader in original:
    m.node_tree.links.new(shader.outputs[0],out.inputs['Surface']);m.node_tree.nodes['Bake Target'].image=ao;m.node_tree.nodes.active=m.node_tree.nodes['Bake Target']
bpy.ops.object.bake(type='AO')
# Restrained contact shading, retained in albedo because the small runtime
# loader does not apply a separate glTF occlusion slot. No directional shadow.
pixels=np.empty(2048*2048*4,np.float32);cavity=np.empty_like(pixels)
base.pixels.foreach_get(pixels);ao.pixels.foreach_get(cavity)
pixels=pixels.reshape(2048,2048,4);cavity=cavity.reshape(2048,2048,4)
pixels[:,:,:3]*=(.40+.60*np.clip(cavity[:,:,:1],0,1))
# Store sRGB color bytes explicitly, as in the authored atlas.
c=np.clip(pixels[:,:,:3],0,1);pixels[:,:,:3]=np.where(c<=.0031308,c*12.92,1.055*np.power(c,1/2.4)-.055)
base.colorspace_settings.name='sRGB';base.pixels.foreach_set(pixels.ravel());base.pack()
e=np.empty(512*512*4,np.float32);emission.pixels.foreach_get(e);e=e.reshape(512,512,4);c=np.clip(e[:,:,:3],0,1);e[:,:,:3]=np.where(c<=.0031308,c*12.92,1.055*np.power(c,1/2.4)-.055);emission.colorspace_settings.name='sRGB';emission.pixels.foreach_set(e.ravel());emission.pack();orm.pack()
# Point the hull material at the new unique-UV maps; keep glass constants.
m=ship.data.materials[0];nodes=m.node_tree.nodes;nodes.clear();links=m.node_tree.links
out=nodes.new('ShaderNodeOutputMaterial');shader=nodes.new('ShaderNodeBsdfPrincipled');links.new(shader.outputs[0],out.inputs['Surface'])
for img,input_name in [(base,'Base Color'),(emission,'Emission Color')]:
    tex=nodes.new('ShaderNodeTexImage');tex.image=img;links.new(tex.outputs['Color'],shader.inputs[input_name])
shader.inputs['Emission Strength'].default_value=1
tex=nodes.new('ShaderNodeTexImage');tex.image=orm;sep=nodes.new('ShaderNodeSeparateColor');sep.mode='RGB';links.new(tex.outputs['Color'],sep.inputs['Color']);links.new(sep.outputs['Green'],shader.inputs['Roughness']);links.new(sep.outputs['Blue'],shader.inputs['Metallic'])
# Delete the former material UVs so custom loader TEXCOORD_0 is the baked set.
ship.data.uv_layers.remove(ship.data.uv_layers[old_uv]);ship.data.uv_layers.active.name='UVMap'
for material in ship.data.materials[1:]:
    for node in list(material.node_tree.nodes):
        if node.name in ['Bake Target','Baking Surface','Baking ORM'] or node.type=='UVMAP':material.node_tree.nodes.remove(node)
bpy.ops.export_scene.gltf(filepath=str(ROOT/'.freebuff/wayfarer-rebuild/wayfarer.glb'),export_format='GLB',use_selection=True,export_yup=True,export_apply=True,export_image_format='AUTO')
result={'color':[2048,2048],'material':[1024,1024],'emission':[512,512],'samples':scene.cycles.samples,'meanAO':float(cavity[:,:,:1].mean())}
(ROOT/'docs/wayfarer-rebuild/surface-bake.json').write_text(json.dumps(result,indent=2))
