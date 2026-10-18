"""Flat-ground building blocks for `render_arena.py` (T42, TASKS-LOOP §2.11 "Arena").

World space: 1 unit = 1 world px, x right, Blender +Y = screen up (game y is flipped with
`by`), z up towards the top-down camera. Layers are flat n-gons stacked by z (painter's order)
that never cast shadows; only hidden `caster` boxes and the pebbles do. Ground colours are
palette hexes x a light factor (shadow 0.66 .. lit 1.0), so open sand shows the exact hex.
"""
import math

import bmesh
import bpy

from . import toon

SHADOW_MUL = 0.66
LIT_REF = 0.9  # Shader-to-RGB value of flat ground in full sun (sun strength pi, tilt ~10 deg)
WORLD_H = 1600
PEBBLE_Z = 1.5  # above every flat layer (the lower half of a pebble just hides under them)


def set_world_h(h):
    global WORLD_H
    WORLD_H = h


def by(y):
    """Game y (down) -> Blender Y (up)."""
    return WORLD_H - y


def perimeter(x, y, w, h, r, step=10.0):
    """Points + outward normals round a rounded rect (game coords in, Blender coords out),
    counter-clockwise, about `step` apart so wobble can bend the straight edges too."""
    r = max(0.0, min(r, w / 2, h / 2))
    x0, x1, y0, y1 = x, x + w, by(y + h), by(y)
    corners = [((x1 - r, y0 + r), -90), ((x1 - r, y1 - r), 0), ((x0 + r, y1 - r), 90), ((x0 + r, y0 + r), 180)]
    pts = []
    for i, ((cx, cy), a0) in enumerate(corners):
        n_arc = max(1, int(math.pi / 2 * r / step)) if r > 0 else 1
        for k in range(n_arc + 1):
            a = math.radians(a0 + 90 * k / n_arc)
            pts.append((cx + r * math.cos(a), cy + r * math.sin(a), math.cos(a), math.sin(a)))
        # straight edge to the next corner's arc start
        (nx_, ny_), na0 = corners[(i + 1) % 4]
        a = math.radians(na0)
        sx, sy = pts[-1][0], pts[-1][1]
        ex, ey = nx_ + r * math.cos(a), ny_ + r * math.sin(a)
        n = (math.cos(math.radians(a0 + 90)), math.sin(math.radians(a0 + 90)))
        seg = max(1, int(math.hypot(ex - sx, ey - sy) / step))
        for k in range(1, seg):
            t = k / seg
            pts.append((sx + (ex - sx) * t, sy + (ey - sy) * t, n[0], n[1]))
    return pts


def wobble(pts, amp, seed=0.0):
    """Push each point along its normal by a smooth position-based ripple (coherent between
    nested rings that share a seed, so foam follows the shoreline)."""
    if amp == 0:
        return [(p[0], p[1]) for p in pts]
    out = []
    for px, py, nx, ny in pts:
        d = (math.sin(px * 0.021 + seed) + math.sin(py * 0.017 + seed * 1.7)
             + 0.6 * math.sin((px + py) * 0.043 + seed * 2.3)) / 2.6
        out.append((px + nx * amp * d, py + ny * amp * d))
    return out


def _link(name, mesh, mat, z):
    ob = bpy.data.objects.new(name, mesh)
    ob.location.z = z
    mesh.materials.append(mat)
    bpy.context.scene.collection.objects.link(ob)
    return ob


def poly(name, pts2d, z, mat, shadow=False):
    """One flat n-gon at height z."""
    me = bpy.data.meshes.new(name)
    me.from_pydata([(x, y, 0.0) for x, y in pts2d], [], [list(range(len(pts2d)))])
    me.update()
    ob = _link(name, me, mat, z)
    ob.visible_shadow = shadow
    return ob


def rrect(name, r, radius, z, mat, grow=0.0, amp=0.0, seed=0.0, step=10.0):
    """Rounded rect (game rect dict) grown by `grow` on every side, optionally wobbled."""
    pts = perimeter(r['x'] - grow, r['y'] - grow, r['w'] + 2 * grow, r['h'] + 2 * grow, radius + grow, step)
    return poly(name, wobble(pts, amp, seed), z, mat)


def slab(name, r, radius, z0, height, mat, grow=0.0, bevel=0.0, camera=True, shadow=True):
    """Extruded rounded rect: plank boards (bevelled) or hidden shadow casters."""
    pts = perimeter(r['x'] - grow, r['y'] - grow, r['w'] + 2 * grow, r['h'] + 2 * grow, radius + grow, 8.0)
    bm = bmesh.new()
    face = bm.faces.new([bm.verts.new((p[0], p[1], 0.0)) for p in pts])
    ext = bmesh.ops.extrude_face_region(bm, geom=[face])
    for v in ext['geom']:
        if isinstance(v, bmesh.types.BMVert):
            v.co.z = height
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    ob = _link(name, me, mat, z0)
    if bevel > 0:
        mod = ob.modifiers.new('bevel', 'BEVEL')
        mod.width = bevel
        mod.segments = 1
    ob.visible_camera = camera
    ob.visible_shadow = shadow
    return ob


def pebble(name, x, y, rx, ry, rz, mat, rot=0.0):
    """Flattened sphere sitting on the ground (casts a small shadow)."""
    me = bpy.data.meshes.new(name)
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=12, v_segments=6, radius=1.0)
    bm.to_mesh(me)
    bm.free()
    for p in me.polygons:
        p.use_smooth = True
    ob = _link(name, me, mat, PEBBLE_Z)
    ob.location.x, ob.location.y = x, by(y)
    ob.scale = (rx, ry, rz)
    ob.rotation_euler.z = rot
    return ob


def ground_mat(name, hex_a, hex_b=None, scale=0.01, detail=3.0, lo=0.38, hi=0.62):
    """Palette colour (noise-blended towards hex_b in world space) x sun/shadow light factor."""
    mat = bpy.data.materials.new(name)
    mat.diffuse_color = toon.lin4(toon.hex_rgb(hex_a))
    nt = toon._nodes(mat)
    if hex_b:
        geo = nt.nodes.new('ShaderNodeNewGeometry')
        noise = nt.nodes.new('ShaderNodeTexNoise')
        noise.inputs['Scale'].default_value = scale
        noise.inputs['Detail'].default_value = detail
        nt.links.new(geo.outputs['Position'], noise.inputs['Vector'])
        ramp = nt.nodes.new('ShaderNodeValToRGB')
        ramp.color_ramp.elements[0].position = lo
        ramp.color_ramp.elements[0].color = toon.lin4(toon.hex_rgb(hex_a))
        ramp.color_ramp.elements[1].position = hi
        ramp.color_ramp.elements[1].color = toon.lin4(toon.hex_rgb(hex_b))
        nt.links.new(noise.outputs['Fac'], ramp.inputs['Fac'])
        colour = ramp.outputs['Color']
    else:
        rgb = nt.nodes.new('ShaderNodeRGB')
        rgb.outputs[0].default_value = toon.lin4(toon.hex_rgb(hex_a))
        colour = rgb.outputs[0]
    diffuse = nt.nodes.new('ShaderNodeBsdfDiffuse')
    diffuse.inputs['Color'].default_value = (1, 1, 1, 1)
    s2r = nt.nodes.new('ShaderNodeShaderToRGB')
    nt.links.new(diffuse.outputs['BSDF'], s2r.inputs['Shader'])
    bw = nt.nodes.new('ShaderNodeRGBToBW')
    nt.links.new(s2r.outputs['Color'], bw.inputs['Color'])
    light = nt.nodes.new('ShaderNodeMapRange')
    light.clamp = True
    light.inputs['From Min'].default_value = 0.0
    light.inputs['From Max'].default_value = LIT_REF
    light.inputs['To Min'].default_value = SHADOW_MUL
    light.inputs['To Max'].default_value = 1.0
    nt.links.new(bw.outputs['Val'], light.inputs['Value'])
    lit = nt.nodes.new('ShaderNodeVectorMath')
    lit.operation = 'SCALE'
    nt.links.new(colour, lit.inputs[0])
    nt.links.new(light.outputs['Result'], lit.inputs['Scale'])
    toon._emit(nt, lit.outputs['Vector'])
    return mat
