from __future__ import annotations

import pytest
from sqlmodel import Session, SQLModel, create_engine, select

from app.models import (
    MAX_FOCUS,
    Activity,
    DailyTask,
    DriftEvent,
    PlanSlice,
    SliceStatus,
    Theme,
    ThemePhase,
    ThemeStatus,
)
from app.services import domain as domain_svc


@pytest.fixture()
def session():
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False})
    SQLModel.metadata.create_all(engine)
    with Session(engine) as s:
        yield s


def _plan_doc(*activity_titles: str) -> dict:
    return {
        "goal": "g",
        "core_20": ["a"],
        "phases": {
            "learning": {
                "title": "学习期",
                "activities": [
                    {"title": t, "description": t, "activity_type": "learn"}
                    for t in activity_titles
                ],
            },
            "practice": {
                "title": "练习期",
                "activities": [
                    {"title": "练1", "description": "", "activity_type": "practice"},
                    {"title": "练2", "description": "", "activity_type": "practice"},
                ],
            },
            "application": {
                "title": "应用期",
                "activities": [
                    {"title": "用1", "description": "", "activity_type": "apply"},
                ],
            },
        },
    }


def test_toggle_syncs_activity_done(session: Session):
    theme = Theme(title="t", status=ThemeStatus.draft)
    session.add(theme)
    session.commit()
    session.refresh(theme)

    domain_svc.lock_theme_plan(session, theme, _plan_doc("A1", "A2", "A3", "A4"))
    session.commit()

    tasks = session.exec(select(DailyTask).where(DailyTask.theme_id == theme.id)).all()
    assert len(tasks) == 3
    task = tasks[0]
    domain_svc.sync_activity_done(session, task, True)
    session.commit()

    act = session.get(Activity, task.activity_id)
    assert act is not None
    assert act.done is True

    # Next generation should skip done activities
    domain_svc.clear_today_tasks(session, theme.id)
    session.commit()
    new_tasks = domain_svc.ensure_today_tasks(session, theme)
    session.commit()
    titles = {t.title for t in new_tasks}
    assert task.title not in titles
    assert "A4" in titles or len(new_tasks) == 3


def test_advance_phase_replaces_today_tasks(session: Session):
    theme = Theme(title="t", status=ThemeStatus.draft)
    session.add(theme)
    session.commit()
    session.refresh(theme)

    domain_svc.lock_theme_plan(session, theme, _plan_doc("学1", "学2"))
    session.commit()
    session.refresh(theme)

    learning_tasks = session.exec(select(DailyTask).where(DailyTask.theme_id == theme.id)).all()
    assert {t.title for t in learning_tasks} == {"学1", "学2"}

    domain_svc.advance_phase(session, theme)
    session.commit()
    session.refresh(theme)

    assert theme.phase == ThemePhase.practice
    today_tasks = session.exec(select(DailyTask).where(DailyTask.theme_id == theme.id)).all()
    assert {t.title for t in today_tasks} == {"练1", "练2"}


def test_relock_excludes_self_from_slot_and_purges(session: Session):
    theme = Theme(title="t", status=ThemeStatus.draft)
    session.add(theme)
    session.commit()
    session.refresh(theme)

    domain_svc.lock_theme_plan(session, theme, _plan_doc("旧1", "旧2"))
    session.commit()
    session.refresh(theme)
    old_slice_ids = {
        s.id for s in session.exec(select(PlanSlice).where(PlanSlice.theme_id == theme.id)).all()
    }
    old_act_ids = {
        a.id for a in session.exec(select(Activity).where(Activity.theme_id == theme.id)).all()
    }

    # Re-lock while already occupying the learning slot must succeed
    domain_svc.lock_theme_plan(session, theme, _plan_doc("新1", "新2", "新3"))
    session.commit()

    slices = session.exec(select(PlanSlice).where(PlanSlice.theme_id == theme.id)).all()
    acts = session.exec(select(Activity).where(Activity.theme_id == theme.id)).all()
    assert old_slice_ids.isdisjoint({s.id for s in slices})
    assert old_act_ids.isdisjoint({a.id for a in acts})
    tasks = session.exec(select(DailyTask).where(DailyTask.theme_id == theme.id)).all()
    assert {t.title for t in tasks} == {"新1", "新2", "新3"}
    assert theme.phase == ThemePhase.learning


def test_lock_respects_max_focus(session: Session):
    themes = []
    for i in range(MAX_FOCUS):
        t = Theme(title=f"f{i}", status=ThemeStatus.draft)
        session.add(t)
        session.commit()
        session.refresh(t)
        # Occupy practice/application slots so learning stays free for the next lock.
        # First theme takes learning; subsequent ones need different approach.
        themes.append(t)

    # Lock first into learning
    domain_svc.lock_theme_plan(session, themes[0], _plan_doc("a"))
    session.commit()
    # Move first to practice to free learning slot
    domain_svc.advance_phase(session, themes[0])
    session.commit()

    domain_svc.lock_theme_plan(session, themes[1], _plan_doc("b"))
    session.commit()
    domain_svc.advance_phase(session, themes[1])
    session.commit()

    domain_svc.lock_theme_plan(session, themes[2], _plan_doc("c"))
    session.commit()
    domain_svc.advance_phase(session, themes[2])
    session.commit()

    assert domain_svc.count_focus(session) == MAX_FOCUS

    extra = Theme(title="overflow", status=ThemeStatus.draft)
    session.add(extra)
    session.commit()
    session.refresh(extra)
    with pytest.raises(ValueError, match="主焦点"):
        domain_svc.lock_theme_plan(session, extra, _plan_doc("x"))


def test_set_focus_records_drift_with_flush(session: Session):
    a = Theme(title="a", status=ThemeStatus.active, is_focus=True, phase=ThemePhase.practice)
    b = Theme(title="b", status=ThemeStatus.active, is_focus=False, phase=ThemePhase.practice)
    session.add(a)
    session.add(b)
    session.commit()
    session.refresh(b)

    ev = domain_svc.set_focus(session, b, True)
    session.commit()
    assert ev is not None
    assert "2" in ev.message
    drifts = session.exec(select(DriftEvent)).all()
    assert len(drifts) == 1
