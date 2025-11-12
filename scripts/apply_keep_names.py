import json, re
from pathlib import Path

BASE = Path("d:/EPARtwin_Projekt/Website/WebAR_Proto")
models_path = BASE / "models" / "models.json"
keep_buildings_path = BASE / "keep_buildings.txt"

if not models_path.exists():
    print("models.json not found:", models_path)
    raise SystemExit(1)

if not keep_buildings_path.exists():
    print("keep_buildings.txt not found:", keep_buildings_path)
    raise SystemExit(1)

txt = keep_buildings_path.read_text(encoding='utf-8')
# parse patterns like: name='FaceSet_3018_node' or lines with the name alone
found = set(re.findall(r"name='([^']+)'", txt))
# also accept plain lines (fallback)
if not found:
    for ln in txt.splitlines():
        ln = ln.strip()
        if ln and not ln.startswith('['):
            found.add(ln)

keep = found
print(f"Parsed {len(keep)} keep-names from {keep_buildings_path}")

if not keep:
    print("Keep list is empty — aborting.")
    raise SystemExit(1)

models = json.loads(models_path.read_text(encoding='utf-8'))
updated = []
enabled_count = 0

for m in models:
    ident = str(m.get('id','') or '')
    url = str(m.get('url','') or '')
    # match by id exact or by node-name substring in url or id
    keep_flag = False
    if ident and ident in keep:
        keep_flag = True
    else:
        for k in keep:
            if k and (k in url or k in ident):
                keep_flag = True
                break
    m['enabled'] = bool(keep_flag)
    if m['enabled']:
        enabled_count += 1
    updated.append(m)

out = models_path.parent / "models_filtered.json"
out.write_text(json.dumps(updated, indent=2), encoding='utf-8')
print(f"Wrote {len(updated)} entries to {out} (enabled true: {enabled_count})")