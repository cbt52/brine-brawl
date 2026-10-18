"""Toon materials for 3D sprites (TASKS-LOOP §2.11).

Every surface is a flat palette colour pushed through Emission, so with the Standard view
transform the base band comes out as the exact palette hex. Lighting only picks the band:
Diffuse -> Shader to RGB -> constant ColorRamp (shadow | base), plus a highlight band on
lit up-facing surfaces and a thin white rim at 35 %.
"""
import colorsys

import bpy

OUTLINE_HEX = '#1b1b2f'
# Shader-to-RGB value above which a surface is "lit" (sun strength 1 gives cos/pi, so 0.1 lights
# surfaces within ~72 degrees of the sun: camera-facing fronts lit, sides and undersides shaded)
LIT_THRESHOLD = 0.1
HIGHLIGHT_NZ = 0.85  # world normal z above which a lit surface gets the highlight band
RIM_FACING = 0.55  # Layer Weight facing above which the rim kicks in
RIM_MIX = 0.55
# ART feedback (T48): teal kits on teal ground need a stronger rim, and it belongs upper left only
# (camera space: -x = screen left, +z = up), not as a halo around the whole silhouette.
RIM_DIR = (-0.55, 0.0, 0.84)
RIM_DOT_MIN = 0.05


def hex_rgb(h):
    h = h.lstrip('#')
    return tuple(int(h[i:i + 2], 16) / 255 for i in (0, 2, 4))


def srgb_to_linear(c):
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


def lin4(rgb):
    return (*(srgb_to_linear(c) for c in rgb), 1.0)


def shadow_rgb(rgb):
    """Base colour at 0.68x brightness, hue shifted -8 degrees. Scaled in HSV, not HLS: HLS
    gives pale colours full saturation, so cream would darken into orange."""
    h, s, v = colorsys.rgb_to_hsv(*rgb)
    return colorsys.hsv_to_rgb((h - 8 / 360) % 1.0, s, v * 0.68)


def highlight_rgb(rgb):
    """Base colour at +12 % lightness (capped below pure white)."""
    h, l, s = colorsys.rgb_to_hls(*rgb)
    return colorsys.hls_to_rgb(h, min(0.97, l + 0.12), s)


def _nodes(mat):
    mat.use_nodes = True
    nt = mat.node_tree
    for n in list(nt.nodes):
        nt.nodes.remove(n)
    return nt


def _emit(nt, color_socket):
    em = nt.nodes.new('ShaderNodeEmission')
    em.inputs['Strength'].default_value = 1.0
    nt.links.new(color_socket, em.inputs['Color'])
    out = nt.nodes.new('ShaderNodeOutputMaterial')
    nt.links.new(em.outputs['Emission'], out.inputs['Surface'])


def _math(nt, op, a, b):
    m = nt.nodes.new('ShaderNodeMath')
    m.operation = op
    for i, v in enumerate((a, b)):
        if isinstance(v, (int, float)):
            m.inputs[i].default_value = v
        else:
            nt.links.new(v, m.inputs[i])
    return m.outputs[0]


def _mix(nt, fac, a, b):
    mx = nt.nodes.new('ShaderNodeMix')
    mx.data_type = 'RGBA'
    ins = {s.identifier: s for s in mx.inputs}
    nt.links.new(fac, ins['Factor_Float'])
    for sock, v in ((ins['A_Color'], a), (ins['B_Color'], b)):
        if isinstance(v, tuple):
            sock.default_value = v
        else:
            nt.links.new(v, sock)
    return next(s for s in mx.outputs if s.identifier == 'Result_Color')


def _up_left(nt, geo):
    """1 where the surface normal points up and to the left (camera space), else 0."""
    nrm = nt.nodes.new('ShaderNodeVectorMath')
    nrm.operation = 'NORMALIZE'
    nt.links.new(geo.outputs['Normal'], nrm.inputs[0])
    dot = nt.nodes.new('ShaderNodeVectorMath')
    dot.operation = 'DOT_PRODUCT'
    nt.links.new(nrm.outputs['Vector'], dot.inputs[0])
    dot.inputs[1].default_value = RIM_DIR
    return _math(nt, 'GREATER_THAN', dot.outputs['Value'], RIM_DOT_MIN)


def toon(name, hex_color, workbench=False):
    """3-band toon material for one palette colour."""
    rgb = hex_rgb(hex_color)
    mat = bpy.data.materials.new(name)
    mat.diffuse_color = lin4(rgb)
    if workbench:
        return mat
    nt = _nodes(mat)
    diffuse = nt.nodes.new('ShaderNodeBsdfDiffuse')
    diffuse.inputs['Color'].default_value = (1, 1, 1, 1)
    s2r = nt.nodes.new('ShaderNodeShaderToRGB')
    nt.links.new(diffuse.outputs['BSDF'], s2r.inputs['Shader'])
    bw = nt.nodes.new('ShaderNodeRGBToBW')
    nt.links.new(s2r.outputs['Color'], bw.inputs['Color'])

    ramp = nt.nodes.new('ShaderNodeValToRGB')
    ramp.color_ramp.interpolation = 'CONSTANT'
    ramp.color_ramp.elements[0].position = 0.0
    ramp.color_ramp.elements[0].color = lin4(shadow_rgb(rgb))
    ramp.color_ramp.elements[1].position = LIT_THRESHOLD
    ramp.color_ramp.elements[1].color = lin4(rgb)
    nt.links.new(bw.outputs['Val'], ramp.inputs['Fac'])

    geo = nt.nodes.new('ShaderNodeNewGeometry')
    sep = nt.nodes.new('ShaderNodeSeparateXYZ')
    nt.links.new(geo.outputs['Normal'], sep.inputs[0])
    up = _math(nt, 'GREATER_THAN', sep.outputs['Z'], HIGHLIGHT_NZ)
    lit = _math(nt, 'GREATER_THAN', bw.outputs['Val'], LIT_THRESHOLD)
    hl = _math(nt, 'MULTIPLY', up, lit)
    banded = _mix(nt, hl, ramp.outputs['Color'], lin4(highlight_rgb(rgb)))

    lw = nt.nodes.new('ShaderNodeLayerWeight')
    lw.inputs['Blend'].default_value = 0.5
    rim = _math(nt, 'GREATER_THAN', lw.outputs['Facing'], RIM_FACING)
    rim = _math(nt, 'MULTIPLY', rim, _up_left(nt, geo))
    rim = _math(nt, 'MULTIPLY', rim, RIM_MIX)
    _emit(nt, _mix(nt, rim, banded, (1, 1, 1, 1)))
    return mat


def flat(name, hex_color, workbench=False):
    """Unlit emissive colour (eyes, glints, outline)."""
    mat = bpy.data.materials.new(name)
    mat.diffuse_color = lin4(hex_rgb(hex_color))
    if not workbench:
        nt = _nodes(mat)
        rgb = nt.nodes.new('ShaderNodeRGB')
        rgb.outputs[0].default_value = lin4(hex_rgb(hex_color))
        _emit(nt, rgb.outputs[0])
    return mat


def outline(workbench=False):
    """Inverted-hull material: back faces only, never casts a shadow."""
    mat = flat('outline', OUTLINE_HEX, workbench)
    mat.use_backface_culling = True
    if hasattr(mat, 'shadow_method'):  # legacy EEVEE
        mat.shadow_method = 'NONE'
    return mat
