"""The Bambu Lab printer on the local network, with no cloud and no account (the 3D repo's doc 02 and skill bambu-lan).

    FTPS  <ip>:990 (implicit TLS), user bblp, password = the printer's access code   → upload the .gcode.3mf
    MQTT  mqtts://<ip>:8883,       user bblp, password = the access code             → status, start a print

The access code is on the printer's screen (Settings → Network, LAN mode). It lives only in this computer's
%LOCALAPPDATA%\\XpotBench\\printer.json, written by `bench.py printer setup`, and is never sent to Xpot. The printer's
certificate is self-signed, so TLS is not verified (it is a device on the local network, as bambu-cli does).

Standard library only: a minimal MQTT 3.1.1 client (connect, subscribe, publish QoS 0) is enough for the two
messages the bench needs. Starting a print moves hardware: the bench does it only for an order an admin sent from
Xpot, and only when the printer is free.
"""
from __future__ import annotations

import ftplib
import json
import os
import socket
import ssl
import struct
import time
import uuid

USER = 'bblp'
FTPS_PORT = 990
MQTT_PORT = 8883
DEFAULT_URL = 'file:///sdcard/{file}'
FREE_STATES = ('IDLE', 'FINISH', 'FAILED')


class PrinterError(Exception):
    pass


# ─── Config ───────────────────────────────────────────────────────────────────

def config_path() -> str:
    base = os.environ.get('LOCALAPPDATA') or os.path.join(os.path.expanduser('~'), '.config')
    return os.path.join(base, 'XpotBench', 'printer.json')


def load_config() -> dict | None:
    path = config_path()
    if not os.path.exists(path):
        return None
    with open(path, encoding='utf-8') as f:
        cfg = json.load(f)
    return cfg if cfg.get('ip') and cfg.get('serial') and cfg.get('access_code') else None


def bambu_cli_machine() -> dict | None:
    """IP, serial and name from bambu-cli's config, when it was set up (the 3D repo's skill bambu-lan)."""
    path = os.path.join(os.environ.get('APPDATA', ''), 'xdg.config', 'bambu-cli', 'config.json')
    try:
        with open(path, encoding='utf-8') as f:
            machines = json.load(f).get('machines') or []
        return machines[0] if machines else None
    except (OSError, ValueError):
        return None


def save_config(cfg: dict) -> str:
    path = config_path()
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, 'w', encoding='utf-8') as f:
        json.dump(cfg, f, indent=2)
    return path


def _tls() -> ssl.SSLContext:
    ctx = ssl.create_default_context()
    ctx.check_hostname = False
    ctx.verify_mode = ssl.CERT_NONE           # the printer's own self-signed certificate, on the LAN
    return ctx


# ─── FTPS (implicit) ──────────────────────────────────────────────────────────

class ImplicitFTPS(ftplib.FTP_TLS):
    """FTP over TLS from the first byte (port 990), with the data channel reusing the control channel's session."""

    def connect(self, host='', port=FTPS_PORT, timeout=30, source_address=None):
        self.host, self.port, self.timeout = host, port, timeout
        sock = socket.create_connection((host, port), timeout)
        self.af = sock.family
        self.sock = self.context.wrap_socket(sock, server_hostname=host)
        self.file = self.sock.makefile('r', encoding=self.encoding)
        self.welcome = self.getresp()
        return self.welcome

    def ntransfercmd(self, cmd, rest=None):
        conn, size = ftplib.FTP.ntransfercmd(self, cmd, rest)
        if self._prot_p:
            conn = self.context.wrap_socket(conn, server_hostname=self.host, session=self.sock.session)
        return conn, size

    def store(self, name: str, data: bytes, blocksize=1 << 16):
        """STOR without the TLS shutdown the printer never answers (ftplib's storbinary would wait on it)."""
        self.voidcmd('TYPE I')
        conn = self.transfercmd('STOR ' + name)
        try:
            for i in range(0, len(data), blocksize):
                conn.sendall(data[i:i + blocksize])
        finally:
            conn.close()
        return self.voidresp()


def upload(cfg: dict, name: str, data: bytes) -> None:
    ftp = ImplicitFTPS(context=_tls())
    try:
        ftp.connect(cfg['ip'], FTPS_PORT, timeout=30)
        ftp.login(USER, cfg['access_code'])
        ftp.prot_p()
        ftp.store(name, data)
    except (OSError, ftplib.Error) as err:
        raise PrinterError(f'upload to the printer failed: {err}') from err
    finally:
        try:
            ftp.quit()
        except Exception:  # noqa: BLE001 - closing a connection that already failed
            ftp.close()


# ─── MQTT 3.1.1, the minimum ──────────────────────────────────────────────────

def _varint(n: int) -> bytes:
    out = bytearray()
    while True:
        byte, n = n % 128, n // 128
        out.append(byte | (0x80 if n else 0))
        if not n:
            return bytes(out)


def _string(s: str) -> bytes:
    b = s.encode('utf-8')
    return struct.pack('!H', len(b)) + b


def connect_packet(client_id: str, username: str, password: str, keepalive: int = 60) -> bytes:
    variable = _string('MQTT') + bytes([4, 0xC2]) + struct.pack('!H', keepalive)   # level 4; username, password, clean session
    payload = _string(client_id) + _string(username) + _string(password)
    body = variable + payload
    return bytes([0x10]) + _varint(len(body)) + body


def subscribe_packet(packet_id: int, topic: str) -> bytes:
    body = struct.pack('!H', packet_id) + _string(topic) + bytes([0])
    return bytes([0x82]) + _varint(len(body)) + body


def publish_packet(topic: str, payload: bytes) -> bytes:
    body = _string(topic) + payload
    return bytes([0x30]) + _varint(len(body)) + body


class Mqtt:
    def __init__(self, cfg: dict, timeout: float = 15):
        raw = socket.create_connection((cfg['ip'], MQTT_PORT), timeout)
        self.sock = _tls().wrap_socket(raw, server_hostname=cfg['ip'])
        self.sock.settimeout(timeout)
        self.serial = cfg['serial']
        self.sock.sendall(connect_packet(f'xpot-bench-{uuid.uuid4().hex[:8]}', USER, cfg['access_code']))
        kind, body = self._read()
        if kind != 0x20 or len(body) < 2 or body[1] != 0:
            raise PrinterError(f'the printer refused the connection (code {body[1] if len(body) > 1 else "?"}): check the access code')
        self.sock.sendall(subscribe_packet(1, f'device/{self.serial}/report'))

    def _exact(self, n: int) -> bytes:
        buf = b''
        while len(buf) < n:
            chunk = self.sock.recv(n - len(buf))
            if not chunk:
                raise PrinterError('the printer closed the connection')
            buf += chunk
        return buf

    def _read(self):
        first = self._exact(1)[0]
        length, mult = 0, 1
        while True:
            byte = self._exact(1)[0]
            length += (byte & 0x7F) * mult
            if not byte & 0x80:
                break
            mult *= 128
        return first & 0xF0, self._exact(length)

    def request(self, message: dict) -> None:
        self.sock.sendall(publish_packet(f'device/{self.serial}/request', json.dumps(message).encode('utf-8')))

    def reports(self, seconds: float):
        """The printer's report messages for up to `seconds`."""
        end = time.monotonic() + seconds
        while time.monotonic() < end:
            try:
                kind, body = self._read()
            except socket.timeout:
                continue
            if kind != 0x30:
                continue
            topic_len = struct.unpack('!H', body[:2])[0]
            try:
                yield json.loads(body[2 + topic_len:].decode('utf-8'))
            except ValueError:
                continue

    def close(self):
        try:
            self.sock.sendall(bytes([0xE0, 0]))     # DISCONNECT
        except OSError:
            pass
        self.sock.close()


# ─── What the bench does with it ──────────────────────────────────────────────

def parse_status(report: dict, name: str, model: str | None = None) -> dict | None:
    """Xpot's PrinterStatus (shared/printProduction.ts) from a `print` report; None when it is not a full status."""
    p = report.get('print') or {}
    if 'gcode_state' not in p:
        return None
    state = str(p.get('gcode_state') or 'UNKNOWN').upper()
    if state not in ('IDLE', 'PREPARE', 'RUNNING', 'PAUSE', 'FINISH', 'FAILED', 'OFFLINE'):
        state = 'UNKNOWN'
    trays = []
    for unit in ((p.get('ams') or {}).get('ams') or []):
        for tray in unit.get('tray') or []:
            if 'id' in tray:
                colour = tray.get('tray_color')
                trays.append({'tray': int(unit.get('id', 0)) * 4 + int(tray['id']),
                              'colour': ('#' + colour[:6]) if colour else None, 'type': tray.get('tray_type') or None})
    error = p.get('print_error')
    return {
        'name': name,
        'model': model,
        'state': state,
        'percent': p.get('mc_percent'),
        'remainingMinutes': p.get('mc_remaining_time'),
        'subtask': p.get('subtask_name') or None,
        'layer': p.get('layer_num'),
        'totalLayers': p.get('total_layer_num'),
        'error': f'printer error {error}' if error else None,
        'ams': trays[:16],
    }


def status(cfg: dict, wait: float = 12) -> dict:
    mqtt = Mqtt(cfg)
    try:
        mqtt.request({'pushing': {'sequence_id': '0', 'command': 'pushall'}})
        for report in mqtt.reports(wait):
            parsed = parse_status(report, cfg.get('name') or 'Printer', cfg.get('model'))
            if parsed:
                return parsed
    finally:
        mqtt.close()
    raise PrinterError('no status from the printer')


def start_command(file_name: str, subtask: str, ams_mapping: list[int], url_template: str = DEFAULT_URL) -> dict:
    return {'print': {
        'sequence_id': '0', 'command': 'project_file', 'param': 'Metadata/plate_1.gcode',
        'project_id': '0', 'profile_id': '0', 'task_id': '0', 'subtask_id': '0', 'subtask_name': subtask,
        'file': file_name, 'url': url_template.format(file=file_name), 'md5': '',
        'timelapse': False, 'bed_type': 'auto', 'bed_levelling': True, 'flow_cali': False,
        'vibration_cali': True, 'layer_inspect': False, 'use_ams': True, 'ams_mapping': ams_mapping,
    }}


def send_and_start(cfg: dict, file_name: str, data: bytes, subtask: str, ams_mapping: list[int], wait: float = 90) -> dict:
    """Upload and start, only on a free printer. Returns the status that shows the job running."""
    before = status(cfg)
    if before['state'] not in FREE_STATES:
        raise PrinterError(f"the printer is busy ({before['state']}{', ' + before['subtask'] if before.get('subtask') else ''})")
    upload(cfg, file_name, data)
    mqtt = Mqtt(cfg)
    try:
        mqtt.request(start_command(file_name, subtask, ams_mapping, cfg.get('url_template') or DEFAULT_URL))
        mqtt.request({'pushing': {'sequence_id': '0', 'command': 'pushall'}})
        for report in mqtt.reports(wait):
            parsed = parse_status(report, cfg.get('name') or 'Printer', cfg.get('model'))
            # The printer was free a moment ago, so a job preparing or running now is this one.
            if parsed and parsed['state'] in ('PREPARE', 'RUNNING'):
                return parsed
    finally:
        mqtt.close()
    raise PrinterError('the printer took the file but did not start the job within 90 s: check its screen')
