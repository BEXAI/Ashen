"""Reimport actual runtime GLBs after decoding their meshopt and KTX2 data.
Use cloud source only for fixed review lights and camera, no source geometry/materials.
"""
import bpy,os
from mathutils import Vector
OUT=os.environ.get('KIT_OUT',os.path.dirname(os.path.abspath(__file__)))
def render(filename,dest,lod):
 bpy.ops.wm.open_mainfile(filepath=OUT+'/cloud-source.blend');scene=bpy.context.scene;camera=scene.camera
 for o in list(bpy.data.objects):
  if o.type not in ['CAMERA','LIGHT']:bpy.data.objects.remove(o,do_unlink=True)
 before=set(bpy.data.objects);bpy.ops.import_scene.gltf(filepath=OUT+'/'+filename);imported=set(bpy.data.objects)-before
 for o in imported:
  if o.type=='MESH':
   o.hide_render=o.get('lod',-1)!=lod
   # Add only the documented review arrangement in Blender coordinates.
   offset={'Arch':(0,0,0),'Pillar':(5.3,0,0),'Trim':(5.3,0,5.7)}[o['module']]
   o.location+=Vector(offset)
 scene.camera=camera;scene.render.engine='CYCLES';scene.cycles.samples=24;scene.cycles.use_denoising=True;scene.view_settings.view_transform='AgX';scene.render.resolution_x=896;scene.render.resolution_y=768;scene.render.resolution_percentage=100;scene.render.image_settings.file_format='PNG';scene.render.image_settings.media_type='IMAGE';scene.render.filepath=OUT+'/'+dest;bpy.ops.render.render(write_still=True)
render('architecture-kit-fallback-decoded-qa.glb','fallback-lod0-review.png',0)
for lod in range(3):render('architecture-kit-decoded-qa.glb','compressed-lod%d-review.png'%lod,lod)
