"""Original Ashen Realm architectural kit. bpy 5.2, metres, no catalog inputs.
Arch clearance: local |X|<=3, 0<=Z<=6.8 contains no geometry.
Blender Z up/front -Y converts to glTF +Y up/front +Z.
Review layouts are source-only. Runtime restores each module's base-centre pivot.
"""
import bpy,math,random,json
from mathutils import Vector
random.seed(2909)
for obj in list(bpy.data.objects):bpy.data.objects.remove(obj,do_unlink=True)
scene=bpy.context.scene;scene.unit_settings.system='METRIC';scene.unit_settings.scale_length=1
kit=bpy.data.objects.new('AshenArchitectureKit_Source',None);scene.collection.objects.link(kit)
kit['authorship']='Original authored geometry; no catalog models or external textures';kit['runtime_note']='Bake actual PBR maps; restore per-module pivots; exclude review camera/lights.'
modules={};parts={}
for name,loc in [('Arch',(0,0,0)),('Pillar',(5.3,0,0)),('Trim',(5.3,0,5.7))]:
 o=bpy.data.objects.new(name,None);scene.collection.objects.link(o);o.parent=kit;o.location=loc;o['module']=name;o['pivot']='base centre';modules[name]=o;parts[name]=[]

def stone_material():
 m=bpy.data.materials.new('Ash limestone | neutral worn stone');m.use_nodes=True;n=m.node_tree.nodes;l=m.node_tree.links;p=n.get('Principled BSDF');p.inputs['Roughness'].default_value=.84;p.inputs['Base Color'].default_value=(.29,.275,.245,1)
 geo=n.new('ShaderNodeNewGeometry');fine=n.new('ShaderNodeTexNoise');fine.inputs['Scale'].default_value=25;fine.inputs['Detail'].default_value=2.5;l.new(geo.outputs['Position'],fine.inputs['Vector']);bump=n.new('ShaderNodeBump');bump.inputs['Strength'].default_value=.24;bump.inputs['Distance'].default_value=.008;l.new(fine.outputs['Fac'],bump.inputs['Height']);l.new(bump.outputs['Normal'],p.inputs['Normal'])
 broad=n.new('ShaderNodeTexNoise');broad.inputs['Scale'].default_value=1.7;broad.inputs['Detail'].default_value=3;l.new(geo.outputs['Position'],broad.inputs['Vector']);ramp=n.new('ShaderNodeValToRGB');ramp.color_ramp.elements[0].position=.1;ramp.color_ramp.elements[0].color=(.16,.155,.14,1);ramp.color_ramp.elements[1].position=.9;ramp.color_ramp.elements[1].color=(.38,.36,.32,1);l.new(broad.outputs['Fac'],ramp.inputs[0]);l.new(ramp.outputs[0],p.inputs['Base Color']);rr=n.new('ShaderNodeMapRange');rr.inputs['To Min'].default_value=.72;rr.inputs['To Max'].default_value=.94;l.new(fine.outputs['Fac'],rr.inputs[0]);l.new(rr.outputs['Result'],p.inputs['Roughness']);return m
stone=stone_material();iron=bpy.data.materials.new('Blackened iron inlay');iron.use_nodes=True;p=iron.node_tree.nodes.get('Principled BSDF');p.inputs['Base Color'].default_value=(.045,.043,.038,1);p.inputs['Metallic'].default_value=.8;p.inputs['Roughness'].default_value=.54

def mesh(module,name,vs,fs,mat=stone,bevel=.02):
 data=bpy.data.meshes.new(name+' mesh');data.from_pydata(vs,[],fs);data.update();o=bpy.data.objects.new(name,data);scene.collection.objects.link(o);o.parent=modules[module];o.data.materials.append(mat);parts[module].append(o)
 if bevel:
  b=o.modifiers.new('Worn stone edges','BEVEL');b.width=bevel;b.segments=2;b.affect='EDGES';b=o.modifiers.new('Weighted edge highlights','WEIGHTED_NORMAL');b.keep_sharp=True
 return o

def block(module,name,loc,size,bevel=.025,mat=stone):
 x,y,z=loc;w,d,h=size;v=[(x+a*w/2,y+b*d/2,z+c*h/2) for c in [-1,1] for b in [-1,1] for a in [-1,1]];f=[(0,2,3,1),(4,5,7,6),(0,1,5,4),(2,6,7,3),(0,4,6,2),(1,3,7,5)];return mesh(module,name,v,f,mat,bevel)

def voussoir(name,a,b,inner=(3.2,1.6),outer=(3.88,2.08),front=-.4,back=.4,bevel=.025):
 v=[]
 for y in [front,back]:
  for angle,r in [(a,inner),(b,inner),(b,outer),(a,outer)]:v.append((r[0]*math.cos(angle),y,6.8+r[1]*math.sin(angle)))
 return mesh('Arch',name,v,[(0,3,2,1),(4,5,6,7),(0,1,5,4),(1,2,6,5),(2,3,7,6),(3,0,4,7)],stone,bevel)

# Mortar-separated radial voussoirs and two carved archivolt mouldings.
count=18
for i in range(count):
 a=i*math.pi/count+.003;b=(i+1)*math.pi/count-.003
 voussoir('Arch voussoir %02d'%i,a,b)
 voussoir('Outer archivolt fillet %02d'%i,a,b,(3.70,1.94),(3.88,2.08),-.48,-.395,.012)
 voussoir('Inner archivolt fillet %02d'%i,a,b,(3.2,1.6),(3.33,1.73),-.48,-.395,.012)

def column(module,center,height,width,depth,prefix):
 base=.24;capital=.32;shaft=height-base-capital
 block(module,prefix+' square plinth',(center,0,base/2),(width,depth,base),.018)
 block(module,prefix+' stepped foot',(center,0,base+.075),(width*.92,depth*.96,.15),.025)
 n=9 if module=='Arch' else 7
 for j in range(n):
  h=shaft/n-.016;z=base+(j+.5)*shaft/n
  block(module,prefix+' dressed shaft course %02d'%j,(center,0,z),(width*.82,depth*.88,h),.025)
 # Shallow twin flutes with stone ribs and a narrow dark rebate between.
 for side in [-1,1]:
  block(module,prefix+' carved face rib '+str(side),(center+side*width*.23,-depth*.445,base+shaft/2),(width*.12,.07,shaft-.22),.018)
 block(module,prefix+' necking',(center,-.02,height-capital-.04),(width*.94,depth*.95,.12),.025)
 block(module,prefix+' cushion capital',(center,0,height-capital/2),(width,depth,capital),.035)
 # A repeated sunken diamond motif reads at medium distance.
 for j in range(3):
  z=base+shaft*(j+1)/4;w=width*.22;d=.035;y=-depth*.46
  mesh(module,prefix+' lozenge inlay %d'%j,[(center,y,z+w),(center+w,y,z),(center,y,z-w),(center-w,y,z),(center,y-d,z)],[(0,1,4),(1,2,4),(2,3,4),(3,0,4),(0,3,2,1)],iron,.005)
for side in [-1,1]:column('Arch',side*3.52,6.8,.72,.9,('Left' if side<0 else 'Right')+' pier')
# Keystone: a broad quiet central stone and a small forged ash chevron.
v=[(-.25,-.493,8.36),(.25,-.493,8.36),(.34,-.493,8.88),(-.34,-.493,8.88),(-.25,-.37,8.36),(.25,-.37,8.36),(.34,-.37,8.88),(-.34,-.37,8.88)]
mesh('Arch','Crown keystone',v,[(0,3,2,1),(4,5,6,7),(0,1,5,4),(1,2,6,5),(2,3,7,6),(3,0,4,7)],stone,.012)
mesh('Arch','Ash chevron emblem',[(-.17,-.499,8.65),(0,-.499,8.48),(.17,-.499,8.65),(.10,-.499,8.72),(0,-.499,8.60),(-.10,-.499,8.72)],[(0,1,4,5),(1,2,3,4)],iron,0)
column('Pillar',0,5.2,.70,.9,'Modular pillar')
# Trim is a shallow decorated ledge with physical stepped mouldings.
block('Trim','Trim dressed core',(0,0,.16),(2.0,.42,.28),.022)
block('Trim','Trim upper bevel course',(0,-.035,.31),(2.0,.5,.08),.018)
block('Trim','Trim lower bead',(0,-.025,.045),(1.96,.47,.09),.018)
for i in range(7):
 x=(i-3)*.255;w=.077;y=-.228;z=.17
 mesh('Trim','Trim recessed ash diamond %02d'%i,[(x-w,y,z),(x,y,z+w*.7),(x+w,y,z),(x,y,z-w*.7),(x,y-.018,z)],[(0,1,4),(1,2,4),(2,3,4),(3,0,4),(0,3,2,1)],iron,.004)

# Explicit module anchor nodes are separate from review-only layout transforms.
for name,mod in modules.items():
 anchor=bpy.data.objects.new(name+'_Ground',None);scene.collection.objects.link(anchor);anchor.parent=mod;anchor['semantic_anchor']=True
 if name=='Arch':
  for node,loc in [('OpeningLeft',(-3,0,0)),('OpeningRight',(3,0,0)),('OpeningTop',(0,0,6.8))]:
   a=bpy.data.objects.new(node,None);scene.collection.objects.link(a);a.parent=mod;a.location=loc;a['semantic_anchor']=True
scene.world=bpy.data.worlds.new('Neutral architecture review');scene.world.use_nodes=True;scene.world.node_tree.nodes['Background'].inputs[0].default_value=(.18,.20,.23,1);scene.world.node_tree.nodes['Background'].inputs[1].default_value=.8
for name,loc,power,size,color in [('Key',(-8,-10,12),1900,3,(1,.92,.82)),('Fill',(9,-7,8),1800,4,(.83,.9,1)),('Rim',(3,5,10),2000,3,(1,.9,.78))]:
 d=bpy.data.lights.new('Review '+name,'POINT');d.energy=power;d.shadow_soft_size=size;d.color=color;o=bpy.data.objects.new('Review '+name,d);scene.collection.objects.link(o);o.location=loc
d=bpy.data.cameras.new('Review camera');camera=bpy.data.objects.new('Review camera',d);scene.collection.objects.link(camera);scene.camera=camera;camera.location=(11,-24,11);camera.rotation_euler=(Vector((1.15,0,4.4))-camera.location).to_track_quat('-Z','Y').to_euler();d.type='ORTHO';d.ortho_scale=14.1
scene.render.engine='CYCLES';scene.cycles.samples=16;scene.cycles.use_denoising=True;scene.render.resolution_x=896;scene.render.resolution_y=768;scene.render.resolution_percentage=100;scene.render.image_settings.media_type='IMAGE';scene.render.image_settings.file_format='PNG';scene.view_settings.view_transform='AgX'
bpy.context.view_layer.update();dg=bpy.context.evaluated_depsgraph_get();summary={}
for name,objects in parts.items():
 coords=[modules[name].matrix_world.inverted()@o.matrix_world@v.co for o in objects for v in o.evaluated_get(dg).data.vertices];lo=[min(v[i] for v in coords) for i in range(3)];hi=[max(v[i] for v in coords) for i in range(3)];tri=0
 for o in objects:o.evaluated_get(dg).data.calc_loop_triangles();tri+=len(o.evaluated_get(dg).data.loop_triangles)
 summary[name]={'parts':len(objects),'evaluated_triangles':tri,'local_bounds_blender':[lo,hi],'dimensions_gltf':[hi[0]-lo[0],hi[2]-lo[2],hi[1]-lo[1]]}
result={'asset':'AshenArchitectureKit','modules':summary,'clearance_metres':[6,6.8],'runtime_lods':{'Arch':[6000,3000,1200],'Pillar':[1200,600,240],'Trim':[600,300,120]},'texture_target':[1024,512,512],'source':'Original geometry and procedural materials; real local PBR bake required','runtime_lights':False}
if 'artifacts' in globals():
 scene.render.engine='BLENDER_EEVEE';scene.render.resolution_x=768;scene.render.resolution_y=640;target=artifacts.file(name='architecture-source-review.png',media_type='image/png');scene.render.filepath=str(target.path);bpy.ops.render.render(write_still=True);target.publish()
