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
# which army's soldiers to build (--nation=de): helmets, boots, kit and weapons follow it
NATION = next((a.split('=', 1)[1] for a in sys.argv if a.startswith('--nation=')), 'us')
if NATION != 'us': OUT = os.path.join(OUT, NATION)
DE = NATION == 'de'
SU = NATION == 'su'
GB = NATION == 'gb'
JP = NATION == 'jp'
FR = NATION == 'fr'
IT = NATION == 'it'
US = NATION == 'us'

# the painted insignia (see insignia_*): these parts keep their colours whatever the army's plastic
INS = {'white': '#f4f1e8', 'red': '#d63a2f', 'blue': '#23408e', 'black': '#1c1c1e', 'yellow': '#e8c21c', 'gold': '#d9a931', 'silver': '#c9ccd0'}

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
    if JP or FR or IT:
        # puttees: cloth wound round the calf from the ankle to below the knee
        g1 = ankle + (knee - ankle) * 0.8
        fig.cyl(ankle - sh * 0.3, g1, 1.62, seg=18, r2=1.72)
        f_ = toe - sh * toe.dot(sh)
        f_ = f_.normalized() if f_.length > 0.1 else sh.orthogonal().normalized()
        for k in range(8):
            t = 0.08 + k * 0.11
            ax = (sh + f_ * (0.3 if k % 2 else -0.3)).normalized()
            fig.ring(ankle + (g1 - ankle) * t, ax, 1.64 + t * 0.1, 0.1)
        boot(fig, ankle, toe, up, ground)
        return knee
    if DE or SU:
        # marching boots (the Soviet kirza ones too): a tall shaft up to below the knee
        g1 = ankle + (knee - ankle) * 0.72
        fig.cyl(ankle - sh * 0.3, g1, 1.68, seg=18, r2=1.78)
        fig.ring(g1, sh, 1.76, 0.2)
        for k in (0.3, 0.55): fig.ring(ankle + (g1 - ankle) * k, sh, 1.7, 0.08)   # creases in the leather
        boot(fig, ankle, toe, up, ground)
        return knee
    # the legging: from the ankle to half-way up the shin, with its hooks and strap
    g1 = ankle + (knee - ankle) * (0.24 if GB else 0.45)          # British anklets are short
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
        if SU:                                                                  # the gymnastyorka: a short placket at the neck
            fig.box(T.at(2.45, 0.3, 8.9), (0.5, 0.3, 2.6), q)
            for k in range(3): fig.sphere(T.at(2.62, 0.3, 8.0 + k * 0.8), 0.18)
        else:
            for k in range(4): fig.sphere(T.at(2.4 + 0.12 * (k == 3), 0, 3.3 + k * 1.55), 0.2)   # buttons
            fig.box(T.at(2.2, 0, 5.4), (0.2, 0.3, 6.0), q)                    # front placket
        if DE:
            for s_ in (1, -1):                                                  # the tunic's skirt pockets
                fig.box(T.at(2.3, s_ * 2.0, 0.0), (1.9, 0.5, 2.1), q); fig.box(T.at(2.45, s_ * 2.0, 1.0), (2.05, 0.55, 0.55), q)
    with fig.hard():
        fig.ecyl(T, 1.3, 2.5, 3.45, 2.45, 0.08, seg=32, bevel=0.1)            # web belt
        fig.box(T.at(2.55, 0, 1.9), (1.3, 0.35, 1.05), q, bevel=0.1)          # buckle
        if pouches and GB:
            for s in (1, -1):                                                   # the '37 pattern basic pouches, high on the chest
                c = T.at(2.75, s * 1.75, 5.2)
                fig.box(c, (1.9, 1.2, 2.3), q, bevel=0.2)
                fig.box(c + T.u * 1.0 + T.f * 0.08, (2.0, 1.3, 0.55), q, bevel=0.12)
                fig.sphere(c + T.u * 0.8 + T.f * 0.7, 0.14)
        if pouches:
            for s in (1, -1):
                for k, a in enumerate(() if GB else (0.6, 1.05) if (SU or JP or FR or IT) else (0.55, 0.95, 1.35)):
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
        if SU:
            # the greatcoat rolled into a ring over the left shoulder, and the sidor sack
            if pack:
                sd = T.at(-3.2, 0, 6.2)
                fig.sphere(sd, 2.4, scale=(1.0, 0.55, 1.1), q=q)
                fig.cyl(sd + T.u * 2.4 - T.f * 0.2, sd + T.u * 3.2 - T.f * 0.2, 0.5, seg=10)   # its drawstring neck
        if SU and suspenders:
            pts = []
            for i in range(21):                                                # a thick ring, shoulder to hip
                a = i / 20 * 2 * math.pi
                c = T.at(0.0, 0.0, 6.6) + (T.u * 0.72 + T.l * 0.7).normalized() * math.cos(a) * 5.9 + T.f * (math.sin(a) * 2.9)
                pts.append(c)
            for a_, b_ in zip(pts, pts[1:]): fig.cyl(a_, b_, 0.95, seg=12)
            for p_ in pts[1:-1]: fig.sphere(p_, 0.95, seg=12)
        if pack and IT:
            bp = T.at(-2.9, 0, 7.6)
            fig.box(bp, (3.4, 1.6, 3.0), q, bevel=0.35)                         # the M1939 pack
            fig.box(bp + T.u * 1.1 - T.f * 0.05, (3.6, 1.8, 0.9), q, bevel=0.25)
            pts = []
            for i in range(13):                                                  # the telo tenda rolled in a horseshoe round it
                a = math.pi * i / 12
                pts.append(bp + T.u * (0.4 + math.sin(a) * 2.0) + T.l * (math.cos(a) * 2.1) - T.f * 0.15)
            for a_, b_ in zip(pts, pts[1:]): fig.cyl(a_, b_, 0.55, seg=10)
            gm = T.o + T.f * (-0.6) + T.l * 3.3 - T.u * 1.1                       # the gas mask bag on the left hip
            fig.box(gm, (0.9, 2.2, 2.4), Frame(gm, T.f, T.u).q, bevel=0.35)
        elif pack and FR:
            bp = T.at(-3.1, 0, 7.0)
            fig.box(bp, (4.0, 2.0, 3.8), q, bevel=0.35)                         # the M1935 pack
            fig.cyl(bp + T.u * 2.5 + T.l * 2.7 - T.f * 0.1, bp + T.u * 2.5 - T.l * 2.7 - T.f * 0.1, 1.0, seg=18, bevel=0.2)   # blanket and tent rolled on top
            for s_ in (1.5, -1.5): fig.ring(bp + T.u * 2.5 + T.l * s_ - T.f * 0.1, T.l, 1.05, 0.13)
            fig.box(bp - T.f * 1.15 - T.u * 0.3, (2.4, 0.9, 2.2), q, bevel=0.45)   # the gamelle, strapped on
            mb = T.o + T.f * (-0.9) + T.l * 3.3 - T.u * 1.3                       # musette bag on the left hip
            fig.box(mb, (0.9, 2.6, 2.3), Frame(mb, T.f, T.u).q, bevel=0.4)
        elif pack and JP:
            bp = T.at(-3.0, 0, 7.0)
            fig.box(bp, (3.8, 1.8, 3.4), q, bevel=0.35)                         # knapsack
            pts = []
            for i in range(13):                                                  # the blanket roll in a horseshoe round it
                a = math.pi * i / 12
                pts.append(bp + T.u * (0.2 + math.sin(a) * 2.2) + T.l * (math.cos(a) * 2.2) - T.f * 0.1)
            for a_, b_ in zip(pts, pts[1:]): fig.cyl(a_, b_, 0.6, seg=10)
            fig.box(T.at(-2.6, 0, 0.4), (2.6, 1.4, 1.5), q, bevel=0.3)          # the rear cartridge pouch
        elif pack and GB:
            bp = T.at(-3.0, 0, 7.8)                                             # the small pack, high on the back
            fig.box(bp, (3.6, 1.7, 3.2), q, bevel=0.35)
            fig.box(bp + T.u * 1.2 - T.f * 0.05, (3.8, 1.9, 1.0), q, bevel=0.25)
            fig.box(T.at(-2.4, 0, 1.4), (2.0, 1.2, 1.6), q, bevel=0.25)         # the entrenching tool in its carrier
        elif pack and DE:
            bp = T.at(-3.0, 0, 7.4)
            fig.box(bp, (3.4, 0.5, 4.2), q, bevel=0.1)                        # assault frame
            fig.cyl(bp + T.u * 2.0 - T.f * 0.6 + T.l * 2.6, bp + T.u * 2.0 - T.f * 0.6 - T.l * 2.6, 0.95, seg=16, bevel=0.2)   # rolled Zeltbahn
            fig.box(bp - T.f * 0.75 + T.u * 0.1, (2.2, 1.2, 2.4), q, bevel=0.4)   # mess tin
            gm = T.at(-2.6, -1.2, -0.8)                                           # gas mask canister, fluted
            fig.cyl(gm - T.u * 2.2 + T.l * 0.6, gm + T.u * 2.0 - T.l * 0.6, 1.25, seg=18, bevel=0.15)
            for k in (-1.2, 0.0, 1.2): fig.ring(gm + T.u * k - T.l * (k * 0.28), (T.u * 4.2 - T.l * 1.2).normalized(), 1.27, 0.1, seg=18)
            bb = T.o + T.f * (-0.8) + T.l * (-3.3) - T.u * 1.2                    # bread bag
            fig.box(bb, (1.0, 2.8, 2.4), Frame(bb, T.f, T.u).q, bevel=0.45)
        elif pack:
            bp = T.at(-3.45, 0, 7.2)
            fig.box(bp, (4.6, 2.2, 4.8), q, bevel=0.35)                       # haversack
            fig.box(bp + T.u * 1.7 - T.f * 0.1, (4.8, 2.4, 1.9), q, bevel=0.3)  # flap
            for s in (1.3, -1.3): fig.box(bp + T.l * s - T.f * 1.12, (0.45, 0.12, 3.8), q, bevel=0.04)   # straps
            fig.cyl(bp + T.u * 3.1 + T.l * 2.9 - T.f * 0.2, bp + T.u * 3.1 - T.l * 2.9 - T.f * 0.2, 1.05, seg=18, bevel=0.2)   # blanket roll
            for s in (1.6, -1.6): fig.ring(bp + T.u * 3.1 + T.l * s - T.f * 0.2, T.l, 1.1, 0.13)
    if suspenders and not (SU or JP or IT):
        for s in (1.8, -1.8):
            fig.strap([T.at(2.45, s, 2.6), T.at(2.65, s * 1.05, 7.0), T.at(1.2, s * 1.1, 10.4), T.at(-1.6, s * 0.95, 10.0), T.at(-2.6, s * 0.7, 6.0)], 0.3)
    fig._T, fig._shL = T, shL                                                 # for the sleeve patch (arm)
    if IT and jacket: insignia_collar(fig, T)
    return shR, shL, neck

def head(fig, neck, fwd, up, helmet=True, net=False, look_up=0.0):
    """the head and its headgear (_head), with the national badge painted on it."""
    H = _head(fig, neck, fwd, up, helmet, net, look_up)
    if helmet: insignia_head(fig, H, helmet == 'cap')
    return H

def _head(fig, neck, fwd, up, helmet=True, net=False, look_up=0.0):
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
    if helmet == 'cap' and IT:
        bustina(fig, H)
        return H
    if helmet and IT:
        m33(fig, H, net)
        return H
    if helmet == 'cap' and FR:
        kepi(fig, H)
        return H
    if helmet and FR:
        adrian(fig, H, net)
        return H
    if helmet == 'cap' and not (GB or JP):
        peaked_cap(fig, H)
        return H
    if helmet and DE:
        stahlhelm(fig, H, net)
        return H
    if helmet and SU:
        ssh40(fig, H, net)
        return H
    if helmet and JP:
        type90(fig, H, helmet == 'cap', net)
        return H
    if helmet == 'cap' and GB:
        beret(fig, H)
        return H
    if helmet and GB:
        brodie(fig, H, net)
        return H
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

def stahlhelm(fig, H, net=False):
    """the German M35/M40 helmet: a deep dome flaring into a skirt that covers the ears and the
    neck, a short visor over the eyes and the vent lugs on the sides."""
    tip = Frame(H.at(-0.1, 0, 4.9), H.d(1, 0, -0.18), H.d(0.18, 0, 1))
    R, na, nv = 3.35, 40, 14
    back = lambda a: (1 - math.cos(a)) / 2
    rows = []
    for j in range(nv + 1):
        v = j / nv
        row = []
        for i in range(na):
            a = 2 * math.pi * i / na
            if v <= 0.72:
                ph = v / 0.72 * (math.pi / 2 + 0.12)
                rr, zz = math.sin(ph) * R, math.cos(ph) * R * 0.98
            else:
                t = (v - 0.72) / 0.28
                ph = math.pi / 2 + 0.12
                r0, z0 = math.sin(ph) * R, math.cos(ph) * R * 0.98
                b = back(a)
                rr = r0 + t * (0.35 + 0.45 * b) + t * t * 0.15
                zz = z0 - t * (0.25 + 1.35 * b)
            row.append(tip.o + tip.f * (math.cos(a) * rr * 1.06) + tip.l * (math.sin(a) * rr) + tip.u * zz)
        rows.append(row)
    me = bpy.data.meshes.new('helm'); bm = bmesh.new()
    vs = [[bm.verts.new(p) for p in row] for row in rows]
    for j in range(nv):
        for i in range(na): bm.faces.new([vs[j][i], vs[j][(i + 1) % na], vs[j + 1][(i + 1) % na], vs[j + 1][i]])
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-4)
    bm.to_mesh(me); bm.free()
    o = bpy.data.objects.new('helm', me); bpy.context.scene.collection.objects.link(o)
    sol = o.modifiers.new('solid', 'SOLIDIFY'); sol.thickness = 0.26; sol.offset = -1
    with fig.hard():
        fig._add(o)
        for s in (1, -1): fig.sphere(tip.at(0.2, s * R * 0.93, 0.9), 0.3)            # vent lugs
        if net:
            rnd = mulberry(78)
            for i in range(16):                                              # foliage in the helmet band
                a = rnd() * 6.28; e = 0.25 + rnd() * 0.8
                p = tip.at(math.cos(a) * math.cos(e) * 3.5, math.sin(a) * math.cos(e) * 3.4, math.sin(e) * 3.2)
                fig.box(p, (0.5, 1.0, 0.12), Frame(p, tip.d(math.cos(a), math.sin(a), 0), tip.u).q, bevel=0.03)
            fig.ring(tip.at(0, 0, 0.6), tip.u, 3.3, 0.14, seg=36)
    for s in (1, -1): fig.strap([tip.at(-0.2, s * 3.4, -1.3), H.at(1.3, s * 1.2, 1.6)], 0.15)

def ssh40(fig, H, net=False):
    """the Soviet SSh-40: a tall, deep round shell with a short flared rim all round."""
    tip = Frame(H.at(-0.05, 0, 4.7), H.d(1, 0, -0.15), H.d(0.15, 0, 1))
    R = 3.4
    with fig.hard():
        fig.dome(tip.o, R, tip.q, squash=1.05, cut=-0.42, thick=0.26)
        rim = tip.at(0, 0, -0.42 * R * 1.05)
        fig.cyl(rim + tip.u * 0.05, rim - tip.u * 0.3, R * 0.9, seg=36, r2=R * 1.02).scale = (1, 1.04, 1)   # the flare (a hollow look from above)
        fig.ring(rim, tip.u, R * 0.93, 0.14, seg=36)
        for s in (1, -1): fig.sphere(tip.at(0.0, s * R * 0.95, 1.3), 0.25)          # rivets of the liner
        if net:
            rnd = mulberry(79)
            for i in range(14):
                a = rnd() * 6.28; e = 0.3 + rnd() * 0.8
                p = tip.at(math.cos(a) * math.cos(e) * 3.5, math.sin(a) * math.cos(e) * 3.45, math.sin(e) * 3.4)
                fig.box(p, (0.5, 1.0, 0.12), Frame(p, tip.d(math.cos(a), math.sin(a), 0), tip.u).q, bevel=0.03)
    for s in (1, -1): fig.strap([tip.at(-0.1, s * 3.2, -1.3), H.at(1.3, s * 1.2, 1.6)], 0.15)

def type90(fig, H, cap=False, net=False):
    """the Japanese Type 90 helmet (a rounded shell with a small flared rim and the star badge),
    or the officer's field cap; both with the cloth flaps hanging over the neck."""
    tip = Frame(H.at(-0.05, 0, 4.9), H.d(1, 0, -0.15), H.d(0.15, 0, 1))
    with fig.hard():
        if cap:
            fig.cyl(tip.at(0, 0, -0.9), tip.at(0, 0, 0.9), 3.0, seg=32, r2=2.9, bevel=0.3).scale = (1, 1.08, 1)
            vz = Frame(tip.at(2.3, 0, -0.9), tip.d(1, 0, -0.35), tip.u)
            fig.box(vz.o, (3.0, 1.2, 0.14), vz.q, bevel=0.05)                   # small visor
        else:
            fig.dome(tip.o, 3.3, tip.q, squash=0.95, cut=-0.22, thick=0.26)
            rim = tip.at(0, 0, -0.22 * 3.3 * 0.95)
            fig.cyl(rim + tip.u * 0.02, rim - tip.u * 0.2, 3.25, seg=36, r2=3.55).scale = (1, 1.04, 1)
        badge = tip.at(3.2 if not cap else 3.0, 0, 0.9 if not cap else 0.2)
        for i in range(5):                                                     # the star on the front
            a = i / 5 * 2 * math.pi
            fig.box(badge + tip.l * (math.sin(a) * 0.3) + tip.u * (math.cos(a) * 0.3), (0.2, 0.2, 0.6),
                    Frame(badge, tip.f, tip.l * math.sin(a) + tip.u * math.cos(a)).q, INS['yellow'], bevel=0.02)
        if net and not cap:
            rnd = mulberry(81)
            for i in range(16):
                a = rnd() * 6.28; e = 0.2 + rnd() * 0.9
                p = tip.at(math.cos(a) * math.cos(e) * 3.4, math.sin(a) * math.cos(e) * 3.4, math.sin(e) * 3.2)
                fig.box(p, (0.5, 1.1, 0.12), Frame(p, tip.d(math.cos(a), math.sin(a), 0), tip.u).q, bevel=0.03)
    for k in (-1, 0, 1):                                                       # neck flaps
        fig.box(H.at(-2.0, k * 1.5, 2.6), (1.6, 0.25, 2.8), Frame(H.at(-2.0, k * 1.5, 2.6), H.d(-1, k * 0.6, 0), H.u).q)
    for s in (1, -1): fig.strap([tip.at(-0.1, s * 3.2, -0.8), H.at(1.3, s * 1.2, 1.6)], 0.15)

def brim(fig, tip, rim, r, width, drop_f, drop_b, thick=0.2):
    """a moulded brim: a strip round the rim of a helmet, width(cos of the angle from the front)
    wide, dropping by drop_f (front) or drop_b (back) times its width at the edge."""
    na = 48; rows = [[], []]
    for i in range(na):
        a = 2 * math.pi * i / na
        c, sn = math.cos(a), math.sin(a)
        w = width(c)
        for j, t in enumerate((0.0, 1.0)):
            rr = r + w * t
            rows[j].append(rim + tip.f * (c * rr * 1.04) + tip.l * (sn * rr) - tip.u * (w * t * (drop_f if c > 0 else drop_b)))
    me = bpy.data.meshes.new('brim'); bm = bmesh.new()
    vs = [[bm.verts.new(p_) for p_ in row] for row in rows]
    for i in range(na): bm.faces.new([vs[0][i], vs[0][(i + 1) % na], vs[1][(i + 1) % na], vs[1][i]])
    bm.to_mesh(me); bm.free()
    o = bpy.data.objects.new('brim', me); bpy.context.scene.collection.objects.link(o)
    sol = o.modifiers.new('solid', 'SOLIDIFY'); sol.thickness = thick; sol.offset = 0
    fig._add(o)

def m33(fig, H, net=False):
    """the Italian M33: a smooth rounded shell, deep at the sides, flaring into a short brim that
    reaches a little further over the eyes and the neck, the badge on the front and the vent
    rivets on the sides."""
    tip = Frame(H.at(-0.05, 0, 4.85), H.d(1, 0, -0.14), H.d(0.14, 0, 1))
    R = 3.3
    with fig.hard():
        fig.dome(tip.o, R, tip.q, squash=0.96, cut=-0.3, thick=0.25)
        rim = tip.at(0, 0, -0.3 * R * 0.96)
        brim(fig, tip, rim, R * 0.93, lambda c: 0.45 + 0.35 * max(0.0, c) ** 2 + 0.55 * max(0.0, -c) ** 2, 0.5, 0.7)
        for s in (1, -1): fig.sphere(tip.at(0.1, s * R * 0.95, 1.1), 0.28)            # vent rivets
        fig.sphere(tip.at(-0.1, 0, R * 0.96 + 0.05), 0.3, scale=(1, 1, 0.5), q=tip.q)   # the vent on the crown
        badge = tip.at(R * 0.93, 0, 0.9)
        fig.box(badge, (0.9, 0.2, 0.7), tip.q, bevel=0.05)
        if net:
            rnd = mulberry(83)
            for i in range(14):
                a = rnd() * 6.28; e = 0.25 + rnd() * 0.8
                p = tip.at(math.cos(a) * math.cos(e) * 3.4, math.sin(a) * math.cos(e) * 3.4, math.sin(e) * 3.2)
                fig.box(p, (0.5, 1.0, 0.12), Frame(p, tip.d(math.cos(a), math.sin(a), 0), tip.u).q, bevel=0.03)
    for s in (1, -1): fig.strap([tip.at(-0.1, s * 3.2, -0.9), H.at(1.3, s * 1.2, 1.6)], 0.15)

def bustina(fig, H):
    """the bustina: the Italian side cap, a folded boat shape worn tilted, with its front peak and
    the badge on the left."""
    b = Frame(H.at(0.1, 0, 6.2), H.d(1, 0, 0.0), H.d(0.0, -0.25, 1))
    with fig.hard():
        fig.cyl(b.at(0, 0, -0.6), b.at(0, 0, 0.35), 2.9, seg=32, r2=2.4, bevel=0.1).scale = (0.92, 1.12, 1)   # the folded curtain
        fig.sphere(b.at(0, 0, 0.35), 2.4, scale=(0.35, 1.2, 0.55), q=b.q)       # the narrow crown
        fig.sphere(b.at(2.6, 0, 0.5), 0.55, scale=(0.5, 1, 1), q=b.q)           # its front peak
        fig.box(b.at(2.2, 2.2, -0.1), (0.2, 0.7, 0.8), Frame(b.o, b.f + b.l * 0.8, b.u).q, INS['gold'], bevel=0.05)   # badge

def adrian(fig, H, net=False):
    """the French Adrian helmet (M26): a round skull with the crest along the top, a peaked visor
    in front, a longer one over the neck, and the badge (a flaming grenade) on the front."""
    tip = Frame(H.at(-0.05, 0, 4.95), H.d(1, 0, -0.12), H.d(0.12, 0, 1))
    R = 3.25
    with fig.hard():
        fig.dome(tip.o, R, tip.q, squash=0.9, cut=-0.15, thick=0.25)
        rim = tip.at(0, 0, -0.15 * R * 0.9)
        fig.ring(rim, tip.u, R * 1.03, 0.2, seg=36, scale=(1, 1.04, 0.7))
        # the brim: one moulded strip round the rim, a peak in front, wider over the neck, narrow at the sides
        brim(fig, tip, rim, R * 0.98, lambda c: 0.25 + 1.15 * max(0.0, c) ** 2 + 1.5 * max(0.0, -c) ** 2, 0.45, 0.6)
        for k in range(9):                                                       # the crest along the top
            a = (k - 4) / 4 * 1.05
            p = tip.at(math.sin(a) * R * 0.99, 0, math.cos(a) * R * 0.9 + 0.2)
            fig.box(p, (0.24, 0.95, 0.7), Frame(p, tip.f * math.cos(a) - tip.u * math.sin(a), tip.f * math.sin(a) + tip.u * math.cos(a)).q, bevel=0.06)
        badge = tip.at(R * 0.92, 0, 1.1)
        fig.sphere(badge, 0.38)
        fig.box(badge + tip.u * 0.55, (0.3, 0.2, 0.7), tip.q, bevel=0.05)
        if net:
            rnd = mulberry(82)
            for i in range(14):
                a = rnd() * 6.28; e = 0.25 + rnd() * 0.8
                p = tip.at(math.cos(a) * math.cos(e) * 3.3, math.sin(a) * math.cos(e) * 3.3, math.sin(e) * 3.0)
                fig.box(p, (0.5, 1.0, 0.12), Frame(p, tip.d(math.cos(a), math.sin(a), 0), tip.u).q, bevel=0.03)
    for s in (1, -1): fig.strap([tip.at(-0.1, s * 3.2, -0.6), H.at(1.3, s * 1.2, 1.6)], 0.15)

def kepi(fig, H):
    """the officer's kepi: a stiff crown leaning forward over a flat visor, the chin strap across."""
    c = Frame(H.at(0.1, 0, 5.6), H.d(1, 0, -0.35), H.d(0.35, 0, 1))
    with fig.hard():
        fig.cyl(c.at(0, 0, -0.6), c.at(-0.2, 0, 2.6), 2.95, seg=32, r2=2.65, bevel=0.2).scale = (1, 1.1, 1)
        fig.ring(c.at(0, 0, -0.3), c.u, 3.0, 0.2, seg=32, scale=(1, 1.1, 1))
        vz = Frame(c.at(2.6, 0, -0.55), c.d(1, 0, -0.2), c.u)
        fig.box(vz.o, (3.8, 1.8, 0.16), vz.q, bevel=0.06)                       # visor
        fig.limb(c.at(2.8, 1.6, -0.2), c.at(2.8, -1.6, -0.2), 0.15)              # chin strap
        fig.sphere(c.at(2.95, 0, 1.1), 0.3, INS['gold'])                         # badge
        for z in (0.55, 0.85):                                                   # the officer's gold rank stripes
            t = (z + 0.6) / 3.2                                                  # where the tapering crown is at that height
            fig.ring(c.at(-0.2 * t, 0, z), c.u, 2.95 - 0.3 * t + 0.04, 0.06, INS['gold'], seg=32, scale=(1, 1.1, 1))

def brodie(fig, H, net=False):
    """the British Mk II 'soup plate': a shallow bowl with a wide flat brim all round."""
    tip = Frame(H.at(0.0, 0, 5.6), H.d(1, 0, -0.1), H.d(0.1, 0, 1))
    with fig.hard():
        fig.dome(tip.o, 3.1, tip.q, squash=0.62, cut=0.0, thick=0.25)
        fig.cyl(tip.at(0, 0, -0.06), tip.at(0, 0, 0.06), 4.55, seg=40, r2=4.45, bevel=0.05).scale = (1, 1.06, 1)   # the brim
        fig.ring(tip.at(0, 0, 0.0), tip.u, 4.5, 0.1, seg=40, scale=(1, 1.06, 1))
        if net:
            for k in range(-3, 4):
                fig.ring(tip.o, tip.l, 3.1, 0.08, seg=24, scale=(1, 1.06, 0.62)).rotation_quaternion @= Matrix.Rotation(k * 0.3, 3, 'Z').to_quaternion()
            rnd = mulberry(80)
            for i in range(12):
                a = rnd() * 6.28; e = 0.2 + rnd() * 0.9
                p = tip.at(math.cos(a) * math.cos(e) * 3.1, math.sin(a) * math.cos(e) * 3.1, math.sin(e) * 1.9)
                fig.box(p, (0.5, 0.9, 0.12), Frame(p, tip.d(math.cos(a), math.sin(a), 0), tip.u).q, bevel=0.03)
    for s in (1, -1): fig.strap([tip.at(-0.1, s * 2.9, -0.1), H.at(1.4, s * 1.2, 1.6)], 0.15)

def beret(fig, H):
    """a beret pulled down to the right, with the cap badge over the left eye."""
    b = Frame(H.at(0.1, 0, 6.3), H.d(1, 0, 0.0), H.d(0.0, -0.3, 1))
    with fig.hard():
        fig.cyl(b.at(0, 0, -0.5), b.at(0, 0, 0.0), 2.95, seg=32, bevel=0.1).scale = (1, 1.08, 1)   # the headband
        fig.sphere(b.at(0.0, -0.6, 0.35), 3.4, scale=(1.0, 1.1, 0.34), q=b.q)                   # the flopping crown
        fig.box(b.at(2.7, 1.0, 0.0), (0.8, 0.2, 0.9), b.q, INS['gold'], bevel=0.05)             # badge

def peaked_cap(fig, H):
    """an officer's peaked cap: raised crown, band, cord, shiny visor and badge."""
    c = Frame(H.at(0.0, 0, 6.2), H.d(1, 0, -0.1), H.d(0.1, 0, 1))
    with fig.hard():
        fig.cyl(c.at(0, 0, -1.3), c.at(0, 0, 0.0), 2.75, seg=32, bevel=0.15)       # band
        fig.cyl(c.at(0.3, 0, 0.0), c.at(0.3, 0, 0.9), 3.1, seg=32, r2=3.4, bevel=0.3).scale = (1, 1.12, 1)   # crown
        fig.cyl(c.at(1.2, 0, 1.0), c.at(1.2, 0, 1.25), 1.2, seg=16).scale = (1, 1, 1)   # the raised front of the crown
        rows = []
        vz = Frame(c.at(2.3, 0, -1.25), c.d(1, 0, -0.45), c.u)
        fig.box(vz.o, (3.8, 1.8, 0.16), vz.q, bevel=0.06)                      # visor
        fig.limb(c.at(2.7, 1.6, -0.8), c.at(2.7, -1.6, -0.8), 0.16)              # chin cord
        fig.sphere(c.at(2.85, 0, -0.55), 0.35); fig.box(c.at(2.9, 0, 0.35), (1.4, 0.2, 0.6), c.q, INS['silver'] if DE else None, bevel=0.05)   # cockade and eagle
        if DE:                                                                  # the Reich's cockade: black, white, red
            for r, col, k in ((0.4, 'black', 0.0), (0.28, 'white', 0.04), (0.15, 'red', 0.08)):
                fig.cyl(c.at(3.12 + k, 0, -0.55), c.at(3.17 + k, 0, -0.55), r, INS[col], seg=16)

# ---- national insignia, painted on (their own colour parts)
def star_badge(fig, c, n, up, r, colour):
    """a small five-pointed star facing n: five rays from the middle."""
    F_ = Frame(c, n, up)
    fig.cyl(c - F_.f * r * 0.12, c + F_.f * r * 0.12, r * 0.36, colour, seg=5)          # the pentagon in the middle
    for i in range(5):
        a = i / 5 * 2 * math.pi
        d = F_.u * math.cos(a) + F_.l * math.sin(a)
        fig.cyl(c + d * r * 0.2, c + d * r, r * 0.26, colour, seg=4, r2=0.02).scale = (1, 1, 1)   # a tapering point

def insignia_head(fig, H, cap):
    """the badge on the helmet or cap: the Wehrmacht's tricolour shield on the right of the
    Stahlhelm, the red star of the Red Army."""
    if DE and not cap:
        tip = Frame(H.at(-0.1, 0, 4.9), H.d(1, 0, -0.18), H.d(0.18, 0, 1))
        d = (-tip.l * 0.94 + tip.u * 0.34 + tip.f * 0.1).normalized()
        p, fr = tip.o + d * 3.42, Frame(tip.o + d * 3.42, d, tip.u)
        for k, c in enumerate(('black', 'white', 'red')):
            fig.box(p + fr.u * (0.32 - k * 0.32), (1.0 - k * 0.12, 0.14, 0.32), fr.q, INS[c], bevel=0.02)
    if SU and not cap:
        tip = Frame(H.at(-0.05, 0, 4.7), H.d(1, 0, -0.15), H.d(0.15, 0, 1))
        d = (tip.f + tip.u * 0.45).normalized()
        star_badge(fig, tip.o + d * 3.62, d, tip.u, 1.0, INS['red'])
    if SU and cap:
        c = Frame(H.at(0.0, 0, 6.2), H.d(1, 0, -0.1), H.d(0.1, 0, 1))
        star_badge(fig, c.at(3.25, 0, -0.55), c.f, c.u, 0.8, INS['red'])

def insignia_rank(fig, T):
    """a captain's rank, the way each army wore it: on the shoulder straps (the American silver
    bars, the German silver boards with two gold pips, the Soviet gold pogony with their red
    stripe and stars, the British three pips, the French three gold galons, the Italian three
    stars) or on the collar (the German Litzen, the Japanese red tabs with a gold stripe and three
    stars)."""
    for s in (1, -1):
        b = T.at(-0.05, s * 3.0, 10.9)                                         # the shoulder strap, lying along the shoulder
        B = Frame(b, T.f, T.u)
        along = lambda k, u=0.0: B.at(0, s * k, 0.12 + u)
        if US:
            for k in (-0.2, 0.2): fig.box(along(k), (0.24, 0.8, 0.12), B.q, INS['silver'], bevel=0.02)
        elif DE:
            fig.box(b, (2.1, 0.8, 0.2), B.q, INS['silver'], bevel=0.06)
            for k in (-0.3, 0.3): fig.sphere(along(k, 0.08), 0.17, INS['gold'], seg=10)
        elif SU:
            fig.box(b, (2.1, 0.9, 0.2), B.q, INS['gold'], bevel=0.06)
            fig.box(along(0, 0.02), (2.0, 0.16, 0.12), B.q, INS['red'], bevel=0.0)
            for k in (-0.55, -0.15): fig.sphere(along(k, 0.05) + B.f * 0.25, 0.12, INS['silver'], seg=8)
            for k in (-0.55, -0.15): fig.sphere(along(k, 0.05) - B.f * 0.25, 0.12, INS['silver'], seg=8)
        elif GB:
            for k in (-0.55, 0.0, 0.55): star_badge(fig, along(k, 0.02), T.u, T.f, 0.4, INS['gold'])
        elif FR:
            for k in (-0.35, 0.0, 0.35): fig.box(along(k), (0.16, 0.9, 0.1), B.q, INS['gold'], bevel=0.0)
        elif IT:
            for k in (-0.55, 0.0, 0.55): star_badge(fig, along(k, 0.02), T.u, T.f, 0.4, INS['gold'])
        if DE or JP:                                                           # the collar tabs
            d = (T.f * 0.8 + T.l * (s * 0.6)).normalized()
            c = T.at(1.55, s * 1.3, 10.5) + d * 0.3
            C = Frame(c, d, T.u)
            if DE:
                for k in (0.18, -0.18): fig.box(C.at(0, 0, k), (1.0, 0.12, 0.12), C.q, INS['silver'], bevel=0.0)
            else:
                fig.box(c, (1.1, 0.12, 0.6), C.q, INS['red'], bevel=0.02)
                fig.box(C.at(0.02, 0, 0), (1.1, 0.12, 0.14), C.q, INS['gold'], bevel=0.0)
                for k in (-0.32, 0.0, 0.32): fig.sphere(C.at(0.05, k, 0.18), 0.08, INS['yellow'], seg=8)

def insignia_collar(fig, T):
    """the Italian stellette: a white star on each side of the collar."""
    for s in (1, -1):
        d = (T.f * 0.8 + T.l * (s * 0.6)).normalized()
        star_badge(fig, T.at(1.6, s * 1.35, 10.55) + d * 0.25, d, T.u, 0.7, INS['white'])

def insignia_sleeve(fig, sh, el):
    """a patch on the left upper arm: the Stars and Stripes as worn in North Africa, the Union
    flag, or the Free French shield with the cross of Lorraine."""
    a = (el - sh).normalized()
    out = fig._T.l - a * fig._T.l.dot(a)
    if out.length < 0.2: out = fig._T.f - a * fig._T.f.dot(a)
    out.normalize()
    p = sh + (el - sh) * 0.3 + out * 1.36
    P_ = Frame(p, out, -a)
    q, at = P_.q, lambda l, u, f=0.0: P_.at(f, l, u)
    if US:
        fig.box(at(0, 0), (1.4, 0.14, 1.0), q, INS['white'], bevel=0.02)
        for k in (0.36, 0.0, -0.36): fig.box(at(0, k, 0.03), (1.4, 0.14, 0.15), q, INS['red'], bevel=0.0)
        fig.box(at(0.4, 0.24, 0.05), (0.6, 0.14, 0.5), q, INS['blue'], bevel=0.0)
    elif GB:
        fig.box(at(0, 0), (1.4, 0.14, 0.95), q, INS['blue'], bevel=0.02)
        for s in (1, -1):                                                   # the white saltire
            d = (P_.l * 1.4 + P_.u * s * 0.95).normalized()
            fig.box(at(0, 0, 0.02), (0.14, 0.14, 1.6), Frame(p, out, d).q, INS['white'], bevel=0.0)
        fig.box(at(0, 0, 0.04), (1.4, 0.14, 0.3), q, INS['white'], bevel=0.0); fig.box(at(0, 0, 0.04), (0.34, 0.14, 0.95), q, INS['white'], bevel=0.0)
        fig.box(at(0, 0, 0.06), (1.4, 0.14, 0.16), q, INS['red'], bevel=0.0); fig.box(at(0, 0, 0.06), (0.18, 0.14, 0.95), q, INS['red'], bevel=0.0)
    elif FR:
        fig.box(at(0, 0), (1.0, 0.14, 1.3), q, INS['blue'], bevel=0.05)
        fig.box(at(0, -0.05, 0.03), (0.16, 0.14, 1.0), q, INS['red'], bevel=0.0)
        fig.box(at(0, 0.3, 0.03), (0.46, 0.14, 0.14), q, INS['red'], bevel=0.0)
        fig.box(at(0, 0.05, 0.03), (0.66, 0.14, 0.14), q, INS['red'], bevel=0.0)

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
    if (US or GB or FR) and getattr(fig, '_shL', None) is not None and (sh - fig._shL).length < 1e-6:
        insignia_sleeve(fig, sh, el)
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
        if not (DE or SU or GB or JP or FR or IT): fig.box(at(0.28, 0.95), (0.4, 0.4, 0.35), q, bevel=0.05)    # rear sight
        fig.box(at(0.35, -0.35), (0.35, 1.0, 0.5), q, bevel=0.05)              # trigger
        fig.ring(at(0.33, -0.45), R.l, 0.55, 0.1, seg=16, scale=(1, 1.3, 1))    # trigger guard
        fig.cyl(at(0.3, 0.4), at(1.0, 0.4), 0.25, seg=10)                       # barrel
        if IT:
            fig.cyl(at(0.3, 0.55, -0.4), at(0.31, 0.2, -1.0), 0.12, seg=8)        # the Carcano's bolt handle, turned down
            fig.sphere(at(0.31, 0.18, -1.05), 0.26)
            for k in (0.6, 0.82): fig.ring(at(k, 0.25), R.f, 0.56, 0.1, seg=16)
            fig.box(at(0.96, 0.9), (0.3, 0.8, 0.5), q, bevel=0.05)
            fig.box(at(1.08, 0.2, 0.25), (0.12, Ln * 0.14, 0.5), q, bevel=0.03)   # the folding bayonet, open
            fig.box(at(0.99, 0.2, 0.2), (0.4, 0.45, 0.45), q, bevel=0.03)
        elif FR:
            fig.cyl(at(0.3, 0.55, -0.4), at(0.38, 0.3, -1.1), 0.12, seg=8)        # the MAS-36's bolt handle, bent forward
            fig.sphere(at(0.39, 0.28, -1.15), 0.25)
            for k in (0.6, 0.8): fig.ring(at(k, 0.25), R.f, 0.56, 0.1, seg=16)
            fig.box(at(0.96, 0.9), (0.3, 0.9, 0.5), q, bevel=0.05)
            fig.cyl(at(1.0, 0.25, 0.3), at(1.24, 0.25, 0.3), 0.13, seg=6, r2=0.02)   # the cruciform spike bayonet
            fig.box(at(0.99, 0.2, 0.2), (0.4, 0.4, 0.4), q, bevel=0.03)
        elif JP:
            fig.cyl(at(0.3, 0.55, -0.4), at(0.3, 0.45, -1.2), 0.12, seg=8)        # Arisaka's bolt with its oval knob
            fig.sphere(at(0.3, 0.45, -1.28), 0.28)
            fig.box(at(0.33, 0.95), (0.6, Ln * 0.08, 0.2), q, bevel=0.04)        # the dust cover
            for k in (0.58, 0.8): fig.ring(at(k, 0.25), R.f, 0.56, 0.1, seg=16)
            fig.box(at(1.14, 0.2, 0.3), (0.12, Ln * 0.3, 0.55), q, bevel=0.03)    # the long Type 30 bayonet, fixed
            fig.box(at(0.99, 0.2, 0.2), (0.45, 0.5, 0.5), q, bevel=0.03)
        elif GB:
            fig.cyl(at(0.26, 0.6, -0.4), at(0.24, 0.35, -1.1), 0.12, seg=8)        # the Lee-Enfield's bolt, set well back
            fig.sphere(at(0.24, 0.33, -1.15), 0.25)
            fig.box(at(0.36, -0.95), (0.6, 1.2, 1.4), q, bevel=0.08)               # the box magazine
            for k in (0.55, 0.76): fig.ring(at(k, 0.25), R.f, 0.56, 0.1, seg=16)
            fig.box(at(0.93, 0.85), (0.4, 0.5, 0.5), q, bevel=0.05)               # front sight protector
        elif SU:
            fig.cyl(at(0.3, 0.55, -0.4), at(0.3, 0.55, -1.25), 0.12, seg=8)        # Mosin's straight bolt handle
            fig.sphere(at(0.3, 0.55, -1.3), 0.26)
            for k in (0.6, 0.82): fig.ring(at(k, 0.25), R.f, 0.56, 0.1, seg=16)
            fig.box(at(0.96, 0.9), (0.3, 0.9, 0.5), q, bevel=0.05)
            fig.cyl(at(1.0, 0.25, 0.35), at(1.2, 0.25, 0.35), 0.12, seg=6, r2=0.02)   # the spike bayonet, always fixed
            fig.box(at(0.99, 0.2, 0.2), (0.4, 0.4, 0.4), q, bevel=0.03)
        elif DE:
            fig.cyl(at(0.3, 0.55, -0.55), at(0.33, 0.1, -0.95), 0.12, seg=8)        # the bent-down bolt handle
            fig.sphere(at(0.33, 0.1, -0.98), 0.24)
            for k in (0.58, 0.8): fig.ring(at(k, 0.25), R.f, 0.56, 0.1, seg=16)
            fig.box(at(0.96, 0.9), (0.3, 0.9, 0.5), q, bevel=0.05)              # hooded front sight
        else:
            fig.cyl(at(0.78, 0.05), at(0.99, 0.05), 0.24, seg=10)               # gas cylinder
            for k in (0.56, 0.79): fig.ring(at(k, 0.3), R.f, 0.58, 0.1, seg=16) # bands
        fig.box(at(0.985, 0.72), (0.2, 0.3, 0.5), q, bevel=0.03)               # front sight
        if scope:
            fig.cyl(at(0.24, 1.35), at(0.52, 1.35), 0.42, seg=16)
            for k, r in ((0.2, 0.62), (0.52, 0.6)): fig.cyl(at(k, 1.35), at(k + 0.06, 1.35), r, seg=16, r2=0.44 if k < 0.3 else r)
            for k in (0.3, 0.46): fig.box(at(k, 0.95), (0.5, 0.5, 0.6), q, bevel=0.05)
        if bayonet: fig.box(at(1.08, 0.1), (0.2, Ln * 0.2, 0.45), q, bevel=0.05)
        if sling: fig.strap([at(0.12, -1.2), at(0.45, -1.9), at(0.8, -0.6)], 0.14)
    fig.muzzle = muzzle
    return R

def mg42(fig, butt, muzzle, up=U):
    """MG42: stock, receiver with the feed cover, perforated barrel jacket, muzzle booster,
    folded bipod and a belt of cartridges hanging from the left."""
    R = Frame(butt, muzzle - butt, up, True); Ln = (muzzle - butt).length; q = R.q
    at = lambda k, u=0.0, l=0.0: R.at(Ln * k, l, u)
    with fig.hard():
        fig.box(at(0.08, -0.3), (0.9, Ln * 0.16, 1.7), q, bevel=0.2)            # stock
        fig.box(at(0.37, 0.3), (1.0, Ln * 0.3, 1.25), q, bevel=0.1)             # receiver
        fig.box(at(0.4, 1.0), (1.1, Ln * 0.2, 0.35), q, bevel=0.08)             # feed cover
        fig.box(at(0.3, -1.1), (0.55, 0.9, 1.7), Frame(at(0.3), R.d(1, 0, 0.3), R.u).q, bevel=0.1)   # pistol grip
        fig.cyl(at(0.52, 0.3), at(0.94, 0.3), 0.62, seg=14)                    # barrel jacket
        for k in range(7):
            fig.box(at(0.56 + k * 0.05, 0.3, 0.62), (0.05, 0.6, 0.35), q, bevel=0.0)   # its cooling slots
        fig.cyl(at(0.94, 0.3), at(1.0, 0.3), 0.42, seg=12, r2=0.3)             # muzzle booster
        for s in (0.4, -0.4): fig.cyl(at(0.9, 0.0, s), at(0.62, -0.25, s * 1.3), 0.11, seg=6)   # folded bipod
        pts = [at(0.4, 0.0, 0.8)] + [at(0.4 - k * 0.02, -1.2 - k * 1.1, 1.0 + k * 0.15) for k in range(1, 5)]
        for p_ in pts: fig.box(p_, (1.3, 0.35, 0.3), q, bevel=0.05)             # the ammunition belt
    fig.muzzle = muzzle
    return R

def dp28(fig, butt, muzzle, up=U):
    """Degtyaryov DP-28: wooden stock, receiver, the flat pan magazine on top, the ribbed barrel
    shroud and the folded bipod."""
    R = Frame(butt, muzzle - butt, up, True); Ln = (muzzle - butt).length; q = R.q
    at = lambda k, u=0.0, l=0.0: R.at(Ln * k, l, u)
    with fig.hard():
        fig.box(at(0.1, -0.4), (0.9, Ln * 0.2, 1.8), q, bevel=0.2)
        fig.box(at(0.25, -0.05), (0.8, Ln * 0.12, 1.1), q, bevel=0.15)
        fig.box(at(0.4, 0.2), (0.95, Ln * 0.22, 1.1), q, bevel=0.1)
        fig.box(at(0.33, -0.9), (0.5, 0.8, 1.2), q, bevel=0.1)                  # trigger group
        pan = at(0.4, 1.35)
        fig.cyl(pan - R.u * 0.3, pan + R.u * 0.3, 2.6, seg=28, bevel=0.15)       # the pan magazine
        fig.cyl(pan + R.u * 0.3, pan + R.u * 0.5, 0.8, seg=16)
        fig.cyl(at(0.52, 0.2), at(0.96, 0.2), 0.5, seg=14)                      # barrel shroud
        for k in range(6): fig.ring(at(0.56 + k * 0.07, 0.2), R.f, 0.52, 0.08, seg=14)
        fig.cyl(at(0.96, 0.2), at(1.0, 0.2), 0.36, seg=12, r2=0.3)
        for s in (0.4, -0.4): fig.cyl(at(0.88, 0.0, s), at(0.6, -0.2, s * 1.3), 0.11, seg=6)
    fig.muzzle = muzzle
    return R

def bren(fig, butt, muzzle, up=U):
    """Bren gun: skeleton butt, receiver, the curved magazine on top, carrying handle, the
    barrel with its conical flash hider and the bipod."""
    R = Frame(butt, muzzle - butt, up, True); Ln = (muzzle - butt).length; q = R.q
    at = lambda k, u=0.0, l=0.0: R.at(Ln * k, l, u)
    with fig.hard():
        fig.box(at(0.1, -0.2), (0.8, Ln * 0.2, 1.5), q, bevel=0.2)
        fig.box(at(0.38, 0.2), (0.95, Ln * 0.32, 1.2), q, bevel=0.1)
        fig.box(at(0.3, -1.0), (0.55, 0.8, 1.5), Frame(at(0.3), R.d(1, 0, 0.3), R.u).q, bevel=0.1)
        for k in range(5):                                                     # the curved magazine
            t = k / 4
            fig.box(at(0.4 + t * 0.07, 1.0 + t * 1.6), (0.7, 1.9 - t * 0.2, 0.45), Frame(at(0.4), R.d(1, 0, -0.3 - t * 0.5), R.u).q, bevel=0.06)
        fig.box(at(0.62, 1.2), (0.25, 1.6, 0.3), q, bevel=0.05)                  # carrying handle
        fig.cyl(at(0.55, 0.25), at(0.95, 0.25), 0.36, seg=12)
        fig.cyl(at(0.93, 0.25), at(1.0, 0.25), 0.3, seg=12, r2=0.5)             # flash hider
        for s in (0.45, -0.45): fig.cyl(at(0.88, 0.0, s), at(0.62, -0.25, s * 1.3), 0.11, seg=6)
    fig.muzzle = muzzle
    return R

def fm2429(fig, butt, muzzle, up=U):
    """the French FM 24/29: wooden butt, receiver with the straight box magazine on top, two
    triggers, the barrel with its flash hider and the bipod."""
    R = Frame(butt, muzzle - butt, up, True); Ln = (muzzle - butt).length; q = R.q
    at = lambda k, u=0.0, l=0.0: R.at(Ln * k, l, u)
    with fig.hard():
        fig.box(at(0.1, -0.35), (0.85, Ln * 0.2, 1.7), q, bevel=0.2)
        fig.box(at(0.38, 0.2), (0.95, Ln * 0.3, 1.2), q, bevel=0.1)
        fig.box(at(0.3, -1.0), (0.55, 0.8, 1.5), Frame(at(0.3), R.d(1, 0, 0.3), R.u).q, bevel=0.1)
        for k in (0.36, 0.41): fig.box(at(k, -0.65), (0.25, 0.3, 0.5), q, bevel=0.03)   # the two triggers
        fig.box(at(0.44, 1.8), (0.65, 1.5, 2.4), Frame(at(0.44), R.d(1, 0, 0.2), R.u).q, bevel=0.08)   # straight magazine, leaning forward
        fig.cyl(at(0.5, 0.2), at(0.62, 0.2), 0.5, seg=14)                          # gas cylinder housing
        fig.cyl(at(0.55, 0.3), at(0.95, 0.3), 0.34, seg=12)
        fig.cyl(at(0.94, 0.3), at(1.0, 0.3), 0.44, seg=12)
        for s in (0.45, -0.45): fig.cyl(at(0.88, 0.05, s), at(0.64, -0.25, s * 1.3), 0.11, seg=6)
    fig.muzzle = muzzle
    return R

def breda30(fig, butt, muzzle, up=U):
    """the Breda 30: a slim butt, the receiver with the magazine box hinged on its right side, a
    pistol grip, the thin barrel with its conical flash hider and the bipod."""
    R = Frame(butt, muzzle - butt, up, True); Ln = (muzzle - butt).length; q = R.q
    at = lambda k, u=0.0, l=0.0: R.at(Ln * k, l, u)
    with fig.hard():
        fig.box(at(0.1, -0.3), (0.8, Ln * 0.2, 1.5), q, bevel=0.2)
        fig.box(at(0.38, 0.2), (1.0, Ln * 0.3, 1.25), q, bevel=0.1)
        fig.box(at(0.3, -1.0), (0.55, 0.8, 1.5), Frame(at(0.3), R.d(1, 0, 0.3), R.u).q, bevel=0.1)
        fig.box(at(0.42, 0.3, -1.3), (1.9, 1.4, 0.6), q, bevel=0.08)                 # the side magazine, sticking out to the right
        fig.box(at(0.28, 0.9), (0.2, 1.2, 0.3), q, bevel=0.04)                        # carrying handle
        fig.cyl(at(0.55, 0.25), at(0.95, 0.25), 0.28, seg=12)
        for k in range(4): fig.ring(at(0.57 + k * 0.03, 0.25), R.f, 0.34, 0.08, seg=12)
        fig.cyl(at(0.93, 0.25), at(1.0, 0.25), 0.26, seg=12, r2=0.46)                 # conical flash hider
        for s in (0.45, -0.45): fig.cyl(at(0.86, 0.0, s), at(0.62, -0.25, s * 1.3), 0.11, seg=6)
    fig.muzzle = muzzle
    return R

def smg(fig, butt, muzzle, up=U):
    if IT: return breda30(fig, butt, muzzle, up)
    if FR: return fm2429(fig, butt, muzzle, up)
    if GB: return bren(fig, butt, muzzle, up)
    if JP:
        R = bren(fig, butt, muzzle, up)                                          # Type 96: much like a Bren...
        Ln = (muzzle - butt).length
        with fig.hard():
            for k in range(7): fig.ring(R.at(Ln * (0.56 + k * 0.035), 0, 0.25), R.f, 0.5, 0.12, seg=14)   # ...with cooling fins
        fig.muzzle = muzzle
        return R
    if DE: return mg42(fig, butt, muzzle, up)
    if SU: return dp28(fig, butt, muzzle, up)
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
    if IT:
        with fig.hard():                                                        # the SRCM Mod. 35 'red devil'
            fig.cyl(c - U * r * 0.9, c + U * r * 0.5, r * 0.8, colour, seg=16, bevel=0.2)
            fig.cyl(c + U * r * 0.5, c + U * r * 1.0, r * 0.88, colour, seg=16, bevel=0.1)   # the cap
            fig.box(c + U * r * 0.2 + F * r * 0.85, (r * 0.4, r * 0.15, r * 1.3), None, colour, bevel=0.02)   # the safety strap
        return
    if JP:
        with fig.hard():                                                        # Type 97: a segmented cylinder
            fig.cyl(c - U * r * 0.8, c + U * r * 0.8, r * 0.85, colour, seg=14, bevel=0.1)
            for k in (-0.4, 0.0, 0.4): fig.ring(c + U * r * k, U, r * 0.87, r * 0.1, colour, seg=14)
            fig.cyl(c + U * r * 0.8, c + U * r * 1.3, r * 0.3, colour, seg=10)
        return
    if SU:
        with fig.hard():                                                        # RGD-33 with its fragmentation sleeve
            fig.cyl(c - U * r * 0.5, c + U * r * 0.9, r * 1.05, colour, seg=16, bevel=0.12)
            fig.ring(c + U * r * 0.2, U, r * 1.08, r * 0.12, colour, seg=16)
            fig.cyl(c - U * r * 2.6, c - U * r * 0.5, r * 0.5, colour, seg=12)
        return
    if DE:
        with fig.hard():                                                        # Stielhandgranate
            fig.cyl(c - U * r * 0.3, c + U * r * 1.1, r * 0.95, colour, seg=16, bevel=0.1)
            fig.cyl(c - U * r * 3.8, c - U * r * 0.3, r * 0.42, colour, seg=12)
            fig.cyl(c - U * r * 3.9, c - U * r * 3.7, r * 0.5, colour, seg=12)
        return
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
    if JP and missile:
        # the Type 89 'knee mortar': a short rifled tube on a curved base plate, pointed up
        with fig.hard():
            fig.cyl(at(0.45), at(0.95), r * 0.45, seg=16)
            fig.cyl(at(0.93), at(0.97), r * 0.55, seg=16)
            fig.cyl(at(0.3), at(0.45), r * 0.3, seg=10)
            fig.box(at(0.28), (2.0, 0.4, 1.2), q, bevel=0.1)                       # the curved base plate
            fig.box(at(0.5, -r * 0.6), (0.4, 0.6, 0.8), q, bevel=0.05)
        fig.muzzle = at(0.97)
        return
    if GB and not missile:
        # PIAT: the boxy tube with its shoulder pad, the trough in front holding the bomb, the
        # monopod and the sight
        with fig.hard():
            fig.cyl(at(0.08), at(0.62), r * 1.05, seg=20, bevel=0.1)
            fig.box(at(0.02, -0.2), (1.4, 0.8, 2.4), q, bevel=0.2)                   # shoulder pad
            fig.box(at(0.75, -0.3), (1.6, Ln * 0.25, 0.3), q, bevel=0.05)           # the trough
            fig.cyl(at(0.66, 0.3), at(0.88, 0.3), r * 0.62, seg=16)                 # the bomb
            fig.cyl(at(0.88, 0.3), at(0.98, 0.3), r * 0.62, seg=16, r2=r * 0.15)
            for k in range(4): fig.box(at(0.62, 0.3) + (R.u * math.cos(k * 1.57) + R.l * math.sin(k * 1.57)) * r * 0.55, (0.5, 0.8, 0.12), q, bevel=0.02)
            fig.box(at(0.4, -r - 1.2), (0.7, 0.9, 2.0), Frame(at(0.4), R.d(1, 0, 0.3), R.u).q, bevel=0.1)
            fig.cyl(at(0.62, -r), at(0.66, -r - 4.0), 0.14, seg=6)                   # monopod
            fig.box(at(0.55, r + 0.9, 0.9), (0.2, 0.3, 1.4), q, bevel=0.03)
        fig.muzzle = at(0.98, 0.3)
        return
    if GB and missile:
        # the Boys anti-tank rifle with its magazine on top and the big muzzle brake, aimed up
        with fig.hard():
            fig.box(at(0.3, -0.2), (1.0, Ln * 0.14, 1.9), q, bevel=0.2)
            fig.cyl(at(0.38, 0.2), at(0.58, 0.2), 0.7, seg=16)
            fig.box(at(0.47, 1.4), (0.6, 1.3, 1.6), q, bevel=0.1)                   # magazine on top, offset
            fig.cyl(at(0.58, 0.2), at(1.08, 0.2), 0.33, seg=12)
            fig.cyl(at(1.04, 0.2), at(1.12, 0.2), 0.7, seg=12, bevel=0.05)
            for s in (0.5, -0.5): fig.cyl(at(0.62, 0.0, s), at(0.64, -2.5, s * 2.0), 0.12, seg=6)
            fig.box(at(0.42, -1.1), (0.6, 0.8, 1.6), q, bevel=0.1)
        fig.muzzle = at(1.12, 0.2)
        return
    if SU or JP or IT:
        # PTRD (Italy: the Solothurn S-18/1000, much the same shape) (the long anti-tank rifle with its muzzle brake, bipod and carrying handle); for the AA
        # soldier the semi-automatic PTRS with its magazine, aimed up at the aircraft
        with fig.hard():
            fig.box(at(0.32, -0.2), (1.0, Ln * 0.14, 1.9), q, bevel=0.2)            # butt with the pad
            fig.cyl(at(0.4, 0.2), at(0.58, 0.2), 0.75, seg=16)                      # receiver
            fig.cyl(at(0.58, 0.2), at(1.08, 0.2), 0.36, seg=12)                     # barrel
            fig.cyl(at(1.05, 0.2), at(1.13, 0.2), 0.62, seg=12, bevel=0.05)          # muzzle brake
            for s in (0.5, -0.5): fig.cyl(at(0.7, 0.0, s), at(0.72, -3.0, s * 2.2), 0.13, seg=6)   # bipod
            fig.box(at(0.5, 1.1), (0.25, 1.6, 0.3), q, bevel=0.04)                  # carrying handle
            fig.box(at(0.45, -1.2), (0.6, 0.8, 1.6), q, bevel=0.1)                  # grip
            if missile: fig.box(at(0.5, -1.6), (0.7, 1.4, 1.2), q, bevel=0.08)      # magazine
        fig.muzzle = at(1.13, 0.2)
        return
    if DE and missile:
        # Fliegerfaust: a bundle of nine small barrels with a grip and a frame sight
        with fig.hard():
            for i in range(9):
                a_ = i / 9 * 2 * math.pi
                off = R.u * (math.sin(a_) * r * 0.75) + R.l * (math.cos(a_) * r * 0.75)
                fig.cyl(a + off, b + off, r * 0.32, seg=10)
            for k in (0.1, 0.9): fig.ring(at(k), R.f, r * 1.1, 0.2, seg=24)
            fig.box(at(0.6, r + 0.9), (0.2, 0.2, 1.6), q, bevel=0.03)
            fig.box(at(0.35, -r - 1.3), (0.8, 1.0, 2.3), Frame(at(0.35), R.d(1, 0, 0.3), R.u).q, bevel=0.1)
        fig.muzzle = b
        return
    with fig.hard():
        fig.cyl(a, b, r, seg=24)
        if DE:
            # Panzerschreck: the blast shield with its sighting window, left of the face
            sh_ = at(0.64, 1.6, 2.4)
            fig.box(sh_, (7.0, 0.2, 8.0), Frame(sh_, R.f, R.u).q, bevel=0.12)
            fig.box(sh_ + R.u * 1.4 + R.l * 1.2 + R.f * 0.12, (1.6, 0.25, 1.1), Frame(sh_, R.f, R.u).q, bevel=0.05)   # window frame
            for k in (-1, 1): fig.cyl(sh_ + R.u * 3.9 + R.l * (k * 3.2), sh_ + R.u * 4.2 + R.l * (k * 3.2), 0.18, seg=6)
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

def officer_mark(fig, T, shL, elL, elR, grip):
    """what marks an officer out on each army's sleeve (or across his chest):
    British: the corps headquarters brassard, red-white-red; Red Army: the red duty arm band with a
    white 'D'; Japanese: the white duty arm band with its red stripe; French: the tricolour FFI arm
    band with the cross of Lorraine; German: a black cuff title with silver lettering round the right
    cuff; Italian: the Savoy-blue sash from the right shoulder to the left hip. (The American officer's
    mark is the white stripe down the back of his helmet.)"""
    W, R, B = INS['white'], INS['red'], INS['blue']
    c, ax = shL + (elL - shL) * 0.45, (elL - shL).normalized()
    n = (L - ax * L.dot(ax)).normalized(); Fr = Frame(c, n, ax)
    def bands(cols, w=0.42):                                                                  # rings stacked along the arm
        for k, col in enumerate(cols): fig.ring(c + ax * (k - (len(cols) - 1) / 2) * w, ax, 1.45, w * 0.62, col, seg=18)
    out = c + n * 1.9
    if GB: bands([R, W, R])
    elif SU:
        bands([R, R, R])
        fig.box(out + ax * 0.25, (0.7, 0.12, 0.18), Fr.q, W, bevel=0.02); fig.box(out, (0.45, 0.12, 0.5), Fr.q, W, bevel=0.02)   # Д
    elif JP: bands([W, R, W])
    elif FR:
        bands([B, W, R])
        fig.box(out, (0.14, 0.12, 0.4), Fr.q, R, bevel=0.01)                                  # cross of Lorraine
        for dz, w in ((0.1, 0.3), (-0.04, 0.38)): fig.box(out + ax * dz, (w, 0.12, 0.08), Fr.q, R, bevel=0.01)
    elif DE:
        ax2 = (grip - elR).normalized(); c2 = elR + (grip - elR) * 0.62
        fig.ring(c2, ax2, 1.12, 0.36, INS['black'], seg=18)
        n2 = (-L - ax2 * (-L).dot(ax2)).normalized(); F2 = Frame(c2, n2, ax2)
        for k in range(4): fig.box(c2 + n2 * 1.45 + F2.l * 0.0 + ax2 * ((k - 1.5) * 0.3), (0.12, 0.1, 0.18), F2.q, INS['silver'], bevel=0.01)
    elif IT:
        pts = [T.at(0.4, -3.4, 11.2), T.at(2.4, -1.8, 8.6), T.at(2.7, 0.4, 5.2), T.at(2.2, 2.6, 2.2), T.at(1.0, 3.8, 0.3)]
        for a, b in zip(pts, pts[1:]):
            d = b - a; m = (a + b) / 2
            fig.box(m, (2.2, 0.35, d.length + 0.3), Frame(m, T.f, d).q, '#2a5caa', bevel=0.05)
        fig.sphere(pts[-1] + T.d(0.5, 0.2, -1.0) * 1.0, 0.45, '#2a5caa')                     # the knot and fringe
        fig.cyl(pts[-1] + T.d(0.5, 0.2, -1.0) * 1.2, pts[-1] + T.d(0.5, 0.2, -1.0) * 3.2, 0.35, '#2a5caa', seg=10)

def officer():
    """strides forward pointing the way with his pistol, the other arm waving the men on."""
    fig = Fig('officer')
    pel = standing(fig, stride=5.0, stance=2.6, lean=0.6)
    T = Frame(pel, turn(F, -0.25), D(0.06, 0, 1))
    shR, shL, neck = torso(fig, T, pack=False)
    grip = shR + F * 12.2 + U * 0.8 - L * 0.4
    elR = arm(fig, shR, grip, pole=D(0, -0.6, -1), grip_dir=F)
    pistol(fig, grip + F * 0.35, F)
    elL = arm(fig, shL, shL + P(3.5, 3.5, 9.5), pole=D(-0.5, 1, -0.2), grip_dir=U)   # fist up: follow me
    officer_mark(fig, T, shL, elL, elR, grip)
    head(fig, neck, turn(F, 0.15), D(0.05, 0.1, 1), helmet='cap' if (DE or SU or GB or JP or FR or IT) else True)
    if US:                                                                       # a captain's two silver bars on the front of his helmet
        H = Frame(neck, turn(F, 0.15), D(0.05, 0.1, 1))
        # and the officer's white vertical stripe down the back of it (the NCOs' ran across)
        tipH = Frame(H.at(-0.05, 0, 4.85), H.d(1, 0, -0.2), H.d(0.2, 0, 1))          # the shell's own frame (see _head)
        for a in (-0.1, 0.2, 0.5, 0.8):
            d = -tipH.f * math.cos(a) + tipH.u * math.sin(a)
            r = 3.45 * math.hypot(1.08 * math.cos(a), 0.95 * math.sin(a)) + 0.08
            fig.box(tipH.o + d * r, (0.6, 0.22, 1.15), Frame(tipH.o, d, tipH.u * math.cos(a) + tipH.f * math.sin(a)).q, INS['white'], bevel=0.03)
        tip = Frame(H.at(-0.05, 0, 4.85), H.d(1, 0, -0.2), H.d(0.2, 0, 1))
        d = (tip.f + tip.u * 0.4).normalized(); p = tip.o + d * 3.5; B = Frame(p, d, tip.u)
        for s_ in (1, -1): fig.box(B.at(0, s_ * 0.3, 0), (0.28, 0.14, 0.9), B.q, INS['silver'], bevel=0.03)
    insignia_rank(fig, T)
    if JP:
        with fig.hard():                                                         # the officer's sword at his hip
            hilt = T.at(1.2, 3.6, 2.2)
            fig.cyl(hilt, hilt + T.d(1.0, 0.1, 0.6) * 3.0, 0.32, seg=10)
            fig.cyl(hilt, hilt - T.d(1.0, 0.1, 0.45) * 12.0, 0.4, seg=10)
            fig.cyl(hilt - T.d(0.02, 0, 0.012) * 0.2, hilt + T.d(0, 0, 0.001) * 0.1, 0.7, seg=14)
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

def armband(fig, sh, el, band='#f4f1e8', mark='cross'):
    """an arm band round the upper arm (left arm: its mark on the outer side): the Geneva red cross,
    or two lettering blocks in the given colour."""
    RED = '#d63a2f'
    c, ax = sh + (el - sh) * 0.45, (el - sh).normalized()
    fig.ring(c, el - sh, 1.45, 0.45, band, seg=18)
    n = (L - ax * L.dot(ax)).normalized()
    Fr = Frame(c, n, ax); q, p = Fr.q, c + n * 1.86
    if mark == 'cross':
        fig.box(p, (0.95, 0.12, 0.3), q, RED, bevel=0.02); fig.box(p, (0.3, 0.12, 0.95), q, RED, bevel=0.02)
    else:
        for k in (-1, 1): fig.box(p + Fr.l * (k * 0.42), (0.3, 0.12, 0.7), q, mark, bevel=0.02)

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
    # each army marks its medics its own way: helmet (US: white circles with red crosses front and
    # sides; British: a white square; Italians: a white circle; French: the cross painted straight
    # on; the others none), the bag (colour, with or without a cross) - all wear the same Geneva arm
    # band, white with the red cross, as the Convention laid down for every army
    helm, bag, bag_cross = {'us': ('disc', WHITE, True), 'de': (None, '#5a4632', False), 'su': (None, '#9a8f5a', True),
                            'gb': ('square', '#b5a57a', False), 'jp': (None, '#6b4a2a', True), 'fr': ('bare', '#8b6b43', False),
                            'it': ('disc', '#7d7f5e', True)}[NATION]
    spots = [(H.f, H.at(3.35, 0, 6.0))]
    if US: spots += [(H.l, H.at(0, 3.35, 6.0)), (-H.l, H.at(0, -3.35, 6.0))]
    for n, hc in spots:
        q = Frame(hc, n, H.u).q
        if helm == 'disc': fig.cyl(hc - n * 0.1, hc + n * 0.25, 1.35, WHITE, seg=20)
        elif helm == 'square': fig.box(hc + n * 0.08, (2.5, 0.35, 2.3), q, WHITE, bevel=0.02)
        if helm: fig.box(hc + n * 0.3, (1.7, 0.2, 0.45), q, RED, bevel=0.02); fig.box(hc + n * 0.3, (0.45, 0.2, 1.7), q, RED, bevel=0.02)
    if kneel_:
        arm(fig, shR, P(10.0, -1.6, 3.4), pole=D(0, -1, -0.3), grip_dir=L)
        elL = arm(fig, shL, P(10.0, 1.6, 3.2), pole=D(0, 1, -0.3), grip_dir=L)
        armband(fig, shL, elL)                                                       # the Geneva arm band
        with fig.hard(): fig.cyl(P(10.0, -1.4, 3.2), P(10.0, 1.4, 3.2), 0.9, WHITE, seg=14)   # bandage roll
        K = kitbag(fig, P(9.2, -6.5, 1.4), turn(F, 0.4), bag)
        fig.ground(P(11, -1, 0), K.o)
    else:
        elL = arm(fig, shL, shL + P(3.0, 3.0, 9.5), pole=D(-0.3, 1, 0), wave=True)
        armband(fig, shL, elL)                                                       # the Geneva arm band
        g = shR + P(0.5, -1.2, -13.2)
        arm(fig, shR, g, pole=D(-1, -0.2, 0), grip_dir=L)
        K = kitbag(fig, g + P(0, -0.4, -2.2), F, bag)
    if bag_cross:
        if bag != WHITE: fig.box(K.at(0, -1.22, 0), (2.6, 0.1, 2.6), K.q, WHITE, bevel=0.01)
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

def bearer(front):
    """one of a pair of stretcher bearers, unarmed, walking with a handle of the stretcher in each
    hand - the front man's hands down behind him, the rear man's down in front; his army's arm band."""
    fig = Fig('bearer-front' if front else 'bearer-back')
    WHITE = '#f4f1e8'
    pel = standing(fig, stride=4.2, stance=2.6, lean=0.5 if front else -0.3)
    T = Frame(pel, F, D(0.1 if front else -0.06, 0, 1))
    shR, shL, neck = torso(fig, T, pack=False)
    fx = -3.2 if front else 3.2
    # each army's arm band: the Geneva red cross on white, except the Germans' auxiliary bearers
    # (Hilfskrankentraeger: a red band lettered in white) and the British regimental bearers
    # (a white band lettered 'SB' in red)
    RED = '#d63a2f'
    band, mark = {'de': (RED, WHITE), 'gb': (WHITE, RED)}.get(NATION, (WHITE, 'cross'))
    for s, sh in ((1, shL), (-1, shR)):
        el = arm(fig, sh, P(fx, s * 5.6, 15.5), pole=D(-fx * 0.1, s, 0.2), grip_dir=L)
        if s > 0:
            armband(fig, sh, el, band, mark)
    head(fig, neck, F, U)
    fig.finish()

POSES = {'rifleman': rifleman, 'kneel': kneel, 'prone': prone, 'officer': officer, 'mg': mg, 'sniper': sniper,
         'bazooka': lambda: bazooka(False), 'bazooka-stand': lambda: bazooka(True), 'manpads': lambda: manpads(False),
         'manpads-kneel': lambda: manpads(True), 'grenadier': lambda: grenadier(True), 'grenadier-idle': lambda: grenadier(False),
         'medic': lambda: medic(False), 'medic-heal': lambda: medic(True), 'drag': drag, 'gunner': gunner, 'lookout': lookout,
         'sapper': sapper, 'driver': driver, 'mgstand': mgstand,
         'bearer-front': lambda: bearer(True), 'bearer-back': lambda: bearer(False)}

if __name__ == '__main__':
    only = [a for a in sys.argv[1:] if not a.startswith('--')]
    for name, build in POSES.items():
        if only and name not in only: continue
        clear(); build()
