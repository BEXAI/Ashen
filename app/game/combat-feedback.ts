import * as T from 'three';
import type { Point3, StrikeId, Swing } from './combat';

// Actual WeaponTip XZ samples at 0..100% of each authored active interval.
// These preview direction, not the collision volume or guaranteed damage area.
const PATHS:Record<'crypt-warden'|'ember-sovereign',Record<StrikeId,number[][]>>={"crypt-warden":{"side":[[-1.3419,0.7215],[-1.2719,0.8967],[-0.996,1.3107],[-0.4244,1.725],[0.3826,1.8793],[1.1845,1.6562],[1.749,1.183],[2.0133,0.7408],[2.0832,0.5479]],"diagonal":[[-0.437,-0.0463],[-0.492,0.1084],[-0.5918,0.5123],[-0.6293,1.0657],[-0.5321,1.5829],[-0.327,1.8885],[-0.1108,1.9433],[0.0322,1.8612],[0.0818,1.804]],"backhand":[[2.2233,0.3958],[2.1646,0.5901],[1.9353,1.0415],[1.4414,1.5443],[0.7344,1.8485],[0.0095,1.8383],[-0.533,1.597],[-0.8235,1.3268],[-0.9115,1.2055]],"overhead":[[0.184,-0.3259],[0.1527,-0.1484],[0.0886,0.3289],[0.0484,0.9849],[0.0768,1.6037],[0.1708,1.9709],[0.283,2.0297],[0.3644,1.9164],[0.3938,1.8397]]},"ember-sovereign":{"side":[[-1.5728,0.7815],[-1.4954,0.9815],[-1.1879,1.4548],[-0.5467,1.9317],[0.362,2.1175],[1.2678,1.8772],[1.9077,1.3525],[2.2088,0.8591],[2.289,0.6435]],"diagonal":[[-0.5195,-0.1544],[-0.5869,0.0226],[-0.7122,0.4871],[-0.7693,1.1285],[-0.6715,1.7342],[-0.4464,2.0993],[-0.2046,2.1744],[-0.0437,2.088],[0.0121,2.0252]],"backhand":[[2.4534,0.4782],[2.3853,0.6953],[2.1224,1.1987],[1.561,1.756],[0.7613,2.0867],[-0.0554,2.0625],[-0.6642,1.7798],[-0.9887,1.4681],[-1.0865,1.3288]],"overhead":[[0.1576,-0.4497],[0.1206,-0.2485],[0.0443,0.2952],[-0.0062,1.0485],[0.0216,1.7659],[0.1257,2.199],[0.2524,2.2778],[0.3449,2.1556],[0.3785,2.0704]]}};
const clamp=(n:number)=>Math.max(0,Math.min(1,n));
/** Closest point on the already wall-clipped blade to the accepted victim capsule. */
export function bladeContactPoint(a:Point3,b:Point3,x:number,z:number,low:number,high:number,out:T.Vector3){
 const ux=b.x-a.x,uy=b.y-a.y,uz=b.z-a.z,vy=high-low,rx=a.x-x,ry=a.y-low,rz=a.z-z;
 const aa=ux*ux+uy*uy+uz*uz,ee=vy*vy,bb=uy*vy,cc=ux*rx+uy*ry+uz*rz,ff=vy*ry;let s=0,t=0;
 if(aa<=1e-12&&ee<=1e-12)return out.set(a.x,a.y,a.z);
 if(aa<=1e-12)t=clamp(ff/ee);else if(ee<=1e-12)s=clamp(-cc/aa);else{
  const denominator=aa*ee-bb*bb;s=denominator>1e-12?clamp((bb*ff-cc*ee)/denominator):0;t=(bb*s+ff)/ee;
  if(t<0){t=0;s=clamp(-cc/aa);}else if(t>1){t=1;s=clamp((bb-cc)/aa);}
 }
 return out.set(a.x+ux*s,a.y+uy*s,a.z+uz*s);
}

/** One reusable 17-triangle mesh per enemy replaces the existing full ring. */
export class DirectionalTelegraph {
 readonly mesh:T.Mesh<T.BufferGeometry,T.MeshBasicMaterial>;
 private positions=new Float32Array(51*3);private current:StrikeId|null=null;
 constructor(scene:T.Scene,private skin:'crypt-warden'|'ember-sovereign'){
  const geometry=new T.BufferGeometry().setAttribute('position',new T.BufferAttribute(this.positions,3).setUsage(T.DynamicDrawUsage));
  this.mesh=new T.Mesh(geometry,new T.MeshBasicMaterial({color:'#f4a36a',transparent:true,opacity:.62,side:T.DoubleSide,depthWrite:false,toneMapped:false}));
  this.mesh.name='directional windup cue';this.mesh.frustumCulled=false;this.mesh.visible=false;scene.add(this.mesh);
 }
 update(swing:Swing|null,x:number,groundY:number,z:number,scale:number,reducedMotion:boolean){
  if(!swing||swing.elapsed<0||swing.elapsed>=swing.strike.windup){this.mesh.visible=false;return;}
  const points=PATHS[this.skin][swing.strike.id];
  if(this.current!==swing.strike.id){
   this.current=swing.strike.id;let at=0;
   const put=(x:number,z:number)=>{this.positions[at++]=x;this.positions[at++]=0;this.positions[at++]=z;};
   for(let i=0;i<points.length-1;i++){
    const a=points[i],b=points[i+1],dx=b[0]-a[0],dz=b[1]-a[1],n=Math.hypot(dx,dz)||1,px=-dz/n*.035,pz=dx/n*.035;
    put(a[0]+px,a[1]+pz);put(a[0]-px,a[1]-pz);put(b[0]+px,b[1]+pz);
    put(a[0]-px,a[1]-pz);put(b[0]-px,b[1]-pz);put(b[0]+px,b[1]+pz);
   }
  }
  // A restrained moving arrow expresses order. Reduced motion retains the full static trace and terminal arrow.
  const progress=reducedMotion?1:clamp(swing.elapsed/swing.strike.windup),segment=Math.min(7,Math.floor(progress*8)),fraction=progress*8-segment;
  const a=points[segment],b=points[segment+1],dx=b[0]-a[0],dz=b[1]-a[1],n=Math.hypot(dx,dz)||1,tx=a[0]+dx*fraction,tz=a[1]+dz*fraction;
  this.positions.set([tx,0,tz,tx-dx/n*.23-dz/n*.12,0,tz-dz/n*.23+dx/n*.12,tx-dx/n*.23+dz/n*.12,0,tz-dz/n*.23-dx/n*.12],48*3);
  this.mesh.geometry.attributes.position.needsUpdate=true;this.mesh.position.set(x,groundY+.045,z);this.mesh.rotation.y=swing.facing;this.mesh.scale.setScalar(scale);this.mesh.material.opacity=reducedMotion?.68:.54+.14*progress;this.mesh.visible=true;
 }
 reset(){this.mesh.visible=false;this.current=null;}
 dispose(){this.mesh.removeFromParent();this.mesh.geometry.dispose();this.mesh.material.dispose();}
}
