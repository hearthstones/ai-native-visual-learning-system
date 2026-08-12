"""单人会话门禁：HMAC 签名 cookie，无用户表。"""

from __future__ import annotations

import hashlib
import hmac
import time
from typing import Optional

from starlette.requests import Request
from starlette.responses import Response

from app.config import Settings

COOKIE_NAME = "learning_session"
SESSION_TTL_SECONDS = 60 * 60 * 24 * 30  # 30 天


def _sign(payload: str, secret: str) -> str:
    return hmac.new(secret.encode("utf-8"), payload.encode("utf-8"), hashlib.sha256).hexdigest()


def issue_session_token(username: str, settings: Settings) -> str:
    exp = int(time.time()) + SESSION_TTL_SECONDS
    payload = f"{username}:{exp}"
    return f"{payload}:{_sign(payload, settings.session_secret)}"


def verify_session_token(token: str, settings: Settings) -> Optional[str]:
    parts = token.split(":")
    if len(parts) != 3:
        return None
    username, exp_s, sig = parts
    payload = f"{username}:{exp_s}"
    expected = _sign(payload, settings.session_secret)
    if not hmac.compare_digest(sig, expected):
        return None
    try:
        exp = int(exp_s)
    except ValueError:
        return None
    if exp < int(time.time()):
        return None
    if not hmac.compare_digest(username, settings.auth_username):
        return None
    return username


def credentials_match(username: str, password: str, settings: Settings) -> bool:
    return hmac.compare_digest(username, settings.auth_username) and hmac.compare_digest(
        password, settings.auth_password
    )


def read_session_user(request: Request, settings: Settings) -> Optional[str]:
    if not settings.auth_enabled:
        return settings.auth_username or "local"
    token = request.cookies.get(COOKIE_NAME)
    if not token:
        return None
    return verify_session_token(token, settings)


def set_session_cookie(response: Response, token: str) -> None:
    response.set_cookie(
        key=COOKIE_NAME,
        value=token,
        max_age=SESSION_TTL_SECONDS,
        httponly=True,
        samesite="lax",
        path="/",
    )


def clear_session_cookie(response: Response) -> None:
    response.delete_cookie(key=COOKIE_NAME, path="/")
