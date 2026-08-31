"""LEGACY AUDIT TOOL: build the rejected rectangular v2 salvage bays.

Do not use this script for shipping assets. Its freestanding liners and box
collision shells do not follow the curved hulls. The current pipeline is
``prepare_wreck_open_hulls.py`` followed by
``build_graveyard_collision_profiles.py``.

The source wrecks keep their authored exterior mesh and textures. This pass
opens one deliberate end-to-end cavity, adds a textured interior liner and
bulkhead detail, and embeds simple named collision volumes around the free
flight channel. The runtime hides COLLISION meshes while the collision-profile
builder consumes them instead of convex-hulling the hollow exterior shell.

Run with Blender from the repository root, for example:

    blender --background --python scripts/prepare_wreck_interiors.py -- \
      --kind carrier \
      --source assets/models/wrecks/concord-carrier-wreck.glb \
      --output assets/models/wrecks/concord-carrier-wreck-v2.glb
"""

import argparse
import math
import os
import sys

import bpy
import numpy as np
from mathutils import Vector


CONFIGS = {
    "carrier": {
        "target": "Carrier wreck flight deck",
        "center_y": 0.07,
        "center_z": 0.015,
        "half_width": 0.205,
        "half_height": 0.145,
        "end_padding": 0.012,
        "ribs": 6,
    },
    "battleship": {
        "target": "Battleship wreck midsection",
        "center_y": -0.05,
        "center_z": 0.065,
        "half_width": 0.19,
        "half_height": 0.14,
        "end_padding": 0.012,
        "ribs": 6,
    },
    "cruiser": {
        "target": "Cruiser wreck command hull",
        "center_y": -0.04,
        "center_z": 0.19,
        "half_width": 0.13,
        "half_height": 0.12,
        "end_padding": 0.012,
        "ribs": 5,
    },
}


def arguments():
    raw = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    parser = argparse.ArgumentParser()
    parser.add_argument("--kind", choices=tuple(CONFIGS), required=True)
    parser.add_argument("--source", required=True)
    parser.add_argument("--output", required=True)
    return parser.parse_args(raw)


def select_only(obj):
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj


def principled_input(bsdf, modern, legacy):
    return bsdf.inputs.get(modern) or bsdf.inputs.get(legacy)


def make_textured_material(name, seed, base, panel, rust, metallic, roughness):
    """Create a compact packed texture; no external bitmap sidecar is needed."""
    size = 512
    rng = np.random.default_rng(seed)
    yy, xx = np.mgrid[0:size, 0:size]
    noise = rng.normal(0.0, 0.025, (size, size, 1)).astype(np.float32)
    broad = (np.sin(xx / 19.0) * np.sin(yy / 29.0) * 0.012)[..., None]
    rgb = np.broadcast_to(np.array(base, dtype=np.float32), (size, size, 3)).copy()
    rgb += noise + broad

    seam = ((xx % 128) < 4) | ((yy % 128) < 4)
    rgb[seam] = np.array(panel, dtype=np.float32)
    inner_seam = ((xx % 128) == 5) | ((yy % 128) == 5)
    rgb[inner_seam] = np.clip(np.array(panel, dtype=np.float32) * 1.35, 0.0, 1.0)

    # Sparse rivets, worn edge paint, and vertical rust runs give the bay a
    # readable industrial scale without any emissive strips.
    for y in range(10, size, 32):
        for x in range(10, size, 32):
            radius_sq = (xx - x) ** 2 + (yy - y) ** 2
            rgb[radius_sq < 5] = np.array((0.18, 0.20, 0.19), dtype=np.float32)
    scratches = rng.random((size, size)) > 0.9975
    rgb[scratches] = np.clip(rgb[scratches] + 0.14, 0.0, 1.0)
    for x in rng.integers(0, size, 18):
        width = int(rng.integers(2, 7))
        length = int(rng.integers(32, 180))
        y = int(rng.integers(0, max(1, size - length)))
        fade = np.linspace(0.55, 0.0, length, dtype=np.float32)[:, None, None]
        rgb[y : y + length, x : min(size, x + width)] = (
            rgb[y : y + length, x : min(size, x + width)] * (1.0 - fade)
            + np.array(rust, dtype=np.float32) * fade
        )
    rgb = np.clip(rgb, 0.0, 1.0)
    rgba = np.concatenate((rgb, np.ones((size, size, 1), dtype=np.float32)), axis=2)

    image = bpy.data.images.new(f"{name} texture", width=size, height=size, alpha=True)
    image.pixels.foreach_set(rgba.reshape(-1))
    image.pack()

    material = bpy.data.materials.new(name)
    material.use_nodes = True
    nodes = material.node_tree.nodes
    bsdf = nodes.get("Principled BSDF")
    texture = nodes.new("ShaderNodeTexImage")
    texture.image = image
    material.node_tree.links.new(texture.outputs["Color"], bsdf.inputs["Base Color"])
    principled_input(bsdf, "Metallic IOR Level", "Metallic").default_value = metallic
    bsdf.inputs["Roughness"].default_value = roughness
    return material


def make_material(name, color, metallic, roughness):
    material = bpy.data.materials.new(name)
    material.use_nodes = True
    bsdf = material.node_tree.nodes.get("Principled BSDF")
    bsdf.inputs["Base Color"].default_value = (*color, 1.0)
    principled_input(bsdf, "Metallic IOR Level", "Metallic").default_value = metallic
    bsdf.inputs["Roughness"].default_value = roughness
    return material


def world_bounds(obj):
    points = [obj.matrix_world @ Vector(corner) for corner in obj.bound_box]
    minimum = Vector(tuple(min(point[axis] for point in points) for axis in range(3)))
    maximum = Vector(tuple(max(point[axis] for point in points) for axis in range(3)))
    return minimum, maximum


def apply_modifier(obj, modifier):
    select_only(obj)
    bpy.ops.object.modifier_apply(modifier=modifier.name)


def bevel_box(name, location, dimensions, material, bevel=0.004, rotation=(0.0, 0.0, 0.0)):
    bpy.ops.mesh.primitive_cube_add(location=location)
    obj = bpy.context.object
    obj.name = name
    obj.dimensions = dimensions
    select_only(obj)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    if material:
        obj.data.materials.append(material)
    if bevel > 0:
        modifier = obj.modifiers.new(name="Rolled wreck edge", type="BEVEL")
        modifier.width = min(bevel, min(dimensions) * 0.22)
        modifier.segments = 2
        apply_modifier(obj, modifier)
    obj.rotation_mode = "XYZ"
    obj.rotation_euler = rotation
    return obj


def cut_flight_channel(target, center_y, center_z, half_width, half_height, minimum, maximum):
    margin = 0.08
    bpy.ops.mesh.primitive_cube_add(
        location=((minimum.x + maximum.x) * 0.5, center_y, center_z),
    )
    cutter = bpy.context.object
    cutter.name = "TEMP flyable salvage bay cutter"
    cutter.dimensions = (
        maximum.x - minimum.x + margin * 2,
        half_width * 2 + 0.018,
        half_height * 2 + 0.018,
    )
    select_only(cutter)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)

    modifier = target.modifiers.new(name="Open flyable salvage bay", type="BOOLEAN")
    modifier.operation = "DIFFERENCE"
    modifier.solver = "EXACT"
    modifier.object = cutter
    apply_modifier(target, modifier)
    bpy.data.objects.remove(cutter, do_unlink=True)


def clear_existing_channel_clutter(target, cfg, minimum, maximum):
    """Remove old detached bars that accidentally span the new safe core."""
    safe_min_y = cfg["center_y"] - cfg["half_width"] * 0.62
    safe_max_y = cfg["center_y"] + cfg["half_width"] * 0.62
    safe_min_z = cfg["center_z"] - cfg["half_height"] * 0.62
    safe_max_z = cfg["center_z"] + cfg["half_height"] * 0.62
    removed = []
    for obj in list(bpy.context.scene.objects):
        if obj == target or obj.type != "MESH" or "hot conduit" in obj.name.lower():
            continue
        obj_minimum, obj_maximum = world_bounds(obj)
        overlaps = (
            obj_maximum.x > minimum.x
            and obj_minimum.x < maximum.x
            and obj_maximum.y > safe_min_y
            and obj_minimum.y < safe_max_y
            and obj_maximum.z > safe_min_z
            and obj_minimum.z < safe_max_z
        )
        if overlaps:
            removed.append(obj.name)
            bpy.data.objects.remove(obj, do_unlink=True)
    if removed:
        print(f"REMOVED channel clutter: {', '.join(removed)}")


def add_bay_geometry(kind, cfg, minimum, maximum, materials):
    center_y = cfg["center_y"]
    center_z = cfg["center_z"]
    half_width = cfg["half_width"]
    half_height = cfg["half_height"]
    padding = cfg["end_padding"]
    x0 = minimum.x + padding
    x1 = maximum.x - padding
    length = x1 - x0
    x_mid = (x0 + x1) * 0.5
    liner = 0.012
    shell_margin = 0.018
    outer_min_y = minimum.y - shell_margin
    outer_max_y = maximum.y + shell_margin
    outer_min_z = minimum.z - shell_margin
    outer_max_z = maximum.z + shell_margin
    floor_z = center_z - half_height
    ceiling_z = center_z + half_height
    port_y = center_y - half_width
    starboard_y = center_y + half_width

    # Visible liner surfaces. Their inner faces define the exact free-flight
    # volume; detail sits behind those faces so nothing silently snags a ship.
    bevel_box(f"INTERIOR {kind} deck", (x_mid, center_y, floor_z - liner * 0.5), (length, half_width * 2, liner), materials["steel"])
    bevel_box(f"INTERIOR {kind} overhead", (x_mid, center_y, ceiling_z + liner * 0.5), (length, half_width * 2, liner), materials["steel"])
    bevel_box(f"INTERIOR {kind} port wall", (x_mid, port_y - liner * 0.5, center_z), (length, liner, half_height * 2), materials["steel"])
    bevel_box(f"INTERIOR {kind} starboard wall", (x_mid, starboard_y + liner * 0.5, center_z), (length, liner, half_height * 2), materials["steel"])

    # Four physical diagonal braces turn the broad rectangle into an octagonal
    # naval bay. They sit in otherwise unused corners, remain fully visible,
    # and are included in the generated collision profiles by name.
    chamfer_span = min(half_width, half_height) * 0.52
    for side in (-1, 1):
        for vertical in (-1, 1):
            angle = math.atan2(vertical, side)
            inset = chamfer_span / (2 * math.sqrt(2))
            bevel_box(
                f"STRUCTURE {kind} bay chamfer {'port' if side < 0 else 'starboard'} {'lower' if vertical < 0 else 'upper'}",
                (
                    x_mid,
                    center_y + side * (half_width - inset),
                    center_z + vertical * (half_height - inset),
                ),
                (length, liner * 1.15, chamfer_span),
                materials["rib"],
                bevel=0.003,
                rotation=(angle, 0.0, 0.0),
            )

    # Four simple hidden volumes preserve the mass of the exterior hull while
    # leaving only the lined bay open. Their boundary is the visible liner, so
    # collision and art agree at the place the player can actually touch.
    bottom_depth = max(0.02, floor_z - outer_min_z)
    top_depth = max(0.02, outer_max_z - ceiling_z)
    port_depth = max(0.02, port_y - outer_min_y)
    starboard_depth = max(0.02, outer_max_y - starboard_y)
    bevel_box(
        f"COLLISION {kind} belly floor shell",
        (x_mid, (outer_min_y + outer_max_y) * 0.5, outer_min_z + bottom_depth * 0.5),
        (length, outer_max_y - outer_min_y, bottom_depth),
        materials["collision"],
        bevel=0.0,
    )
    bevel_box(
        f"COLLISION {kind} belly ceiling shell",
        (x_mid, (outer_min_y + outer_max_y) * 0.5, ceiling_z + top_depth * 0.5),
        (length, outer_max_y - outer_min_y, top_depth),
        materials["collision"],
        bevel=0.0,
    )
    bevel_box(
        f"COLLISION {kind} belly port shell",
        (x_mid, outer_min_y + port_depth * 0.5, center_z),
        (length, port_depth, half_height * 2),
        materials["collision"],
        bevel=0.0,
    )
    bevel_box(
        f"COLLISION {kind} belly starboard shell",
        (x_mid, starboard_y + starboard_depth * 0.5, center_z),
        (length, starboard_depth, half_height * 2),
        materials["collision"],
        bevel=0.0,
    )

    # Repeated load-bearing frames make the scale legible from the cockpit.
    # They remain outside the free channel and are visual-only; the liner is
    # the shared touch surface used by collision.
    rib_depth = 0.012
    rib_width = 0.014 if kind != "cruiser" else 0.011
    for index in range(cfg["ribs"]):
        fraction = (index + 0.65) / (cfg["ribs"] + 0.3)
        x = x0 + length * fraction
        prefix = f"DETAIL {kind} bay frame {index + 1}"
        bevel_box(f"{prefix} deck", (x, center_y, floor_z + rib_width * 0.16), (rib_depth, half_width * 2, rib_width), materials["rib"], bevel=0.003)
        bevel_box(f"{prefix} overhead", (x, center_y, ceiling_z - rib_width * 0.16), (rib_depth, half_width * 2, rib_width), materials["rib"], bevel=0.003)
        bevel_box(f"{prefix} port", (x, port_y + rib_width * 0.16, center_z), (rib_depth, rib_width, half_height * 2), materials["rib"], bevel=0.003)
        bevel_box(f"{prefix} starboard", (x, starboard_y - rib_width * 0.16, center_z), (rib_depth, rib_width, half_height * 2), materials["rib"], bevel=0.003)

    # Broken-end bulkheads frame both entrances; faded ochre is paint, never
    # emission. Side recesses mark the salvage pockets without HUD-like lights.
    for end_name, x in (("forward", x0 + 0.004), ("aft", x1 - 0.004)):
        prefix = f"DETAIL {kind} {end_name} broken bulkhead"
        bevel_box(f"{prefix} deck", (x, center_y, floor_z + rib_width * 0.18), (rib_depth * 1.4, half_width * 2 + rib_width, rib_width * 1.5), materials["rib"], bevel=0.003)
        bevel_box(f"{prefix} overhead", (x, center_y, ceiling_z - rib_width * 0.18), (rib_depth * 1.4, half_width * 2 + rib_width, rib_width * 1.5), materials["rib"], bevel=0.003)
        bevel_box(f"{prefix} port", (x, port_y + rib_width * 0.18, center_z), (rib_depth * 1.4, rib_width * 1.5, half_height * 2), materials["rib"], bevel=0.003)
        bevel_box(f"{prefix} starboard", (x, starboard_y - rib_width * 0.18, center_z), (rib_depth * 1.4, rib_width * 1.5, half_height * 2), materials["rib"], bevel=0.003)

    pocket_length = length * 0.16
    pocket_height = max(0.026, half_height * 0.24)
    for side_name, y in (("port", port_y + liner * 0.16), ("starboard", starboard_y - liner * 0.16)):
        for index, fraction in enumerate((0.28, 0.58, 0.78)):
            x = x0 + length * fraction
            bevel_box(
                f"DETAIL {kind} {side_name} salvage pocket {index + 1}",
                (x, y, floor_z + half_height * 0.48),
                (pocket_length, liner * 0.8, pocket_height),
                materials["marking"],
                bevel=0.003,
            )

    # Repeated access plates and paired deck rails break up the long liner at
    # cockpit scale. They are shallow enough to share the shell collision
    # surface rather than becoming dozens of tiny snag points.
    panel_count = 7 if kind != "cruiser" else 6
    panel_length = length / (panel_count + 1.8)
    for index in range(panel_count):
        x = x0 + length * ((index + 1) / (panel_count + 1))
        z = center_z + (0.32 if index % 2 else -0.1) * half_height
        for side_name, y in (("port", port_y + 0.002), ("starboard", starboard_y - 0.002)):
            bevel_box(
                f"DETAIL {kind} {side_name} access panel {index + 1}",
                (x, y, z),
                (panel_length, 0.004, half_height * 0.34),
                materials["panel"],
                bevel=0.002,
            )
    for side, y in (("port", center_y - half_width * 0.32), ("starboard", center_y + half_width * 0.32)):
        bevel_box(
            f"DETAIL {kind} {side} deck rail",
            (x_mid, y, floor_z + 0.003),
            (length * 0.9, 0.008, 0.006),
            materials["marking"],
            bevel=0.002,
        )

    return {
        "center": [round(x_mid, 6), center_y, center_z],
        "halfLength": round(length * 0.5, 6),
        "halfWidth": half_width,
        "halfHeight": half_height,
    }


def validate_channel(target, cfg, minimum, maximum):
    """Fail if the authored hull still crosses the safe core of the bay."""
    bpy.context.view_layer.update()
    origin_x = minimum.x - 0.12
    distance = maximum.x - minimum.x + 0.24
    direction = Vector((1.0, 0.0, 0.0))
    hits = []
    for y_fraction in (-0.55, 0.0, 0.55):
        for z_fraction in (-0.55, 0.0, 0.55):
            origin = Vector((
                origin_x,
                cfg["center_y"] + cfg["half_width"] * y_fraction,
                cfg["center_z"] + cfg["half_height"] * z_fraction,
            ))
            hit, location, _normal, _index, hit_object, _matrix = bpy.context.scene.ray_cast(
                bpy.context.evaluated_depsgraph_get(), origin, direction, distance=distance
            )
            if hit and hit_object == target:
                hits.append(tuple(round(value, 5) for value in location))
    if hits:
        raise RuntimeError(f"{target.name} still blocks the flight channel at {hits[:4]}")


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
        export_jpeg_quality=86,
        export_cameras=False,
        export_lights=False,
        export_animations=False,
    )


def main():
    args = arguments()
    cfg = CONFIGS[args.kind]
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=args.source)
    target = bpy.data.objects.get(cfg["target"])
    if not target or target.type != "MESH":
        raise RuntimeError(f"Missing target mesh: {cfg['target']}")
    minimum, maximum = world_bounds(target)

    materials = {
        "steel": make_textured_material(
            "Wreck bay soot-dark steel",
            4100 + tuple(CONFIGS).index(args.kind),
            (0.018, 0.026, 0.029),
            (0.004, 0.007, 0.008),
            (0.12, 0.036, 0.012),
            0.54,
            0.91,
        ),
        "rib": make_material("Wreck bay cold structural ribs", (0.018, 0.026, 0.028), 0.64, 0.88),
        "panel": make_material("Wreck bay recessed access panels", (0.012, 0.025, 0.034), 0.52, 0.92),
        "marking": make_material("Faded non-emissive salvage ochre", (0.11, 0.065, 0.018), 0.42, 0.94),
        "collision": make_material("Runtime-only wreck collision shell", (0.006, 0.008, 0.009), 0.0, 1.0),
    }

    clear_existing_channel_clutter(target, cfg, minimum, maximum)
    cut_flight_channel(
        target,
        cfg["center_y"],
        cfg["center_z"],
        cfg["half_width"],
        cfg["half_height"],
        minimum,
        maximum,
    )
    validate_channel(target, cfg, minimum, maximum)
    volume = add_bay_geometry(args.kind, cfg, minimum, maximum, materials)
    export_glb(args.output)
    print(
        f"EXPORTED {args.kind} flyable wreck bay: {cfg['target']} -> {args.output}; "
        f"volume={volume}"
    )


if __name__ == "__main__":
    main()
