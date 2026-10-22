"""Build a four-up Large "Pay here" Venmo Plate batch: two white plates and two black ones on one bed.

Face (study v3, `face_composition_tile.py` 'pay' / 'venmo', Large): Tap here row, the real Venmo wordmark
(`library/svg/Venmo Logo.svg`) in Venmo blue fitted into 70 x 16, "Pay here" cap 8.2, the 31 mm QR
(white plates: dark modules straight on the body; black plates: on a white panel). Both colourways share one
layout, so the NFC pocket sits in the same place on all four: the doc 16 §5 sticker pocket under Tap here.
One print has one pause, so the black plates take the white plates' depth: floor 1.16 mm behind the face,
pause z 1.80 (the white depth printed fine on LPLATE-2026-005).

    python build_venmo_plate_batch.py --sample <dir>          geometry check of both colourways, code A7K3P9X2
    python build_venmo_plate_batch.py <xpot-response.json>    the real batch: serials 001-002 white, 003-004 black
"""
from pathlib import Path
import argparse
import csv
import datetime
import json
import re
import shutil
import subprocess
import sys
import tempfile

import numpy as np
from shapely import affinity
from shapely.geometry import box
from shapely.ops import unary_union

from build_menu_batch import tile, geom, fa, PIECE, REPO, SOURCE
from build_menu_sticker_test import pocket_z, TAG_W, TAG_H, TAG_T, CLEARANCE, POCKET_W, POCKET_H, ART_DEPTH, \
    TAP_ROW_BOTTOM

SAMPLE_CODE = 'A7K3P9X2'
VENMO_SVG = REPO/'library/svg/Venmo Logo.svg'
VENMO_BLUE = '#008CFF'
SIZE, CX, MARGIN = 103., 51.5, 8.
QR_TOP, QR_SIZE, BORDER = 64., 31., 2.48          # 25 modules of 1.24; the black panel's border is 2 modules
BRAND_W, BRAND_H, PAY_GAP, PAY_CAP = 70., 16., 5.0, 8.2
DEPTH_THEME = 'white'                             # one pause for both colourways (see the docstring)
# bed order: serials 001-002 white in front, 003-004 black behind
THEMES = ['white', 'white', 'black', 'black']
POSITIONS = ['front-left', 'front-right', 'back-left', 'back-right']
OFFSETS = [(-72.5, -53.5), (72.5, -53.5), (-72.5, 53.5), (72.5, 53.5)]


def venmo_geom(cx, top, max_w, max_h):
    """The Venmo wordmark as polygons, fitted by its ink into max_w x max_h, centred on cx, its top at `top`."""
    t = VENMO_SVG.read_text(encoding='utf-8')
    # the file's two group transforms: translate(-5.7593441,-130.66032) . matrix(0.9244437,0,0,0.89314785,5.7593441,129.92613)
    sx, sy, dy = 0.9244437, 0.89314785, 129.92613 - 130.66032
    glyphs = []
    for d in re.findall(r'\sd="([^"]+)"', t):
        g = fa.even_odd(fa.svg_path_rings(d))
        glyphs.append(affinity.affine_transform(g, [sx, 0, 0, sy, 0, dy]))
    logo = unary_union(glyphs)
    x0, y0, x1, y1 = logo.bounds
    k = min(max_w / (x1 - x0), max_h / (y1 - y0))
    logo = affinity.affine_transform(logo, [k, 0, 0, k, cx - (x0 + x1) / 2 * k, top - y0 * k])
    return logo.simplify(.002, preserve_topology=True)


def artwork(code, theme):
    """(ink, blue, dark, panel, qr, nfc_centre_from_top, space) in composition coordinates (y down)."""
    tap, _ = fa.tap_row_geom(CX, dict(icon_h=7.2, cap=4.9, gap=2.5, label='Tap here', y=MARGIN))
    group_h = BRAND_H + PAY_GAP + PAY_CAP
    space = (QR_TOP - BORDER - TAP_ROW_BOTTOM - group_h) / 2      # the black layout, used by both colourways
    assert space > 4 * 1.24 - BORDER, space
    top = TAP_ROW_BOTTOM + space
    logo = venmo_geom(CX, top, BRAND_W, BRAND_H)
    assert logo.bounds[3] - logo.bounds[1] <= BRAND_H + .01 and logo.bounds[2] - logo.bounds[0] <= BRAND_W + .01
    pay, width = fa.text_geom('Pay here', PAY_CAP, CX, top + BRAND_H + PAY_GAP + PAY_CAP)
    assert width < 87
    dark, _, qr = fa.qr_geom(dict(x=CX - QR_SIZE / 2, y=QR_TOP, size=QR_SIZE, modules=25), fa.QR_BASE + code)
    panel = tile._rounded_rect(CX - QR_SIZE / 2 - BORDER, QR_TOP - BORDER,
                               CX + QR_SIZE / 2 + BORDER, QR_TOP + QR_SIZE + BORDER, BORDER * .6)
    qr_ink = panel.difference(dark) if theme == 'black' else dark
    ink = unary_union([tap, pay, qr_ink]).difference(logo).simplify(.002, preserve_topology=True)
    return ink, logo, dark, panel, qr, TAP_ROW_BOTTOM + space / 2, space


def stl_names(theme):
    """(body, ink, logo) STL names."""
    body, ink = ('White', 'Black') if theme == 'white' else ('Black', 'White')
    return f'{body}_Venmo_Plate.stl', f'{ink}_Venmo_Art.stl', 'Blue_Venmo_Logo.stl'


def build_one(code, out, theme):
    ink_c, logo_c, dark, panel, qr, nfc_top, space = artwork(code, theme)
    ink, logo, panel_tile = tile.to_tile(ink_c), tile.to_tile(logo_c), tile.to_tile(panel)
    back_text, _ = fa.text_geom(code, 3.2, 51.5, 53.1)
    back = tile.to_tile_back(back_text.buffer(-.01, join_style='mitre').buffer(.01, join_style='mitre')
                             .simplify(.002, preserve_topology=True))
    pz0, pz1, _ = pocket_z(DEPTH_THEME)
    w, h, cy = POCKET_W / 2, POCKET_H / 2, SIZE - nfc_top
    pocket = tile._rounded_rect(-w, cy - h, w, cy + h, .8)
    z0, z1 = tile.TOP - pz1, tile.TOP - pz0                  # model z runs from the back (0) to the face (TOP)
    assert z1 < tile.TOP - ART_DEPTH
    plain = tile.body()
    plain_volume = geom.to_trimesh(plain).volume
    art = unary_union([ink, logo])
    body = plain - geom.prism(pocket, z0, z1) - geom.prism(art, tile.TOP - ART_DEPTH, tile.TOP + .2) \
        - geom.prism(back, -.2, .32)
    body_mesh = geom.to_trimesh(body)
    ink_mesh = geom.to_trimesh(geom.prism(ink, tile.TOP - ART_DEPTH, tile.TOP))
    logo_mesh = geom.to_trimesh(geom.prism(logo, tile.TOP - ART_DEPTH, tile.TOP))
    expected = plain_volume - pocket.area * (z1 - z0) - art.area * ART_DEPTH - back.area * .32
    q = dict(size=QR_SIZE, modules=25, y=QR_TOP)
    geom.H = SIZE
    decoded = geom.decode_qr_polygons(tile.to_tile(dark), q, qr['url'])
    section = geom.mesh_section_polygons(ink_mesh, tile.TOP - .26)
    mesh_dark = panel_tile.difference(section) if theme == 'black' else section
    decoded_mesh = geom.decode_qr_polygons(mesh_dark.intersection(box(-16.5, 7., 16.5, 40.)), q, qr['url'])
    floor = geom.mesh_section_polygons(body_mesh, (z0 + z1) / 2)
    hole_area = sum(type(p)(r).area for p in getattr(floor, 'geoms', [floor]) for r in p.interiors)
    bad = sum(geom.welded_bad_edges(m) for m in (body_mesh, ink_mesh, logo_mesh))
    ok = (all(m.is_watertight for m in (body_mesh, ink_mesh, logo_mesh)) and bad == 0
          and ink.intersection(logo).area < 1e-6
          and abs(body_mesh.volume - expected) / expected < .005
          and abs(ink_mesh.volume - ink.area * ART_DEPTH) / (ink.area * ART_DEPTH) < .005
          and abs(logo_mesh.volume - logo.area * ART_DEPTH) / (logo.area * ART_DEPTH) < .005
          and abs(hole_area - pocket.area) < .5
          and decoded == qr['url'] and decoded_mesh == qr['url'])
    report = dict(code=code, theme=theme, ok=bool(ok), qr=qr, qr_decoded_polygons=decoded,
                  qr_decoded_mesh=decoded_mesh, bad_edges=bad, body_mm3=body_mesh.volume, expected_mm3=expected,
                  logo_mm=[round(logo_c.bounds[2] - logo_c.bounds[0], 2), round(logo_c.bounds[3] - logo_c.bounds[1], 2)],
                  logo_mm2=logo.area, message_gap_mm=space,
                  pocket_mm=[POCKET_W, POCKET_H, round(pz1 - pz0, 2)], pocket_print_z=[pz0, pz1],
                  pocket_section_mm2=hole_area, pocket_expected_mm2=pocket.area, tag_face_distance_mm=pz0,
                  nfc_centre_from_top_mm=nfc_top)
    if not ok: raise RuntimeError(report)
    out.mkdir(parents=True, exist_ok=True)
    for mesh, name in zip((body_mesh, ink_mesh, logo_mesh), stl_names(theme)):
        mesh.export(out / name)
    return report


def recipe(batch, rows, xpot_id):
    """Slot 1 white, slot 2 black (the white-plate base recipe), slot 3 Venmo blue."""
    cfg = json.loads((SOURCE / 'build-instagram-large-plate-pla.json').read_text())
    for key in ('filament_colour', 'filament_multi_colour'):
        cfg['settings'][key][2] = VENMO_BLUE
    z0, z1, pause = pocket_z(DEPTH_THEME)
    cfg.update(name=f'{batch} Venmo Pay Plates Large 2 White + 2 Black PLA x4', parts=[], copies=[],
               first_layer_sequence=[2, 3, 1], pause_top_z=pause, top_band=None,
               _first_layer_sequence='Black art, then blue logo, then white; every layer holds both body colours.',
               _batch=f'{batch}, Xpot {xpot_id}',
               _pause=(f'Sticker pockets at print z {z0}-{z1} on all four plates; the pause runs before the '
                       f'{z1}-{pause} roof layer. Press one blank 10 x 20 NTAG213 sticker flat, adhesive down, '
                       'long side left-right, into each pocket; resume.'),
               _about=('Four 103 x 103 x 3.56 "Pay here" Venmo plates: 001-002 white body + black art, 003-004 black '
                       'body + white art and a white QR panel; the Venmo wordmark in blue on all four. LeadSeals 10 x 20 '
                       f'NTAG213 sticker in a {POCKET_W:.2f} x {POCKET_H:.2f} x {z1 - z0:.2f} pocket {z0} mm behind '
                       'the face, under Tap here (doc 16 §5).'))
    for row, theme, offset in zip(rows, THEMES, OFFSETS):
        serial, code = row['serial_number'], row['public_code']
        body, ink = ('White', 'Black') if theme == 'white' else ('Black', 'White')
        names = [f'{body} - Venmo Plate {serial}', f'{ink} - Venmo Art {serial}', f'Blue - Venmo Logo {serial}']
        slots = (1, 2) if theme == 'white' else (2, 1)
        for name, stl, ext in zip(names, stl_names(theme), (*slots, 3)):
            cfg['parts'].append(dict(name=name, stl=f'{serial}/{stl}', extruder=ext))
        # the name ends in the code: gcode-qr-check.py reads it from there
        cfg['copies'].append(dict(name=f'{batch} #{serial} {theme} {code}', parts=names, offset=list(offset)))
    return cfg


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--sample', type=Path, help='build both colourways of the sample code into this directory and stop')
    ap.add_argument('response', nargs='?', type=Path, help='the tags_batch_create response saved as JSON')
    a = ap.parse_args()
    if a.sample:
        print(json.dumps([build_one(SAMPLE_CODE, a.sample / t, t) for t in ('white', 'black')], indent=2))
        return
    response = json.loads(a.response.read_text(encoding='utf-8-sig'))
    batch = response['batch']['batchCode']
    assert response['batch']['productType'] == 'large_plate'
    assert len(response['tags']) == 4 and len({t['publicCode'] for t in response['tags']}) == 4
    batch_dir = PIECE / 'production' / batch
    output = PIECE / 'PRINT NOW' / f'1 - PLATES VENMO LARGE - {batch} 2 WHITE + 2 BLACK - NFC STICKER - PLA x4.3mf'
    recipe_path = batch_dir / 'build-venmo-large-white-black-pla-sticker.json'
    if output.exists() or recipe_path.exists(): raise SystemExit(f'refusing to overwrite {batch}')
    rows = [dict(batch_code=batch, serial_number=f"{t['serialNumber']:03d}", public_code=t['publicCode'],
                 qr_url=t['qrUrl'], nfc_url=t['nfcUrl'], qr_asset_filename='') for t in response['tags']]
    external = PIECE / 'production' / f'{batch}-import.csv'
    with external.open('w', newline='') as f:
        writer = csv.DictWriter(f, fieldnames=list(rows[0])); writer.writeheader(); writer.writerows(rows)
    subprocess.run([sys.executable, str(PIECE.parent / 'Stand/source/production.py'), '--root',
                    str(PIECE / 'production'), 'import', str(external)], check=True)
    external.unlink()  # canonical copy exists in the imported batch directory
    reports = [build_one(r['public_code'], batch_dir / 'mesh' / r['serial_number'], t) for r, t in zip(rows, THEMES)]
    (batch_dir / 'geometry-verification.json').write_text(json.dumps(reports, indent=2) + '\n')
    (batch_dir / 'xpot-batch.json').write_text(json.dumps(response, indent=2) + '\n')
    recipe_path.write_text(json.dumps(recipe(batch, rows, response['batch']['id']), indent=1) + '\n')
    with tempfile.TemporaryDirectory(prefix='venmo-plate-batch-') as temp:
        tmp = Path(temp) / output.name
        subprocess.run([sys.executable, str(REPO / 'library/scripts/build-3mf-from-fusion.py'), str(recipe_path),
                        '--stl-dir', str(batch_dir / 'mesh'), '--out', str(tmp)], check=True)
        shutil.copy2(tmp, output)
    map_path = PIECE / 'PRINT NOW' / f'SERIAL MAP - {batch}.csv'
    with map_path.open('w', newline='') as f:
        writer = csv.writer(f)
        writer.writerow(['bed_position', 'serial_number', 'public_code', 'colour', 'qr_url', 'nfc_url'])
        for position, r, t in zip(POSITIONS, rows, THEMES):
            writer.writerow([position, r['serial_number'], r['public_code'], t, r['qr_url'], r['nfc_url']])
    sys.path.insert(0, str(PIECE.parent / 'Stand/source'))
    import production
    ledger = production.read_ledger(str(PIECE / 'production'))
    themes = dict(zip((r['serial_number'] for r in rows), THEMES))
    for row in ledger:
        if row['batch_code'] == batch:
            row['version'] = 'venmo'; row['art_built'] = datetime.date.today().isoformat()
            row['note'] = (f'Plate Large {themes[row["serial_number"]]} Pay here Venmo, NFC sticker; '
                           'polygons verified by build_venmo_plate_batch.py.')
    production.write_ledger(str(PIECE / 'production'), ledger)
    print(json.dumps(dict(batch=batch, print_file=str(output), serial_map=str(map_path), reports=reports), indent=2))


if __name__ == '__main__': main()
