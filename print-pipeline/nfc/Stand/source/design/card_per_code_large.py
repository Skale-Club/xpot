"""Build one 103 x 137 mm Google plaque for one real Xpot tag code.

This is the Large counterpart of ``card_per_code.py``.  It starts from the
Fusion-exported Large sample meshes, replaces the sample QR and back serial,
and refuses to write unless the resulting watertight volumes match the
polygon calculation.
"""
import glob
import os
import shutil
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
import face_art_large as large  # noqa: E402
import face_composition_large as fc  # noqa: E402

large.configure()

PIECE = os.path.dirname(os.path.dirname(HERE))
SAMPLE_MESH = os.path.join(PIECE, 'source', 'mesh', 'large')
CARD_T, INLAY_D, BACK_ENGRAVE = 3.56, 0.52, 0.32
X_OFF = 0.0
FILL_MARGIN = 0.3
OVERLAP = 0.05

# The sample card's round 25 mm tag cavity (centre x 0, y 122; card z 0.96-1.92 = print z 1.64-2.60).
ROUND_CENTRE, ROUND_D, ROUND_Z0, ROUND_Z1 = (0.0, 122.0), 25.6, 0.96, 1.92
# nfc_mount 'sticker_10x20': the LeadSeals 10 x 20 x 0.15 NTAG213 sticker (ASIN B0CMXHWTYH) in the doc 16 s5
# pocket, 23.00 x 13.00 x 0.48, long side left-right, on the round tag's centre: y 115.5-128.5 clears the G
# pocket (y 87.9-114.1). The round cavity is filled back. Print z of the floor by theme, as on the Plates: white
# PLA is translucent, so a white body takes the tag 1.16 behind the face; black is opaque and keeps 0.68.
STICKER_W, STICKER_H, STICKER_DEPTH, STICKER_RADIUS = 23.0, 13.0, 0.48, 0.8
STICKER_Z0_BY_THEME = {'white': 1.16, 'black': 0.68}


def sticker_pocket_z(theme):
    """(floor, roof, pause_top_z) in print z (face down: print z = CARD_T - card z)."""
    z0 = STICKER_Z0_BY_THEME[theme]
    return z0, round(z0 + STICKER_DEPTH, 2), round(z0 + STICKER_DEPTH + 0.16, 2)


def to_manifold(tm):
    return m3.Manifold(m3.Mesh(vert_properties=np.asarray(tm.vertices, np.float32),
                               tri_verts=np.asarray(tm.faces, np.uint32)))


def to_trimesh(mf):
    mesh = mf.to_mesh()
    return trimesh.Trimesh(np.asarray(mesh.vert_properties)[:, :3],
                           np.asarray(mesh.tri_verts), process=False)


def load(path):
    return trimesh.load(path, force='mesh', process=True)


def prism(geom, z0, z1):
    geom = affinity.translate(geom, X_OFF, 0)
    rings = []
    for p in fa.polys(geom):
        rings.append(np.asarray(p.exterior.coords[:-1], np.float64))
        rings += [np.asarray(h.coords[:-1], np.float64) for h in p.interiors]
    cs = m3.CrossSection(rings, m3.FillRule.EvenOdd)
    return cs.extrude(z1 - z0).translate((0.0, 0.0, z0))


def qr_and_serial(code, batch, serial):
    r = fc.resolve_version('google')
    dark, _, info = fa.qr_geom(r['qr'], fa.QR_BASE + code)
    back, _ = fa.serial_geom(code, batch, serial)
    q = r['qr']
    square = fa.to_card(box(q['x'], q['y'], q['x'] + q['size'], q['y'] + q['size']))
    return fa.to_card(dark), fa.to_card_back(back), square, info


def build(code, batch, serial, out_dir, nfc_mount='embedded_round', theme='white'):
    if nfc_mount not in ('embedded_round', 'sticker_10x20'):
        raise ValueError('unsupported nfc_mount')
    large.configure()
    code = fa.normalize_code(code)
    serial = str(serial)
    s_dark, s_back, square, _ = qr_and_serial(fa.SAMPLE_CODE, '', '')
    n_dark, n_back, _, info = qr_and_serial(code, batch, serial)
    assert info['url'] == fa.QR_BASE + code
    if nfc_mount == 'sticker_10x20':
        # Two back glyphs can touch at one point (the G and R of YYD1GRAY): that edge gets 4 triangles and the
        # 3MF assembler refuses the card. Shrink the text 0.01 mm, which leaves 0.02 mm between them (opening it
        # back out would make them touch again). Only on the sticker card, so the round-tag cards still rebuild
        # byte-identical.
        n_back = n_back.buffer(-.01, join_style='mitre')

    qr_fill = square.buffer(FILL_MARGIN, join_style='mitre')
    serial_fill = box(*unary_union([s_back, n_back]).bounds).buffer(FILL_MARGIN, join_style='mitre')

    card0 = load(os.path.join(SAMPLE_MESH, 'White_Google_Card.stl'))
    card = to_manifold(card0)
    card = card + prism(qr_fill, CARD_T - INLAY_D - OVERLAP, CARD_T)
    card = card + prism(serial_fill, -OVERLAP, BACK_ENGRAVE + OVERLAP)
    lo, hi = np.asarray(card.bounding_box()[:3]), np.asarray(card.bounding_box()[3:])
    card = card ^ m3.Manifold.cube((hi - lo + 2).tolist()).translate((lo[0] - 1, lo[1] - 1, 0.0))
    card = card - prism(n_dark, CARD_T - INLAY_D, CARD_T + 0.2)
    card = card - prism(n_back, -0.2, BACK_ENGRAVE)

    sticker = None
    if nfc_mount == 'sticker_10x20':
        cx, cy = ROUND_CENTRE
        round_fill = Point(cx, cy).buffer(ROUND_D / 2 + FILL_MARGIN, quad_segs=64)
        card = card + prism(round_fill, ROUND_Z0 - OVERLAP, ROUND_Z1 + OVERLAP)
        pz0, pz1, pause = sticker_pocket_z(theme)
        w, h, r = STICKER_W / 2, STICKER_H / 2, STICKER_RADIUS
        pocket = box(cx - w + r, cy - h + r, cx + w - r, cy + h - r).buffer(r, quad_segs=24)
        card = card - prism(pocket, CARD_T - pz1, CARD_T - pz0)
        sticker = {'pocket': pocket, 'print_z': [pz0, pz1], 'pause_top_z': pause}

    keep, dropped = [], 0
    qr_box_mesh = affinity.translate(qr_fill, X_OFF, 0)
    for path in sorted(glob.glob(os.path.join(SAMPLE_MESH, 'Black_Google_Art_*.stl'))):
        tm = load(path)
        cx, cy = tm.bounds.mean(axis=0)[:2]
        if qr_box_mesh.contains(box(cx, cy, cx, cy).centroid):
            dropped += 1
        else:
            keep.append(tm)
    art = to_manifold(trimesh.util.concatenate(keep)) + prism(n_dark, CARD_T - INLAY_D, CARD_T)
    art0_volume = sum(load(path).volume for path in glob.glob(os.path.join(SAMPLE_MESH, 'Black_Google_Art_*.stl')))

    card_tm, art_tm = to_trimesh(card), to_trimesh(art)
    want_card = card0.volume + (s_dark.area - n_dark.area) * INLAY_D + (s_back.area - n_back.area) * BACK_ENGRAVE
    if sticker:
        # card0.volume already excludes the round cavity: give it back, take the pocket
        round_mm3 = np.pi * (ROUND_D / 2) ** 2 * (ROUND_Z1 - ROUND_Z0)
        want_card += round_mm3 - sticker['pocket'].area * STICKER_DEPTH
    want_art = art0_volume + (n_dark.area - s_dark.area) * INLAY_D
    rep = {
        'code': code, 'batch': batch, 'serial': serial, 'nfc_mount': nfc_mount, 'qr_url': info['url'],
        'qr_modules': info['modules'], 'card_mm3': round(card_tm.volume, 1),
        'card_expected_mm3': round(want_card, 1), 'art_mm3': round(art_tm.volume, 1),
        'art_expected_mm3': round(want_art, 1), 'sample_qr_pieces_dropped': dropped,
        'card_watertight': card_tm.is_watertight, 'art_watertight': art_tm.is_watertight,
        'card_shells': len(card.decompose()),
    }
    if sticker:
        rep.update(theme=theme, sticker_pocket_mm=[STICKER_W, STICKER_H, STICKER_DEPTH],
                   sticker_pocket_print_z=sticker['print_z'], pause_top_z=sticker['pause_top_z'],
                   tag_face_distance_mm=sticker['print_z'][0])
        # a section through the pocket: one hole where the pocket is (a black card's section also crosses the
        # G pocket, 1.4 mm away, which must stay a separate hole)
        mid = CARD_T - sum(sticker['print_z']) / 2
        rings = sorted((Polygon(p) for p in card.slice(mid).to_polygons()), key=lambda p: -p.area)
        here = [p for p in rings[1:] if p.intersects(sticker['pocket'])]
        rep['sticker_section_mm2'] = round(sum(p.area for p in here), 2)
        rep['sticker_expected_mm2'] = round(sticker['pocket'].area, 2)
        ok_pocket = len(here) == 1 and abs(rep['sticker_section_mm2'] - rep['sticker_expected_mm2']) < 0.5
        round_left = card.slice((ROUND_Z0 + ROUND_Z1) / 2).to_polygons()
        rep['round_cavity_filled'] = len(round_left) == 1
    ok = (abs(card_tm.volume - want_card) / want_card < 0.005
          and abs(art_tm.volume - want_art) / want_art < 0.005
          and card_tm.is_watertight and art_tm.is_watertight
          and rep['card_shells'] == 2 and dropped > 0
          and (not sticker or (ok_pocket and rep['round_cavity_filled'])))
    rep['ok'] = bool(ok)
    if not ok:
        raise RuntimeError('per-code Large card failed its volume check, nothing written: %s' % rep)

    os.makedirs(out_dir, exist_ok=True)
    card_tm.export(os.path.join(out_dir, 'White_Google_Card.stl'))
    art_tm.export(os.path.join(out_dir, 'Black_Google_Art.stl'))
    stars = [load(path) for path in sorted(glob.glob(os.path.join(SAMPLE_MESH, 'Yellow_Google_Stars_*.stl')))]
    trimesh.util.concatenate(stars).export(os.path.join(out_dir, 'Yellow_Google_Stars.stl'))
    return rep


def build_tokens(out_dir):
    """Copy the four colour meshes for the shared 26 mm Google token."""
    os.makedirs(out_dir, exist_ok=True)
    result = {}
    for colour in ('Blue', 'Red', 'Yellow', 'Green'):
        source = glob.glob(os.path.join(SAMPLE_MESH, '%s_Google_G_Token_*.stl' % colour))
        if len(source) != 1:
            raise RuntimeError('expected one %s Large token mesh, found %d' % (colour, len(source)))
        target = os.path.join(out_dir, '%s_Google_G_Token.stl' % colour)
        shutil.copyfile(source[0], target)
        result[colour] = target
    return result


if __name__ == '__main__':
    if len(sys.argv) != 5:
        sys.exit(__doc__)
    print(build(*sys.argv[1:]))
