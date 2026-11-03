"""Shared, measured face layout for the flyer services on both physical products.

Geometry stays in millimetres. Black/coloured bodies use a light QR panel, never an inverted QR.
Every build decodes the actual mesh section, not just the artwork. Historic builders are untouched.
"""
from pathlib import Path
from functools import lru_cache
import json
import xml.etree.ElementTree as ET

from shapely import affinity
from shapely.geometry import Point, box
from shapely.ops import unary_union

from builders import nfc_mounts as nfc

ROOT = Path(__file__).resolve().parent.parent
NAMES = {'yelp': ('Yelp', 'Review us on Yelp'), 'facebook': ('Facebook', 'Follow us on Facebook'),
         'tiktok': ('TikTok', 'Follow us on TikTok'), 'website': ('Website', 'Visit our website'),
         'wifi': ('Wi-Fi', 'Connect to Wi-Fi'), 'venmo': ('Venmo', 'Pay here'),
         'cashapp': ('Cash App', 'Pay here'), 'paypal': ('PayPal', 'Pay here'), 'zelle': ('Zelle', 'Pay here'),
         'whatsapp': ('WhatsApp', 'Chat with us'), 'youtube': ('YouTube', 'Watch on YouTube'),
         'linkedin': ('LinkedIn', 'Connect on LinkedIn'), 'menu': ('Menu', 'Scan or tap to view')}
COLOURS = {'yelp': '#D32323', 'facebook': '#0866FF', 'tiktok': '#151515', 'website': '#2563EB',
           'wifi': '#2563EB', 'venmo': '#008CFF', 'cashapp': '#00C244', 'paypal': '#008CFF',
           'zelle': '#6C1CD3', 'whatsapp': '#25D366', 'youtube': '#FF0000', 'linkedin': '#0A66C2'}
STYLES = {'classic': 'Inria Serif Bold', 'italic': 'Inria Serif Bold Italic',
          'modern': 'Metropolis Medium, MENU spaced', 'spaced': 'Inter SemiBold, MENU spaced',
          'bold': 'Metropolis Bold', 'rounded': 'Nunito Black (rounded)'}


def dimensions(product, size):
    if product not in ('plate', 'stand') or size not in ('large', 'small'):
        raise ValueError('product and size must be plate/stand and large/small')
    return ((103., 103.) if size == 'large' else (78., 78.)) if product == 'plate' else (
        (103., 137.) if size == 'large' else (60., 85.))


def fit(g, cx, top, width, height):
    x0, y0, x1, y1 = g.bounds
    k = min(width / (x1 - x0), height / (y1 - y0))
    return affinity.affine_transform(g, [k, 0, 0, k, cx - (x0 + x1) / 2 * k, top - y0 * k])


@lru_cache(maxsize=32)
def logo(face):
    import face_art as fa
    if face in ('cashapp', 'paypal', 'zelle'):
        from build_pay_plate import logo_geoms
        return unary_union([g for g in logo_geoms(face, 'white') if g is not None])
    if face == 'venmo':
        return svg_geometry((ROOT / 'library/svg/Venmo Logo.svg').read_text(encoding='utf-8'))
    marks = json.loads((ROOT / 'library/svg/service-marks.json').read_text(encoding='utf-8'))
    paths = ''.join(f'<path d="{d}"/>' for d in marks[face]['paths'])
    return svg_geometry(f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">{paths}</svg>')


def svg_geometry(svg):
    """MuPDF resolves SVG arcs and transforms; retain its vector curves, including counters/holes."""
    import fitz
    import numpy as np
    import face_art as fa
    with fitz.open(stream=svg.encode('utf-8'), filetype='svg') as source:
        pdf = source.convert_to_pdf()
    shapes = []
    with fitz.open(stream=pdf, filetype='pdf') as doc:
        for drawing in doc[0].get_drawings():
            if drawing.get('fill') is None:
                continue
            rings, ring = [], []
            for item in drawing['items']:
                if item[0] == 're':
                    r = item[1]
                    rings.append([(r.x0, r.y0), (r.x1, r.y0), (r.x1, r.y1), (r.x0, r.y1)])
                    continue
                if item[0] not in ('l', 'c'):
                    raise ValueError(f'unsupported normalized SVG primitive: {item[0]}')
                start = tuple(item[1])
                if ring and start != ring[-1]:
                    rings.append(ring)
                    ring = []
                if not ring:
                    ring.append(start)
                if item[0] == 'l':
                    ring.append(tuple(item[2]))
                else:
                    ring.extend(fa.flatten_cubic(*[np.array(tuple(p)) for p in item[1:]], 24))
            if ring:
                rings.append(ring)
            shapes.append(fa.even_odd(rings))
    return unary_union(shapes)


@lru_cache(maxsize=256)
def layout(face, product, size, code, theme='white', style='classic'):
    import face_art as fa
    import face_art_large as large
    large.configure()  # Earlier builders change the shared font/layout module; reconfigure every call.
    width, height = dimensions(product, size)
    margin = 5. if width == 60 else 6. if width == 78 else 8.
    hidden = (9.5 if size == 'small' else 15.) if product == 'stand' else 0.
    qr_size = (22. if product == 'stand' else 20.) if size == 'small' else (33.25 if product == 'stand' else 31.)
    border = qr_size / 25 * (1 if size == 'small' else 2)
    qr_y = height - hidden - margin - qr_size - border
    cx = width / 2
    tap_h = 4.8 if width == 60 else 6. if width == 78 else 7.2
    cap = 3.6 if width == 60 else 4.3 if width == 78 else 4.8
    tap, _ = fa.tap_row_geom(cx, dict(icon_h=tap_h, cap=cap, gap=2., label='Tap here', y=margin))
    title_top = margin + tap_h + (4 if size == 'small' else 6)
    title_bottom = qr_y - border - (8 if size == 'small' else 10)
    if face == 'menu':
        from face_composition_tile import MENU_FONTS_STUDY, _font
        from matplotlib.textpath import TextPath
        fontfile, upper, tracking = MENU_FONTS_STUDY[STYLES[style]]
        prop = _font(fontfile)
        ref = TextPath((0, 0), 'H', size=100, prop=prop).get_extents().height
        rings, pen = [], 0.
        for text in ('MENU' if upper else ['Menu']):
            path = TextPath((0, 0), text, size=100, prop=prop)
            rings.extend([[(x + pen - path.get_extents().x0, -y) for x, y in ring] for ring in path.to_polygons()])
            pen += path.get_extents().width + tracking * ref
        title = fit(fa.even_odd(rings), cx, title_top, width - 2 * margin, title_bottom - title_top)
        accent = None
    else:
        accent = fit(logo(face), cx, title_top, width - 2 * margin - 4, title_bottom - title_top)
        title = None
    headline, line_width = fa.text_geom(NAMES[face][1], cap, cx, qr_y - border - 3.)
    if line_width > width - 2 * margin:
        headline = affinity.scale(headline, xfact=(width - 2 * margin) / line_width, yfact=(width - 2 * margin) / line_width,
                                  origin=(cx, qr_y - border - 3.))
    q = dict(x=cx - qr_size / 2, y=qr_y, size=qr_size, modules=25)
    dark, _, info = fa.qr_geom(q, fa.QR_BASE + code)
    panel = box(cx - qr_size / 2 - border, qr_y - border, cx + qr_size / 2 + border, qr_y + qr_size + border)
    # A coloured dark body shows through the light panel as the QR modules.
    qr_ink = dark if theme == 'white' else panel.difference(dark)
    ink = unary_union([g for g in (tap, title, headline, qr_ink) if g is not None]).simplify(.002, preserve_topology=True)
    if accent is not None:
        accent = accent.buffer(-.01).buffer(.01).simplify(.002, preserve_topology=True)
        ink = ink.difference(accent)
    return dict(ink=ink, accent=accent, dark=dark, panel=panel, qr=info, q=q, width=width, height=height)


def pocket(mount, theme, height):
    if mount == nfc.ROUND_TAG:
        return Point(0, height - nfc.FROM_TOP).buffer(nfc.TAG_D / 2, quad_segs=64), nfc.TAG_PRINT_Z0, nfc.TAG_PRINT_Z1
    z0 = nfc.Z0_BY_THEME[theme]
    if mount == nfc.ROUND_STICKER:
        shape = Point(0, height - nfc.FROM_TOP).buffer(nfc.POCKET_D / 2, quad_segs=64)
    elif mount == nfc.RECT_STICKER:
        shape = box(-10.5, height - 16., 10.5, height - 5.).buffer(1., quad_segs=24)
    else:
        raise ValueError(f'unsupported NFC: {mount}')
    return shape, z0, z0 + nfc.POCKET_DEPTH


def build(tag, params, out, product):
    import face_art as fa
    import card_per_code_large_instagram as geom
    import tile_per_code as tile
    import face_art_large as large
    import card_per_code_small as small
    face, size, theme = params['face'], params.get('size', 'large'), params.get('theme', 'white')
    mount = params.get('nfc_mount', nfc.DEFAULT_MOUNT)
    if face not in NAMES or theme not in ('white', 'black'):
        raise ValueError('unsupported service or base theme')
    code = fa.normalize_code(tag['public_code'])
    art = layout(face, product, size, code, theme, params.get('style', 'classic'))
    width, height = art['width'], art['height']
    # One composition frame for every layout; Small Stand's Fusion card is offset by -45 mm.
    xoff = -45. if product == 'stand' and size == 'small' else 0.
    to_body = lambda g: affinity.affine_transform(g, [1, 0, 0, -1, -width / 2, height])
    prism = small.prism if xoff else geom.prism
    top = small.TOP if xoff else geom.TOP
    p, pz0, pz1 = pocket(mount, theme, height)
    if product == 'plate':
        tile.configure_size(size)
        plain = tile.body()
        top = tile.TOP
    elif size == 'small':
        small.small.configure()
        back, old = small.backs(code)
        # Fill the historical cavity and cut this mount, including the new round-tag depth.
        plain, _ = small.plain_card(old, back, {'pocket': p, 'print_z': [pz0, pz1]})
        plain = plain + prism(p, top - pz1, top - pz0)
    else:
        large.configure()
        back_comp, _ = fa.serial_geom(code)
        old_comp, _ = fa.serial_geom(fa.SAMPLE_CODE)
        plain, _, _, sticker = geom.plain_card(fa.to_card_back(old_comp), fa.to_card_back(back_comp), nfc.ROUND_STICKER, theme)
        plain = plain + prism(sticker['pocket'], top - sticker['print_z'][1], top - sticker['print_z'][0])
    plain_volume = geom.to_trimesh(plain).volume
    ink = to_body(art['ink'])
    accent = to_body(art['accent']) if art['accent'] is not None else None
    cut = unary_union([g for g in (ink, accent) if g is not None])
    back_text, _ = fa.text_geom(code, 3.2 if size == 'small' else 4., width / 2, height / 2)
    back = affinity.affine_transform(back_text, [-1, 0, 0, -1, width / 2, height]).buffer(-.01).buffer(.01)
    body = plain - prism(p, top - pz1, top - pz0) - prism(cut, top - .52, top + .2) - prism(back, -.2, .32)
    meshes = [geom.to_trimesh(body), geom.to_trimesh(prism(ink, top - .52, top))]
    if accent is not None:
        meshes.append(geom.to_trimesh(prism(accent, top - .52, top)))
    q, url = art['q'], art['qr']['url']
    section = geom.mesh_section_polygons(meshes[1], top - .26)
    section = affinity.translate(section, xoff=-xoff)
    dark = section if theme == 'white' else to_body(art['panel']).difference(section)
    qr_box = to_body(box(q['x'] - .05, q['y'] - .05, q['x'] + q['size'] + .05, q['y'] + q['size'] + .05))
    decoded = geom.decode_qr_polygons(dark.intersection(qr_box), q, url, height)
    expected = plain_volume - p.area * (pz1 - pz0) - cut.area * .52 - back.area * .32
    bad = sum(geom.welded_bad_edges(m) for m in meshes)
    ok = all(m.is_watertight for m in meshes) and bad == 0 and abs(meshes[0].volume - expected) / expected < .005 and decoded == url
    report = dict(ok=bool(ok), code=code, face=face, style=params.get('style', 'classic'), qr_url=url,
                  qr_decoded_mesh=decoded, bad_edges=bad, nfc_mount=mount, pocket_print_z=[pz0, pz1],
                  pause_top_z=nfc.pause_z(mount, theme), card_mm=[width, height, top],
                  volume_mm3=float(meshes[0].volume), expected_mm3=float(expected))
    if not ok:
        raise RuntimeError(f'service face failed geometry/QR checks: {report}')
    out = Path(out)
    out.mkdir(parents=True, exist_ok=True)
    parts = []
    for i, mesh in enumerate(meshes, 1):
        filename = f'Service_{i}.stl'
        mesh.export(out / filename)
        parts.append((('Body', 'Art', 'Logo')[i - 1], filename, i))
    return report, parts
