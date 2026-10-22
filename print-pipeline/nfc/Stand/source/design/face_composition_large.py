"""Approved Google face for the 103 x 137 mm NFC plaque.

This module deliberately sits beside ``face_composition.py`` instead of replacing it: the original
60 x 85 mm Small plaque remains reproducible.  Coordinates are millimetres, y down from the card's
top edge.  The face keeps the approved visual language but uses the extra room for one headline line,
a 26 mm Google G and a 33.25 mm QR (25 modules at 1.33 mm each).
"""
import os

import fitz

import face_composition as small

CARD_W, CARD_H = 103.0, 137.0
R_TOP, R_BOTTOM = 12.0, 2.5
HIDDEN = 11.5
BASE_W, BASE_H = 111.0, 14.0
BLACK, WHITE, YELLOW = small.BLACK, small.WHITE, small.YELLOW
FONT = small.FONT
G_PATHS = small.G_PATHS
IG_BG_D, IG_CAM_D, IG_BOX = small.IG_BG_D, small.IG_CAM_D, small.IG_BOX

PIECE = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
OUT = os.path.join(PIECE, 'preview', 'face', 'face-large-103x137.png')

FACE = {
    'tap_row': {'y': 8.0, 'icon_h': 9.0, 'cap': 6.2, 'gap': 3.0, 'label': 'Tap here'},
    'logo': {'y': 23.0, 'size': 26.0},
    'headline': {'text': 'Review us on Google', 'cap': 6.2, 'baseline': 61.2, 'max_width': 86.0},
    'stars': {'cy': 70.5, 'size': 7.5, 'gap': 2.4},
    'qr': {'x': CARD_W / 2 - 33.25 / 2, 'y': 82.0, 'size': 33.25, 'modules': 25},
}

VERSIONS = {
    'google': {'logo': 'google_g', 'headline': FACE['headline']['text'],
               'line2': {'kind': 'stars', 'size': FACE['stars']['size'],
                         'gap': FACE['stars']['gap'], 'fill': YELLOW}},
}


def resolve_version(name):
    if name != 'google':
        raise KeyError(name)
    _, natural_width = small.text(FACE['headline']['text'], FACE['headline']['cap'], 0, 0)
    cap = FACE['headline']['cap'] * min(1.0, FACE['headline']['max_width'] / natural_width)
    return {
        'tap_row': dict(FACE['tap_row']),
        'logo': {'kind': 'google_g', 'x': CARD_W / 2 - FACE['logo']['size'] / 2,
                 'y': FACE['logo']['y'], 'size': FACE['logo']['size']},
        'headline': {'text': FACE['headline']['text'], 'cap': cap,
                     'baseline': FACE['headline']['baseline']},
        'line2': dict(VERSIONS['google']['line2'], cy=FACE['stars']['cy']),
        'qr': dict(FACE['qr']),
    }


def option_version(name='google'):
    r, cx = resolve_version(name), CARD_W / 2
    t, lg, h, stars, q = r['tap_row'], r['logo'], r['headline'], r['line2'], r['qr']
    tap, _ = small.tap_row_mark(cx, t['y'], t['icon_h'], t['cap'], t['gap'])
    head, _ = small.text(h['text'], h['cap'], cx, h['baseline'])
    return (tap + small.g_logo(lg['x'], lg['y'], lg['size']) + head
            + small.stars(cx, stars['cy'], stars['size'], stars['gap'], stars['fill'])
            + small.qr_placeholder(q['x'], q['y'], q['size'], n=q['modules']))


def card_frame(inner):
    w, h, rt, rb = CARD_W, CARD_H, R_TOP, R_BOTTOM
    outline = ('M%g 0 H%g A%g %g 0 0 1 %g %g V%g A%g %g 0 0 1 %g %g H%g '
               'A%g %g 0 0 1 0 %g V%g A%g %g 0 0 1 %g 0 Z'
               % (rt, w - rt, rt, rt, w, rt, h - rb, rb, rb, w - rb, h,
                  rb, rb, rb, h - rb, rt, rt, rt, rt))
    bx = (CARD_W - BASE_W) / 2
    base = '<rect x="%g" y="%g" width="%g" height="%g" rx="4" fill="#222"/>' % (
        bx, CARD_H - HIDDEN, BASE_W, BASE_H)
    return '<path d="%s" fill="%s" stroke="#c9c9c4" stroke-width="0.25"/>%s%s' % (
        outline, WHITE, inner, base)


def sheet(options=None):
    options = options or [('Google large', option_version())]
    pad, gap, label_h = 12.0, 20.0, 10.0
    width = pad * 2 + len(options) * BASE_W + (len(options) - 1) * gap
    height = pad + CARD_H - HIDDEN + BASE_H + label_h + pad
    parts = ['<rect width="%g" height="%g" fill="#b9a688"/>' % (width, height)]
    for i, (name, inner) in enumerate(options):
        ox = pad + i * (BASE_W + gap) + (BASE_W - CARD_W) / 2
        parts.append('<g transform="translate(%.3f %.3f)">%s</g>' % (ox, pad, card_frame(inner)))
        label, _ = small.text(name, 4.5, ox + CARD_W / 2,
                              pad + CARD_H - HIDDEN + BASE_H + 7.0, fill='#2a2a2a')
        parts.append(label)
    return ('<svg xmlns="http://www.w3.org/2000/svg" width="%gmm" height="%gmm" '
            'viewBox="0 0 %g %g">%s</svg>' % (width, height, width, height, ''.join(parts)))


def render(svg, out, px_per_card=900):
    doc = fitz.open(stream=svg.encode('utf-8'), filetype='svg')
    page = doc[0]
    zoom = px_per_card / (BASE_W * 72 / 25.4)
    page.get_pixmap(matrix=fitz.Matrix(zoom, zoom), alpha=False).save(out)
    print(out)


if __name__ == '__main__':
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    render(sheet(), OUT)
    r = resolve_version('google')
    _, width = small.text(r['headline']['text'], r['headline']['cap'], 0, 0)
    print({'card_mm': [CARD_W, CARD_H], 'headline_width_mm': round(width, 2),
           'headline_cap_mm': round(r['headline']['cap'], 2),
           'qr_module_mm': round(r['qr']['size'] / r['qr']['modules'], 2)})
