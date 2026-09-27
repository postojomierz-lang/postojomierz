# The plastic army men, modelled in Blender: one consistent set of poses in the style of classic
# 1:32 toy soldiers - a soft, moulded body (metaballs remeshed into one smooth surface) with crisp
# hard parts on top (helmet, weapons, belt and pouches, pack, boot soles) and a flat, slightly
# irregular stand under every figure.
#
#   pip install bpy            (Blender as a Python module, free)
#   python tools/blender/army_men.py [pose ...]
#
# Writes .cache/figures/blender/<pose>.stl (plus <pose>__<colour>.stl for painted parts), which
# tools/figures.mjs turns into game data. Units are millimetres (a standing man is about 38 mm on a
# 1.2 mm stand), Z up, facing -Y. Prints where each gun's muzzle ends up, in game units, for the
# MUZZLE table in src/render/view.js.
import math, os, sys
from contextlib import contextmanager
import bpy, bmesh
from mathutils import Vector, Matrix

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', '.cache', 'figures', 'blender')
VOXEL = 0.13          # remesh resolution for the soft body (mm)
BODY_TRIS = 60000     # before the game pipeline simplifies further
BASE_H = 1.2          # thickness of the stand
GAME = 1.08 / 37      # mm -> game units (tools/figures.mjs)

def P(f, l, u):
    """pose sketch coordinates -> Blender: f forward, l to the figure's left, u up."""
    return Vector((-l, -f, u))
def D(f, l, u): return P(f, l, u).normalized()
F, L, U = P(1, 0, 0), P(0, 1, 0), P(0, 0, 1)

def mulberry(seed):
    s = [seed & 0xffffffff]
    def rnd():
        s[0] = (s[0] + 0x6D2B79F5) & 0xffffffff
        t = s[0]
        t = ((t ^ (t >> 15)) * (t | 1)) & 0xffffffff
        t ^= (t + (((t ^ (t >> 7)) * (t | 61)) & 0xffffffff)) & 0xffffffff
        return ((t ^ (t >> 14)) & 0xffffffff) / 4294967296
    return rnd

class Frame:
    """a local frame: f forward, l left, u up (all unit vectors, right-handed like P)."""
    def __init__(self, o, fwd, up, along=False):
        """along=True keeps fwd exactly (weapons) and bends up to fit; otherwise up is kept."""
        if along:
            fwd = fwd.normalized(); up = up - fwd * up.dot(fwd)
            if up.length < 1e-6: up = U - fwd * U.dot(fwd)
        up = up.normalized()
        fwd = fwd - up * fwd.dot(up)
        if fwd.length < 1e-6: fwd = F - up * F.dot(up)
        self.o, self.u, self.f = Vector(o), up, fwd.normalized()
        self.l = self.f.cross(self.u).normalized()
        self.q = Matrix((-self.l, -self.f, self.u)).transposed().to_quaternion()
    def at(self, f, l=0.0, u=0.0): return self.o + self.f * f + self.l * l + self.u * u
    def d(self, f, l=0.0, u=0.0): return (self.f * f + self.l * l + self.u * u).normalized()

def turn(v, a):
    """turn a direction about the vertical (positive = to the left)."""
    return (Matrix.Rotation(a, 3, 'Z') @ v)

def ik(a, c, l1, l2, pole):
    """two-bone joint (knee, elbow) between a and c, bending towards pole."""
    d = c - a; dist = max(1e-3, min(d.length, (l1 + l2) * 0.995)); dn = d.normalized()
    x = (l1 * l1 - l2 * l2 + dist * dist) / (2 * dist)
    h = math.sqrt(max(0.0, l1 * l1 - x * x))
    p = pole - dn * pole.dot(dn)
    if p.length < 1e-4: p = U - dn * U.dot(dn)
    return a + dn * x + p.normalized() * h

class Fig:
    def __init__(self, name, base=True):
        self.name, self.base = name, base
        mb = bpy.data.metaballs.new(name + '_mb')
        mb.resolution = 0.13; mb.render_resolution = 0.13; mb.threshold = 0.6
        self.mb = mb
        self.mb_obj = bpy.data.objects.new(name + '_mb', mb)
        bpy.context.scene.collection.objects.link(self.mb_obj)
        self.soft, self.hard_objs, self.paint = [], [], {}
        self.support = []          # where the figure touches the ground (for the stand)
        self.muzzle = None
        self._hard = False

    @contextmanager
    def hard(self):
        old = self._hard; self._hard = True
        try: yield
        finally: self._hard = old

    # --- soft parts (metaballs) -----------------------------------------------------
    def ball(self, p, r):
        e = self.mb.elements.new(); e.type = 'BALL'; e.co = p; e.radius = r * 1.62; e.stiffness = 2.0
    def limb(self, a, b, r, r2=None):
        """a capsule from a to b; tapers from r to r2 (in three steps)."""
        if r2 is None or abs(r2 - r) < 0.05:
            d = b - a
            if d.length < 1e-3: return self.ball(a, r)
            e = self.mb.elements.new(); e.type = 'CAPSULE'; e.co = (a + b) / 2; e.radius = r * 1.62; e.stiffness = 2.0
            e.size_x = d.length / 2
            e.rotation = Vector((1, 0, 0)).rotation_difference(d.normalized())
            return
        for k in range(3):
            t0, t1 = k / 3, (k + 1) / 3
            self.limb(a + (b - a) * t0, a + (b - a) * t1, r + (r2 - r) * (k + 0.5) / 3)
    def blob(self, p, ex, ey, ez, q=None):
        """ellipsoid with half-sizes ex (across), ey (front-back), ez (up), turned by q."""
        e = self.mb.elements.new(); e.type = 'ELLIPSOID'; e.co = p; e.radius = 1.62; e.stiffness = 2.0
        e.size_x, e.size_y, e.size_z = ex, ey, ez
        if q is not None: e.rotation = q

    # --- meshes: fused into the body, kept crisp (hard) or painted --------------------
    def _add(self, o, colour=None, bevel=0.0):
        if bevel > 0 and (self._hard or colour):
            m = o.modifiers.new('bevel', 'BEVEL'); m.width = bevel; m.segments = 2; m.limit_method = 'ANGLE'
        if colour: self.paint.setdefault(colour, []).append(o)
        elif self._hard: self.hard_objs.append(o)
        else: self.soft.append(o)
        return o
    def cyl(self, a, b, r, colour=None, seg=20, bevel=0.0, r2=None):
        d = b - a
        if r2 is None: bpy.ops.mesh.primitive_cylinder_add(vertices=seg, radius=r, depth=max(d.length, 1e-3), location=(a + b) / 2)
        else: bpy.ops.mesh.primitive_cone_add(vertices=seg, radius1=r, radius2=r2, depth=max(d.length, 1e-3), location=(a + b) / 2)
        o = bpy.context.active_object
        o.rotation_mode = 'QUATERNION'; o.rotation_quaternion = Vector((0, 0, 1)).rotation_difference(d.normalized())
        return self._add(o, colour, bevel)
    def box(self, c, size, q=None, colour=None, bevel=0.12):
        """size = (across, front-back, up) in the frame q (world axes when q is None)."""
        bpy.ops.mesh.primitive_cube_add(size=1, location=c)
        o = bpy.context.active_object; o.scale = size
        if q is not None: o.rotation_mode = 'QUATERNION'; o.rotation_quaternion = q
        return self._add(o, colour, min(bevel, min(size) * 0.3))
    def sphere(self, c, r, colour=None, scale=None, q=None, seg=16):
        bpy.ops.mesh.primitive_uv_sphere_add(segments=seg, ring_count=max(6, seg // 2), radius=r, location=c)
        o = bpy.context.active_object
        if scale: o.scale = scale
        if q is not None: o.rotation_mode = 'QUATERNION'; o.rotation_quaternion = q
        return self._add(o, colour)
    def ring(self, c, axis, R, r, colour=None, seg=24, scale=None):
        bpy.ops.mesh.primitive_torus_add(major_radius=R, minor_radius=r, major_segments=seg, minor_segments=6, location=c)
        o = bpy.context.active_object
        if scale: o.scale = scale
        o.rotation_mode = 'QUATERNION'; o.rotation_quaternion = Vector((0, 0, 1)).rotation_difference(axis.normalized())
        return self._add(o, colour)
    def ecyl(self, fr, u0, u1, rx, ry, f=0.0, colour=None, seg=24, bevel=0.0):
        """elliptic cylinder along the frame's up axis (belts, collars, hems)."""
        c = fr.at(f, 0, (u0 + u1) / 2)
        bpy.ops.mesh.primitive_cylinder_add(vertices=seg, radius=1, depth=1, location=c)
        o = bpy.context.active_object; o.scale = (rx, ry, u1 - u0)
        o.rotation_mode = 'QUATERNION'; o.rotation_quaternion = fr.q
        return self._add(o, colour, bevel)
    def strap(self, pts, r=0.3):
        for a, b in zip(pts, pts[1:]): self.limb(a, b, r)
    def dome(self, c, r, q, squash=0.82, cut=0.0, thick=0.28):
        """a helmet shell: the top of a sphere, cut at `cut` (fraction of r above the centre)."""
        me = bpy.data.meshes.new('dome'); bm = bmesh.new()
        bmesh.ops.create_uvsphere(bm, u_segments=32, v_segments=16, radius=r)
        bmesh.ops.delete(bm, geom=[v for v in bm.verts if v.co.z < cut * r - 1e-4], context='VERTS')
        bm.to_mesh(me); bm.free()
        o = bpy.data.objects.new('dome', me); bpy.context.scene.collection.objects.link(o)
        o.location = c; o.scale = (1, 1.08, squash)
        o.rotation_mode = 'QUATERNION'; o.rotation_quaternion = q
        s = o.modifiers.new('solid', 'SOLIDIFY'); s.thickness = thick; s.offset = -1
        return self._add(o)
    def plate(self, outline, z0, z1, inset=0.3):
        """the stand: a flat plate from a ground outline [(x, y)], edge chamfered on top."""
        me = bpy.data.meshes.new('base'); bm = bmesh.new()
        n = len(outline)
        cx = sum(p[0] for p in outline) / n; cy = sum(p[1] for p in outline) / n
        def ring(z, k):
            return [bm.verts.new((cx + (x - cx) * k, cy + (y - cy) * k, z)) for x, y in outline]
        r = max(math.hypot(x - cx, y - cy) for x, y in outline)
        bot, mid, top = ring(z0, 1.0), ring(z1 - inset, 1.0), ring(z1, 1 - inset / r)
        bm.faces.new(list(reversed(bot))); bm.faces.new(top)
        for a, b in ((bot, mid), (mid, top)):
            for i in range(n): bm.faces.new([a[i], a[(i + 1) % n], b[(i + 1) % n], b[i]])
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
        bm.to_mesh(me); bm.free()
        o = bpy.data.objects.new('base', me); bpy.context.scene.collection.objects.link(o)
        self.hard_objs.append(o)
        return o
    def ground(self, *pts):
        for p in pts: self.support.append(Vector((p.x, p.y, 0)))

    # --- finishing --------------------------------------------------------------------
    def stand(self):
        """an irregular rounded stand round everything touching the ground."""
        if not self.support: return
        fs = [-p.y for p in self.support]; ls = [-p.x for p in self.support]
        fc, lc = (max(fs) + min(fs)) / 2, (max(ls) + min(ls)) / 2
        a = max(5.5, (max(fs) - min(fs)) / 2 + 3.0); b = max(5.0, (max(ls) - min(ls)) / 2 + 3.0)
        b = max(b, a * 0.62)
        rnd = mulberry(sum(ord(ch) * (i + 1) for i, ch in enumerate(self.name)))
        ph = [rnd() * 6.3 for _ in range(3)]
        pts = []
        for i in range(56):
            t = i / 56 * 2 * math.pi
            k = 1 + 0.045 * math.sin(3 * t + ph[0]) + 0.03 * math.sin(5 * t + ph[1]) + 0.02 * math.sin(2 * t + ph[2])
            # a squarer ellipse, like a moulded plate
            c, s = math.cos(t), math.sin(t)
            sq = 0.35
            fx = math.copysign(abs(c) ** (1 - sq), c); fy = math.copysign(abs(s) ** (1 - sq), s)
            p = P(fc + a * k * fx, lc + b * k * fy, 0)
            pts.append((p.x, p.y))
        self.plate(pts, -BASE_H, 0.0)
    def finish(self):
        dg = bpy.context.evaluated_depsgraph_get()
        body = bpy.data.objects.new(self.name, bpy.data.meshes.new_from_object(self.mb_obj.evaluated_get(dg)))
        bpy.context.scene.collection.objects.link(body)
        bpy.data.objects.remove(self.mb_obj)
        objs = [body] + self.soft
        for o in objs: apply_transform(o)
        body = join(objs)
        remesh(body, VOXEL, BODY_TRIS)
        if self.base: self.stand()
        parts = [body]
        if self.hard_objs:
            for o in self.hard_objs: apply_transform(o)
            parts.append(join(self.hard_objs))
        fig = join(parts)
        lift(fig)
        export(fig, self.name)
        for colour, objs in self.paint.items():
            for o in objs: apply_transform(o)
            p = join(objs); lift(p)
            export(p, f'{self.name}__{colour.lstrip("#")}')
        if self.muzzle is not None:
            m = self.muzzle
            print(f'MUZZLE {self.name}: [{-m.y * GAME:.2f}, {(m.z + BASE_H) * GAME:.2f}]')

def apply_transform(o):
    bpy.ops.object.select_all(action='DESELECT'); o.select_set(True); bpy.context.view_layer.objects.active = o
    bpy.ops.object.convert(target='MESH')
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
def join(objs):
    bpy.ops.object.select_all(action='DESELECT')
    for o in objs: o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    if len(objs) > 1: bpy.ops.object.join()
    return objs[0]
def remesh(o, voxel, tris):
    bpy.ops.object.select_all(action='DESELECT'); o.select_set(True); bpy.context.view_layer.objects.active = o
    m = o.modifiers.new('remesh', 'REMESH'); m.mode = 'VOXEL'; m.voxel_size = voxel; m.use_smooth_shade = True
    bpy.ops.object.modifier_apply(modifier=m.name)
    s = o.modifiers.new('smooth', 'SMOOTH'); s.factor = 0.5; s.iterations = 3
    bpy.ops.object.modifier_apply(modifier=s.name)
    n = sum(len(p.vertices) - 2 for p in o.data.polygons)
    if n > tris:
        d = o.modifiers.new('decimate', 'DECIMATE'); d.ratio = tris / n
        bpy.ops.object.modifier_apply(modifier=d.name)
def lift(o):
    """stand on z = 0 (the stand's underside)."""
    for v in o.data.vertices: v.co.z += BASE_H
def export(o, name):
    os.makedirs(OUT, exist_ok=True)
    bpy.ops.object.select_all(action='DESELECT'); o.select_set(True); bpy.context.view_layer.objects.active = o
    t = o.modifiers.new('t', 'TRIANGULATE'); bpy.ops.object.modifier_apply(modifier=t.name)
    bpy.ops.wm.stl_export(filepath=os.path.join(OUT, name + '.stl'), export_selected_objects=True, ascii_format=False, apply_modifiers=True)
    print(f'{name}: {len(o.data.polygons)} tris')

def clear():
    bpy.ops.wm.read_factory_settings(use_empty=True)

# =======================================================================================
# Body. Proportions of a 1:32 soldier: ~38 mm tall, hips at 18.5, shoulders at 29, eyes at 34.
THIGH, SHIN, UPPER, FORE = 8.7, 8.4, 6.9, 6.6

def boot(fig, ankle, toe, up=U, ground=True):
    """laced ankle boot: a soft foot over a crisp sole with a heel."""
    B = Frame(ankle, toe, up)
    fig.blob(B.at(0.9, 0, -0.55), 1.0, 2.2, 0.85, B.q)
    fig.ball(B.at(2.4, 0, -0.75), 0.95)                                  # toe cap
    fig.ball(ankle, 1.25)
    for k in range(3): fig.ball(B.at(0.9 + k * 0.55, 0, 0.05 - k * 0.22), 0.22)   # laces
    with fig.hard():
        fig.box(B.at(1.05, 0, -1.5), (2.2, 4.6, 0.5), B.q, bevel=0.15)
        fig.box(B.at(-0.75, 0, -1.2), (1.9, 1.2, 0.5), B.q, bevel=0.1)       # heel
    if ground: fig.ground(B.at(1.0, 0, -1.7), B.at(-0.8, 0, -1.7), B.at(2.8, 0, -1.7))

def leg(fig, hip, ankle, pole=F, toe=F, up=U, knee=None, ground=True):
    """trouser leg from the hip joint to the ankle, canvas legging over the shin, boot."""
    if knee is None: knee = ik(hip, ankle, THIGH, SHIN, pole)
    fig.limb(hip, knee, 2.1, 1.75)
    fig.limb(knee, ankle, 1.7, 1.45)
    fig.ball(knee, 1.72)
    th = (knee - hip).normalized(); sh = (ankle - knee).normalized()
    # folds: a couple of creases across the thigh and behind the knee
    side = th.cross(pole if pole.length > 0 else F)
    if side.length > 0.1:
        fig.ring(hip + (knee - hip) * 0.7, th, 1.8, 0.1, scale=(1, 0.85, 1))
    # the legging: from the ankle to half-way up the shin, with its hooks and strap
    g1 = ankle + (knee - ankle) * 0.45
    fig.cyl(ankle - sh * 0.3, g1, 1.62, seg=18)
    fig.ring(g1, sh, 1.62, 0.2)
    f = toe - sh * toe.dot(sh)
    if f.length > 0.1:
        f.normalize(); s = sh.cross(f).normalized()
        for k in range(4):
            p = ankle + (g1 - ankle) * (0.15 + k * 0.23)
            fig.ball(p + s * 1.45 + f * 0.6, 0.2)
        fig.ring(ankle + (g1 - ankle) * 0.2, sh, 1.66, 0.18)            # strap under the instep
    boot(fig, ankle, toe, up, ground)
    return knee

def torso(fig, T, pack=True, pouches=True, suspenders=True, jacket=True):
    """T: frame at the pelvis, u = up the spine, f = where the chest faces. Returns (shoulder R, shoulder L, neck)."""
    q = T.q
    fig.blob(T.at(0, 0, 0.6), 3.2, 2.2, 2.0, q)                               # pelvis
    fig.blob(T.at(0.15, 0, 4.2), 3.05, 2.3, 2.5, q)                           # waist
    fig.blob(T.at(0.35, 0, 7.6), 3.75, 2.7, 2.5, q)                           # chest
    fig.blob(T.at(-0.25, 0, 9.4), 4.05, 1.95, 1.35, q)                        # shoulder yoke
    fig.blob(T.at(-1.0, 0, 7.8), 3.1, 1.6, 2.4, q)                            # shoulder blades
    shR, shL, neck = T.at(-0.1, -4.0, 9.5), T.at(-0.1, 4.0, 9.5), T.at(0.05, 0, 11.1)
    if jacket:
        fig.ecyl(T, -0.2, 0.9, 3.45, 2.45, 0.05, seg=28)                    # jacket skirt below the belt
        fig.ring(T.at(0.0, 0, 10.9), T.u, 1.95, 0.3, scale=(1.1, 1.0, 1.6))  # collar
        for s in (1, -1):
            fig.box(T.at(2.35, s * 1.75, 7.3), (1.7, 0.45, 1.9), q)            # breast pockets
            fig.box(T.at(2.5, s * 1.75, 8.15), (1.85, 0.5, 0.55), q)            # their flaps
            fig.sphere(T.at(2.78, s * 1.75, 8.05), 0.2)
        for k in range(4): fig.sphere(T.at(2.4 + 0.12 * (k == 3), 0, 3.3 + k * 1.55), 0.2)   # buttons
        fig.box(T.at(2.2, 0, 5.4), (0.2, 0.3, 6.0), q)                        # front placket
    with fig.hard():
        fig.ecyl(T, 1.3, 2.5, 3.45, 2.45, 0.08, seg=32, bevel=0.1)            # web belt
        fig.box(T.at(2.55, 0, 1.9), (1.3, 0.35, 1.05), q, bevel=0.1)          # buckle
        if pouches:
            for s in (1, -1):
                for k, a in enumerate((0.55, 0.95, 1.35)):
                    d = T.f * math.cos(a) + T.l * (s * math.sin(a))
                    pf = Frame(T.o + d * 1.0, d, T.u)
                    c = T.o + T.f * (math.cos(a) * 2.6) + T.l * (s * math.sin(a) * 3.55) + T.u * 1.7
                    fig.box(c, (1.25, 0.85, 1.45), pf.q, bevel=0.14)
                    fig.box(c + pf.u * 0.62 + pf.f * 0.08, (1.35, 0.95, 0.4), pf.q, bevel=0.1)   # flap
                    fig.sphere(c + pf.u * 0.45 + pf.f * 0.5, 0.13)                                 # press stud
            # canteen on the right hip, entrenching tool on the left
            cq = T.o + T.f * (-1.6) + T.l * (-3.4) + T.u * 0.3
            fig.cyl(cq - T.u * 1.7, cq + T.u * 1.1, 1.15, seg=20, bevel=0.2)
            fig.cyl(cq + T.u * 1.1, cq + T.u * 1.55, 0.5, seg=12)
            sq = T.o + T.f * (-1.7) + T.l * 3.35 - T.u * 0.9
            fig.box(sq, (0.55, 1.9, 3.0), T.q, bevel=0.15)
            fig.cyl(sq + T.u * 1.4, sq + T.u * 3.1, 0.3, seg=8)
        if pack:
            bp = T.at(-3.45, 0, 7.2)
            fig.box(bp, (4.6, 2.2, 4.8), q, bevel=0.35)                       # haversack
            fig.box(bp + T.u * 1.7 - T.f * 0.1, (4.8, 2.4, 1.9), q, bevel=0.3)  # flap
            for s in (1.3, -1.3): fig.box(bp + T.l * s - T.f * 1.12, (0.45, 0.12, 3.8), q, bevel=0.04)   # straps
            fig.cyl(bp + T.u * 3.1 + T.l * 2.9 - T.f * 0.2, bp + T.u * 3.1 - T.l * 2.9 - T.f * 0.2, 1.05, seg=18, bevel=0.2)   # blanket roll
            for s in (1.6, -1.6): fig.ring(bp + T.u * 3.1 + T.l * s - T.f * 0.2, T.l, 1.1, 0.13)
    if suspenders:
        for s in (1.8, -1.8):
            fig.strap([T.at(2.45, s, 2.6), T.at(2.65, s * 1.05, 7.0), T.at(1.2, s * 1.1, 10.4), T.at(-1.6, s * 0.95, 10.0), T.at(-2.6, s * 0.7, 6.0)], 0.3)
    return shR, shL, neck

def head(fig, neck, fwd, up, helmet=True, net=False, look_up=0.0):
    """neck, a face (brow, eyes, nose, cheekbones, mouth, chin, ears) and an M1 helmet."""
    H = Frame(neck, fwd, up)
    fig.limb(neck - H.u * 0.4, H.at(0.15, 0, 1.9), 1.42)
    c = H.at(0.35, 0, 4.2)
    fig.blob(c, 2.45, 2.8, 3.0, H.q)                                           # skull
    fig.blob(H.at(1.35, 0, 2.2), 1.75, 1.45, 1.1, H.q)                        # jaw
    fig.ball(H.at(2.1, 0, 1.75), 0.75)                                        # chin
    fig.sphere(H.at(2.75, 0, 3.8), 0.4, scale=(0.7, 0.9, 1.3), q=H.q)          # nose
    fig.ball(H.at(2.55, 0, 3.25), 0.3)                                         # its tip
    for s in (1, -1):
        fig.limb(H.at(2.55, s * 0.35, 4.95), H.at(2.3, s * 1.65, 5.05), 0.34)  # brow
        fig.sphere(H.at(2.42, s * 0.95, 4.35), 0.28)                          # eye
        fig.ball(H.at(2.05, s * 1.45, 3.45), 0.72)                            # cheekbone
        fig.sphere(H.at(0.2, s * 2.3, 4.0), 0.8, scale=(0.45, 0.85, 1.25), q=H.q)   # ear
    fig.limb(H.at(2.55, 0.55, 2.75), H.at(2.55, -0.55, 2.75), 0.2)             # lips
    if helmet:
        tip = Frame(H.at(-0.05, 0, 4.85), H.d(1, 0, -0.2), H.d(0.2, 0, 1))
        with fig.hard():
            fig.dome(tip.o, 3.45, tip.q, squash=0.95, cut=-0.3)
            # the M1's narrow, slightly flared rim at the bottom of the shell
            rim = tip.at(0, 0, -0.3 * 3.45 * 0.95)
            fig.ring(rim, tip.u, 3.34, 0.24, seg=36, scale=(1, 1.08, 0.7))
            if net:
                for k in range(-3, 4):
                    fig.ring(tip.o, tip.l, 3.42, 0.09, seg=24, scale=(1, 1.08, 0.82)).rotation_quaternion @= Matrix.Rotation(k * 0.28, 3, 'Z').to_quaternion()
                rnd = mulberry(77)
                for i in range(14):                                          # scrim and leaves tucked in
                    a = rnd() * 6.28; e = 0.3 + rnd() * 0.9
                    p = tip.at(math.cos(a) * math.cos(e) * 3.5, math.sin(a) * math.cos(e) * 3.5, math.sin(e) * 2.8)
                    fig.box(p, (0.5, 0.9, 0.12), Frame(p, tip.d(math.cos(a), math.sin(a), 0), tip.u).q, bevel=0.03)
        for s in (1, -1): fig.strap([tip.at(-0.1, s * 3.2, -0.9), H.at(1.3, s * 1.2, 1.6)], 0.15)   # chin strap
    return H

def hand(fig, p, along, grip=None, r=0.95):
    """a fist round a grip: palm, knuckles and thumb. along = the forearm's direction."""
    fig.ball(p, r)
    side = along.cross(grip if grip is not None else U)
    if side.length < 0.1: side = along.cross(F)
    side.normalize(); up = side.cross(along).normalized()
    for k in (-0.55, -0.18, 0.18, 0.55): fig.ball(p + along * 0.55 + up * (k * r * 0.95) + side * 0.35, r * 0.34)
    fig.limb(p - along * 0.1 - side * 0.55, p + along * 0.5 - side * 0.7 + up * 0.3, r * 0.33)   # thumb

def arm(fig, sh, grip, pole, grip_dir=None, wave=False):
    """shoulder -> hand holding at grip; the elbow bends towards pole."""
    el = ik(sh, grip, UPPER, FORE + 0.9, pole)
    wrist = el + (grip - el).normalized() * FORE
    fig.ball(sh, 1.45)
    fig.limb(sh, el, 1.38, 1.15)
    fig.limb(el, wrist, 1.15, 0.92)
    fig.ball(el, 1.12)
    up_ = (el - sh).normalized(); fo = (wrist - el).normalized()
    fig.ring(el - up_ * 0.9, up_, 1.12, 0.1)                                  # sleeve crease at the elbow
    fig.ring(wrist - fo * 0.45, fo, 1.0, 0.18)                                # cuff
    if wave:
        # an open hand, fingers together, palm forward
        pf = Frame(wrist, pole if abs(pole.dot(fo)) < 0.9 else F, fo)
        fig.blob(wrist + fo * 0.85, 0.85, 0.42, 0.8, pf.q)
        for k in (-0.5, -0.17, 0.17, 0.5): fig.limb(wrist + fo * 1.45 + pf.l * (k * 0.9), wrist + fo * (2.45 - abs(k) * 0.5) + pf.l * (k * 0.95), 0.24)
        fig.limb(wrist + fo * 0.6 - pf.l * 0.8, wrist + fo * 1.4 - pf.l * 1.35 + pf.f * 0.2, 0.26)
    else:
        hand(fig, wrist + fo * 0.85, fo, grip_dir)
    return el

# =======================================================================================
# Weapons and kit (all hard)
def rifle(fig, butt, muzzle, up=U, scope=False, sling=True, bayonet=False):
    """M1 Garand: shaped stock and wrist, receiver with rear sight, clip, trigger guard, handguards,
    barrel bands, gas cylinder and front sight; optional scope and sling. Returns its frame."""
    R = Frame(butt, muzzle - butt, up, True); Ln = (muzzle - butt).length; q = R.q
    at = lambda k, u=0.0, l=0.0: R.at(Ln * k, l, u)
    with fig.hard():
        fig.box(at(0.08, -0.55), (0.95, Ln * 0.16, 2.1), q, bevel=0.2)         # butt
        fig.box(at(0.0, -0.55), (1.0, 0.3, 2.2), q, bevel=0.08)                 # butt plate
        fig.box(at(0.2, -0.2), (0.85, Ln * 0.14, 1.3), q, bevel=0.2)           # wrist
        fig.box(at(0.47, 0.0), (0.95, Ln * 0.42, 1.1), q, bevel=0.2)           # fore stock
        fig.box(at(0.62, 0.55), (0.8, Ln * 0.3, 0.5), q, bevel=0.15)           # handguard
        fig.box(at(0.33, 0.45), (0.8, Ln * 0.12, 0.85), q, bevel=0.1)          # receiver
        fig.box(at(0.28, 0.95), (0.4, 0.4, 0.35), q, bevel=0.05)               # rear sight
        fig.box(at(0.35, -0.35), (0.35, 1.0, 0.5), q, bevel=0.05)              # trigger
        fig.ring(at(0.33, -0.45), R.l, 0.55, 0.1, seg=16, scale=(1, 1.3, 1))    # trigger guard
        fig.cyl(at(0.3, 0.4), at(1.0, 0.4), 0.25, seg=10)                       # barrel
        fig.cyl(at(0.78, 0.05), at(0.99, 0.05), 0.24, seg=10)                   # gas cylinder
        for k in (0.56, 0.79): fig.ring(at(k, 0.3), R.f, 0.58, 0.1, seg=16)     # bands
        fig.box(at(0.985, 0.72), (0.2, 0.3, 0.5), q, bevel=0.03)               # front sight
        if scope:
            fig.cyl(at(0.24, 1.35), at(0.52, 1.35), 0.42, seg=16)
            for k, r in ((0.2, 0.62), (0.52, 0.6)): fig.cyl(at(k, 1.35), at(k + 0.06, 1.35), r, seg=16, r2=0.44 if k < 0.3 else r)
            for k in (0.3, 0.46): fig.box(at(k, 0.95), (0.5, 0.5, 0.6), q, bevel=0.05)
        if bayonet: fig.box(at(1.08, 0.1), (0.2, Ln * 0.2, 0.45), q, bevel=0.05)
        if sling: fig.strap([at(0.12, -1.2), at(0.45, -1.9), at(0.8, -0.6)], 0.14)
    fig.muzzle = muzzle
    return R

def smg(fig, butt, muzzle, up=U):
    """Browning Automatic Rifle: stock, long receiver, box magazine, carrying handle, barrel with
    flash hider and a folded bipod."""
    R = Frame(butt, muzzle - butt, up, True); Ln = (muzzle - butt).length; q = R.q
    at = lambda k, u=0.0, l=0.0: R.at(Ln * k, l, u)
    with fig.hard():
        fig.box(at(0.1, -0.5), (1.0, Ln * 0.2, 2.0), q, bevel=0.2)
        fig.box(at(0.25, -0.1), (0.9, Ln * 0.12, 1.3), q, bevel=0.2)
        fig.box(at(0.42, 0.25), (1.05, Ln * 0.25, 1.35), q, bevel=0.12)        # receiver
        fig.box(at(0.42, -1.05), (0.85, 1.6, 2.0), q, bevel=0.1)              # magazine
        fig.box(at(0.62, 0.0), (1.0, Ln * 0.18, 1.0), q, bevel=0.15)          # fore-end
        fig.cyl(at(0.5, 0.35), at(0.97, 0.35), 0.32, seg=12)                  # barrel
        fig.cyl(at(0.94, 0.35), at(1.0, 0.35), 0.45, seg=12)                   # flash hider
        fig.cyl(at(0.7, -0.1), at(0.88, -0.1), 0.2, seg=8)                     # gas tube
        fig.box(at(0.5, 1.2), (0.25, 2.0, 0.3), q, bevel=0.05)                # carrying handle
        for s in (0.45, -0.45): fig.cyl(at(0.92, 0.1, s), at(0.62, -0.3, s * 1.4), 0.12, seg=6)   # folded bipod
        fig.ring(at(0.36, -0.5), R.l, 0.55, 0.1, seg=16, scale=(1, 1.3, 1))
    fig.muzzle = muzzle
    return R

def pistol(fig, grip, fwd, up=U):
    R = Frame(grip, fwd, up); q = R.q
    with fig.hard():
        fig.box(R.at(1.3, 0, 0.85), (0.6, 3.6, 0.8), q, bevel=0.08)           # slide
        fig.box(R.at(-0.1, 0, -0.35), (0.62, 1.1, 2.2), Frame(grip, R.d(1, 0, 0.35), R.u).q, bevel=0.08)   # grip
        fig.ring(R.at(0.9, 0, 0.15), R.l, 0.4, 0.08, seg=12)
        fig.cyl(R.at(2.9, 0, 0.95), R.at(3.25, 0, 0.95), 0.18, seg=8)
    fig.muzzle = R.at(3.2, 0, 0.95)

def grenade(fig, c, r=0.85, colour=None):
    with fig.hard():
        fig.sphere(c, r, colour, scale=(1, 1, 1.25), seg=14)
        for k in (-0.5, 0, 0.5): fig.ring(c + U * (k * r * 1.2), U, r * math.sqrt(1 - k * k) * 1.02, r * 0.1, colour, seg=14)
        fig.cyl(c + U * r * 1.1, c + U * r * 1.6, r * 0.35, colour, seg=10)
        fig.box(c + U * r * 0.9 + F * r * 0.55, (r * 0.35, r * 0.3, r * 1.6), None, colour, bevel=0.02)   # spoon
        fig.ring(c + U * r * 1.4 - F * r * 0.55, F, r * 0.35, r * 0.07, colour, seg=10)                 # pin

def bazooka_tube(fig, a, b, r=1.25, missile=False):
    """M1 bazooka (a = back, b = front): tube, shoulder stock, grip, trigger guard, front sight
    frame, battery box and the wire ring at the back; the AA missile tube gets end caps, a sight
    unit and a battery instead."""
    R = Frame(a, b - a, U, True); Ln = (b - a).length; q = R.q
    at = lambda k, u=0.0, l=0.0: R.at(Ln * k, l, u)
    with fig.hard():
        fig.cyl(a, b, r, seg=24)
        if missile:
            for k in (0.0, 1.0): fig.cyl(at(k) - R.f * 0.7, at(k) + R.f * 0.7, r * 1.3, seg=24, bevel=0.1)
            fig.box(at(0.45, r + 1.0, 0.5), (1.8, 2.4, 1.7), q, bevel=0.15)
            fig.cyl(at(0.45, r + 1.0, 0.5) + R.f * 1.2, at(0.45, r + 1.0, 0.5) + R.f * 1.6, 0.5, seg=12)
            fig.cyl(at(0.62, -r - 0.8), at(0.62, -r - 0.8) + R.f * 3.0, 0.75, seg=14)
        else:
            fig.cyl(a - R.f * 0.2, a + R.f * 0.9, r * 1.35, seg=24, r2=r)                  # flared back end
            fig.ring(a, R.f, r * 1.25, 0.18, seg=24)                               # wire guard ring
            fig.ring(b, R.f, r * 1.02, 0.25, seg=24)                               # muzzle
            for k in (0.25, 0.6): fig.ring(at(k), R.f, r * 1.03, 0.16, seg=24)     # bands
            fig.box(at(0.4, -r - 0.3), (1.1, Ln * 0.14, 0.9), q, bevel=0.15)       # shoulder stock
            fig.box(at(0.72, r + 0.65, -0.7), (0.15, 0.3, 1.4), q, bevel=0.03)     # front sight frame
            fig.box(at(0.22, -r - 0.8, 0.6), (1.3, 1.6, 1.2), q, bevel=0.1)        # battery box
        fig.box(at(0.35, -r - 1.3), (0.8, 1.0, 2.3), Frame(at(0.35), R.d(1, 0, 0.3), R.u).q, bevel=0.1)   # pistol grip
        fig.ring(at(0.4, -r - 0.95), R.l, 0.5, 0.1, seg=12)
        fig.box(at(0.62, -r - 0.9), (0.7, 0.9, 1.5), q, bevel=0.1)             # front grip
    fig.muzzle = b

def binoculars(fig, c, fwd):
    B = Frame(c, fwd, U)
    with fig.hard():
        for s in (0.75, -0.75):
            fig.cyl(B.at(-1.0, s), B.at(1.4, s), 0.6, seg=14)
            fig.cyl(B.at(0.9, s), B.at(1.5, s), 0.72, seg=14)
        fig.box(B.at(0.0, 0, 0.1), (1.0, 1.0, 0.6), B.q, bevel=0.08)

def kitbag(fig, c, fwd, colour):
    K = Frame(c, fwd, U)
    fig.box(K.o, (3.8, 2.4, 2.8), K.q, colour, bevel=0.3)
    fig.box(K.at(0, 0, 1.3), (4.0, 2.6, 0.5), K.q, colour, bevel=0.15)
    fig.cyl(K.at(0, 1.0, 1.9), K.at(0, -1.0, 1.9), 0.25, colour, seg=8)
    return K

def mine(fig, c):
    with fig.hard():
        fig.cyl(c - U * 0.7, c + U * 0.5, 3.2, seg=28, bevel=0.2)
        fig.ring(c + U * 0.4, U, 3.0, 0.2, seg=28)
        fig.cyl(c + U * 0.5, c + U * 0.95, 1.2, seg=16, bevel=0.1)
        fig.box(c + F * 3.4, (1.6, 0.6, 0.35), None, bevel=0.05)

# =======================================================================================
# Poses. Legs first (they set the hips), then the torso frame, arms to the weapon, head.
def standing(fig, stride=3.0, stance=2.6, lean=0.0, yaw=0.0, turn_feet=0.35):
    """feet apart, left foot ahead; returns the pelvis position."""
    pel = P(lean * 0.3, 0, 18.3)
    for s, fwd in ((1, stride * 0.55), (-1, -stride * 0.45)):
        hip = pel + P(0, s * 2.0, -0.4)
        ankle = P(fwd, s * stance, 1.95)
        toe = turn(F, s * turn_feet * (1.4 if s < 0 else 0.6))
        leg(fig, hip, ankle, pole=turn(F, s * 0.2) + U * 0.05, toe=toe)
    return pel

def kneeling(fig):
    """right knee down, left foot planted ahead (the classic kneeling shooter)."""
    pel = P(-0.6, 0, 10.8)
    hipL, hipR = pel + P(0.2, 2.0, -0.4), pel + P(0.2, -2.0, -0.4)
    leg(fig, hipL, P(7.4, 2.5, 1.95), pole=D(1, 0.1, 0.4), toe=F)
    kneeR = P(1.6, -2.4, 1.75)
    ankR = P(-6.4, -2.5, 2.3)
    leg(fig, hipR, ankR, knee=kneeR, toe=D(0.15, 0, -1), up=F, ground=False)
    fig.ground(kneeR + P(0.4, 0, -1.7), kneeR + P(-1.2, 0, -1.7), ankR + P(-0.3, 0, -2.2), P(-8.6, -2.5, 0))
    return pel

def prone_legs(fig, pel):
    for s in (1, -1):
        hip = pel + P(-0.3, s * 1.9, -0.3)
        knee = P(-pel.y - 8.4, s * 3.0, 1.8)
        ankle = P(-pel.y - 16.4, s * 4.2 + (0.6 if s < 0 else 0), 1.95)
        leg(fig, hip, ankle, knee=knee, toe=D(-0.55, s * 0.15, -0.8), up=D(0.8, 0, -0.55), ground=False)
        fig.ground(knee + P(0, 0, -1.7), ankle + P(-2.2, 0, -1.8), (hip + knee) / 2)

def aim_rifle(fig, T, shR, shL, neck, kind='rifle', height=0.0):
    """shoulder a rifle and aim along F: butt in the right shoulder pocket, cheek on the stock."""
    butt = T.at(1.9, -2.6, 10.2) + U * height
    muzzle = butt + D(1, 0.02, 0.02) * (24 if kind != 'scoped' else 25.5)
    R = rifle(fig, butt, muzzle, scope=(kind == 'scoped'), sling=True)
    arm(fig, shR, R.at(5.0, 0, -1.25), pole=D(-0.2, -1, -0.5), grip_dir=R.f)
    arm(fig, shL, R.at(11.5, 0, -0.9), pole=D(0.2, 0.4, -1), grip_dir=R.f)
    head(fig, neck, F, D(0.55, -0.4, 1), net=(kind == 'scoped'))
    return R

def rifleman():
    fig = Fig('rifleman')
    pel = standing(fig, stride=4.2, stance=2.8, lean=0.8)
    T = Frame(pel, turn(F, -0.55), D(0.1, 0, 1))
    shR, shL, neck = torso(fig, T)
    aim_rifle(fig, T, shR, shL, neck)
    fig.finish()

def sniper():
    fig = Fig('sniper')
    pel = standing(fig, stride=4.6, stance=3.0, lean=1.0)
    T = Frame(pel, turn(F, -0.6), D(0.13, 0, 1))
    shR, shL, neck = torso(fig, T)
    aim_rifle(fig, T, shR, shL, neck, 'scoped')
    fig.finish()

def kneel():
    fig = Fig('kneel')
    pel = kneeling(fig)
    T = Frame(pel, turn(F, -0.5), D(0.12, 0, 1))
    shR, shL, neck = torso(fig, T)
    aim_rifle(fig, T, shR, shL, neck)
    fig.finish()

def prone():
    """lying on his front, up on the elbows, aiming."""
    fig = Fig('prone')
    pel = P(-9.0, 0, 2.9)
    prone_legs(fig, pel)
    T = Frame(pel, -U, D(1, 0, 0.3))
    shR, shL, neck = torso(fig, T, pack=True)
    butt = P(1.2, -2.3, 6.2)
    R = rifle(fig, butt, butt + D(1, 0.02, 0.01) * 24)
    elR = arm(fig, shR, R.at(5.0, 0, -1.25), pole=D(-0.2, -0.6, -1), grip_dir=R.f)
    elL = arm(fig, shL, R.at(11.0, 0, -0.9), pole=D(0.3, 0.3, -1), grip_dir=R.f)
    head(fig, neck, F, D(0.75, -0.25, 1))
    fig.ground(elR + P(0, 0, -1.3), elL + P(0, 0, -1.3), pel)
    fig.finish()

def officer():
    """strides forward pointing the way with his pistol, the other arm waving the men on."""
    fig = Fig('officer')
    pel = standing(fig, stride=5.0, stance=2.6, lean=0.6)
    T = Frame(pel, turn(F, -0.25), D(0.06, 0, 1))
    shR, shL, neck = torso(fig, T, pack=False)
    grip = shR + F * 12.2 + U * 0.8 - L * 0.4
    arm(fig, shR, grip, pole=D(0, -0.6, -1), grip_dir=F)
    pistol(fig, grip + F * 0.35, F)
    arm(fig, shL, shL + P(3.5, 3.5, 9.5), pole=D(-0.5, 1, -0.2), grip_dir=U)   # fist up: follow me
    head(fig, neck, turn(F, 0.15), D(0.05, 0.1, 1))
    with fig.hard():
        fig.box(T.at(-0.4, 3.9, -0.4), (0.8, 3.2, 3.4), T.q, bevel=0.2)           # map case
        fig.box(T.at(0.9, -3.3, 0.3), (0.9, 1.8, 2.4), T.q, bevel=0.2)            # holster
    fig.strap([T.at(-0.4, 3.9, 1.2), T.at(2.4, 1.5, 7.0), T.at(1.2, -2.2, 10.3)], 0.25)   # its strap
    binoculars(fig, T.at(2.7, 0.0, 6.2), T.d(0, 0, -1) + T.f * 0.001)
    fig.finish()

def mg():
    """machine gunner firing a BAR from the hip, leaning into it."""
    fig = Fig('mg')
    pel = standing(fig, stride=5.2, stance=3.3, lean=-0.4)
    T = Frame(pel, turn(F, -0.35), D(-0.08, 0, 1))
    shR, shL, neck = torso(fig, T)
    butt = T.at(1.2, -3.5, 5.2)
    R = smg(fig, butt, butt + D(1, 0.06, 0.12) * 25)
    arm(fig, shR, R.at(6.0, 0, -1.4), pole=D(-0.4, -1, -0.3), grip_dir=R.f)
    arm(fig, shL, R.at(14.0, 0, -0.9), pole=D(0, 0.5, -1), grip_dir=R.f)
    head(fig, neck, F, D(0.05, -0.05, 1))
    fig.strap([R.at(1.5, 0, -1.2), T.at(-1.0, 3.5, 10.2)], 0.2)                    # sling over the shoulder
    fig.finish()

def bazooka(standing_=False):
    fig = Fig('bazooka-stand' if standing_ else 'bazooka')
    pel = standing(fig, stride=4.0, stance=2.9, lean=0.5) if standing_ else kneeling(fig)
    T = Frame(pel, turn(F, -0.3), D(0.1, 0, 1))
    shR, shL, neck = torso(fig, T)
    top = shR + T.u * 1.9 + T.f * 0.3
    a, b = top - F * 12.5, top + F * 15
    bazooka_tube(fig, a, b)
    arm(fig, shR, top + F * 4.8 + U * (-3.3), pole=D(-0.3, -1, -0.6), grip_dir=F)
    arm(fig, shL, top + F * 8.9 + U * (-2.9) + L * 0.4, pole=D(0.2, 0.3, -1), grip_dir=F)
    head(fig, neck, F, D(0.2, -0.35, 1))
    fig.finish()

def manpads(kneel_=False):
    fig = Fig('manpads-kneel' if kneel_ else 'manpads')
    pel = kneeling(fig) if kneel_ else standing(fig, stride=4.0, stance=2.9, lean=-0.3)
    T = Frame(pel, turn(F, -0.3), D(-0.05, 0, 1))
    shR, shL, neck = torso(fig, T)
    top = shR + T.u * 1.9 + T.f * 0.2
    d = D(1, 0, 0.55)
    a, b = top - d * 10.5, top + d * 13.5
    bazooka_tube(fig, a, b, 1.3, missile=True)
    arm(fig, shR, top + d * 4.5 - U * 3.0, pole=D(-0.3, -1, -0.6), grip_dir=d)
    arm(fig, shL, top + d * 8.8 - U * 2.4 + L * 0.3, pole=D(0.2, 0.3, -1), grip_dir=d)
    head(fig, neck, D(1, 0, 0.5), D(-0.25, -0.3, 1))
    fig.finish()

def grenadier(throwing=True):
    fig = Fig('grenadier' if throwing else 'grenadier-idle')
    if throwing:
        pel = standing(fig, stride=5.6, stance=3.0, lean=-0.6)
        T = Frame(pel, turn(F, -0.6), D(-0.18, -0.08, 1))
    else:
        pel = standing(fig, stride=2.6, stance=2.4, lean=0.2)
        T = Frame(pel, F, D(0.03, 0, 1))
    shR, shL, neck = torso(fig, T)
    for s in (1.3, -1.3): grenade(fig, T.at(2.85, s, 5.4), 0.75)             # clipped to the suspenders
    if throwing:
        g = T.at(-4.5, -4.8, 17.0)
        arm(fig, shR, g, pole=D(-0.3, -1, 0.2), grip_dir=U)
        grenade(fig, g + U * 0.9 + F * -0.3, 1.1)
        arm(fig, shL, shL + P(9.5, 1.5, 3.0), pole=D(0, 0.5, -1), wave=True)
        rifle(fig, T.at(-3.2, -3.8, -3.5), T.at(-2.5, 3.5, 17.5), up=T.f * -1, sling=True)   # slung on the back
        fig.muzzle = g
        head(fig, neck, F, D(0.0, 0.0, 1))
    else:
        R = rifle(fig, T.at(3.4, -4.2, 2.0), T.at(4.6, 6.0, 17.5), up=T.f)     # port arms
        arm(fig, shR, R.at(4.4, 0, -1.1), pole=D(-0.2, -1, -1), grip_dir=R.f)
        g = T.at(6.0, 3.6, 8.0)
        arm(fig, shL, g, pole=D(0, 1, -1), grip_dir=U)
        grenade(fig, g + U * 0.9 + F * 0.4, 1.0)
        head(fig, neck, F, U)
    fig.finish()

def medic(kneel_=False):
    fig = Fig('medic-heal' if kneel_ else 'medic')
    WHITE, RED = '#f4f1e8', '#d63a2f'
    if kneel_:
        pel = kneeling(fig)
        T = Frame(pel, F, D(0.55, 0, 1))
    else:
        pel = standing(fig, stride=3.2, stance=2.6, lean=0.3)
        T = Frame(pel, F, D(0.05, 0, 1))
    shR, shL, neck = torso(fig, T, pack=False)
    H = head(fig, neck, F, D(0.55, 0, 1) if kneel_ else U)
    # white circle with a red cross on the front of the helmet
    hc = H.at(3.35, 0, 6.0)
    fig.cyl(hc - H.f * 0.1, hc + H.f * 0.25, 1.35, WHITE, seg=20)
    fig.box(hc + H.f * 0.3, (1.7, 0.2, 0.45), H.q, RED, bevel=0.02); fig.box(hc + H.f * 0.3, (0.45, 0.2, 1.7), H.q, RED, bevel=0.02)
    if kneel_:
        arm(fig, shR, P(10.0, -1.6, 3.4), pole=D(0, -1, -0.3), grip_dir=L)
        elL = arm(fig, shL, P(10.0, 1.6, 3.2), pole=D(0, 1, -0.3), grip_dir=L)
        fig.ring(shL + (elL - shL) * 0.45, elL - shL, 1.45, 0.4, WHITE, seg=18)     # arm band
        with fig.hard(): fig.cyl(P(10.0, -1.4, 3.2), P(10.0, 1.4, 3.2), 0.9, WHITE, seg=14)   # bandage roll
        K = kitbag(fig, P(9.2, -6.5, 1.4), turn(F, 0.4), WHITE)
        fig.ground(P(11, -1, 0), K.o)
    else:
        elL = arm(fig, shL, shL + P(3.0, 3.0, 9.5), pole=D(-0.3, 1, 0), wave=True)
        fig.ring(shL + (elL - shL) * 0.45, elL - shL, 1.45, 0.4, WHITE, seg=18)     # arm band
        g = shR + P(0.5, -1.2, -13.2)
        arm(fig, shR, g, pole=D(-1, -0.2, 0), grip_dir=L)
        K = kitbag(fig, g + P(0, -0.4, -2.2), F, WHITE)
    fig.box(K.at(0, -1.25, 0), (2.1, 0.12, 0.6), K.q, RED, bevel=0.01); fig.box(K.at(0, -1.25, 0), (0.6, 0.12, 2.1), K.q, RED, bevel=0.01)
    fig.finish()

def drag():
    """leaning back and hauling a wounded comrade by the collar."""
    fig = Fig('drag')
    pel = standing(fig, stride=5.0, stance=2.8, lean=-1.8)
    T = Frame(pel, F, D(-0.35, 0, 1))
    shR, shL, neck = torso(fig, T)
    for s in (1, -1): arm(fig, shL if s > 0 else shR, P(7.0, s * 2.2, 10.0), pole=D(0, s, -1), grip_dir=L)
    rifle(fig, T.at(-3.2, -3.8, -3.5), T.at(-2.5, 3.5, 17.5), up=T.f * -1)
    head(fig, neck, F, D(0.25, 0, 1))
    fig.finish()

def gunner():
    """crew of the MG nest: kneels, both hands forward on the spade grips (the gun belongs to the nest)."""
    fig = Fig('gunner', base=False)
    pel = kneeling(fig)
    T = Frame(pel, F, D(0.3, 0, 1))
    shR, shL, neck = torso(fig, T)
    for s, sh in ((1, shL), (-1, shR)): arm(fig, sh, P(9.5, s * 1.2, 13.8), pole=D(0, s, -1), grip_dir=F)
    head(fig, neck, F, D(0.4, 0, 1))
    fig.finish()

def lookout():
    """up on the watchtower, scanning the horizon through binoculars."""
    fig = Fig('lookout', base=False)
    pel = standing(fig, stride=1.8, stance=2.6)
    T = Frame(pel, F, D(0.04, 0, 1))
    shR, shL, neck = torso(fig, T)
    H = head(fig, neck, F, D(0.02, 0, 1))
    eyes = H.at(3.4, 0, 4.4)
    binoculars(fig, eyes + F * 1.1, F)
    for s, sh in ((1, shL), (-1, shR)): arm(fig, sh, eyes + F * 1.3 + L * (s * 0.9) - U * 0.8, pole=D(0, s, -1), grip_dir=F)
    rifle(fig, T.at(-3.2, -3.8, -3.5), T.at(-2.5, 3.5, 17.5), up=T.f * -1)
    fig.finish()

def sapper():
    """an engineer kneeling to set an anti-tank mine, shovel across his back."""
    fig = Fig('sapper')
    pel = kneeling(fig)
    T = Frame(pel, F, D(0.75, 0, 1))
    shR, shL, neck = torso(fig, T)
    m = P(10.5, 0, 0.7)
    mine(fig, m)
    for s, sh in ((1, shL), (-1, shR)): arm(fig, sh, m + P(-0.4, s * 3.1, 1.2), pole=D(0, s * 1, -0.2), grip_dir=L)
    head(fig, neck, F, D(0.9, 0, 1))
    with fig.hard():
        fig.cyl(T.at(-3.0, -3.0, 1.0), T.at(-3.2, 3.4, 11.0), 0.35, seg=10)        # shovel handle
        fig.box(T.at(-3.3, 3.8, 12.2), (2.2, 0.35, 2.6), Frame(T.at(-3.3, 3.8, 12.2), T.f, T.d(0, 0.5, 1)).q, bevel=0.15)
    fig.ground(m + P(3.2, 0, 0), m + P(-3.2, 0, 0), m + P(0, 3.2, 0), m + P(0, -3.2, 0))
    fig.finish()

def driver():
    """vehicle crew: sits, hands on the steering wheel (legs and seat hidden in the vehicle)."""
    fig = Fig('driver', base=False)
    pel = P(0, 0, 10.0)
    for s in (1, -1):
        hip = pel + P(0.3, s * 2.0, -0.2)
        leg(fig, hip, P(9.5, s * 2.4, 1.95), knee=P(8.2, s * 2.3, 10.4), toe=F, ground=False)
    T = Frame(pel, F, D(-0.12, 0, 1))
    shR, shL, neck = torso(fig, T, pack=False, pouches=False)
    for s, sh in ((1, shL), (-1, shR)): arm(fig, sh, P(9.0, s * 2.6, 19.5), pole=D(0, s, -1), grip_dir=L)
    head(fig, neck, F, D(0.05, 0, 1))
    fig.finish()

def mgstand():
    """vehicle crew: stands behind a pintle-mounted machine gun, both hands on the grips."""
    fig = Fig('mgstand', base=False)
    pel = standing(fig, stride=2.6, stance=2.6, lean=0.4)
    T = Frame(pel, F, D(0.08, 0, 1))
    shR, shL, neck = torso(fig, T, pack=False)
    for s, sh in ((1, shL), (-1, shR)): arm(fig, sh, P(8.5, s * 1.3, 25.5), pole=D(0, s, -1), grip_dir=F)
    head(fig, neck, F, D(0.25, 0, 1))
    fig.finish()

POSES = {'rifleman': rifleman, 'kneel': kneel, 'prone': prone, 'officer': officer, 'mg': mg, 'sniper': sniper,
         'bazooka': lambda: bazooka(False), 'bazooka-stand': lambda: bazooka(True), 'manpads': lambda: manpads(False),
         'manpads-kneel': lambda: manpads(True), 'grenadier': lambda: grenadier(True), 'grenadier-idle': lambda: grenadier(False),
         'medic': lambda: medic(False), 'medic-heal': lambda: medic(True), 'drag': drag, 'gunner': gunner, 'lookout': lookout,
         'sapper': sapper, 'driver': driver, 'mgstand': mgstand}

if __name__ == '__main__':
    only = [a for a in sys.argv[1:] if not a.startswith('--')]
    for name, build in POSES.items():
        if only and name not in only: continue
        clear(); build()
