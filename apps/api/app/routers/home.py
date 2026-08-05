from datetime import date, datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session, col, select

from app.config import Settings, get_settings
from app.db import get_session
from app.models import DailyTask, DriftEvent, Theme, ThemeStatus, WeeklyReview
from app.schemas import (
    DailyTaskOut,
    HomeOut,
    TaskToggle,
    ThemeOut,
    WeeklyReviewIn,
    WeeklyReviewOut,
)
from app.services import domain as domain_svc
from app.services.llm import chat_json
from app.services.skills import system_prompt_for
from app.services.weread import WereadError, search_books

router = APIRouter(tags=["home"])


@router.get("/home", response_model=HomeOut)
def home(session: Session = Depends(get_session)) -> HomeOut:
    themes = list(
        session.exec(
            select(Theme)
            .where(col(Theme.status).in_([ThemeStatus.active, ThemeStatus.draft]))
            .order_by(Theme.updated_at.desc())
        ).all()
    )
    today = date.today().isoformat()
    active_ids = {t.id for t in themes if t.status == ThemeStatus.active}
    domain_svc.ensure_focus_for_lonely_active(session)
    for t in themes:
        if t.status == ThemeStatus.active:
            domain_svc.ensure_today_tasks(session, t)

    # 非进行中主题的今日任务不再展示，并顺手清理残留
    stale = list(
        session.exec(select(DailyTask).where(DailyTask.task_date == today)).all()
    )
    for task in stale:
        if task.theme_id not in active_ids:
            session.delete(task)
    session.commit()
    # refresh themes after possible focus repair
    themes = list(
        session.exec(
            select(Theme)
            .where(col(Theme.status).in_([ThemeStatus.active, ThemeStatus.draft]))
            .order_by(Theme.updated_at.desc())
        ).all()
    )

    if not active_ids:
        tasks: list[DailyTask] = []
    else:
        tasks = list(
            session.exec(
                select(DailyTask)
                .where(
                    DailyTask.task_date == today,
                    col(DailyTask.theme_id).in_(active_ids),
                )
                .order_by(col(DailyTask.sort_order))
            ).all()
        )
    drifts = session.exec(
        select(DriftEvent).order_by(DriftEvent.created_at.desc()).limit(10)
    ).all()
    return HomeOut(
        slots=domain_svc.slot_snapshot(session),
        focus_count=domain_svc.count_focus(session),
        themes=[ThemeOut.model_validate(t) for t in themes],
        today_tasks=[domain_svc.daily_task_out(session, t) for t in tasks],
        drift_events=[
            {
                "id": d.id,
                "kind": d.kind,
                "message": d.message,
                "theme_id": d.theme_id,
                "created_at": d.created_at.isoformat(),
            }
            for d in drifts
        ],
    )


@router.get("/slots")
def slots(session: Session = Depends(get_session)) -> dict:
    return domain_svc.slot_snapshot(session)


@router.patch("/tasks/{task_id}", response_model=DailyTaskOut)
def toggle_task(
    task_id: str,
    body: TaskToggle,
    session: Session = Depends(get_session),
) -> DailyTaskOut:
    task = session.get(DailyTask, task_id)
    if not task:
        raise HTTPException(404, "任务不存在")
    task.done = body.done
    session.add(task)
    domain_svc.sync_activity_done(session, task, body.done)
    session.commit()
    session.refresh(task)
    return domain_svc.daily_task_out(session, task)


@router.post("/reviews/weekly", response_model=WeeklyReviewOut)
def create_weekly_review(
    body: WeeklyReviewIn = WeeklyReviewIn(),
    session: Session = Depends(get_session),
    settings: Settings = Depends(get_settings),
) -> WeeklyReview:
    today = date.today()
    week_start = today - timedelta(days=today.weekday())
    themes = session.exec(select(Theme).where(Theme.status == ThemeStatus.active)).all()
    tasks = session.exec(
        select(DailyTask).where(DailyTask.task_date >= week_start.isoformat())
    ).all()
    payload = {
        "themes": [
            {
                "title": t.title,
                "phase": t.phase.value,
                "is_focus": t.is_focus,
            }
            for t in themes
        ],
        "tasks": [
            {"title": t.title, "done": t.done, "date": t.task_date, "theme_id": t.theme_id}
            for t in tasks
        ],
        "user_answers": [a for a in body.answers if a and str(a).strip()],
        "mastery": body.mastery,
        "draft_notes": body.draft_notes,
    }
    try:
        result = chat_json(
            settings,
            system=system_prompt_for("weekly_review"),
            messages=[
                {
                    "role": "user",
                    "content": (
                        "请基于本周数据与用户填写的复盘内容，生成复盘 JSON。"
                        "必须输出："
                        '{"summary":"...","wins":["..."],"issues":["..."],"adjustments":["..."]}。'
                        f"数据：{payload}"
                    ),
                }
            ],
            kind="weekly_review",
        )
    except Exception as e:
        raise HTTPException(502, f"LLM 调用失败: {e}") from e

    # Tolerate mistaken cocreate-shaped responses
    if not result.get("summary") and isinstance(result.get("live_doc"), dict):
        live = result["live_doc"]
        result = {
            "summary": live.get("summary") or result.get("assistant_message") or "",
            "wins": live.get("wins") or [],
            "issues": live.get("issues") or [],
            "adjustments": live.get("adjustments") or [],
        }

    row = WeeklyReview(
        week_start=week_start.isoformat(),
        summary=str(result.get("summary") or ""),
        wins=result.get("wins") or [],
        issues=result.get("issues") or [],
        adjustments=result.get("adjustments") or [],
        raw={**result, "user_input": body.model_dump()},
    )
    session.add(row)
    session.commit()
    session.refresh(row)
    return row


@router.get("/reviews/weekly/latest", response_model=WeeklyReviewOut | None)
def latest_weekly_review(session: Session = Depends(get_session)) -> WeeklyReview | None:
    return session.exec(select(WeeklyReview).order_by(WeeklyReview.created_at.desc())).first()


@router.get("/weread/search")
def weread_search(
    q: str,
    settings: Settings = Depends(get_settings),
) -> dict:
    try:
        books = search_books(settings, q, count=10)
    except WereadError as e:
        raise HTTPException(400, str(e)) from e
    return {"books": books}


@router.get("/health")
def health(settings: Settings = Depends(get_settings)) -> dict:
    return {
        "ok": True,
        "deepseek_configured": bool(settings.deepseek_api_key),
        "weread_configured": bool(settings.weread_api_key),
        "model": settings.deepseek_model,
        "time": datetime.utcnow().isoformat(),
    }
