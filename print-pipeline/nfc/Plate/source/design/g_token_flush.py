"""Flat Google G token for the Google NFC Plate: flush with the plate face, not domed, not proud.

    python g_token_flush.py [out_dir] [large|small]
        default ../../source/mesh/g-token-flush/ (Large, G 20) or g-token-flush-small/ (Small, G 13)
        -> Blue/Red/Yellow/Green_Google_G_Token.stl (Yellow includes the core)

User, 2026-10-10: on the Plate the G is printed apart from the tile (only the G has four colours) and "nao pode ser
abaulado e popout igual no stand, ele precisa ter a mesma altura da plate". So the token is exactly as thick as the
tile's pocket (tile_per_code_google.POCKET, 1.16) and its outline is the tile's G outline (the pocket is that
outline + G_CLEAR per side).

Token frame, face up: z 0 = the face glued to the pocket floor, z POCKET = the visible face, flush with the tile.

      z POCKET ............. visible face (prints FIRST, face-down on the textured plate, like the tile's face)
      z POCKET - COLOUR .... the four colours stop here
      z 0 .................. pocket floor; from here to the colour band the core is ONE yellow piece

The flat four-colour token of REV-2026-002 (pieces side by side, touching only at their edges) broke at the colour
seams coming off the plate; the core under the colour band ties the four pieces together, as on the Stand's
relief token. The core is YELLOW, not blue: yellow is the least opaque of the four, so it is the one colour that
must not have another colour behind its 0.52 mm band, and blue / red / green hide a yellow core better than yellow
hides a blue one.

The first printed layer (FACE_LAYER at the face) is inset FACE_INSET: the elephant's foot of the token's first layer
and the tile's pocket edge both bulge into the 0.10 gap; the inset keeps the token's face from jamming at the rim.
It shows as a hairline bevel round the G.
"""
import os
import sys

import manifold3d as m3
import numpy as np
import shapely
from shapely.geometry import MultiPolygon

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import tile_per_code_google as tg  # noqa: E402
from tile_per_code import fa, igc, SIMPLIFY  # noqa: E402

POCKET = tg.POCKET
COLOUR = 0.52            # the tile's inlay depth: the 0.20 first layer + 2 x 0.16
FACE_LAYER, FACE_INSET = 0.20, 0.15
CORE_COLOUR = 'Yellow'
GRID = 1e-4              # mm, coordinate grid of the pieces
NAMES = fa.GOOGLE_NAMES  # hex -> Blue / Red / Yellow / Green


def parts(size='large'):
    """The four colour pieces and the outline, centred on the G's box, in tile orientation (y up)."""
    tg.configure(size)
    art = tg.layout(fa.SAMPLE_CODE)
    outline = tg.ig.to_tile(art['g_outline'])
    b = outline.bounds
    dx, dy = -(b[0] + b[2]) / 2, -(b[1] + b[3]) / 2
    from shapely import affinity
    # moved, the pieces come out invalid (rings that touched now cross by rounding): repair, then snap to GRID
    mv = lambda g: polys_only(shapely.make_valid(affinity.translate(tg.ig.to_tile(g), dx, dy)))
    return mv(art['g_outline']), [(NAMES[h.upper()], mv(p)) for h, p in art['g_pieces']]


def polys_only(g):
    """Drop the lines and points a shapely intersection leaves along shared edges."""
    g = shapely.set_precision(g, GRID)      # snap: the face inset leaves vertices < 1e-5 apart, which weld badly
    if g.geom_type == 'Polygon':
        return g
    flat = [q for q in getattr(g, 'geoms', []) for q in (getattr(q, 'geoms', None) or [q])]
    return MultiPolygon([q for q in flat if q.geom_type == 'Polygon' and q.area > 0.05])


def build(out_dir, size='large'):
    outline, pieces = parts(size)
    outline = shapely.set_precision(outline, GRID)      # on the pieces' grid, so core and band share vertices
    face = shapely.set_precision(outline.buffer(-FACE_INSET, join_style='mitre'), GRID)
    z_band, z_face = POCKET - COLOUR, POCKET - FACE_LAYER
    out, rep = {}, {'size': size, 'outline_mm2': round(outline.area, 2), 'size_mm': [round(v, 2) for v in
                    (outline.bounds[2] - outline.bounds[0], outline.bounds[3] - outline.bounds[1])]}
    # every colour piece is cut by ONE envelope (the outline, inset on the face layer): a union of two stepped
    # prisms per piece left vertices < 1e-5 apart where the inset crosses a seam, which the 3MF weld breaks
    envelope = igc.prism(outline, 0.0, z_face) + igc.prism(face, z_face, POCKET)
    total = 0.0
    for name, p in pieces:
        p = polys_only(p.intersection(outline))
        pf = polys_only(p.intersection(face))
        mf = igc.prism(p, z_band, POCKET)
        want = p.area * (z_face - z_band) + pf.area * FACE_LAYER
        if name == CORE_COLOUR:
            mf = mf + igc.prism(outline, 0.0, z_band)
            want += outline.area * z_band
        mf = mf ^ envelope
        tm = igc.to_trimesh(mf)
        assert tm.is_watertight and igc.welded_bad_edges(tm) == 0, '%s piece is not a clean solid' % name
        assert abs(tm.volume - want) / want < 0.005, '%s volume %.2f, expected %.2f' % (name, tm.volume, want)
        out[name] = tm
        total += tm.volume
        rep[name + '_mm3'] = round(tm.volume, 2)
    want_total = outline.area * (POCKET - FACE_LAYER) + face.area * FACE_LAYER
    rep['total_mm3'], rep['total_expected_mm3'] = round(total, 2), round(want_total, 2)
    assert abs(total - want_total) / want_total < 0.005, 'the four pieces do not fill the G: %s' % rep
    assert sorted(out) == ['Blue', 'Green', 'Red', 'Yellow']
    os.makedirs(out_dir, exist_ok=True)
    for name, tm in out.items():
        tm.export(os.path.join(out_dir, '%s_Google_G_Token.stl' % name))
    rep['ok'] = True
    return rep


if __name__ == '__main__':
    size = sys.argv[2] if len(sys.argv) > 2 else 'large'
    out = sys.argv[1] if len(sys.argv) > 1 and sys.argv[1] != '-' else os.path.join(
        tg.PIECE, 'source', 'mesh', 'g-token-flush' if size == 'large' else 'g-token-flush-small')
    print(build(out, size))
