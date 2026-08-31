"""Prepare naturally open capital wrecks without freestanding tunnel boxes.

The source wreck already contains the detailed, textured ship shell. This pass
opens jagged apertures at the two torn ends of its central section and drops the
old freestanding beams, detached armor and glowing conduit placeholders. The
result remains the textured authored hull everywhere the player can see or
touch, without dark bars laid across its silhouette.
"""

import argparse
import os
import sys

import bmesh
import bpy
from mathutils import Vector


CONFIGS = {
    "frigate": {
        "target": None,
    },
    "carrier": {
        "target": "Carrier wreck flight deck",
        "center_y": 0.07,
        "center_z": 0.015,
        "half_width": 0.205,
        "half_height": 0.145,
    },
    "battleship": {
        "target": "Battleship wreck midsection",
        "center_y": -0.05,
        "center_z": 0.065,
        "half_width": 0.19,
        "half_height": 0.14,
    },
    "cruiser": {
        "target": "Cruiser wreck command hull",
        "center_y": -0.04,
        "center_z": 0.19,
        "half_width": 0.13,
        "half_height": 0.12,
    },
}


def arguments():
    raw = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    parser = argparse.ArgumentParser()
    parser.add_argument("--kind", choices=tuple(CONFIGS), required=True)
    parser.add_argument("--source", required=True)
    parser.add_argument("--output", required=True)
    return parser.parse_args(raw)


def world_bounds(obj):
    points = [obj.matrix_world @ Vector(corner) for corner in obj.bound_box]
    minimum = Vector(tuple(min(point[axis] for point in points) for axis in range(3)))
    maximum = Vector(tuple(max(point[axis] for point in points) for axis in range(3)))
    return minimum, maximum


def remove_dead_visuals():
    removed = []
    placeholder_terms = (
        "hot conduit",
        "detached armor",
        "torn frame",
        "exposed frame",
        "torn longeron",
    )
    for obj in list(bpy.context.scene.objects):
        if obj.type != "MESH":
            continue
        lowered = obj.name.lower()
        if any(term in lowered for term in placeholder_terms):
            removed.append(obj.name)
            bpy.data.objects.remove(obj, do_unlink=True)
    if removed:
        print(f"REMOVED dead visuals: {', '.join(removed)}")


def clear_safe_core(target, cfg, minimum, maximum):
    """Remove small loose bars that visibly cross the guaranteed flight line."""
    safe_min_y = cfg["center_y"] - cfg["half_width"] * 0.48
    safe_max_y = cfg["center_y"] + cfg["half_width"] * 0.48
    safe_min_z = cfg["center_z"] - cfg["half_height"] * 0.48
    safe_max_z = cfg["center_z"] + cfg["half_height"] * 0.48
    removed = []
    for obj in list(bpy.context.scene.objects):
        if obj == target or obj.type != "MESH":
            continue
        obj_minimum, obj_maximum = world_bounds(obj)
        overlaps_core = (
            obj_maximum.x > minimum.x
            and obj_minimum.x < maximum.x
            and obj_maximum.y > safe_min_y
            and obj_minimum.y < safe_max_y
            and obj_maximum.z > safe_min_z
            and obj_minimum.z < safe_max_z
        )
        # Main ship sections remain meaningful obstacles. Only the small torn
        # frame/beam pieces can become accidental bars across an empty belly.
        if overlaps_core and max(obj_maximum - obj_minimum) < (maximum.x - minimum.x) * 0.72:
            removed.append(obj.name)
            bpy.data.objects.remove(obj, do_unlink=True)
    if removed:
        print(f"REMOVED core-crossing fragments: {', '.join(removed)}")


def open_torn_ends(target, cfg, minimum, maximum):
    """Delete only end-aperture faces, leaving the curved source shell intact."""
    bm = bmesh.new()
    bm.from_mesh(target.data)
    matrix = target.matrix_world
    span = maximum.x - minimum.x
    end_depth = span * 0.205
    radius_y = cfg["half_width"] * 0.92
    radius_z = cfg["half_height"] * 0.92
    doomed = []
    for face in bm.faces:
        center = matrix @ face.calc_center_median()
        at_end = center.x <= minimum.x + end_depth or center.x >= maximum.x - end_depth
        if not at_end:
            continue
        points = [center, *(matrix @ vertex.co for vertex in face.verts)]
        nearest = min(
            ((point.y - cfg["center_y"]) / radius_y) ** 2
            + ((point.z - cfg["center_z"]) / radius_z) ** 2
            for point in points
        )
        if nearest <= 1.08:
            doomed.append(face)
    if not doomed:
        bm.free()
        raise RuntimeError(f"No end faces selected on {target.name}")
    bmesh.ops.delete(bm, geom=doomed, context="FACES")
    bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))
    bm.to_mesh(target.data)
    bm.free()
    target.data.update()
    print(f"OPENED {target.name}: removed {len(doomed)} torn-end faces")


def clear_internal_core(target, cfg):
    """Remove internal plates crossing the already torn central cavity."""
    bm = bmesh.new()
    bm.from_mesh(target.data)
    matrix = target.matrix_world
    radius_y = cfg["half_width"]
    radius_z = cfg["half_height"]
    doomed = []
    for face in bm.faces:
        points = [matrix @ face.calc_center_median(), *(matrix @ vertex.co for vertex in face.verts)]
        nearest = min(
            ((point.y - cfg["center_y"]) / radius_y) ** 2
            + ((point.z - cfg["center_z"]) / radius_z) ** 2
            for point in points
        )
        if nearest <= 0.43:
            doomed.append(face)
    if doomed:
        bmesh.ops.delete(bm, geom=doomed, context="FACES")
        bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))
        bm.to_mesh(target.data)
        target.data.update()
    bm.free()
    print(f"CLEARED {target.name} internal core: removed {len(doomed)} faces")


def validate_core(target, cfg, minimum, maximum):
    """Prove a conservative 3x3 core has no visible geometry across its length."""
    bpy.context.view_layer.update()
    origin_x = minimum.x - 0.08
    distance = maximum.x - minimum.x + 0.16
    direction = Vector((1.0, 0.0, 0.0))
    hits = []
    depsgraph = bpy.context.evaluated_depsgraph_get()
    for y_fraction in (-0.34, 0.0, 0.34):
        for z_fraction in (-0.34, 0.0, 0.34):
            origin = Vector((
                origin_x,
                cfg["center_y"] + cfg["half_width"] * y_fraction,
                cfg["center_z"] + cfg["half_height"] * z_fraction,
            ))
            hit, location, _normal, _index, hit_object, _matrix = bpy.context.scene.ray_cast(
                depsgraph, origin, direction, distance=distance
            )
            if hit:
                hits.append((hit_object.name, tuple(round(value, 5) for value in location)))
    if hits:
        raise RuntimeError(f"Safe core remains visibly blocked: {hits[:6]}")


def export_glb(path):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.export_scene.gltf(
        filepath=path,
        export_format="GLB",
        export_apply=True,
        export_yup=True,
        export_texcoords=True,
        export_normals=True,
        export_materials="EXPORT",
        export_image_format="JPEG",
        export_jpeg_quality=90,
        export_cameras=False,
        export_lights=False,
        export_animations=False,
    )


def main():
    args = arguments()
    cfg = CONFIGS[args.kind]
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=args.source)
    remove_dead_visuals()
    if not cfg["target"]:
        export_glb(args.output)
        print(f"EXPORTED cleaned {args.kind} wreck: {args.output}")
        return
    target = bpy.data.objects.get(cfg["target"])
    if not target or target.type != "MESH":
        raise RuntimeError(f"Missing target mesh: {cfg['target']}")
    minimum, maximum = world_bounds(target)
    clear_safe_core(target, cfg, minimum, maximum)
    open_torn_ends(target, cfg, minimum, maximum)
    clear_internal_core(target, cfg)
    validate_core(target, cfg, minimum, maximum)
    export_glb(args.output)
    print(f"EXPORTED naturally open {args.kind} wreck: {args.output}")


if __name__ == "__main__":
    main()
