import { approachVelocity, beginMotionPath, appendMotionPath, moveBody, type CollisionWorld, type MotionPath, type XZ } from './kinematic';
import { DODGE_RULES, dodgeTravelBetween } from './action-rules';
import { strikeDuration, travelBetween, type Swing } from './combat';

export type LocomotionState = {
  x:number; z:number; radius:number; velocity:XZ; recoil:XZ;
  dodgeAge:number; dodgeDirection:Readonly<XZ>; swing:Swing|null;
};
/** The same phase-split controller is used by gameplay and the boss escape check. */
export function planMotion(state:LocomotionState,intent:Readonly<XZ>,speed:number,dt:number,world:CollisionWorld):MotionPath {
  const path=beginMotionPath(state),swing=state.swing,age=swing?.elapsed??0,rate=swing?.speed??1;
  const boundaries=[0,dt];
  if(swing)for(const at of [swing.strike.windup,swing.strike.windup+swing.strike.active,strikeDuration(swing.strike)]){
    const t=(at-age)/rate;if(t>0&&t<dt)boundaries.push(t);
  }
  if(state.dodgeAge>=0)for(const at of [DODGE_RULES.cruiseDuration,DODGE_RULES.duration]){const t=at-state.dodgeAge;if(t>0&&t<dt)boundaries.push(t);}
  boundaries.sort((a,b)=>a-b);
  for(let i=1;i<boundaries.length;i++){
    const from=boundaries[i-1],to=boundaries[i],span=to-from;if(span<=0)continue;
    const actionAge=age+from*rate, dodging=state.dodgeAge>=0&&state.dodgeAge+from<DODGE_RULES.duration-1e-10;
    const attacking=swing&&actionAge<strikeDuration(swing.strike)-1e-10;
    const cap=attacking?Math.min(speed,5.4*(actionAge>=swing.strike.windup&&actionAge<swing.strike.windup+swing.strike.active?.25:.45)):speed;
    let dx=0,dz=0;
    if(dodging){const travel=dodgeTravelBetween(state.dodgeAge+from,state.dodgeAge+to);dx=state.dodgeDirection.x*travel;dz=state.dodgeDirection.z*travel;state.velocity={x:0,z:0};}
    else{state.velocity=approachVelocity(state.velocity,{x:intent.x*cap,z:intent.z*cap},span,{maxSpeed:cap});dx=state.velocity.x*span;dz=state.velocity.z*span;}
    if(swing){const travel=travelBetween(swing.strike,age+from*rate,age+to*rate);dx+=Math.sin(swing.facing)*travel;dz+=Math.cos(swing.facing)*travel;}
    const decay=Math.exp(-12*span);dx+=state.recoil.x*(1-decay)/12;dz+=state.recoil.z*(1-decay)/12;
    state.recoil={x:state.recoil.x*decay,z:state.recoil.z*decay};
    const moved=moveBody(state,{x:dx,z:dz},world);state.x=moved.x;state.z=moved.z;
    for(const contact of moved.contacts)for(const velocity of [state.velocity,state.recoil]){const inward=velocity.x*contact.normal.x+velocity.z*contact.normal.z;if(inward<0){velocity.x-=contact.normal.x*inward;velocity.z-=contact.normal.z*inward;}}
    appendMotionPath(path,moved.path,from/dt,to/dt);
  }
  return path;
}
