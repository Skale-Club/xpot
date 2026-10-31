"""The builders: one id per family of serialized pieces, as an Xpot print version names it (`builder`).

A builder turns one code into that piece's meshes and says which parts they are: (label, STL file, AMS slot). The
bench lays the parts out on the bed with the version's slots and recipe (bench.py). The geometry itself is the 3D
Printing repo's code, copied into nfc/ with its paths pointed here; what was added here since (the sticker pocket,
the Menu and Small Stand cards) leaves every printed batch's meshes byte-identical (tests/rebuild.py).

    build(tag, index, params, out_dir) -> (report, parts)

`tag` is one ticket row (serial_number, public_code, qr_url, nfc_url, position), `index` its place in the order
(0-based, which picks a per-position theme on a mixed bed), `params` the version's params.
"""
from __future__ import annotations

import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
STAND = ROOT / 'nfc' / 'Stand' / 'source' / 'design'
PLATE_DESIGN = ROOT / 'nfc' / 'Plate' / 'source' / 'design'
PLATE = ROOT / 'nfc' / 'Plate' / 'source'
for path in (STAND, PLATE_DESIGN, PLATE):
    if str(path) not in sys.path:
        sys.path.insert(0, str(path))


class BuildError(Exception):
    """The version asks for something this builder cannot make (an unknown theme, a font with no design)."""


def _theme(params, index=0, allowed=('white', 'black')):
    themes = params.get('themes')
    theme = themes[index % len(themes)] if themes else params.get('theme', 'white')
    if theme not in allowed:
        raise BuildError(f'theme {theme!r}: one of {", ".join(allowed)}')
    return theme


def _check_url(report_url, tag):
    if report_url and report_url.upper() != tag['qr_url'].upper():
        raise BuildError(f"{tag['public_code']}: the builder encoded {report_url}, the order says {tag['qr_url']}")


def _pair(theme):
    """(body colour, art colour) of a two-colour piece."""
    return ('White', 'Black') if theme == 'white' else ('Black', 'White')


def plate_instagram(tag, index, params, out_dir):
    import tile_per_code
    theme = _theme(params, index)
    report = tile_per_code.build(tag['public_code'], str(out_dir), theme=theme, size=params.get('size', 'large'),
                                 nfc_mount=params.get('nfc_mount', 'embedded_round'))
    _check_url((report.get('qr') or {}).get('url') or report.get('qr_url'), tag)
    body, art = _pair(theme)
    return report, [(f'{body} - Plate', f'{body}_Instagram_Plate.stl', 1), (f'{art} - Art', f'{art}_Instagram_Art.stl', 2),
                    ('Silk - Logo', 'Silk_Instagram_Logo.stl', 3)]


def plate_google(tag, index, params, out_dir):
    import tile_per_code_google
    theme = _theme(params, index)
    # Without nfc_mount (and on white) the call is the one every printed batch was built with (tests/rebuild.py).
    mount = params.get('nfc_mount', 'embedded_round')
    extra = {} if mount == 'embedded_round' else {'nfc_mount': mount}
    if theme != 'white':
        extra['theme'] = theme
    report = tile_per_code_google.build(tag['public_code'], str(out_dir), size=params.get('size', 'large'), **extra)
    _check_url((report.get('qr') or {}).get('url') or report.get('qr_url'), tag)
    body, art = _pair(theme)
    return report, [(f'{body} - Plate', f'{body}_Google_Plate.stl', 1), (f'{art} - Art', f'{art}_Google_Art.stl', 2),
                    ('Yellow - Stars', 'Yellow_Google_Stars.stl', 3)]


# Menu title fonts the Menu layout draws as-is (Metropolis's spaced capitals need their own layout first).
MENU_FONTS_READY = ('Inria Serif Bold', 'Inria Serif Bold Italic')


def plate_menu(tag, index, params, out_dir):
    import build_menu_batch
    import build_menu_sticker_test as sticker
    theme = _theme(params, index)
    font = params.get('font', 'Inria Serif Bold')
    if font not in MENU_FONTS_READY:
        raise BuildError(f'menu font {font!r} has no layout yet: one of {", ".join(MENU_FONTS_READY)}')
    size = params.get('size', 'large')
    if size not in build_menu_batch.MENU_SIZES:
        raise BuildError(f'menu size {size!r}: one of {", ".join(build_menu_batch.MENU_SIZES)}')
    build_menu_batch.FONT = font
    # Both sizes take the 10 x 20 sticker pocket under Tap here.
    report = sticker.build_one(tag['public_code'], Path(out_dir), placement=params.get('placement', 'under_tap'),
                               theme=theme, size=size)
    _check_url((report.get('qr') or {}).get('url'), tag)
    body, art = _pair(theme)
    return report, [(f'{body} - Menu Plate', f'{body}_Menu_Plate.stl', 1), (f'{art} - Menu Art', f'{art}_Menu_Art.stl', 2)]


def plate_venmo(tag, index, params, out_dir):
    import build_venmo_plate_batch as venmo
    theme = _theme(params, index)
    report = venmo.build_one(tag['public_code'], Path(out_dir), theme)
    _check_url((report.get('qr') or {}).get('url'), tag)
    body_stl, ink_stl, logo_stl = venmo.stl_names(theme)
    body, ink = _pair(theme)
    # slot 1 white, slot 2 black, slot 3 Venmo blue, whatever the plate's colour
    body_slot, ink_slot = (1, 2) if theme == 'white' else (2, 1)
    return report, [(f'{body} - Venmo Plate', body_stl, body_slot), (f'{ink} - Venmo Art', ink_stl, ink_slot),
                    ('Blue - Venmo Logo', logo_stl, 3)]


def _stand(module_name, face, tag, index, params, out_dir, batch):
    theme = _theme(params, index)
    mount = params.get('nfc_mount', 'embedded_round')
    size = params.get('size', 'large')
    if size not in ('large', 'small'):
        raise BuildError(f'size {size!r}: large or small')
    # The Small cards and the Menu card are new (2026-10-31): every face, both colours, only with the 10 x 20 sticker.
    if (size == 'small' or face == 'Menu') and mount != 'sticker_10x20':
        raise BuildError(f'nfc_mount {mount!r}: the {size.title()} {face} Stand card only takes sticker_10x20')
    font = _menu_font(params, face)
    if size == 'small':
        import card_per_code_small
        report = card_per_code_small.build(face.lower(), tag['public_code'], batch, tag['serial_number'], str(out_dir),
                                           theme=theme, nfc_mount=mount, font=font)
    else:
        module = __import__(module_name)
        if face == 'Menu':
            extra = {'nfc_mount': mount, 'theme': theme, 'font': font}
        else:
            # Without nfc_mount the call is the one every printed batch was built with (tests/rebuild.py).
            extra = {} if mount == 'embedded_round' else {'nfc_mount': mount, 'theme': theme}
        report = module.build(tag['public_code'], batch, tag['serial_number'], str(out_dir), **extra)
    _check_url(report.get('qr_url') or (report.get('qr') or {}).get('url'), tag)
    # The black Stand prints the same file names with the body and art filaments swapped in the recipe.
    body, art = _pair(theme)
    parts = [(f'{body} - Card', f'White_{face}_Card.stl', 1), (f'{art} - Art', f'Black_{face}_Art.stl', 2)]
    if face == 'Google':
        parts.append(('Yellow - Stars', 'Yellow_Google_Stars.stl', 3))
    elif face == 'Instagram':
        parts.append(('Silk - Logo', 'Silk_Instagram_Logo.stl', 3))
    return report, parts


def _menu_font(params, face):
    font = params.get('font', 'Inria Serif Bold')
    if face == 'Menu' and font not in MENU_FONTS_READY:
        raise BuildError(f'menu font {font!r} has no layout yet: one of {", ".join(MENU_FONTS_READY)}')
    return font


def stand_google(tag, index, params, out_dir, batch=''):
    return _stand('card_per_code_large', 'Google', tag, index, params, out_dir, batch)


def stand_instagram(tag, index, params, out_dir, batch=''):
    return _stand('card_per_code_large_instagram', 'Instagram', tag, index, params, out_dir, batch)


def stand_menu(tag, index, params, out_dir, batch=''):
    return _stand('card_per_code_large_menu', 'Menu', tag, index, params, out_dir, batch)


BUILDERS = {
    'plate.instagram': plate_instagram,
    'plate.google': plate_google,
    'plate.menu': plate_menu,
    'plate.venmo': plate_venmo,
    'stand.google': stand_google,
    'stand.instagram': stand_instagram,
    'stand.menu': stand_menu,
}

NEEDS_BATCH = {'stand.google', 'stand.instagram', 'stand.menu'}


def build_piece(builder_id, tag, index, params, out_dir, batch=''):
    if builder_id not in BUILDERS:
        raise BuildError(f'unknown builder {builder_id!r}: one of {", ".join(sorted(BUILDERS))}')
    fn = BUILDERS[builder_id]
    os.makedirs(out_dir, exist_ok=True)
    if builder_id in NEEDS_BATCH:
        return fn(tag, index, params, out_dir, batch=batch)
    return fn(tag, index, params, out_dir)
