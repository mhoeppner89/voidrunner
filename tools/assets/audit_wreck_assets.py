"""Print compact geometry/topology data for one shipped wreck GLB."""

import argparse
import json
import sys

import bmesh
import bpy
from mathutils import Vector


def arguments():
    raw = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    parser = argparse.ArgumentParser()
    parser.add_argument("--source", required=True)
    parser.add_argument("--match", default="")
    return parser.parse_args(raw)


def rounded(values):
    return [round(float(value), 5) for value in values]


def main():
    args = arguments()
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=args.source)
    bpy.context.view_layer.update()
    report = []
    for obj in sorted((entry for entry in bpy.context.scene.objects if entry.type == "MESH" and args.match.lower() in entry.name.lower()), key=lambda entry: entry.name):
        mesh = obj.data
        bm = bmesh.new()
        bm.from_mesh(mesh)
        boundary_edges = sum(1 for edge in bm.edges if edge.is_boundary)
        bm.free()
        world_corners = [obj.matrix_world @ Vector(obj.bound_box[index]) for index in range(8)]
        minimum = [min(point[axis] for point in world_corners) for axis in range(3)]
        maximum = [max(point[axis] for point in world_corners) for axis in range(3)]
        material_faces = {}
        normal_matrix = obj.matrix_world.to_3x3().inverted().transposed()
        for material_index, material in enumerate(mesh.materials):
            faces = [face for face in mesh.polygons if face.material_index == material_index]
            if not faces:
                continue
            centers = [obj.matrix_world @ face.center for face in faces]
            x_facing = [face for face in faces if abs((normal_matrix @ face.normal).normalized().x) > 0.35]
            material_faces[material.name if material else f"slot-{material_index}"] = {
                "count": len(faces),
                "centerMin": rounded([min(point[axis] for point in centers) for axis in range(3)]),
                "centerMax": rounded([max(point[axis] for point in centers) for axis in range(3)]),
                "xFacing": len(x_facing),
            }
        report.append({
            "name": obj.name,
            "vertices": len(mesh.vertices),
            "triangles": sum(max(0, len(face.vertices) - 2) for face in mesh.polygons),
            "boundaryEdges": boundary_edges,
            "worldMin": rounded(minimum),
            "worldMax": rounded(maximum),
            "location": rounded(obj.location),
            "rotation": rounded(obj.rotation_euler),
            "scale": rounded(obj.scale),
            "materials": [material.name if material else None for material in mesh.materials],
            "materialFaces": material_faces,
        })
    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()
