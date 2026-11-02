"""The next version of every model with the three NFC types, ready for print_model_version_create.

    python print-pipeline/catalog/nfc_versions.py <print_models_list.json> <out.json>

Takes the catalog as print_models_list returned it. For each ready serialized model: the same builder, recipe and beds,
the round sticker as the default, and one variant per type (its pause and the parts one piece takes). The drawn backlog
models take the recipe of the ready model they share a layout with. Nothing is sent: the versions go in over MCP, and
each still needs its 3D preview (upload_preview.py) before it counts as done.
"""
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
from builders import nfc_mounts as nfc  # noqa: E402

MATERIALS = {
    nfc.ROUND_STICKER: {'kind': 'nfc_sticker', 'name': 'NFC sticker', 'spec': '25.4 mm (1 inch) round, NTAG215'},
    nfc.RECT_STICKER: {'kind': 'nfc_sticker', 'name': 'NFC sticker', 'spec': '10 x 20 mm, NTAG213', 'supplier': 'LeadSeals'},
    nfc.ROUND_TAG: {'kind': 'nfc_sticker', 'name': 'NFC tag', 'spec': '25 mm round, NTAG215, 0.8 mm or thinner'},
}
# One pause for both colours on the Pay layout, at the white depth (build_venmo_plate_batch.DEPTH_THEME).
WHITE_DEPTH_BUILDERS = ('plate.venmo', 'plate.pay')
CHANGELOG = ('Asks which NFC goes inside: the 1 inch round sticker (default, pocket 28.4 x 0.48), the 10 x 20 sticker or the '
             '25 mm round tag. Each is its own print file.')
BRAND_COLOUR = {'zelle': '#6C1CD3', 'cashapp': '#00E013', 'paypal': '#008CFF'}
# slug: (the ready model whose recipe and beds it takes, builder, params)
BACKLOG = {
    'plate-large-venmo-white': ('plate-large-venmo-mixed', 'plate.venmo', {'size': 'large', 'theme': 'white'}),
    'plate-large-venmo-black': ('plate-large-venmo-mixed', 'plate.venmo', {'size': 'large', 'theme': 'black', 'qr': 'inverted'}),
    'plate-large-menu-italic-white': ('plate-large-menu-white', 'plate.menu', {'size': 'large', 'theme': 'white', 'font': 'Inria Serif Bold Italic'}),
    'plate-large-menu-metropolis-white': ('plate-large-menu-white', 'plate.menu', {'size': 'large', 'theme': 'white', 'font': 'Metropolis Medium, MENU spaced'}),
    'plate-large-zelle-white': ('plate-large-venmo-mixed', 'plate.pay', {'brand': 'zelle', 'theme': 'white'}),
    'plate-large-cashapp-white': ('plate-large-venmo-mixed', 'plate.pay', {'brand': 'cashapp', 'theme': 'white'}),
    'plate-large-paypal-white': ('plate-large-venmo-mixed', 'plate.pay', {'brand': 'paypal', 'theme': 'white'}),
}


def variants(builder, face, theme, consumes):
    others = [c for c in consumes if not c['part'].startswith('nfc-')]
    behind_g = face == 'google_review' and builder != 'plate.pay'
    depth = 'white' if builder in WHITE_DEPTH_BUILDERS or theme not in nfc.Z0_BY_THEME else theme
    return {mount: {'pause': {'z': nfc.pause_z(mount, depth, behind_g), 'text': nfc.PAUSE_TEXT[mount]},
                    'consumes': [*others, {'part': nfc.PARTS[mount], 'perPiece': 1}],
                    'material': MATERIALS[mount]} for mount in nfc.NFC_MOUNTS}


def version(builder, params, recipe, beds, face, theme, consumes):
    all_variants = variants(builder, face, theme, consumes)
    default = all_variants[nfc.DEFAULT_MOUNT]
    recipe = {k: v for k, v in recipe.items() if k != '_pause'}
    recipe['pause_top_z'] = default['pause']['z']
    beds = [{**{k: v for k, v in bed.items() if not k.startswith('file')}, 'pause': default['pause']} for bed in beds]
    return {'builder': builder, 'params': {**params, 'nfc_mount': nfc.DEFAULT_MOUNT}, 'recipe': recipe, 'beds': beds,
            'consumes': default['consumes'], 'nfcVariants': all_variants, 'changelog': CHANGELOG}


def main(source, target):
    models = {m['slug']: m for m in json.loads(Path(source).read_text(encoding='utf-8'))}
    out = {}
    for slug, m in models.items():
        v = m.get('currentVersion') or {}
        if m['kind'] == 'serialized' and m['status'] == 'ready' and v.get('builder'):
            out[slug] = version(v['builder'], v['params'], v['recipe'], v['beds'], m['face'], m['theme'], v['consumes'])
    for slug, (like, builder, params) in BACKLOG.items():
        base = models[like]['currentVersion']
        recipe = json.loads(json.dumps(base['recipe']))
        colour = BRAND_COLOUR.get(params.get('brand'))
        if colour:
            for key in ('filament_colour', 'filament_multi_colour'):
                recipe['settings'][key][2] = colour
        beds = json.loads(json.dumps(base['beds']))
        for bed in beds:
            # The slicer's numbers belong to the bed they were measured on: the first real plate records them.
            for key in ('minutes', 'swaps', 'grams'):
                bed.pop(key, None)
            if colour:
                bed['ams'] = [dict(a, colour=f'{params["brand"].title()} PLA ({colour})') if a['slot'] == 3 else a for a in bed.get('ams', [])]
        entry = version(builder, params, recipe, beds, models[slug]['face'], params['theme'], base['consumes'])
        entry['changelog'] = None
        out[slug] = entry
    Path(target).write_text(json.dumps(out, indent=1, ensure_ascii=False) + '\n', encoding='utf-8')
    print(f'{len(out)} versions written to {target}')


if __name__ == '__main__':
    main(sys.argv[1], sys.argv[2])
