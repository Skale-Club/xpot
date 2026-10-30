"""NFC Plate (table tile), Google Review face: the printable meshes of one tile for one Xpot code.

    python tile_per_code_google.py [CODE] [out_dir] [large|small]
        default: the sample code A7K3P9X2, Large, into ../../test/mesh/google-<size>-sample/

Large 103 x 103 x 3.56, white, the approved Google layout of face_composition_tile.py (`SIZES['large']`: margin 8,
tap row 7.2 / 4.9 / 2.5, G 20, gaps 3.2 / 2.4, "Review us on Google" cap 4.5, stars 7.0 / 2.2, QR 31 mm = 25
modules of 1.24 mm). Small 78 x 78 x 3.56 (user, 2026-10-17: "faz o plate pequeno completo") uses
`SIZES['small']` of the same script: margin 6, tap row 6.0 / 4.5 / 2.0, G 13, gaps 2.0 / 1.5, cap 4.5, stars 5.8 /
1.6, QR 20 mm = 25 modules of 0.80 mm (the final Small QR of 2026-10-15). The tile body, the NFC cavity, the inlay depth and the back engraving are the Instagram
plate's (tile_per_code.py), so the stack, the pause and the slicer recipe are the same.

The G is NOT printed with the tile (user, 2026-10-10): only the G has four colours, so it is a separate token
(g_token_flush.py) glued into a pocket. Unlike the Stand's G it is **flat and flush with the face**, not domed and
not proud ("os Gs nao podem ser abaulados e popout igual no stand, ele precisa ter a mesma altura da plate"):
the pocket is POCKET deep and the token exactly POCKET thick.

Frame: tile face up, back at z 0, face at z T; x centred, y up from the bottom edge. Prints FACE-DOWN.

    White_Google_Plate.stl   the tile: chamfered slab, sealed NFC cavity under the G, the G pocket, face inlays
                             0.52 deep, the code engraved 0.32 into the back
    Black_Google_Art.stl     tap row + "Review us on Google" + QR (z T-0.52 .. T)
    Yellow_Google_Stars.stl  the five stars (z T-0.52 .. T)

theme 'black' (Large, user 2026-10-30: "4 plates pretas do google"): a black tile with the art in white, the black
Instagram Plate's way (tile_per_code.py): a normal dark-on-light QR on a white panel, the black body showing through
as the dark modules, never the black Stand's inverted QR. Black_Google_Plate.stl, White_Google_Art.stl (text and the
QR panel), Yellow_Google_Stars.stl. Black PLA is opaque, so the sticker sits 0.68 behind the face (pause z 1.32).
"""
import os
import sys

import numpy as np
from shapely.geometry import Point, box
from shapely.ops import unary_union

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import tile_per_code as ig  # noqa: E402   (body, outline, frames, the Instagram plate's numbers)
from tile_per_code import fa, igc, T, TOP, INLAY, BACK_ENGRAVE, NFC_D, NFC_Z0, NFC_Z1, SIMPLIFY  # noqa: E402

PIECE = ig.PIECE
FACES = {
    'large': {
        'margin': 8.0,
        'tap_row': {'icon_h': 7.2, 'cap': 4.9, 'gap': 2.5, 'label': 'Tap here'},
        'g': 20.0, 'g_gaps': (3.2, 2.4),
        'headline': {'text': 'Review us on Google', 'cap': 4.5},
        'stars': {'size': 7.0, 'gap': 2.2},
        'qr': {'size': 31.0, 'modules': 25}, 'panel_quiet_modules': 2.0,
    },
    'small': {
        'margin': 6.0,
        'tap_row': {'icon_h': 6.0, 'cap': 4.5, 'gap': 2.0, 'label': 'Tap here'},
        'g': 13.0, 'g_gaps': (2.0, 1.5),
        'headline': {'text': 'Review us on Google', 'cap': 4.5},
        'stars': {'size': 5.8, 'gap': 1.6},
        'qr': {'size': 20.0, 'modules': 25}, 'panel_quiet_modules': 1.0,
    },
}
SIZE, FACE, S = 'large', FACES['large'], 0.0


def configure(size):
    """Switch to one tile size: the tile body's numbers (tile_per_code.configure_size) and this face's."""
    global SIZE, FACE, S
    if size not in FACES:
        raise ValueError('size must be large or small')
    ig.configure_size(size)
    SIZE, FACE, S = size, FACES[size], ig.S


configure('large')
# Pocket for the flush G token. 1.16 = the 0.20 first layer + 6 x 0.16, so the pocket edge and the token's face
# both fall on layer boundaries; the floor left over the NFC cavity (top at z 1.92) is 2.40 - 1.92 = 0.48 mm
# (three 0.16 layers in print). G_CLEAR per side, as the Stand's pockets (face_art.G_CLEAR).
POCKET = 1.16
G_CLEAR = fa.G_CLEAR
# nfc_mount 'sticker_10x20' (Large only, user 2026-10-29: "quero fazer com adesivo"): the LeadSeals 10 x 20 x 0.15
# NTAG213 sticker in the doc 16 s5 pocket, 23.00 x 13.00 x 0.48, long side left-right: the Menu/Venmo plates' and
# the Stand v2's settings. The white body is translucent, so the floor is 1.16 behind the face (print z 1.16-1.64,
# pause at the start of the 1.64-1.80 roof). It cannot sit under the G like the round tag: the G pocket is 1.16
# deep, so the two would meet. It is centred on the Tap here row instead, clear of the G pocket; no round cavity.
STICKER_W, STICKER_H, STICKER_DEPTH, STICKER_RADIUS = 23.0, 13.0, 0.48, 0.8
STICKER_Z0 = 1.16
STICKER_Z1 = round(STICKER_Z0 + STICKER_DEPTH, 2)
STICKER_PAUSE_TOP_Z = round(STICKER_Z1 + 0.16, 2)
# Black PLA is opaque: the antenna does not shadow through, so the black tile keeps the tag 0.68 behind the face
# (print z 0.68-1.16, pause at the start of the 1.16-1.32 roof), as the black Stand and Menu plates.
STICKER_Z0_BY_THEME = {'white': STICKER_Z0, 'black': 0.68}
STICKER_GAP_G, STICKER_GAP_EDGE = 1.0, 3.0    # in plan: to the G pocket, and to the top edge (chamfer + walls)


def layout(code):
    """Composition coordinates (x 0..S, y down from the top edge)."""
    cx, m = S / 2, FACE['margin']
    t = dict(FACE['tap_row'], y=m)
    tap, tap_w = fa.tap_row_geom(cx, t)
    q = FACE['qr']
    qr_top = S - m - q['size']
    dark, _, info = fa.qr_geom({'x': cx - q['size'] / 2, 'y': qr_top, 'size': q['size'], 'modules': q['modules']},
                               fa.QR_BASE + code)
    h, st, g = FACE['headline'], FACE['stars'], FACE['g']
    group = g + FACE['g_gaps'][0] + h['cap'] + FACE['g_gaps'][1] + st['size']
    tap_bottom = m + t['icon_h']
    space = (qr_top - tap_bottom - group) / 2
    g_top = tap_bottom + space
    g_outline, g_pieces = fa.g_geom({'x': cx - g / 2, 'y': g_top, 'size': g})
    base = g_top + g + FACE['g_gaps'][0] + h['cap']
    head, head_w = fa.text_geom(h['text'], h['cap'], cx, base)
    stars = fa.stars_geom(cx, dict(st, cy=base + FACE['g_gaps'][1] + st['size'] / 2))
    quiet = 4 * q['size'] / q['modules']
    assert space >= quiet - 1e-6, 'message closer than the QR quiet zone: %.2f < %.2f' % (space, quiet)
    assert head_w <= S - 2 * m and tap_w <= S - 2 * m
    simp = lambda geom: geom.simplify(SIMPLIFY, preserve_topology=True)
    gb = g_outline.bounds
    return {'black': simp(unary_union([tap, head, dark])), 'yellow': simp(stars), 'g_outline': g_outline,
            'g_pieces': g_pieces, 'qr': info, 'qr_dark': dark, 'qr_top': qr_top, 'space': space,
            'headline_w': head_w, 'g_box': gb, 'nfc_centre_y': (gb[1] + gb[3]) / 2, 'nfc_centre_x': (gb[0] + gb[2]) / 2,
            'tap_centre_y': m + t['icon_h'] / 2}


def build(code, out_dir, size='large', nfc_mount='embedded_round', theme='white'):
    if theme not in ('white', 'black'):
        raise ValueError('theme must be white or black')
    if nfc_mount not in ('embedded_round', 'sticker_10x20'):
        raise ValueError('unsupported nfc_mount')
    if nfc_mount == 'sticker_10x20' and size != 'large':
        raise ValueError('the sticker pocket is laid out for the Large plate only')
    configure(size)
    code = fa.normalize_code(code)
    art = layout(code)
    to_tile = ig.to_tile
    panel_tile = None
    ink_comp = art['black']
    if theme == 'black':
        # The QR keeps its quiet zone on a white panel; the black body shows through as the dark modules.
        module = FACE['qr']['size'] / FACE['qr']['modules']
        border = FACE['panel_quiet_modules'] * module
        p = FACE['qr']['size'] + 2 * border
        x0, y0 = S / 2 - p / 2, art['qr_top'] - border
        panel = ig._rounded_rect(x0, y0, x0 + p, y0 + p, border * 0.6)
        ink_comp = unary_union([art['black'].difference(art['qr_dark']), panel.difference(art['qr_dark'])])
        panel_tile = to_tile(panel)
    # `black` is the art inlay whatever its colour: black on the white tile, white on the black one.
    black, yellow = to_tile(ink_comp), to_tile(art['yellow'])
    pocket = to_tile(art['g_outline'].buffer(G_CLEAR, join_style='mitre')).simplify(SIMPLIFY, preserve_topology=True)
    back_txt, _ = fa.text_geom(code, fa.BACK_SERIAL['code_cap'], S / 2, S / 2 + fa.BACK_SERIAL['code_cap'] / 2)
    back_txt = back_txt.buffer(-0.01, join_style='mitre').buffer(0.01, join_style='mitre')
    back = ig.to_tile_back(back_txt.simplify(SIMPLIFY, preserve_topology=True))
    assert pocket.distance(black) > 0.3 and pocket.distance(yellow) > 0.3, 'G pocket runs into the face art'
    if panel_tile is not None:
        assert panel_tile.distance(yellow) > 0.3, 'QR panel runs into the stars'
    if nfc_mount == 'sticker_10x20':
        w, h, cy = STICKER_W / 2, STICKER_H / 2, S - art['tap_centre_y']
        nfc = ig._rounded_rect(-w, cy - h, w, cy + h, STICKER_RADIUS)
        sticker_z0 = STICKER_Z0_BY_THEME[theme]
        sticker_z1 = round(sticker_z0 + STICKER_DEPTH, 2)
        nfc_z0, nfc_z1 = TOP - sticker_z1, TOP - sticker_z0     # model z: print z = TOP - model z
        assert nfc.distance(pocket) >= STICKER_GAP_G, 'sticker pocket runs into the G pocket'
        assert S - (cy + h) >= STICKER_GAP_EDGE, 'sticker pocket too close to the top edge'
        assert nfc_z1 < TOP - INLAY, 'sticker pocket must stay behind the face art'
        cavity_expected = nfc.area * STICKER_DEPTH
    else:
        nfc = Point(art['nfc_centre_x'] - S / 2, S - art['nfc_centre_y']).buffer(NFC_D / 2, quad_segs=64)
        nfc_z0, nfc_z1 = NFC_Z0, NFC_Z1
        assert TOP - POCKET - NFC_Z1 >= 0.48 - 1e-6, 'floor between the G pocket and the NFC cavity is too thin'
        cavity_expected = np.pi * (NFC_D / 2) ** 2 * (NFC_Z1 - NFC_Z0)

    tile = ig.body()
    plain = igc.to_trimesh(tile)
    tile = tile - igc.prism(nfc, nfc_z0, nfc_z1)
    solid_volume = igc.to_trimesh(tile).volume
    tile = (tile - igc.prism(unary_union([black, yellow]), TOP - INLAY, TOP + 0.2)
            - igc.prism(pocket, TOP - POCKET, TOP + 0.2) - igc.prism(back, -0.2, BACK_ENGRAVE))
    tile_tm = igc.to_trimesh(tile)
    black_tm = igc.to_trimesh(igc.prism(black, TOP - INLAY, TOP))
    yellow_tm = igc.to_trimesh(igc.prism(yellow, TOP - INLAY, TOP))

    want = solid_volume - (black.area + yellow.area) * INLAY - pocket.area * POCKET - back.area * BACK_ENGRAVE
    rep = {
        'code': code, 'size': size, 'theme': theme, 'qr_style': 'normal-on-white-panel' if theme == 'black' else 'normal',
        'tile_mm': S, 'qr_url': art['qr']['url'], 'qr_modules': art['qr']['modules'],
        'qr_module_mm': art['qr']['module_mm'], 'space_above_qr_mm': round(art['space'], 2),
        'headline_width_mm': round(art['headline_w'], 2), 'nfc_centre_from_top_mm': round(art['nfc_centre_y'], 2),
        'g_box_mm': [round(v, 2) for v in art['g_box']], 'pocket_mm2': round(pocket.area, 1),
        'pocket_depth_mm': POCKET, 'floor_over_nfc_mm': round(TOP - POCKET - nfc_z1, 2),
        'plain_mm3': round(plain.volume, 1), 'cavity_mm3': round(plain.volume - solid_volume, 1),
        'cavity_expected_mm3': round(cavity_expected, 1),
        'tile_mm3': round(tile_tm.volume, 1), 'tile_expected_mm3': round(want, 1),
        'black_mm3': round(black_tm.volume, 2), 'black_expected_mm3': round(black.area * INLAY, 2),
        'yellow_mm3': round(yellow_tm.volume, 2), 'yellow_expected_mm3': round(yellow.area * INLAY, 2),
        'watertight': [bool(tile_tm.is_watertight), bool(black_tm.is_watertight), bool(yellow_tm.is_watertight)],
        'tile_shells': len(tile.decompose()),
        'bad_edges': igc.welded_bad_edges(tile_tm) + igc.welded_bad_edges(black_tm) + igc.welded_bad_edges(yellow_tm),
        'tile_bounds': tile_tm.bounds.round(3).tolist(),
    }
    if nfc_mount == 'sticker_10x20':
        rep.update(nfc_mount=nfc_mount, sticker_pocket_mm=[STICKER_W, STICKER_H, STICKER_DEPTH],
                   sticker_pocket_print_z=[sticker_z0, sticker_z1], pause_top_z=round(sticker_z1 + 0.16, 2),
                   tag_face_distance_mm=sticker_z0, nfc_centre_from_top_mm=round(art['tap_centre_y'], 2),
                   sticker_gap_to_g_pocket_mm=round(nfc.distance(pocket), 2))
    q = {'size': FACE['qr']['size'], 'modules': FACE['qr']['modules'], 'y': art['qr_top']}
    igc.H = S
    rep['qr_decoded_polygons'] = igc.decode_qr_polygons(to_tile(art['qr_dark']), q, art['qr']['url'])
    sec = igc.mesh_section_polygons(black_tm, TOP - INLAY / 2)
    qr_box = box(-q['size'] / 2 - 1, S - q['y'] - q['size'] - 1, q['size'] / 2 + 1, S - q['y'] + 1)
    mesh_qr_dark = panel_tile.difference(sec) if panel_tile is not None else sec
    rep['qr_decoded_mesh'] = igc.decode_qr_polygons(mesh_qr_dark.intersection(qr_box), q, art['qr']['url'])

    ok = (abs(tile_tm.volume - want) / want < 0.005
          and abs(black_tm.volume - black.area * INLAY) / (black.area * INLAY) < 0.005
          and abs(yellow_tm.volume - yellow.area * INLAY) / (yellow.area * INLAY) < 0.005
          and abs(rep['cavity_mm3'] - rep['cavity_expected_mm3']) < 2.0
          and all(rep['watertight']) and rep['tile_shells'] == 2 and rep['bad_edges'] == 0
          and rep['qr_decoded_polygons'] == art['qr']['url'] and rep['qr_decoded_mesh'] == art['qr']['url']
          and abs(tile_tm.bounds[1][2] - TOP) < 1e-4 and abs(tile_tm.bounds[0][2]) < 1e-4)
    rep['ok'] = bool(ok)
    if not ok:
        raise RuntimeError('Google %s %s plate failed its checks, nothing written: %s' % (size.title(), theme, rep))
    os.makedirs(out_dir, exist_ok=True)
    body_colour, art_colour = ('Black', 'White') if theme == 'black' else ('White', 'Black')
    tile_tm.export(os.path.join(out_dir, '%s_Google_Plate.stl' % body_colour))
    black_tm.export(os.path.join(out_dir, '%s_Google_Art.stl' % art_colour))
    yellow_tm.export(os.path.join(out_dir, 'Yellow_Google_Stars.stl'))
    return rep


if __name__ == '__main__':
    code = sys.argv[1] if len(sys.argv) > 1 and sys.argv[1] != '-' else fa.SAMPLE_CODE
    size = sys.argv[3] if len(sys.argv) > 3 else 'large'
    theme = sys.argv[4] if len(sys.argv) > 4 else 'white'
    out = sys.argv[2] if len(sys.argv) > 2 and sys.argv[2] != '-' else         os.path.join(PIECE, 'test', 'mesh', 'google-%s-sample' % size)
    print(build(code, out, size))
