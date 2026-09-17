"""Preserve existing provider results; no generation or source mutation."""
from pathlib import Path
import json,hashlib,urllib.request,concurrent.futures,struct,datetime,shutil
ROOT=Path(__file__).resolve().parents[1]
BASE=ROOT.parent.parent
AUDIT=json.loads(Path('/tmp/ashen-remote-mesh-audit.json').read_text())
JOBS={x['id']:x for x in json.loads(Path('/tmp/ashen-higgsfield-recent-jobs.json').read_text())}
PROVENANCE=BASE/'references/higgsfield-september-8-2026/models/provenance'
for folder in ['models','jobs']: (ROOT/folder).mkdir(exist_ok=True)
reuse={x['character']:x for x in json.loads(Path('/tmp/ashen-recovered-provider-meshes.json').read_text())}
def digest(data):return hashlib.sha256(data).hexdigest()
def collect(entry):
 slug=entry['charactersFromExactInputAssetId'][0]; job=JOBS[entry['jobId']]; out=ROOT/'models'/f'{slug}-original.glb'; reused=False
 if out.exists(): data=out.read_bytes(); reused=True
 elif slug in reuse and Path(reuse[slug]['path']).exists():
  data=Path(reuse[slug]['path']).read_bytes(); assert digest(data)==reuse[slug]['sha256']; reused=True
 else:
  with urllib.request.urlopen(job['result_url'],timeout=60) as r:data=r.read()
 assert len(data)==entry['availability']['contentLength'],slug+' size mismatch'
 assert data[:4]==b'glTF' and struct.unpack_from('<II',data,4)==(2,len(data)),slug+' invalid GLB'
 if not out.exists():tmp=out.with_suffix('.download');tmp.write_bytes(data);tmp.rename(out)
 (ROOT/'jobs'/f'{slug}.json').write_text(json.dumps(job,indent=2)+'\n')
 source=json.loads((PROVENANCE/f'{slug}.json').read_text())['originalArtwork']
 item={'slug':slug,'jobId':job['id'],'jobType':job['job_type'],'createdAt':job['created_at'],'status':job['status'],'path':str(out),'bytes':len(data),'sha256':digest(data),'receipt':str(ROOT/'jobs'/f'{slug}.json'),'sourceArtwork':source,'sourceImagePath':str(PROVENANCE.parents[1]/source['filename']),'downloadedOrVerifiedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'reusedVerifiedLocalBytes':reused,'originalPreserved':True}
 print(json.dumps({'ready':slug,'path':str(out),'bytes':len(data),'sha256':item['sha256']}),flush=True)
 return item
entries=[e for e in AUDIT['entries'] if e['classification']=='completed-remote-output-not-imported-in-audited-trees']
entries.sort(key=lambda e:(e['charactersFromExactInputAssetId'][0] not in ['ogre','goblin'],e['charactersFromExactInputAssetId'][0]))
with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:results=list(pool.map(collect,entries))
results.sort(key=lambda x:x['slug'])
(ROOT/'inventory.json').write_text(json.dumps({'schemaVersion':1,'kind':'Preserved earlier provider originals; not runtime-approved','sourceList':'/tmp/ashen-higgsfield-recent-jobs.json','count':len(results),'assets':results},indent=2)+'\n')
print(json.dumps({'complete':len(results),'inventory':str(ROOT/'inventory.json'),'totalBytes':sum(x['bytes'] for x in results)}),flush=True)
