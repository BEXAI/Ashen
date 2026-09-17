"""Locally authored, reference-guided fantasy characters; not inferred source topology.

Creates continuous sculpted anatomical surfaces, tailored clothing, facial geometry,
held weapons, vertex-painted materials, and a 24-joint Meshy-compatible skin.
All coordinates use Blender Z-up, facing -Y. Original reference images are untouched.
"""
import bpy, math, json, random, hashlib, sys
import numpy as np
from pathlib import Path
from mathutils import Vector, Quaternion
from mathutils.noise import noise_vector, noise

ROOT=Path('/Users/nathaniel/Documents/ChatGPT/Knight/references/higgsfield-september-8-2026')
OUT=ROOT/'models'
random.seed(8629)
KIND=sys.argv[-1] if sys.argv[-1] in ['goblin','ogre'] else 'goblin'
G=KIND=='goblin'
bpy.ops.wm.read_factory_settings(use_empty=True)
PARTS=[]; SCULPT=[]

def mat(name,color,rough=.8,metal=0):
    m=bpy.data.materials.new(name);m.diffuse_color=(*color,1);m.use_nodes=True
    n=m.node_tree.nodes.get('Principled BSDF');n.inputs['Base Color'].default_value=(*color,1)
    n.inputs['Roughness'].default_value=rough;n.inputs['Metallic'].default_value=metal
    col=m.node_tree.nodes.new('ShaderNodeVertexColor');col.layer_name='Paint'
    m.node_tree.links.new(col.outputs['Color'],n.inputs['Base Color'])
    return m

SKIN=mat('Olive mottled goblin skin' if G else 'Mossy grey-green ogre skin',(.30,.285,.115) if G else (.28,.31,.23))
EAR=mat('Warm ear and nose flesh',(.32,.16,.10) if G else (.31,.21,.19))
LIP=mat('Weathered lips',(.265,.135,.09) if G else (.25,.18,.16))
LEATHER=mat('Worn dark leather',(.105,.066,.035))
HIDE=mat('Patched rough hide',(.24,.17,.09))
ROPE=mat('Tan cord',(.39,.285,.15))
METAL=mat('Pitted rusted iron',(.17,.135,.115),.69,.68)
BLADE=mat('Scratched cleaver steel',(.32,.32,.30),.55,.75)
WOOD=mat('Split weathered wood',(.21,.145,.085))
IVORY=mat('Aged tooth ivory',(.66,.53,.29),.54)
NAIL=mat('Dirty claws and nails',(.22,.18,.10))
BLACK=mat('Mouth and nostril recesses',(.021,.011,.007),.95)
EYE=mat('Amber yellow iris' if G else 'Black brown eyes',(.68,.45,.035) if G else (.038,.026,.013),.23)
PUPIL=mat('Vertical pupil',(.009,.007,.003),.20)

def paint(obj,material,variation=.2,style='default'):
    if len(obj.data.materials)==0:obj.data.materials.append(material)
    else:obj.data.materials[0]=material
    att=obj.data.color_attributes.get('Paint') or obj.data.color_attributes.new(name='Paint',type='BYTE_COLOR',domain='POINT')
    base=np.array(material.diffuse_color[:3])
    vals=[]
    for v in obj.data.vertices:
        p=obj.matrix_world@v.co
        n=noise(p*27,noise_basis='PERLIN_ORIGINAL')*.55+noise(p*97,noise_basis='PERLIN_ORIGINAL')*.27+noise(p*220)*.18
        c=base*(1+variation*(n-.5)*2)
        if style=='skin':
            broad=noise(p*8.5,noise_basis='PERLIN_ORIGINAL')
            moss=max(0,(broad-.47))*2.5
            c=c*(1-moss*.52)+np.array((.17,.22,.07) if not G else (.25,.25,.075))*moss*.52
            if G:c+=np.array((.018,.011,-.004))*noise(p*61)
        elif style=='rust':
            rust=max(0,(noise(p*37)-.40))*2
            c=c*(1-rust*.75)+np.array((.33,.105,.035))*rust*.75
        elif style=='wood':
            c*=.87+.20*math.sin(p.z*37+p.x*131+noise(p*10)*3)**2
        elif style=='cloth':
            c*=.91+.12*(math.sin(p.x*850)*math.sin(p.z*850))
        vals.extend([*np.clip(c,0,1),1])
    att.data.foreach_set('color',vals)
    return obj

def apply_transform(obj):
    bpy.ops.object.select_all(action='DESELECT');obj.select_set(True);bpy.context.view_layer.objects.active=obj
    bpy.ops.object.transform_apply(location=True,rotation=True,scale=True)

def finish(obj,name,material=None,bone=None,sculpt=False):
    obj.name=name
    for f in obj.data.polygons:f.use_smooth=True
    apply_transform(obj)
    if sculpt:SCULPT.append(obj)
    else:
        if material:paint(obj,material,style='rust' if material==METAL else 'wood' if material==WOOD else 'cloth' if material in [HIDE,LEATHER] else 'default')
        obj['bind_bone']=bone or 'AUTO';PARTS.append(obj)
    return obj

def ell(name,center,scale,material=None,bone=None,sculpt=False,seg=24,rings=16,rot=None):
    if not sculpt:seg=min(seg,16);rings=min(rings,10)
    bpy.ops.mesh.primitive_uv_sphere_add(segments=seg,ring_count=rings,location=center)
    o=bpy.context.object;o.scale=scale
    if rot:o.rotation_euler=rot
    return finish(o,name,material,bone,sculpt)

def segment(name,a,b,r1,r2=None,material=None,bone=None,sculpt=False,sides=12):
    a=Vector(a);b=Vector(b);d=b-a
    bpy.ops.mesh.primitive_cone_add(vertices=sides,radius1=r1,radius2=r1 if r2 is None else r2,depth=d.length,location=(a+b)/2)
    o=bpy.context.object;o.rotation_mode='QUATERNION';o.rotation_quaternion=d.to_track_quat('Z','Y')
    return finish(o,name,material,bone,sculpt)

def sausage(name,a,b,radii,sculpt=True,material=None,bone=None):
    a=Vector(a);b=Vector(b)
    c=(a+b)/2;d=b-a
    o=ell(name,c,(radii[0],radii[1],d.length*.62),material,bone,sculpt)
    # Sphere was baked at its final position; orient in local coordinates explicitly.
    q=d.to_track_quat('Z','Y')
    for v in o.data.vertices:v.co=c+q@(v.co-c)
    return o

def mesh_obj(name,verts,faces,material,bone=None,solid=0,bevel=0):
    me=bpy.data.meshes.new(name);me.from_pydata(verts,[],faces);me.update()
    o=bpy.data.objects.new(name,me);bpy.context.collection.objects.link(o)
    if solid:
        mod=o.modifiers.new('Real thickness','SOLIDIFY');mod.thickness=solid
    if bevel:
        mod=o.modifiers.new('Worn edges','BEVEL');mod.width=bevel;mod.segments=2
    bpy.context.view_layer.objects.active=o;o.select_set(True)
    for mod in list(o.modifiers):bpy.ops.object.modifier_apply(modifier=mod.name)
    return finish(o,name,material,bone)

def tube(name,points,radius,material,bone=None,radii=None,sides=8):
    pts=[Vector(p) for p in points];verts=[];faces=[]
    for i,p in enumerate(pts):
        tangent=pts[min(i+1,len(pts)-1)]-pts[max(0,i-1)]
        tangent.normalize();u=tangent.cross(Vector((0,1,0)))
        if u.length<.01:u=tangent.cross(Vector((1,0,0)))
        u.normalize();v=tangent.cross(u).normalized();r=radius if radii is None else radii[i]
        for j in range(sides):verts.append(p+r*(u*math.cos(j*2*math.pi/sides)+v*math.sin(j*2*math.pi/sides)))
    for i in range(len(pts)-1):
        for j in range(sides):faces.append((i*sides+j,i*sides+(j+1)%sides,(i+1)*sides+(j+1)%sides,(i+1)*sides+j))
    faces.extend([tuple(reversed(range(sides))),tuple((len(pts)-1)*sides+j for j in range(sides))])
    return mesh_obj(name,verts,faces,material,bone)

def curve(name,points,radius,material,bone=None):
    # Densely sampled Catmull-Rom for sculpted facial ridges and cord.
    ps=[Vector(p) for p in points];ext=[ps[0],*ps,ps[-1]];dense=[]
    for i in range(1,len(ext)-2):
        a,b,c,d=ext[i-1:i+3]
        for j in range(5):
            t=j/5;dense.append(.5*((2*b)+(-a+c)*t+(2*a-5*b+4*c-d)*t*t+(-a+3*b-3*c+d)*t*t*t))
    dense.append(ps[-1]);return tube(name,dense,radius,material,bone,sides=7)

# A-pose, generous forward-facing head; creature-specific proportions are not shared.
if G:
    H=1.40;hips=.58;chest=.87;neck=1.035;head=1.19
    shoulder=.225;shoulderz=.925;elbow=(.342,-.005,.738);wrist=(.445,-.037,.532)
    hipx=.103;knee=(.123,-.023,.31);ankle=(.13,.0,.092)
    body_specs=[('pelvis',(0,.005,.57),(.158,.105,.15)),('belly',(0,-.065,.714),(.193,.157,.191)),('ribcage',(0,.015,.865),(.186,.118,.147)),('back hunch',(0,.07,.915),(.178,.113,.14)),('neck',(0,-.004,1.04),(.088,.088,.112)),('cranium',(0,-.012,1.218),(.171,.127,.171)),('lower face',(0,-.063,1.132),(.131,.113,.114)),('chin',(0,-.110,1.077),(.079,.058,.050)),('muzzle',(0,-.135,1.136),(.105,.06,.059)),('nose bridge',(0,-.144,1.231),(.048,.045,.073)),('hooked nose tip',(0,-.197,1.185),(.049,.050,.074))]
else:
    H=2.27;hips=.98;chest=1.52;neck=1.86;head=2.045
    shoulder=.43;shoulderz=1.72;elbow=(.614,.0,1.365);wrist=(.758,-.034,.94)
    hipx=.218;knee=(.26,-.015,.53);ankle=(.265,.025,.15)
    body_specs=[('pelvis',(0,.035,1.01),(.335,.238,.28)),('barrel belly',(0,-.035,1.264),(.375,.263,.35)),('ribcage',(0,.01,1.564),(.423,.267,.275)),('humped trapezius',(0,.115,1.745),(.407,.232,.21)),('massive neck',(0,.015,1.848),(.198,.176,.205)),('cranium',(0,-.014,2.065),(.191,.151,.213)),('wide jaw',(0,-.07,1.956),(.193,.135,.142)),('jutting chin',(0,-.168,1.918),(.135,.075,.073)),('upper muzzle',(0,-.173,2.005),(.126,.066,.071)),('nose bridge',(0,-.163,2.096),(.06,.049,.076)),('pig nose',(0,-.210,2.066),(.070,.05,.045))]
for name,c,s in body_specs:ell(name,c,s,sculpt=True,seg=32,rings=20)

for sign,side in [(-1,'Right'),(1,'Left')]:
    sx=lambda p:(sign*p[0],p[1],p[2])
    sh=(sign*shoulder,0,shoulderz);el=sx(elbow);wr=sx(wrist)
    ell(side+' deltoid',sh,(.065,.082,.08) if G else (.205,.203,.23),sculpt=True)
    sausage(side+' upper arm',sh,el,(.050,.055) if G else (.162,.157))
    ell(side+' elbow',el,(.048,.055,.055) if G else (.124,.137,.14),sculpt=True)
    sausage(side+' forearm',Vector(el)*.83+Vector(wr)*.17,wr,(.042,.044) if G else (.118,.122))
    ell(side+' wrist',wr,(.032,.039,.04) if G else (.080,.085,.10),sculpt=True)
    palm=Vector(wr)+Vector((sign*.013,-.012,-(.06 if G else .10)))
    ell(side+' palm',palm,(.05,.030,.061) if G else (.101,.059,.103),sculpt=True)
    for i in range(4):
        x=palm.x+sign*((i-1.5)*(.022 if G else .042))
        z=palm.z-(.047 if G else .072)
        length=(.073 if G else .128)*[.73,1,.92,.70][i]
        points=[(x,palm.y,z),(x+sign*.004,palm.y-.013,z-length*.53),(x-sign*.01,palm.y-.035,z-length)]
        # Reference weapon hand curls around the handle, off hand hangs loosely.
        if sign<0:points[2]=(points[2][0],palm.y-.056,z-length*.74)
        for j in range(2):sausage(side+f' finger {i}-{j}',points[j],points[j+1],((.012 if G else .024),(.013 if G else .025)))
        for p in points:ell('finger knuckle',p,(.013,.013,.014) if G else (.025,.025,.026),sculpt=True,seg=12,rings=8)
        end=Vector(points[-1]);ell('dirty fingernail',end+Vector((0,-.011,0)),(.008,.006,.018) if G else (.018,.011,.025),NAIL,side+'Hand',seg=12,rings=8)
    thumb0=palm+Vector((-sign*(.045 if G else .080),-.003,.006));thumb1=thumb0+Vector((-sign*(.022 if G else .038),-.018,-(.028 if G else .043)));thumb2=thumb1+Vector((0,-.026,-(.032 if G else .04)))
    sausage(side+' thumb',thumb0,thumb1,(.016,.017) if G else (.030,.031));sausage(side+' thumb tip',thumb1,thumb2,(.014,.015) if G else (.027,.028))
    ell('thumb nail',thumb2+Vector((0,-.013,0)),(.011,.008,.015) if G else (.019,.009,.024),NAIL,side+'Hand')
    hip=(sign*hipx,.026,hips);kn=sx(knee);an=sx(ankle)
    sausage(side+' thigh',hip,kn,(.098,.096) if G else (.204,.203))
    ell(side+' knee cap',Vector(kn)+Vector((0,-.026,0)),(.064,.065,.074) if G else (.124,.116,.134),sculpt=True)
    sausage(side+' calf',Vector(kn)*.85+Vector(an)*.15,an,(.063,.060) if G else (.123,.133))
    ell(side+' ankle',an,(.049,.049,.07) if G else (.095,.095,.113),sculpt=True)
    if G:
        # The boot is a constructed leather volume with a calf cuff and separate sole.
        ell(side+' boot foot',(sign*.137,-.062,.067),(.079,.141,.064),LEATHER,side+'Foot',seg=28,rings=16)
        ell(side+' boot shaft',(sign*.131,.005,.16),(.067,.068,.117),LEATHER,side+'Leg')
        pts=[]
        for j in range(25):
            t=j/24*2*math.pi;pts.append((sign*.131+.070*math.cos(t),.009+.070*math.sin(t),.242+.014*math.sin(t*3)))
        tube(side+' folded boot cuff',pts,.016,LEATHER,side+'Leg')
        ell(side+' boot sole',(sign*.137,-.064,.021),(.083,.143,.021),LEATHER,side+'Foot',seg=28,rings=10)
        for z in [.153,.165]:
            pts=[(sign*.131+.069*math.cos(t),.008+.074*math.sin(t),z+.009*math.cos(t*2)) for t in np.linspace(0,2*math.pi,36)]
            tube('boot rope wrap',pts,.004,ROPE,side+'Leg')
        curve('boot rope end',[(sign*.176,-.03,.157),(sign*.185,-.067,.126),(sign*.177,-.08,.096)],.0035,ROPE,side+'Leg')
    else:
        ell(side+' broad foot',(sign*.267,-.067,.085),(.146,.220,.087),sculpt=True)
        for i in range(4):
            x=sign*(.188+i*.05);y=-.227+(.015*i)
            ell('ogre toe',(x,y,.059),(.037,.086-.006*i,.047),sculpt=True,seg=16,rings=12)
            ell('stone toe nail',(x,y-.061,.071),(.028,.034,.014),NAIL,side+'ToeBase',seg=16,rings=8)

# Pectoral shapes and face's high-relief silhouette.
for sign in [-1,1]:
    if G:
        ell('lean pectoral',(sign*.085,-.087,.858),(.088,.052,.065),sculpt=True)
        ell('cheekbone',(sign*.113,-.112,1.179),(.052,.052,.053),sculpt=True)
        ell('heavy goblin brow',(sign*.081,-.133,1.28),(.084,.04,.035),sculpt=True,rot=(0,-sign*.25,0))
        ell('nostril wing',(sign*.041,-.176,1.18),(.025,.031,.024),sculpt=True)
    else:
        ell('heavy pectoral',(sign*.191,-.184,1.554),(.211,.112,.155),sculpt=True)
        ell('ogre cheek',(sign*.135,-.120,2.018),(.072,.065,.08),sculpt=True)
        ell('scowling massive brow',(sign*.092,-.173,2.137),(.101,.065,.055),sculpt=True,rot=(0,-sign*.30,0))

# Join and voxel sculpt skin into a single genuine anatomical surface.
bpy.ops.object.select_all(action='DESELECT')
for o in SCULPT:o.select_set(True)
bpy.context.view_layer.objects.active=SCULPT[0];bpy.ops.object.join();skin=bpy.context.object;skin.name=KIND.title()+' continuous anatomical sculpt'
rem=skin.modifiers.new('Union sculpt surfaces','REMESH');rem.mode='VOXEL';rem.voxel_size=.004 if G else .0062;rem.use_smooth_shade=True
bpy.ops.object.modifier_apply(modifier=rem.name)
smooth=skin.modifiers.new('Sculpt polish','SMOOTH');smooth.factor=.63;smooth.iterations=4;bpy.ops.object.modifier_apply(modifier=smooth.name)
sculpt_normals=[v.normal.copy() for v in skin.data.vertices]
for v,n in zip(skin.data.vertices,sculpt_normals):
    p=v.co.copy();v.co+=n*((noise(p*125)-.5)*(.0007 if G else .0014)+(noise(p*34)-.5)*(.0008 if G else .0017))
dec=skin.modifiers.new('Sculpt game topology','DECIMATE');dec.ratio=min(1,16500/max(1,sum(len(p.vertices)-2 for p in skin.data.polygons)));bpy.ops.object.modifier_apply(modifier=dec.name)
paint(skin,SKIN,.44,'skin');skin['bind_bone']='AUTO';PARTS.append(skin)
print(KIND,'skin faces',len(skin.data.polygons),flush=True)

# Closed concave ears, large for goblin, low thick points for ogre.
for sign in [-1,1]:
    if G:
        outline=[(.141,-.007,1.269),(.207,.00,1.286),(.344,.023,1.263),(.311,.002,1.236),(.286,-.003,1.222),(.269,.004,1.205),(.248,-.003,1.212),(.225,-.02,1.170),(.180,-.044,1.158),(.151,-.055,1.195)]
        center=np.array((.207,-.073,1.230))
    else:
        outline=[(.163,-.012,2.108),(.213,-.006,2.112),(.245,.024,2.104),(.223,-.002,2.062),(.203,-.02,2.036),(.171,-.034,2.042)]
        center=np.array((.201,-.04,2.074))
    verts=[];N=len(outline)
    # 4 radial rings, inner bowl bends rearward then fleshy rim projects forward.
    for k,t in enumerate([0,.38,.78,1]):
        for p in outline:
            p=np.array(p);q=center*(1-t)+p*t;q[1]+=(.042 if G else .022)*math.sin(t*math.pi)
            verts.append((sign*q[0],q[1],q[2]))
    faces=[]
    for k in range(3):
        for j in range(N):faces.append((k*N+j,k*N+(j+1)%N,(k+1)*N+(j+1)%N,(k+1)*N+j))
    ear=mesh_obj('Large sculpted pointed ear' if G else 'Ogre ear',verts,faces,EAR,'Head',solid=.013 if G else .017)
    sub=ear.modifiers.new('Ear smoothing','SUBSURF');sub.levels=1;bpy.context.view_layer.objects.active=ear;bpy.ops.object.modifier_apply(modifier=sub.name);paint(ear,EAR,.35)
    edge=[(sign*p[0],p[1]-.007,p[2]) for p in outline]+[(sign*outline[0][0],outline[0][1]-.007,outline[0][2])]
    curve('Fleshy ear rim',edge,.010 if G else .012,SKIN,'Head')

# Eyes, orbital contours, lips, nostrils and individually modeled irregular teeth.
if G:ex=.083;ez=1.246;ey=-.134;er=.036;mouthz=1.112;mouthy=-.192;mw=.098
else:ex=.086;ez=2.103;ey=-.194;er=.016;mouthz=1.978;mouthy=-.245;mw=.114
for sign in [-1,1]:
    ell('Orbital shadow',(sign*ex,ey+.006,ez),(.051,.030,.042) if G else (.039,.025,.020),LIP if G else BLACK,'Head',seg=28,rings=16)
    ell('Amber eyeball' if G else 'Ogre eyeball',(sign*ex,ey-.010,ez),(er,er*.61,er*.84),EYE,'Head',seg=28,rings=18)
    ell('Eye pupil',(sign*ex,ey-.032,ez),(.006 if G else .010,.005,.026 if G else .013),PUPIL,'Head',seg=16,rings=12)
    top=[];bottom=[]
    for t in np.linspace(0,math.pi,15):
        top.append((sign*ex+er*1.15*math.cos(t),ey-.018,ez+er*.85*math.sin(t)))
        bottom.append((sign*ex+er*1.15*math.cos(t),ey-.016,ez-er*.89*math.sin(t)))
    curve('Raised upper eyelid',top,.008 if G else .010,SKIN,'Head')
    curve('Wrinkled lower eyelid',bottom,.008 if G else .008,LIP if G else SKIN,'Head')
    for j in range(2):
        pts=[(sign*ex+er*1.25*math.cos(t),ey-.008+j*.002,ez-er*(1.16+j*.25)*math.sin(t)) for t in np.linspace(.12,math.pi-.12,12)]
        curve('Under eye fold',pts,.003 if G else .004,SKIN,'Head')
    nx=.03 if G else .038;nz=1.163 if G else 2.052;ny=-.205 if G else -.245
    ell('Deep nostril',(sign*nx,ny,nz),(.011,.009,.009) if G else (.018,.010,.012),BLACK,'Head',seg=16,rings=10)
    # Curved nasolabial ridges supply characteristic goblin grin and ogre jowls.
    points=[(sign*(.056 if G else .071),-.170 if G else -.196,1.202 if G else 2.035),(sign*(.089 if G else .119),-.170 if G else -.203,1.174 if G else 2.016),(sign*(.109 if G else .14),-.143 if G else -.184,1.124 if G else 1.974)]
    curve('Nasolabial cheek ridge',points,.009 if G else .013,SKIN,'Head')

ell('Recessed open mouth',(0,mouthy,mouthz),(mw,.022,.027 if G else .030),BLACK,'Head',seg=32,rings=16)
for upper in [True,False]:
    pts=[]
    for t in np.linspace(0,math.pi,20):
        pts.append((mw*math.cos(t),mouthy-.013+abs(math.cos(t))*.012,mouthz+(1 if upper else -1)*(.025 if G else .029)*math.sin(t)))
    curve('Sculpted upper lip' if upper else 'Sculpted lower lip',pts,.007 if G else .012,LIP,'Head')
    for i,x in enumerate(np.linspace(-mw*.81,mw*.81,9 if G else 7)):
        arch=math.sqrt(max(0,1-(x/mw)**2));base=mouthz+(1 if upper else -1)*(.023 if G else .025)*arch
        length=(.020 if G else .014)*(1+random.uniform(-.3,.35))
        tip=base+(-1 if upper else 1)*length
        segment('Irregular individual tooth',(x,mouthy-.022,base),(x+random.uniform(-.003,.003),mouthy-.026,tip),.006 if G else .008,.001,IVORY,'Head',sides=9)
if not G:
    for sign in [-1,1]:
        pts=[(sign*.101,-.228,1.961),(sign*.121,-.238,1.991),(sign*.131,-.231,2.028),(sign*.132,-.216,2.049)]
        tube('Curved lower jaw tusk',pts,1,IVORY,'Head',radii=[.018,.013,.007,.0005],sides=12)
else:
    # Small iron hoop through the left side of nose.
    pts=[(.054+.018*math.cos(t),-.207,1.139+.026*math.sin(t)) for t in np.linspace(0,2*math.pi,33)]
    tube('Nose piercing',pts,.0035,METAL,'Head')

# Creases and warts are geometry that remains visible from oblique angles.
for j in range(3):
    width=(.109 if G else .106)*(1-j*.12);z=(1.319 if G else 2.190)+j*(.012 if G else .014)
    pts=[(x,(-.102 if G else -.126)+.03*(x/width)**2,z+.006*math.cos(x/width*math.pi)) for x in np.linspace(-width,width,16)]
    curve('Forehead wrinkle',pts,.0027 if G else .0035,SKIN,'Head')
for sign in [-1,1]:
    curve('Glabellar scowl',[(sign*.016,-.163 if G else -.197,1.312 if G else 2.182),(sign*.009,-.181 if G else -.211,1.290 if G else 2.155)],.0038 if G else .005,SKIN,'Head')
    if G:
        for x,y,z,r in [(sign*.155,-.071,1.282,.006),(sign*.180,-.038,.973,.008),(sign*.202,-.019,.94,.004),(sign*.142,-.181,.744,.005),(sign*.09,-.205,.697,.006)]:
            ell('Skin wart',(x,y,z),(r,r*.68,r),EAR,'AUTO',seg=10,rings=7)
    else:
        # Jagged dark seam details following front chest and belly surfaces.
        for j in range(7):
            x=sign*(.06+.041*j);z=1.72-.078*j;y=-.205-.028*math.sin(j)
            curve('Weathered skin fissure',[(x,y,z),(x+sign*.021,y-.002,z-.019),(x+sign*.014,y-.005,z-.045)],.0021,SKIN,'AUTO')
ell('Belly navel',(0,-.220 if G else -.301,.695 if G else 1.167),(.008,.004,.005) if G else (.022,.006,.012),LIP if G else SKIN,'Spine02')

# Leather strips are tailored surfaces, with real thickness and irregular edges.
def wrap_skirt(name,z,rx,ry,length,material,bone='Hips',segments=40,phase=0):
    verts=[];faces=[]
    for row in range(4):
        q=row/3
        for j in range(segments):
            a=2*math.pi*j/segments
            uneven=.16*math.sin(a*9+phase)+.09*math.sin(a*17+.3)
            zz=z-length*q*(1+uneven*q)
            # side panels shorter, front/rear loins longest
            if not G:zz+=length*q*(.35*abs(math.cos(a)))
            rxf=rx*(1+.19*q);ryf=ry*(1+.14*q)
            verts.append((rxf*math.cos(a),ryf*math.sin(a),zz))
    for row in range(3):
        for j in range(segments):faces.append((row*segments+j,row*segments+(j+1)%segments,(row+1)*segments+(j+1)%segments,(row+1)*segments+j))
    return mesh_obj(name,verts,faces,material,bone,solid=.0035 if G else .006)
if G:
    wrap_skirt('Ragged patched waist garment',.596,.16,.132,.180,HIDE)
    # Overlapping leather patches with serrated lower edges.
    for i in range(7):
        a=-math.pi+.44+i*.43;ww=.041;centerx=.178*math.cos(a);centery=.143*math.sin(a)
        # curved rectangular/quadrilateral patches on the cloth circumference
        verts=[]
        for row in range(4):
            for col in range(5):
                aa=a+(col/4-.5)*.55;r=.166+row*.009
                verts.append((r*math.cos(aa),(r*.80+.009)*math.sin(aa),.591-row*.050+(.014*math.sin(col*3+i) if row==3 else 0)))
        faces=[(r*5+c,r*5+c+1,(r+1)*5+c+1,(r+1)*5+c) for r in range(3) for c in range(4)]
        mesh_obj('Overlapping sewn leather patch',verts,faces,LEATHER if i%2 else HIDE,'Hips',solid=.002)
        for j in range(4):
            p=Vector(verts[j]);q=Vector(verts[j+1]);m=(p+q)/2;m.y-=.003
            tube('Patch stitch',[m+Vector((-.005,0,.005)),m+Vector((.005,0,-.005))],.0018,ROPE,'Hips',sides=5)
    # Diagonal torn chest sash from character left shoulder to right belly.
    sash=[(.172,-.073,.971),(.145,-.118,.879),(.071,-.159,.811),(-.035,-.202,.761),(-.144,-.172,.70)]
else:
    wrap_skirt('Ragged brown hide loincloth',1.035,.333,.238,.365,HIDE,segments=44)
    sash=[(.440,-.219,1.759),(.295,-.281,1.638),(.09,-.278,1.521),(-.13,-.274,1.389),(-.333,-.183,1.26)]

verts=[];width=.054 if G else .066
for i,p in enumerate(sash):
    for j in range(5):
        t=j/4-.5;verts.append((p[0]+t*width*1.2,p[1]-.006+.005*math.sin(i*3+j),p[2]-t*width*(1.0 if G else 1.1)))
faces=[(i*5+j,i*5+j+1,(i+1)*5+j+1,(i+1)*5+j) for i in range(len(sash)-1) for j in range(4)]
mesh_obj('Torn diagonal chest sash' if G else 'Diagonal armor suspension strap',verts,faces,LEATHER,None,solid=.004)
for i,p in enumerate(sash[1:-1]):
    for j in [-1,0,1]:
        q=np.array(p)+np.array((j*.012,-.010,j*.012))
        tube('Leather cross stitch',[q+(-.004,0,.005),q+(.004,0,-.005)],.0018 if G else .0025,ROPE,None,sides=5)

# Rope belt, closure and hanging cord.
z=.589 if G else 1.02;rx=.170 if G else .34;ry=.140 if G else .252
for dz in [0,.009 if G else .016]:
    points=[(rx*math.cos(a),ry*math.sin(a),z+dz+.008*math.sin(3*a)) for a in np.linspace(0,2*math.pi,70)]
    tube('Waist cord',points,.004 if G else .007,ROPE,'Hips')
for i in range(2):
    curve('Belt knot and loose end',[(.09,-ry-.002,z),(.104+i*.008,-ry-.01,z-.035),(.092+i*.02,-ry-.024,z-.102)],.004 if G else .006,ROPE,'Hips')

if G:
    # Armband matches the original exposed right upper arm.
    c=Vector((-.306,0,.802));axis=(Vector((-.342,-.005,.738))-Vector((-.225,0,.925))).normalized()
    u=axis.cross(Vector((0,1,0))).normalized();v=axis.cross(u)
    for dz in [-.012,0,.012]:
        pts=[c+axis*dz+(u*math.cos(a)+v*math.sin(a))*.063 for a in np.linspace(0,2*math.pi,30)]
        tube('Right upper-arm bindings',pts,.004,ROPE,'RightArm')
    # Necklace cord and irregular bone/tooth pendants.
    pts=[(-.088,-.066,1.027),(-.096,-.10,.948),(-.063,-.129,.907),(0,-.151,.887),(.064,-.128,.907),(.096,-.10,.948),(.087,-.063,1.028)]
    curve('Tooth necklace cord',pts,.0032,ROPE,'Spine')
    for i,x in enumerate(np.linspace(-.075,.075,9)):
        zz=.888+.077*(abs(x)/.087)**1.4;yy=-.149+.032*(abs(x)/.087)
        length=.023+[.006,.02,.005,.015,.03,.013,.006,.015,.004][i]
        end=(x+random.uniform(-.008,.008),yy-.004,zz-length)
        tube('Bone charm',[(x,yy,zz),(x+.003,yy-.006,zz-length*.45),end],1,IVORY,'Spine',radii=[.0055,.005,.0013],sides=8)
        if i%3==0:ell('Bone charm end',end,(.006,.005,.004),IVORY,'Spine',seg=10,rings=8)
else:
    # Convex forged pauldron, raised irregular rim, rivets and rear flange.
    verts=[];faces=[];center=Vector((.44,.026,1.684));rings=12;sides=36
    for i in range(rings):
        t=.03+(1.55-.03)*i/(rings-1)
        for j in range(sides):
            a=2*math.pi*j/sides
            verts.append(center+Vector((.294*math.sin(t)*math.cos(a),.28*math.sin(t)*math.sin(a),.265*math.cos(t))))
    for i in range(rings-1):
        for j in range(sides):faces.append((i*sides+j,i*sides+(j+1)%sides,(i+1)*sides+(j+1)%sides,(i+1)*sides+j))
    mesh_obj('Rusted convex shoulder pauldron',verts,faces,METAL,'LeftArm',solid=.012)
    tube('Forged pauldron rim',verts[-sides:]+[verts[-sides]],.009,METAL,'LeftArm')
    # Tall fin at inner back of original shoulder plate.
    mesh_obj('Raised shoulder plate flange',[(.275,-.13,1.86),(.282,.12,1.86),(.273,.135,2.035),(.265,-.11,1.981)],[(0,1,2,3)],METAL,'LeftArm',solid=.012,bevel=.008)
    for x,z in [(.383,1.762),(.411,1.731),(.463,1.72)]:ell('Armor rivet',(x,-.25,z),(.013,.007,.013),METAL,'LeftArm',seg=12,rings=8)

# Reference weapons are solid, independently authored geometry, skinned to RightHand.
weapon_start=len(PARTS)
if G:
    a=Vector((-.501,-.088,.440));b=Vector((-.319,-.102,.414))
    segment('Cleaver wooden handle',a,b,.016,.018,WOOD,'RightHand',sides=16)
    # Blade polygon, extruded and bevelled, with irregular cutting edge.
    verts=[(-.344,-.104,.445),(-.188,-.106,.426),(-.174,-.107,.409),(-.190,-.108,.324),(-.210,-.108,.316),(-.220,-.108,.323),(-.244,-.107,.316),(-.263,-.107,.324),(-.280,-.107,.325),(-.297,-.106,.34),(-.330,-.105,.342)]
    blade=mesh_obj('Chipped broad steel cleaver',verts,[tuple(range(len(verts)))],BLADE,'RightHand',solid=.012,bevel=.004)
    # A genuine circular cutout, rather than a painted hole.
    bpy.ops.mesh.primitive_cylinder_add(vertices=24,radius=.009,depth=.08,location=(-.204,-.106,.400),rotation=(math.pi/2,0,0));cut=bpy.context.object
    mod=blade.modifiers.new('Cleaver hanging hole','BOOLEAN');mod.operation='DIFFERENCE';mod.object=cut
    bpy.context.view_layer.objects.active=blade;bpy.ops.object.modifier_apply(modifier=mod.name);bpy.data.objects.remove(cut,do_unlink=True);paint(blade,BLADE,.44,'rust')
    for t in [.18,.78]:
        p=a.lerp(b,t);ell('Cleaver handle pin',p+Vector((0,-.018,0)),(.005,.003,.005),METAL,'RightHand',seg=10,rings=8)
    weapon_base=list(b);weapon_tip=[-.224,-.106,.316]
else:
    a=Vector((-.811,-.08,.878));b=Vector((-.378,-.215,.307));direction=(b-a).normalized()
    segment('Long wood club grip',a-direction*.09,a.lerp(b,.56),.045,.061,WOOD,'RightHand',sides=18)
    p0=a.lerp(b,.37);p1=b+direction*.06
    club=segment('Heavy split log club head',p0,p1,.076,.13,WOOD,'RightHand',sides=24)
    u=direction.cross(Vector((0,1,0))).normalized();v=direction.cross(u)
    for row,t in enumerate([.43,.62,.79,.94]):
        c=a.lerp(b,t);rad=.085+(t-.43)*.07
        for j in range(5):
            angle=j*2*math.pi/5+row*.36;out=u*math.cos(angle)+v*math.sin(angle)
            base=c+out*rad;tip=base+out*(.075+random.uniform(-.01,.02))+direction*.019
            segment('Forged iron club spike',base,tip,.025,.0005,METAL,'RightHand',sides=4)
    for j in range(9):
        angle=j*2*math.pi/9;out=u*math.cos(angle)+v*math.sin(angle)
        pts=[]
        for t in np.linspace(.42,1.04,6):
            c=a+(b-a)*t;rad=.082+(t-.43)*.079;pts.append(c+out*rad)
        curve('Club grain split',pts,.0028,LEATHER,'RightHand')
    weapon_base=list(a.lerp(b,.40));weapon_tip=list(b+direction*.16)
WEAPON=PARTS[weapon_start:]

# Sparse dark bristles on crown and back; geometry rather than alpha cards.
for i in range(24 if G else 52):
    a=random.uniform(0,2*math.pi);t=random.uniform(.25,.8) if G else random.uniform(.55,1.10)
    center=Vector((0,-.012,1.218)) if G else Vector((0,-.014,2.065))
    r=Vector(((.171 if G else .191)*math.sin(t)*math.cos(a),(.127 if G else .151)*math.sin(t)*math.sin(a),(.171 if G else .213)*math.cos(t)))
    p=center+r;d=r.normalized()
    tube('Sparse coarse hair',[p,p+d*(.012 if G else .018)+Vector((0,.004,0)),p+d*(.024 if G else .036)+Vector((0,.010,-.006))],1,LEATHER,'Head',radii=[.0007,.00045,.0001],sides=4)

# Same 24 names and parenting as the genuine Meshy library; no borrowed geometry.
armdata=bpy.data.armatures.new(KIND.title()+' authored 24-bone skeleton')
arm=bpy.data.objects.new('Armature',armdata);bpy.context.collection.objects.link(arm)
bpy.ops.object.select_all(action='DESELECT');arm.select_set(True);bpy.context.view_layer.objects.active=arm;bpy.ops.object.mode_set(mode='EDIT')
def bone(name,a,b,parent=None):
    e=armdata.edit_bones.new(name);e.head=a;e.tail=b
    if parent:e.parent=armdata.edit_bones[parent]
    return e
bone('Hips',(0,0,hips),(0,0,hips+.13))
bone('Spine02',(0,0,hips+.10),(0,0,hips+(chest-hips)*.42),'Hips')
bone('Spine01',(0,0,hips+(chest-hips)*.42),(0,0,chest-.055),'Spine02')
bone('Spine',(0,0,chest-.055),(0,0,neck-.03),'Spine01')
bone('neck',(0,0,neck-.03),(0,-.017,head-.105),'Spine')
bone('Head',(0,-.017,head-.105),(0,-.02,head+.125),'neck')
bone('head_end',(0,-.02,head+.125),(0,-.02,head+.17),'Head')
bone('headfront',(0,-.04,head),(0,-.17,head),'Head')
for sign,side in [(-1,'Right'),(1,'Left')]:
    sh=(sign*shoulder,0,shoulderz);el=(sign*elbow[0],elbow[1],elbow[2]);wr=(sign*wrist[0],wrist[1],wrist[2])
    bone(side+'Shoulder',(sign*.04,0,shoulderz),sh,'Spine')
    bone(side+'Arm',sh,el,side+'Shoulder')
    bone(side+'ForeArm',el,wr,side+'Arm')
    bone(side+'Hand',wr,Vector(wr)+Vector((sign*.01,-.019,-(.105 if G else .176))),side+'ForeArm')
    hp=(sign*hipx,.026,hips);kn=(sign*knee[0],knee[1],knee[2]);an=(sign*ankle[0],ankle[1],ankle[2])
    bone(side+'UpLeg',hp,kn,'Hips');bone(side+'Leg',kn,an,side+'UpLeg')
    ft=(sign*ankle[0],-.14 if G else -.196,.049 if G else .058)
    bone(side+'Foot',an,ft,side+'Leg');bone(side+'ToeBase',ft,(ft[0],ft[1]-(.065 if G else .105),ft[2]),side+'Foot')
bpy.ops.object.mode_set(mode='OBJECT')

# Analytic skin weights blend only anatomical neighbors, avoiding contralateral bleed.
segments={b.name:(np.array(b.head_local),np.array(b.tail_local)) for b in armdata.bones}
def segment_distance(p,a,b):
    t=np.clip(np.dot(p-a,b-a)/max(1e-12,np.dot(b-a,b-a)),0,1)
    return np.linalg.norm(p-a-t*(b-a))
def weights(p):
    x,y,z=p;ax=abs(x);side='Left' if x>0 else 'Right'
    if z>neck-.012:
        # Blend the neck into rigid face at its underside.
        t=float(np.clip((z-(neck-.012))/.070,0,1))
        return {'neck':1-t,'Head':t}
    # Lateral upper limbs, hands, and fingers.
    arm_boundary=(.192 if G else .371)
    if ax>arm_boundary and z>(.39 if G else .66):
        cand=[side+'Shoulder',side+'Arm',side+'ForeArm',side+'Hand']
        if z<shoulderz-.11 and ax>abs(wrist[0])-.055:cand=[side+'ForeArm',side+'Hand']
    elif z<hips-.035:
        cand=[side+'UpLeg',side+'Leg',side+'Foot',side+'ToeBase']
        if z>hips-.13:cand+=['Hips']
    else:cand=['Hips','Spine02','Spine01','Spine','neck']
    ds=[segment_distance(p,*segments[n]) for n in cand];order=np.argsort(ds)[:2]
    vals=np.array([math.exp(-((ds[i]-min(ds))/(.029 if G else .054))**1.7) for i in order]);vals/=vals.sum()
    return {cand[i]:float(w) for i,w in zip(order,vals)}

max_influences=0;zero=0;numverts=0
for o in PARTS:
    groups={n:o.vertex_groups.new(name=n) for n in segments}
    bind=o.get('bind_bone','AUTO')
    for v in o.data.vertices:
        ws=weights(np.array(v.co)) if bind=='AUTO' else {bind:1}
        ws={n:w for n,w in ws.items() if w>1e-6};s=sum(ws.values())
        assert s>0 and all(math.isfinite(w) and w>=0 for w in ws.values())
        for n,w in ws.items():groups[n].add([v.index],w/s,'REPLACE')
        max_influences=max(max_influences,len(ws));numverts+=1
    o.parent=arm;mod=o.modifiers.new('Authored normalized skin weights','ARMATURE');mod.object=arm

# Consolidate draw calls by material while retaining normalized groups and skin.
bpy.ops.object.select_all(action='DESELECT')
for o in PARTS:
    if o not in WEAPON:o.select_set(True)
bpy.context.view_layer.objects.active=skin;bpy.ops.object.join();character=bpy.context.object;character.name=KIND.title()+' authored reference character'
for f in character.data.polygons:f.use_smooth=True
bpy.ops.object.select_all(action='DESELECT')
for o in WEAPON:o.select_set(True)
bpy.context.view_layer.objects.active=WEAPON[0];bpy.ops.object.join();weapon=bpy.context.object
weapon.name='GoblinHeldCleaver' if G else 'OgreHeldClub'
weapon['heldEquipment']=True;weapon['excludeFromGrounding']=True

# True authored breathing idle, with no root scale or horizontal drift.
scene=bpy.context.scene;scene.render.fps=24;scene.frame_start=0;scene.frame_end=48
arm.animation_data_create();action=bpy.data.actions.new('idle');arm.animation_data.action=action
for pb in arm.pose.bones:pb.rotation_mode='XYZ'
for frame in range(49):
    phase=2*math.pi*frame/48
    for pb in arm.pose.bones:pb.rotation_euler=(0,0,0);pb.location=(0,0,0);pb.scale=(1,1,1)
    arm.pose.bones['Spine'].rotation_euler.x=.010*math.sin(phase)
    arm.pose.bones['Head'].rotation_euler.y=.012*math.sin(phase+.2)
    arm.pose.bones['LeftArm'].rotation_euler.x=.012*math.sin(phase)
    arm.pose.bones['RightArm'].rotation_euler.x=-.010*math.sin(phase)
    for pb in arm.pose.bones:
        pb.keyframe_insert('rotation_euler',frame=frame,group=pb.name)
        pb.keyframe_insert('location',frame=frame,group=pb.name)
        pb.keyframe_insert('scale',frame=frame,group=pb.name)
action.use_fake_user=True
scene.frame_set(0);bpy.context.view_layer.update()

# Weapon contact metadata in model coordinates and hand-local coordinates for runtime.
hand=armdata.bones['RightHand'];inv=hand.matrix_local.inverted()
source=ROOT/('hf_20260909_002155_2cfd6662-d8e7-4ca5-9b80-bbe276ee6cae.png' if G else 'hf_20260909_002300_e4f73d18-4dda-4d66-8bc5-1f163c44cf9d.png')
provenance={'asset':KIND,'authorship':'Locally authored reference-guided interpretation','method':'Continuous voxel-union anatomical sculpt; explicit facial and garment meshes; hand-authored normalized 24-joint skin; vertex-painted surfaces','sourceImage':str(source),'sourceImageSha256':hashlib.sha256(source.read_bytes()).hexdigest(),'sourceImagePreserved':True,'isProviderReconstruction':False,'isExactSourceDerivedTopology':False,'limitations':['Stylized interpretation of one frontal photograph; unseen rear surfaces invented.','Mesh and facial proportions are authored approximations, not photogrammetry.'],'referenceFeatures':(['large pointed ears','yellow slit-pupil eyes','hooked nose and iron hoop','individual crooked teeth','pot belly','tooth necklace','ragged patchwork loincloth','rope-tied leather boots','solid cleaver with real circular hole'] if G else ['grey-green moss-mottled bulky anatomy','broad pig nose','curved ivory jaw tusks','ragged hide loincloth','rusted shoulder pauldron','diagonal leather strap','wooden club with iron spikes','bare broad feet']),'boneNames':list(segments),'bones':len(segments),'verticesBeforeJoin':numverts,'triangles':sum(len(p.vertices)-2 for p in character.data.polygons),'maxSkinInfluences':max_influences,'unweightedVertices':zero,'animationNames':['idle'],'heldWeapon':True,'contactBaseBlender':weapon_base,'contactTipBlender':weapon_tip,'contactBaseRightHandLocal':list(inv@Vector(weapon_base)),'contactTipRightHandLocal':list(inv@Vector(weapon_tip))}
(OUT/(KIND+'-local-authorship.json')).write_text(json.dumps(provenance,indent=2))
provenance['heldEquipmentNode']=weapon.name
provenance['heldEquipmentTriangles']=sum(len(p.vertices)-2 for p in weapon.data.polygons)
(OUT/(KIND+'-local-authorship.json')).write_text(json.dumps(provenance,indent=2))
character['authorship']=provenance['authorship'];character['source_image']=source.name
bpy.ops.wm.save_as_mainfile(filepath=str(OUT/(KIND+'-authored.blend')))
bpy.ops.object.select_all(action='DESELECT');arm.select_set(True);character.select_set(True);weapon.select_set(True);bpy.context.view_layer.objects.active=arm
bpy.ops.export_scene.gltf(filepath=str(OUT/(KIND+'-original.glb')),export_format='GLB',use_selection=True,export_animations=True,export_animation_mode='ACTIONS',export_frame_range=False,export_force_sampling=True,export_skins=True,export_all_influences=False,export_yup=True,export_extras=True,export_cameras=False,export_lights=False)
print(json.dumps(provenance,indent=2),flush=True)
