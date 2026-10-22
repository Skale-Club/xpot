"""NFC counter plaque — face art geometry for Fusion, one JSON per version (Google, Instagram, ...).

Builds the art of each approved face as polygons and writes `face_art_<version>.json` next to this
file, which `nfc_plaque_body.py` reads to model every version in one Fusion document. Also writes a
2D check render of the exact polygons and refuses to write unless the QR decodes back to its URL.

    python face_art.py                       # every version, with the design documents' sample code
    python face_art.py --version instagram --code <CODE> --batch <BATCH> --serial 007 --out <json>

Where things sit comes from `face_composition.resolve_version()` — the same numbers the 2D study is
drawn from. Output coordinates are the card frame of `nfc_plaque_body.py`: X right (seen from the
face), Y up from the edge in the slot, mm.

Each body group is a list of *levels* so that every sketch Fusion builds holds only regions to fill:
  ext  depth 0 — outlines of the outermost regions        -> extrude new bodies
  hole depth 0 — their holes                              -> cut from those bodies
  ext  depth 1 — islands inside those holes (a QR finder's centre) -> extrude new bodies, and so on.
Rings at one level never touch or nest, so each ring is exactly one Fusion profile.

Group roles: `inlay` (flush colour, 0.52 deep, cut into the card keeping the body), `pocket` (cut for a
glued token), `token` (the glued piece, sitting in its pocket), `engrave` (cut into the back).
"""
import json
import math
import os
import re
import sys

import fitz
import numpy as np
import segno
from matplotlib.textpath import TextPath
from shapely import affinity
from shapely.geometry import LineString, MultiPolygon, Point, Polygon, box
from shapely.ops import unary_union

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import face_composition as fc  # noqa: E402

PIECE = os.path.dirname(os.path.dirname(HERE))
OUT_JSON = os.path.join(HERE, 'face_art_%s.json')                     # % version
OUT_CHECK = os.path.join(PIECE, 'preview', 'face', 'face-art-%s-check.png')   # % version

CARD_W, CARD_H = fc.CARD_W, fc.CARD_H
# Tags moved from Skale Club to Xpot on 2026-10-03. Xpot is now the system of record and the
# permanent URL printed on new pieces is https://xpot.place/q/<CODE> (xpot origin/main,
# shared/tags.ts). Upper case keeps the complete URL in QR alphanumeric mode: version 2, 25 modules,
# error correction Q for the normal 8-symbol code.
QR_BASE = 'HTTPS://XPOT.PLACE/Q/'
CODE_RE = re.compile(r'^[0-9A-HJKMNP-TV-Z]{8,10}$')
SAMPLE_CODE = 'A7K3P9X2'      # the spec's example code: design document only, never a client plaque
G_CLEAR = 0.10          # per side between the G token and its pocket; not calibrated (Kit Pegs coupon)
SIMPLIFY = 0.004        # mm, chord tolerance of curves after flattening
# The serial on the back (user, 2026-10-01: "like a serial"): the public code, engraved into the back.
# Code only since 2026-10-03 (user: "no need to show the batch or the date, only the serial; clients do
# not need to know how many plaques we sold"): REV-2026-001 #001 gave away the year and the count. The
# batch and serial number stay in the ledger and on the site. line2_* is kept: it places the lone code. mm, y down from the top edge AS SEEN FROM BEHIND. The bottom 9.5 mm
# sit in the slot; the NFC pocket covers y 2-28 from the top, so the serial stays low on the card.
BACK_SERIAL = {'code_cap': 3.2, 'code_baseline': 65.3, 'line2_cap': 2.7, 'line2_baseline': 70.5}


def normalize_code(raw):
    """Same rule as the site's normalizeTagCode: upper case, no spaces/hyphens, O->0, I/L->1."""
    code = re.sub(r'[\s-]', '', str(raw).strip().upper()).replace('O', '0').replace('I', '1').replace('L', '1')
    if not CODE_RE.match(code):
        raise ValueError('not a Smart Tags code: %r' % raw)
    return code


# --- small geometry helpers ------------------------------------------------------------------------

def polys(geom):
    if geom.is_empty:
        return []
    return list(geom.geoms) if isinstance(geom, MultiPolygon) else [geom]


def even_odd(rings):
    """Fill rule for font and path contours: XOR of every closed ring."""
    acc = Polygon()
    for r in rings:
        if len(r) >= 3:
            p = Polygon(r).buffer(0)
            acc = acc.symmetric_difference(p)
    return acc


def flatten_cubic(p0, p1, p2, p3, n):
    t = np.linspace(0, 1, n + 1)[1:, None]
    return list(map(tuple, (1 - t) ** 3 * p0 + 3 * (1 - t) ** 2 * t * p1 + 3 * (1 - t) * t ** 2 * p2 + t ** 3 * p3))


def svg_path_rings(d, steps=24):
    """Minimal SVG path parser (M L H V C S Z, absolute and relative) -> list of rings."""
    toks = re.findall(r'[MmLlHhVvCcSsZz]|[-+]?(?:\d*\.\d+|\d+\.?)(?:[eE][-+]?\d+)?', d)
    rings, ring, i = [], [], 0
    cur = np.zeros(2)
    start = np.zeros(2)
    last_ctrl, cmd = None, None
    num = lambda: float(toks[i])
    while i < len(toks):
        if re.match(r'[A-Za-z]', toks[i]):
            cmd = toks[i]
            i += 1
            if cmd in 'Zz':
                if ring:
                    rings.append(ring)
                ring, cur, last_ctrl = [], start.copy(), None
                continue
        rel = cmd.islower()
        c = cmd.upper()
        base = cur if rel else np.zeros(2)
        if c == 'M':
            cur = base + [float(toks[i]), float(toks[i + 1])]
            i += 2
            if ring:
                rings.append(ring)
            ring, start = [tuple(cur)], cur.copy()
            cmd = 'l' if rel else 'L'
            last_ctrl = None
        elif c == 'L':
            cur = base + [float(toks[i]), float(toks[i + 1])]
            i += 2
            ring.append(tuple(cur))
            last_ctrl = None
        elif c == 'H':
            cur = np.array([(cur[0] if rel else 0) + num(), cur[1]])
            i += 1
            ring.append(tuple(cur))
            last_ctrl = None
        elif c == 'V':
            cur = np.array([cur[0], (cur[1] if rel else 0) + num()])
            i += 1
            ring.append(tuple(cur))
            last_ctrl = None
        elif c in 'CS':
            if c == 'C':
                p1 = base + [float(toks[i]), float(toks[i + 1])]
                i += 2
            else:
                p1 = 2 * cur - last_ctrl if last_ctrl is not None else cur.copy()
            p2 = base + [float(toks[i]), float(toks[i + 1])]
            p3 = base + [float(toks[i + 2]), float(toks[i + 3])]
            i += 4
            ring.extend(flatten_cubic(cur, p1, p2, p3, steps))
            cur, last_ctrl = p3, p2
        else:
            raise ValueError('unsupported path command %s' % cmd)
    if ring:
        rings.append(ring)
    return rings


# --- the art, in composition coordinates (x right, y down from the top edge) ---------------------

def text_geom(s, cap, x, y, anchor='middle'):
    """Same placement as face_composition.text(): cap height in mm, (x, y) on the baseline."""
    ref = TextPath((0, 0), 'H', size=100, prop=fc.FONT).get_extents()
    k = cap / ref.height
    tp = TextPath((0, 0), s, size=100, prop=fc.FONT)
    ext = tp.get_extents()
    w = ext.width * k
    x0 = {'middle': x - w / 2, 'start': x, 'end': x - w}[anchor] - ext.x0 * k
    rings = [[(x0 + px * k, y - py * k) for px, py in poly] for poly in tp.to_polygons(closed_only=True)]
    return even_odd(rings), w


def tap_mark_geom(cx, y, height):
    """Same drawing as face_composition.tap_mark(): three round-capped arcs over a dot."""
    k = height / 10.9
    cy = y + 9.8 * k
    parts = [Point(cx, cy).buffer(1.1 * k, quad_segs=24)]
    for r in (3.2, 6.1, 9.0):
        th = np.radians(np.linspace(-45, 45, 61))
        arc = LineString(np.c_[cx + r * k * np.sin(th), cy - r * k * np.cos(th)])
        parts.append(arc.buffer(0.8 * k, quad_segs=16, cap_style='round'))
    return unary_union(parts)


def tap_row_geom(cx, t):
    k = t['icon_h'] / 10.9
    icon_w = 2 * (9.0 * math.sin(math.radians(45)) + 0.8) * k
    _, w = text_geom(t['label'], t['cap'], 0, 0, 'start')
    x0 = cx - (icon_w + t['gap'] + w) / 2
    label, _ = text_geom(t['label'], t['cap'], x0 + icon_w + t['gap'], t['y'] + t['icon_h'] / 2 + t['cap'] / 2, 'start')
    return unary_union([tap_mark_geom(x0 + icon_w / 2, t['y'], t['icon_h']), label]), icon_w + t['gap'] + w


def stars_geom(cx, s):
    r, total = s['size'] / 2, 5 * s['size'] + 4 * s['gap']
    out = []
    for n in range(5):
        sx = cx - total / 2 + r + n * (s['size'] + s['gap'])
        pts = []
        for i in range(10):
            a = -math.pi / 2 + i * math.pi / 5
            rr = r if i % 2 == 0 else r * 0.42
            pts.append((sx + rr * math.cos(a), s['cy'] + rr * math.sin(a)))
        out.append(Polygon(pts))
    return unary_union(out)


def qr_geom(q, url):
    code = segno.make(url, version=2, micro=False)             # boost_error raises the level if it fits
    m = [list(row) for row in code.matrix]
    n = len(m)
    assert n == q['modules'], 'QR is %d modules, layout expects %d' % (n, q['modules'])
    p = q['size'] / n
    cells = [box(q['x'] + c * p, q['y'] + r * p, q['x'] + (c + 1) * p, q['y'] + (r + 1) * p)
             for r in range(n) for c in range(n) if m[r][c]]
    # diagonal neighbours only touch at a corner, which would make a non-manifold body: grow 5 um
    dark = unary_union(cells).buffer(0.005, join_style='mitre')
    info = {'url': url, 'version': code.version, 'error': code.error, 'mode': code.mode, 'modules': n,
            'module_mm': round(p, 3), 'dark_modules': len(cells)}
    return dark, m, info


def g_geom(g):
    s = g['size'] / 22.0
    tf = lambda pt: (g['x'] + s * (pt[0] - 1), g['y'] + s * (pt[1] - 1))
    colours = []
    for hexcol, d in fc.G_PATHS:
        colours.append((hexcol, even_odd([[tf(p) for p in r] for r in svg_path_rings(d)])))
    # The four paths are painter-ordered: they overlap, and each one drawn later covers the earlier
    # ones (red covers the top of yellow, green the foot of blue). So the LAST path wins. The seams
    # between them do not quite close: grow each piece 30 um into its neighbours before clipping.
    outline = unary_union([c for _, c in colours]).buffer(0.03, join_style='mitre').buffer(-0.03, join_style='mitre')
    taken, out = Polygon(), []
    for hexcol, c in reversed(colours):
        piece = c.buffer(0.03, join_style='mitre').intersection(outline).difference(taken)
        piece = max(polys(piece), key=lambda p: p.area)          # drop slivers the clipping leaves
        taken = taken.union(piece)
        out.append((hexcol, piece))
    return outline, out[::-1]


# --- levels for Fusion -------------------------------------------------------------------------------

def to_card(geom):
    return affinity.affine_transform(geom, [1, 0, 0, -1, -CARD_W / 2, CARD_H])


def to_card_back(geom):
    """Drawn as seen from behind; the back faces -Z, so X is mirrored."""
    return affinity.affine_transform(geom, [-1, 0, 0, -1, CARD_W / 2, CARD_H])


def ring_list(ring):
    pts = list(ring.coords)[:-1]
    return [[round(x, 4), round(y, 4)] for x, y in pts]


def levels(geom):
    """Polygons -> alternating ext/hole levels; every ring of a level is one disjoint profile."""
    ps = [p.simplify(SIMPLIFY, preserve_topology=True) for p in polys(geom)]
    depth = [sum(1 for j, q in enumerate(ps) if j != i and Polygon(q.exterior).contains(p)) for i, p in enumerate(ps)]
    out = []
    for d in range(max(depth) + 1 if depth else 0):
        at = [p for p, dd in zip(ps, depth) if dd == d]
        out.append({'kind': 'ext', 'depth': d, 'rings': [ring_list(p.exterior) for p in at]})
        holes = [ring_list(h) for p in at for h in p.interiors]
        if holes:
            out.append({'kind': 'hole', 'depth': d, 'rings': holes})
    return out


def serial_geom(code, batch=None, serial=None):
    """The public code alone, centred where the old two-line block was.

    `batch` and `serial` are accepted and ignored: until 2026-10-03 a batch plaque also carried
    `<batch>  #<serial>`, which told a client the year and how many plaques had been made (user).
    """
    s, cx = BACK_SERIAL, CARD_W / 2
    base = (s['code_baseline'] + s['line2_baseline']) / 2 + s['code_cap'] / 2 - s['line2_cap'] / 2
    line1, w1 = text_geom(code, s['code_cap'], cx, base)
    assert w1 < CARD_W - 8, 'serial text too wide: %.1f mm' % w1
    # Open by 0.01 mm: two strokes that only touch at a point (Y4B0FB8B, 2026-10-03) make a pinch the
    # slicer reads as non-manifold. Invisible at this size; anything wider than 0.02 mm is untouched.
    return line1.buffer(-0.01, join_style='mitre').buffer(0.01, join_style='mitre'), ''


def instagram_geom(lg):
    """The 2016 icon from the library file: (silk = square minus camera, camera, square)."""
    k = lg['size'] / fc.IG_BOX
    tf_sq = lambda pt: (lg['x'] + k * pt[0], lg['y'] + k * pt[1])
    tf_cam = lambda pt: (lg['x'] + k * (pt[0] - 1.004), lg['y'] + k * (pt[1] - 1.0))   # the file's offset
    square = even_odd([[tf_sq(pt) for pt in r] for r in svg_path_rings(fc.IG_BG_D)])
    camera = even_odd([[tf_cam(pt) for pt in r] for r in svg_path_rings(fc.IG_CAM_D)])
    return square.difference(camera), camera, square


GOOGLE_NAMES = {'#4285F4': 'Blue', '#34A853': 'Green', '#FBBC05': 'Yellow', '#EA4335': 'Red'}


def build(version, code, batch, serial, out_json, out_check=None):
    code = normalize_code(code)
    qr_url = QR_BASE + code
    r, cx = fc.resolve_version(version), CARD_W / 2
    tap_row, row_w = tap_row_geom(cx, r['tap_row'])
    h = r['headline']
    head, head_w = text_geom(h['text'], h['cap'], cx, h['baseline'])
    qr, qr_matrix, qr_info = qr_geom(r['qr'], qr_url)
    back, line2_text = serial_geom(code, batch, serial)
    black = [tap_row, head, qr]
    groups, probes, check_art = [], [], []         # groups: (colour, part, role, geometry, face|back)
    l2 = r['line2']
    if l2['kind'] == 'text':
        black.append(text_geom(l2['text'], l2['cap'], cx, l2['cy'] + l2['cap'] / 2)[0])
    black = unary_union(black)
    groups.append(('Black', 'Art', 'inlay', black, 'face'))
    check_art.append((black, fc.BLACK))
    if l2['kind'] == 'stars':
        yellow = stars_geom(cx, {'cy': l2['cy'], 'size': l2['size'], 'gap': l2['gap']})
        groups.append(('Yellow', 'Stars', 'inlay', yellow, 'face'))
        check_art.append((yellow, fc.YELLOW))
        probes.append({'what': 'star centre is yellow', 'xy': Point(cx, l2['cy']), 'z': 'inlay', 'in': 'Yellow Stars'})
    lg = r['logo']
    if lg['kind'] == 'google_g':
        g_outline, g_parts = g_geom({'x': lg['x'], 'y': lg['y'], 'size': lg['size']})
        pocket = g_outline.buffer(G_CLEAR, join_style='round')
        groups.append(('Pocket', 'G', 'pocket', pocket, 'face'))
        check_art.insert(0, (pocket, '#d9d9d4'))
        for hexcol, piece in g_parts:
            name = GOOGLE_NAMES[hexcol]
            groups.append((name, 'G Token', 'token', piece, 'face'))
            check_art.append((piece, hexcol))
            rp = piece.representative_point()
            probes.append({'what': '%s G token point is that token, not card' % name, 'xy': rp, 'z': 'token',
                           'in': '%s G Token' % name, 'out': 'card'})
            probes.append({'what': '%s G token: card floor under it' % name, 'xy': rp, 'z': 'under_token', 'in': 'card'})
    elif lg['kind'] == 'instagram':
        silk, camera, square = instagram_geom(lg)
        groups.append(('Silk', 'Logo', 'inlay', silk, 'face'))
        check_art.append((silk, '#C837AB'))
        probes.append({'what': 'icon square is silk, not card',
                       'xy': max(polys(silk), key=lambda p: p.area).representative_point(),
                       'z': 'inlay', 'in': 'Silk Logo', 'out': 'card'})
        cam_in_square = camera.intersection(square)
        probes.append({'what': 'camera stroke is card white, not silk',
                       'xy': max(polys(cam_in_square), key=lambda p: p.area).representative_point(),
                       'z': 'inlay', 'in': 'card', 'out': 'Silk Logo'})
    groups.append(('Engrave', 'Serial', 'engrave', back, 'back'))
    regions = [g[3] for g in groups if g[4] == 'face' and g[2] != 'token']
    for i, a in enumerate(regions):
        for b in regions[i + 1:]:
            assert not a.intersects(b), 'art regions overlap'
    # QR probes: a module centre is 0.4 mm from its edges, so any dark / light module serves
    q = r['qr']
    qn, qp = q['modules'], q['size'] / q['modules']
    dark = next((rr, cc) for rr in range(8, qn) for cc in range(8, qn) if qr_matrix[rr][cc])
    light = next((rr, cc) for rr in range(8, qn) for cc in range(8, qn) if not qr_matrix[rr][cc])
    centre = lambda rc: Point(q['x'] + (rc[1] + 0.5) * qp, q['y'] + (rc[0] + 0.5) * qp)
    probes += [{'what': 'qr dark module is black, not card', 'xy': centre(dark), 'z': 'inlay', 'in': 'Black Art', 'out': 'card'},
               {'what': 'qr light module is card', 'xy': centre(light), 'z': 'inlay', 'in': 'card', 'out': 'Black Art'},
               {'what': 'card under the qr inlay', 'xy': centre(dark), 'z': 'under_inlay', 'in': 'card'}]
    stroke = max(polys(back), key=lambda p: p.area).representative_point()
    probes += [{'what': 'serial stroke is engraved', 'xy': stroke, 'z': 'engrave', 'out': 'card', 'back': True},
               {'what': 'card above the engraving', 'xy': stroke, 'z': 'above_engrave', 'in': 'card', 'back': True}]

    data = {'source': 'face_art.py, version %s (face_composition.resolve_version)' % version, 'version': version,
            'qr': qr_info, 'g_clearance_mm': G_CLEAR,
            'tag': {'public_code': code, 'batch_code': batch, 'serial_number': serial,
                    'qr_url': qr_url, 'nfc_url': 'https://xpot.place/n/' + code, 'back_line2': line2_text},
            'layout': {'logo': lg, 'headline': h},
            'groups': [], 'probes': []}
    for colour, part, role, geom, side in groups:
        cg = to_card_back(geom) if side == 'back' else to_card(geom)
        lv = levels(cg)
        data['groups'].append({'key': '%s %s' % (colour, part), 'colour': colour, 'part': part, 'role': role,
                               'area_mm2': round(cg.area, 3), 'regions': len(polys(cg)),
                               'rings': sum(len(l['rings']) for l in lv), 'levels': lv})
    for pr in probes:
        pt = (to_card_back if pr.pop('back', False) else to_card)(pr['xy'])
        pr['xy'] = [round(pt.x, 4), round(pt.y, 4)]
        data['probes'].append(pr)
    data['measured'] = {'tap_row_width_mm': round(row_w, 2), 'headline_width_mm': round(head_w, 2),
                        'headline_cap_mm': round(h['cap'], 3)}

    # the QR decodes back to its URL, from the exact polygons, or nothing is written
    def svg_poly(geom, fill):
        out = []
        for pg in polys(geom):
            d = 'M' + ' L'.join('%.4f %.4f' % xy for xy in list(pg.exterior.coords)[:-1]) + ' Z'
            for hole in pg.interiors:
                d += ' M' + ' L'.join('%.4f %.4f' % xy for xy in list(hole.coords)[:-1]) + ' Z'
            out.append('<path fill="%s" fill-rule="evenodd" d="%s"/>' % (fill, d))
        return ''.join(out)
    # Render the symbol with a real four-module quiet zone.  The old fixed 40 mm canvas silently
    # cropped QRs larger than 20 mm (the Large plaque is 33.25 mm), making the decode check fail for
    # the verifier rather than for the geometry.
    quiet = 4 * q['size'] / q['modules']
    canvas = q['size'] + 2 * quiet
    qr_svg = ('<svg xmlns="http://www.w3.org/2000/svg" width="%gmm" height="%gmm" viewBox="0 0 %g %g">'
              '<rect width="%g" height="%g" fill="white"/><g transform="translate(%.3f %.3f)">%s</g></svg>'
              % (canvas, canvas, canvas, canvas, canvas, canvas,
                 quiet - q['x'], quiet - q['y'], svg_poly(qr, 'black')))
    page = fitz.open(stream=qr_svg.encode(), filetype='svg')[0]
    pix = page.get_pixmap(matrix=fitz.Matrix(6, 6), alpha=False)
    import cv2
    img = np.frombuffer(pix.samples, dtype=np.uint8).reshape(pix.height, pix.width, pix.n)
    decoded, _, _ = cv2.QRCodeDetector().detectAndDecode(cv2.cvtColor(img, cv2.COLOR_RGB2GRAY))
    assert decoded == qr_url, 'QR decodes to %r, expected %r' % (decoded, qr_url)
    os.makedirs(os.path.dirname(out_json), exist_ok=True)
    json.dump(data, open(out_json, 'w', encoding='utf-8'), indent=0)
    if out_check:
        art = ''.join(svg_poly(geom, fill) for geom, fill in check_art)
        fc.render(fc.sheet([('front', art), ('back (engraved)', svg_poly(back, '#b9b9b2'))]), out_check)
    return data, decoded


def main():
    import argparse
    ap = argparse.ArgumentParser(description=__doc__.split('\n')[0])
    ap.add_argument('--version', default='all', help='a key of face_composition.VERSIONS, or all')
    ap.add_argument('--code', default=SAMPLE_CODE, help='Smart Tags public code (default: the spec sample)')
    ap.add_argument('--batch', default='', help='batch code engraved on the back (none: the code alone)')
    ap.add_argument('--serial', default='', help='serial number within the batch')
    ap.add_argument('--out', default=None, help='JSON path (one version only); default face_art_<version>.json')
    ap.add_argument('--check', default='default', help="2D check render path, '' for none")
    a = ap.parse_args()
    versions = list(fc.VERSIONS) if a.version == 'all' else [a.version]
    for v in versions:
        out = a.out if (a.out and len(versions) == 1) else OUT_JSON % v
        check = OUT_CHECK % v if a.check == 'default' else (a.check or None)
        data, decoded = build(v, a.code, a.batch, a.serial, out, check)
        print(json.dumps({'version': v, 'tag': data['tag']['public_code'],
                          'qr': '%s v%d-%s' % (decoded, data['qr']['version'], data['qr']['error']),
                          'groups': {g['key']: [g['role'], g['area_mm2'], g['regions']] for g in data['groups']},
                          'probes': len(data['probes']), 'measured': data['measured']}))


if __name__ == '__main__':
    main()
