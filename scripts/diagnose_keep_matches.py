import json, re
from pathlib import Path

BASE = Path("d:/EPARtwin_Projekt/Website/WebAR_Proto")
models_path = BASE / "models" / "models.json"
keep_path = BASE / "scripts" / "keep_buildings.txt"

if not models_path.exists():
    print("models.json not found:", models_path); raise SystemExit(1)
if not keep_path.exists():
    print("keep_buildings.txt not found:", keep_path); raise SystemExit(1)

txt = keep_path.read_text(encoding='utf-8')
keep = set(re.findall(r"name='([^']+)'", txt))
if not keep:
    # fallback: lines that look like names
    for ln in txt.splitlines():
        ln = ln.strip()
        if ln and not ln.startswith('['):
            keep.add(ln)

print(f"Parsed {len(keep)} keep-names from {keep_path}\n")

models = json.loads(models_path.read_text(encoding='utf-8'))
print(f"models.json contains {len(models)} entries\n")

# build searchable lists
ids = [str(m.get('id','') or '') for m in models]
urls = [str(m.get('url','') or '') for m in models]

matched_names = {}
unmatched = []

for name in sorted(keep):
    matches = []
    # exact id match
    for i, mid in enumerate(ids):
        if mid == name:
            matches.append((i, 'id_exact', mid, urls[i]))
    # substring in id or url (case sensitive and insensitive)
    for i, (mid, url) in enumerate(zip(ids, urls)):
        if name in mid and (i, 'id_sub') not in [(m[0], m[1]) for m in matches]:
            matches.append((i, 'id_sub', mid, url))
        elif name in url and (i, 'url_sub') not in [(m[0], m[1]) for m in matches]:
            matches.append((i, 'url_sub', mid, url))
        else:
            # case-insensitive
            if name.lower() in mid.lower() or name.lower() in url.lower():
                if not any(m[0]==i for m in matches):
                    matches.append((i, 'ci_sub', mid, url))
    if matches:
        matched_names[name] = matches
    else:
        unmatched.append(name)

# print summary
print("MATCH SUMMARY")
print("-------------")
print(f"Matched names: {len(matched_names)}")
print(f"Unmatched names: {len(unmatched)}\n")

if matched_names:
    print("Examples of matches (name -> first 5 matches):")
    for name, ms in list(matched_names.items())[:20]:
        print(f"\n{name}:")
        for m in ms[:5]:
            idx, kind, mid, url = m
            print(f"  entry #{idx} [{kind}] id='{mid}' url='{url}'")

if unmatched:
    print("\nUNMATCHED NAMES (first 40):")
    for n in unmatched[:40]:
        print(" ", n)

# optional: write a small mapping file showing counts
out = BASE / "scripts" / "keep_match_report.json"
out.parent.mkdir(parents=True, exist_ok=True)
report = {
    "parsed_keep_names": len(keep),
    "models_entries": len(models),
    "matched": {k: [ {"index":m[0], "kind":m[1], "id":m[2], "url":m[3]} for m in v ] for k,v in matched_names.items()},
    "unmatched": unmatched
}
out.write_text(json.dumps(report, indent=2), encoding='utf-8')
print(f"\nWrote report to {out}")