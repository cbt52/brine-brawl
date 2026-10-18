"""Render one fighter spec into per-direction frames.

Called by `scripts/art3d.mjs` as
  blender -b --factory-startup --python scripts/blender/render_fighter.py -- \
      --spec <spec.json> --out <dir> [--res 256] [--engine eevee|workbench] [--still]
Writes `<out>/<anim>_<dir>_<i>.png` at --res px (the orchestrator downsamples to 1x) and
prints one `[art3d] result {...}` JSON line.
"""
import argparse
import json
import math
import os
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import bpy  # noqa: E402

from lib import build, cam  # noqa: E402


def args():
    argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    ap = argparse.ArgumentParser()
    ap.add_argument('--spec', required=True)
    ap.add_argument('--out', required=True)
    ap.add_argument('--res', type=int, default=256)
    ap.add_argument('--engine', default='eevee', choices=['eevee', 'workbench'])
    ap.add_argument('--still', action='store_true')
    return ap.parse_args(argv)


def main():
    a = args()
    t0 = time.time()
    with open(a.spec) as f:
        spec = json.load(f)
    os.makedirs(a.out, exist_ok=True)
    engine = cam.setup(a.res, a.engine)
    root = build.build(spec, workbench=engine == 'workbench')
    scene = bpy.context.scene
    frames = []
    # T34/T35 render stills only; T36 adds the puppet animation frames.
    for d in cam.dirs_for(spec.get('dirs', 5)):
        root.rotation_euler = (0, 0, math.radians(cam.DIR_ANGLES[d]))
        name = f'idle_{d}_0'
        scene.render.filepath = os.path.join(os.path.abspath(a.out), name + '.png')
        bpy.ops.render.render(write_still=True)
        frames.append(name)
        print(f'[art3d] frame {name}', flush=True)
    result = {'id': spec['id'], 'engine': engine, 'blender': bpy.app.version_string,
              'frames': frames, 'sec': round(time.time() - t0, 1)}
    print('[art3d] result ' + json.dumps(result), flush=True)


try:
    main()
except Exception as e:  # make Blender exit non-zero so the orchestrator can fall back
    import traceback
    traceback.print_exc()
    print(f'[art3d] error {e}', flush=True)
    sys.exit(1)
