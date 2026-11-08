#!/usr/bin/env python3
"""HTTP contract regression for Raspberry Pi authentication post-deploy checks."""

import importlib.util
import json
import tempfile
import unittest
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from threading import Thread

SOURCE = Path(__file__).resolve().parents[1] / "infra/pi3/verify-auth.py"
spec = importlib.util.spec_from_file_location("vuxo_verify_auth", SOURCE)
verifier = importlib.util.module_from_spec(spec)
spec.loader.exec_module(verifier)


class AuthVerificationTests(unittest.TestCase):
    def setUp(self):
        self.config = {
            "VUXO_MICROSOFT_CLIENT_ID": "microsoft-test-client",
            "VUXO_MICROSOFT_TENANT_ID": "common",
            "VUXO_GOOGLE_CLIENT_ID": "google-test-client.apps.googleusercontent.com",
            "VUXO_ALLOWED_ORIGIN": "https://vuxo.quest",
        }
        self.providers = {
            "microsoft": {"enabled": True, "clientId": self.config["VUXO_MICROSOFT_CLIENT_ID"], "tenantId": "common"},
            "google": {"enabled": True, "clientId": self.config["VUXO_GOOGLE_CLIENT_ID"]},
        }
        self.cors = "https://vuxo.quest"
        self.credentials = "true"
        self.payload = None
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)

    def write_env(self):
        path = Path(self.temp.name) / "production.env"
        path.write_text("\n".join(f"{key}={value}" for key, value in self.config.items()) + "\n", encoding="utf-8")
        return path

    def serve(self):
        state = self

        class Handler(BaseHTTPRequestHandler):
            def do_GET(self):
                body = state.payload if state.payload is not None else json.dumps(state.providers).encode()
                self.send_response(200)
                self.send_header("Content-Type", "application/json")
                self.send_header("Access-Control-Allow-Origin", state.cors)
                self.send_header("Access-Control-Allow-Credentials", state.credentials)
                self.send_header("Content-Length", str(len(body)))
                self.end_headers()
                self.wfile.write(body)

            def log_message(self, *_):
                pass

        server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
        self.addCleanup(server.server_close)
        server_thread = Thread(target=server.serve_forever, daemon=True)
        server_thread.start()
        self.addCleanup(lambda: (server.shutdown(), server_thread.join()))
        return f"http://127.0.0.1:{server.server_port}/api/auth/providers"

    def test_matching_both_providers_and_cors(self):
        expected = verifier.read_expected(self.write_env())
        verifier.verify_discovery(expected, self.serve())

    def test_missing_config_fails_before_deploy(self):
        self.config["VUXO_GOOGLE_CLIENT_ID"] = ""
        with self.assertRaisesRegex(ValueError, "VUXO_GOOGLE_CLIENT_ID"):
            verifier.read_expected(self.write_env())

    def test_wrong_public_origin_fails_before_deploy(self):
        self.config["VUXO_ALLOWED_ORIGIN"] = "https://vuxo.app"
        with self.assertRaisesRegex(ValueError, "canonical production origin"):
            verifier.read_expected(self.write_env())

    def test_disabled_provider_fails(self):
        self.providers["google"]["enabled"] = False
        with self.assertRaisesRegex(ValueError, "google provider is not enabled"):
            verifier.verify_discovery(verifier.read_expected(self.write_env()), self.serve())

    def test_wrong_provider_id_fails_without_disclosing_value(self):
        self.providers["microsoft"]["clientId"] = "wrong-client"
        with self.assertRaisesRegex(ValueError, "microsoft provider clientId") as caught:
            verifier.verify_discovery(verifier.read_expected(self.write_env()), self.serve())
        self.assertNotIn("wrong-client", str(caught.exception))

    def test_cors_mismatch_fails(self):
        self.cors = "https://different.example"
        with self.assertRaisesRegex(ValueError, "CORS origin mismatch"):
            verifier.verify_discovery(verifier.read_expected(self.write_env()), self.serve())

    def test_cors_credentials_missing_fails(self):
        self.credentials = ""
        with self.assertRaisesRegex(ValueError, "CORS credentials are missing"):
            verifier.verify_discovery(verifier.read_expected(self.write_env()), self.serve())

    def test_invalid_json_fails(self):
        self.payload = b"not json"
        with self.assertRaisesRegex(ValueError, "not valid JSON"):
            verifier.verify_discovery(verifier.read_expected(self.write_env()), self.serve())

    def test_oversize_response_fails(self):
        self.payload = b"x" * 20000
        with self.assertRaisesRegex(ValueError, "too large"):
            verifier.verify_discovery(verifier.read_expected(self.write_env()), self.serve())


if __name__ == "__main__":
    unittest.main()
