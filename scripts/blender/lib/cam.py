"""Scene, camera, light and colour management for 3D sprites (TASKS-LOOP §2.11).

Model space: 1 unit = 1 px at 1x, z up, the model faces -Y (towards the camera) at 0 degrees.
The camera is orthographic, pitched 35 degrees down from screen-south, and frames a 128-unit
square so the world origin (the feet) lands on y = 112 of the 128 px cell.
"""
import math

import bpy

PITCH_DEG = 35
CELL = 128
FEET_Y = 112
CAM_DIST = 600
SUN_TILT_DEG = 25  # from straight down towards the camera, centred left-to-right

DIR_ANGLES = {'S': 0, 'SE': 45, 'E': 90, 'NE': 135, 'N': 180, 'NW': 225, 'W': 270, 'SW': 315}
DIRS5 = ['S', 'SE', 'E', 'NE', 'N']
DIRS8 = ['S', 'SE', 'E', 'NE', 'N', 'NW', 'W', 'SW']


def set_engine(scene, engine):
    if engine == 'workbench':
        scene.render.engine = 'BLENDER_WORKBENCH'
        sh = scene.display.shading
        sh.light = 'FLAT'
        sh.color_type = 'MATERIAL'
        sh.show_backface_culling = True
        return 'workbench'
    for name in ('BLENDER_EEVEE_NEXT', 'BLENDER_EEVEE'):
        try:
            scene.render.engine = name
            break
        except TypeError:
            continue
    ev = scene.eevee
    ev.taa_render_samples = 16
    if hasattr(ev, 'use_gtao'):
        ev.use_gtao = False
    if hasattr(ev, 'use_bloom'):
        ev.use_bloom = False
    return 'eevee'


def setup(res=256, engine='eevee'):
    """Fresh scene with camera, sun and exact-colour output. Returns the engine used."""
    scene = bpy.context.scene
    for ob in list(scene.objects):
        bpy.data.objects.remove(ob, do_unlink=True)
    used = set_engine(scene, engine)

    r = scene.render
    r.resolution_x = r.resolution_y = res
    r.resolution_percentage = 100
    r.film_transparent = True
    r.filter_size = 1.0
    r.dither_intensity = 0.0
    r.image_settings.file_format = 'PNG'
    r.image_settings.color_mode = 'RGBA'
    r.image_settings.color_depth = '8'

    vs = scene.view_settings
    vs.view_transform = 'Standard'
    vs.look = 'None'
    vs.exposure = 0.0
    vs.gamma = 1.0
    scene.display_settings.display_device = 'sRGB'
    scene.sequencer_colorspace_settings.name = 'sRGB'

    world = bpy.data.worlds.new('void')
    world.color = (0, 0, 0)
    world.use_nodes = False
    scene.world = world

    cam_data = bpy.data.cameras.new('cam')
    cam_data.type = 'ORTHO'
    cam_data.ortho_scale = CELL
    cam_data.shift_y = (CELL / 2 - (CELL - FEET_Y)) / CELL
    cam_data.clip_start = 1
    cam_data.clip_end = CAM_DIST * 2
    cam = bpy.data.objects.new('cam', cam_data)
    p = math.radians(PITCH_DEG)
    cam.location = (0, -CAM_DIST * math.cos(p), CAM_DIST * math.sin(p))
    cam.rotation_euler = (math.radians(90 - PITCH_DEG), 0, 0)
    scene.collection.objects.link(cam)
    scene.camera = cam

    sun_data = bpy.data.lights.new('sun', 'SUN')
    sun_data.energy = 1.0
    sun_data.angle = math.radians(1.0)
    sun = bpy.data.objects.new('sun', sun_data)
    sun.rotation_euler = (math.radians(SUN_TILT_DEG), 0, 0)  # shines towards +Y, from the camera side
    scene.collection.objects.link(sun)
    return used


def dirs_for(n):
    return DIRS8 if n == 8 else DIRS5
