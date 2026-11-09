"""Face system v3: one composition for every service on every form (builders `plate.face` and `stand.face`).

The grammar of the faces the user approved after printing (the Large Venmo Plate, Google, Instagram):

    Tap here row  ·  brand lockup (mark + name)  ·  call to action  ·  QR

all on one centre line, the brand and its call to action as one group with the same space above and below it, the QR
the same size and place on every face of a form. The Large Plate is the Venmo Plate's measurements exactly (brand box
70 x 16, call cap 8.2, QR 31 at y 64); the other forms scale it by `u` and keep their own margin and QR.

The brand is always a lockup, never a bare icon: a mark alone does not say which service it is (user, 2026-11-09).
Colours: the body, the art (the body's opposite) and up to two brand colours (AMS slots 3 and 4). A black piece's QR is
inverted, white modules straight on the body, never a white panel (user, 2026-11-01).

Geometry stays in millimetres, composition coordinates x right, y down from the top edge. `service.py` is untouched:
its versions rebuild the printed batches.
"""
from __future__ import annotations

import json
import re
import xml.etree.ElementTree as ET
from functools import lru_cache
from pathlib import Path

import numpy as np
from shapely import affinity
from shapely.geometry import Polygon, box
from shapely.ops import unary_union

from builders import nfc_mounts as nfc

ROOT = Path(__file__).resolve().parent.parent
SVG = ROOT / 'library' / 'svg'

# u: scale of the Large Plate's measurements; m: margin; qr: QR side (25 modules); hidden: card inside the Stand base.
FORMS = {
    ('plate', 'large'): dict(u=1.0, m=8., qr=31., hidden=0.),
    ('plate', 'small'): dict(u=78 / 103, m=6., qr=24., hidden=0.),
    ('stand', 'small'): dict(u=.64, m=5., qr=24., hidden=9.5),
    ('stand', 'large'): dict(u=1.1, m=8., qr=36., hidden=15.),
}

# Each face: the call to action, the name its lockup writes beside the mark (none: the lockup is a logo file or a word),
# the brand colours in slot order (3, 4), and `knock`: the shapes inside a badge that are white in the real logo (the
# "f", the play triangle, "in"), the body on a white piece and the white art on a black one.
BRANDS = {
    'paypal': dict(call='Pay here', colours=['#002991', '#60CDFF']),
    'venmo': dict(call='Pay here', colours=['#008CFF']),
    'cashapp': dict(call='Pay here', colours=['#00E013']),
    'zelle': dict(call='Pay here', colours=['#6C1CD3'], black_colours=[]),   # on black its letters are the white art
    'tiktok': dict(call='Follow us', name='TikTok', colours=['#25F4EE', '#FE2C55']),
    'yelp': dict(call='Review us', name='Yelp', colours=['#D32323']),
    'facebook': dict(call='Follow us', name='Facebook', colours=['#0866FF'], knock=True),
    'whatsapp': dict(call='Chat with us', name='WhatsApp', colours=['#25D366']),
    'youtube': dict(call='Subscribe', name='YouTube', colours=['#FF0000'], knock=True),
    'linkedin': dict(call='Follow us', name='LinkedIn', colours=['#0A66C2'], knock=True),
    'wifi': dict(call='Connect here', name='Wi-Fi', colours=['#2563EB']),
    'website': dict(call='Visit us', name='Website', colours=['#2563EB']),
    'menu': dict(call='Scan to view', colours=[]),
}
MENU_STYLES = ('classic', 'italic', 'modern', 'spaced', 'bold', 'rounded')


def colours(face, theme):
    """The brand filaments of a face on this body colour, in slot order from 3."""
    brand = BRANDS[face]
    return list(brand.get(f'{theme}_colours', brand['colours']))


def dimensions(product, size):
    from builders.service import dimensions as dims
    return dims(product, size)


def _place(geoms, cx, top, max_w, max_h):
    """Every layer of a lockup moved and scaled together, fitted by their union into max_w x max_h."""
    x0, y0, x1, y1 = unary_union([g for g in geoms.values() if g is not None]).bounds
    k = min(max_w / (x1 - x0), max_h / (y1 - y0))
    m = [k, 0, 0, k, cx - (x0 + x1) / 2 * k, top - y0 * k]
    return {name: None if g is None else affinity.affine_transform(g, m) for name, g in geoms.items()}


def _svg_layers(path, colour_of):
    """An SVG's filled paths, painted in file order (a later path covers the earlier ones), grouped by colour_of(fill)."""
    import build_pay_plate as pay
    import face_art as fa
    text = path.read_text(encoding='utf-8')
    painted = []

    def walk(node, matrix, inherited):
        tag = node.tag.rsplit('}', 1)[-1]
        if tag in ('defs', 'metadata', 'style', 'namedview', 'rect'):
            return
        matrix = matrix @ pay._matrix(node.get('transform'))
        fill = pay._fill(node, {}, inherited)
        if tag == 'path':
            a, b, c, d, e, f = matrix[0, 0], matrix[0, 1], matrix[1, 0], matrix[1, 1], matrix[0, 2], matrix[1, 2]
            shape = affinity.affine_transform(fa.even_odd(fa.svg_path_rings(node.get('d'))), [a, b, c, d, e, f])
            painted.append((colour_of(fill), shape))
        for child in node:
            walk(child, matrix, fill)

    walk(ET.fromstring(text.encode('utf-8')), np.eye(3), None)
    layers = {}
    for i, (name, shape) in enumerate(painted):
        above = unary_union([s for _, s in painted[i + 1:]]) if i + 1 < len(painted) else None
        visible = shape.difference(above) if above is not None else shape
        layers[name] = visible if name not in layers else layers[name].union(visible)
    return layers


def _mark(face):
    """A service mark from service-marks.json (512 x 512 units, y down) as one polygon."""
    from builders.service import svg_geometry
    marks = json.loads((SVG / 'service-marks.json').read_text(encoding='utf-8'))
    paths = ''.join(f'<path d="{d}"/>' for d in marks[face]['paths'])
    return svg_geometry(f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">{paths}</svg>')


def _mark_and_name(mark, name, name_cap=.62, gap=.24):
    """A lockup drawn here: the mark, then the name in the house font, the name's cap `name_cap` of the mark's height."""
    import face_art as fa
    x0, y0, x1, y1 = mark.bounds
    h = y1 - y0
    mark = affinity.translate(mark, -x0, -y0)
    cap = name_cap * h
    word, _ = fa.text_geom(name, cap, (x1 - x0) + gap * h, h / 2 + cap / 2, 'start')
    return unary_union([mark, word])


def _main_parts(g, keep=.05):
    """Drop the specks of a mark (a registered-trademark sign): parts under `keep` of the largest one's area."""
    parts = list(getattr(g, 'geoms', [g]))
    big = max(p.area for p in parts)
    return unary_union([p for p in parts if p.area >= keep * big])


def _menu_word(style):
    """The word Menu in one of the six approved fonts (user, 2026-11-02), as the Menu Stand and Plate draw it."""
    import face_art as fa
    from builders.service import STYLES
    from face_composition_tile import MENU_FONTS, _font
    from matplotlib.textpath import TextPath
    fontfile, upper, tracking = MENU_FONTS[STYLES[style]]
    prop = _font(fontfile)
    ref = TextPath((0, 0), 'H', size=100, prop=prop).get_extents().height
    rings, pen = [], 0.
    for text in ('MENU' if upper else ['Menu']):
        path = TextPath((0, 0), text, size=100, prop=prop)
        rings.extend([[(x + pen - path.get_extents().x0, -y) for x, y in ring] for ring in path.to_polygons()])
        pen += path.get_extents().width + tracking * ref
    return fa.even_odd(rings)


@lru_cache(maxsize=64)
def lockup(face, theme='white', style='classic'):
    """{'ink': art-colour polygons, 'c1', 'c2': brand colours, 'knock': white-in-the-logo shapes, 'note': TikTok's
    note for its echoes} in the lockup's own units (y down)."""
    import build_pay_plate as pay
    out = dict(ink=None, c1=None, c2=None, knock=None)
    if face == 'paypal':
        # The 2024 identity: the wordmark in the art colour, the monogram in two blues; the back P navy, the front P
        # (and the overlap the file paints a third blue) light blue, so it reads as one P laid over the other.
        tone = {'#002991': 'c1', '#60cdff': 'c2', '#008cff': 'c2'}
        layers = _svg_layers(SVG / 'PayPal Logo 2024.svg', lambda fill: tone.get((fill or '').lower(), 'ink'))
        out.update({k: layers.get(k) for k in ('ink', 'c1', 'c2')})
    elif face == 'venmo':
        import build_venmo_plate_batch as venmo
        out['c1'] = venmo.venmo_geom(0, 0, 1000, 1000)
    elif face == 'cashapp':
        # the official primary lockup: the green badge with its "$" white, "Cash App" in the art colour
        badge, word = pay.logo_geoms('cashapp', 'white')
        dollar = unary_union([Polygon(r) for p in getattr(badge, 'geoms', [badge]) for r in p.interiors])
        out.update(c1=badge, ink=word, knock=dollar)
    elif face == 'zelle':
        letters, word = pay.logo_geoms('zelle', theme)
        logo = _main_parts(unary_union([g for g in (letters, word) if g is not None]), keep=.02)  # no ® speck
        out['c1' if colours(face, theme) else 'ink'] = logo
    elif face == 'menu':
        out['ink'] = _menu_word(style)
    else:
        brand = BRANDS[face]
        mark = _main_parts(_mark(face))
        x0, y0 = mark.bounds[:2]
        mark = affinity.translate(mark, -x0, -y0)
        whole = _mark_and_name(mark, brand['name'])
        if face == 'tiktok':
            # the note is kept apart: its cyan and red echoes are cut once the lockup has its size in mm (layout)
            out.update(ink=whole, note=mark)
        else:
            out.update(ink=whole.difference(mark.buffer(1e-6)), c1=mark)
            if brand.get('knock'):
                out['knock'] = mark.convex_hull.difference(mark)
    return out


ECHO, ECHO_MIN, ECHO_SLIVER = .05, .6, .15
OPTICAL = (70 * 14) ** .5


def _echoes(note):
    """TikTok's RGB split: a cyan copy of the note escaping up and left, a red one down and right, the note on top.
    The shift is 5 % of the note's height and never under 0.6 mm (one and a half nozzle lines), and anything left
    thinner than 0.3 mm is dropped, so every echo prints."""
    h = note.bounds[3] - note.bounds[1]
    d = max(ECHO * h, ECHO_MIN)
    seam = lambda g: g.buffer(.02, join_style='mitre')   # 20 um between colours: no two meshes share an edge or a point
    # an opening with round corners stays inside the shape and leaves no pinch point
    opened = lambda g: g.buffer(-ECHO_SLIVER).buffer(ECHO_SLIVER).simplify(.002, preserve_topology=True)
    red = opened(affinity.translate(note, d, d).difference(seam(note)))
    cyan = opened(affinity.translate(note, -d, -d).difference(seam(note)).difference(seam(red)))
    return {'c1': cyan, 'c2': red}


@lru_cache(maxsize=256)
def layout(face, product, size, code, theme='white', style='classic'):
    import face_art as fa
    import face_art_large as large
    large.configure()  # earlier builders change the shared font/layout module; reconfigure every call
    f = FORMS[(product, size)]
    u, m, qr_size = f['u'], f['m'], f['qr']
    width, height = dimensions(product, size)
    cx, bottom = width / 2, height - f['hidden']
    module = qr_size / 25
    border = 2 * module                                  # quiet zone kept clear around the QR (and the old panel's place)
    tap_h = 7.2 * u
    tap, _ = fa.tap_row_geom(cx, dict(icon_h=tap_h, cap=4.9 * u, gap=2.5 * u, label='Tap here', y=m))
    tap_bottom = m + tap_h
    qr_y = bottom - m - qr_size
    brand_w, brand_h, call_gap, call_cap = 70 * u, 16 * u, 5 * u, 8.2 * u
    lock = lockup(face, theme, style)
    # Optical size: every lockup gets the same visual size, the square root of its width x height (31.3 mm on the
    # Large Plate, a 70 x 14 lockup), inside 70 wide and 1.2 x 16 tall, so a narrow logo (Zelle, Yelp) grows taller
    # instead of reading smaller than a wide one (Venmo, Facebook).
    x0, y0, x1, y1 = unary_union([g for g in lock.values() if g is not None]).bounds
    k = min(brand_w / (x1 - x0), 1.2 * brand_h / (y1 - y0), OPTICAL * u / ((x1 - x0) * (y1 - y0)) ** .5)
    lock_w, lock_h = (x1 - x0) * k, (y1 - y0) * k
    group_h = lock_h + call_gap + call_cap
    space = (qr_y - border - tap_bottom - group_h) / 2
    if space < 2:
        raise ValueError(f'{product} {size}: no room for the brand group ({space:.2f} mm)')
    top = tap_bottom + space                              # the group is centred on what it draws
    placed = _place(lock, cx, top, lock_w, lock_h)
    lb = unary_union([g for g in placed.values() if g is not None]).bounds
    if face == 'tiktok':
        placed.update(_echoes(placed.pop('note')))
    knock = placed.pop('knock', None)
    if knock is not None:
        # the white of a badge: opened so no hair-thin rim of the hull survives, kept a seam away from the badge
        knock = knock.buffer(-ECHO_SLIVER).buffer(ECHO_SLIVER).difference(placed['c1'].buffer(.02, join_style='mitre'))
        knock = None if knock.is_empty else knock.buffer(-.01).buffer(.01)
    call, call_w = fa.text_geom(BRANDS[face]['call'], call_cap, cx, top + lock_h + call_gap + call_cap)
    if call_w > width - 2 * m:
        raise ValueError(f'call to action {call_w:.1f} mm wider than {width - 2 * m:.1f}')
    q = dict(x=cx - qr_size / 2, y=qr_y, size=qr_size, modules=25)
    dark, _, info = fa.qr_geom(q, fa.QR_BASE + code)
    # white body: dark modules in the black art; black body: the same modules in the white art (inverted), no panel
    clean = lambda g: None if g is None else g.buffer(-.01, join_style='mitre').buffer(.01, join_style='mitre').simplify(.002, preserve_topology=True)
    colours = [clean(placed['c1']), clean(placed['c2'])]
    if colours[0] is not None and colours[1] is not None:   # the front colour wins where the hair-opening regrew both
        # a 20 um seam keeps the two colour bodies from touching along an edge (a non-manifold mesh); no slicer sees it
        colours[0] = clean(colours[0].difference(colours[1].buffer(.02, join_style='mitre')))
    taken = unary_union([c for c in colours if c is not None]) if any(c is not None for c in colours) else None
    white_knock = knock if theme == 'black' else None     # on a white piece the knock-out is the body itself
    ink = unary_union([g for g in (tap, call, dark, placed['ink'], white_knock) if g is not None]).simplify(.002, preserve_topology=True)
    if taken is not None:
        ink = ink.difference(taken)
    return dict(ink=ink, colours=colours, dark=dark, qr=info, q=q, width=width, height=height,
                space=space, brand=[round(lb[2] - lb[0], 2), round(lb[3] - lb[1], 2)])


def build(tag, params, out, product):
    import face_art as fa
    import card_per_code_large_instagram as geom
    import tile_per_code as tile
    import face_art_large as large
    import card_per_code_small as small
    from builders.service import pocket
    face, size, theme = params['face'], params.get('size', 'large'), params.get('theme', 'white')
    mount = params.get('nfc_mount', nfc.DEFAULT_MOUNT)
    if face not in BRANDS or theme not in ('white', 'black'):
        raise ValueError('unsupported face or theme')
    code = fa.normalize_code(tag['public_code'])
    style = params.get('style', 'classic') if face == 'menu' else 'classic'
    if style not in MENU_STYLES:
        raise ValueError(f'menu style {style!r}: one of {", ".join(MENU_STYLES)}')
    art = layout(face, product, size, code, theme, style)
    width, height = art['width'], art['height']
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
    colours = [None if c is None else to_body(c) for c in art['colours']]
    cut = unary_union([g for g in (ink, *colours) if g is not None])
    back_text, _ = fa.text_geom(code, 3.2 if size == 'small' else 4., width / 2, height / 2)
    back = affinity.affine_transform(back_text, [-1, 0, 0, -1, width / 2, height]).buffer(-.01).buffer(.01)
    body = plain - prism(p, top - pz1, top - pz0) - prism(cut, top - .52, top + .2) - prism(back, -.2, .32)
    meshes = [geom.to_trimesh(body), geom.to_trimesh(prism(ink, top - .52, top))]
    meshes += [geom.to_trimesh(prism(c, top - .52, top)) for c in colours if c is not None]
    q, url = art['q'], art['qr']['url']
    section = affinity.translate(geom.mesh_section_polygons(meshes[1], top - .26), xoff=-xoff)
    qr_box = to_body(box(q['x'] - .05, q['y'] - .05, q['x'] + q['size'] + .05, q['y'] + q['size'] + .05))
    decoded = geom.decode_qr_polygons(section.intersection(qr_box), q, url, height)
    expected = plain_volume - p.area * (pz1 - pz0) - cut.area * .52 - back.area * .32
    bad = sum(geom.welded_bad_edges(mesh) for mesh in meshes)
    overlap = sum(a.intersection(b).area for i, a in enumerate([ink, *[c for c in colours if c is not None]])
                  for b in [c for c in colours if c is not None][i:] if a is not b)
    ok = (all(mesh.is_watertight for mesh in meshes) and bad == 0 and overlap < 1e-6
          and abs(meshes[0].volume - expected) / expected < .005 and decoded == url)
    report = dict(ok=bool(ok), code=code, face=face, theme=theme, style=style, layout='face-v3', qr_url=url, qr_decoded_mesh=decoded,
                  qr='inverted' if theme == 'black' else 'plain', bad_edges=bad, nfc_mount=mount, pocket_print_z=[pz0, pz1],
                  pause_top_z=nfc.pause_z(mount, theme), card_mm=[width, height, top], brand_mm=art['brand'],
                  group_space_mm=round(art['space'], 2), volume_mm3=float(meshes[0].volume), expected_mm3=float(expected))
    if not ok:
        raise RuntimeError(f'face v3 failed geometry/QR checks: {report}')
    out = Path(out)
    out.mkdir(parents=True, exist_ok=True)
    # the catalog's slot order on every piece: 1 the body, 2 the art, 3 and 4 the brand colours (recipe filament_colour)
    labels = [('Body', 1), ('Art', 2)] + [(f'Brand {i + 1}', 3 + i) for i, c in enumerate(colours) if c is not None]
    parts = []
    for i, (mesh, (label, slot)) in enumerate(zip(meshes, labels), 1):
        filename = f'Face_{i}.stl'
        mesh.export(out / filename)
        parts.append((label, filename, slot))
    return report, parts
