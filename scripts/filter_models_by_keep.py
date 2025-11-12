import json, re
from pathlib import Path

BASE = Path(__file__).resolve().parents[1]
# falls du nach der Koordinaten‑Konvertierung models_wgs84.json erzeugst, passe den Namen hier ggf. an
models_file = BASE / "models" / "models.json"
keep_file = BASE / "scripts" / "keep_buildings.txt"
nodes_file = BASE / "models" / "Erfurt_FH_Umkreis_Haus11Markiert.nodes.json"

def read_keep():
    txt = keep_file.read_text(encoding='utf-8')
    names = set(re.findall(r"name='([^']+)'", txt))
    if not names:
        for ln in txt.splitlines():
            ln = ln.strip()
            if ln and not ln.startswith('['):
                names.add(ln)
    return { n.lower().replace('_node','') for n in names }

def simplify(s):
    if not s: return ""
    s = str(s).lower()
    s = re.sub(r'[^a-z0-9_]', '_', s)
    s = re.sub(r'_+', '_', s).strip('_')
    s = s.replace('_node','')
    return s

if not models_file.exists():
    raise SystemExit("models.json not found: " + str(models_file))
keep_set = read_keep()
print("Keep set (sample):", list(keep_set)[:40])

# optional: load nodes/mesh names for info only (do NOT inject into every model)
node_names = set()
mesh_names = set()
if nodes_file.exists():
    nodes = json.loads(nodes_file.read_text(encoding='utf-8'))
    for n in nodes:
        if n.get("node_name"):
            node_names.add(simplify(n["node_name"]))
        if n.get("mesh_name"):
            mesh_names.add(simplify(n["mesh_name"]))
    print("Loaded", len(nodes), "nodes; sample node:", list(node_names)[:8])
else:
    print("Warning: nodes.json not found:", nodes_file)

models = json.loads(models_file.read_text(encoding='utf-8'))
out = []
matched = 0

for m in models:
    # candidate strings only from this model's fields
    candidates = []
    for k in ("id","name","url","mesh_name","node_name"):
        v = m.get(k)
        if v:
            candidates.append(simplify(v))
    enabled = False
    for k in keep_set:
        for c in candidates:
            if not c: continue
            if k == c or k in c or c in k:
                enabled = True
                break
        if enabled:
            break
    m["enabled"] = bool(enabled)
    if enabled:
        matched += 1
    out.append(m)

out_path = models_file.parent / "models_filtered.json"
out_path.write_text(json.dumps(out, indent=2, ensure_ascii=False), encoding='utf-8')
report = {"total_models": len(models), "matched": matched, "keep_count": len(keep_set)}
(report_path := models_file.parent / "keep_match_report_auto.json").write_text(json.dumps(report, indent=2, ensure_ascii=False), encoding='utf-8')
print("Wrote", out_path, "matched:", matched, "of", len(models))
print("Report:", report_path)