import bpy
import os
import sys


def get_output_path():
    if "--" not in sys.argv:
        raise RuntimeError("Usage: blender --background <input.blend> --python script.py -- <output.blend>")
    arguments = sys.argv[sys.argv.index("--") + 1:]
    if len(arguments) != 1:
        raise RuntimeError("Exactly one output .blend path is required.")
    return os.path.abspath(arguments[0])


def find_diffuse_image(material):
    if not material.use_nodes or not material.node_tree:
        return None
    for node in material.node_tree.nodes:
        if node.type == "TEX_IMAGE" and node.image and "diffuse" in node.image.name.lower():
            return node.image
    return None


materials = set()
for obj in bpy.data.objects:
    if "hochbeet" not in obj.name.lower():
        continue
    for slot in obj.material_slots:
        if slot.material:
            materials.add(slot.material)

if len(materials) < 2:
    raise RuntimeError("No complete planter material set was found.")

for material in materials:
    diffuse_image = find_diffuse_image(material)
    if diffuse_image is None:
        raise RuntimeError("No diffuse texture found for material '{}'".format(material.name))

    material.use_nodes = True
    material.diffuse_color = (1.0, 1.0, 1.0, 1.0)
    nodes = material.node_tree.nodes
    nodes.clear()

    output = nodes.new("ShaderNodeOutputMaterial")
    output.location = (420, 0)
    shader = nodes.new("ShaderNodeBsdfPrincipled")
    shader.location = (120, 0)
    shader.inputs["Metallic"].default_value = 0.0
    shader.inputs["Roughness"].default_value = 0.78 if material.name.lower().startswith("vaso_a2") else 0.9
    texture = nodes.new("ShaderNodeTexImage")
    texture.location = (-260, 0)
    texture.image = diffuse_image

    material.node_tree.links.new(texture.outputs["Color"], shader.inputs["Base Color"])
    material.node_tree.links.new(shader.outputs["BSDF"], output.inputs["Surface"])

output_path = get_output_path()
bpy.ops.wm.save_as_mainfile(filepath=output_path)
print("Repaired {} planter materials in '{}'".format(len(materials), output_path))
