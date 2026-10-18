"""Rigid puppet animation for 3D sprites (TASKS-LOOP §2.11): idle 4 / run 6 / attack 3 / hurt 1.

Parts are turned and nudged about their spec pivots; there is no skinning. A pose is a set of
deltas on top of each part's rest transform: `loc` (px, parent space), `rot` (degrees, added to
the rest Euler) and `scale` (multiplied). Model-local motion lives on the body part (the model
faces -y), so it turns with the direction; the root only carries the direction, the ground offset
and the hurt squash.

Styles: `biped` steps its feet and swings its arms, `blob` hops with squash and stretch, `hover`
floats and tilts. A spec's `anim` may override the amplitudes (`amp`), the parts that play each
role (`roles`) and the attacking arm (`attackArm`: r | l | both | none).

After posing, `ground()` moves the root so the lowest outline vertex sits on the feet line:
exactly (biped), or only lifted when it would sink below it (blob and hover may leave the ground).
"""
import math

import bpy
import numpy as np
from mathutils import Vector

from . import cam

ANIMS = [('idle', 4), ('run', 6), ('attack', 3), ('hurt', 1)]

# Lowest outline vertex, in px above the origin on screen. -1.5 puts the bottom outline row at
# y = 113 of the 128 px cell (the feet line is 112; the outline adds the rest).
GROUND_UP = -1.5

ROLES = {
    'body': ['body'], 'head': ['head'],
    'armR': ['arm_r'], 'armL': ['arm_l'],
    'footR': ['foot_r', 'leg_r'], 'footL': ['foot_l', 'leg_l'],
    'earR': ['ear_r'], 'earL': ['ear_l'], 'tail': ['tail'],
}

AMP = {
    'biped': {'bob': 2.5, 'step': 6.0, 'lift': 4.0, 'swing': 45, 'lean': 12, 'breathe': 0.02,
              'earSway': 5, 'earDrag': 16, 'tailWag': 16, 'windup': 60, 'strike': 105, 'twist': 18,
              'lunge': 8, 'squash': 0.12, 'float': 0, 'hop': 0},
    'blob': {'bob': 0, 'step': 0, 'lift': 0, 'swing': 35, 'lean': 10, 'breathe': 0.04,
             'earSway': 6, 'earDrag': 16, 'tailWag': 16, 'windup': 50, 'strike': 90, 'twist': 12,
             'lunge': 6, 'squash': 0.16, 'float': 0, 'hop': 2.5},
    'hover': {'bob': 1.0, 'step': 0, 'lift': 0, 'swing': 20, 'lean': 14, 'breathe': 0.02,
              'earSway': 8, 'earDrag': 18, 'tailWag': 18, 'windup': 50, 'strike': 90, 'twist': 14,
              'lunge': 6, 'squash': 0.1, 'float': 2.0, 'hop': 0},
}


class Pose:
    def __init__(self):
        self.parts = {}

    def add(self, name, loc=(0, 0, 0), rot=(0, 0, 0), scale=(1, 1, 1)):
        if name is None:
            return
        p = self.parts.setdefault(name, [Vector(), Vector(), Vector((1, 1, 1))])
        p[0] += Vector(loc)
        p[1] += Vector(rot)
        p[2] = Vector([a * b for a, b in zip(p[2], scale)])


class Puppet:
    def __init__(self, spec, root, objs):
        anim = spec.get('anim', {})
        self.style = anim.get('style', 'biped')
        self.amp = {**AMP[self.style], **anim.get('amp', {})}
        self.attack_arm = anim.get('attackArm', 'r')
        self.root = root
        self.objs = objs
        roles = {**ROLES, **{k: [v] if isinstance(v, str) else v for k, v in anim.get('roles', {}).items()}}
        self.role = {k: next((n for n in names if n in objs), None) for k, names in roles.items()}
        if self.role['body'] is None:
            self.role['body'] = next(iter(objs))
        self.rest = {n: (ob.location.copy(), Vector(ob.rotation_euler), ob.scale.copy())
                     for n, ob in objs.items()}
        self.root_scale = root.scale.copy()
        self.hulls = [ob for ob in bpy.context.scene.objects if ob.name.endswith('_hull')]
        self.base_z = 0.0

    # -- applying -------------------------------------------------------------------------
    def apply(self, pose, root_scale=(1, 1, 1)):
        for n, ob in self.objs.items():
            loc, rot, sc = self.rest[n]
            d = pose.parts.get(n)
            if d:
                ob.location = loc + d[0]
                ob.rotation_euler = [r + math.radians(a) for r, a in zip(rot, d[1])]
                ob.scale = Vector([a * b for a, b in zip(sc, d[2])])
            else:
                ob.location, ob.rotation_euler, ob.scale = loc, rot, sc
        self.root.scale = Vector([a * b for a, b in zip(self.root_scale, root_scale)])

    def lowest_up(self):
        """Lowest outline vertex as screen-up px (y·sin(pitch) + z·cos(pitch))."""
        bpy.context.view_layer.update()
        p = math.radians(cam.PITCH_DEG)
        axis = np.array([0.0, math.sin(p), math.cos(p)])
        lo = math.inf
        for ob in self.hulls:
            n = len(ob.data.vertices)
            co = np.empty(n * 3, dtype=np.float64)
            ob.data.vertices.foreach_get('co', co)
            m = np.array(ob.matrix_world)
            world = co.reshape(n, 3) @ m[:3, :3].T + m[:3, 3]
            lo = min(lo, float((world @ axis).min()))
        return lo

    def _lift(self, dz_up):
        self.root.location.z += dz_up / math.cos(math.radians(cam.PITCH_DEG))

    def settle(self):
        """Rest pose on the ground for the current direction (call after turning the root)."""
        self.apply(Pose())
        self.root.location.z = 0.0
        self._lift(GROUND_UP - self.lowest_up())
        self.base_z = self.root.location.z

    def ground(self, air=0.0):
        """Exact snap for walkers; floaters keep `air` px above the rest height but never sink."""
        self.root.location.z = self.base_z
        if self.style == 'biped':
            self._lift(GROUND_UP - self.lowest_up())
            return
        self._lift(air)
        low = self.lowest_up()
        if low < GROUND_UP:
            self._lift(GROUND_UP - low)

    def pose(self, anim, i):
        """Pose frame i of anim, then ground it."""
        n = dict(ANIMS)[anim]
        t = 2 * math.pi * i / n
        pose, root_scale, air = getattr(self, '_' + anim)(t, i)
        self.apply(pose, root_scale)
        self.ground(air + self.amp['float'])

    # -- poses (model faces -y; rot x > 0 tips a part's top forward) ----------------------------
    def _ears(self, pose, sway=0.0, drag=0.0):
        pose.add(self.role['earR'], rot=(-drag, sway, 0))
        pose.add(self.role['earL'], rot=(-drag, -sway, 0))

    def _arms(self, pose, r=(0, 0, 0), l=(0, 0, 0)):
        pose.add(self.role['armR'], rot=r)
        pose.add(self.role['armL'], rot=l)

    def _idle(self, t, i):
        a = self.amp
        pose = Pose()
        s = math.sin(t)
        b = a['breathe'] * s
        pose.add(self.role['body'], scale=(1 - b / 2, 1 - b / 2, 1 + b))
        pose.add(self.role['head'], rot=(0, 2 * math.cos(t), 0))
        self._arms(pose, r=(0, -3 * s, 0), l=(0, 3 * s, 0))
        self._ears(pose, sway=a['earSway'] * math.cos(t))
        pose.add(self.role['tail'], rot=(0, 0, a['tailWag'] * 0.5 * s))
        return pose, (1, 1, 1), a['bob'] * s if self.style == 'hover' else 0.0

    def _run(self, t, i):
        a = self.amp
        pose = Pose()
        s, c = math.sin(t), math.cos(t)
        body = a['bob'] * abs(c)
        pose.add(self.role['body'], loc=(0, 0, body), rot=(a['lean'], 0, 0))
        pose.add(self.role['head'], rot=(-a['lean'] * 0.4, 0, 0))
        for name, ph in ((self.role['footR'], 0.0), (self.role['footL'], math.pi)):
            fs, fc = math.sin(t + ph), math.cos(t + ph)
            # forward (-y) while lifted, planted on the way back; planted feet ignore the body bob
            pose.add(name, loc=(0, -a['step'] * fs, a['lift'] * max(0.0, fc) - body), rot=(-12 * fs, 0, 0))
        self._arms(pose, r=(a['swing'] * s, 0, 0), l=(-a['swing'] * s, 0, 0))
        self._ears(pose, sway=2 * c, drag=a['earDrag'] * (0.6 + 0.4 * abs(c)))
        pose.add(self.role['tail'], rot=(0, 0, a['tailWag'] * s))
        root, air = (1, 1, 1), 0.0
        if self.style == 'blob':
            k = 0.07 * math.cos(2 * t)
            root = (1 - k / 2, 1 - k / 2, 1 + k)
            air = a['hop'] * abs(s)
        elif self.style == 'hover':
            air = a['bob'] * math.sin(2 * t)
        return pose, root, air

    def _strike_arms(self, pose, deg, other, stretch=1.0):
        """Attacking arm(s) to `deg` (stretched along their length), the other one to `other`."""
        arm = self.attack_arm
        if arm == 'none':
            return
        for side, role in (('r', 'armR'), ('l', 'armL')):
            hit = arm in (side, 'both')
            pose.add(self.role[role], rot=(deg if hit else other, 0, 0),
                     scale=(1, 1, stretch) if hit else (1, 1, 1))

    def _attack(self, t, i):
        """0 windup (arm back, body coils), 1 strike (lunge, arm thrown forward), 2 recover."""
        a = self.amp
        pose = Pose()
        twist = a['twist'] * (-1 if self.attack_arm == 'l' else 0 if self.attack_arm == 'both' else 1)
        body = self.role['body']
        if i == 0:
            pose.add(body, rot=(-a['lean'] * 0.2, 0, twist))
            self._strike_arms(pose, a['windup'], -15)
            self._ears(pose, drag=-4)
            pose.add(self.role['tail'], rot=(0, 0, a['tailWag'] * 0.5))
            pose.add(self.role['footL'], loc=(0, 1.5, 0))
        elif i == 1:
            pose.add(body, loc=(0, -a['lunge'], 0), rot=(a['lean'] * 1.5, 0, -twist))
            pose.add(self.role['head'], rot=(-4, 0, 0))
            self._strike_arms(pose, -a['strike'], 25, stretch=1.35)
            self._ears(pose, sway=4, drag=a['earDrag'])
            pose.add(self.role['tail'], rot=(0, 0, -a['tailWag']))
            # the trailing foot stays planted behind while the body lunges
            pose.add(self.role['footR'], loc=(0, a['lunge'] * 0.8, 0))
            pose.add(self.role['footL'], loc=(0, -1.0, 0))
        else:
            pose.add(body, loc=(0, -a['lunge'] * 0.4, 0), rot=(a['lean'] * 0.5, 0, -twist * 0.3))
            self._strike_arms(pose, -a['strike'] * 0.5, 8, stretch=1.1)
            self._ears(pose, sway=2, drag=a['earDrag'] * 0.5)
            pose.add(self.role['footR'], loc=(0, a['lunge'] * 0.3, 0))
        return pose, (1, 1, 1), 0.0

    def _hurt(self, t, i):
        """Knocked back and squashed; the face switches to the hurt set in the renderer."""
        a = self.amp
        pose = Pose()
        q = a['squash']
        pose.add(self.role['body'], loc=(0, 1.5, 0), rot=(-8, 0, 0))
        pose.add(self.role['head'], rot=(-6, 0, 0))
        self._arms(pose, r=(-20, -30, 0), l=(-20, 30, 0))  # flung outward
        self._ears(pose, sway=a['earSway'] * 3, drag=-6)
        return pose, (1 + q * 0.6, 1 + q * 0.6, 1 - q), 0.0
