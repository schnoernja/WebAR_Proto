import json, re, math, argparse
from pathlib import Path

def parse_keep(keep_file: Path):
    txt = keep_file.read_text(encoding='utf-8')
    names = set(re.findall(r"name='([^']+)'", txt))
    if not names:
        for ln in txt.splitlines():
            ln = ln.strip()
            if ln and not ln.startswith('['):
                names.add(ln)
    return { n.lower().replace('_node','') for n in names }

def nearest_model_for_point(models, ex, ny):
    best = None
    best_d2 = float('inf')
    for m in models:
        me = m.get('lon')
        mn = m.get('lat')
        if me is None or mn is None:
            continue
        dx = float(me) - float(ex)
        dy = float(mn) - float(ny)
        d2 = dx*dx + dy*dy
        if d2 < best_d2:
            best_d2 = d2
            best = m
    return best, math.sqrt(best_d2) if best is not None else (None, None)

def apply_transform_to_point(mat, point):
    import numpy as np
    v = np.array([point[0], point[1], point[2], 1.0])
    m = np.array(mat).reshape((4,4))
    w = m.dot(v)
    return float(w[0]), float(w[1]), float(w[2])

def main():
    p = Path(__file__).resolve().parents[1]
    parser = argparse.ArgumentParser()
    parser.add_argument("--glb", default=str(p / "models" / "Erfurt_FH_Umkreis_Haus11Markiert.glb"))
    parser.add_argument("--models", default=str(p / "models" / "models.json"))
    parser.add_argument("--keep", default=str(p / "scripts" / "keep_buildings.txt"))
    parser.add_argument("--out", default=str(p / "models" / "models_filtered_matched.json"))
    parser.add_argument("--placeholder", default="models/placeholder_small.glb")
    parser.add_argument("--axis", choices=["x_y","x_z","y_x"], default="x_y",
                        help="Mapping from mesh centroid (x,y,z) to (easting, northing). Default x->easting, y->northing")
    args = parser.parse_args()

    import trimesh, numpy as np
    glb_path = Path(args.glb)
    if not glb_path.exists():
        raise SystemExit(f"GLB not found: {glb_path}")
    scene = trimesh.load(str(glb_path), force='scene')

    models_file = Path(args.models)
    if not models_file.exists():
        raise SystemExit(f"models.json not found: {models_file}")
    models = json.loads(models_file.read_text(encoding='utf-8'))

    keep_set = parse_keep(Path(args.keep))
    print("Keep set sample:", list(keep_set)[:20])

    # build world-space centroid map by applying scene.graph transforms
    centroids = {}  # name -> (easting, northing)
    for name, geom in scene.geometry.items():
        # local centroid
        if hasattr(geom, "centroid"):
            c = geom.centroid
        else:
            c = geom.vertices.mean(axis=0)
        cx, cy, cz = float(c[0]), float(c[1]), float(c[2])

        # determine world transform for this geometry
        world_pos = (cx, cy, cz)
        try:
            # trimesh stores transforms in scene.graph.transforms (dict of 4x4)
            if name in scene.graph.transforms:
                mat = scene.graph.transforms[name]
                wx, wy, wz = apply_transform_to_point(mat, (cx, cy, cz))
                world_pos = (wx, wy, wz)
            else:
                # try node frame lookup (some exports use node names in graph)
                node_key = name
                if node_key in scene.graph.transforms:
                    mat = scene.graph.transforms[node_key]
                    wx, wy, wz = apply_transform_to_point(mat, (cx, cy, cz))
                    world_pos = (wx, wy, wz)
        except Exception:
            # fallback: keep local centroid
            world_pos = (cx, cy, cz)

        # axis mapping to project coordinates (choose correct mapping if needed)
        if args.axis == "x_y":
            easting, northing = world_pos[0], world_pos[1]
        elif args.axis == "x_z":
            easting, northing = world_pos[0], world_pos[2]
        else:
            easting, northing = world_pos[1], world_pos[0]

        centroids[name.lower().replace('_node','')] = (easting, northing)

    # also read nodes.json for names if present (no centroid)
    nodes_json = glb_path.with_suffix(".nodes.json")
    if nodes_json.exists():
        nj = json.loads(nodes_json.read_text(encoding='utf-8'))
        for n in nj:
            mname = (n.get("mesh_name") or n.get("node_name") or "").lower().replace('_node','')
            if mname not in centroids:
                centroids[mname] = None

    out = []
    matched_count = 0
    for k in sorted(keep_set):
        cent = centroids.get(k)
        if not cent:
            print("No centroid for", k, "- will emit placeholder without coords")
            entry = {"id": k, "mesh_name": k, "node_name": None, "url": args.placeholder, "lat": None, "lon": None, "scale": 1, "enabled": True}
        else:
            if cent is None:
                entry = {"id": k, "mesh_name": k, "node_name": None, "url": args.placeholder, "lat": None, "lon": None, "scale": 1, "enabled": True}
            else:
                e, n = cent
                model, dist = nearest_model_for_point(models, e, n)
                if model:
                    matched_count += 1
                    entry = {
                        "id": k,
                        "mesh_name": k,
                        "node_name": None,
                        "url": args.placeholder,
                        "lat": model.get("lat"),
                        "lon": model.get("lon"),
                        "scale": model.get("scale",1),
                        "enabled": True,
                        "match_dist_m": dist
                    }
                    print(f"Matched {k} -> model id {model.get('id')} dist {dist:.2f} (proj m)")
                else:
                    entry = {"id": k, "mesh_name": k, "node_name": None, "url": args.placeholder, "lat": None, "lon": None, "scale": 1, "enabled": True}
        out.append(entry)

    out_path = Path(args.out)
    out_path.write_text(json.dumps(out, indent=2, ensure_ascii=False), encoding='utf-8')
    print("Wrote", out_path, "entries:", len(out), "matched:", matched_count)

if __name__ == "__main__":
    main()