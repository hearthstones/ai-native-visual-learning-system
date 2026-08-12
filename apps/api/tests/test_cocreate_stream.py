"""SSE cocreate stream smoke (mock LLM)."""

from __future__ import annotations

from fastapi.testclient import TestClient
from sqlalchemy.pool import StaticPool
from sqlmodel import Session, SQLModel, create_engine

from app.config import Settings, get_settings
from app.db import get_session
from app.main import app
from app.models import CocreateKind, CocreateSession, Theme, ThemeStatus, ThemeType
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


def test_force_start_stream_keeps_draft_on_llm_failure(monkeypatch):
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
                title="force 保稿",
                theme_type=ThemeType.general,
                status=ThemeStatus.draft,
                goal="g",
            )
            db.add(theme)
            db.commit()
            db.refresh(theme)
            tid = theme.id
            draft = CocreateSession(
                theme_id=tid,
                kind=CocreateKind.stage,
                messages=[{"role": "assistant", "content": "旧稿"}],
                live_doc={"levels": [{"level": 1, "name": "L1"}]},
                confirmed=False,
            )
            db.add(draft)
            db.commit()
            draft_id = draft.id

        def boom(*_a, **_k):
            raise RuntimeError("llm down")
            yield  # pragma: no cover

        monkeypatch.setattr(cocreate_router, "chat_json_stream", boom)

        with TestClient(app) as client:
            with client.stream(
                "POST",
                f"/api/themes/{tid}/cocreate/start/stream",
                json={"kind": "stage", "force": True},
            ) as res:
                text = "".join(res.iter_text())
        assert "event: error" in text

        with Session(eng) as db:
            kept = db.get(CocreateSession, draft_id)
            assert kept is not None
            assert kept.live_doc["levels"][0]["name"] == "L1"
    finally:
        app.dependency_overrides.clear()


def test_plan_adjust_hint_uses_defaults():
    hint = cocreate_router._plan_adjust_hint()
    assert "不超过 10 条" in hint
    assert "不超过 4 条" in hint


def test_live_doc_substantive_rejects_empty_shell():
    assert cocreate_router._live_doc_substantive(CocreateKind.resources, {"resources": []}) is False
    assert cocreate_router._live_doc_substantive(CocreateKind.plan, {"phases": {}}) is False
    assert (
        cocreate_router._live_doc_substantive(
            CocreateKind.resources,
            {"resources": [{"name": "书"}]},
        )
        is True
    )
