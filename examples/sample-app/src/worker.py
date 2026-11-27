"""Background worker used by the envguard demo project."""

import os

REDIS_URL = os.environ["REDIS_URL"]
SMTP_HOST = os.getenv("SMTP_HOST", "localhost")
LEGACY_FLAG = os.environ.get("LEGACY_FLAG") == "true"


def run() -> None:
    print(f"connecting to {REDIS_URL} and {SMTP_HOST} (legacy={LEGACY_FLAG})")
