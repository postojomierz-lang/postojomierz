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
from mathutils import Vector, Euler, Matrix

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

    # ---- smooth shapes -----------------------------------------------------------------
    def _mesh(self, part, build, bevel=0.0, smooth=0):
        me = bpy.data.meshes.new('m'); bm = bmesh.new()
        build(bm)
        bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-6)
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
        bm.to_mesh(me); bm.free()
        o = bpy.data.objects.new('m', me); bpy.context.scene.collection.objects.link(o)
        if smooth:
            sd = o.modifiers.new('sd', 'SUBSURF'); sd.levels = smooth; sd.render_levels = smooth
        return self._put(part, o, bevel)
    @staticmethod
    def _rings(bm, rings, closed=False, caps=True):
        vs = [[bm.verts.new(G(*p)) for p in r] for r in rings]
        n = len(vs[0])
        pairs = list(zip(vs, vs[1:])) + ([(vs[-1], vs[0])] if closed else [])
        for a, b in pairs:
            for i in range(n):
                q = [a[i], a[(i + 1) % n], b[(i + 1) % n], b[i]]
                if len(set(q)) >= 3:
                    try: bm.faces.new(list(dict.fromkeys(q)))
                    except ValueError: pass
        if caps and not closed:
            for r in (vs[0], vs[-1]):
                if len(set(r)) >= 3:
                    try: bm.faces.new(r)
                    except ValueError: pass
    def loft(self, part, secs, seg=32, bevel=0.0, smooth=0):
        """a body lofted through cross-sections along x: secs = [(x, y0, y1, hw, n[, zc])] -
        superellipse from y0 to y1, half-width hw (along z), exponent n (2 round, 6+ boxy)."""
        rings = []
        for sec in secs:
            x, y0, y1, hw, n = sec[:5]; zc = sec[5] if len(sec) > 5 else 0.0
            yc, hh, e = (y0 + y1) / 2, (y1 - y0) / 2, 2.0 / n
            ring = []
            for i in range(seg):
                a = 2 * math.pi * (i + 0.5) / seg; c, sn = math.cos(a), math.sin(a)
                ring.append((x, yc + hh * math.copysign(abs(sn) ** e, sn), zc + hw * math.copysign(abs(c) ** e, c)))
            rings.append(ring)
        return self._mesh(part, lambda bm: self._rings(bm, rings), bevel, smooth)
    def lathe(self, part, prof, c, axis, seg=28, closed=False, bevel=0.0):
        """surface of revolution about axis through c: prof = [(radius, offset along the axis)]."""
        ax = Vector(axis).normalized()
        u = ax.cross(Vector((0, 1, 0))) if abs(ax.y) < 0.9 else ax.cross(Vector((1, 0, 0)))
        u.normalize(); v = ax.cross(u)
        rings = [[tuple(Vector(c) + ax * t + (u * math.cos(2 * math.pi * i / seg) + v * math.sin(2 * math.pi * i / seg)) * r)
                  for i in range(seg)] for r, t in prof]
        return self._mesh(part, lambda bm: self._rings(bm, rings, closed=closed), bevel)
    def wing(self, part, secs, thick=0.12, vertical=False, npts=9):
        """an airfoil lofted along the span: secs = [(span position, x of the leading edge, chord, offset)].
        Horizontal: span along z, offset = y. Vertical (fins): span along y, offset = z."""
        xs = [0.5 - 0.5 * math.cos(math.pi * k / npts) for k in range(npts + 1)]
        t = lambda x: 5 * thick * (0.2969 * math.sqrt(x) - 0.126 * x - 0.3516 * x * x + 0.2843 * x ** 3 - 0.1036 * x ** 4)
        prof = [(x, t(x)) for x in reversed(xs)] + [(x, -t(x)) for x in xs[1:-1]]
        rings = []
        for sp, le, ch, off in secs:
            ch = max(ch, 1e-3)
            if vertical: rings.append([(le - x * ch, sp, off + y * ch) for x, y in prof])
            else: rings.append([(le - x * ch, off + y * ch, sp) for x, y in prof])
        return self._mesh(part, lambda bm: self._rings(bm, rings))
    def arc(self, part, c, r0, r1, w, a0, a1, n=12, bevel=0.0):
        """a curved strip round an axle along z (mudguards): radii r0..r1, width w, angles a0..a1 (0 = forward, pi/2 = up)."""
        x, y, z = c
        rings = []
        for i in range(n + 1):
            a = a0 + (a1 - a0) * i / n; ca, sa = math.cos(a), math.sin(a)
            rings.append([(x + ca * r0, y + sa * r0, z - w / 2), (x + ca * r1, y + sa * r1, z - w / 2),
                          (x + ca * r1, y + sa * r1, z + w / 2), (x + ca * r0, y + sa * r0, z + w / 2)])
        return self._mesh(part, lambda bm: self._rings(bm, rings), bevel)
    def tyre(self, c, r, w, tread=True, hub_part='main', nuts=6, dual=False):
        """a rounded tyre with chevron tread and a dished combat rim with nuts; axle along z."""
        x, y, z = c; s = 1 if z >= 0 else -1
        pr = [(r * 0.6, -w / 2), (r * 0.9, -w / 2), (r * 0.98, -w * 0.42), (r, -w * 0.25), (r, w * 0.25), (r * 0.98, w * 0.42), (r * 0.9, w / 2), (r * 0.6, w / 2)]
        self.lathe('dark', pr, c, (0, 0, 1), seg=32, closed=True)
        if tread:
            for i in range(20):
                a = i / 20 * 2 * math.pi
                for k in (-1, 1):
                    self.box('dark', (x + math.cos(a) * r, y + math.sin(a) * r, z + k * w * 0.2), (r * 0.12, r * 0.07, w * 0.38), pitch=a, yaw=k * 0.45, bevel=0.0)
        self.lathe(hub_part, [(r * 0.6, s * w * 0.3), (r * 0.58, s * w * 0.42), (r * 0.3, s * w * 0.46), (r * 0.22, s * w * 0.58), (0.0, s * w * 0.6)], c, (0, 0, 1), seg=24)
        for i in range(nuts):
            a = i / nuts * 2 * math.pi
            self.cyl(hub_part, (x + math.cos(a) * r * 0.4, y + math.sin(a) * r * 0.4, z + s * w * 0.44), (x + math.cos(a) * r * 0.4, y + math.sin(a) * r * 0.4, z + s * w * 0.52), r * 0.05, seg=6)
    def headlamp(self, c, r=0.06, facing=(1, 0, 0), guard=False):
        f = Vector(facing).normalized()
        self.lathe('main', [(0.0, -r * 1.2), (r * 0.7, -r * 1.1), (r * 1.1, -r * 0.3), (r * 1.15, 0.0), (r * 0.95, r * 0.05)], c, f, seg=20)
        self.lathe(LIGHT, [(r * 0.95, r * 0.03), (r * 0.6, r * 0.2), (0.0, r * 0.25)], c, f, seg=20)
        if guard:
            for k in (-0.6, 0, 0.6): self.cyl('main', tuple(Vector(c) + f * r * 1.6 + Vector((0, k * r, 0))), tuple(Vector(c) + f * r * 1.6 + Vector((0, k * r, 0)) - Vector((0, r * 1.5, 0))), 0.008, seg=5)
    def star(self, c, r, normal=(0, 1, 0), up=(1, 0, 0), colour=WHITE):
        """a flat five-pointed star painted on a panel."""
        n = Vector(normal).normalized(); u = Vector(up); u = (u - n * u.dot(n)).normalized(); v = n.cross(u)
        pts = []
        for i in range(10):
            a = i / 10 * 2 * math.pi; rr = r if i % 2 == 0 else r * 0.4
            pts.append(Vector(c) + (u * math.cos(a) + v * math.sin(a)) * rr)
        def build(bm):
            top = [bm.verts.new(G(*(p + n * 0.004))) for p in pts]; bot = [bm.verts.new(G(*(p - n * 0.002))) for p in pts]
            cen_t = bm.verts.new(G(*(Vector(c) + n * 0.004))); cen_b = bm.verts.new(G(*(Vector(c) - n * 0.002)))
            for i in range(10):
                j = (i + 1) % 10
                bm.faces.new([cen_t, top[i], top[j]]); bm.faces.new([cen_b, bot[j], bot[i]]); bm.faces.new([top[i], bot[i], bot[j], top[j]])
        return self._mesh(colour, build)
    def prop(self, part, c, r, blades=3, axis=(1, 0, 0), spinner=None):
        """propeller: a spinner and twisted, tapered blades."""
        ax = Vector(axis).normalized()
        sp = spinner or r * 0.18
        self.lathe('main', [(sp, 0.0), (sp * 0.95, sp * 0.5), (sp * 0.6, sp * 1.1), (0.0, sp * 1.6)], c, ax, seg=20)
        u = ax.cross(Vector((0, 1, 0))) if abs(ax.y) < 0.9 else Vector((0, 0, 1)); u.normalize(); v = ax.cross(u)
        aB = G(*ax)
        for i in range(blades):
            a = i / blades * 2 * math.pi + 0.3
            d = u * math.cos(a) + v * math.sin(a); dB = G(*d)
            base = Vector(c) + ax * sp * 0.4
            for k in range(3):
                t0, t1 = sp * 0.8 + (r - sp) * k / 3, sp * 0.8 + (r - sp) * (k + 1) / 3
                wdt = r * (0.17 - 0.035 * k); tw = 0.55 - 0.15 * k
                xB = aB * math.cos(tw) + aB.cross(dB) * math.sin(tw); yB = dB.cross(xB)
                bpy.ops.mesh.primitive_cube_add(size=1, location=G(*(base + d * (t0 + t1) / 2)))
                o = bpy.context.active_object
                o.rotation_mode = 'QUATERNION'; o.rotation_quaternion = Matrix((xB, yB, dB)).transposed().to_quaternion()
                o.scale = (0.014, wdt, t1 - t0 + 0.006)
                self._put(part, o, 0.004)
    def track_loop(self, pts, z, w, pitch=0.075, part='dark'):
        """a track belt of links along a closed side-view path pts [(x, y)] at lateral position z."""
        P_ = [Vector((x, y)) for x, y in pts]
        segs = list(zip(P_, P_[1:] + P_[:1]))
        total = sum((b - a).length for a, b in segs)
        n = int(total / pitch)
        step = total / n; k = 0.0; si = 0; acc = 0.0
        for i in range(n):
            d = i * step
            while si < len(segs) and acc + (segs[si][1] - segs[si][0]).length < d: acc += (segs[si][1] - segs[si][0]).length; si += 1
            a, b = segs[min(si, len(segs) - 1)]
            t = (d - acc) / max((b - a).length, 1e-6); p = a + (b - a) * t; dv = (b - a).normalized()
            ang = math.atan2(dv.y, dv.x)
            self.box(part, (p.x, p.y, z), (pitch * 0.82, 0.032, w), pitch=ang, bevel=0.0)
            nrm = Vector((dv.y, -dv.x))                       # outside of the loop (path runs clockwise in side view)
            self.box(part, (p.x + nrm.x * 0.02, p.y + nrm.y * 0.02, z), (0.018, 0.014, w * 0.95), pitch=ang, bevel=0.0)   # grouser

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
def seat(m, x, y, z, w=0.3, back=True):
    m.box('dark', (x, y, z), (0.28, 0.06, w), bevel=0.02)
    if back: m.box('dark', (x - 0.15, y + 0.13, z), (0.06, 0.26, w), bevel=0.02, pitch=0.15)

def steering(m, x, y, z):
    m.cyl('dark', (x + 0.14, y - 0.2, z), (x, y, z), 0.014, seg=8)
    m.torus('dark', (x, y, z), (0.55, 1, 0), 0.085, 0.011, seg=24)
    for a in (0, 2.1, 4.2): m.cyl('dark', (x, y, z), (x - 0.04 * math.cos(a), y + 0.07 * math.cos(a), z + 0.085 * math.sin(a)), 0.006, seg=5)

def jeep():
    """Willys MB: flat bonnet and slotted grille, flat fenders, tub body, folding windscreen,
    spare wheel and jerrycan at the back, a .30 cal on a pedestal."""
    m = Model('jeep')
    for z in (-0.3, 0.3): m.box('dark', (0, 0.3, z), (1.75, 0.07, 0.07), bevel=0.01)
    m.loft('main', [(-0.95, 0.36, 0.66, 0.36, 5), (-0.9, 0.34, 0.68, 0.43, 8), (0.22, 0.34, 0.68, 0.43, 10), (0.25, 0.36, 0.68, 0.43, 10)], bevel=0.01)
    m.box('dark', (-0.35, 0.683, 0), (1.05, 0.01, 0.74), bevel=0.0)                   # the open tub, from above
    for z in (-0.432, 0.432): m.box('dark', (-0.05, 0.6, z), (0.34, 0.14, 0.01), bevel=0.0)   # side cut-outs
    m.loft('main', [(0.22, 0.46, 0.73, 0.34, 10), (0.92, 0.46, 0.7, 0.34, 10)], bevel=0.01)   # bonnet
    m.box('main', (0.56, 0.735, 0), (0.62, 0.01, 0.02), bevel=0.0)                     # hinge
    m.box('main', (0.94, 0.53, 0), (0.05, 0.34, 0.66), bevel=0.015)                    # grille panel
    for k in range(9): m.box('dark', (0.965, 0.52, -0.16 + k * 0.04), (0.02, 0.2, 0.022), bevel=0.0)
    for z in (-0.24, 0.24): m.headlamp((0.965, 0.56, z), 0.045)
    for s in (1, -1):
        m.box('main', (0.6, 0.625, s * 0.445), (0.6, 0.022, 0.2), bevel=0.006)          # flat front fenders
        m.box('main', (0.95, 0.52, s * 0.445), (0.24, 0.022, 0.2), bevel=0.006, pitch=-0.85)
        m.arc('main', (-0.55, 0.24, s * 0.445), 0.28, 0.3, 0.18, 0.0, math.pi)         # rear arches
        m.box('main', (0.02, 0.4, s * 0.47), (0.5, 0.02, 0.1), bevel=0.004)            # step
    m.box('dark', (1.0, 0.31, 0), (0.07, 0.09, 1.0), bevel=0.012)                      # bumper
    for z in (-0.3, 0.3): m.torus('dark', (1.04, 0.31, z), (0, 0, 1), 0.035, 0.01, seg=10)
    for z in (-0.3, 0.3): m.box(RED, (-0.955, 0.58, z), (0.012, 0.05, 0.05), bevel=0.0)
    # windscreen folded up: frame, two panes, wiper
    fr = lambda c, sz: m.box('main', c, sz, bevel=0.006, pitch=-0.22)
    fr((0.27, 0.72, 0), (0.05, 0.05, 0.86)); fr((0.235, 1.03, 0), (0.04, 0.04, 0.86))
    for z in (-0.41, 0.0, 0.41): fr((0.252, 0.875, z), (0.035, 0.3, 0.035))
    for z in (-0.2, 0.2): m.box(GLASS, (0.252, 0.875, z), (0.012, 0.27, 0.37), bevel=0.0, pitch=-0.22)
    seat(m, -0.05, 0.72, -0.22); seat(m, -0.05, 0.72, 0.22); seat(m, -0.62, 0.72, 0, w=0.78)
    steering(m, 0.12, 0.9, -0.22)
    # spare wheel and jerrycan at the back, shovel and axe on the side
    m.lathe('dark', [(0.13, -0.08), (0.21, -0.08), (0.23, 0.0), (0.21, 0.08), (0.13, 0.08)], (-1.05, 0.56, 0), (1, 0, 0), seg=28, closed=True)
    m.lathe('main', [(0.13, -0.05), (0.06, -0.08), (0.0, -0.09)], (-1.05, 0.56, 0), (1, 0, 0), seg=20)
    m.jerrycan((-0.98, 0.52, 0.34), yaw=math.pi / 2)
    m.box('main', (-0.2, 0.55, -0.445), (0.55, 0.025, 0.02), bevel=0.004)
    m.box('main', (0.1, 0.55, -0.445), (0.1, 0.08, 0.02), bevel=0.004)
    # pedestal machine gun
    m.cyl('main', (-0.38, 0.68, 0), (-0.38, 1.0, 0), 0.028)
    m.mg((-0.36, 1.05, 0), 0.62)
    m.cyl('dark', (-0.9, 0.62, 0.38), (-0.9, 1.5, 0.38), 0.006, seg=6)
    m.star((0.6, 0.705, 0), 0.11)
    for x in (0.55, -0.55):
        for z in (-0.45, 0.45): m.tyre((x, 0.24, z), 0.24, 0.17)
    m.finish()

def ambulance():
    """Dodge WC54: rounded bonnet and fenders, cab, tall box body with red crosses."""
    m = Model('ambulance')
    for z in (-0.3, 0.3): m.box('dark', (0, 0.3, z), (1.8, 0.08, 0.08), bevel=0.01)
    m.loft('main', [(0.45, 0.5, 0.84, 0.31, 4), (0.8, 0.5, 0.8, 0.3, 3.5), (0.98, 0.5, 0.74, 0.27, 3)], seg=36)   # bonnet
    m.box('main', (0.99, 0.6, 0), (0.03, 0.24, 0.26), bevel=0.01)                      # grille
    for k in range(7): m.box('dark', (1.005, 0.6, -0.1 + k * 0.033), (0.015, 0.2, 0.015), bevel=0.0)
    for s in (1, -1):
        m.arc('main', (0.62, 0.26, s * 0.41), 0.29, 0.32, 0.2, -0.25, math.pi - 0.1)
        m.loft('main', [(0.52, 0.5, 0.64, 0.1, 3, s * 0.41), (0.92, 0.46, 0.6, 0.1, 3, s * 0.41)], seg=20)   # fender crown
        m.headlamp((0.86, 0.66, s * 0.36), 0.05)
        m.box('main', (0.0, 0.42, s * 0.47), (0.8, 0.025, 0.1), bevel=0.005)          # running board
        m.arc('main', (-0.58, 0.26, s * 0.49), 0.29, 0.32, 0.12, 0.0, math.pi)
    m.box('dark', (1.02, 0.34, 0), (0.07, 0.08, 1.0), bevel=0.012)
    m.loft('main', [(0.08, 0.46, 1.18, 0.48, 6), (0.49, 0.46, 1.12, 0.46, 5)], seg=36, bevel=0.01)   # cab
    for z in (-0.21, 0.21): m.box(GLASS, (0.495, 0.98, z), (0.012, 0.2, 0.36), bevel=0.0)
    for z in (-0.485, 0.485):
        m.box(GLASS, (0.3, 0.98, z), (0.28, 0.18, 0.012), bevel=0.0)
        m.box('dark', (0.14, 0.78, z * 1.005), (0.012, 0.42, 0.01), bevel=0.0)
    m.loft('main', [(-0.98, 0.5, 1.36, 0.5, 9), (0.1, 0.5, 1.36, 0.5, 9)], seg=40, bevel=0.01)   # box body
    for x in (-0.7, -0.3, 0.05):
        for z in (-0.505, 0.505): m.box('main', (x, 0.93, z), (0.02, 0.8, 0.012), bevel=0.0)
    m.box('dark', (-0.985, 0.92, 0), (0.012, 0.76, 0.01), bevel=0.0)
    for z in (-0.1, 0.1): m.box('dark', (-0.99, 0.92, z), (0.02, 0.03, 0.08), bevel=0.0)
    m.box('main', (-1.02, 0.44, 0), (0.1, 0.03, 0.7), bevel=0.008)
    for z in (-0.506, 0.506):
        m.box(WHITE, (-0.45, 0.95, z), (0.46, 0.46, 0.012), bevel=0.0)
        m.box(RED, (-0.45, 0.95, z * 1.004), (0.3, 0.09, 0.012), bevel=0.0); m.box(RED, (-0.45, 0.95, z * 1.004), (0.09, 0.3, 0.012), bevel=0.0)
        m.box(GLASS, (-0.05, 1.15, z), (0.14, 0.1, 0.012), bevel=0.0)
    m.box(WHITE, (-0.45, 1.362, 0), (0.46, 0.012, 0.46), bevel=0.0)
    m.box(RED, (-0.45, 1.37, 0), (0.3, 0.012, 0.09), bevel=0.0); m.box(RED, (-0.45, 1.37, 0), (0.09, 0.012, 0.3), bevel=0.0)
    m.cyl(BLUE, (0.3, 1.13, 0), (0.3, 1.2, 0), 0.05, seg=16)
    for x in (0.62, -0.58):
        for z in (-0.46, 0.46): m.tyre((x, 0.26, z), 0.26, 0.18)
    m.finish()

def engtruck():
    """engineers' truck (a short GMC 'Jimmy' with an open cab): bonnet and curved fenders with a
    brush guard, windscreen, bench seat, and a bed full of the sappers' kit."""
    m = Model('engtruck')
    for z in (-0.3, 0.3): m.box('dark', (0, 0.3, z), (1.9, 0.08, 0.08), bevel=0.01)
    m.loft('main', [(0.4, 0.48, 0.84, 0.3, 6), (0.98, 0.48, 0.8, 0.28, 5)], seg=32, bevel=0.01)   # bonnet
    m.box('main', (1.0, 0.62, 0), (0.03, 0.3, 0.5), bevel=0.01)
    for k in range(10): m.box('dark', (1.015, 0.62, -0.2 + k * 0.045), (0.015, 0.26, 0.02), bevel=0.0)
    for k in (-0.22, 0, 0.22): m.cyl('dark', (1.1, 0.4, k), (1.1, 0.82, k), 0.014, seg=6)   # brush guard
    m.cyl('dark', (1.1, 0.82, -0.26), (1.1, 0.82, 0.26), 0.014, seg=6)
    m.cyl('dark', (1.02, 0.4, -0.18), (1.02, 0.4, 0.18), 0.06, seg=16)                  # winch
    for s in (1, -1):
        m.arc('main', (0.62, 0.26, s * 0.41), 0.29, 0.32, 0.2, -0.25, math.pi - 0.1)
        m.headlamp((0.9, 0.66, s * 0.35), 0.05, guard=True)
        m.box('main', (0.2, 0.42, s * 0.47), (0.5, 0.025, 0.1), bevel=0.005)
    m.box('dark', (1.04, 0.32, 0), (0.07, 0.08, 1.0), bevel=0.012)
    # open cab: cowl, windscreen, doors, bench, wheel, the folded canvas top
    m.loft('main', [(0.22, 0.46, 0.92, 0.46, 6), (0.42, 0.46, 0.88, 0.44, 6)], seg=32, bevel=0.01)
    fr = lambda c, sz: m.box('main', c, sz, bevel=0.006, pitch=-0.15)
    fr((0.26, 1.2, 0), (0.035, 0.035, 0.9))
    for z in (-0.44, 0.0, 0.44): fr((0.25, 1.06, z), (0.03, 0.28, 0.03))
    for z in (-0.22, 0.22): m.box(GLASS, (0.25, 1.06, z), (0.01, 0.26, 0.42), bevel=0.0, pitch=-0.15)
    for z in (-0.46, 0.46): m.box('main', (0.02, 0.66, z), (0.4, 0.4, 0.03), bevel=0.01)
    m.box('dark', (-0.12, 0.52, 0), (0.42, 0.02, 0.88), bevel=0.0)
    seat(m, -0.08, 0.72, 0, w=0.84); steering(m, 0.14, 0.9, -0.2)
    m.cyl('dark', (-0.3, 0.95, -0.44), (-0.3, 0.95, 0.44), 0.07, seg=16)                   # folded top
    # bed with drop sides and stakes
    m.box('main', (-0.52, 0.52, 0), (0.9, 0.08, 0.98), bevel=0.02)
    for z in (-0.47, 0.47): m.box('main', (-0.52, 0.68, z), (0.9, 0.26, 0.04), bevel=0.01)
    m.box('main', (-0.96, 0.68, 0), (0.04, 0.26, 0.98), bevel=0.01)
    for x in (-0.9, -0.66, -0.42, -0.18):
        for z in (-0.48, 0.48): m.box('dark', (x, 0.68, z * 1.01), (0.03, 0.28, 0.02), bevel=0.0)
    for x, z in [(-0.8, -0.26), (-0.8, 0.02), (-0.58, -0.26)]:
        m.box('dark', (x, 0.66, z), (0.22, 0.18, 0.22), bevel=0.015)
        m.box('#e8d44a', (x, 0.66, z - 0.111), (0.12, 0.05, 0.01), bevel=0.0)
    for k in range(3): m.box('dark', (-0.4, 0.6 + k * 0.05, 0.3), (0.8, 0.04, 0.05), bevel=0.004)
    m.cyl('main', (-0.3, 0.64, -0.2), (-0.3, 0.64, -0.02), 0.13, seg=20, bevel=0.01)
    m.cyl('dark', (-0.3, 0.64, -0.19), (-0.3, 0.64, -0.03), 0.09, seg=20)
    for z in (-0.51, 0.51):
        m.box('dark', (-0.5, 0.68, z), (0.5, 0.025, 0.02), bevel=0.0)
        m.box('dark', (-0.22, 0.68, z), (0.1, 0.09, 0.015), bevel=0.005)
    m.cyl('dark', (0.3, 0.9, 0.42), (0.3, 1.6, 0.42), 0.006, seg=6)
    for x in (0.62, -0.55):
        for z in (-0.46, 0.46): m.tyre((x, 0.26, z), 0.26, 0.18)
    m.finish()

def apc():
    """M8 Greyhound armoured car: six wheels, a low sloped hull, fenders with stowage and an
    open-topped turret with a 37 mm gun and a .50 cal."""
    m = Model('apc')
    for z in (-0.3, 0.3): m.box('dark', (0, 0.3, z), (1.9, 0.08, 0.08), bevel=0.01)
    m.prism('main', [(-1.0, 0.32), (0.72, 0.32), (1.03, 0.52), (0.96, 0.6), (0.6, 0.8), (-0.88, 0.82), (-1.02, 0.64)], -0.4, 0.4, 0.03)
    for s in (1, -1):
        m.box('main', (-0.02, 0.57, s * 0.52), (1.9, 0.03, 0.25), bevel=0.008)           # fenders over the wheels
        m.box('main', (0.97, 0.47, s * 0.52), (0.16, 0.03, 0.25), bevel=0.006, pitch=-0.9)
        m.box('main', (-0.99, 0.47, s * 0.52), (0.14, 0.03, 0.25), bevel=0.006, pitch=0.9)
        for x in (-0.55, 0.15): m.box('main', (x, 0.63, s * 0.52), (0.36, 0.1, 0.18), bevel=0.012)   # stowage boxes
        m.box('dark', (0.52, 0.63, s * 0.5), (0.16, 0.06, 0.12), bevel=0.008)          # mines in their rack
        m.headlamp((0.99, 0.6, s * 0.3), 0.04, guard=True)
        m.rivets('main', (-0.8, 0.79, s * 0.405), (0.5, 0.79, s * 0.405), 10, normal=(0, 0, s))
    for z in (-0.18, 0.18):                                                            # driver's visors on the glacis
        m.box('main', (0.78, 0.73, z), (0.2, 0.03, 0.22), bevel=0.01, pitch=-0.56)
        m.box('dark', (0.82, 0.72, z), (0.02, 0.012, 0.16), bevel=0.0, pitch=-0.56)
    m.jerrycan((-0.95, 0.72, 0.25), yaw=math.pi / 2); m.jerrycan((-0.95, 0.72, -0.25), yaw=math.pi / 2)
    # open-topped turret: a thin armoured ring with the gun
    m.lathe('main', [(0.34, 0.0), (0.36, 0.0), (0.34, 0.3), (0.31, 0.3), (0.32, 0.02)], (-0.12, 0.8, 0), (0, 1, 0), seg=40, closed=True)
    m.cyl('dark', (-0.12, 0.8, 0), (-0.12, 0.83, 0), 0.32, seg=32)
    m.box('main', (0.23, 0.97, 0), (0.12, 0.2, 0.26), bevel=0.03)                      # mantlet
    m.lathe('main', [(0.045, 0.0), (0.04, 0.2), (0.032, 0.25), (0.032, 0.98), (0.04, 1.0), (0.0, 1.0)], (0.26, 0.98, 0.0), (1, 0, 0), seg=16)
    m.cyl('dark', (0.28, 0.95, 0.09), (0.55, 0.95, 0.09), 0.012, seg=8)                # coaxial MG
    m.cyl('main', (-0.42, 1.1, 0), (-0.42, 1.22, 0), 0.02, seg=8)
    m.mg((-0.4, 1.26, 0), 0.6)
    m.cyl('dark', (-0.8, 0.82, -0.3), (-0.8, 1.6, -0.3), 0.006, seg=6)
    for x in (0.62, -0.28, -0.72):
        for z in (-0.52, 0.52): m.tyre((x, 0.25, z), 0.25, 0.17)
    m.finish()

def amphib():
    """DUKW: a boat hull on six wheels, open cab with windscreen, cargo well, rails, life rings,
    a ring-mounted .50 cal, propeller and rudder."""
    m = Model('amphib')
    m.loft('main', [(-1.05, 0.36, 0.9, 0.42, 6), (-0.85, 0.3, 0.92, 0.5, 7), (0.5, 0.3, 0.92, 0.5, 7), (0.85, 0.42, 0.92, 0.43, 5),
                    (1.05, 0.62, 0.93, 0.3, 4), (1.1, 0.78, 0.93, 0.18, 3)], seg=36, bevel=0.01)
    m.box('dark', (-0.4, 0.925, 0), (1.05, 0.012, 0.86), bevel=0.0)                  # cargo well from above
    m.box('main', (0.7, 1.0, 0), (0.03, 0.16, 0.66), bevel=0.01, pitch=0.5)          # breakwater
    for z in (-0.5, 0.5):
        m.cyl('main', (-0.95, 1.08, z), (0.25, 1.08, z), 0.016, seg=8)                  # rails
        for x in (-0.9, -0.5, -0.1, 0.2): m.cyl('main', (x, 0.92, z), (x, 1.08, z), 0.013, seg=6)
        m.torus(WHITE, (-0.6, 0.76, z * 1.03), (0, 0, 1), 0.12, 0.035, seg=20)
    fr = lambda c, sz: m.box('main', c, sz, bevel=0.006, pitch=-0.22)
    fr((0.36, 1.24, 0), (0.035, 0.035, 0.9))
    for z in (-0.44, 0.0, 0.44): fr((0.38, 1.1, z), (0.03, 0.28, 0.03))
    for z in (-0.22, 0.22): m.box(GLASS, (0.38, 1.1, z), (0.01, 0.26, 0.42), bevel=0.0, pitch=-0.22)
    seat(m, 0.12, 0.96, 0, w=0.84); steering(m, 0.3, 1.1, -0.2)
    for z in (-0.3, 0.3): m.headlamp((1.0, 0.86, z), 0.04)
    # ring mount .50 cal over the cargo well
    m.torus('main', (-0.45, 1.3, 0), (0, 1, 0), 0.28, 0.02, seg=32)
    for a in (0.8, 2.35, 3.9, 5.5): m.cyl('main', (-0.45 + math.cos(a) * 0.28, 0.93, math.sin(a) * 0.28), (-0.45 + math.cos(a) * 0.28, 1.3, math.sin(a) * 0.28), 0.015, seg=6)
    m.mg((-0.22, 1.36, 0), 0.62)
    # propeller in its tunnel, rudder, winch at the stern
    m.cyl('dark', (-1.0, 0.36, 0), (-1.16, 0.36, 0), 0.03)
    for a in (0.3, 2.4, 4.5): m.box('dark', (-1.17, 0.36 + math.sin(a) * 0.07, math.cos(a) * 0.07), (0.03, 0.12, 0.05), bevel=0.005, roll=a)
    m.box('dark', (-1.24, 0.38, 0), (0.06, 0.24, 0.02), bevel=0.005)
    m.cyl('dark', (-0.98, 0.98, -0.15), (-0.98, 0.98, 0.15), 0.06, seg=14)
    for x in (0.6, -0.25, -0.65):
        for z in (-0.47, 0.47): m.tyre((x, 0.21, z), 0.21, 0.15)
    m.finish()

def bogie(m, x, z, s):
    """one Sherman VVSS bogie: bracket, volute springs, two road wheels, return roller on top."""
    m.box('main', (x, 0.28, z - s * 0.02), (0.3, 0.18, 0.09), bevel=0.025)
    for k in (-1, 1): m.cyl('main', (x + k * 0.05, 0.14, z + s * 0.02), (x + k * 0.05, 0.28, z + s * 0.02), 0.035, seg=10)   # springs
    for k in (-1, 1):
        c = (x + k * 0.155, 0.135, z)
        for zz in (z - 0.08, z + 0.08):
            m.lathe('main', [(0.0, -0.045), (0.1, -0.045), (0.125, -0.03), (0.125, 0.03), (0.1, 0.045), (0.0, 0.045)], (c[0], c[1], zz), (0, 0, 1), seg=24)
            for i in range(6):                                                         # spokes
                a = i / 6 * 2 * math.pi
                m.box('main', (c[0] + math.cos(a) * 0.05, c[1] + math.sin(a) * 0.05, zz + (0.047 if zz > z else -0.047)), (0.07, 0.018, 0.006), pitch=a, bevel=0.0)
    m.lathe('main', [(0.0, -0.06), (0.05, -0.06), (0.05, 0.06), (0.0, 0.06)], (x - 0.06, 0.52, z), (0, 0, 1), seg=14)
    m.box('main', (x - 0.02, 0.42, z - s * 0.03), (0.06, 0.18, 0.05), bevel=0.01)

def tank():
    """M4 Sherman: VVSS bogies, sprocket and idler under a belt of track links, rounded
    three-piece nose, sloped glacis with hatches and headlight guards, sponsons, engine deck,
    a cast rounded turret with the 75 mm gun, cupola, .50 cal and stowage."""
    m = Model('tank')
    for s in (1, -1):
        z = s * 0.62
        for bx in (-0.72, 0.0, 0.72): bogie(m, bx, z, s)
        # drive sprocket at the front, idler at the back
        m.lathe('main', [(0.0, -0.08), (0.16, -0.08), (0.16, 0.08), (0.0, 0.08)], (1.12, 0.44, z), (0, 0, 1), seg=26)
        for i in range(13):
            a = i / 13 * 2 * math.pi
            m.box('main', (1.12 + math.cos(a) * 0.17, 0.44 + math.sin(a) * 0.17, z), (0.04, 0.05, 0.14), pitch=a, bevel=0.004)
        m.lathe('main', [(0.0, -0.08), (0.14, -0.08), (0.15, 0.0), (0.14, 0.08), (0.0, 0.08)], (-1.18, 0.3, z), (0, 0, 1), seg=24)
        path = [(-0.95, 0.035), (0.85, 0.035)]
        path += [(1.12 + math.cos(a) * 0.205, 0.44 + math.sin(a) * 0.205) for a in [-1.9 + k * (3.4 / 8) for k in range(9)]]
        path += [(0.6, 0.6), (0.0, 0.6), (-0.6, 0.6), (-0.95, 0.53)]
        path += [(-1.18 + math.cos(a) * 0.185, 0.3 + math.sin(a) * 0.185) for a in [1.4 + k * (2.9 / 6) for k in range(7)]]
        m.track_loop(path, z, 0.3)
    # lower hull, rounded differential housing (bolted three-piece nose)
    m.loft('main', [(-1.22, 0.2, 0.62, 0.45, 8), (0.95, 0.2, 0.62, 0.45, 8)], bevel=0.01)
    m.loft('main', [(0.9, 0.22, 0.66, 0.47, 6), (1.12, 0.25, 0.66, 0.46, 5), (1.28, 0.34, 0.64, 0.43, 4), (1.35, 0.48, 0.64, 0.38, 3)], seg=36)
    for x in (1.07, 1.2): m.box('main', (x, 0.44, 0), (0.025, 0.4, 0.9), bevel=0.008)
    # upper hull with sponsons over the tracks; the glacis slopes down to the nose
    m.loft('main', [(-1.3, 0.6, 0.86, 0.72, 10), (-1.2, 0.58, 0.92, 0.76, 12), (0.5, 0.58, 0.95, 0.76, 12), (0.9, 0.58, 0.8, 0.76, 12), (1.3, 0.58, 0.64, 0.74, 12)], bevel=0.012)
    gl = 0.37
    for z in (-0.25, 0.25):
        m.box('main', (0.62, 0.92, z), (0.26, 0.04, 0.24), bevel=0.02, pitch=-gl)        # driver hatches
        for k in (-0.06, 0.06): m.box('dark', (0.52, 0.965, z + k), (0.03, 0.05, 0.03), bevel=0.0)   # periscopes
    m.lathe('main', [(0.0, -0.03), (0.07, -0.02), (0.085, 0.03), (0.06, 0.07), (0.0, 0.08)], (1.02, 0.77, 0.28), (math.cos(gl), math.sin(gl), 0), seg=18)   # bow MG ball
    m.cyl('dark', (1.08, 0.79, 0.28), (1.26, 0.72, 0.28), 0.014, seg=8)
    for s in (1, -1):
        m.headlamp((1.22, 0.71, s * 0.58), 0.045, facing=(1, 0.2, 0), guard=True)
        m.box('main', (1.33, 0.52, s * 0.3), (0.06, 0.08, 0.05), bevel=0.01)          # tow shackles
        m.box('main', (-0.3, 0.9, s * 0.77), (0.8, 0.025, 0.03), bevel=0.004)          # tools on the sponsons
        m.box('main', (0.2, 0.9, s * 0.77), (0.14, 0.05, 0.03), bevel=0.004)
    for k in range(8): m.box('dark', (-0.95 + k * 0.05, 0.925, 0), (0.02, 0.012, 0.9), bevel=0.0)   # engine deck grilles
    for z in (-0.4, 0.4): m.cyl('main', (-0.6, 0.92, z), (-0.6, 0.95, z), 0.05, seg=16)   # fuel caps
    m.box('main', (-1.33, 0.72, 0), (0.05, 0.26, 1.2), bevel=0.01)                       # exhaust deflector
    m.cyl('dark', (-1.15, 0.95, -0.5), (-1.15, 0.95, 0.5), 0.07, seg=16)                  # tarpaulin roll
    for z in (-0.3, 0.3): m.jerrycan((-0.95, 1.05, z), yaw=math.pi / 2)
    # cast turret (centred at x -0.12): rounded body, mantlet, 75 mm gun
    m.loft('main', [(-0.72, 0.95, 1.2, 0.34, 2.4), (-0.62, 0.93, 1.29, 0.46, 2.6), (-0.2, 0.93, 1.34, 0.53, 2.7),
                    (0.2, 0.93, 1.3, 0.5, 2.6), (0.4, 0.95, 1.2, 0.38, 2.4)], seg=44)
    m.lathe('main', [(0.53, -0.02), (0.55, 0.0), (0.55, 0.05), (0.0, 0.05)], (-0.12, 0.9, 0), (0, 1, 0), seg=40)
    m.loft('main', [(0.34, 0.96, 1.24, 0.3, 3), (0.5, 0.98, 1.2, 0.28, 3), (0.54, 1.0, 1.18, 0.22, 3)], seg=28)   # mantlet
    m.lathe('main', [(0.06, 0.0), (0.055, 0.25), (0.045, 0.3), (0.045, 1.5), (0.052, 1.52), (0.052, 1.58), (0.0, 1.58)], (0.52, 1.09, 0), (1, 0, 0), seg=18)
    m.cyl('dark', (0.54, 1.07, -0.14), (0.66, 1.07, -0.14), 0.012, seg=8)
    # commander's cupola with the hatch open, loader's hatch, .50 cal, periscopes, aerial, bustle
    m.lathe('main', [(0.2, 0.0), (0.2, 0.06), (0.15, 0.06), (0.15, 0.0)], (-0.35, 1.3, 0.2), (0, 1, 0), seg=28, closed=True)
    m.box('main', (-0.52, 1.5, 0.2), (0.03, 0.34, 0.3), bevel=0.01)
    m.cyl('main', (-0.3, 1.33, -0.2), (-0.3, 1.36, -0.2), 0.13, seg=24, bevel=0.01)
    m.cyl('main', (-0.58, 1.3, -0.05), (-0.58, 1.45, -0.05), 0.02, seg=8)
    m.mg((-0.56, 1.49, -0.05), 0.55)
    for x, z in ((0.05, -0.3), (0.12, 0.25)): m.box('dark', (x, 1.33, z), (0.06, 0.06, 0.05), bevel=0.005)
    m.box('main', (-0.78, 1.1, 0), (0.12, 0.16, 0.5), bevel=0.03)
    m.cyl('dark', (-0.6, 1.25, -0.4), (-0.6, 2.1, -0.4), 0.007, seg=6)
    m.finish()

def rockets():
    """Studebaker US6 with a BM-13 'Katyusha' launcher: cab and bonnet, six wheels, eight rails
    with sixteen rockets on a raised frame, and stabiliser jacks."""
    m = Model('rockets')
    for z in (-0.3, 0.3): m.box('dark', (0, 0.34, z), (2.5, 0.1, 0.08), bevel=0.01)
    m.loft('main', [(0.75, 0.52, 0.88, 0.33, 5), (1.3, 0.52, 0.84, 0.3, 4)], seg=32, bevel=0.01)   # bonnet
    m.box('main', (1.32, 0.66, 0), (0.03, 0.3, 0.5), bevel=0.01)
    for k in range(9): m.box('dark', (1.335, 0.66, -0.2 + k * 0.05), (0.015, 0.26, 0.02), bevel=0.0)
    for s in (1, -1):
        m.arc('main', (0.95, 0.28, s * 0.43), 0.3, 0.33, 0.2, -0.25, math.pi - 0.1)
        m.headlamp((1.2, 0.72, s * 0.36), 0.05)
        m.box('main', (0.45, 0.46, s * 0.48), (0.4, 0.025, 0.1), bevel=0.005)
    m.box('dark', (1.38, 0.38, 0), (0.07, 0.08, 1.0), bevel=0.012)
    m.loft('main', [(0.3, 0.48, 1.22, 0.5, 6), (0.77, 0.48, 1.16, 0.48, 5)], seg=36, bevel=0.01)   # cab
    for z in (-0.22, 0.22): m.box(GLASS, (0.775, 1.0, z), (0.012, 0.2, 0.38), bevel=0.0)
    for z in (-0.505, 0.505): m.box(GLASS, (0.55, 1.0, z), (0.3, 0.18, 0.012), bevel=0.0)
    m.box('main', (-0.55, 0.5, 0), (1.6, 0.1, 0.96), bevel=0.02)                          # frame deck
    # launcher: eight I-beam rails on a tilted frame, rockets riding on top and hanging below
    tilt, px, py = 0.38, -0.45, 0.95
    ct, st = math.cos(tilt), math.sin(tilt)
    at = lambda x, y: (px + x * ct - y * st, py + x * st + y * ct)
    for c in range(8):
        z = -0.42 + c * 0.12
        x0, y0 = at(0, 0.1)
        m.box('dark', (x0, y0, z), (1.6, 0.012, 0.05), pitch=tilt, bevel=0.0)             # flanges and web
        m.box('dark', (at(0, 0.14)[0], at(0, 0.14)[1], z), (1.6, 0.012, 0.05), pitch=tilt, bevel=0.0)
        m.box('dark', (at(0, 0.12)[0], at(0, 0.12)[1], z), (1.6, 0.04, 0.01), pitch=tilt, bevel=0.0)
        for k, off in ((0, 0.2), (1, 0.04)):
            a, b = at(-0.72, off), at(0.62, off)
            m.lathe('main', [(0.0, 0.0), (0.035, 0.02), (0.038, 0.1), (0.038, 1.05), (0.05, 1.12), (0.052, 1.25), (0.03, 1.33), (0.0, 1.36)],
                    (a[0], a[1], z), (ct, st, 0), seg=14)
            for q in range(4):
                g = q * math.pi / 2 + 0.785
                m.box('main', (a[0] + 0.04 * ct, a[1] + 0.04 * st + math.sin(g) * 0.04, z + math.cos(g) * 0.04), (0.08, 0.006, 0.03), pitch=tilt, roll=g, bevel=0.0)
    for k in (-0.6, 0.1, 0.6):
        xa, ya = at(k, 0.06)
        m.box('main', (xa, ya, 0), (0.06, 0.06, 1.0), bevel=0.01, pitch=tilt)
    m.box('main', (-0.5, 0.74, 0), (0.18, 0.38, 0.5), bevel=0.02)
    m.cyl('dark', (-0.8, 0.58, 0), (-0.28, 0.98, 0), 0.03)
    for z in (-0.5, 0.5):
        m.cyl('main', (-1.2, 0.5, z), (-1.3, 0.08, z * 1.12), 0.035)
        m.cyl('main', (-1.3, 0.06, z * 1.12), (-1.3, 0.02, z * 1.12), 0.08)
    for x in (0.95, -0.35, -0.85):
        for z in (-0.5, 0.5): m.tyre((x, 0.28, z), 0.28, 0.19)
    m.finish()

def heli():
    """a Sikorsky R-4-style helicopter: glazed 'fishbowl' cabin, fabric tail boom, three-blade
    rotor, tail rotor, fixed wheels - armed for the game with door guns and rocket tubes."""
    m = Model('heli')
    m.loft('main', [(-0.45, -0.3, 0.3, 0.3, 2.3), (-0.2, -0.4, 0.38, 0.4, 2.4), (0.3, -0.42, 0.36, 0.42, 2.4), (0.45, -0.4, 0.34, 0.4, 2.3)], seg=36)
    m.loft(GLASS, [(0.44, -0.39, 0.33, 0.39, 2.2), (0.72, -0.33, 0.28, 0.33, 2.1), (0.92, -0.2, 0.15, 0.2, 2.0), (1.0, -0.06, 0.02, 0.06, 2.0)], seg=32)
    for k, (x, y0, y1, hw) in enumerate([(0.6, -0.37, 0.31, 0.37), (0.8, -0.28, 0.23, 0.28)]):   # glazing frames
        m.lathe('main', [(1.0, -0.008), (1.0, 0.008)], (x, (y0 + y1) / 2, 0), (1, 0, 0), seg=32, closed=True).scale = (1, hw * 1.03, (y1 - y0) / 2 * 1.03)
    for a in (0.0, 1.2, -1.2):
        pts = [(x, 0.0 + math.sin(a) * h, math.cos(a) * h) for x, h in ((0.45, 0.39), (0.72, 0.33), (0.92, 0.19), (1.0, 0.05))]
        for p0, p1 in zip(pts, pts[1:]): m.cyl('main', p0, p1, 0.01, seg=6)
    m.loft('main', [(-0.45, -0.18, 0.28, 0.24, 2.2), (-1.0, 0.02, 0.3, 0.13, 2.2), (-1.7, 0.2, 0.36, 0.06, 2.1), (-1.9, 0.3, 0.42, 0.035, 2.0)], seg=24)
    for x in (-0.7, -1.0, -1.3, -1.6): m.torus('main', (x, 0.1 + (-0.7 - x) * 0.2, 0), (1, 0.12, 0), 0.1 - (-0.7 - x) * 0.05, 0.008, seg=18)
    m.wing('main', [(0.4, -1.75, 0.2, 0.34), (0.0, -1.7, 0.25, 0.34), (-0.4, -1.75, 0.2, 0.34)], thick=0.1)   # tailplane
    m.box('main', (-1.86, 0.45, 0.03), (0.06, 0.08, 0.06), bevel=0.01)                # tail rotor gearbox
    m.loft('main', [(-0.3, 0.3, 0.52, 0.22, 3), (0.45, 0.3, 0.5, 0.2, 2.6), (0.6, 0.3, 0.42, 0.12, 2.2)], seg=28)   # engine / gearbox fairing
    m.cyl('main', (0.3, 0.5, 0), (0.3, 0.7, 0), 0.05)                                 # rotor mast
    for k in range(5): m.box('dark', (-0.1 + k * 0.08, 0.47, 0.215), (0.02, 0.08, 0.01), bevel=0.0)
    # wheels on struts
    for z in (-0.42, 0.42):
        m.cyl('main', (0.1, -0.38, z * 0.7), (0.1, -0.52, z), 0.02, seg=8)
        m.cyl('main', (-0.25, -0.35, z * 0.6), (0.1, -0.52, z), 0.02, seg=8)
        m.lathe('dark', [(0.04, -0.03), (0.08, -0.03), (0.09, 0.0), (0.08, 0.03), (0.04, 0.03)], (0.1, -0.55, z), (0, 0, 1), seg=18, closed=True)
    m.cyl('main', (-1.1, 0.02, 0), (-1.1, -0.2, 0), 0.015, seg=6)
    m.lathe('dark', [(0.02, -0.02), (0.05, -0.02), (0.05, 0.02), (0.02, 0.02)], (-1.1, -0.23, 0), (0, 0, 1), seg=14, closed=True)
    # door guns and rocket tubes on stub pylons
    for z in (-0.42, 0.42):
        m.box('main', (0.1, -0.1, z * 1.05), (0.2, 0.04, 0.2), bevel=0.01)
        m.cyl('dark', (-0.1, -0.16, z * 1.25), (0.45, -0.16, z * 1.25), 0.045, seg=14)
        m.cyl('dark', (-0.1, -0.16, z * 1.25), (-0.02, -0.16, z * 1.25), 0.06, seg=14)
        m.mg((0.05, 0.06, z * 1.02), 0.45)
    # main rotor (around its own hub) and tail rotor
    m.cyl('rotor', (0, -0.04, 0), (0, 0.07, 0), 0.1, seg=20, bevel=0.01)
    for i in range(3):
        a = i / 3 * 2 * math.pi
        m.box('rotor', (math.cos(a) * 0.1, 0.02, math.sin(a) * 0.1), (0.12, 0.04, 0.06), bevel=0.01, yaw=-a)
        m.box('rotor', (math.cos(a) * 0.8, 0.02, math.sin(a) * 0.8), (1.36, 0.02, 0.11), bevel=0.008, yaw=-a, roll=0.06)
    m.cyl('tail', (0, 0, -0.03), (0, 0, 0.03), 0.04, seg=14)
    for i in range(3):
        a = i / 3 * 2 * math.pi
        m.box('tail', (math.cos(a) * 0.14, math.sin(a) * 0.14, 0), (0.26, 0.05, 0.015), bevel=0.004, pitch=a)
    m.finish()

# ---- planes: fuselage along +x (thrust line at y = 0), wings flat ----------------------------
def fuselage(m, secs, part='main', seg=36):
    m.loft(part, secs, seg=seg)

def canopy(m, secs, frames=()):
    m.loft(GLASS, secs, seg=28)
    for x, y0, y1, hw in frames:
        m.lathe('main', [(1.0, -0.006), (1.0, 0.006)], (x, (y0 + y1) / 2, 0), (1, 0, 0), seg=28, closed=True).scale = (1, hw * 1.04, (y1 - y0) / 2 * 1.04)

def fighter():
    """P-51D Mustang: laminar-flow wing, belly radiator scoop, bubble canopy, four-blade prop."""
    m = Model('fighter')
    fuselage(m, [(0.92, -0.1, 0.1, 0.1, 2.2), (0.75, -0.13, 0.13, 0.12, 2.3), (0.4, -0.15, 0.15, 0.125, 2.3), (0.1, -0.17, 0.15, 0.12, 2.3),
                 (-0.25, -0.16, 0.14, 0.11, 2.3), (-0.55, -0.1, 0.12, 0.08, 2.2), (-0.8, -0.04, 0.1, 0.035, 2.1), (-0.92, 0.0, 0.08, 0.015, 2.0)])
    m.loft('main', [(0.15, -0.14, -0.1, 0.07, 2.4), (-0.05, -0.25, -0.1, 0.09, 3), (-0.35, -0.25, -0.1, 0.09, 3), (-0.55, -0.12, -0.06, 0.04, 2.4)], seg=24)   # belly scoop
    m.box('dark', (-0.02, -0.19, 0), (0.02, 0.1, 0.12), bevel=0.0)
    canopy(m, [(0.3, 0.12, 0.13, 0.07, 2), (0.18, 0.1, 0.26, 0.085, 2), (-0.05, 0.1, 0.27, 0.085, 2), (-0.22, 0.1, 0.17, 0.06, 2), (-0.32, 0.11, 0.12, 0.02, 2)],
           frames=[(0.2, 0.1, 0.25, 0.082)])
    m.wing('main', [(-1.1, 0.12, 0.15, -0.06), (-1.0, 0.18, 0.26, -0.065), (-0.5, 0.27, 0.42, -0.08), (0.0, 0.32, 0.55, -0.1),
                    (0.5, 0.27, 0.42, -0.08), (1.0, 0.18, 0.26, -0.065), (1.1, 0.12, 0.15, -0.06)], thick=0.13)
    m.wing('main', [(-0.4, -0.64, 0.12, 0.04), (-0.35, -0.6, 0.18, 0.04), (0.0, -0.58, 0.26, 0.04), (0.35, -0.6, 0.18, 0.04), (0.4, -0.64, 0.12, 0.04)], thick=0.1)
    m.wing('main', [(0.05, -0.56, 0.36, 0), (0.2, -0.66, 0.26, 0), (0.33, -0.76, 0.14, 0), (0.36, -0.8, 0.08, 0)], thick=0.1, vertical=True)   # fin
    m.box('dark', (-0.82, 0.18, 0), (0.005, 0.26, 0.022), bevel=0.0)                   # rudder hinge
    for s in (1, -1):
        for k in range(6): m.box('dark', (0.72 - k * 0.055, 0.05, s * 0.125), (0.035, 0.025, 0.02), bevel=0.004)   # exhaust stacks
        for k in range(3): m.cyl('dark', (0.38, -0.08, s * (0.45 + k * 0.06)), (0.5, -0.08, s * (0.45 + k * 0.06)), 0.012, seg=8)   # guns
        m.box('dark', (0.0, -0.09, s * 0.62), (0.3, 0.005, 0.005), bevel=0.0)          # aileron line
    m.prop('dark', (0.93, 0, 0), 0.37, blades=4, spinner=0.08)
    m.finish()

def attacker():
    """P-47 Thunderbolt: big radial cowling, deep fuselage, elliptical wing with eight guns,
    rockets and bombs underneath."""
    m = Model('attacker')
    m.lathe('main', [(0.14, 0.0), (0.2, 0.02), (0.21, 0.1), (0.2, 0.22), (0.19, 0.24)], (0.72, 0.0, 0), (-1, 0, 0), seg=36)   # cowling
    m.lathe('dark', [(0.0, 0.0), (0.14, 0.0), (0.14, 0.02)], (0.72, 0.0, 0), (-1, 0, 0), seg=28)
    for i in range(9):
        a = i / 9 * 2 * math.pi
        m.cyl('dark', (0.7, math.sin(a) * 0.1, math.cos(a) * 0.1), (0.72, math.sin(a) * 0.1, math.cos(a) * 0.1), 0.03, seg=8)   # cylinders
    fuselage(m, [(0.5, -0.2, 0.19, 0.19, 2.2), (0.2, -0.22, 0.2, 0.17, 2.4), (-0.2, -0.2, 0.18, 0.15, 2.4), (-0.55, -0.12, 0.15, 0.1, 2.3),
                 (-0.85, -0.05, 0.11, 0.04, 2.1), (-1.0, 0.0, 0.09, 0.015, 2.0)])
    canopy(m, [(0.25, 0.16, 0.17, 0.08, 2), (0.15, 0.14, 0.29, 0.09, 2), (-0.1, 0.14, 0.29, 0.09, 2), (-0.28, 0.14, 0.19, 0.06, 2), (-0.36, 0.15, 0.16, 0.02, 2)],
           frames=[(0.14, 0.14, 0.28, 0.088)])
    m.wing('main', [(-1.15, 0.05, 0.12, -0.04), (-1.05, 0.14, 0.3, -0.05), (-0.6, 0.24, 0.48, -0.08), (0.0, 0.3, 0.6, -0.12),
                    (0.6, 0.24, 0.48, -0.08), (1.05, 0.14, 0.3, -0.05), (1.15, 0.05, 0.12, -0.04)], thick=0.14)
    m.wing('main', [(-0.45, -0.72, 0.14, 0.05), (-0.38, -0.66, 0.22, 0.05), (0.0, -0.64, 0.3, 0.05), (0.38, -0.66, 0.22, 0.05), (0.45, -0.72, 0.14, 0.05)], thick=0.1)
    m.wing('main', [(0.05, -0.6, 0.4, 0), (0.22, -0.72, 0.28, 0), (0.36, -0.84, 0.15, 0), (0.39, -0.88, 0.08, 0)], thick=0.1, vertical=True)
    for s in (1, -1):
        for k in range(4): m.cyl('dark', (0.28, -0.1, s * (0.42 + k * 0.05)), (0.42, -0.1, s * (0.42 + k * 0.05)), 0.012, seg=8)
        for k in range(3):                                                              # HVAR rockets on rails
            z = s * (0.55 + k * 0.14)
            m.box('main', (0.05, -0.17, z), (0.2, 0.03, 0.012), bevel=0.0)
            m.lathe('dark', [(0.0, 0.0), (0.022, 0.03), (0.022, 0.26), (0.03, 0.3), (0.0, 0.36)], (-0.12, -0.21, z), (1, 0, 0), seg=10)
            for q in range(4):
                g = q * math.pi / 2 + 0.785
                m.box('dark', (-0.1, -0.21 + math.sin(g) * 0.03, z + math.cos(g) * 0.03), (0.06, 0.004, 0.03), roll=g, bevel=0.0)
        m.lathe('dark', [(0.0, 0.0), (0.05, 0.06), (0.06, 0.2), (0.04, 0.3), (0.0, 0.32)], (-0.2, -0.26, s * 0.28), (1, 0, 0), seg=16)   # bombs
        m.box('main', (-0.05, -0.2, s * 0.28), (0.15, 0.08, 0.015), bevel=0.0)
    m.prop('dark', (0.74, 0, 0), 0.42, blades=4, spinner=0.07)
    m.finish()

def nacelle(m, x, y, z, r, length, prop_r, blades=3):
    m.lathe('main', [(r * 0.7, 0.0), (r, 0.03), (r * 1.02, 0.12), (r, 0.2)], (x, y, z), (-1, 0, 0), seg=28)
    m.lathe('dark', [(0.0, 0.0), (r * 0.7, 0.0), (r * 0.7, 0.02)], (x, y, z), (-1, 0, 0), seg=24)
    m.loft('main', [(x - 0.18, y - r, y + r * 0.95, r * 0.98, 2.3, z), (x - length * 0.6, y - r * 0.9, y + r * 0.7, r * 0.8, 2.4, z), (x - length, y - r * 0.2, y + r * 0.3, r * 0.2, 2.2, z)], seg=24)
    m.prop('dark', (x + 0.01, y, z), prop_r, blades=blades, spinner=r * 0.45)

def bomber():
    """B-25 Mitchell: glazed nose, twin radial engines, high gull wing, twin fins, dorsal turret."""
    m = Model('bomber')
    fuselage(m, [(1.35, -0.14, 0.12, 0.13, 2.2), (1.1, -0.2, 0.2, 0.19, 2.5), (0.6, -0.23, 0.25, 0.21, 3), (-0.5, -0.21, 0.23, 0.19, 3),
                 (-1.1, -0.1, 0.18, 0.1, 2.6), (-1.4, -0.03, 0.12, 0.05, 2.2)], seg=40)
    m.loft(GLASS, [(1.3, -0.14, 0.12, 0.13, 2.2), (1.45, -0.1, 0.08, 0.09, 2.1), (1.55, -0.03, 0.02, 0.03, 2.0)], seg=28)   # glazed nose
    for x in (1.38, 1.46): m.lathe('main', [(1.0, -0.005), (1.0, 0.005)], (x, -0.02, 0), (1, 0, 0), seg=24, closed=True).scale = (1, 0.11 if x < 1.4 else 0.07, 0.11 if x < 1.4 else 0.07)
    m.cyl('dark', (1.5, -0.03, 0), (1.66, -0.03, 0), 0.012, seg=8)
    canopy(m, [(1.0, 0.16, 0.18, 0.15, 3), (0.9, 0.16, 0.32, 0.15, 3), (0.65, 0.16, 0.33, 0.15, 3), (0.5, 0.18, 0.27, 0.1, 3)], frames=[(0.78, 0.16, 0.32, 0.15)])
    m.lathe(GLASS, [(0.0, 0.14), (0.08, 0.12), (0.12, 0.06), (0.13, 0.0)], (0.15, 0.22, 0), (0, 1, 0), seg=24)   # dorsal turret
    for z in (-0.03, 0.03): m.cyl('dark', (0.2, 0.3, z), (0.5, 0.3, z), 0.01, seg=6)
    m.lathe(GLASS, [(0.0, 0.0), (0.05, 0.04), (0.06, 0.1)], (-1.5, 0.05, 0), (1, 0, 0), seg=18)   # tail gun
    m.cyl('dark', (-1.5, 0.05, 0), (-1.65, 0.05, 0), 0.01, seg=6)
    # gull wing: rising to the engines, flatter outboard
    m.wing('main', [(-1.85, 0.25, 0.3, 0.2), (-1.3, 0.35, 0.48, 0.17), (-0.62, 0.45, 0.72, 0.13), (-0.2, 0.47, 0.78, 0.08),
                    (0.2, 0.47, 0.78, 0.08), (0.62, 0.45, 0.72, 0.13), (1.3, 0.35, 0.48, 0.17), (1.85, 0.25, 0.3, 0.2)], thick=0.14)
    for z in (-0.62, 0.62): nacelle(m, 0.85, 0.05, z, 0.16, 1.2, 0.42)
    m.wing('main', [(-0.82, -1.1, 0.26, 0.12), (-0.7, -1.08, 0.34, 0.12), (0.0, -1.05, 0.4, 0.12), (0.7, -1.08, 0.34, 0.12), (0.82, -1.1, 0.26, 0.12)], thick=0.1)
    for z in (-0.8, 0.8):                                                              # twin fins
        m.wing('main', [(-0.05, -1.1, 0.34, z), (0.2, -1.12, 0.32, z), (0.4, -1.16, 0.24, z)], thick=0.1, vertical=True)
    m.box('dark', (0.05, -0.215, 0), (0.7, 0.012, 0.22), bevel=0.0)                     # bomb bay doors
    m.box('dark', (0.05, -0.216, 0), (0.7, 0.014, 0.005), bevel=0.0)
    for z in (-0.2, 0.2): m.box(GLASS, (-0.6, 0.05, z * 1.02), (0.12, 0.08, 0.012), bevel=0.0)   # waist windows
    m.finish()

def transport():
    """C-47 Skytrain / Dakota: rounded nose, low wing, two radial engines, tall fin, a row of
    cabin windows and the jump door."""
    m = Model('transport')
    fuselage(m, [(1.55, -0.05, 0.05, 0.06, 2), (1.45, -0.17, 0.2, 0.18, 2.1), (1.2, -0.26, 0.29, 0.26, 2.2), (0.6, -0.28, 0.31, 0.27, 2.3),
                 (-0.7, -0.25, 0.29, 0.25, 2.3), (-1.3, -0.08, 0.22, 0.13, 2.2), (-1.6, 0.06, 0.16, 0.04, 2.0)], seg=40)
    for z in (-0.1, 0.1):                                                              # cockpit windows
        m.box(GLASS, (1.33, 0.18, z * 1.2), (0.12, 0.07, 0.1), bevel=0.0, yaw=-z * 3, pitch=-0.4)
    for s in (1, -1):
        m.box(GLASS, (1.18, 0.16, s * 0.24), (0.14, 0.06, 0.012), bevel=0.0)
        for k in range(7): m.box(GLASS, (0.75 - k * 0.2, 0.09, s * 0.275), (0.07, 0.07, 0.012), bevel=0.0)
    m.box('dark', (-0.65, -0.02, -0.265), (0.2, 0.34, 0.012), bevel=0.0)                 # jump door
    m.wing('main', [(-2.0, 0.2, 0.3, -0.02), (-1.2, 0.35, 0.6, -0.1), (-0.3, 0.55, 0.98, -0.18), (0.0, 0.58, 1.0, -0.2),
                    (0.3, 0.55, 0.98, -0.18), (1.2, 0.35, 0.6, -0.1), (2.0, 0.2, 0.3, -0.02)], thick=0.15)
    for z in (-0.72, 0.72): nacelle(m, 0.95, -0.1, z, 0.2, 1.0, 0.45)
    m.wing('main', [(-0.85, -1.1, 0.25, 0.08), (-0.7, -1.05, 0.38, 0.08), (0.0, -1.0, 0.48, 0.08), (0.7, -1.05, 0.38, 0.08), (0.85, -1.1, 0.25, 0.08)], thick=0.1)
    m.wing('main', [(0.15, -0.95, 0.62, 0), (0.45, -1.1, 0.46, 0), (0.8, -1.3, 0.28, 0), (0.88, -1.35, 0.18, 0)], thick=0.1, vertical=True)
    m.box('main', (-0.8, 0.3, 0), (0.5, 0.06, 0.04), bevel=0.02, pitch=0.2)            # dorsal fillet
    m.cyl('dark', (1.0, 0.31, 0), (-0.8, 0.28, 0), 0.004, seg=5)                         # aerial wire
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

MODELS = {'jeep': jeep, 'ambulance': ambulance, 'engtruck': engtruck, 'apc': apc, 'amphib': amphib, 'tank': tank, 'rockets': rockets,
          'heli': heli, 'fighter': fighter, 'attacker': attacker, 'bomber': bomber, 'transport': transport, 'chute': chute}

if __name__ == '__main__':
    only = sys.argv[1:]
    for name, build in MODELS.items():
        if only and name not in only: continue
        clear(); build()
