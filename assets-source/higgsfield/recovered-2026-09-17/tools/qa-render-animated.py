"""Render exact decoded delivery clips with runtime ground-curve offsets."""
import bpy,json,math,sys,hashlib
from pathlib import Path
from mathutils import Vector
from PIL import Image,ImageDraw,ImageFont
ROOT=Path(__file__).resolve().parents[1]
config=json.loads((ROOT/'runtime-config.json').read_text());grounding=json.loads((ROOT/'runtime-grounding.json').read_text());summary=json.loads((ROOT/'runtime-build-summary.json').read_text());summaries={x['slug']:x for x in summary['models']}
if (ROOT/'spider-manifest-entry.json').exists():
 config['spider']=json.loads((ROOT/'spider-manifest-entry.json').read_text());grounding.update(json.loads((ROOT/'spider-grounding.json').read_text()));summaries['spider']={'restBounds':json.loads((ROOT/'spider-grounding-qa.json').read_text())['variants']['mobile']['restBounds']}
if (ROOT/'dragon-runtime-build-summary.json').exists():
 summaries.update({x['slug']:x for x in json.loads((ROOT/'dragon-runtime-build-summary.json').read_text())['models']});grounding.update(json.loads((ROOT/'dragon-runtime-grounding.json').read_text()))
if (ROOT/'reaper-manifest-entry.json').exists():
 config['reaper']=json.loads((ROOT/'reaper-manifest-entry.json').read_text());grounding.update(json.loads((ROOT/'reaper-grounding.json').read_text()));summaries['reaper']={'restBounds':json.loads((ROOT/'reaper-build-summary.json').read_text())['bounds']}
if (ROOT/'ranger-manifest-entry.json').exists():
 config['ranger']=json.loads((ROOT/'ranger-manifest-entry.json').read_text());grounding.update(json.loads((ROOT/'ranger-grounding.json').read_text()));summaries['ranger']={'restBounds':json.loads((ROOT/'ranger-build-summary.json').read_text())['bounds']}
font=ImageFont.truetype('/System/Library/Fonts/Supplemental/Arial.ttf',16)
def aim(o,p):o.rotation_euler=(Vector(p)-o.location).to_track_quat('-Z','Y').to_euler()
def bounds(meshes):
 deps=bpy.context.evaluated_depsgraph_get();lo=Vector((math.inf,)*3);hi=-lo
 for o in meshes:
  e=o.evaluated_get(deps);m=e.to_mesh()
  for v in m.vertices:
   p=e.matrix_world@v.co
   for i in range(3):lo[i]=min(lo[i],p[i]);hi[i]=max(hi[i],p[i])
  e.to_mesh_clear()
 return lo,hi
for slug in sys.argv[1:]:
 out=ROOT/'review/animated'/slug;binding=json.loads((out/'delivery-binding.json').read_text());durations={x['name']:x['duration']for x in binding['clips']};cfg=config[slug];ground=grounding[slug]
 bpy.ops.wm.read_factory_settings(use_empty=True);scene=bpy.context.scene;scene.render.fps=30;bpy.ops.import_scene.gltf(filepath=binding['decodedPath']);scene.frame_set(0)
 actors=list(scene.objects);meshes=[o for o in actors if o.type=='MESH' and o.visible_get() and not o.hide_render];arms=[o for o in actors if o.type=='ARMATURE']
 for o in actors:
  if o.animation_data:
   o.animation_data.action=None
   for t in o.animation_data.nla_tracks:t.mute=True
 for a in arms:a.data.pose_position='POSE'
 parent=bpy.data.objects.new('QA_RuntimeWrapper',None);scene.collection.objects.link(parent)
 for o in actors:
  if o.parent is None:o.parent=parent
 rest=summaries[slug]['restBounds'];scale=cfg['height']/rest['size'][1];parent.scale=(scale,)*3;parent.rotation_euler.z=cfg.get('yaw',0);parent.location.z=-ground['restMinY']*scale
 scene.render.engine='CYCLES';scene.cycles.device='CPU';scene.cycles.samples=12;scene.cycles.use_denoising=True;scene.render.threads_mode='FIXED';scene.render.threads=4;scene.render.resolution_x=360;scene.render.resolution_y=430;scene.render.resolution_percentage=100;scene.render.image_settings.file_format='PNG'
 scene.world=bpy.data.worlds.new('QA neutral');scene.world.use_nodes=True;scene.world.node_tree.nodes['Background'].inputs[0].default_value=(.08,.1,.13,1);scene.world.node_tree.nodes['Background'].inputs[1].default_value=.55;scene.view_settings.view_transform='AgX';target=Vector((0,0,1.3))
 for name,pos,power,size in [('Key',(-3,-4,5),500,4),('Fill',(3,-1,3),300,4),('Rim',(-1,3,4),450,3)]:
  d=bpy.data.lights.new(name,'AREA');d.energy=power;d.size=size;o=bpy.data.objects.new(name,d);scene.collection.objects.link(o);o.location=pos;aim(o,target)
 bpy.ops.mesh.primitive_plane_add(size=30,location=(0,0,-.025));floor=bpy.context.object;mat=bpy.data.materials.new('Floor');mat.diffuse_color=(.06,.07,.085,1);floor.data.materials.append(mat)
 d=bpy.data.cameras.new('Camera');camera=bpy.data.objects.new('Camera',d);scene.collection.objects.link(camera);scene.camera=camera;d.type='ORTHO';d.ortho_scale=4.25
 phases=cfg['contactPhase'];strikes=['side','diagonal','backhand','overhead'];samples=[('idle',.5),('forward',.5)]+[(s,sum(phases if isinstance(phases,list) else phases[s])/2)for s in strikes]+[('dodge',.5),('death',.85)]
 for clip in ['dodge','death']:
  values=ground['clips'][clip];worst=values.index(min(values))/(len(values)-1)
  if (clip,worst) not in samples:samples.append((clip,worst))
 if slug=='lion-knight':samples.extend([('dodge',.765625),('death',.5)])
 poses=[]
 for clip,phase in samples:
  action=bpy.data.actions.get(clip)
  if action is None:raise RuntimeError(f'{slug}: no {clip} action; got '+str([a.name for a in bpy.data.actions]))
  for arm in arms:
   arm.animation_data_create();arm.animation_data.action=action;arm.animation_data.action_slot=action.slots[0]
  t=durations[clip]*phase;frame=t*30;scene.frame_set(math.floor(frame),subframe=frame-math.floor(frame))
  ys=ground['clips'][clip];pos=phase*(len(ys)-1);low=math.floor(pos);high=min(low+1,len(ys)-1);minimum=ys[low]*(1-(pos-low))+ys[high]*(pos-low);correction=ground['restMinY']-minimum
  if clip in ['dodge','hit','death']:correction=max(0,correction)
  parent.location.z=(-ground['restMinY']+correction)*scale;parent.rotation_euler.z=cfg.get('yaw',0)+(cfg.get('strikeYaw',0) if clip in strikes else 0);bpy.context.view_layer.update();lo,hi=bounds(meshes)
  camera.location=target+Vector((2,-3,1.0))*3;aim(camera,target)
  if clip=='death':camera.location=Vector((3,-4,4));aim(camera,(0,0,.6))
  name=f'{clip}-{phase:.3f}';scene.render.filepath=str(out/(name+'.png'));bpy.ops.render.render(write_still=True)
  poses.append({'clip':clip,'phase':phase,'timeSeconds':t,'image':str(out/(name+'.png')),'worldBoundsBlender':{'min':list(lo),'max':list(hi)},'sampledGroundMinimum':minimum,'runtimeGroundCorrection':correction,'modelScale':scale})
 sheet=Image.new('RGB',(1440,464*math.ceil(len(poses)/4)),(17,22,29));draw=ImageDraw.Draw(sheet)
 for i,p in enumerate(poses):
  x=(i%4)*360;y=(i//4)*464;sheet.paste(Image.open(p['image']).convert('RGB'),(x,y+34));draw.text((x+6,y+9),f"{slug}: {p['clip']} {p['phase']:.3f}",font=font,fill='white')
 sheet.save(out/'pose-contact-sheet.jpg',quality=92)
 report={'slug':slug,'delivery':binding,'method':'Actual mobile delivery Meshopt+WebP decoded without geometry changes; bpy imported canonical animation actions. Runtime wrapper height/yaw/ground curves applied. Game-authored held props not included.','poses':poses,'notes':['Sampled poses, not continuous animation acceptance.','No device or browser GPU performance evidence.','Restored renderer grounding may differ slightly between uniform curve samples; bounds measured from actual bpy evaluated vertices.']};(out/'pose-review-evidence.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps({'slug':slug,'sheet':str(out/'pose-contact-sheet.jpg'),'minimumRenderedY':min(x['worldBoundsBlender']['min'][2]for x in poses)}),flush=True)
