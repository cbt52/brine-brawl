"""Procedural arena props for `render_arena_props.py` (T43, TASKS-LOOP §2.11 "Arena").

Ground space: 1 unit = 1 world unit, x right, +y = into the screen (north), z up. Every footprint
spans x in [-w/2, w/2], y in [0, h] (y = 0 is the rect's bottom edge, nearest the camera). The
models are fighter-style part lists (`build.build`: prims, toon material, inverted-hull outline);
the renderer then stretches y by 1 / sin 35 so the base covers the rect on the top-down ground.
All colours stay at <= 45 % saturation (arena readability rule).
"""
import math

PAL = {
    'rock': '#C98472', 'coral': '#E59C88', 'tip': '#F0D2C2', 'dome': '#A894B4',
    'wood': '#B08A62', 'slat': '#7A5E44', 'stave': '#9E7A5A', 'lid': '#B39072', 'hoop': '#5B4A3E',
    'bed': '#3F6E58', 'kelp': '#5C9474', 'kelpB': '#4F8566', 'bulb': '#86B592',
}


def _p(kind, size, at, rot=(0, 0, 0)):
    return {'type': kind, 'size': [float(s) for s in size], 'at': [float(a) for a in at], 'rot': list(rot)}


def _axis_prim(kind, size, base, length, tilt, azim):
    """A prim of `length` along an axis tilted `tilt` degrees from vertical towards azimuth `azim`
    (degrees, 0 = +x), starting at `base`. Returns (prim, tip point)."""
    t, a = math.radians(tilt), math.radians(azim)
    d = (math.sin(t) * math.cos(a), math.sin(t) * math.sin(a), math.cos(t))
    mid = [base[i] + d[i] * length / 2 for i in range(3)]
    tip = [base[i] + d[i] * length for i in range(3)]
    return _p(kind, (size[0], size[1], length), mid, (0, tilt, azim)), tip


def _spots(rng, n, x0, x1, y0, y1, gap):
    """Up to n points in the box, at least `gap` apart (rejection sampling)."""
    pts = []
    for _ in range(n * 30):
        if len(pts) >= n or x1 <= x0 or y1 <= y0:
            break
        p = (rng.uniform(x0, x1), rng.uniform(y0, y1))
        if all(math.hypot(p[0] - q[0], p[1] - q[1]) >= gap for q in pts):
            pts.append(p)
    return pts


def wall(w, h, tall, rng):
    """Reef rock (lumpy plinth exactly on the rect) with finger corals and lilac domes on top."""
    plinth = tall * 0.42
    r = min(15.0, min(w, h) / 2 - 3)
    rock = [_p('box', (w - 2, h - 2, plinth), (0, h / 2, plinth / 2))]
    # lumps round the top edge, each touching the rect edge, plus a few inside
    for px, py, _, _ in _ring(w, h, r, r * 1.25):
        s = rng.uniform(0.85, 1.0)
        rock.append(_p('sphere', (2 * r * s, 2 * r * s, 2 * r * 0.8 * s), (px, py, plinth * rng.uniform(0.8, 1.0))))
    for px, py in _spots(rng, max(1, int(w * h / 2400)), -w / 2 + r, w / 2 - r, r, h - r, r):
        rock.append(_p('sphere', (2 * r, 2 * r, 2 * r * 0.7), (px, py, plinth * 0.9)))
    parts = [{'name': 'rock', 'c': 'rock', 'remesh': 3.0, 'prims': rock}]

    fingers, tips, domes = [], [], []
    inset = min(14.0, min(w, h) / 2 - 4)
    n = max(3, int(w * h / 1300))
    for i, (x, y) in enumerate(_spots(rng, n, -w / 2 + inset, w / 2 - inset, inset, h - inset, 14)):
        z = plinth + 4
        if i % 3 == 2:  # a dome
            d = rng.uniform(18, 26)
            domes.append(_p('sphere', (d, d, d * 0.75), (x, y, z + d * 0.2)))
            continue
        out = math.degrees(math.atan2(y - h / 2, x)) if abs(x) + abs(y - h / 2) > 1 else rng.uniform(0, 360)
        for k in range(rng.randint(3, 4)):
            length = rng.uniform(16, 26) * (1.0 if k else 1.15)
            tilt = 0 if k == 0 else rng.uniform(18, 32)
            azim = out + (k - 1.5) * 70 + rng.uniform(-20, 20)
            prim, tip = _axis_prim('capsule', (9, 9), (x, y, z), length, tilt, azim)
            fingers.append(prim)
            tips.append(_p('sphere', (7, 7, 5), tip))
    if fingers:
        parts.append({'name': 'fingers', 'c': 'coral', 'prims': fingers})
        parts.append({'name': 'tips', 'c': 'tip', 'prims': tips})
    if domes:
        parts.append({'name': 'domes', 'c': 'dome', 'prims': domes})
    return parts


def _ring(w, h, r, step):
    """Points along the rect's edge, inset by r (centres of lumps that touch the edge)."""
    x0, x1, y0, y1 = -w / 2 + r, w / 2 - r, r, h - r
    pts = []
    for (ax, ay), (bx, by_) in (((x0, y0), (x1, y0)), ((x1, y0), (x1, y1)), ((x1, y1), (x0, y1)), ((x0, y1), (x0, y0))):
        n = max(1, int(math.hypot(bx - ax, by_ - ay) / step))
        for k in range(n):
            t = k / n
            pts.append((ax + (bx - ax) * t, ay + (by_ - ay) * t, 0, 0))
    return pts


def barrel(w, h, tall, rng):
    """Bulging stave barrel with two iron hoops and a lighter lid."""
    H = tall * rng.uniform(0.92, 1.0)
    body = [_p('cylinder', (w - 6, h - 6, H), (0, h / 2, H / 2)),
            _p('sphere', (w, h, H * 0.92), (0, h / 2, H / 2))]

    def ring_at(z):
        k = max(0.0, 1 - ((z - H / 2) / (0.46 * H)) ** 2)
        return max((w - 6) / 2, w / 2 * math.sqrt(k)), max((h - 6) / 2, h / 2 * math.sqrt(k))

    hoops = []
    for z in (H * 0.2, H * 0.8):
        rx, ry = ring_at(z)
        hoops.append(_p('torus', (2 * rx + 2.6, 2 * ry + 2.6, 2.6), (0, h / 2, z)))
    lid = [_p('cylinder', (w - 10, h - 10, 3), (0, h / 2, H + 0.5))]
    rim = [_p('torus', (w - 5, h - 5, 3), (0, h / 2, H))]
    return [{'name': 'staves', 'c': 'stave', 'remesh': 1.5, 'prims': body},
            {'name': 'hoops', 'c': 'hoop', 'prims': hoops},
            {'name': 'rim', 'c': 'stave', 'prims': rim},
            {'name': 'lid', 'c': 'lid', 'prims': lid}]


def crate(w, h, tall, rng):
    """Plank crate: dark frame slats on the front and the lid edge, one diagonal brace."""
    H = tall * rng.uniform(0.9, 1.0)
    box = [_p('box', (w - 2, h - 2, H), (0, h / 2, H / 2))]
    s = 6.0
    fy = 1.5  # front face slats stick out of y = 1 towards y = 0
    slats = [_p('box', (w, 3, s), (0, fy, s / 2)), _p('box', (w, 3, s), (0, fy, H - s / 2)),
             _p('box', (s, 3, H), (-w / 2 + s / 2, fy, H / 2)), _p('box', (s, 3, H), (w / 2 - s / 2, fy, H / 2))]
    diag = math.hypot(w - 2 * s, H - 2 * s)
    ang = math.degrees(math.atan2(H - 2 * s, w - 2 * s)) * (1 if rng.random() < 0.5 else -1)
    slats.append(_p('box', (diag, 2.5, 5), (0, fy, H / 2), (0, -ang, 0)))
    top = H + 0.6
    slats += [_p('box', (w, s, 3), (0, s / 2, top)), _p('box', (w, s, 3), (0, h - s / 2, top)),
              _p('box', (s, h, 3), (-w / 2 + s / 2, h / 2, top)), _p('box', (s, h, 3), (w / 2 - s / 2, h / 2, top))]
    return [{'name': 'box', 'c': 'wood', 'prims': box}, {'name': 'slats', 'c': 'slat', 'prims': slats}]


def kelp(w, h, tall, rng):
    """Low kelp bed under dense leaf blades: tall at the front, short at the back, so the canopy
    (drawn above the fighters) barely spills past the rect's top edge."""
    bed = [_p('sphere', (w - 4, h - 4, 14), (0, h / 2, 0))]
    for x, y in _spots(rng, 5, -w / 2 + 30, w / 2 - 30, 26, h - 26, 26):
        bed.append(_p('sphere', (34, 28, 14), (x, y, 3)))
    leaves = ([], [])
    bulbs = []
    inset = 16
    for i, (x, y) in enumerate(_spots(rng, int(w * h / 420), -w / 2 + inset, w / 2 - inset, inset, h - inset, 9)):
        front = 1 - y / h  # 1 at the front edge
        length = (26 + (tall - 32) * front) * rng.uniform(0.85, 1.05)
        out = math.degrees(math.atan2(y - h / 2, x)) + rng.uniform(-35, 35)
        tilt = rng.uniform(8, 30 - 14 * front)
        leaf, _ = _axis_prim('sphere', (3.5, rng.uniform(13, 17)), (x, y, 0), length, tilt, out)
        leaves[i % 2].append(leaf)
        if i % 3 == 0:
            _, at = _axis_prim('sphere', (1, 1), (x, y, 0), length * 0.35, tilt, out)
            bulbs.append(_p('sphere', (6, 6, 6), at))
    return [{'name': 'bed', 'c': 'bed', 'remesh': 3.0, 'prims': bed},
            {'name': 'leaves', 'c': 'kelp', 'prims': leaves[0]},
            {'name': 'leavesB', 'c': 'kelpB', 'prims': leaves[1]},
            {'name': 'bulbs', 'c': 'bulb', 'prims': bulbs}]


MAKERS = {'wall': wall, 'barrel': barrel, 'crate': crate, 'kelp': kelp}


def parts_for(shape, rng):
    return MAKERS[shape['kind']](shape['w'], shape['h'], shape['tall'], rng)
