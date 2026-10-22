"""Xpot Bench from the command line: pair with Xpot, take a print order, attach its files, mark it ready.

    python bench.py pair <pairing-code> [--server https://xpot.place]
    python bench.py ticket <order-id> [--out job.json]            take the order and write what build needs
    python bench.py attach <order-id> <file-or-dir>... [--report report.json] [--no-ready]
    python bench.py fail <order-id> --message "why"
    python bench.py whoami

The order comes from Xpot (Tags > Production > Queue); `ticket` gives its codes, bed positions and the version's
builder, params and recipe as JSON (docs/PRINT_EXECUTION_PLAN.md s6). `attach` uploads the files a build produced
(the .3mf project, the sliced .gcode.3mf, the serial map, report.json, the layer-1 preview) and, unless --no-ready,
marks the order ready with the numbers of report.json. Phase 2 runs the same steps inside the bench app.

Pairing: Xpot > Tags > NFC writers > pair a computer gives a one-time code; this script trades it for a device token
paired as a print bench, saved in the user's profile (never in the repository). Standard library only, Python 3.9+.
"""
import argparse
import json
import os
import platform
import sys
import urllib.error
import urllib.parse
import urllib.request

PROTOCOL_HEADER = 'x-provisioner-protocol'
PROTOCOL_VERSION = '1'
APP_VERSION = 'bench-cli-1'
DEFAULT_SERVER = 'https://xpot.place'

KINDS = {
    '.gcode.3mf': 'gcode_3mf',
    '.3mf': '3mf',
    '.csv': 'serial_map',
    '.json': 'report',
    '.png': 'preview',
}


def credentials_path():
    base = os.environ.get('LOCALAPPDATA') or os.path.join(os.path.expanduser('~'), '.config')
    return os.path.join(base, 'XpotBench', 'credentials.json')


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
        sys.exit(f'{method} {path}: HTTP {err.code}: {message}')


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


def claim(creds, job_id):
    status, ticket = request(creds['server'], 'POST', '/api/provisioner/print-jobs/claim', creds['token'], {'jobId': job_id})
    if status == 204 or not ticket:
        sys.exit('Nothing to claim.')
    return ticket


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


def cmd_ticket(args):
    ticket = claim(load_credentials(), args.order)
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
    claim(creds, args.order)
    for path in files:
        name = os.path.basename(path)
        with open(path, 'rb') as f:
            data = f.read()
        _, item = request(creds['server'], 'POST', f'/api/provisioner/print-jobs/{args.order}/files', creds['token'],
                          raw=data, query={'kind': kind_for(name), 'filename': name})
        print(f'  attached {item["filename"]} ({item["kind"]}, {item["bytes"]} bytes, sha256 {item["sha256"][:12]})')
    if args.no_ready:
        print('Files attached; the order stays building (run attach again without --no-ready when done).')
        return
    report = {}
    if args.report:
        with open(args.report, encoding='utf-8') as f:
            report = json.load(f)
    _, done = request(creds['server'], 'POST', f'/api/provisioner/print-jobs/{args.order}/complete', creds['token'],
                      {'outcome': 'ready', 'report': report})
    print(f'Order {done["id"]} is {done["status"]}.')


def cmd_fail(args):
    creds = load_credentials()
    claim(creds, args.order)
    _, done = request(creds['server'], 'POST', f'/api/provisioner/print-jobs/{args.order}/complete', creds['token'],
                      {'outcome': 'failed', 'errorCode': 'build_failed', 'errorMessage': args.message})
    print(f'Order {done["id"]} is {done["status"]}.')


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest='command', required=True)
    p = sub.add_parser('pair', help='pair this computer as a print bench')
    p.add_argument('code')
    p.add_argument('--server', default=DEFAULT_SERVER)
    p.set_defaults(run=cmd_pair)
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
    p = sub.add_parser('fail', help='mark an order failed')
    p.add_argument('order')
    p.add_argument('--message', required=True)
    p.set_defaults(run=cmd_fail)
    args = ap.parse_args(argv)
    args.run(args)


if __name__ == '__main__':
    main()
