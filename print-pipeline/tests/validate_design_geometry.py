"""Opt-in geometry integration audit (requires requirements.txt, never creates production data).

python print-pipeline/tests/validate_design_geometry.py --workers 4 --out .cache/plaque-geometry.json

Checks every distinct geometry: palette colours share a white/black contrast geometry. All services, all six
menu styles, all four physical products and all three NFC mounts are built with non-issued sample codes.
"""
from concurrent.futures import ProcessPoolExecutor, as_completed
from pathlib import Path
import argparse
import json
import sys
import tempfile
import time

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))


def check(case):
    from builders import build_piece
    builder, params = case
    code = 'A7K3P9X2'  # preview code, never issued
    tag = dict(public_code=code, serial_number='001', qr_url=f'https://xpot.place/q/{code}', nfc_url=f'https://xpot.place/n/{code}')
    try:
        with tempfile.TemporaryDirectory(prefix='xpot-geometry-') as folder:
            report, parts = build_piece(builder, tag, 0, params, folder, batch='PREVIEW')
            assert report.get('ok'), report
            decoded = report.get('qr_decoded_mesh')
            if not decoded and builder == 'stand.google' and params['size'] == 'large':
                import card_per_code_large as google
                import card_per_code_large_instagram as geom
                import face_art_large as large
                import trimesh
                large.configure()
                q = google.fc.resolve_version('google')['qr']
                section = geom.mesh_section_polygons(trimesh.load(Path(folder) / parts[1][1]), google.CARD_T - google.INLAY_D / 2)
                decoded = geom.decode_qr_polygons(section, q, tag['qr_url'].upper(), google.fc.CARD_H)
            assert decoded and decoded.upper() == tag['qr_url'].upper(), report
            assert all((Path(folder) / part[1]).is_file() for part in parts)
        return dict(builder=builder, params=params, ok=True)
    except Exception as error:
        return dict(builder=builder, params=params, ok=False, error=str(error))


if __name__ == '__main__':
    from catalog.design_catalog import entries
    from builders import nfc_mounts as nfc
    parser = argparse.ArgumentParser()
    parser.add_argument('--workers', type=int, default=4)
    parser.add_argument('--out', default='.cache/plaque-geometry.json')
    args = parser.parse_args()
    cases = {}
    for m in entries():
        v = m['version']
        for mount in nfc.NFC_MOUNTS:
            params = {**v['params'], 'nfc_mount': mount}
            key = json.dumps([v['builder'], params], sort_keys=True)
            cases[key] = (v['builder'], params)
    started, results = time.time(), []
    with ProcessPoolExecutor(max_workers=args.workers) as pool:
        tasks = [pool.submit(check, case) for case in cases.values()]
        for future in as_completed(tasks):
            result = future.result()
            results.append(result)
            if not result['ok']:
                print('FAIL ' + json.dumps(result), flush=True)
            if len(results) % 24 == 0:
                print(f'{len(results)}/{len(tasks)} checked; {sum(not r["ok"] for r in results)} failures', flush=True)
    out = Path(args.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(dict(seconds=round(time.time() - started), checked=len(results),
                                   passed=sum(r['ok'] for r in results), results=results), indent=2), encoding='utf-8')
    print(f'{sum(r["ok"] for r in results)}/{len(results)} geometries passed; report: {out}', flush=True)
    sys.exit(0 if all(r['ok'] for r in results) else 1)
