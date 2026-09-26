# Toy army vehicles and aircraft for Plastic Front, modelled in Blender (free):
# moulded-plastic style with bevelled edges, panel lines, rivets, hatches, tools, tyres with tread,
# tracks with links and road wheels, glass and lights as painted parts.
#
#   pip install bpy
#   python tools/blender/vehicles.py [name ...]
#
# Writes .cache/figures/vehicles/<name>__<part>.stl. Parts: main (army colour), dark (darker army
# colour: tyres, tracks, guns), rotor / tail (helicopter blades, modelled around their own hub) and
# painted parts named by colour (#rrggbb). Units are game units; game axes: x forward, y up, z to the
# right. tools/figures.mjs converts them into src/data/vehicles.js.
import math, os, sys
import bpy, bmesh
from mathutils import Vector, Euler

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', '.cache', 'figures', 'vehicles')
GLASS, LIGHT, WHITE, RED, BLUE, STEEL = '#9cc4de', '#f5e6a8', '#f4f1e8', '#d63a2f', '#3b8fe0', '#9aa0a6'

def G(x, y, z):
    """game coordinates (x forward, y up, z right) -> Blender (Z up)."""
    return Vector((x, -z, y))

class Model:
    def __init__(self, name):
        self.name, self.parts = name, {}

    # ---- primitives (all positions in game coordinates) -----------------------------
    def _put(self, part, o, bevel=0.0, segs=2):
        if bevel > 0:
            m = o.modifiers.new('bevel', 'BEVEL'); m.width = bevel; m.segments = segs; m.limit_method = 'ANGLE'
        self.parts.setdefault(part, []).append(o)
        return o
    def box(self, part, c, size, bevel=0.025, yaw=0.0, pitch=0.0, roll=0.0, segs=2):
        """size = (along x, along y, along z)."""
        bpy.ops.mesh.primitive_cube_add(size=1, location=G(*c))
        o = bpy.context.active_object
        o.scale = (size[0], size[2], size[1])
        o.rotation_euler = Euler((roll, -pitch, yaw), 'ZYX')
        return self._put(part, o, bevel, segs)
    def cyl(self, part, a, b, r, seg=24, bevel=0.0, r2=None):
        a, b = G(*a), G(*b); d = b - a
        if r2 is None: bpy.ops.mesh.primitive_cylinder_add(vertices=seg, radius=r, depth=d.length, location=(a + b) / 2)
        else: bpy.ops.mesh.primitive_cone_add(vertices=seg, radius1=r, radius2=r2, depth=d.length, location=(a + b) / 2)
        o = bpy.context.active_object
        o.rotation_mode = 'QUATERNION'; o.rotation_quaternion = Vector((0, 0, 1)).rotation_difference(d.normalized())
        return self._put(part, o, bevel)
    def sphere(self, part, c, r, scale=(1, 1, 1), seg=24):
        bpy.ops.mesh.primitive_uv_sphere_add(segments=seg, ring_count=seg // 2, radius=r, location=G(*c))
        o = bpy.context.active_object; o.scale = (scale[0], scale[2], scale[1])
        return self._put(part, o)
    def torus(self, part, c, axis, R, r, seg=32):
        bpy.ops.mesh.primitive_torus_add(major_radius=R, minor_radius=r, major_segments=seg, minor_segments=10, location=G(*c))
        o = bpy.context.active_object
        o.rotation_mode = 'QUATERNION'; o.rotation_quaternion = Vector((0, 0, 1)).rotation_difference(G(*axis).normalized())
        return self._put(part, o)
    def prism(self, part, profile, z0, z1, bevel=0.03):
        """side profile [(x, y), ...] extruded across z0..z1 (hull shapes)."""
        me = bpy.data.meshes.new('p'); bm = bmesh.new()
        f0 = [bm.verts.new(G(x, y, z0)) for x, y in profile]
        f1 = [bm.verts.new(G(x, y, z1)) for x, y in profile]
        bm.faces.new(f0); bm.faces.new(list(reversed(f1)))
        n = len(profile)
        for i in range(n): bm.faces.new([f0[i], f0[(i + 1) % n], f1[(i + 1) % n], f1[i]])
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
        bm.to_mesh(me); bm.free()
        o = bpy.data.objects.new('p', me); bpy.context.scene.collection.objects.link(o)
        return self._put(part, o, bevel)
    def plate(self, part, outline, y, thick, bevel=0.012):
        """flat plate from a top-view outline [(x, z), ...] (wings, fins lie flat; see fin())."""
        me = bpy.data.meshes.new('w'); bm = bmesh.new()
        lo = [bm.verts.new(G(x, y - thick / 2, z)) for x, z in outline]
        hi = [bm.verts.new(G(x, y + thick / 2, z)) for x, z in outline]
        bm.faces.new(lo); bm.faces.new(list(reversed(hi)))
        n = len(outline)
        for i in range(n): bm.faces.new([lo[i], lo[(i + 1) % n], hi[(i + 1) % n], hi[i]])
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
        bm.to_mesh(me); bm.free()
        o = bpy.data.objects.new('w', me); bpy.context.scene.collection.objects.link(o)
        return self._put(part, o, bevel)
    def fin(self, part, outline, z, thick, bevel=0.01):
        """vertical plate from a side-view outline [(x, y), ...] at lateral position z."""
        return self.prism(part, outline, z - thick / 2, z + thick / 2, bevel)

    # ---- details ----------------------------------------------------------------------
    def rivets(self, part, a, b, n, r=0.018, normal=(0, 1, 0)):
        a, b = Vector(a), Vector(b); nv = Vector(normal) * r * 0.5
        for i in range(n):
            p = a + (b - a) * (i / max(1, n - 1))
            self.sphere(part, tuple(p + nv), r, seg=8)
    def wheel(self, c, r, w, tread=True, hub_part='main'):
        """tyre with tread blocks and a hub with nuts; axle along z."""
        x, y, z = c
        self.cyl('dark', (x, y, z - w / 2), (x, y, z + w / 2), r, seg=32, bevel=w * 0.18)
        if tread:
            for i in range(18):
                a = i / 18 * 2 * math.pi
                self.box('dark', (x + math.cos(a) * r, y + math.sin(a) * r, z), (r * 0.16, r * 0.1, w * 0.92), bevel=0.006, pitch=a)
        s = 1 if z >= 0 else -1
        self.cyl(hub_part, (x, y, z + s * w * 0.3), (x, y, z + s * w * 0.56), r * 0.58, seg=24, bevel=0.01)
        self.cyl(hub_part, (x, y, z + s * w * 0.5), (x, y, z + s * w * 0.66), r * 0.22, seg=16)
        for i in range(5):
            a = i / 5 * 2 * math.pi
            self.cyl(hub_part, (x + math.cos(a) * r * 0.38, y + math.sin(a) * r * 0.38, z + s * w * 0.5),
                     (x + math.cos(a) * r * 0.38, y + math.sin(a) * r * 0.38, z + s * w * 0.62), r * 0.06, seg=8)
    def light(self, c, r=0.07, facing=(1, 0, 0)):
        x, y, z = c; f = Vector(facing)
        self.cyl('main', c, tuple(Vector(c) - f * 0.06), r * 1.3, seg=20)
        self.cyl(LIGHT, tuple(Vector(c) + f * 0.005), tuple(Vector(c) + f * 0.02), r, seg=20)
    def jerrycan(self, c, yaw=0.0):
        self.box('main', c, (0.1, 0.26, 0.2), bevel=0.02, yaw=yaw)
        self.box('main', (c[0], c[1] + 0.15, c[2]), (0.05, 0.05, 0.12), bevel=0.01, yaw=yaw)
    def mg(self, base, length=0.55, yaw=0.0, part='dark'):
        """machine gun on a pintle: barrel with cooling jacket, receiver, ammo box, handles."""
        x, y, z = base; c, s = math.cos(yaw), math.sin(yaw)
        f = lambda k, dy=0.0: (x + c * k, y + dy, z + s * k)
        self.box(part, f(0.02), (0.22, 0.09, 0.08), bevel=0.01, yaw=-yaw)
        self.cyl(part, f(0.1), f(length), 0.026, seg=12)
        self.cyl(part, f(0.12), f(length * 0.62), 0.045, seg=14)
        for k in (0.2, 0.3, 0.4): self.torus(part, f(k * length / 0.55 * 0.9), (c, 0, s), 0.046, 0.008, seg=16)
        self.box(part, f(0.0, -0.08), (0.1, 0.1, 0.07), bevel=0.01, yaw=-yaw)     # ammo box
        self.cyl(part, f(-0.12), f(-0.2), 0.012, seg=8)                          # spade grips
    def grille(self, part, c, w, h, n=6, facing_x=True):
        x, y, z = c
        for i in range(n):
            zz = z - w / 2 + (i + 0.5) * w / n
            self.box(part, (x, y, zz), (0.02, h, w / n * 0.45), bevel=0.004)

    # ---- output -----------------------------------------------------------------------
    def finish(self):
        os.makedirs(OUT, exist_ok=True)
        for part, objs in self.parts.items():
            bpy.ops.object.select_all(action='DESELECT')
            for o in objs:
                o.select_set(True); bpy.context.view_layer.objects.active = o
            bpy.ops.object.convert(target='MESH')          # applies modifiers (bevels)
            bpy.ops.object.join()
            o = bpy.context.view_layer.objects.active
            bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
            tri = o.modifiers.new('t', 'TRIANGULATE'); bpy.ops.object.modifier_apply(modifier=tri.name)
            name = f'{self.name}__{part.lstrip("#")}'
            bpy.ops.object.select_all(action='DESELECT'); o.select_set(True)
            bpy.ops.wm.stl_export(filepath=os.path.join(OUT, name + '.stl'), export_selected_objects=True, ascii_format=False)
            print(f'{name}: {len(o.data.polygons)} tris')

def clear():
    bpy.ops.wm.read_factory_settings(use_empty=True)

# =========================================================================================
def jeep():
    m = Model('jeep')
    # chassis rails and body tub
    for z in (-0.3, 0.3): m.box('dark', (0, 0.3, z), (1.75, 0.08, 0.08), bevel=0.01)
    m.box('main', (-0.1, 0.46, 0), (1.35, 0.26, 0.96), bevel=0.05)
    m.box('main', (0.62, 0.5, 0), (0.56, 0.18, 0.78), bevel=0.04)                    # bonnet
    m.box('main', (0.62, 0.595, 0), (0.5, 0.012, 0.05), bevel=0.004)                 # bonnet hinge
    m.grille('dark', (0.9, 0.47, 0), 0.52, 0.2, 9)
    m.box('main', (0.9, 0.47, 0), (0.03, 0.26, 0.6), bevel=0.01)                     # grille frame
    for z in (-0.3, 0.3): m.light((0.9, 0.52, z), 0.055)
    m.box('main', (0.98, 0.26, 0), (0.06, 0.07, 1.02), bevel=0.012)                  # bumper
    for z in (-0.3, 0.3): m.box('dark', (0.92, 0.29, z), (0.14, 0.05, 0.06), bevel=0.005)   # bumper brackets
    for z in (-0.44, 0.44):
        m.box('main', (0.55, 0.46, z), (0.62, 0.05, 0.18), bevel=0.02)                # front fenders
        m.box('main', (-0.55, 0.46, z * 1.02), (0.5, 0.05, 0.16), bevel=0.02)          # rear fenders
    # windscreen folded up, frame + glass
    m.box('main', (0.3, 0.8, 0), (0.05, 0.4, 0.94), bevel=0.012, pitch=-0.2)
    m.box(GLASS, (0.305, 0.8, 0), (0.035, 0.32, 0.84), bevel=0.0, pitch=-0.2)
    # seats, steering wheel, rear bench
    for z in (-0.22, 0.22):
        m.box('dark', (0.05, 0.62, z), (0.28, 0.08, 0.3), bevel=0.02)
        m.box('dark', (-0.08, 0.76, z), (0.07, 0.26, 0.3), bevel=0.02, pitch=0.2)
    m.box('dark', (-0.55, 0.62, 0), (0.36, 0.08, 0.84), bevel=0.02)
    m.cyl('dark', (0.24, 0.68, -0.22), (0.2, 0.76, -0.22), 0.015)
    m.torus('dark', (0.19, 0.78, -0.22), (0.6, 1, 0), 0.08, 0.012)
    # wheels, spare on the back, jerrycan, shovel and axe on the side
    for x in (0.55, -0.55):
        for z in (-0.46, 0.46): m.wheel((x, 0.26, z), 0.26, 0.18)
    m.cyl('dark', (-0.82, 0.55, 0), (-0.95, 0.55, 0), 0.22, seg=32, bevel=0.03)
    m.cyl('main', (-0.94, 0.55, 0), (-0.98, 0.55, 0), 0.12, seg=20)
    m.jerrycan((-0.78, 0.5, 0.38))
    m.box('main', (-0.1, 0.5, -0.49), (0.5, 0.03, 0.02), bevel=0.005)                # shovel handle
    m.box('main', (0.18, 0.5, -0.49), (0.1, 0.07, 0.02), bevel=0.005)
    m.rivets('main', (-0.7, 0.58, 0.485), (0.1, 0.58, 0.485), 7, normal=(0, 0, 1))
    m.rivets('main', (-0.7, 0.58, -0.485), (0.1, 0.58, -0.485), 7, normal=(0, 0, -1))
    # pedestal machine gun
    m.cyl('main', (-0.35, 0.62, 0), (-0.35, 0.98, 0), 0.03)
    m.mg((-0.33, 1.05, 0), 0.62)
    m.cyl('dark', (-0.75, 0.62, 0.38), (-0.75, 1.5, 0.38), 0.006, seg=6)              # radio antenna
    m.finish()

def ambulance():
    m = Model('ambulance')
    for z in (-0.3, 0.3): m.box('dark', (0, 0.3, z), (1.8, 0.08, 0.08), bevel=0.01)
    m.box('main', (0, 0.42, 0), (1.85, 0.12, 0.95), bevel=0.03)
    # cab with windows and doors
    m.box('main', (0.6, 0.72, 0), (0.56, 0.5, 0.95), bevel=0.06)
    m.box('main', (0.82, 0.54, 0), (0.24, 0.22, 0.8), bevel=0.05)                     # bonnet
    m.grille('dark', (0.95, 0.52, 0), 0.5, 0.16, 8)
    for z in (-0.3, 0.3): m.light((0.95, 0.6, z), 0.05)
    m.box(GLASS, (0.885, 0.86, 0), (0.02, 0.2, 0.8), bevel=0.0, pitch=-0.15)
    for z in (-0.48, 0.48):
        m.box(GLASS, (0.62, 0.86, z), (0.32, 0.18, 0.02), bevel=0.0)
        m.box('dark', (0.44, 0.68, z * 1.01), (0.02, 0.36, 0.01), bevel=0.0)        # door seam
        m.box('dark', (0.66, 0.66, z * 1.03), (0.08, 0.02, 0.02), bevel=0.0)        # handle
    # box body with panels, rear doors, steps, roof light and crosses
    m.box('main', (-0.3, 0.92, 0), (1.22, 0.86, 1.0), bevel=0.05)
    for x in (-0.8, -0.3, 0.2):
        m.box('main', (x, 0.92, 0.505), (0.012, 0.78, 0.01), bevel=0.0)
        m.box('main', (x, 0.92, -0.505), (0.012, 0.78, 0.01), bevel=0.0)
    m.box('main', (-0.92, 0.92, 0), (0.02, 0.76, 0.02), bevel=0.0)                   # rear door split
    for z in (-0.12, 0.12): m.box('dark', (-0.925, 0.92, z), (0.03, 0.03, 0.08), bevel=0.0)
    m.box('main', (-0.98, 0.42, 0), (0.12, 0.04, 0.7), bevel=0.01)                    # step
    for z in (-0.506, 0.506):
        m.box(WHITE, (-0.3, 0.95, z), (0.56, 0.56, 0.012), bevel=0.0)
        m.box(RED, (-0.3, 0.95, z * 1.01), (0.36, 0.1, 0.012), bevel=0.0)
        m.box(RED, (-0.3, 0.95, z * 1.01), (0.1, 0.36, 0.012), bevel=0.0)
    m.box(WHITE, (-0.3, 1.356, 0), (0.5, 0.012, 0.5), bevel=0.0)
    m.box(RED, (-0.3, 1.365, 0), (0.34, 0.012, 0.1), bevel=0.0)
    m.box(RED, (-0.3, 1.365, 0), (0.1, 0.012, 0.34), bevel=0.0)
    m.cyl(BLUE, (0.6, 0.98, 0), (0.6, 1.08, 0), 0.07, seg=16)
    for x in (0.58, -0.58):
        for z in (-0.47, 0.47): m.wheel((x, 0.26, z), 0.26, 0.18)
    m.finish()

def apc():
    m = Model('apc')
    # armoured hull: sloped front, vision slits, hatches, rivets
    m.prism('main', [(-0.95, 0.32), (0.72, 0.32), (1.0, 0.56), (0.76, 0.95), (-0.9, 0.95), (-0.98, 0.7)], -0.5, 0.5, 0.04)
    for z in (-0.25, 0.25): m.box('dark', (0.86, 0.78, z), (0.02, 0.04, 0.2), bevel=0.0, pitch=-0.6)
    for x in (0.35, -0.2):
        m.box('dark', (x, 0.72, 0.505), (0.22, 0.04, 0.01), bevel=0.0)
        m.box('dark', (x, 0.72, -0.505), (0.22, 0.04, 0.01), bevel=0.0)
    m.box('main', (-0.6, 0.97, 0.18), (0.3, 0.03, 0.3), bevel=0.01)                  # rear hatch
    m.cyl('main', (-0.6, 0.99, 0.02), (-0.6, 0.99, 0.34), 0.015)
    m.box('main', (-0.97, 0.6, 0), (0.03, 0.36, 0.44), bevel=0.01)                   # rear door
    m.box('dark', (-0.99, 0.62, 0.14), (0.02, 0.03, 0.08), bevel=0.0)
    for y in (0.4, 0.9):
        m.rivets('main', (-0.9, y, 0.505), (0.7, y, 0.505), 12, normal=(0, 0, 1))
        m.rivets('main', (-0.9, y, -0.505), (0.7, y, -0.505), 12, normal=(0, 0, -1))
    for z in (-0.3, 0.3): m.light((0.9, 0.62, z), 0.05)
    # six wheels with mudguards, spare wheel, tool box, jerrycans
    for x in (-0.6, 0.0, 0.6):
        for z in (-0.52, 0.52): m.wheel((x, 0.26, z), 0.26, 0.2)
    for z in (-0.53, 0.53): m.box('main', (0, 0.55, z), (1.6, 0.03, 0.14), bevel=0.01)
    m.box('main', (0.1, 0.62, -0.56), (0.5, 0.12, 0.06), bevel=0.012)
    m.jerrycan((-0.4, 0.62, 0.56)); m.jerrycan((-0.6, 0.62, 0.56))
    # turret ring with a shielded machine gun
    m.cyl('main', (-0.1, 0.95, 0), (-0.1, 1.12, 0), 0.3, seg=32, bevel=0.02)
    m.torus('main', (-0.1, 1.12, 0), (0, 1, 0), 0.3, 0.02)
    m.box('main', (0.12, 1.15, 0), (0.04, 0.2, 0.34), bevel=0.01)                    # gun shield
    m.mg((0.12, 1.08, 0), 0.66)
    m.cyl('dark', (-0.7, 0.95, -0.35), (-0.7, 1.8, -0.35), 0.006, seg=6)
    m.finish()

def amphib():
    m = Model('amphib')
    # boat hull over wheels: pointed bow, gunwale rail, cab, windscreen
    m.prism('main', [(-1.0, 0.36), (0.62, 0.36), (1.12, 0.75), (1.0, 0.9), (-1.0, 0.9)], -0.5, 0.5, 0.05)
    m.box('main', (0, 0.93, 0), (2.0, 0.04, 1.02), bevel=0.012)                       # gunwale
    for z in (-0.52, 0.52): m.cyl('main', (-0.95, 1.06, z), (0.7, 1.06, z), 0.018, seg=8)   # rails
    for x in (-0.9, -0.4, 0.1, 0.6):
        for z in (-0.52, 0.52): m.cyl('main', (x, 0.93, z), (x, 1.06, z), 0.014, seg=8)
    m.box('main', (0.35, 1.08, 0), (0.05, 0.3, 0.8), bevel=0.01, pitch=-0.25)
    m.box(GLASS, (0.355, 1.08, 0), (0.03, 0.22, 0.7), bevel=0.0, pitch=-0.25)
    m.box('dark', (-0.2, 1.0, 0), (0.6, 0.08, 0.7), bevel=0.02)                        # cargo deck
    for z in (-0.5, 0.5): m.torus(WHITE, (-0.55, 0.78, z * 1.05), (0, 0, 1), 0.13, 0.04)   # life rings
    m.torus(RED, (-0.55, 0.78, 0.53), (0, 0, 1), 0.13, 0.042, seg=8)
    for x in (0.55, -0.55):
        for z in (-0.5, 0.5): m.wheel((x, 0.24, z), 0.24, 0.16)
    # propeller and rudder at the stern
    m.cyl('dark', (-1.0, 0.36, 0), (-1.18, 0.36, 0), 0.03)
    for i in range(3):
        a = i / 3 * 2 * math.pi
        m.box('dark', (-1.2, 0.36 + math.sin(a) * 0.08, math.cos(a) * 0.08), (0.03, 0.14, 0.05), bevel=0.005, roll=a)
    m.box('dark', (-1.26, 0.36, 0), (0.05, 0.26, 0.02), bevel=0.005)
    for z in (-0.3, 0.3): m.light((1.0, 0.86, z), 0.045)
    m.cyl('main', (-0.5, 1.0, 0), (-0.5, 1.4, 0), 0.03)
    m.mg((-0.48, 1.47, 0), 0.62)
    m.finish()

def tank():
    m = Model('tank')
    # tracks: belt of links, road wheels in bogies, drive sprocket, idler, return rollers
    for z in (-0.62, 0.62):
        s = 1 if z > 0 else -1
        m.box('dark', (0, 0.26, z), (2.5, 0.42, 0.32), bevel=0.14, segs=4)
        for i in range(34):
            x = -1.22 + i * 0.074
            m.box('dark', (x, 0.035, z), (0.05, 0.03, 0.34), bevel=0.004)          # links on the ground
            m.box('dark', (x, 0.49, z), (0.05, 0.03, 0.34), bevel=0.004)           # links on top
        for i in range(6):
            x = -0.95 + i * 0.38
            m.cyl('main', (x, 0.2, z - s * 0.05), (x, 0.2, z + s * 0.18), 0.14, seg=24, bevel=0.012)
            m.cyl('main', (x, 0.2, z + s * 0.18), (x, 0.2, z + s * 0.2), 0.06, seg=12)
        for x in (-0.76, 0.0, 0.76): m.box('main', (x, 0.28, z + s * 0.2), (0.34, 0.1, 0.04), bevel=0.01)   # bogie arms
        m.cyl('main', (1.18, 0.34, z - s * 0.05), (1.18, 0.34, z + s * 0.2), 0.16, seg=12, bevel=0.02)     # sprocket
        m.cyl('main', (-1.2, 0.3, z - s * 0.05), (-1.2, 0.3, z + s * 0.2), 0.14, seg=24, bevel=0.012)      # idler
        for x in (-0.6, 0.0, 0.6): m.cyl('main', (x, 0.44, z), (x, 0.44, z + s * 0.18), 0.05, seg=12)
        m.box('main', (0, 0.53, z), (2.5, 0.03, 0.38), bevel=0.01)                   # track guard
    # hull: sloped glacis, hatches, headlights, tools, engine deck, stowage
    m.prism('main', [(-1.25, 0.34), (1.05, 0.34), (1.3, 0.6), (1.0, 0.86), (-1.2, 0.86), (-1.3, 0.62)], -0.47, 0.47, 0.05)
    for z in (-0.2, 0.2):
        m.box('main', (0.78, 0.88, z), (0.26, 0.03, 0.22), bevel=0.015)              # driver hatches
        m.box('main', (0.78, 0.9, z), (0.04, 0.02, 0.2), bevel=0.0)
        m.box('dark', (0.95, 0.83, z), (0.03, 0.05, 0.12), bevel=0.0, pitch=-0.6)    # periscopes
    for z in (-0.35, 0.35): m.light((1.2, 0.68, z), 0.05)
    m.cyl('dark', (1.22, 0.6, 0.12), (1.28, 0.6, 0.12), 0.03)                        # bow MG
    m.rivets('main', (1.05, 0.62, -0.4), (1.05, 0.62, 0.4), 9)
    m.grille('dark', (-0.95, 0.875, 0), 0.7, 0.012, 10)                               # engine deck louvres
    for k in (-0.35, 0.35): m.box('dark', (-0.95, 0.875, k), (0.5, 0.012, 0.01), bevel=0.0)
    m.box('main', (-1.29, 0.72, 0), (0.05, 0.16, 0.8), bevel=0.01)                   # rear plate
    for z in (-0.3, 0.3): m.jerrycan((-1.2, 0.98, z), yaw=math.pi / 2)
    m.box('main', (-0.55, 0.9, -0.44), (0.7, 0.03, 0.03), bevel=0.005)               # shovel / crowbar on the fender
    m.box('main', (-0.1, 0.9, -0.44), (0.16, 0.05, 0.03), bevel=0.005)
    m.cyl('main', (-0.6, 0.9, 0.44), (0.1, 0.9, 0.44), 0.018)                        # tow cable
    # cast turret: rounded body, mantlet, gun with muzzle brake, hatches, MG, periscopes, aerial
    m.sphere('main', (-0.15, 1.0, 0), 0.52, scale=(1.15, 0.55, 0.95), seg=40)
    m.cyl('main', (-0.15, 0.86, 0), (-0.15, 0.98, 0), 0.5, seg=40, bevel=0.02)
    m.box('main', (0.42, 1.03, 0), (0.24, 0.26, 0.46), bevel=0.06)                   # mantlet
    m.cyl('main', (0.5, 1.05, 0), (2.0, 1.05, 0), 0.07, seg=20)
    m.cyl('main', (0.52, 1.05, 0), (0.95, 1.05, 0), 0.09, seg=20, r2=0.075)
    m.cyl('main', (1.9, 1.05, 0), (2.08, 1.05, 0), 0.105, seg=20, bevel=0.01)       # muzzle brake
    for zz in (-0.1, 0.1): m.box('dark', (2.0, 1.05, zz), (0.08, 0.1, 0.02), bevel=0.0)
    m.cyl('main', (-0.35, 1.27, 0.18), (-0.35, 1.36, 0.18), 0.15, seg=28, bevel=0.015)   # commander cupola
    m.cyl('main', (-0.35, 1.36, 0.18), (-0.35, 1.39, 0.18), 0.13, seg=28)
    m.cyl('main', (-0.3, 1.27, -0.2), (-0.3, 1.31, -0.2), 0.12, seg=24)                 # loader hatch
    m.cyl('main', (-0.35, 1.39, -0.02), (-0.35, 1.52, -0.02), 0.02)
    m.mg((-0.33, 1.56, -0.02), 0.55)
    for x, z in ((0.05, -0.28), (0.05, 0.28)): m.box('dark', (x, 1.24, z), (0.06, 0.07, 0.06), bevel=0.005)
    m.box('main', (-0.78, 1.02, 0), (0.24, 0.2, 0.62), bevel=0.03)                     # turret bustle box
    m.cyl('dark', (-0.6, 1.25, -0.35), (-0.6, 2.1, -0.35), 0.007, seg=6)
    m.finish()

def rockets():
    m = Model('rockets')
    for z in (-0.3, 0.3): m.box('dark', (0, 0.34, z), (2.4, 0.1, 0.08), bevel=0.01)
    m.box('main', (0, 0.5, 0), (2.5, 0.14, 0.92), bevel=0.03)                         # flatbed
    for x in (-1.1, -0.6, -0.1, 0.4): m.box('main', (x, 0.5, 0), (0.03, 0.16, 0.94), bevel=0.0)
    # cab
    m.box('main', (0.9, 0.86, 0), (0.7, 0.62, 1.0), bevel=0.07)
    m.box(GLASS, (1.255, 0.98, 0), (0.02, 0.24, 0.84), bevel=0.0)
    for z in (-0.506, 0.506): m.box(GLASS, (0.95, 0.98, z), (0.32, 0.2, 0.012), bevel=0.0)
    m.grille('dark', (1.26, 0.66, 0), 0.6, 0.14, 9)
    for z in (-0.36, 0.36): m.light((1.26, 0.75, z), 0.05)
    m.box('main', (1.3, 0.4, 0), (0.06, 0.08, 1.0), bevel=0.012)
    for x in (0.9, -0.3, -0.9):
        for z in (-0.5, 0.5): m.wheel((x, 0.28, z), 0.28, 0.2)
    # launcher rack: 3 x 4 tubes on a tilted frame, with a pivot and jack
    tilt, px, py = 0.42, -0.45, 1.0
    ct, st = math.cos(tilt), math.sin(tilt)
    at = lambda x, y: (px + x * ct - y * st, py + x * st + y * ct)
    for r in range(3):
        for c in range(4):
            z = -0.3 + c * 0.2
            x0, y0 = at(-0.75, 0.12 + r * 0.19); x1, y1 = at(0.75, 0.12 + r * 0.19)
            m.cyl('main', (x0, y0, z), (x1, y1, z), 0.085, seg=18)
            m.cyl('dark', (x1, y1, z), (x1 + 0.005, y1 + 0.002, z), 0.06, seg=14)
            for k in (-0.4, 0.3):
                xk, yk = at(k, 0.12 + r * 0.19)
                m.torus('main', (xk, yk, z), (ct, st, 0), 0.088, 0.01, seg=16)
    for k in (-0.7, 0.0, 0.7):
        xa, ya = at(k, 0.02)
        m.box('main', (xa, ya, 0), (0.06, 0.06, 0.92), bevel=0.01, pitch=tilt)
    m.box('main', (-0.45, 0.78, 0), (0.14, 0.52, 0.5), bevel=0.02)                     # pivot mount
    m.cyl('dark', (-0.7, 0.58, 0), (-0.2, 1.0, 0), 0.03)                               # elevating jack
    for z in (-0.5, 0.5):                                                              # stabiliser legs
        m.cyl('main', (-1.15, 0.5, z), (-1.25, 0.08, z * 1.15), 0.035)
        m.cyl('main', (-1.25, 0.06, z * 1.15), (-1.25, 0.02, z * 1.15), 0.08)
    for x in (0.25, 0.45): m.box('main', (x, 0.66, -0.3), (0.16, 0.18, 0.26), bevel=0.012)   # ammo crates
    m.finish()

def heli():
    m = Model('heli')
    # fuselage: rounded body, glass nose, tail boom, fins, skids, doors, side guns, engine
    m.sphere('main', (0.35, 0, 0), 0.5, scale=(1.9, 1.0, 0.95), seg=40)
    m.sphere(GLASS, (0.95, 0.04, 0), 0.31, scale=(1.0, 0.92, 0.92), seg=32)
    m.torus('main', (0.95, 0.04, 0), (1, 0, 0), 0.26, 0.022)
    for z in (-0.47, 0.47):
        m.box('dark', (0.3, 0.02, z), (0.5, 0.36, 0.02), bevel=0.01)                   # open door
        m.box(GLASS, (0.62, 0.18, z * 0.97), (0.18, 0.14, 0.02), bevel=0.0)           # side window
    m.cyl('main', (-0.55, 0.12, 0), (-1.85, 0.4, 0), 0.19, seg=24, r2=0.07)
    m.fin('main', [(-1.62, 0.34), (-1.95, 0.34), (-2.08, 0.82), (-1.9, 0.84)], 0, 0.05)
    m.plate('main', [(-1.45, -0.32), (-1.72, -0.32), (-1.72, 0.32), (-1.45, 0.32)], 0.25, 0.04)
    for z in (-0.42, 0.42):
        m.cyl('dark', (-0.45, -0.55, z), (0.95, -0.55, z), 0.035, seg=12)
        m.sphere('dark', (0.98, -0.53, z), 0.04, seg=12)
        m.cyl('dark', (-0.15, -0.55, z), (-0.05, -0.28, z * 0.6), 0.03, seg=10)
        m.cyl('dark', (0.55, -0.55, z), (0.55, -0.28, z * 0.6), 0.03, seg=10)
        m.cyl('dark', (0.35, -0.15, z * 1.08), (0.85, -0.15, z * 1.08), 0.035, seg=12)   # rocket pods
        m.cyl('dark', (0.35, -0.15, z * 1.08), (0.55, -0.15, z * 1.08), 0.08, seg=16)
        m.box('main', (0.35, -0.02, z * 0.86), (0.22, 0.05, 0.28), bevel=0.01)
    m.box('main', (0.1, 0.5, 0), (0.6, 0.16, 0.34), bevel=0.05)                        # engine housing
    m.grille('dark', (-0.05, 0.5, 0.18), 0.02, 0.1, 1)
    m.cyl('main', (0.3, 0.55, 0), (0.3, 0.7, 0), 0.06)                                 # mast (rotor sits on top)
    m.rivets('main', (-0.6, 0.35, 0.2), (-1.5, 0.48, 0.1), 10)
    # main rotor (around its own hub) and tail rotor
    m.cyl('rotor', (0, -0.04, 0), (0, 0.06, 0), 0.11, seg=20, bevel=0.01)
    for a in (0, math.pi / 2, math.pi, 3 * math.pi / 2):
        m.box('rotor', (math.cos(a) * 0.78, 0.02, math.sin(a) * 0.78), (1.4, 0.022, 0.13), bevel=0.008, yaw=-a)
    m.cyl('tail', (0, 0, -0.03), (0, 0, 0.03), 0.05, seg=14)
    for a in (0, math.pi / 2):
        m.box('tail', (0, 0, 0), (0.05, 0.5, 0.025), bevel=0.005, roll=a)
    m.finish()

# ---- planes: fuselage along +x, wings flat ----------------------------------------------
def jet(m, length, r, wing, sweep, tail, span_root=0.6, canopy=True, nose=2.2):
    m.cyl('main', (-length / 2, 0, 0), (length / 2, 0, 0), r, seg=32, bevel=0.0)
    m.sphere('main', (-length / 2, 0, 0), r, scale=(1.4, 1, 1), seg=32)
    if nose > 0: m.cyl('main', (length / 2, 0, 0), (length / 2 + r * nose, 0, 0), r, seg=32, r2=r * 0.12)   # pointed jet nose
    else: m.sphere('main', (length / 2, 0, 0), r, scale=(-nose, 1, 1), seg=32)                          # rounded nose
    if canopy:
        m.sphere(GLASS, (length * 0.28, r * 0.6, 0), r * 0.78, scale=(2.2, 0.95, 0.85), seg=28)
        m.torus('main', (length * 0.28 - r * 0.5, r * 0.6, 0), (1, 0, 0), r * 0.6, r * 0.06, seg=20)
    for s in (1, -1):
        m.plate('main', [(span_root / 2, 0), (-span_root / 2, 0), (-span_root / 2 - sweep, s * wing), (-span_root / 2 - sweep + 0.25, s * wing)], -r * 0.25, 0.05)
        m.box('dark', (-span_root / 2 - sweep * 0.5, -r * 0.25, s * wing * 0.55), (0.3, 0.012, 0.012), bevel=0.0, yaw=0)   # aileron line
        m.plate('main', [(-length / 2 + 0.05, 0), (-length / 2 - 0.25, 0), (-length / 2 - 0.4, s * tail * 0.6), (-length / 2 - 0.25, s * tail * 0.6)], 0, 0.035)
    m.fin('main', [(-length / 2 + 0.1, r * 0.5), (-length / 2 - 0.35, r * 0.5), (-length / 2 - 0.5, r + tail), (-length / 2 - 0.3, r + tail)], 0, 0.04)
    m.rivets('main', (-length / 2, r * 0.98, 0), (length / 2, r * 0.98, 0), int(length * 10))
    for k in (-0.2, 0.2): m.torus('main', (length * k, 0, 0), (1, 0, 0), r * 1.005, 0.006, seg=32)   # panel lines
    m.box('dark', (length * 0.1, -r * 0.9, 0), (0.25, 0.04, 0.1), bevel=0.01)          # air intake

def fighter():
    m = Model('fighter')
    jet(m, 1.6, 0.17, 0.95, 0.55, 0.5, nose=2.0)
    for z in (-0.3, 0.3):
        m.cyl('dark', (0.1, -0.12, z), (0.6, -0.12, z), 0.035, seg=12)                  # cannons / missiles
        m.box('main', (0.3, -0.07, z), (0.3, 0.06, 0.015), bevel=0.004)                  # pylons
    for z in (-0.6, 0.6):
        m.box('main', (0.0, -0.09, z), (0.3, 0.07, 0.015), bevel=0.004)
        m.cyl('dark', (-0.3, -0.14, z), (0.25, -0.14, z), 0.03, seg=12)
        m.cyl('dark', (0.25, -0.14, z), (0.33, -0.14, z), 0.03, seg=12, r2=0.005)
    m.cyl('dark', (-0.8, 0, 0), (-0.95, 0, 0), 0.12, seg=24, r2=0.14)                   # exhaust
    m.finish()

def attacker():
    m = Model('attacker')
    jet(m, 1.8, 0.2, 1.15, 0.15, 0.5, nose=1.8)
    for z in (-0.2, 0.2):
        m.cyl('main', (-0.8, 0.28, z), (-0.3, 0.28, z), 0.13, seg=28)                   # rear engines
        m.cyl('dark', (-0.82, 0.28, z), (-0.84, 0.28, z), 0.1, seg=24)
        m.torus('main', (-0.3, 0.28, z), (1, 0, 0), 0.12, 0.015)
        m.box('main', (-0.55, 0.19, z), (0.3, 0.08, 0.04), bevel=0.01)
    for z in (-0.55, -0.8, 0.55, 0.8):
        m.cyl('dark', (-0.15, -0.18, z), (0.28, -0.18, z), 0.05, seg=14)                # bombs / rockets
        m.cyl('dark', (0.28, -0.18, z), (0.38, -0.18, z), 0.05, seg=14, r2=0.01)
        m.box('main', (0.05, -0.12, z), (0.18, 0.06, 0.02), bevel=0.005)
    m.cyl('dark', (1.0, -0.05, 0), (1.3, -0.05, 0), 0.025, seg=10)                      # nose gun
    m.finish()

def bomber():
    m = Model('bomber')
    jet(m, 2.6, 0.3, 1.8, 0.25, 0.75, nose=-1.7)
    for z in (-0.8, -1.3, 0.8, 1.3):
        m.cyl('main', (-0.15, -0.12, z), (0.45, -0.12, z), 0.12, seg=28, r2=0.1)        # engine nacelles
        m.cyl('dark', (0.45, -0.12, z), (0.47, -0.12, z), 0.07, seg=20)
        m.torus('main', (0.2, -0.12, z), (1, 0, 0), 0.115, 0.012)
        m.cyl('dark', (-0.15, -0.12, z), (-0.3, -0.12, z), 0.08, seg=20)
    m.box('dark', (0.1, -0.3, 0), (0.8, 0.04, 0.3), bevel=0.01)                          # bomb bay
    for x in (-0.15, 0.15, 0.35): m.box('dark', (x, -0.3, 0), (0.012, 0.045, 0.3), bevel=0.0)
    m.sphere(GLASS, (1.1, 0.02, 0), 0.22, scale=(1.3, 1, 1), seg=24)                    # bomb-aimer nose
    m.sphere(GLASS, (-0.6, 0.32, 0), 0.12, seg=20)                                       # gun turret dome
    m.cyl('dark', (-0.6, 0.36, 0.04), (-0.3, 0.38, 0.04), 0.012, seg=8)
    m.finish()

def transport():
    m = Model('transport')
    jet(m, 2.4, 0.36, 1.9, 0.05, 0.85, span_root=0.7, nose=-1.5)
    for z in (-0.9, 0.9):
        m.cyl('main', (0.0, 0.08, z), (0.5, 0.08, z), 0.14, seg=28, r2=0.12)            # prop engines
        m.cyl('dark', (0.5, 0.08, z), (0.58, 0.08, z), 0.05, seg=16, r2=0.02)           # spinner
        for a in (0, math.pi * 2 / 3, math.pi * 4 / 3):
            m.box('dark', (0.54, 0.08 + math.sin(a) * 0.22, z + math.cos(a) * 0.22), (0.02, 0.44, 0.05), bevel=0.004, roll=a)
    m.box('dark', (-1.1, -0.28, 0), (0.5, 0.03, 0.5), bevel=0.01)                        # rear ramp
    for x in (-0.6, -0.2, 0.2, 0.6):
        for z in (-0.365, 0.365): m.box(GLASS, (x, 0.12, z), (0.1, 0.08, 0.012), bevel=0.0)   # cabin windows
    m.box('dark', (0.4, -0.02, 0.37), (0.28, 0.4, 0.012), bevel=0.0)                     # jump door
    m.finish()

def chute():
    """paratrooper's canopy: 12 bulging gores with seams, a vent at the top, rigging lines and risers."""
    m = Model('chute')
    R, top = 0.75, 1.62
    for i in range(12):
        a0, a1 = i / 12 * 2 * math.pi, (i + 1) / 12 * 2 * math.pi
        am = (a0 + a1) / 2
        # one gore: a curved panel from the vent down to the skirt, bulging outwards between seams
        pts = []
        for k in range(7):
            t = k / 6
            phi = 0.18 + t * (math.pi / 2 - 0.35)
            for a in (a0, am, a1):
                bulge = 1.05 if a == am else 1.0
                r = R * math.sin(phi) * bulge
                pts.append((math.cos(a) * r, top - R * 0.62 * (1 - math.cos(phi)) * 1.6 + (0.015 if a == am else 0), math.sin(a) * r))
        for k in range(6):
            for j in range(2):
                p00, p01 = pts[k * 3 + j], pts[k * 3 + j + 1]
                p10, p11 = pts[(k + 1) * 3 + j], pts[(k + 1) * 3 + j + 1]
                for tri in ((p00, p10, p11), (p00, p11, p01)):
                    me = bpy.data.meshes.new('g'); me.from_pydata([G(*p) for p in tri], [], [(0, 1, 2)])
                    o = bpy.data.objects.new('g', me); bpy.context.scene.collection.objects.link(o)
                    sol = o.modifiers.new('s', 'SOLIDIFY'); sol.thickness = 0.012
                    m.parts.setdefault('main', []).append(o)
        edge = pts[18]
        m.cyl('dark', (edge[0], edge[1], edge[2]), (0, 0.78, 0), 0.004, seg=5)                  # rigging line
        m.cyl('main', pts[0], pts[18], 0.008, seg=6)                                           # seam tape
    m.torus('main', (0, top - 0.01, 0), (0, 1, 0), R * math.sin(0.18), 0.012, seg=24)          # vent band
    m.torus('main', (0, pts[18][1], 0), (0, 1, 0), R * math.sin(math.pi / 2 - 0.17), 0.012, seg=48)   # skirt band
    for z in (-0.06, 0.06): m.cyl('dark', (0, 0.78, z), (0, 0.62, z * 1.6), 0.01, seg=6)        # risers to the harness
    m.box('dark', (0, 0.78, 0), (0.05, 0.03, 0.14), bevel=0.005)                               # connector links
    m.finish()

MODELS = {'jeep': jeep, 'ambulance': ambulance, 'apc': apc, 'amphib': amphib, 'tank': tank, 'rockets': rockets,
          'heli': heli, 'fighter': fighter, 'attacker': attacker, 'bomber': bomber, 'transport': transport, 'chute': chute}

if __name__ == '__main__':
    only = sys.argv[1:]
    for name, build in MODELS.items():
        if only and name not in only: continue
        clear(); build()
