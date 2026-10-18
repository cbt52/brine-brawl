"""Face decals: unlit ellipsoids wrapped onto the front of the head ellipsoid (no outline hull).

Spec `face` = {part, eyeDx, eyeZ, eyeW, eyeH, brow, mouth, mouthZ, nose?}; positions are
offsets from the head ellipsoid centre (x right, z up, in px at 1x). Two variants are built:
`normal` (white eyes, pupils with a glint, brows, mouth) and `hurt` (X eyes, open mouth);
the returned switch shows one of them.
"""
import math

import bmesh
import bpy
from mathutils import Vector

from . import toon

INK = toon.OUTLINE_HEX


class Head:
    """Front surface of the head ellipsoid in head-local coordinates."""

    def __init__(self, prim):
        self.c = Vector(prim['at'])
        self.r = Vector(prim['size']) / 2

    def surface(self, x, z):
        rx, ry, rz = self.r
        k = max(0.0, 1 - (x / rx) ** 2 - (z / rz) ** 2)
        y = -ry * math.sqrt(k)
        n = Vector((x / rx ** 2, y / ry ** 2, z / rz ** 2)).normalized()
        return self.c + Vector((x, y, z)), n


def _decal(name, head, x, z, size, mat, lift=0.0, roll=0.0, scale=1.0):
    """Ellipsoid `size` = (width, thickness, height) at (x, z) on the head, rolled
    counter-clockwise (as seen from the front) by `roll` degrees and wrapped onto the
    curved surface, so it hugs the head instead of floating off it near the silhouette."""
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=24, v_segments=12, radius=0.5)
    bmesh.ops.scale(bm, vec=Vector(size), verts=bm.verts)
    c, s = math.cos(math.radians(roll)), math.sin(math.radians(roll))
    for v in bm.verts:
        u, t, w = v.co
        p, n = head.surface(x + u * c - w * s, z + u * s + w * c)
        v.co = (p + n * (lift + t)) * scale
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    me.materials.append(mat)
    ob = bpy.data.objects.new(name, me)
    if hasattr(ob, 'visible_shadow'):
        ob.visible_shadow = False
    return ob


def _stroke(name, head, a, b, width, mat, lift, scale):
    """A capsule-ish ink stroke from a=(x, z) to b=(x, z)."""
    dx, dz = b[0] - a[0], b[1] - a[1]
    length = math.hypot(dx, dz) + width
    mid = ((a[0] + b[0]) / 2, (a[1] + b[1]) / 2)
    return _decal(name, head, *mid, (length, 2.4, width), mat, lift, math.degrees(math.atan2(dz, dx)), scale)


BROWS = {
    # inner end lower = mischievous; (outer rise, inner drop) in px
    'grin': (2.5, -1.5),
    'fierce': (3.5, -3.0),
    'calm': (0.0, 0.0),
}

MOUTHS = {
    # polyline points (x, z) relative to the mouth centre
    'smirk': [(-7, 1), (0, -2), (7, 3)],
    'smile': [(-7, 2), (0, -2), (7, 2)],
    'tiny': [(-3, 0), (3, 0)],
    'grin': [(-11, 4), (-6, -1), (0, -2.5), (6, -1), (11, 4)],
}


def build(f, head_part, head_ob, scale, workbench=False):
    """Create both face variants under the head object; returns switch(variant)."""
    head = Head(head_part['prims'][0])
    mats = {}

    def mat(hex_color):
        if hex_color not in mats:
            mats[hex_color] = toon.flat('face_' + hex_color, hex_color, workbench)
        return mats[hex_color]

    dx, ez = f['eyeDx'], f['eyeZ']
    ew, eh = f.get('eyeW', 12), f.get('eyeH', 14)
    mz = f.get('mouthZ', ez - eh / 2 - 9)
    v = {'normal': [], 'hurt': [], 'both': []}
    for s in (1, -1):
        x = s * dx
        v['normal'].append(_decal(f'eye{s}', head, x, ez, (ew, 2.0, eh), mat('#FFFFFF'), 0.0, 0, scale))
        px, pz = x - s * ew * 0.08, ez - eh * 0.06
        v['normal'].append(_decal(f'pupil{s}', head, px, pz, (ew * 0.52, 2.0, eh * 0.6), mat(INK), 0.6, 0, scale))
        v['normal'].append(_decal(f'glint{s}', head, px - ew * 0.12, pz + eh * 0.14, (ew * 0.2, 1.6, eh * 0.2),
                                  mat('#FFFFFF'), 1.2, 0, scale))
        rise, drop = BROWS[f.get('brow', 'calm')]
        by = ez + eh / 2 + 3.5
        v['normal'].append(_stroke(f'brow{s}', head, (x - s * ew * 0.5, by + drop), (x + s * ew * 0.5, by + rise),
                                   3.2, mat(INK), 0.4, scale))
        # hurt: squeezed X eyes
        hw, hh = ew * 0.5, eh * 0.4
        v['hurt'].append(_stroke(f'xa{s}', head, (x - hw, ez - hh), (x + hw, ez + hh), 3.2, mat(INK), 0.4, scale))
        v['hurt'].append(_stroke(f'xb{s}', head, (x - hw, ez + hh), (x + hw, ez - hh), 3.2, mat(INK), 0.4, scale))
    pts = MOUTHS[f.get('mouth', 'smile')]
    for i in range(len(pts) - 1):
        a = (pts[i][0], mz + pts[i][1])
        b = (pts[i + 1][0], mz + pts[i + 1][1])
        v['normal'].append(_stroke(f'mouth{i}', head, a, b, 3.0, mat(INK), 0.4, scale))
    v['hurt'].append(_decal('mouth_open', head, 0, mz - 2, (11, 2.4, 8), mat(INK), 0.4, 0, scale))
    if f.get('nose'):
        v['both'].append(_decal('nose', head, 0, ez - eh / 2 - 2.5, (6, 3.0, 4.5), mat(f['nose']), 0.5, 0, scale))

    scene = bpy.context.scene
    for ob in v['normal'] + v['hurt'] + v['both']:
        scene.collection.objects.link(ob)
        ob.parent = head_ob

    def switch(variant):
        for key in ('normal', 'hurt'):
            for ob in v[key]:
                ob.hide_render = key != variant

    switch('normal')
    return switch
