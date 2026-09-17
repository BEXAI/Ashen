"""Compact repeated glTF validator diagnostics without changing counts or outcomes."""
import json,hashlib,collections
from pathlib import Path
BASE=Path(__file__).resolve().parent.parent;out=BASE/'qa/validation-summaries';out.mkdir(exist_ok=True)
def compact(value):
 if isinstance(value,list):
  if len(value)>64:return {'arrayCount':len(value),'sha256OfCompactJSON':hashlib.sha256(json.dumps(value,separators=(',',':')).encode()).hexdigest(),'firstThreeExamples':[compact(x)for x in value[:3]],'fullArrayOmitted':True}
  return [compact(x)for x in value]
 if isinstance(value,dict):
  result={k:compact(v)for k,v in value.items()if k!='messages'}
  if 'messages'in value:
   seen={};counts=collections.Counter()
   for message in value['messages']:
    code=message.get('code','unknown');counts[code]+=1;seen.setdefault(code,message)
   result.update(messageCountsByCode=dict(counts),exampleByCode=seen,fullMessagesOmitted=len(value['messages']))
  return result
 if isinstance(value,str) and len(value)>8192:return {'stringLength':len(value),'sha256':hashlib.sha256(value.encode()).hexdigest(),'prefix':value[:500],'fullStringOmitted':True}
 return value
rows=[]
for file in list(BASE.glob('optimized/*/*.json'))+list(BASE.glob('runtime/*.json')):
 data=file.read_bytes();j=json.loads(data);result={'originalReportPath':str(file.relative_to(BASE)),'originalReportSha256':hashlib.sha256(data).hexdigest(),'originalReportBytes':len(data),'compaction':'Repeated diagnostic messages replaced by exact per-code counts and one unmodified example. No outcome or counts altered.','report':compact(j)};name=file.parent.name+'--'+file.name;p=out/name;p.write_text(json.dumps(result,indent=2)+'\n');rows.append({'path':str(p.relative_to(BASE)),'bytes':p.stat().st_size})
print(json.dumps({'reports':len(rows),'bytes':sum(x['bytes']for x in rows)}))
