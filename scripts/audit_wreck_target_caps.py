"""Print concise material and end-cap statistics for one wreck target mesh."""

import argparse
import collections
import sys

import bpy
from mathutils import Vector


def arguments():
    raw = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    parser = argparse.ArgumentParser()
    parser.add_argument("--source", required=True)
    parser.add_argument("--target", required=True)
    return parser.parse_args(raw)


def main():
    args = arguments()
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=args.source)
    obj = bpy.data.objects.get(args.target)
    if not obj or obj.type != "MESH":
        raise RuntimeError(f"Missing target mesh: {args.target}")
    minimum_x = min((obj.matrix_world @ Vector(corner)).x for corner in obj.bound_box)
    maximum_x = max((obj.matrix_world @ Vector(corner)).x for corner in obj.bound_box)
    span = maximum_x - minimum_x
    stats = collections.defaultdict(lambda: {"faces": 0, "front": 0, "rear": 0, "x": []})
    for polygon in obj.data.polygons:
        name = obj.data.materials[polygon.material_index].name if polygon.material_index < len(obj.data.materials) else "<none>"
        center_x = (obj.matrix_world @ polygon.center).x
        entry = stats[name]
        entry["faces"] += 1
        entry["x"].append(center_x)
        if center_x <= minimum_x + span * 0.08:
            entry["front"] += 1
        if center_x >= maximum_x - span * 0.08:
            entry["rear"] += 1
    print(f"TARGET {obj.name} x=[{minimum_x:.6f}, {maximum_x:.6f}] faces={len(obj.data.polygons)}")
    for name, entry in sorted(stats.items()):
        print(
            f"MATERIAL {name!r}: faces={entry['faces']} front8%={entry['front']} "
            f"rear8%={entry['rear']} centerX=[{min(entry['x']):.6f}, {max(entry['x']):.6f}]"
        )
    axial_groups = collections.Counter()
    for polygon in obj.data.polygons:
        if abs(polygon.normal.x) >= 0.72:
            axial_groups[round(polygon.center.x, 4)] += 1
    print("LOCAL axial face groups:")
    for center_x, count in axial_groups.most_common(16):
        print(f"  x={center_x:.4f}: {count} faces")


if __name__ == "__main__":
    main()
