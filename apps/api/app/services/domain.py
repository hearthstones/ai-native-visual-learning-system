from __future__ import annotations

from datetime import date, datetime
from typing import Any

from sqlmodel import Session, col, select

from app.models import (
    PHASE_SLOT_LIMITS,
    MAX_FOCUS,
    Activity,
    ActivityType,
    CocreateSession,
    DailyTask,
    DriftEvent,
    PlanSlice,
    SliceStatus,
    Theme,
    ThemePhase,
    ThemeStatus,
)


def count_active_in_phase(
    session: Session,
    phase: ThemePhase,
    *,
    exclude_theme_id: str | None = None,
) -> int:
    rows = session.exec(
        select(Theme).where(
            Theme.status == ThemeStatus.active,
            Theme.phase == phase,
        )
    ).all()
    if exclude_theme_id:
        rows = [r for r in rows if r.id != exclude_theme_id]
    return len(rows)


def assert_slot_available(
    session: Session,
    phase: ThemePhase,
    *,
    exclude_theme_id: str | None = None,
    action_hint: str = "请先推进/休眠/废弃腾槽后再锁定计划。",
) -> None:
    limit = PHASE_SLOT_LIMITS[phase]
    used = count_active_in_phase(session, phase, exclude_theme_id=exclude_theme_id)
    if used >= limit:
        rows = session.exec(
            select(Theme).where(
                Theme.status == ThemeStatus.active,
                Theme.phase == phase,
            )
        ).all()
        if exclude_theme_id:
            rows = [r for r in rows if r.id != exclude_theme_id]
        occupying = "、".join(f"「{r.title}」" for r in rows[:3]) if rows else ""
        suffix = f"，当前占用：{occupying}" if occupying else ""
        raise ValueError(f"{phase.value} 槽位已满（{used}/{limit}）{suffix}。{action_hint}")


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
        if not theme.is_focus and current >= MAX_FOCUS:
            raise ValueError(f"主焦点已达上限 {MAX_FOCUS}")
        theme.is_focus = True
        session.add(theme)
        session.flush()
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
        session.add(theme)
    return None


def get_active_slice(session: Session, theme_id: str) -> PlanSlice | None:
    return session.exec(
        select(PlanSlice).where(
            PlanSlice.theme_id == theme_id,
            PlanSlice.slice_status == SliceStatus.active,
        )
    ).first()


def clear_today_tasks(session: Session, theme_id: str) -> None:
    today = date.today().isoformat()
    existing = session.exec(
        select(DailyTask).where(
            DailyTask.theme_id == theme_id,
            DailyTask.task_date == today,
        )
    ).all()
    for task in existing:
        session.delete(task)
    if existing:
        session.flush()


def purge_theme_plan_data(session: Session, theme_id: str) -> None:
    """Remove slices, activities, and daily tasks for a theme (used on re-lock)."""
    slices = session.exec(select(PlanSlice).where(PlanSlice.theme_id == theme_id)).all()
    slice_ids = {s.id for s in slices}
    if slice_ids:
        activities = session.exec(select(Activity).where(col(Activity.slice_id).in_(slice_ids))).all()
        for act in activities:
            session.delete(act)
    for s in slices:
        session.delete(s)
    tasks = session.exec(select(DailyTask).where(DailyTask.theme_id == theme_id)).all()
    for task in tasks:
        session.delete(task)
    session.flush()


def lock_theme_plan(
    session: Session,
    theme: Theme,
    plan_doc: dict[str, Any],
) -> PlanSlice:
    # Re-lock must not count this theme against the learning slot it already occupies
    # (or will occupy after resetting phase back to learning).
    assert_slot_available(session, ThemePhase.learning, exclude_theme_id=theme.id)
    purge_theme_plan_data(session, theme.id)

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
    theme.locked_at = datetime.utcnow()
    theme.updated_at = datetime.utcnow()
    session.add(theme)
    session.flush()

    if not theme.is_focus:
        set_focus(session, theme, True)
    else:
        # Keep focus; still flush so counts stay consistent
        session.add(theme)
        session.flush()

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
                doc={
                    "phase_doc": pdata,
                    "parent_plan": {
                        "goal": plan_doc.get("goal"),
                        "core_20": plan_doc.get("core_20"),
                    },
                },
            )
        )

    ensure_today_tasks(session, theme, replace=True)
    return slice_row


def _parse_activity_type(value: Any) -> ActivityType | None:
    if value is None:
        return None
    try:
        return ActivityType(str(value))
    except ValueError:
        return None


def sync_activity_done(session: Session, task: DailyTask, done: bool) -> None:
    if not task.activity_id:
        return
    act = session.get(Activity, task.activity_id)
    if not act:
        return
    act.done = done
    session.add(act)


def ensure_today_tasks(
    session: Session,
    theme: Theme,
    limit: int = 3,
    *,
    replace: bool = False,
) -> list[DailyTask]:
    today = date.today().isoformat()
    if replace:
        clear_today_tasks(session, theme.id)

    existing = session.exec(
        select(DailyTask).where(
            DailyTask.theme_id == theme.id,
            DailyTask.task_date == today,
        )
    ).all()
    if existing:
        # If tasks still point at the current active slice, keep them;
        # otherwise regenerate (stale after phase change / re-lock without replace).
        slice_row = get_active_slice(session, theme.id)
        if slice_row:
            activity_ids = {
                a.id
                for a in session.exec(
                    select(Activity).where(Activity.slice_id == slice_row.id)
                ).all()
            }
            stale = any(
                t.activity_id and t.activity_id not in activity_ids for t in existing
            )
            if not stale:
                return list(existing)
        clear_today_tasks(session, theme.id)

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
        session.add(current)

    draft = session.exec(
        select(PlanSlice).where(
            PlanSlice.theme_id == theme.id,
            PlanSlice.phase == next_phase,
            PlanSlice.slice_status == SliceStatus.draft,
        )
    ).first()

    if draft:
        draft.slice_status = SliceStatus.active
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
        session.add(draft)
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
    session.add(theme)
    session.flush()
    ensure_today_tasks(session, theme, replace=True)
    return active_slice


def _release_focus(theme: Theme) -> None:
    theme.is_focus = False


def _set_status(theme: Theme, new_status: ThemeStatus) -> None:
    theme.status = new_status
    theme.updated_at = datetime.utcnow()


def _clear_tasks_if_leaving_active(session: Session, old: ThemeStatus, theme_id: str) -> None:
    """离开进行中时清掉今日任务，避免首页幽灵任务。"""
    if old == ThemeStatus.active:
        clear_today_tasks(session, theme_id)


def apply_theme_status(session: Session, theme: Theme, new_status: ThemeStatus) -> None:
    """主题七态流转：草稿/进行/休眠/完成/废弃/归档/删除。"""
    old = theme.status
    if new_status == old:
        return

    if new_status == ThemeStatus.draft:
        raise ValueError("不能将主题改回草稿状态")

    if new_status == ThemeStatus.active:
        if old == ThemeStatus.draft:
            raise ValueError("草稿需完成计划共创并锁定后才能进入进行中")
        if old == ThemeStatus.deleted:
            raise ValueError("请使用「从回收站恢复」")
        if old not in (
            ThemeStatus.dormant,
            ThemeStatus.completed,
            ThemeStatus.abandoned,
            ThemeStatus.archived,
        ):
            raise ValueError(f"当前状态（{old.value}）无法直接进入进行中")
        if theme.locked_at is None:
            raise ValueError("未锁定计划的主题无法进入进行中")
        assert_slot_available(
            session,
            theme.phase,
            exclude_theme_id=theme.id,
            action_hint="请先推进/休眠/完成/废弃占用主题后再恢复。",
        )
        _release_focus(theme)
        theme.previous_status = None
        _set_status(theme, ThemeStatus.active)
        session.add(theme)
        ensure_today_tasks(session, theme)
        return

    if new_status == ThemeStatus.dormant:
        if old != ThemeStatus.active:
            raise ValueError("仅进行中的主题可休眠")
        _clear_tasks_if_leaving_active(session, old, theme.id)
        _release_focus(theme)
        _set_status(theme, ThemeStatus.dormant)
        session.add(theme)
        return

    if new_status == ThemeStatus.completed:
        if old != ThemeStatus.active:
            raise ValueError("仅进行中的主题可标记完成")
        if theme.phase != ThemePhase.application:
            raise ValueError("请先进入应用期，再标记完成（毕业）")
        _clear_tasks_if_leaving_active(session, old, theme.id)
        _release_focus(theme)
        _set_status(theme, ThemeStatus.completed)
        session.add(theme)
        return

    if new_status == ThemeStatus.abandoned:
        if old not in (ThemeStatus.draft, ThemeStatus.active, ThemeStatus.dormant):
            raise ValueError("仅草稿、进行中或休眠主题可废弃")
        _clear_tasks_if_leaving_active(session, old, theme.id)
        _release_focus(theme)
        theme.previous_status = None
        _set_status(theme, ThemeStatus.abandoned)
        session.add(theme)
        return

    if new_status == ThemeStatus.archived:
        if old not in (ThemeStatus.completed, ThemeStatus.abandoned):
            raise ValueError("仅完成或废弃的主题可归档")
        _release_focus(theme)
        theme.previous_status = old
        _set_status(theme, ThemeStatus.archived)
        session.add(theme)
        return

    if new_status == ThemeStatus.deleted:
        _clear_tasks_if_leaving_active(session, old, theme.id)
        _release_focus(theme)
        theme.previous_status = old
        _set_status(theme, ThemeStatus.deleted)
        session.add(theme)
        return

    raise ValueError(f"不支持的状态：{new_status}")


def restore_theme(session: Session, theme: Theme) -> ThemeStatus:
    """从回收站或归档恢复到 previous_status。"""
    if theme.status == ThemeStatus.deleted:
        target = theme.previous_status
        if target is None:
            target = ThemeStatus.active if theme.locked_at else ThemeStatus.draft
        if target == ThemeStatus.deleted:
            target = ThemeStatus.dormant if theme.locked_at else ThemeStatus.draft
        if target == ThemeStatus.active:
            if theme.locked_at is None:
                raise ValueError("未锁定计划，无法恢复为进行中")
            assert_slot_available(
                session,
                theme.phase,
                exclude_theme_id=theme.id,
                action_hint="请先腾出槽位后再从回收站恢复。",
            )
        _release_focus(theme)
        theme.previous_status = None
        _set_status(theme, target)
        session.add(theme)
        if target == ThemeStatus.active:
            ensure_today_tasks(session, theme)
        return target

    if theme.status == ThemeStatus.archived:
        target = theme.previous_status or ThemeStatus.completed
        if target not in (ThemeStatus.completed, ThemeStatus.abandoned):
            target = ThemeStatus.completed
        _release_focus(theme)
        theme.previous_status = None
        _set_status(theme, target)
        session.add(theme)
        return target

    raise ValueError("仅回收站或归档中的主题可恢复")


def purge_theme(session: Session, theme: Theme) -> None:
    """永久删除主题及其衍生数据（仅允许回收站中的主题）。"""
    if theme.status != ThemeStatus.deleted:
        raise ValueError("仅回收站中的主题可永久删除，请先删除到回收站")

    theme_id = theme.id
    for task in session.exec(select(DailyTask).where(DailyTask.theme_id == theme_id)).all():
        session.delete(task)
    for act in session.exec(select(Activity).where(Activity.theme_id == theme_id)).all():
        session.delete(act)
    for sl in session.exec(select(PlanSlice).where(PlanSlice.theme_id == theme_id)).all():
        session.delete(sl)
    for sess in session.exec(
        select(CocreateSession).where(CocreateSession.theme_id == theme_id)
    ).all():
        session.delete(sess)
    for ev in session.exec(select(DriftEvent).where(DriftEvent.theme_id == theme_id)).all():
        session.delete(ev)
    session.delete(theme)
    session.flush()


def slot_snapshot(session: Session) -> dict[str, Any]:
    return {
        phase.value: {
            "used": count_active_in_phase(session, phase),
            "max": PHASE_SLOT_LIMITS[phase],
        }
        for phase in ThemePhase
    }
