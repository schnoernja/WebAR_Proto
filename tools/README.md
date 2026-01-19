# CityGML Height Tiles Import

This tool scans `CityGmls/` for `*.gml` files, builds a 64x64 height grid per file,
compresses it, and stores it in Postgres `height_tiles`.

## Install
```
pip install -r tools/requirements.txt
```

## Run
From repo root:
```
python tools/import_citygml_heights.py \
  --db-host localhost \
  --db-port 5444 \
  --db-name webar \
  --db-user webar_user \
  --db-pass webar_pass
```

Defaults also read from env: `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASS`.

## Notes
- If your CityGML uses a non-WGS84 CRS (e.g., EPSG:25832), the script uses `pyproj`
  to convert the tile bounds/center for the geohash.
- If no terrain surface exists, height per grid cell falls back to the minimum Z.
