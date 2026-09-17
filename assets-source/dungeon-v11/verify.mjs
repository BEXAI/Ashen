// Independent file readback: no rebaking, no Site writes.
import fs from 'node:fs';import path from 'node:path';import crypto from 'node:crypto';import {createRequire} from 'node:module';import {fileURLToPath} from 'node:url';
const game=process.env.ASHEN_GAME_ROOT||'/Users/nathaniel/Documents/ChatGPT/Knight/game',out=process.env.FLOOR_BAKE_OUT||path.dirname(fileURLToPath(import.meta.url)),require=createRequire(game+'/package.json'),sharp=require('sharp');
const sha=x=>crypto.createHash('sha256').update(x).digest('hex'),report=JSON.parse(fs.readFileSync(out+'/report.json')),manifest=JSON.parse(fs.readFileSync(out+'/manifest-proposal.json')),checks=[];
for(const r of report.rooms){
 const entry=manifest.rooms.find(x=>x.id===r.id),before=await sharp(game+'/public'+r.oldLightmap).ensureAlpha().raw().toBuffer(),afterBytes=fs.readFileSync(out+'/lightmaps/'+r.id+'-indirect.png'),after=await sharp(afterBytes).ensureAlpha().raw().toBuffer(),mask=await sharp(out+'/masks/'+r.id+'-floor-owned.png').greyscale().raw().toBuffer();
 if(sha(afterBytes)!==r.newLightmapSha256||sha(afterBytes)!==entry.lightmapSha256)throw Error('Output hash mismatch');
 if(sha(fs.readFileSync(game+'/public'+entry.url))!==r.roomGlbSha256||r.roomGlbSha256!==entry.sha256)throw Error('Room GLB changed');
 let protectedPixelsChanged=0,alphaChanged=0,changed=0;for(let i=0;i<mask.length;i++){let diff=false;for(let k=0;k<4;k++)diff||=before[i*4+k]!==after[i*4+k];if(diff){changed++;if(!mask[i])protectedPixelsChanged++;}if(before[i*4+3]!==after[i*4+3])alphaChanged++;}
 if(protectedPixelsChanged||alphaChanged||changed!==r.changedPixels)throw Error('Pixel protection failed');
 checks.push({id:r.id,glbUnchanged:true,hashMatchesManifest:true,protectedPixelsChanged,alphaChanged,changedPixels:changed});
}
const summary={passed:true,checks,maxJoinDeltaBefore:report.maxJoinDeltaBefore,maxJoinDeltaAfter:report.maxJoinDeltaAfter,lightmapBytes:report.rooms.reduce((n,r)=>n+r.newLightmapBytes,0)};fs.writeFileSync(out+'/readback.json',JSON.stringify(summary,null,2));console.log(JSON.stringify(summary,null,2));
