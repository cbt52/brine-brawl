"""Loot + pilot projectile models for `render_props.py` (T45, TASKS-LOOP §2.11).

Model space: 1 unit = 1 world unit, x right, -y towards the camera, z up; every model is centred
on the origin, which lands in the middle of its frame. Projectiles point along +x (the client
turns the sprite to the flight direction). Fighter-style part lists for `build.build`.
Loot is gameplay, not arena: it may be saturated so it pops off the muted sand.
"""
import math

PAL = {
    'wood': '#9A6338', 'woodD': '#6E4426', 'band': '#E2B85C', 'lock': '#FFD23F',
    'gold': '#FFC93C', 'goldD': '#D9992B',
    'heal': '#6FE38A', 'cross': '#FFFFFF',
    'ult': '#7FD9FF', 'ultC': '#E8FAFF',
    'volt': '#FFE14D', 'voltC': '#FFF8D0',
    'bub': '#BDEFF5', 'shine': '#FFFFFF',
    'drop': '#4FB4F0', 'dropC': '#BCE6FF',
    'taffy': '#E8C7A0', 'taffyD': '#D4A77C',
}


def _p(kind, size, at, rot=(0, 0, 0)):
    return {'type': kind, 'size': [float(s) for s in size], 'at': [float(a) for a in at], 'rot': list(rot)}


def chest():
    """Squat treasure chest: plank body, rounded lid, gold straps and a lock plate."""
    w, d, h = 46, 28, 18
    body = [_p('box', (w, d, h), (0, 0, -6))]
    lid = [_p('cylinder', (h * 0.9, d, w), (0, 0, 3), (0, 90, 0))]
    straps = []
    for x in (-w * 0.3, w * 0.3):
        straps.append(_p('box', (5, d + 2, h + 1), (x, 0, -6)))
        straps.append(_p('cylinder', (h * 0.9 + 2, d + 2, 5), (x, 0, 3), (0, 90, 0)))
    lock = [_p('box', (9, 4, 10), (0, -d / 2 - 1, -1)), _p('sphere', (4, 3, 4), (0, -d / 2 - 3, -2))]
    return [
        {'name': 'body', 'c': 'woodD', 'remesh': 1.2, 'prims': body},
        {'name': 'lid', 'c': 'wood', 'remesh': 1.2, 'prims': lid},
        {'name': 'straps', 'c': 'band', 'prims': straps},
        {'name': 'lock', 'c': 'lock', 'prims': lock},
    ]


FACE = [-35, 0, 0]  # part rot: stands an xz-plane design up square to the 35-degree camera


def coin():
    """A fat doubloon facing the camera, tipped back a little, with a raised rim and a wave emblem."""
    tip = [40, 0, 0]  # disc axis (z) towards the camera, tipped up so a sliver of the edge shows
    r = 22
    return [
        {'name': 'disc', 'c': 'gold', 'rot': tip, 'prims': [_p('cylinder', (r, r, 5), (0, 0, 0))]},
        {'name': 'rim', 'c': 'goldD', 'rot': tip, 'prims': [_p('torus', (r, r, 3), (0, 0, 2.4))]},
        {'name': 'emblem', 'c': 'goldD', 'rot': tip, 'prims': [_p('sphere', (9, 9, 4), (0, 0, 2.8))]},
    ]


def heal():
    """Round green orb with a chunky white cross on the camera side."""
    cross = [_p('box', (5, 3, 13), (0, -10, 0)), _p('box', (13, 3, 5), (0, -10, 0))]
    return [
        {'name': 'orb', 'c': 'heal', 'prims': [_p('sphere', (22, 22, 22), (0, 0, 0))]},
        {'name': 'cross', 'c': 'cross', 'rot': FACE, 'remesh': 0.8, 'prims': cross},
    ]


def _toward(a_deg):
    """Prim rot turning +z towards angle a in the xz plane (0 = +x, 90 = +z)."""
    a = math.radians(a_deg)
    return (0, math.degrees(math.atan2(math.cos(a), math.sin(a))), 0)


def ult():
    """Four-point star (ult charge) around a pale core, square to the camera."""
    pts = []
    for k, ln in ((0, 13), (90, 13), (180, 13), (270, 13)):
        a = math.radians(k)
        pts.append(_p('cone', (13, 7, ln), (math.cos(a) * (ln / 2 + 3), 0, math.sin(a) * (ln / 2 + 3)), _toward(k)))
    pts.append(_p('sphere', (14, 8, 14), (0, 0, 0)))
    return [
        {'name': 'star', 'c': 'ult', 'rot': FACE, 'remesh': 0.8, 'prims': pts},
        {'name': 'core', 'c': 'ultC', 'rot': FACE, 'prims': [_p('sphere', (6, 3, 6), (0, -3.5, 0))]},
    ]


def bolt():
    """Zig-zag spark pointing +x: three slanted slabs and an arrow tip, a pale core streak."""
    segs = [(-12, 2, 14, -25), (0, 0, 14, 35), (12, -2, 14, -25)]
    slabs = [_p('box', (ln + 3, 4, 9), (x, 0, z), (0, ang, 0)) for x, z, ln, ang in segs]
    slabs.append(_p('cone', (11, 4, 10), (22, 0, -3), _toward(0)))
    core = [_p('box', (ln - 4, 2, 2), (x, -2.5, z), (0, ang, 0)) for x, z, ln, ang in segs]
    return [
        {'name': 'bolt', 'c': 'volt', 'rot': FACE, 'remesh': 0.7, 'prims': slabs},
        {'name': 'core', 'c': 'voltC', 'rot': FACE, 'prims': core},
    ]


def bubble():
    """Soap bubble: pale aqua ball with two white glints top-left."""
    ball = [_p('sphere', (24, 24, 24), (0, 0, 0))]
    glint = [_p('sphere', (7, 3, 4.5), (-6, -6, 9), (-35, 0, 25)), _p('sphere', (3, 2, 3), (-1.5, -7, 9.5))]
    return [
        {'name': 'ball', 'c': 'bub', 'prims': ball},
        {'name': 'glint', 'c': 'shine', 'prims': glint},
    ]


def drop():
    """Water drop flying +x: round head, tapered tail behind, a pale highlight."""
    body = [_p('sphere', (16, 16, 16), (4, 0, 0)), _p('cone', (15, 15, 16), (-7, 0, 0), _toward(180))]
    hi = [_p('sphere', (5, 2.5, 4), (5, -7.5, 3), (-55, 0, 0))]
    return [
        {'name': 'drop', 'c': 'drop', 'remesh': 0.8, 'prims': body},
        {'name': 'hi', 'c': 'dropC', 'prims': hi},
    ]


def fist():
    """Stretchy taffy fist punching +x: a round mitt, four knuckle bumps and a tucked thumb."""
    mitt = [_p('sphere', (24, 22, 22), (0, 0, 0))]
    for i, z in enumerate((6.5, 2.2, -2.2, -6.5)):
        mitt.append(_p('sphere', (8, 9, 6), (10.5, -2 - (i % 2), z)))
    thumb = [_p('capsule', (7, 7, 12), (3, -10, -3), (0, 70, 0))]
    cuff = [_p('cylinder', (14, 14, 6), (-11, 0, 0), (0, 90, 0))]
    return [
        {'name': 'mitt', 'c': 'taffy', 'remesh': 0.9, 'prims': mitt},
        {'name': 'thumb', 'c': 'taffy', 'prims': thumb},
        {'name': 'cuff', 'c': 'taffyD', 'prims': cuff},
    ]


MODELS = {
    'chest': chest, 'coin': coin, 'heal': heal, 'ult': ult,
    'bolt': bolt, 'bubble': bubble, 'drop': drop, 'fist': fist,
}
