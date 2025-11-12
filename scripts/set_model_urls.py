import json
from pathlib import Path
models_file = Path("d:/EPARtwin_Projekt/Website/WebAR_Proto/models/models.json")
default_url = "models/meinGebaeude.glb"   # passe an

data = json.loads(models_file.read_text(encoding='utf-8'))
for e in data:
    e['url'] = default_url
models_file.write_text(json.dumps(data, indent=2), encoding='utf-8')
print(f"Updated {len(data)} entries to use {default_url}")