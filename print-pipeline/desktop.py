"""Xpot Desktop: lets the Xpot page in the browser see and prepare this computer for printing.

A web page cannot see what a computer has installed, so this small program answers it on 127.0.0.1, and only to Xpot's
own pages. Once the page connects it (being signed in is enough), it installs what is missing by itself and then runs
the bench (bench.py). Any computer can do it: nothing here is tied to one machine. XpotDesktopSetup.exe
(setup/XpotDesktop.iss) installs it.

On Windows it lives by the clock: a coloured icon says where this computer stands, and its menu opens Xpot, switches
automatic updates and quits. It updates itself from the server it works for (/desktop/version.json): downloads,
checks the hash, restarts, and goes back to the previous version if the new one does not start.

Standard library only: it runs before anything else is installed. It never hands the device token to the page.
"""
import base64
import hashlib
import json
import os
import platform
import shutil
import socket
import struct
import subprocess
import sys
import tarfile
import tempfile
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
import webbrowser
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

PORT = 47631
VERSION = 'desktop-2'
ALLOWED_ORIGINS = {'https://xpot.place', 'http://localhost:2110', 'http://127.0.0.1:2110'}
ALLOWED_HOSTS = {f'127.0.0.1:{PORT}', f'localhost:{PORT}'}
PROTOCOL_HEADERS = {'x-provisioner-protocol': '1', 'x-provisioner-app-version': VERSION}
# Windows ships these two; the others come with the pipeline (print-pipeline/fonts).
SYSTEM_FONTS = ['segoeuib.ttf', 'segoeuiz.ttf']
BUNDLED_FONTS = ['InriaSerif-Bold.otf', 'InriaSerif-BoldItalic.otf', 'Metropolis-Medium.otf', 'Metropolis-Bold.otf',
                 'Inter_24pt-SemiBold.ttf', 'NunitoW900.ttf']
STUDIO_DEFAULT = r'C:\Program Files\Bambu Studio\bambu-studio.exe'
PIPELINE_REFRESH_S = 30 * 60
UPDATE_CHECK_S = 30 * 60
DEFAULT_SERVER = 'https://xpot.place'
# The items it installs by itself once connected, in order (each needs the one before).
AUTO_SETUP = ['pipeline', 'packages', 'fonts', 'studio']
RETRY_FAILED_S = 10 * 60
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


def settings_path():
    return os.path.join(root(), 'settings.json')


def load_settings():
    """{'autoUpdate': True} unless the person switched it off; 'server' only when set by hand (a local Xpot)."""
    settings = {'autoUpdate': True}
    try:
        with open(settings_path(), encoding='utf-8') as f:
            settings.update(json.load(f))
    except (OSError, ValueError):
        pass
    return settings


def save_settings(changes):
    settings = load_settings()
    settings.update(changes)
    os.makedirs(root(), exist_ok=True)
    with open(settings_path(), 'w', encoding='utf-8') as f:
        json.dump(settings, f, indent=2)


def version_number(version):
    """'desktop-12' -> 12; anything else -> 0."""
    try:
        return int(str(version).rsplit('-', 1)[1])
    except (IndexError, ValueError):
        return 0


def ui_language():
    if os.name != 'nt':
        return 'en'
    try:
        import ctypes
        primary = ctypes.windll.kernel32.GetUserDefaultUILanguage() & 0x3FF
    except (OSError, AttributeError):
        return 'en'
    return {0x16: 'pt', 0x0A: 'es'}.get(primary, 'en')


TEXTS = {
    'en': {
        'ready': 'Ready to generate print files', 'notConnected': 'Not connected: open Xpot to connect',
        'preparing': 'Setting up this computer: {count} left', 'failed': 'Something failed: open Xpot to see it',
        'updating': 'Updating Xpot Desktop', 'updateAvailable': 'update {version} available',
        'open': 'Open Xpot', 'autoUpdate': 'Update automatically', 'installUpdate': 'Install update ({version})',
        'checkUpdate': 'Check for updates', 'quit': 'Quit Xpot Desktop', 'updatedTitle': 'Xpot Desktop updated',
        'updatedBody': 'Now on version {version}.', 'updateFailedTitle': 'Update not installed',
        'updateFailedBody': 'Version {version} did not start, so the previous one is back.', 'upToDate': 'Xpot Desktop is up to date.',
    },
    'pt': {
        'ready': 'Pronto para gerar arquivos de impressão', 'notConnected': 'Não conectado: abra o Xpot para conectar',
        'preparing': 'Preparando este computador: faltam {count}', 'failed': 'Algo falhou: abra o Xpot para ver',
        'updating': 'Atualizando o Xpot Desktop', 'updateAvailable': 'atualização {version} disponível',
        'open': 'Abrir o Xpot', 'autoUpdate': 'Atualizar automaticamente', 'installUpdate': 'Instalar a atualização ({version})',
        'checkUpdate': 'Procurar atualização', 'quit': 'Sair do Xpot Desktop', 'updatedTitle': 'Xpot Desktop atualizado',
        'updatedBody': 'Agora na versão {version}.', 'updateFailedTitle': 'Atualização não instalada',
        'updateFailedBody': 'A versão {version} não abriu, então a anterior voltou.', 'upToDate': 'O Xpot Desktop está atualizado.',
    },
    'es': {
        'ready': 'Lista para generar archivos de impresión', 'notConnected': 'Sin conectar: abre Xpot para conectar',
        'preparing': 'Preparando esta computadora: faltan {count}', 'failed': 'Algo falló: abre Xpot para verlo',
        'updating': 'Actualizando Xpot Desktop', 'updateAvailable': 'actualización {version} disponible',
        'open': 'Abrir Xpot', 'autoUpdate': 'Actualizar automáticamente', 'installUpdate': 'Instalar la actualización ({version})',
        'checkUpdate': 'Buscar actualización', 'quit': 'Salir de Xpot Desktop', 'updatedTitle': 'Xpot Desktop actualizado',
        'updatedBody': 'Ahora en la versión {version}.', 'updateFailedTitle': 'Actualización no instalada',
        'updateFailedBody': 'La versión {version} no abrió, así que volvió la anterior.', 'upToDate': 'Xpot Desktop está al día.',
    },
}


def text(key, **values):
    return TEXTS.get(ui_language(), TEXTS['en'])[key].format(**values)


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
        self.failed_at = {}
        self.bench = None
        self.log = None
        self.started = time.monotonic()
        # The update found on the server ({'version', 'sha256', 'url'}), and the checked file waiting to replace this one.
        self.update = None
        self.update_file = None
        self.updating = False
        # Set when the program should stop: quitting, or restarting into a new version (restart_for_update).
        self.stopped = threading.Event()
        self.restart_for_update = False
        self.on_change = None
        self.on_stop = None

    def checks(self):
        return {
            'connection': load_credentials() is not None,
            'pipeline': os.path.exists(os.path.join(pipeline_dir(), 'bench.py')),
            'packages': packages_present(),
            'studio': studio_present(),
            'fonts': all(font_present(name) for name in SYSTEM_FONTS + BUNDLED_FONTS),
        }

    def server(self):
        """The Xpot this computer works for: the one it connected to, else one set by hand, else xpot.place."""
        creds = load_credentials()
        return (creds or {}).get('server') or load_settings().get('server') or DEFAULT_SERVER

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
            # It installs what is missing by itself once connected: the page only shows the progress.
            'autoSetup': True,
            'autoUpdate': bool(load_settings().get('autoUpdate', True)),
            'update': {'version': self.update['version']} if self.update else None,
        }

    def tray_state(self):
        """('ready' | 'working' | 'attention', the sentence by the icon)."""
        checks = self.checks()
        with self.lock:
            working = bool(self.working)
            failed = any(not checks.get(item, True) for item in self.errors)
        if self.updating:
            state, line = 'working', text('updating')
        elif not checks['connection']:
            state, line = 'attention', text('notConnected')
        elif failed:
            state, line = 'attention', text('failed')
        elif not all(checks.values()) or working:
            state, line = 'working', text('preparing', count=sum(1 for ok in checks.values() if not ok))
        else:
            state, line = 'ready', text('ready')
        if self.update and not self.updating:
            line = f"{line} · {text('updateAvailable', version=self.update['version'])}"
        return state, line

    def changed(self):
        if self.on_change:
            self.on_change()

    def connect(self, server, code):
        body = {'pairingCode': code, 'platform': platform.platform()[:40], 'appVersion': VERSION, 'capabilities': ['print']}
        with http(server, '/api/provisioner/pair', body=body) as res:
            result = json.loads(res.read())
        os.makedirs(root(), exist_ok=True)
        with open(credentials_path(), 'w', encoding='utf-8') as f:
            json.dump({'server': server, 'token': result['token'], 'device': result['device']}, f, indent=2)
        with self.lock:
            self.errors.pop('connection', None)
        self.changed()

    def install(self, item):
        with self.lock:
            if item in self.working:
                return
            self.working.add(item)
            self.errors.pop(item, None)
        threading.Thread(target=self._install, args=(item,), daemon=True).start()

    def _install(self, item):
        self.changed()
        try:
            self.INSTALLERS[item]()
        except Exception as err:  # noqa: BLE001 - shown on the page and by the icon, and tried again later
            with self.lock:
                self.errors[item] = str(err)[:300]
                self.failed_at[item] = time.monotonic()
        finally:
            with self.lock:
                self.working.discard(item)
            self.changed()

    def set_up_next(self, checks):
        """Once connected, install the first missing item by itself (a failed one waits RETRY_FAILED_S before trying again)."""
        with self.lock:
            if self.working:
                return
        for item in AUTO_SETUP:
            if checks[item]:
                continue
            with self.lock:
                if item in self.errors and time.monotonic() - self.failed_at.get(item, 0) < RETRY_FAILED_S:
                    return
                self.working.add(item)
                self.errors.pop(item, None)
            self._install(item)
            return

    def stop_bench(self):
        if self.bench is not None and self.bench.poll() is None:
            self.bench.terminate()
            try:
                self.bench.wait(timeout=30)
            except subprocess.TimeoutExpired:
                self.bench.kill()
        self.bench = None

    def check_update(self):
        """Ask the server for its Xpot Desktop; keep it in self.update when it is newer than this one."""
        try:
            with http(self.server(), '/desktop/version.json') as res:
                info = json.loads(res.read())
        except (OSError, ValueError, urllib.error.URLError):
            return False
        newer = version_number(info.get('version')) > version_number(VERSION) and info.get('sha256') and info.get('url')
        self.update = info if newer else None
        self.changed()
        return True

    def prepare_update(self):
        """Download the new version and check its hash. Returns True when it is ready to replace this one."""
        info = self.update
        if not info:
            return False
        with http(self.server(), info['url']) as res:
            content = res.read()
        if hashlib.sha256(content).hexdigest() != info['sha256']:
            raise ValueError('The downloaded Xpot Desktop does not match the server.')
        target = os.path.join(root(), 'desktop.new.py')
        with open(target, 'wb') as f:
            f.write(content)
        self.update_file = target
        return True

    def request_update(self):
        """Download and check the new version, then stop at a safe point and restart into it (perform_update)."""
        try:
            if not self.prepare_update():
                return False
        except (OSError, ValueError, urllib.error.URLError) as err:
            with self.lock:
                self.errors['update'] = str(err)[:300]
                self.failed_at['update'] = time.monotonic()
            return False
        self.updating = True
        self.changed()
        self.stop_bench()
        self.restart_for_update = True
        self.stop()
        return True

    def stop(self):
        self.stopped.set()
        if self.on_stop:
            self.on_stop()

    def open_xpot(self):
        webbrowser.open(self.server().rstrip('/') + '/admin/tags/production')

    def keep_running(self):
        """Install what is missing, run the bench while everything is in place, keep the print code the same as the
        server's, and update this program when the server has a newer one (by itself, or when the person says so)."""
        last_refresh = time.monotonic()
        last_update_check = time.monotonic() - UPDATE_CHECK_S + 60  # the first check a minute after starting
        while not self.stopped.is_set():
            try:
                checks = self.checks()
                ready = all(checks.values())
                if checks['connection'] and not ready:
                    self.set_up_next(checks)
                elif not checks['connection'] and time.monotonic() - self.started > 25 and not load_settings().get('browserOpened'):
                    # Not connected after a while (installed without the page open): open Xpot once to connect it.
                    save_settings({'browserOpened': True})
                    self.open_xpot()
                if time.monotonic() - last_update_check >= UPDATE_CHECK_S:
                    last_update_check = time.monotonic()
                    self.check_update()
                    if self.update and load_settings().get('autoUpdate', True) and self.request_update():
                        return
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
                    self.failed_at['pipeline'] = time.monotonic()
            self.changed()
            self.stopped.wait(10)


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


# BRAND (print-pipeline/setup/make_brand_assets.py writes this block): the Xpot mark for the tray icon,
# raw BGRA bottom-up pixels by size, base64.
XPOT_MARK = {
    16: (
        'AAAAABcLCFYZDAjYGg0I+xwQCP4aDgj/GQ0I/xkNCP8ZDQj/GQ0I/xoOCP8cEAj+Gg0I+xkMCNgXCwhWAAAAABgMCVQZDQj+Gw4I/xkNCP8OAg'
        'j/FwsI/xoOCP8ZDQj/GQ0I/xoOCP8XCwj/DgII/xkNCP8bDgj/GQ0I/hgMCVQZDAfgGw4I/xYKCPwXCwj/b2AI/yYZCP8SBwj/Gw8I/xsPCP8T'
        'Bwj/JhkI/2xgCP8XCwj/FgoI/BsOCP8ZDAfgGQ0I/xkNCP8XCgj/gnUI/9nMCP+ckQj/HREI/xcKCP8XCgj/HREI/5eSCf/QzQr/e3UJ/xcLCP'
        '8ZDQj/GQ0I/xwQCP8PAgj/aWEJ/9DNCf+xrgn/w8IK/5iUCv8aDwf/Gg8H/5SUCv+8wwr/qa4L/8PNC/9jYQn/DwII/xsQCP8aDgj/FwsI/yUZ'
        'CP+Qkgr/usML/6qvDP+3xgn/jIkP/4uJD/+zxwn/pLAM/7DDDP+Hkgv/JBkI/xcLCP8aDgj/GQ0I/xoOCP8TBwj/HBEI/4yUDP+uxgv/obIN/+'
        'qFRf/qhEf/nrIO/6fHC/+FlQ3/HBEI/xQHCP8aDgj/GQ0I/xkNCP8ZDQj/Gw8I/xgJCf8YEAb/f40N/+WJQf/1bFT/9WpX/+SFRv96jA7/FxEG'
        '/xgJCf8aDwj/GQ0I/xkNCP8ZDQj/GQ0I/xwOCf8VDAb/HA0J/8BaPf/+eFL/7nJO/+5xUP/9c1n/wFRG/xwNCv8VDAb/HA4J/xkNCP8ZDQj/GQ'
        '0I/xsOCf8RCQb/Hg8J/8dkO///gU//7nRK//x5Uf/8d1T/7W9Q//94Wv/FW0f/Hg8K/xEJBf8bDgn/GQ0I/xoOCP8XDAf/KRUM/8RkN///gkv/'
        '7HVG//9/UP++XDz/vVs+//96V//rbVH//3Zb/8JYR/8pFA7/FwwH/xoNCP8cDwn/CwYE/4ZFJf//jEv/63ZD//+BTP/HYj3/Gw4J/xsOCf/GX0'
        'L//3hY/+hrUf//e2L/hD0w/wsHA/8cDwn/GQ0I/xkNCP8WCwf/oFIs//+LTP/EYzn/Hg8J/xULB/8VCwf/Hg8K/8NcQv//fl7/nkk4/xYMB/8Z'
        'DQj/GQ0I/xkMB+AbDgj/FQsH/BYLB/+DRCX/KRUM/xEJBv8cDgn/HA4J/xEJBf8pFA3/gz8t/xYMB/8VCwb8Gw4I/xkMB+AYDAlUGQ0I/hsOCf'
        '8ZDQj/CwYE/xcMB/8bDgn/GQ0I/xkNCP8bDgn/FwwH/wsHA/8ZDQj/Gw4J/xkNCP4YDAlUAAAAABcLCFYZDAjYGg0I+xwPCf4aDgj/GQ0I/xkN'
        'CP8ZDQj/GQ0I/xoNCP8cDwn+Gg0I+xkMCNgXCwhWAAAAAA=='
    ),
    20: (
        'AAAAABkAAAoZDAmNGQ0H5hkNCP0aDgj+GQ0I/xkNCP8ZDQj/GQ0I/xkNCP8ZDQj/GQ0I/xkNCP8aDgj+GQ0I/RkNB+YZDAmNGQAACgAAAAAVFQ'
        'AMGQ0IvRsOCf8ZDQj/Gg4I/xgMCP8aDgj/GQ0I/xkNCP8ZDQj/GQ0I/xkNCP8ZDQj/Gg4I/xgMCP8aDgj/GQ0I/xsOCf8ZDQi9FRUADBkMB44b'
        'Dgj/GAwI+hsPCP4UCAj/HREI/xYKCP8ZDQj/GQ0I/xkNCP8ZDQj/GQ0I/xkNCP8WCgj/HREI/xQICP8bDwj+GAwI+hsOCP8ZDAeOGAwH7BkNCP'
        '0bDwj+EgYI/yUZCP+vnwj/a10I/wsACP8cEAj/GQ0I/xkNCP8bEAj/CwAI/2hdCP+pnwn/JRkI/xIGCP8bDwj+GQ0I/RgMB+wZDQj/Gg4I/xQI'
        'CP8lGQj/qp0I/83ACP/Kvwn/Y1gI/w0ACP8cEAj/HBAI/w0ACP9gWAn/wsAK/8PBCv+gngr/JBkI/xUICP8aDgj/GQ0I/xkOCP8YDAj/HREI/6'
        'agCf/GwQn/trIJ/7m2Cv/Dwgr/X1gJ/w8ACf8PAAn/XlgJ/77CCv+ytgr/rbIL/7rBC/+boAv/HBEI/xgMCP8ZDgj/GQ0I/xoOCP8WCgj/Y10J'
        '/7zACv+ztgr/sbUK/7C2C/+8wwv/U1UG/1JVBv+5wwz/q7YL/6q2C/+qtwv/sMAM/11dCv8WCgj/Gg4I/xkNCP8ZDQj/GQ0I/xkNCP8MAAj/W1'
        'gJ/7XCC/+qtgv/qrUM/6K+Bv/Qmi3/z5ou/5++Bv+ltg3/o7cM/6vDDf9WWQr/DQAI/xkNCP8ZDQj/GQ0I/xkNCP8ZDQj/GQ0I/xsQCP8OAAj/'
        'V1kK/6/DDf+cvgf/xJkq//dtVv/3bFj/wpcs/5e+CP+nww//U1kK/w8ACP8bEAj/GQ0I/xkNCP8ZDQj/GQ0I/xkNCP8ZDQj/GQ0I/xsQCP8RAA'
        'n/SFgF/8afKf/3b1P/8nNQ//JyUv/4a1n/wpwt/0VYBf8RAAn/GxAI/xkNCP8ZDQj/GQ0I/xkNCP8ZDQj/GQ0I/xkNCP8ZDQj/HQ8J/wkGA/91'
        'NiX/+3dR//J0Tv/ydFD/8nJR//JxU//6cFr/dDIr/wkGAv8cDwn/GQ0I/xkNCP8ZDQj/GQ0I/xkNCP8ZDQj/GQ0I/xwPCf8IBQP/ej0k//+ATv'
        '/0eEv/8nVN//J0T//yclD/8nFS//NxVP//d1v/eTgr/wgGAv8cDgn/GQ0I/xkNCP8ZDQj/GQ0I/xkNCP8ZDQj/BgQD/3o+I///gUv/83hJ//J3'
        'Sv/0dk3/+XhQ//l3Uv/zc1L/8XBT//FvVf//dVz/eTgs/wcFAf8ZDQj/GQ0I/xkNCP8ZDQj/Gg0I/xULB/+AQiT//oJI//N6Rv/yeUf/83hJ//'
        '9/UP9yOCT/cjcl//96Vv/ycVL/8XBT//FvVv/8c1z/fzou/xULBv8aDQj/GQ0I/xoNCP8YDAj/HhAJ/9dvOv//hEf/73hD//N6R///gE3/ejwl'
        '/wkFA/8JBgP/ejoo//95Vv/ycVP/7W1T//91XP/VYE7/Hg8K/xgNB/8aDQj/GQ0I/xsOCP8TCgb/KBUM/9RtOv//g0j//oBJ/3o9JP8IBQP/HQ'
        '8J/x0PCf8IBQL/ejoo//13Vv/+d1n/0mFL/ygUDv8TCgb/Gw4J/xkNCP8YDAfsGQ0I/RwOCf4QCAb/KRUM/9RuPP+AQSX/BgQD/xwPCf8ZDQj/'
        'GQ0I/xwOCf8GBQL/fz0r/9NkSf8oFA3/EAkF/xwOCf4ZDQj9GAwH7BkMB44bDgj/GA0I+hwOCf4TCgb/HxAJ/xULB/8ZDQj/GQ0I/xkNCP8ZDQ'
        'j/GQ0I/xkNCP8VCwf/Hw8K/xMKBv8cDgn+GA0I+hsOCP8ZDAeOFRUADBkNCL0bDgn/GQ0I/xsOCP8XDAj/Gg0I/xkNCP8ZDQj/GQ0I/xkNCP8Z'
        'DQj/GQ0I/xoNCP8YDAj/Gw4J/xkNCP8bDgn/GQ0IvRUVAAwAAAAAGQAAChkMCY0ZDQfmGQ0I/RoNCP4ZDQj/GQ0I/xkNCP8ZDQj/GQ0I/xkNCP'
        '8ZDQj/GQ0I/xoNCP4ZDQj9GQ0H5hkMCY0ZAAAKAAAAAA=='
    ),
    24: (
        'AAAAAwAAAAAYDgk1Gg0IrxkMCO4ZDQj+GQ0I/xkNCP8ZDQj/GQ0I/xkNCP8ZDQj/GQ0I/xkNCP8ZDQj/GQ0I/xkNCP8ZDQj/GQ0I/hkMCO4aDQ'
        'ivGA4JNQAAAAAAAAADAAAAABgMCVUaDQj1Gg4I/xkNCP8ZDQj/Gw8I/xoOCP8ZDQj/GQ0I/xkNCP8ZDQj/GQ0I/xkNCP8ZDQj/GQ0I/xoOCP8b'
        'Dwj/GQ0I/xkNCP8aDgj/Gg0I9RgMCVUAAAAAGg8KMRkNCPoaDQj/GQ0I/BkNCP8bDwj/EQUI/xQICP8bDwj/GQ0I/xkNCP8ZDQj/GQ0I/xkNCP'
        '8ZDQj/Gw8I/xQICP8RBQj/Gw8I/xkNCP8ZDQj8Gg0I/xkNCPoaDwoxGQwIsxoOCP8ZDQj8GQ0I/xwQCP8MAQj/STwI/zcqCP8OAwj/HBAI/xkN'
        'CP8ZDQj/GQ0I/xkNCP8cEAj/DgMI/zcqCP9IPAj/DQEI/xwQCP8ZDQj/GQ0I/BoOCP8ZDAizGQwI8hkNCP4ZDQj/HBAI/w0BCP9HOgj/zLwI/7'
        'eoCP8tIAj/EQUI/xwQCP8ZDQj/GQ0I/xwQCP8RBQj/LCAI/7GoCf/EvAn/RDoI/w0BCP8cEAj/GQ0I/xkNCP4ZDAjyGQ0I/xkNCP8bDwj/DQEI'
        '/0Y5CP/FuAj/wrYJ/8e8Cf+xpwn/LCEI/xEFCP8cEAj/HBAI/xEFCP8sIQj/q6gJ/7+9Cv+4uAr/ubkK/0I6CP8OAQj/Gw8I/xkNCP8ZDQj/GQ'
        '0I/xsPCP8SBQj/RjwI/8O8Cf+9twn/urUJ/7i0Cf/Bvgr/qqgK/yshCP8UBgj/FAYI/yshCP+nqAr/u74K/7C0Cv+xtgr/srcL/7W9C/9CPAn/'
        'EgUI/xoPCP8ZDQj/GQ0I/xoOCP8UCAj/NSoI/6qpCv+7vQr/s7QK/7W4Cv+xtAr/ub8K/6aoC/8lHwb/JR8G/6SoC/+1vgv/q7QL/624C/+qtA'
        'v/sL4L/56pC/8zKwn/FQgI/xoOCP8ZDQj/GQ0I/xkNCP8bDwj/DwMI/yogCP+jqAr/tb4L/6y0C/+uuAv/q7MM/6/EB/+jlhb/opYW/6zECP+n'
        'tA3/qLkM/6S1DP+svwz/mKkM/ykgCf8QAwj/Gw8I/xkNCP8ZDQj/GQ0I/xkNCP8ZDQj/HBAI/xIFCP8qIQj/nKgL/66/DP+ntA3/o7wJ/6yuE/'
        '/we03/8HpP/6muFP+fvAn/obQO/6bADf+UqQz/KSEJ/xIECP8cEAj/GQ0I/xkNCP8ZDQj/GQ0I/xkNCP8ZDQj/GQ0I/xwQCP8SBQj/KSEJ/5io'
        'Df+kxAr/qK4U/+t6Sv/1b1T/9W5W/+t3Tv+krRX/ncQK/5GoDv8oIQn/EgUI/xwQCP8ZDQj/GQ0I/xkNCP8ZDQj/GQ0I/xkNCP8ZDQj/GQ0I/x'
        'kNCP8bEAj/FQUJ/yEhBv+VmhT/7X9I//ZwU//ydFD/8nNR//ZtV//sek//kJoV/yAhBf8WBQn/GxAI/xkNCP8ZDQj/GQ0I/xkNCP8ZDQj/GQ0I'
        '/xkNCP8ZDQj/GQ0I/xkNCP8dDwn/EAoF/zAWEP/aZkX/+ndQ//F1Tf/zc1D/83JS//FyUv/6cVj/2V9P/zAVEf8QCgT/HQ4J/xkNCP8ZDQj/GQ'
        '0I/xkNCP8ZDQj/GQ0I/xkNCP8ZDQj/GQ0I/x0PCf8OCAX/MhkP/+BwRP/+fU7/8XVL//R1Tv/xc0//8XJQ//NyU//wcFL//XVZ/99nUP8yGBH/'
        'DggE/x0PCf8ZDQj/GQ0I/xkNCP8ZDQj/GQ0I/xkNCP8ZDQj/HQ8J/w4IBf8yGg//33BC//1+TP/wdkn/9XdM//J1TP/4d1D/+HZS//FxUf/0cl'
        'P/729T//t0Wf/eZVD/MhgR/w4IBP8dDwn/GQ0I/xkNCP8ZDQj/GQ0I/xkNCP8cDgn/CwYE/zIZD//gckD//X9J//B4R//1eUr/8XVK//18UP/X'
        'aEX/12dG//15VP/vcFH/9HFU/+9uVP/7c1r/3mVR/zIYEf8MBwP/HA4J/xkNCP8ZDQj/GQ0I/xsOCP8TCgb/PyES/+F0Pv/8gEf/8XlF//V6SP'
        '/wd0f//X1N/+BuRv8uFw//LhcP/99rSv/8d1X/729S//RxVf/ublX/+nJa/99lUv8/Hhb/EwoG/xsOCf8ZDQj/GQ0I/xsOCf8PCAX/ViwY//qC'
        'RP/1fUT/83tF//F5Rf/9fkv/329D/zMZEP8RCQX/EQkF/zIZEP/fakr//HZV//BvUv/xb1X/8m9X//lxW/9VKB7/DwkE/xsOCf8ZDQj/GQ0I/x'
        'kNCP8cDwn/CQUE/1MrF//2f0T/9X1E//x/SP/gcUL/MxoP/w4IBf8dDwn/HQ8J/w4IBP8yGRD/32pL//t1Vv/0cVX/9XFX/1InHf8JBgL/HA4J'
        '/xkNCP8ZDQj/GQwI8hkNCP4ZDQj/HQ8J/wkFBP9TKxf/+4FF/+JzQP8yGQ//DggF/x0PCf8ZDQj/GQ0I/x0PCf8OCAT/MhgQ/+BqTP/6dVb/Uy'
        'cc/wkGAv8dDwn/GQ0I/xkNCP4ZDAjyGQwIsxoOCP8ZDQj8GQ0I/x0PCf8JBQT/ViwY/z8hEv8LBgT/HQ8J/xkNCP8ZDQj/GQ0I/xkNCP8dDwn/'
        'CwcD/z8fFf9WKR3/CQYC/x0PCf8ZDQj/GQ0I/BoOCP8ZDAizGg8KMRkNCPoaDQj/GQ0I/BkNCP8cDwn/DwgF/xMKBv8cDgn/GQ0I/xkNCP8ZDQ'
        'j/GQ0I/xkNCP8ZDQj/HA4J/xMKBv8PCAX/HA4J/xkNCP8ZDQj8Gg0I/xkNCPoaDwoxAAAAABgMCVUaDQj1Gg4I/xkNCP8ZDQj/Gw4J/xsOCP8Z'
        'DQj/GQ0I/xkNCP8ZDQj/GQ0I/xkNCP8ZDQj/GQ0I/xsOCf8bDgn/GQ0I/xkNCP8aDgj/Gg0I9RgMCVUAAAAAAAAAAwAAAAAYDgk1Gg0IrxkMCO'
        '4ZDQj+GQ0I/xkNCP8ZDQj/GQ0I/xkNCP8ZDQj/GQ0I/xkNCP8ZDQj/GQ0I/xkNCP8ZDQj/GQ0I/hkMCO4aDQivGA4JNQAAAAAAAAAD'
    ),
    32: (
        'AAAAAAAAAAMAAAAAGAwMFRkNB4AZDQjSGQ0I9xkNCP4ZDQj/GQ0I/xkNCP8ZDQj/GQ0I/xkNCP8ZDQj/GQ0I/xkNCP8ZDQj/GQ0I/xkNCP8ZDQ'
        'j/GQ0I/xkNCP8ZDQj/GQ0I/hkNCPcZDQjSGQ0HgBgMDBUAAAAAAAAAAwAAAAAAAAADAAAAABkOB0caDQjeGw4I/xoNCP8ZDQj/GQ0I/xkNCP8Z'
        'DQj/GQ0I/xkNCP8ZDQj/GQ0I/xkNCP8ZDQj/GQ0I/xkNCP8ZDQj/GQ0I/xkNCP8ZDQj/GQ0I/xkNCP8ZDQj/GQ0I/xoNCP8bDgj/Gg0I3hkOB0'
        'cAAAAAAAAAAwAAAAAaCwdEGg4I/hoOCP8ZDQj7GQ0I/hkNCP8ZDQj/Gg4I/xsPCP8ZDQj/GQ0I/xkNCP8ZDQj/GQ0I/xkNCP8ZDQj/GQ0I/xkN'
        'CP8ZDQj/GQ0I/xkNCP8bDwj/Gg4I/xkNCP8ZDQj/GQ0I/hkNCPsaDgj/Gg4I/hoLB0QAAAAAGg0NExgNB+UaDQj/GQ0I/BkNCP8ZDQj/GQ0I/x'
        'sPCP8XCwj/EgYI/xsPCP8ZDQj/GQ0I/xkNCP8ZDQj/GQ0I/xkNCP8ZDQj/GQ0I/xkNCP8ZDQj/Gw8I/xIGCP8XCwj/Gw8I/xkNCP8ZDQj/GQ0I'
        '/xkNCPwaDQj/GA0H5RoNDRMZDQeBGg4I/xkNCPwZDQj/GQ0I/xkNCP8bDwj/EwcI/yUZCP89MAj/DgMI/xwQCP8ZDQj/GQ0I/xkNCP8ZDQj/GQ'
        '0I/xkNCP8ZDQj/GQ0I/xwQCP8PAwj/PTAI/yUZCP8TBwj/Gw8I/xkNCP8ZDQj/GQ0I/xkNCPwaDgj/GQ0HgRgNCNcaDQj+GQ0I/RkNCP8ZDQj/'
        'Gw8I/xUJCP8aDQj/n48I/8u7CP9CNAj/DQEI/x0RCP8ZDQj/GQ0I/xkNCP8ZDQj/GQ0I/xkNCP8cEQj/DQEI/0A0CP/Guwn/mpAJ/xoNCP8WCQ'
        'j/Gw8I/xkNCP8ZDQj/GQ0I/RoNCP4YDQjXGA0I+RkNCP8ZDQj/GQ0I/xsPCP8VCQj/Gg4I/52PCP/QwAj/xrgI/8S2CP9CNgj/DQEI/xwRCP8Z'
        'DQj/GQ0I/xkNCP8ZDQj/HBEI/w4BCP9ANgj/vbYJ/764Cf/GwQn/lY8J/xoOCP8WCQj/Gw8I/xkNCP8ZDQj/GQ0I/xgNCPkZDQj/GQ0I/xkNCP'
        '8aDwj/EwcI/xoNCP+ajgj/zcIJ/76zCf++tAn/w7kJ/762Cf9BNgj/DgEI/xwRCP8ZDQj/GQ0I/xwRCP8OAQj/PzYI/7m3Cv+8uwr/trUK/7S0'
        'Cv/Cwwr/kY8J/xoOCP8UBwj/Gg8I/xkNCP8ZDQj/GQ0I/xkNCP8ZDQj/Gg4I/xcLCP8lGQj/mZAJ/8jBCf+5swn/vLcJ/7y3Cf+5tQn/vroJ/7'
        'm3Cv8/Ngn/DgEI/xwQCP8cEAj/DgEI/z42CP+1twr/uLsK/7K1Cv+ztwr/s7cK/6+0Cv+7wQv/jpEK/yQZCP8XCwj/Gg4I/xkNCP8ZDQj/GQ0I'
        '/xkNCP8bDwj/EwYI/zswCP++vAr/urkK/7a1Cv+4twr/t7cK/7e3Cv+0tQr/uLsK/7S3Cv8+Ngn/EQIJ/xECCf89Ngn/sbcL/7S6C/+utQv/sL'
        'cL/6+3C/+utwv/rLUL/665C/+wvAv/ODAJ/xMGCP8aDwj/GQ0I/xkNCP8ZDQj/GQ0I/xkNCP8bDwj/DwMI/z00Cf+0twr/t7oK/7G1Cv+ztwr/'
        'srcL/7G3C/+vtQv/s7sL/7G3DP82NAb/NTQG/6+3DP+wuwv/qrUL/6y3C/+rtwv/qrgL/6i1C/+suwz/qLcM/zo1Cf8QAwj/Gw8I/xkNCP8ZDQ'
        'j/GQ0I/xkNCP8ZDQj/GQ0I/xkNCP8cEAj/DgEI/z02Cf+vtwv/sboL/6y1C/+ttwv/rbcL/6y3C/+rtA3/qcEG/7ecH/+3nB//p8IG/6i0Df+o'
        'uAz/p7gM/6a4DP+ktgz/qLwM/6S4DP87Ngn/DwEI/xsQCP8ZDQj/GQ0I/xkNCP8ZDQj/GQ0I/xkNCP8ZDQj/GQ0I/xkNCP8cEQj/DwEI/zw2Cf'
        '+ptwv/rLsM/6e2DP+ouAz/qbYN/6G9B/+2phz/9HNT//RyVP+0pR3/nr0H/6W3Dv+iuAz/oLYM/6S8Df+gtw3/OjYJ/w8BCP8cEQj/GQ0I/xkN'
        'CP8ZDQj/GQ0I/xkNCP8ZDQj/GQ0I/xkNCP8ZDQj/GQ0I/xkNCP8cEQj/DwEI/zs2Cf+kuAz/p7wM/6S1Df+dvQj/tKcc//JzUf/0cVP/9HBU//'
        'JwVP+yph7/mL0I/561Dv+fvA3/nLcN/zk2Cf8QAQj/HBEI/xkNCP8ZDQj/GQ0I/xkNCP8ZDQj/GQ0I/xkNCP8ZDQj/GQ0I/xkNCP8ZDQj/GQ0I'
        '/xkNCP8cEQj/DwEI/zk2Cf+itw7/nMEJ/7CmHP/ydE//9XJS//JzUf/yc1L/9W9V//JwVP+tpR7/lsIJ/5u3D/83Ngn/EAEI/xwRCP8ZDQj/GQ'
        '0I/xkNCP8ZDQj/GQ0I/xkNCP8ZDQj/GQ0I/xkNCP8ZDQj/GQ0I/xkNCP8ZDQj/GQ0I/xkNCP8cEAj/EwIJ/y42Bf+qoRz/83dN//RzUP/ydU//'
        '83NR//NyUv/yclL/9W5W//JxVf+loB//LTcE/xQBCf8bEAj/GQ0I/xkNCP8ZDQj/GQ0I/xkNCP8ZDQj/GQ0I/xkNCP8ZDQj/GQ0I/xkNCP8ZDQ'
        'j/GQ0I/xkNCP8ZDQj/GQ0I/x0PCf8LBwP/SiIY/+1vTP/3dk//8XVN//N0T//zc1H/83JS//NyU//xcVP/9nBW/+xoVv9KIBv/CwgC/x0PCv8Z'
        'DQj/GQ0I/xkNCP8ZDQj/GQ0I/xkNCP8ZDQj/GQ0I/xkNCP8ZDQj/GQ0I/xkNCP8ZDQj/GQ0I/xkNCP8eDwn/CgYE/00nGP/zeUr/+XpN//J1TP'
        '/zdU7/83VP//N0UP/zc1H/83JS//NxU//xcFP/93NX//JwVv9NJBv/CgYC/x4PCv8ZDQj/GQ0I/xkNCP8ZDQj/GQ0I/xkNCP8ZDQj/GQ0I/xkN'
        'CP8ZDQj/GQ0I/xkNCP8ZDQj/Hg8J/woFBP9NJxf/8nlJ//h6S//xdkr/9HdM//R2Tf/zdU7/8nRP//JzUP/zc1L/83JT//NxVP/wb1T/9nFX//'
        'FuV/9NJBv/CgYC/x4PCv8ZDQj/GQ0I/xkNCP8ZDQj/GQ0I/xkNCP8ZDQj/GQ0I/xkNCP8ZDQj/GQ0I/x4PCf8KBQT/TScX//J6R//4fEn/8XdI'
        '//R4Sv/0d0v/9HZN//J0Tf/1dlD/9XVR//FyUP/zclL/83FT//NxVP/wb1T/9nFY//FuV/9NJBv/CgYC/x4PCv8ZDQj/GQ0I/xkNCP8ZDQj/GQ'
        '0I/xkNCP8ZDQj/GQ0I/xkNCP8dDwn/CgUE/04oFv/ye0X/+H1I//F5R//0eUn/9HhK//R3S//ydUv/+XlP/+pxS//qcEz/+HZS//FxUf/zclP/'
        '83FU//NwVf/vblX/9nBZ//FtWP9NJBz/CgYC/x0PCf8ZDQj/GQ0I/xkNCP8ZDQj/GQ0I/xkNCP8ZDQj/HA4J/wwGBf9MJxb/8nxE//l+Rv/yek'
        'X/9HpH//R5SP/0eUn/8XdK//h5Tf/yd03/RyMX/0cjF//ydFD/93VS//BxUf/zcVP/83FU//NwVf/vblX/9nBZ//FtWf9LIxv/DAcD/xwOCf8Z'
        'DQj/GQ0I/xkNCP8ZDQj/GQ0I/xsOCf8QCAb/RiQU//mBRP/3fkT/83tE//V8Rf/0e0b/9HpI//F4SP/4ekv/8ndL/04mGP8MBwT/DAcE/04mGf'
        '/xc1D/93VT//BxUv/zcVT/83BV//JvVv/wblb/9G5Z//dwW/9GIRn/EAkF/xsOCf8ZDQj/GQ0I/xkNCP8ZDQj/Gg4I/xYMB/8pFQz/wmU1//+F'
        'Rv/xekP/9XxF//V7Rv/xeUb/+HxJ//J4Sf9OJxj/CgYD/x0PCf8dDwn/CgYD/00mGf/xc1H/93RT//BwUv/zcVT/83BV/+5tVf//dFz/wVhG/y'
        'kUDv8WDAf/Gg0I/xkNCP8ZDQj/GQ0I/xkNCP8ZDQj/Gw4J/xEJBv8aDQj/wWQ1//+FR//xekP/83pF//h9SP/yekf/TicY/woFA/8eDwn/GQ0I'
        '/xkNCP8eDwn/CgYD/00lGv/xclH/93RU//FwU//vblP//3Zb/79YRf8aDQj/EQoF/xsOCf8ZDQj/GQ0I/xkNCP8YDQj5GQ0I/xkNCP8ZDQj/HA'
        '4J/xQLB/8bDgj/wWM1//+ER//2fUX/83tG/04nF/8KBQT/Hg8J/xkNCP8ZDQj/GQ0I/xkNCP8eDwn/CgYD/00lGv/yclL/9XJU//93Wf/AWUP/'
        'Gg4I/xQLBv8cDgn/GQ0I/xkNCP8ZDQj/GA0I+RgNCNcaDQj+GQ0I/RkNCP8ZDQj/HA4J/xQLB/8aDQj/wmQ2//iARv9MJxb/CgUE/x4PCf8ZDQ'
        'j/GQ0I/xkNCP8ZDQj/GQ0I/xkNCP8eDwn/CgYD/0wlGf/3dVT/wltC/xoNCP8UCwb/HA4J/xkNCP8ZDQj/GQ0I/RoNCP4YDQjXGQ0HgRoOCP8Z'
        'DQj8GQ0I/xkNCP8ZDQj/HA4J/xEJBv8pFQz/RyQU/wwGBP8dDwn/GQ0I/xkNCP8ZDQj/GQ0I/xkNCP8ZDQj/GQ0I/xkNCP8dDwn/DAcD/0YiF/'
        '8pFA3/EQkF/xwOCf8ZDQj/GQ0I/xkNCP8ZDQj8Gg4I/xkNB4EaDQ0TGA0H5RoNCP8ZDQj8GQ0I/xkNCP8ZDQj/Gw4J/xYLB/8QCQb/HA4J/xkN'
        'CP8ZDQj/GQ0I/xkNCP8ZDQj/GQ0I/xkNCP8ZDQj/GQ0I/xkNCP8cDgn/EAkF/xYMB/8bDgn/GQ0I/xkNCP8ZDQj/GQ0I/BoNCP8YDQflGg0NEw'
        'AAAAAaCwdEGg4I/hoOCP8ZDQj7GQ0I/hkNCP8ZDQj/Gg4I/xsOCf8ZDQj/GQ0I/xkNCP8ZDQj/GQ0I/xkNCP8ZDQj/GQ0I/xkNCP8ZDQj/GQ0I'
        '/xkNCP8bDgn/Gg0I/xkNCP8ZDQj/GQ0I/hkNCPsaDgj/Gg4I/hoLB0QAAAAAAAAAAwAAAAAZDgdHGg0I3hsOCP8aDQj/GQ0I/xkNCP8ZDQj/GQ'
        '0I/xkNCP8ZDQj/GQ0I/xkNCP8ZDQj/GQ0I/xkNCP8ZDQj/GQ0I/xkNCP8ZDQj/GQ0I/xkNCP8ZDQj/GQ0I/xkNCP8aDQj/Gw4I/xoNCN4ZDgdH'
        'AAAAAAAAAAMAAAAAAAAAAwAAAAAYDAwVGQ0HgBkNCNIZDQj3GQ0I/hkNCP8ZDQj/GQ0I/xkNCP8ZDQj/GQ0I/xkNCP8ZDQj/GQ0I/xkNCP8ZDQ'
        'j/GQ0I/xkNCP8ZDQj/GQ0I/xkNCP8ZDQj+GQ0I9xkNCNIZDQeAGAwMFQAAAAAAAAADAAAAAA=='
    ),
}
# /BRAND

# Green ready, light grey working (blue would vanish into the mark's own blue), amber needs attention.
BADGE_COLOURS = {'ready': (34, 197, 94), 'working': (226, 232, 240), 'attention': (245, 158, 11)}
BADGE_RING = (10, 14, 24)  # the mark's dark square, so the badge stands apart from it


def mark_pixels(size):
    return bytearray(base64.b64decode(''.join(XPOT_MARK[size])))


def with_badge(pixels, size, rgb):
    """The mark with a round status badge at the bottom right (a dark ring around it)."""
    radius = max(2.6, size * 0.18)
    ring = radius + max(1.0, size / 24)
    cx = cy = size - ring - 0.25
    for y in range(size):
        for x in range(size):
            distance = ((x + 0.5 - cx) ** 2 + (y + 0.5 - cy) ** 2) ** 0.5
            if distance > ring + 0.5:
                continue
            colour = rgb if distance <= radius else BADGE_RING
            edge = radius if distance <= radius else ring
            coverage = max(0.0, min(1.0, edge + 0.5 - distance))
            offset = ((size - 1 - y) * size + x) * 4  # rows are stored bottom-up
            b, g, r, a = pixels[offset:offset + 4]
            mix = lambda old, new: int(old + (new - old) * coverage)  # noqa: E731
            pixels[offset:offset + 4] = bytes((mix(b, colour[2]), mix(g, colour[1]), mix(r, colour[0]), max(a, int(255 * coverage))))
    return pixels


def ico(images):
    """.ico bytes from [(size, BGRA bottom-up pixels)], 32-bit with alpha."""
    entries, blobs = [], []
    offset = 6 + 16 * len(images)
    for size, pixels in images:
        mask = bytes(((size + 31) // 32) * 4 * size)
        blob = struct.pack('<IiiHHIIiiII', 40, size, size * 2, 1, 32, 0, len(pixels) + len(mask), 0, 0, 0, 0) + bytes(pixels) + mask
        entries.append(struct.pack('<BBBBHHII', size, size, 0, 0, 1, 32, len(blob), offset))
        blobs.append(blob)
        offset += len(blob)
    return struct.pack('<HHH', 0, 1, len(images)) + b''.join(entries) + b''.join(blobs)


def brand_icon(state=None):
    """The Xpot mark at every tray size, with the badge of `state` ('ready', 'working', 'attention'), or plain."""
    images = []
    for size in sorted(XPOT_MARK):
        pixels = mark_pixels(size)
        images.append((size, with_badge(pixels, size, BADGE_COLOURS[state]) if state else pixels))
    return ico(images)


UNINSTALL_KEY = r'Software\Microsoft\Windows\CurrentVersion\Uninstall\{6C1E2D4B-7A8F-4E3B-9C55-1F0A2B3C4D5E}_is1'


def show_version_in_windows():
    """Apps & features shows the version running now (it updates itself; the installer only knew the first one)."""
    if os.name != 'nt':
        return
    try:
        import winreg
        with winreg.OpenKey(winreg.HKEY_CURRENT_USER, UNINSTALL_KEY, 0, winreg.KEY_SET_VALUE) as key:
            winreg.SetValueEx(key, 'DisplayVersion', 0, winreg.REG_SZ, str(version_number(VERSION)))
    except OSError:
        pass  # not installed by the installer (a copy run by hand): nothing to show


class Tray:
    """The icon by the clock (Windows): the Xpot mark, its badge says where this computer stands (green ready, blue
    working, amber needs attention), and its menu opens Xpot, switches automatic updates, installs an update now and quits. It runs a
    window message loop on the main thread; other threads only post it a message to look again."""

    WM_TRAY = 0x8000 + 1     # WM_APP + 1: the icon was clicked
    WM_REFRESH = 0x8000 + 2  # look at the state again
    WM_QUIT_TRAY = 0x8000 + 3
    MENU_OPEN, MENU_AUTO, MENU_UPDATE, MENU_QUIT = 1, 2, 3, 4

    def __init__(self, desktop, note=None):
        import ctypes
        from ctypes import wintypes
        self.ctypes, self.wt = ctypes, wintypes
        self.desktop = desktop
        self.note = note
        self.user32 = ctypes.WinDLL('user32', use_last_error=True)
        self.shell32 = ctypes.WinDLL('shell32', use_last_error=True)
        self.kernel32 = ctypes.WinDLL('kernel32', use_last_error=True)
        self.hwnd = None
        self.icons = {}
        self.shown = None
        self._types()

    def _types(self):
        ctypes, wt = self.ctypes, self.wt
        self.LRESULT = ctypes.c_ssize_t
        self.WNDPROC = ctypes.WINFUNCTYPE(self.LRESULT, wt.HWND, wt.UINT, wt.WPARAM, wt.LPARAM)

        class WNDCLASSW(ctypes.Structure):
            _fields_ = [('style', wt.UINT), ('lpfnWndProc', self.WNDPROC), ('cbClsExtra', ctypes.c_int), ('cbWndExtra', ctypes.c_int),
                        ('hInstance', wt.HINSTANCE), ('hIcon', wt.HICON), ('hCursor', wt.HANDLE), ('hbrBackground', wt.HBRUSH),
                        ('lpszMenuName', wt.LPCWSTR), ('lpszClassName', wt.LPCWSTR)]

        class GUID(ctypes.Structure):
            _fields_ = [('Data1', ctypes.c_ulong), ('Data2', ctypes.c_ushort), ('Data3', ctypes.c_ushort), ('Data4', ctypes.c_ubyte * 8)]

        class NOTIFYICONDATAW(ctypes.Structure):
            _fields_ = [('cbSize', wt.DWORD), ('hWnd', wt.HWND), ('uID', wt.UINT), ('uFlags', wt.UINT), ('uCallbackMessage', wt.UINT),
                        ('hIcon', wt.HICON), ('szTip', wt.WCHAR * 128), ('dwState', wt.DWORD), ('dwStateMask', wt.DWORD),
                        ('szInfo', wt.WCHAR * 256), ('uVersion', wt.UINT), ('szInfoTitle', wt.WCHAR * 64), ('dwInfoFlags', wt.DWORD),
                        ('guidItem', GUID), ('hBalloonIcon', wt.HICON)]

        self.WNDCLASSW, self.NOTIFYICONDATAW = WNDCLASSW, NOTIFYICONDATAW
        u = self.user32
        u.DefWindowProcW.argtypes = [wt.HWND, wt.UINT, wt.WPARAM, wt.LPARAM]
        u.DefWindowProcW.restype = self.LRESULT
        u.RegisterClassW.argtypes = [ctypes.POINTER(WNDCLASSW)]
        u.RegisterClassW.restype = wt.ATOM
        u.CreateWindowExW.argtypes = [wt.DWORD, wt.LPCWSTR, wt.LPCWSTR, wt.DWORD, ctypes.c_int, ctypes.c_int, ctypes.c_int, ctypes.c_int,
                                      wt.HWND, wt.HMENU, wt.HINSTANCE, wt.LPVOID]
        u.CreateWindowExW.restype = wt.HWND
        u.LoadImageW.argtypes = [wt.HINSTANCE, wt.LPCWSTR, wt.UINT, ctypes.c_int, ctypes.c_int, wt.UINT]
        u.LoadImageW.restype = wt.HANDLE
        u.CreatePopupMenu.restype = wt.HMENU
        u.AppendMenuW.argtypes = [wt.HMENU, wt.UINT, ctypes.c_size_t, wt.LPCWSTR]
        u.TrackPopupMenu.argtypes = [wt.HMENU, wt.UINT, ctypes.c_int, ctypes.c_int, ctypes.c_int, wt.HWND, wt.LPVOID]
        u.TrackPopupMenu.restype = ctypes.c_int
        u.DestroyMenu.argtypes = [wt.HMENU]
        u.GetCursorPos.argtypes = [ctypes.POINTER(wt.POINT)]
        u.SetForegroundWindow.argtypes = [wt.HWND]
        u.PostMessageW.argtypes = [wt.HWND, wt.UINT, wt.WPARAM, wt.LPARAM]
        u.GetMessageW.argtypes = [ctypes.POINTER(wt.MSG), wt.HWND, wt.UINT, wt.UINT]
        u.TranslateMessage.argtypes = [ctypes.POINTER(wt.MSG)]
        u.DispatchMessageW.argtypes = [ctypes.POINTER(wt.MSG)]
        u.DispatchMessageW.restype = self.LRESULT
        u.PostQuitMessage.argtypes = [ctypes.c_int]
        u.RegisterWindowMessageW.argtypes = [wt.LPCWSTR]
        u.RegisterWindowMessageW.restype = wt.UINT
        u.DestroyWindow.argtypes = [wt.HWND]
        self.shell32.Shell_NotifyIconW.argtypes = [wt.DWORD, ctypes.POINTER(NOTIFYICONDATAW)]
        self.kernel32.GetModuleHandleW.argtypes = [wt.LPCWSTR]
        self.kernel32.GetModuleHandleW.restype = wt.HMODULE

    def _icon(self, state):
        if state not in self.icons:
            folder = os.path.join(root(), 'icons')
            os.makedirs(folder, exist_ok=True)
            path = os.path.join(folder, f'xpot-{state}.ico')
            with open(path, 'wb') as f:
                f.write(brand_icon(None if state == 'plain' else state))
            # The plain mark is the notices' picture (32 px); the tray takes the size Windows uses there.
            size = 32 if state == 'plain' else 0
            self.icons[state] = self.user32.LoadImageW(None, path, 1, size, size, 0x10 | (0 if size else 0x40))  # IMAGE_ICON, LR_LOADFROMFILE | LR_DEFAULTSIZE
        return self.icons[state]

    def _data(self, flags):
        data = self.NOTIFYICONDATAW()
        data.cbSize = self.ctypes.sizeof(self.NOTIFYICONDATAW)
        data.hWnd = self.hwnd
        data.uID = 1
        data.uFlags = flags
        data.uCallbackMessage = self.WM_TRAY
        return data

    def _show(self, add=False):
        state, line = self.desktop.tray_state()
        if not add and self.shown == (state, line):
            return
        self.shown = (state, line)
        data = self._data(0x1 | 0x2 | 0x4)  # NIF_MESSAGE | NIF_ICON | NIF_TIP
        data.hIcon = self._icon(state)
        data.szTip = f'Xpot Desktop · {line}'[:127]
        self.shell32.Shell_NotifyIconW(0 if add else 1, self.ctypes.byref(data))  # NIM_ADD / NIM_MODIFY

    def balloon(self, title, body):
        data = self._data(0x10)  # NIF_INFO
        data.szInfoTitle = title[:63]
        data.szInfo = body[:255]
        data.dwInfoFlags = 0x4 | 0x20  # NIIF_USER | NIIF_LARGE_ICON: the Xpot mark, not Windows' "i"
        data.hBalloonIcon = self._icon('plain')
        self.shell32.Shell_NotifyIconW(1, self.ctypes.byref(data))

    def _menu(self):
        u, desktop = self.user32, self.desktop
        _, line = desktop.tray_state()
        auto = bool(load_settings().get('autoUpdate', True))
        menu = u.CreatePopupMenu()
        u.AppendMenuW(menu, 0x1, 0, line)  # MF_GRAYED: where it stands
        u.AppendMenuW(menu, 0x800, 0, None)  # MF_SEPARATOR
        u.AppendMenuW(menu, 0x0, self.MENU_OPEN, text('open'))
        u.AppendMenuW(menu, 0x800, 0, None)
        u.AppendMenuW(menu, 0x8 if auto else 0x0, self.MENU_AUTO, text('autoUpdate'))  # MF_CHECKED
        update_label = text('installUpdate', version=desktop.update['version']) if desktop.update else text('checkUpdate')
        u.AppendMenuW(menu, 0x1 if desktop.updating else 0x0, self.MENU_UPDATE, update_label)
        u.AppendMenuW(menu, 0x800, 0, None)
        u.AppendMenuW(menu, 0x0, self.MENU_QUIT, text('quit'))
        point = self.wt.POINT()
        u.GetCursorPos(self.ctypes.byref(point))
        u.SetForegroundWindow(self.hwnd)
        choice = u.TrackPopupMenu(menu, 0x100 | 0x80 | 0x2, point.x, point.y, 0, self.hwnd, None)  # RETURNCMD | NONOTIFY | RIGHTBUTTON
        u.PostMessageW(self.hwnd, 0, 0, 0)  # WM_NULL: the menu closes when clicking elsewhere
        u.DestroyMenu(menu)
        if choice == self.MENU_OPEN:
            desktop.open_xpot()
        elif choice == self.MENU_AUTO:
            save_settings({'autoUpdate': not auto})
            self._show()
        elif choice == self.MENU_UPDATE:
            threading.Thread(target=self._update_now, daemon=True).start()
        elif choice == self.MENU_QUIT:
            desktop.stop()

    def _update_now(self):
        desktop = self.desktop
        if not desktop.update:
            desktop.check_update()
        if desktop.update:
            desktop.request_update()
        else:
            self.balloon('Xpot Desktop', text('upToDate'))

    def _proc(self, hwnd, message, wparam, lparam):
        if message == self.WM_TRAY and lparam in (0x202, 0x205):  # WM_LBUTTONUP, WM_RBUTTONUP
            self._menu()
            return 0
        if message == self.WM_REFRESH:
            self._show()
            return 0
        if message == self.WM_QUIT_TRAY:
            self.shell32.Shell_NotifyIconW(2, self.ctypes.byref(self._data(0)))  # NIM_DELETE
            self.user32.DestroyWindow(hwnd)
            self.user32.PostQuitMessage(0)
            return 0
        if message == self.taskbar_created:  # Explorer restarted: put the icon back
            self._show(add=True)
            return 0
        return self.user32.DefWindowProcW(hwnd, message, wparam, lparam)

    def run(self):
        u = self.user32
        self._wndproc = self.WNDPROC(self._proc)  # kept: Windows calls it for as long as the window lives
        instance = self.kernel32.GetModuleHandleW(None)
        window_class = self.WNDCLASSW(lpfnWndProc=self._wndproc, hInstance=instance, lpszClassName='XpotDesktopTray')
        u.RegisterClassW(self.ctypes.byref(window_class))
        self.taskbar_created = u.RegisterWindowMessageW('TaskbarCreated')
        self.hwnd = u.CreateWindowExW(0, 'XpotDesktopTray', 'Xpot Desktop', 0, 0, 0, 0, 0, None, None, instance, None)
        self._show(add=True)
        if self.note:
            self.balloon(*self.note)
        self.desktop.on_change = lambda: u.PostMessageW(self.hwnd, self.WM_REFRESH, 0, 0)
        self.desktop.on_stop = lambda: u.PostMessageW(self.hwnd, self.WM_QUIT_TRAY, 0, 0)
        if self.desktop.stopped.is_set():
            self.desktop.on_stop()
        message = self.wt.MSG()
        while u.GetMessageW(self.ctypes.byref(message), None, 0, 0) > 0:
            u.TranslateMessage(self.ctypes.byref(message))
            u.DispatchMessageW(self.ctypes.byref(message))
        self.desktop.on_change = None
        self.desktop.on_stop = None


def answers_as(version, seconds):
    """Whether an Xpot Desktop of `version` answers on this computer within `seconds`."""
    deadline = time.monotonic() + seconds
    while time.monotonic() < deadline:
        try:
            request = urllib.request.Request(f'http://127.0.0.1:{PORT}/status', headers={'Origin': DEFAULT_SERVER})
            with urllib.request.urlopen(request, timeout=3) as res:
                if json.loads(res.read()).get('version') == version:
                    return True
        except (OSError, ValueError, urllib.error.URLError):
            pass
        time.sleep(1)
    return False


def start_detached(*args):
    """Start this program again: through XpotDesktop.exe when installed (Windows shows it as Xpot Desktop, not Python)."""
    flags = 0x00000008 | 0x00000200 if os.name == 'nt' else 0  # DETACHED_PROCESS | CREATE_NEW_PROCESS_GROUP
    launcher = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'XpotDesktop.exe')
    command = [launcher, *args] if os.name == 'nt' and os.path.exists(launcher) else [sys.executable, os.path.abspath(__file__), *args]
    return subprocess.Popen(command, creationflags=flags, close_fds=True)


def perform_update(server):
    """Swap this file for the checked new one and start it; if it does not answer within a minute, put this one back."""
    new_version = DESKTOP.update['version']
    me = os.path.abspath(__file__)
    previous = me + '.prev'
    server.shutdown()
    server.server_close()
    shutil.copyfile(me, previous)
    os.replace(DESKTOP.update_file, me)
    child = start_detached('--updated-from', VERSION)
    if answers_as(new_version, 60):
        return
    if os.name == 'nt':  # the launcher and the Python it started
        subprocess.run(['taskkill', '/PID', str(child.pid), '/T', '/F'], capture_output=True, creationflags=NO_WINDOW)
    else:
        child.kill()
    os.replace(previous, me)
    start_detached('--update-failed', new_version)


def main():
    args = sys.argv[1:]
    try:
        server = ThreadingHTTPServer(('127.0.0.1', PORT), Handler)
    except OSError:
        sys.exit(0)  # It is already running.
    threading.Thread(target=server.serve_forever, daemon=True).start()
    threading.Thread(target=DESKTOP.keep_running, daemon=True).start()
    show_version_in_windows()
    note = None
    if '--updated-from' in args:
        note = (text('updatedTitle'), text('updatedBody', version=VERSION))
    elif '--update-failed' in args and args.index('--update-failed') + 1 < len(args):
        note = (text('updateFailedTitle'), text('updateFailedBody', version=args[args.index('--update-failed') + 1]))
    if os.name == 'nt':
        try:
            Tray(DESKTOP, note).run()
        except Exception:  # noqa: BLE001 - without the icon the program still works; it stops with the computer
            DESKTOP.stopped.wait()
    else:
        DESKTOP.stopped.wait()
    DESKTOP.stop_bench()
    if DESKTOP.restart_for_update:
        perform_update(server)
    else:
        server.shutdown()


if __name__ == '__main__':
    main()
