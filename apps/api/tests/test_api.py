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
    PlanSlice,
    SliceStatus,
    Theme,
    ThemePhase,
    ThemeStatus,
)
from app.services import domain as domain_svc


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


def test_plan_document_returns_full_learning_plan(client: TestClient, db: Session):
    theme = Theme(
        title="Flutter 入门",
        status=ThemeStatus.draft,
        ladder_doc={"levels": [{"level": 1, "name": "入门"}], "selected_level": 1},
        resources_doc={"resources": [{"name": "官方文档"}], "constraints": ["中文优先"]},
        current_ladder_level=1,
    )
    db.add(theme)
    db.commit()
    db.refresh(theme)

    plan_doc = {
        "goal": "一周入门 Flutter",
        "core_20": ["Widget", "State"],
        "phases": {
            "learning": {
                "title": "学习期",
                "activities": [{"title": "搭环境", "description": "", "activity_type": "learn"}],
            },
            "practice": {"title": "练习期", "activities": [{"title": "小 demo"}]},
            "application": {"title": "应用期", "activities": [{"title": "落地页"}]},
        },
    }
    domain_svc.lock_theme_plan(db, theme, plan_doc)
    db.commit()

    # Advance so active slice is practice (truncated doc); plan-document must still return full plan.
    domain_svc.advance_phase(db, theme)
    db.commit()

    res = client.get(f"/api/themes/{theme.id}/plan-document")
    assert res.status_code == 200
    body = res.json()
    assert body["locked"] is True
    assert body["theme"]["title"] == "Flutter 入门"
    assert body["theme"]["ladder_doc"]["levels"][0]["name"] == "入门"
    assert body["theme"]["resources_doc"]["resources"][0]["name"] == "官方文档"
    assert body["plan_doc"]["goal"] == "一周入门 Flutter"
    assert "learning" in body["plan_doc"]["phases"]
    assert "practice" in body["plan_doc"]["phases"]
    assert body["plan_doc"]["core_20"] == ["Widget", "State"]

    active = db.exec(
        select(PlanSlice).where(
            PlanSlice.theme_id == theme.id,
            PlanSlice.slice_status == SliceStatus.active,
        )
    ).first()
    assert active is not None
    assert active.phase == ThemePhase.practice
    assert "phases" not in (active.doc or {})


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
