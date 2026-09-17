import * as T from 'three';

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
export function surfaceAsset(family:string,kind:string,quality:string){
  const dungeon=family==='floor'||family==='wall';
  return `/assets/${dungeon?'dungeon':'4k'}/${family}-${kind}${quality==='high'?'':quality==='low'&&dungeon?'-1k':'-2k'}.webp`;
}

export function mobileAutoResolution(width:number,height:number,scale:number,maxDimension=8192){
  const base=renderResolution(width,height,'medium',maxDimension);
  const ratio=Math.min(base.ratio,1600/Math.max(width,height),2)*Math.max(.65,Math.min(1,scale));
  return {ratio,width:Math.max(1,Math.floor(width*ratio)),height:Math.max(1,Math.floor(height*ratio))};
}

/** Replace complete texture sets together; stale async loads never change the active quality. */
export class SurfaceTextures {
  private generation=0;private owned=new Set<T.Texture>();private stopped=false;private requested='';
  constructor(private surfaces:Surface[],private anisotropy:number,private onError:()=>void){}
  async setQuality(quality:string){
    if(this.stopped||quality===this.requested)return;
    this.requested=quality;
    const generation=++this.generation;
    const loader=new T.TextureLoader(),created=new Set<T.Texture>();
    try{
      const entries=await Promise.all([...new Set(this.surfaces.map(s=>s.family))].flatMap(family=>(['diff','normal','arm'] as const).map(kind=>new Promise<[string,T.Texture]>((resolve,reject)=>{
        const texture=loader.load(surfaceAsset(family,kind,quality),t=>resolve([`${family}-${kind}`,t]),undefined,reject);
        texture.wrapS=texture.wrapT=T.RepeatWrapping;texture.anisotropy=this.anisotropy;
        texture.colorSpace=kind==='diff'?T.SRGBColorSpace:T.NoColorSpace;created.add(texture);
      }))));
      if(this.stopped||generation!==this.generation){created.forEach(t=>t.dispose());return;}
      const bases=new Map(entries),old=new Set<T.Texture>(this.owned);
      for(const surface of this.surfaces){
        const {material,family,repeat}=surface;
        for(const t of [material.map,material.normalMap,material.roughnessMap,material.aoMap])if(t)old.add(t);
        const clone=(kind:string)=>{const t=bases.get(`${family}-${kind}`)!.clone();t.repeat.set(repeat,repeat);t.needsUpdate=true;created.add(t);return t;};
        material.map=clone('diff');material.normalMap=clone('normal');const arm=clone('arm');material.roughnessMap=arm;material.aoMap=arm;material.aoMapIntensity=.7;material.roughness=1;material.needsUpdate=true;
      }
      this.owned=created;old.forEach(t=>t.dispose());
    }catch{created.forEach(t=>t.dispose());if(!this.stopped&&generation===this.generation){this.requested='';this.onError();}}
  }
  dispose(){this.stopped=true;this.generation++;this.owned.forEach(t=>t.dispose());this.owned.clear();}
}
