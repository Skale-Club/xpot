"""NFC counter plaque — face composition study for the Google Review art.

Draws layout options for the 60 x 85 mm card at true proportions and writes one sheet to
preview/face/. A 2D study only: nothing here is geometry yet. Units are millimetres, y down from the
card's top edge. The QR is a PLACEHOLDER pattern with the right module count (29 x 29), not a
scannable code.

    python face_composition.py
"""
import math
import os
import random

import fitz
from matplotlib.font_manager import FontProperties
from matplotlib.textpath import TextPath

HERE = os.path.dirname(os.path.abspath(__file__))
PIECE = os.path.dirname(os.path.dirname(HERE))

def _find_repo(start):
    """The repo root: the nearest folder above ``start`` holding bench.py (print-pipeline; pieces sit at nfc/<Product>/ since
    2026-10-09, so the root is no longer just the piece's parent)."""
    d = os.path.abspath(start)
    while not os.path.exists(os.path.join(d, 'bench.py')):
        up = os.path.dirname(d)
        if up == d:
            raise RuntimeError('no bench.py above %s' % start)
        d = up
    return d


REPO = _find_repo(PIECE)
OUT = os.path.join(PIECE, 'preview', 'face', 'face-composition-v1.png')
NFC_SVG = os.path.join(REPO, 'library', 'svg', 'NFC.svg')

CARD_W, CARD_H = 60.0, 85.0
R_TOP, R_BOTTOM = 8.0, 1.5
HIDDEN = 9.5                      # the lowest part of the card sits in the slot
BASE_W, BASE_H = 68.0, 12.0
BLACK, WHITE, YELLOW = '#1b1b1b', '#fbfbf8', '#FBBC05'
FONT = FontProperties(fname=r'C:\Windows\Fonts\segoeuib.ttf')

G_PATHS = [   # Google "G", 24 x 24 box, artwork from 1 to 23
    ('#4285F4', 'M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z'),
    ('#34A853', 'M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z'),
    ('#FBBC05', 'M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z'),
    ('#EA4335', 'M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z'),
]


def g_logo(x, y, size):
    s = size / 22.0
    body = ''.join('<path fill="%s" d="%s"/>' % (c, d) for c, d in G_PATHS)
    return '<g transform="translate(%.3f %.3f) scale(%.4f) translate(-1 -1)">%s</g>' % (x, y, s, body)


def nfc_icon(x, y, size, fill=BLACK):
    src = open(NFC_SVG, encoding='utf-8').read()
    d = src.split(' d="', 1)[1].split('"', 1)[0].replace('\n', ' ').replace('\t', ' ')
    s = size / 38.2               # the artwork spans x 5..43.2, y 6..42 of its 48 box
    return '<g transform="translate(%.3f %.3f) scale(%.4f) translate(-5 -5.1)"><path fill="%s" d="%s"/></g>' % (
        x, y, s, fill, d)


def text(s, cap, x, y, anchor='middle', fill=BLACK):
    """Text as an outline path. cap = cap height in mm; (x, y) = anchor point on the baseline."""
    ref = TextPath((0, 0), 'H', size=100, prop=FONT).get_extents()
    k = cap / ref.height
    tp = TextPath((0, 0), s, size=100, prop=FONT)
    ext = tp.get_extents()
    w = ext.width * k
    x0 = {'middle': x - w / 2, 'start': x, 'end': x - w}[anchor] - ext.x0 * k
    d, i, v, codes = [], 0, tp.vertices, tp.codes
    pt = lambda p: '%.3f %.3f' % (x0 + p[0] * k, y - p[1] * k)
    while i < len(codes):
        cd = codes[i]
        if cd == 1:
            d.append('M' + pt(v[i])); i += 1
        elif cd == 2:
            d.append('L' + pt(v[i])); i += 1
        elif cd == 3:
            d.append('Q' + pt(v[i]) + ' ' + pt(v[i + 1])); i += 2
        elif cd == 4:
            d.append('C' + pt(v[i]) + ' ' + pt(v[i + 1]) + ' ' + pt(v[i + 2])); i += 3
        else:
            d.append('Z'); i += 1
    return '<path fill="%s" d="%s"/>' % (fill, ' '.join(d)), w


def qr_placeholder(x, y, size, n=29, seed=7):
    rnd = random.Random(seed)
    m = [[rnd.random() < 0.47 for _ in range(n)] for _ in range(n)]

    def finder(r0, c0):
        for r in range(-1, 8):
            for c in range(-1, 8):
                if 0 <= r0 + r < n and 0 <= c0 + c < n:
                    ring = max(abs(r - 3), abs(c - 3))
                    m[r0 + r][c0 + c] = ring in (3, 1, 0)

    finder(0, 0), finder(0, n - 7), finder(n - 7, 0)
    for r in range(-2, 3):
        for c in range(-2, 3):
            m[n - 7 + r][n - 7 + c] = max(abs(r), abs(c)) in (2, 0)
    for i in range(8, n - 8):
        m[6][i] = m[i][6] = i % 2 == 0
    q = size / n
    cells = ''.join('<rect x="%.3f" y="%.3f" width="%.3f" height="%.3f"/>' % (x + c * q, y + r * q, q + 0.01, q + 0.01)
                    for r in range(n) for c in range(n) if m[r][c])
    return '<g fill="%s">%s</g>' % (BLACK, cells)


def star(cx, cy, r, fill):
    import math
    pts = []
    for i in range(10):
        a = -math.pi / 2 + i * math.pi / 5
        rr = r if i % 2 == 0 else r * 0.42
        pts.append('%.3f,%.3f' % (cx + rr * math.cos(a), cy + rr * math.sin(a)))
    return '<polygon fill="%s" points="%s"/>' % (fill, ' '.join(pts))


def stars(cx, cy, size, gap, fill):
    r = size / 2
    total = 5 * size + 4 * gap
    return ''.join(star(cx - total / 2 + r + i * (size + gap), cy, r, fill) for i in range(5))


def tap_row(cx, y, icon, cap):
    label, w = text('Tap or scan', cap, 0, 0, 'start')
    total = icon + 1.8 + w
    x0 = cx - total / 2
    label, _ = text('Tap or scan', cap, x0 + icon + 1.8, y + icon / 2 + cap / 2, 'start')
    return nfc_icon(x0, y, icon) + label


def card_frame(inner):
    w, h, rt, rb = CARD_W, CARD_H, R_TOP, R_BOTTOM
    outline = ('M%g 0 H%g A%g %g 0 0 1 %g %g V%g A%g %g 0 0 1 %g %g H%g A%g %g 0 0 1 0 %g V%g A%g %g 0 0 1 %g 0 Z'
               % (rt, w - rt, rt, rt, w, rt, h - rb, rb, rb, w - rb, h, rb, rb, rb, h - rb, rt, rt, rt, rt))
    bx = (CARD_W - BASE_W) / 2
    base = '<rect x="%g" y="%g" width="%g" height="%g" rx="3" fill="#222"/>' % (bx, CARD_H - HIDDEN, BASE_W, BASE_H)
    return ('<path d="%s" fill="%s" stroke="#c9c9c4" stroke-width="0.25"/>' % (outline, WHITE)) + inner + base


def option_a():
    """Stack: G, one headline, QR, tap row."""
    cx = CARD_W / 2
    head, _ = text('Review us on Google', 3.3, cx, 28.6)
    return (g_logo(cx - 7.5, 6.5, 15) + head + qr_placeholder(cx - 14.5, 33.5, 29)
            + tap_row(cx, 66.2, 6.5, 2.9))


def option_b():
    """Header row: G beside a two-line headline, stars, bigger QR, tap row."""
    cx = CARD_W / 2
    l1, w1 = text('Review us', 4.4, 23.0, 12.6, 'start')
    l2, w2 = text('on Google', 4.4, 23.0, 19.6, 'start')
    shift = (CARD_W - (23.0 + max(w1, w2) + 6.0)) / 2          # centre the G + text group
    row = '<g transform="translate(%.3f 0)">%s</g>' % (shift, g_logo(6.0, 7.0, 13.5) + l1 + l2)
    return (row + stars(cx, 27.3, 4.6, 1.5, YELLOW) + qr_placeholder(cx - 15.5, 33.0, 31)
            + tap_row(cx, 67.2, 6.0, 2.8))


def option_c():
    """Icons only: big G, stars, QR, the NFC mark — one word of text."""
    cx = CARD_W / 2
    return (g_logo(cx - 9.5, 6.0, 19) + stars(cx, 30.2, 4.6, 1.5, YELLOW) + qr_placeholder(cx - 14.5, 36.0, 29)
            + nfc_icon(cx - 3.5, 67.0, 7.0))


def tap_mark(cx, y, height, fill=BLACK):
    """The tap mark the user chose (2026-10-01): three arcs over a dot, as on the reference."""
    import math
    k = height / 10.9             # drawn 10.9 units tall: outer arc r 9, stroke 1.6, dot r 1.1
    cy = y + 9.8 * k
    out = ['<circle cx="%.3f" cy="%.3f" r="%.3f" fill="%s"/>' % (cx, cy, 1.1 * k, fill)]
    for r in (3.2, 6.1, 9.0):
        dx, dy = r * k * math.sin(math.radians(45)), r * k * math.cos(math.radians(45))
        out.append('<path d="M%.3f %.3f A%.3f %.3f 0 0 1 %.3f %.3f" fill="none" stroke="%s" stroke-width="%.3f" '
                   'stroke-linecap="round"/>' % (cx - dx, cy - dy, r * k, r * k, cx + dx, cy - dy, fill, 1.6 * k))
    return ''.join(out)


def option_a2(star_fill):
    """A, revised by the user: tap mark on top, G, headline, stars, a smaller QR. No "Tap or scan"."""
    cx = CARD_W / 2
    head, _ = text('Review us on Google', 3.3, cx, 34.8)
    return (tap_mark(cx, 5.0, 7.5) + g_logo(cx - 6.5, 15.5, 13) + head + stars(cx, 40.3, 4.6, 1.5, star_fill)
            + qr_placeholder(cx - 12.5, 46.0, 25, n=25))


def option_a3(star_fill):
    """A2 with the QR smaller still (user, 2026-10-01): 20 mm, 25 modules of 0.8 mm. G back to 15."""
    cx = CARD_W / 2
    head, _ = text('Review us on Google', 3.3, cx, 38.0)
    return (tap_mark(cx, 5.0, 7.5) + g_logo(cx - 7.5, 16.0, 15) + head + stars(cx, 44.0, 4.6, 1.5, star_fill)
            + qr_placeholder(cx - 10.0, 50.5, 20, n=25))


def option_a4(star_fill):
    """A3 plus "Tap here" under the tap mark (user, 2026-10-01). G 14 to make the room."""
    cx = CARD_W / 2
    tap, _ = text('Tap here', 3.3, cx, 17.8)
    head, _ = text('Review us on Google', 3.3, cx, 40.8)
    return (tap_mark(cx, 5.0, 7.5) + tap + g_logo(cx - 7.0, 20.5, 14) + head + stars(cx, 46.3, 4.6, 1.5, star_fill)
            + qr_placeholder(cx - 10.0, 52.0, 20, n=25))


def tap_row_mark(cx, y, icon_h, cap, gap=2.0):
    """The tap mark and "Tap here" side by side, centred as one group; text centred on the icon."""
    k = icon_h / 10.9
    icon_w = 2 * (9.0 * math.sin(math.radians(45)) + 0.8) * k
    label, w = text('Tap here', cap, 0, 0, 'start')
    x0 = cx - (icon_w + gap + w) / 2
    label, _ = text('Tap here', cap, x0 + icon_w + gap, y + icon_h / 2 + cap / 2, 'start')
    return tap_mark(x0 + icon_w / 2, y, icon_h) + label, icon_w + gap + w


# Composition v5, approved by the user on 2026-10-01. face_art.py builds the Fusion geometry from
# these same numbers, so change them here and nowhere else. mm, y down from the card's top edge.
LAYOUT_V5 = {
    'tap_row': {'y': 6.5, 'icon_h': 6.0, 'cap': 3.3, 'gap': 2.0, 'label': 'Tap here'},
    'g': {'x': CARD_W / 2 - 7.5, 'y': 17.0, 'size': 15.0},
    'headline': {'text': 'Review us on Google', 'cap': 3.3, 'baseline': 38.8},
    'stars': {'cy': 44.6, 'size': 4.6, 'gap': 1.5},
    'qr': {'x': CARD_W / 2 - 10.0, 'y': 51.5, 'size': 20.0, 'modules': 25},
}


def option_a5(star_fill=YELLOW):
    """A4 re-spaced (user, 2026-10-01): "Tap here" beside the mark, one rhythm for the whole face.

    Two gaps only: 3.5 mm inside a group (G / headline / stars), 4.5 mm between groups. Both texts
    share one cap height, and the tap row is as wide as the row of stars.
    """
    cx, L = CARD_W / 2, LAYOUT_V5
    t, g, h, s, q = L['tap_row'], L['g'], L['headline'], L['stars'], L['qr']
    row, _ = tap_row_mark(cx, t['y'], t['icon_h'], t['cap'], t['gap'])
    head, _ = text(h['text'], h['cap'], cx, h['baseline'])
    return (row + g_logo(g['x'], g['y'], g['size']) + head + stars(cx, s['cy'], s['size'], s['gap'], star_fill)
            + qr_placeholder(q['x'], q['y'], q['size'], n=q['modules']))


# --- One face, several versions (user, 2026-10-01: "all in the same file, so the shape of what is done is
# not lost, and a future change moves everything together"). FACE holds what every version shares — the
# rhythm, the tap row, the logo slot, the headline line, the second line, the QR. A version only names its
# logo, its headline and what fills the second line. Change FACE and every version follows.
FACE = {
    'tap_row': LAYOUT_V5['tap_row'],
    'logo': {'y': 17.0, 'size': 15.0},                     # centred; 4.5 below the tap row
    'headline': {'cap': 3.3, 'baseline': 38.8, 'max_width': 47.0},
    'line2': {'cy': 44.6},                                 # 3.5 under the headline, 4.6 above the QR
    'qr': LAYOUT_V5['qr'],
}
VERSIONS = {
    'google': {'logo': 'google_g', 'headline': 'Review us on Google',
               'line2': {'kind': 'stars', 'size': 4.6, 'gap': 1.5, 'fill': YELLOW}},
    # Generic plaques carry nothing of the client — no @handle (user, 2026-10-01); the @handle and the
    # client's own link belong to the custom version. Instagram: the user chose layout "B" — one line,
    # no second line, the full 2016 icon at 18 mm, the block re-centred between the tap row and the QR.
    # (Rejected "A": "Follow us" / "on Instagram" over two lines with a 15 mm icon.)
    'instagram': {'logo': 'instagram', 'headline': 'Follow us on Instagram',
                  'line2': {'kind': 'none'}, 'logo_size': 18.0},
}

# the approved Google face must come out of FACE + VERSIONS unchanged
assert FACE['logo']['y'] == LAYOUT_V5['g']['y'] and FACE['logo']['size'] == LAYOUT_V5['g']['size']
assert FACE['headline']['baseline'] == LAYOUT_V5['headline']['baseline']
assert FACE['line2']['cy'] == LAYOUT_V5['stars']['cy'] and VERSIONS['google']['headline'] == LAYOUT_V5['headline']['text']


IG_SVG = os.path.join(REPO, 'library', 'svg', 'Instagram Logo 2016.svg')


def _ig_paths():
    """(background d, camera d) of the 2016 icon; background in its own 0..130 box, camera shifted to it."""
    import re
    src = open(IG_SVG, encoding='utf-8').read()
    ds = re.findall(r'<path fill="([^"]+)" d="([^"]+)"', src)
    bg = next(d for f, d in ds if f.startswith('url('))
    cam = next(d for f, d in ds if f == '#fff')
    return bg, cam


IG_BG_D, IG_CAM_D = _ig_paths()
IG_BOX = 130.0                     # the icon's rounded square is 130 x 130 in the file (offset 1.004, 1)


def instagram_glyph(x, y, size, gid='ig', fill=None):
    """The full 2016 Instagram icon (user, 2026-10-01: "the fuller version"), from the Wikimedia file:
    the rounded square, and the camera knocked out of it in white. The square is printed in PLA silk;
    `fill` paints it flat (two-pass gradient render); without it, it takes a flat magenta."""
    k = size / IG_BOX
    return ('<g transform="translate(%.4f %.4f) scale(%.6f)"><path fill="%s" d="%s"/>'
            '<path fill="#FFFFFF" transform="translate(-1.004 -1)" d="%s"/></g>'
            % (x, y, k, fill or '#C837AB', IG_BG_D, IG_CAM_D))


def instagram_gradient(u, v):
    """Colour of the icon's two radial gradients at icon-local (u, v) in 0..1, as in the file:
    yellow -> orange -> magenta from the bottom left, blue fading in along the top left."""
    import numpy as np
    P = np.stack([u * IG_BOX, v * IG_BOX], -1)

    def t_of(m, cx, cy, r):
        a, b, c_, d, e, f = m
        inv = np.linalg.inv(np.array([[a, c_], [b, d]]))
        g = (P - [e, f]) @ inv.T
        return np.hypot(g[..., 0] - cx, g[..., 1] - cy) / r

    def ramp(t, stops):
        t = np.clip(t, 0, 1)
        out = np.zeros(t.shape + (len(stops[0][1]),))
        for (t0, c0), (t1, c1) in zip(stops, stops[1:]):
            w = np.clip((t - t0) / max(t1 - t0, 1e-9), 0, 1)[..., None]
            seg = (t >= t0) & (t <= t1)
            out[seg] = (np.array(c0) + (np.array(c1) - np.array(c0)) * w)[seg]
        return out
    hexrgb = lambda h: [int(h[i:i + 2], 16) for i in (1, 3, 5)]
    base = ramp(t_of((0, -1.98198, 1.8439, 0, -1031.402, 454.004), 158.429, 578.088, 65),
                [(0, hexrgb('#FFDD55')), (0.1, hexrgb('#FFDD55')), (0.5, hexrgb('#FF543E')), (1, hexrgb('#C837AB'))])
    over = ramp(t_of((.17394, .86872, -3.5818, .71718, 1648.348, -458.493), 147.694, 473.455, 65),
                [(0, hexrgb('#3771C8') + [1]), (0.128, hexrgb('#3771C8') + [1]), (1, hexrgb('#6600FF') + [0])])
    a = over[..., 3:4]
    return over[..., :3] * a + base * (1 - a)


def resolve_version(name):
    """Where everything sits on one version's face — FACE + VERSIONS[name], resolved to numbers.
    face_art.py builds the Fusion geometry from this, so the study and the model cannot drift apart."""
    v = VERSIONS[name]
    t, h, q = FACE['tap_row'], FACE['headline'], FACE['qr']
    cap = h['cap']
    _, w = text(v['headline'], cap, 0, 0)
    if w > h['max_width']:                                  # a long headline steps down to fit, never past the card
        cap = cap * h['max_width'] / w
    size, y, baseline = v.get('logo_size', FACE['logo']['size']), FACE['logo']['y'], h['baseline']
    if v['line2']['kind'] == 'none':
        # no second line: logo + headline re-centred between the tap row and the QR, 3.5 mm apart
        top = t['y'] + t['icon_h']
        y = top + (q['y'] - top - (size + 3.5 + cap)) / 2
        baseline = y + size + 3.5 + cap
    return {'tap_row': t, 'qr': q,
            'logo': {'kind': v['logo'], 'x': CARD_W / 2 - size / 2, 'y': y, 'size': size},
            'headline': {'text': v['headline'], 'cap': cap, 'baseline': baseline},
            'line2': dict(v['line2'], cy=FACE['line2']['cy'])}


def option_version(name, gid='ig', ig_fill=None):
    """One face from resolve_version(name)."""
    cx, r = CARD_W / 2, resolve_version(name)
    t, lg, h, l2, q = r['tap_row'], r['logo'], r['headline'], r['line2'], r['qr']
    row, _ = tap_row_mark(cx, t['y'], t['icon_h'], t['cap'], t['gap'])
    head, _ = text(h['text'], h['cap'], cx, h['baseline'])
    logo = (g_logo(lg['x'], lg['y'], lg['size']) if lg['kind'] == 'google_g'
            else instagram_glyph(lg['x'], lg['y'], lg['size'], gid, ig_fill))
    if l2['kind'] == 'stars':
        line2 = stars(cx, l2['cy'], l2['size'], l2['gap'], l2['fill'])
    elif l2['kind'] == 'text':
        line2, _ = text(l2['text'], l2['cap'], cx, l2['cy'] + l2['cap'] / 2)
    else:
        line2 = ''
    return row + logo + head + line2 + qr_placeholder(q['x'], q['y'], q['size'], n=q['modules'])


def version_logo_box(name):
    """(y, size) of a version's logo — the gradient render needs it."""
    lg = resolve_version(name)['logo']
    return lg['y'], lg['size']


# the approved Google face, resolved, is exactly LAYOUT_V5
_g = resolve_version('google')
assert (_g['logo']['x'], _g['logo']['y'], _g['logo']['size']) == (LAYOUT_V5['g']['x'], LAYOUT_V5['g']['y'], LAYOUT_V5['g']['size'])
assert (_g['headline']['cap'], _g['headline']['baseline']) == (LAYOUT_V5['headline']['cap'], LAYOUT_V5['headline']['baseline'])


def sheet(options=None):
    options = options or [('A', option_a()), ('B', option_b()), ('C', option_c())]
    pad, gap, label_h = 10.0, 16.0, 9.0
    W = pad * 2 + len(options) * BASE_W + (len(options) - 1) * gap
    H = pad + CARD_H - HIDDEN + BASE_H + label_h + pad
    parts = ['<rect width="%g" height="%g" fill="#b9a688"/>' % (W, H)]
    for i, (name, inner) in enumerate(options):
        ox = pad + i * (BASE_W + gap) + (BASE_W - CARD_W) / 2
        parts.append('<g transform="translate(%.3f %.3f)">%s</g>' % (ox, pad, card_frame(inner)))
        lab, _ = text(name, 4.5, ox + CARD_W / 2, pad + CARD_H - HIDDEN + BASE_H + 7.0, fill='#2a2a2a')
        parts.append(lab)
    return ('<svg xmlns="http://www.w3.org/2000/svg" width="%gmm" height="%gmm" viewBox="0 0 %g %g">%s</svg>'
            % (W, H, W, H, ''.join(parts)))


def render(svg, out, px_per_card=730):
    doc = fitz.open(stream=svg.encode('utf-8'), filetype='svg')
    page = doc[0]
    zoom = px_per_card / (BASE_W * 72 / 25.4)
    page.get_pixmap(matrix=fitz.Matrix(zoom, zoom), alpha=False).save(out)
    print(out)


def render_versions(items, out, px_per_card=730):
    """Sheet of versions with the Instagram icon in its gradient. MuPDF draws SVG gradients black, so
    the icon's square is rendered twice (black, then white, the camera always white): the difference is
    its exact anti-aliased mask, and the file's gradient is painted through it."""
    import numpy as np
    from PIL import Image

    def raster(fill):
        doc = fitz.open(stream=sheet([(lab, option_version(v, 'g%d' % i, fill)) for i, (lab, v) in enumerate(items)]).encode(),
                        filetype='svg')
        page = doc[0]
        zoom = px_per_card / (BASE_W * 72 / 25.4)
        pix = page.get_pixmap(matrix=fitz.Matrix(zoom, zoom), alpha=False)
        return np.frombuffer(pix.samples, np.uint8).reshape(pix.height, pix.width, 3).astype(float), zoom
    dark, zoom = raster('#000000')
    light, _ = raster('#FFFFFF')
    alpha = np.clip((light - dark).mean(axis=2) / 255.0, 0, 1)[..., None]
    k = 72 / 25.4 * zoom                                   # px per mm
    h, w = alpha.shape[:2]
    grad = light.copy()
    pad, gap = 10.0, 16.0
    for i, (_, v) in enumerate(items):
        if VERSIONS[v]['logo'] != 'instagram':
            continue
        ly, ls = version_logo_box(v)
        x0 = (pad + i * (BASE_W + gap) + (BASE_W - CARD_W) / 2 + CARD_W / 2 - ls / 2) * k
        y0, s = (pad + ly) * k, ls * k
        r0, r1, c0, c1 = int(y0) - 2, int(y0 + s) + 3, int(x0) - 2, int(x0 + s) + 3
        yy, xx = np.mgrid[r0:r1, c0:c1]
        grad[r0:r1, c0:c1] = instagram_gradient((xx - x0) / s, (yy - y0) / s)
    img = light * (1 - alpha) + grad * alpha
    Image.fromarray(img.clip(0, 255).astype(np.uint8)).save(out)
    print(out)


if __name__ == '__main__':
    render(sheet(), OUT)
    render(sheet([('A2 - yellow stars', option_a2(YELLOW)), ('A2 - black stars', option_a2(BLACK))]),
           OUT.replace('-v1.png', '-v2.png'))
    render(sheet([('A3 - yellow stars', option_a3(YELLOW)), ('A3 - black stars', option_a3(BLACK))]),
           OUT.replace('-v1.png', '-v3.png'))
    render(sheet([('A4', option_a4(YELLOW))]),        # yellow stars: the user's choice, 2026-10-01
           OUT.replace('-v1.png', '-v4.png'))
    render(sheet([('v4', option_a4(YELLOW)), ('v5', option_a5())]), OUT.replace('-v1.png', '-v5.png'))
    render_versions([('Google', 'google'), ('Instagram', 'instagram')],
                    OUT.replace('face-composition-v1.png', 'face-composition-versions.png'))
