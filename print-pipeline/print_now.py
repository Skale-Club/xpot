"""The Print Now folder: the plates to print, organized by request and status, kept in step with Xpot by the bench.

    <folder>/Para imprimir/<request>/<plate files>     plates ready to print (download, open in Bambu Studio, print)
    <folder>/Impressos/<request>/<plate files>         plates marked printed in Xpot in the last 14 days

    <request> = "2026-10-22 15h53 - Stand Large - Instagram - Black - 10 un"
    <plate>   = "IG-2026-004 - placa 1 de 3 - 4 un.3mf"  (the Bambu Studio project) and ".gcode.3mf" (sliced and checked)

Xpot says which plates belong (GET /api/provisioner/print-now); sync() downloads what is missing, moves a plate to
Impressos when it is marked printed, and removes what no longer belongs (cancelled, failed, printed long ago). It only
ever touches the files it wrote itself, listed in <folder>/.xpot-print-now.json: anything else in the folder is left
alone. Standard library only.
"""
from __future__ import annotations

import hashlib
import json
import os
import re
from datetime import datetime

TO_PRINT = 'Para imprimir'
PRINTED = 'Impressos'
MANIFEST = '.xpot-print-now.json'


def _safe(text: str) -> str:
    text = text.replace('·', '-')
    text = re.sub(r'[<>:"/\\|?*\x00-\x1f]+', ' ', text)
    return re.sub(r'\s+', ' ', text).strip(' .')[:120] or 'plate'


def request_folder(plate: dict, tz=None) -> str:
    """One folder per request: when it was asked, what, how many."""
    created = datetime.fromisoformat(plate['requestCreatedAt'].replace('Z', '+00:00'))
    created = created.astimezone(tz) if tz else created.astimezone()
    return _safe(f"{created:%Y-%m-%d %Hh%M} - {plate['modelTitle']} - {plate['requestQuantity']} un")


def plate_file(plate: dict, kind: str) -> str:
    """The plate's name in its folder: batch, its place in the request and its pieces."""
    head = plate.get('batchCode') or 'Placa'
    ext = '.gcode.3mf' if kind == 'gcode_3mf' else '.3mf'
    return _safe(f"{head} - placa {plate['plateNumber']} de {plate['plateCount']} - {plate['quantity']} un") + ext


def layout(plates: list, tz=None) -> dict:
    """relative path -> (plate, file) for everything the folder should hold."""
    out = {}
    for plate in plates:
        status_dir = PRINTED if plate['status'] == 'printed' else TO_PRINT
        folder = request_folder(plate, tz)
        for f in plate.get('files') or []:
            if f['kind'] not in ('3mf', 'gcode_3mf'):
                continue
            out[os.path.join(status_dir, folder, plate_file(plate, f['kind']))] = (plate, f)
    return out


def _load_manifest(root: str) -> dict:
    try:
        with open(os.path.join(root, MANIFEST), encoding='utf-8') as fh:
            data = json.load(fh)
        return data.get('files') or {}
    except (OSError, ValueError):
        return {}


def _save_manifest(root: str, files: dict) -> None:
    path = os.path.join(root, MANIFEST)
    tmp = path + '.tmp'
    with open(tmp, 'w', encoding='utf-8') as fh:
        json.dump({'files': files}, fh, indent=1, ensure_ascii=False)
    os.replace(tmp, path)


def _ours(root: str, rel: str, entry: dict) -> bool:
    """The file is still the one we wrote (same size): safe to move or delete."""
    full = os.path.join(root, rel)
    return os.path.isfile(full) and os.path.getsize(full) == entry.get('bytes')


def _prune_empty(root: str) -> None:
    for status_dir in (TO_PRINT, PRINTED):
        base = os.path.join(root, status_dir)
        if not os.path.isdir(base):
            continue
        for name in os.listdir(base):
            folder = os.path.join(base, name)
            if os.path.isdir(folder) and not os.listdir(folder):
                os.rmdir(folder)


def sync(root: str, plates: list, fetch, log=print, tz=None) -> dict:
    """Make the folder hold exactly the plates Xpot listed. `fetch(url) -> bytes`. Returns what changed."""
    os.makedirs(root, exist_ok=True)
    want = layout(plates, tz)
    have = _load_manifest(root)
    done = {'added': 0, 'moved': 0, 'removed': 0, 'kept': 0}
    by_file = {entry.get('file'): rel for rel, entry in have.items() if _ours(root, rel, entry)}
    kept = {}

    for rel, (plate, f) in want.items():
        entry = {'plate': plate['id'], 'file': f['id'], 'sha256': f['sha256'], 'bytes': f['bytes']}
        full = os.path.join(root, rel)
        old = have.get(rel)
        if old and old.get('file') == f['id'] and _ours(root, rel, old):
            kept[rel] = entry
            done['kept'] += 1
            continue
        os.makedirs(os.path.dirname(full), exist_ok=True)
        src = by_file.get(f['id'])
        if src and src != rel and os.path.isfile(os.path.join(root, src)):
            os.replace(os.path.join(root, src), full)
            by_file.pop(f['id'], None)
            log(f'  moved {rel}')
            done['moved'] += 1
        else:
            data = fetch(f['url'])
            if hashlib.sha256(data).hexdigest() != f['sha256']:
                raise ValueError(f'{f["filename"]}: the download does not match its checksum')
            tmp = full + '.part'
            with open(tmp, 'wb') as fh:
                fh.write(data)
            os.replace(tmp, full)
            log(f'  added {rel}')
            done['added'] += 1
        kept[rel] = entry

    for rel, entry in have.items():
        if rel in kept:
            continue
        if _ours(root, rel, entry):
            os.remove(os.path.join(root, rel))
            log(f'  removed {rel}')
            done['removed'] += 1
        # a file changed or deleted by hand is no longer ours: it is forgotten, never touched

    _prune_empty(root)
    _save_manifest(root, kept)
    return done
