"""Review actual downloaded/exported GLBs, using a fixed local neutral camera.
No procedural source materials remain on the imported runtime objects.
"""
import bpy, os, json
BASE=os.environ.get('SCONCE_OUT',os.path.dirname(os.path.abspath(__file__)))
def render(glb,dest,lod=None):
 bpy.ops.wm.open_mainfile(filepath=BASE+'/cloud-source.blend')
 scene=bpy.context.scene;camera=scene.camera
 for obj in list(bpy.data.objects):
  if obj.type not in ['CAMERA','LIGHT']:bpy.data.objects.remove(obj,do_unlink=True)
 before=set(bpy.data.objects);bpy.ops.import_scene.gltf(filepath=glb)
 imported=set(bpy.data.objects)-before
 for obj in list(imported):
  if obj.type in ['CAMERA','LIGHT']:imported.remove(obj);bpy.data.objects.remove(obj,do_unlink=True)

 for obj in imported:
  if obj.type=='MESH' and lod is not None:obj.hide_render=obj.get('lod',-1)!=lod
 scene.camera=camera;scene.render.engine='CYCLES';scene.cycles.samples=24;scene.cycles.use_denoising=True
 scene.view_settings.view_transform='AgX';scene.render.resolution_x=640;scene.render.resolution_y=800;scene.render.resolution_percentage=100
 scene.render.image_settings.file_format='PNG';scene.render.image_settings.media_type='IMAGE';scene.render.filepath=BASE+'/'+dest
 bpy.ops.render.render(write_still=True)
render(BASE+'/cloud-source.glb','cloud-glb-review.png')
render(BASE+'/sconce-pilot-fallback-decoded-qa.glb','fallback-lod0-review.png',0)
for lod in range(3):render(BASE+'/sconce-pilot-decoded-qa.glb','compressed-lod%d-review.png'%lod,lod)
