"""Render six neutral QA views of one shipped wreck GLB.

The images are deliberately lit for topology inspection rather than mood. They
make torn openings, detached additions, and silhouette mismatches easy to spot.
"""

import argparse
import os
import sys
from pathlib import Path

import bpy
from mathutils import Vector


def arguments():
    raw = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    parser = argparse.ArgumentParser()
    parser.add_argument("--source", required=True)
    parser.add_argument("--output-dir", required=True)
    parser.add_argument("--prefix", required=True)
    parser.add_argument("--hide-added", action="store_true")
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


def visible_meshes(hide_added):
    generated_prefixes = ("INTERIOR ", "DETAIL ", "STRUCTURE ")
    meshes = []
    for obj in bpy.context.scene.objects:
        if obj.type != "MESH":
            continue
        hidden = obj.name.startswith("COLLISION ") or "hot conduit" in obj.name.lower()
        hidden = hidden or (hide_added and obj.name.startswith(generated_prefixes))
        obj.hide_render = hidden
        if not hidden:
            meshes.append(obj)
    return meshes


def scene_bounds(meshes):
    points = [obj.matrix_world @ Vector(corner) for obj in meshes for corner in obj.bound_box]
    minimum = Vector(tuple(min(point[axis] for point in points) for axis in range(3)))
    maximum = Vector(tuple(max(point[axis] for point in points) for axis in range(3)))
    return minimum, maximum


def main():
    args = arguments()
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=args.source)
    meshes = visible_meshes(args.hide_added)
    if not meshes:
        raise RuntimeError("No visible meshes in source")

    minimum, maximum = scene_bounds(meshes)
    center = (minimum + maximum) * 0.5
    radius = max((maximum - minimum).length * 0.55, 0.5)

    camera_data = bpy.data.cameras.new("Wreck audit camera")
    camera = bpy.data.objects.new("Wreck audit camera", camera_data)
    bpy.context.collection.objects.link(camera)
    bpy.context.scene.camera = camera
    camera_data.lens = 58
    camera_data.clip_start = max(0.001, radius / 2000)
    camera_data.clip_end = radius * 20

    add_area("Cold key", center + Vector((-1.6, -1.1, 1.7)) * radius, 140, radius * 2.2, (0.58, 0.73, 1.0), center)
    add_area("Warm rim", center + Vector((1.5, 0.8, 0.5)) * radius, 105, radius * 1.7, (1.0, 0.48, 0.25), center)
    add_area("Top fill", center + Vector((0.0, 0.2, 2.1)) * radius, 85, radius * 2.4, (0.55, 0.67, 0.74), center)

    world = bpy.data.worlds.new("Wreck audit void")
    bpy.context.scene.world = world
    world.use_nodes = True
    background = world.node_tree.nodes.get("Background")
    background.inputs["Color"].default_value = (0.0015, 0.003, 0.007, 1.0)
    background.inputs["Strength"].default_value = 0.05

    scene = bpy.context.scene
    scene.render.engine = "BLENDER_EEVEE"
    scene.render.resolution_x = 1024
    scene.render.resolution_y = 768
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.view_settings.look = "AgX - Medium High Contrast"
    os.makedirs(args.output_dir, exist_ok=True)

    views = {
        "front": Vector((-1.0, -0.05, 0.16)),
        "rear": Vector((1.0, 0.05, 0.16)),
        "port": Vector((0.08, -1.0, 0.18)),
        "starboard": Vector((-0.08, 1.0, 0.18)),
        "top": Vector((-0.08, -0.12, 1.0)),
        "bottom": Vector((0.08, 0.12, -1.0)),
    }
    for name, direction in views.items():
        camera.location = center + direction.normalized() * radius * 2.15
        look_at(camera, center)
        output = Path(args.output_dir) / f"{args.prefix}-{name}.png"
        scene.render.filepath = str(output)
        bpy.ops.render.render(write_still=True)
        print(output)


if __name__ == "__main__":
    main()
