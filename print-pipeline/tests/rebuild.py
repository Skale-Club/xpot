"""Rebuild a batch that the 3D Printing repo already built and compare: the acceptance check of the port.

    python tests/rebuild.py <batch-code> <model-slug> <production-dir> [--no-slice] [--out DIR] [--set key=value ...]

<production-dir> is the batch's folder in the 3D Printing repo (NFC Signs/<Plate|Stand>/production/<BATCH>), whose
manifest.csv gives the codes and whose mesh/<serial>/*.stl are the meshes the original scripts wrote. The model's
v1 comes from catalog/catalog.json. Every STL must come out byte-identical; the slice time is printed to compare
with the catalog's bed minutes. `--set wall_loops=4` changes a slicer setting of the recipe first (a version 2 that is
only a recipe change: the meshes must still be identical). Needs the Windows fonts the faces use and, unless
--no-slice, Bambu Studio.
"""
from __future__ import annotations

import argparse
import csv
import filecmp
import json
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
from pipeline import build_order  # noqa: E402


def ticket_for(batch: str, slug: str, production: Path, settings: dict | None = None) -> dict:
    catalog = json.loads((ROOT / 'catalog' / 'catalog.json').read_text(encoding='utf-8'))
    model = next(m for m in catalog['models'] if m['slug'] == slug)
    version = model['version']
    if settings:
        version['recipe']['settings'].update(settings)
    bed = version['beds'][0]
    with (production / 'manifest.csv').open(newline='', encoding='utf-8-sig') as f:
        rows = sorted(csv.DictReader(f), key=lambda r: int(r['serial_number']))
    positions = bed.get('positions') or []
    tags = [{'serial_number': r['serial_number'].zfill(3), 'public_code': r['public_code'], 'qr_url': r['qr_url'],
             'nfc_url': r['nfc_url'], 'position': positions[i % len(positions)] if positions else None}
            for i, r in enumerate(rows)]
    return {
        'job': {'id': f'rebuild-{batch}', 'status': 'building', 'plates': 1, 'quantity': len(tags), 'notes': None},
        'model': {'slug': slug, 'title': model['title'], 'kind': 'serialized', 'productType': model['productType'],
                  'face': model['face'], 'theme': model['theme']},
        'version': {'id': 'catalog', 'version': 1, 'builder': version['builder'], 'params': version['params'],
                    'recipe': version['recipe'], 'bed': bed},
        'batch': {'id': batch, 'batchCode': batch},
        'tags': tags,
    }


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('batch')
    ap.add_argument('slug')
    ap.add_argument('production', type=Path)
    ap.add_argument('--no-slice', action='store_true')
    ap.add_argument('--out', type=Path)
    ap.add_argument('--set', action='append', default=[], metavar='KEY=VALUE', help='a slicer setting of the recipe')
    a = ap.parse_args()
    out = a.out or Path(tempfile.mkdtemp(prefix=f'rebuild-{a.batch}-'))
    settings = dict(item.split('=', 1) for item in a.set)
    report = build_order(ticket_for(a.batch, a.slug, a.production, settings), out, do_slice=not a.no_slice)
    same, differ, missing = 0, [], []
    for original in sorted((a.production / 'mesh').glob('*/*.stl')):
        rebuilt = out / 'mesh' / original.parent.name / original.name
        if not rebuilt.exists():
            missing.append(str(original.relative_to(a.production)))
        elif filecmp.cmp(original, rebuilt, shallow=False):
            same += 1
        else:
            differ.append(str(original.relative_to(a.production)))
    print(json.dumps({'batch': a.batch, 'out': str(out), 'identical_meshes': same, 'different': differ, 'missing': missing,
                      'minutes': report.get('minutes'), 'swaps': report.get('swaps'), 'grams': report.get('grams'),
                      'qr_check': report.get('qr_check'), 'pause_z': report.get('pause_z')}, indent=1))
    sys.exit(1 if differ or missing else 0)


if __name__ == '__main__':
    main()
