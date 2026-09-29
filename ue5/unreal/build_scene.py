"""Rysy 3D -> Unreal Engine 5: builds the Morskie Oko -> Rysy level from ue5/export.

Run inside the Unreal Editor (UE 5.4 or newer):
    Tools -> Execute Python Script... -> pick this file
(needs the built-in "Python Editor Script Plugin", Edit -> Plugins).

What it does (every run starts by deleting what the previous run spawned, so it is safe to re-run):
  * creates or opens the level /Game/Rysy/Maps/Rysy
  * imports the orthophoto, the layer masks and the default ground textures
  * builds the landscape material M_RysyLandscape and its instance MI_RysyLandscape
    (the instance is never overwritten: textures you put into it stay)
  * if a Landscape is already in the level: snaps it to the exact position/scale and gives it the material;
    otherwise shows the numbers for the manual "Landscape -> Import from File" step
  * spruce, dwarf pine and boulders as Hierarchical Instanced Static Mesh actors (placeholder shapes
    until you set real meshes below), the trail as a spline, water planes on the lakes, box buildings,
    signposts, sun + sky + clouds + fog, and a PlayerStart at Morskie Oko

Coordinates: UE X = east, UE Y = south (north is -Y), UE Z = real altitude, all in centimetres.
"""
import csv
import json
import math
import os
import random

import unreal

# =====================================================================================================
# CONFIGURATION - edit these lines
# =====================================================================================================

# Folder with the exported files (heightmap.png, landscape.json, ...). Empty = "../export" next to this
# script. Example: r"C:\Users\Me\Documents\GitHub\postojomierz\ue5\export"
EXPORT_DIR = r""

CONTENT_ROOT = "/Game/Rysy"                 # where the script puts its assets
LEVEL_PATH = CONTENT_ROOT + "/Maps/Rysy"    # the level it creates / opens

# Meshes for the instanced vegetation and rocks. Leave the list empty to use placeholder shapes.
# Put one or more asset paths (right-click an asset in the Content Browser -> Copy Reference, then keep
# the part in quotes, e.g. "/Game/Fab/Megascans/3D/Norway_Spruce_xxx/SM_Norway_Spruce_01.SM_Norway_Spruce_01").
# With several meshes each instance picks one at random. The script scales every instance to the
# height (trees, dwarf pine) or size (rocks) given in the CSV, whatever the mesh's own size.
SPRUCE_MESHES = ["/Game/Megaplant_Library/Tree_Norway_Spruce/Tree_Norway_Spruce_01/SM_Spruce_PVE_%s.SM_Spruce_PVE_%s" % (c, c) for c in "ABCD"]  # Megaplants: Norway Spruce (Fab, free), exported as Static Mesh from the Procedural Vegetation Editor
DWARFPINE_MESHES = ["/Game/Megaplant_Library/Tree_Baltic_Pine/Tree_Baltic_Pine_Saplings_01/SM_PinePVE_%s.SM_PinePVE_%s" % (c, c) for c in "AB"]  # Megaplants: Baltic Pine Saplings (Fab, free), squashed into dwarf-pine clumps below
ROCK_MESHES = ["/Game/ApexNature/Dolomites/Rocks/Large/SM_APXN_DOLR_Rock_Large_02.SM_APXN_DOLR_Rock_Large_02",  # Dolomites Free Rock (Fab, free)
               "/Game/Rysy/Rocks/LoneGranite/round-boulder1.round-boulder1"]  # Lone granite boulder stone (Fab, personal licence, imported from FBX)

# Keep this fraction of the instances (1.0 = all). Lower it if the editor gets slow.
FOLIAGE_FRACTION = 1.0

# Textures for the landscape layers (optional). Empty = the Poly Haven textures shipped in export/textures.
# You can also simply open MI_RysyLandscape and drag textures into its parameters instead.
LAYER_TEXTURES = {
    # "Rock":      ("/Game/Fab/.../T_Granite_B.T_Granite_B", "/Game/Fab/.../T_Granite_N.T_Granite_N"),
    "Rock": ("", ""),
    "Scree": ("", ""),
    "Grass": ("", ""),
    "Forest": ("", ""),
    "DwarfPine": ("", ""),
    "Path": ("", ""),
}

REIMPORT_TEXTURES = False    # True = import the export textures again even if they already exist

# Exposure: automatic, shifted by this many stops (negative = darker). The first run of the scene was
# far too bright; round 2 compared -1.0 / -0.5 / 0.0 in Play and picked -0.5 (Rysy_PostProcess -> Exposure).
EXPOSURE_BIAS = -0.5

# Height fog. Round 3: density 0.006 / falloff 0.05 / opacity 1 with the colour taken from the atmosphere
# covered everything past ~20 km with a flat navy band (the horizon ring was under it). Thinner, starting
# a few km out, never fully opaque, and a light hazy blue of its own. Tune in the "Mgla" actor.
FOG_DENSITY = 0.0025
FOG_HEIGHT_FALLOFF = 0.2
FOG_MAX_OPACITY = 0.8
FOG_START_DISTANCE_M = 3000
FOG_COLOR = (0.32, 0.40, 0.52)   # Fog Inscattering Color (linear)

FAR_TERRAIN = True           # the 35 x 29 km terrain around the landscape (far_terrain.obj), no more empty horizon

# =====================================================================================================

TAG = "RysyAuto"
TEX_DIR = CONTENT_ROOT + "/Textures"
MAT_DIR = CONTENT_ROOT + "/Materials"

asset_tools = unreal.AssetToolsHelpers.get_asset_tools()
EAL = unreal.EditorAssetLibrary
MEL = unreal.MaterialEditingLibrary
actor_sub = unreal.get_editor_subsystem(unreal.EditorActorSubsystem)
level_sub = unreal.get_editor_subsystem(unreal.LevelEditorSubsystem)

PLACEHOLDER = {
    "spruce": "/Engine/BasicShapes/Cone.Cone",
    "dwarfpine": "/Engine/BasicShapes/Sphere.Sphere",
    "rock": "/Engine/BasicShapes/Sphere.Sphere",
}
CUBE = "/Engine/BasicShapes/Cube.Cube"
CYLINDER = "/Engine/BasicShapes/Cylinder.Cylinder"
PLANE = "/Engine/BasicShapes/Plane.Plane"

report = []   # lines for the summary at the end


def log(msg):
    unreal.log("[Rysy] " + msg)


def warn(msg):
    unreal.log_warning("[Rysy] " + msg)
    report.append("UWAGA: " + msg)


# ----------------------------------------------------------------------------------------- files
def find_export_dir():
    cands = []
    if EXPORT_DIR:
        cands.append(EXPORT_DIR)
    try:
        cands.append(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "export"))
    except NameError:
        pass
    proj = unreal.Paths.convert_relative_path_to_full(unreal.Paths.project_dir())
    cands += [os.path.join(proj, "RysyExport"), os.path.join(proj, "export"), os.path.join(proj, "ue5", "export")]
    for c in cands:
        if os.path.isfile(os.path.join(c, "landscape.json")):
            return os.path.abspath(c)
    raise RuntimeError("Nie znaleziono folderu export (landscape.json). Wpisz sciezke w EXPORT_DIR na gorze "
                       "skryptu build_scene.py. Sprawdzone: " + " | ".join(cands))


def read_csv(path):
    with open(path, newline="", encoding="utf-8") as f:
        return [{k: float(v) for k, v in row.items()} for row in csv.DictReader(f)]


# ----------------------------------------------------------------------------------------- assets
def import_texture(path, name, kind):
    """kind: 'color', 'normal' or 'data' (linear, uncompressed)."""
    dest = TEX_DIR + "/" + name
    if not EAL.does_asset_exist(dest) or REIMPORT_TEXTURES:
        task = unreal.AssetImportTask()
        task.set_editor_property("filename", path)
        task.set_editor_property("destination_path", TEX_DIR)
        task.set_editor_property("destination_name", name)
        task.set_editor_property("automated", True)
        task.set_editor_property("replace_existing", True)
        task.set_editor_property("save", False)
        asset_tools.import_asset_tasks([task])
        got = list(task.get_editor_property("imported_object_paths") or [])
        if got and not EAL.does_asset_exist(dest):
            # some importers ignore destination_name: rename what was imported
            EAL.rename_asset(str(got[0]).split(".")[0], dest)
    tex = EAL.load_asset(dest)
    if tex is None:
        warn("Nie udalo sie zaimportowac " + path)
        return None
    try:
        if kind == "color":
            tex.set_editor_property("srgb", True)
            tex.set_editor_property("compression_settings", unreal.TextureCompressionSettings.TC_DEFAULT)
        elif kind == "normal":
            tex.set_editor_property("srgb", False)
            tex.set_editor_property("compression_settings", unreal.TextureCompressionSettings.TC_NORMALMAP)
            # Poly Haven "nor" maps are OpenGL style; UE wants DirectX style (green flipped)
            tex.set_editor_property("flip_green_channel", True)
            tex.set_editor_property("lod_group", unreal.TextureGroup.TEXTUREGROUP_WORLD_NORMAL_MAP)
        else:
            tex.set_editor_property("srgb", False)
            tex.set_editor_property("compression_settings", unreal.TextureCompressionSettings.TC_VECTOR_DISPLACEMENTMAP)
        if name.startswith("T_Rysy"):
            tex.set_editor_property("address_x", unreal.TextureAddress.TA_CLAMP)
            tex.set_editor_property("address_y", unreal.TextureAddress.TA_CLAMP)
    except Exception as e:   # noqa: BLE001
        warn("Ustawienia tekstury %s: %s" % (name, e))
    EAL.save_loaded_asset(tex)
    return tex


def load(path):
    if not path:
        return None
    a = EAL.load_asset(path)
    if a is None:
        warn("Nie ma zasobu " + path)
    return a


def new_asset(name, folder, cls, factory):
    path = folder + "/" + name
    if EAL.does_asset_exist(path):
        return EAL.load_asset(path), False
    return asset_tools.create_asset(name, folder, cls, factory), True


class Graph:
    """Small helper around MaterialEditingLibrary."""

    def __init__(self, mat):
        self.m = mat
        self.y = 0

    def node(self, cls, x=-600, **props):
        self.y += 60
        e = MEL.create_material_expression(self.m, cls, x, self.y)
        for k, v in props.items():
            e.set_editor_property(k, v)
        return e

    def link(self, a, a_out, b, b_in):
        if not MEL.connect_material_expressions(a, a_out, b, b_in):
            warn("Material: nie polaczono %s.%s -> %s.%s" % (a.get_name(), a_out, b.get_name(), b_in))

    def out(self, a, a_out, prop):
        if not MEL.connect_material_property(a, a_out, prop):
            warn("Material: nie polaczono %s -> %s" % (a.get_name(), prop))

    def scalar(self, name, value, x=-1400):
        return self.node(unreal.MaterialExpressionScalarParameter, x, parameter_name=name, default_value=value)

    def vector(self, name, rgb, x=-1400):
        return self.node(unreal.MaterialExpressionVectorParameter, x, parameter_name=name,
                         default_value=unreal.LinearColor(rgb[0], rgb[1], rgb[2], 1.0))

    def tex(self, name, texture, sampler, uv, shared=False, x=-1000):
        e = self.node(unreal.MaterialExpressionTextureSampleParameter2D, x, parameter_name=name)
        e.set_editor_property("sampler_type", sampler)
        if texture is not None:
            e.set_editor_property("texture", texture)
        if shared:
            e.set_editor_property("sampler_source", unreal.SamplerSourceMode.SSM_WRAP_WORLD_GROUP_SETTINGS)
        self.link(uv, "", e, "UVs")
        return e

    def op(self, cls, a, a_out, b=None, b_out="", **props):
        e = self.node(cls, -300, **props)
        self.link(a, a_out, e, "A")
        if b is not None:
            self.link(b, b_out, e, "B")
        return e


def fresh_material(name):
    mat, created = new_asset(name, MAT_DIR, unreal.Material, unreal.MaterialFactoryNew())
    if not created:
        MEL.delete_all_material_expressions(mat)
    return mat


def finish_material(mat):
    MEL.layout_material_expressions(mat)
    MEL.recompile_material(mat)
    EAL.save_loaded_asset(mat)


def simple_material(name, roughness=0.9, specular=0.5):
    """Parameterised opaque material: Color, Roughness, Specular. Used for placeholders and buildings."""
    mat = fresh_material(name)
    g = Graph(mat)
    g.out(g.vector("Color", (0.5, 0.5, 0.5)), "", unreal.MaterialProperty.MP_BASE_COLOR)
    g.out(g.scalar("Roughness", roughness), "", unreal.MaterialProperty.MP_ROUGHNESS)
    g.out(g.scalar("Specular", specular), "", unreal.MaterialProperty.MP_SPECULAR)
    try:
        mat.set_editor_property("used_with_instanced_static_meshes", True)
    except Exception:   # noqa: BLE001
        pass
    finish_material(mat)
    return mat


def color_instance(name, parent, rgb, roughness=None):
    mi, _ = new_asset(name, MAT_DIR, unreal.MaterialInstanceConstant, unreal.MaterialInstanceConstantFactoryNew())
    MEL.set_material_instance_parent(mi, parent)
    MEL.set_material_instance_vector_parameter_value(mi, "Color", unreal.LinearColor(rgb[0], rgb[1], rgb[2], 1.0))
    if roughness is not None:
        MEL.set_material_instance_scalar_parameter_value(mi, "Roughness", roughness)
    MEL.update_material_instance(mi)
    EAL.save_loaded_asset(mi)
    return mi


# layer name, weight texture (0 a, 1 b), channel, default texture, tile metres, tint
LAYERS = [
    ("Rock", 0, "R", "rock_04", 6.0, (0.95, 0.95, 0.95)),
    ("Scree", 0, "G", "rocky_terrain_02", 4.0, (1.0, 1.0, 1.0)),
    ("Grass", 0, "B", "forrest_ground_01", 3.0, (0.55, 0.75, 0.35)),
    ("Forest", 1, "R", "forrest_ground_01", 3.0, (1.0, 1.0, 1.0)),
    ("DwarfPine", 1, "G", "forrest_ground_01", 3.0, (0.6, 0.8, 0.5)),
    ("Path", 1, "B", "rocky_trail", 2.5, (1.0, 1.0, 1.0)),
]


def build_landscape_material(ex, S):
    quads = S["resolution"][0] - 1
    step_m = S["metres_per_sample"]
    ortho = import_texture(os.path.join(ex, "ortho.jpg"), "T_RysyOrtho", "color")
    masks = [import_texture(os.path.join(ex, "masks_%s.png" % k), "T_RysyMask_" + k.upper(), "data") for k in "abc"]
    ground = {}
    for _, _, _, tname, _, _ in LAYERS:
        if tname not in ground:
            ground[tname] = (import_texture(os.path.join(ex, "textures", tname + "_diff.jpg"), "T_" + tname + "_D", "color"),
                             import_texture(os.path.join(ex, "textures", tname + "_nor.jpg"), "T_" + tname + "_N", "normal"))

    mat = fresh_material("M_RysyLandscape")
    g = Graph(mat)
    uv01 = g.node(unreal.MaterialExpressionLandscapeLayerCoords, -1800, mapping_scale=float(quads))
    quad_uv = g.node(unreal.MaterialExpressionLandscapeLayerCoords, -1800, mapping_scale=1.0)
    metres = g.node(unreal.MaterialExpressionMultiply, -1600, const_b=float(step_m))
    g.link(quad_uv, "", metres, "A")

    photo = g.tex("Ortho", ortho, unreal.MaterialSamplerType.SAMPLERTYPE_COLOR, uv01)
    mtex = [g.tex("Mask" + k.upper(), t, unreal.MaterialSamplerType.SAMPLERTYPE_LINEAR_COLOR, uv01) for k, t in zip("abc", masks)]

    col_sum = nrm_sum = None
    for name, mi, ch, tname, tile, tint in LAYERS:
        uv = g.op(unreal.MaterialExpressionDivide, metres, "", g.scalar(name + "_TileMeters", tile))
        d, n = ground[tname]
        alb = g.tex(name + "_Albedo", d, unreal.MaterialSamplerType.SAMPLERTYPE_COLOR, uv, shared=True)
        nrm = g.tex(name + "_Normal", n, unreal.MaterialSamplerType.SAMPLERTYPE_NORMAL, uv, shared=True)
        c = g.op(unreal.MaterialExpressionMultiply, alb, "RGB", g.vector(name + "_Tint", tint))
        cw = g.op(unreal.MaterialExpressionMultiply, c, "", mtex[mi], ch)
        nw = g.op(unreal.MaterialExpressionMultiply, nrm, "RGB", mtex[mi], ch)
        col_sum = cw if col_sum is None else g.op(unreal.MaterialExpressionAdd, col_sum, "", cw)
        nrm_sum = nw if nrm_sum is None else g.op(unreal.MaterialExpressionAdd, nrm_sum, "", nw)

    # near the camera the layer textures, further away the orthophoto
    cam = g.node(unreal.MaterialExpressionCameraPositionWS, -900)
    wp = g.node(unreal.MaterialExpressionWorldPosition, -900)
    dist = g.op(unreal.MaterialExpressionDistance, cam, "", wp)
    fade = g.op(unreal.MaterialExpressionDivide, dist, "", g.scalar("OrthoFadeDistance_cm", 20000.0))
    alpha = g.op(unreal.MaterialExpressionAdd, fade, "", g.scalar("OrthoNear", 0.4))
    alpha = g.op(unreal.MaterialExpressionMin, alpha, "", const_b=1.0)
    lerp = g.node(unreal.MaterialExpressionLinearInterpolate, -200)
    g.link(col_sum, "", lerp, "A")
    g.link(photo, "RGB", lerp, "B")
    g.link(alpha, "", lerp, "Alpha")
    snow_a = g.op(unreal.MaterialExpressionMultiply, mtex[2], "R", g.scalar("SnowAmount", 0.0))
    snow = g.node(unreal.MaterialExpressionLinearInterpolate, -150)
    g.link(lerp, "", snow, "A")
    g.link(g.vector("SnowColor", (0.85, 0.88, 0.92)), "", snow, "B")
    g.link(snow_a, "", snow, "Alpha")
    bright = g.op(unreal.MaterialExpressionMultiply, snow, "", g.scalar("Brightness", 1.0))
    g.out(bright, "", unreal.MaterialProperty.MP_BASE_COLOR)
    g.out(nrm_sum, "", unreal.MaterialProperty.MP_NORMAL)
    g.out(g.scalar("Roughness", 0.9), "", unreal.MaterialProperty.MP_ROUGHNESS)
    g.out(g.scalar("Specular", 0.3), "", unreal.MaterialProperty.MP_SPECULAR)
    finish_material(mat)

    mi, created = new_asset("MI_RysyLandscape", MAT_DIR, unreal.MaterialInstanceConstant,
                            unreal.MaterialInstanceConstantFactoryNew())
    MEL.set_material_instance_parent(mi, mat)
    for name, (alb, nrm) in LAYER_TEXTURES.items():
        for suffix, path in (("_Albedo", alb), ("_Normal", nrm)):
            t = load(path)
            if t is not None:
                MEL.set_material_instance_texture_parameter_value(mi, name + suffix, t)
    MEL.update_material_instance(mi)
    EAL.save_loaded_asset(mi)
    log("Material krajobrazu gotowy: %s/MI_RysyLandscape (%s)" % (MAT_DIR, "nowy" if created else "zachowany"))
    return mi


# ----------------------------------------------------------------------------------------- actors
def spawn(cls, loc=(0, 0, 0), yaw=0.0, label=None, folder="Rysy", pitch=0.0, roll=0.0):
    a = actor_sub.spawn_actor_from_class(cls, unreal.Vector(*loc), unreal.Rotator(roll=roll, pitch=pitch, yaw=yaw))
    if label:
        a.set_actor_label(label)
    a.set_folder_path(folder)
    a.set_editor_property("tags", [unreal.Name(TAG)])
    return a


def mesh_actor(mesh, loc, scale, yaw=0.0, roll=0.0, material=None, label=None, folder="Rysy"):
    a = spawn(unreal.StaticMeshActor, loc, yaw, label, folder, roll=roll)
    c = a.static_mesh_component
    c.set_static_mesh(mesh)
    if material is not None:
        c.set_material(0, material)
    a.set_actor_scale3d(unreal.Vector(*scale))
    return a


def add_component(actor, cls):
    """Adds a component to a placed actor (same path as Details -> Add Component)."""
    sds = unreal.get_engine_subsystem(unreal.SubobjectDataSubsystem)
    lib = unreal.SubobjectDataBlueprintFunctionLibrary
    handles = sds.k2_gather_subobject_data_for_instance(actor)
    parent = handles[0]
    root = actor.root_component
    for h in handles:
        if assoc(lib, lib.get_data(h)) == root:
            parent = h
            break
    res = sds.add_new_subobject(unreal.AddNewSubobjectParams(parent_handle=parent, new_class=cls, blueprint_context=None))
    handle = res[0] if isinstance(res, tuple) else res
    if not lib.is_handle_valid(handle):
        raise RuntimeError("add_new_subobject failed: %s" % (res[1] if isinstance(res, tuple) else res))
    return assoc(lib, lib.get_data(handle))


def assoc(lib, data):
    # UE 5.8: get_object is deprecated in favour of get_associated_object
    f = getattr(lib, "get_associated_object", None) or lib.get_object
    return f(data)


def instanced_actor(label, mesh, transforms, material=None, cull_m=0, folder="Rysy/Foliage", collision=True, shadows=True):
    if not transforms:
        return None
    actor = spawn(unreal.StaticMeshActor, label=label, folder=folder)
    try:
        comp = add_component(actor, unreal.HierarchicalInstancedStaticMeshComponent)
    except Exception as e:   # noqa: BLE001
        actor_sub.destroy_actor(actor)
        return foliage_fallback(label, mesh, transforms, material, e)
    comp.set_static_mesh(mesh)
    if material is not None:
        for i in range(max(1, len(mesh.get_editor_property("static_materials")))):
            comp.set_material(i, material)
    try:
        comp.set_mobility(unreal.ComponentMobility.STATIC)
    except Exception:   # noqa: BLE001
        pass
    if cull_m:
        comp.set_cull_distances(int(cull_m * 80), int(cull_m * 100))
    if not collision:
        comp.set_collision_enabled(unreal.CollisionEnabled.NO_COLLISION)
    comp.set_cast_shadow(shadows)
    comp.add_instances(transforms, False, True)
    log("%s: %d instancji" % (label, len(transforms)))
    return actor


def foliage_fallback(label, mesh, transforms, material, err):
    """If components cannot be added from Python, put the instances into the Foliage system instead."""
    warn("Nie mozna dodac komponentu HISM (%s) - probuje przez Foliage" % err)
    try:
        ft, _ = new_asset("FT_" + label, CONTENT_ROOT + "/Foliage", unreal.FoliageType_InstancedStaticMesh,
                          unreal.FoliageType_InstancedStaticMeshFactory())
        ft.set_editor_property("mesh", mesh)
        if material is not None:
            ft.set_editor_property("override_materials", [material])
        EAL.save_loaded_asset(ft)
        world = unreal.get_editor_subsystem(unreal.UnrealEditorSubsystem).get_editor_world()
        unreal.InstancedFoliageActor.add_instances(world, ft, transforms)
        log("%s: %d instancji (Foliage)" % (label, len(transforms)))
    except Exception as e:   # noqa: BLE001
        warn("Foliage tez nie zadzialalo dla %s: %s" % (label, e))
    return None


def mesh_bounds(mesh):
    b = mesh.get_bounding_box()
    return b.min, b.max


def vegetation(ex, kind, csv_name, meshes, color, cull_m, parent_mat):
    rows = read_csv(os.path.join(ex, csv_name))
    rnd = random.Random(sum(map(ord, kind)))
    if FOLIAGE_FRACTION < 1:
        rows = [r for r in rows if rnd.random() < FOLIAGE_FRACTION]
    placeholder = not meshes
    mesh_list = [load(p) for p in meshes] if meshes else [load(PLACEHOLDER[kind])]
    mesh_list = [m for m in mesh_list if m is not None] or [load(PLACEHOLDER[kind])]
    placeholder = placeholder or mesh_list[0].get_path_name().startswith("/Engine/")
    mat = color_instance("MI_Placeholder_" + kind, parent_mat, color) if placeholder else None
    per_mesh = [[] for _ in mesh_list]
    info = []
    for m in mesh_list:
        mn, mx = mesh_bounds(m)
        info.append((mn, mx, max(mx.z - mn.z, 1.0), max(mx.x - mn.x, mx.y - mn.y, mx.z - mn.z, 1.0)))
    with unreal.ScopedSlowTask(len(rows), "Rysy: " + kind) as task:
        task.make_dialog(True)
        for k, r in enumerate(rows):
            if k % 5000 == 0:
                task.enter_progress_frame(min(5000, len(rows) - k))
            per_mesh_add(kind, r, rnd, info, mesh_list, per_mesh, placeholder)
    for vi, (m, tr) in enumerate(zip(mesh_list, per_mesh)):
        instanced_actor("Rysy_%s_%d" % (kind, vi), m, tr, mat, cull_m)
    report.append("%s: %d instancji%s" % (kind, len(rows), " (zastepcze ksztalty)" if placeholder else ""))


def per_mesh_add(kind, r, rnd, info, mesh_list, per_mesh, placeholder):
    """One instance transform from a CSV row, appended to the list of the mesh variant it picks."""
    vi = rnd.randrange(len(mesh_list))
    mn, mx, mh, mext = info[vi]
    if kind == "rock":
        s = r["size_m"] * 100 / mext
        if placeholder:
            sc = unreal.Vector(s * rnd.uniform(0.9, 1.4), s * rnd.uniform(0.8, 1.2), s * rnd.uniform(0.45, 0.75))
        else:
            sc = unreal.Vector(s * rnd.uniform(0.8, 1.2), s * rnd.uniform(0.8, 1.2), s * rnd.uniform(0.7, 1.2))
        n = unreal.Vector(r["nx"], r["ny"], r["nz"]) * 0.6 + unreal.Vector(0, 0, 0.4)
        n = n.normal()
        fwd = unreal.Vector(math.cos(math.radians(r["yaw"])), math.sin(math.radians(r["yaw"])), 0)
        rot = unreal.MathLibrary.make_rot_from_zx(n, fwd)
        z = r["z"] - 0.15 * r["size_m"] * 100 - mn.z * sc.z
    else:
        s = r["height_m"] * 100 / mh
        xy = {"spruce": 0.38, "dwarfpine": 1.8}[kind] if placeholder else rnd.uniform(0.9, 1.1)
        if kind == "dwarfpine" and not placeholder:
            xy = rnd.uniform(1.5, 2.1)   # a pine sapling squashed into a wide, low dwarf-pine clump
        sc = unreal.Vector(s * xy, s * xy, s)
        rot = unreal.Rotator(roll=0, pitch=0, yaw=r["yaw"])
        z = r["z"] - mn.z * s
    per_mesh[vi].append(unreal.Transform(unreal.Vector(r["x"], r["y"], z), rot, sc))


def trail_spline(ex):
    rows = read_csv(os.path.join(ex, "trail.csv"))
    actor = spawn(unreal.StaticMeshActor, (rows[0]["x"], rows[0]["y"], rows[0]["z"]), label="Rysy_Szlak", folder="Rysy")
    try:
        sp = add_component(actor, unreal.SplineComponent)
        sp.set_spline_points([unreal.Vector(r["x"], r["y"], r["z"] + 30) for r in rows],
                             unreal.SplineCoordinateSpace.WORLD, True)
        log("Szlak: spline z %d punktow, %.0f m" % (len(rows), rows[-1]["dist_m"]))
    except Exception as e:   # noqa: BLE001
        warn("Spline szlaku: %s" % e)
    # small cairns every 250 m so the route reads from the air even without selecting the spline
    cube = load(CUBE)
    mark = color_instance("MI_TrailMark", SIMPLE, (0.6, 0.05, 0.03))
    tr = []
    nxt = 0.0
    for r in rows:
        if r["dist_m"] >= nxt:
            tr.append(unreal.Transform(unreal.Vector(r["x"], r["y"], r["z"] + 60), unreal.Rotator(0, 0, 0), unreal.Vector(0.25, 0.25, 1.2)))
            nxt += 250
    instanced_actor("Rysy_SzlakZnaki", cube, tr, mark, 0, folder="Rysy")


def lakes(ex, water_mat):
    data = json.load(open(os.path.join(ex, "lakes.json"), encoding="utf-8"))["lakes"]
    plane = load(PLANE)
    for lk in data:
        tr = [unreal.Transform(unreal.Vector(x, y, lk["level_cm"] + 5), unreal.Rotator(0, 0, 0),
                               unreal.Vector(s / 100 * 1.002, s / 100 * 1.002, 1)) for x, y, s in lk["cells"]]
        instanced_actor("Woda_" + lk["name"], plane, tr, water_mat, 0, folder="Rysy/Woda", collision=False, shadows=False)
    report.append("jeziora: %d" % len(data))


def buildings(ex):
    data = json.load(open(os.path.join(ex, "buildings.json"), encoding="utf-8"))["buildings"]
    cube = load(CUBE)
    wood = color_instance("MI_Wood", SIMPLE, (0.23, 0.14, 0.08))
    stone = color_instance("MI_Stone", SIMPLE, (0.45, 0.44, 0.42))
    roof = color_instance("MI_Roof", SIMPLE, (0.12, 0.11, 0.11))
    for b in data:
        wall = stone if b["style"] in ("stone_hut", "hut") else wood
        h = b["wall_height"]
        label = b["name"] or ("Budynek_" + b["style"])
        mesh_actor(cube, (b["x"], b["y"], b["z_base"] + h / 2), (b["width"] / 100, b["depth"] / 100, h / 100),
                   b["yaw"], material=wall, label=label, folder="Rysy/Budynki")
        # gable roof: a cube turned 45 degrees about the ridge, half of it sticks out of the walls
        d = (b["depth"] + 80) / math.sqrt(2)
        mesh_actor(cube, (b["x"], b["y"], b["z_base"] + h), ((b["width"] + 80) / 100, d / 100, d / 100),
                   b["yaw"], roll=45, material=roof, label=label + "_dach", folder="Rysy/Budynki")
    report.append("budynki: %d" % len(data))


def signposts(ex):
    data = json.load(open(os.path.join(ex, "signposts.json"), encoding="utf-8"))["signposts"]
    cyl, cube = load(CYLINDER), load(CUBE)
    wood = color_instance("MI_SignPost", SIMPLE, (0.3, 0.2, 0.1))
    board = color_instance("MI_SignBoard", SIMPLE, (0.85, 0.82, 0.75))
    for s in data:
        x, y, z, yaw = s["x"], s["y"], s["z"], s["yaw"]
        mesh_actor(cyl, (x, y, z + 125), (0.12, 0.12, 2.5), 0, material=wood, label="Drogowskaz_" + s["name"], folder="Rysy/Drogowskazy")
        mesh_actor(cube, (x, y, z + 230), (0.08, 1.9, 0.7), yaw, material=board, label="Tablica_" + s["name"], folder="Rysy/Drogowskazy")
        fx, fy = math.cos(math.radians(yaw)), math.sin(math.radians(yaw))
        for side in (1, -1):
            off = 5.5 * side
            t = spawn(unreal.TextRenderActor, (x + fx * off, y + fy * off, z + 238), yaw if side > 0 else yaw + 180,
                      label="Napis_%s_%d" % (s["name"], side), folder="Rysy/Drogowskazy")
            try:
                c = t.text_render
                c.set_text(s["name"] + "\n" + s["subtitle"])
                c.set_world_size(15.0)
                c.set_horizontal_alignment(unreal.HorizTextAligment.EHTA_CENTER)
                c.set_vertical_alignment(unreal.VerticalTextAligment.EVRTA_TEXT_CENTER)
                c.set_text_render_color(unreal.Color(r=20, g=20, b=20, a=255))
            except Exception as e:   # noqa: BLE001
                warn("Napis %s: %s" % (s["name"], e))
    report.append("drogowskazy: " + ", ".join(s["name"] for s in data))


def sky_and_light(S):
    sun = spawn(unreal.DirectionalLight, (0, 0, S["mid_m"] * 100 + 50000), -45.0, "Slonce", "Rysy/Niebo", pitch=-38.0)
    try:
        sun.root_component.set_mobility(unreal.ComponentMobility.MOVABLE)
        lc = sun.light_component
        lc.set_editor_property("atmosphere_sun_light", True)
        lc.set_intensity(10.0)
    except Exception as e:   # noqa: BLE001
        warn("Slonce: %s" % e)
    atm = spawn(unreal.SkyAtmosphere, (0, 0, 0), 0, "Atmosfera", "Rysy/Niebo")
    try:
        # the planet surface beyond the far terrain: hazy grey-green lowland instead of the default blue
        atm.get_component_by_class(unreal.SkyAtmosphereComponent).set_editor_property(
            "ground_albedo", unreal.Color(r=70, g=78, b=62, a=255))
    except Exception as e:   # noqa: BLE001
        warn("Atmosfera: %s" % e)
    sl = spawn(unreal.SkyLight, (0, 0, S["mid_m"] * 100 + 60000), 0, "SkyLight", "Rysy/Niebo")
    try:
        sl.root_component.set_mobility(unreal.ComponentMobility.MOVABLE)
        sl.light_component.set_editor_property("real_time_capture", True)
    except Exception as e:   # noqa: BLE001
        warn("SkyLight: %s" % e)
    spawn(unreal.VolumetricCloud, (0, 0, 0), 0, "Chmury", "Rysy/Niebo")
    pp = spawn(unreal.PostProcessVolume, (0, 0, S["mid_m"] * 100), 0, "Rysy_PostProcess", "Rysy/Niebo")
    try:
        pp.set_editor_property("unbound", True)
        st = pp.get_editor_property("settings")
        st.set_editor_property("override_auto_exposure_bias", True)
        st.set_editor_property("auto_exposure_bias", EXPOSURE_BIAS)
        st.set_editor_property("override_auto_exposure_method", True)
        st.set_editor_property("auto_exposure_method", unreal.AutoExposureMethod.AEM_HISTOGRAM)
        pp.set_editor_property("settings", st)
    except Exception as e:   # noqa: BLE001
        warn("PostProcess (ekspozycja): %s" % e)
    fog = spawn(unreal.ExponentialHeightFog, (0, 0, 130000), 0, "Mgla", "Rysy/Niebo")
    try:
        fc = fog.component
        fc.set_fog_density(FOG_DENSITY)
        fc.set_fog_height_falloff(FOG_HEIGHT_FALLOFF)
        fc.set_fog_max_opacity(FOG_MAX_OPACITY)
        fc.set_start_distance(FOG_START_DISTANCE_M * 100.0)
        col = unreal.LinearColor(*FOG_COLOR, 1.0)
        for prop in ("fog_inscattering_luminance", "fog_inscattering_color"):   # renamed in UE 5.x
            try:
                fc.set_editor_property(prop, col)
                break
            except Exception:   # noqa: BLE001
                continue
        else:
            warn("Mgla: nie ustawiono koloru")
    except Exception as e:   # noqa: BLE001
        warn("Mgla: %s" % e)


def far_terrain(ex, S):
    info = S.get("far_terrain")
    if not FAR_TERRAIN or not info:
        return
    # versioned asset names (SM_RysyFar_v3 ...): a new export gets imported, the old assets stay unused
    dest_dir, name = CONTENT_ROOT + "/FarTerrain", info.get("asset", "SM_RysyFar")
    path = dest_dir + "/" + name
    got = []
    if not EAL.does_asset_exist(path):
        task = unreal.AssetImportTask()
        task.set_editor_property("filename", os.path.join(ex, info["file"]))
        task.set_editor_property("destination_path", dest_dir)
        task.set_editor_property("destination_name", name)
        task.set_editor_property("automated", True)
        task.set_editor_property("replace_existing", True)
        task.set_editor_property("save", False)
        asset_tools.import_asset_tasks([task])
        got = [str(p).split(".")[0] for p in (task.get_editor_property("imported_object_paths") or [])]
        if not EAL.does_asset_exist(path):
            meshes = [p for p in got if isinstance(EAL.load_asset(p), unreal.StaticMesh)]
            if meshes:
                EAL.rename_asset(meshes[0], path)
    mesh = EAL.load_asset(path)
    if not isinstance(mesh, unreal.StaticMesh):
        warn("Daleki teren: import %s nie dal siatki (StaticMesh)" % info["file"])
        return
    tex = import_texture(os.path.join(ex, info["texture"]), info.get("texture_asset", "T_RysyFar"), "color")
    mat = fresh_material("M_RysyFar")
    g = Graph(mat)
    t = g.node(unreal.MaterialExpressionTextureSampleParameter2D, -800, parameter_name="Photo")
    if tex is not None:
        t.set_editor_property("texture", tex)
    g.out(g.op(unreal.MaterialExpressionMultiply, t, "RGB", g.scalar("Brightness", 1.0)), "", unreal.MaterialProperty.MP_BASE_COLOR)
    g.out(g.scalar("Roughness", 1.0), "", unreal.MaterialProperty.MP_ROUGHNESS)
    g.out(g.scalar("Specular", 0.2), "", unreal.MaterialProperty.MP_SPECULAR)
    mat.set_editor_property("two_sided", True)
    finish_material(mat)
    # the mesh's own slot points at M_RysyFar (the OBJ importer gives it "far" from far_terrain.mtl);
    # then drop what is left over: "far", TEX_far_terrain* and older SM_RysyFar* / T_RysyFar* versions
    # (round 3: in a project that already had "far" the import reused it, so this has to go by name)
    try:
        mesh.set_material(0, mat)
        EAL.save_loaded_asset(mesh)
    except Exception as e:   # noqa: BLE001
        warn("Daleki teren: slot materialu: %s" % e)
    keep = {path, TEX_DIR + "/" + info.get("texture_asset", "T_RysyFar")}
    old = [p for p in got if p != path]
    for folder, prefixes in ((dest_dir, ("far", "TEX_far_terrain", "SM_RysyFar")), (TEX_DIR, ("T_RysyFar",))):
        for p in EAL.list_assets(folder, recursive=False, include_folder=False):
            p = str(p).split(".")[0]
            if p.rsplit("/", 1)[-1].startswith(prefixes):
                old.append(p)
    # materials first (they hold the textures), meshes before their materials
    rank = lambda p: 0 if isinstance(EAL.load_asset(p), unreal.StaticMesh) else (1 if isinstance(EAL.load_asset(p), unreal.MaterialInterface) else 2)
    for p in sorted(set(old) - keep, key=rank):
        if not EAL.does_asset_exist(p):
            continue
        # the level still lists the old actor until it is saved; that actor is gone (destroyed above)
        refs = [r for r in (EAL.find_package_referencers_for_asset(p, False) or []) if str(r).split(".")[0] not in old and not str(r).startswith(LEVEL_PATH)]
        if refs:
            warn("Daleki teren: zostawiam %s (uzywa go %s)" % (p, ", ".join(str(r) for r in refs)))
            continue
        try:
            EAL.delete_asset(p)
            log("Daleki teren: usuniety stary zasob %s" % p)
        except Exception as e:   # noqa: BLE001
            warn("Daleki teren: nie usunieto %s: %s" % (p, e))
    # fit the mesh to the expected bounds whatever axis convention the OBJ importer used
    bb = mesh.get_bounding_box()
    lmin, lmax = [bb.min.x, bb.min.y, bb.min.z], [bb.max.x, bb.max.y, bb.max.z]
    want = info["bounds_cm"]
    wmin, wmax = [want["x"][0], want["y"][0], want["z"][0]], [want["x"][1], want["y"][1], want["z"][1]]
    wsize = [b - a for a, b in zip(wmin, wmax)]
    lsize = [b - a for a, b in zip(lmin, lmax)]
    k = max(lsize) / max(wsize)                       # importer unit scale
    perm = [min(range(3), key=lambda a: abs(lsize[a] / k - wsize[T])) for T in range(3)]   # target axis <- local axis
    if sorted(perm) != [0, 1, 2]:
        warn("Daleki teren: nie rozpoznano osi (rozmiary %s, oczekiwane %s)" % (lsize, wsize))
        return
    sign = []
    for T in range(3):
        a = perm[T]
        plus = abs(lmin[a] / k - wmin[T]) + abs(lmax[a] / k - wmax[T])
        minus = abs(-lmax[a] / k - wmin[T]) + abs(-lmin[a] / k - wmax[T])
        sign.append(1 if plus <= minus else -1)
    cols = [None] * 3                                  # image of each local axis
    for T in range(3):
        v = [0.0, 0.0, 0.0]; v[T] = float(sign[T])
        cols[perm[T]] = v
    det = (cols[0][0] * (cols[1][1] * cols[2][2] - cols[1][2] * cols[2][1]) - cols[0][1] * (cols[1][0] * cols[2][2] - cols[1][2] * cols[2][0])
           + cols[0][2] * (cols[1][0] * cols[2][1] - cols[1][1] * cols[2][0]))
    scl = [1.0 / k] * 3
    if det < 0:                                        # a mirror: flip local Z and give it a negative scale
        cols[2] = [-c for c in cols[2]]; scl[2] = -scl[2]
    rot = unreal.MathLibrary.make_rotation_from_axes(unreal.Vector(*cols[0]), unreal.Vector(*cols[1]), unreal.Vector(*cols[2]))
    a = mesh_actor(mesh, (0, 0, 0), scl, material=mat, label="Rysy_DalekiTeren", folder="Rysy")
    a.set_actor_rotation(rot, False)
    c = a.static_mesh_component
    # no collision (round 3: set_collision_enabled alone left QUERY_AND_PHYSICS on the saved actor)
    try:
        c.set_collision_profile_name("NoCollision")
        c.set_collision_enabled(unreal.CollisionEnabled.NO_COLLISION)
        c.set_editor_property("can_character_step_up_on", unreal.CanBeCharacterBase.ECB_NO)
        c.set_generate_overlap_events(False)
    except Exception as e:   # noqa: BLE001
        warn("Daleki teren: kolizja: %s" % e)
    log("Daleki teren: kolizja %s, profil %s" % (c.get_collision_enabled(), c.get_collision_profile_name()))
    origin, extent = a.get_actor_bounds(False)[:2]
    got_min = [origin.x - extent.x, origin.y - extent.y, origin.z - extent.z]
    a.set_actor_location(unreal.Vector(*[w - g0 for w, g0 in zip(wmin, got_min)]), False, False)
    log("Daleki teren: osie %s, znaki %s, skala 1/%.3g" % (perm, sign, k))
    report.append("daleki teren: 35 x 29 km wokol krajobrazu + pierscien horyzontu (%s)" % name)


def landscape_step(S, mat):
    lands = [a for a in actor_sub.get_all_level_actors() if isinstance(a, unreal.LandscapeProxy)]
    corner = S["actor_location_corner_cm"]
    sc = S["scale"]
    if not lands:
        msg = landscape_instructions(S)
        unreal.log_warning(msg)
        report.append("KRAJOBRAZ: jeszcze go nie ma - zaimportuj heightmap.png recznie (liczby ponizej i w README), "
                      "potem uruchom skrypt jeszcze raz.")
        try:
            unreal.EditorDialog.show_message("Rysy: zaimportuj krajobraz", msg, unreal.AppMsgType.OK)
        except Exception:   # noqa: BLE001
            pass
        return
    L = lands[0]
    loc, scl = L.get_actor_location(), L.get_actor_scale3d()
    want_loc = unreal.Vector(corner["x"], corner["y"], corner["z"])
    want_scl = unreal.Vector(sc["x"], sc["y"], sc["z"])
    if (loc - want_loc).length() > 1.0 or (scl - want_scl).length() > 0.01:
        warn("Krajobraz byl w %s / skala %s - przestawiam na %s / %s" % (loc, scl, want_loc, want_scl))
        L.set_actor_scale3d(want_scl)
        L.set_actor_location(want_loc, False, False)
    L.set_editor_property("landscape_material", mat)
    report.append("krajobraz: znaleziony, ustawiony, material MI_RysyLandscape przypisany")


def landscape_instructions(S):
    sc, c = S["scale"], S["location_ui_centre_cm"]
    return ("Krajobraz trzeba zaimportowac recznie (jeden raz):\n"
            "1. Tryb Landscape (Shift+2) -> Manage -> New -> Import from File\n"
            "2. Heightmap File: %s\n"
            "3. Material: MI_RysyLandscape (%s)\n"
            "4. Section Size: 63x63 Quads, Sections Per Component: 2x2, Number of Components: 32 x 32 "
            "(Overall Resolution 4033 x 4033)\n"
            "5. Location X=%.1f Y=%.1f Z=%.1f   Rotation 0 0 0\n"
            "6. Scale X=%.1f Y=%.1f Z=%.1f\n"
            "7. Import, potem uruchom ten skrypt jeszcze raz."
            % (os.path.join(EXPORT, "heightmap.png"), MAT_DIR, c["x"], c["y"], c["z"], sc["x"], sc["y"], sc["z"]))


def open_level():
    world = unreal.get_editor_subsystem(unreal.UnrealEditorSubsystem).get_editor_world()
    current = world.get_path_name().split(".")[0] if world else ""
    if current == LEVEL_PATH:
        return
    if EAL.does_asset_exist(LEVEL_PATH):
        level_sub.load_level(LEVEL_PATH)
    else:
        level_sub.new_level(LEVEL_PATH)
    log("Poziom: " + LEVEL_PATH)


# ----------------------------------------------------------------------------------------- main
EXPORT = find_export_dir()
log("Dane z " + EXPORT)
SETTINGS = json.load(open(os.path.join(EXPORT, "landscape.json"), encoding="utf-8"))
open_level()
for a in actor_sub.get_all_level_actors():
    try:
        if TAG in [str(t) for t in a.get_editor_property("tags")]:
            actor_sub.destroy_actor(a)
    except Exception:   # noqa: BLE001
        pass

SIMPLE = simple_material("M_RysySimple")
WATER = simple_material("M_RysyWater", roughness=0.04, specular=0.8)
WATER_MI = color_instance("MI_Water", WATER, (0.01, 0.045, 0.05), 0.04)
LAND_MI = build_landscape_material(EXPORT, SETTINGS)
landscape_step(SETTINGS, LAND_MI)
sky_and_light(SETTINGS)
far_terrain(EXPORT, SETTINGS)
lakes(EXPORT, WATER_MI)
buildings(EXPORT)
trail_spline(EXPORT)
signposts(EXPORT)
vegetation(EXPORT, "spruce", "foliage_spruce.csv", SPRUCE_MESHES, (0.03, 0.09, 0.03), 0, SIMPLE)
vegetation(EXPORT, "dwarfpine", "foliage_dwarfpine.csv", DWARFPINE_MESHES, (0.05, 0.13, 0.03), 3000, SIMPLE)
vegetation(EXPORT, "rock", "rocks.csv", ROCK_MESHES, (0.42, 0.41, 0.39), 900, SIMPLE)

ps = SETTINGS["player_start_cm"]
spawn(unreal.PlayerStart, (ps["x"], ps["y"], ps["z"]), ps["yaw"], "Start_MorskieOko", "Rysy")

level_sub.save_current_level()
EAL.save_directory(CONTENT_ROOT, True, True)
summary = "Rysy: gotowe.\n" + "\n".join(report)
unreal.log(summary)
try:
    unreal.EditorDialog.show_message("Rysy: gotowe", summary, unreal.AppMsgType.OK)
except Exception:   # noqa: BLE001
    pass
