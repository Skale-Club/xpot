"""Build one Xpot print order into files the A1 prints: per-code meshes, one .3mf per bed, the slice and its checks.

    from pipeline import build_order
    result = build_order(ticket, out_dir)          # ticket: what POST /api/provisioner/print-jobs/claim returned

For each bed of the order (an order of `plates` beds prints `copies` codes per bed):
  1. the builder writes every piece's meshes into <out>/mesh/<serial>/ (builders/__init__.py);
  2. the version's recipe, with one part per mesh and one copy per piece at the bed's slots, becomes
     <out>/plate-<n>/build.json, and library/scripts/build-3mf-from-fusion.py turns it into the .3mf;
  3. Bambu Studio slices it offline (no account); the result must say Success with no warning;
  4. gcode-qr-check.py decodes every QR from layer 1 of the G-code and checks it is that copy's own code, and
     gcode-verify.py must show the pause before the first bridge over the chip pockets when the bed has a pause.
Any failure raises BuildFailed: nothing is attached to the order and the bench reports why.

Out: <out>/<name>.3mf per bed, the sliced <name>.gcode.3mf when the slicer exported it, serial-map.csv,
report.json and the meshes. Same steps as the 3D Printing repo's NFC Signs/tools/nfc_batch.py, for every builder.
"""
from __future__ import annotations

import copy
import csv
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent
SCRIPTS = ROOT / 'library' / 'scripts'
BUILD_3MF = SCRIPTS / 'build-3mf-from-fusion.py'
DEFAULT_STUDIO = r'C:\Program Files\Bambu Studio\bambu-studio.exe'
PAUSE_RE = re.compile(r'pause\s*:\s*M400 U1 .*?layer z ([\d.]+); first Bridge on that layer at line \d+, after the pause')


class BuildFailed(Exception):
    """The order cannot become a print file; the message says why, for the order's error."""


def studio_path() -> str:
    return os.environ.get('XPOT_BAMBU_STUDIO') or DEFAULT_STUDIO


def safe_name(text: str) -> str:
    return re.sub(r'[^A-Za-z0-9._ -]+', '', text).strip()[:150] or 'print'


def _run(cmd, what, **kw):
    r = subprocess.run(cmd, capture_output=True, text=True, **kw)
    if r.returncode != 0:
        raise BuildFailed(f'{what} failed ({r.returncode}): {(r.stderr or r.stdout).strip()[-600:]}')
    return r


def bed_recipe(ticket: dict, chunk: list, mesh_parts: dict, plate_no: int, plates: int) -> dict:
    """The version's recipe with this bed's parts and copies."""
    version, model = ticket['version'], ticket['model']
    bed = version['bed']
    slots = bed.get('slots') or []
    if len(slots) != bed['copies']:
        raise BuildFailed(f"bed {bed['label']} has {len(slots)} slots for {bed['copies']} copies: the version needs its slots")
    batch = (ticket.get('batch') or {}).get('batchCode') or 'ORDER'
    cfg = {k: copy.deepcopy(v) for k, v in version['recipe'].items() if k not in ('parts', 'copies')}
    cfg['name'] = f"{batch} {model['title']} v{version['version']}" + (f' plate {plate_no} of {plates}' if plates > 1 else '')
    cfg['_batch'] = f"{batch}, Xpot order {ticket['job']['id']}"
    cfg['parts'], cfg['copies'] = [], []
    for i, tag in enumerate(chunk):
        serial, code = tag['serial_number'], tag['public_code']
        names = []
        for label, filename, extruder in mesh_parts[serial]:
            name = f'{label} {serial}'
            cfg['parts'].append({'name': name, 'stl': f'{serial}/{filename}', 'extruder': extruder})
            names.append(name)
        slot = slots[i]
        entry = {'name': f'{batch} #{serial} {code}', 'parts': names, 'offset': list(slot['offset'])}
        if slot.get('rotation'):
            entry['rotation_z_deg'] = slot['rotation']
        cfg['copies'].append(entry)
    return cfg


def slice_and_check(three_mf: Path, work: Path, face_up: bool, expect_pause: bool, export_name: str | None) -> dict:
    """Slice offline and run the checks. Returns the numbers of the slice."""
    studio = studio_path()
    if not os.path.exists(studio):
        raise BuildFailed(f'Bambu Studio not found at {studio} (set XPOT_BAMBU_STUDIO)')
    outdir = work / 'slice'
    outdir.mkdir(parents=True, exist_ok=True)
    datadir = work / 'datadir'          # an empty profile folder: no account, no session (doc 02, "proven offline")
    datadir.mkdir(exist_ok=True)
    cmd = [studio, '--datadir', str(datadir), '--slice', '0', '--outputdir', str(outdir)]
    if export_name:
        # A bare file name, written into the output folder: a full path makes the export fail (-13, "Failed exporting").
        cmd += ['--export-3mf', export_name]
    # The exe is a GUI-subsystem launcher: subprocess waits on the process handle; -13 can come with a valid slice.
    subprocess.run(cmd + [str(three_mf)], capture_output=True, timeout=3600)
    result_path = outdir / 'result.json'
    if not result_path.exists():
        raise BuildFailed('the slicer wrote no result.json: result unknown')
    result = json.loads(result_path.read_text(encoding='utf-8'))
    plate = result['sliced_plates'][0]
    if not str(result.get('error_string', '')).startswith('Success') or plate.get('warning_message'):
        raise BuildFailed(f"slice not clean: {result.get('error_string')!r} {plate.get('warning_message')!r}")
    qr_cmd = [sys.executable, str(SCRIPTS / 'gcode-qr-check.py'), str(outdir)] + (['--face-up'] if face_up else [])
    qr = subprocess.run(qr_cmd, capture_output=True, text=True)
    qr_line = (qr.stdout.strip().splitlines() or [''])[-1]
    if qr.returncode:
        raise BuildFailed(f'a QR on layer 1 does not decode to its own code: {qr.stdout.strip()[-600:]}')
    verify = subprocess.run([sys.executable, str(SCRIPTS / 'gcode-verify.py'), str(outdir)], capture_output=True, text=True)
    pause = PAUSE_RE.search(verify.stdout)
    if expect_pause and not pause:
        raise BuildFailed('no pause before the first bridge over the chip pockets:\n' + verify.stdout[-1200:])
    checked = re.search(r'(\d+) of (\d+) checked objects decoded', qr_line)
    return {
        'minutes': round(plate['total_predication'] / 60, 1),
        'swaps': plate['filament_change_times'],
        'grams': [round(f['total_used_g'], 2) for f in plate['filaments']],
        'pause_z': float(pause.group(1)) if pause else None,
        'qr_check': f'{checked.group(1)}/{checked.group(2)}' if checked else qr_line,
        'exported': bool(export_name and (outdir / export_name).exists()),
    }


def build_order(ticket: dict, out_dir, do_slice: bool = True, log=print) -> dict:
    """Build every bed of an order into out_dir. Returns the report (also written to report.json)."""
    sys.path.insert(0, str(ROOT))
    from builders import BuildError, build_piece

    version, model = ticket['version'], ticket['model']
    builder = version.get('builder')
    if not builder:
        raise BuildFailed("this version has no builder: its file is uploaded by hand (a part's fixed file, or a design not ported yet)")
    bed = version['bed']
    tags = ticket.get('tags') or []
    if not tags:
        raise BuildFailed('the order has no codes')
    copies = bed['copies']
    batch = (ticket.get('batch') or {}).get('batchCode') or 'ORDER'
    out = Path(out_dir)
    mesh_root = out / 'mesh'
    mesh_root.mkdir(parents=True, exist_ok=True)
    chunks = [tags[i:i + copies] for i in range(0, len(tags), copies)]
    face_up = version['recipe'].get('orientation') == 'face-up'
    report = {'order': ticket['job']['id'], 'batch': batch, 'model': model['slug'], 'version': version['version'],
              'builder': builder, 'beds': [], 'pieces': []}

    mesh_parts = {}
    for index, tag in enumerate(tags):
        log(f"  building {tag['serial_number']} {tag['public_code']} ({builder})")
        try:
            piece_report, parts = build_piece(builder, tag, index, version.get('params') or {},
                                              mesh_root / tag['serial_number'], batch=batch)
        except BuildError as err:
            raise BuildFailed(str(err)) from err
        except RuntimeError as err:          # the generators raise this when their own geometry checks fail
            raise BuildFailed(f"{tag['public_code']}: the geometry check failed: {str(err)[:600]}") from err
        mesh_parts[tag['serial_number']] = parts
        report['pieces'].append({'serial': tag['serial_number'], 'code': tag['public_code'], 'ok': bool(piece_report.get('ok', True))})

    files = []
    for n, chunk in enumerate(chunks, 1):
        cfg = bed_recipe(ticket, chunk, mesh_parts, n, len(chunks))
        plate_dir = out / f'plate-{n}'
        plate_dir.mkdir(exist_ok=True)
        recipe_path = plate_dir / 'build.json'
        recipe_path.write_text(json.dumps(cfg, indent=1, ensure_ascii=False) + '\n', encoding='utf-8')
        suffix = f' plate {n}' if len(chunks) > 1 else ''
        name = safe_name(f"{batch} - {model['title'].replace('·', '-')} - v{version['version']}{suffix} - x{len(chunk)}")
        # Slicing needs short paths (Windows MAX_PATH): build and slice in a short temp folder, copy the results back.
        work = Path(tempfile.mkdtemp(prefix='xb-'))
        try:
            three_mf = work / 'plate.3mf'
            _run([sys.executable, str(BUILD_3MF), str(recipe_path), '--stl-dir', str(mesh_root), '--out', str(three_mf)], '3MF assembly')
            target = out / f'{name}.3mf'
            shutil.copyfile(three_mf, target)
            files.append(target)
            numbers = {}
            if do_slice:
                log(f'  slicing bed {n} of {len(chunks)}')
                numbers = slice_and_check(three_mf, work, face_up, bool(bed.get('pause')), 'plate.gcode.3mf')
                if not numbers.pop('exported'):
                    raise BuildFailed('the slicer did not export the sliced .gcode.3mf')
                sliced = out / f'{name}.gcode.3mf'
                shutil.copyfile(work / 'slice' / 'plate.gcode.3mf', sliced)
                files.append(sliced)
            report['beds'].append({'plate': n, 'file': target.name, 'codes': [t['public_code'] for t in chunk], **numbers})
        finally:
            shutil.rmtree(work, ignore_errors=True)

    serial_map = out / 'serial-map.csv'
    with serial_map.open('w', newline='', encoding='utf-8') as f:
        w = csv.writer(f)
        w.writerow(['plate', 'position', 'serial_number', 'public_code', 'qr_url', 'nfc_url'])
        for n, chunk in enumerate(chunks, 1):
            for tag in chunk:
                w.writerow([n, tag.get('position') or '', tag['serial_number'], tag['public_code'], tag['qr_url'], tag['nfc_url']])
    files.append(serial_map)

    beds = report['beds']
    if do_slice and beds:
        report['minutes'] = round(sum(b['minutes'] for b in beds), 1)
        report['swaps'] = sum(b['swaps'] for b in beds)
        report['grams'] = [round(sum(g), 2) for g in zip(*(b['grams'] for b in beds))] if len({len(b['grams']) for b in beds}) == 1 else None
        decoded = [b['qr_check'].split('/') for b in beds if '/' in b['qr_check']]
        report['qr_check'] = f'{sum(int(a) for a, _ in decoded)}/{sum(int(b) for _, b in decoded)}' if decoded else None
        report['pause_z'] = beds[0].get('pause_z')
    report['file'] = files[0].name
    report['slicer'] = 'bambu-studio offline' if do_slice else 'not sliced'
    report_path = out / 'report.json'
    report_path.write_text(json.dumps(report, indent=1) + '\n', encoding='utf-8')
    files.append(report_path)
    report['_files'] = [str(f) for f in files]
    return report
