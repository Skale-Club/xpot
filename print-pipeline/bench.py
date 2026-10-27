"""Xpot Bench: this computer builds the plates asked for in Xpot into print files and keeps the Print Now folder.

    python bench.py pair <pairing-code> [--server https://xpot.place]
    python bench.py run [--interval 20]                    build plates as they are asked for and keep Print Now, forever
    python bench.py folder [PATH]                          the Print Now folder (shown without PATH)
    python bench.py sync                                   bring the Print Now folder up to date once
    python bench.py build <order-id> [--out DIR] [--no-slice]   build one plate now (claims it if needed)
    python bench.py doctor                                 Python packages, Bambu Studio and the fonts the faces need
    python bench.py ticket <order-id> [--out job.json]     take a plate and write what a build needs
    python bench.py attach <order-id> <file-or-dir>... [--report report.json] [--no-ready]
    python bench.py attach-bed <model-slug> <bed-label> <file>   a part's fixed print file, on its current version
    python bench.py fail <order-id> --message "why"
    python bench.py whoami

A request comes from Xpot (Tags > Production, or an AI session): N pieces of a model, split into plates of one bed
each, the last one partial. `build` and `run` do each plate's whole job: claim it, build it with pipeline.py (meshes per
code, .3mf, offline slice, QR check from the G-code), upload the files and mark it ready with the numbers, or failed
with the reason. `ticket`/`attach` are the manual halves of the same thing.

Nothing is sent to the printer. With a folder set, `run` keeps it as Xpot's list of plates (print_now.py): ready plates
in "Para imprimir/<request>/", printed ones in "Impressos/<request>/" for two weeks, the rest removed. Open a plate in
Bambu Studio, print it, and mark it printed in Xpot.

Pairing: Xpot > Tags > NFC writers > pair a computer gives a one-time code; this script trades it for a device token
paired as a print bench, saved in the user's profile (never in the repository). pair/ticket/attach need only the
standard library; build/run need requirements.txt and Bambu Studio (docs/PRINT_EXECUTION_PLAN.md s6-7).
"""
import argparse
import json
import os
import platform
import sys
import time
import traceback
import urllib.error
import urllib.parse
import urllib.request

PROTOCOL_HEADER = 'x-provisioner-protocol'
PROTOCOL_VERSION = '1'
APP_VERSION = 'bench-cli-3'
DEFAULT_SERVER = 'https://xpot.place'

KINDS = {
    '.gcode.3mf': 'gcode_3mf',
    '.3mf': '3mf',
    '.csv': 'serial_map',
    '.json': 'report',
    '.png': 'preview',
}

# The faces' fonts (Windows): the Stand and Plate text, and the approved Menu titles.
FONTS = ['segoeuib.ttf', 'segoeuiz.ttf', 'InriaSerif-Bold.otf', 'InriaSerif-BoldItalic.otf', 'Metropolis-Medium.otf']
PACKAGES = ['numpy', 'shapely', 'manifold3d', 'trimesh', 'matplotlib', 'fitz', 'segno', 'cv2', 'scipy', 'lxml', 'PIL']


class BenchHttpError(Exception):
    pass


def credentials_path():
    base = os.environ.get('LOCALAPPDATA') or os.path.join(os.path.expanduser('~'), '.config')
    return os.path.join(base, 'XpotBench', 'credentials.json')


def settings_path():
    return os.path.join(os.path.dirname(credentials_path()), 'settings.json')


def load_settings():
    try:
        with open(settings_path(), encoding='utf-8') as f:
            return json.load(f)
    except (OSError, ValueError):
        return {}


def save_settings(settings):
    path = settings_path()
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, 'w', encoding='utf-8') as f:
        json.dump(settings, f, indent=2)
    return path


def work_root():
    base = os.environ.get('LOCALAPPDATA') or os.path.join(os.path.expanduser('~'), '.cache')
    return os.path.join(base, 'XpotBench', 'work')


def load_credentials():
    path = credentials_path()
    if not os.path.exists(path):
        sys.exit(f'Not paired yet: run "python bench.py pair <code>" first ({path} is missing).')
    with open(path, encoding='utf-8') as f:
        return json.load(f)


def save_credentials(server, token, device):
    path = credentials_path()
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, 'w', encoding='utf-8') as f:
        json.dump({'server': server, 'token': token, 'device': device}, f, indent=2)
    return path


def request(server, method, path, token=None, body=None, raw=None, query=None):
    url = server.rstrip('/') + path + (('?' + urllib.parse.urlencode(query)) if query else '')
    headers = {PROTOCOL_HEADER: PROTOCOL_VERSION, 'x-provisioner-app-version': APP_VERSION}
    data = None
    if token:
        headers['Authorization'] = f'Bearer {token}'
    if raw is not None:
        headers['Content-Type'] = 'application/octet-stream'
        data = raw
    elif body is not None:
        headers['Content-Type'] = 'application/json'
        data = json.dumps(body).encode('utf-8')
    req = urllib.request.Request(url, data=data, method=method, headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=300) as res:
            text = res.read().decode('utf-8')
            return res.status, (json.loads(text) if text else None)
    except urllib.error.HTTPError as err:
        text = err.read().decode('utf-8', 'replace')
        try:
            message = json.loads(text).get('message', text)
        except ValueError:
            message = text
        raise BenchHttpError(f'{method} {path}: HTTP {err.code}: {message}') from None


def kind_for(name):
    lower = name.lower()
    for suffix, kind in KINDS.items():
        if lower.endswith(suffix):
            return kind
    return None


def collect(paths):
    files = []
    for path in paths:
        if os.path.isdir(path):
            for name in sorted(os.listdir(path)):
                full = os.path.join(path, name)
                if os.path.isfile(full) and kind_for(name):
                    files.append(full)
        elif os.path.isfile(path):
            if not kind_for(path):
                sys.exit(f'{path}: not a print file (.3mf, .gcode.3mf, .csv, .json, .png)')
            files.append(path)
        else:
            sys.exit(f'{path}: no such file or folder')
    if not files:
        sys.exit('Nothing to attach.')
    return files


def claim(creds, job_id=None):
    """The given order, or the oldest buildable one (None when there is nothing to do)."""
    status, ticket = request(creds['server'], 'POST', '/api/provisioner/print-jobs/claim', creds['token'], {'jobId': job_id})
    if status == 204 or not ticket:
        return None
    return ticket


def event(creds, job_id, kind, detail=None):
    try:
        request(creds['server'], 'POST', f'/api/provisioner/print-jobs/{job_id}/events', creds['token'],
                {'type': kind, 'detail': detail})
    except BenchHttpError:
        pass  # progress notes are best effort; the build goes on


def upload(creds, job_id, path):
    name = os.path.basename(path)
    with open(path, 'rb') as f:
        data = f.read()
    _, item = request(creds['server'], 'POST', f'/api/provisioner/print-jobs/{job_id}/files', creds['token'],
                      raw=data, query={'kind': kind_for(name), 'filename': name})
    print(f'  attached {item["filename"]} ({item["kind"]}, {item["bytes"]} bytes)')
    return item


def complete(creds, job_id, outcome, report=None, message=None):
    body = {'outcome': outcome, 'report': report or {}}
    if outcome == 'failed':
        body.update(errorCode='build_failed', errorMessage=(message or 'build failed')[:1000])
    _, done = request(creds['server'], 'POST', f'/api/provisioner/print-jobs/{job_id}/complete', creds['token'], body)
    return done


def build_ticket(creds, ticket, out=None, do_slice=True):
    """Build an order already claimed, attach its files and mark it ready (or failed). Returns True when ready."""
    sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
    from pipeline import BuildFailed, build_order

    job_id = ticket['job']['id']
    batch = (ticket.get('batch') or {}).get('batchCode') or '-'
    out = out or os.path.join(work_root(), job_id)
    os.makedirs(out, exist_ok=True)
    print(f'Order {job_id}: {ticket["model"]["title"]} v{ticket["version"]["version"]}, {len(ticket["tags"])} codes, batch {batch}')
    event(creds, job_id, 'build_started', {'pieces': len(ticket['tags'])})
    try:
        report = build_order(ticket, out, do_slice=do_slice)
    except BuildFailed as err:
        done = complete(creds, job_id, 'failed', message=str(err))
        print(f'  failed: {err}\nOrder {done["id"]} is {done["status"]}.')
        return False
    except Exception as err:  # a bug or a missing tool: the order says so instead of staying stuck in `building`
        done = complete(creds, job_id, 'failed', message=f'{type(err).__name__}: {err}')
        print(traceback.format_exc())
        print(f'Order {done["id"]} is {done["status"]}.')
        return False
    files = report.pop('_files')
    event(creds, job_id, 'built', {k: report.get(k) for k in ('minutes', 'swaps', 'qr_check')})
    for path in files:
        upload(creds, job_id, path)
    done = complete(creds, job_id, 'ready', report)
    print(f'Order {done["id"]} is {done["status"]}: {report.get("minutes")} min, {report.get("swaps")} swaps, QR {report.get("qr_check")}.')
    return True


def cmd_pair(args):
    server = args.server.rstrip('/')
    body = {'pairingCode': args.code, 'platform': platform.platform()[:40], 'appVersion': APP_VERSION, 'capabilities': ['print']}
    _, result = request(server, 'POST', '/api/provisioner/pair', body=body)
    path = save_credentials(server, result['token'], result['device'])
    print(f'Paired as "{result["device"]["deviceName"]}" with {server}. Token saved in {path}.')


def cmd_whoami(_args):
    creds = load_credentials()
    _, session = request(creds['server'], 'GET', '/api/provisioner/session', creds['token'])
    print(json.dumps({'server': creds['server'], **session}, indent=2))


def cmd_doctor(_args):
    import importlib
    ok = True
    print(f'Python {platform.python_version()} ({sys.executable})')
    for name in PACKAGES:
        try:
            module = importlib.import_module(name)
            print(f'  ok      {name} {getattr(module, "__version__", "")}')
        except Exception as err:  # noqa: BLE001 - report every missing piece at once
            ok = False
            print(f'  MISSING {name}: {type(err).__name__} (pip install -r requirements.txt)')
    sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
    from pipeline import studio_path
    studio = studio_path()
    print(f'  {"ok     " if os.path.exists(studio) else "MISSING"} Bambu Studio: {studio}')
    ok = ok and os.path.exists(studio)
    dirs = [os.path.join(os.environ.get('LOCALAPPDATA', ''), 'Microsoft', 'Windows', 'Fonts'), r'C:\Windows\Fonts']
    for font in FONTS:
        found = any(os.path.exists(os.path.join(d, font)) for d in dirs)
        ok = ok and found
        print(f'  {"ok     " if found else "MISSING"} font {font}')
    print('Credentials:', credentials_path() if os.path.exists(credentials_path()) else 'not paired yet')
    sys.exit(0 if ok else 1)


def cmd_build(args):
    creds = load_credentials()
    ticket = claim(creds, args.order)
    if not ticket:
        sys.exit('Nothing to claim.')
    sys.exit(0 if build_ticket(creds, ticket, args.out, do_slice=not args.no_slice) else 1)


def fetch(url):
    with urllib.request.urlopen(url, timeout=300) as res:
        return res.read()


def sync_print_now(creds, folder, quiet=False):
    """Make the Print Now folder hold the plates Xpot lists. Returns what changed."""
    sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
    import print_now
    _, plates = request(creds['server'], 'GET', '/api/provisioner/print-now', creds['token'])
    changed = print_now.sync(folder, plates or [], fetch, log=(lambda _m: None) if quiet else print)
    if not quiet or changed['added'] or changed['moved'] or changed['removed'] or changed['skipped']:
        print(f"{time.strftime('%H:%M:%S')} Print Now: {changed['added']} added, {changed['moved']} moved, "
              f"{changed['removed']} removed, {changed['kept']} as they were, {changed['skipped']} skipped ({folder})")
    return changed


def cmd_run(args):
    creds = load_credentials()
    folder = load_settings().get('print_now')
    where = f', Print Now in {folder}' if folder else ' (no Print Now folder: python bench.py folder <path>)'
    print(f'Xpot Bench watching {creds["server"]} every {args.interval}s{where} (Ctrl+C stops).')
    last_sync = None
    while True:
        try:
            ticket = claim(creds)
            if ticket:
                build_ticket(creds, ticket)
                last_sync = None  # the new plate goes into the folder at once
                continue  # look for the next one at once
            if folder and (last_sync is None or time.monotonic() - last_sync >= 60):
                sync_print_now(creds, folder, quiet=True)
                last_sync = time.monotonic()
        except BenchHttpError as err:
            print(f'{time.strftime("%H:%M:%S")} {err}')
        except (urllib.error.URLError, TimeoutError, ConnectionError) as err:
            print(f'{time.strftime("%H:%M:%S")} no connection: {err}')
        except (OSError, ValueError) as err:
            print(f'{time.strftime("%H:%M:%S")} Print Now: {err}')
        time.sleep(args.interval)


def cmd_folder(args):
    settings = load_settings()
    if args.path:
        folder = os.path.abspath(os.path.expanduser(args.path))
        os.makedirs(folder, exist_ok=True)
        settings['print_now'] = folder
        save_settings(settings)
        print(f'Print Now folder: {folder}. Only the files the bench writes there are ever moved or removed.')
    else:
        print(settings.get('print_now') or 'No Print Now folder yet: python bench.py folder <path>')


def cmd_sync(_args):
    folder = load_settings().get('print_now')
    if not folder:
        sys.exit('No Print Now folder yet: python bench.py folder <path>')
    sync_print_now(load_credentials(), folder)


def cmd_ticket(args):
    ticket = claim(load_credentials(), args.order)
    if not ticket:
        sys.exit('Nothing to claim.')
    text = json.dumps(ticket, indent=2)
    if args.out:
        with open(args.out, 'w', encoding='utf-8') as f:
            f.write(text)
        print(f'Order {args.order} taken; ticket written to {args.out}.')
    else:
        print(text)


def cmd_attach(args):
    creds = load_credentials()
    files = collect(args.paths)
    if not claim(creds, args.order):
        sys.exit('Nothing to claim.')
    for path in files:
        upload(creds, args.order, path)
    if args.no_ready:
        print('Files attached; the order stays building (run attach again without --no-ready when done).')
        return
    report = {}
    if args.report:
        with open(args.report, encoding='utf-8') as f:
            report = json.load(f)
    done = complete(creds, args.order, 'ready', report)
    print(f'Order {done["id"]} is {done["status"]}.')


def cmd_attach_bed(args):
    creds = load_credentials()
    slug = urllib.parse.quote(args.model)
    _, model = request(creds['server'], 'GET', f'/api/provisioner/print-models/{slug}', creds['token'])
    version = model.get('currentVersion')
    if not version:
        sys.exit(f'{args.model} has no version yet.')
    name = os.path.basename(args.file)
    with open(args.file, 'rb') as f:
        data = f.read()
    label = urllib.parse.quote(args.bed)
    _, updated = request(creds['server'], 'POST', f'/api/provisioner/print-models/{slug}/versions/{version["id"]}/beds/{label}/file',
                         creds['token'], raw=data, query={'filename': name})
    bed = next(b for b in updated['beds'] if b['label'].lower() == args.bed.lower())
    print(f'{args.model} v{updated["version"]} bed {bed["label"]}: {bed["fileName"]} ({bed["fileBytes"]} bytes)')


def cmd_fail(args):
    creds = load_credentials()
    if not claim(creds, args.order):
        sys.exit('Nothing to claim.')
    done = complete(creds, args.order, 'failed', message=args.message)
    print(f'Order {done["id"]} is {done["status"]}.')


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest='command', required=True)
    p = sub.add_parser('pair', help='pair this computer as a print bench')
    p.add_argument('code')
    p.add_argument('--server', default=DEFAULT_SERVER)
    p.set_defaults(run=cmd_pair)
    p = sub.add_parser('run', help='build plates as they are asked for and keep Print Now, forever')
    p.add_argument('--interval', type=int, default=20)
    p.set_defaults(run=cmd_run)
    p = sub.add_parser('folder', help='set or show the Print Now folder')
    p.add_argument('path', nargs='?')
    p.set_defaults(run=cmd_folder)
    p = sub.add_parser('sync', help='bring the Print Now folder up to date once')
    p.set_defaults(run=cmd_sync)
    p = sub.add_parser('build', help='build one order now')
    p.add_argument('order')
    p.add_argument('--out')
    p.add_argument('--no-slice', action='store_true', help='meshes and .3mf only (a dry run; the order still becomes ready)')
    p.set_defaults(run=cmd_build)
    p = sub.add_parser('doctor', help='check Python packages, Bambu Studio and fonts')
    p.set_defaults(run=cmd_doctor)
    p = sub.add_parser('whoami', help='the paired device and server')
    p.set_defaults(run=cmd_whoami)
    p = sub.add_parser('ticket', help='take an order and print what build needs')
    p.add_argument('order')
    p.add_argument('--out')
    p.set_defaults(run=cmd_ticket)
    p = sub.add_parser('attach', help='upload files to an order and mark it ready')
    p.add_argument('order')
    p.add_argument('paths', nargs='+')
    p.add_argument('--report', help='report.json whose numbers (minutes, swaps, grams, qr_check) go on the order')
    p.add_argument('--no-ready', action='store_true')
    p.set_defaults(run=cmd_attach)
    p = sub.add_parser('attach-bed', help="upload a part's fixed print file to a bed of its current version")
    p.add_argument('model')
    p.add_argument('bed')
    p.add_argument('file')
    p.set_defaults(run=cmd_attach_bed)
    p = sub.add_parser('fail', help='mark an order failed')
    p.add_argument('order')
    p.add_argument('--message', required=True)
    p.set_defaults(run=cmd_fail)
    args = ap.parse_args(argv)
    try:
        args.run(args)
    except BenchHttpError as err:
        sys.exit(str(err))


if __name__ == '__main__':
    main()
