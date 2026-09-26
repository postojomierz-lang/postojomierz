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
VOXEL = 0.32          # remesh resolution (mm)
TARGET_TRIS = 3000    # before the game pipeline simplifies further

def P(f, l, u):
    """pose sketch coordinates -> Blender: f forward, l to the figure's left, u up."""
    return Vector((-l, -f, u))

class Fig:
    def __init__(self, name):
        self.name = name
        mb = bpy.data.metaballs.new(name + '_mb')
        mb.resolution = 0.25; mb.render_resolution = 0.25; mb.threshold = 0.6
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
    def disc(self, f, l, r=3.0):                       # the little stand under a foot or knee
        self.cyl(P(f, l, 0), P(f, l, 1.1), r)
    def helmet(self, head, r=3.6, tilt=0.0):
        """round head under a steel pot with a brim; tilt leans it forward (radians)."""
        self.ball(head, r)
        up = Vector((0, math.sin(tilt), math.cos(tilt)))    # forward is -y
        top = head + up * 0.9
        bpy.ops.mesh.primitive_uv_sphere_add(segments=28, ring_count=14, radius=r * 1.28, location=top)
        dome = bpy.context.active_object; dome.scale = (1, 1, 0.82)
        dome.rotation_euler = (-tilt, 0, 0)
        self.solids.append(dome)
        self.cyl(top - up * 0.4, top - up * 0.95, r * 1.55, seg=32).rotation_quaternion = Vector((0, 0, 1)).rotation_difference(up)
    def rifle(self, butt, muzzle, colour=None):
        d = (muzzle - butt).normalized()
        self.cyl(butt, butt + d * 7, 0.95, colour)                     # stock
        self.cyl(butt + d * 6, muzzle, 0.55, colour)                   # barrel
        self.box(butt + d * 9, (1.1, 1.1, 1.1), colour)                # receiver

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
            remesh_and_reduce(p, VOXEL * 0.8, 600)
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
LEG, ARM, TORSO = 2.35, 1.8, 3.9

def standing_legs(fig, stride=3.0, lean=0.0):
    hip = P(lean, 0, 17.5)
    fig.blob(hip, 1.2, 1.8, 1.0, 2.5)                                    # hips
    for l, s in ((2.1, stride), (-2.1, -stride * 0.6)):
        knee, foot = P(lean * 0.5 + s * 0.45, l, 9.5), P(s, l, 1.6)
        fig.limb(P(lean, l, 17), knee, LEG); fig.limb(knee, foot, LEG * 0.95)
        fig.limb(foot, foot + P(2.2, 0, -0.2) - P(0, 0, 0), 1.25)          # boot
        fig.disc(s + 0.8, l)
    return hip

def kneeling_legs(fig):
    """right knee down, left foot forward (the classic kneeling shooter)."""
    hip = P(-1, 0, 11.2)
    fig.blob(hip, 1.2, 1.8, 1.0, 2.5)
    lk, lf = P(5.5, 2.2, 11.5), P(6.0, 2.2, 1.6)                           # left leg forward, shin vertical
    fig.limb(P(-1, 2.2, 11), lk, LEG); fig.limb(lk, lf, LEG * 0.95); fig.limb(lf, P(8.2, 2.2, 1.4), 1.25)
    fig.disc(6.8, 2.2)
    rk, rf = P(0.8, -2.2, 1.9), P(-7.5, -2.2, 1.6)                          # right knee on the ground
    fig.limb(P(-1, -2.2, 11), rk, LEG); fig.limb(rk, rf, LEG * 0.95)
    fig.disc(0.8, -2.2, 2.6); fig.disc(-7.0, -2.2, 2.4)
    return hip

def torso(fig, hip, lean_f=0.0, height=11.5):
    chest = hip + P(lean_f, 0, height)
    fig.limb(hip + P(0, 0, 1), chest, TORSO)
    fig.blob(chest + P(-0.3, 0, -1.6), 1.8, 3.4, 1.6, 2.6)               # broad shoulders / chest
    fig.box(chest + P(-3.2, 0, -3.5), (5.0, 2.6, 5.5))                  # backpack (x: across, y: depth)
    fig.cyl(hip + P(0, 0, 1.2), hip + P(0, 0, 2.4), 3.55)               # belt
    return chest

def arm(fig, shoulder, elbow, hand, r=ARM):
    fig.limb(shoulder, elbow, r); fig.limb(elbow, hand, r * 0.92); fig.ball(hand, r * 0.95)

# ---------------------------------------------------------------------------------------
def bazooka(standing=False):
    fig = Fig('bazooka-stand' if standing else 'bazooka')
    hip = standing_legs(fig, 3.2) if standing else kneeling_legs(fig)
    chest = torso(fig, hip, 0.6)
    head = chest + P(0.8, 0, 5.6)
    fig.helmet(head, tilt=0.12)
    u = chest.z + 2.2                                                   # tube rests on the right shoulder
    a, b = P(-13, -4.6, 0) + Vector((0, 0, u)), P(15, -4.6, 0) + Vector((0, 0, u))
    fig.cyl(a, b, 1.75)
    fig.cyl(b - Vector((0, 1.2, 0)), b + Vector((0, 0.8, 0)), 2.15)     # muzzle flare
    fig.box(a + P(9, -2.0, -1.5) - P(0, 0, 0), (1.0, 1.4, 3.0))          # grip
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
    fig.cyl(base, tip, 1.5)
    fig.box(base + (tip - base) * 0.42 + P(0, -2.2, 1.0), (1.6, 2.4, 1.8))  # sight
    fig.box(base + (tip - base) * 0.3 + P(0, 0, -2.4), (1.0, 1.3, 3.2))    # grip
    arm(fig, chest + P(0, -4.3, 0), chest + P(2, -4.2, -4), base + (tip - base) * 0.3 + P(0, 0.6, -2))
    arm(fig, chest + P(0, 4.3, 0), chest + P(4.5, 2.4, -2.5), base + (tip - base) * 0.55 + P(0, 1.4, -0.8))
    fig.finish()

def grenadier(throwing=True):
    fig = Fig('grenadier' if throwing else 'grenadier-idle')
    hip = standing_legs(fig, 4.0 if throwing else 2.5, -0.8 if throwing else 0)
    chest = torso(fig, hip, -1.0 if throwing else 0.3)
    head = chest + P(0.4, 0, 5.6)
    fig.helmet(head)
    for k in (-1.4, 1.4): fig.sphere(hip + P(1.8, k, 2.0), 1.1)         # grenades on the belt
    if throwing:
        hand = chest + P(-5.0, -3.2, 7.5)                               # right arm cocked back and up
        arm(fig, chest + P(0, -4.3, 0), chest + P(-3.5, -4.4, 3.2), hand)
        fig.sphere(hand + P(-0.6, 0, 1.3), 1.7)                         # the grenade
        arm(fig, chest + P(0, 4.3, 0), chest + P(4.5, 4.2, -1.5), chest + P(8.5, 3.6, 0.5))   # left arm points ahead
        fig.rifle(hip + P(-4, 4.6, -6), hip + P(-2, 4.6, 12))            # slung rifle on the back
    else:
        arm(fig, chest + P(0, -4.3, 0), chest + P(3.5, -3.6, -4.5), chest + P(5, -1.5, -2))
        arm(fig, chest + P(0, 4.3, 0), chest + P(3.5, 3.8, -3.0), chest + P(5.5, 1.5, 1.5))
        fig.rifle(chest + P(3.5, -3.5, -8), chest + P(6.5, 2.0, 8))       # rifle across the chest (port arms)
        fig.sphere(chest + P(5.2, 1.2, 1.8), 1.6)                         # grenade ready in the left hand
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
