"""Xpot Desktop: lets the Xpot page in the browser see and prepare this computer for printing.

A web page cannot see what a computer has installed, so this small program answers it on 127.0.0.1, and only to Xpot's
own pages. The page shows what is missing with an Install button; once everything is there, this program runs the bench
(bench.py) by itself. Any computer can do it: nothing here is tied to one machine. XpotDesktopSetup.cmd installs it.

Standard library only: it runs before anything else is installed. It never hands the device token to the page.
"""
import hashlib
import json
import os
import platform
import shutil
import socket
import subprocess
import sys
import tarfile
import tempfile
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

PORT = 47631
VERSION = 'desktop-1'
ALLOWED_ORIGINS = {'https://xpot.place', 'http://localhost:2110', 'http://127.0.0.1:2110'}
ALLOWED_HOSTS = {f'127.0.0.1:{PORT}', f'localhost:{PORT}'}
PROTOCOL_HEADERS = {'x-provisioner-protocol': '1', 'x-provisioner-app-version': VERSION}
# Windows ships these two; the others come with the pipeline (print-pipeline/fonts).
SYSTEM_FONTS = ['segoeuib.ttf', 'segoeuiz.ttf']
BUNDLED_FONTS = ['InriaSerif-Bold.otf', 'InriaSerif-BoldItalic.otf', 'Metropolis-Medium.otf', 'Metropolis-Bold.otf',
                 'Inter_24pt-SemiBold.ttf', 'NunitoW900.ttf']
STUDIO_DEFAULT = r'C:\Program Files\Bambu Studio\bambu-studio.exe'
PIPELINE_REFRESH_S = 30 * 60
NO_WINDOW = 0x08000000 if os.name == 'nt' else 0


def origin_allowed(origin):
    return origin in ALLOWED_ORIGINS


def host_allowed(host):
    """The address the page asked for: a name rebound to 127.0.0.1 by some other site does not get in."""
    return host in ALLOWED_HOSTS


def root():
    base = os.environ.get('LOCALAPPDATA') or os.path.join(os.path.expanduser('~'), '.config')
    return os.path.join(base, 'XpotBench')


def credentials_path():
    return os.path.join(root(), 'credentials.json')


def pipeline_dir():
    return os.path.join(root(), 'pipeline')


def venv_python():
    return os.path.join(root(), 'venv', 'Scripts', 'python.exe') if os.name == 'nt' else os.path.join(root(), 'venv', 'bin', 'python')


def base_python():
    """python.exe beside this interpreter: the startup shortcut runs pythonw, which cannot run pip or show output."""
    folder, name = os.path.split(sys.executable)
    candidate = os.path.join(folder, name.replace('pythonw', 'python'))
    return candidate if os.path.exists(candidate) else sys.executable


def load_credentials():
    try:
        with open(credentials_path(), encoding='utf-8') as f:
            return json.load(f)
    except (OSError, ValueError):
        return None


def font_dirs():
    return [os.path.join(os.environ.get('LOCALAPPDATA', ''), 'Microsoft', 'Windows', 'Fonts'), r'C:\Windows\Fonts']


def font_present(name):
    return any(os.path.exists(os.path.join(d, name)) for d in font_dirs())


def studio_present():
    return os.path.exists(os.environ.get('XPOT_BAMBU_STUDIO') or STUDIO_DEFAULT)


def requirements_hash():
    try:
        with open(os.path.join(pipeline_dir(), 'requirements.txt'), 'rb') as f:
            return hashlib.sha256(f.read()).hexdigest()
    except OSError:
        return None


def packages_marker():
    return os.path.join(root(), 'venv', 'xpot-requirements.sha256')


def packages_present():
    wanted = requirements_hash()
    if not wanted or not os.path.exists(venv_python()):
        return False
    try:
        with open(packages_marker(), encoding='utf-8') as f:
            return f.read().strip() == wanted
    except OSError:
        return False


def nfc_readers():
    """The USB NFC readers plugged in now: none, and the page says nothing about them."""
    if os.name != 'nt':
        return []
    try:
        import ctypes
        scard = ctypes.WinDLL('winscard')
        context = ctypes.c_size_t()
        if scard.SCardEstablishContext(2, None, None, ctypes.byref(context)) != 0:
            return []
        try:
            size = ctypes.c_ulong(0)
            if scard.SCardListReadersW(context, None, None, ctypes.byref(size)) != 0 or not size.value:
                return []
            buffer = ctypes.create_unicode_buffer(size.value)
            if scard.SCardListReadersW(context, None, buffer, ctypes.byref(size)) != 0:
                return []
            return [name for name in buffer[:size.value].split('\0') if name]
        finally:
            scard.SCardReleaseContext(context)
    except (OSError, AttributeError, ValueError):
        return []


def http(server, path, token=None, body=None):
    headers = dict(PROTOCOL_HEADERS)
    if token:
        headers['Authorization'] = f'Bearer {token}'
    data = None
    if body is not None:
        headers['Content-Type'] = 'application/json'
        data = json.dumps(body).encode('utf-8')
    request = urllib.request.Request(server.rstrip('/') + path, data=data, headers=headers, method='POST' if data else 'GET')
    return urllib.request.urlopen(request, timeout=300)


def safe_extract(archive, target):
    """Unpack, refusing any member that would land outside `target`."""
    base = os.path.realpath(target)
    with tarfile.open(archive) as tar:
        for member in tar.getmembers():
            path = os.path.realpath(os.path.join(base, member.name))
            if path != base and not path.startswith(base + os.sep):
                raise ValueError(f'unsafe path in the pipeline: {member.name}')
            if not (member.isfile() or member.isdir()):
                raise ValueError(f'unsafe entry in the pipeline: {member.name}')
        tar.extractall(base)


def download_pipeline():
    """The print code of the server this computer works for. Returns False when it already has this one."""
    creds = load_credentials()
    if not creds:
        raise RuntimeError('This computer is not connected yet.')
    with http(creds['server'], '/api/provisioner/bench-bundle', creds['token']) as res:
        content = res.read()
    digest = hashlib.sha256(content).hexdigest()
    stamp = os.path.join(pipeline_dir(), '.bundle.sha256')
    try:
        with open(stamp, encoding='utf-8') as f:
            if f.read().strip() == digest:
                return False
    except OSError:
        pass
    os.makedirs(root(), exist_ok=True)
    work = tempfile.mkdtemp(prefix='pipeline-', dir=root())
    try:
        archive = os.path.join(work, 'pipeline.tgz')
        with open(archive, 'wb') as f:
            f.write(content)
        unpacked = os.path.join(work, 'out')
        os.makedirs(unpacked)
        safe_extract(archive, unpacked)
        with open(os.path.join(unpacked, '.bundle.sha256'), 'w', encoding='utf-8') as f:
            f.write(digest)
        shutil.rmtree(pipeline_dir(), ignore_errors=True)
        os.replace(unpacked, pipeline_dir())
    finally:
        shutil.rmtree(work, ignore_errors=True)
    return True


def run(cmd):
    result = subprocess.run(cmd, capture_output=True, text=True, creationflags=NO_WINDOW)
    if result.returncode != 0:
        raise RuntimeError((result.stderr or result.stdout or f'exit {result.returncode}').strip()[-300:])


def install_packages():
    if not os.path.exists(venv_python()):
        run([base_python(), '-m', 'venv', os.path.join(root(), 'venv')])
    run([venv_python(), '-m', 'pip', 'install', '--quiet', '--disable-pip-version-check', '-r', os.path.join(pipeline_dir(), 'requirements.txt')])
    with open(packages_marker(), 'w', encoding='utf-8') as f:
        f.write(requirements_hash() or '')


def install_studio():
    # Windows asks for permission here: the installer writes to Program Files.
    run(['winget', 'install', '--id', 'Bambulab.Bambustudio', '--exact', '--silent', '--accept-package-agreements', '--accept-source-agreements'])
    if not studio_present():
        raise RuntimeError('The installer finished, but Bambu Studio was not found.')


def install_fonts():
    target = font_dirs()[0]
    os.makedirs(target, exist_ok=True)
    import winreg
    key = winreg.CreateKey(winreg.HKEY_CURRENT_USER, r'Software\Microsoft\Windows NT\CurrentVersion\Fonts')
    with key:
        for name in BUNDLED_FONTS:
            path = os.path.join(target, name)
            shutil.copyfile(os.path.join(pipeline_dir(), 'fonts', name), path)
            winreg.SetValueEx(key, os.path.splitext(name)[0], 0, winreg.REG_SZ, path)


class Desktop:
    INSTALLERS = {'pipeline': download_pipeline, 'packages': install_packages, 'studio': install_studio, 'fonts': install_fonts}

    def __init__(self):
        self.lock = threading.Lock()
        self.working = set()
        self.errors = {}
        self.bench = None
        self.log = None

    def checks(self):
        return {
            'connection': load_credentials() is not None,
            'pipeline': os.path.exists(os.path.join(pipeline_dir(), 'bench.py')),
            'packages': packages_present(),
            'studio': studio_present(),
            'fonts': all(font_present(name) for name in SYSTEM_FONTS + BUNDLED_FONTS),
        }

    def status(self):
        checks = self.checks()
        with self.lock:
            items = [{
                'id': item,
                'state': 'working' if item in self.working else 'ok' if ok else 'failed' if item in self.errors else 'missing',
                'detail': self.errors.get(item),
            } for item, ok in checks.items()]
        creds = load_credentials()
        return {
            'version': VERSION,
            'supported': os.name == 'nt',
            'computerName': socket.gethostname()[:80],
            'platform': platform.system(),
            'server': creds['server'] if creds else None,
            'items': items,
            'ready': all(checks.values()),
            'building': self.bench is not None and self.bench.poll() is None,
            'readers': nfc_readers(),
        }

    def connect(self, server, code):
        body = {'pairingCode': code, 'platform': platform.platform()[:40], 'appVersion': VERSION, 'capabilities': ['print']}
        with http(server, '/api/provisioner/pair', body=body) as res:
            result = json.loads(res.read())
        os.makedirs(root(), exist_ok=True)
        with open(credentials_path(), 'w', encoding='utf-8') as f:
            json.dump({'server': server, 'token': result['token'], 'device': result['device']}, f, indent=2)
        with self.lock:
            self.errors.pop('connection', None)

    def install(self, item):
        with self.lock:
            if item in self.working:
                return
            self.working.add(item)
            self.errors.pop(item, None)
        threading.Thread(target=self._install, args=(item,), daemon=True).start()

    def _install(self, item):
        try:
            self.INSTALLERS[item]()
        except Exception as err:  # noqa: BLE001 - whatever went wrong is shown on the page, with a way to try again
            with self.lock:
                self.errors[item] = str(err)[:300]
        finally:
            with self.lock:
                self.working.discard(item)

    def stop_bench(self):
        if self.bench is not None and self.bench.poll() is None:
            self.bench.terminate()
            try:
                self.bench.wait(timeout=30)
            except subprocess.TimeoutExpired:
                self.bench.kill()
        self.bench = None

    def keep_running(self):
        """Run the bench while everything is in place, and keep its print code the same as the server's."""
        last_refresh = time.monotonic()
        while True:
            try:
                ready = all(self.checks().values())
                if ready and time.monotonic() - last_refresh >= PIPELINE_REFRESH_S:
                    last_refresh = time.monotonic()
                    self.stop_bench()
                    download_pipeline()
                    if not packages_present():
                        install_packages()
                if ready and (self.bench is None or self.bench.poll() is not None):
                    self.log = open(os.path.join(root(), 'bench.log'), 'ab')
                    self.bench = subprocess.Popen([venv_python(), '-u', os.path.join(pipeline_dir(), 'bench.py'), 'run'], stdout=self.log,
                                                  stderr=subprocess.STDOUT, creationflags=NO_WINDOW)
                elif not ready:
                    self.stop_bench()
            except (OSError, ValueError, RuntimeError, urllib.error.URLError) as err:
                with self.lock:
                    self.errors['pipeline'] = str(err)[:300]
            time.sleep(10)


DESKTOP = Desktop()


class Handler(BaseHTTPRequestHandler):
    server_version = 'XpotDesktop'

    def log_message(self, *_args):
        pass

    def allowed(self):
        return origin_allowed(self.headers.get('Origin', '')) and host_allowed(self.headers.get('Host', ''))

    def send(self, status, payload=None):
        self.send_response(status)
        if origin_allowed(self.headers.get('Origin', '')):
            self.send_header('Access-Control-Allow-Origin', self.headers['Origin'])
            self.send_header('Vary', 'Origin')
            self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
            self.send_header('Access-Control-Allow-Headers', 'content-type')
            self.send_header('Access-Control-Allow-Private-Network', 'true')
        body = json.dumps(payload if payload is not None else {}).encode('utf-8')
        self.send_header('Content-Type', 'application/json')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_OPTIONS(self):  # noqa: N802 - the name http.server looks for
        self.send(204 if self.allowed() else 403)

    def do_GET(self):  # noqa: N802
        if not self.allowed():
            return self.send(403, {'message': 'Only Xpot can ask this.'})
        if self.path == '/status':
            return self.send(200, DESKTOP.status())
        return self.send(404)

    def do_POST(self):  # noqa: N802
        if not self.allowed():
            return self.send(403, {'message': 'Only Xpot can ask this.'})
        try:
            length = min(int(self.headers.get('Content-Length') or 0), 4096)
            body = json.loads(self.rfile.read(length) or b'{}')
        except ValueError:
            return self.send(400, {'message': 'Bad request'})
        if self.path == '/connect':
            try:
                # The server is the page that asked, never a value in the request.
                DESKTOP.connect(self.headers['Origin'], str(body.get('code', '')))
            except urllib.error.HTTPError as err:
                return self.send(502, {'message': f'Xpot answered {err.code}.'})
            except (urllib.error.URLError, OSError, ValueError, KeyError) as err:
                return self.send(502, {'message': str(err)[:200]})
            return self.send(200, DESKTOP.status())
        if self.path.startswith('/install/'):
            item = urllib.parse.unquote(self.path[len('/install/'):])
            if item not in Desktop.INSTALLERS or os.name != 'nt':
                return self.send(404)
            DESKTOP.install(item)
            return self.send(202, DESKTOP.status())
        return self.send(404)


def main():
    try:
        server = ThreadingHTTPServer(('127.0.0.1', PORT), Handler)
    except OSError:
        sys.exit(0)  # It is already running.
    threading.Thread(target=DESKTOP.keep_running, daemon=True).start()
    server.serve_forever()


if __name__ == '__main__':
    main()
