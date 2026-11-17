import importlib.util
import json
from pathlib import Path
import tempfile
import unittest

spec = importlib.util.spec_from_file_location("ops", Path(__file__).with_name("telegram-ops.py"))
ops = importlib.util.module_from_spec(spec)
spec.loader.exec_module(ops)
ENV = {"OPS_TELEGRAM_ENABLED": "true", "OPS_ENVIRONMENT": "production", "GITHUB_ACTIONS": "true", "GITHUB_REF": "refs/heads/main", "XPOT_TELEGRAM_BOT_TOKEN": "123:abc", "XPOT_TELEGRAM_CHAT_ID": "-123"}


def healthy(url, payload=None):
    if url.endswith("/api/health"):
        return 200, b'{"ok":true}'
    if url.endswith("/api/health/ready"):
        return 200, json.dumps({"ok": True, "status": "ok", "checks": {"database": {"ok": True, "latency_ms": 5}}, "commit": None}).encode()
    if url.endswith("/api/version"):
        return 200, json.dumps({"commit": "a" * 40}).encode()
    return 200, b"<html></html>"


class OpsTests(unittest.TestCase):
    def test_gate_and_plain_text_acknowledgment(self):
        calls = []
        def send(url, payload):
            calls.append(json.loads(payload))
            return 200, b'{"ok":true}'
        self.assertTrue(ops.notify(dict(ENV, OPS_EVENT="deploy-succeeded"), send))
        self.assertIn("Resolvido", calls[0]["text"])
        self.assertNotIn("parse_mode", calls[0])
        for key, value in (("OPS_TELEGRAM_ENABLED", "false"), ("OPS_ENVIRONMENT", "development"), ("GITHUB_ACTIONS", "false"), ("GITHUB_REF", "refs/heads/dev"), ("XPOT_TELEGRAM_BOT_TOKEN", "invalid"), ("XPOT_TELEGRAM_CHAT_ID", "@public")):
            self.assertFalse(ops.notify(dict(ENV, **{key: value}), send))
        self.assertEqual(len(calls), 1)
        self.assertFalse(ops.notify(ENV, lambda *_: (200, b'{"ok":false}')))

    def test_readiness_not_liveness_proves_database(self):
        self.assertEqual(ops.probe_once(healthy)[0], "healthy")
        def broken(url):
            return (503, b'{}') if url.endswith("/ready") else healthy(url)
        self.assertEqual(ops.probe_once(broken)[0], "down")
        def slow(url):
            code, body = healthy(url)
            if url.endswith("/ready"):
                data = json.loads(body)
                data["checks"]["database"]["latency_ms"] = 1600
                body = json.dumps(data).encode()
            return code, body
        self.assertEqual(ops.probe_once(slow)[0], "degraded")

    def test_degraded_requires_two_observations(self):
        def slow(url):
            code, body = healthy(url)
            if url.endswith("/ready"):
                data = json.loads(body)
                data["status"] = "degraded"
                body = json.dumps(data).encode()
            return code, body
        calls = []
        def send(url, payload):
            calls.append(payload)
            return 200, b'{"ok":true}'
        with tempfile.TemporaryDirectory() as directory:
            state = Path(directory) / "state.json"
            ops.probe(state, ENV, slow, send, lambda _: None)
            self.assertEqual(len(calls), 0)
            ops.probe(state, ENV, slow, send, lambda _: None)
            ops.probe(state, ENV, slow, send, lambda _: None)
            self.assertEqual(len(calls), 1)
            self.assertEqual(json.loads(state.read_text())["observed"], "degraded")

    def test_exact_sha_and_missing_commit(self):
        self.assertEqual(ops.verify("a" * 40, healthy, lambda _: None), 0)
        def missing(url):
            return (200, b'{"commit":null}') if url.endswith("/version") else healthy(url)
        self.assertEqual(ops.verify("a" * 40, missing, lambda _: None), 1)
        self.assertEqual(ops.verify("b" * 40, healthy, lambda _: None), 1)

    def test_transition_only_and_retry_failed_delivery(self):
        calls = []
        def send(url, payload):
            calls.append(payload)
            return 200, b'{"ok":true}'
        with tempfile.TemporaryDirectory() as directory:
            state = Path(directory) / "state.json"
            run = lambda fetch, sender=send: ops.probe(state, ENV, fetch, sender, lambda _: None)
            run(healthy)
            self.assertEqual(calls, [])
            down = lambda _: (503, b'{}')
            run(down, lambda *_: (500, b'{}'))
            self.assertEqual(json.loads(state.read_text())["last_notified"], "healthy")
            run(down)
            run(down)
            self.assertEqual(len(calls), 1)
            run(healthy)
            self.assertEqual(len(calls), 2)
            self.assertEqual(json.loads(state.read_text())["observed"], "healthy")


if __name__ == "__main__":
    unittest.main()
