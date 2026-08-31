"""Build small textured fighter wrecks from the shipped player-ship GLBs.

Run from the repository root with Blender:

    blender --background --python scripts/prepare_fighter_wreck.py -- \
      --source assets/models/ships/wayfarer.glb \
      --output assets/models/wrecks/wayfarer-wreck.glb \
      --kind wayfarer

The original UVs and painted material remain on every surviving hull face.
Only the torn caps use a dark, non-emissive material.
"""

import argparse
import math
import os
import sys

import bmesh
import bpy
from mathutils import Vector


FIGHTER_KINDS = ("wayfarer", "talon")


def arguments():
    raw = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    parser = argparse.ArgumentParser()
    parser.add_argument("--source", required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument("--kind", choices=FIGHTER_KINDS, required=True)
    return parser.parse_args(raw)


def select_only(obj):
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj


def join_source_meshes():
    meshes = [obj for obj in bpy.context.scene.objects if obj.type == "MESH"]
    if not meshes:
        raise RuntimeError("The source GLB contains no mesh")
    bpy.ops.object.select_all(action="DESELECT")
    for obj in meshes:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = meshes[0]
    bpy.ops.object.convert(target="MESH")
    if len(meshes) > 1:
        bpy.ops.object.join()
    obj = bpy.context.object
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
    corners = [obj.matrix_world @ Vector(corner) for corner in obj.bound_box]
    minimum = Vector(tuple(min(point[axis] for point in corners) for axis in range(3)))
    maximum = Vector(tuple(max(point[axis] for point in corners) for axis in range(3)))
    obj.location -= (minimum + maximum) * 0.5
    select_only(obj)
    bpy.ops.object.transform_apply(location=True, rotation=False, scale=False)
    return obj


def make_cut_material():
    material = bpy.data.materials.new("Cold torn fighter hull")
    material.use_nodes = True
    bsdf = material.node_tree.nodes.get("Principled BSDF")
    bsdf.inputs["Base Color"].default_value = (0.012, 0.018, 0.022, 1.0)
    (bsdf.inputs.get("Metallic IOR Level") or bsdf.inputs.get("Metallic")).default_value = 0.52
    bsdf.inputs["Roughness"].default_value = 0.92
    emission = bsdf.inputs.get("Emission Color") or bsdf.inputs.get("Emission")
    if emission:
        emission.default_value = (0.0, 0.0, 0.0, 1.0)
    if bsdf.inputs.get("Emission Strength"):
        bsdf.inputs["Emission Strength"].default_value = 0.0
    return material


def tear_offset(y, z, amplitude, phase):
    return amplitude * (
        0.52 * math.sin(y * 21.7 + phase)
        + 0.29 * math.sin(z * 31.1 - phase * 0.63)
        + 0.19 * math.sin((y + z * 0.71) * 47.3 + phase * 1.17)
    )


def cap_cut(bm, x, keep_positive, material_index, tear):
    amplitude, phase = tear
    for vertex in bm.verts:
        vertex.co.x -= tear_offset(vertex.co.y, vertex.co.z, amplitude, phase)
    result = bmesh.ops.bisect_plane(
        bm,
        geom=list(bm.verts) + list(bm.edges) + list(bm.faces),
        plane_co=(x, 0.0, 0.0),
        plane_no=(1.0, 0.0, 0.0),
        clear_inner=keep_positive,
        clear_outer=not keep_positive,
    )
    edges = [entry for entry in result.get("geom_cut", []) if isinstance(entry, bmesh.types.BMEdge) and entry.is_valid]
    if edges:
        filled = bmesh.ops.holes_fill(bm, edges=edges, sides=0)
        faces = [face for face in filled.get("faces", []) if face.is_valid]
        for face in faces:
            face.material_index = material_index
        result = bmesh.ops.triangulate(bm, faces=faces, quad_method="BEAUTY", ngon_method="BEAUTY")
        for face in result.get("faces", []):
            if face.is_valid:
                face.material_index = material_index
    for vertex in bm.verts:
        vertex.co.x += tear_offset(vertex.co.y, vertex.co.z, amplitude, phase)


def chunk(base, name, lower, upper, cut_material, rotation, translation, lower_tear=None, upper_tear=None):
    obj = base.copy()
    obj.data = base.data.copy()
    obj.name = name
    bpy.context.collection.objects.link(obj)
    if cut_material.name not in obj.data.materials:
        obj.data.materials.append(cut_material)
    cut_index = list(obj.data.materials).index(cut_material)
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    if lower is not None:
        cap_cut(bm, lower, True, cut_index, lower_tear)
    if upper is not None:
        cap_cut(bm, upper, False, cut_index, upper_tear)
    bmesh.ops.remove_doubles(bm, verts=list(bm.verts), dist=0.00001)
    bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))
    bm.to_mesh(obj.data)
    bm.free()
    obj.data.update()
    select_only(obj)
    bpy.ops.object.origin_set(type="ORIGIN_GEOMETRY", center="BOUNDS")
    obj.rotation_mode = "XYZ"
    obj.rotation_euler = rotation
    obj.location += Vector(translation)
    return obj


def build_wreck(base, kind, cut_material):
    # Both source fighters point along X. Three uneven, independently angled
    # sections preserve the recognizable textured silhouette without leaving
    # an intact ship parked in the debris field.
    if kind == "wayfarer":
        seam_a, seam_b = (-0.31, (0.034, 0.57)), (0.28, (0.038, 1.83))
        specs = (
            ("Wayfarer wreck drive", None, seam_a[0], (0.18, -0.13, -0.28), (-0.28, 0.18, -0.12), None, seam_a[1]),
            ("Wayfarer wreck cabin", seam_a[0], seam_b[0], (-0.10, 0.12, 0.16), (0.0, -0.10, 0.10), seam_a[1], seam_b[1]),
            ("Wayfarer wreck prow", seam_b[0], None, (0.16, 0.09, 0.31), (0.30, 0.12, 0.18), seam_b[1], None),
        )
    else:
        seam_a, seam_b = (-0.24, (0.032, 0.41)), (0.26, (0.036, 2.09))
        specs = (
            ("Talon wreck engine", None, seam_a[0], (-0.20, 0.15, 0.25), (-0.24, -0.16, 0.16), None, seam_a[1]),
            ("Talon wreck wing core", seam_a[0], seam_b[0], (0.12, -0.10, -0.16), (0.0, 0.14, -0.10), seam_a[1], seam_b[1]),
            ("Talon wreck nose", seam_b[0], None, (-0.13, -0.08, -0.30), (0.27, -0.12, -0.18), seam_b[1], None),
        )
    for name, lower, upper, rotation, translation, lower_tear, upper_tear in specs:
        chunk(base, name, lower, upper, cut_material, rotation, translation, lower_tear, upper_tear)
    bpy.data.objects.remove(base, do_unlink=True)


def disable_emission():
    for material in bpy.data.materials:
        if not material.use_nodes:
            continue
        bsdf = material.node_tree.nodes.get("Principled BSDF")
        if not bsdf:
            continue
        emission = bsdf.inputs.get("Emission Color") or bsdf.inputs.get("Emission")
        if emission:
            emission.default_value = (0.0, 0.0, 0.0, 1.0)
        if bsdf.inputs.get("Emission Strength"):
            bsdf.inputs["Emission Strength"].default_value = 0.0
        bsdf.inputs["Roughness"].default_value = max(0.82, bsdf.inputs["Roughness"].default_value)


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
        export_jpeg_quality=88,
        export_cameras=False,
        export_lights=False,
        export_animations=False,
    )


def main():
    args = arguments()
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=args.source)
    hull = join_source_meshes()
    cut = make_cut_material()
    disable_emission()
    build_wreck(hull, args.kind, cut)
    export_glb(args.output)
    triangles = sum(sum(max(0, len(face.vertices) - 2) for face in obj.data.polygons) for obj in bpy.context.scene.objects if obj.type == "MESH")
    print(f"EXPORTED {args.kind} wreck: {triangles} triangles; {args.output}")


if __name__ == "__main__":
    main()
