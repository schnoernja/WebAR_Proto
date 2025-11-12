import json, re
from pathlib import Path

BASE = Path(__file__).resolve().parents[1]
models_path = BASE / "models" / "models.json"
keep_path = BASE / "scripts" / "keep_buildings.txt"

def load_keep():
    txt = keep_path.read_text(encoding='utf-8')
    found = set(re.findall(r"name='([^']+)'", txt))
    if not found:
        for ln in txt.splitlines():
            ln = ln.strip()
            if ln and not ln.startswith('['):
                found.add(ln)
    return sorted(found)

def simplify(s):
    if not s: return ""
    s = str(s).lower()
    s = re.sub(r'[^a-z0-9_]', '_', s)
    s = re.sub(r'_+', '_', s).strip('_')
    s = re.sub(r'(^node_|_node$)', '', s)
    return s

keep = load_keep()
print("Parsed keep names (sample 30):", keep[:30])
keep_s = { simplify(k) for k in keep }

models = json.loads(models_path.read_text(encoding='utf-8'))
print("Total models:", len(models))

# show first N models with candidates and match result
N=20
found_any = 0
for i,m in enumerate(models[:N]):
    print("\n--- model", i)
    print("raw id:", m.get('id'))
    print("raw url:", m.get('url'))
    fields = []
    for key in ('id','name','url','mesh_name','node_name'):
        v = m.get(key)
        if v:
            fields.append((key, str(v)))
    print("fields:", fields)
    candidates = [simplify(str(v)) for k,v in fields]
    print("simplified candidates:", candidates)
    inter = [k for k in keep_s if any(k==c or k in c or c in k for c in candidates)]
    print("matching keep simplified:", inter)
    if inter:
        found_any += 1

# global scan: count how many models would match by substring
matches = 0
for m in models:
    candidates = []
    for key in ('id','name','url','mesh_name','node_name'):
        v = m.get(key)
        if v:
            candidates.append(simplify(str(v)))
    if any(k==c or k in c or c in k for k in keep_s for c in candidates):
        matches += 1
print("\nTotal matched models by substring test:", matches)
print("Total matched among first", N, "shown:", found_any)