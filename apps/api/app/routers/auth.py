from __future__ import annotations

import time
from collections import defaultdict

from fastapi import APIRouter, HTTPException, Request, Response
from pydantic import BaseModel, Field

from app.auth_session import (
    clear_session_cookie,
    credentials_match,
    issue_session_token,
    read_session_user,
    set_session_cookie,
)
from app.config import get_settings

router = APIRouter(prefix="/auth", tags=["auth"])

# 简单进程内限流：同一客户端 60s 内最多 10 次登录尝试
_LOGIN_WINDOW_SEC = 60
_LOGIN_MAX_ATTEMPTS = 10
_login_attempts: dict[str, list[float]] = defaultdict(list)


class LoginBody(BaseModel):
    username: str = Field(min_length=1)
    password: str = Field(min_length=1)


class AuthMeOut(BaseModel):
    authenticated: bool
    auth_required: bool
    username: str | None = None


def _client_key(request: Request) -> str:
    forwarded = request.headers.get("x-forwarded-for", "").split(",")[0].strip()
    return forwarded or (request.client.host if request.client else "unknown")


def _check_login_rate(request: Request) -> None:
    key = _client_key(request)
    now = time.time()
    window = [t for t in _login_attempts[key] if now - t < _LOGIN_WINDOW_SEC]
    if len(window) >= _LOGIN_MAX_ATTEMPTS:
        _login_attempts[key] = window
        raise HTTPException(status_code=429, detail="尝试过多，请稍后再试")
    window.append(now)
    _login_attempts[key] = window


def _cookie_secure(request: Request) -> bool:
    cfg = get_settings()
    if cfg.auth_cookie_secure is not None:
        return bool(cfg.auth_cookie_secure)
    return request.url.scheme == "https"


@router.get("/me", response_model=AuthMeOut)
def auth_me(request: Request) -> AuthMeOut:
    settings = get_settings()
    if not settings.auth_enabled:
        return AuthMeOut(authenticated=True, auth_required=False, username=None)
    user = read_session_user(request, settings)
    return AuthMeOut(authenticated=bool(user), auth_required=True, username=user)


@router.post("/login", response_model=AuthMeOut)
def auth_login(body: LoginBody, request: Request, response: Response) -> AuthMeOut:
    settings = get_settings()
    if not settings.auth_enabled:
        return AuthMeOut(authenticated=True, auth_required=False, username=None)
    _check_login_rate(request)
    if not credentials_match(body.username.strip(), body.password, settings):
        raise HTTPException(status_code=401, detail="用户名或密码错误")
    token = issue_session_token(settings.auth_username, settings)
    set_session_cookie(response, token, secure=_cookie_secure(request))
    return AuthMeOut(authenticated=True, auth_required=True, username=settings.auth_username)


@router.post("/logout", response_model=AuthMeOut)
def auth_logout(request: Request, response: Response) -> AuthMeOut:
    settings = get_settings()
    clear_session_cookie(response, secure=_cookie_secure(request))
    return AuthMeOut(
        authenticated=False,
        auth_required=settings.auth_enabled,
        username=None,
    )
