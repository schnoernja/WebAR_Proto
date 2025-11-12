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

def median(lst):
    s = sorted(lst)
    n = len(s)
    if n==0: return 0.0
    mid = n//2
    if n%2: return s[mid]
    return 0.5*(s[mid-1]+s[mid])

def main():
    p = Path(__file__).resolve().parents[1]
    parser = argparse.ArgumentParser()
    parser.add_argument("--glb", default=str(p / "models" / "Erfurt_FH_Umkreis_Haus11Markiert.glb"))
    parser.add_argument("--models", default=str(p / "models" / "models.json"))
    parser.add_argument("--keep", default=str(p / "scripts" / "keep_buildings.txt"))
    parser.add_argument("--out", default=str(p / "models" / "models_filtered_matched_offset.json"))
    parser.add_argument("--placeholder", default="models/placeholder_small.glb")
    parser.add_argument("--axis", choices=["x_y","x_z","y_x"], default="x_y")
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

    # build world-space centroid map
    centroids = {}
    for name, geom in scene.geometry.items():
        if hasattr(geom, "centroid"):
            c = geom.centroid
        else:
            c = geom.vertices.mean(axis=0)
        cx, cy, cz = float(c[0]), float(c[1]), float(c[2])
        world_pos = (cx, cy, cz)
        try:
            if name in scene.graph.transforms:
                mat = scene.graph.transforms[name]
                wx, wy, wz = apply_transform_to_point(mat, (cx, cy, cz))
                world_pos = (wx, wy, wz)
        except Exception:
            world_pos = (cx, cy, cz)
        if args.axis == "x_y":
            e, n = world_pos[0], world_pos[1]
        elif args.axis == "x_z":
            e, n = world_pos[0], world_pos[2]
        else:
            e, n = world_pos[1], world_pos[0]
        centroids[name.lower().replace('_node','')] = (e, n)

    # initial matching to collect candidate offsets
    offsets_x = []
    offsets_y = []
    initial_matches = []
    for k in sorted(keep_set):
        cent = centroids.get(k)
        if cent:
            e, n = cent
            model, dist = nearest_model_for_point(models, e, n)
            if model:
                offsets_x.append(float(model.get('lon')) - e)
                offsets_y.append(float(model.get('lat')) - n)
                initial_matches.append((k, e, n, model.get('id'), dist))
    if not offsets_x:
        print("No centroid->model matches to estimate offset. Inspect centroids output below.")
        # dump centroids sample for inspection
        for k in sorted(keep_set)[:20]:
            print("centroid", k, "=", centroids.get(k))
        raise SystemExit(1)

    # robust estimate: medians
    dx_med = median(offsets_x)
    dy_med = median(offsets_y)
    print(f"Estimated median offset: dx={dx_med:.3f}, dy={dy_med:.3f} (apply to centroids)")

    # show sample before offsets
    print("\nSample before offset (first 8):")
    for s in initial_matches[:8]:
        print(f"{s[0]} centroid=({s[1]:.3f},{s[2]:.3f}) matched_model={s[3]} dist={s[4]:.3f}")

    # apply offset and rematch
    out = []
    rematched = 0
    for k in sorted(keep_set):
        cent = centroids.get(k)
        if not cent:
            entry = {"id": k, "mesh_name": k, "node_name": None, "url": args.placeholder, "lat": None, "lon": None, "scale": 1, "enabled": True}
            out.append(entry)
            continue
        e, n = cent
        e_adj = e + dx_med
        n_adj = n + dy_med
        model, dist = nearest_model_for_point(models, e_adj, n_adj)
        if model:
            rematched += 1
            entry = {
                "id": k,
                "mesh_name": k,
                "node_name": None,
                "url": args.placeholder,
                "lat": model.get("lat"),
                "lon": model.get("lon"),
                "scale": model.get("scale",1),
                "enabled": True,
                "centroid_e": e, "centroid_n": n,
                "centroid_e_adj": e_adj, "centroid_n_adj": n_adj,
                "match_dist_m": dist
            }
        else:
            entry = {"id": k, "mesh_name": k, "node_name": None, "url": args.placeholder, "lat": None, "lon": None, "scale": 1, "enabled": True,
                     "centroid_e": e, "centroid_n": n, "centroid_e_adj": e_adj, "centroid_n_adj": n_adj, "match_dist_m": None}
        out.append(entry)

    out_path = Path(args.out)
    out_path.write_text(json.dumps(out, indent=2, ensure_ascii=False), encoding='utf-8')
    print(f"Wrote {out_path} entries: {len(out)} rematched: {rematched}")

    # print a short sample of rematch distances
    print("\nSample rematch distances (first 12):")
    for e in out[:12]:
        print(e['id'], "dist=", e.get('match_dist_m'), "lat/lon=", e.get('lat'), e.get('lon'))

if __name__ == "__main__":
    main()