"""Mock-only regression coverage of the Pi3 safe connector-origin probe."""
import subprocess
import unittest
from unittest.mock import patch
from infra.pi3 import diagnose_origin as probe

API, CONNECTOR, IMAGE = "a" * 12, "b" * 12, "sha256:" + "c" * 64


class FakeDocker:
    def __init__(self):
        self.calls = []
        self.api_list, self.connector_list = API, CONNECTOR
        self.health = "healthy"
        self.api_nets = '{"vuxo_vuxo":{}}'
        self.connector_nets = '{"vuxo_vuxo":{}}'
        self.image = IMAGE
        self.http_code, self.exit_code = "200", 0
        self.fail_inspection = False

    def __call__(self, argv):
        self.calls.append(argv)
        if argv[:3] == ["docker", "ps", "-q"]:
            service = next(item.split("=")[-1] for item in argv
                           if item.startswith("label=com.docker.compose.service="))
            return 0, self.api_list if service == "api" else self.connector_list
        if argv[:2] == ["docker", "inspect"]:
            if self.fail_inspection:
                return 1, "PRIVATE-TOKEN"
            template, container = argv[3], argv[4]
            if template == probe.HEALTH:
                return 0, self.health
            if template == probe.NETWORKS:
                return 0, self.api_nets if container == API else self.connector_nets
            if template == "{{.Image}}":
                return 0, self.image
            raise AssertionError("unexpected inspection")
        if argv[:2] == ["docker", "run"]:
            return self.exit_code, self.http_code
        raise AssertionError("unexpected/unsafe command")


class OriginTests(unittest.TestCase):
    def result(self, fake):
        output = []
        status = probe.diagnose(run=fake, emit=output.append)
        return status, "\n".join(output)

    def test_reaches_api_from_connector_namespace_without_mutating_services(self):
        fake = FakeDocker()
        status, output = self.result(fake)
        self.assertEqual(status, 0)
        self.assertIn("reaches API origin HTTP 200", output)
        runs = [args for args in fake.calls if args[:2] == ["docker", "run"]]
        self.assertEqual(len(runs), 1)
        args = runs[0]
        self.assertEqual(args[args.index("--network") + 1], "container:" + CONNECTOR)
        self.assertEqual(args[args.index("--entrypoint") + 1], "curl")
        self.assertEqual(args[-1], "http://api:8080/health")
        for flag in ("--rm", "--pull=never", "--read-only", "--cap-drop=ALL",
                     "--security-opt=no-new-privileges", "--pids-limit"):
            self.assertIn(flag, args)
        for forbidden in ("--volume", "-v", "--env", "--publish", "--privileged"):
            self.assertNotIn(forbidden, args)
        self.assertTrue(all(item[0] == "docker" for item in fake.calls))
        self.assertTrue(all(item[1] in ("ps", "inspect", "run") for item in fake.calls))

    def test_missing_api_is_blocked(self):
        fake = FakeDocker()
        fake.api_list = ""
        self.assertEqual(self.result(fake)[0], 1)
        self.assertFalse(any(args[1] == "run" for args in fake.calls))

    def test_missing_connector_is_blocked(self):
        fake = FakeDocker()
        fake.connector_list = ""
        self.assertEqual(self.result(fake)[0], 1)

    def test_duplicate_containers_are_blocked(self):
        fake = FakeDocker()
        fake.api_list = API + "\n" + "d" * 12
        self.assertEqual(self.result(fake)[0], 1)

    def test_unhealthy_api_does_not_start_probe(self):
        fake = FakeDocker()
        fake.health = "unhealthy"
        self.assertEqual(self.result(fake)[0], 1)
        self.assertFalse(any(args[1] == "run" for args in fake.calls))

    def test_disjoint_networks_are_blocked(self):
        fake = FakeDocker()
        fake.connector_nets = '{"other":{}}'
        self.assertEqual(self.result(fake)[0], 1)
        self.assertFalse(any(args[1] == "run" for args in fake.calls))

    def test_malformed_docker_output_is_never_logged(self):
        fake = FakeDocker()
        fake.api_nets = "SECRET-DATA"
        status, output = self.result(fake)
        self.assertEqual(status, 1)
        self.assertNotIn("SECRET-DATA", output)

    def test_docker_errors_and_ids_never_logged(self):
        fake = FakeDocker()
        fake.fail_inspection = True
        status, output = self.result(fake)
        self.assertEqual(status, 1)
        for private in ("PRIVATE-TOKEN", API, CONNECTOR, IMAGE):
            self.assertNotIn(private, output)

    def test_invalid_image_id_rejected(self):
        fake = FakeDocker()
        fake.image = "registry.example/private-image"
        self.assertEqual(self.result(fake)[0], 1)

    def test_bad_origin_http_code_stays_redacted(self):
        fake = FakeDocker()
        fake.http_code = "502"
        status, output = self.result(fake)
        self.assertEqual(status, 1)
        self.assertIn("cannot confirm API origin HTTP 200", output)
        self.assertIn("probe: HTTP 502", output)

    def test_subprocess_timeout_and_stderr_hidden(self):
        with patch.object(probe.subprocess, "run",
                          side_effect=subprocess.TimeoutExpired(["docker"], 15)):
            self.assertEqual(probe.run_command(["docker", "ps"]), (-2, ""))
        with patch.object(probe.subprocess, "run",
                          return_value=subprocess.CompletedProcess(["docker"], 1, "visible", "SECRET")):
            self.assertEqual(probe.run_command(["docker", "ps"]), (1, "visible"))


    def test_fixed_categories_for_curl_docker_and_invalid_output(self):
        cases = [
            (0, "502", "HTTP 502"),
            (0, "200", "HTTP 200"),
            (0, "200 SECRET-LOCATION", "invalid HTTP status"),
            (0, "999", "invalid HTTP status"),
            (6, "private DNS server", "DNS resolution failure"),
            (7, "private IP", "TCP connection failure"),
            (28, "private token", "curl request timeout"),
            (35, "private certificate", "TLS handshake failure"),
            (60, "private certificate", "TLS certificate validation failure"),
            (52, "private body", "empty upstream reply"),
            (56, "private socket", "connection reset or closed"),
            (125, "docker secret", "Docker container launch failure"),
            (126, "docker secret", "Docker container execution failure"),
            (127, "docker secret", "Docker probe executable unavailable"),
            (-2, "private exception", "Docker subprocess timeout"),
            (-1, "private exception", "Docker subprocess unavailable"),
            (19, "private exception", "probe execution failure"),
            (None, "private exception", "probe execution failure"),
        ]
        for code, raw, category in cases:
            with self.subTest(code=code, raw=raw):
                self.assertEqual(probe.classify_http_result(code, raw), category)
                self.assertNotIn("private", category.lower())

    def test_safe_probe_rejects_invalid_target_before_docker(self):
        fake = FakeDocker()
        self.assertEqual(probe.probe_http(fake, CONNECTOR, IMAGE,
                                         "https://attacker.test/secret"),
                         "probe input rejected")
        self.assertEqual(probe.probe_http(fake, CONNECTOR, IMAGE, 
                                         "http://api:8080/health", max_time=900),
                         "probe input rejected")
        self.assertEqual(fake.calls, [])

    def test_dns_timeout_and_docker_launch_are_not_misreported_as_http(self):
        fake = FakeDocker()
        for code, message in [(6, "DNS resolution failure"),
                              (28, "curl request timeout"),
                              (125, "Docker container launch failure")]:
            fake.exit_code, fake.http_code = code, "502 PRIVATE_SECRET"
            with self.subTest(code=code):
                status, output = self.result(fake)
                self.assertEqual(status, 1)
                self.assertIn("probe: " + message, output)
                self.assertNotIn("PRIVATE_SECRET", output)


if __name__ == "__main__":
    unittest.main()
