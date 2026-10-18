"""Render the seamless lagoon water tile (T44, TASKS-LOOP §2.11 "Water tile").

Called by `scripts/lib/arena-water.mjs` as
  blender -b --factory-startup --python scripts/blender/render_water.py -- \
      --out <water.png> [--size 512] [--engine eevee|workbench]
One emissive plane under an ortho camera. The pattern is toon caustics: Voronoi distance-to-edge
cut into 3 flat bands by a constant ramp. It is seamless by construction: the tile's (u, v) is
mapped onto a flat torus in 4D, (R cos 2πu, R sin 2πu, R cos 2πv) + W = R sin 2πv, so the 4D
Voronoi/noise values wrap exactly at the tile edges. Output is a grey mask (white = bright line);
the orchestrator turns it into the tinted, alpha-blended tile. Prints one `[water] result {...}`.
"""
import argparse
import json
import math
import os
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import bpy  # noqa: E402

from lib import cam  # noqa: E402

RADIUS = 1.0      # torus radius: circumference 2π, so 2π·CELLS ≈ cells across the tile
CELLS = 1.3       # Voronoi scale on the torus (~8 cells per tile)
WARP = 0.22       # noise warp of the cell lines (wobbly caustics instead of straight edges)
RAW_GAIN = 2.0    # `--raw`: distance × gain as grey, to read percentiles off when tuning BANDS
# constant ramp on distance-to-edge (cell units; linear values, Standard view makes them sRGB):
# thin bright line (~5 % of pixels), faint halo (~10 %), clear water
BANDS = [(0.0, 1.0), (0.008, 0.1), (0.022, 0.0)]


def args():
    argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    ap = argparse.ArgumentParser()
    ap.add_argument('--out', required=True)
    ap.add_argument('--size', type=int, default=512)
    ap.add_argument('--engine', default='eevee', choices=['eevee', 'workbench'])
    ap.add_argument('--raw', action='store_true', help='emit distance-to-edge (linear, x RAW_GAIN) to tune BANDS')
    ap.add_argument('--cells', type=float, default=CELLS)
    ap.add_argument('--span', type=float, default=1.0, help='tiles across the frame (2 = wrap check)')
    return ap.parse_args(argv)


def setup(size, engine, span=1.0):
    scene = bpy.context.scene
    for ob in list(scene.objects):
        bpy.data.objects.remove(ob, do_unlink=True)
    used = cam.set_engine(scene, engine)
    if used == 'eevee':
        scene.eevee.taa_render_samples = 32
    r = scene.render
    r.resolution_x = r.resolution_y = size
    r.resolution_percentage = 100
    r.film_transparent = False
    r.filter_size = 1.0
    r.dither_intensity = 0.0
    r.image_settings.file_format = 'PNG'
    r.image_settings.color_mode = 'RGB'  # grey in all 3 channels (readRGBA wants 3/4 channels)
    r.image_settings.color_depth = '8'
    vs = scene.view_settings
    vs.view_transform, vs.look, vs.exposure, vs.gamma = 'Standard', 'None', 0.0, 1.0
    scene.display_settings.display_device = 'sRGB'
    world = bpy.data.worlds.new('void')
    world.color = (0, 0, 0)
    scene.world = world
    cd = bpy.data.cameras.new('cam')
    cd.type = 'ORTHO'
    cd.ortho_scale = span
    c = bpy.data.objects.new('cam', cd)
    c.location = (0, 0, 10)
    scene.collection.objects.link(c)
    scene.camera = c
    return used


def torus(nt, u, v):
    """(vector, w) on the flat 4D torus for tile coords u, v (sockets, 1 = one tile)."""
    def trig(op, s):
        tau = nt.nodes.new('ShaderNodeMath')
        tau.operation = 'MULTIPLY'
        tau.inputs[1].default_value = 2 * math.pi
        nt.links.new(s, tau.inputs[0])
        f = nt.nodes.new('ShaderNodeMath')
        f.operation = op
        nt.links.new(tau.outputs[0], f.inputs[0])
        k = nt.nodes.new('ShaderNodeMath')
        k.operation = 'MULTIPLY'
        k.inputs[1].default_value = RADIUS
        nt.links.new(f.outputs[0], k.inputs[0])
        return k.outputs[0]
    vec = nt.nodes.new('ShaderNodeCombineXYZ')
    nt.links.new(trig('COSINE', u), vec.inputs[0])
    nt.links.new(trig('SINE', u), vec.inputs[1])
    nt.links.new(trig('COSINE', v), vec.inputs[2])
    return vec.outputs[0], trig('SINE', v)


def water_mat(raw=False, cells=CELLS):
    mat = bpy.data.materials.new('water')
    mat.use_nodes = True
    nt = mat.node_tree
    nt.nodes.clear()
    tc = nt.nodes.new('ShaderNodeTexCoord')
    sep = nt.nodes.new('ShaderNodeSeparateXYZ')
    nt.links.new(tc.outputs['Object'], sep.inputs[0])
    vec, w = torus(nt, sep.outputs[0], sep.outputs[1])
    # warp: periodic 4D noise (same torus coords) nudges the Voronoi lookup
    noise = nt.nodes.new('ShaderNodeTexNoise')
    noise.noise_dimensions = '4D'
    noise.inputs['Scale'].default_value = 1.4
    noise.inputs['Detail'].default_value = 2.0
    nt.links.new(vec, noise.inputs['Vector'])
    nt.links.new(w, noise.inputs['W'])
    centred = nt.nodes.new('ShaderNodeVectorMath')
    centred.operation = 'SUBTRACT'
    centred.inputs[1].default_value = (0.5, 0.5, 0.5)
    nt.links.new(noise.outputs['Color'], centred.inputs[0])
    scaled = nt.nodes.new('ShaderNodeVectorMath')
    scaled.operation = 'SCALE'
    scaled.inputs['Scale'].default_value = WARP
    nt.links.new(centred.outputs[0], scaled.inputs[0])
    warped = nt.nodes.new('ShaderNodeVectorMath')
    warped.operation = 'ADD'
    nt.links.new(vec, warped.inputs[0])
    nt.links.new(scaled.outputs[0], warped.inputs[1])
    vor = nt.nodes.new('ShaderNodeTexVoronoi')
    vor.voronoi_dimensions = '4D'
    vor.feature = 'DISTANCE_TO_EDGE'
    vor.inputs['Scale'].default_value = cells
    vor.inputs['Randomness'].default_value = 0.9
    nt.links.new(warped.outputs[0], vor.inputs['Vector'])
    nt.links.new(w, vor.inputs['W'])
    ramp = nt.nodes.new('ShaderNodeValToRGB')
    ramp.color_ramp.interpolation = 'CONSTANT'
    els = ramp.color_ramp.elements
    while len(els) < len(BANDS):
        els.new(0.5)
    for el, (pos, val) in zip(els, BANDS):
        el.position = pos
        el.color = (val, val, val, 1)
    nt.links.new(vor.outputs['Distance'], ramp.inputs['Fac'])
    emit = nt.nodes.new('ShaderNodeEmission')
    if raw:
        gain = nt.nodes.new('ShaderNodeMath')
        gain.operation = 'MULTIPLY'
        gain.inputs[1].default_value = RAW_GAIN
        nt.links.new(vor.outputs['Distance'], gain.inputs[0])
        nt.links.new(gain.outputs[0], emit.inputs['Color'])
    else:
        nt.links.new(ramp.outputs['Color'], emit.inputs['Color'])
    out = nt.nodes.new('ShaderNodeOutputMaterial')
    nt.links.new(emit.outputs['Emission'], out.inputs['Surface'])
    return mat


def plane(mat, span=1.0):
    # 1/8 tile past the frame on each side so the edge pixels' AA samples still land on the (periodic) pattern
    bpy.ops.mesh.primitive_plane_add(size=span + 0.25, location=(0, 0, 0))
    ob = bpy.context.active_object
    ob.data.materials.append(mat)
    return ob


def main():
    a = args()
    t0 = time.time()
    engine = setup(a.size, a.engine, a.span)
    plane(water_mat(a.raw, a.cells), a.span)
    os.makedirs(os.path.dirname(os.path.abspath(a.out)), exist_ok=True)
    bpy.context.scene.render.filepath = os.path.abspath(a.out)
    bpy.ops.render.render(write_still=True)
    result = {'engine': engine, 'blender': bpy.app.version_string, 'size': a.size,
              'sec': round(time.time() - t0, 1)}
    print('[water] result ' + json.dumps(result), flush=True)


try:
    main()
except Exception as e:  # non-zero exit so the orchestrator can report it
    import traceback
    traceback.print_exc()
    print(f'[water] error {e}', flush=True)
    sys.exit(1)
