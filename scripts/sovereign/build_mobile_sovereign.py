"""Build a mobile-oriented static sovereign; never modifies source.
Run with a Python runtime providing bpy: this_file.py --source source.blend --out staging
Bake uses simplified geometry's original procedural materials, including tangent
normal shader detail. It is not a high-to-low geometry normal transfer or a rig.
"""
import bpy,bmesh,json,math,time,struct,argparse
from pathlib import Path
from mathutils import Vector
parser=argparse.ArgumentParser()
parser.add_argument('--source',type=Path,required=True,help='Unmodified sovereign_source.blend')
parser.add_argument('--out',type=Path,required=True,help='Output staging directory, separate from source')
args=parser.parse_args()
OUT=args.out.resolve();TEX=OUT/'textures';TEX.mkdir(parents=True,exist_ok=True)
SIZE=2048
bpy.ops.wm.open_mainfile(filepath=str(args.source.resolve()))
scene=bpy.context.scene
scene.render.engine='CYCLES';scene.cycles.samples=4;scene.cycles.use_denoising=False
scene.render.threads_mode='FIXED';scene.render.threads=4
scene.render.bake.margin=8;scene.render.bake.use_clear=True;scene.render.bake.use_selected_to_active=False
scene.render.bake.target='IMAGE_TEXTURES'
sources=[o for o in scene.objects if o.type in {'MESH','CURVE'} and o.get('asset_character')]
dg=bpy.context.evaluated_depsgraph_get();copies=[];report=[]
def budget(n,t):
 if 'anatomical armored boot' in n:return 0
 if 'anatomical padded body' in n:return 2200
 if 'floor length' in n:return 2300
 if 'gathered oxblood' in n:return 950
 if 'hand and finger' in n:return 550
 if 'gorget' in n:return 600
 if 'crown blade' in n:return 135
 if 'shoulder defense' in n:return 110
 if 'closed shaped sabaton' in n:return 500
 if 'closed helmet dome' in n:return 650
 if 'rounded overlapping pauldron' in n:return 410
 if 'inset molten fracture' in n:return 42
 if 'individual obsidian' in n:return 170
 if 'narrow recessed amber eye' in n:return 90
 if 'cheek and jaw' in n or 'brow and temple' in n or 'nasal ridge' in n:return 160
 if 'riv' in n or 'stud' in n:return 24
 if 'end cap' in n:return 18
 if 'edge' in n or 'hem' in n or 'selvage' in n or 'ridge' in n or 'scoring' in n or 'flute' in n:return max(24,min(90,round(t*.12)))
 if 'strap' in n:return 90
 return max(40,min(440,round(t*.11)))
def tri(m):return sum(len(p.vertices)-2 for p in m.polygons)
for i,s in enumerate(sources):
 ev=s.evaluated_get(dg);data=bpy.data.meshes.new_from_object(ev,depsgraph=dg)
 original=tri(data);target=round(budget(s.name,original)*.55)
 if target==0:
  bpy.data.meshes.remove(data);s.hide_render=True;s.hide_set(True);report.append({'name':s.name,'before':original,'after':0,'reason':'redundant inner boot beneath closed sabaton'});continue
 data.transform(s.matrix_world)
 if 'anatomical padded body' in s.name:
  bm=bmesh.new();bm.from_mesh(data)
  bmesh.ops.delete(bm,geom=[f for f in bm.faces if f.calc_center_median().z<.135],context='FACES')
  bm.to_mesh(data);bm.free();data.update()
 o=bpy.data.objects.new('Mobile '+s.name,data);scene.collection.objects.link(o)
 bpy.ops.object.select_all(action='DESELECT');o.select_set(True);bpy.context.view_layer.objects.active=o
 if tri(data)>target:
  d=o.modifiers.new('Feature budget collapse','DECIMATE');d.ratio=target/tri(data);d.use_collapse_triangulate=True
  bpy.ops.object.modifier_apply(modifier=d.name)
 # Explicit triangulation fixes tangent basis across glTF export.
 d=o.modifiers.new('Portable triangles','TRIANGULATE');bpy.ops.object.modifier_apply(modifier=d.name)
 attr=o.data.attributes.new(name='_PART',type='FLOAT',domain='POINT')
 for v in attr.data:v.value=float(i)
 report.append({'name':s.name,'part_index':i,'before':original,'target':target,'after':tri(o.data)})
 copies.append(o);s.hide_render=True;s.hide_set(True)
 if i%25==0:print('SIMPLIFY',i,len(sources),flush=True)
bpy.ops.object.select_all(action='DESELECT')
for o in copies:o.select_set(True)
bpy.context.view_layer.objects.active=copies[0];bpy.ops.object.join();asset=bpy.context.object
asset.name='Ember_Sovereign_Mobile_Static';asset.data.name=asset.name
# Frozen world coordinates retain source Object-coordinate noise placement.
# Joining resets individual Object coordinates: source builders place most mesh
# data in world coordinates, while small rivets have object-space materials.
bpy.ops.object.mode_set(mode='EDIT');bpy.ops.mesh.select_all(action='SELECT')
bpy.ops.uv.smart_project(angle_limit=math.radians(66),island_margin=.0035,area_weight=1,correct_aspect=True,scale_to_bounds=True)
bpy.ops.object.mode_set(mode='OBJECT')
asset.data.uv_layers.active.name='Sovereign_PBR_Atlas'
for uv in list(asset.data.uv_layers):
 if uv.name!='Sovereign_PBR_Atlas':asset.data.uv_layers.remove(uv)
materials=list(set(m for m in asset.data.materials if m));saved=[]
for m in materials:
 m.use_nodes=True;n=m.node_tree.nodes
 o=next(n for n in n if n.type=='OUTPUT_MATERIAL' and n.is_active_output)
 p=next(n for n in n if n.type=='BSDF_PRINCIPLED')
 saved.append((m,o,p,o.inputs['Surface'].links[0].from_socket))
max_emission=max(1.,max(p.inputs['Emission Strength'].default_value for m,o,p,s in saved))
def bake(name,mode,srgb=False):
 im=bpy.data.images.new('Sovereign_'+name,width=SIZE if name=='base_color' else 1024,height=SIZE if name=='base_color' else 1024,alpha=False)
 im.colorspace_settings.name='sRGB' if srgb else 'Non-Color';im.filepath_raw=str(TEX/(name+'.png'));im.file_format='PNG'
 temps=[]
 for m,out,p,orig in saved:
  n=m.node_tree.nodes;l=m.node_tree.links;t=n.new('ShaderNodeTexImage');t.image=im;n.active=t;new=[t]
  if mode!='NORMAL':
   e=n.new('ShaderNodeEmission');new.append(e)
   if name=='metallic_roughness':
    c=n.new('ShaderNodeCombineXYZ');new.append(c);c.inputs[0].default_value=1
    for dst,src in [(c.inputs[1],p.inputs['Roughness']),(c.inputs[2],p.inputs['Metallic'])]:
     if src.is_linked:l.new(src.links[0].from_socket,dst)
     else:dst.default_value=src.default_value
    l.new(c.outputs[0],e.inputs[0])
   else:
    src=p.inputs['Base Color' if name=='base_color' else 'Emission Color']
    if src.is_linked:l.new(src.links[0].from_socket,e.inputs[0])
    else:e.inputs[0].default_value=src.default_value
    if name=='emission':e.inputs['Strength'].default_value=p.inputs['Emission Strength'].default_value/max_emission
   l.new(e.outputs[0],out.inputs['Surface'])
  temps.append((m,out,orig,new))
 scene.render.bake.margin=2 if name=='emission' else (3 if name!='base_color' else 6)
 print('BAKE_START',name,flush=True);bpy.ops.object.bake(type=mode);im.save();print('BAKE_DONE',name,flush=True)
 for m,out,orig,new in temps:
  m.node_tree.links.new(orig,out.inputs['Surface'])
  for n in new:m.node_tree.nodes.remove(n)
 return im
textures={}
for name,mode,srgb in [('base_color','EMIT',True),('metallic_roughness','EMIT',False),('normal','NORMAL',False),('emission','EMIT',True)]:textures[name]=bake(name,mode,srgb)
portable=bpy.data.materials.new('Ember Sovereign | mobile atlas');portable.use_nodes=True
n=portable.node_tree.nodes;l=portable.node_tree.links;p=n.get('Principled BSDF')
for label,im in textures.items():
 t=n.new('ShaderNodeTexImage');t.image=im;t.name=label;t.label=label
 if label=='base_color':l.new(t.outputs['Color'],p.inputs['Base Color'])
 elif label=='metallic_roughness':
  sep=n.new('ShaderNodeSeparateColor');sep.mode='RGB';l.new(t.outputs['Color'],sep.inputs['Color']);l.new(sep.outputs['Green'],p.inputs['Roughness']);l.new(sep.outputs['Blue'],p.inputs['Metallic'])
 elif label=='normal':
  nor=n.new('ShaderNodeNormalMap');l.new(t.outputs['Color'],nor.inputs['Color']);l.new(nor.outputs['Normal'],p.inputs['Normal'])
 else:l.new(t.outputs['Color'],p.inputs['Emission Color']);p.inputs['Emission Strength'].default_value=max_emission
asset.data.materials.clear();asset.data.materials.append(portable)
for poly in asset.data.polygons:poly.material_index=0
asset['status']='Mobile-oriented static mesh; unrigged; no animation clips; game performance unmeasured'
asset['source']='CC0 Dan Ulrich anatomical foundation + original procedural armor and garments'
asset['bake']='2048px atlases; shader-detail normal bake on decimated geometry, no geometry high-to-low transfer'
for s in sources:bpy.data.objects.remove(s,do_unlink=True)
bpy.ops.object.select_all(action='DESELECT');asset.select_set(True);bpy.context.view_layer.objects.active=asset
coords=[asset.matrix_world@v.co for v in asset.data.vertices]
bounds=[[min(v[k] for v in coords) for k in range(3)],[max(v[k] for v in coords) for k in range(3)]]
print('EXPORT_START',tri(asset.data),flush=True)
glb=OUT/'ember-sovereign-mobile.glb'
bpy.ops.export_scene.gltf(filepath=str(glb),export_format='GLB',use_selection=True,export_apply=True,export_animations=False,export_cameras=False,export_lights=False,export_yup=True,export_extras=True,export_tangents=True,export_attributes=True)
for im in textures.values():im.pack()
bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'ember-sovereign-mobile.blend'))
meta={'source_triangles':sum(r['before'] for r in report),'optimized_triangles':tri(asset.data),'geometry_vertices':len(asset.data.vertices),'source_parts':len(sources),'merged_meshes':1,'materials':1,'size_bytes':glb.stat().st_size,'atlas_size':SIZE,'texture_files':{k:str(v.filepath_raw) for k,v in textures.items()},'bounds_blender_z_up':bounds,'emission_strength':max_emission,'rigged':False,'animated':False,'game_performance_tested':False,'normal_bake':'Shader bump detail baked on reduced geometry; not high-to-low geometry transfer','scope':'Static visual upgrade based on pre-existing sovereign model, not exact reconstruction of user reference','removed_geometry':'Redundant inner boots and underarmor feet below ankle, covered by closed metal sabatons'}
(OUT/'geometry_budget.json').write_text(json.dumps(report,indent=2))
(OUT/'metrics.json').write_text(json.dumps(meta,indent=2))
# Validate actual GLB JSON and reimport the deliverable for review.
blob=glb.read_bytes();jlen,jtype=struct.unpack_from('<II',blob,12);g=json.loads(blob[20:20+jlen])
reimport_stats={'meshes':len(g.get('meshes',[])),'materials':len(g.get('materials',[])),'primitives':sum(len(m['primitives']) for m in g['meshes']),'triangles':sum(g['accessors'][p['indices']]['count']//3 for m in g['meshes'] for p in m['primitives']),'exported_vertices':sum(g['accessors'][p['attributes']['POSITION']]['count'] for m in g['meshes'] for p in m['primitives']),'embedded_images':len(g.get('images',[])),'all_images_embedded':all('bufferView' in i for i in g.get('images',[])),'textures':g.get('textures',[]),'material':g.get('materials',[]),'skins':len(g.get('skins',[])),'animations':len(g.get('animations',[])),'external_uris':[x['uri'] for cat in ('buffers','images') for x in g.get(cat,[]) if 'uri' in x]}
(OUT/'glb_validation.json').write_text(json.dumps(reimport_stats,indent=2))
bpy.data.objects.remove(asset,do_unlink=True)
bpy.ops.import_scene.gltf(filepath=str(glb))
imported=[o for o in bpy.context.selected_objects if o.type=='MESH']
assert len(imported)==1 and reimport_stats['materials']==1 and reimport_stats['triangles']<=25000
assert reimport_stats['all_images_embedded'] and not reimport_stats['external_uris']
assert reimport_stats['embedded_images']==4 and glb.stat().st_size<=8_000_000
scene.cycles.samples=24;scene.cycles.use_denoising=True;scene.render.resolution_x=750;scene.render.resolution_y=1100;scene.render.resolution_percentage=100
cam=scene.camera;cam.data.ortho_scale=2.48
for label,loc,target in [('three-quarter',(2.4,-7,2.5),(0,-.015,1.12)),('front',(0,-7,1.5),(0,-.025,1.12)),('rear',(2,6,2.3),(0,.02,1.10))]:
 cam.location=loc;cam.rotation_euler=(Vector(target)-cam.location).to_track_quat('-Z','Y').to_euler();scene.render.filepath=str(OUT/(label+'.png'));bpy.ops.render.render(write_still=True);print('RENDERED',label,flush=True)
print('COMPLETE',json.dumps(meta),flush=True)
