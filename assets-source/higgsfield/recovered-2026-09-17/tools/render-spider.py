"""Render an existing GLB for asset QA without changing the source asset."""
import bpy
import json
import math
import sys
from pathlib import Path
from mathutils import Vector

model = Path(sys.argv[1]).resolve()
output = Path(sys.argv[2]).resolve()
gait = len(sys.argv)>3 and sys.argv[3]=='--gait'
output.mkdir(parents=True, exist_ok=True)
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=str(model))
scene = bpy.context.scene
if gait:
    for obj in scene.objects:
        if obj.type=='ARMATURE':
            obj.animation_data_create()
            for track in obj.animation_data.nla_tracks:track.mute=True
            obj.animation_data.action=bpy.data.actions['forward']
            obj.animation_data.action_slot=bpy.data.actions['forward'].slots[0]
scene.frame_set(0)
mesh_objects = [o for o in scene.objects if o.type == 'MESH' and len(o.data.materials)>0]
depsgraph = bpy.context.evaluated_depsgraph_get()
evaluated = [o.evaluated_get(depsgraph) for o in mesh_objects]
corners = [o.matrix_world @ Vector(c) for o in evaluated for c in o.bound_box]
low = Vector([min(v[a] for v in corners) for a in range(3)])
high = Vector([max(v[a] for v in corners) for a in range(3)])
center = (low + high) / 2
height = max(high.z-low.z, 0.1)
extent = max(high.x-low.x,high.y-low.y,height)
details = {
    'model': str(model),
    'blenderWorldBounds': {'min': list(low), 'max': list(high)},
    'meshes': [{'name': o.name, 'vertices': len(o.data.vertices), 'faces': len(o.data.polygons)} for o in mesh_objects],
    'bones': [{'armature': o.name, 'bones': [{'name': b.name, 'parent': b.parent.name if b.parent else None, 'head': list(b.head_local), 'tail': list(b.tail_local)} for b in o.data.bones]} for o in scene.objects if o.type=='ARMATURE'],
    'actions': [{'name': a.name, 'range': list(a.frame_range)} for a in bpy.data.actions],
    'images': [{'name': i.name, 'size': list(i.size), 'source': i.source} for i in bpy.data.images]
}
(output/'blender-inspection.json').write_text(json.dumps(details, indent=2))
scene.render.engine = 'CYCLES'
scene.cycles.device = 'CPU'
scene.cycles.samples = 16
scene.render.resolution_x = 800
scene.render.resolution_y = 1000
scene.render.resolution_percentage = 100
scene.render.image_settings.file_format = 'PNG'
scene.world = bpy.data.worlds.new('Neutral Studio')
scene.world.use_nodes = True
scene.world.node_tree.nodes['Background'].inputs[0].default_value = (0.11,0.13,0.16,1)
scene.world.node_tree.nodes['Background'].inputs[1].default_value = 0.6
scene.view_settings.view_transform = 'AgX'
if 'goblin-original' in model.name or 'ogre-original' in model.name:
    scene.view_settings.look = 'AgX - Medium High Contrast'
    scene.view_settings.exposure = -0.85
def aim(obj, target):
    obj.rotation_euler = (Vector(target)-obj.location).to_track_quat('-Z','Y').to_euler()
def light(name, pos, power, size, color):
    data = bpy.data.lights.new(name, 'AREA')
    data.energy = power*(height/2)**2
    data.shape = 'DISK'
    data.size = size
    data.color = color
    obj = bpy.data.objects.new(name, data)
    scene.collection.objects.link(obj)
    obj.location = Vector(pos)
    aim(obj, center)
light('Key', center+Vector((-height,-height*1.5,height)), 500, height*1.3, (1,.9,.8))
light('Fill', center+Vector((height,height*.2,height*.5)), 350, height*1.5, (.75,.85,1))
light('Rim', center+Vector((-height,height,height)), 600, height, (1,1,1))
bpy.ops.mesh.primitive_plane_add(size=height*200, location=(center.x, center.y, low.z-.001*height))
floor = bpy.context.object
mat = bpy.data.materials.new('Studio Floor')
mat.diffuse_color = (.04,.05,.065,1)
mat.use_nodes = True
mat.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value=(.04,.05,.065,1)
mat.node_tree.nodes['Principled BSDF'].inputs['Roughness'].default_value=.8
floor.data.materials.append(mat)
cam_data = bpy.data.cameras.new('Camera')
cam = bpy.data.objects.new('Camera',cam_data)
scene.collection.objects.link(cam)
scene.camera = cam
cam_data.type = 'ORTHO'
cam_data.ortho_scale = max(height,(high.x-low.x)/.8)*1.22
views=[('front',(0,-3,.08)),('back',(0,3,.08)),('threequarter',(2,-3,.2)),('top',(0,0,3))]
if gait:views=[('gait-'+str(frame),(1.5,-3,1.4)) for frame in [0,7,14,21]]
for name, offset in views:
    if gait:scene.frame_set(int(name.split('-')[1]))
    if name=='top':
        cam_data.ortho_scale=max(high.y-low.y,(high.x-low.x)/.8)*1.22
    cam.location = center+Vector(offset)*extent
    aim(cam,center)
    scene.render.filepath=str(output/(name+'.png'))
    bpy.ops.render.render(write_still=True)
if gait:
    import numpy as np
    panels=[]
    for name,_ in views:
        im=bpy.data.images.load(str(output/(name+'.png')),check_existing=False)
        data=np.empty(len(im.pixels),dtype=np.float32);im.pixels.foreach_get(data)
        panels.append(data.reshape((im.size[1],im.size[0],4)))
    sheet=np.concatenate((np.concatenate((panels[2],panels[3]),axis=1),np.concatenate((panels[0],panels[1]),axis=1)),axis=0)
    composed=bpy.data.images.new('Gait Contact Sheet',width=sheet.shape[1],height=sheet.shape[0])
    composed.pixels.foreach_set(sheet.ravel())
    composed.filepath_raw=str(output/'gait-contact-sheet.png');composed.file_format='PNG';composed.save()
print(json.dumps({'status':'rendered','output':str(output),'height':height}))
