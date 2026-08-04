"""API-level regression tests for home side effects, status transitions, cocreate confirm."""

from __future__ import annotations

from datetime import date, datetime

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.pool import StaticPool
from sqlmodel import Session, SQLModel, create_engine, select

from app.db import get_session
from app.main import app
from app.models import (
    CocreateKind,
    CocreateSession,
    DailyTask,
    Theme,
    ThemePhase,
    ThemeStatus,
)


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
def client(engine, monkeypatch):
    monkeypatch.setattr("app.main.init_db", lambda: None)

    def _override():
        with Session(engine) as session:
            yield session

    app.dependency_overrides[get_session] = _override
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.clear()


@pytest.fixture()
def db(engine):
    with Session(engine) as session:
        yield session


def test_home_auto_focus_and_clears_stale_tasks(client: TestClient, db: Session):
    theme = Theme(
        title="lonely",
        status=ThemeStatus.active,
        phase=ThemePhase.learning,
        is_focus=False,
        locked_at=datetime.utcnow(),
    )
    other = Theme(title="dormant", status=ThemeStatus.dormant, phase=ThemePhase.learning)
    db.add(theme)
    db.add(other)
    db.commit()
    db.refresh(theme)
    db.refresh(other)

    today = date.today().isoformat()
    db.add(
        DailyTask(
            theme_id=other.id,
            title="幽灵任务",
            description="",
            task_date=today,
            sort_order=0,
        )
    )
    db.commit()

    res = client.get("/api/home")
    assert res.status_code == 200
    body = res.json()
    assert body["focus_count"] == 1
    assert all(t["theme_id"] != other.id for t in body["today_tasks"])

    db.expire_all()
    refreshed = db.get(Theme, theme.id)
    assert refreshed is not None
    assert refreshed.is_focus is True
    stale = db.exec(select(DailyTask).where(DailyTask.theme_id == other.id)).all()
    assert stale == []


def test_theme_status_transition_via_api(client: TestClient, db: Session):
    theme = Theme(
        title="active",
        status=ThemeStatus.active,
        phase=ThemePhase.learning,
        locked_at=datetime.utcnow(),
        is_focus=True,
    )
    db.add(theme)
    db.commit()
    db.refresh(theme)

    res = client.patch(f"/api/themes/{theme.id}", json={"status": "dormant"})
    assert res.status_code == 200
    assert res.json()["status"] == "dormant"
    assert res.json()["is_focus"] is False

    draft = Theme(title="draft", status=ThemeStatus.draft)
    db.add(draft)
    db.commit()
    db.refresh(draft)
    bad = client.patch(f"/api/themes/{draft.id}", json={"status": "active"})
    assert bad.status_code == 409


def test_confirm_rejects_already_confirmed_session(client: TestClient, db: Session):
    theme = Theme(title="t", status=ThemeStatus.draft)
    db.add(theme)
    db.commit()
    db.refresh(theme)

    live_doc = {"levels": [{"level": 1, "name": "L1"}], "selected_level": 1}
    sess = CocreateSession(
        theme_id=theme.id,
        kind=CocreateKind.stage,
        messages=[{"role": "assistant", "content": "ok"}],
        live_doc=live_doc,
        confirmed=True,
    )
    db.add(sess)
    db.commit()

    res = client.post(
        f"/api/themes/{theme.id}/cocreate/stage/confirm",
        json={"selected_level": 1, "live_doc": live_doc},
    )
    assert res.status_code == 409
    assert "已确认" in res.json()["detail"]
