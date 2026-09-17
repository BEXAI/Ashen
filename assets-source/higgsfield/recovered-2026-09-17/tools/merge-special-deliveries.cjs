'use strict';
const fs=require('node:fs'),path=require('node:path');const base=path.resolve(__dirname,'..'),read=name=>JSON.parse(fs.readFileSync(path.join(base,name),'utf8')),write=(name,data)=>fs.writeFileSync(path.join(base,name),JSON.stringify(data,null,2)+'\n');
const entries=read('manifest-entries.json'),summary=read('runtime-build-summary.json'),ground=read('runtime-grounding.json'),inventory=read('inventory.json');
for(const slug of ['reaper','ranger','spider','ember-dragon']){
 const entry=read(slug==='ember-dragon'?'ember-dragon-manifest-entry.json':slug+'-manifest-entry.json');entries[slug]=entry;ground[slug]=entry.grounding;
 let model;if(slug==='ember-dragon')model=read('dragon-runtime-build-summary.json').models.find(x=>x.slug===slug);else if(slug!=='spider')model=read(slug+'-build-summary.json');else{const s=read('spider-build-summary.json'),original=inventory.assets.find(x=>x.slug===slug);model={slug,status:'complete',sourceAssetId:entry.sourceAssetId,sourceJobId:entry.sourceJobId,original:{path:'models/spider-original.glb',sha256:original.sha256,bytes:original.bytes},variants:entry.variants,provenance:'spider-provenance.json',rig:s.rig,validationErrors:0,detailedSummary:'spider-build-summary.json',grounding:entry.grounding};}
 const index=summary.models.findIndex(x=>x.slug===slug);if(index>=0)summary.models[index]=model;else summary.models.push(model);
}
summary.updatedAtUTC=new Date().toISOString();write('manifest-entries.json',entries);write('runtime-build-summary.json',summary);write('runtime-grounding.json',ground);console.log(JSON.stringify({models:summary.models.length,variants:Object.values(entries).reduce((n,x)=>n+Object.keys(x.variants).length,0)}));
