import * as T from 'three';

/** Rates are proposed tuning values; exponential response is independent of update frequency. */
export function cameraFollowAlpha(dt:number,sprinting=false,obstructed=false){
 const rate=obstructed?18:sprinting?12:10;
 return 1-Math.exp(-Math.max(0,Number.isFinite(dt)?dt:0)*rate);
}

/** Presentation only: call after reconstructing the collision-safe follow pose each frame. */
export class ImpactRotation {
 private age=.18;private amplitude=0;private side=1;
 private angles=new T.Euler();private offset=new T.Quaternion();
 readonly duration=.18;readonly maximumRadians=T.MathUtils.degToRad(.25);
 trigger(strength:number,side:number,enabled:boolean){
  if(!enabled)return;
  const next=this.maximumRadians*T.MathUtils.clamp(Number.isFinite(strength)?strength:0,0,1);
  if(next<=0)return;
  this.amplitude=Math.min(this.maximumRadians,Math.max(this.amplitude*(1-this.age/this.duration),next));
  this.side=side<0?-1:1;this.age=0;
 }
 apply(camera:T.Camera,dt:number,enabled:boolean){
  if(!enabled){this.reset();return;}
  this.age=Math.min(this.duration,this.age+Math.max(0,Number.isFinite(dt)?dt:0));
  if(this.age>=this.duration||!this.amplitude){this.reset();return;}
  const u=this.age/this.duration,envelope=(1-u)*(1-u),wave=Math.sin(u*Math.PI*2);
  this.angles.set(this.amplitude*.55*envelope*wave,0,this.amplitude*.45*this.side*envelope*wave);
  this.offset.setFromEuler(this.angles);camera.quaternion.multiply(this.offset);
 }
 reset(){this.age=this.duration;this.amplitude=0;}
 get active(){return this.age<this.duration&&this.amplitude>0;}
}
