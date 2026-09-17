import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';

// Import reviewed local derivatives; never submit generation/rigging jobs.
const [sourceArg,...slugs]=process.argv.slice(2);
if(!sourceArg||!slugs.length)throw Error('Usage: node scripts/import-recovered-roster.mjs PREPARED_DIRECTORY SLUG...');
const source=path.resolve(sourceArg),root=process.cwd(),hash=b=>createHash('sha256').update(b).digest('hex');
const entries=JSON.parse(await fs.readFile(path.join(source,'manifest-entries.json'),'utf8'));
const inventory=JSON.parse(await fs.readFile(path.join(source,'inventory.json'),'utf8'));
const manifestFile=path.join(root,'public/assets/roster/recovered-2026-09-17/manifest.json'),manifest=JSON.parse(await fs.readFile(manifestFile,'utf8'));
const prepared=[],obsolete=[];
for(const slug of slugs){
  if(!/^[a-z]+(?:-[a-z]+)*$/.test(slug))throw Error('Invalid character slug');
  let entry;try{entry=JSON.parse(await fs.readFile(path.join(source,slug+'-manifest-entry.json'),'utf8'));}catch(error){if(error.code!=='ENOENT')throw error;entry=entries[slug];}
  const original=inventory.assets.find(a=>a.slug===slug),previous=manifest.characters[slug];
  if(!entry||!original||!previous||entry.sourceAssetId!==previous.sourceAssetId)throw Error(`Unknown/mismatched character: ${slug}`);
  if(!['authored','embedded'].includes(entry.equipment)||!['authored','embedded'].includes(entry.contactSockets))throw Error(`Equipment/socket review missing: ${slug}`);
  const variants={};
  for(const tier of ['mobile','hd']){
    const variant=entry.variants[tier],file=path.resolve(source,variant.path);
    if(!file.startsWith(source+path.sep))throw Error('Variant escapes prepared directory');
    const bytes=await fs.readFile(file);if(hash(bytes)!==variant.sha256||bytes.length!==variant.bytes||variant.validationErrors!==0)throw Error(`Unverified ${slug}/${tier}`);
    const url=`/assets/roster/recovered-2026-09-17/${slug}.${tier}.glb`;
    variants[tier]={url,sha256:variant.sha256,bytes:variant.bytes,textureCap:variant.textureCap};prepared.push({url,bytes});
  }
  for(const variant of Object.values(previous.variants))if(variant.url.startsWith('/assets/roster/september-8/models/'))obsolete.push(variant);
  manifest.characters[slug]={...previous,...entry,sourceJobId:original.jobId,sourceMeshSha256:original.sha256,contentVersion:'recovered-september9-v1',variants};
}
// Complete preflight, including rollback bytes, before changing the active manifest.
const used=new Set(Object.values(manifest.characters).flatMap(c=>Object.values(c.variants).map(v=>v.url)));
const remove=[];for(const variant of obsolete){if(used.has(variant.url))continue;const file=path.join(root,'public',variant.url);const bytes=await fs.readFile(file);if(hash(bytes)!==variant.sha256)throw Error('Previous variant changed: '+variant.url);remove.push(file);}
for(const {url,bytes}of prepared){const file=path.join(root,'public',url);await fs.mkdir(path.dirname(file),{recursive:true});await fs.writeFile(file,bytes);}
manifest.version='september-8-roster-recovered-v1';
const manifestBytes=JSON.stringify(manifest,null,2)+'\n';
await fs.writeFile(manifestFile,manifestBytes);
// Keep the prior URL as a current alias for already-open clients.
await fs.writeFile(path.join(root,'public/assets/roster/september-8/manifest.json'),manifestBytes);
for(const file of new Set(remove))await fs.unlink(file);
console.log(`Activated ${slugs.length} reviewed recovered meshes (${prepared.length} checked variants); omitted ${remove.length} prior delivery files. Previous masters and rollback manifest remain in assets-source and Git history.`);
