"""NFC Plate (table tile), Instagram face: printable meshes for one Xpot code.

    python tile_per_code.py [CODE] [out_dir]      default: the sample code A7K3P9X2 into ../../test/mesh/ig-large-sample/

Large 103 or Small 78, both 3.56 mm thick (NFC/Plate/NOTES.md, "Sizes for the A1"), using the approved Instagram
layouts of face_composition_tile.py. Large uses one headline line and a 31 mm QR; Small uses two headline lines,
an 18 mm icon, and a 20 mm QR with 0.8 mm modules. Built in Python like the Stand's Instagram card
(card_per_code_large_instagram.py: the same face_art geometry, manifold3d, the same checks); Fusion was not
available on 2026-10-10 (account moved), and the tile is a plain rounded slab.

Frame: tile face up, back at z 0, face at z T; x centred, y up from the bottom edge (composition y is down from the
top edge). It prints FACE-DOWN, like the cards: print z = T - z.

    White_Instagram_Plate.stl   the tile: 0.5 x 45 deg chamfer on both faces, the sealed NFC cavity, face inlays cut
                                0.52 deep, the code engraved 0.32 into the back
    Black_Instagram_Art.stl     tap row + headline + QR (z T-0.52 .. T)
    Silk_Instagram_Logo.stl     the icon square minus the camera (the camera stays tile white)
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
PIECE = os.path.dirname(os.path.dirname(HERE))
STAND_DESIGN = os.path.join(os.path.dirname(PIECE), 'Stand', 'source', 'design')
sys.path.insert(0, STAND_DESIGN)
import face_art as fa  # noqa: E402
import card_per_code_large_instagram as igc  # noqa: E402   (prism, to_trimesh, welded_bad_edges, mesh_section_polygons)

T = 3.56
TOP = float(np.float32(T))
CHAMFER = 0.5                               # as the cards
INLAY, BACK_ENGRAVE = 0.52, 0.32
NFC_D, NFC_Z0, NFC_Z1 = 25.6, 0.96, 1.92    # the cards' finish-v4 cavity: print z 1.64-2.60, pause 2.76
REAR_TAG_W, REAR_TAG_H, REAR_TAG_T = 20.0, 10.0, 0.15
REAR_POCKET_CLEARANCE = 0.40                 # per side; enough room to place the adhesive tag by hand
REAR_POCKET_DEPTH = 0.56                     # 0.15 tag + 0.36 cover + 0.05 mm below the back plane
REAR_POCKET_RADIUS = 0.80
REAR_COVER_EDGE_CLEARANCE = 0.15             # per side inside the pocket
REAR_COVER_T = 0.36
SIZE_CONFIGS = {
    'large': {
        'size': 103.0, 'radius': 10.0, 'margin': 8.0,
        'tap_row': {'icon_h': 7.2, 'cap': 4.9, 'gap': 2.5, 'label': 'Tap here'},
        'icon': 28.0, 'icon_gap': 3.2, 'headline_cap': 4.5,
        'headline_lines': ('Follow us on Instagram',), 'headline_line_gap': 0.0,
        'qr': {'size': 31.0, 'modules': 25}, 'panel_quiet_modules': 2.0,
    },
    'small': {
        'size': 78.0, 'radius': 8.0, 'margin': 6.0,
        'tap_row': {'icon_h': 6.0, 'cap': 4.5, 'gap': 2.0, 'label': 'Tap here'},
        'icon': 18.0, 'icon_gap': 1.8, 'headline_cap': 4.5,
        'headline_lines': ('Follow us', 'on Instagram'), 'headline_line_gap': 1.2,
        'qr': {'size': 20.0, 'modules': 25}, 'panel_quiet_modules': 1.0,
    },
}
S, R, FACE = 0.0, 0.0, {}
SIMPLIFY = 0.002


def configure_size(size):
    global S, R, FACE
    if size not in SIZE_CONFIGS:
        raise ValueError('size must be large or small')
    cfg = SIZE_CONFIGS[size]
    S, R = cfg['size'], cfg['radius']
    FACE = cfg


configure_size('large')


def layout(code):
    """Composition coordinates (x 0..S, y down from the top edge), the numbers of the approved 2D layout."""
    cx, m = S / 2, FACE['margin']
    t = dict(FACE['tap_row'], y=m)
    tap, tap_w = fa.tap_row_geom(cx, t)
    q = FACE['qr']
    qr_top = S - m - q['size']
    dark, _, info = fa.qr_geom({'x': cx - q['size'] / 2, 'y': qr_top, 'size': q['size'], 'modules': q['modules']},
                               fa.QR_BASE + code)
    cap = FACE['headline_cap']
    lines = FACE['headline_lines']
    line_gap = FACE['headline_line_gap']
    group = FACE['icon'] + FACE['icon_gap'] + len(lines) * cap + (len(lines) - 1) * line_gap
    tap_bottom = m + t['icon_h']
    space = (qr_top - tap_bottom - group) / 2
    icon_y = tap_bottom + space
    silk, camera, square = fa.instagram_geom({'x': cx - FACE['icon'] / 2, 'y': icon_y, 'size': FACE['icon']})
    heads, widths = [], []
    baseline = icon_y + FACE['icon'] + FACE['icon_gap'] + cap
    for text in lines:
        head, width = fa.text_geom(text, cap, cx, baseline)
        heads.append(head)
        widths.append(width)
        baseline += cap + line_gap
    head = unary_union(heads)
    head_w = max(widths)
    quiet = 4 * q['size'] / q['modules']
    assert space >= quiet - 1e-6, 'message closer than the QR quiet zone: %.2f < %.2f' % (space, quiet)
    assert head_w <= S - 2 * m and tap_w <= S - 2 * m
    simp = lambda g: g.simplify(SIMPLIFY, preserve_topology=True)
    return {'black': simp(unary_union([tap, head, dark])), 'silk': simp(silk), 'qr': info, 'qr_dark': dark,
            'qr_top': qr_top, 'space': space, 'icon_y': icon_y, 'headline_w': head_w,
            'nfc_centre_y': icon_y + FACE['icon'] / 2}


def to_tile(g):
    return affinity.affine_transform(g, [1, 0, 0, -1, -S / 2, S])


def to_tile_back(g):
    """Drawn as seen from behind (the back faces -Z): x mirrored."""
    return affinity.affine_transform(g, [-1, 0, 0, -1, S / 2, S])


def outline(inset=0.0):
    a = S / 2 - R
    return box(-a, -a, a, a).buffer(R - inset, quad_segs=32)


def body():
    """Rounded slab with a 45 deg chamfer on both face edges: the hull of three outlines (the outline is convex)."""
    thin = 1e-3
    parts = [igc.prism(outline(CHAMFER), 0.0, thin), igc.prism(outline(), CHAMFER, TOP - CHAMFER),
             igc.prism(outline(CHAMFER), TOP - thin, TOP)]
    return m3.Manifold.batch_hull(parts).translate((0.0, S / 2, 0.0))   # y from the bottom edge


def _rounded_rect(x0, y0, x1, y1, radius):
    return box(x0 + radius, y0 + radius, x1 - radius, y1 - radius).buffer(radius, quad_segs=24)


def build(code, out_dir, theme='white', size='large', nfc_mount='embedded_round'):
    if theme not in ('white', 'black'):
        raise ValueError('theme must be white or black')
    if nfc_mount not in ('embedded_round', 'rear_sticker_10x20', 'rear_sticker_10x20_covered'):
        raise ValueError('unsupported nfc_mount')
    configure_size(size)
    code = fa.normalize_code(code)
    art = layout(code)
    panel = None
    ink_comp = art['black']
    if theme == 'black':
        # The black Plate uses a normal dark-on-light QR on a white panel. Small uses the visually lighter
        # 1-module border requested after reviewing the 2-module study; Large keeps the established 2 modules.
        # The black body shows through the white inlay as the dark modules. This is intentionally different from
        # the black Stand, whose QR is inverted.
        module = FACE['qr']['size'] / FACE['qr']['modules']
        border = FACE['panel_quiet_modules'] * module
        p = FACE['qr']['size'] + 2 * border
        x0, y0 = S / 2 - p / 2, art['qr_top'] - border
        panel = _rounded_rect(x0, y0, x0 + p, y0 + p, border * 0.6)
        text_only = art['black'].difference(art['qr_dark'])
        ink_comp = unary_union([text_only, panel.difference(art['qr_dark'])])
    ink, silk = to_tile(ink_comp), to_tile(art['silk'])
    panel_tile = to_tile(panel) if panel is not None else None
    back_txt, _ = fa.text_geom(code, fa.BACK_SERIAL['code_cap'], S / 2, S / 2 + fa.BACK_SERIAL['code_cap'] / 2)
    back_txt = back_txt.buffer(-0.01, join_style='mitre').buffer(0.01, join_style='mitre')     # serial_geom's opening
    back = to_tile_back(back_txt.simplify(SIMPLIFY, preserve_topology=True))
    nfc_centre_y = S - art['nfc_centre_y']
    cover_tm = None
    if nfc_mount == 'embedded_round':
        nfc = Point(0.0, nfc_centre_y).buffer(NFC_D / 2, quad_segs=64)
        nfc_z0, nfc_z1 = NFC_Z0, NFC_Z1
        expected_shells = 2
    else:
        pocket_w = REAR_TAG_W + 2 * REAR_POCKET_CLEARANCE
        pocket_h = REAR_TAG_H + 2 * REAR_POCKET_CLEARANCE
        nfc = _rounded_rect(-pocket_w / 2, nfc_centre_y - pocket_h / 2,
                            pocket_w / 2, nfc_centre_y + pocket_h / 2,
                            REAR_POCKET_RADIUS)
        # Open to the back (z=0): the 0.15 mm self-adhesive tag is installed after printing.
        nfc_z0, nfc_z1 = -0.2, REAR_POCKET_DEPTH
        expected_shells = 1
        if nfc_mount == 'rear_sticker_10x20_covered':
            cover_w = pocket_w - 2 * REAR_COVER_EDGE_CLEARANCE
            cover_h = pocket_h - 2 * REAR_COVER_EDGE_CLEARANCE
            cover = _rounded_rect(-cover_w / 2, -cover_h / 2,
                                  cover_w / 2, cover_h / 2,
                                  REAR_POCKET_RADIUS - REAR_COVER_EDGE_CLEARANCE)
            # The whole recipe is flipped face-down by the 3MF builder. Put the loose cover at the face Z band
            # so that it lands on the build plate after that transform instead of floating near the model top.
            cover_tm = igc.to_trimesh(igc.prism(cover, TOP - REAR_COVER_T, TOP))

    tile = body()
    plain = igc.to_trimesh(tile)
    tile = tile - igc.prism(nfc, nfc_z0, nfc_z1)
    solid_volume = igc.to_trimesh(tile).volume
    tile = tile - igc.prism(unary_union([ink, silk]), TOP - INLAY, TOP + 0.2) - igc.prism(back, -0.2, BACK_ENGRAVE)
    tile_tm = igc.to_trimesh(tile)
    ink_tm = igc.to_trimesh(igc.prism(ink, TOP - INLAY, TOP))
    silk_tm = igc.to_trimesh(igc.prism(silk, TOP - INLAY, TOP))

    want = solid_volume - (ink.area + silk.area) * INLAY - back.area * BACK_ENGRAVE
    rep = {
        'code': code, 'theme': theme, 'nfc_mount': nfc_mount,
        'qr_style': 'normal-on-white-panel' if theme == 'black' else 'normal',
        'qr_url': art['qr']['url'], 'qr_modules': art['qr']['modules'],
        'qr_module_mm': art['qr']['module_mm'], 'space_above_qr_mm': round(art['space'], 2),
        'headline_width_mm': round(art['headline_w'], 2), 'nfc_centre_from_top_mm': round(art['nfc_centre_y'], 2),
        'plain_mm3': round(plain.volume, 1), 'cavity_mm3': round(plain.volume - solid_volume, 1),
        'cavity_expected_mm3': round(nfc.area * (nfc_z1 - max(nfc_z0, 0.0)), 1),
        'tile_mm3': round(tile_tm.volume, 1), 'tile_expected_mm3': round(want, 1),
        'art_mm3': round(ink_tm.volume, 2), 'art_expected_mm3': round(ink.area * INLAY, 2),
        'silk_mm3': round(silk_tm.volume, 2), 'silk_expected_mm3': round(silk.area * INLAY, 2),
        'watertight': [bool(tile_tm.is_watertight), bool(ink_tm.is_watertight), bool(silk_tm.is_watertight)],
        'tile_shells': len(tile.decompose()),
        'bad_edges': igc.welded_bad_edges(tile_tm) + igc.welded_bad_edges(ink_tm) + igc.welded_bad_edges(silk_tm),
        'tile_bounds': tile_tm.bounds.round(3).tolist(),
    }
    if nfc_mount.startswith('rear_sticker_10x20'):
        rep['rear_tag_mm'] = [REAR_TAG_W, REAR_TAG_H, REAR_TAG_T]
        rep['rear_pocket_mm'] = [round(pocket_w, 2), round(pocket_h, 2), REAR_POCKET_DEPTH]
    if cover_tm is not None:
        rep['rear_cover_mm'] = [round(cover_w, 2), round(cover_h, 2), REAR_COVER_T]
        rep['rear_cover_watertight'] = bool(cover_tm.is_watertight)
        rep['rear_cover_bad_edges'] = igc.welded_bad_edges(cover_tm)
    # the QR must decode, from the exact polygons and from the art mesh as written
    q = {'size': FACE['qr']['size'], 'modules': FACE['qr']['modules'], 'y': art['qr_top']}
    igc.H = S                                                    # decode_qr_polygons reads the module's H
    rep['qr_decoded_polygons'] = igc.decode_qr_polygons(to_tile(art['qr_dark']), q, art['qr']['url'])
    sec = igc.mesh_section_polygons(ink_tm, TOP - INLAY / 2)
    qr_box = box(-q['size'] / 2 - 1, S - q['y'] - q['size'] - 1, q['size'] / 2 + 1, S - q['y'] + 1)
    mesh_qr_dark = (panel_tile.difference(sec) if theme == 'black' else sec).intersection(qr_box)
    rep['qr_decoded_mesh'] = igc.decode_qr_polygons(mesh_qr_dark, q, art['qr']['url'])

    ok = (abs(tile_tm.volume - want) / want < 0.005
          and abs(ink_tm.volume - ink.area * INLAY) / (ink.area * INLAY) < 0.005
          and abs(silk_tm.volume - silk.area * INLAY) / (silk.area * INLAY) < 0.005
          and abs(rep['cavity_mm3'] - rep['cavity_expected_mm3']) < 2.0
          and all(rep['watertight']) and rep['tile_shells'] == expected_shells and rep['bad_edges'] == 0
          and (cover_tm is None or (rep['rear_cover_watertight'] and rep['rear_cover_bad_edges'] == 0))
          and rep['qr_decoded_polygons'] == art['qr']['url'] and rep['qr_decoded_mesh'] == art['qr']['url']
          and abs(tile_tm.bounds[1][2] - TOP) < 1e-4 and abs(tile_tm.bounds[0][2]) < 1e-4)
    rep['ok'] = bool(ok)
    if not ok:
        raise RuntimeError('Instagram %s %s plate failed its checks, nothing written: %s' % (size.title(), theme, rep))
    os.makedirs(out_dir, exist_ok=True)
    body_colour, art_colour = ('Black', 'White') if theme == 'black' else ('White', 'Black')
    tile_tm.export(os.path.join(out_dir, '%s_Instagram_Plate.stl' % body_colour))
    ink_tm.export(os.path.join(out_dir, '%s_Instagram_Art.stl' % art_colour))
    silk_tm.export(os.path.join(out_dir, 'Silk_Instagram_Logo.stl'))
    if cover_tm is not None:
        cover_tm.export(os.path.join(out_dir, '%s_NFC_Cover.stl' % body_colour))
    return rep


if __name__ == '__main__':
    code = sys.argv[1] if len(sys.argv) > 1 else fa.SAMPLE_CODE
    out = sys.argv[2] if len(sys.argv) > 2 else os.path.join(PIECE, 'test', 'mesh', 'ig-large-sample')
    theme = sys.argv[3] if len(sys.argv) > 3 else 'white'
    size = sys.argv[4] if len(sys.argv) > 4 else 'large'
    print(build(code, out, theme, size))
