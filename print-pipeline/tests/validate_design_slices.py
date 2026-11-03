"""Offline acceptance of full printer plates. No live serials, stock changes or printer connection.

python print-pipeline/tests/validate_design_slices.py --out .cache/plaque-slices
"""
from pathlib import Path
from concurrent.futures import ProcessPoolExecutor, as_completed
import argparse
import copy
import json
import sys

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))


def check(case):
    from pipeline import build_order
    m, mount, folder = case
    v = copy.deepcopy(m['version'])
    variant = v['nfcVariants'][mount]
    v['params']['nfc_mount'] = mount
    v['recipe']['pause_top_z'] = variant['pause']['z']
    v.update(version=1, bed={**v['beds'][0], 'pause': variant['pause']})
    tags = [dict(serial_number=f'{i:03}', public_code=f'TEST{i:04}', qr_url=f'https://xpot.place/q/TEST{i:04}',
                 nfc_url=f'https://xpot.place/n/TEST{i:04}', position=v['bed']['positions'][i-1]) for i in range(1, v['bed']['copies']+1)]
    ticket = dict(job={'id': 'TEST-ONLY'}, model=m, version=v, batch={'batchCode': 'TEST-ONLY'}, tags=tags)
    name = m['slug'] + '-' + mount
    try:
        report = build_order(ticket, Path(folder) / name, do_slice=True, log=lambda _: None)
        return dict(model=m['slug'], mount=mount, ok=True, qr=report['qr_check'], pause=report['pause_z'], minutes=report['minutes'])
    except Exception as error:
        return dict(model=m['slug'], mount=mount, ok=False, error=str(error))


if __name__ == '__main__':
    from catalog.design_catalog import entries
    from builders import nfc_mounts as nfc
    parser = argparse.ArgumentParser()
    parser.add_argument('--out', default='.cache/plaque-slices')
    args = parser.parse_args()
    models = {m['slug']: m for m in entries()}
    slugs = ['stand-large-menu-white-rounded', 'stand-small-cashapp-black', 'plate-large-yelp-black', 'plate-small-wifi-white']
    results = []
    with ProcessPoolExecutor(max_workers=2) as pool:
        tasks = [pool.submit(check, (models[slug], mount, args.out)) for slug in slugs for mount in nfc.NFC_MOUNTS]
        for task in as_completed(tasks):
            result = task.result()
            results.append(result)
            print(json.dumps(result), flush=True)
    path = Path(args.out) / 'validation.json'
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(results, indent=2), encoding='utf-8')
    print(f'{sum(r["ok"] for r in results)}/{len(results)} full printer plates passed', flush=True)
    sys.exit(0 if all(r['ok'] for r in results) else 1)
