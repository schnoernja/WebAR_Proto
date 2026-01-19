#!/usr/bin/env python3
import argparse
import math
import os
import sys
import zlib
from array import array
from pathlib import Path
import xml.etree.ElementTree as ET
import re

try:
    import psycopg2
except ImportError:
    psycopg2 = None

try:
    from pyproj import CRS, Transformer
except ImportError:
    CRS = None
    Transformer = None

BASE32 = "0123456789bcdefghjkmnpqrstuvwxyz"


def geohash_encode(lat, lon, precision=7):
    lat_interval = [-90.0, 90.0]
    lon_interval = [-180.0, 180.0]
    bits = [16, 8, 4, 2, 1]
    geohash = []
    bit = 0
    ch = 0
    even = True

    while len(geohash) < precision:
        if even:
            mid = sum(lon_interval) / 2
            if lon > mid:
                ch |= bits[bit]
                lon_interval[0] = mid
            else:
                lon_interval[1] = mid
        else:
            mid = sum(lat_interval) / 2
            if lat > mid:
                ch |= bits[bit]
                lat_interval[0] = mid
            else:
                lat_interval[1] = mid

        even = not even
        if bit < 4:
            bit += 1
        else:
            geohash.append(BASE32[ch])
            bit = 0
            ch = 0

    return "".join(geohash)


def haversine_m(lat1, lon1, lat2, lon2):
    r = 6371000.0
    phi1 = math.radians(lat1)
    phi2 = math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dl = math.radians(lon2 - lon1)
    a = math.sin(dphi / 2) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(dl / 2) ** 2
    return 2 * r * math.asin(min(1.0, math.sqrt(a)))


def parse_floats(text):
    if not text:
        return []
    return [float(v) for v in text.strip().split()]


def iter_points(path):
    srs_name = None
    for _, elem in ET.iterparse(path, events=("end",)):
        if srs_name is None and "srsName" in elem.attrib:
            srs_name = elem.attrib.get("srsName")

        tag = elem.tag
        if tag.endswith("posList"):
            values = parse_floats(elem.text)
            if not values:
                elem.clear()
                continue
            dim_text = elem.attrib.get("srsDimension") or elem.attrib.get("dimension")
            dim = int(dim_text) if dim_text else 0
            if dim == 0:
                if len(values) % 3 == 0:
                    dim = 3
                elif len(values) % 2 == 0:
                    dim = 2
            if dim < 3:
                elem.clear()
                continue
            for i in range(0, len(values) - dim + 1, dim):
                yield values[i], values[i + 1], values[i + 2]
        elif tag.endswith("pos"):
            values = parse_floats(elem.text)
            if len(values) >= 3:
                yield values[0], values[1], values[2]

        elem.clear()
    return srs_name


def scan_gml(path):
    minx = miny = minz = None
    maxx = maxy = maxz = None
    count = 0
    srs_name = None

    for _, elem in ET.iterparse(path, events=("end",)):
        if srs_name is None and "srsName" in elem.attrib:
            srs_name = elem.attrib.get("srsName")

        tag = elem.tag
        if tag.endswith("posList"):
            values = parse_floats(elem.text)
            if not values:
                elem.clear()
                continue
            dim_text = elem.attrib.get("srsDimension") or elem.attrib.get("dimension")
            dim = int(dim_text) if dim_text else 0
            if dim == 0:
                if len(values) % 3 == 0:
                    dim = 3
                elif len(values) % 2 == 0:
                    dim = 2
            if dim < 3:
                elem.clear()
                continue
            for i in range(0, len(values) - dim + 1, dim):
                x, y, z = values[i], values[i + 1], values[i + 2]
                minx = x if minx is None else min(minx, x)
                miny = y if miny is None else min(miny, y)
                minz = z if minz is None else min(minz, z)
                maxx = x if maxx is None else max(maxx, x)
                maxy = y if maxy is None else max(maxy, y)
                maxz = z if maxz is None else max(maxz, z)
                count += 1
        elif tag.endswith("pos"):
            values = parse_floats(elem.text)
            if len(values) >= 3:
                x, y, z = values[0], values[1], values[2]
                minx = x if minx is None else min(minx, x)
                miny = y if miny is None else min(miny, y)
                minz = z if minz is None else min(minz, z)
                maxx = x if maxx is None else max(maxx, x)
                maxy = y if maxy is None else max(maxy, y)
                maxz = z if maxz is None else max(maxz, z)
                count += 1

        elem.clear()

    return srs_name, (minx, miny, maxx, maxy), (minz, maxz), count


def build_grid(path, bbox, grid_w, grid_h, fallback_z):
    minx, miny, maxx, maxy = bbox
    if minx is None or minx == maxx or miny == maxy:
        return None

    grid = [None] * (grid_w * grid_h)
    span_x = maxx - minx
    span_y = maxy - miny

    for _, elem in ET.iterparse(path, events=("end",)):
        tag = elem.tag
        if tag.endswith("posList"):
            values = parse_floats(elem.text)
            if not values:
                elem.clear()
                continue
            dim_text = elem.attrib.get("srsDimension") or elem.attrib.get("dimension")
            dim = int(dim_text) if dim_text else 0
            if dim == 0:
                if len(values) % 3 == 0:
                    dim = 3
                elif len(values) % 2 == 0:
                    dim = 2
            if dim < 3:
                elem.clear()
                continue
            for i in range(0, len(values) - dim + 1, dim):
                x, y, z = values[i], values[i + 1], values[i + 2]
                col = int((x - minx) / span_x * grid_w)
                row = int((y - miny) / span_y * grid_h)
                col = max(0, min(grid_w - 1, col))
                row = max(0, min(grid_h - 1, row))
                idx = row * grid_w + col
                current = grid[idx]
                if current is None or z < current:
                    grid[idx] = z
        elif tag.endswith("pos"):
            values = parse_floats(elem.text)
            if len(values) >= 3:
                x, y, z = values[0], values[1], values[2]
                col = int((x - minx) / span_x * grid_w)
                row = int((y - miny) / span_y * grid_h)
                col = max(0, min(grid_w - 1, col))
                row = max(0, min(grid_h - 1, row))
                idx = row * grid_w + col
                current = grid[idx]
                if current is None or z < current:
                    grid[idx] = z

        elem.clear()

    for i, val in enumerate(grid):
        if val is None:
            grid[i] = fallback_z

    return grid


def srs_is_wgs84(srs_name):
    if not srs_name:
        return True
    s = srs_name.lower()
    return "4326" in s or "crs84" in s


def parse_epsg(srs_name):
    if not srs_name:
        return None
    s = srs_name.upper()
    if "EPSG" in s:
        for token in s.replace("/", ":").split(":"):
            if token.isdigit() and 4 <= len(token) <= 6:
                return f"EPSG:{token}"
    # Fallback: choose the last 4-6 digit numeric token.
    digits = [t for t in "".join(ch if ch.isdigit() else " " for ch in s).split() if 4 <= len(t) <= 6]
    return f"EPSG:{digits[-1]}" if digits else None


def get_transformer(srs_name):
    if srs_is_wgs84(srs_name):
        return None
    if Transformer is None or CRS is None:
        raise RuntimeError("pyproj is required for non-WGS84 CityGML files.")
    epsg = parse_epsg(srs_name) or srs_name
    src = CRS.from_user_input(epsg)
    dst = CRS.from_epsg(4326)
    return Transformer.from_crs(src, dst, always_xy=True)


def to_latlon_bounds(bbox, transformer):
    minx, miny, maxx, maxy = bbox
    if transformer is None:
        return miny, minx, maxy, maxx
    lon1, lat1 = transformer.transform(minx, miny)
    lon2, lat2 = transformer.transform(maxx, maxy)
    return min(lat1, lat2), min(lon1, lon2), max(lat1, lat2), max(lon1, lon2)


def resolution_meters(bbox, latlon_bounds, grid_w, grid_h, transformer):
    minx, miny, maxx, maxy = bbox
    if transformer is None:
        span_x = maxx - minx
        span_y = maxy - miny
        return max(span_x / grid_w, span_y / grid_h)

    min_lat, min_lon, max_lat, max_lon = latlon_bounds
    center_lat = (min_lat + max_lat) / 2
    center_lon = (min_lon + max_lon) / 2
    width_m = haversine_m(center_lat, min_lon, center_lat, max_lon)
    height_m = haversine_m(min_lat, center_lon, max_lat, center_lon)
    return max(width_m / grid_w, height_m / grid_h)


def insert_tile(conn, table_name, tile):
    sql = f"""
        INSERT INTO {table_name}
            (tile_key, min_lat, min_lon, max_lat, max_lon, resolution_m, grid_w, grid_h, heights)
        VALUES
            (%s, %s, %s, %s, %s, %s, %s, %s, %s)
        ON CONFLICT (tile_key) DO UPDATE SET
            min_lat = EXCLUDED.min_lat,
            min_lon = EXCLUDED.min_lon,
            max_lat = EXCLUDED.max_lat,
            max_lon = EXCLUDED.max_lon,
            resolution_m = EXCLUDED.resolution_m,
            grid_w = EXCLUDED.grid_w,
            grid_h = EXCLUDED.grid_h,
            heights = EXCLUDED.heights
    """
    with conn.cursor() as cur:
        cur.execute(sql, tile)


def safe_ident(name):
    if not re.match(r"^[A-Za-z_][A-Za-z0-9_]*$", name):
        raise ValueError(f"Invalid identifier: {name}")
    return name


def resolve_table(schema):
    safe_schema = safe_ident(schema)
    return f"{safe_schema}.height_tiles"


def check_table(conn, table_name):
    with conn.cursor() as cur:
        cur.execute("SELECT current_database(), current_user, current_schema()")
        db, user, schema = cur.fetchone()
        cur.execute("SELECT to_regclass(%s)", (table_name,))
        reg = cur.fetchone()[0]
    return db, user, schema, reg


def main():
    parser = argparse.ArgumentParser(description="Import CityGML heights into Postgres.")
    parser.add_argument("--input-dir", default=None, help="Directory containing *.gml files.")
    parser.add_argument("--grid", type=int, default=64, help="Grid size (NxN).")
    parser.add_argument("--precision", type=int, default=7, help="Geohash precision.")
    parser.add_argument("--db-host", default=os.getenv("DB_HOST", "localhost"))
    parser.add_argument("--db-port", default=os.getenv("DB_PORT", "5444"))
    parser.add_argument("--db-name", default=os.getenv("DB_NAME", "webar"))
    parser.add_argument("--db-user", default=os.getenv("DB_USER", "webar_user"))
    parser.add_argument("--db-pass", default=os.getenv("DB_PASS", "webar_pass"))
    parser.add_argument("--schema", default=os.getenv("DB_SCHEMA", "public"))
    args = parser.parse_args()

    if psycopg2 is None:
        print("psycopg2 is required. Install with: pip install -r tools/requirements.txt", file=sys.stderr)
        return 1

    root = Path(__file__).resolve().parents[1]
    input_dir = Path(args.input_dir) if args.input_dir else root / "CityGmls"
    gml_files = sorted(input_dir.rglob("*.gml"))
    if not gml_files:
        print(f"No GML files found in {input_dir}", file=sys.stderr)
        return 1

    conn = psycopg2.connect(
        host=args.db_host,
        port=args.db_port,
        dbname=args.db_name,
        user=args.db_user,
        password=args.db_pass
    )
    conn.autocommit = True
    table_name = resolve_table(args.schema)
    db, user, schema, reg = check_table(conn, table_name)
    print(f"DB={db} USER={user} SEARCH_PATH={schema} TABLE={table_name} EXISTS={bool(reg)}")
    if not reg:
        print(f"Table {table_name} not found. Create it in the same database/schema.", file=sys.stderr)
        conn.close()
        return 1

    total_tiles = 0
    global_min = None
    global_max = None

    for path in gml_files:
        print(f"Processing {path.name}...")
        srs_name, bbox, z_range, count = scan_gml(path)
        minz, maxz = z_range
        if count == 0 or minz is None:
            print("  No Z values found. Skipping.")
            continue

        transformer = get_transformer(srs_name)
        latlon_bounds = to_latlon_bounds(bbox, transformer)

        grid = build_grid(path, bbox, args.grid, args.grid, minz)
        if grid is None:
            print("  Invalid bbox. Skipping.")
            continue

        center_x = (bbox[0] + bbox[2]) / 2
        center_y = (bbox[1] + bbox[3]) / 2
        if transformer is None:
            center_lon, center_lat = center_x, center_y
        else:
            center_lon, center_lat = transformer.transform(center_x, center_y)

        tile_key = geohash_encode(center_lat, center_lon, precision=args.precision)
        res_m = resolution_meters(bbox, latlon_bounds, args.grid, args.grid, transformer)

        height_array = array("f", grid)
        compressed = zlib.compress(height_array.tobytes())

        tile = (
            tile_key,
            latlon_bounds[0],
            latlon_bounds[1],
            latlon_bounds[2],
            latlon_bounds[3],
            res_m,
            args.grid,
            args.grid,
            psycopg2.Binary(compressed)
        )
        insert_tile(conn, table_name, tile)

        total_tiles += 1
        tile_min = min(grid)
        tile_max = max(grid)
        global_min = tile_min if global_min is None else min(global_min, tile_min)
        global_max = tile_max if global_max is None else max(global_max, tile_max)
        print(f"  tile_key={tile_key} points={count} min={tile_min:.2f} max={tile_max:.2f}")

    conn.close()
    print("")
    print(f"Tiles inserted/updated: {total_tiles}")
    if total_tiles:
        print(f"Height min/max: {global_min:.2f} / {global_max:.2f}")

    return 0


if __name__ == "__main__":
    sys.exit(main())
