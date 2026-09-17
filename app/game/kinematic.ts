import type { Progress } from './model';
import type { RosterId } from './character-roster';
import { BONE_THRONE, CORRIDORS, GATES, GATE_HALF_DEPTH, GATE_HALF_WIDTH, ROOMS, gateOpen } from './dungeon-layout';
import { ARCHITECTURE_FLOOR_BOXES } from './architecture-collision';

export type XZ = {x:number;z:number};
export type FloorRect = Readonly<XZ & {width:number;depth:number}>;
export type CollisionBox = Readonly<{id:string;minX:number;maxX:number;minZ:number;maxZ:number}>;
export type BoundarySegment = Readonly<{a:Readonly<XZ>;b:Readonly<XZ>;id:string}>;
export type CollisionWorld = Readonly<{
  floors:readonly FloorRect[];
  boundaries:readonly BoundarySegment[];
  obstacles:readonly CollisionBox[];
  segments:readonly BoundarySegment[];
}>;
export type MotionSegment = {t0:number;t1:number;from:XZ;to:XZ;kind:'move'|'slide'|'hold'};
export type EndpointCorrection = {from:XZ;to:XZ};
/** Segment times are normalized within this tick. Corrections happen only at alpha=1. */
export type MotionPath = {start:XZ;end:XZ;segments:MotionSegment[];corrections:EndpointCorrection[]};
export type CircleBody = XZ & {radius:number};
export type Body = CircleBody & {
  id:string;weight?:number;dead?:boolean;velocity?:XZ;recoilVelocity?:XZ;path?:MotionPath;
};
export type WorldContact = {time:number;normal:XZ;obstacleId:string};
export type MotionResult = XZ & {path:MotionPath;blocked:boolean;invalidStart:boolean;contacts:WorldContact[]};
export type PairResolution = {iterations:number;unresolved:{a:string;b:string;overlap:number}[];invalidBodies:string[]};
export const COLLISION_SKIN = 1e-6;
export const MAX_SLIDES = 4;
export const MAX_PAIR_ITERATIONS = 4;
export const MAX_PAIR_CORRECTION = .12;
const EPS=1e-9, TIME_EPS=1e-10;
const clamp=(n:number,lo:number,hi:number)=>Math.max(lo,Math.min(hi,n));
const point=(x:number,z:number):XZ=>({x,z});
const copy=(p:Readonly<XZ>):XZ=>point(p.x,p.z);
const finitePoint=(p:Readonly<XZ>)=>Number.isFinite(p.x)&&Number.isFinite(p.z);
function assertCircle(body:CircleBody) {
  if(!finitePoint(body)||!Number.isFinite(body.radius)||body.radius<=0)throw new RangeError('A kinematic circle requires finite coordinates and a positive radius');
}
const inRect=(x:number,z:number,r:FloorRect)=>x>=r.x-r.width/2-EPS&&x<=r.x+r.width/2+EPS&&z>=r.z-r.depth/2-EPS&&z<=r.z+r.depth/2+EPS;
function distanceSquaredToSegment(x:number,z:number,a:Readonly<XZ>,b:Readonly<XZ>) {
  const dx=b.x-a.x,dz=b.z-a.z,length=dx*dx+dz*dz;
  const t=length?clamp(((x-a.x)*dx+(z-a.z)*dz)/length,0,1):0;
  return (x-a.x-dx*t)**2+(z-a.z-dz*t)**2;
}

/** Decompose the rectangle union into cells, then retain ONLY its exposed edges. */
function unionBoundary(floors:readonly FloorRect[]):BoundarySegment[] {
  const xs=[...new Set(floors.flatMap(r=>[r.x-r.width/2,r.x+r.width/2]))].sort((a,b)=>a-b);
  const zs=[...new Set(floors.flatMap(r=>[r.z-r.depth/2,r.z+r.depth/2]))].sort((a,b)=>a-b);
  const cells=Array.from({length:Math.max(0,xs.length-1)},(_,i)=>Array.from({length:Math.max(0,zs.length-1)},(_,j)=>floors.some(r=>inRect((xs[i]+xs[i+1])/2,(zs[j]+zs[j+1])/2,r))));
  const groups=new Map<string,{axis:'x'|'z';fixed:number;side:number;spans:[number,number][]}>();
  const add=(axis:'x'|'z',fixed:number,side:number,lo:number,hi:number)=>{
    const key=`${axis}:${fixed}:${side}`,group=groups.get(key)??{axis,fixed,side,spans:[]};group.spans.push([lo,hi]);groups.set(key,group);
  };
  for(let i=0;i<cells.length;i++)for(let j=0;j<cells[i].length;j++)if(cells[i][j]){
    if(!cells[i-1]?.[j])add('x',xs[i],1,zs[j],zs[j+1]);
    if(!cells[i+1]?.[j])add('x',xs[i+1],-1,zs[j],zs[j+1]);
    if(!cells[i]?.[j-1])add('z',zs[j],1,xs[i],xs[i+1]);
    if(!cells[i]?.[j+1])add('z',zs[j+1],-1,xs[i],xs[i+1]);
  }
  const result:BoundarySegment[]=[];
  for(const group of groups.values()){
    group.spans.sort((a,b)=>a[0]-b[0]);let [lo,hi]=group.spans[0];
    const emit=()=>result.push({a:group.axis==='x'?point(group.fixed,lo):point(lo,group.fixed),b:group.axis==='x'?point(group.fixed,hi):point(hi,group.fixed),id:`floor:${result.length}`});
    for(const span of group.spans.slice(1)){
      if(span[0]<=hi+EPS)hi=Math.max(hi,span[1]);else{emit();[lo,hi]=span;}
    }
    emit();
  }
  return result;
}
function boxSegments(box:CollisionBox):BoundarySegment[] {
  const corners=[point(box.minX,box.minZ),point(box.maxX,box.minZ),point(box.maxX,box.maxZ),point(box.minX,box.maxZ)];
  return corners.map((a,i)=>({a,b:corners[(i+1)%4],id:box.id}));
}
/** Public fixture/custom-world constructor; no rendering or engine dependency. */
export function createCollisionWorld(floors:readonly FloorRect[],obstacles:readonly CollisionBox[]=[]):CollisionWorld {
  if(!floors.length||floors.some(r=>!finitePoint(r)||!Number.isFinite(r.width)||!Number.isFinite(r.depth)||r.width<=0||r.depth<=0))throw new RangeError('Collision floors must have finite positive extents');
  if(obstacles.some(b=>![b.minX,b.maxX,b.minZ,b.maxZ].every(Number.isFinite)||b.maxX<=b.minX||b.maxZ<=b.minZ))throw new RangeError('Collision obstacles must have finite positive extents');
  const frozenFloors=Object.freeze(floors.map(r=>Object.freeze({...r})));
  const boundaries=Object.freeze(unionBoundary(frozenFloors).map(s=>Object.freeze({...s,a:Object.freeze(s.a),b:Object.freeze(s.b)})));
  const boxes=Object.freeze(obstacles.map(b=>Object.freeze({...b})));
  const segments=Object.freeze([...boundaries,...boxes.flatMap(boxSegments)].map(s=>Object.freeze({...s,a:Object.freeze(s.a),b:Object.freeze(s.b)})));
  return Object.freeze({floors:frozenFloors,boundaries,obstacles:boxes,segments});
}
const worlds=new Map<number,CollisionWorld>();
export function buildCollisionWorld(progress:Pick<Progress,'won'|'shrines'|'defeated'>):CollisionWorld {
  const mask=GATES.reduce((n,_g,i)=>n|(gateOpen(i,progress)?1<<i:0),0);
  let world=worlds.get(mask);if(world)return world;
  const obstacles:CollisionBox[]=[...ARCHITECTURE_FLOOR_BOXES,{id:'bone-throne',minX:BONE_THRONE.x-BONE_THRONE.halfWidth,maxX:BONE_THRONE.x+BONE_THRONE.halfWidth,minZ:BONE_THRONE.z-BONE_THRONE.halfDepth,maxZ:BONE_THRONE.z+BONE_THRONE.halfDepth}];
  GATES.forEach((g,i)=>{if(!(mask&(1<<i)))obstacles.push({id:`gate:${i}`,minX:-GATE_HALF_WIDTH,maxX:GATE_HALF_WIDTH,minZ:g.z-GATE_HALF_DEPTH,maxZ:g.z+GATE_HALF_DEPTH});});
  world=createCollisionWorld([...ROOMS,...CORRIDORS],obstacles);worlds.set(mask,world);return world;
}
export function openFloorWorld():CollisionWorld {return buildCollisionWorld({won:true,shrines:[],defeated:[]});}

/** A center-in-union AND boundary-distance test validates the complete circle, including holes. */
export function canOccupy(world:CollisionWorld,x:number,z:number,radius:number):boolean {
  if(!Number.isFinite(x)||!Number.isFinite(z)||!Number.isFinite(radius)||radius<=0)return false;
  if(!world.floors.some(r=>inRect(x,z,r)))return false;
  const squared=radius*radius,tolerance=EPS*Math.max(1,radius);
  if(world.boundaries.some(s=>distanceSquaredToSegment(x,z,s.a,s.b)<squared-tolerance))return false;
  return world.obstacles.every(b=>{
    if(x>=b.minX&&x<=b.maxX&&z>=b.minZ&&z<=b.maxZ)return false;
    return (x-clamp(x,b.minX,b.maxX))**2+(z-clamp(z,b.minZ,b.maxZ))**2>=squared-tolerance;
  });
}

type SweepHit={time:number;normal:XZ;obstacleId:string};
/** Exact TOI against each segment's rectangular strip and its two circular caps. */
function sweepCircle(start:XZ,delta:XZ,radius:number,segments:readonly BoundarySegment[]):SweepHit[] {
  let earliest=Infinity;const hits:SweepHit[]=[];
  const accept=(t:number,nx:number,nz:number,id:string)=>{
    if(t< -TIME_EPS||t>1+TIME_EPS||delta.x*nx+delta.z*nz>=-EPS)return;
    t=clamp(t,0,1);
    if(t<earliest-TIME_EPS){earliest=t;hits.length=0;}
    if(Math.abs(t-earliest)<=TIME_EPS&&!hits.some(h=>Math.abs(h.normal.x-nx)<EPS&&Math.abs(h.normal.z-nz)<EPS))hits.push({time:t,normal:point(nx,nz),obstacleId:id});
  };
  const speed2=delta.x*delta.x+delta.z*delta.z;if(speed2<EPS*EPS)return hits;
  const minX=Math.min(start.x,start.x+delta.x)-radius-EPS,maxX=Math.max(start.x,start.x+delta.x)+radius+EPS;
  const minZ=Math.min(start.z,start.z+delta.z)-radius-EPS,maxZ=Math.max(start.z,start.z+delta.z)+radius+EPS;
  for(const s of segments){
    // Most masonry belongs to other rooms. Keep its exact TOI geometry, but do
    // not solve line/circle quadratics outside this sweep's expanded bounds.
    if(Math.max(s.a.x,s.b.x)<minX||Math.min(s.a.x,s.b.x)>maxX||Math.max(s.a.z,s.b.z)<minZ||Math.min(s.a.z,s.b.z)>maxZ)continue;
    const sx=s.b.x-s.a.x,sz=s.b.z-s.a.z,length=Math.hypot(sx,sz),tx=sx/length,tz=sz/length,nx=-tz,nz=tx;
    const distance=(start.x-s.a.x)*nx+(start.z-s.a.z)*nz,velocity=delta.x*nx+delta.z*nz;
    if(Math.abs(velocity)>EPS)for(const sign of [-1,1]){
      const t=(sign*radius-distance)/velocity,along=(start.x+delta.x*t-s.a.x)*tx+(start.z+delta.z*t-s.a.z)*tz;
      if(along>=-EPS&&along<=length+EPS)accept(t,nx*sign,nz*sign,s.id);
    }
    for(const center of [s.a,s.b]){
      const rx=start.x-center.x,rz=start.z-center.z,b=rx*delta.x+rz*delta.z,c=rx*rx+rz*rz-radius*radius;
      const discriminant=b*b-speed2*c;if(discriminant<0)continue;
      const t=(-b-Math.sqrt(discriminant))/speed2,dx=rx+delta.x*t,dz=rz+delta.z*t,d=Math.hypot(dx,dz);
      if(d>EPS)accept(t,dx/d,dz/d,s.id);
    }
  }
  return hits;
}
export function stationaryMotionPath(position:Readonly<XZ>):MotionPath {
  return {start:copy(position),end:copy(position),segments:[{t0:0,t1:1,from:copy(position),to:copy(position),kind:'hold'}],corrections:[]};
}
/** Start an empty aggregate for appendMotionPath phase pieces. */
export function beginMotionPath(position:Readonly<XZ>):MotionPath {
  if(!finitePoint(position))throw new RangeError('Motion start must be finite');
  return {start:copy(position),end:copy(position),segments:[],corrections:[]};
}

/** Pure world sweep. Invalid starts fail closed; validate/restore a save before moving it. */
export function moveBody(body:CircleBody,displacement:Readonly<XZ>,world:CollisionWorld):MotionResult {
  assertCircle(body);if(!finitePoint(displacement))throw new RangeError('Kinematic displacement must be finite');
  let position=copy(body),remaining=copy(displacement),time=0;
  const path:MotionPath={start:copy(body),end:copy(body),segments:[],corrections:[]},contacts:WorldContact[]=[];
  const invalidStart=!canOccupy(world,body.x,body.z,body.radius);
  if(invalidStart)return {...position,path:stationaryMotionPath(position),blocked:true,invalidStart,contacts};
  const append=(to:XZ,t1:number,kind:MotionSegment['kind'])=>{
    if(t1>time)path.segments.push({t0:time,t1,from:copy(position),to:copy(to),kind});
    position=to;time=t1;
  };
  for(let iteration=0;iteration<MAX_SLIDES&&time<1-TIME_EPS;iteration++){
    const distance=Math.hypot(remaining.x,remaining.z);if(distance<=EPS)break;
    const hits=sweepCircle(position,remaining,body.radius,world.segments);
    if(!hits.length){
      const end=point(position.x+remaining.x,position.z+remaining.z);
      if(canOccupy(world,end.x,end.z,body.radius))append(end,1,iteration?'slide':'move');
      break;
    }
    const hitTime=hits[0].time,safeTime=Math.max(0,hitTime-COLLISION_SKIN/distance),nextTime=time+(1-time)*hitTime;
    const next=point(position.x+remaining.x*safeTime,position.z+remaining.z*safeTime);
    if(!canOccupy(world,next.x,next.z,body.radius))break;
    append(next,nextTime,iteration?'slide':'move');
    for(const hit of hits)contacts.push({time,normal:copy(hit.normal),obstacleId:hit.obstacleId});
    remaining=point(remaining.x*(1-hitTime),remaining.z*(1-hitTime));
    // Multiple coincident faces constrain the remaining displacement to their feasible cone.
    for(let pass=0;pass<3;pass++)for(const hit of hits){const inward=remaining.x*hit.normal.x+remaining.z*hit.normal.z;if(inward<0){remaining.x-=hit.normal.x*inward;remaining.z-=hit.normal.z*inward;}}
  }
  if(time<1)append(copy(position),1,'hold');
  path.end=copy(position);
  return {...position,path,blocked:Math.hypot(position.x-body.x-displacement.x,position.z-body.z-displacement.z)>COLLISION_SKIN/2,invalidStart:false,contacts};
}

export function sampleMotionPath(path:MotionPath,alpha:number):XZ {
  if(!Number.isFinite(alpha))throw new RangeError('Motion alpha must be finite');
  if(alpha<=0)return copy(path.start);if(alpha>=1)return copy(path.end);
  for(const s of path.segments)if(alpha<s.t1){const t=clamp((alpha-s.t0)/(s.t1-s.t0),0,1);return point(s.from.x+(s.to.x-s.from.x)*t,s.from.z+(s.to.z-s.from.z)*t);}
  const last=path.segments[path.segments.length-1];return last?copy(last.to):copy(path.start);
}

/** Compose phase-local sweeps into the tick's normalized timeline. Call before endpoint projections. */
export function appendMotionPath(target:MotionPath,part:MotionPath,t0:number,t1:number):void {
  if(!Number.isFinite(t0)||!Number.isFinite(t1)||t0<0||t1>1||t1<=t0||part.corrections.length||target.corrections.length)throw new RangeError('Motion parts need a positive ordered tick interval and no endpoint corrections');
  const prior=target.segments[target.segments.length-1];
  if(prior&&t0<prior.t1-TIME_EPS)throw new RangeError('Motion parts overlap in time');
  if(Math.hypot(target.end.x-part.start.x,target.end.z-part.start.z)>COLLISION_SKIN)throw new RangeError('Motion parts must join spatially');
  const endTime=prior?.t1??0;
  if(t0>endTime)target.segments.push({t0:endTime,t1:t0,from:copy(target.end),to:copy(target.end),kind:'hold'});
  for(const s of part.segments)target.segments.push({...s,t0:t0+s.t0*(t1-t0),t1:t0+s.t1*(t1-t0),from:copy(s.from),to:copy(s.to)});
  target.end=copy(part.end);
}

function pairNormal(a:Body,b:Body):{normal:XZ;distance:number} {
  const dx=a.x-b.x,dz=a.z-b.z,distance=Math.hypot(dx,dz);
  if(distance>EPS)return {normal:point(dx/distance,dz/distance),distance};
  let hash=2166136261;for(const c of `${a.id}\0${b.id}`)hash=Math.imul(hash^c.charCodeAt(0),16777619);
  const angle=(hash>>>0)%8*Math.PI/4;return {normal:point(Math.cos(angle),Math.sin(angle)),distance:0};
}
function removeInward(velocity:XZ|undefined,normal:XZ) {
  if(!velocity)return;const inward=velocity.x*normal.x+velocity.z*normal.z;
  if(inward<0){velocity.x-=inward*normal.x;velocity.z-=inward*normal.z;}
}
function projectBody(body:Body,delta:XZ,world:CollisionWorld):number {
  const before=copy(body),result=moveBody(body,delta,world);
  body.path??=stationaryMotionPath(before);
  body.x=result.x;body.z=result.z;
  if(Math.hypot(body.x-before.x,body.z-before.z)>EPS){
    body.path.corrections.push({from:before,to:copy(body)});body.path.end=copy(body);
  }
  for(const c of result.contacts){removeInward(body.velocity,c.normal);removeInward(body.recoilVelocity,c.normal);}
  return Math.hypot(body.x-before.x,body.z-before.z);
}

/** Mutate only living endpoints AFTER contact/death resolution; never rewrite timed sweep segments. */
export function resolveBodyPairs(bodies:readonly Body[],world:CollisionWorld):PairResolution {
  const live=bodies.filter(b=>!b.dead).slice().sort((a,b)=>a.id<b.id?-1:a.id>b.id?1:0),invalidBodies:string[]=[];
  for(let i=0;i<live.length;i++){
    const body=live[i];assertCircle(body);
    if(i&&body.id===live[i-1].id)throw new RangeError('Kinematic body IDs must be unique');
    if(body.weight!==undefined&&(!Number.isFinite(body.weight)||body.weight<=0))throw new RangeError('Body resistance weights must be finite and positive');
    if(!canOccupy(world,body.x,body.z,body.radius))invalidBodies.push(body.id);
  }
  const valid=live.filter(b=>!invalidBodies.includes(b.id));let iterations=0;
  for(;iterations<MAX_PAIR_ITERATIONS;iterations++){
    const budget=new Map(valid.map(b=>[b.id,MAX_PAIR_CORRECTION]));let overlapping=false;
    for(let i=0;i<valid.length;i++)for(let j=i+1;j<valid.length;j++){
      const a=valid[i],b=valid[j],{normal,distance}=pairNormal(a,b),depth=a.radius+b.radius-distance;
      if(depth<=COLLISION_SKIN)continue;overlapping=true;
      const aw=a.weight??1,bw=b.weight??1,total=aw+bw;
      const aStep=Math.min(depth*bw/total,budget.get(a.id)!),bStep=Math.min(depth*aw/total,budget.get(b.id)!);
      if(aStep>EPS){const used=projectBody(a,point(normal.x*aStep,normal.z*aStep),world);budget.set(a.id,Math.max(0,budget.get(a.id)!-used));}
      if(bStep>EPS){const used=projectBody(b,point(-normal.x*bStep,-normal.z*bStep),world);budget.set(b.id,Math.max(0,budget.get(b.id)!-used));}
    }
    if(!overlapping)break;
  }
  const unresolved:PairResolution['unresolved']=[];
  for(let i=0;i<valid.length;i++)for(let j=i+1;j<valid.length;j++){
    const a=valid[i],b=valid[j],{normal,distance}=pairNormal(a,b),depth=a.radius+b.radius-distance;
    if(depth>COLLISION_SKIN){
      unresolved.push({a:a.id,b:b.id,overlap:depth});
      removeInward(a.velocity,normal);removeInward(a.recoilVelocity,normal);
      const opposite=point(-normal.x,-normal.z);removeInward(b.velocity,opposite);removeInward(b.recoilVelocity,opposite);
    }
  }
  return {iterations,unresolved,invalidBodies};
}

export function movementRadius(rosterId:RosterId):number {
  switch(rosterId){case'goblin':return .30;case'spider':return .55;case'ogre':case'golem':return .65;case'ember-dragon':return .90;default:return .45;}
}
export function resistanceWeight(rosterId:RosterId):number {return rosterId==='ember-dragon'?4:rosterId==='ogre'||rosterId==='golem'?2:1;}
export type VelocityOptions={acceleration?:number;braking?:number;maxSpeed?:number};
/** Euclidean acceleration avoids diagonal boosts. maxSpeed clamps existing momentum immediately. */
export function approachVelocity(current:Readonly<XZ>,desired:Readonly<XZ>,dt:number,options:VelocityOptions={}):XZ {
  const acceleration=options.acceleration??48,braking=options.braking??64,maxSpeed=options.maxSpeed??Infinity;
  if(!finitePoint(current)||!finitePoint(desired)||!Number.isFinite(dt)||dt<0||![acceleration,braking].every(n=>Number.isFinite(n)&&n>=0)||!(maxSpeed>=0))throw new RangeError('Velocity integration requires finite vectors and nonnegative times/rates');
  const limit=(v:Readonly<XZ>)=>{const speed=Math.hypot(v.x,v.z),scale=speed>maxSpeed?maxSpeed/speed:1;return point(v.x*scale,v.z*scale);};
  const from=limit(current),target=limit(desired),difference=point(target.x-from.x,target.z-from.z),distance=Math.hypot(difference.x,difference.z);
  const slowing=Math.hypot(target.x,target.z)<Math.hypot(from.x,from.z)||from.x*target.x+from.z*target.z<0;
  const step=(slowing?braking:acceleration)*dt;if(distance<=step||distance<=EPS)return target;
  return point(from.x+difference.x*step/distance,from.z+difference.z*step/distance);
}
