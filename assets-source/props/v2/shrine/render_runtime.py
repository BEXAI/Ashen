"""Reimport actual shipped variants after Meshopt/KTX2 decode for visual QA."""
import bpy,os,json
BASE=os.environ.get('SHRINE_OUT',os.path.dirname(os.path.abspath(__file__)))
def render(glb,dest,lod=None,state=None):
 bpy.ops.wm.open_mainfile(filepath=BASE+'/cloud-source.blend');scene=bpy.context.scene;camera=scene.camera
 for obj in list(bpy.data.objects):
  if obj.type not in ['CAMERA','LIGHT']:bpy.data.objects.remove(obj,do_unlink=True)
 before=set(bpy.data.objects);bpy.ops.import_scene.gltf(filepath=glb);imported=set(bpy.data.objects)-before
 for obj in imported:
  if obj.type=='MESH' and lod is not None:obj.hide_render=obj.get('lod_index',-1)!=lod
 if state is not None:
  material=next(m for m in bpy.data.materials if m.get('runtime_state_controlled'))
  p=next(n for n in material.node_tree.nodes if n.type=='BSDF_PRINCIPLED')
  if state=='off':p.inputs['Emission Strength'].default_value=0
  if state=='cyan':
   # Change only the imported emissive material's factor, preserving neutral map.
   for n in material.node_tree.nodes:
    if n.type=='MIX' and n.data_type=='RGBA':n.inputs[7].default_value=(.04,.8,1,1)
    elif n.type=='MIX_RGB':n.inputs[2].default_value=(.04,.8,1,1)
 scene.camera=camera;scene.render.engine='CYCLES';scene.cycles.samples=16;scene.cycles.use_denoising=True;scene.view_settings.view_transform='AgX'
 scene.render.resolution_x=768;scene.render.resolution_y=768;scene.render.resolution_percentage=100;scene.render.image_settings.file_format='PNG';scene.render.image_settings.media_type='IMAGE';scene.render.filepath=BASE+'/'+dest
 bpy.ops.render.render(write_still=True)
render(BASE+'/cloud-source.glb','cloud-glb-review.png')
render(BASE+'/ember-shrine-fallback-decoded-qa.glb','fallback-lod0-review.png',0)
for lod in range(3):render(BASE+'/ember-shrine-compressed-decoded-qa.glb','compressed-lod%d-review.png'%lod,lod)
render(BASE+'/ember-shrine-compressed-decoded-qa.glb','compressed-off-review.png',0,'off')
render(BASE+'/ember-shrine-compressed-decoded-qa.glb','compressed-cyan-review.png',0,'cyan')
