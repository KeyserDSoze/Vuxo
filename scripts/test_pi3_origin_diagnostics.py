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
        self.assertNotIn("502", output)

    def test_subprocess_timeout_and_stderr_hidden(self):
        with patch.object(probe.subprocess, "run",
                          side_effect=subprocess.TimeoutExpired(["docker"], 15)):
            self.assertEqual(probe.run_command(["docker", "ps"]), (-1, ""))
        with patch.object(probe.subprocess, "run",
                          return_value=subprocess.CompletedProcess(["docker"], 1, "visible", "SECRET")):
            self.assertEqual(probe.run_command(["docker", "ps"]), (1, "visible"))


if __name__ == "__main__":
    unittest.main()
