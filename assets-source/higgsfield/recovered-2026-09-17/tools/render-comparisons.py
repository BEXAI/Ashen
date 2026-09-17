"""Read-only neutral rendering of GLB originals and prior runtime geometry."""
import bpy, math, json, sys
from pathlib import Path
from mathutils import Vector
from PIL import Image,ImageDraw,ImageFont
ROOT=Path(__file__).resolve().parents[1]; CAN=ROOT.parent/'higgsfield-september-8-2026'; OUT=ROOT/'review';OUT.mkdir(exist_ok=True)
assets=json.loads((ROOT/'inventory.json').read_text())['assets']
slugs=sys.argv[1:] or [x['slug'] for x in assets]
font=ImageFont.truetype('/System/Library/Fonts/Supplemental/Arial.ttf',15)
def aim(obj,point):obj.rotation_euler=(Vector(point)-obj.location).to_track_quat('-Z','Y').to_euler()
def render(model,slug,label,direction):
 out=OUT/f'{slug}-{label}.png'
 if out.exists():return out,None
 bpy.ops.wm.read_factory_settings(use_empty=True);bpy.ops.import_scene.gltf(filepath=str(model));scene=bpy.context.scene
 for o in list(scene.objects):
  if o.animation_data:o.animation_data_clear()
  if o.type=='ARMATURE':o.data.pose_position='REST'
 scene.frame_set(0);bpy.context.view_layer.update();deps=bpy.context.evaluated_depsgraph_get();meshes=[o for o in scene.objects if o.type=='MESH' and o.visible_get() and not o.hide_render]
 # Canonical runtime exports may carry hidden duplicate LOD groups. Keep LOD0 only.
 for o in meshes:
  if any(f'LOD{i}' in o.name.upper() for i in [1,2]):o.hide_render=True
 visible=[o for o in meshes if not o.hide_render];pts=[o.evaluated_get(deps).matrix_world@Vector(c) for o in visible for c in o.evaluated_get(deps).bound_box];lo=Vector([min(v[a] for v in pts) for a in range(3)]);hi=Vector([max(v[a] for v in pts) for a in range(3)]);center=(lo+hi)/2;height=max(hi.z-lo.z,.001);scale=2/height
 parent=bpy.data.objects.new('QA_Normalize',None);scene.collection.objects.link(parent)
 for o in list(scene.objects):
  if o!=parent and o.parent is None:o.parent=parent
 parent.scale=(scale,)*3;parent.location=(-center.x*scale,-center.y*scale,-lo.z*scale)
 scene.render.engine='CYCLES';scene.cycles.device='CPU';scene.cycles.samples=8;scene.cycles.use_denoising=True;scene.render.threads_mode='FIXED';scene.render.threads=4;scene.render.resolution_x=320;scene.render.resolution_y=420;scene.render.resolution_percentage=100;scene.render.image_settings.file_format='PNG';scene.render.film_transparent=False
 scene.world=bpy.data.worlds.new('Neutral');scene.world.use_nodes=True;scene.world.node_tree.nodes['Background'].inputs[0].default_value=(.07,.085,.11,1);scene.world.node_tree.nodes['Background'].inputs[1].default_value=.7;scene.view_settings.view_transform='AgX';target=Vector((0,0,1))
 for name,pos,power,size in [('Key',(-3,-4,5),450,4),('Fill',(3,-1,2),260,4),('Rim',(-1,3,3),400,3)]:
  ld=bpy.data.lights.new(name,'AREA');ld.energy=power;ld.shape='DISK';ld.size=size;o=bpy.data.objects.new(name,ld);scene.collection.objects.link(o);o.location=pos;aim(o,target)
 c=bpy.data.cameras.new('Camera');o=bpy.data.objects.new('Camera',c);scene.collection.objects.link(o);scene.camera=o;c.type='ORTHO';c.ortho_scale=max(2.4,(hi.x-lo.x)*scale*1.45,(hi.y-lo.y)*scale*1.45);o.location=target+Vector(direction)*3;aim(o,target);scene.render.filepath=str(out);bpy.ops.render.render(write_still=True)
 return out,{'model':str(model),'preNormalizationBlenderBounds':{'min':list(lo),'max':list(hi)},'normalizationScale':scale,'cameraDirectionBlender':direction,'pose':'rest','note':'Each full model including equipment independently normalized to two units tall; runtime-added props absent.'}
notes=[]
for slug in slugs:
 panels=[]
 tripo=json.loads((ROOT/'jobs'/f'{slug}.json').read_text())['job_type'].startswith('tripo')
 front=(3,0,.08) if tripo else (0,-3,.08);quarter=(3,-2,.15) if tripo else (2,-3,.15);back=(-3,0,.08) if tripo else (0,3,.08)
 specs=[('aligned-front',front,ROOT/'models'/f'{slug}-original.glb'),('aligned-quarter',quarter,ROOT/'models'/f'{slug}-original.glb'),('prior-quarter',(2,-3,.15),CAN/'models'/f'{slug}-runtime.glb'),('aligned-back',back,ROOT/'models'/f'{slug}-original.glb')]
 for label,direction,model in specs:
  if not model.exists():raise FileNotFoundError(model)
  p,n=render(model,slug,label,direction);panels.append((label,p));
  if n:notes.append({'slug':slug,'panel':label,**n})
 sheet=Image.new('RGB',(1280,454),(17,22,29));d=ImageDraw.Draw(sheet)
 for i,(label,p) in enumerate(panels):sheet.paste(Image.open(p).convert('RGB'),(320*i,34));d.text((320*i+8,9),slug+' / '+label,font=font,fill='white')
 sheet.save(OUT/f'{slug}-comparison.jpg',quality=90)
 print(json.dumps({'reviewReady':slug,'path':str(OUT/f'{slug}-comparison.jpg')}),flush=True)
(OUT/'render-notes.json').write_text(json.dumps({'schemaVersion':1,'panels':notes},indent=2)+'\n')
