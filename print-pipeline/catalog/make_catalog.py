"""Write print-pipeline/catalog/catalog.json from the 3D repo's batch recipes (docs/PRINT_EXECUTION_PLAN.md s10).

Each serialized model's v1 is the bed recipe that built its latest batch, without the per-piece parts and copies;
its bed lists the copy slots, positions, AMS, pause and the slice numbers recorded for that batch.
"""
import json
import os
import sys

NFC = sys.argv[1]          # .../3D Printing/NFC Signs
OUT = sys.argv[2]          # print-pipeline/catalog/catalog.json

GRID4 = ['front-left', 'front-right', 'back-left', 'back-right']
GRID8 = ['front-left', 'front-center', 'front-right', 'middle-left', 'middle-right', 'back-left', 'back-center', 'back-right']
PINWHEEL = ['lower-left', 'lower-right', 'upper-right', 'upper-left']
DROP = {'parts', 'copies', 'name', '_batch', '_about'}


def recipe_of(rel):
    cfg = json.load(open(os.path.join(NFC, rel), encoding='utf-8'))
    slots = []
    batch = os.path.basename(os.path.dirname(rel))
    # Only the coded pieces: a legacy plate also carried G tokens as extra copies.
    for c in [c for c in cfg['copies'] if c['name'].startswith(batch)]:
        s = {'offset': [float(c['offset'][0]), float(c['offset'][1])]}
        if c.get('rotation_z_deg'):
            s['rotation'] = float(c['rotation_z_deg'])
        slots.append(s)
    recipe = {k: v for k, v in cfg.items() if k not in DROP}
    return recipe, slots, cfg.get('_about', '')


def ams(colours):
    return [{'slot': i + 1, 'colour': c} for i, c in enumerate(colours)]


def serialized(slug, title, product, face, theme, prefix, sales, builder, params, rel, positions, numbers, ams_slots,
               pause_text, batches, description='', sort=0, extra_beds=None):
    recipe, slots, about = recipe_of(rel)
    pause_z = recipe.get('pause_top_z')
    bed = {'label': 'x%d' % len(slots), 'copies': len(slots), 'positions': positions, 'slots': slots,
           **numbers, 'ams': ams(ams_slots)}
    if pause_z is not None:
        bed['pause'] = {'z': pause_z, 'text': pause_text}
    return {
        'slug': slug, 'kind': 'serialized', 'title': title, 'productType': product, 'face': face, 'theme': theme,
        'batchPrefix': prefix, 'salesProduct': sales, 'sortOrder': sort,
        'description': description or about,
        'version': {'builder': builder, 'params': params, 'recipe': recipe, 'beds': [bed] + (extra_beds or []),
                    'changelog': 'v1: the recipe of %s (%s)' % (batches[-1], rel.replace('\\', '/'))},
        'batches': batches,
    }


STICKER = 'Press one blank 10 x 20 NTAG213 sticker flat, adhesive down, long side left-right, into each pocket; resume.'
ROUND = 'Insert one programmed round NFC tag (NTAG215, 25 mm, 0.8 mm or thinner) into each cavity, by the serial map; resume.'

models = [
    serialized('stand-large-google-white', 'Stand Large · Google Review · White', 'large_stand', 'google_review', 'white', 'REV',
               'stand-large', 'stand.google', {'size': 'large', 'theme': 'white'},
               'Stand/production/REV-2026-003/build-large-pla-001-002-003-004.json', PINWHEEL,
               {'minutes': 349.2, 'swaps': 7}, ['White PLA', 'Black PLA', 'Yellow PLA'], ROUND,
               ['REV-2026-002', 'REV-2026-003'], sort=10),
    serialized('stand-large-google-black', 'Stand Large · Google Review · Black', 'large_stand', 'google_review', 'black', 'REV',
               'stand-large', 'stand.google', {'size': 'large', 'theme': 'black'},
               'Stand/production/REV-2026-004/build-large-pla-001-002-003-004.json', PINWHEEL,
               {'minutes': 348.1, 'swaps': 7, 'grams': {'Black PLA': 131.54, 'White PLA': 2.89, 'Yellow PLA': 1.47}},
               ['Black PLA', 'White PLA', 'Yellow PLA'], ROUND, ['REV-2026-004'], sort=11),
    serialized('stand-large-instagram-white', 'Stand Large · Instagram · White', 'large_stand', 'instagram', 'white', 'IG',
               'stand-large', 'stand.instagram', {'size': 'large', 'theme': 'white'},
               'Stand/production/IG-2026-002/build-instagram-large-pla-001-002-003-004.json', PINWHEEL,
               {'minutes': 349.5, 'swaps': 6}, ['White PLA', 'Black PLA', 'Silk PLA Dual-Color pink-purple'], ROUND,
               ['IG-2026-001', 'IG-2026-002'], sort=12),
    serialized('stand-large-instagram-black', 'Stand Large · Instagram · Black', 'large_stand', 'instagram', 'black', 'IG',
               'stand-large', 'stand.instagram', {'size': 'large', 'theme': 'black'},
               'Stand/production/IG-2026-003/build-instagram-large-pla-001-002-003-004.json', PINWHEEL,
               {'minutes': 347.9, 'swaps': 6, 'grams': {'Black PLA': 130.91, 'White PLA': 3.44, 'Silk PLA': 2.51}},
               ['Black PLA', 'White PLA', 'Silk PLA Dual-Color pink-purple'], ROUND, ['IG-2026-003'], sort=13),
    serialized('stand-small-google-white', 'Stand Small · Google Review · White (legacy)', 'small_stand', 'google_review', 'white', 'REV',
               'stand-small', 'stand.google', {'size': 'small', 'theme': 'white'},
               'Stand/production/REV-2026-001/build-v2-pla-001-002-003-004.json', ['front-left', 'back-left', 'front-right', 'back-right'],
               {}, ['White PLA', 'Black PLA', 'Yellow PLA'], ROUND, ['REV-2026-001'], sort=90,
               description='The first Small Stand cards (2026-10-04), QR on skale.club/q/ (redirects to Xpot). Kept for its batch; retired.'),
    serialized('plate-large-instagram-white', 'Plate Large · Instagram · White', 'large_plate', 'instagram', 'white', 'LPLATE',
               'plate-large', 'plate.instagram', {'size': 'large', 'theme': 'white'},
               'Plate/production/LPLATE-2026-001/build-large-pla-001-002-003-004.json', GRID4,
               {'minutes': 275.2, 'swaps': 7}, ['White PLA', 'Black PLA', 'Silk PLA Dual-Color pink-purple'], ROUND,
               ['LPLATE-2026-001'], sort=20),
    serialized('plate-large-instagram-black', 'Plate Large · Instagram · Black', 'large_plate', 'instagram', 'black', 'LPLATE',
               'plate-large', 'plate.instagram', {'size': 'large', 'theme': 'black'},
               'Plate/production/LPLATE-2026-003/build-large-pla-001-002-003-004.json', GRID4,
               {'minutes': 276.2, 'swaps': 6}, ['Black PLA', 'White PLA', 'Silk PLA Dual-Color pink-purple'], ROUND,
               ['LPLATE-2026-003'], sort=21),
    serialized('plate-large-google-white', 'Plate Large · Google Review · White', 'large_plate', 'google_review', 'white', 'LPLATE',
               'plate-large', 'plate.google', {'size': 'large', 'theme': 'white'},
               'Plate/production/LPLATE-2026-002/build-large-pla-001-002-003-004.json', GRID4,
               {'minutes': 271.5, 'swaps': 6, 'grams': {'White PLA': 99.71, 'Black PLA': 2.27, 'Yellow PLA': 1.43}},
               ['White PLA', 'Black PLA', 'Yellow PLA'], ROUND, ['LPLATE-2026-002'], sort=22,
               description='Google Review face; the G is a separate flat four-colour token (g-token-flush-20) glued flush into its pocket.'),
    serialized('plate-large-menu-black', 'Plate Large · Menu · Black', 'large_plate', 'menu', 'black', 'LPLATE',
               'plate-large', 'plate.menu', {'size': 'large', 'theme': 'black', 'font': 'Inria Serif Bold'},
               'Plate/production/LPLATE-2026-004/build-menu-large-black-pla-sticker.json', GRID4,
               {'minutes': 274.4, 'swaps': 3, 'grams': {'Black PLA': 98.3, 'White PLA': 4.63}},
               ['Black PLA', 'White PLA'], STICKER, ['LPLATE-2026-004'], sort=23),
    serialized('plate-large-menu-white', 'Plate Large · Menu · White', 'large_plate', 'menu', 'white', 'LPLATE',
               'plate-large', 'plate.menu', {'size': 'large', 'theme': 'white', 'font': 'Inria Serif Bold'},
               'Plate/production/LPLATE-2026-005/build-menu-large-white-pla-sticker.json', GRID4,
               {'minutes': 273.5, 'swaps': 3, 'grams': {'White PLA': 100.04, 'Black PLA': 3.51}},
               ['White PLA', 'Black PLA'], STICKER, ['LPLATE-2026-005'], sort=24),
    serialized('plate-large-venmo-mixed', 'Plate Large · Pay here Venmo · 2 White + 2 Black', 'large_plate', 'venmo', 'mixed', 'LPLATE',
               'plate-large', 'plate.venmo', {'size': 'large', 'themes': ['white', 'white', 'black', 'black']},
               'Plate/production/LPLATE-2026-006/build-venmo-large-white-black-pla-sticker.json', GRID4,
               {'minutes': 311.4, 'swaps': 25, 'grams': {'White PLA': 56.9, 'Black PLA': 52.38, 'Blue PLA': 2.73}},
               ['White PLA', 'Black PLA', 'Blue PLA (Venmo #008CFF)'], STICKER, ['LPLATE-2026-006'], sort=25),
    serialized('plate-small-instagram-black', 'Plate Small · Instagram · Black', 'small_plate', 'instagram', 'black', 'SPLATE',
               'plate-small', 'plate.instagram', {'size': 'small', 'theme': 'black'},
               'Plate/production/SPLATE-2026-001/build-small-pla-001-002-003-004-005-006-007-008.json', GRID8,
               {'minutes': 332.4, 'swaps': 6, 'grams': {'Black PLA': 118.42, 'White PLA': 3.36, 'Silk PLA': 1.83}},
               ['Black PLA', 'White PLA', 'Silk PLA Dual-Color pink-purple'], ROUND, ['SPLATE-2026-001'], sort=30),
    serialized('plate-small-google-white', 'Plate Small · Google Review · White', 'small_plate', 'google_review', 'white', 'SPLATE',
               'plate-small', 'plate.google', {'size': 'small', 'theme': 'white'},
               'Plate/production/SPLATE-2026-002/build-small-pla-001-002-003-004-005-006-007-008.json', GRID8,
               {'minutes': 334.7, 'swaps': 6, 'grams': {'White PLA': 119.11, 'Black PLA': 2.45, 'Yellow PLA': 1.5}},
               ['White PLA', 'Black PLA', 'Yellow PLA'], ROUND, ['SPLATE-2026-002'], sort=31,
               description='Google Review face; the G is a separate flat 13 mm token (g-token-flush-13-small) glued flush into its pocket.'),
]


def swap_slots(recipe, first, second):
    """Swap two filament slots and both axes of the purge matrix (build_instagram_batch._swap_filament_slots)."""
    st = recipe['settings']
    for key in ('filament_colour', 'filament_multi_colour'):
        st[key][first], st[key][second] = st[key][second], st[key][first]
    matrix = st['flush_volumes_matrix']
    side = int(len(matrix) ** 0.5)
    order = list(range(side))
    order[first], order[second] = order[second], order[first]
    st['flush_volumes_matrix'] = [matrix[r * side + c] for r in order for c in order]


# Menu black: LPLATE-2026-004 printed an older, tighter sticker pocket (pause z 1.16). Today's generator makes the
# standard 23 x 13 x 0.48 pocket, 0.68 behind a black face (pause z 1.32): v1 is today's Menu recipe (LPLATE-2026-005)
# with the black slots, exactly what build_menu_plate_batch.py --theme black writes.
import copy as _copy
menu_black = next(m for m in models if m['slug'] == 'plate-large-menu-black')
menu_white = next(m for m in models if m['slug'] == 'plate-large-menu-white')
recipe = _copy.deepcopy(menu_white['version']['recipe'])
swap_slots(recipe, 0, 1)
recipe['pause_top_z'] = 1.32
recipe['_pause'] = ('Sticker pockets at print z 0.68-1.16; the pause runs before the 1.16-1.32 roof layer. Press one blank '
                    '10 x 20 NTAG213 sticker flat, adhesive down, long side left-right, into each pocket; resume.')
recipe['_first_layer_sequence'] = 'White Menu art first; black body last.'
bed = menu_black['version']['beds'][0]
bed.update(pause={'z': 1.32, 'text': STICKER})
for k in ('minutes', 'swaps', 'grams'):
    bed.pop(k, None)
bed['minutes'], bed['swaps'], bed['grams'] = 275.3, 3, {'Black PLA': 98.49, 'White PLA': 4.63}   # sliced 2026-10-22, tests/rebuild.py
menu_black['version']['recipe'] = recipe
menu_black['version']['changelog'] = ('v1: the Menu recipe of LPLATE-2026-005 in black (slots 1 and 2 swapped) with the standard '
                                      'sticker pocket 0.68 mm behind the black face, pause z 1.32. LPLATE-2026-004 printed an '
                                      'older, tighter pocket (pause z 1.16).')
menu_black['description'] = None

# Models in the catalog with no design yet: the brands and faces most likely to be asked for.
design_needed = [
    ('plate-large-venmo-white', 'Plate Large · Pay here Venmo · White', 'large_plate', 'venmo', 'white', 'LPLATE', 'plate-large', 26),
    ('plate-large-venmo-black', 'Plate Large · Pay here Venmo · Black', 'large_plate', 'venmo', 'black', 'LPLATE', 'plate-large', 27),
    ('plate-large-zelle-white', 'Plate Large · Pay here Zelle · White', 'large_plate', 'custom', 'white', 'LPLATE', 'plate-large', 40),
    ('plate-large-cashapp-white', 'Plate Large · Pay here Cash App · White', 'large_plate', 'custom', 'white', 'LPLATE', 'plate-large', 41),
    ('plate-large-paypal-white', 'Plate Large · Pay here PayPal · White', 'large_plate', 'custom', 'white', 'LPLATE', 'plate-large', 42),
    ('plate-large-whatsapp-white', 'Plate Large · WhatsApp · White', 'large_plate', 'whatsapp', 'white', 'LPLATE', 'plate-large', 43),
    ('plate-large-facebook-white', 'Plate Large · Facebook · White', 'large_plate', 'facebook', 'white', 'LPLATE', 'plate-large', 44),
    ('plate-large-tiktok-black', 'Plate Large · TikTok · Black', 'large_plate', 'tiktok', 'black', 'LPLATE', 'plate-large', 45),
    ('plate-large-wifi-white', 'Plate Large · Wi-Fi · White', 'large_plate', 'custom', 'white', 'LPLATE', 'plate-large', 46),
    ('plate-large-menu-italic-white', 'Plate Large · Menu (Inria Serif Bold Italic) · White', 'large_plate', 'menu', 'white', 'LPLATE', 'plate-large', 28),
    ('plate-large-menu-metropolis-white', 'Plate Large · Menu (Metropolis spaced caps) · White', 'large_plate', 'menu', 'white', 'LPLATE', 'plate-large', 29),
]
for slug, title, product, face, theme, prefix, sales, sort in design_needed:
    models.append({'slug': slug, 'kind': 'serialized', 'title': title, 'productType': product, 'face': face, 'theme': theme,
                   'batchPrefix': prefix, 'salesProduct': sales, 'sortOrder': sort, 'description': None, 'version': None, 'batches': []})

# Parts: the beds are the fixed files of PRINT NOW (uploaded with bench.py attach-bed).
parts = [
    {'slug': 'base-large', 'title': 'Stand base · Large', 'sortOrder': 60,
     'description': 'Weighted base for the Large Stand card, 111 x 69 x 14 mm; five washers per base at the pause.',
     'beds': [{'label': 'x4', 'copies': 4, 'minutes': 233.7, 'pause': {'z': 11.12, 'text': 'Five washers per base (20), filling the pocket; resume.'},
               'file': 'Stand/PRINT NOW/2 - BASES LARGE - PLA x4.3mf'},
              {'label': 'x6 full plate', 'copies': 6, 'minutes': 345.8, 'pause': {'z': 11.12, 'text': 'Five washers per base (30); resume.'},
               'file': 'Stand/PRINT NOW/6 - BASES LARGE - FULL PLATE - PLA x6.3mf'}]},
    {'slug': 'base-small', 'title': 'Stand base · Small', 'sortOrder': 61,
     'description': 'Weighted base for the Small Stand card, 68 x 48 x 12 mm; five washers per base at the pause.',
     'beds': [{'label': 'x4', 'copies': 4, 'minutes': 119.0, 'pause': {'z': 11.12, 'text': 'Five washers per base (20); resume.'},
               'file': 'Stand/PRINT NOW/4 - BASES SMALL - PLA x4.3mf'},
              {'label': 'x12 full plate', 'copies': 12, 'minutes': 340.5, 'pause': {'z': 11.12, 'text': 'Five washers per base (60); resume.'},
               'file': 'Stand/PRINT NOW/5 - BASES SMALL - FULL PLATE - PLA x12.3mf'}]},
    {'slug': 'g-token-large-relief', 'title': 'Google G token · Large Stand (rounded relief v2)', 'sortOrder': 62,
     'description': 'The 26 mm four-colour G that sits on the Large Google Stand card. Prints face-up, no pause.',
     'beds': [{'label': 'x4', 'copies': 4, 'minutes': 95.1, 'swaps': 39, 'file': 'Stand/PRINT NOW/3 - G TOKENS LARGE ROUNDED v2 - PLA x4.3mf'},
              {'label': 'x36 full plate', 'copies': 36, 'minutes': 205.6, 'swaps': 39, 'file': 'Stand/PRINT NOW/7 - G TOKENS LARGE ROUNDED v2 - FULL PLATE - PLA x36.3mf'},
              {'label': 'x75 max plate', 'copies': 75, 'minutes': 338.6, 'swaps': 39, 'file': 'Stand/PRINT NOW/8 - G TOKENS LARGE ROUNDED v2 - MAX PLATE - PLA x75.3mf'}]},
    {'slug': 'g-token-small-stand', 'title': 'Google G token · Small Stand (13.5 mm)', 'sortOrder': 63,
     'description': 'The 13.5 mm G for the Small Stand card. Prints face-up, no pause.',
     'beds': [{'label': 'x273 max plate', 'copies': 273, 'minutes': 174.3, 'swaps': 12, 'file': 'Stand/PRINT NOW/9 - G TOKENS SMALL 13.5MM - MAX PLATE - PLA x273.3mf'}]},
    {'slug': 'g-token-flush-20', 'title': 'Google G token · Large Plate (flush 20 mm)', 'sortOrder': 64,
     'description': 'Flat four-colour G, 20 x 1.16 mm, glued flush into the Large Google Plate.',
     'beds': [{'label': 'x8', 'copies': 8, 'file': 'Plate/PRINT NOW/2 - G TOKENS FLUSH 20mm - PLA x8.3mf'},
              {'label': 'x112 full plate', 'copies': 112, 'file': 'Plate/PRINT NOW/3 - G TOKENS FLUSH 20mm - FULL PLATE - PLA x112.3mf'}]},
    {'slug': 'g-token-flush-13-small', 'title': 'Google G token · Small Plate (flush 13 mm)', 'sortOrder': 65,
     'description': 'Flat four-colour G, 13 x 1.16 mm, glued flush into the Small Google Plate.',
     'beds': [{'label': 'x30', 'copies': 30, 'file': 'Plate/PRINT NOW/5 - G TOKENS FLUSH 13mm SMALL - PLA x30.3mf'},
              {'label': 'x240 full plate', 'copies': 240, 'file': 'Plate/PRINT NOW/4 - G TOKENS FLUSH 13mm SMALL - FULL PLATE - PLA x240.3mf'}]},
    {'slug': 'nfc-sticker-10x20', 'title': 'NFC sticker 10 x 20 NTAG213 (bought)', 'sortOrder': 70,
     'description': 'LeadSeals 10 x 20 x 0.15 mm NTAG213 (ASIN B0CMXHWTYH), the standard chip of every piece since 2026-10-21. Bought, not printed: only the count.',
     'beds': [{'label': 'bought', 'copies': 1}]},
    {'slug': 'nfc-tag-round-25', 'title': 'NFC tag round 25 mm NTAG215 (bought)', 'sortOrder': 71,
     'description': 'The round tag of the Stands and the first Plates. Bought, not printed: only the count.',
     'beds': [{'label': 'bought', 'copies': 1}]},
    {'slug': 'washer-ballast', 'title': 'Washer ballast for Stand bases (bought)', 'sortOrder': 72,
     'description': 'Five per base, dropped in at the base pause. Bought, not printed: only the count.',
     'beds': [{'label': 'bought', 'copies': 1}]},
]
for p in parts:
    p['kind'] = 'part'

os.makedirs(os.path.dirname(OUT), exist_ok=True)
with open(OUT, 'w', encoding='utf-8', newline='\n') as f:
    json.dump({'_about': 'The print catalog loaded into Xpot (docs/PRINT_EXECUTION_PLAN.md s10). Serialized v1 recipes are the bed '
                         'recipes of each model\'s latest batch in the 3D Printing repo; part beds name the fixed files of PRINT NOW.',
               'models': models, 'parts': parts}, f, indent=1, ensure_ascii=False)
    f.write('\n')
print(len(models), 'models,', len(parts), 'parts ->', OUT)
