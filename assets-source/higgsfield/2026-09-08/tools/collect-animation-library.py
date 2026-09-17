"""Submit the explicitly authorized pilot animation set once and collect assets."""
import datetime
import json
import shutil
import subprocess
import time
import urllib.request
from pathlib import Path

BASE = Path('/Users/nathaniel/Documents/ChatGPT/Knight/references/higgsfield-september-8-2026')
CLI = '/Users/nathaniel/Documents/ChatGPT/Knight/.tools/higgsfield-cli/node_modules/.bin/higgsfield'
SOURCE = 'https://d8j0ntlcm91z4.cloudfront.net/user_39hjWHAnSlQm2chqmsLrWZJJlK3/hf_20260917_041949_60ad1d52-343d-4473-ac0d-06b18555869f.glb'
OUTPUT = BASE / 'models' / 'animations'
LEDGER = BASE / 'models' / 'animation-library-jobs.json'
PLAN = [('forward',689),('backward',679),('strafe_left',617),('strafe_right',618),('dodge',158),('hit',178),('death',8),('diagonal',97),('backhand',240),('overhead',242),('staff',130),('bow',224),('claws',4),('club',128)]

def now():
    return datetime.datetime.now(datetime.timezone.utc).isoformat()

def save(data):
    p = LEDGER.with_suffix('.tmp.json')
    p.write_text(json.dumps(data,indent=2)+'\n')
    p.replace(LEDGER)

def run(args):
    return subprocess.run([CLI,*args,'--json'],capture_output=True,text=True)

OUTPUT.mkdir(parents=True,exist_ok=True)
if LEDGER.exists():
    data = json.loads(LEDGER.read_text())
else:
    data = {'sourceJobId':'60ad1d52-343d-4473-ac0d-06b18555869f','sourceModelURL':SOURCE,'createdAt':now(),'jobs':[{'canonicalName':n,'actionId':a,'state':'pending'} for n,a in PLAN]}
    save(data)

for name, source, job, action in [('idle','silver-knight-original.glb','60ad1d52-343d-4473-ac0d-06b18555869f',0),('side','silver-knight-sword-slash.glb','bb748109-8f17-4119-8e30-d199f41b7eba',219)]:
    if not (OUTPUT/(name+'.glb')).exists():
        shutil.copy2(BASE/'models'/source,OUTPUT/(name+'.glb'))
    (OUTPUT/(name+'.source.json')).write_text(json.dumps({'canonicalName':name,'jobId':job,'actionId':action,'localOriginal':str(BASE/'models'/source)},indent=2)+'\n')

for row in data['jobs']:
    if row.get('jobId'):
        continue
    if row['state'] != 'pending':
        raise SystemExit('Refusing to resubmit a non-pending entry: '+str(row))
    row.update(state='submitting',submittedAt=now())
    save(data)
    result = run(['generate','create','3d_rigging','--model_url',SOURCE,'--height_meters','1.85','--enable_animation','true','--animation_action_id',str(row['actionId'])])
    if result.returncode:
        row.update(state='submission_error',returncode=result.returncode,error=result.stderr,stdout=result.stdout)
        save(data)
        raise SystemExit('Submission failed; no retry: '+json.dumps(row))
    try:
        ids = json.loads(result.stdout)
        if not isinstance(ids,list) or len(ids)!=1 or not isinstance(ids[0],str):
            raise ValueError('Unexpected create response')
    except Exception as exc:
        row.update(state='ambiguous_submission',stdout=result.stdout,error=str(exc))
        save(data)
        raise
    row.update(state='queued',jobId=ids[0])
    save(data)
    print(row['canonicalName']+' submitted '+ids[0],flush=True)
    time.sleep(1)

deadline = time.monotonic()+25*60
while time.monotonic()<deadline:
    pending = [r for r in data['jobs'] if r['state'] not in ['downloaded','failed','canceled']]
    if not pending:
        break
    for row in pending:
        response = run(['generate','get',row['jobId']])
        if response.returncode:
            row['lastPollError'] = response.stderr
            continue
        job = json.loads(response.stdout)
        (OUTPUT/(row['canonicalName']+'.job.json')).write_text(json.dumps(job,indent=2)+'\n')
        row['state'] = job['status']
        row['lastCheckedAt'] = now()
        save(data)
        if job['status']=='completed' and job.get('result_url'):
            target = OUTPUT/(row['canonicalName']+'.glb')
            try:
                with urllib.request.urlopen(job['result_url'],timeout=90) as response:
                    content = response.read()
                if content[:4] != b'glTF':
                    raise ValueError('Result is not a GLB')
                temporary = target.with_suffix('.download')
                temporary.write_bytes(content)
                temporary.replace(target)
                row.update(state='downloaded',resultURL=job['result_url'],path=str(target),bytes=len(content),downloadedAt=now())
                (OUTPUT/(row['canonicalName']+'.source.json')).write_text(json.dumps(row,indent=2)+'\n')
                print(row['canonicalName']+' downloaded '+str(len(content))+' bytes',flush=True)
            except Exception as exc:
                row['downloadError'] = str(exc)
        elif job['status'] in ['failed','canceled']:
            print(row['canonicalName']+' '+job['status']+' '+json.dumps(job),flush=True)
        save(data)
    if all(r['state'] in ['downloaded','failed','canceled'] for r in data['jobs']):
        break
    print('Waiting: '+', '.join(r['canonicalName']+'='+r['state'] for r in data['jobs']),flush=True)
    time.sleep(45)
print(json.dumps({'ledger':str(LEDGER),'states':{r['canonicalName']:r['state'] for r in data['jobs']}}),flush=True)
