#!/usr/bin/env python3
"""Validate resolved Docker Compose production configuration without printing secrets.

Usage: docker compose ... config --format json | python3 scripts/validate-release-config.py
"""

import json
import sys
from urllib.parse import unquote, urlsplit


def fail(message: str) -> None:
    raise ValueError(message)


def validate(config: dict) -> None:
    services = config.get("services", {})
    for service in ("db", "app", "migrate"):
        if service not in services:
            fail(f"Missing Compose service: {service}")

    db = services["db"].get("environment", {})
    app = services["app"].get("environment", {})
    migration = services["migrate"].get("environment", {})
    db_name = db.get("POSTGRES_DB")
    db_user = db.get("POSTGRES_USER")
    db_password = db.get("POSTGRES_PASSWORD")
    if (db_name, db_user) != ("finova", "finova"):
        fail("Unexpected Compose database/user: expected finova/finova")
    if not db_password or db_password in {"local_dev_change_me", "replace_me"}:
        fail("Set a non-default POSTGRES_PASSWORD in the server .env")

    def check_url(name: str, value: str | None) -> None:
        if not value:
            fail(f"Missing {name}")
        try:
            parsed = urlsplit(value)
            if parsed.scheme not in ("postgresql", "postgres"):
                fail(f"{name} must be a PostgreSQL URL")
            if (parsed.hostname, parsed.port or 5432, parsed.path) != (
                "db", 5432, "/finova"
            ):
                fail(f"{name} must target db:5432/finova on the Compose network")
            if unquote(parsed.username or "") != db_user:
                fail(f"{name} user does not match POSTGRES_USER")
            if unquote(parsed.password or "") != db_password:
                fail(f"{name} password does not match POSTGRES_PASSWORD")
        except (ValueError, TypeError) as exc:
            fail(f"Invalid {name}: {exc}")

    check_url("FINOVA_CONTAINER_DATABASE_URL", app.get("DATABASE_URL"))
    check_url("FINOVA_MIGRATION_DATABASE_URL", migration.get("DATABASE_URL"))

    auth_url = app.get("BETTER_AUTH_URL") or ""
    public_url = app.get("NEXT_PUBLIC_APP_URL") or ""
    if not auth_url.startswith("https://") or auth_url != public_url:
        fail("BETTER_AUTH_URL and NEXT_PUBLIC_APP_URL must be identical HTTPS URLs")
    if urlsplit(auth_url).hostname in {"localhost", "127.0.0.1"}:
        fail("Configure a public HTTPS domain before a server release")
    if len(app.get("BETTER_AUTH_SECRET") or "") < 32:
        fail("BETTER_AUTH_SECRET must contain at least 32 characters")

    build = services["app"].get("build", {})
    if build.get("args", {}).get("NEXT_PUBLIC_APP_URL") != public_url:
        fail("App image build origin differs from runtime NEXT_PUBLIC_APP_URL")


def main() -> int:
    try:
        validate(json.load(sys.stdin))
    except (ValueError, KeyError, json.JSONDecodeError) as exc:
        print(f"Release configuration rejected: {exc}", file=sys.stderr)
        return 1
    print("Release configuration OK: HTTPS origin and database targets match.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
