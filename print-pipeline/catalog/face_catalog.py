"""The face v3 versions of the catalog, ready for print_model_version_create (one call per model).

    python print-pipeline/catalog/face_catalog.py <print_models_list.json> <out.json>

Takes the catalog as print_models_list returned it. Every serialized service face (all but Google and Instagram, whose
printed designs stay) gets the next version on `plate.face` / `stand.face` (builders/face.py): the same beds, bases and
G tokens, the round sticker as the default NFC with all three variants, and the recipe's filaments in the face's slot
order: 1 the body, 2 the art, 3 and 4 the brand colours. The black Google and Instagram Plates get their own builder
again with `qr: inverted` (no white panel on any black piece, user 2026-11-01). Nothing is sent from here, and each
version still needs its 3D preview (preview.py --upload) before it counts as done.
"""
import copy
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
from builders.face import BRANDS, MENU_STYLES, colours  # noqa: E402
from catalog.design_catalog import filament_settings  # noqa: E402
from catalog.nfc_versions import version as nfc_version  # noqa: E402

BODY = {'white': '#F2F2F2', 'black': '#161616'}
CHANGELOG = ('Face v3 (user, 2026-11-09): one composition on every form, from the approved Venmo Plate: Tap here, the '
             'brand lockup (mark and name, its real colours), the call to action and the QR, centred with equal space; '
             'the QR the same size and place on every face of a form; black pieces print the QR inverted, no white panel.')
INVERTED_CHANGELOG = 'Black piece: the QR inverted, white modules straight on the body, no white panel (user, 2026-11-01).'
# brand colours as the AMS names them on the bench
COLOUR_NAMES = {'#002991': 'PayPal navy', '#60CDFF': 'PayPal light blue', '#008CFF': 'Venmo blue', '#00E013': 'Cash App green',
                '#6C1CD3': 'Zelle purple', '#25F4EE': 'TikTok cyan', '#FE2C55': 'TikTok red', '#D32323': 'Yelp red',
                '#0866FF': 'Facebook blue', '#25D366': 'WhatsApp green', '#FF0000': 'YouTube red', '#0A66C2': 'LinkedIn blue',
                '#2563EB': 'Blue'}


def ams(slots):
    return [{'slot': i + 1, 'colour': ('ELEGOO PLA ' + c) if c in BODY.values() else f'{COLOUR_NAMES.get(c, "Generic")} PLA ({c})'}
            for i, c in enumerate(slots)]


def face_version(model):
    v = model['currentVersion']
    kind, size = model['productType'].split('_')[1], model['productType'].split('_')[0]
    face, theme = model['face'], model['theme']
    style = (v.get('params') or {}).get('style', 'classic') if face == 'menu' else None
    if style is not None and style not in MENU_STYLES:
        raise ValueError(f"{model['slug']}: menu style {style!r}")
    params = dict(face=face, size=size, theme=theme, **({'style': style} if style else {}))
    slots = [BODY[theme], BODY['black' if theme == 'white' else 'white'], *colours(face, theme)]
    recipe = copy.deepcopy(v['recipe'])
    filament_settings(recipe, slots)
    beds = copy.deepcopy(v['beds'])
    for bed in beds:
        for key in ('minutes', 'grams', 'swaps'):       # the slicer's numbers belong to the old art
            bed.pop(key, None)
        bed['ams'] = ams(slots)
    out = nfc_version(f'{kind}.face', params, recipe, beds, face, theme, v.get('consumes') or [])
    out['changelog'] = CHANGELOG
    return out


def inverted_version(model):
    v = model['currentVersion']
    params = {**(v.get('params') or {}), 'qr': 'inverted'}
    beds = copy.deepcopy(v['beds'])
    for bed in beds:
        for key in ('minutes', 'grams', 'swaps'):
            bed.pop(key, None)
    out = nfc_version(v['builder'], params, copy.deepcopy(v['recipe']), beds, model['face'], model['theme'], v.get('consumes') or [])
    out['changelog'] = INVERTED_CHANGELOG
    return out


def versions(models):
    out = {}
    for m in models:
        v = m.get('currentVersion') or {}
        if m['kind'] != 'serialized' or m['status'] != 'ready' or not v.get('builder'):
            continue
        if m['face'] in BRANDS and m['theme'] in BODY:
            out[m['slug']] = face_version(m)
        elif m['face'] in ('google_review', 'instagram') and m['theme'] == 'black' and m['productType'].endswith('plate') \
                and (v.get('params') or {}).get('qr') != 'inverted':
            out[m['slug']] = inverted_version(m)
    return out


def _svg_paths(geom, colour):
    import face_art as fa
    if geom is None or geom.is_empty:
        return ''
    out = []
    for poly in fa.polys(geom):
        d = ' '.join('M' + ' L'.join(f'{x:.3f} {y:.3f}' for x, y in list(r.coords)[:-1]) + ' Z' for r in [poly.exterior, *poly.interiors])
        out.append(f'<path d="{d}" fill="{colour}" fill-rule="evenodd"/>')
    return ''.join(out)


def _frame(product, w, h, body):
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="-5 -5 {w + 10} {h + 16}"><rect x="0" y="0" width="{w}" '
            f'height="{h}" rx="{6 if product == "stand" else 8}" fill="{body}" stroke="#888" stroke-width=".3"/>')


def _base(product, w, h):
    return (f'<rect x="-2" y="{h - 8}" width="{w + 4}" height="12" rx="2" fill="#161616"/><path d="M-2 {h - 8}H{w + 2}" '
            f'stroke="#444" stroke-width="1.5"/>') if product == 'stand' else ''


def previews(target):
    """The catalog's face pictures (client/public/production/previews/<productType>/<face>/<style>-<theme>.svg): what
    Tags > Production shows and what Stuscle turns into each variant's image (scripts/build-nfc-catalog-assets.mjs).
    Face v3 pieces are drawn from their real layout; the black Google and Instagram Plates from their meshes, QR inverted."""
    import tempfile
    import trimesh
    from shapely import affinity
    from builders import build_piece
    from builders.face import layout, dimensions
    import card_per_code_large_instagram as geom
    written = 0
    for product_type in ('small_plate', 'large_plate', 'small_stand', 'large_stand'):
        size, product = product_type.split('_')
        w, h = dimensions(product, size)
        for face in BRANDS:
            for theme in BODY:
                for style in (MENU_STYLES if face == 'menu' else ('classic',)):
                    art = layout(face, product, size, 'A7K3P9X2', theme, style)
                    ink = BODY['black' if theme == 'white' else 'white']
                    svg = _frame(product, w, h, BODY[theme]) + _svg_paths(art['ink'], ink)
                    svg += ''.join(_svg_paths(c, hexc) for c, hexc in zip(art['colours'], colours(face, theme)))
                    path = Path(target) / product_type / face / f'{style}-{theme}.svg'
                    path.parent.mkdir(parents=True, exist_ok=True)
                    path.write_text(svg + _base(product, w, h) + '</svg>', encoding='utf-8')
                    written += 1
        if product != 'plate':
            continue
        for face, builder, accent in (('google_review', 'plate.google', '#FBBC05'), ('instagram', 'plate.instagram', '#C85BD6')):
            tag = dict(public_code='A7K3P9X2', serial_number='001', qr_url='https://xpot.place/q/A7K3P9X2')
            with tempfile.TemporaryDirectory(prefix='xpot-face-preview-') as tmp:
                _, parts = build_piece(builder, tag, 0, dict(size=size, theme='black', qr='inverted'), tmp)
                svg = _frame(product, w, h, BODY['black'])
                for _, filename, slot in parts[1:]:
                    mesh = trimesh.load(Path(tmp) / filename)
                    section = geom.mesh_section_polygons(mesh, float(mesh.bounds[1][2]) - .26)
                    svg += _svg_paths(affinity.affine_transform(section, [1, 0, 0, -1, w / 2, h]), BODY['white'] if slot == 2 else accent)
            if face == 'google_review':
                import tile_per_code_google as google
                google.configure(size)
                svg += ''.join(_svg_paths(piece, hexc) for hexc, piece in google.layout('A7K3P9X2')['g_pieces'])
            path = Path(target) / product_type / face / 'classic-black.svg'
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text(svg + '</svg>', encoding='utf-8')
            written += 1
    return written


if __name__ == '__main__':
    if sys.argv[1] == '--previews':
        print(previews(sys.argv[2]), 'previews')
        sys.exit()
    models = json.loads(Path(sys.argv[1]).read_text(encoding='utf-8'))
    result = versions(models)
    Path(sys.argv[2]).write_text(json.dumps(result, indent=1), encoding='utf-8')
    by_builder = {}
    for v in result.values():
        by_builder[v['builder']] = by_builder.get(v['builder'], 0) + 1
    print(len(result), 'versions', by_builder)
