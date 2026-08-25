"""Erstellt Szene A aus den bereitgestellten Modellen für die WebAR-Ausgabe.

Ausführung:
  "C:\\Program Files\\Blender Foundation\\Blender 3.1\\blender.exe" -b --python tools\\create_scene_a.py
"""

import bpy
import bmesh
import os
from math import radians
from mathutils import Matrix, Vector


REPOSITORY = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUTPUT_BLEND = os.path.join(REPOSITORY, "frontend", "models", "scene_a_environment_final.blend")
OUTPUT_GLB = os.path.join(REPOSITORY, "frontend", "models", "scene_a_environment_final.glb")

ASSETS = {
    "raised_bed": r"D:\saski\Downloads\flower_pot\scene.gltf",
    "tree": os.path.join(REPOSITORY, "frontend", "models", "tree.glb"),
    "table": r"D:\saski\Downloads\old_wooden_dinner_table.glb",
    "bench": r"D:\saski\Downloads\wooden_bench.glb",
    "ivy": r"D:\saski\Downloads\ivy_for_walls.glb",
}

# Eine Blender-Einheit entspricht einem Meter.
SITE_LENGTH = 26.66
SITE_WIDTH = 3.50
WALL_Y = SITE_WIDTH / 2


def world_bounds(objects):
    points = [
        obj.matrix_world @ Vector(corner)
        for obj in objects
        if obj.type == "MESH"
        for corner in obj.bound_box
    ]
    if not points:
        raise RuntimeError("Importierte Datei enthält keine Mesh-Geometrie.")
    minimum = Vector(tuple(min(point[index] for point in points) for index in range(3)))
    maximum = Vector(tuple(max(point[index] for point in points) for index in range(3)))
    return minimum, maximum


def import_and_join(path, name):
    before = set(bpy.context.scene.objects)
    bpy.ops.import_scene.gltf(filepath=path)
    imported = list(set(bpy.context.scene.objects) - before)
    meshes = [obj for obj in imported if obj.type == "MESH"]
    if not meshes:
        raise RuntimeError("Keine Mesh-Geometrie in: {}".format(path))

    asset = meshes[0]
    if len(meshes) > 1:
        bpy.ops.object.select_all(action="DESELECT")
        for obj in meshes:
            obj.select_set(True)
        bpy.context.view_layer.objects.active = asset
        bpy.ops.object.join()
        asset = bpy.context.view_layer.objects.active
    asset.name = name
    asset.data.name = "{}_mesh".format(name)
    asset.parent = None

    return asset


def size_asset(asset, target_dimensions):
    bpy.context.view_layer.update()
    lower, upper = world_bounds([asset])
    source_dimensions = upper - lower
    asset.scale = tuple(
        target / source
        for target, source in zip(target_dimensions, source_dimensions)
    )
    bpy.context.view_layer.update()
    bpy.ops.object.select_all(action="DESELECT")
    asset.select_set(True)
    bpy.context.view_layer.objects.active = asset
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    lower, upper = world_bounds([asset])
    center = (lower + upper) / 2
    asset.data.transform(Matrix.Translation((-center.x, -center.y, -lower.z)))
    asset.data.update()


def duplicate_asset(source, name, location, rotation_z=0.0):
    duplicate = source.copy()
    duplicate.data = source.data
    bpy.context.collection.objects.link(duplicate)
    duplicate.name = name
    duplicate.hide_viewport = False
    duplicate.hide_render = False
    duplicate.location = location
    duplicate.rotation_euler[2] = rotation_z
    return duplicate


def simplify_asset(asset, ratio):
    modifier = asset.modifiers.new(name="WebAR_Decimate", type="DECIMATE")
    modifier.ratio = ratio
    bpy.context.view_layer.objects.active = asset
    bpy.ops.object.modifier_apply(modifier=modifier.name)
    print("{} source triangles: {}".format(asset.name, len(asset.data.polygons)))


def thin_ivy_leaf_cards(asset, keep_every):
    """Entfernt ganze Dreieckspaare aus dem sehr dichten Efeu-Quellmodell."""
    mesh = asset.data
    bm = bmesh.new()
    bm.from_mesh(mesh)
    to_remove = [face for face in bm.faces if (face.index // 2) % keep_every]
    bmesh.ops.delete(bm, geom=to_remove, context="FACES_ONLY")
    bm.to_mesh(mesh)
    bm.free()
    mesh.update()
    print("{} thinned triangles: {}".format(asset.name, len(mesh.polygons)))


def add_ground():
    bpy.ops.mesh.primitive_plane_add(size=2, location=(SITE_LENGTH / 2, 0, -0.01))
    ground = bpy.context.object
    ground.name = "Ground_26_66m_x_3_50m"
    ground.dimensions = (SITE_LENGTH, SITE_WIDTH, 0)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    material = bpy.data.materials.new("Ground_Material")
    material.diffuse_color = (0.28, 0.30, 0.26, 1.0)
    ground.data.materials.append(material)


def main():
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    for datablock in (bpy.data.meshes, bpy.data.materials, bpy.data.images):
        for item in datablock:
            datablock.remove(item)

    scene = bpy.context.scene
    scene.unit_settings.system = "METRIC"
    scene.unit_settings.length_unit = "METERS"
    scene.unit_settings.scale_length = 1.0
    scene["layout_source"] = "Luftbild_Szene_A.png (schematische Anordnung)"
    scene["site_dimensions_m"] = "26.66 x 3.50"
    scene["wall_side"] = "+Y"

    add_ground()

    raised_bed = import_and_join(ASSETS["raised_bed"], "RaisedBed_Source")
    size_asset(raised_bed, (1.00, 0.65, 0.90))
    simplify_asset(raised_bed, 0.25)
    raised_bed.hide_render = True
    raised_bed.hide_viewport = True
    duplicate_asset(raised_bed, "RaisedBed_01", (2.05, 0.15, 0))
    duplicate_asset(raised_bed, "RaisedBed_02", (5.75, 0.15, 0))

    tree = import_and_join(ASSETS["tree"], "Tree_Source")
    size_asset(tree, (1.85, 1.95, 3.30))
    simplify_asset(tree, 0.25)
    tree.hide_render = True
    tree.hide_viewport = True
    tree_layout = (
        ((10.40, 0.50, 0), 0),
        ((13.80, -0.60, 0), 180),
        ((20.00, -0.60, 0), 0),
        ((23.70, 0.50, 0), 180),
    )
    for number, (location, angle) in enumerate(tree_layout, start=1):
        duplicate_asset(tree, "Tree_{:02d}".format(number), location, radians(angle))

    table = import_and_join(ASSETS["table"], "Table_Source")
    size_asset(table, (1.50, 0.80, 0.75))
    simplify_asset(table, 0.50)
    table.hide_render = True
    table.hide_viewport = True
    duplicate_asset(table, "DiningTable_01", (17.00, 0.00, 0), radians(0))

    bench = import_and_join(ASSETS["bench"], "Bench_Source")
    size_asset(bench, (1.60, 0.62, 0.80))
    simplify_asset(bench, 0.40)
    bench.hide_render = True
    bench.hide_viewport = True
    bench_layout = (
        ("Bench_NorthWest", (14.70, 0.90, 0), 0),
        ("Bench_NorthEast", (19.20, 0.90, 0), 0),
        ("Bench_West", (14.45, -0.05, 0), 90),
        ("Bench_East", (19.55, -0.05, 0), 90),
    )
    for name, location, angle in bench_layout:
        duplicate_asset(bench, name, location, radians(angle))

    ivy = import_and_join(ASSETS["ivy"], "Ivy_Source")
    ivy_count = 14
    ivy_length = SITE_LENGTH / ivy_count
    # Die importierte Quellachse wird vor dem Instanzieren parallel zur Wandlänge skaliert.
    size_asset(ivy, (ivy_length, 0.30, 1.25))
    simplify_asset(ivy, 0.005)
    thin_ivy_leaf_cards(ivy, 8)
    ivy.hide_render = True
    ivy.hide_viewport = True
    for index in range(ivy_count):
        x = (index + 0.5) * SITE_LENGTH / ivy_count
        duplicate_asset(
            ivy,
            "WallIvy_{:02d}".format(index + 1),
            (x, WALL_Y - 0.18, 0),
            0,
        )

    # Vorlagen dienen nur dem Instanzieren; ältere Blender-Versionen exportieren
    # ausgeblendete Objekte dennoch als sichtbare Knoten.
    for source in (raised_bed, tree, table, bench, ivy):
        bpy.data.objects.remove(source, do_unlink=True)

    bpy.ops.export_scene.gltf(
        filepath=OUTPUT_GLB,
        export_format="GLB",
        export_apply=True,
        export_texcoords=True,
        export_normals=True,
        export_materials="EXPORT",
        export_cameras=False,
        export_lights=False,
        export_animations=False,
        export_yup=True,
    )
    bpy.context.preferences.filepaths.save_version = 0
    bpy.ops.wm.save_as_mainfile(filepath=OUTPUT_BLEND, check_existing=False)

    visible_meshes = [
        obj for obj in scene.objects if obj.type == "MESH" and not obj.hide_viewport
    ]
    lower, upper = world_bounds(visible_meshes)
    print("Created:", OUTPUT_BLEND)
    print("Created:", OUTPUT_GLB)
    print("Visible scene dimensions:", tuple(round(value, 3) for value in upper - lower))
    print("Triangles:", sum(len(obj.data.polygons) for obj in visible_meshes))


main()
