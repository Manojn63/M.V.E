"""Create local Argon2 account hashes without echoing passwords."""

from __future__ import annotations

import getpass
import secrets
from pathlib import Path

from argon2 import PasswordHasher
from dotenv import set_key

PROJECT_ROOT = Path(__file__).resolve().parent.parent
ENV_FILE = PROJECT_ROOT / ".env"
DEFAULT_ADMIN_EMAIL = "natarajmanoj28@gmail.com"


def read_password_twice(label: str) -> str:
    while True:
        password = getpass.getpass(f"{label} password (input hidden): ")
        confirmation = getpass.getpass("Confirm password (input hidden): ")
        if password != confirmation:
            print("Passwords did not match. Try again.")
            continue
        if len(password) < 12:
            print("Use at least 12 characters.")
            continue
        return password


def main() -> None:
    admin_email = input(f"Admin email [{DEFAULT_ADMIN_EMAIL}]: ").strip() or DEFAULT_ADMIN_EMAIL
    user_email = input("Standard user email: ").strip().lower()
    if not admin_email or "@" not in admin_email:
        raise SystemExit("Enter a valid admin email.")
    if not user_email or "@" not in user_email or user_email == admin_email.lower():
        raise SystemExit("Enter a valid standard-user email different from the admin email.")

    hasher = PasswordHasher()
    admin_hash = hasher.hash(read_password_twice("Admin"))
    user_hash = hasher.hash(read_password_twice("Standard user"))
    session_secret = secrets.token_urlsafe(48)

    set_key(str(ENV_FILE), "MVE_ADMIN_EMAIL", admin_email, quote_mode="always")
    set_key(str(ENV_FILE), "MVE_ADMIN_PASSWORD_HASH", admin_hash, quote_mode="always")
    set_key(str(ENV_FILE), "MVE_USER_EMAIL", user_email, quote_mode="always")
    set_key(str(ENV_FILE), "MVE_USER_PASSWORD_HASH", user_hash, quote_mode="always")
    set_key(str(ENV_FILE), "MVE_SESSION_SECRET", session_secret, quote_mode="always")
    set_key(str(ENV_FILE), "MVE_COOKIE_SECURE", "false", quote_mode="always")
    print(f"Account hashes and session key saved to {ENV_FILE}. Password values were not stored or displayed.")
    print("Restart the M.V.E. server after account configuration.")


if __name__ == "__main__":
    main()
