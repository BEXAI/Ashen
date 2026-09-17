import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
const source=path.resolve(process.argv[2]||'../references/higgsfield-september-8-2026');
const root=path.resolve('public/assets/roster/september-8');
const summary=JSON.parse(await fs.readFile(path.join(source,'models/runtime-build-summary.json'),'utf8'));
let grounding={};try{grounding=JSON.parse(await fs.readFile(path.join(source,'models/runtime-grounding.json'),'utf8'));}catch{}
const heights={goblin:1.65,ogre:3.1,golem:3.1,spider:1.25,'ember-dragon':2.8};
const blade={side:[.28,.49],diagonal:[.33,.47],backhand:[.40,.56],overhead:[.44,.60]};
const characters={};
for(const entry of summary.models){if(entry.status!=='complete')continue;const id=entry.slug,variants={};await fs.mkdir(path.join(root,'models'),{recursive:true});
 for(const[tier,suffix]of[['mobile','mobile1024'],['hd','hd2048']]){
  const name=`${id}-${tier}.glb`,src=path.join(source,'models/optimized',id,`${id}-runtime.${suffix}.glb`),bytes=await fs.readFile(src);await fs.writeFile(path.join(root,'models',name),bytes);variants[tier]={url:`/assets/roster/september-8/models/${name}`,sha256:crypto.createHash('sha256').update(bytes).digest('hex'),bytes:bytes.length};
 }
 const phase=id==='ogre'?[.65,.88]:id==='reaper'?{side:[.34,.45],diagonal:[.20,.29],backhand:[.29,.40],overhead:[.14,.25]}:entry.style==='claws'?[.32,.44]:entry.style==='staff'?[.36,.44]:entry.style==='bow'?[.69,.76]:blade;
 const ground=grounding[id];
 characters[id]={sourceAssetId:entry.originalArtworkAssetId,height:heights[id]??2.65,yaw:0,strikeYaw:id==='ranger'?-Math.PI/2:id==='ember-dragon'?-Math.PI/6:0,contactPhase:phase,variants,...(ground?{grounding:ground}:{}),derivation:['goblin','ogre'].includes(id)?'locally-authored-reference-interpretation':'higgsfield-image-to-3d'};
}
await fs.writeFile(path.join(root,'manifest.json'),JSON.stringify({version:'september-8-2026-v1',sourceDate:'2026-09-08',characters},null,2)+'\n');
console.log(`Staged ${Object.keys(characters).length} characters with mobile and HD variants.`);
