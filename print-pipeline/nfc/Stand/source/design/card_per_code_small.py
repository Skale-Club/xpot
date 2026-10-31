"""Build one 60 x 85 mm Small Stand card for one Xpot tag code: Google, Instagram or Menu, white or black.

The Small card fits `base-small` (68 x 48 x 12, the bottom 9.5 mm of the card in its slot). It starts from the
retired Small Stand's Fusion card (Fusion version 8, 2026-10-03; `source/mesh/small/`, copied from the 3D Printing
repo's NFC Signs/Stand/source/mesh/small on 2026-10-31: card face up, back at z 0, face at z 3.56, centred at
x -45), whose 25 mm round tag cavity (card z 0.96-1.92, centre 15 mm below the top edge) is filled back and replaced
by the 10 x 20 NTAG213 sticker pocket every new model takes (23.00 x 13.00 x 0.48, long side left-right, under Tap
here, 1.4 mm clear of the G pocket; its depth by theme, as on the Large card: card_per_code_large.sticker_pocket_z).

    google     the retired card's own face (card_per_code.py in the 3D repo): the sample's art kept, its QR and back
               serial swapped for the code's; the 13.5 mm G token (g-token-small-stand) sits in its pocket
               -> White_Google_Card.stl, Black_Google_Art.stl, Yellow_Google_Stars.stl
    instagram  face_composition's Small Instagram face ("B": the 18 mm icon, one headline line), cut into the card
               filled back to plain (the Large Instagram card's way)
               -> White_Instagram_Card.stl, Black_Instagram_Art.stl, Silk_Instagram_Logo.stl
    menu       the Menu face (card_per_code_large_menu.layout) at the Small Stand's measures
               -> White_Menu_Card.stl, Black_Menu_Art.stl

The file names are the white card's on every face: a black card prints the same names with the body and art
filaments swapped in the recipe (the Menu's art and every pocket depth do differ by theme).

    python card_per_code_small.py   -> preview/face/face-small-stand.png and the sample builds
"""
import glob
import os
import sys

import manifold3d as m3
import numpy as np
import trimesh
from shapely import affinity
from shapely.geometry import Point, Polygon, box
from shapely.ops import unary_union

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import face_art as fa  # noqa: E402
import face_art_small as small  # noqa: E402
import face_composition as fc  # noqa: E402
import card_per_code_large as google  # noqa: E402   (the sticker: size, radius, depth by theme)
import card_per_code_large_instagram as ig  # noqa: E402   (to_manifold, to_trimesh, welded_bad_edges, QR decode)
import card_per_code_large_menu as menu  # noqa: E402   (the Menu face)

small.configure()

PIECE = os.path.dirname(os.path.dirname(HERE))
SAMPLE_MESH = os.path.join(PIECE, 'source', 'mesh', 'small')
W, H = fc.CARD_W, fc.CARD_H
CARD_T, INLAY, BACK_ENGRAVE = 3.56, 0.52, 0.32
TOP = float(np.float32(CARD_T))
X_OFF = -45.0                   # Fusion laid the versions side by side: the card's centre sits at x -45
FILL_MARGIN, OVER = 0.3, 0.05
OLD_POCKET = 1.0                # the G token pocket, 1.0 deep from the face
FACE_INSET = 0.6                # the face fill stays inside the 0.5 mm face chamfer
SLOT_LINE = H - fc.HIDDEN       # y (down) from which the card sits in the base slot
SIMPLIFY = 0.002

# card frame (x centred, y up from the bottom edge), measured on the sample card
ROUND_CENTRE, ROUND_D, ROUND_Z0, ROUND_Z1 = (0.0, 70.0), 25.6, 0.96, 1.92
STICKER_CENTRE = (0.0, 76.0)    # y 69.5-82.5: under Tap here; the G pocket ends at y 68.1, the top edge is y 85

FACE_MENU_SMALL = {
    'tap_row': dict(fc.LAYOUT_V5['tap_row']),
    'title': {'text': 'Menu', 'cap': 30.0, 'max_width': fc.FACE['headline']['max_width']},
    'subtitle': {'text': 'Scan or tap to view', 'cap': fc.FACE['headline']['cap'], 'gap': 3.5,
                 'max_width': fc.FACE['headline']['max_width']},
    'qr': {'size': fc.LAYOUT_V5['qr']['size'], 'modules': 25, 'y': fc.LAYOUT_V5['qr']['y'], 'border_modules': 1},
}
FACES = ('google', 'instagram', 'menu')
PARTS = {
    'google': ('White_Google_Card.stl', 'Black_Google_Art.stl', 'Yellow_Google_Stars.stl'),
    'instagram': ('White_Instagram_Card.stl', 'Black_Instagram_Art.stl', 'Silk_Instagram_Logo.stl'),
    'menu': ('White_Menu_Card.stl', 'Black_Menu_Art.stl'),
}


def load(path):
    return trimesh.load(path, force='mesh', process=True)


def prism(geom, z0, z1):
    """A card-frame (multi)polygon -> manifold prism from z0 to z1, in the mesh frame (x shifted by X_OFF)."""
    geom = affinity.translate(geom, X_OFF, 0)
    rings = []
    for p in fa.polys(geom):
        rings.append(np.asarray(p.exterior.coords[:-1], np.float64))
        rings += [np.asarray(h.coords[:-1], np.float64) for h in p.interiors]
    return m3.CrossSection(rings, m3.FillRule.EvenOdd).extrude(z1 - z0).translate((0.0, 0.0, z0))


def outline():
    """The card as drawn (y down from the top edge): top corners R_TOP, bottom corners R_BOTTOM."""
    g = box(0, 0, W, H)
    rt, rb = fc.R_TOP, fc.R_BOTTOM
    for cx, cy, r, sx, sy in ((rt, rt, rt, 0, 0), (W - rt, rt, rt, W - rt, 0),
                              (rb, H - rb, rb, 0, H - rb), (W - rb, H - rb, rb, W - rb, H - rb)):
        g = g.difference(box(sx, sy, sx + r, sy + r)).union(Point(cx, cy).buffer(r, quad_segs=32))
    return g


def sticker_pocket():
    cx, cy = STICKER_CENTRE
    w, h, r = google.STICKER_W / 2, google.STICKER_H / 2, google.STICKER_RADIUS
    return box(cx - w + r, cy - h + r, cx + w - r, cy + h - r).buffer(r, quad_segs=24)


def slice_polys(card, z):
    return sorted((Polygon(p) for p in card.slice(z).to_polygons()), key=lambda p: -p.area)


def check_sticker(card, pocket, print_z):
    """One hole of the pocket's area in a section through it (a black card's also crosses the G pocket, 1.4 mm
    away, which stays a separate hole), and nothing left of the round cavity."""
    pocket_mesh = affinity.translate(pocket, X_OFF, 0)
    here = [p for p in slice_polys(card, CARD_T - sum(print_z) / 2)[1:] if p.intersects(pocket_mesh)]
    section = round(sum(p.area for p in here), 2)
    rep = {'sticker_section_mm2': section, 'sticker_expected_mm2': round(pocket.area, 2),
           'round_cavity_filled': len(card.slice((ROUND_Z0 + ROUND_Z1) / 2).to_polygons()) == 1}
    rep['sticker_ok'] = len(here) == 1 and abs(section - pocket.area) < 0.5 and rep['round_cavity_filled']
    return rep


def round_fill():
    return Point(*ROUND_CENTRE).buffer(ROUND_D / 2 + FILL_MARGIN, quad_segs=64)


def backs(code):
    """(this code's back engraving, the sample's), card frame, mirrored as seen from behind."""
    back_comp, _ = fa.serial_geom(code)
    s_back_comp, _ = fa.serial_geom(fa.SAMPLE_CODE)
    assert back_comp.bounds[3] <= SLOT_LINE - 1.5, 'back serial reaches the slot'
    return fa.to_card_back(back_comp), fa.to_card_back(s_back_comp)


def trim(card):
    lo, hi = np.asarray(card.bounding_box()[:3]), np.asarray(card.bounding_box()[3:])
    return card ^ m3.Manifold.cube([hi[0] - lo[0] + 2, hi[1] - lo[1] + 2, TOP]).translate((lo[0] - 1, lo[1] - 1, 0.0))


def decode(dark_card, q, url):
    return ig.decode_qr_polygons(dark_card, q, url, H)


def mesh_qr(art_tm, q):
    """The art mesh's section through the inlay, inside the QR's box (card frame)."""
    sec = affinity.translate(ig.mesh_section_polygons(art_tm, TOP - INLAY / 2), -X_OFF, 0)
    return sec.intersection(box(-q['size'] / 2 - 1, H - q['y'] - q['size'] - 1, q['size'] / 2 + 1, H - q['y'] + 1))


# --- Google: the retired card's face, its QR and serial swapped ------------------------------------------------

def build_google(code, theme, sticker, out_dir):
    r = fc.resolve_version('google')
    q = r['qr']
    n_dark, _, info = fa.qr_geom(q, fa.QR_BASE + code)
    n_dark = fa.to_card(n_dark)
    n_back, s_back = backs(code)
    # two back glyphs that touch at one point make a non-manifold edge the 3MF assembler refuses (the Large
    # sticker card's YYD1GRAY): shrink the engraving 0.01 mm, as there
    n_back = n_back.buffer(-.01, join_style='mitre')
    square = fa.to_card(box(q['x'], q['y'], q['x'] + q['size'], q['y'] + q['size']))
    qr_fill = square.buffer(FILL_MARGIN, join_style='mitre')
    serial_fill = box(*unary_union([s_back, n_back]).bounds).buffer(FILL_MARGIN, join_style='mitre')

    card0 = load(os.path.join(SAMPLE_MESH, 'White_Google_Card.stl'))
    card = ig.to_manifold(card0)
    card = card + prism(qr_fill, CARD_T - INLAY - OVER, CARD_T)
    card = card + prism(serial_fill, -OVER, BACK_ENGRAVE + OVER)
    card = card + prism(round_fill(), ROUND_Z0 - OVER, ROUND_Z1 + OVER)
    card = trim(card)
    # the sample's QR is not this pipeline's (the retired card encoded skale.club/q/), so the checks measure the
    # filled card and the kept art instead of subtracting the sample's QR: the QR square must be plain card now
    plain_volume = ig.to_trimesh(card).volume
    square_mesh = affinity.translate(square, X_OFF, 0)
    qr_left = [p for p in slice_polys(card, TOP - INLAY / 2)[1:] if p.intersects(square_mesh)]
    card = card - prism(n_dark, CARD_T - INLAY, CARD_T + 0.2) - prism(n_back, -0.2, BACK_ENGRAVE)
    card = card - prism(sticker['pocket'], CARD_T - sticker['print_z'][1], CARD_T - sticker['print_z'][0])

    keep, dropped = [], 0
    qr_box_mesh = affinity.translate(qr_fill, X_OFF, 0)
    art_paths = sorted(glob.glob(os.path.join(SAMPLE_MESH, 'Black_Google_Art_*.stl')))
    for path in art_paths:
        tm = load(path)
        cx, cy = tm.bounds.mean(axis=0)[:2]
        if qr_box_mesh.contains(box(cx, cy, cx, cy).centroid):
            dropped += 1
        else:
            keep.append(tm)
    art = ig.to_manifold(trimesh.util.concatenate(keep)) + prism(n_dark, CARD_T - INLAY, CARD_T)
    card_tm, art_tm = ig.to_trimesh(card), ig.to_trimesh(art)
    want_card = (plain_volume - n_dark.area * INLAY - n_back.area * BACK_ENGRAVE
                 - sticker['pocket'].area * google.STICKER_DEPTH)
    want_art = sum(tm.volume for tm in keep) + n_dark.area * INLAY
    qd = {'size': q['size'], 'modules': q['modules'], 'y': q['y']}
    url = info['url']
    rep = {'qr_url': url, 'qr_modules': info['modules'], 'qr_module_mm': info['module_mm'],
           'card_mm3': round(card_tm.volume, 1), 'card_expected_mm3': round(want_card, 1),
           'art_mm3': round(art_tm.volume, 1), 'art_expected_mm3': round(want_art, 1),
           'sample_qr_pieces_dropped': dropped, 'sample_qr_left': len(qr_left), 'plain_card_mm3': round(plain_volume, 1),
           'qr_decoded_polygons': decode(n_dark, qd, url), 'qr_decoded_mesh': decode(mesh_qr(art_tm, qd), qd, url)}
    vol_ok = (abs(card_tm.volume - want_card) / want_card < 0.005 and abs(art_tm.volume - want_art) / want_art < 0.005
              and dropped > 0 and not qr_left)
    stars = trimesh.util.concatenate([load(p) for p in sorted(glob.glob(os.path.join(SAMPLE_MESH, 'Yellow_Google_Stars_*.stl')))])
    return card, [card_tm, art_tm, stars], rep, vol_ok


# --- Instagram and Menu: the card filled back to plain, the new face cut in ------------------------------------

def plain_card(s_back, n_back, sticker):
    """The sample card with its face, G pocket, back serial and round cavity filled back to plain card, trimmed
    flat; (card, plain volume). The sticker pocket is cut after the volume is measured."""
    r = fc.resolve_version('google')['logo']
    g_outline, _ = fa.g_geom({'x': r['x'], 'y': r['y'], 'size': r['size']})
    g_fill = fa.to_card(g_outline.buffer(fa.G_CLEAR + 0.3, join_style='round'))
    card = ig.to_manifold(load(os.path.join(SAMPLE_MESH, 'White_Google_Card.stl')))
    inset = fa.to_card(outline().buffer(-FACE_INSET, join_style='round'))
    card = card + prism(inset, TOP - INLAY - OVER, TOP + OVER)
    card = card + prism(g_fill, TOP - OLD_POCKET - OVER, TOP + OVER)
    serial_fill = box(*unary_union([s_back, n_back]).bounds).buffer(FILL_MARGIN, join_style='mitre')
    card = card + prism(serial_fill, -OVER, BACK_ENGRAVE + OVER)
    card = card + prism(round_fill(), ROUND_Z0 - OVER, ROUND_Z1 + OVER)
    card = trim(card)
    plain_volume = ig.to_trimesh(card).volume
    # the face must be plain everywhere: a section through the inlay depth is the outline alone
    assert len(card.slice(TOP - INLAY / 2).to_polygons()) == 1, 'old face left on the plain card'
    assert len(card.decompose()) == 1, 'the plain card is not one solid'
    card = card - prism(sticker['pocket'], TOP - sticker['print_z'][1], TOP - sticker['print_z'][0])
    return card, plain_volume


def instagram_layout(code):
    r, cx = fc.resolve_version('instagram'), W / 2
    tap, _ = fa.tap_row_geom(cx, r['tap_row'])
    silk, _, _ = fa.instagram_geom(r['logo'])
    head, head_w = fa.text_geom(r['headline']['text'], r['headline']['cap'], cx, r['headline']['baseline'])
    dark, _, info = fa.qr_geom(r['qr'], fa.QR_BASE + code)
    lowest = max(g.bounds[3] for g in (tap, silk, head, dark))
    assert lowest <= SLOT_LINE - 1.5, 'face reaches %.2f mm, slot line %.2f' % (lowest, SLOT_LINE)
    simp = lambda g: g.simplify(SIMPLIFY, preserve_topology=True)
    return {'inks': [simp(unary_union([tap, head, dark])), simp(silk)], 'dark': dark, 'qr': info,
            'q': r['qr'], 'headline_cap': r['headline']['cap'], 'headline_w': head_w, 'lowest_y': lowest}


def menu_layout(code, theme, font):
    art = menu.layout(code, theme, font, FACE_MENU_SMALL, W, SLOT_LINE)
    art.update(inks=[art['ink']], q=FACE_MENU_SMALL['qr'])
    return art


def build_refaced(face, code, theme, sticker, font):
    art = instagram_layout(code) if face == 'instagram' else menu_layout(code, theme, font)
    inks = [fa.to_card(g) for g in art['inks']]
    n_back, s_back = backs(code)
    back = n_back.simplify(SIMPLIFY, preserve_topology=True)
    card, plain_volume = plain_card(s_back, n_back, sticker)
    card = card - prism(unary_union(inks), TOP - INLAY, TOP + 0.2) - prism(back, -0.2, BACK_ENGRAVE)
    card_tm = ig.to_trimesh(card)
    ink_tms = [ig.to_trimesh(prism(g, TOP - INLAY, TOP)) for g in inks]
    ink_area = sum(g.area for g in inks)
    want = plain_volume - ink_area * INLAY - back.area * BACK_ENGRAVE - sticker['pocket'].area * google.STICKER_DEPTH
    q = {'size': art['q']['size'], 'modules': art['q']['modules'], 'y': art['q']['y']}
    url = art['qr']['url']
    section = mesh_qr(ink_tms[0], q)
    mesh_dark = fa.to_card(art['panel']).difference(section) if face == 'menu' and theme == 'black' else section
    rep = {'qr_url': url, 'qr_modules': art['qr']['modules'], 'qr_module_mm': art['qr']['module_mm'],
           'face_lowest_y_mm': round(art['lowest_y'], 2), 'plain_card_mm3': round(plain_volume, 1),
           'card_mm3': round(card_tm.volume, 1), 'card_expected_mm3': round(want, 1),
           'art_mm3': [round(t.volume, 2) for t in ink_tms], 'art_expected_mm3': [round(g.area * INLAY, 2) for g in inks],
           'qr_decoded_polygons': decode(fa.to_card(art['dark']), q, url),
           'qr_decoded_mesh': decode(mesh_dark.intersection(box(-q['size'] / 2 - 1, H - q['y'] - q['size'] - 1,
                                                                q['size'] / 2 + 1, H - q['y'] + 1)), q, url)}
    if face == 'menu':
        rep.update(font=font, title_cap_mm=round(art['title_cap'], 2), subtitle_width_mm=round(art['subtitle_w'], 2),
                   menu_gap_mm=round(art['gap'], 2))
    else:
        rep.update(headline_cap_mm=round(art['headline_cap'], 3), headline_width_mm=round(art['headline_w'], 2))
    vol_ok = (abs(card_tm.volume - want) / want < 0.005
              and all(abs(t.volume - g.area * INLAY) / (g.area * INLAY) < 0.005 for t, g in zip(ink_tms, inks)))
    return card, [card_tm] + ink_tms, rep, vol_ok


def build(face, code, batch, serial, out_dir, theme='white', nfc_mount='sticker_10x20', font='Inria Serif Bold'):
    """Write one Small card's STLs (PARTS[face]) into out_dir. `batch` and `serial` are kept for the ledger: the back
    carries the code alone. Every Small Stand card is new (2026-10-31) and takes the 10 x 20 sticker."""
    if face not in FACES:
        raise ValueError('face %r: one of %s' % (face, ', '.join(FACES)))
    if nfc_mount != 'sticker_10x20':
        raise ValueError('the Small Stand card only takes the 10 x 20 sticker')
    if theme not in google.STICKER_Z0_BY_THEME:
        raise ValueError('theme %r: white or black' % theme)
    small.configure()
    code = fa.normalize_code(code)
    pz0, pz1, pause = google.sticker_pocket_z(theme)
    sticker = {'pocket': sticker_pocket(), 'print_z': [pz0, pz1], 'pause_top_z': pause}
    if face == 'google':
        card, meshes, rep, vol_ok = build_google(code, theme, sticker, out_dir)
    else:
        card, meshes, rep, vol_ok = build_refaced(face, code, theme, sticker, font)
    rep = dict({'face': face, 'code': code, 'batch': batch, 'serial': str(serial), 'theme': theme,
                'nfc_mount': nfc_mount, 'card_mm': [W, H, CARD_T], 'slot_line_y_mm': SLOT_LINE}, **rep)
    rep.update(sticker_pocket_mm=[google.STICKER_W, google.STICKER_H, google.STICKER_DEPTH],
               sticker_pocket_print_z=sticker['print_z'], pause_top_z=pause, tag_face_distance_mm=pz0,
               card_shells=len(card.decompose()), card_bounds=meshes[0].bounds.round(3).tolist(),
               watertight=[bool(m.is_watertight) for m in meshes],
               bad_edges=sum(ig.welded_bad_edges(m) for m in meshes[:2 if face == 'google' else None]),
               **check_sticker(card, sticker['pocket'], sticker['print_z']))
    ok = (vol_ok and all(rep['watertight']) and rep['card_shells'] == 2 and rep['bad_edges'] == 0
          and rep['sticker_ok'] and rep['qr_decoded_polygons'] == rep['qr_url'] == rep['qr_decoded_mesh']
          and abs(meshes[0].bounds[1][2] - TOP) < 1e-4 and abs(meshes[0].bounds[0][2]) < 1e-4)
    rep['ok'] = bool(ok)
    if not ok:
        raise RuntimeError('Small %s card failed its checks, nothing written: %s' % (face, rep))
    os.makedirs(out_dir, exist_ok=True)
    for mesh, name in zip(meshes, PARTS[face]):
        mesh.export(os.path.join(out_dir, name))
    return rep


def preview(code=fa.SAMPLE_CODE, out=None):
    """Every face in both colours, on the Small base, as the Large cards' face sheets."""
    small.configure()
    out = out or os.path.join(PIECE, 'preview', 'face', 'face-small-stand.png')
    os.makedirs(os.path.dirname(out), exist_ok=True)
    poly = menu.svg_poly
    sheets = []
    for theme, body, ink in (('white', fc.WHITE, '#111111'), ('black', '#161616', '#F2F2F2')):
        g = fc.resolve_version('google')
        dark, _, _ = fa.qr_geom(g['qr'], fa.QR_BASE + code)
        tap, _ = fa.tap_row_geom(W / 2, g['tap_row'])
        head, _ = fa.text_geom(g['headline']['text'], g['headline']['cap'], W / 2, g['headline']['baseline'])
        stars = fa.stars_geom(W / 2, g['line2'])
        _, g_parts = fa.g_geom(g['logo'])
        inner = (poly(outline(), body) + poly(unary_union([tap, head, dark]), ink) + poly(stars, fc.YELLOW)
                 + ''.join(poly(p, c) for c, p in g_parts))
        sheets.append(('Google %s' % theme, inner))
        art = instagram_layout(code)
        sheets.append(('Instagram %s' % theme, poly(outline(), body) + poly(art['inks'][1], '#FF66CC')
                       + poly(art['inks'][0], ink)))
        art = menu_layout(code, theme, 'Inria Serif Bold')
        sheets.append(('Menu %s' % theme, poly(outline(), body) + poly(art['ink'], ink)))
    pad, gap, label_h = 8.0, 10.0, 7.0
    cols = 3
    width = pad * 2 + cols * fc.BASE_W + (cols - 1) * gap
    row_h = H - fc.HIDDEN + fc.BASE_H + label_h + gap
    parts = ['<rect width="%g" height="%g" fill="#b9a688"/>' % (width, pad * 2 + 2 * row_h)]
    for i, (name, inner) in enumerate(sheets):
        col, row = i % cols, i // cols
        ox = pad + col * (fc.BASE_W + gap) + (fc.BASE_W - W) / 2
        oy = pad + row * row_h
        base = '<rect x="%g" y="%g" width="%g" height="%g" rx="3" fill="#222"/>' % (
            (W - fc.BASE_W) / 2, H - fc.HIDDEN, fc.BASE_W, fc.BASE_H)
        parts.append('<g transform="translate(%.3f %.3f)">%s%s</g>' % (ox, oy, inner, base))
        label, _ = fc.text(name, 3.2, ox + W / 2, oy + H - fc.HIDDEN + fc.BASE_H + 5.0, fill='#2a2a2a')
        parts.append(label)
    svg = ('<svg xmlns="http://www.w3.org/2000/svg" width="%gmm" height="%gmm" viewBox="0 0 %g %g">%s</svg>'
           % (width, pad * 2 + 2 * row_h, width, pad * 2 + 2 * row_h, ''.join(parts)))
    import fitz
    page = fitz.open(stream=svg.encode('utf-8'), filetype='svg')[0]
    page.get_pixmap(matrix=fitz.Matrix(4, 4), alpha=False).save(out)
    return out


if __name__ == '__main__':
    print(preview())
    root = os.path.join(PIECE, 'production', 'SMALL-SAMPLE', 'mesh')
    for face in FACES:
        for theme in ('white', 'black'):
            print(build(face, fa.SAMPLE_CODE, 'SMALL-SAMPLE', '001', os.path.join(root, face, theme), theme=theme))
