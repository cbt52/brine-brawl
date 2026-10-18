"""Render the FX atlas sprites (loot + pilot projectiles, T45) with the 35-degree fighter camera.

Called by `scripts/art-fx.mjs` as
  blender -b --factory-startup --python scripts/blender/render_props.py -- \
      --layout <fx.json> --out <dir> [--engine eevee|workbench]
The layout JSON lists `frames` [{name, fw, fh}] (1x atlas px) and `px` (atlas px per world unit).
Each model of `lib/loot.py` is centred on the origin, which lands in the middle of its frame;
frames render at 2x into `<out>/<name>.png`. Prints one `[fx] result {...}` line.
"""
import argparse
import json
import math
import os
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import bpy  # noqa: E402
from mathutils import Vector  # noqa: E402

from lib import build, cam, loot  # noqa: E402

OUTLINE_PX = 2.4  # at 1x atlas px


def args():
    argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    ap = argparse.ArgumentParser()
    ap.add_argument('--layout', required=True)
    ap.add_argument('--out', required=True)
    ap.add_argument('--engine', default='eevee', choices=['eevee', 'workbench'])
    return ap.parse_args(argv)


def frame_camera(scene, fw, fh, px):
    """Ortho camera whose view is fw x fh atlas px centred on the model origin."""
    r = scene.render
    r.resolution_x, r.resolution_y = 2 * fw, 2 * fh
    c = scene.camera
    c.data.ortho_scale = max(fw, fh) / px
    c.data.shift_x = c.data.shift_y = 0.0
    p = math.radians(cam.PITCH_DEG)
    fwd = Vector((0, math.cos(p), -math.sin(p)))
    c.location = -fwd * cam.CAM_DIST
    c.rotation_euler = (math.radians(90 - cam.PITCH_DEG), 0, 0)


def main():
    a = args()
    t0 = time.time()
    with open(a.layout) as f:
        L = json.load(f)
    px = L['px']
    os.makedirs(a.out, exist_ok=True)
    engine = cam.setup(256, a.engine)
    scene = bpy.context.scene
    keep = {ob.name for ob in scene.objects}
    build.OUTLINE_PX = OUTLINE_PX / px  # model units are world units here
    done = []
    for fr in L['frames']:
        for ob in list(scene.objects):
            if ob.name not in keep:
                bpy.data.objects.remove(ob, do_unlink=True)
        spec = {'id': fr['name'], 'pal': loot.PAL, 'scale': 1.0, 'parts': loot.MODELS[fr['name']]()}
        build.build(spec, workbench=engine == 'workbench')
        frame_camera(scene, fr['fw'], fr['fh'], px)
        scene.render.filepath = os.path.join(os.path.abspath(a.out), fr['name'] + '.png')
        bpy.ops.render.render(write_still=True)
        done.append(fr['name'])
        print(f'[fx] frame {fr["name"]}', flush=True)
    result = {'engine': engine, 'blender': bpy.app.version_string, 'frames': done, 'sec': round(time.time() - t0, 1)}
    print('[fx] result ' + json.dumps(result), flush=True)


try:
    main()
except Exception as e:  # non-zero exit so the orchestrator can fall back
    import traceback
    traceback.print_exc()
    print(f'[fx] error {e}', flush=True)
    sys.exit(1)
