"""Disable login gate for API tests unless a test enables AUTH_PASSWORD."""

from __future__ import annotations

import pytest

from app.config import get_settings


@pytest.fixture(autouse=True)
def _disable_auth_gate(monkeypatch):
    monkeypatch.setenv("AUTH_PASSWORD", "")
    monkeypatch.setenv("AUTH_USERNAME", "admin")
    monkeypatch.delenv("AUTH_SECRET", raising=False)
    get_settings.cache_clear()
    yield
    get_settings.cache_clear()
