from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlmodel import Session, col, select

from app.config import Settings, get_settings
from app.db import get_session
from app.models import Activity, Theme, ThemeStatus
from app.schemas import (
    ActiveSliceOut,
    ActivityExpandMessageIn,
    ActivityExecutionPatch,
    ActivityOut,
    ActivityStepToggle,
    ActivityToggle,
    PlanDocumentOut,
    ThemeCreate,
    ThemeOut,
    ThemeUpdate,
)
from app.services import activity_expand as expand_svc
from app.services import domain as domain_svc

router = APIRouter(prefix="/themes", tags=["themes"])


def _activity_out(act: Activity) -> ActivityOut:
    return ActivityOut(
        id=act.id,
        title=act.title,
        description=act.description,
        activity_type=act.activity_type.value if act.activity_type else None,
        done=act.done,
        sort_order=act.sort_order,
        execution_doc=act.execution_doc if isinstance(act.execution_doc, dict) else {},
    )


def _daily_minutes_for_theme(session: Session, theme: Theme) -> int:
    slice_row = domain_svc.get_active_slice(session, theme.id)
    if not slice_row:
        return 30
    doc = slice_row.doc or {}
    daily = doc.get("daily_minutes")
    if not isinstance(daily, (int, float)) or daily <= 0:
        parent = (doc.get("parent_plan") or {}) if isinstance(doc, dict) else {}
        daily = parent.get("daily_minutes") if isinstance(parent, dict) else None
    if not isinstance(daily, (int, float)) or daily <= 0:
        return 30
    return int(daily)


@router.get("", response_model=list[ThemeOut])
def list_themes(
    status: Optional[ThemeStatus] = Query(default=None),
    session: Session = Depends(get_session),
) -> list[Theme]:
    stmt = select(Theme).order_by(Theme.updated_at.desc())
    if status is not None:
        stmt = stmt.where(Theme.status == status)
    return list(session.exec(stmt).all())


@router.post("", response_model=ThemeOut)
def create_theme(body: ThemeCreate, session: Session = Depends(get_session)) -> Theme:
    # Creating a new learning-phase theme will occupy learning slot only after lock.
    # Soft check: if active learning already full, still allow draft create but UI should intercept.
    theme = Theme(
        title=body.title.strip(),
        theme_type=body.theme_type,
        goal=body.goal.strip(),
        status=ThemeStatus.draft,
    )
    session.add(theme)
    session.commit()
    session.refresh(theme)
    return theme


@router.get("/{theme_id}", response_model=ThemeOut)
def get_theme(theme_id: str, session: Session = Depends(get_session)) -> Theme:
    theme = session.get(Theme, theme_id)
    if not theme:
        raise HTTPException(404, "主题不存在")
    return theme


@router.patch("/{theme_id}", response_model=ThemeOut)
def update_theme(
    theme_id: str,
    body: ThemeUpdate,
    session: Session = Depends(get_session),
) -> Theme:
    theme = session.get(Theme, theme_id)
    if not theme:
        raise HTTPException(404, "主题不存在")
    data = body.model_dump(exclude_unset=True)

    if "title" in data and data["title"] is not None:
        title = str(data["title"]).strip()
        if not title:
            raise HTTPException(400, "主题名称不能为空")
        data["title"] = title
    if "goal" in data and data["goal"] is not None:
        data["goal"] = str(data["goal"]).strip()
    if "work_note" in data and data["work_note"] is not None:
        data["work_note"] = str(data["work_note"])

    if "status" in data:
        try:
            domain_svc.apply_theme_status(session, theme, data.pop("status"))
        except ValueError as e:
            raise HTTPException(409, str(e)) from e

    if "is_focus" in data:
        if theme.status != ThemeStatus.active:
            raise HTTPException(400, "仅进行中的主题可设置主焦点")
        try:
            domain_svc.set_focus(session, theme, bool(data.pop("is_focus")))
        except ValueError as e:
            raise HTTPException(409, str(e)) from e

    for k, v in data.items():
        setattr(theme, k, v)
    theme.updated_at = datetime.utcnow()
    session.add(theme)
    session.commit()
    session.refresh(theme)
    return theme


@router.post("/{theme_id}/restore", response_model=ThemeOut)
def restore_theme(theme_id: str, session: Session = Depends(get_session)) -> Theme:
    """从回收站或归档恢复。"""
    theme = session.get(Theme, theme_id)
    if not theme:
        raise HTTPException(404, "主题不存在")
    try:
        domain_svc.restore_theme(session, theme)
    except ValueError as e:
        raise HTTPException(409, str(e)) from e
    session.add(theme)
    session.commit()
    session.refresh(theme)
    return theme


@router.delete("/{theme_id}", status_code=204)
def delete_theme_permanently(theme_id: str, session: Session = Depends(get_session)) -> None:
    """永久删除（仅回收站）。"""
    theme = session.get(Theme, theme_id)
    if not theme:
        raise HTTPException(404, "主题不存在")
    try:
        domain_svc.purge_theme(session, theme)
    except ValueError as e:
        raise HTTPException(409, str(e)) from e
    session.commit()


@router.post("/{theme_id}/advance-phase", response_model=ThemeOut)
def advance_phase(theme_id: str, session: Session = Depends(get_session)) -> Theme:
    theme = session.get(Theme, theme_id)
    if not theme:
        raise HTTPException(404, "主题不存在")
    if theme.status != ThemeStatus.active:
        raise HTTPException(400, "仅活跃主题可切换阶段")
    try:
        domain_svc.advance_phase(session, theme)
    except ValueError as e:
        raise HTTPException(409, str(e)) from e
    session.add(theme)
    session.commit()
    session.refresh(theme)
    return theme


@router.get("/{theme_id}/plan-document", response_model=PlanDocumentOut)
def get_plan_document(theme_id: str, session: Session = Depends(get_session)) -> PlanDocumentOut:
    """主题计划书：阶梯 + 资料 + 完整学习计划（不含任务/复盘）。"""
    theme = session.get(Theme, theme_id)
    if not theme:
        raise HTTPException(404, "主题不存在")
    plan_doc = domain_svc.get_learning_plan_doc(session, theme_id)
    return PlanDocumentOut(
        theme=ThemeOut.model_validate(theme),
        plan_doc=plan_doc,
        locked=theme.locked_at is not None,
    )


@router.get("/{theme_id}/active-slice", response_model=ActiveSliceOut)
def get_active_slice(theme_id: str, session: Session = Depends(get_session)) -> ActiveSliceOut:
    theme = session.get(Theme, theme_id)
    if not theme:
        raise HTTPException(404, "主题不存在")
    slice_row = domain_svc.get_active_slice(session, theme_id)
    if not slice_row:
        return ActiveSliceOut(theme_id=theme_id, title="", activities=[])
    activities = list(
        session.exec(
            select(Activity)
            .where(Activity.slice_id == slice_row.id)
            .order_by(col(Activity.sort_order))
        ).all()
    )
    doc = slice_row.doc or {}
    daily = doc.get("daily_minutes")
    if not isinstance(daily, (int, float)) or daily <= 0:
        parent = (doc.get("parent_plan") or {}) if isinstance(doc, dict) else {}
        daily = parent.get("daily_minutes") if isinstance(parent, dict) else None
    if not isinstance(daily, (int, float)) or daily <= 0:
        daily = 30
    return ActiveSliceOut(
        id=slice_row.id,
        theme_id=theme_id,
        phase=slice_row.phase,
        title=slice_row.title,
        core_points=list(slice_row.core_points or []),
        activities=[_activity_out(a) for a in activities],
        daily_minutes=int(daily),
    )


@router.patch("/activities/{activity_id}", response_model=ActivityOut)
def toggle_activity(
    activity_id: str,
    body: ActivityToggle,
    session: Session = Depends(get_session),
) -> ActivityOut:
    act = session.get(Activity, activity_id)
    if not act:
        raise HTTPException(404, "活动不存在")
    act.done = body.done
    session.add(act)
    session.commit()
    session.refresh(act)
    return _activity_out(act)


@router.post("/activities/{activity_id}/expand", response_model=ActivityOut)
def expand_activity(
    activity_id: str,
    session: Session = Depends(get_session),
    settings: Settings = Depends(get_settings),
) -> ActivityOut:
    act = session.get(Activity, activity_id)
    if not act:
        raise HTTPException(404, "活动不存在")
    theme = session.get(Theme, act.theme_id)
    if not theme:
        raise HTTPException(404, "主题不存在")
    try:
        doc = expand_svc.generate_execution(
            settings,
            theme,
            act,
            daily_minutes=_daily_minutes_for_theme(session, theme),
        )
    except RuntimeError as e:
        raise HTTPException(400, str(e)) from e
    except Exception as e:
        raise HTTPException(502, f"展开失败：{e}") from e
    if not expand_svc.has_execution(doc):
        raise HTTPException(502, "模型未返回可用的执行结构，请重试")
    act.execution_doc = doc
    session.add(act)
    domain_svc.refresh_today_task_for_activity(session, act)
    session.commit()
    session.refresh(act)
    return _activity_out(act)


@router.post("/activities/{activity_id}/expand/message", response_model=ActivityOut)
def expand_activity_message(
    activity_id: str,
    body: ActivityExpandMessageIn,
    session: Session = Depends(get_session),
    settings: Settings = Depends(get_settings),
) -> ActivityOut:
    act = session.get(Activity, activity_id)
    if not act:
        raise HTTPException(404, "活动不存在")
    if not expand_svc.has_execution(act.execution_doc):
        raise HTTPException(400, "请先展开该活动")
    theme = session.get(Theme, act.theme_id)
    if not theme:
        raise HTTPException(404, "主题不存在")
    try:
        doc = expand_svc.revise_execution(
            settings,
            theme,
            act,
            daily_minutes=_daily_minutes_for_theme(session, theme),
            user_content=body.content.strip(),
        )
    except RuntimeError as e:
        raise HTTPException(400, str(e)) from e
    except Exception as e:
        raise HTTPException(502, f"调整失败：{e}") from e
    if not expand_svc.has_execution(doc):
        raise HTTPException(502, "模型未返回可用的执行结构，已保留原拆分，请重试")
    act.execution_doc = doc
    expand_svc.sync_activity_done_from_execution(act)
    session.add(act)
    domain_svc.refresh_today_task_for_activity(session, act)
    session.commit()
    session.refresh(act)
    return _activity_out(act)


@router.patch("/activities/{activity_id}/execution", response_model=ActivityOut)
def patch_activity_execution(
    activity_id: str,
    body: ActivityExecutionPatch,
    session: Session = Depends(get_session),
) -> ActivityOut:
    act = session.get(Activity, activity_id)
    if not act:
        raise HTTPException(404, "活动不存在")
    theme = session.get(Theme, act.theme_id)
    if not theme:
        raise HTTPException(404, "主题不存在")
    if body.clear:
        act.execution_doc = {}
        # 清除拆分后活动回到可做态，避免卡在完成且无法再承诺
        act.done = False
        session.add(act)
        domain_svc.refresh_today_task_for_activity(session, act)
        session.commit()
        session.refresh(act)
        return _activity_out(act)

    patch: dict = {}
    if body.goal is not None:
        patch["goal"] = body.goal
    if body.steps is not None:
        patch["steps"] = body.steps
    if "resource_ref" in body.model_fields_set:
        patch["resource_ref"] = body.resource_ref
    if body.outcome is not None:
        patch["outcome"] = body.outcome
    if body.minutes is not None:
        patch["minutes"] = body.minutes
    if not patch:
        raise HTTPException(400, "没有可更新的字段")

    act.execution_doc = expand_svc.apply_manual_patch(
        act.execution_doc,
        patch,
        daily_minutes=_daily_minutes_for_theme(session, theme),
    )
    expand_svc.sync_activity_done_from_execution(act)
    session.add(act)
    domain_svc.refresh_today_task_for_activity(session, act)
    session.commit()
    session.refresh(act)
    return _activity_out(act)


@router.patch(
    "/activities/{activity_id}/execution/steps/{step_id}",
    response_model=ActivityOut,
)
def toggle_execution_step(
    activity_id: str,
    step_id: str,
    body: ActivityStepToggle,
    session: Session = Depends(get_session),
) -> ActivityOut:
    act = session.get(Activity, activity_id)
    if not act:
        raise HTTPException(404, "活动不存在")
    try:
        act.execution_doc = expand_svc.set_step_done(
            act.execution_doc, step_id, body.done
        )
    except KeyError:
        raise HTTPException(404, "步骤不存在") from None
    # 全部步骤完成时同步活动完成态
    steps = (act.execution_doc or {}).get("steps") or []
    if steps and all(isinstance(s, dict) and s.get("done") for s in steps):
        act.done = True
    elif not body.done:
        act.done = False
    session.add(act)
    domain_svc.refresh_today_task_for_activity(session, act)
    session.commit()
    session.refresh(act)
    return _activity_out(act)
