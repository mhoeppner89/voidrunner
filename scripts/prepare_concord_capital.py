"""Prepare authored Concord capital hulls and damaged wreck variants for WebGL.

Run with Blender, for example:
  blender --background --python scripts/prepare_concord_capital.py -- \
    --source source.glb --output output.glb --kind carrier --target-tris 180000
"""

import argparse
import math
import os
import sys

import bmesh
import bpy
import numpy as np
from mathutils import Vector


CAPITAL_KINDS = ("carrier", "cruiser")


def arguments():
    raw = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    parser = argparse.ArgumentParser()
    parser.add_argument("--source", required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument("--kind", choices=CAPITAL_KINDS, required=True)
    parser.add_argument("--target-tris", type=int, required=True)
    parser.add_argument("--texture-size", type=int, default=2048)
    parser.add_argument("--wreck", action="store_true")
    return parser.parse_args(raw)


def select_only(obj):
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj


def triangle_count(obj):
    return sum(max(0, len(face.vertices) - 2) for face in obj.data.polygons)


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
    return obj


def normalize_hull(obj, kind):
    # Runtime capital hulls all use +X as aft. The carrier source is authored
    # along +Y with its engines at that end, so rotate it into the shared frame.
    if kind == "carrier":
        obj.rotation_mode = "XYZ"
        obj.rotation_euler.z = -math.pi / 2
        select_only(obj)
        bpy.ops.object.transform_apply(location=False, rotation=True, scale=False)

    corners = [obj.matrix_world @ Vector(corner) for corner in obj.bound_box]
    minimum = Vector(tuple(min(point[axis] for point in corners) for axis in range(3)))
    maximum = Vector(tuple(max(point[axis] for point in corners) for axis in range(3)))
    center = (minimum + maximum) * 0.5
    obj.location -= center
    select_only(obj)
    bpy.ops.object.transform_apply(location=True, rotation=False, scale=False)

    size = maximum - minimum
    uniform = 2.0 / max(size)
    obj.scale = (uniform, uniform, uniform)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)


def reduce_geometry(obj, target_tris):
    before = triangle_count(obj)
    if before <= target_tris:
        return before, before
    modifier = obj.modifiers.new(name="WebGL geometry reduction", type="DECIMATE")
    modifier.decimate_type = "COLLAPSE"
    modifier.ratio = max(0.05, min(1.0, target_tris / before))
    modifier.use_collapse_triangulate = True
    select_only(obj)
    bpy.ops.object.modifier_apply(modifier=modifier.name)
    return before, triangle_count(obj)


def principled_input(bsdf, modern, legacy):
    return bsdf.inputs.get(modern) or bsdf.inputs.get(legacy)


def tune_source_materials(wreck):
    for mat in bpy.data.materials:
        if not mat.use_nodes:
            continue
        bsdf = mat.node_tree.nodes.get("Principled BSDF")
        if not bsdf:
            continue
        principled_input(bsdf, "Metallic IOR Level", "Metallic").default_value = 0.62 if not wreck else 0.48
        bsdf.inputs["Roughness"].default_value = 0.48 if not wreck else 0.82


def resize_images(maximum):
    for image in bpy.data.images:
        width, height = image.size[:2]
        if width <= 0 or height <= 0 or max(width, height) <= maximum:
            continue
        ratio = maximum / max(width, height)
        image.scale(max(1, round(width * ratio)), max(1, round(height * ratio)))


def age_wreck_textures():
    # Keep the recognizable blue/white Concord paint while cooling highlights
    # and lowering saturation enough to separate a dead hull from live traffic.
    ash = np.array((0.27, 0.31, 0.34), dtype=np.float32)
    for image in bpy.data.images:
        width, height = image.size[:2]
        if width <= 0 or height <= 0:
            continue
        pixels = np.empty(width * height * 4, dtype=np.float32)
        image.pixels.foreach_get(pixels)
        rgba = pixels.reshape((-1, 4))
        rgb = rgba[:, :3]
        luminance = (rgb[:, 0] * 0.2126 + rgb[:, 1] * 0.7152 + rgb[:, 2] * 0.0722)[:, None]
        colored = rgb * 0.58 + luminance * 0.42
        rgba[:, :3] = np.clip(colored * 0.72 + ash * 0.16, 0.0, 1.0)
        image.pixels.foreach_set(pixels)
        image.update()


def make_material(name, base, metallic, roughness, emission=None, strength=0.0):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get("Principled BSDF")
    bsdf.inputs["Base Color"].default_value = (*base, 1.0)
    principled_input(bsdf, "Metallic IOR Level", "Metallic").default_value = metallic
    bsdf.inputs["Roughness"].default_value = roughness
    if emission:
        principled_input(bsdf, "Emission Color", "Emission").default_value = (*emission, 1.0)
        if bsdf.inputs.get("Emission Strength"):
            bsdf.inputs["Emission Strength"].default_value = strength
    return mat


def tear_offset(y, z, amplitude, phase):
    return amplitude * (
        0.46 * math.sin(y * 18.7 + phase)
        + 0.32 * math.sin(z * 27.3 - phase * 0.71)
        + 0.22 * math.sin((y - z * 0.77) * 43.1 + phase * 1.29)
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
        triangulated = bmesh.ops.triangulate(bm, faces=faces, quad_method="BEAUTY", ngon_method="BEAUTY")
        for face in triangulated.get("faces", []):
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


def open_top_breach(obj, center_x, center_y, radius_x, radius_y):
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    doomed = []
    for face in bm.faces:
        center = face.calc_center_median()
        ellipse = ((center.x - center_x) / radius_x) ** 2 + ((center.y - center_y) / radius_y) ** 2
        if center.z > 0.04 and ellipse < 1.0 and face.normal.z > 0.18:
            doomed.append(face)
    if doomed:
        bmesh.ops.delete(bm, geom=doomed, context="FACES")
    bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))
    bm.to_mesh(obj.data)
    bm.free()
    obj.data.update()


def beam(name, a, b, radius, mat):
    start, end = Vector(a), Vector(b)
    delta = end - start
    bpy.ops.mesh.primitive_cylinder_add(vertices=8, radius=radius, depth=delta.length, location=(start + end) * 0.5)
    obj = bpy.context.object
    obj.name = name
    obj.rotation_mode = "QUATERNION"
    obj.rotation_quaternion = Vector((0.0, 0.0, 1.0)).rotation_difference(delta.normalized())
    obj.data.materials.append(mat)


def armor_shard(name, location, scale, rotation, mat):
    # A thick, irregular five-sided plate catches light like torn armor. Flat
    # quads looked like placeholder cards beside the detailed authored hull.
    outline = [(-1.0, -0.42), (-0.38, -0.95), (0.86, -0.68), (1.0, 0.34), (0.12, 0.92), (-0.82, 0.58)]
    verts = [(x, y, -0.16) for x, y in outline] + [(x * 0.92, y * 0.92, 0.16) for x, y in outline]
    count = len(outline)
    faces = [tuple(range(count - 1, -1, -1)), tuple(range(count, count * 2))]
    faces.extend((index, (index + 1) % count, (index + 1) % count + count, index + count) for index in range(count))
    mesh = bpy.data.meshes.new(f"{name} mesh")
    mesh.from_pydata(verts, [], faces)
    mesh.materials.append(mat)
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    obj.location = location
    obj.scale = scale
    obj.rotation_mode = "XYZ"
    obj.rotation_euler = rotation
    bevel = obj.modifiers.new(name="Torn rolled edge", type="BEVEL")
    bevel.width = 0.08
    bevel.segments = 1


def build_carrier_wreck(base, cut):
    open_top_breach(base, -0.03, 0.12, 0.34, 0.24)
    seam_a, seam_b = (0.045, 0.62), (0.055, 2.17)
    parts = [
        chunk(base, "Carrier wreck bow", None, -0.36, cut, (0.025, -0.035, -0.10), (-0.12, -0.05, -0.08), upper_tear=seam_a),
        chunk(base, "Carrier wreck flight deck", -0.25, 0.37, cut, (-0.045, 0.04, 0.075), (0.02, 0.07, 0.04), lower_tear=seam_a, upper_tear=seam_b),
        chunk(base, "Carrier wreck engine block", 0.48, None, cut, (0.09, 0.07, -0.14), (0.17, -0.09, -0.10), lower_tear=seam_b),
    ]
    for index, (a, b) in enumerate((
        ((-0.27, -0.28, 0.04), (0.22, -0.25, 0.15)),
        ((-0.24, 0.04, 0.05), (0.20, 0.09, 0.17)),
        ((-0.18, 0.27, 0.03), (0.16, 0.30, 0.14)),
        ((-0.22, -0.24, 0.10), (-0.18, 0.28, 0.13)),
        ((0.04, -0.26, 0.14), (0.08, 0.29, 0.16)),
        ((0.31, -0.37, -0.15), (0.52, -0.42, -0.24)),
    )):
        beam(f"Carrier exposed frame {index + 1}", a, b, 0.009 if index < 5 else 0.014, cut)
    return parts


def build_cruiser_wreck(base, cut):
    open_top_breach(base, -0.02, 0.0, 0.23, 0.18)
    seam_a, seam_b = (0.04, 0.41), (0.045, 1.86)
    parts = [
        chunk(base, "Cruiser wreck prow", None, -0.46, cut, (-0.04, 0.03, 0.12), (-0.15, 0.03, -0.05), upper_tear=seam_a),
        chunk(base, "Cruiser wreck command hull", -0.36, 0.36, cut, (0.06, -0.035, -0.07), (0.03, -0.055, 0.07), lower_tear=seam_a, upper_tear=seam_b),
        chunk(base, "Cruiser wreck engine cluster", 0.47, None, cut, (-0.09, 0.08, 0.16), (0.16, 0.06, -0.08), lower_tear=seam_b),
    ]
    for index, (a, b) in enumerate((
        ((-0.34, -0.16, 0.04), (-0.16, -0.22, 0.19)),
        ((-0.30, 0.18, -0.02), (-0.12, 0.25, 0.13)),
        ((-0.18, -0.14, 0.15), (0.15, -0.11, 0.20)),
        ((-0.16, 0.13, 0.14), (0.17, 0.10, 0.18)),
        ((0.30, -0.21, 0.03), (0.52, -0.27, -0.10)),
    )):
        beam(f"Cruiser torn longeron {index + 1}", a, b, 0.008 if index < 4 else 0.011, cut)
    return parts


def add_wreck_shards(kind, mat):
    spread = 0.42 if kind == "carrier" else 0.34
    specs = (
        ((-0.18, 0.58, 0.29), (0.09, 0.16, 0.035), (0.2, -0.4, 0.55)),
        ((0.28, -0.55, -0.34), (0.08, 0.12, 0.045), (-0.5, 0.18, -0.3)),
        ((0.64, 0.37, 0.18), (0.055, 0.15, 0.03), (0.45, 0.7, -0.45)),
        ((-0.58, -0.34, -0.25), (0.07, 0.11, 0.04), (-0.25, -0.58, 0.32)),
        ((0.12, 0.72, -0.12), (0.045, 0.09, 0.025), (0.7, 0.2, 0.64)),
        ((-0.44, -0.69, 0.14), (0.05, 0.13, 0.03), (-0.55, 0.48, -0.12)),
    )
    for index, (location, scale, rotation) in enumerate(specs):
        armor_shard(
            f"{kind.title()} detached armor {index + 1}",
            tuple(value * spread for value in location),
            tuple(value * spread for value in scale),
            rotation,
            mat,
        )


def make_wreck(base, kind):
    cut = make_material("Charred torn hull", (0.012, 0.02, 0.027), 0.68, 0.9)
    armor = make_material("Detached Concord armor", (0.035, 0.075, 0.11), 0.72, 0.78)
    base.hide_render = True
    base.hide_set(True)
    if kind == "carrier":
        build_carrier_wreck(base, cut)
    else:
        build_cruiser_wreck(base, cut)
    add_wreck_shards(kind, armor)
    bpy.data.objects.remove(base, do_unlink=True)


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
        export_jpeg_quality=84,
        export_cameras=False,
        export_lights=False,
        export_animations=False,
    )


def main():
    args = arguments()
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=args.source)
    hull = join_source_meshes()
    normalize_hull(hull, args.kind)
    before, after = reduce_geometry(hull, args.target_tris)
    tune_source_materials(args.wreck)
    resize_images(args.texture_size)
    if args.wreck:
        age_wreck_textures()
        make_wreck(hull, args.kind)
    else:
        hull.name = f"Concord {args.kind}"
    export_glb(args.output)
    state = "wreck" if args.wreck else "intact"
    print(f"EXPORTED {args.kind} {state}: {before} -> {after} source triangles; {args.output}")


if __name__ == "__main__":
    main()
