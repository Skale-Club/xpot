"""Decode every QR printed on layer 1 of a sliced plate and check it against the object it belongs to.

    python gcode-qr-check.py <slice output dir> [--face-up] [--png out.png]
                              [--ignore-object-regex REGEX]

The slice output dir is what `bambu-studio --slice 0 --outputdir <dir>` wrote: `plate_1.gcode` + `result.json`.
Each object of `result.json` is one piece; its name must end in its code (the NFC builders name copies
`<BATCH> #<serial> <CODE>`). For every object, the layer-1 extrusions inside its footprint are rasterised per tool,
mirrored for a face-down print (the face is on the bed), and decoded with OpenCV; the tool whose drawing decodes is
the QR's. The decoded URL must end in `/Q/<CODE>` (case-insensitive) for that object, else the run fails (exit 1).

Promoted from the scratch tool of LPLATE-2026-002 (2026-10-10). It reads Bambu G-code: layers by `; Z_HEIGHT:`, the
active filament by `M620 S<n>A` (the AMS select) and `T<n>` (T255 / T1000 are not filaments).
"""
import argparse
import json
import os
import re
import sys

import cv2
import numpy as np

CODE_AT_END = re.compile(r'([0-9A-HJKMNP-TV-Z]{8,10})\s*$')


def layer_one_segments(gcode_path):
    """{tool: [(x0, y0, x1, y1), ...]} of the extruding moves on the first layer."""
    segs, x, y, tool, layer = {}, 0.0, 0.0, 0, None
    first_z = None
    with open(gcode_path, encoding='utf-8', errors='replace') as f:
        for line in f:
            if line.startswith('; Z_HEIGHT:'):
                z = round(float(line.split(':')[1]), 3)
                if first_z is None:
                    first_z = z
                elif z > first_z + 1e-6:
                    break
                layer = z
                continue
            m = re.match(r'^M620 S(\d+)A', line) or re.match(r'^T(\d+)\s*$', line)
            if m:
                n = int(m.group(1))
                if n < 255:
                    tool = n
                continue
            if layer is None or not line.startswith(('G1 ', 'G0 ', 'G2 ', 'G3 ')):
                continue
            nx, ny, e = x, y, 0.0
            for k, v in re.findall(r'([XYE])(-?[\d.]+)', line.split(';')[0]):
                if k == 'X':
                    nx = float(v)
                elif k == 'Y':
                    ny = float(v)
                else:
                    e = float(v)
            if e > 0 and (nx, ny) != (x, y):
                segs.setdefault(tool, []).append((x, y, nx, ny))
            x, y = nx, ny
    return segs


def rasterise(segs, box, mirror, px_per_mm=12, line_mm=0.42, margin_px=100):
    x0, y0, x1, y1 = box
    w, h = int((x1 - x0) * px_per_mm) + 2 * margin_px, int((y1 - y0) * px_per_mm) + 2 * margin_px
    img = np.full((h, w), 255, np.uint8)
    p = lambda X, Y: (int((X - x0) * px_per_mm) + margin_px, h - (int((Y - y0) * px_per_mm) + margin_px))
    width = max(1, int(line_mm * px_per_mm))
    for ax, ay, bx, by in segs:
        if x0 <= ax <= x1 and y0 <= ay <= y1:
            cv2.line(img, p(ax, ay), p(bx, by), 0, width)
    return cv2.flip(img, 1) if mirror else img


def main():
    ap = argparse.ArgumentParser(description=__doc__.split('\n')[0])
    ap.add_argument('outdir')
    ap.add_argument('--face-up', action='store_true', help='the QR is on top, not on the bed: do not mirror')
    ap.add_argument('--png', help='write the layer-1 drawing of every tool here')
    ap.add_argument('--ignore-object-regex', help='skip auxiliary objects whose name matches this regex')
    a = ap.parse_args()
    result = json.load(open(os.path.join(a.outdir, 'result.json'), encoding='utf-8'))
    objects = result['sliced_plates'][0].get('objects', [])
    if not objects:
        sys.exit('no objects in result.json')
    segs = layer_one_segments(os.path.join(a.outdir, 'plate_1.gcode'))
    det = cv2.QRCodeDetector()
    ignore = re.compile(a.ignore_object_regex, re.I) if a.ignore_object_regex else None
    failures = 0
    checked = 0
    for o in objects:
        if ignore and ignore.search(o['name']):
            print('SKIP  %-40s  auxiliary object' % o['name'])
            continue
        checked += 1
        b = o['bbox'] if 'bbox' in o else o
        box = (b['x'], b['y'], b['x'] + b['width'], b['y'] + b['depth'])
        want = CODE_AT_END.search(o['name'])
        found = None
        for tool in sorted(segs):
            text = det.detectAndDecode(rasterise(segs[tool], box, not a.face_up))[0]
            if text:
                found = (tool, text)
                break
        ok = bool(want and found and found[1].upper().endswith('/Q/' + want.group(1)))
        failures += 0 if ok else 1
        print('%s  %-40s  %s' % ('OK  ' if ok else 'FAIL', o['name'],
                                 'T%d %s' % found if found else 'no QR decoded'))
    if a.png:
        import matplotlib
        matplotlib.use('Agg')
        import matplotlib.pyplot as plt
        fig, ax = plt.subplots(figsize=(9, 9))
        for tool, ss in segs.items():
            arr = np.array(ss)
            ax.plot(arr[:, [0, 2]].T, arr[:, [1, 3]].T, lw=0.3, color='C%d' % tool)
        ax.set_aspect('equal')
        ax.set_title('layer 1')
        fig.savefig(a.png, dpi=150)
    if not checked:
        sys.exit('no objects left to check')
    print('%d of %d checked objects decoded to their own code' % (checked - failures, checked))
    sys.exit(1 if failures else 0)


if __name__ == '__main__':
    main()
