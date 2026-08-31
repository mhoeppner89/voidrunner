"""Build simplified surface collision from the shipped wreck GLBs.

Every profile follows the rendered triangles instead of wrapping each section
in a convex hull. Open torn shells therefore stay open in the simulation. A
bounded decimation pass removes texture-driven tessellation while preserving
silhouettes and every boundary loop.
"""

import json
from pathlib import Path

import bpy
from mathutils import Vector


PROJECT_ROOT = Path(__file__).resolve().parents[1]
OUTPUT = PROJECT_ROOT / "src/game/graveyardCollisionProfiles.js"
SOURCES = {
    "battleship": PROJECT_ROOT / "assets/models/wrecks/concord-battleship-wreck-v4.glb",
    "carrier": PROJECT_ROOT / "assets/models/wrecks/concord-carrier-wreck-v4.glb",
    "cruiser": PROJECT_ROOT / "assets/models/wrecks/concord-cruiser-wreck-v4.glb",
    "frigate": PROJECT_ROOT / "assets/models/wrecks/concord-frigate-wreck-v3.glb",
    "wayfarer": PROJECT_ROOT / "assets/models/wrecks/wayfarer-wreck.glb",
    "talon": PROJECT_ROOT / "assets/models/wrecks/talon-wreck.glb",
}


def is_removed_visual(obj):
    lowered = obj.name.lower()
    if "hot conduit" in lowered or obj.name.startswith("COLLISION "):
        return True
    return any(material and material.name.lower() == "fading reactor heat" for material in obj.data.materials)


def reset_scene():
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    for mesh in list(bpy.data.meshes):
        bpy.data.meshes.remove(mesh)


def select_only(obj):
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj


def triangle_count(obj):
    return sum(max(0, len(face.vertices) - 2) for face in obj.data.polygons)


def collision_budget(kind, obj):
    lowered = obj.name.lower()
    if kind in {"carrier", "battleship", "cruiser"}:
        if "wreck" in lowered:
            return 2200 if kind != "cruiser" else 1800
        return 360
    if kind == "frigate":
        return 1250 if "wreck" in lowered else 300
    return 1400 if "wreck" in lowered else 280


def rounded(value):
    value = round(float(value), 6)
    return 0.0 if abs(value) < 0.0000005 else value


def three_coordinate(value):
    """Match Blender's glTF export_yup conversion used by the runtime loader."""
    return Vector((value.x, value.z, -value.y))


def simplified_copy(kind, obj):
    copy = obj.copy()
    copy.data = obj.data.copy()
    bpy.context.collection.objects.link(copy)
    before = triangle_count(copy)
    budget = collision_budget(kind, copy)
    if before > budget:
        modifier = copy.modifiers.new(name="Collision surface reduction", type="DECIMATE")
        modifier.decimate_type = "COLLAPSE"
        modifier.ratio = max(0.001, min(1.0, budget / before))
        modifier.use_collapse_triangulate = True
        select_only(copy)
        bpy.ops.object.modifier_apply(modifier=modifier.name)
    return copy, before, triangle_count(copy)


def surface_profile(kind, obj):
    copy, before, after = simplified_copy(kind, obj)
    mesh = copy.data
    mesh.calc_loop_triangles()
    coordinates = [three_coordinate(copy.matrix_world @ vertex.co) for vertex in mesh.vertices]
    if len(coordinates) < 3 or not mesh.loop_triangles:
        bpy.data.objects.remove(copy, do_unlink=True)
        return None

    minimum = Vector(tuple(min(point[axis] for point in coordinates) for axis in range(3)))
    maximum = Vector(tuple(max(point[axis] for point in coordinates) for axis in range(3)))
    center = (minimum + maximum) * 0.5
    vertices = []
    radius = 0.0
    for point in coordinates:
        relative = point - center
        vertices.extend(rounded(component) for component in relative)
        radius = max(radius, relative.length)
    indices = [index for triangle in mesh.loop_triangles for index in triangle.vertices]
    if len(coordinates) > 65535:
        bpy.data.objects.remove(copy, do_unlink=True)
        raise RuntimeError(f"{obj.name} exceeds Uint16 collision indices after reduction")
    profile = {
        "name": obj.name,
        "center": [rounded(component) for component in center],
        "halfExtents": [rounded((maximum[axis] - minimum[axis]) * 0.5) for axis in range(3)],
        "radius": rounded(radius),
        "surfaceOnly": True,
        "vertices": vertices,
        "indices": indices,
    }
    print(f"  {obj.name}: {before} -> {after} triangles")
    bpy.data.objects.remove(copy, do_unlink=True)
    return profile


def profile_for(kind, source):
    reset_scene()
    bpy.ops.import_scene.gltf(filepath=str(source))
    bpy.context.view_layer.update()
    originals = sorted(
        (entry for entry in bpy.context.scene.objects if entry.type == "MESH" and not is_removed_visual(entry)),
        key=lambda entry: entry.name,
    )
    profiles = []
    print(f"{kind}:")
    for obj in originals:
        profile = surface_profile(kind, obj)
        if profile:
            profiles.append(profile)
    return profiles


def main():
    profiles = {name: profile_for(name, source) for name, source in SOURCES.items()}
    payload = json.dumps(profiles, separators=(",", ":"), ensure_ascii=False)
    OUTPUT.write_text(
        "// Generated by scripts/build_graveyard_collision_profiles.py.\n"
        "// Simplified rendered surfaces preserve every torn opening without convex fill.\n"
        f"export const GRAVEYARD_COLLISION_PROFILES = Object.freeze({payload});\n",
        encoding="utf-8",
    )
    for name, entries in profiles.items():
        triangles = sum(len(entry["indices"]) // 3 for entry in entries)
        print(f"{name}: {len(entries)} surface sections, {triangles} triangles")
    print(OUTPUT)


if __name__ == "__main__":
    main()
