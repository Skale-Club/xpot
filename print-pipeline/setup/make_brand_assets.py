"""Xpot Desktop's brand images, all from the app's own mark (client/public/pwa/icon-512.png).

    python print-pipeline/setup/make_brand_assets.py      (needs Pillow; run again when the mark changes)

Writes:
  setup/xpot.ico                 the installer, its Startup shortcut and its entry in Apps & features
  setup/wizard-small.bmp         the mark at the top right of the installer's pages
  setup/wizard-large.bmp         the panel on the installer's last page
  desktop.py (BRAND block)       the tray icon's pixels at 16, 20, 24 and 32 px, so desktop.py stays one file that
                                 updates itself; the status badge is drawn on top of them at run time
"""
import base64
import os
import re
import sys

from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
PIPELINE = os.path.dirname(HERE)
REPO = os.path.dirname(PIPELINE)
MARK = os.path.join(REPO, 'client', 'public', 'pwa', 'icon-512.png')
BACKGROUND = (10, 14, 24)  # the mark's own dark square
TRAY_SIZES = (16, 20, 24, 32)


def mark(size):
    return Image.open(MARK).convert('RGBA').resize((size, size), Image.LANCZOS)


def bgra_bottom_up(image):
    """Raw pixels the way an .ico's bitmap holds them."""
    rows = []
    for y in range(image.height - 1, -1, -1):
        for x in range(image.width):
            r, g, b, a = image.getpixel((x, y))
            rows.append(bytes((b, g, r, a)))
    return b''.join(rows)


def panel(width, height, logo):
    image = Image.new('RGB', (width, height), BACKGROUND)
    icon = mark(logo)
    image.paste(icon, ((width - logo) // 2, (height - logo) // 2), icon)
    return image


def main():
    source = Image.open(MARK).convert('RGBA')
    source.save(os.path.join(HERE, 'xpot.ico'), sizes=[(s, s) for s in (16, 20, 24, 32, 40, 48, 64, 256)])
    panel(55, 55, 55).save(os.path.join(HERE, 'wizard-small.bmp'))
    panel(164, 314, 112).save(os.path.join(HERE, 'wizard-large.bmp'))

    lines = ['# BRAND (print-pipeline/setup/make_brand_assets.py writes this block): the Xpot mark for the tray icon,',
             '# raw BGRA bottom-up pixels by size, base64.', 'XPOT_MARK = {']
    for size in TRAY_SIZES:
        data = base64.b64encode(bgra_bottom_up(mark(size))).decode('ascii')
        chunks = [data[i:i + 110] for i in range(0, len(data), 110)]
        lines.append(f'    {size}: (')
        lines += [f"        '{chunk}'" for chunk in chunks]
        lines.append('    ),')
    lines.append('}')
    lines.append('# /BRAND')
    path = os.path.join(PIPELINE, 'desktop.py')
    with open(path, encoding='utf-8', newline='') as f:
        source_code = f.read()
    block = ('\r\n' if '\r\n' in source_code else '\n').join(lines)  # the file's own line endings
    pattern = re.compile(r'# BRAND \(print-pipeline.*?# /BRAND', re.S)
    if not pattern.search(source_code):
        sys.exit('desktop.py has no BRAND block')
    with open(path, 'w', encoding='utf-8', newline='') as f:
        f.write(pattern.sub(lambda _m: block, source_code))
    print('Done: xpot.ico, wizard-small.bmp, wizard-large.bmp, desktop.py BRAND block')


if __name__ == '__main__':
    main()
