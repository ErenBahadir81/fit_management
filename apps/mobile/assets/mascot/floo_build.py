"""
Floo — FitFloow's mascot, built and rendered in Blender.

The whole point of this file is that the render lands in the SAME coordinate space the app's SVG
already uses (a 200 x 250 viewBox), so the rendered body can sit underneath the existing animated
face without moving a single face constant.

    SVG (x, y)  ->  Blender (X, Z) = ((x - 100) / 100, (250 - y) / 100)

An ORTHOGRAPHIC camera is what makes that true: no perspective divergence, so the silhouette in the
PNG is exactly the silhouette the vector layout was designed around.

Run:  blender --background --python floo_build.py -- --out DIR [--fast]
"""

import math
import os
import sys

import bpy
from mathutils import Vector

# ─────────────────────────────────────────────────────────────────────────────
# Brand palette. sRGB hex from the app's FLOO_COLORS, converted to linear for Cycles.
# The committed floo-body.png was rendered violet and then recoloured to Floo blue with the same
# HSL transform FLOO_COLORS went through (see `src/mascot/moods.ts`); a fresh render from these
# values is the same character in the same blue, give or take the shading of the transform.
# ─────────────────────────────────────────────────────────────────────────────

def srgb_to_linear(c: float) -> float:
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


def hex_rgba(h: str, a: float = 1.0):
    h = h.lstrip("#")
    r, g, b = (int(h[i:i + 2], 16) / 255.0 for i in (0, 2, 4))
    return (srgb_to_linear(r), srgb_to_linear(g), srgb_to_linear(b), a)


BODY_LIGHT = hex_rgba("#93D9F9")
BODY_MID = hex_rgba("#69C8F1")
BODY_DEEP = hex_rgba("#44A1CD")
SCARF = hex_rgba("#F5A524")
SCARF_ALT = hex_rgba("#FFF0D6")
BOOT = hex_rgba("#F5A524")
BOOT_DARK = hex_rgba("#A6650A")

# ─────────────────────────────────────────────────────────────────────────────
# Geometry constants, in the mapped space above.
# ─────────────────────────────────────────────────────────────────────────────

R = 0.665                 # body radius            (SVG 66.5)
CZ = 1.02                 # body centre height     (SVG y 148)
BOT = CZ - R              # 0.355                  (SVG y 214.5)
TIP = 2.00                # crown tip              (SVG y 50)
CROWN = TIP - CZ          # 0.98

# The knit collar sits just under the mouth (mouth is z 0.98) and hugs inward as it drops.
SCARF_Z0, SCARF_Z1 = 0.705, 0.862
LEG_X = 0.22
BOOT_Z = 0.205

# ─────────────────────────────────────────────────────────────────────────────
# Silhouette. The crown is a cubic Bezier, not a power curve: a teardrop needs nearly straight
# shoulders that pull into a small rounded point, and an exponent can give one or the other but
# never both. v1 used (1-s^2)^0.6 and rendered a convincing egg.
# ─────────────────────────────────────────────────────────────────────────────

CROWN_BEZ = (
    (R, 0.0),                    # waist: tangent-vertical so it meets the hemisphere cleanly
    (R * 1.00, CROWN * 0.40),    # hold the width — full shoulders
    (R * 0.27, CROWN * 0.945),   # slim taper, apex still soft — between v2's spike and v3's dome
    (0.0, CROWN),                # tip
)


def bez(p0, p1, p2, p3, t):
    mt = 1.0 - t
    a, b, c, d = mt ** 3, 3 * mt * mt * t, 3 * mt * t * t, t ** 3
    return (a * p0[0] + b * p1[0] + c * p2[0] + d * p3[0],
            a * p0[1] + b * p1[1] + c * p2[1] + d * p3[1])


def build_profile(steps_low=90, steps_up=150):
    """The full (radius, z) profile, bottom pole to tip. Hemisphere below the waist, Bezier above."""
    prof = [(0.0, BOT)]
    for i in range(1, steps_low + 1):
        z = BOT + (CZ - BOT) * (i / steps_low)
        prof.append((math.sqrt(max(0.0, R * R - (z - CZ) ** 2)), z))
    for i in range(1, steps_up + 1):
        r, dz = bez(*CROWN_BEZ, i / steps_up)
        prof.append((max(0.0, r), CZ + dz))
    return prof


PROFILE = build_profile()


def body_radius(z: float) -> float:
    """Radius of the droplet at height z, by interpolating the profile table."""
    if z <= BOT:
        return 0.0
    if z >= TIP:
        return 0.0
    lo = 0
    hi = len(PROFILE) - 1
    while hi - lo > 1:
        mid = (lo + hi) // 2
        if PROFILE[mid][1] <= z:
            lo = mid
        else:
            hi = mid
    (r0, z0), (r1, z1) = PROFILE[lo], PROFILE[hi]
    if abs(z1 - z0) < 1e-9:
        return r0
    t = (z - z0) / (z1 - z0)
    return r0 + (r1 - r0) * t


# ─────────────────────────────────────────────────────────────────────────────
# Mesh helpers
# ─────────────────────────────────────────────────────────────────────────────

def new_mesh(name, verts, faces, uvs=None):
    me = bpy.data.meshes.new(name)
    me.from_pydata(verts, [], faces)
    me.validate()
    if uvs:
        layer = me.uv_layers.new(name="UVMap")
        for i, uv in enumerate(uvs[:len(layer.data)]):
            layer.data[i].uv = uv
    me.update()
    ob = bpy.data.objects.new(name, me)
    bpy.context.collection.objects.link(ob)
    for p in ob.data.polygons:
        p.use_smooth = True
    return ob


def lathe(name, profile, segments=160, pole_bottom=True, pole_top=True):
    """Revolve a (radius, z) profile — bottom to top — around the Z axis, with UVs.
    u follows the circumference, v the profile, so a stripe texture can run either way."""
    verts, faces, uvs = [], [], []
    rings = []

    bottom_pole = pole_bottom and abs(profile[0][0]) < 1e-6
    top_pole = pole_top and abs(profile[-1][0]) < 1e-6

    bp_idx = tp_idx = None
    if bottom_pole:
        bp_idx = len(verts)
        verts.append((0.0, 0.0, profile[0][1]))
    body = profile[1:-1] if (bottom_pole and top_pole) else (
        profile[1:] if bottom_pole else (profile[:-1] if top_pole else profile))

    for r, z in body:
        ring = []
        for i in range(segments):
            a = 2.0 * math.pi * i / segments
            ring.append(len(verts))
            verts.append((r * math.cos(a), r * math.sin(a), z))
        rings.append(ring)
    if top_pole:
        tp_idx = len(verts)
        verts.append((0.0, 0.0, profile[-1][1]))

    def vv(j):
        return (j + 1) / (len(rings) + 1)

    if bottom_pole and rings:
        for i in range(segments):
            a, b = rings[0][i], rings[0][(i + 1) % segments]
            faces.append((bp_idx, b, a))
            uvs += [(i / segments + 0.5 / segments, 0.0), ((i + 1) / segments, vv(0)), (i / segments, vv(0))]
    for j in range(len(rings) - 1):
        lo, hi = rings[j], rings[j + 1]
        for i in range(segments):
            i2 = (i + 1) % segments
            faces.append((lo[i], lo[i2], hi[i2], hi[i]))
            uvs += [(i / segments, vv(j)), ((i + 1) / segments, vv(j)),
                    ((i + 1) / segments, vv(j + 1)), (i / segments, vv(j + 1))]
    if top_pole and rings:
        last = rings[-1]
        for i in range(segments):
            i2 = (i + 1) % segments
            faces.append((tp_idx, last[i], last[i2]))
            uvs += [(i / segments + 0.5 / segments, 1.0), (i / segments, vv(len(rings) - 1)),
                    ((i + 1) / segments, vv(len(rings) - 1))]
    return new_mesh(name, verts, faces, uvs)


def sweep(name, centreline, half_w, half_t, normal=Vector((0, -1, 0)), taper=None, u_span=1.0):
    """Sweep a ribbon along a polyline — the scarf tails.

    `u_span` puts the texture u axis ALONG the tail, so the same stripe material that bands the
    collar bands the tails across their width. (v1 ran u across the 4-face cross-section, which
    smeared one stripe down the whole length and rendered them as blank white paper.)
    """
    verts, faces, uvs = [], [], []
    m = len(centreline)
    for k, p in enumerate(centreline):
        t = k / (m - 1)
        nxt = centreline[min(k + 1, m - 1)]
        prv = centreline[max(k - 1, 0)]
        tangent = (Vector(nxt) - Vector(prv))
        tangent = tangent.normalized() if tangent.length > 1e-9 else Vector((0, 0, -1))
        side = tangent.cross(normal)
        side = side.normalized() if side.length > 1e-9 else Vector((1, 0, 0))
        up = side.cross(tangent).normalized()
        sc = taper(t) if taper else 1.0
        c = Vector(p)
        for sx, sy in ((-1, -1), (1, -1), (1, 1), (-1, 1)):
            verts.append(tuple(c + side * (half_w * sc * sx) + up * (half_t * sc * sy)))
    for k in range(m - 1):
        a, b = k * 4, (k + 1) * 4
        u0, u1 = (k / (m - 1)) * u_span, ((k + 1) / (m - 1)) * u_span
        for i in range(4):
            i2 = (i + 1) % 4
            faces.append((a + i, a + i2, b + i2, b + i))
            uvs += [(u0, i / 4), (u0, (i + 1) / 4), (u1, (i + 1) / 4), (u1, i / 4)]
    faces.append((0, 3, 2, 1))
    uvs += [(0, 0)] * 4
    a = (m - 1) * 4
    faces.append((a, a + 1, a + 2, a + 3))
    uvs += [(u_span, 0)] * 4
    return new_mesh(name, verts, faces, uvs)


def ellipsoid(name, centre, radii, segments=48, rings=24, flatten_z=None):
    verts, faces, uvs = [], [], []
    for j in range(rings + 1):
        phi = math.pi * (j / rings)
        for i in range(segments):
            th = 2 * math.pi * (i / segments)
            x = centre[0] + radii[0] * math.sin(phi) * math.cos(th)
            y = centre[1] + radii[1] * math.sin(phi) * math.sin(th)
            z = centre[2] + radii[2] * math.cos(phi)
            if flatten_z is not None:
                z = max(z, flatten_z)
            verts.append((x, y, z))
    for j in range(rings):
        for i in range(segments):
            i2 = (i + 1) % segments
            a, b = j * segments, (j + 1) * segments
            faces.append((a + i, a + i2, b + i2, b + i))
            uvs += [(i / segments, j / rings), ((i + 1) / segments, j / rings),
                    ((i + 1) / segments, (j + 1) / rings), (i / segments, (j + 1) / rings)]
    return new_mesh(name, verts, faces, uvs)


def bulge_ring(ob, theta0, amount):
    """Thicken a revolved band near one angle so it reads as wrapped fabric rather than a napkin
    ring. Radial-only and strictly additive, so the band never loses contact with the body."""
    for v in ob.data.vertices:
        x, y, z = v.co
        r = math.hypot(x, y)
        if r < 1e-6:
            continue
        f = 0.5 + 0.5 * math.cos(math.atan2(y, x) - theta0)
        sc = (r + amount * f) / r
        v.co = (x * sc, y * sc, z)
    ob.data.update()


def drape_ring(ob, amount, theta0):
    """Tilt a revolved band into a diagonal drape while keeping it glued to the body.

    Displacing z alone would lift the raised side off the surface (the droplet narrows as it
    climbs), so each vertex is re-seated at the body radius for its NEW height, preserving the
    offset it already had. This is the difference between a scarf and a napkin ring.
    """
    for v in ob.data.vertices:
        x, y, z = v.co
        r = math.hypot(x, y)
        if r < 1e-6:
            continue
        th = math.atan2(y, x)
        off = r - body_radius(z)                  # how far it floated above the surface
        nz = z + amount * math.cos(th - theta0)   # rises one side, dips the other
        nr = body_radius(nz) + off
        v.co = (nr * math.cos(th), nr * math.sin(th), nz)
    ob.data.update()


def subsurf(ob, levels=2):
    m = ob.modifiers.new("Subdivision", "SUBSURF")
    m.levels = levels
    m.render_levels = levels
    return m


# ─────────────────────────────────────────────────────────────────────────────
# Materials
# ─────────────────────────────────────────────────────────────────────────────

def set_in(node, name, value):
    """Set a socket only if this Blender version has it — socket names moved in 4.x/5.x."""
    if name in node.inputs:
        node.inputs[name].default_value = value
        return True
    return False


def principled(name):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    return mat, mat.node_tree, mat.node_tree.nodes.get("Principled BSDF")


def mat_body():
    """Glossy translucent vinyl. Roughness is deliberately NOT mirror-low and the coat is moderate:
    a hard clearcoat over a 3m light blows the whole upper body to white (see v1)."""
    mat, nt, b = principled("Floo Body")
    set_in(b, "Roughness", 0.26)
    set_in(b, "IOR", 1.45)
    set_in(b, "Coat Weight", 0.45)
    set_in(b, "Coat Roughness", 0.12)
    set_in(b, "Subsurface Weight", 0.30)
    set_in(b, "Subsurface Scale", 0.16)
    if "Subsurface Radius" in b.inputs:
        b.inputs["Subsurface Radius"].default_value = (0.42, 0.32, 0.85)
    set_in(b, "Specular IOR Level", 0.5)

    # A vertical ramp from rim-light violet to a deeper base keeps the big form reading in one glance.
    geo = nt.nodes.new("ShaderNodeNewGeometry")
    sep = nt.nodes.new("ShaderNodeSeparateXYZ")
    mapr = nt.nodes.new("ShaderNodeMapRange")
    ramp = nt.nodes.new("ShaderNodeValToRGB")
    mapr.inputs["From Min"].default_value = BOT
    mapr.inputs["From Max"].default_value = TIP
    nt.links.new(geo.outputs["Position"], sep.inputs[0])
    nt.links.new(sep.outputs["Z"], mapr.inputs["Value"])
    nt.links.new(mapr.outputs["Result"], ramp.inputs["Fac"])
    ramp.color_ramp.elements[0].position = 0.0
    ramp.color_ramp.elements[0].color = BODY_DEEP
    ramp.color_ramp.elements[1].position = 0.88
    ramp.color_ramp.elements[1].color = BODY_LIGHT
    ramp.color_ramp.elements.new(0.48).color = BODY_MID
    nt.links.new(ramp.outputs["Color"], b.inputs["Base Color"])
    return mat


def mat_scarf():
    """Knit: chunky stripes around the circumference from the lathe UVs, noise bump for the weave."""
    mat, nt, b = principled("Floo Scarf")
    set_in(b, "Roughness", 0.84)
    set_in(b, "Coat Weight", 0.0)
    set_in(b, "Sheen Weight", 0.5)

    uv = nt.nodes.new("ShaderNodeUVMap")
    uv.uv_map = "UVMap"
    wave = nt.nodes.new("ShaderNodeTexWave")
    wave.wave_type = "BANDS"
    wave.bands_direction = "X"
    wave.wave_profile = "SAW"
    wave.inputs["Scale"].default_value = 5.0
    wave.inputs["Distortion"].default_value = 0.0
    ramp = nt.nodes.new("ShaderNodeValToRGB")
    ramp.color_ramp.interpolation = "CONSTANT"
    ramp.color_ramp.elements[0].position = 0.0
    ramp.color_ramp.elements[0].color = SCARF
    ramp.color_ramp.elements[1].position = 0.5
    ramp.color_ramp.elements[1].color = SCARF_ALT
    nt.links.new(uv.outputs["UV"], wave.inputs["Vector"])
    nt.links.new(wave.outputs["Fac"], ramp.inputs["Fac"])
    nt.links.new(ramp.outputs["Color"], b.inputs["Base Color"])

    noise = nt.nodes.new("ShaderNodeTexNoise")
    noise.inputs["Scale"].default_value = 260.0
    noise.inputs["Detail"].default_value = 2.0
    bump = nt.nodes.new("ShaderNodeBump")
    bump.inputs["Strength"].default_value = 0.4
    nt.links.new(noise.outputs["Fac"], bump.inputs["Height"])
    nt.links.new(bump.outputs["Normal"], b.inputs["Normal"])
    return mat


def mat_boot():
    mat, nt, b = principled("Floo Boot")
    set_in(b, "Base Color", BOOT)
    set_in(b, "Roughness", 0.36)
    set_in(b, "Coat Weight", 0.3)
    set_in(b, "Coat Roughness", 0.18)
    return mat


def mat_sole():
    mat, nt, b = principled("Floo Sole")
    set_in(b, "Base Color", BOOT_DARK)
    set_in(b, "Roughness", 0.58)
    return mat


def mat_leg():
    mat, nt, b = principled("Floo Leg")
    set_in(b, "Base Color", BODY_DEEP)
    set_in(b, "Roughness", 0.30)
    set_in(b, "Coat Weight", 0.35)
    return mat


# ─────────────────────────────────────────────────────────────────────────────
# Build
# ─────────────────────────────────────────────────────────────────────────────

def clear():
    bpy.ops.wm.read_factory_settings(use_empty=True)


def build_body():
    ob = lathe("FlooBody", PROFILE, segments=192)
    ob.data.materials.append(mat_body())
    return ob


def build_scarf():
    prof = []
    steps = 48
    for i in range(steps + 1):
        q = i / steps
        z = SCARF_Z0 + (SCARF_Z1 - SCARF_Z0) * q
        # full in the middle, tucked at both edges so it hugs the body instead of flaring
        edge = math.sin(math.pi * q) ** 0.80
        prof.append((body_radius(z) + 0.005 + 0.020 * edge, z))
    ring = lathe("FlooScarf", prof, segments=192, pole_bottom=False, pole_top=False)
    mat = mat_scarf()
    ring.data.materials.append(mat)

    knot_theta = 0.58 - math.pi / 2          # matches the first tail's exit angle
    drape_ring(ring, 0.072, knot_theta + math.pi)   # dips toward the knot, rides up on the far side
    bulge_ring(ring, knot_theta, 0.020)
    kr = body_radius(SCARF_Z0) + 0.030
    knot = ellipsoid(
        "FlooScarfKnot",
        (kr * math.cos(knot_theta), kr * math.sin(knot_theta), SCARF_Z0 - 0.012),
        (0.105, 0.092, 0.082), segments=40, rings=22,
    )
    knot.data.materials.append(mat)
    subsurf(knot, 1)

    # Two tails hanging off the front-right, so the silhouette is not mirror-symmetric.
    out = [ring, knot]
    for idx, (ang, length, drift, w) in enumerate((
        (0.58, 0.50, 0.075, 0.066),
        (0.30, 0.38, 0.030, 0.058),
    )):
        r0 = body_radius(SCARF_Z0) + 0.026
        x0 = r0 * math.cos(ang - math.pi / 2)
        y0 = r0 * math.sin(ang - math.pi / 2)
        pts = []
        n = 30
        for k in range(n):
            t = k / (n - 1)
            pts.append((
                x0 + drift * t * t,
                y0 - 0.055 * t - 0.030 * math.sin(t * 2.2),
                SCARF_Z0 - 0.030 - length * t,
            ))
        # u_span keeps the stripe PITCH on the tail equal to the collar's: the collar spans
        # u 0..1 over its ~4.1-unit circumference, so a 0.52-unit tail needs u 0..0.13.
        tl = sweep(f"FlooScarfTail{idx}", pts, w, 0.026,
                   taper=lambda t: 1.0 - 0.22 * t, u_span=length / (2 * math.pi * R))
        tl.data.materials.append(mat)
        subsurf(tl, 1)
        out.append(tl)
    return out


def build_legs_and_boots():
    out = []
    leg_mat, boot_mat, sole_mat = mat_leg(), mat_boot(), mat_sole()
    for sx in (-1, 1):
        x = sx * LEG_X
        leg = lathe(
            f"FlooLeg{'L' if sx < 0 else 'R'}",
            [(0.070, 0.16), (0.073, 0.26), (0.073, 0.40), (0.066, 0.46)],
            segments=48, pole_bottom=False, pole_top=False,
        )
        leg.location = (x, 0.0, 0.0)
        leg.data.materials.append(leg_mat)
        out.append(leg)

        # Chunky boot: an ellipsoid pushed forward and flattened underneath.
        boot = ellipsoid(
            f"FlooBoot{'L' if sx < 0 else 'R'}",
            (x, -0.076, BOOT_Z), (0.147, 0.238, 0.114),
            segments=56, rings=30, flatten_z=BOOT_Z - 0.086,
        )
        boot.data.materials.append(boot_mat)
        subsurf(boot, 1)
        out.append(boot)

        sole = ellipsoid(
            f"FlooSole{'L' if sx < 0 else 'R'}",
            (x, -0.076, BOOT_Z - 0.064), (0.151, 0.242, 0.038),
            segments=56, rings=20, flatten_z=BOOT_Z - 0.084,
        )
        sole.data.materials.append(sole_mat)
        out.append(sole)

        # Cuff: the boot opening. Without it the boot is a dome and the leg looks stabbed into it.
        cuff = lathe(
            f"FlooCuff{'L' if sx < 0 else 'R'}",
            [(0.084, 0.276), (0.101, 0.296), (0.103, 0.311), (0.088, 0.324)],
            segments=48, pole_bottom=False, pole_top=False,
        )
        cuff.location = (x, -0.020, 0.0)
        cuff.data.materials.append(boot_mat)
        out.append(cuff)
    return out


def area_light(name, loc, rot, energy, size, color=(1, 1, 1), shape="DISK"):
    d = bpy.data.lights.new(name, type="AREA")
    d.shape = shape
    d.energy = energy
    d.size = size
    d.color = color
    ob = bpy.data.objects.new(name, d)
    ob.location = loc
    ob.rotation_euler = rot
    bpy.context.collection.objects.link(ob)
    return ob


def build_lights():
    """Key upper-LEFT, rim lower-RIGHT — the same light logic the vector art already assumes, so
    the rendered body and the drawn-on face agree about where the sun is.

    Energies are ~7x lower than v1 and the key is half the size: a big bright key on a clearcoated
    sphere is a white blob, not a highlight."""
    area_light("Key", (-2.2, -2.6, 3.2), (math.radians(52), 0, math.radians(-38)),
               energy=150, size=2.1, color=(1.0, 0.97, 0.92))
    area_light("Fill", (2.6, -2.2, 1.4), (math.radians(78), 0, math.radians(52)),
               energy=38, size=1.8, color=(0.86, 0.90, 1.0))
    area_light("Rim", (2.4, 2.1, 0.7), (math.radians(104), 0, math.radians(140)),
               energy=85, size=1.5, color=(0.95, 0.93, 1.0))
    area_light("Bounce", (0.0, -1.6, -0.9), (math.radians(-24), 0, 0),
               energy=32, size=3.0, color=(1.0, 0.93, 0.82))
    world = bpy.data.worlds.new("FlooWorld")
    world.use_nodes = True
    bg = world.node_tree.nodes["Background"]
    bg.inputs[0].default_value = (0.55, 0.58, 0.70, 1.0)
    bg.inputs[1].default_value = 0.22
    bpy.context.scene.world = world


def build_camera_ortho():
    """The contract with the app: this frame IS the SVG's 200 x 250 viewBox."""
    cd = bpy.data.cameras.new("FlooCam")
    cd.type = "ORTHO"
    cd.ortho_scale = 2.50              # viewBox height 250 / 100
    ob = bpy.data.objects.new("FlooCam", cd)
    ob.location = (0.0, -12.0, 1.25)   # viewBox vertical centre
    ob.rotation_euler = (math.radians(90), 0, 0)
    bpy.context.collection.objects.link(ob)
    bpy.context.scene.camera = ob
    return ob


def setup_render(w, h, samples=320):
    sc = bpy.context.scene
    sc.render.engine = "CYCLES"
    sc.cycles.samples = samples
    sc.cycles.use_denoising = True
    sc.cycles.max_bounces = 12
    sc.cycles.transmission_bounces = 8
    sc.render.film_transparent = True
    sc.render.resolution_x = w
    sc.render.resolution_y = h
    sc.render.resolution_percentage = 100
    sc.render.image_settings.file_format = "PNG"
    sc.render.image_settings.color_mode = "RGBA"
    sc.render.image_settings.compression = 20
    sc.view_settings.view_transform = "Standard"   # UI sprite: brand colours must survive verbatim
    try:
        prefs = bpy.context.preferences.addons["cycles"].preferences
        prefs.compute_device_type = "METAL"
        prefs.get_devices()
        for d in prefs.devices:
            d.use = True
        sc.cycles.device = "GPU"
        print("[floo] GPU: METAL")
    except Exception as e:  # noqa: BLE001
        print(f"[floo] GPU unavailable, using CPU: {e}")


def render_to(path):
    bpy.context.scene.render.filepath = path
    bpy.ops.render.render(write_still=True)
    print(f"[floo] wrote {path}")


def main():
    argv = sys.argv
    out, fast = os.getcwd(), False
    if "--" in argv:
        rest = argv[argv.index("--") + 1:]
        if "--out" in rest:
            out = os.path.abspath(rest[rest.index("--out") + 1])
        fast = "--fast" in rest
    os.makedirs(out, exist_ok=True)

    clear()
    build_body()
    build_scarf()
    build_legs_and_boots()
    build_lights()
    build_camera_ortho()
    setup_render(800, 1000, samples=96 if fast else 380)

    # The app sprite: body + costume, in exact viewBox space.
    render_to(os.path.join(out, "floo-body.png"))

    if not fast:
        # A hero beauty shot for onboarding / marketing — perspective, three-quarter, bigger.
        cam = bpy.context.scene.camera
        cam.data.type = "PERSP"
        cam.data.lens = 62
        cam.location = (2.15, -6.4, 2.05)
        # Aim at the body's mid-height instead of hand-guessing Euler angles — v5 hand-set them,
        # framed 1.9 units of character into a 2.0-unit view, and cropped the tip and the boots.
        aim = Vector((0.0, 0.0, 0.98)) - Vector(cam.location)
        cam.rotation_euler = aim.to_track_quat("-Z", "Y").to_euler()
        bpy.context.scene.render.resolution_x = 1400
        bpy.context.scene.render.resolution_y = 1600
        render_to(os.path.join(out, "floo-hero.png"))

    bpy.ops.wm.save_as_mainfile(filepath=os.path.join(out, "floo.blend"))
    print("[floo] done")


if __name__ == "__main__":
    main()
