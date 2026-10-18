"""Render one arena's flat ground as a straight top-down ortho image (T42, TASKS-LOOP §2.11).

Called by `scripts/art-arena.mjs` as
  blender -b --factory-startup --python scripts/blender/render_arena.py -- \
      --layout <layout.json> --out <ground.png> [--engine eevee|workbench]
The layout JSON comes from `scripts/lib/arena-layout.ts` (collision rects of `shared/arena/`).
Only flat things go in: lagoon depth bands + shore foam, the sand island, plank piers and pads,
tide-pool beds on the shallows, scattered pebbles and soft contact shadows under walls, decor
and kelp (hidden caster slabs). Every colour stays at <= 45 % saturation so fighters pop.
Prints one `[arena] result {...}` JSON line.
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

from lib import cam, ground as G  # noqa: E402

PAL = {
    'edge': '#36525C', 'deep': '#3E5D68', 'deepB': '#45656F', 'mid': '#557E87', 'midB': '#5D868C',
    'shallow': '#76A0A2', 'shallowB': '#80A8A7', 'foam': '#E4ECE6',
    'wet': '#B3A383', 'sand': '#D9C89F', 'sandB': '#CDBA90',
    'bedRim': '#A99D80', 'bed': '#929683', 'bedB': '#899080', 'basin': '#7F8A7B',
    'seam': '#5A4B3E', 'beam': '#6E5A47', 'post': '#54463A',
    'plank0': '#A08463', 'plank1': '#94785A', 'plank2': '#AA8F6E',
    'peb0': '#A8A194', 'peb1': '#968F83', 'peb2': '#BBB4A5', 'shell': '#EADFC8',
}
SUN_TILT_DEG = 10
SUN_ANGLE_DEG = 22
BOARD = 22  # plank width incl. a 3 u seam


def args():
    argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    ap = argparse.ArgumentParser()
    ap.add_argument('--layout', required=True)
    ap.add_argument('--out', required=True)
    ap.add_argument('--engine', default='eevee', choices=['eevee', 'workbench'])
    return ap.parse_args(argv)


def setup(L, engine):
    scene = bpy.context.scene
    for ob in list(scene.objects):
        bpy.data.objects.remove(ob, do_unlink=True)
    used = cam.set_engine(scene, engine)
    if used == 'eevee':
        ev = scene.eevee
        ev.taa_render_samples = 48
        for k, v in (('use_shadows', True), ('shadow_ray_count', 4), ('shadow_step_count', 8),
                     ('shadow_resolution_scale', 1.0)):
            if hasattr(ev, k):
                setattr(ev, k, v)
    r = scene.render
    r.resolution_x, r.resolution_y = L['out']['w'], L['out']['h']
    r.resolution_percentage = 100
    r.film_transparent = False
    r.filter_size = 1.0
    r.dither_intensity = 0.0
    r.image_settings.file_format = 'PNG'
    r.image_settings.color_mode = 'RGB'
    r.image_settings.color_depth = '8'
    vs = scene.view_settings
    vs.view_transform, vs.look, vs.exposure, vs.gamma = 'Standard', 'None', 0.0, 1.0
    scene.display_settings.display_device = 'sRGB'
    world = bpy.data.worlds.new('void')
    world.color = (0, 0, 0)
    scene.world = world

    W, H = L['world']['w'], L['world']['h']
    cd = bpy.data.cameras.new('cam')
    cd.type = 'ORTHO'
    cd.ortho_scale = max(W, H)
    cd.clip_start, cd.clip_end = 1, 2000
    c = bpy.data.objects.new('cam', cd)
    c.location = (W / 2, H / 2, 1000)
    scene.collection.objects.link(c)
    scene.camera = c

    sd = bpy.data.lights.new('sun', 'SUN')
    sd.energy = math.pi  # flat ground in full sun -> Shader-to-RGB ~ cos(tilt)
    sd.angle = math.radians(SUN_ANGLE_DEG)
    for k, v in (('use_shadow_jitter', True), ('shadow_jitter_overblur', 0.0)):
        if hasattr(sd, k):
            setattr(sd, k, v)
    sun = bpy.data.objects.new('sun', sd)
    sun.rotation_euler = (math.radians(SUN_TILT_DEG), 0, 0)  # from screen-south, like the sprites
    scene.collection.objects.link(sun)
    return used


def mats():
    m = {}
    pairs = [('edge', None), ('deep', 'deepB'), ('mid', 'midB'), ('shallow', 'shallowB'), ('foam', None),
             ('wet', None), ('bedRim', None), ('bed', 'bedB'), ('basin', None), ('seam', None), ('beam', None),
             ('post', None), ('plank0', None), ('plank1', None), ('plank2', None),
             ('peb0', None), ('peb1', None), ('peb2', None), ('shell', None)]
    for a, b in pairs:
        m[a] = G.ground_mat(a, PAL[a], PAL[b] if b else None, scale=0.012)
    m['sand'] = G.ground_mat('sand', PAL['sand'], PAL['sandB'], scale=0.006, detail=4.0, lo=0.45, hi=0.7)
    return m


def lagoon_and_island(L, m):
    W, H = L['world']['w'], L['world']['h']
    world = {'x': 0, 'y': 0, 'w': W, 'h': H}
    ins, rad = L['island']['inset'], L['island']['radius']
    isle = {'x': ins, 'y': ins, 'w': W - 2 * ins, 'h': H - 2 * ins}
    G.rrect('edge', world, 0, 0.0, m['edge'])
    G.rrect('deep', world, 40, 0.1, m['deep'], grow=-10, amp=4, seed=1.0)
    # depth bands, foam and wet rim all share one wobble seed so they follow the shoreline
    for i, (key, grow, amp) in enumerate([('mid', 44, 9), ('shallow', 26, 9), ('foam', 9, 8), ('wet', 0, 7.5)]):
        G.rrect(key, isle, rad, 0.2 + i * 0.1, m[key], grow=grow, amp=amp, seed=3.0)
    G.rrect('sand', isle, rad, 0.7, m['sand'], grow=-18, amp=9, seed=3.6)


def boards(name, r, along, m, rng, z):
    """Plank deck on rect r: dark seam base, bevelled boards across `along` (the pier length)."""
    G.rrect(name + '_seam', r, 3, z, m['seam'])
    length = r['h'] if along == 'y' else r['w']
    n = max(1, int(length // BOARD))
    pitch = length / n
    for i in range(n):
        o = i * pitch + 1.5
        b = ({'x': r['x'] + 3, 'y': r['y'] + o, 'w': r['w'] - 6, 'h': pitch - 3} if along == 'y'
             else {'x': r['x'] + o, 'y': r['y'] + 3, 'w': pitch - 3, 'h': r['h'] - 6})
        G.slab(f'{name}_b{i}', b, 2, z + 0.1, 2.5, m[f'plank{rng.randrange(3)}'], bevel=1.2, shadow=False)


def piers(L, m, rng):
    for k, p in enumerate(L['piers']):
        along = p['dir']
        boards(f'pier{k}', p, along, m, rng, 1.0)
        # stringers along both long sides + posts every ~90 u, poking out into the water
        if along == 'y':
            sides = [{'x': p['x'] - 6, 'y': p['y'], 'w': 10, 'h': p['h']},
                     {'x': p['x'] + p['w'] - 4, 'y': p['y'], 'w': 10, 'h': p['h']}]
            span, x0, y0 = p['h'], None, p['y']
        else:
            sides = [{'x': p['x'], 'y': p['y'] - 6, 'w': p['w'], 'h': 10},
                     {'x': p['x'], 'y': p['y'] + p['h'] - 4, 'w': p['w'], 'h': 10}]
            span, x0, y0 = p['w'], p['x'], None
        for j, s in enumerate(sides):
            G.slab(f'pier{k}_side{j}', s, 3, 1.0, 4.0, m['beam'], bevel=1.5, shadow=False)
        for t in range(int(span // 90) + 1):
            d = min(span - 10, 10 + t * 90)
            for s in sides:
                cx = s['x'] + s['w'] / 2 if along == 'y' else x0 + d
                cy = y0 + d if along == 'y' else s['y'] + s['h'] / 2
                G.pebble(f'pier{k}_post', cx, cy, 9, 9, 6, m['post'])
    for k, p in enumerate(L['pads']):
        boards(f'pad{k}', p, 'y', m, rng, 1.0)
        G.slab(f'pad{k}_rim', p, 6, 0.9, 1.0, m['beam'], grow=5, shadow=False)


def beds(L, m, rng):
    for k, s in enumerate(L['shallows']):
        rad = 70
        G.rrect(f'bed{k}_damp', s, rad, 0.9, m['wet'], grow=18, amp=6, seed=5.0)
        G.rrect(f'bed{k}_rim', s, rad, 1.0, m['bedRim'], grow=6, amp=3, seed=5.0)
        G.rrect(f'bed{k}', s, rad, 1.1, m['bed'])
        ins = 0.19 * min(s['w'], s['h'])
        inner = {'x': s['x'] + ins, 'y': s['y'] + ins, 'w': s['w'] - 2 * ins, 'h': s['h'] - 2 * ins}
        G.rrect(f'bed{k}_basin', inner, 60, 1.2, m['basin'], amp=6, seed=6.0)
        # a ring of pebbles along the bed's edge, a few loose ones inside
        ring = G.perimeter(s['x'] + 6, s['y'] + 6, s['w'] - 12, s['h'] - 12, rad - 6, 21.0)
        for i, (px, py, _, _) in enumerate(ring):
            rr = rng.uniform(6, 10)
            G.pebble(f'bed{k}_p{i}', px + rng.uniform(-3, 3), G.by(py) + rng.uniform(-3, 3),
                     rr, rr * rng.uniform(0.7, 1.0), rr * 0.5, m[f'peb{rng.randrange(3)}'], rng.uniform(0, 3.1))
        for i in range(10):
            x = rng.uniform(inner['x'], inner['x'] + inner['w'])
            y = rng.uniform(inner['y'], inner['y'] + inner['h'])
            rr = rng.uniform(4, 7)
            G.pebble(f'bed{k}_q{i}', x, y, rr, rr * 0.8, rr * 0.5, m[f'peb{rng.randrange(3)}'], rng.uniform(0, 3.1))


def _hits(x, y, rects, pad):
    return any(r['x'] - pad <= x <= r['x'] + r['w'] + pad and r['y'] - pad <= y <= r['y'] + r['h'] + pad for r in rects)


def scatter(L, m, rng):
    """Pebbles and shells on open sand, clear of every rect so nothing hides under props."""
    W, H = L['world']['w'], L['world']['h']
    edge = L['island']['inset'] + 70
    blocked = L['obstacles'] + L['decor'] + L['piers'] + L['pads'] + L['shallows'] + L['bushes']
    placed = 0
    while placed < 150:
        x, y = rng.uniform(edge, W - edge), rng.uniform(edge, H - edge)
        if _hits(x, y, blocked, 34):
            continue
        shell = placed % 5 == 0
        rr = rng.uniform(3, 5) if shell else rng.uniform(2.5, 5.5)
        G.pebble(f'grit{placed}', x, y, rr, rr * (0.6 if shell else 0.85), rr * 0.45,
                 m['shell'] if shell else m[f'peb{rng.randrange(3)}'], rng.uniform(0, 3.1))
        placed += 1


def casters(L, m):
    """Hidden slabs whose soft sun shadows give walls, barrels/crates and kelp a contact shadow."""
    for k, o in enumerate(L['obstacles']):
        G.slab(f'cast_wall{k}', o, 18, 0, 34, m['seam'], grow=10, camera=False)
    for k, d in enumerate(L['decor']):
        G.slab(f'cast_decor{k}', d, min(d['w'], d['h']) / 2, 0, 24, m['seam'], grow=6, camera=False)
    for k, b in enumerate(L['bushes']):
        G.slab(f'cast_kelp{k}', b, 46, 0, 14, m['seam'], grow=-6, camera=False)


def main():
    a = args()
    t0 = time.time()
    with open(a.layout) as f:
        L = json.load(f)
    G.set_world_h(L['world']['h'])
    engine = setup(L, a.engine)
    m = mats()
    rng = random.Random(7)
    lagoon_and_island(L, m)
    beds(L, m, rng)
    piers(L, m, rng)
    scatter(L, m, rng)
    casters(L, m)
    os.makedirs(os.path.dirname(os.path.abspath(a.out)), exist_ok=True)
    bpy.context.scene.render.filepath = os.path.abspath(a.out)
    bpy.ops.render.render(write_still=True)
    result = {'id': L['id'], 'engine': engine, 'blender': bpy.app.version_string,
              'objects': len(bpy.context.scene.objects), 'sec': round(time.time() - t0, 1)}
    print('[arena] result ' + json.dumps(result), flush=True)


try:
    main()
except Exception as e:  # non-zero exit so the orchestrator can fall back
    import traceback
    traceback.print_exc()
    print(f'[arena] error {e}', flush=True)
    sys.exit(1)
