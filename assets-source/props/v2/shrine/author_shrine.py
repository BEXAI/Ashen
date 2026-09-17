"""Original Ember Shrine A02. Blender Z-up, exported glTF +Y-up, metres.
No catalog input or external textures. Local bake is derived from committed .blend.
"""
import bpy, bmesh, math, random, json, os
from mathutils import Vector
for o in list(bpy.data.objects):bpy.data.objects.remove(o,do_unlink=True)
scene=bpy.context.scene;scene.unit_settings.system='METRIC';scene.unit_settings.scale_length=1
root=bpy.data.objects.new('EmberShrine',None);scene.collection.objects.link(root)
root['asset_id']='A02_ember_shrine';root['source']='Original authored geometry; no catalog or external texture input';root['metres_per_unit']=1
parts=[];random.seed(2402)

def mat(name,base,metal,rough,role='stone'):
 m=bpy.data.materials.new(name);m.use_nodes=True;m.diffuse_color=(*base,1);m['surface_role']=role
 n=m.node_tree.nodes;l=m.node_tree.links;p=n.get('Principled BSDF');p.inputs['Base Color'].default_value=(*base,1);p.inputs['Metallic'].default_value=metal;p.inputs['Roughness'].default_value=rough
 geo=n.new('ShaderNodeNewGeometry');noise=n.new('ShaderNodeTexNoise');noise.inputs['Scale'].default_value=4 if role=='stone' else 15;noise.inputs['Detail'].default_value=4;noise.inputs['Roughness'].default_value=.76;l.new(geo.outputs['Position'],noise.inputs['Vector'])
 ramp=n.new('ShaderNodeValToRGB');ramp.color_ramp.elements[0].position=.12;ramp.color_ramp.elements[0].color=(*(v*.60 for v in base),1);ramp.color_ramp.elements[1].position=.9;ramp.color_ramp.elements[1].color=(*(min(.8,v*1.36) for v in base),1);l.new(noise.outputs['Fac'],ramp.inputs[0]);l.new(ramp.outputs['Color'],p.inputs['Base Color'])
 micro=n.new('ShaderNodeTexNoise');micro.inputs['Scale'].default_value=85 if role=='stone' else 130;micro.inputs['Detail'].default_value=2;l.new(geo.outputs['Position'],micro.inputs['Vector']);b=n.new('ShaderNodeBump');b.inputs['Distance'].default_value=.007 if role=='stone' else .0015;b.inputs['Strength'].default_value=.30;l.new(micro.outputs['Fac'],b.inputs['Height']);l.new(b.outputs['Normal'],p.inputs['Normal'])
 rr=n.new('ShaderNodeMapRange');rr.inputs['To Min'].default_value=rough-.10;rr.inputs['To Max'].default_value=min(.99,rough+.08);l.new(noise.outputs['Fac'],rr.inputs[0]);l.new(rr.outputs[0],p.inputs['Roughness']);return m
stone=mat('Weathered basalt sandstone',(.24,.229,.202),0,.84)
edge=mat('Cut lighter stone edges',(.305,.287,.244),0,.80)
iron=mat('Dark forged binding',(.068,.057,.044),.84,.46,'iron')
ember=bpy.data.materials.new('Recessed ember channels');ember.use_nodes=True;ember['surface_role']='ember';ember.diffuse_color=(.08,.027,.007,1)
p=ember.node_tree.nodes.get('Principled BSDF');p.inputs['Base Color'].default_value=(.07,.052,.032,1);p.inputs['Roughness'].default_value=.76;p.inputs['Emission Color'].default_value=(.52,.13,.025,1)
n=ember.node_tree.nodes.new('ShaderNodeTexNoise');n.inputs['Scale'].default_value=42;n.inputs['Detail'].default_value=2;rr=ember.node_tree.nodes.new('ShaderNodeMapRange');rr.inputs['To Min'].default_value=.38;rr.inputs['To Max'].default_value=.8;ember.node_tree.links.new(n.outputs['Fac'],rr.inputs[0]);ember.node_tree.links.new(rr.outputs[0],p.inputs['Emission Strength'])

def mesh(name,verts,faces,material=stone,bevel=0):
 data=bpy.data.meshes.new(name+' geometry');data.from_pydata(verts,[],faces);data.update();bm=bmesh.new();bm.from_mesh(data);bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces));bm.to_mesh(data);bm.free()
 o=bpy.data.objects.new(name,data);scene.collection.objects.link(o);o.parent=root;o.data.materials.append(material);o['surface_role']='ember' if material==ember else 'body';parts.append(o)
 if bevel:
  mod=o.modifiers.new('Worn carved edge bevel','BEVEL');mod.width=bevel;mod.segments=2
  mod=o.modifiers.new('Stone weighted highlights','WEIGHTED_NORMAL');mod.keep_sharp=True
 return o

def lathe(name,profile,segments=48,material=stone,bevel=0,phase=0,closed=False):
 vs=[(r*math.cos(2*math.pi*j/segments+phase),r*math.sin(2*math.pi*j/segments+phase),z) for r,z in profile for j in range(segments)];fs=[]
 for k in range(len(profile)-1):
  for j in range(segments):q=(j+1)%segments;fs.append((k*segments+j,k*segments+q,(k+1)*segments+q,(k+1)*segments+j))

 if closed:
  for j in range(segments):q=(j+1)%segments;fs.append(((len(profile)-1)*segments+j,(len(profile)-1)*segments+q,q,j))
 else:fs.extend([tuple(range(segments-1,-1,-1)),tuple((len(profile)-1)*segments+j for j in range(segments))])
 return mesh(name,vs,fs,material,bevel)

lathe('Ground contact foundation',[(1.63,0),(1.72,.055),(1.72,.115),(1.67,.15)],32,stone,.012)
# Eight separate wedge stones with narrow radial joints and chipped irregular edges.
for k in range(8):
 mid=k*math.tau/8;angles=[mid-math.pi/8+.009+i*(math.pi/4-.018)/4 for i in range(5)];vs=[]
 for z,rin,rout in [(.125,.61,1.70),(.335,.61,1.66)]:
  for r in [rin,rout]:
   for j,a in enumerate(angles):vs.append((r*math.cos(a),r*math.sin(a),z+(random.uniform(-.006,.006) if z>.2 else 0)))
 fs=[]
 for j in range(4):fs.extend([(j,j+1,6+j,5+j),(10+j,15+j,16+j,11+j),(j,10+j,11+j,j+1),(5+j,6+j,16+j,15+j)])
 fs.extend([(0,5,15,10),(4,14,19,9)]);mesh('Worn radial footing stone %02d'%k,vs,fs,edge if k%3==0 else stone,.018)
lathe('Inset octagonal upper step',[(1.37,.32),(1.46,.37),(1.46,.43),(1.32,.52)],16,edge,.012,math.pi/16)
lathe('Octagonal altar foot',[(.90,.49),(1.01,.57),(.96,.64),(.86,.67)],8,stone,.012,math.pi/8)
lathe('Carved eight-face altar drum',[(.765,.64),(.77,.73),(.74,1.22),(.82,1.29)],8,stone,.012,math.pi/8)
lathe('Lower incised binding',[(.806,.74),(.823,.76),(.823,.79),(.805,.81)],16,iron,.004,math.pi/16)
lathe('Carved capital and drip edge',[(.83,1.24),(1.00,1.32),(1.04,1.38),(.98,1.435)],16,edge,.009,math.pi/16)
# A real hollow carved bowl. Outer rim height leaves the original flame origin free.
lathe('Hollow offering bowl',[(.76,1.40),(.92,1.48),(1.065,1.64),(1.07,1.72),(.94,1.72),(.83,1.59),(.50,1.50)],48,stone,.008)
lathe('Forged upper offering rim',[(1.054,1.675),(1.102,1.69),(1.105,1.73),(1.063,1.752),(.95,1.752),(.941,1.714)],48,iron,.004,closed=True)
# Four structural stone knees carry the capital into the base; no added gameplay collision.
for k in range(4):
 a=math.pi/4+k*math.pi/2;radial=Vector((math.cos(a),math.sin(a),0));side=Vector((-math.sin(a),math.cos(a),0));profile=[(.71,.52),(.97,.54),(.98,.70),(.83,.91),(.72,1.26),(.65,1.20)];vs=[]
 for w in [-.095,.095]:
  for r,z in profile:vs.append(tuple(radial*r+side*w+Vector((0,0,z))))
 n=len(profile);fs=[tuple(range(n-1,-1,-1)),tuple(n+i for i in range(n))]
 for i in range(n):j=(i+1)%n;fs.append((i,j,n+j,n+i))
 mesh('Carved shoulder support %d'%k,vs,fs,edge,.010)
# Recessed angular inset panel frames. Broad quiet faces carry small original runes.
for k in range(8):
 a=k*math.pi/4;radial=Vector((math.cos(a),math.sin(a),0));tangent=Vector((-math.sin(a),math.cos(a),0))
 def panel_point(u,z,r=.718):return tuple(radial*r+tangent*u+Vector((0,0,z)))
 outline=[(-.15,.84),(-.15,1.15),(-.10,1.20),(.10,1.20),(.15,1.15),(.15,.84)]
 inside=[(-.119,.86),(-.119,1.135),(-.082,1.17),(.082,1.17),(.119,1.135),(.119,.86)]
 vs=[panel_point(u,z,.721) for u,z in outline]+[panel_point(u,z,.723) for u,z in inside];fs=[(6+j,6+(j+1)%6,(j+1)%6,j) for j in range(6)];mesh('Stone relief panel %02d'%k,vs,fs,edge,0)
 # A different branch order breaks literal repeated iconography while keeping one style.
 paths=[[(-.055,.9),(0,1.13),(.064,1.055)],[(0,.98),(-.071,1.045)],[(.027,1.045),(.09,.944)]]
 for j,path in enumerate(paths):
  vs=[]
  for i,(u,z) in enumerate(path):
   prev=Vector(path[max(0,i-1)]);nxt=Vector(path[min(len(path)-1,i+1)]);d=(nxt-prev).normalized();off=Vector((-d.y,d.x))*.0115
   for sign in [-1,1]:vs.append(panel_point(u+sign*off.x,z+sign*off.y,.726))
  fs=[(2*i+2,2*i+3,2*i+1,2*i) for i in range(len(path)-1)];o=mesh('Inset ember rune %02d stroke %d'%(k,j),vs,fs,ember,0)
 # Small forged clamps cross the bowl lip, not the flame opening.
 a+=math.pi/8;radial=Vector((math.cos(a),math.sin(a),0));tangent=Vector((-math.sin(a),math.cos(a),0));vs=[]
 for r,z in [(1.075,1.60),(1.122,1.68),(1.113,1.754),(.946,1.776)]:
  for w in [-.032,.032]:vs.append(tuple(radial*r+tangent*w+Vector((0,0,z))))
 mesh('Forged bowl clasp %02d'%k,vs,[(2*i,2*i+1,2*i+3,2*i+2) for i in range(3)],iron,.002)
# Narrow continuous channels are emissive geometry, never painted orange spill.
for name,r,z in [('Lower ember circuit',.823,.795),('Upper ember circuit',.835,1.605)]:
 vs=[]
 for zz in [z-.008,z+.008]:
  for j in range(48):a=j*math.tau/48;vs.append((r*math.cos(a),r*math.sin(a),zz))
 mesh(name,vs,[(j,(j+1)%48,48+(j+1)%48,48+j) for j in range(48)],ember,0)
# Low ash/coals surface remains below the flame. No literal flame or runtime light is authored.
lathe('Ember bed inset',[(.44,1.498),(.54,1.515),(.49,1.54)],32,ember,0)
for name,loc in [('Ground',(0,0,0)),('FlameOrigin',(0,0,1.9)),('LightOrigin',(0,0,2.2)),('EmberCore',(0,0,1.54))]:
 o=bpy.data.objects.new(name,None);scene.collection.objects.link(o);o.parent=root;o.location=loc;o['semantic_anchor']=True;o.empty_display_size=.09
# Only review cameras/lights outside the asset root. Runtime export strips them all.
world=bpy.data.worlds.new('Neutral shrine review environment');world.use_nodes=True;world.node_tree.nodes['Background'].inputs[0].default_value=(.22,.24,.27,1);world.node_tree.nodes['Background'].inputs[1].default_value=.55;scene.world=world
for name,loc,power,radius,color in [('Key',(-4,-5,6),1050,2,(1,.9,.76)),('Fill',(4,-2,3),650,2,(.74,.85,1)),('Rim',(1,4,5),950,1.5,(1,.91,.79))]:
 d=bpy.data.lights.new('Review '+name,'POINT');d.energy=power;d.shadow_soft_size=radius;d.color=color;o=bpy.data.objects.new('Review '+name,d);scene.collection.objects.link(o);o.location=loc
camera=bpy.data.cameras.new('Shrine delivery camera');cam=bpy.data.objects.new('Shrine delivery camera',camera);scene.collection.objects.link(cam);cam.location=(4.5,-6.5,4.8);cam.rotation_euler=(Vector((0,0,.8))-cam.location).to_track_quat('-Z','Y').to_euler();camera.type='ORTHO';camera.ortho_scale=4.55;scene.camera=cam
scene.render.engine='BLENDER_EEVEE';scene.render.resolution_x=768;scene.render.resolution_y=768;scene.render.resolution_percentage=100;scene.render.image_settings.media_type='IMAGE';scene.render.image_settings.file_format='PNG';scene.view_settings.view_transform='AgX'
bpy.context.view_layer.update();dg=bpy.context.evaluated_depsgraph_get();points=[o.matrix_world@v.co for o in parts for v in o.evaluated_get(dg).data.vertices];lo=[min(v[i] for v in points) for i in range(3)];hi=[max(v[i] for v in points) for i in range(3)];triangles=0
for o in parts:m=o.evaluated_get(dg).to_mesh();m.calc_loop_triangles();triangles+=len(m.loop_triangles);o.evaluated_get(dg).to_mesh_clear()
result={'asset':'A02_ember_shrine','original_authorship':True,'source_meshes':len(parts),'evaluated_triangles':triangles,'bounds_gltf_size':[hi[0]-lo[0],hi[2]-lo[2],hi[1]-lo[1]],'bounds_blender_min':lo,'bounds_blender_max':hi,'anchors_gltf':{'Ground':[0,0,0],'FlameOrigin':[0,1.9,0],'LightOrigin':[0,2.2,0],'EmberCore':[0,1.54,0]},'runtime_targets':{'triangles':[6000,3000,1200],'materials':2,'basecolor':1024,'normal_orm':512,'emissive':256},'bake_required':True}
print(json.dumps(result),flush=True)
if 'artifacts' in globals():
 target=artifacts.file(name='ember-shrine-source-review.png',media_type='image/png');scene.render.filepath=str(target.path);bpy.ops.render.render(write_still=True);target.publish()
elif os.environ.get('SHRINE_PREFLIGHT')=='1':
 scene.render.filepath='/tmp/ashen-shrine/preflight-review.png';bpy.ops.render.render(write_still=True);bpy.ops.wm.save_as_mainfile(filepath='/tmp/ashen-shrine/preflight.blend')
