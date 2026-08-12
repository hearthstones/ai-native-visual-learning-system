"""Auth gate: login cookie protects /api when AUTH_PASSWORD is set."""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.pool import StaticPool
from sqlmodel import Session, SQLModel, create_engine

from app.config import get_settings
from app.db import get_session
from app.main import app


@pytest.fixture()
def engine():
    eng = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    SQLModel.metadata.create_all(eng)
    return eng


@pytest.fixture()
def client_authed(engine, monkeypatch):
    monkeypatch.setenv("AUTH_USERNAME", "admin")
    monkeypatch.setenv("AUTH_PASSWORD", "secret-pass")
    monkeypatch.setenv("AUTH_SECRET", "test-secret")
    get_settings.cache_clear()
    monkeypatch.setattr("app.main.init_db", lambda: None)

    def _override():
        with Session(engine) as session:
            yield session

    app.dependency_overrides[get_session] = _override
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.clear()
    get_settings.cache_clear()


def test_api_requires_login(client_authed: TestClient):
    r = client_authed.get("/api/slots")
    assert r.status_code == 401
    me = client_authed.get("/api/auth/me")
    assert me.status_code == 200
    assert me.json()["authenticated"] is False
    assert me.json()["auth_required"] is True


def test_login_and_access(client_authed: TestClient):
    bad = client_authed.post("/api/auth/login", json={"username": "admin", "password": "wrong"})
    assert bad.status_code == 401

    ok = client_authed.post("/api/auth/login", json={"username": "admin", "password": "secret-pass"})
    assert ok.status_code == 200
    assert ok.json()["authenticated"] is True

    slots = client_authed.get("/api/slots")
    assert slots.status_code == 200

    out = client_authed.post("/api/auth/logout")
    assert out.status_code == 200
    assert client_authed.get("/api/slots").status_code == 401
