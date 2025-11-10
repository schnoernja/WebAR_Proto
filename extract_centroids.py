"""
Usage:
  python extract_centroids.py path/to/file.citygml path/to/output/models.json

Dependencies:
  pip install lxml pyproj shapely
"""
import sys
import json
from pathlib import Path
from lxml import etree
from pyproj import Transformer
from shapely.geometry import Polygon, Point

NS = {
    'gml': 'http://www.opengis.net/gml',
    # citygml building namespace is commonly:
    'bldg': 'http://www.opengis.net/citygml/building/2.0'
}

def parse_coords_from_poslist(text):
    nums = list(map(float, text.split()))
    pts = [(nums[i], nums[i+1], nums[i+2]) for i in range(0, len(nums), 3)]
    return pts

def parse_coords_from_pos(elems):
    pts = []
    for e in elems:
        coords = list(map(float, e.text.split()))
        pts.append((coords[0], coords[1], coords[2] if len(coords)>2 else 0.0))
    return pts

def find_srs(root):
    # try common places for srsName or gml:boundedBy with envelope
    for el in root.xpath('//@srsName'):
        val = el
        if 'EPSG' in val.upper():
            return val
    # fallback: no CRS found
    return None

def extract_buildings(tree):
    root = tree.getroot()
    srs = find_srs(root)
    # normalize srs to EPSG code if possible
    epsg_src = None
    if srs:
        # common formats: "urn:ogc:def:crs:EPSG::25832" or "EPSG:25832"
        import re
        m = re.search(r'(\d{4,5})', srs)
        if m:
            epsg_src = int(m.group(1))
    # transformer (if source known)
    transformer = None
    if epsg_src and epsg_src != 4326:
        transformer = Transformer.from_crs(epsg_src, 4326, always_xy=True)

    out = []
    # find all building nodes (be generic: any local-name 'Building')
    for b in root.xpath("//*[local-name() = 'Building']"):
        # id
        bid = b.get('{http://www.opengis.net/gml}id') or b.get('gml:id') or b.get('id') or None

        # find first polygon posList or pos
        pts = []
        # posList under polygons
        poslists = b.xpath('.//*[local-name()="posList"]')
        if poslists:
            pts = parse_coords_from_poslist(poslists[0].text)
        else:
            pos_elems = b.xpath('.//*[local-name()="pos"]')
            if pos_elems:
                pts = parse_coords_from_pos(pos_elems)

        if not pts:
            # try extracting coordinates from lowerCorner/upperCorner (envelope)
            lc = b.xpath('.//*[local-name()="lowerCorner"]')
            uc = b.xpath('.//*[local-name()="upperCorner"]')
            if lc and uc:
                lc_coords = list(map(float, lc[0].text.split()))
                uc_coords = list(map(float, uc[0].text.split()))
                # make simple rectangle
                pts = [
                    (lc_coords[0], lc_coords[1], 0),
                    (uc_coords[0], lc_coords[1], 0),
                    (uc_coords[0], uc_coords[1], 0),
                    (lc_coords[0], uc_coords[1], 0),
                ]
        if not pts:
            continue

        # compute centroid (use shapely if available)
        try:
            poly2d = Polygon([(p[0], p[1]) for p in pts if p])
            c = poly2d.centroid
            lon, lat = c.x, c.y
        except Exception:
            # fallback simple average
            xs = [p[0] for p in pts]
            ys = [p[1] for p in pts]
            lon = sum(xs) / len(xs)
            lat = sum(ys) / len(ys)

        # transform if needed
        if transformer:
            lon, lat = transformer.transform(lon, lat)

        entry = {
            "id": bid or "",
            "lat": float(lat),
            "lon": float(lon),
            "url": "",   # fill model filename manually or modify script to map files
            "scale": 1.0
        }
        out.append(entry)
    return out

def main():
    if len(sys.argv) < 3:
        print("Usage: python extract_centroids.py input.citygml output_models.json")
        sys.exit(1)
    inp = Path(sys.argv[1])
    outp = Path(sys.argv[2])
    tree = etree.parse(str(inp))
    models = extract_buildings(tree)
    outp.parent.mkdir(parents=True, exist_ok=True)
    outp.write_text(json.dumps(models, indent=2), encoding='utf-8')
    print(f"Wrote {len(models)} entries to {outp}")

if __name__ == '__main__':
    main()