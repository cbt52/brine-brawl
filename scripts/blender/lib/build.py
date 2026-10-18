"""Build a fighter model from a spec (`scripts/blender/specs/<id>.json`).

Each part = its primitives joined into one mesh, optionally voxel-remeshed and subdivided
(vinyl-toy look), coloured with one toon material and wrapped in an inverted-hull outline.
Parts hang under a root empty that the renderer turns per direction.
Prim `size` is the full bounding box (x, y, z) of the primitive; `at` is its centre, relative to
the part's `pivot` (model space, default origin). A part may carry a `rot` (degrees) about its
pivot; the puppet animation (T36) turns parts about the same pivots.
Spec `features` expand into extra parts (`features.py`); the `face` is unlit decals (`face.py`).
"""
import math

import bmesh
import bpy
from mathutils import Euler, Matrix, Vector

from . import face as face_mod
from . import features as feat_mod
from . import toon

OUTLINE_PX = 3.0  # at 1x; model units are px at 1x


def _sphere(bm):
    bmesh.ops.create_uvsphere(bm, u_segments=32, v_segments=16, radius=0.5)


def _capsule(bm, size):
    """Unit-ish capsule: ellipsoid ends with radius min(x, y) / 2, straight middle."""
    sx, sy, sz = size
    r = min(sx, sy) / 2
    half = max(0.0, sz / 2 - r)
    res = bmesh.ops.create_uvsphere(bm, u_segments=32, v_segments=16, radius=1.0)
    for v in res['verts']:
        z = v.co.z
        sign = 1 if z > 1e-6 else -1 if z < -1e-6 else 0
        v.co = Vector((v.co.x * sx / 2, v.co.y * sy / 2, z * r + sign * half))


def _cone(bm, top=0.0):
    bmesh.ops.create_cone(bm, cap_ends=True, segments=32, radius1=0.5, radius2=top, depth=1.0)


def _box(bm):
    bmesh.ops.create_cube(bm, size=1.0)


def prim_bmesh(prim, scale):
    """One primitive as a bmesh, already placed in model space."""
    bm = bmesh.new()
    kind = prim['type']
    size = prim['size']
    if kind == 'capsule':
        _capsule(bm, size)
    else:
        {'sphere': _sphere, 'cone': _cone, 'box': _box, 'cylinder': lambda b: _cone(b, 0.5)}[kind](bm)
        bmesh.ops.scale(bm, vec=Vector(size), verts=bm.verts)
    rot = Euler([math.radians(a) for a in prim.get('rot', [0, 0, 0])]).to_matrix().to_4x4()
    m = Matrix.Scale(scale, 4) @ Matrix.Translation(Vector(prim['at'])) @ rot
    bm.transform(m)
    return bm


def part_mesh(part, scale):
    """All prims of a part joined into one mesh (remeshed + subdivided when asked)."""
    me = bpy.data.meshes.new(part['name'])
    bm = bmesh.new()
    for prim in part['prims']:
        pb = prim_bmesh(prim, scale)
        tmp = bpy.data.meshes.new('tmp')
        pb.to_mesh(tmp)
        pb.free()
        bm.from_mesh(tmp)
        bpy.data.meshes.remove(tmp)
    bm.to_mesh(me)
    bm.free()
    voxel = part.get('remesh')
    if voxel:
        me = _remeshed(me, voxel * scale)
    if hasattr(me, 'shade_smooth'):
        me.shade_smooth()
    else:
        me.polygons.foreach_set('use_smooth', [True] * len(me.polygons))
    return me


def _remeshed(me, voxel):
    """Voxel remesh + one subdivision level, applied without bpy.ops."""
    ob = bpy.data.objects.new('remesh_tmp', me)
    bpy.context.scene.collection.objects.link(ob)
    rm = ob.modifiers.new('remesh', 'REMESH')
    rm.mode = 'VOXEL'
    rm.voxel_size = voxel
    sub = ob.modifiers.new('sub', 'SUBSURF')
    sub.levels = sub.render_levels = 1
    dg = bpy.context.evaluated_depsgraph_get()
    out = bpy.data.meshes.new_from_object(ob.evaluated_get(dg))
    out.name = me.name
    bpy.data.objects.remove(ob, do_unlink=True)
    bpy.data.meshes.remove(me)
    return out


def hull_mesh(me, thickness):
    """Inverted hull: vertices pushed out along their normals (even thickness), faces flipped."""
    bm = bmesh.new()
    bm.from_mesh(me)
    bm.normal_update()
    moves = []
    for v in bm.verts:
        n = v.normal
        dots = [max(0.3, n.dot(f.normal)) for f in v.link_faces] or [1.0]
        moves.append(n * (thickness / min(dots)))
    for v, d in zip(bm.verts, moves):
        v.co += d
    bmesh.ops.reverse_faces(bm, faces=bm.faces)
    out = bpy.data.meshes.new(me.name + '_hull')
    bm.to_mesh(out)
    bm.free()
    return out


def color_of(spec, key):
    return spec['pal'][key] if key in spec['pal'] else key


def all_parts(spec):
    """Spec parts followed by the parts its features expand into."""
    return list(spec['parts']) + feat_mod.expand(spec.get('features', []))


def build(spec, workbench=False):
    """Create the model in the current scene. Returns (root empty, face switcher or None)."""
    scene = bpy.context.scene
    scale = spec.get('scale', 1.0)
    root = bpy.data.objects.new(spec['id'], None)
    scene.collection.objects.link(root)
    line = toon.outline(workbench)
    mats = {}
    objs = {}
    pivots = {}
    for part in all_parts(spec):
        c = color_of(spec, part.get('c', 'body'))
        if c not in mats:
            mats[c] = toon.toon('toon_' + c, c, workbench)
        me = part_mesh(part, scale)
        me.materials.append(mats[c])
        ob = bpy.data.objects.new(part['name'], me)
        scene.collection.objects.link(ob)
        parent = part.get('parent')
        ob.parent = objs.get(parent, root)
        pivot = Vector(part.get('pivot', [0, 0, 0])) * scale
        ob.location = pivot - pivots.get(parent, Vector((0, 0, 0)))
        ob.rotation_euler = [math.radians(a) for a in part.get('rot', [0, 0, 0])]
        hull = bpy.data.objects.new(part['name'] + '_hull', hull_mesh(me, OUTLINE_PX))
        hull.data.materials.append(line)
        if hasattr(hull, 'visible_shadow'):
            hull.visible_shadow = False
        scene.collection.objects.link(hull)
        hull.parent = ob
        objs[part['name']] = ob
        pivots[part['name']] = pivot
    switch = None
    if spec.get('face'):
        f = spec['face']
        head = next(p for p in spec['parts'] if p['name'] == f['part'])
        switch = face_mod.build(f, head, objs[f['part']], scale, workbench)
    return root, switch
