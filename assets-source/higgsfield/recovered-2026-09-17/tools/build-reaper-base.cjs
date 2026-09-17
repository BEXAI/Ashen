const fs=require('fs'),path=require('path'),crypto=require('crypto'),{execFileSync}=require('child_process');
const base=path.resolve(__dirname,'..'),deps=require('./resolve-deps.cjs')(__dirname),helpers=path.join(__dirname,'reaper-pipeline');
const {parseGLB,serializeGLB}=require('./reaper-pipeline/inspect-optimize-glb.cjs');
const donorArg=process.argv.indexOf('--donors-root');
const donors=donorArg>=0?path.resolve(process.argv[donorArg+1]):process.env.ASHEN_DONOR_ROOT||[path.resolve(base,'../2026-09-08/models/animations'),path.resolve(base,'../higgsfield-september-8-2026/models/animations')].find(p=>fs.existsSync(path.join(p,'idle.glb')));
if(!donors)throw Error('Provide --donors-root with the archived native animation library.');
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const source=JSON.parse(fs.readFileSync(path.join(base,'inventory.json'))).assets.find(x=>x.slug==='reaper'),derivation=JSON.parse(fs.readFileSync(path.join(base,'derived/reaper-rigging.json')));
const inputFile=fs.existsSync(path.join(base,'derived/reaper-reskinned.glb'))?'derived/reaper-reskinned.glb':'derived/reaper-rigged.glb';
const input=fs.readFileSync(path.join(base,inputFile)),raw=parseGLB(input);
let stripped=0;for(const n of raw.json.nodes||[])if(n.children?.length===0){delete n.children;stripped++;}
const canonical=serializeGLB(raw.json,raw.bin,raw.extraChunks),inputPath=path.join(base,'derived/reaper-input.glb');fs.writeFileSync(inputPath,canonical);
const reskin=fs.existsSync(path.join(base,'reaper-reskin-qa.json'))?JSON.parse(fs.readFileSync(path.join(base,'reaper-reskin-qa.json'))):null;
const provenance={reskin,rigInput:inputFile,slug:'reaper',originalArtwork:source.sourceArtwork,modelGeneration:{jobId:source.jobId,jobType:source.jobType,createdAt:source.createdAt},sourceMeshSHA256:source.sha256,receivedRigSHA256:sha(input),preparedRigSHA256:sha(canonical),emptyLeafChildrenRemoved:stripped,derivation,motion:'Genuine native motion library, rest-aware retarget. Final two-hand grip correction is locally baked with arm lengths preserved.'};
const provenancePath=path.join(base,'reaper-provenance.json');fs.writeFileSync(provenancePath,JSON.stringify(provenance,null,2)+'\n');
const args=[inputPath,path.join(base,'runtime/reaper-retargeted.glb'),'--profile','nonmetal','--deps-root',deps,'--provenance-json',provenancePath,'--require-complete','--force'];
for(const name of ['idle','forward','backward','strafe_left','strafe_right','dodge','hit','death','side','diagonal','backhand','overhead'])args.push('--clip',name+'='+path.join(donors,name+'.glb'));
args.push('--contact-bone',derivation.contactSockets.parent,'--contact-base',derivation.contactSockets.base.join(','),'--contact-tip',derivation.contactSockets.tip.join(','));
execFileSync(process.execPath,[path.join(helpers,'normalize-retarget-glb.cjs'),...args],{stdio:'inherit'});
