import sys, json
from pathlib import Path
from pygltflib import GLTF2

glb_path = Path(sys.argv[1]) if len(sys.argv) > 1 else Path(__file__).resolve().parents[1] / "source-assets" / "models" / "Erfurt_FH_Umkreis_Haus11Markiert.glb"
g = GLTF2().load(glb_path)

nodes = []
for i, node in enumerate(g.nodes or []):
    name = node.name or f"node_{i}"
    mesh_idx = node.mesh
    mesh_name = None
    if mesh_idx is not None and g.meshes and mesh_idx < len(g.meshes):
        mesh = g.meshes[mesh_idx]
        mesh_name = mesh.name
    nodes.append({"index": i, "node_name": name, "mesh_index": mesh_idx, "mesh_name": mesh_name})

out = glb_path.with_suffix(".nodes.json")
out.write_text(json.dumps(nodes, indent=2, ensure_ascii=False), encoding="utf-8")
print("Wrote", out)
