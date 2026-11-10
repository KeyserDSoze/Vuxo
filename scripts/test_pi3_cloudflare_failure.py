"""Offline safety and diagnostic coverage for automatic Cloudflare failure triage."""
import unittest
from infra.pi3 import diagnose_cloudflare_failure as triage

API = "a" * 12
CONNECTOR = "b" * 12
IMAGE = "sha256:" + "c" * 64


class FakeDocker:
    def __init__(self):
        self.calls = []
        self.running_api, self.running_connector = API, CONNECTOR
        self.health = "healthy"
        self.api_networks = '{"vuxo_vuxo":{}}'
        self.connector_networks = '{"vuxo_vuxo":{}}'
        self.image = IMAGE
        self.oom = "false"
        self.restarts = "0"
        self.internal_status = "200"
        self.external_status = "502"
        self.external_exit = 0
        self.internal_exit = 0
        self.internal_sequence = None
        self.inspect_failure = False

    def __call__(self, args):
        self.calls.append(args)
        if args[:3] == ["docker", "ps", "-q"]:
            service = next(s.rsplit("=", 1)[1] for s in args
                           if s.startswith("label=com.docker.compose.service="))
            return 0, self.running_api if service == "api" else self.running_connector
        if args[:2] == ["docker", "inspect"]:
            if self.inspect_failure:
                return 1, "PRIVATE_SECRET_ERROR"
            template, container = args[3], args[4]
            if template == triage.origin.HEALTH:
                return 0, self.health
            if template == triage.origin.NETWORKS:
                return 0, self.api_networks if container == API else self.connector_networks
            if template == "{{.Image}}":
                return 0, self.image
            if template == triage.OOM:
                return 0, self.oom
            if template == triage.RESTARTS:
                return 0, self.restarts
            raise AssertionError("Unexpected inspection template")
        if args[:2] == ["docker", "run"]:
            if args[-1] == "http://api:8080/health":
                if self.internal_sequence is not None:
                    return self.internal_sequence.pop(0)
                return self.internal_exit, self.internal_status
            if args[-1] == triage.PUBLIC_HEALTH:
                return self.external_exit, self.external_status
        raise AssertionError("Unexpected/unsafe command")


class EdgeTriageTests(unittest.TestCase):
    def evaluate(self, fake):
        lines = []
        result = triage.diagnose(run=fake, emit=lines.append)
        return result, "\n".join(lines)

    def test_internal_200_and_public_502_remain_distinct_and_informational(self):
        fake = FakeDocker()
        result, output = self.evaluate(fake)
        self.assertEqual(result, 0)
        self.assertIn("connector network namespace reaches API origin HTTP 200", output)
        self.assertIn("public API from Pi connector network namespace: HTTP 502", output)
        self.assertIn("not a successful release gate", output)
        runs = [args for args in fake.calls if args[:2] == ["docker", "run"]]
        self.assertEqual(len(runs), 2)
        for args in runs:
            self.assertEqual(args[args.index("--network") + 1], "container:" + CONNECTOR)
            self.assertEqual(args[args.index("--entrypoint") + 1], "curl")
            for required in ("--rm", "--pull=never", "--read-only", "--cap-drop=ALL",
                             "--security-opt=no-new-privileges", "--pids-limit"):
                self.assertIn(required, args)
            for forbidden in ("-v", "--volume", "--env", "--publish", "--privileged", "--mount"):
                self.assertNotIn(forbidden, args)
        self.assertTrue(all(command[0] == "docker" for command in fake.calls))
        self.assertTrue(all(command[1] in ("ps", "inspect", "run") for command in fake.calls))

    def test_public_200_is_observation_not_release_success(self):
        fake = FakeDocker()
        fake.external_status = "200"
        _, output = self.evaluate(fake)
        self.assertIn("public API from Pi connector network namespace: HTTP 200", output)
        self.assertIn("not a successful release gate", output)

    def test_public_colo_is_minimized_to_three_letters_without_extra_probes(self):
        fake = FakeDocker()
        full_ray = "1234abcdef987654-FCO"
        fake.external_status = "200\\n" + full_ray
        _, output = self.evaluate(fake)
        self.assertIn("public API from Pi connector network namespace: HTTP 200 (colo: FCO)", output)
        self.assertNotIn(full_ray, output)
        runs = [args for args in fake.calls if args[:2] == ["docker", "run"]]
        self.assertEqual(len(runs), 2)
        public = next(args for args in runs if args[-1] == triage.PUBLIC_HEALTH)
        self.assertIn("%header{cf-ray}", public[public.index("--write-out") + 1])
        internal = next(args for args in runs if args[-1] == "http://api:8080/health")
        self.assertNotIn("%header{cf-ray}", internal[internal.index("--write-out") + 1])

        fake = FakeDocker()
        fake.external_status = "502\\n" + full_ray + " PRIVATE-HEADER"
        _, output = self.evaluate(fake)
        self.assertIn("public API from Pi connector network namespace: HTTP 502", output)
        self.assertNotIn("PRIVATE", output)
        self.assertNotIn(full_ray, output)

    def test_restart_and_oom_are_reduced_to_fixed_categories(self):
        fake = FakeDocker()
        fake.oom = "true"
        fake.restarts = "19"
        _, output = self.evaluate(fake)
        self.assertIn("reports OOM killed", output)
        self.assertIn("restart count category: seen", output)
        self.assertNotIn("19", output)

    def test_bad_restart_count_and_unknown_oom_do_not_leak_values(self):
        fake = FakeDocker()
        fake.oom = "PRIVATE_OOM"
        fake.restarts = "PRIVATE_COUNT"
        _, output = self.evaluate(fake)
        self.assertIn("OOM state unavailable", output)
        self.assertIn("restart count category: unknown", output)
        self.assertNotIn("PRIVATE", output)

    def test_missing_connector_skips_all_public_requests(self):
        fake = FakeDocker()
        fake.running_connector = ""
        result, output = self.evaluate(fake)
        self.assertEqual(result, 0)
        self.assertIn("running connector or API unavailable", output)
        self.assertFalse(any(args[:2] == ["docker", "run"] for args in fake.calls))

    def test_bad_image_skips_public_request_without_leakage(self):
        fake = FakeDocker()
        fake.image = "private.registry/SECRET_IMAGE"
        _, output = self.evaluate(fake)
        self.assertIn("local API image unavailable", output)
        self.assertNotIn("SECRET", output)
        self.assertFalse(any(args[-1] == triage.PUBLIC_HEALTH for args in fake.calls))

    def test_injected_http_response_and_transport_error_are_redacted(self):
        fake = FakeDocker()
        fake.external_status = "502 SECRET_TOKEN"
        _, output = self.evaluate(fake)
        self.assertIn("public API from Pi connector network namespace: invalid HTTP status", output)
        self.assertNotIn("SECRET_TOKEN", output)
        fake.external_status, fake.external_exit = "200", 60
        _, output = self.evaluate(fake)
        self.assertIn("TLS certificate validation failure", output)
        self.assertNotIn("HTTP 200\nNOTE: this is", output)

    def test_failed_internal_probe_still_reports_public_status(self):
        fake = FakeDocker()
        fake.internal_status = "502"
        _, output = self.evaluate(fake)
        self.assertIn("current connector-to-origin health is unverified", output)
        self.assertIn("public API from Pi connector network namespace: HTTP 502", output)

    def test_inspect_failure_is_redacted(self):
        fake = FakeDocker()
        fake.inspect_failure = True
        _, output = self.evaluate(fake)
        self.assertNotIn("PRIVATE_SECRET_ERROR", output)
        self.assertNotIn(API, output)
        self.assertNotIn(CONNECTOR, output)

    def test_restart_category_validates_numeric_only(self):
        self.assertEqual(triage.restart_category("0"), "none")
        self.assertEqual(triage.restart_category("2"), "seen")
        for value in (None, "SECRET", "-1", "9999999999999"):
            self.assertEqual(triage.restart_category(value), "unknown")


    def test_origin_rechecked_once_only_after_failure_and_after_public_probe(self):
        fake = FakeDocker()
        fake.internal_sequence = [(28, "PRIVATE_TIMEOUT"), (0, "200")]
        _, output = self.evaluate(fake)
        self.assertIn("probe: curl request timeout", output)
        self.assertIn("one bounded internal origin recheck: HTTP 200", output)
        self.assertNotIn("PRIVATE_TIMEOUT", output)
        runs = [args[-1] for args in fake.calls if args[:2] == ["docker", "run"]]
        self.assertEqual(runs, ["http://api:8080/health", triage.PUBLIC_HEALTH,
                                "http://api:8080/health"])

    def test_http_502_internal_is_not_reported_as_transport_error(self):
        fake = FakeDocker()
        fake.internal_sequence = [(0, "502"), (0, "502")]
        _, output = self.evaluate(fake)
        self.assertIn("probe: HTTP 502", output)
        self.assertIn("one bounded internal origin recheck: HTTP 502", output)
        runs = [args for args in fake.calls if args[:2] == ["docker", "run"]]
        self.assertEqual(len(runs), 3)

    def test_no_extra_internal_probe_after_success(self):
        fake = FakeDocker()
        _, output = self.evaluate(fake)
        self.assertNotIn("one bounded internal origin recheck", output)
        self.assertEqual(len([c for c in fake.calls if c[:2] == ["docker", "run"]]), 2)

    def test_public_dns_and_docker_probe_failures_are_redacted(self):
        fake = FakeDocker()
        for code, label in [(6, "DNS resolution failure"),
                            (28, "curl request timeout"),
                            (125, "Docker container launch failure")]:
            fake.external_exit, fake.external_status = code, "PRIVATE_DOCKER_SECRET"
            with self.subTest(code=code):
                _, output = self.evaluate(fake)
                self.assertIn("public API from Pi connector network namespace: " + label, output)
                self.assertNotIn("PRIVATE_DOCKER_SECRET", output)


if __name__ == "__main__":
    unittest.main()
