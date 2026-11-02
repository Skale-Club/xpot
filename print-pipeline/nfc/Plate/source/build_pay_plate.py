"""The Pay Plates beyond Venmo: Zelle, Cash App and PayPal, one code at a time (builder plate.pay).

The Large Venmo Plate's layout (build_venmo_plate_batch.py), with the brand's real logo from library/svg. Each brand
takes one extra filament, as face_composition_pay.BRANDS decided: PayPal's three-blue monogram prints in one blue, Cash
App's badge in its green with the "$" left in the body's colour, and Zelle's letters in its purple on white. On black
Zelle's letters are the art's white, so that plate has no third colour. Words in a logo are the art's colour.
"""
import re
import xml.etree.ElementTree as ET

import numpy as np
from shapely import affinity
from shapely.geometry import box
from shapely.ops import unary_union

from build_menu_batch import tile, geom, fa, REPO
from build_menu_sticker_test import nfc_pocket, ART_DEPTH

SIZE, CX, MARGIN = 103., 51.5, 8.
QR_TOP, QR_SIZE = 64., 31.
BORDER = 2.48                                     # the space the Venmo layout keeps for a QR panel: the same place
BRAND_W, BRAND_H, PAY_GAP, PAY_CAP = 70., 16., 5.0, 8.2
TAP_ROW_BOTTOM = MARGIN + 7.2
DEPTH_THEME = 'white'                             # one pause for both colours, as on the Venmo Plate
SVG_DIR = REPO / 'library' / 'svg'

# fills: source colour -> 'logo' (the extra filament), 'ink' (the art's colour) or 'hole' (cut back to the body).
BRANDS = {
    'zelle': {'file': 'Zelle Logo.svg', 'colour': '#6C1CD3', 'name': 'Zelle', 'skip_rect': True,
              'fills': {'white': 'logo', '#ffffff': 'logo'}, 'black_fills': {'white': 'ink', '#ffffff': 'ink'}},
    'cashapp': {'file': 'Cash App Logo Primary Black.svg', 'colour': '#00E013', 'name': 'Cash App',
                'fills': {'#00e013': 'logo', '#fff': 'hole', '#ffffff': 'hole', '#000000': 'ink', '#000': 'ink', None: 'ink'}},
    'paypal': {'file': 'PayPal Logo 2024.svg', 'colour': '#008CFF', 'name': 'PayPal',
               'fills': {'#002991': 'logo', '#60cdff': 'logo', '#008cff': 'logo', '#000000': 'ink', None: 'ink'}},
}


def _matrix(text):
    """An SVG transform list as a 3 x 3 matrix."""
    out = np.eye(3)
    for name, args in re.findall(r'(\w+)\(([^)]*)\)', text or ''):
        v = [float(x) for x in re.split(r'[\s,]+', args.strip()) if x]
        m = np.eye(3)
        if name == 'translate':
            m[0, 2], m[1, 2] = v[0], v[1] if len(v) > 1 else 0.0
        elif name == 'scale':
            m[0, 0], m[1, 1] = v[0], v[1] if len(v) > 1 else v[0]
        elif name == 'matrix':
            m[0, 0], m[1, 0], m[0, 1], m[1, 1], m[0, 2], m[1, 2] = v
        else:
            raise ValueError(f'SVG transform {name!r} not handled')
        out = out @ m
    return out


def _fill(node, css, inherited):
    style = dict(p.split(':', 1) for p in (node.get('style') or '').split(';') if ':' in p)
    for name in (node.get('class') or '').split():
        style.update(dict(p.split(':', 1) for p in css.get(name, '').split(';') if ':' in p))
    fill = (style.get('fill') or node.get('fill') or inherited)
    return fill.strip().lower() if fill else None


def logo_geoms(brand, theme):
    """(logo, ink) polygons of a brand's file in its own units, painted in file order."""
    spec = BRANDS[brand]
    fills = spec.get(f'{theme}_fills', spec['fills'])
    text = (SVG_DIR / spec['file']).read_text(encoding='utf-8')
    css = {k: v.strip() for k, v in re.findall(r'\.([\w-]+)\s*\{([^}]*)\}', text)}
    logo, ink = [], []

    def walk(node, matrix, inherited):
        tag = node.tag.rsplit('}', 1)[-1]
        if tag in ('defs', 'metadata', 'style', 'namedview', 'rect'):
            return
        matrix = matrix @ _matrix(node.get('transform'))
        fill = _fill(node, css, inherited)
        if tag == 'path':
            kind = fills.get(fill, fills.get(None))
            if kind is None:
                raise ValueError(f'{brand}: no colour for fill {fill!r}')
            a, b, c, d, e, f = matrix[0, 0], matrix[0, 1], matrix[1, 0], matrix[1, 1], matrix[0, 2], matrix[1, 2]
            shape = affinity.affine_transform(fa.even_odd(fa.svg_path_rings(node.get('d'))), [a, b, c, d, e, f])
            if kind == 'hole':
                logo[:] = [g.difference(shape) for g in logo]
            else:
                (logo if kind == 'logo' else ink).append(shape)
        for child in node:
            walk(child, matrix, fill)

    walk(ET.fromstring(text.encode('utf-8')), np.eye(3), None)
    return unary_union(logo) if logo else None, unary_union(ink) if ink else None


def fit(logo, ink, cx, top, max_w, max_h):
    """Both pieces fitted together by their ink into the logo's box, centred on cx, the top at `top`."""
    x0, y0, x1, y1 = unary_union([g for g in (logo, ink) if g is not None]).bounds
    k = min(max_w / (x1 - x0), max_h / (y1 - y0))
    m = [k, 0, 0, k, cx - (x0 + x1) / 2 * k, top - y0 * k]
    # Opened by a hair: PayPal's overlapping pieces touch at single points, which would make a non-manifold edge.
    return tuple(None if g is None else affinity.affine_transform(g, m).buffer(-.01, join_style='mitre').buffer(.01, join_style='mitre')
                 .simplify(.002, preserve_topology=True) for g in (logo, ink))


def stl_names(brand, theme):
    """(body, ink, logo) STL names."""
    body, ink = ('White', 'Black') if theme == 'white' else ('Black', 'White')
    name = BRANDS[brand]['name'].replace(' ', '')
    return f'{body}_{name}_Plate.stl', f'{ink}_{name}_Art.stl', f'Colour_{name}_Logo.stl'


def build_one(code, out, brand, theme, nfc_mount):
    """One Plate's meshes: the body, the art (tap row, Pay here, QR, the logo's words) and the logo's colour, if any."""
    if brand not in BRANDS:
        raise ValueError(f'brand {brand!r}: one of {", ".join(BRANDS)}')
    tile.configure_size('large')
    tap, _ = fa.tap_row_geom(CX, dict(icon_h=7.2, cap=4.9, gap=2.5, label='Tap here', y=MARGIN))
    group_h = BRAND_H + PAY_GAP + PAY_CAP
    space = (QR_TOP - BORDER - TAP_ROW_BOTTOM - group_h) / 2
    assert space > 4 * 1.24 - BORDER, space
    top = TAP_ROW_BOTTOM + space
    logo_c, words = fit(*logo_geoms(brand, theme), CX, top, BRAND_W, BRAND_H)
    pay, width = fa.text_geom('Pay here', PAY_CAP, CX, top + BRAND_H + PAY_GAP + PAY_CAP)
    assert width < 87
    dark, _, qr = fa.qr_geom(dict(x=CX - QR_SIZE / 2, y=QR_TOP, size=QR_SIZE, modules=25), fa.QR_BASE + code)
    ink_parts = [tap, pay, dark] + ([words] if words is not None else [])
    ink_c = unary_union(ink_parts)
    if logo_c is not None:
        ink_c = ink_c.difference(logo_c)
    ink_c = ink_c.simplify(.002, preserve_topology=True)
    ink = tile.to_tile(ink_c)
    logo = tile.to_tile(logo_c) if logo_c is not None else None
    back_text, _ = fa.text_geom(code, 3.2, 51.5, 53.1)
    back = tile.to_tile_back(back_text.buffer(-.01, join_style='mitre').buffer(.01, join_style='mitre')
                             .simplify(.002, preserve_topology=True))
    pocket, pz0, pz1 = nfc_pocket(nfc_mount, DEPTH_THEME, SIZE, TAP_ROW_BOTTOM + space / 2)
    x0, y0, x1, y1 = pocket.bounds
    z0, z1 = tile.TOP - pz1, tile.TOP - pz0                  # model z runs from the back (0) to the face (TOP)
    assert z1 < tile.TOP - ART_DEPTH
    plain = tile.body()
    plain_volume = geom.to_trimesh(plain).volume
    art = unary_union([g for g in (ink, logo) if g is not None])
    body = plain - geom.prism(pocket, z0, z1) - geom.prism(art, tile.TOP - ART_DEPTH, tile.TOP + .2) \
        - geom.prism(back, -.2, .32)
    meshes = [geom.to_trimesh(body), geom.to_trimesh(geom.prism(ink, tile.TOP - ART_DEPTH, tile.TOP))]
    if logo is not None:
        meshes.append(geom.to_trimesh(geom.prism(logo, tile.TOP - ART_DEPTH, tile.TOP)))
    expected = plain_volume - pocket.area * (z1 - z0) - art.area * ART_DEPTH - back.area * .32
    q = dict(size=QR_SIZE, modules=25, y=QR_TOP)
    geom.H = SIZE
    decoded = geom.decode_qr_polygons(tile.to_tile(dark), q, qr['url'])
    section = geom.mesh_section_polygons(meshes[1], tile.TOP - .26)
    decoded_mesh = geom.decode_qr_polygons(section.intersection(box(-16.5, 7., 16.5, 40.)), q, qr['url'])
    floor = geom.mesh_section_polygons(meshes[0], (z0 + z1) / 2)
    hole_area = sum(type(p)(r).area for p in getattr(floor, 'geoms', [floor]) for r in p.interiors)
    bad = sum(geom.welded_bad_edges(m) for m in meshes)
    ok = (all(m.is_watertight for m in meshes) and bad == 0
          and abs(meshes[0].volume - expected) / expected < .005
          and abs(hole_area - pocket.area) < .5
          and decoded == qr['url'] and decoded_mesh == qr['url'])
    report = dict(code=code, brand=brand, theme=theme, ok=bool(ok), qr=qr, qr_decoded_polygons=decoded,
                  qr_decoded_mesh=decoded_mesh, bad_edges=bad, body_mm3=meshes[0].volume, expected_mm3=expected,
                  logo_mm=[round(v, 2) for v in unary_union([g for g in (logo_c, words) if g is not None]).bounds],
                  message_gap_mm=space, nfc_mount=nfc_mount,
                  pocket_mm=[round(x1 - x0, 2), round(y1 - y0, 2), round(pz1 - pz0, 2)], pocket_print_z=[pz0, pz1],
                  pocket_section_mm2=hole_area, pocket_expected_mm2=pocket.area, tag_face_distance_mm=pz0,
                  nfc_centre_from_top_mm=round(SIZE - (y0 + y1) / 2, 2))
    if not ok:
        raise RuntimeError(report)
    out.mkdir(parents=True, exist_ok=True)
    for mesh, name in zip(meshes, stl_names(brand, theme)):
        mesh.export(out / name)
    return report
