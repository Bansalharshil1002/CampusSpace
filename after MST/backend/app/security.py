import hashlib
import hmac
import secrets
from datetime import datetime, timedelta, timezone

import jwt

from app.config import settings

PBKDF_ROUNDS = 120_000


def hash_secret(value: str, salt: str | None = None) -> str:
    salt = salt or secrets.token_hex(16)
    digest = hashlib.pbkdf2_hmac("sha256", value.encode("utf-8"), salt.encode("utf-8"), PBKDF_ROUNDS)
    return f"pbkdf2${salt}${digest.hex()}"


def verify_secret(value: str, stored: str | None) -> bool:
    if not stored or not value:
        return False
    try:
        scheme, salt, _digest = stored.split("$", 2)
    except ValueError:
        return False
    if scheme != "pbkdf2":
        return False
    return hmac.compare_digest(hash_secret(value, salt), stored)


def create_access_token(user_id: str) -> str:
    payload = {
        "sub": user_id,
        "exp": datetime.now(timezone.utc) + timedelta(minutes=settings.jwt_expire_minutes),
        "iat": datetime.now(timezone.utc),
    }
    return jwt.encode(payload, settings.jwt_secret, algorithm="HS256")


def decode_access_token(token: str) -> str | None:
    try:
        payload = jwt.decode(token, settings.jwt_secret, algorithms=["HS256"])
    except jwt.PyJWTError:
        return None
    sub = payload.get("sub")
    return str(sub) if sub else None


def random_otp() -> str:
    return f"{secrets.randbelow(1_000_000):06d}"


def random_token() -> str:
    return secrets.token_urlsafe(32)


def college_email(email: str) -> str:
    return email.strip().lower()


def is_college_email(email: str) -> bool:
    parts = college_email(email).split("@")
    return len(parts) == 2 and parts[1] == settings.allowed_email_domain
