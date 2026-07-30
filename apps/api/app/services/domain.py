from __future__ import annotations

from datetime import date, datetime
from typing import Any

from sqlmodel import Session, col, select

from app.models import (
    PHASE_SLOT_LIMITS,
    MAX_FOCUS,
    Activity,
    ActivityType,
    DailyTask,
    DriftEvent,
    PlanSlice,
    SliceStatus,
    Theme,
    ThemePhase,
    ThemeStatus,
)


def count_active_in_phase(session: Session, phase: ThemePhase) -> int:
    rows = session.exec(
        select(Theme).where(
            Theme.status == ThemeStatus.active,
            Theme.phase == phase,
        )
    ).all()
    return len(rows)


def assert_slot_available(session: Session, phase: ThemePhase) -> None:
    limit = PHASE_SLOT_LIMITS[phase]
    used = count_active_in_phase(session, phase)
    if used >= limit:
        raise ValueError(f"{phase.value} 槽位已满（{used}/{limit}），请先推进/休眠/废弃腾槽。")


def count_focus(session: Session) -> int:
    rows = session.exec(
        select(Theme).where(
            Theme.is_focus == True,  # noqa: E712
            Theme.status == ThemeStatus.active,
        )
    ).all()
    return len(rows)


def set_focus(session: Session, theme: Theme, is_focus: bool) -> DriftEvent | None:
    if is_focus:
        current = count_focus(session)
        # counting self if already focus
        if not theme.is_focus and current >= MAX_FOCUS:
            raise ValueError(f"主焦点已达上限 {MAX_FOCUS}")
        theme.is_focus = True
        after = count_focus(session)
        if after > 1:
            ev = DriftEvent(
                kind="focus_over_one",
                message=f"主焦点数量为 {after}（>1），记录计划漂移风险。",
                theme_id=theme.id,
            )
            session.add(ev)
            return ev
    else:
        theme.is_focus = False
    return None


def get_active_slice(session: Session, theme_id: str) -> PlanSlice | None:
    return session.exec(
        select(PlanSlice).where(
            PlanSlice.theme_id == theme_id,
            PlanSlice.slice_status == SliceStatus.active,
        )
    ).first()


def lock_theme_plan(
    session: Session,
    theme: Theme,
    plan_doc: dict[str, Any],
) -> PlanSlice:
    assert_slot_available(session, ThemePhase.learning)
    # archive any existing slices
    existing = session.exec(select(PlanSlice).where(PlanSlice.theme_id == theme.id)).all()
    for s in existing:
        session.delete(s)

    phases = plan_doc.get("phases") or {}
    learning = phases.get("learning") or {}
    activities_raw = learning.get("activities") or []

    slice_row = PlanSlice(
        theme_id=theme.id,
        phase=ThemePhase.learning,
        slice_status=SliceStatus.active,
        title=learning.get("title") or "学习计划",
        core_points=plan_doc.get("core_20") or [],
        doc=plan_doc,
    )
    session.add(slice_row)
    session.flush()

    for i, item in enumerate(activities_raw):
        act = Activity(
            slice_id=slice_row.id,
            theme_id=theme.id,
            title=str(item.get("title") or f"活动 {i+1}"),
            description=str(item.get("description") or ""),
            activity_type=_parse_activity_type(item.get("activity_type")),
            sort_order=i,
        )
        session.add(act)

    theme.status = ThemeStatus.active
    theme.phase = ThemePhase.learning
    theme.is_focus = True
    theme.locked_at = datetime.utcnow()
    theme.updated_at = datetime.utcnow()

    # store practice/application skeletons as draft slices (not active)
    for phase in (ThemePhase.practice, ThemePhase.application):
        pdata = phases.get(phase.value) or {}
        if not pdata:
            continue
        session.add(
            PlanSlice(
                theme_id=theme.id,
                phase=phase,
                slice_status=SliceStatus.draft,
                title=pdata.get("title") or phase.value,
                core_points=[],
                doc={"phase_doc": pdata, "parent_plan": {"goal": plan_doc.get("goal"), "core_20": plan_doc.get("core_20")}},
            )
        )

    ensure_today_tasks(session, theme)
    return slice_row


def _parse_activity_type(value: Any) -> ActivityType | None:
    if value is None:
        return None
    try:
        return ActivityType(str(value))
    except ValueError:
        return None


def ensure_today_tasks(session: Session, theme: Theme, limit: int = 3) -> list[DailyTask]:
    today = date.today().isoformat()
    existing = session.exec(
        select(DailyTask).where(
            DailyTask.theme_id == theme.id,
            DailyTask.task_date == today,
        )
    ).all()
    if existing:
        return list(existing)

    slice_row = get_active_slice(session, theme.id)
    if not slice_row:
        return []

    activities = session.exec(
        select(Activity)
        .where(Activity.slice_id == slice_row.id, Activity.done == False)  # noqa: E712
        .order_by(col(Activity.sort_order))
    ).all()

    tasks: list[DailyTask] = []
    for i, act in enumerate(activities[:limit]):
        t = DailyTask(
            theme_id=theme.id,
            activity_id=act.id,
            title=act.title,
            description=act.description,
            task_date=today,
            sort_order=i,
        )
        session.add(t)
        tasks.append(t)
    return tasks


def advance_phase(session: Session, theme: Theme) -> PlanSlice:
    order = [ThemePhase.learning, ThemePhase.practice, ThemePhase.application]
    idx = order.index(theme.phase)
    if idx >= len(order) - 1:
        raise ValueError("已在应用期，无法再前进阶段")
    next_phase = order[idx + 1]
    assert_slot_available(session, next_phase)

    current = get_active_slice(session, theme.id)
    if current:
        current.slice_status = SliceStatus.completed
        current.completed_at = datetime.utcnow()

    draft = session.exec(
        select(PlanSlice).where(
            PlanSlice.theme_id == theme.id,
            PlanSlice.phase == next_phase,
            PlanSlice.slice_status == SliceStatus.draft,
        )
    ).first()

    if draft:
        draft.slice_status = SliceStatus.active
        # materialize activities if only phase_doc present
        phase_doc = (draft.doc or {}).get("phase_doc") or draft.doc or {}
        activities_raw = phase_doc.get("activities") or []
        existing_acts = session.exec(select(Activity).where(Activity.slice_id == draft.id)).all()
        if not existing_acts:
            for i, item in enumerate(activities_raw):
                session.add(
                    Activity(
                        slice_id=draft.id,
                        theme_id=theme.id,
                        title=str(item.get("title") or f"活动 {i+1}"),
                        description=str(item.get("description") or ""),
                        activity_type=_parse_activity_type(item.get("activity_type")),
                        sort_order=i,
                    )
                )
        active_slice = draft
    else:
        active_slice = PlanSlice(
            theme_id=theme.id,
            phase=next_phase,
            slice_status=SliceStatus.active,
            title=f"{next_phase.value} 计划",
            doc={},
        )
        session.add(active_slice)

    theme.phase = next_phase
    theme.updated_at = datetime.utcnow()
    ensure_today_tasks(session, theme)
    return active_slice


def slot_snapshot(session: Session) -> dict[str, Any]:
    return {
        phase.value: {
            "used": count_active_in_phase(session, phase),
            "max": PHASE_SLOT_LIMITS[phase],
        }
        for phase in ThemePhase
    }
