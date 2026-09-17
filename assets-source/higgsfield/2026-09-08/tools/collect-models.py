#!/usr/bin/env python3
"""Read existing Higgsfield jobs and collect original GLBs; never creates jobs."""
import concurrent.futures, datetime, hashlib, json, os, pathlib, struct, subprocess, sys, time, urllib.request
ROOT=pathlib.Path(__file__).resolve().parents[1]
CLI='/Users/nathaniel/Documents/ChatGPT/Knight/.tools/higgsfield-cli/node_modules/.bin/higgsfield'
PLAN=ROOT/'conversion-plan.json'
MODELS=ROOT/'models'
for name in ['jobs','validation']: (MODELS/name).mkdir(parents=True,exist_ok=True)
def save(path,value):
    tmp=path.with_name(path.name+'.tmp')
    tmp.write_text(json.dumps(value,indent=2)+'\n')
    os.replace(tmp,path)
def validate(path):
    raw=path.read_bytes()
    assert len(raw)>=20 and raw[:4]==b'glTF','not a GLB'
    version,size=struct.unpack_from('<II',raw,4)
    assert version==2 and size==len(raw),'invalid GLB header'
    pos=12; chunks=[]
    while pos<len(raw):
        n,kind=struct.unpack_from('<II',raw,pos); pos+=8
        assert n%4==0 and pos+n<=len(raw),'invalid chunk length'
        chunks.append((kind,raw[pos:pos+n]));pos+=n
    assert chunks and chunks[0][0]==0x4e4f534a and pos==len(raw),'missing JSON chunk'
    j=json.loads(chunks[0][1]); assert j['asset']['version']=='2.0'
    buffers=j.get('buffers',[]); binary=[data for kind,data in chunks if kind==0x004e4942]
    assert len(buffers)==1 and len(binary)==1 and 'uri' not in buffers[0],'expected self-contained binary buffer'
    assert buffers[0]['byteLength']<=len(binary[0])<=buffers[0]['byteLength']+3
    for view in j.get('bufferViews',[]):
        assert view.get('buffer',0)==0 and view.get('byteOffset',0)+view['byteLength']<=buffers[0]['byteLength']
    nodes=j.get('nodes',[]);accessors=j.get('accessors',[])
    for skin in j.get('skins',[]):
        assert skin.get('joints') and all(0<=n<len(nodes) for n in skin['joints'])
    for node in nodes:
        assert all(0<=n<len(nodes) for n in node.get('children',[]))
        if 'skin' in node: assert node['skin']<len(j.get('skins',[]))
        if 'mesh' in node: assert node['mesh']<len(j.get('meshes',[]))
    clips=[]
    for animation in j.get('animations',[]):
        for sampler in animation.get('samplers',[]):
            assert 0<=sampler['input']<len(accessors) and 0<=sampler['output']<len(accessors)
        for channel in animation.get('channels',[]):
            assert channel['sampler']<len(animation['samplers'])
            assert channel['target'].get('node',0)<len(nodes)
        clips.append({'name':animation.get('name'),'channels':len(animation.get('channels',[])),'duration':max((max(accessors[s['input']].get('max',[0])) for s in animation.get('samplers',[])),default=0)})
    return {'glbVersion':version,'bytes':len(raw),'sha256':hashlib.sha256(raw).hexdigest(),'nodes':len(nodes),'meshes':len(j.get('meshes',[])),'skins':len(j.get('skins',[])),'jointCounts':[len(s['joints']) for s in j.get('skins',[])],'animations':len(clips),'clips':clips,'nodeNames':[n.get('name') for n in nodes],'images':len(j.get('images',[])),'materials':len(j.get('materials',[]))}
def get(item):
    result=subprocess.run([CLI,'generate','get',item['generationJobId'],'--json'],text=True,capture_output=True,timeout=45)
    if result.returncode: raise RuntimeError(result.stderr.strip() or result.stdout.strip())
    j=json.loads(result.stdout);assert j['id']==item['generationJobId']
    save(MODELS/'jobs'/f"{item['id']}.json",j)
    return j
def download(item,url):
    path=MODELS/f"{item['id']}-original.glb"
    if not path.exists():
        temp=path.with_suffix('.download')
        req=urllib.request.Request(url,headers={'User-Agent':'Ashen-asset-import/1.0'})
        with urllib.request.urlopen(req,timeout=120) as response, temp.open('wb') as out:
            while chunk:=response.read(1024*1024):out.write(chunk)
        try:validate(temp)
        except Exception:temp.unlink(missing_ok=True);raise
        os.replace(temp,path)
    check=validate(path);save(MODELS/'validation'/f"{item['id']}.json",check)
    return path,check
watch='--watch' in sys.argv
while True:
    plan=json.loads(PLAN.read_text());items=[i for i in plan['items'] if i.get('generationJobId')]
    pending=[i for i in items if i.get('modelStatus') not in ['downloaded','failed','canceled','cancelled','nsfw'] and (not i.get('modelCheckedAt') or (datetime.datetime.now(datetime.timezone.utc)-datetime.datetime.fromisoformat(i['modelCheckedAt'])).total_seconds()>=55)]
    for start in range(0,len(pending),4):
        batch=pending[start:start+4]
        with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
            futures={pool.submit(get,i):i for i in batch}
            for future in concurrent.futures.as_completed(futures):
                item=futures[future]
                try:
                    result=future.result();status=result.get('status','unknown');item['modelStatus']=status
                    url=result.get('result_url');item['modelSourceUrl']=url
                    item['modelJobType']=result.get('job_type');item['modelInputUrls']=[m['data'].get('url') for m in result.get('params',{}).get('medias',[]) if m.get('data',{}).get('url')]
                    item['modelCheckedAt']=datetime.datetime.now(datetime.timezone.utc).isoformat()
                    if status=='completed' and url:
                        path,check=download(item,url)
                        item.update(modelStatus='downloaded',modelFile=str(path.relative_to(ROOT)),modelBytes=check['bytes'],modelSha256=check['sha256'],modelStructure={k:check[k] for k in ['nodes','meshes','skins','jointCounts','animations','clips']})
                        item.pop('modelError',None)
                        print(json.dumps({'id':item['id'],'status':'downloaded','file':str(path),'structure':item['modelStructure']}),flush=True)
                    else:print(json.dumps({'id':item['id'],'status':status,'details':{k:v for k,v in result.items() if 'error' in k or 'fail' in k}}),flush=True)
                except Exception as exc:
                    item['modelError']=str(exc); print(json.dumps({'id':item['id'],'error':str(exc)}),flush=True)
                save(PLAN,plan)
    counts={}
    for item in items:counts[item['modelStatus']]=counts.get(item['modelStatus'],0)+1
    print(json.dumps({'summary':counts,'time':datetime.datetime.now(datetime.timezone.utc).isoformat()}),flush=True)
    if not watch or all(i['modelStatus'] in ['downloaded','failed','canceled','cancelled','nsfw'] for i in items):break
    time.sleep(55)
