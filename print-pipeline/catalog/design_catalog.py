"""Reproducible flyer catalog and forward-only database migration.

No live I/O, no real serials. Recipes of existing orders remain immutable. Generated designs use
one bed per request, approved black/white bodies, all three NFC mounts, and explicit ELEGOO primary PLA.
"""
import copy
import json
from pathlib import Path
import sys
from functools import lru_cache

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
from builders.service import NAMES, COLOURS, STYLES, dimensions, layout  # noqa: E402
from catalog.nfc_versions import version as nfc_version  # noqa: E402
from builders import nfc_mounts as nfc  # noqa: E402

FACES = ['google_review', 'yelp', 'instagram', 'facebook', 'tiktok', 'website', 'menu', 'wifi',
         'venmo', 'cashapp', 'paypal', 'zelle', 'whatsapp', 'youtube', 'linkedin']
PALETTE = {'white': '#F2F2F2', 'black': '#161616'}
CONTRAST = {k: 'black' if k == 'white' else 'white' for k in PALETTE}
CHANGELOG = 'Flyer catalog v2: approved white/black bodies, complete services, one printer plate, three NFC mounts, ELEGOO primary PLA.'
FONTS = dict(STYLES)


def filament_settings(recipe, colours):
    """Use conservative standard PLA flow, not an unmeasured high-speed/PLA+ calibration.

    Slot order is fixed: body/art/accent. The template's flush matrix is unchanged: no slot permutation.
    Purge values are raised conservatively for dark → light transitions (including coloured bodies).
    """
    settings = recipe['settings']
    count = len(settings['filament_colour'])
    colours = [*colours, *settings['filament_colour'][len(colours):]]
    settings['filament_colour'] = colours
    settings['filament_multi_colour'] = colours[:]
    settings['filament_vendor'] = ['ELEGOO' if c.upper() in ('#161616', '#F2F2F2') else 'Generic' for c in colours]
    settings['filament_type'] = ['PLA'] * count
    settings['nozzle_temperature'] = ['210'] * count
    settings['nozzle_temperature_initial_layer'] = ['215'] * count
    settings['textured_plate_temp'] = ['55'] * count
    settings['textured_plate_temp_initial_layer'] = ['60'] * count
    settings['filament_max_volumetric_speed'] = ['12'] * count
    matrix = settings.get('flush_volumes_matrix', [])
    if len(matrix) == count * count:
        # Light filaments get the conservative purge already used for black → white in the source recipe.
        def brightness(value):
            value = value.lstrip('#')[:6]
            return sum(int(value[i:i + 2], 16) for i in (0, 2, 4)) / 3
        for a in range(count):
            for b in range(count):
                if a != b and brightness(colours[a]) < 100 and brightness(colours[b]) > 150:
                    matrix[a * count + b] = str(max(float(matrix[a * count + b]), 600))
    recipe['first_layer_sequence'] = [2, 3, 1]  # artwork first, body last
    return recipe


def entries():
    seed = json.loads((ROOT / 'catalog/catalog.json').read_text(encoding='utf-8'))
    models = {m['slug']: m for m in seed['models']}
    result = []
    for kind in ('stand', 'plate'):
        for size in ('large', 'small'):
            product = f'{size}_{kind}'
            base = models[f'{kind}-{size}-google-white']['version']
            for face in FACES:
                for theme, colour in PALETTE.items():
                    for style in (STYLES if face == 'menu' else ['classic']):
                        base_theme = 'black' if CONTRAST[theme] == 'white' else 'white'
                        builder = f'{kind}.google' if face == 'google_review' else f'{kind}.instagram' if face == 'instagram' else f'{kind}.service'
                        params = dict(size=size, theme=base_theme, face=face, style=style, qr='panel')
                        slug_face = 'google' if face == 'google_review' else face
                        slug = f'{kind}-{size}-{slug_face}-{theme}' + (f'-{style}' if style != 'classic' else '')
                        # Reuse the historical italic/modern slugs to avoid duplicate style cards.
                        if face == 'menu' and size == 'large' and kind == 'plate' and theme == 'white' and style in ('italic', 'modern'):
                            slug = f'plate-large-menu-{"italic" if style == "italic" else "metropolis"}-white'
                        consumes = []
                        if kind == 'stand':
                            consumes.append({'part': f'base-{size}', 'perPiece': 1})
                        if face == 'google_review':
                            token = f'g-token-{size}-relief' if kind == 'stand' and size == 'large' else 'g-token-small-stand' if kind == 'stand' else 'g-token-flush-20' if size == 'large' else 'g-token-flush-13-small'
                            consumes.append({'part': token, 'perPiece': 1})
                        recipe = copy.deepcopy(base['recipe'])
                        for key in list(recipe):
                            if key.startswith('_') or key in ('settings_files',):
                                recipe.pop(key, None)
                        recipe['settings_files'] = []
                        accent = '#FBBC05' if face == 'google_review' else '#C85BD6' if face == 'instagram' else '#F2F2F2' if face == 'tiktok' and base_theme == 'black' else COLOURS.get(face, '#F2F2F2')
                        ink_colour = '#161616' if base_theme == 'white' else '#F2F2F2'
                        filament_settings(recipe, [colour, ink_colour, accent])
                        beds = copy.deepcopy(base['beds'][:1])
                        for bed in beds:
                            for key in ('minutes', 'grams', 'swaps', 'fileRef', 'fileName'):
                                bed.pop(key, None)
                            bed['ams'] = [{'slot': i + 1, 'colour': f'{"ELEGOO" if c.upper() in ("#F2F2F2", "#161616") else "Generic"} PLA {c}'} for i, c in enumerate([colour, ink_colour, accent]) if i < 2 or face != 'menu']
                        version = nfc_version(builder, params, recipe, beds, face, base_theme, consumes)
                        version['changelog'] = CHANGELOG
                        name = 'Google Review' if face == 'google_review' else 'Instagram' if face == 'instagram' else NAMES[face][0]
                        title = f'{kind.title()} {size.title()} · {name} · {theme.title()}' + (f' · {STYLES[style]}' if face == 'menu' else '')
                        result.append(dict(slug=slug, kind='serialized', title=title, productType=product,
                                           face=face, theme=theme, batchPrefix=('REV' if face == 'google_review' and kind == 'stand' else 'IG' if face == 'instagram' and kind == 'stand' else 'LSTAND' if size == 'large' and kind == 'stand' else 'SSTAND' if kind == 'stand' else 'LPLATE' if size == 'large' else 'SPLATE'),
                                           salesProduct=f'{kind}-{size}', sortOrder=10 + FACES.index(face),
                                           materials=[{'kind': 'filament', 'name': f'{"ELEGOO" if c.upper() in ("#F2F2F2", "#161616") else "Generic"} PLA',
                                                       'spec': f'1.75 mm · {c}', 'supplier': 'ELEGOO' if c.upper() in ('#F2F2F2', '#161616') else 'Any PLA supplier'} for c in dict.fromkeys([colour, ink_colour, accent] if face != 'menu' else [colour, ink_colour])],
                                           version=version))
    return result


def migration(target):
    """Compact shared templates plus per-model descriptors; PostgreSQL creates immutable next versions."""
    templates, descriptors = {}, []
    for model in entries():
        m = copy.deepcopy(model)
        v = m.pop('version')
        # Settings vary per palette/brand, but recipe/bed structure is shared by physical product.
        product = m['productType']
        templates.setdefault(product, {'recipe': v['recipe'], 'beds': v['beds']})
        m['version'] = {k: val for k, val in v.items() if k not in ('recipe', 'beds')}
        m['settings'] = v['recipe']['settings']
        m['ams'] = v['beds'][0]['ams']
        descriptors.append(m)
    # The data is local, reviewable, generated from legacy recipe templates, never pulled from live credentials.
    data = json.dumps({'templates': templates, 'models': descriptors}, separators=(',', ':'))
    sql = '''-- Generated by print-pipeline/catalog/design_catalog.py. No batches, serials or stock are created.
-- Existing versions/jobs remain unchanged; the next version applies only to future prints.
DO $catalog$
DECLARE data jsonb := $json$DATA$json$::jsonb; entry jsonb; template jsonb; m_id uuid; v_id uuid;
  sale_id integer; v_number integer; new_beds jsonb; body jsonb;
BEGIN
  FOR entry IN SELECT value FROM jsonb_array_elements('[
    {"slug":"nfc-sticker-round-25","title":"NFC round sticker · 25.4 mm NTAG215"},
    {"slug":"nfc-sticker-10x20","title":"NFC rectangular sticker · 10 × 20 mm NTAG213"},
    {"slug":"nfc-tag-round-25","title":"NFC round tag · 25 mm NTAG215"}
  ]'::jsonb) LOOP
    INSERT INTO print_models(slug,kind,title,status) VALUES(entry->>'slug','part',entry->>'title','design_needed') ON CONFLICT(slug) DO NOTHING;
    SELECT id INTO m_id FROM print_models WHERE slug=entry->>'slug' AND current_version_id IS NULL;
    IF m_id IS NOT NULL THEN
      INSERT INTO print_model_versions(model_id,version,beds,source)
        VALUES(m_id,1,'[{"label":"bought","copies":1}]'::jsonb,'admin') RETURNING id INTO v_id;
      UPDATE print_models SET current_version_id=v_id,status='ready' WHERE id=m_id;
    END IF;
  END LOOP;
  FOR entry IN SELECT value FROM jsonb_array_elements(data->'models') LOOP
    SELECT id INTO sale_id FROM sales_products WHERE sku = entry->>'salesProduct' LIMIT 1;
    -- Resolve against a matching existing print model if a deployment uses another sales SKU.
    IF sale_id IS NULL THEN SELECT sales_product_id INTO sale_id FROM print_models
      WHERE product_type = entry->>'productType' AND sales_product_id IS NOT NULL ORDER BY sort_order LIMIT 1; END IF;
    IF sale_id IS NULL THEN CONTINUE; END IF;
    INSERT INTO print_models (slug, kind, title, product_type, face, theme, sales_product_id, batch_prefix, sort_order, materials)
      VALUES (entry->>'slug','serialized',entry->>'title',entry->>'productType',entry->>'face',entry->>'theme',sale_id,entry->>'batchPrefix',(entry->>'sortOrder')::int,entry->'materials')
      ON CONFLICT (slug) DO NOTHING;
    SELECT id INTO m_id FROM print_models WHERE slug = entry->>'slug' AND customer_order_line_id IS NULL AND status <> 'retired';
    IF m_id IS NULL THEN CONTINUE; END IF;
    IF EXISTS (SELECT 1 FROM print_model_versions WHERE model_id=m_id AND changelog='CHANGELOG') THEN CONTINUE; END IF;
    template := data->'templates'->(entry->>'productType');
    body := entry->'version';
    SELECT coalesce(max(version),0)+1 INTO v_number FROM print_model_versions WHERE model_id=m_id;
    SELECT jsonb_agg(bed || jsonb_build_object('ams',entry->'ams','pause',body->'nfcVariants'->'sticker_round_25'->'pause')) INTO new_beds
      FROM jsonb_array_elements(template->'beds') AS bed;
    UPDATE print_model_versions SET status='superseded' WHERE model_id=m_id AND status='current';
    INSERT INTO print_model_versions(model_id,version,status,builder,params,recipe,beds,consumes,nfc_variants,changelog,source)
      VALUES(m_id,v_number,'current',body->>'builder',body->'params',
        template->'recipe' || jsonb_build_object('settings',entry->'settings','pause_top_z',body->'nfcVariants'->'sticker_round_25'->'pause'->'z'),
        new_beds,body->'consumes',body->'nfcVariants','CHANGELOG','admin') RETURNING id INTO v_id;
    UPDATE print_models SET title=entry->>'title',face=entry->>'face',theme=entry->>'theme',
      materials=entry->'materials',current_version_id=v_id,status='ready',updated_at=now() WHERE id=m_id;
  END LOOP;
END $catalog$;
'''.replace('DATA', data).replace('CHANGELOG', CHANGELOG)
    Path(target).write_text(sql, encoding='utf-8')


def previews(target):
    """Render actual layout polygons, including the full plate/card and stand base, as lightweight SVGs."""
    import face_art as fa
    def paths(g, colour):
        if g is None:
            return ''
        result = []
        for poly in fa.polys(g):
            rings = [poly.exterior, *poly.interiors]
            d = ' '.join('M' + ' L'.join(f'{x:.3f} {y:.3f}' for x, y in list(r.coords)[:-1]) + ' Z' for r in rings)
            result.append(f'<path d="{d}" fill="{colour}" fill-rule="evenodd"/>')
        return ''.join(result)
    @lru_cache(maxsize=16)
    def legacy_layers(builder, size, theme):
        """Use the real inlay mesh sections so the pre-existing Google/Instagram faces stay accurate too."""
        import tempfile
        import trimesh
        from shapely import affinity
        from builders import build_piece
        import card_per_code_large_instagram as geom
        product, face = builder.split('.')
        width, height = dimensions(product, size)
        xoff = -45 if product == 'stand' and size == 'small' else 0
        with tempfile.TemporaryDirectory(prefix='xpot-face-preview-') as tmp:
            _, parts = build_piece(builder, dict(public_code='A7K3P9X2', serial_number='001', qr_url='https://xpot.place/q/A7K3P9X2'),
                                   0, dict(size=size, theme=theme, nfc_mount=nfc.DEFAULT_MOUNT, qr='panel'), tmp, batch='PREVIEW')
            layers = []
            for _, filename, slot in parts[1:]:
                mesh = trimesh.load(Path(tmp) / filename)
                section = geom.mesh_section_polygons(mesh, float(mesh.bounds[1][2]) - .26)
                layers.append((slot, affinity.affine_transform(section, [1, 0, 0, -1, width / 2 - xoff, height])))
        if face == 'google':
            if product == 'plate':
                import tile_per_code_google as google
                google.configure(size)
                pieces = google.layout('A7K3P9X2')['g_pieces']
            else:
                import face_art_large as large
                import face_art_small as small
                (large if size == 'large' else small).configure()
                g = fa.fc.resolve_version('google')['logo']
                _, pieces = fa.g_geom(g)
            layers.extend(pieces)
        return layers

    for m in entries():
        params = m['version']['params']
        product = m['productType'].split('_')[1]
        w, h = dimensions(product, params['size'])
        cols = m['version']['recipe']['settings']['filament_colour']
        svg = f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="-5 -5 {w+10} {h+16}"><rect x="0" y="0" width="{w}" height="{h}" rx="{6 if product=="stand" else 8}" fill="{cols[0]}" stroke="#888" stroke-width=".3"/>'
        if params['face'] in NAMES:
            art = layout(params['face'], product, params['size'], 'A7K3P9X2', params['theme'], params['style'])
            svg += paths(art['ink'], cols[1]) + paths(art['accent'], cols[2])
        else:
            for slot, shape in legacy_layers(m['version']['builder'], params['size'], params['theme']):
                svg += paths(shape, cols[slot - 1] if isinstance(slot, int) else slot)
        if product == 'stand':
            svg += f'<rect x="-2" y="{h-8}" width="{w+4}" height="12" rx="2" fill="#161616"/><path d="M-2 {h-8}H{w+2}" stroke="#444" stroke-width="1.5"/>'
        path = Path(target) / m['productType'] / m['face'] / f'{params["style"]}-{m["theme"]}.svg'
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(svg + '</svg>', encoding='utf-8')


def preview_fixture(target):
    models = []
    for model in entries():
        v = model.pop('version')
        model.update(id=model['slug'], status='ready', salesProductId=1, partReorderAt=None, lowStock=False,
                     onHand=0, withResellers=0, openJobs=0, createdAt='', updatedAt='')
        v.update(id=model['slug'] + '-v1', modelId=model['slug'], version=1, status='current', source='admin',
                 createdAt='', jobCount=0, preview=None, fixesBatchId=None, fixesBatchCode=None)
        model['currentVersion'] = v
        models.append(model)
    path = Path(target)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(models), encoding='utf-8')


if __name__ == '__main__':
    import argparse
    parser = argparse.ArgumentParser()
    parser.add_argument('--migration')
    parser.add_argument('--previews')
    parser.add_argument('--fixture')
    args = parser.parse_args()
    if args.migration:
        migration(args.migration)
    if args.previews:
        previews(args.previews)
    if args.fixture:
        preview_fixture(args.fixture)
    print(f'{len(entries())} models × 3 NFC types; one printer plate per generation.')
