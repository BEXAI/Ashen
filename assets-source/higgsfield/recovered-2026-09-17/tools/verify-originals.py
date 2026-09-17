"""Verify archived provider originals against the download receipts, without network calls."""
import json,hashlib
from pathlib import Path
BASE=Path(__file__).resolve().parent.parent
inventory=json.loads((BASE/'inventory.json').read_text());rows=[]
for asset in inventory['assets']:
 path=BASE/'models'/f"{asset['slug']}-original.glb";data=path.read_bytes();actual=hashlib.sha256(data).hexdigest();assert actual==asset['sha256'],f"Changed provider original: {path}";assert len(data)==asset['bytes'];rows.append({'slug':asset['slug'],'path':str(path.relative_to(BASE)),'bytes':len(data),'sha256':actual,'receipt':f"jobs/{asset['slug']}.json",'unchanged':True})
report={'schemaVersion':1,'checked':len(rows),'allOriginalsUnchanged':True,'models':rows};(BASE/'qa/original-preservation.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps({'checked':len(rows),'allOriginalsUnchanged':True,'bytes':sum(r['bytes']for r in rows)}))
