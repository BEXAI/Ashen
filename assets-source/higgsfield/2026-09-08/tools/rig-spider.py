"""Fit and animate eight leg chains on the supplied reconstructed spider mesh.

The source mesh, triangles, UVs and textures are preserved. Virtual position
welding is used only to discover connected leg regions across UV seams.
"""
import bpy
import json
import math
import numpy as np
from pathlib import Path
from mathutils import Vector

BASE=Path('/Users/nathaniel/Documents/ChatGPT/Knight/references/higgsfield-september-8-2026/models')
SOURCE=BASE/'spider-original.glb'
OUTPUT=BASE/'spider-rigged.glb'
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=str(SOURCE))
bpy.context.view_layer.update()
mesh=next(o for o in bpy.context.scene.objects if o.type=='MESH')
mesh.name='September8SpiderMesh'
bpy.ops.object.select_all(action='DESELECT')
mesh.select_set(True)
bpy.context.view_layer.objects.active=mesh
bpy.ops.object.transform_apply(location=True,rotation=True,scale=True)
ground=min(v.co.z for v in mesh.data.vertices)
for v in mesh.data.vertices:
    v.co.z-=ground
positions=np.array([tuple(v.co) for v in mesh.data.vertices],dtype=np.float64)

# Discover eight outer leg components without welding/changing source geometry.
unique=[]; keys={}; mapping=[]
for p in positions:
    key=tuple(round(float(c),4) for c in p)
    if key not in keys:
        keys[key]=len(unique);unique.append(p)
    mapping.append(keys[key])
unique=np.array(unique)
adj=[set() for _ in unique]
for e in mesh.data.edges:
    a,b=(mapping[i] for i in e.vertices)
    adj[a].add(b);adj[b].add(a)
remaining={i for i,p in enumerate(unique) if abs(p[0])>.3}
components=[]
while remaining:
    start=remaining.pop();stack=[start];component=[start]
    while stack:
        i=stack.pop()
        for j in adj[i]:
            if j in remaining:
                remaining.remove(j);stack.append(j);component.append(j)
    if len(component)>100:
        components.append(component)
assert len(components)==8, 'Expected eight distinct outer legs, got '+str(len(components))
components.sort(key=lambda c:(float(np.mean(unique[c],axis=0)[0])>0,float(np.mean(unique[c],axis=0)[1])))
leg_data=[]; component_labels={}
side_counts={-1:0,1:0}
for ids in components:
    points=unique[ids]
    sign=-1 if points[:,0].mean()<0 else 1
    index=side_counts[sign];side_counts[sign]+=1
    prefix=('L' if sign<0 else 'R')+str(index+1)
    inner=points[np.abs(points[:,0])<np.quantile(np.abs(points[:,0]),.12)]
    hip=np.median(inner,axis=0);hip[0]=sign*.245
    root=hip.copy();root[0]=sign*.155
    high=points[points[:,2]>np.quantile(points[:,2],.92)]
    knee=np.median(high,axis=0)
    low=points[points[:,2]<np.quantile(points[:,2],.06)]
    tip=np.median(low,axis=0)
    ankle=tip*.78+knee*.22
    joints=[root,hip,knee,ankle,tip]
    leg_data.append({'name':prefix,'sign':sign,'index':index,'joints':[x.tolist() for x in joints],'outerVertexCount':len(ids)})
    for i in ids:component_labels[i]=len(leg_data)-1

arm_data=bpy.data.armatures.new('September8SpiderSkeleton')
arm=bpy.data.objects.new('September8SpiderRig',arm_data)
bpy.context.scene.collection.objects.link(arm)
bpy.context.view_layer.objects.active=arm
bpy.ops.object.select_all(action='DESELECT');arm.select_set(True)
bpy.ops.object.mode_set(mode='EDIT')
def bone(name,head,tail,parent=None,deform=True):
    b=arm_data.edit_bones.new(name);b.head=head;b.tail=tail;b.use_deform=deform
    if parent:b.parent=arm_data.edit_bones[parent]
    return b
body_z=.39
bone('Root',(0,0,0),(0,0,.12),deform=False)
bone('Body',(0,-.07,body_z),(0,-.30,body_z),'Root')
bone('Abdomen',(0,.04,body_z),(0,.57,body_z+.035),'Body')
bone('Head',(0,-.28,body_z),(0,-.53,body_z-.015),'Body')
bone('ContactBase',(0,-.50,.34),(0,-.52,.34),'Head',False)
bone('ContactTip',(0,-.66,.24),(0,-.70,.24),'Head',False)
for sign,label in [(-1,'L'),(1,'R')]:
    bone('Fang_'+label,(sign*.073,-.48,.36),(sign*.08,-.61,.19),'Head')
    bone('Palp_'+label,(sign*.165,-.40,.35),(sign*.23,-.59,.19),'Head')
for leg in leg_data:
    j=leg['joints'];names=[]
    for i,part in enumerate(['Coxa','Femur','Tibia','Tarsus']):
        name=leg['name']+'_'+part
        bone(name,j[i],j[i+1],names[-1] if names else 'Body')
        names.append(name)
    leg['bones']=names
    target='Target_'+leg['name']
    tip=Vector(j[-1])
    bone(target,tip,tip+Vector((0,0,.08)),'Root',False)
    leg['target']=target
bpy.ops.object.mode_set(mode='OBJECT')
for leg in leg_data:
    constraint=arm.pose.bones[leg['bones'][-1]].constraints.new('IK')
    constraint.name='Foot contact'
    constraint.target=arm;constraint.subtarget=leg['target']
    constraint.chain_count=3;constraint.use_stretch=False
    constraint.iterations=100
for p in arm.pose.bones:
    p.rotation_mode='XYZ'

# Skin each original vertex to its actual segmented limb, blending only at joints.
groups={name:mesh.vertex_groups.new(name=name) for name in [b.name for b in arm_data.bones if b.use_deform]}
def distance_segment(p,a,b):
    t=float(np.clip(np.dot(p-a,b-a)/max(np.dot(b-a,b-a),1e-12),0,1))
    return float(np.linalg.norm(p-(a+t*(b-a))))
def leg_distances(p,leg):
    js=np.array(leg['joints'])
    return [distance_segment(p,js[i],js[i+1]) for i in range(4)]
weighted=[]
for vi,p in enumerate(positions):
    ax=abs(float(p[0]));weights={}
    label=component_labels.get(mapping[vi])
    if label is None and ax>.17 and p[1]<.19:
        candidates=[(min(leg_distances(p,l)),i) for i,l in enumerate(leg_data) if l['sign']*p[0]>0]
        d,label=min(candidates)
        if d>.12:label=None
    if label is not None:
        leg=leg_data[label];distances=leg_distances(p,leg)
        closest=sorted(range(4),key=lambda i:distances[i])[:2]
        influence=[(distances[i]**2+.00065)**-2 for i in closest]
        total=sum(influence)
        blend=float(np.clip((ax-.17)/.13,0,1))
        for i,w in zip(closest,influence):weights[leg['bones'][i]]=blend*w/total
        if blend<1:weights['Body']=1-blend
    elif p[1]<-.47 and p[2]<.405 and ax<.145:
        weights['Fang_'+('L' if p[0]<0 else 'R')]=1
    elif p[1]<-.43 and p[2]<.405 and .145<=ax<.29:
        weights['Palp_'+('L' if p[0]<0 else 'R')]=1
    elif p[1]>.055:
        weights['Abdomen']=1
    elif p[1]<-.34:
        blend=float(np.clip((-p[1]-.34)/.10,0,1))
        weights={'Head':blend,'Body':1-blend}
    else:weights['Body']=1
    weights={n:w for n,w in weights.items() if w>1e-7}
    total=sum(weights.values());weights={n:w/total for n,w in weights.items()}
    assert all(math.isfinite(w) and w>=0 for w in weights.values())
    assert abs(sum(weights.values())-1)<1e-6
    for n,w in weights.items():groups[n].add([vi],w,'REPLACE')
    weighted.append(weights)
mesh.parent=arm
modifier=mesh.modifiers.new('Eight leg skinning','ARMATURE');modifier.object=arm

# Bake in-place motion through IK controls; the exporter samples resulting bones.
scene=bpy.context.scene;scene.render.fps=24
durations={'idle':2.0,'forward':1.2,'backward':1.2,'strafe_left':1.2,'strafe_right':1.2,'dodge':.8,'hit':.55,'death':1.4,'side':.8,'diagonal':.8,'backhand':.9,'overhead':1.0}
arm.animation_data_create();actions=[]
def location_world(pb,delta):
    pb.location=pb.bone.matrix_local.to_quaternion().inverted()@Vector(delta)
for name,duration in durations.items():
    action=bpy.data.actions.new(name);arm.animation_data.action=action
    end=round(duration*24)
    for frame in range(end+1):
        scene.frame_set(frame);t=frame/end;phase=t*2*math.pi
        for pb in arm.pose.bones:
            pb.location=(0,0,0);pb.rotation_euler=(0,0,0);pb.scale=(1,1,1)
        body=arm.pose.bones['Body'];head=arm.pose.bones['Head'];abd=arm.pose.bones['Abdomen']
        body_delta=[.003*math.sin(phase),0,.005*math.sin(phase)]
        abd.rotation_euler.x=.025*math.sin(phase)
        gait=name in ['forward','backward','strafe_left','strafe_right']
        strike=math.sin(math.pi*t)**3
        if gait:
            body_delta[2]=.009*(1-math.cos(phase*2))
            body.rotation_euler.z=.012*math.sin(phase)
        elif name=='dodge':
            body_delta=[.15*math.sin(math.pi*t),.08*math.sin(math.pi*t),.035*math.sin(math.pi*t)]
            body.rotation_euler.y=.12*math.sin(math.pi*t)
        elif name=='hit':
            body_delta=[0,.045*strike,-.045*strike];body.rotation_euler.x=.17*strike
        elif name=='death':
            ease=t*t*(3-2*t)
            body_delta=[0,0,-.20*ease];body.rotation_euler.y=1.35*ease
            abd.rotation_euler.x=.35*ease
        elif name in ['side','diagonal','backhand','overhead']:
            body_delta=[0,-(.18 if name=='backhand' else .10)*strike,(.12 if name=='overhead' else .025)*strike]
            body.rotation_euler.x=(-.20 if name=='overhead' else .08)*strike
            body.rotation_euler.z=({'side':.23,'diagonal':-.18,'backhand':-.10,'overhead':0}[name])*math.sin(2*math.pi*t)
            head.rotation_euler.x=.25*strike
        location_world(body,body_delta)
        for sign,label in [(-1,'L'),(1,'R')]:
            arm.pose.bones['Fang_'+label].rotation_euler.x=(-.50*strike if name in ['side','diagonal','backhand','overhead'] else .035*math.sin(phase+sign))
            arm.pose.bones['Palp_'+label].rotation_euler.z=sign*.12*(strike if name!='idle' else math.sin(phase))
        for leg in leg_data:
            target=arm.pose.bones[leg['target']];delta=np.zeros(3)
            if gait:
                cycle=(t+(.5 if (leg['index']+(leg['sign']>0))%2 else 0))%1
                if cycle<.65:
                    stride=.11*(1-2*cycle/.65);lift=0
                else:
                    q=(cycle-.65)/.35;stride=.11*(-1+2*q);lift=.085*math.sin(math.pi*q)
                if name=='forward':delta[1]=-stride
                elif name=='backward':delta[1]=stride
                elif name=='strafe_left':delta[0]=-stride
                else:delta[0]=stride
                delta[2]=lift
            elif name=='death':
                ease=t*t*(3-2*t);tip=np.array(leg['joints'][-1])
                desired=np.array([tip[0]*.5,tip[1]*.6,.46])
                delta=(desired-tip)*ease
            elif name in ['side','diagonal','backhand','overhead'] and leg['index']==0:
                delta=np.array([leg['sign']*.025,-.16,.12 if name!='overhead' else .24])*strike
            elif name=='dodge':delta=np.array([.10,.03,.055])*math.sin(math.pi*t)*(1 if leg['index']%2==0 else .3)
            location_world(target,delta)
        if name=='death':
            bpy.context.view_layer.update()
            evaluated=mesh.evaluated_get(bpy.context.evaluated_depsgraph_get())
            lowest=min((evaluated.matrix_world@v.co).z for v in evaluated.data.vertices)
            if lowest<.004:
                location_world(arm.pose.bones['Root'],(0,0,.004-lowest))
        for pb in arm.pose.bones:
            if pb.name.startswith('Target_') or pb.name in ['Root','Body','Abdomen','Head','Fang_L','Fang_R','Palp_L','Palp_R']:
                pb.keyframe_insert(data_path='location',frame=frame)
                pb.keyframe_insert(data_path='rotation_euler',frame=frame)
    actions.append(action)

# Validate evaluated skinning across all motion envelopes before export.
checks=[]
for action in actions:
    arm.animation_data.action=action
    end=int(action.frame_range[1]);bounds=[]
    for frame in [0,end//4,end//2,3*end//4,end]:
        scene.frame_set(frame);bpy.context.view_layer.update()
        evaluated=mesh.evaluated_get(bpy.context.evaluated_depsgraph_get())
        points=np.array([tuple(evaluated.matrix_world@v.co) for v in evaluated.data.vertices])
        assert np.isfinite(points).all(),action.name+' has non-finite vertices'
        lo=points.min(axis=0);hi=points.max(axis=0)
        assert max(hi-lo)<4,action.name+' has exploding bounds'
        bounds.append({'frame':frame,'min':lo.tolist(),'max':hi.tolist()})
    checks.append({'clip':action.name,'frames':end+1,'duration':end/24,'bounds':bounds})
arm.animation_data.action=None
for action in actions:
    track=arm.animation_data.nla_tracks.new();track.name=action.name
    track.strips.new(action.name,0,action)
scene.frame_start=0;scene.frame_end=48;scene.frame_set(0)
bpy.ops.object.select_all(action='DESELECT');mesh.select_set(True);arm.select_set(True)
bpy.context.view_layer.objects.active=arm
bpy.ops.wm.save_as_mainfile(filepath=str(BASE/'spider-rigged.blend'))
bpy.ops.export_scene.gltf(filepath=str(OUTPUT),export_format='GLB',use_selection=True,export_animations=True,export_animation_mode='NLA_TRACKS',export_bake_animation=True,export_skins=True,export_def_bones=False,export_optimize_animation_size=True)
report={'source':str(SOURCE),'output':str(OUTPUT),'vertices':len(positions),'triangles':sum(len(p.vertices)-2 for p in mesh.data.polygons),'sourceGeometryPreserved':True,'groundTranslation':-ground,'weightedVertices':len(weighted),'unweightedVertices':0,'maximumInfluences':max(map(len,weighted)),'bones':len(arm_data.bones),'legChains':leg_data,'clips':checks,'contacts':['ContactBase','ContactTip']}
(BASE/'spider-rig-validation.json').write_text(json.dumps(report,indent=2)+'\n')
print(json.dumps({'output':str(OUTPUT),'bytes':OUTPUT.stat().st_size,'bones':len(arm_data.bones),'clips':list(durations),'weightedVertices':len(weighted)}),flush=True)
