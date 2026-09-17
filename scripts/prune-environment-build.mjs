import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';

const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const loaders=[['dungeon-assets.ts','DUNGEON_MANIFEST_URL','dungeon'],['prop-assets.ts','PROP_MANIFEST_URL','sconce'],['shrine-assets.ts','SHRINE_MANIFEST_URL','shrine'],['architecture-assets.ts','ARCHITECTURE_MANIFEST_URL','architecture']];
function requireValue(ok,message){if(!ok)throw Error(message);}
function resourcePath(client,uri,base='/'){
  requireValue(typeof uri==='string'&&uri.length>0,'Missing asset URI');requireValue(!/[?#\\]/.test(uri),'Unsupported query, fragment or backslash in asset URI');
  requireValue(!/^[a-zA-Z][a-zA-Z\d+.-]*:/.test(uri)&&!uri.startsWith('//'),'Remote/protocol asset dependency is not allowed');
  let decoded;try{decoded=decodeURIComponent(uri);}catch{throw Error('Malformed encoded asset URI');}
  requireValue(!/[?#\\\0]/.test(decoded)&&!decoded.startsWith('//')&&!/^[a-zA-Z][a-zA-Z\d+.-]*:/.test(decoded),'Unsafe encoded asset URI');
  const url=path.posix.normalize(decoded.startsWith('/')?decoded:path.posix.join(path.posix.dirname(base),decoded));requireValue(url.startsWith('/assets/'),'Asset dependency escapes /assets');
  const file=path.resolve(client,'.'+url);requireValue(file.startsWith(path.join(client,'assets')+path.sep),'Asset dependency escapes generated client');return {url,file};
}
function gltfJson(bytes,label){
  if(bytes.length>=12&&bytes.readUInt32LE(0)===0x46546c67){requireValue(bytes.readUInt32LE(4)===2&&bytes.readUInt32LE(8)===bytes.length,`${label}: malformed GLB header`);let json;
    for(let p=12;p<bytes.length;){requireValue(p+8<=bytes.length,`${label}: truncated GLB chunk`);const length=bytes.readUInt32LE(p),type=bytes.readUInt32LE(p+4);requireValue(length%4===0&&p+8+length<=bytes.length,`${label}: invalid GLB chunk`);if(type===0x4e4f534a){requireValue(!json,`${label}: duplicate GLB JSON`);json=JSON.parse(bytes.subarray(p+8,p+8+length));}p+=8+length;}requireValue(json?.asset?.version==='2.0',`${label}: missing glTF 2.0 JSON`);return json;
  }
  const json=JSON.parse(bytes.toString('utf8'));requireValue(json?.asset?.version==='2.0',`${label}: not glTF 2.0`);return json;
}
async function regularFile(file){const stat=await fs.lstat(file);requireValue(stat.isFile()&&!stat.isSymbolicLink(),`Required asset is not a regular file: ${file}`);requireValue(await fs.realpath(file)===file,`Symlinked asset path rejected: ${file}`);return fs.readFile(file);}

/** Plan fully before mutation. Source/public/master/decoder trees are never pruned. */
export async function planEnvironmentPrune(gameRoot){
  const game=await fs.realpath(path.resolve(gameRoot)),client=path.join(game,'dist/client'),roots=['dungeon','props'].map(f=>path.join(client,'assets',f));
  requireValue(await fs.realpath(client)===client,'Generated client directory may not be a symlink');
  const keep=new Map(),sourceChecks=new Map(),manifestCache=new Map(),gltfQueue=[],parsed=new Set(),processedPropManifests=new Set(),manifests=[],embeddedUris=[];
  const isPrunable=file=>roots.some(root=>file.startsWith(root+path.sep));
  async function add(uri,{base='/',sha256,bytes,parse=false,family}={}){
    if(typeof uri==='string'&&uri.startsWith('data:')){requireValue(!family&&!parse,'Primary assets/manifests must be local files');embeddedUris.push({owner:base,scheme:'data'});return;}
    const target=resourcePath(client,uri,base);if(family)requireValue(target.url.startsWith(`/assets/${family}/`),`Primary ${family} asset outside its generated family`);
    let entry=keep.get(target.file);if(!entry){const data=await regularFile(target.file);entry={url:target.url,file:target.file,bytes:data.length,sha256:hash(data),prunableFamily:isPrunable(target.file),data};keep.set(target.file,entry);}
    if(sha256!==undefined)requireValue(entry.sha256===sha256,`Asset hash differs from active manifest: ${target.url}`);if(bytes!==undefined)requireValue(entry.bytes===bytes,`Asset size differs from active manifest: ${target.url}`);
    if(parse&&!parsed.has(target.file)){parsed.add(target.file);gltfQueue.push(entry);}return entry;
  }
  for(const [file,constant,kind]of loaders){
    const sourceFile=path.join(game,'app/game',file),source=await regularFile(sourceFile);sourceChecks.set(sourceFile,hash(source));const url=source.toString('utf8').match(new RegExp(`${constant}\\s*=\\s*['"]([^'"]+)['"]`))?.[1];requireValue(url,`Cannot resolve ${constant}`);
    const family=kind==='dungeon'?'dungeon':'props',bound=await add(url,{family});let manifest=manifestCache.get(bound.file);if(!manifest){manifest=JSON.parse(bound.data.toString('utf8'));manifestCache.set(bound.file,manifest);manifests.push({url:bound.url,version:manifest.version,sha256:bound.sha256});}
    if(kind==='dungeon'){
      requireValue(Array.isArray(manifest.rooms)&&manifest.rooms.length>0,'Dungeon manifest has no room list');const ids=new Set();
      for(const room of manifest.rooms){requireValue(typeof room.id==='string'&&!ids.has(room.id),'Duplicate/missing dungeon room id');ids.add(room.id);await add(room.url,{family,sha256:room.sha256,bytes:room.bytes,parse:true});await add(room.lightmap,{family,sha256:room.lightmapSha256,bytes:room.lightmapBytes});}
    }else{
      requireValue(manifest.assets?.[kind],`Manifest missing ${kind}`);if(!processedPropManifests.has(bound.file)){processedPropManifests.add(bound.file);for(const asset of Object.values(manifest.assets)){await add(asset.compressed_url,{family,sha256:asset.sha256,bytes:asset.download_bytes,parse:true});await add(asset.fallback_url,{family,sha256:asset.fallback_sha256,bytes:asset.fallback_bytes,parse:true});}}
    }
  }
  for(let i=0;i<gltfQueue.length;i++){
    const entry=gltfQueue[i],json=gltfJson(entry.data,entry.url);
    for(const buffer of json.buffers??[])if(buffer.uri!==undefined)await add(buffer.uri,{base:entry.url});
    for(const image of json.images??[])if(image.uri!==undefined)await add(image.uri,{base:entry.url});
  }
  const remove=[];
  async function inventory(directory){requireValue(await fs.realpath(directory)===directory,`Symlinked prune directory rejected: ${directory}`);for(const entry of await fs.readdir(directory,{withFileTypes:true})){const file=path.join(directory,entry.name);requireValue(!entry.isSymbolicLink(),`Symlink in generated family rejected: ${file}`);if(entry.isDirectory())await inventory(file);else{requireValue(entry.isFile(),`Non-file generated asset rejected: ${file}`);if(!keep.has(file)){const stat=await fs.stat(file);remove.push({file,bytes:stat.size});}}}}
  // Inventory every candidate before deleting any: even an unrelated unsafe entry aborts preflight.
  for(const root of roots)await inventory(root);
  const kept=[...keep.values()].map(({data,...entry})=>entry),result={schemaVersion:1,gameRoot:game,client,manifests,keep:kept,remove,embeddedUris,keptFiles:kept.length,keptPrunableFiles:kept.filter(f=>f.prunableFamily).length,removedFiles:remove.length,removedBytes:remove.reduce((n,f)=>n+f.bytes,0),sourceChecks:[...sourceChecks].map(([file,sha256])=>({file,sha256}))};return result;
}
export async function applyEnvironmentPrune(plan){
  const expected=path.join(await fs.realpath(plan.gameRoot),'dist/client');requireValue(plan.client===expected,'Plan client path mismatch');const roots=['dungeon','props'].map(f=>path.join(expected,'assets',f));
  // Recheck all referenced bytes and loader constants immediately before the first removal.
  for(const entry of [...plan.keep,...plan.sourceChecks]){const data=await regularFile(entry.file);requireValue(hash(data)===entry.sha256,`Preflight changed before prune: ${entry.file}`);}
  const keep=new Set(plan.keep.map(f=>f.file));
  for(const entry of plan.remove){requireValue(roots.some(root=>entry.file.startsWith(root+path.sep))&&!keep.has(entry.file),'Removal escapes generated families or overlaps dependency closure');const data=await regularFile(entry.file);requireValue(data.length===entry.bytes,`Removal candidate changed: ${entry.file}`);}
  for(const entry of plan.remove)await fs.rm(entry.file);
  return {dryRun:false,manifests:plan.manifests,keptFiles:plan.keptFiles,keptPrunableFiles:plan.keptPrunableFiles,removedFiles:plan.removedFiles,removedBytes:plan.removedBytes};
}
export async function pruneEnvironmentBuild({gameRoot,dryRun=false}){const plan=await planEnvironmentPrune(gameRoot);return dryRun?{dryRun:true,...plan}:applyEnvironmentPrune(plan);}

if(process.argv[1]&&await fs.realpath(fileURLToPath(import.meta.url))===await fs.realpath(process.argv[1])){
  let game=process.env.GAME_ROOT||fileURLToPath(new URL('../',import.meta.url)),dryRun=false,output;for(let i=2;i<process.argv.length;i++){if(process.argv[i]==='--game-root')game=process.argv[++i];else if(process.argv[i]==='--dry-run')dryRun=true;else if(process.argv[i]==='--out')output=process.argv[++i];else throw Error('Usage: node prune-environment-build.mjs [--game-root PATH] [--dry-run] [--out PATH]');}
  const result=await pruneEnvironmentBuild({gameRoot:game,dryRun});if(output)await fs.writeFile(path.resolve(output),JSON.stringify(result,null,2)+'\n');console.log(`Environment ${dryRun?'dry run':'prune'}: keep ${result.keptPrunableFiles} family files; ${dryRun?'would omit':'omitted'} ${result.removedFiles} legacy files (${(result.removedBytes/1048576).toFixed(2)} MiB).`);
}
