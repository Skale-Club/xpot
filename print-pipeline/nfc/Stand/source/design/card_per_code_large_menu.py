"""Build one 103 x 137 mm MENU stand card for one Xpot tag code (generic: no restaurant name).

The Menu Plate's face (build_menu_batch.artwork: "Menu" in Inria Serif Bold, "Scan or tap to view", the QR) laid
out on the Large Stand card, with the Stand's own tap row and QR (the Google and Instagram cards' 9 mm row and
33.25 mm QR). The card is made the Instagram way (card_per_code_large_instagram.plain_card): the Google sample card
filled back to plain card, the 10 x 20 sticker pocket cut under Tap here, the face cut in at 0.52 mm.

    White_Menu_Card.stl   the card body (face cut, back engraved with the code, 0.32 deep)
    Black_Menu_Art.stl    the face inlay (z CARD_T-0.52 .. CARD_T)

As on every Stand card the file names are the white card's: a black card prints the same names with the body and
art filaments swapped in the recipe. The meshes do differ by theme, as on the Menu Plate: a black card's art carries
a light panel behind the QR (its dark modules are the black body, so the QR reads dark on light); a white card's
art is the dark modules straight on the white body. The pocket depth goes by theme too (card_per_code_large).

    python card_per_code_large_menu.py   -> preview/face/face-large-menu.png and a sample build
"""
import os
import sys

from matplotlib.textpath import TextPath
from shapely.geometry import box
from shapely.ops import unary_union

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import face_art as fa  # noqa: E402
import face_art_large as large  # noqa: E402
import face_composition_large as fc  # noqa: E402
import card_per_code_large as google  # noqa: E402
import card_per_code_large_instagram as ig  # noqa: E402

PIECE = os.path.dirname(os.path.dirname(HERE))
PLATE_DESIGN = os.path.join(os.path.dirname(PIECE), 'Plate', 'source', 'design')
if PLATE_DESIGN not in sys.path:
    sys.path.insert(0, PLATE_DESIGN)

W, H = fc.CARD_W, fc.CARD_H
TOP, INLAY, BACK_ENGRAVE, SIMPLIFY = ig.TOP, ig.INLAY, ig.BACK_ENGRAVE, ig.SIMPLIFY
SLOT_LINE = ig.SLOT_LINE
FONTS = ('Inria Serif Bold', 'Inria Serif Bold Italic')

# Composition coordinates, y down from the top edge. The title and subtitle are the Menu Plate's (cap 30, at most
# 80 wide; 4.5 below it the 4.7 subtitle); the tap row and the QR are the Stand's. The QR panel border is two
# modules, as on the Plate (2.48 = 2 x 1.24 there).
FACE_MENU = {
    'tap_row': dict(ig.FACE_IG['tap_row']),
    'title': {'text': 'Menu', 'cap': 30.0, 'max_width': 80.0},
    'subtitle': {'text': 'Scan or tap to view', 'cap': 4.7, 'gap': 4.5, 'max_width': 87.0},
    'qr': {'size': 33.25, 'modules': 25, 'y': 80.0, 'border_modules': 2},
}


def rounded_rect(x0, y0, x1, y1, radius):
    return box(x0 + radius, y0 + radius, x1 - radius, y1 - radius).buffer(radius, quad_segs=24)


def title_geom(text, font, cap, max_width, cx, top):
    """`text` in a Menu font, cap height `cap` (less if wider than max_width), its cap line at `top`."""
    import face_composition_tile as composition
    prop = composition._font(composition.MENU_FONTS[font][0])
    ref = TextPath((0, 0), 'H', size=100, prop=prop).get_extents().height
    path = TextPath((0, 0), text, size=100, prop=prop)
    ext = path.get_extents()
    scale = min(cap / ref, max_width / ext.width)
    cap = ref * scale
    geom = fa.even_odd([[(cx - ext.width * scale / 2 + (x - ext.x0) * scale, top + cap - y * scale) for x, y in ring]
                        for ring in path.to_polygons(closed_only=True)])
    return geom, cap


def layout(code, theme='white', font='Inria Serif Bold', face=FACE_MENU, width=W, slot_line=SLOT_LINE):
    """The Menu face for one code, composition coordinates: the art (one colour), the QR's dark modules and panel."""
    if font not in FONTS:
        raise ValueError('menu font %r has no layout: one of %s' % (font, ', '.join(FONTS)))
    cx = width / 2
    t, ti, su, q = face['tap_row'], face['title'], face['subtitle'], face['qr']
    tap, tap_w = fa.tap_row_geom(cx, t)
    p = q['size'] / q['modules']
    border = q['border_modules'] * p
    dark, _, info = fa.qr_geom({'x': cx - q['size'] / 2, 'y': q['y'], 'size': q['size'], 'modules': q['modules']},
                               fa.QR_BASE + code)
    assert info['url'] == fa.QR_BASE + code
    panel = rounded_rect(cx - q['size'] / 2 - border, q['y'] - border,
                               cx + q['size'] / 2 + border, q['y'] + q['size'] + border, border * .6)
    # title + subtitle centred between the tap row and the QR panel
    _, cap = title_geom(ti['text'], font, ti['cap'], ti['max_width'], cx, 0)
    group_h = cap + su['gap'] + su['cap']
    row_bottom = t['y'] + t['icon_h']
    space = (q['y'] - border - row_bottom - group_h) / 2
    assert space > 0, 'the Menu group does not fit between the tap row and the QR'
    title_top = row_bottom + space
    title, cap = title_geom(ti['text'], font, ti['cap'], ti['max_width'], cx, title_top)
    sub, sub_w = fa.text_geom(su['text'], su['cap'], cx, title_top + cap + su['gap'] + su['cap'])
    assert sub_w <= su['max_width'] and tap_w <= width - 8
    if theme == 'black':
        ink = unary_union([tap, title, sub, panel.difference(dark)])
    elif theme == 'white':
        ink = unary_union([tap, title, sub, dark])
    else:
        raise ValueError('theme %r: white or black' % theme)
    lowest = max(g.bounds[3] for g in (ink, panel if theme == 'black' else dark))
    assert lowest <= slot_line - 1.5, 'face reaches %.2f mm, slot line %.2f' % (lowest, slot_line)
    return {'ink': ink.simplify(SIMPLIFY, preserve_topology=True), 'dark': dark, 'panel': panel, 'qr': info,
            'title_cap': cap, 'subtitle_w': sub_w, 'gap': space, 'lowest_y': lowest, 'font': font}


def build(code, batch, serial, out_dir, nfc_mount='sticker_10x20', theme='white', font='Inria Serif Bold'):
    """Write the two STLs for one card. `batch` and `serial` are accepted for the ledger; the back carries the code
    alone, as on the Instagram card. The Menu card is new (2026-10-31): it only comes with the sticker."""
    if nfc_mount != 'sticker_10x20':
        raise ValueError('the Menu Stand card only takes the 10 x 20 sticker')
    large.configure()
    code = fa.normalize_code(code)
    art = layout(code, theme, font)
    ink = fa.to_card(art['ink'])
    back_comp, _ = fa.serial_geom(code)
    s_back_comp, _ = fa.serial_geom(fa.SAMPLE_CODE)
    back = fa.to_card_back(back_comp.simplify(SIMPLIFY, preserve_topology=True))
    s_back, n_back = fa.to_card_back(s_back_comp), fa.to_card_back(back_comp)
    assert back_comp.bounds[3] <= SLOT_LINE - 1.5, 'back serial reaches the slot'

    card, plain_volume, plain_shells, sticker = ig.plain_card(s_back, n_back, nfc_mount, theme)
    card = card - ig.prism(ink, TOP - INLAY, TOP + 0.2) - ig.prism(back, -0.2, BACK_ENGRAVE)
    card_tm = ig.to_trimesh(card)
    art_tm = ig.to_trimesh(ig.prism(ink, TOP - INLAY, TOP))
    want = (plain_volume - ink.area * INLAY - back.area * BACK_ENGRAVE
            - sticker['pocket'].area * google.STICKER_DEPTH)

    q = {'size': FACE_MENU['qr']['size'], 'modules': FACE_MENU['qr']['modules'], 'y': FACE_MENU['qr']['y']}
    url = art['qr']['url']
    decoded = ig.decode_qr_polygons(fa.to_card(art['dark']), q, url, H)
    section = ig.mesh_section_polygons(art_tm, TOP - INLAY / 2)
    qr_box = box(-q['size'] / 2 - 1, H - q['y'] - q['size'] - 1, q['size'] / 2 + 1, H - q['y'] + 1)
    mesh_dark = fa.to_card(art['panel']).difference(section) if theme == 'black' else section
    decoded_mesh = ig.decode_qr_polygons(mesh_dark.intersection(qr_box), q, url, H)

    rep = {
        'code': code, 'batch': batch, 'serial': str(serial), 'theme': theme, 'font': font, 'qr_url': url,
        'qr_modules': art['qr']['modules'], 'qr_module_mm': art['qr']['module_mm'],
        'title_cap_mm': round(art['title_cap'], 2), 'subtitle_width_mm': round(art['subtitle_w'], 2),
        'menu_gap_mm': round(art['gap'], 2), 'face_lowest_y_mm': round(art['lowest_y'], 2),
        'slot_line_y_mm': SLOT_LINE, 'plain_card_mm3': round(plain_volume, 1), 'plain_shells': plain_shells,
        'card_mm3': round(card_tm.volume, 1), 'card_expected_mm3': round(want, 1),
        'art_mm3': round(art_tm.volume, 2), 'art_expected_mm3': round(ink.area * INLAY, 2),
        'card_watertight': bool(card_tm.is_watertight), 'art_watertight': bool(art_tm.is_watertight),
        'card_shells': len(card.decompose()), 'card_bounds': card_tm.bounds.round(3).tolist(),
        'bad_edges': ig.welded_bad_edges(card_tm) + ig.welded_bad_edges(art_tm),
        'qr_decoded_polygons': decoded, 'qr_decoded_mesh': decoded_mesh, 'nfc_mount': nfc_mount,
        'sticker_pocket_mm': [google.STICKER_W, google.STICKER_H, google.STICKER_DEPTH],
        'sticker_pocket_print_z': sticker['print_z'], 'pause_top_z': sticker['pause_top_z'],
        'tag_face_distance_mm': sticker['print_z'][0],
    }
    rep.update(ig.check_sticker(card, sticker['pocket'], sticker['print_z']))
    ok = (abs(card_tm.volume - want) / want < 0.005
          and abs(art_tm.volume - ink.area * INLAY) / (ink.area * INLAY) < 0.005
          and card_tm.is_watertight and art_tm.is_watertight and rep['card_shells'] == 2 and plain_shells == 1
          and rep['bad_edges'] == 0 and decoded == url and decoded_mesh == url and rep['sticker_ok']
          and abs(card_tm.bounds[1][2] - TOP) < 1e-4 and abs(card_tm.bounds[0][2]) < 1e-4)
    rep['ok'] = bool(ok)
    if not ok:
        raise RuntimeError('Menu Large card failed its checks, nothing written: %s' % rep)
    os.makedirs(out_dir, exist_ok=True)
    card_tm.export(os.path.join(out_dir, 'White_Menu_Card.stl'))
    art_tm.export(os.path.join(out_dir, 'Black_Menu_Art.stl'))
    return rep


def svg_poly(geom, fill):
    parts = []
    for pg in fa.polys(geom):
        d = 'M' + ' L'.join('%.4f %.4f' % xy for xy in list(pg.exterior.coords)[:-1]) + ' Z'
        for hole in pg.interiors:
            d += ' M' + ' L'.join('%.4f %.4f' % xy for xy in list(hole.coords)[:-1]) + ' Z'
        parts.append('<path fill="%s" fill-rule="evenodd" d="%s"/>' % (fill, d))
    return ''.join(parts)


def preview(code=fa.SAMPLE_CODE, out=None):
    """Both colours side by side on their bases, as the face sheet of the Google and Instagram cards."""
    large.configure()
    out = out or os.path.join(PIECE, 'preview', 'face', 'face-large-menu.png')
    os.makedirs(os.path.dirname(out), exist_ok=True)
    sheets = []
    for theme, body, ink in (('white', fc.WHITE, '#111111'), ('black', '#161616', '#F2F2F2')):
        art = layout(code, theme)
        card = ig.outline()
        inner = svg_poly(card, body) + svg_poly(art['ink'], ink)
        sheets.append(('Menu large %s' % theme, inner))
    fc.render(fc.sheet(sheets), out)
    return out


if __name__ == '__main__':
    print(preview())
    out = os.path.join(PIECE, 'production', 'MENU-SAMPLE', 'mesh', '001')
    for theme in ('white', 'black'):
        print(build(fa.SAMPLE_CODE, 'MENU-SAMPLE', '001', os.path.join(out, theme), theme=theme))
