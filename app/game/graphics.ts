import * as T from 'three';
import { runtimeSurfaceAsset } from './surface-assets.mjs';
export { surfaceAsset, runtimeSurfaceAsset } from './surface-assets.mjs';

export type GraphicsQuality = 'auto' | 'low' | 'medium' | 'high';
export type Surface = { material:T.MeshStandardMaterial; family:'ground'|'rock'|'floor'|'wall'; repeat:number };

/** Render at a real output-pixel target, independent of CSS pixels or monitor DPR. */
export function renderResolution(width:number,height:number,quality:string,maxDimension=8192) {
  const w=Math.max(1,width),h=Math.max(1,height);
  const target=quality==='high'?3840:quality==='medium'?1920:Math.min(Math.max(w,h),1280);
  const budget=quality==='high'?3840*2160:quality==='medium'?1920*1080:1280*720;
  const ratio=Math.min(target/Math.max(w,h),Math.sqrt(budget/(w*h)),Math.max(1,maxDimension)/Math.max(w,h));
  return {ratio,width:Math.max(1,Math.floor(w*ratio)),height:Math.max(1,Math.floor(h*ratio))};
}
export function mobileAutoResolution(width:number,height:number,scale:number,maxDimension=8192){
  const w=Math.max(1,width),h=Math.max(1,height);
  // Bound fragment work on tall phones and tablets before adaptive downshifts.
  // HUD/CSS resolution and explicit Full HD/Ultra settings remain independent.
  const ratio=Math.min(1.25,Math.sqrt(800000/(w*h)),Math.max(1,maxDimension)/Math.max(w,h))*Math.max(.65,Math.min(1,scale));
  return {ratio,width:Math.max(1,Math.floor(w*ratio)),height:Math.max(1,Math.floor(h*ratio))};
}

/** Replace complete texture sets together; stale async loads never change the active quality. */
export class SurfaceTextures {
  private generation=0;private owned=new Set<T.Texture>();private stopped=false;private requested='';private desired='';private flight:Promise<void>|null=null;
  get pending(){return this.flight!==null;}
  constructor(private surfaces:Surface[],private anisotropy:number,private onError:()=>void,private onChange:()=>void=()=>{}){}
  setAnisotropy(value:number){this.anisotropy=value;for(const texture of this.owned)if(texture.anisotropy!==value){texture.anisotropy=value;texture.needsUpdate=true;}}
  setQuality(quality:string):Promise<void>{
    if(this.stopped)return Promise.resolve();this.desired=quality;
    if(this.flight)return this.flight;
    this.flight=Promise.resolve().then(async()=>{while(!this.stopped&&this.desired&&this.desired!==this.requested){const next=this.desired;await this.applyQuality(next);}}).finally(()=>{this.flight=null;});
    return this.flight;
  }
  private async applyQuality(quality:string){
    if(this.stopped||quality===this.requested)return;
    const generation=++this.generation;
    const loader=new T.TextureLoader(),created=new Set<T.Texture>();
    try{
      const entries=await Promise.all([...new Set(this.surfaces.map(s=>s.family))].flatMap(family=>(['diff','normal','arm'] as const).map(kind=>new Promise<[string,T.Texture]>((resolve,reject)=>{
        const texture=loader.load(runtimeSurfaceAsset(family,kind,quality),t=>resolve([`${family}-${kind}`,t]),undefined,reject);
        texture.wrapS=texture.wrapT=T.RepeatWrapping;texture.anisotropy=this.anisotropy;
        texture.colorSpace=kind==='diff'?T.SRGBColorSpace:T.NoColorSpace;created.add(texture);
      }))));
      if(this.stopped||generation!==this.generation||quality!==this.desired){created.forEach(t=>t.dispose());return;}
      const bases=new Map(entries),old=new Set<T.Texture>(this.owned);
      const shared=new Map<string,T.Texture>();
      for(const surface of this.surfaces){
        const {material,family,repeat}=surface;
        for(const t of [material.map,material.normalMap,material.roughnessMap,material.aoMap])if(t)old.add(t);
        const clone=(kind:string)=>{const key=`${family}-${kind}-${repeat}`;if(shared.has(key))return shared.get(key)!;const t=bases.get(`${family}-${kind}`)!.clone();t.repeat.set(repeat,repeat);t.needsUpdate=true;created.add(t);shared.set(key,t);return t;};
        material.map=clone('diff');material.normalMap=clone('normal');const arm=clone('arm');material.roughnessMap=arm;material.aoMap=arm;material.aoMapIntensity=.45;material.roughness=1;material.needsUpdate=true;
      }
      for(const texture of created)texture.anisotropy=this.anisotropy;
      this.owned=created;this.requested=quality;old.forEach(t=>t.dispose());this.onChange();
    }catch{created.forEach(t=>t.dispose());if(!this.stopped&&generation===this.generation){if(this.desired===quality)this.desired='';this.onError();}}
  }
  dispose(){this.stopped=true;this.generation++;this.owned.forEach(t=>t.dispose());this.owned.clear();}
}
