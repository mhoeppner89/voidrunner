"""Render a quick entrance or interior QA frame for one wreck-bay GLB."""

import argparse
import math
import os
import sys

import bpy
from mathutils import Vector


TARGETS = {
    "carrier": ("Carrier wreck flight deck", Vector((0.087386, 0.07, 0.015)), 0.205, 0.145),
    "battleship": ("Battleship wreck midsection", Vector((0.072063, -0.05, 0.065)), 0.19, 0.14),
    "cruiser": ("Cruiser wreck command hull", Vector((0.033398, -0.04, 0.19)), 0.13, 0.12),
}


def arguments():
    raw = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    parser = argparse.ArgumentParser()
    parser.add_argument("--kind", choices=tuple(TARGETS), required=True)
    parser.add_argument("--source", required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument("--view", choices=("entrance", "inside"), default="entrance")
    parser.add_argument(
        "--hide-added",
        action="store_true",
        help="Hide generated liner/detail/structure meshes to inspect the cut source hull by itself.",
    )
    return parser.parse_args(raw)


def look_at(obj, target):
    obj.rotation_euler = (target - obj.location).to_track_quat("-Z", "Y").to_euler()


def add_area(name, location, energy, size, color, target):
    data = bpy.data.lights.new(name, type="AREA")
    data.energy = energy
    data.shape = "DISK"
    data.size = size
    data.color = color
    obj = bpy.data.objects.new(name, data)
    bpy.context.collection.objects.link(obj)
    obj.location = location
    look_at(obj, target)


def main():
    args = arguments()
    target_name, center, half_width, half_height = TARGETS[args.kind]
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=args.source)
    target = bpy.data.objects.get(target_name)
    if not target:
        raise RuntimeError(f"Missing target {target_name}")
    generated_prefixes = ("INTERIOR ", "DETAIL ", "STRUCTURE ")
    for obj in bpy.context.scene.objects:
        if obj.name.startswith("COLLISION ") or "hot conduit" in obj.name.lower():
            obj.hide_render = True
        elif args.hide_added and obj.name.startswith(generated_prefixes):
            obj.hide_render = True

    bounds = [target.matrix_world @ Vector(corner) for corner in target.bound_box]
    minimum_x = min(point.x for point in bounds)
    maximum_x = max(point.x for point in bounds)

    camera_data = bpy.data.cameras.new("Wreck preview camera")
    camera = bpy.data.objects.new("Wreck preview camera", camera_data)
    bpy.context.collection.objects.link(camera)
    bpy.context.scene.camera = camera
    camera_data.lens = 30 if args.view == "entrance" else 24
    camera_data.clip_start = 0.002
    camera_data.clip_end = 20
    if args.view == "entrance":
        camera.location = Vector((minimum_x - 0.34, center.y - half_width * 0.48, center.z + half_height * 0.38))
        look_at(camera, Vector((center.x + 0.08, center.y, center.z)))
    else:
        camera.location = Vector((center.x - 0.12, center.y, center.z + half_height * 0.08))
        look_at(camera, Vector((maximum_x - 0.04, center.y, center.z - half_height * 0.12)))

    add_area("Cold key", Vector((minimum_x - 0.1, center.y - 0.5, center.z + 0.55)), 85, 2.2, (0.55, 0.68, 1.0), center)
    add_area("Warm wreck bounce", Vector((center.x + 0.3, center.y + 0.45, center.z - 0.25)), 55, 1.3, (1.0, 0.48, 0.22), center)
    add_area("Bay fill", Vector((center.x, center.y, center.z + 0.03)), 24, 0.7, (0.38, 0.55, 0.62), Vector((maximum_x, center.y, center.z)))

    world = bpy.data.worlds.new("Void preview")
    bpy.context.scene.world = world
    world.use_nodes = True
    background = world.node_tree.nodes.get("Background")
    background.inputs["Color"].default_value = (0.002, 0.004, 0.009, 1.0)
    background.inputs["Strength"].default_value = 0.08

    scene = bpy.context.scene
    scene.render.engine = "BLENDER_EEVEE"
    scene.render.resolution_x = 960
    scene.render.resolution_y = 540
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.render.filepath = args.output
    scene.render.film_transparent = False
    scene.render.image_settings.color_mode = "RGBA"
    scene.view_settings.look = "AgX - Medium High Contrast"
    os.makedirs(os.path.dirname(args.output), exist_ok=True)
    bpy.ops.render.render(write_still=True)
    print(args.output)


if __name__ == "__main__":
    main()
