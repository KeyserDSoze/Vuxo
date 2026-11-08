#!/usr/bin/env python3
"""Verify the configured production OAuth providers without exposing their IDs in logs.

Invoked by deploy.sh both before replacing containers and after starting the API.
This only verifies public discovery + CORS; interactive OAuth still needs a browser.
"""

import argparse
import json
import sys
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen


def read_expected(path: Path) -> dict[str, str]:
    try:
        entries = {}
        for raw in path.read_text(encoding="utf-8").splitlines():
            if not raw.strip() or raw.startswith("#"):
                continue
            if "=" not in raw:
                raise ValueError("Invalid deployment environment file")
            key, value = raw.split("=", 1)
            entries[key] = value
    except OSError as exc:
        raise ValueError("Cannot read deployment environment file") from exc

    names = (
        "VUXO_MICROSOFT_CLIENT_ID",
        "VUXO_MICROSOFT_TENANT_ID",
        "VUXO_GOOGLE_CLIENT_ID",
        "VUXO_ALLOWED_ORIGIN",
    )
    for key in names:
        value = entries.get(key, "")
        if not value or value != value.strip() or " " in value or "\t" in value:
            raise ValueError(f"Missing or malformed production setting: {key}")
    if entries["VUXO_ALLOWED_ORIGIN"] != "https://vuxo.app":
        raise ValueError("VUXO_ALLOWED_ORIGIN must be the canonical production origin")
    return entries


def verify_discovery(expected: dict[str, str], endpoint: str) -> None:
    request = Request(endpoint, headers={"Origin": expected["VUXO_ALLOWED_ORIGIN"]})
    try:
        with urlopen(request, timeout=5) as response:
            if response.status != 200:
                raise ValueError("Authentication provider endpoint did not return HTTP 200")
            # This endpoint only exposes public provider IDs, never tokens or secrets.
            body = response.read(16385)
            if len(body) > 16384:
                raise ValueError("Authentication provider response is too large")
            cors = response.headers.get("Access-Control-Allow-Origin")
            if cors != expected["VUXO_ALLOWED_ORIGIN"]:
                raise ValueError("Authentication provider CORS origin mismatch")
            if response.headers.get("Access-Control-Allow-Credentials", "").lower() != "true":
                raise ValueError("Authentication provider CORS credentials are missing")
    except (HTTPError, URLError, TimeoutError) as exc:
        raise ValueError("Authentication provider endpoint is unavailable") from exc

    try:
        providers = json.loads(body)
    except (UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise ValueError("Authentication provider response is not valid JSON") from exc

    if not isinstance(providers, dict):
        raise ValueError("Authentication provider response is not an object")

    for name, mappings in {
        "microsoft": {"clientId": "VUXO_MICROSOFT_CLIENT_ID", "tenantId": "VUXO_MICROSOFT_TENANT_ID"},
        "google": {"clientId": "VUXO_GOOGLE_CLIENT_ID"},
    }.items():
        provider = providers.get(name)
        if not isinstance(provider, dict) or provider.get("enabled") is not True:
            raise ValueError(f"{name} provider is not enabled in the running API")
        for field, env_key in mappings.items():
            if provider.get(field) != expected[env_key]:
                raise ValueError(f"{name} provider {field} does not match deployment configuration")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("env_file", type=Path, help="Private environment file created by the deploy workflow")
    parser.add_argument("--config-only", action="store_true", help="Validate before touching containers")
    parser.add_argument("--url", default="http://127.0.0.1:8080/api/auth/providers")
    args = parser.parse_args()
    try:
        expected = read_expected(args.env_file)
        if not args.config_only:
            verify_discovery(expected, args.url)
    except ValueError as exc:
        print(f"FAIL auth provider verification: {exc}", file=sys.stderr)
        return 1

    if args.config_only:
        print("PASS Google/Microsoft production configuration present (IDs omitted)")
    else:
        print("PASS Google/Microsoft discovery and production CORS (IDs omitted)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
