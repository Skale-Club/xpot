"""NFC Table Tile — square tile stuck to a table with 3M tape. 2D study v3, not approved (2026-10-07).

One body, several faces, like the standing NFC Plaque: Menu, Google Review, Pay here (<brand>); each face in a
white tile (black art) or a black tile (white art). Printed face-down like the plaque's card (same 3.56 mm
thickness and NFC pause).

Layout (v2, user 2026-10-07: square, rounder corners — then less round, r 10 — and "the alignment looks badly done"):
- every block is centred on the tile's vertical axis by its ink;
- "Tap here" sits at the top margin and the QR at the bottom margin, in the same place on every face and theme;
- the face's message (logo or title + its line) is one group GROUP_H tall on every face, centred between them,
  so the space above and below it is the same on all faces; inside the group the gaps are tighter (proximity);
- text is measured by its cap height (descenders may hang into a gap), graphics by their ink;
- the QR's quiet zone (4 modules) is checked. On the black tile the QR stays dark-on-light on a white panel
  (user, 2026-10-07: "the normal QR, with a smaller border"): the panel's border is PANEL_QUIET modules, below the
  standard's 4 — the black around it is a flat field, not art; to be confirmed by scanning a print.
  Both black versions stay available (user, 2026-10-07: "I find the inverted one classier"): 'black' (QR on the
  panel, reads on every phone) and 'black-inverted' (light modules straight on the black tile, no panel).

Menu title fonts (user, 2026-10-07): three approved, all chosen per piece, all SIL Open Font License — Inria Serif Bold,
Inria Serif Bold Italic, Metropolis Medium in spaced capitals. `--menu-fonts` renders the original six-font study.

The drawing helpers come from the NFC Plaque (`../../../Stand/source/design/`): text, tap mark, G, QR.
"""
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
PIECE = os.path.dirname(os.path.dirname(HERE))
REPO = os.path.dirname(os.path.dirname(PIECE))      # NFC/Plate -> repo root (2026-10-09)
sys.path.insert(0, os.path.join(REPO, 'nfc', 'Stand', 'source', 'design'))

import fitz
from matplotlib.font_manager import FontProperties
from matplotlib.textpath import TextPath

import face_composition as small
import face_composition_pay as pay

SIZE, RADIUS, MARGIN = 100.0, 10.0, 9.0           # square tile; corner radius; margin to the art
QR_SIZE = 30.0                                    # 25 modules at 1.2 mm for an Xpot code
GROUP_H = 28.0                                    # every face's message is this tall
# Sizes (user, 2026-10-09: "small and large plates, sized for the Bambu A1 like the other projects"). Each is the
# largest square that packs the A1's 256 mm plate the Stand Large way (6 mm margin, 4 mm gaps, a 30 mm prime tower
# in the middle): Large 2 x 2 around a tower channel (2a + 4 + 30 + 4 = 244 -> 103), Small 3 x 3 with the tower in
# the middle cell (3a + 8 = 244 -> 78). Packing sliced with blank tiles: NOTES.md, "Sizes for the A1".
# Floors that do not scale: text cap >= 4.5 (Segoe UI Bold 4.5 is the smallest that printed clean, Stand text
# ladder 2026-10-03). The Small Instagram QR deliberately uses 0.8 mm modules: after seeing both the 25 and 22 mm
# studies, the user still found the QR and white panel too large on 2026-10-15. The printed-and-scanned Small Stand
# already established 0.8 mm modules as a physical reference. `v3` is the 100 mm study the user saw on 2026-10-07.
# G and stars enlarged (user, 2026-10-09: "the G and the stars are too small"), margins trimmed to make room; the
# limit is the space above the QR, which must stay >= its 4-module quiet zone.
SIZES = {
    'v3':    dict(size=100.0, radius=10.0, margin=9.0, qr=30.0, tap=(7.0, 4.8, 2.4),
                  g=13.0, g_gaps=(3.6, 2.6), text=4.4, stars=(4.4, 1.5),
                  menu_cap=16.4, menu_w=72.0, menu_sub=4.6, brand=(60.0, 14.0), pay=8.0),
    'large': dict(size=103.0, radius=10.0, margin=8.0, qr=31.0, tap=(7.2, 4.9, 2.5),
                  g=20.0, g_gaps=(3.2, 2.4), text=4.5, stars=(7.0, 2.2),
                  menu_cap=30.0, menu_w=80.0, menu_sub=4.7, brand=(70.0, 16.0), pay=8.2,
                  fill_group=False, menu_gap=4.5, pay_gap=5.0,
                  ig=28.0, ig_gap=3.2, ig_lines=1),          # icon 20 -> 28: "the insta logo is small"
    'small': dict(size=78.0, radius=8.0, margin=6.0, qr=20.0, qr_min=0.8, panel_quiet=1.0,
                  tap=(6.0, 4.5, 2.0),
                  g=13.0, g_gaps=(2.0, 1.5), text=4.5, stars=(5.8, 1.6),
                  menu_cap=30.0, menu_w=62.0, menu_sub=4.5, brand=(54.0, 12.5), pay=6.5,
                  fill_group=False, menu_gap=3.5, pay_gap=3.5,
                  ig=18.0, ig_gap=1.8, ig_lines=2, ig_line_gap=1.2,   # smaller QR lets the icon lead the hierarchy
                  ig_short=20.0, ig_short_gap=2.3),                    # option: "Follow us" alone, icon 20
}
D = dict(SIZES['v3'])


def configure(key):
    """Switch every layout number to one tile size. GROUP_H follows the tallest fixed message group."""
    global SIZE, RADIUS, MARGIN, QR_SIZE, GROUP_H, CX, TAP, MENU_TITLE_CAP, MENU_TITLE_MAX_W, D
    D = dict(SIZES[key])
    SIZE, RADIUS, MARGIN, QR_SIZE = D['size'], D['radius'], D['margin'], D['qr']
    google_h = D['g'] + sum(D['g_gaps']) + D['text'] + D['stars'][0]
    instagram_h = D.get('ig', 0) + D.get('ig_gap', 0) + D.get('ig_lines', 1) * D['text'] + \
        max(D.get('ig_lines', 1) - 1, 0) * D.get('ig_line_gap', 0)
    GROUP_H = max(google_h, instagram_h)
    CX = SIZE / 2
    TAP = {'icon_h': D['tap'][0], 'cap': D['tap'][1], 'gap': D['tap'][2]}
    MENU_TITLE_CAP, MENU_TITLE_MAX_W = D['menu_cap'], D['menu_w']
PANEL_QUIET = 2                                   # default white border; Small overrides it in SIZES
WHITE, BLACK, YELLOW = small.WHITE, small.BLACK, small.YELLOW
THEMES = {'white': {'tile': WHITE, 'ink': BLACK}, 'black': {'tile': BLACK, 'ink': WHITE},
          'black-inverted': {'tile': BLACK, 'ink': WHITE}}     # light modules on the black tile, no panel: a kept option
FACE_DIR = os.path.join(PIECE, 'preview', 'face')
SAMPLE = 'HTTPS://XPOT.PLACE/Q/A7K3P9X2'              # the spec's sample code; never on a client piece
CX = SIZE / 2

TAP = {'icon_h': 7.0, 'cap': 4.8, 'gap': 2.4}
UFONTS = os.path.join(os.environ.get('LOCALAPPDATA', ''), 'Microsoft', 'Windows', 'Fonts')

# Menu title fonts. name: (file, upper case, tracking as a fraction of the cap height). SIL OFL only.
MENU_FONTS = {
    'Inria Serif Bold': ('InriaSerif-Bold.otf', False, 0.0),
    'Inria Serif Bold Italic': ('InriaSerif-BoldItalic.otf', False, 0.0),
    'Metropolis Medium, MENU spaced': ('Metropolis-Medium.otf', True, 0.30),
}
MENU_FONTS_STUDY = dict(MENU_FONTS, **{          # the first study's six, for --menu-fonts
    'Inter SemiBold, MENU spaced': ('Inter_24pt-SemiBold.ttf', True, 0.28),
    'Metropolis Bold': ('Metropolis-Bold.otf', False, 0.0),
    'Nunito Black (rounded)': ('NunitoW900.ttf', False, 0.0),
})
MENU_TITLE_CAP, MENU_TITLE_MAX_W = 16.4, 72.0


# A block is (height, draw(top) -> svg). Text blocks are cap-height tall, their baseline at the bottom.
# Art is drawn in BLACK and recoloured to the theme's ink afterwards; colours (G, stars, brands) are kept.
def text_block(s, cap):
    return cap, lambda top: small.text(s, cap, CX, top + cap)[0]


def g_block(size):
    return size, lambda top: small.g_logo(CX - size / 2, top, size)


def stars_block(size, gap):
    return size, lambda top: small.stars(CX, top + size / 2, size, gap, YELLOW)


IG_FILL = '#C837AB'     # the icon's square; render_gradient() paints the file's gradient through it
IG_BOXES = []           # (x, y, size) of every Instagram icon drawn, tile coordinates, for render_gradient()


def ig_block(size):
    """The full 2016 Instagram icon, as on the Stand's Instagram card (printed in PLA silk pink -> purple)."""
    def draw(top):
        IG_BOXES.append((CX - size / 2, top, size))
        return small.instagram_glyph(CX - size / 2, top, size, fill=IG_FILL)
    return size, draw


def brand_block(brand, max_w, h, theme='white'):
    theme = 'white' if theme == 'white' else 'black'
    return h, lambda top: pay.brand_logo(brand, CX, top + h / 2, max_w, h, theme)


def _font(fontfile):
    path = os.path.join(UFONTS, fontfile)
    return FontProperties(fname=path if os.path.exists(path) else os.path.join(r'C:\Windows\Fonts', fontfile))


def _path_d(tp, k, dx, base):
    d, i, v, codes = [], 0, tp.vertices, tp.codes
    pt = lambda q: '%.3f %.3f' % (dx + q[0] * k, base - q[1] * k)
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
    return ' '.join(d)


def title_block(word, font, cap=None, width=None):
    """`word` in a MENU_FONTS font, sized by cap height (or by ink width); letters spaced by the font's tracking."""
    fontfile, upper, tracking = MENU_FONTS_STUDY[font]
    prop = _font(fontfile)
    word = word.upper() if upper else word
    capref = TextPath((0, 0), 'H', size=100, prop=prop).get_extents().height
    glyphs = [TextPath((0, 0), ch, size=100, prop=prop) for ch in word] if tracking else \
        [TextPath((0, 0), word, size=100, prop=prop)]
    ext = [g.get_extents() for g in glyphs]
    natural = sum(e.width for e in ext) + tracking * capref * (len(glyphs) - 1)
    k = cap / capref if cap else width / natural
    if natural * k > MENU_TITLE_MAX_W:
        k = MENU_TITLE_MAX_W / natural
    cap, width = capref * k, natural * k

    def draw(top):
        x, base, ds = CX - width / 2, top + cap, []
        for g, e in zip(glyphs, ext):
            ds.append(_path_d(g, k, x - e.x0 * k, base))
            x += e.width * k + tracking * capref * k
        return '<path fill="%s" d="%s"/>' % (BLACK, ' '.join(ds))
    return cap, draw


def message(kind, brand=None, font=None, theme='white'):
    """The message group of a face: (blocks, gaps); the group is GROUP_H tall."""
    if kind == 'menu':
        title = title_block('Menu', font, cap=MENU_TITLE_CAP)
        sub = D['menu_sub']
        gap = GROUP_H - title[0] - sub if D.get('fill_group', True) else D['menu_gap']
        return [title, text_block('Scan or tap to view', sub)], [gap]
    if kind == 'google':
        return ([g_block(D['g']), text_block('Review us on Google', D['text']), stars_block(*D['stars'])],
                list(D['g_gaps']))
    if kind == 'instagram':
        # Stand layout "B" (user, 2026-10-01): icon + "Follow us on Instagram", nothing of the client. One line at
        # cap 4.5 is 69.5 mm: it fits the Large (87 mm between margins), not the Small (66), which takes two lines.
        if D.get('ig_lines', 1) == 1:
            return [ig_block(D['ig']), text_block('Follow us on Instagram', D['text'])], [D['ig_gap']]
        return ([ig_block(D['ig']), text_block('Follow us', D['text']), text_block('on Instagram', D['text'])],
                [D['ig_gap'], D['ig_line_gap']])
    if kind == 'instagram_short':       # Small option: one short line frees room for a bigger icon
        return [ig_block(D['ig_short']), text_block('Follow us', D['text'])], [D['ig_short_gap']]
    if kind == 'pay':
        bw, bh = D['brand']
        gap = GROUP_H - bh - D['pay'] if D.get('fill_group', True) else D['pay_gap']
        return [brand_block(brand, bw, bh, theme), text_block('Pay here', D['pay'])], [gap]
    raise KeyError(kind)


def face(kind, brand=None, font=None, theme='white', link=SAMPLE, guides=False):
    ink = THEMES[theme]['ink']
    tap_svg, _ = small.tap_row_mark(CX, MARGIN, TAP['icon_h'], TAP['cap'], TAP['gap'])
    tap_bottom = MARGIN + TAP['icon_h']
    qr_top = SIZE - MARGIN - QR_SIZE
    code, n, module = pay.qr(link, CX - QR_SIZE / 2, qr_top, QR_SIZE, D.get('qr_min', 1.0))
    quiet = 4 * module
    panel = ''
    msg_bottom_limit = qr_top
    if theme == 'black':     # dark modules on a white panel; its border is the (reduced) quiet zone
        border = D.get('panel_quiet', PANEL_QUIET) * module
        p = QR_SIZE + 2 * border
        panel = '<rect x="%.3f" y="%.3f" width="%.3f" height="%.3f" rx="%.2f" fill="%s"/>' % (
            CX - p / 2, qr_top - border, p, p, border * 0.6, WHITE)
        msg_bottom_limit = qr_top - border

    blocks, gaps = message(kind, brand, font, theme)
    group_h = sum(h for h, _ in blocks) + sum(gaps)
    # v3: every face's group is GROUP_H tall. The sized tiles (fill_group False) centre each face's own group, at
    # most GROUP_H tall, so a short Menu or Pay message does not open a hole inside itself.
    assert (abs(group_h - GROUP_H) < 0.05) if D.get('fill_group', True) else (group_h <= GROUP_H + 0.05), (kind, group_h)
    space = (msg_bottom_limit - tap_bottom - group_h) / 2
    if theme != 'black' and space < quiet:
        raise SystemExit('%s: %.2f mm above the QR, under its quiet zone (%.2f)' % (kind, space, quiet))
    art, y, marks = [tap_svg], tap_bottom + space, []
    for i, (h, draw) in enumerate(blocks):
        art.append(draw(y))
        marks.append((y, y + h))
        y += h + (gaps[i] if i < len(gaps) else 0)
    art = ''.join(art).replace(BLACK, ink)
    if theme == 'black-inverted':
        code = code.replace(BLACK, WHITE)
    out = art + panel + code
    if guides:
        out += guide_layer(tap_bottom, msg_bottom_limit, marks)
    return out, {'space': round(space, 2), 'module': round(module, 2)}


def guide_layer(tap_bottom, bottom, marks):
    c = '#00a3c4'
    g = ['<rect x="%g" y="%g" width="%g" height="%g" fill="none" stroke="%s" stroke-width="0.2" '
         'stroke-dasharray="1 1"/>' % (MARGIN, MARGIN, SIZE - 2 * MARGIN, SIZE - 2 * MARGIN, c),
         '<line x1="%g" y1="0" x2="%g" y2="%g" stroke="%s" stroke-width="0.2"/>' % (CX, CX, SIZE, c)]
    for y0, y1 in [(tap_bottom, marks[0][0]), (marks[-1][1], bottom)]:
        g.append('<rect x="4" y="%.3f" width="3" height="%.3f" fill="%s" opacity="0.35"/>' % (y0, y1 - y0, c))
    for y0, y1 in marks:
        g.append('<rect x="%g" y="%.3f" width="%g" height="%.3f" fill="%s" opacity="0.08"/>'
                 % (MARGIN, y0, SIZE - 2 * MARGIN, y1 - y0, c))
    return ''.join(g)


def tile(inner, theme='white'):
    return '<rect width="%g" height="%g" rx="%g" fill="%s" stroke="#c9c9c4" stroke-width="0.25"/>%s' % (
        SIZE, SIZE, RADIUS, THEMES[theme]['tile'], inner)


def sheet(options, cols=3):
    """options: [(label, inner, theme)], laid out in rows of `cols` on a wooden table."""
    pad, gap, label_h = 12.0, 14.0, 10.0
    rows = [options[i:i + cols] for i in range(0, len(options), cols)]
    row_h = SIZE + label_h + 6.0
    width = pad * 2 + cols * SIZE + (cols - 1) * gap
    height = pad * 2 + len(rows) * row_h - 6.0
    parts = ['<rect width="%g" height="%g" fill="#8a6a4f"/>' % (width, height)]
    for r, row in enumerate(rows):
        for i, (name, inner, theme, *_) in enumerate(row):
            ox, oy = pad + i * (SIZE + gap), pad + r * row_h
            parts.append('<g transform="translate(%.3f %.3f)">%s</g>' % (ox, oy, tile(inner, theme)))
            parts.append(small.text(name, 4.2, ox + SIZE / 2, oy + SIZE + 7.5, fill='#f2ece4')[0])
    return ('<svg xmlns="http://www.w3.org/2000/svg" width="%gmm" height="%gmm" viewBox="0 0 %g %g">%s</svg>'
            % (width, height, width, height, ''.join(parts)))


def render(svg, out):
    doc = fitz.open(stream=svg.encode('utf-8'), filetype='svg')
    doc[0].get_pixmap(matrix=fitz.Matrix(4.5, 4.5), alpha=False).save(out)
    print(out)


def render_gradient(options_fn, cols, out, zoom=4.5):
    """render() for sheets holding Instagram icons. MuPDF draws SVG gradients black, so the sheet is rendered twice
    with the icon's square black, then white (the camera stays white): the difference is the square's exact
    anti-aliased mask, and the file's gradient (face_composition.instagram_gradient) is painted through it.
    options_fn() must rebuild the options, so that IG_FILL is read again."""
    import numpy as np
    from PIL import Image
    global IG_FILL
    shots = []
    for fill in ('#000000', '#FFFFFF'):
        IG_FILL = fill
        del IG_BOXES[:]
        opts = options_fn()
        boxes = list(IG_BOXES)
        doc = fitz.open(stream=sheet(opts, cols).encode('utf-8'), filetype='svg')
        pix = doc[0].get_pixmap(matrix=fitz.Matrix(zoom, zoom), alpha=False)
        shots.append(np.frombuffer(pix.samples, np.uint8).reshape(pix.height, pix.width, 3).astype(float))
    IG_FILL = '#C837AB'
    dark, light = shots
    alpha = np.clip((light - dark).mean(axis=2) / 255.0, 0, 1)[..., None]
    k = zoom * 72 / 25.4
    pad, gap, label_h = 12.0, 14.0, 10.0
    row_h = SIZE + label_h + 6.0
    grad = light.copy()
    for i, (x, y, s) in enumerate(boxes):    # one icon per Instagram option, in option order
        idx = [j for j, o in enumerate(opts) if o[3]][i]
        r, c = divmod(idx, cols)
        x0, y0, sp = (pad + c * (SIZE + gap) + x) * k, (pad + r * row_h + y) * k, s * k
        r0, r1, c0, c1 = int(y0) - 2, int(y0 + sp) + 3, int(x0) - 2, int(x0 + sp) + 3
        yy, xx = np.mgrid[r0:r1, c0:c1]
        grad[r0:r1, c0:c1] = small.instagram_gradient((xx - x0) / sp, (yy - y0) / sp)
    img = light * (1 - alpha) + grad * alpha
    Image.fromarray(img.clip(0, 255).astype(np.uint8)).save(out)
    print(out)


def contrast(a, b):
    """WCAG contrast ratio of two '#rrggbb' colours."""
    def lum(h):
        c = [int(h[i:i + 2], 16) / 255 for i in (1, 3, 5)]
        c = [x / 12.92 if x <= 0.03928 else ((x + 0.055) / 1.055) ** 2.4 for x in c]
        return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]
    hi, lo = sorted((lum(a), lum(b)), reverse=True)
    return (hi + 0.05) / (lo + 0.05)


def thin_check(svg_inner, min_mm=0.5, px_per_mm=40):
    """Share of the ink thinner than `min_mm` (lost to an opening by a disk that wide)."""
    import cv2
    import numpy as np
    doc = fitz.open(stream=('<svg xmlns="http://www.w3.org/2000/svg" width="%gmm" height="%gmm" viewBox="0 0 %g %g">'
                            '<rect width="100%%" height="100%%" fill="white"/>%s</svg>'
                            % (SIZE, SIZE, SIZE, SIZE, svg_inner)).encode(), filetype='svg')
    pix = doc[0].get_pixmap(matrix=fitz.Matrix(px_per_mm * 25.4 / 72, px_per_mm * 25.4 / 72), alpha=False)
    img = np.frombuffer(pix.samples, np.uint8).reshape(pix.height, pix.width, pix.n)[..., 0]
    ink = (img < 128).astype(np.uint8)
    r = int(round(min_mm * px_per_mm / 2))
    k = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (2 * r + 1, 2 * r + 1))
    return 1 - cv2.morphologyEx(ink, cv2.MORPH_OPEN, k).sum() / max(ink.sum(), 1)


def font_study():
    """The first Menu font study: six OFL fonts, title 62 mm wide, group at its natural height."""
    options = []
    for name in ['Inter SemiBold, MENU spaced', 'Metropolis Bold', 'Inria Serif Bold', 'Inria Serif Bold Italic',
                 'Nunito Black (rounded)', 'Metropolis Medium, MENU spaced']:
        t = title_block('Menu', name, width=62.0)
        tap_svg, _ = small.tap_row_mark(CX, MARGIN, TAP['icon_h'], TAP['cap'], TAP['gap'])
        qr_top = SIZE - MARGIN - QR_SIZE
        code, _, _ = pay.qr(SAMPLE, CX - QR_SIZE / 2, qr_top, QR_SIZE)
        sub = text_block('Scan or tap to view', 4.6)
        space = (qr_top - MARGIN - TAP['icon_h'] - t[0] - 6.5 - sub[0]) / 2
        y = MARGIN + TAP['icon_h'] + space
        options.append((name, tap_svg + t[1](y) + sub[1](y + t[0] + 6.5) + code, 'white'))
        print('%-32s cap %.1f mm, ink under 0.5 mm %.1f %%' % (name, t[0], thin_check(t[1](20.0)) * 100))
    render(sheet(options), os.path.join(FACE_DIR, 'face-tile-menu-fonts.png'))


if __name__ == '__main__':
    os.makedirs(FACE_DIR, exist_ok=True)
    if '--menu-fonts' in sys.argv:
        font_study()
        sys.exit()
    if '--textures' in sys.argv:       # one square PNG per size x face, for the counter scene (NFC/scene/textures)
        from PIL import Image
        out_dir = os.path.join(REPO, 'nfc', 'scene', 'textures')
        tmp = os.path.join(out_dir, '_sheet.png')
        for key, theme in (('large', 'white'), ('small', 'white'), ('large', 'black'), ('small', 'black')):
            configure(key)
            for slug, kind, brand, font in (('menu', 'menu', None, 'Inria Serif Bold'), ('google', 'google', None, None),
                                            ('instagram', 'instagram', None, None), ('venmo', 'pay', 'venmo', None)):
                # black (user, 2026-10-10: "the stands and plates need black versions too"): the dark modules on a
                # white panel, which every phone reads, not the inverted QR
                one = lambda: [('Plate', face(kind, brand, font, theme)[0], theme, kind == 'instagram')]
                render_gradient(one, 1, tmp, zoom=12)
                im = Image.open(tmp)
                k = 12 * 72 / 25.4
                im = im.crop((int(12 * k), int(12 * k), int((12 + SIZE) * k), int((12 + SIZE) * k)))
                path = os.path.join(out_dir, 'plate-%s-%s%s.png' % (key, slug, '' if theme == 'white' else '-' + theme))
                im.resize((2048, 2048), Image.LANCZOS).save(path)
                print(path)
        os.remove(tmp)
        sys.exit()
    if '--sizes' in sys.argv:          # the Small and Large tiles, the faces that will be built
        FACES = (('Menu', 'menu', None, 'Inria Serif Bold'), ('Google Review', 'google', None, None),
                 ('Instagram', 'instagram', None, None), ('Pay - Venmo', 'pay', 'venmo', None))
        for key in ('large', 'small'):
            configure(key)
            for theme in ('white', 'black'):
                def options(report=False):
                    out = []
                    faces = FACES + ((('Instagram, short line', 'instagram_short', None, None),) if 'ig_short' in D else ())
                    for name, kind, brand, font in faces:
                        inner, info = face(kind, brand, font, theme)
                        out.append(('%s %g mm - %s' % (key.title(), SIZE, name), inner, theme, kind.startswith('instagram')))
                        if report:
                            print('%-5s %-5s %-14s space %.2f mm, QR module %.2f mm, thin %.1f%%' % (
                                key, theme, name, info['space'], info['module'], 100 * thin_check(inner)))
                    return out
                options(report=True)
                render_gradient(lambda: options(), 5 if 'ig_short' in D else 4, os.path.join(FACE_DIR, 'face-tile-%s-%s.png' % (key, theme)))
        sys.exit()
    cases = [('Menu - Inria Serif Bold', 'menu', None, 'Inria Serif Bold'),
             ('Menu - Inria Serif Italic', 'menu', None, 'Inria Serif Bold Italic'),
             ('Menu - Metropolis spaced', 'menu', None, 'Metropolis Medium, MENU spaced'),
             ('Google Review', 'google', None, None),
             ('Pay - Venmo', 'pay', 'venmo', None),
             ('Pay - Zelle', 'pay', 'zelle', None)]
    for theme in ('white', 'black', 'black-inverted'):
        for guides in (False, True):
            options = []
            for name, kind, brand, font in cases:
                inner, info = face(kind, brand, font, theme, guides=guides)
                options.append((name, inner, theme))
                if not guides:
                    print('%-5s %-26s space %.2f mm, QR module %.2f mm' % (theme, name, info['space'], info['module']))
            render(sheet(options), os.path.join(FACE_DIR, 'face-tile-study-v3-%s%s.png'
                                                % (theme, '-guides' if guides else '')))
    # Pay faces with the real logos, in the three tile versions
    for theme in ('white', 'black', 'black-inverted'):
        opts = [('Pay - %s' % n, face('pay', b, None, theme)[0], theme)
                for n, b in (('Venmo', 'venmo'), ('Zelle', 'zelle'), ('Cash App', 'cashapp'), ('PayPal', 'paypal'))]
        render(sheet(opts, cols=4), os.path.join(FACE_DIR, 'face-tile-pay-logos-%s.png' % theme))
    # Inverted QR beside the panel, to scan from the screen with real phones (sample code -> Xpot holding page)
    inv = [(label, face('menu', None, 'Inria Serif Bold', th)[0], th) for label, th in
           (('QR on white panel, border 2 modules', 'black'), ('QR inverted', 'black-inverted'))]
    render(sheet(inv, cols=2), os.path.join(FACE_DIR, 'face-tile-qr-inverted-test.png'))
    for b, v in sorted(pay.BRANDS.items()):
        print('contrast %-8s %s on white %.1f, on black %.1f' % (b, v['fill'], contrast(v['fill'], WHITE),
                                                                 contrast(v['fill'], BLACK)))
