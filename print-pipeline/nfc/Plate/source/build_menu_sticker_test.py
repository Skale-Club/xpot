"""Build one non-production black Large Menu Plate for a near-face NFC sticker test.

LPLATE-2026-004 failed mid-print (2026-10-20): the round tags in the 0.96 mm cavity
at print z 1.64-2.60 ruined the plates. This test embeds the 10 x 20 x 0.15 mm adhesive
NTAG213 (Amazon ASIN B0CMXHWTYH) close to the face instead: a POCKET_W x POCKET_H x 0.48 mm
pocket (the doc 16 §5 standard) at print z 0.68-1.16, one black layer behind the 0.52 mm white face art, so the
tag sits 0.68 mm from the surface the phone touches. Pause at the start of the first
roof layer (top z 1.32), stick the tag flat on the pocket floor, resume; the printer
seals it. The QR and back engraving use TEST0002, which is not an issued Xpot code.
"""
from pathlib import Path
import json
import shutil
import subprocess
import sys
import tempfile

import build_menu_batch as menu
from build_menu_batch import tile, geom, fa, SOURCE, PIECE, REPO
from shapely.geometry import box
from shapely.ops import unary_union

TEST_CODE = 'TEST0002'
TEST_DIR = PIECE/'test'/'physical'/'menu-large-black-sticker-near-face'
MESH_DIR = TEST_DIR/'mesh'
RECIPE = TEST_DIR/'build-test-only-menu-large-black-sticker-near-face.json'
OUTPUT = PIECE/'PRINT NOW'/'0 - TEST ONLY - MENU LARGE BLACK - NFC STICKER 10x20 NEAR FACE - PLA x1.3mf'
BASE_RECIPE = PIECE/'production'/'LPLATE-2026-004'/'build-menu-large-black-pla.json'

TAG_W, TAG_H, TAG_T = 20.0, 10.0, 0.15
# per side. 0.40 (20.8 x 10.8, LPLATE-2026-004) was too tight to place by hand at the pause and felt
# 1-2 mm small (user, 2026-10-21); 1.50 gives the standard 23.0 x 13.0 pocket (doc 16 §5).
CLEARANCE = 1.50
POCKET_W, POCKET_H = TAG_W + 2*CLEARANCE, TAG_H + 2*CLEARANCE
# print z: floor after layer 4, three 0.16 layers deep (0.33 air over the tag). Two layers (0.68-1.00,
# LPLATE-2026-004) let the sticker disturb the roof layer printed right over it (user, 2026-10-21).
POCKET_DEPTH = 0.48
POCKET_Z0, POCKET_Z1 = 0.68, 0.68 + POCKET_DEPTH
PAUSE_TOP_Z = 1.32                  # first roof layer; the pause runs before it prints
# White PLA is translucent: the antenna would shadow through 0.68 mm of it, so a white body takes the tag
# deeper (user chose 1.16, 2026-10-21). Black is opaque and keeps 0.68.
POCKET_Z0_BY_THEME = {'black': 0.68, 'white': 1.16}
ART_DEPTH = 0.52
TAP_ROW_BOTTOM = 8. + 7.2           # menu.artwork: margin + Tap here icon height, from the top of the face


def pocket_z(theme):
    """(floor, roof, pause_top_z) in print z for a theme."""
    z0 = POCKET_Z0_BY_THEME[theme]
    return z0, round(z0 + POCKET_DEPTH, 2), round(z0 + POCKET_DEPTH + .16, 2)


def stl_names(theme):
    """(body, art) STL names: the body takes the theme colour, the art the other one."""
    return ('Black_Menu_Plate.stl', 'White_Menu_Art.stl') if theme == 'black' else \
           ('White_Menu_Plate.stl', 'Black_Menu_Art.stl')


def build_one(code, out, placement='under_tap', theme='black'):
    """placement 'title': centred on the Menu title (TEST0002, 2026-10-21);
    'under_tap': centred in the gap between the Tap here row and the title (user: "um pouco mais pra cima").
    theme 'black': white art and a white QR panel on a black body; 'white': black art and the QR's dark
    modules straight on a white body, no panel."""
    ink_comp, dark, panel, qr, title_centre, space = menu.artwork(code)
    if theme == 'white':
        ink_comp = unary_union([ink_comp.difference(panel), dark]).simplify(.002, preserve_topology=True)
    nfc_top = title_centre if placement == 'title' else TAP_ROW_BOTTOM + space/2
    pz0, pz1, _ = pocket_z(theme)
    ink, panel_tile = tile.to_tile(ink_comp), tile.to_tile(panel)
    back_text, _ = fa.text_geom(code, 3.2, 51.5, 53.1)
    back = tile.to_tile_back(back_text.buffer(-.01, join_style='mitre').buffer(.01, join_style='mitre')
                             .simplify(.002, preserve_topology=True))
    w, h, cy = TAG_W/2 + CLEARANCE, TAG_H/2 + CLEARANCE, 103 - nfc_top
    assert h + 1.5 < nfc_top < 103 - h - 1.5
    pocket = tile._rounded_rect(-w, cy - h, w, cy + h, .8)
    # model z runs from the back (0) to the face (TOP); print z = TOP - model z
    z0, z1 = tile.TOP - pz1, tile.TOP - pz0
    assert z1 < tile.TOP - ART_DEPTH, 'pocket must stay behind the face art'
    plain = tile.body()
    plain_volume = geom.to_trimesh(plain).volume
    body = plain - geom.prism(pocket, z0, z1)
    body = body - geom.prism(ink, tile.TOP - ART_DEPTH, tile.TOP + .2) - geom.prism(back, -.2, .32)
    body_mesh = geom.to_trimesh(body)
    art_mesh = geom.to_trimesh(geom.prism(ink, tile.TOP - ART_DEPTH, tile.TOP))
    expected = plain_volume - pocket.area*(z1 - z0) - ink.area*ART_DEPTH - back.area*.32
    q = dict(size=31., modules=25, y=64.)
    geom.H = 103.
    decoded = geom.decode_qr_polygons(tile.to_tile(dark), q, qr['url'])
    section = geom.mesh_section_polygons(art_mesh, tile.TOP - .26)
    mesh_dark = panel_tile.difference(section) if theme == 'black' else section
    decoded_mesh = geom.decode_qr_polygons(mesh_dark.intersection(box(-16.5, 7., 16.5, 40.)), q, qr['url'])
    floor = geom.mesh_section_polygons(body_mesh, (z0 + z1)/2)
    hole_area = sum(i.area for p in getattr(floor, 'geoms', [floor]) for i in map(lambda r: type(p)(r), p.interiors))
    bad = geom.welded_bad_edges(body_mesh) + geom.welded_bad_edges(art_mesh)
    ok = (body_mesh.is_watertight and art_mesh.is_watertight and bad == 0
          and abs(body_mesh.volume - expected)/expected < .005
          and abs(art_mesh.volume - ink.area*ART_DEPTH)/(ink.area*ART_DEPTH) < .005
          and abs(hole_area - pocket.area) < .5
          and decoded == qr['url'] and decoded_mesh == qr['url'])
    report = dict(code=code, ok=bool(ok), qr=qr, qr_decoded_polygons=decoded, qr_decoded_mesh=decoded_mesh,
                  watertight=[bool(body_mesh.is_watertight), bool(art_mesh.is_watertight)], bad_edges=bad,
                  tile_shells=len(body.decompose()), tile_bounds=body_mesh.bounds.tolist(),
                  body_mm3=body_mesh.volume, expected_mm3=expected,
                  pocket_mm=[2*w, 2*h, round(pz1 - pz0, 2)], pocket_print_z=[pz0, pz1],
                  pocket_section_mm2=hole_area, pocket_expected_mm2=pocket.area,
                  tag_face_distance_mm=pz0, air_over_tag_mm=round(pz1 - pz0 - TAG_T, 2),
                  nfc_centre_from_top_mm=nfc_top, placement=placement, theme=theme)
    if not ok: raise RuntimeError(report)
    out.mkdir(parents=True, exist_ok=True)
    body_name, art_name = stl_names(theme)
    body_mesh.export(out/body_name)
    art_mesh.export(out/art_name)
    return report


def main():
    if OUTPUT.exists() and '--replace' not in sys.argv:
        raise SystemExit(f'refusing to overwrite existing test artifact: {OUTPUT}')
    report = build_one(TEST_CODE, MESH_DIR, placement='title')
    cfg = json.loads(BASE_RECIPE.read_text())
    cfg.update(name='TEST ONLY Menu Large Black NFC Sticker 10x20 Near Face PLA x1',
               pause_top_z=PAUSE_TOP_Z,
               _pause=(f'Pocket at print z {POCKET_Z0}-{POCKET_Z1}; the pause runs before the {POCKET_Z1}-{PAUSE_TOP_Z} '
                       'roof layer. Peel the programmed 10 x 20 NTAG213 and press it flat on the pocket floor, '
                       'adhesive down, nothing above the pocket rim; resume.'),
               _about=('NON-PRODUCTION physical test: one black 103 x 103 x 3.56 Menu plate (Inria Serif Bold, '
                       'normal 31 mm QR) with the LeadSeals 10 x 20 x 0.15 mm NTAG213 sticker (ASIN B0CMXHWTYH) '
                       f'embedded {POCKET_Z0} mm behind the face in a {POCKET_W:.2f} x {POCKET_H:.2f} x '
                       f'{POCKET_Z1 - POCKET_Z0:.2f} mm pocket. '
                       'TEST0002 is not an issued Xpot code; this print must never enter inventory.'),
               _batch='TEST ONLY; no production batch, no inventory intake, no serial map.')
    names = ['Black - Test Menu Plate', 'White - Test Menu Art']
    cfg['parts'] = [dict(name=names[0], stl='Black_Menu_Plate.stl', extruder=1),
                    dict(name=names[1], stl='White_Menu_Art.stl', extruder=2)]
    cfg['copies'] = [dict(name=f'TEST ONLY Menu Large {TEST_CODE}', parts=names, offset=[-72.5, -53.5])]
    TEST_DIR.mkdir(parents=True, exist_ok=True)
    RECIPE.write_text(json.dumps(cfg, indent=1) + '\n')
    (TEST_DIR/'geometry-verification.json').write_text(json.dumps(report, indent=2) + '\n')
    with tempfile.TemporaryDirectory(prefix='menu-sticker-test-') as temp:
        tmp = Path(temp)/OUTPUT.name
        subprocess.run([sys.executable, str(REPO/'library/scripts/build-3mf-from-fusion.py'), str(RECIPE),
                        '--stl-dir', str(MESH_DIR), '--out', str(tmp)], check=True)
        shutil.copy2(tmp, OUTPUT)
    print(json.dumps(dict(code=TEST_CODE, report=report, recipe=str(RECIPE), print_file=str(OUTPUT)), indent=2))


if __name__ == '__main__': main()
