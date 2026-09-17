import json
import pathlib
import subprocess

root = pathlib.Path(__file__).resolve().parents[1]
cli = pathlib.Path('/Users/nathaniel/Documents/ChatGPT/Knight/.tools/higgsfield-cli/node_modules/.bin/higgsfield')
plan_path = root / 'conversion-plan.json'
plan = json.loads(plan_path.read_text())
for item in plan['items']:
    if item['role'] == 'video' or item.get('generationJobId'):
        continue
    args = [str(cli), 'generate', 'create', 'meshy_v7_image_to_3d',
            '--image', str(root / item['sourceFile']), '--should_texture', 'true',
            '--enable_pbr', 'true', '--enable_rigging', 'true', '--enable_animation', 'true',
            '--animation_action_id', '0', '--pose_mode', 'a-pose',
            '--rigging_height_meters', '1.85', '--should_remesh', 'true',
            '--topology', 'triangle', '--target_polycount', '20000', '--json']
    result = subprocess.run(args, capture_output=True, text=True, timeout=180)
    if result.returncode:
        print(f"STOP {item['id']}: {result.stderr.strip()}", flush=True)
        raise SystemExit(result.returncode)
    ids = json.loads(result.stdout)
    if not isinstance(ids, list) or len(ids) != 1 or not isinstance(ids[0], str):
        raise RuntimeError(f"Ambiguous submission result; inspect before retry: {result.stdout}")
    item['generationJobId'] = ids[0]
    item['modelStatus'] = 'in_progress'
    plan_path.write_text(json.dumps(plan, indent=2)+'\n')
    print(f"{item['id']}: {ids[0]}", flush=True)
