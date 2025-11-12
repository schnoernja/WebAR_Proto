from pathlib import Path
from pygltflib import GLTF2

glb = Path(r"d:\EPARtwin_Projekt\Website\WebAR_Proto\models\Erfurt_FH_Umkreis_Haus11Markiert.glb")
g = GLTF2().load(glb)

print("Nodes:")
for i, node in enumerate(g.nodes or []):
    name = node.name or f"node_{i}"
    mesh_idx = node.mesh
    mesh_name = ""
    if mesh_idx is not None and g.meshes and mesh_idx < len(g.meshes):
        mesh_name = g.meshes[mesh_idx].name or f"mesh_{mesh_idx}"
    print(f"[{i}] name='{name}' mesh={mesh_idx} mesh_name='{mesh_name}'")