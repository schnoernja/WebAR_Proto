import json
from pathlib import Path
from pyproj import Transformer

BASE = Path(__file__).resolve().parents[1]
SOURCE_MODELS = BASE / "source-assets" / "models"
inp = SOURCE_MODELS / "models_filtered_matched_offset.json"
out = SOURCE_MODELS / "models_filtered_matched_wgs84.json"

# Falls deine Projektion anders ist, ändere "EPSG:25832"
src_crs = "EPSG:25832"
dst_crs = "EPSG:4326"

tx = Transformer.from_crs(src_crs, dst_crs, always_xy=True)

data = json.loads(inp.read_text(encoding="utf-8"))
for e in data:
    lon_proj = e.get("lon")
    lat_proj = e.get("lat")
    if lon_proj is None or lat_proj is None:
        e["latitude"] = None
        e["longitude"] = None
        continue
    # tx.transform(easting, northing) -> (lon, lat)
    try:
        lon_wgs, lat_wgs = tx.transform(float(lon_proj), float(lat_proj))
        e["longitude"] = lon_wgs
        e["latitude"] = lat_wgs
    except Exception:
        e["longitude"] = None
        e["latitude"] = None

out.write_text(json.dumps(data, indent=2, ensure_ascii=False), encoding="utf-8")
print("Wrote", out)
