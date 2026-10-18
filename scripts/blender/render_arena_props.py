"""Render one arena's props (coral walls, barrels/crates, kelp) as 35-degree sprite frames (T43).

Called by `scripts/art-arena.mjs` as
  blender -b --factory-startup --python scripts/blender/render_arena_props.py -- \
      --layout <props.json> --out <dir> [--engine eevee|workbench]
The layout JSON comes from `scripts/lib/props-layout.ts`. Each shape is built in ground space by
`lib/props.py`, stretched in depth by 1 / sin 35 (so its base covers the collision rect on the
top-down ground) and rendered at 2x into `<out>/<frame>.png` (`fw`x`fh` at 1x, the anchor = the
model origin = the rect's bottom-edge middle at (ox, oy)). Prints one `[props] result {...}` line
with the measured footprint of every frame (ground-space bounds of the geometry below z = 3).
"""
import argparse
import json
import math
import os
import random
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import bpy  # noqa: E402
from mathutils import Vector  # noqa: E402

from lib import build, cam, props  # noqa: E402

OUTLINE_PX = 2.6  # at 1x atlas px (fighters: 3 px in a 1.75 px/unit cell)
FOOT_Z = 3.0


def args():
    argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    ap = argparse.ArgumentParser()
    ap.add_argument('--layout', required=True)
    ap.add_argument('--out', required=True)
    ap.add_argument('--engine', default='eevee', choices=['eevee', 'workbench'])
    return ap.parse_args(argv)


def clear_props(keep):
    for ob in list(bpy.context.scene.objects):
        if ob.name not in keep:
            bpy.data.objects.remove(ob, do_unlink=True)


def frame_camera(scene, shape, px, pitch):
    """Ortho camera whose view is exactly fw x fh atlas px with the model origin at (ox, oy)."""
    fw, fh, pad = shape['fw'], shape['fh'], shape['pad']
    r = scene.render
    r.resolution_x, r.resolution_y = 2 * fw, 2 * fh
    c = scene.camera
    c.data.ortho_scale = max(fw, fh) / px
    c.data.shift_x = c.data.shift_y = 0.0
    p = math.radians(pitch)
    up = Vector((0, math.sin(p), math.cos(p)))
    fwd = Vector((0, math.cos(p), -math.sin(p)))
    centre = up * (fh / px / 2 - pad)  # the view's middle, the origin sits `pad` above the bottom
    c.location = centre - fwd * cam.CAM_DIST
    c.rotation_euler = (math.radians(90 - pitch), 0, 0)


def footprint(objs, stretch):
    """Ground-space x/y bounds of the model's vertices below FOOT_Z (outline hulls excluded)."""
    bpy.context.view_layer.update()
    xs, ys = [], []
    for ob in objs.values():
        for v in ob.data.vertices:
            p = ob.matrix_world @ v.co
            if p.z < FOOT_Z:
                xs.append(p.x)
                ys.append(p.y / stretch)
    return [round(min(xs), 1), round(max(xs), 1), round(min(ys), 1), round(max(ys), 1)] if xs else None


def main():
    a = args()
    t0 = time.time()
    with open(a.layout) as f:
        L = json.load(f)
    px, pitch = L['px'], L['pitch']
    os.makedirs(a.out, exist_ok=True)
    engine = cam.setup(256, a.engine)
    scene = bpy.context.scene
    keep = {ob.name for ob in scene.objects}
    build.OUTLINE_PX = OUTLINE_PX / px  # model units are world units here
    stretch = 1 / math.sin(math.radians(pitch))
    frames = []
    for shape in L['shapes']:
        clear_props(keep)
        spec = {'id': shape['frame'], 'pal': props.PAL, 'scale': 1.0,
                'parts': props.parts_for(shape, random.Random(shape['seed']))}
        root, _, objs = build.build(spec, workbench=engine == 'workbench')
        root.scale = (1, stretch, 1)
        frame_camera(scene, shape, px, pitch)
        scene.render.filepath = os.path.join(os.path.abspath(a.out), shape['frame'] + '.png')
        bpy.ops.render.render(write_still=True)
        frames.append({'name': shape['frame'], 'foot': footprint(objs, stretch)})
        print(f'[props] frame {shape["frame"]}', flush=True)
    result = {'id': L['id'], 'engine': engine, 'blender': bpy.app.version_string,
              'frames': frames, 'sec': round(time.time() - t0, 1)}
    print('[props] result ' + json.dumps(result), flush=True)


try:
    main()
except Exception as e:  # non-zero exit so the orchestrator can fall back
    import traceback
    traceback.print_exc()
    print(f'[props] error {e}', flush=True)
    sys.exit(1)
