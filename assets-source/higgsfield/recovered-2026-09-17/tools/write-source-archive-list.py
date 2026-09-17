"""Inventory reproducible source artifacts; exclude decoded QA meshes and failed runtime copies."""
import json,hashlib
from pathlib import Path
BASE=Path(__file__).resolve().parent.parent
paths=set()
for pattern in ['models/*-original.glb','jobs/*.json','tools/**/*.py','tools/**/*.cjs','tools/**/*.mjs','provenance/*.json','derived/*-rigging.json','*.md','*.SHA256SUMS','*grounding-exclusions.json']:
 paths.update(p for p in BASE.glob(pattern)if p.is_file())
for name in ['inventory.json','original-metadata.json','runtime-config.json','rig-landmarks.json','manifest-entries.json','runtime-build-summary.json','runtime-grounding.json','spider-manifest-entry.json','spider-grounding.json','spider-grounding-qa.json','spider-build-summary.json','spider-provenance.json','spider-source-preservation.json','spider-mobile-decimation.json','reaper-manifest-entry.json','reaper-build-summary.json','reaper-grounding.json','reaper-grounding-exclusions.json','reaper-provenance.json','reaper-reskin-qa.json','reaper-grip-qa.json','reaper-contact-qa.json','reaper-grounding-qa.json','dragon-runtime-build-summary.json','dragon-manifest-entries.json','dragon-runtime-grounding.json','dragon-reskin-qa.json','ranger-manifest-entry.json','ranger-build-summary.json','ranger-grounding.json','ranger-grounding-exclusions.json','ranger-reskin-qa.json']:
 if (BASE/name).exists():paths.add(BASE/name)
for slug in json.loads((BASE/'inventory.json').read_text())['assets']:
 slug=slug['slug']
 for pattern in [f'review/{slug}-comparison.jpg',f'review/animated/{slug}/*segmentation.json',f'review/animated/{slug}/grounding-exclusions.json',f'review/animated/{slug}/pose-contact-sheet.jpg',f'review/animated/{slug}/pose-review-evidence.json',f'review/animated/{slug}/delivery-binding.json',f'review/animated/{slug}/*mask.png',f'qa/{slug}-grounding.json',f'qa/{slug}-reskin.json',f'qa/validation-summaries/{slug}--*.json']:
  paths.update(p for p in BASE.glob(pattern)if p.is_file())
for name in ['derived/reaper-rigged.glb','derived/ember-dragon-rigged.glb','derived/ranger-rigged.glb','derived/spider-rigged.blend','qa/original-preservation.json','qa/skeleton-warrior-stationary-maximum-reach.json','qa/skeleton-warrior-contact-reach.json','qa/skeleton-warrior-stationary-contact-reach.json','qa/goblin-contact-reach.json','qa/ogre-ground-contact-vertices.json','qa/final-delivery-contract.json','review/animated/review-summary.json']:
 if (BASE/name).exists():paths.add(BASE/name)
for p in BASE.glob('source-archive-file-list-*.json'):
 data=json.loads(p.read_text())
 for item in data.get('files',[]):
  name=item if isinstance(item,str) else item['path']
  candidate=BASE/name
  if candidate.exists() and not name.startswith('optimized/') and not name.endswith('delivery-decoded.glb') and not name.endswith('-reskinned.glb'):
   if name.startswith('runtime/') and name.endswith('.json'):
    summary=BASE/'qa/validation-summaries'/('runtime--'+candidate.name)
    if summary.exists():paths.add(summary)
   else:paths.add(candidate)
files=[]
for p in sorted(paths):
 data=p.read_bytes();files.append({'path':str(p.relative_to(BASE)),'bytes':len(data),'sha256':hashlib.sha256(data).hexdigest()})
outputs=[]
for p in sorted(BASE.glob('optimized/*/*.glb')):
 data=p.read_bytes();outputs.append({'path':str(p.relative_to(BASE)),'bytes':len(data),'sha256':hashlib.sha256(data).hexdigest(),'disposition':'Versioned public runtime output; no duplicate source archive copy needed if the public output is preserved.'})
report={'schemaVersion':1,'pathsRelativeToPackage':True,'files':files,'fileCount':len(files),'sourceArchiveBytes':sum(r['bytes']for r in files),'finalDeliverables':outputs,'donors':{'rigDirectory':'../2026-09-08/models','animationDirectory':'../2026-09-08/models/animations','identityRecords':'provenance/<slug>.json and original retarget reports contain exact donor hashes and job IDs'},'rebuild':'node tools/rebuild-all.cjs --deps-root <repository> --blender-python <python-with-bpy>','excluded':['Decoded QA meshes, failed intermediate runtime GLBs, heavy-source-arrays.npz, dependency caches, provider auth state','Most derived humanoid GLBs are reproduced from preserved originals; Reaper, Dragon, Ranger fitted seeds and native editable Spider blend are retained explicitly.']};(BASE/'source-archive-file-list.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps({'files':len(files),'sourceArchiveBytes':report['sourceArchiveBytes'],'finalVariantBytes':sum(r['bytes']for r in outputs)}))
