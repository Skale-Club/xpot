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
from shapely.geometry import box
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


def build(code, batch, serial, out_dir):
    large.configure()
    code = fa.normalize_code(code)
    serial = str(serial)
    s_dark, s_back, square, _ = qr_and_serial(fa.SAMPLE_CODE, '', '')
    n_dark, n_back, _, info = qr_and_serial(code, batch, serial)
    assert info['url'] == fa.QR_BASE + code

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
    want_art = art0_volume + (n_dark.area - s_dark.area) * INLAY_D
    rep = {
        'code': code, 'batch': batch, 'serial': serial, 'qr_url': info['url'],
        'qr_modules': info['modules'], 'card_mm3': round(card_tm.volume, 1),
        'card_expected_mm3': round(want_card, 1), 'art_mm3': round(art_tm.volume, 1),
        'art_expected_mm3': round(want_art, 1), 'sample_qr_pieces_dropped': dropped,
        'card_watertight': card_tm.is_watertight, 'art_watertight': art_tm.is_watertight,
        'card_shells': len(card.decompose()),
    }
    ok = (abs(card_tm.volume - want_card) / want_card < 0.005
          and abs(art_tm.volume - want_art) / want_art < 0.005
          and card_tm.is_watertight and art_tm.is_watertight
          and rep['card_shells'] == 2 and dropped > 0)
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
