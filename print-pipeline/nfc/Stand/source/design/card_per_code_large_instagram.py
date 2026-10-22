"""Build one 103 x 137 mm INSTAGRAM plaque card for one Xpot tag code (generic plaque: no @handle).

Counterpart of ``card_per_code_large.py`` (Google) and ``card_face_v2.py`` (the fill-then-cut pattern).
It starts from the Google Large card mesh (``source/mesh/large/White_Google_Card.stl``: frame = card face up,
face at z = CARD_T, back at z 0, with the sealed NFC cavity at z 0.64-1.92 in this frame = print z 1.64-2.92),
fills the old Google face back to plain card, trims it flat, and cuts the Instagram face in at 0.52 mm:

    White_Instagram_Card.stl   the card body (face cut, back engraved with the code alone, 0.32 deep)
    Black_Instagram_Art.stl    tap row + headline + QR inlays (z CARD_T-0.52 .. CARD_T)
    Silk_Instagram_Logo.stl    the Instagram icon square minus the camera (the camera stays card white)

    python card_per_code_large_instagram.py   -> production/IG-SAMPLE/mesh/001/*.stl (the SAMPLE code)
                                                 and preview/face/face-large-instagram.png

Layout numbers live in FACE_IG (user decisions, 2026-10-04); composition coordinates, y down from the top edge.
"""
import os
import sys

import manifold3d as m3
import numpy as np
import trimesh
from shapely import affinity
from shapely.geometry import Point, box
from shapely.ops import unary_union

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import face_art as fa  # noqa: E402
import face_art_large as large  # noqa: E402
import face_composition_large as fc  # noqa: E402

large.configure()

PIECE = os.path.dirname(os.path.dirname(HERE))
SAMPLE_MESH = os.path.join(PIECE, 'source', 'mesh', 'large')
W, H = fc.CARD_W, fc.CARD_H
CARD_T = 3.56
TOP = float(np.float32(CARD_T))      # the sample mesh stores z in float32: trim and art tops use the same number
INLAY, BACK_ENGRAVE = 0.52, 0.32
OLD_INLAY, OLD_POCKET = 0.52, 1.0    # the Google face being filled back
OVER = 0.05                          # fills reach this far past what they fill, then the card is trimmed flat
FACE_INSET = 0.6                     # the face fill stays inside the 0.5 mm face chamfer
G_FILL_BUFFER = 0.3
SLOT_LINE = H - fc.HIDDEN            # y (down) from which the card sits in the base slot
SIMPLIFY = 0.002

FACE_IG = {
    'tap_row': {'y': 8.0, 'icon_h': 9.0, 'cap': 6.2, 'gap': 3.0, 'label': 'Tap here'},
    'icon': {'size': 32.0, 'y': 21.0},
    'headline': {'text': 'Follow us on Instagram', 'baseline': 68.0, 'max_width': 86.0},
    'qr': {'size': 33.25, 'modules': 25, 'y': 80.0},
}


def headline_cap():
    """The largest cap height at which the headline is max_width wide (width is linear in cap)."""
    h = FACE_IG['headline']
    _, w = fa.text_geom(h['text'], 6.0, 0, 0)
    return 6.0 * h['max_width'] / w


def layout(code):
    """The Instagram face for one code, composition coordinates. Returns dict of geoms + numbers."""
    large.configure()
    cx = W / 2
    tap_geom, tap_w = fa.tap_row_geom(cx, FACE_IG['tap_row'])
    ic = FACE_IG['icon']
    silk, camera, square = fa.instagram_geom({'x': cx - ic['size'] / 2, 'y': ic['y'], 'size': ic['size']})
    h = FACE_IG['headline']
    cap = headline_cap()
    head, head_w = fa.text_geom(h['text'], cap, cx, h['baseline'])
    q = FACE_IG['qr']
    dark, _, info = fa.qr_geom({'x': cx - q['size'] / 2, 'y': q['y'], 'size': q['size'], 'modules': q['modules']},
                               fa.QR_BASE + code)
    assert info['url'] == fa.QR_BASE + code
    lowest = max(g.bounds[3] for g in (tap_geom, silk, head, dark))
    assert lowest <= SLOT_LINE - 1.5, 'face reaches %.2f mm, slot line %.2f' % (lowest, SLOT_LINE)
    assert head_w <= h['max_width'] + 1e-6 and tap_w <= W - 8
    simp = lambda g: g.simplify(SIMPLIFY, preserve_topology=True)
    return {'black': simp(unary_union([tap_geom, head, dark])), 'silk': simp(silk), 'camera': camera,
            'square': square, 'qr': info, 'qr_dark': dark, 'headline': head, 'cap': cap, 'headline_w': head_w,
            'lowest_y': lowest}


def outline():
    """The card as drawn (y down from the top edge): top corners R_TOP, bottom corners R_BOTTOM."""
    g = box(0, 0, W, H)
    rt, rb = fc.R_TOP, fc.R_BOTTOM
    for cx, cy, r, sx, sy in ((rt, rt, rt, 0, 0), (W - rt, rt, rt, W - rt, 0),
                              (rb, H - rb, rb, 0, H - rb), (W - rb, H - rb, rb, W - rb, H - rb)):
        g = g.difference(box(sx, sy, sx + r, sy + r)).union(Point(cx, cy).buffer(r, quad_segs=32))
    return g


def prism(geom, z0, z1):
    rings = []
    for p in fa.polys(geom):
        rings.append(np.asarray(p.exterior.coords[:-1], np.float64))
        rings += [np.asarray(h.coords[:-1], np.float64) for h in p.interiors]
    return m3.CrossSection(rings, m3.FillRule.EvenOdd).extrude(z1 - z0).translate((0.0, 0.0, z0))


def to_manifold(tm):
    return m3.Manifold(m3.Mesh(vert_properties=np.asarray(tm.vertices, np.float32),
                               tri_verts=np.asarray(tm.faces, np.uint32)))


def to_trimesh(mf):
    mesh = mf.to_mesh()
    return trimesh.Trimesh(np.asarray(mesh.vert_properties)[:, :3], np.asarray(mesh.tri_verts), process=False)


def welded_bad_edges(tm):
    """Non-manifold edges as the 3MF builder sees them (STL welded on a 1e-5 grid)."""
    pts = tm.vertices[tm.faces].reshape(-1, 3).astype(np.float32).astype(np.float64)
    _, inv = np.unique(np.round(pts / 1e-5).astype(np.int64), axis=0, return_inverse=True)
    f = inv.reshape(-1, 3)
    e = np.sort(np.concatenate([f[:, [0, 1]], f[:, [1, 2]], f[:, [2, 0]]]), axis=1)
    _, c = np.unique(e, axis=0, return_counts=True)
    return int((c != 2).sum())


def decode_qr_polygons(dark, q, url):
    """Rasterise the QR polygons (card frame: x centred, y up) with a quiet zone and decode them."""
    import cv2
    import fitz
    quiet = 4 * q['size'] / q['modules']
    x0, x1 = -q['size'] / 2 - quiet, q['size'] / 2 + quiet
    y1 = H - q['y'] + quiet                     # card-frame y of the symbol's top edge + quiet
    y0 = H - q['y'] - q['size'] - quiet
    paths = []
    for pg in fa.polys(dark):
        d = 'M' + ' L'.join('%.4f %.4f' % (x - x0, y1 - y) for x, y in list(pg.exterior.coords)[:-1]) + ' Z'
        for hole in pg.interiors:
            d += ' M' + ' L'.join('%.4f %.4f' % (x - x0, y1 - y) for x, y in list(hole.coords)[:-1]) + ' Z'
        paths.append('<path fill="black" fill-rule="evenodd" d="%s"/>' % d)
    cw, ch = x1 - x0, y1 - y0
    svg = ('<svg xmlns="http://www.w3.org/2000/svg" width="%gmm" height="%gmm" viewBox="0 0 %g %g">'
           '<rect width="%g" height="%g" fill="white"/>%s</svg>' % (cw, ch, cw, ch, cw, ch, ''.join(paths)))
    pix = fitz.open(stream=svg.encode(), filetype='svg')[0].get_pixmap(matrix=fitz.Matrix(6, 6), alpha=False)
    img = np.frombuffer(pix.samples, dtype=np.uint8).reshape(pix.height, pix.width, pix.n)
    out, _, _ = cv2.QRCodeDetector().detectAndDecode(cv2.cvtColor(img, cv2.COLOR_RGB2GRAY))
    return out


def mesh_section_polygons(tm, z):
    """The mesh cut at height z as even-odd polygons (shapely polygonize: no networkx needed)."""
    from shapely.geometry import LineString
    from shapely.ops import polygonize
    segs = trimesh.intersections.mesh_plane(tm, [0, 0, 1], [0, 0, z])
    faces = list(polygonize(unary_union([LineString(np.round(s[:, :2], 5)) for s in segs])))
    # every ring of the section is the exterior of one face (a hole's ring bounds the face inside it)
    return fa.even_odd([list(f.exterior.coords)[:-1] for f in faces])


def build(code, batch, serial, out_dir):
    """Write the three STLs for one card. `batch` and `serial` are accepted for the ledger; the back carries the
    code alone (user, 2026-10-04)."""
    large.configure()
    code = fa.normalize_code(code)
    art = layout(code)
    black, silk = fa.to_card(art['black']), fa.to_card(art['silk'])
    back_comp, _ = fa.serial_geom(code)                       # code only: batch/serial ignored by serial_geom
    s_back_comp, _ = fa.serial_geom(fa.SAMPLE_CODE)
    back = fa.to_card_back(back_comp.simplify(SIMPLIFY, preserve_topology=True))
    s_back, n_back = fa.to_card_back(s_back_comp), fa.to_card_back(back_comp)
    assert back_comp.bounds[3] <= SLOT_LINE - 1.5, 'back serial reaches the slot'

    # the old Google G pocket footprint, from the Google layout's own G position
    r = fc.resolve_version('google')['logo']
    g_outline, _ = fa.g_geom({'x': r['x'], 'y': r['y'], 'size': r['size']})
    g_fill = fa.to_card(g_outline.buffer(fa.G_CLEAR + G_FILL_BUFFER, join_style='round'))

    card0 = trimesh.load(os.path.join(SAMPLE_MESH, 'White_Google_Card.stl'), force='mesh', process=True)
    lo, hi = card0.bounds
    card = to_manifold(card0)

    # 1. the whole old face back to plain card (old inlays above CARD_T-0.57), inside the face chamfer
    inset = fa.to_card(outline().buffer(-FACE_INSET, join_style='round'))
    card = card + prism(inset, TOP - OLD_INLAY - OVER, TOP + OVER)
    # 2. the old G pocket footprint, 1.0 deep + OVER (the NFC cavity is at z 0.64-1.92, far below)
    card = card + prism(g_fill, TOP - OLD_POCKET - OVER, TOP + OVER)
    # 3. the sample's back serial back to plain card (the code is re-engraved below)
    serial_fill = box(*unary_union([s_back, n_back]).bounds).buffer(0.3, join_style='mitre')
    card = card + prism(serial_fill, -OVER, BACK_ENGRAVE + OVER)
    # 4. trim flat to the card's own faces
    slab = m3.Manifold.cube([hi[0] - lo[0] + 2, hi[1] - lo[1] + 2, TOP]).translate((lo[0] - 1, lo[1] - 1, 0.0))
    card = card ^ slab
    plain = to_trimesh(card)
    plain_volume = plain.volume
    plain_shells = len(card.decompose())

    # 5. cut the Instagram face and this code's back
    card = (card - prism(unary_union([black, silk]), TOP - INLAY, TOP + 0.2) - prism(back, -0.2, BACK_ENGRAVE))
    card_tm = to_trimesh(card)
    black_tm = to_trimesh(prism(black, TOP - INLAY, TOP))
    silk_tm = to_trimesh(prism(silk, TOP - INLAY, TOP))

    want = plain_volume - (black.area + silk.area) * INLAY - back.area * BACK_ENGRAVE
    rep = {
        'code': code, 'batch': batch, 'serial': str(serial), 'qr_url': art['qr']['url'],
        'qr_modules': art['qr']['modules'], 'qr_module_mm': art['qr']['module_mm'],
        'headline_cap_mm': round(art['cap'], 3), 'headline_width_mm': round(art['headline_w'], 2),
        'icon_mm': FACE_IG['icon']['size'], 'face_lowest_y_mm': round(art['lowest_y'], 2),
        'slot_line_y_mm': SLOT_LINE,
        'plain_card_mm3': round(plain_volume, 1), 'plain_shells': plain_shells,
        'card_mm3': round(card_tm.volume, 1), 'card_expected_mm3': round(want, 1),
        'black_mm3': round(black_tm.volume, 2), 'black_expected_mm3': round(black.area * INLAY, 2),
        'silk_mm3': round(silk_tm.volume, 2), 'silk_expected_mm3': round(silk.area * INLAY, 2),
        'card_watertight': bool(card_tm.is_watertight), 'black_watertight': bool(black_tm.is_watertight),
        'silk_watertight': bool(silk_tm.is_watertight), 'card_shells': len(card.decompose()),
        'bad_edges': welded_bad_edges(card_tm) + welded_bad_edges(black_tm) + welded_bad_edges(silk_tm),
        'card_bounds': card_tm.bounds.round(3).tolist(),
    }

    # QR must decode back to the URL, from the exact polygons and from the written art mesh
    q = {'size': FACE_IG['qr']['size'], 'modules': FACE_IG['qr']['modules'], 'y': FACE_IG['qr']['y']}
    rep['qr_decoded_polygons'] = decode_qr_polygons(fa.to_card(art['qr_dark']), q, art['qr']['url'])
    sec = mesh_section_polygons(black_tm, TOP - INLAY / 2)
    qr_box = box(-q['size'] / 2 - 1, H - q['y'] - q['size'] - 1, q['size'] / 2 + 1, H - q['y'] + 1)
    rep['qr_decoded_mesh'] = decode_qr_polygons(sec.intersection(qr_box), q, art['qr']['url'])

    ok = (abs(card_tm.volume - want) / want < 0.005
          and abs(black_tm.volume - black.area * INLAY) / (black.area * INLAY) < 0.005
          and abs(silk_tm.volume - silk.area * INLAY) / (silk.area * INLAY) < 0.005
          and card_tm.is_watertight and black_tm.is_watertight and silk_tm.is_watertight
          and rep['card_shells'] == 2 and plain_shells == 2 and rep['bad_edges'] == 0
          and rep['qr_decoded_polygons'] == art['qr']['url'] and rep['qr_decoded_mesh'] == art['qr']['url']
          and abs(card_tm.bounds[1][2] - TOP) < 1e-4 and abs(card_tm.bounds[0][2]) < 1e-4)
    rep['ok'] = bool(ok)
    if not ok:
        raise RuntimeError('Instagram Large card failed its checks, nothing written: %s' % rep)
    os.makedirs(out_dir, exist_ok=True)
    card_tm.export(os.path.join(out_dir, 'White_Instagram_Card.stl'))
    black_tm.export(os.path.join(out_dir, 'Black_Instagram_Art.stl'))
    silk_tm.export(os.path.join(out_dir, 'Silk_Instagram_Logo.stl'))
    return rep


def measure_text():
    """Stroke and gap numbers of the headline, with text_ladder's helpers (strokes are NOT thickened)."""
    sys.path.insert(0, os.path.join(PIECE, 'test'))
    import text_ladder as tl
    cap = headline_cap()
    head, _ = fa.text_geom(FACE_IG['headline']['text'], cap, W / 2, FACE_IG['headline']['baseline'])
    l_stem, _ = fa.text_geom('l', cap, 0, 0)
    ps = fa.polys(head)
    zero = sum(1 for i in range(len(ps)) for j in range(i + 1, len(ps)) if ps[i].distance(ps[j]) == 0)
    return {'cap_mm': round(cap, 3), 'e_bar_mm': round(tl.e_bar(tl.BOLD, cap), 3),
            'l_stem_mm': round(l_stem.bounds[2] - l_stem.bounds[0], 3),
            'min_letter_gap_mm': round(tl.min_gap(head), 3), 'glyph_polygons': len(ps), 'touching_pairs': zero}


def preview(code=fa.SAMPLE_CODE, out=None):
    large.configure()
    out = out or os.path.join(PIECE, 'preview', 'face', 'face-large-instagram.png')
    art = layout(code)

    def svg_poly(geom, fill):
        parts = []
        for pg in fa.polys(geom):
            d = 'M' + ' L'.join('%.4f %.4f' % xy for xy in list(pg.exterior.coords)[:-1]) + ' Z'
            for hole in pg.interiors:
                d += ' M' + ' L'.join('%.4f %.4f' % xy for xy in list(hole.coords)[:-1]) + ' Z'
            parts.append('<path fill="%s" fill-rule="evenodd" d="%s"/>' % (fill, d))
        return ''.join(parts)

    defs = ''      # the renderer ignores gradients: silk is drawn as its pink, the real filament goes pink to purple
    slot = ('<line x1="0" y1="%g" x2="%g" y2="%g" stroke="#d33" stroke-width="0.3" stroke-dasharray="1.5 1"/>'
            % (SLOT_LINE, W, SLOT_LINE))
    inner = defs + svg_poly(art['silk'], '#FF66CC') + svg_poly(art['black'], '#111111') + slot
    fc.render(fc.sheet([('Instagram large', inner)]), out)
    return out


if __name__ == '__main__':
    out = os.path.join(PIECE, 'production', 'IG-SAMPLE', 'mesh', '001')
    print(measure_text())
    print(build(fa.SAMPLE_CODE, 'IG-SAMPLE', '001', out))
    print(preview())
