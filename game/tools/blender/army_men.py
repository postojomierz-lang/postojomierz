# Models the army-men poses that the "Miniature Army Men" set does not have (bazooka, AA missile,
# grenadier, medic, dragging a wounded comrade) in Blender, in the same 37 mm toy style:
# metaball body and limbs that melt together like moulded plastic, hard-edged weapons, a helmet
# with a brim and a little disc under each foot or knee.
#
#   pip install bpy            (Blender as a Python module, free)
#   python tools/blender/army_men.py
#
# Writes .cache/figures/blender/<pose>.stl (plus <pose>__<colour>.stl for painted parts),
# which tools/figures.mjs turns into game data. Units are millimetres, Z up, facing -Y.
import math, os, sys
import bpy
from mathutils import Vector, Quaternion

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', '.cache', 'figures', 'blender')
VOXEL = 0.17          # remesh resolution (mm): fine enough for straps, pouches and faces
TARGET_TRIS = 16000   # before the game pipeline simplifies further

def P(f, l, u):
    """pose sketch coordinates -> Blender: f forward, l to the figure's left, u up."""
    return Vector((-l, -f, u))

class Fig:
    def __init__(self, name):
        self.name = name
        mb = bpy.data.metaballs.new(name + '_mb')
        mb.resolution = 0.16; mb.render_resolution = 0.16; mb.threshold = 0.6
        self.mb = mb
        self.mb_obj = bpy.data.objects.new(name + '_mb', mb)
        bpy.context.scene.collection.objects.link(self.mb_obj)
        self.solids = []      # mesh objects fused with the body
        self.paint = {}       # colour -> [objects] kept separate (not remeshed into the body)

    # --- soft parts (metaballs) -----------------------------------------------------
    def ball(self, p, r):
        e = self.mb.elements.new(); e.type = 'BALL'; e.co = p; e.radius = r * 1.62; e.stiffness = 2.0
    def limb(self, a, b, r):
        d = b - a
        e = self.mb.elements.new(); e.type = 'CAPSULE'; e.co = (a + b) / 2; e.radius = r * 1.62; e.stiffness = 2.0
        e.size_x = d.length / 2
        e.rotation = Vector((1, 0, 0)).rotation_difference(d.normalized())
    def blob(self, p, sx, sy, sz, r):
        e = self.mb.elements.new(); e.type = 'ELLIPSOID'; e.co = p; e.radius = r * 1.62; e.stiffness = 2.0
        e.size_x, e.size_y, e.size_z = sx, sy, sz

    # --- hard parts (meshes) --------------------------------------------------------
    def _add(self, obj, colour=None):
        (self.paint.setdefault(colour, []) if colour else self.solids).append(obj)
        return obj
    def cyl(self, a, b, r, colour=None, seg=24):
        d = b - a
        bpy.ops.mesh.primitive_cylinder_add(vertices=seg, radius=r, depth=d.length, location=(a + b) / 2)
        o = bpy.context.active_object
        o.rotation_mode = 'QUATERNION'; o.rotation_quaternion = Vector((0, 0, 1)).rotation_difference(d.normalized())
        return self._add(o, colour)
    def box(self, c, size, colour=None, rot=None):
        bpy.ops.mesh.primitive_cube_add(size=1, location=c)
        o = bpy.context.active_object; o.scale = size
        if rot is not None: o.rotation_mode = 'QUATERNION'; o.rotation_quaternion = rot
        return self._add(o, colour)
    def sphere(self, c, r, colour=None):
        bpy.ops.mesh.primitive_uv_sphere_add(segments=24, ring_count=12, radius=r, location=c)
        return self._add(bpy.context.active_object, colour)
    def cone(self, a, b, r1, r2, colour=None, seg=24):
        d = b - a
        bpy.ops.mesh.primitive_cone_add(vertices=seg, radius1=r1, radius2=r2, depth=d.length, location=(a + b) / 2)
        o = bpy.context.active_object
        o.rotation_mode = 'QUATERNION'; o.rotation_quaternion = Vector((0, 0, 1)).rotation_difference(d.normalized())
        return self._add(o, colour)
    def ring(self, c, axis, R, r, colour=None):
        bpy.ops.mesh.primitive_torus_add(major_radius=R, minor_radius=r, major_segments=28, minor_segments=8, location=c)
        o = bpy.context.active_object
        o.rotation_mode = 'QUATERNION'; o.rotation_quaternion = Vector((0, 0, 1)).rotation_difference(axis.normalized())
        return self._add(o, colour)
    def strap(self, pts, r=0.42):
        for a, b in zip(pts, pts[1:]): self.cyl(a, b, r, seg=10); self.sphere(b, r)
    def pouch(self, c, w=1.8, h=1.7, d=1.2):
        """ammo pouch with a flap and a press stud (x: across, y: depth)."""
        self.box(c, (w, d, h))
        self.box(c + Vector((0, 0, h * 0.32)), (w * 1.08, d * 1.12, h * 0.36))
    def grenade(self, c, r=1.0, colour=None):
        self.sphere(c, r, colour)
        for k in (-0.45, 0, 0.45): self.ring(c + Vector((0, 0, k * r)), Vector((0, 0, 1)), r * math.sqrt(1 - k * k) * 0.98, r * 0.12, colour)
        self.box(c + Vector((0, 0, r * 1.05)), (r * 0.5, r * 0.5, r * 0.5), colour)       # fuse
        self.box(c + Vector((r * 0.45, 0, r * 0.5)), (r * 0.25, r * 0.5, r * 1.3), colour)  # spoon
        self.ring(c + Vector((-r * 0.5, 0, r * 1.15)), Vector((0, 1, 0)), r * 0.35, r * 0.07, colour)   # pin
    def disc(self, f, l, r=3.0):                       # the little stand under a foot or knee
        self.cyl(P(f, l, 0), P(f, l, 1.1), r)
    def helmet(self, head, r=3.6, tilt=0.0):
        """round head under a steel pot with a brim; tilt leans it forward (radians)."""
        self.ball(head, r)
        up = Vector((0, math.sin(tilt), math.cos(tilt)))    # forward is -y
        top = head + up * 1.7
        bpy.ops.mesh.primitive_uv_sphere_add(segments=28, ring_count=14, radius=r * 1.28, location=top)
        dome = bpy.context.active_object; dome.scale = (1, 1, 0.82)
        dome.rotation_euler = (-tilt, 0, 0)
        self.solids.append(dome)
        self.cyl(top - up * 0.4, top - up * 0.95, r * 1.55, seg=32).rotation_quaternion = Vector((0, 0, 1)).rotation_difference(up)
        self.ring(top - up * 0.05, up, r * 1.27, 0.22)                             # band round the pot
        fwd = Vector((0, -math.cos(tilt), math.sin(tilt)))
        # a face: nose, brow ridge, cheeks, chin and ears (solid, so they stay crisp)
        n = self.sphere(head + fwd * r * 0.98 - up * 0.2, 0.75); n.scale = (0.8, 1.0, 1.25)
        for sx in (1, -1):
            self.sphere(head + fwd * r * 0.86 + up * 0.75 + Vector((sx * 1.1, 0, 0)), 0.5).scale = (1.5, 0.8, 0.7)   # brows
            self.sphere(head + fwd * r * 0.9 + up * 0.35 + Vector((sx * 1.15, 0, 0)), 0.28)                          # eyes
            self.sphere(head + fwd * r * 0.7 - up * 0.6 + Vector((sx * 1.6, 0, 0)), 0.9)                            # cheeks
            e = self.sphere(head + Vector((sx * r * 0.98, 0, 0)), 0.8); e.scale = (0.45, 0.8, 1.2)                  # ears
        self.box(head + fwd * r * 0.93 - up * 1.35, (1.3, 0.3, 0.22))                                               # mouth
        self.sphere(head + fwd * r * 0.72 - up * 2.1, 1.0).scale = (1.1, 0.9, 0.8)                                  # chin
        for sx in (1, -1):
            self.strap([top - up * 0.7 + Vector((sx * r * 1.05, 0, 0)), head - up * r * 0.75 + fwd * r * 0.45], 0.22)   # chin strap
    def rifle(self, butt, muzzle, colour=None, sling=True):
        """M1-style rifle: shaped stock, receiver, bolt, magazine, trigger guard, bands, sight and sling."""
        L = (muzzle - butt).length; d = (muzzle - butt).normalized()
        side = d.cross(Vector((0, 0, 1)))
        if side.length < 0.1: side = d.cross(Vector((0, 1, 0)))
        side.normalize(); down = side.cross(d).normalized()
        at = lambda k: butt + d * (L * k)
        self.cone(at(0), at(0.3), 1.05, 0.7, colour)                                  # butt stock
        self.cyl(at(0.28), at(0.72), 0.62, colour)                                    # fore-end
        self.cyl(at(0.3), at(1.0), 0.33, colour)                                      # barrel
        self.box(at(0.36), (2.6, 1.0, 1.1), colour, Vector((1, 0, 0)).rotation_difference(d))       # receiver
        self.box(at(0.4) + down * 1.0, (0.7, 0.7, 1.3), colour)                        # magazine
        self.ring(at(0.33) + down * 0.9, side, 0.55, 0.12, colour)                    # trigger guard
        self.cyl(at(0.38) - down * 0.2, at(0.38) - down * 0.2 + side * 1.1, 0.16, colour)  # bolt handle
        self.sphere(at(0.38) - down * 0.2 + side * 1.1, 0.28, colour)
        for k in (0.55, 0.7): self.ring(at(k), d, 0.66, 0.1, colour)                  # barrel bands
        self.box(at(0.97) - down * 0.45, (0.2, 0.2, 0.55), colour)                    # front sight
        if sling: self.strap([at(0.08) + down * 0.9, at(0.4) + down * 1.8, at(0.66) + down * 0.9], 0.18)

    # --- finishing --------------------------------------------------------------------
    def finish(self):
        dg = bpy.context.evaluated_depsgraph_get()
        body = bpy.data.objects.new(self.name, bpy.data.meshes.new_from_object(self.mb_obj.evaluated_get(dg)))
        bpy.context.scene.collection.objects.link(body)
        bpy.data.objects.remove(self.mb_obj)
        objs = [body] + self.solids
        for o in objs: apply_transform(o)
        joined = join(objs)
        remesh_and_reduce(joined, VOXEL, TARGET_TRIS)
        export(joined, self.name)
        for colour, parts in self.paint.items():
            for o in parts: apply_transform(o)
            p = join(parts)
            remesh_and_reduce(p, VOXEL, 2500)
            export(p, f'{self.name}__{colour.lstrip("#")}')

def apply_transform(o):
    bpy.ops.object.select_all(action='DESELECT'); o.select_set(True); bpy.context.view_layer.objects.active = o
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
def join(objs):
    bpy.ops.object.select_all(action='DESELECT')
    for o in objs: o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    if len(objs) > 1: bpy.ops.object.join()
    return objs[0]
def remesh_and_reduce(o, voxel, tris):
    m = o.modifiers.new('remesh', 'REMESH'); m.mode = 'VOXEL'; m.voxel_size = voxel; m.use_smooth_shade = True
    bpy.ops.object.modifier_apply(modifier=m.name)
    s = o.modifiers.new('smooth', 'SMOOTH'); s.factor = 0.6; s.iterations = 6
    bpy.ops.object.modifier_apply(modifier=s.name)
    n = sum(len(p.vertices) - 2 for p in o.data.polygons)
    if n > tris:
        d = o.modifiers.new('decimate', 'DECIMATE'); d.ratio = tris / n
        bpy.ops.object.modifier_apply(modifier=d.name)
def export(o, name):
    os.makedirs(OUT, exist_ok=True)
    bpy.ops.object.select_all(action='DESELECT'); o.select_set(True)
    bpy.ops.wm.stl_export(filepath=os.path.join(OUT, name + '.stl'), export_selected_objects=True, ascii_format=False, apply_modifiers=True)
    print(f'{name}: {len(o.data.polygons)} faces')

def clear():
    bpy.ops.wm.read_factory_settings(use_empty=True)

# ---------------------------------------------------------------------------------------
# Shared body parts (sizes match the 37 mm alo89 figures: chunky limbs, big helmet)
LEG, ARM, TORSO = 2.05, 1.6, 3.7

def standing_legs(fig, stride=3.0, lean=0.0):
    hip = P(lean, 0, 17.5)
    fig.blob(hip, 1.8, 1.1, 1.0, 2.5)                                    # hips
    for l, s in ((2.1, stride), (-2.1, -stride * 0.6)):
        knee, foot = P(lean * 0.5 + s * 0.45, l, 9.5), P(s, l, 1.6)
        fig.limb(P(lean, l, 17), knee, LEG); fig.limb(knee, foot, LEG * 0.95)
        boot(fig, knee, foot, P(1, 0, 0))
        fig.disc(s + 0.8, l)
    return hip

def boot(fig, knee, foot, fwd):
    """trouser cuff above a laced combat boot with a thick sole."""
    shin = (foot - knee).normalized()
    fig.ring(foot - shin * 2.6, shin, LEG * 0.95, 0.35)                  # trouser cuff over the boot
    fig.limb(foot, foot + fwd * 2.4, 1.35)                               # boot
    fig.box(foot + fwd * 1.0 + Vector((0, 0, -1.0)), (2.3, 4.6, 0.6))    # sole
    for k in range(3): fig.ball(foot + fwd * (1.2 + k * 0.5) + Vector((0, 0, 0.9 - k * 0.25)), 0.25)   # laces

def kneeling_legs(fig):
    """right knee down, left foot forward (the classic kneeling shooter)."""
    hip = P(-1, 0, 11.2)
    fig.blob(hip, 1.8, 1.1, 1.0, 2.5)
    lk, lf = P(5.5, 2.2, 11.5), P(6.0, 2.2, 1.6)                           # left leg forward, shin vertical
    fig.limb(P(-1, 2.2, 11), lk, LEG); fig.limb(lk, lf, LEG * 0.95); boot(fig, lk, lf, P(1, 0, 0))
    fig.disc(6.8, 2.2)
    rk, rf = P(0.8, -2.2, 1.9), P(-7.5, -2.2, 1.6)                          # right knee on the ground
    fig.limb(P(-1, -2.2, 11), rk, LEG); fig.limb(rk, rf, LEG * 0.95)
    fig.limb(rf, rf + P(-1.8, 0, -0.4), 1.3)                              # boot toe on the ground
    fig.ring(rk + (rf - rk) * 0.75, rf - rk, LEG * 0.95, 0.35)
    fig.disc(0.8, -2.2, 2.6); fig.disc(-7.0, -2.2, 2.4)
    return hip

def torso(fig, hip, lean_f=0.0, height=11.5, pack=True):
    chest = hip + P(lean_f, 0, height)
    fig.limb(hip + P(0, 0, 1), chest, TORSO)
    fig.blob(chest + P(-0.3, 0, -1.6), 3.3, 1.5, 1.6, 2.6)               # broad shoulders / chest (x across, y deep)
    fig.ring(chest + P(0.2, 0, 1.4), Vector((0, 0, 1)), 1.9, 0.45)         # collar
    for l in (1.7, -1.7):                                                 # breast pockets with flaps and buttons
        c = chest + P(3.35, l, -3.0)
        fig.box(c, (1.9, 0.5, 2.0)); fig.box(c + P(0.15, 0, 0.75), (2.1, 0.55, 0.6)); fig.sphere(c + P(0.45, 0, 0.75), 0.25)
    for k in range(4): fig.sphere(chest + P(3.55, 0, -1.2 - k * 2.2), 0.28)   # tunic buttons
    # webbing belt: buckle, four ammo pouches, canteen and a bayonet
    fig.cyl(hip + P(0, 0, 1.2), hip + P(0, 0, 2.6), 3.6)
    fig.box(hip + P(3.55, 0, 1.9), (1.4, 0.5, 1.2))
    for l in (2.2, -2.2, 3.4, -3.4):
        fig.pouch(hip + P(2.8 if abs(l) < 3 else 0.6, l, 1.3), 1.5, 1.7, 1.1)
    fig.cyl(hip + P(-1.4, -3.9, -0.4), hip + P(-1.4, -3.9, 2.3), 1.25)         # canteen
    fig.cyl(hip + P(-1.4, -3.9, 2.3), hip + P(-1.4, -3.9, 2.8), 0.6)
    fig.cyl(hip + P(-0.5, 3.8, 2.0), hip + P(-1.0, 3.9, -4.5), 0.42)           # bayonet scabbard
    # suspender straps over the shoulders
    for l in (1.9, -1.9):
        fig.strap([hip + P(3.3, l, 2.6), chest + P(3.2, l * 1.1, -1.0), chest + P(1.0, l * 1.15, 1.2), chest + P(-2.6, l, 0.2)], 0.4)
    if pack:
        bp = chest + P(-3.4, 0, -3.6)
        fig.box(bp, (5.0, 2.6, 5.5))                                          # backpack
        fig.box(bp + P(-0.3, 0, 1.8), (5.2, 2.8, 1.8))                         # flap
        for l in (1.4, -1.4): fig.box(bp + P(-1.35, l, 0.2), (0.5, 0.35, 3.0))   # flap straps
        fig.cyl(bp + P(0.2, 3.0, 3.6), bp + P(0.2, -3.0, 3.6), 1.25)            # rolled blanket on top
        for l in (1.8, -1.8): fig.ring(bp + P(0.2, l, 3.6), Vector((1, 0, 0)), 1.3, 0.16)
        fig.cyl(bp + P(-1.6, 1.4, -2.6), bp + P(-1.6, 1.4, 1.8), 0.3)          # entrenching tool handle
        fig.box(bp + P(-1.7, 1.4, -3.6), (1.8, 0.4, 2.2))                      # and its blade
    return chest

def arm(fig, shoulder, elbow, hand, r=ARM):
    fig.limb(shoulder, elbow, r); fig.limb(elbow, hand, r * 0.92)
    fig.ball(shoulder, r * 1.15)                                         # shoulder seam
    d = (hand - elbow).normalized()
    fig.ring(hand - d * 1.5, d, r * 0.95, 0.28)                            # sleeve cuff
    fig.ball(hand, r * 0.88)                                             # fist
    side = d.cross(Vector((0, 0, 1)))
    if side.length > 0.1: fig.ball(hand + side.normalized() * r * 0.6 - d * 0.2, r * 0.38)   # thumb
    for k in (-0.5, 0, 0.5):                                             # knuckles
        up = side.cross(d).normalized() if side.length > 0.1 else Vector((0, 0, 1))
        fig.ball(hand + d * r * 0.6 + up * k * r * 0.5, r * 0.3)

# ---------------------------------------------------------------------------------------
def launcher(fig, a, b, r, missile=False):
    """bazooka (a = back, b = front): flared back end, bands, shoulder rest, sights, grip, battery box;
    the AA missile tube has end caps, a big sight box and a battery unit instead."""
    d = (b - a).normalized(); L = (b - a).length
    at = lambda k: a + d * (L * k)
    down = Vector((0, 0, -1)) - d * d.z; down.normalize()
    side = d.cross(down).normalized()
    fig.cyl(a, b, r)
    if missile:
        for k in (0.0, 1.0): fig.cyl(at(k) - d * 0.6, at(k) + d * 0.6, r * 1.25)                 # end caps
        fig.box(at(0.45) - down * r * 1.6 + side * 0.4, (2.2, 2.0, 1.8), rot=Vector((1, 0, 0)).rotation_difference(d))   # sight unit
        fig.cyl(at(0.45) - down * r * 1.6 + side * 0.4 + d * 1.1, at(0.45) - down * r * 1.6 + side * 0.4 + d * 1.6, 0.55)   # lens
        fig.cyl(at(0.62) + down * r * 1.2, at(0.62) + down * r * 1.2 + d * 3.0, 0.8)                 # battery unit
    else:
        fig.cone(a - d * 2.2, a + d * 0.4, r * 1.55, r, seg=28)                                     # flared back end
        fig.ring(b, d, r * 1.02, 0.28)                                                           # muzzle ring
        for k in (0.2, 0.62): fig.ring(at(k), d, r * 1.02, 0.18)                                 # bands
        fig.box(at(0.4) + down * r * 0.9, (3.2, 1.3, 1.0), rot=Vector((1, 0, 0)).rotation_difference(d))   # shoulder rest
        fig.box(at(0.72) - down * r * 1.3 - side * 0.8, (0.3, 1.2, 1.4))                          # front sight frame
        fig.box(at(0.2) + down * r * 1.4 + side * 0.9, (1.8, 1.2, 1.3))                           # battery box
    fig.box(at(0.36) + down * r * 1.5, (1.0, 1.3, 2.6))                                          # pistol grip
    fig.ring(at(0.4) + down * r * 1.3, side, 0.6, 0.14)                                          # trigger guard

def bazooka(standing=False):
    fig = Fig('bazooka-stand' if standing else 'bazooka')
    hip = standing_legs(fig, 3.2) if standing else kneeling_legs(fig)
    chest = torso(fig, hip, 0.6)
    head = chest + P(0.8, 0, 5.6)
    fig.helmet(head, tilt=0.12)
    u = chest.z + 2.2                                                   # tube rests on the right shoulder
    a, b = P(-13, -4.6, 0) + Vector((0, 0, u)), P(15, -4.6, 0) + Vector((0, 0, u))
    launcher(fig, a, b, 1.75)
    arm(fig, chest + P(0, -4.3, 0), chest + P(2.5, -4.2, -4.5), a + P(10, 0.6, -1.4))
    arm(fig, chest + P(0, 4.3, 0), chest + P(5.5, 2.6, -3.5), a + P(17, 1.4, -1.4))
    fig.finish()

def manpads(kneel=False):
    fig = Fig('manpads-kneel' if kneel else 'manpads')
    hip = kneeling_legs(fig) if kneel else standing_legs(fig, 3.0)
    chest = torso(fig, hip, 0.3)
    head = chest + P(0.6, 0, 5.6)
    fig.helmet(head, tilt=-0.18)                                        # looking up at the target
    base = chest + P(-11, -4.6, 0.5); tip = base + P(24 * math.cos(0.5), 0, 24 * math.sin(0.5))
    launcher(fig, base, tip, 1.5, missile=True)
    arm(fig, chest + P(0, -4.3, 0), chest + P(2, -4.2, -4), base + (tip - base) * 0.3 + P(0, 0.6, -2))
    arm(fig, chest + P(0, 4.3, 0), chest + P(4.5, 2.4, -2.5), base + (tip - base) * 0.55 + P(0, 1.4, -0.8))
    fig.finish()

def grenadier(throwing=True):
    fig = Fig('grenadier' if throwing else 'grenadier-idle')
    hip = standing_legs(fig, 4.0 if throwing else 2.5, -0.8 if throwing else 0)
    chest = torso(fig, hip, -1.0 if throwing else 0.3)
    head = chest + P(0.4, 0, 5.6)
    fig.helmet(head)
    for k in (-1.3, 1.3): fig.grenade(hip + P(3.9, k, 4.8), 0.9)          # grenades clipped to the straps
    if throwing:
        hand = chest + P(-5.0, -3.2, 7.5)                               # right arm cocked back and up
        arm(fig, chest + P(0, -4.3, 0), chest + P(-3.5, -4.4, 3.2), hand)
        fig.grenade(hand + P(-0.6, 0, 1.6), 1.4)                         # the grenade
        arm(fig, chest + P(0, 4.3, 0), chest + P(4.5, 4.2, -1.5), chest + P(8.5, 3.6, 0.5))   # left arm points ahead
        fig.rifle(hip + P(-4, 4.6, -6), hip + P(-2, 4.6, 12))            # slung rifle on the back
    else:
        arm(fig, chest + P(0, -4.3, 0), chest + P(3.5, -3.6, -4.5), chest + P(5, -1.5, -2))
        arm(fig, chest + P(0, 4.3, 0), chest + P(3.5, 3.8, -3.0), chest + P(5.5, 1.5, 1.5))
        fig.rifle(chest + P(3.5, -3.5, -8), chest + P(6.5, 2.0, 8))       # rifle across the chest (port arms)
        fig.grenade(chest + P(5.4, 1.2, 2.2), 1.3)                        # grenade ready in the left hand
    fig.finish()

def medic(kneel=False):
    fig = Fig('medic-heal' if kneel else 'medic')
    WHITE, RED = '#f4f1e8', '#d63a2f'
    hip = kneeling_legs(fig) if kneel else standing_legs(fig, 2.2)
    chest = torso(fig, hip, 3.5 if kneel else 0.2)
    head = chest + P(1.6 if kneel else 0.6, 0, 5.4)
    fig.helmet(head, tilt=0.35 if kneel else 0.0)
    # white helmet circle with a red cross, facing forward
    face = head + P(3.9, 0, 2.6)
    fig.cyl(face + P(-0.25, 0, 0), face + P(0.35, 0, 0), 1.7, WHITE)
    fig.box(face + P(0.4, 0, 0), (2.2, 0.4, 0.6), RED); fig.box(face + P(0.4, 0, 0), (0.6, 0.4, 2.2), RED)
    if kneel:
        arm(fig, chest + P(0, -4.3, 0), chest + P(4.5, -3.8, -4.5), chest + P(9.5, -2.2, -9.5))
        arm(fig, chest + P(0, 4.3, 0), chest + P(4.5, 3.8, -4.5), chest + P(9.5, 2.2, -9.5))
        kit = P(10.5, -5.5, 1.8)                                         # medical bag on the floor
    else:
        arm(fig, chest + P(0, 4.3, 0), chest + P(3.5, 4.0, -4.0), chest + P(7.0, 3.4, -1.0))   # waving the team on
        arm(fig, chest + P(0, -4.3, 0), chest + P(0.5, -4.4, -5.0), chest + P(0.8, -4.6, -9.0))
        kit = chest + P(0.8, -5.6, -11.5)                                 # bag hanging from the right hand
    fig.box(kit, (2.6, 4.2, 3.4), WHITE)
    fig.box(kit + P(0, 0, 1.45), (2.8, 4.4, 0.7), WHITE)                  # lid
    fig.cyl(kit + P(0, 1.2, 1.9), kit + P(0, -1.2, 1.9), 0.3, WHITE)        # handle
    for l in (1.3, -1.3): fig.box(kit + P(0, l, 0), (2.7, 0.35, 3.5), WHITE)   # straps
    side = kit + P(0, -1.75 if not kneel else -2.2, 0)
    fig.box(side, (0.35, 2.4, 0.7), RED); fig.box(side, (0.35, 0.7, 2.4), RED)
    band = chest + P(0, 3.9, -1.6)                                        # arm band
    fig.cyl(band + P(0, -0.4, 0), band + P(0, 0.9, 0), 1.55, WHITE)
    fig.finish()

def drag():
    fig = Fig('drag')
    hip = standing_legs(fig, 3.6, -2.0)
    chest = torso(fig, hip, -3.2)                                        # leaning back, pulling
    head = chest + P(-0.6, 0, 5.6)
    fig.helmet(head, tilt=-0.15)
    for l in (4.3, -4.3):
        arm(fig, chest + P(0, l, 0), chest + P(4.0, l * 1.1, -4.5), chest + P(8.5, l * 0.8, -8.0))
    fig.rifle(hip + P(-4, -4.6, -4), hip + P(-2.5, -4.6, 13))             # rifle slung on the back
    fig.finish()

POSES = {'bazooka': lambda: bazooka(False), 'bazooka-stand': lambda: bazooka(True), 'manpads': lambda: manpads(False),
         'manpads-kneel': lambda: manpads(True), 'grenadier': lambda: grenadier(True), 'grenadier-idle': lambda: grenadier(False),
         'medic': lambda: medic(False), 'medic-heal': lambda: medic(True), 'drag': drag}

if __name__ == '__main__':
    only = sys.argv[1:]
    for name, build in POSES.items():
        if only and name not in only: continue
        clear(); build()
