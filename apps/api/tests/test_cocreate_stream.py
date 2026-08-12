"""SSE cocreate stream smoke (mock LLM)."""

from __future__ import annotations

from fastapi.testclient import TestClient
from sqlalchemy.pool import StaticPool
from sqlmodel import Session, SQLModel, create_engine

from app.config import Settings, get_settings
from app.db import get_session
from app.main import app
from app.models import Theme, ThemeStatus, ThemeType
import app.routers.cocreate as cocreate_router


def test_start_cocreate_stream_mock(monkeypatch):
    eng = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    SQLModel.metadata.create_all(eng)
    monkeypatch.setattr(cocreate_router, "engine", eng)

    def _override_db():
        with Session(eng) as session:
            yield session

    settings = Settings(deepseek_api_key="mock")
    app.dependency_overrides[get_session] = _override_db
    app.dependency_overrides[get_settings] = lambda: settings
    try:
        with Session(eng) as db:
            theme = Theme(
                title="流式测",
                theme_type=ThemeType.general,
                status=ThemeStatus.draft,
                goal="g",
            )
            db.add(theme)
            db.commit()
            db.refresh(theme)
            tid = theme.id

        with TestClient(app) as client:
            with client.stream(
                "POST",
                f"/api/themes/{tid}/cocreate/start/stream",
                json={"kind": "stage"},
            ) as res:
                assert res.status_code == 200
                text = "".join(res.iter_text())
        assert "event: delta" in text
        assert "event: session" in text
        assert "event: done" in text
        assert "event: error" not in text
    finally:
        app.dependency_overrides.clear()
