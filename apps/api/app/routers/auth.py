from __future__ import annotations

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


class LoginBody(BaseModel):
    username: str = Field(min_length=1)
    password: str = Field(min_length=1)


class AuthMeOut(BaseModel):
    authenticated: bool
    auth_required: bool
    username: str | None = None


@router.get("/me", response_model=AuthMeOut)
def auth_me(request: Request) -> AuthMeOut:
    settings = get_settings()
    if not settings.auth_enabled:
        return AuthMeOut(authenticated=True, auth_required=False, username=None)
    user = read_session_user(request, settings)
    return AuthMeOut(authenticated=bool(user), auth_required=True, username=user)


@router.post("/login", response_model=AuthMeOut)
def auth_login(body: LoginBody, response: Response) -> AuthMeOut:
    settings = get_settings()
    if not settings.auth_enabled:
        return AuthMeOut(authenticated=True, auth_required=False, username=None)
    if not credentials_match(body.username.strip(), body.password, settings):
        raise HTTPException(status_code=401, detail="用户名或密码错误")
    token = issue_session_token(settings.auth_username, settings)
    set_session_cookie(response, token)
    return AuthMeOut(authenticated=True, auth_required=True, username=settings.auth_username)


@router.post("/logout", response_model=AuthMeOut)
def auth_logout(response: Response) -> AuthMeOut:
    settings = get_settings()
    clear_session_cookie(response)
    return AuthMeOut(
        authenticated=False,
        auth_required=settings.auth_enabled,
        username=None,
    )
