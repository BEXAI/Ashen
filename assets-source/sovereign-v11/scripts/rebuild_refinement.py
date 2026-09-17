"""Rebuild and verify refined assets in an output directory outside the game checkout."""
import argparse,subprocess
from pathlib import Path
p=argparse.ArgumentParser();p.add_argument('--game',required=True);p.add_argument('--python-bpy',required=True);p.add_argument('--source-dir',required=True);p.add_argument('--out',required=True);p.add_argument('--baseline');p.add_argument('--rig-source');p.add_argument('--render',action='store_true');a=p.parse_args()
game=Path(a.game).resolve();out=Path(a.out).resolve();src=Path(a.source_dir).resolve();scripts=Path(__file__).parent
if out==game or game in out.parents:raise RuntimeError('Output must be outside the game checkout; integrate reviewed results separately.')
out.mkdir(parents=True,exist_ok=True)
master=out/'ember-sovereign-rigged-master.glb';far=out/'far-lod-transfer.glb'
baseline=Path(a.baseline) if a.baseline else game/'assets-source/sovereign-v10/ember-sovereign-rigged-master.glb'
rig=Path(a.rig_source) if a.rig_source else game/'assets-source/characters/ember-sovereign.glb'
def run(*args):subprocess.run([str(x) for x in args],check=True)
run('node',scripts/'rig_refined_sovereign.mjs','--game',game,'--rig-source',rig,'--static',src/'sovereign-static-atlas.glb','--parts',src/'geometry_budget.json','--cape-clearance','.20','--cape-dodge-radians','.18','--out',out)
run(a.python_bpy,scripts/'reduce_far_lod.py','--master',master,'--out',far,'--source-lod','0','--ratio','.33')
run('node',scripts/'graft_far_lod.mjs','--game',game,'--master',master,'--far',far)
run('node',scripts/'verify_refinement.mjs','--game',game,'--baseline',baseline,'--candidate',master,'--out',out/'final-validation.json')
run('node',scripts/'measure_deformation.mjs','--game',game,'--baseline',baseline,'--candidate',master,'--parts',out/'near-part-indices.json','--out',out/'deformation-comparison.json')
# rigged_metrics is the intermediate meshopt report, before Blender far reduction.
(out/'rigged_metrics.json').rename(out/'intermediate-rigged-metrics.json')
run(a.python_bpy,scripts/'save_editable_source.py','--asset',master,'--out',out/'sovereign-refined-rig.blend')
if a.render:
 run(a.python_bpy,scripts/'render_pose_review.py','--asset',master,'--out',out/'pose-qa','--full')
 run(a.python_bpy,scripts/'render_pose_review.py','--asset',master,'--out',out/'far-qa','--lod','2')
