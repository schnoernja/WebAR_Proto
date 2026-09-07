import json, re
from pathlib import Path

BASE = Path(__file__).resolve().parents[1]
models_path = BASE / "source-assets" / "models" / "models.json"
keep_buildings_path = BASE / "scripts" / "keep_buildings.txt"

if not models_path.exists():
    print("models.json not found:", models_path); raise SystemExit(1)
if not keep_buildings_path.exists():
    print("keep_buildings.txt not found:", keep_buildings_path); raise SystemExit(1)

txt = keep_buildings_path.read_text(encoding='utf-8')
found = set(re.findall(r"name='([^']+)'", txt))
if not found:
    for ln in txt.splitlines():
        ln = ln.strip()
        if ln and not ln.startswith('['):
            found.add(ln)

def simplify(s):
    if not s: return ""
    s = str(s).lower()
    s = re.sub(r'[^a-z0-9_]', '_', s)
    s = re.sub(r'_+', '_', s).strip('_')
    # remove common suffix/prefix
    s = re.sub(r'(^node_|_node$)', '', s)
    return s

keep = { simplify(k) for k in found if k }
print(f"Parsed {len(keep)} keep-names from {keep_buildings_path}")

models = json.loads(models_path.read_text(encoding='utf-8'))
updated = []
enabled_count = 0
matched_list = []
unmatched_list = []

for m in models:
    # collect candidate strings from common fields
    candidates = []
    for key in ('id','name','url','mesh_name','node_name'):
        v = m.get(key)
        if v:
            candidates.append(str(v))
    # also stringify whole entry for fallback
    candidates.append(json.dumps(m))
    cans = [simplify(c) for c in candidates if c]
    keep_flag = False
    for k in keep:
        for c in cans:
            if not c: continue
            if k == c or k in c or c in k:
                keep_flag = True
                break
        if keep_flag: break
    m['enabled'] = bool(keep_flag)
    if m['enabled']:
        enabled_count += 1
        matched_list.append(m.get('id') or m.get('url') or str(m)[:120])
    else:
        unmatched_list.append(m.get('id') or m.get('url') or str(m)[:120])
    updated.append(m)

out = models_path.parent / "models_filtered.json"
out.write_text(json.dumps(updated, indent=2, ensure_ascii=False), encoding='utf-8')
report = {
    "parsed_keep": list(found)[:200],
    "matched_count": enabled_count,
    "matched_sample": matched_list[:50],
    "unmatched_sample": unmatched_list[:50]
}
(report_path := models_path.parent / "keep_match_report_auto.json").write_text(json.dumps(report, indent=2, ensure_ascii=False), encoding='utf-8')

print(f"Wrote {len(updated)} entries to {out} (enabled true: {enabled_count})")
print(f"Report: {report_path}")
