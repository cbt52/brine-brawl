"""Feature generators: each spec feature expands into ordinary parts (see `build.part_mesh`).

A feature is `{fn, parent, at, ...}`; `at` is the attachment point in model space and becomes
the pivot of the generated parts, so prims here are in that local frame (z = along the feature).
Colour keys (`c`, `tip`, `cap`, `band`) are pal keys or #RRGGBB like a part's `c`.
Pure Python (no bpy) so the shapes stay easy to reason about.
"""


def _mirror(at, rot):
    return [-at[0], at[1], at[2]], [rot[0], -rot[1], -rot[2]]


def ears_long(f):
    """Two long upright ears, splayed outward and leaning back, with a zigzag-edged tip cap.
    `at` = base of the right ear (the left one is mirrored). Keys: len, w, d, splay, lean, tip."""
    length = f.get('len', 34)
    w = f.get('w', 14)
    d = f.get('d', 8)
    cap = length * f.get('tipFrac', 0.36)
    rot = [-f.get('lean', 10), f.get('splay', 12), 0]
    ear = [{'type': 'capsule', 'at': [0, 0, length / 2], 'size': [w, d, length]}]
    # The cap is a rounded sleeve over the ear top; three downward teeth give it the zigzag edge.
    z0 = length - cap
    tip = [{'type': 'capsule', 'at': [0, 0, length - cap / 2 + 0.6], 'size': [w + 2, d + 2, cap + 1.2]}]
    for i, x in enumerate((-w * 0.33, 0, w * 0.33)):
        drop = 5.5 if i == 1 else 3.5
        tip.append({'type': 'cone', 'at': [x, 0, z0 - drop / 2 + 1], 'size': [w * 0.36, d + 2, drop + 2],
                    'rot': [180, 0, 0]})
    parts = []
    for side, flip in (('r', False), ('l', True)):
        at, r = _mirror(f['at'], rot) if flip else (list(f['at']), rot)
        base = {'parent': f.get('parent'), 'pivot': at, 'rot': r, 'remesh': f.get('remesh', 1.0)}
        parts.append({**base, 'name': f'ear_{side}', 'c': f.get('c', 'body'), 'prims': ear})
        parts.append({**base, 'name': f'ear_{side}_tip', 'parent': f'ear_{side}', 'rot': [0, 0, 0],
                      'c': f.get('tip', 'trim'), 'prims': tip})
    return parts


def tail_battery(f):
    """A stubby battery tail: rounded cell, a band round its middle and a capped + terminal.
    `at` = where it leaves the body; it points back (+y) and up by `tilt` degrees."""
    length = f.get('len', 18)
    r = f.get('r', 15)
    base = {'parent': f.get('parent'), 'pivot': list(f['at']), 'rot': [-(90 - f.get('tilt', 30)), 0, 0],
            'remesh': f.get('remesh', 1.0)}
    cell = [{'type': 'capsule', 'at': [0, 0, length / 2 - 2], 'size': [r, r, length + 4]}]
    band = [{'type': 'cylinder', 'at': [0, 0, length * 0.42], 'size': [r + 2, r + 2, 4]}]
    cap = [{'type': 'cylinder', 'at': [0, 0, length - 1], 'size': [r * 0.8, r * 0.8, 4]},
           {'type': 'capsule', 'at': [0, 0, length + 2.5], 'size': [r * 0.4, r * 0.4, 6]}]
    return [
        {**base, 'name': 'tail', 'c': f.get('c', 'prop'), 'prims': cell},
        {**base, 'name': 'tail_band', 'parent': 'tail', 'rot': [0, 0, 0], 'c': f.get('band', 'trim'),
         'prims': band},
        {**base, 'name': 'tail_cap', 'parent': 'tail', 'rot': [0, 0, 0], 'c': f.get('cap', 'detail'),
         'prims': cap},
    ]


FEATURES = {'earsLong': ears_long, 'tailBattery': tail_battery}


def expand(features):
    parts = []
    for f in features:
        parts += FEATURES[f['fn']](f)
    return parts
