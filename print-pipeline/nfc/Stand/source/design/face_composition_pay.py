"""Pay face for the 103 x 137 mm NFC plaque — 2D study, not approved yet (2026-10-07).

Same body, base and card as the Google face (face_composition_large.py); only the art changes:
"Tap here", the payment brand's logo in its own colour, "Pay here", and the QR.

The QR square is fixed at 33.25 mm and the module size follows the link:
- Xpot code `HTTPS://XPOT.PLACE/Q/<CODE>` -> version 2, 25 modules, 1.33 mm;
- the client's own link (e.g. `https://venmo.com/u/<user>`) -> version 3+, 29 modules = 1.15 mm.
A link that would need modules under 1.0 mm is refused (doc 16: >= 0.8, the plaque keeps a margin).

The brand logos are the real vectors in `library/svg/` (sources in its SOURCES.md, downloaded 2026-10-07),
recoloured per tile colour so that each brand needs ONE extra filament: Venmo and PayPal share the blue #008CFF
(PayPal's three-blue monogram is printed in that one blue), Zelle is its purple on white and white on black,
Cash App is its green badge with the white "$" (the tile's white on a white tile).
"""
import functools
import os
import re

import fitz
import segno
from matplotlib.font_manager import FontProperties
from matplotlib.textpath import TextPath

import face_composition as small
import face_composition_large as large

CARD_W, CARD_H, HIDDEN = large.CARD_W, large.CARD_H, large.HIDDEN
BLACK = small.BLACK
ITALIC = FontProperties(fname=r'C:\Windows\Fonts\segoeuiz.ttf')

OUT = os.path.join(large.PIECE, 'preview', 'face', 'face-pay-study-v2.png')   # v2: the real logos

SVG_DIR = os.path.join(small.REPO, 'library', 'svg')
WHITE = small.WHITE
BLUE = '#008CFF'
# file, and the colour map per tile ('white' / 'black'): source colour -> printed colour. 'fill' = the brand's
# main colour (contrast check). Zelle's file is the reversed logo on a purple rectangle: the rectangle is dropped.
BRANDS = {
    'venmo': {'file': 'Venmo Logo.svg', 'fill': BLUE,
              'white': {'#008cff': BLUE}, 'black': {'#008cff': BLUE}},
    'zelle': {'file': 'Zelle Logo.svg', 'fill': '#6C1CD3', 'drop': [r'<rect[^>]*/>'],
              'white': {'white': '#6C1CD3'}, 'black': {'white': WHITE}},
    # Cash App: the official primary logo (badge + "Cash App"), press kit logos-2025-06; the badge alone is
    # `Cash App Logo.svg` (Commons). The words are unfilled paths (black by default) -> the tile's ink.
    'cashapp': {'file': 'Cash App Logo Primary Black.svg', 'fill': '#00E013',
                'white': {'#00e013': '#00E013', '#fff': WHITE, '#000000': BLACK},
                'black': {'#00e013': '#00E013', '#fff': WHITE, '#000000': WHITE}},
    'paypal': {'file': 'PayPal Logo 2024.svg', 'fill': BLUE,
               'white': {'#002991': BLUE, '#60cdff': BLUE, '#008cff': BLUE, '#000000': BLACK},
               'black': {'#002991': BLUE, '#60cdff': BLUE, '#008cff': BLUE, '#000000': WHITE}},
}

FACE = {
    'tap_row': {'y': 8.0, 'icon_h': 9.0, 'cap': 6.2, 'gap': 3.0},
    'logo': {'cy': 37.0, 'max_w': 74.0, 'max_h': 20.0},     # the logo's box, centred
    'headline': {'text': 'Pay here', 'cap': 9.0, 'baseline': 68.0},
    'qr': {'y': 80.0, 'size': 33.25},
}


def text_font(s, height, cx, cy, prop, fill):
    """s as an outline path, scaled so its ink box is `height` tall, centred on (cx, cy)."""
    tp = TextPath((0, 0), s, size=100, prop=prop)
    e = tp.get_extents()
    k = height / e.height
    x0, y0 = cx - e.width * k / 2 - e.x0 * k, cy + e.height * k / 2 + e.y0 * k
    d, i, v, codes = [], 0, tp.vertices, tp.codes
    pt = lambda p: '%.3f %.3f' % (x0 + p[0] * k, y0 - p[1] * k)
    while i < len(codes):
        c = codes[i]
        if c == 1:
            d.append('M' + pt(v[i])); i += 1
        elif c == 2:
            d.append('L' + pt(v[i])); i += 1
        elif c == 3:
            d.append('Q' + pt(v[i]) + ' ' + pt(v[i + 1])); i += 2
        elif c == 4:
            d.append('C' + pt(v[i]) + ' ' + pt(v[i + 1]) + ' ' + pt(v[i + 2])); i += 3
        else:
            d.append('Z'); i += 1
    return '<path fill="%s" d="%s"/>' % (fill, ' '.join(d)), e.width * k


@functools.lru_cache(None)
def _logo(brand, theme):
    """(inner svg, ink box (x, y, w, h) in the file's units) of a brand logo recoloured for `theme`."""
    b = BRANDS[brand]
    t = open(os.path.join(SVG_DIR, b['file']), encoding='utf-8').read()
    t = re.sub(r'<\?xml.*?\?>|<!--.*?-->|<metadata.*?</metadata>|<sodipodi:namedview.*?(/>|</sodipodi:namedview>)',
               '', t, flags=re.S)
    for pat in b.get('drop', []):
        t = re.sub(pat, '', t, flags=re.S)
    t = re.sub(r'\s(inkscape|sodipodi|xmlns:\w+):?[\w-]*="[^"]*"', '', t)
    # CSS classes (Illustrator exports) -> attributes: MuPDF does not apply <style>
    css = dict(re.findall(r'\.([\w-]+)\s*\{([^}]*)\}', t))
    t = re.sub(r'<style.*?</style>', '', t, flags=re.S)
    t = re.sub(r'class="([\w-]+)"', lambda m: ' '.join('%s="%s"' % tuple(x.strip() for x in d.split(':'))
                                                       for d in css.get(m.group(1), '').split(';') if ':' in d), t)
    vb = [float(v) for v in re.search(r'viewBox="([^"]+)"', t).group(1).replace(',', ' ').split()]
    inner = '<g fill="#000000">%s</g>' % re.search(r'<svg[^>]*>(.*)</svg>', t, flags=re.S).group(1)
    for src, dst in b[theme if theme in b else 'black'].items():
        inner = re.sub(r'(fill[:=]"?)%s' % re.escape(src), lambda m: m.group(1) + dst, inner, flags=re.I)
    # ink box: render alone, transparent, and find the painted pixels
    scale = 2000.0 / vb[2]
    doc = fitz.open(stream=('<svg xmlns="http://www.w3.org/2000/svg" width="%g" height="%g" viewBox="%s">%s</svg>'
                            % (vb[2], vb[3], ' '.join(map(str, vb)), inner)).encode(), filetype='svg')
    pix = doc[0].get_pixmap(matrix=fitz.Matrix(scale, scale), alpha=True)
    import numpy as np
    a = np.frombuffer(pix.samples, np.uint8).reshape(pix.height, pix.width, 4)[..., 3]
    ys, xs = np.nonzero(a > 8)
    k = vb[2] / pix.width
    box = (vb[0] + xs.min() * k, vb[1] + ys.min() * k, (xs.max() - xs.min() + 1) * k, (ys.max() - ys.min() + 1) * k)
    return inner, box


def brand_logo(brand, cx, cy, max_w, max_h, theme='white'):
    """The brand's real logo fitted by its ink into max_w x max_h, centred on (cx, cy)."""
    inner, (x, y, w, h) = _logo(brand, theme)
    k = min(max_w / w, max_h / h)
    # a <g transform>, not a nested <svg x y>: MuPDF ignores x / y on a nested svg
    return ('<g transform="translate(%.4f %.4f) scale(%.6f) translate(%.4f %.4f)">%s</g>'
            % (cx - w * k / 2, cy - h * k / 2, k, -x, -y, inner))


def qr(link, x, y, size, min_module=1.0):
    """The real QR of `link`, drawn as modules; returns (svg, modules, module_mm)."""
    sym = segno.make(link, micro=False, error="m")      # M at least; segno raises it when the version has room
    m = [list(row) for row in sym.matrix]
    n = len(m)
    q = size / n
    if q < min_module:
        raise SystemExit('%s needs %d modules: %.2f mm each, under the %.2f mm floor' % (link, n, q, min_module))
    cells = ''.join('<rect x="%.3f" y="%.3f" width="%.3f" height="%.3f"/>' % (x + c * q, y + r * q, q + 0.01, q + 0.01)
                    for r in range(n) for c in range(n) if m[r][c])
    return '<g fill="%s">%s</g>' % (BLACK, cells), n, q


def option(brand, link):
    cx, f = CARD_W / 2, FACE
    t, lg, h, qq = f['tap_row'], f['logo'], f['headline'], f['qr']
    tap, _ = small.tap_row_mark(cx, t['y'], t['icon_h'], t['cap'], t['gap'])
    head, _ = small.text(h['text'], h['cap'], cx, h['baseline'])
    code, n, q = qr(link, cx - qq['size'] / 2, qq['y'], qq['size'])
    return tap + brand_logo(brand, cx, lg['cy'], lg['max_w'], lg['max_h']) + head + code, n, q


if __name__ == '__main__':
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    cases = [
        ('Venmo - Xpot code', 'venmo', 'HTTPS://XPOT.PLACE/Q/A7K3P9X2'),
        ('Venmo - direct link', 'venmo', 'https://venmo.com/u/skaleclub'),
        ('Zelle - Xpot code', 'zelle', 'HTTPS://XPOT.PLACE/Q/A7K3P9X2'),
        ('Cash App - Xpot code', 'cashapp', 'HTTPS://XPOT.PLACE/Q/A7K3P9X2'),
        ('PayPal - Xpot code', 'paypal', 'HTTPS://XPOT.PLACE/Q/A7K3P9X2'),
    ]
    options = []
    for name, brand, link in cases:
        inner, n, q = option(brand, link)
        options.append((name, inner))
        print('%-22s %-34s %d modules, %.2f mm' % (name, link, n, q))
    large.render(large.sheet(options), OUT, px_per_card=700)
