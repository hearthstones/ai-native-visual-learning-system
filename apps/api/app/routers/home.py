from datetime import date, datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session, col, select

from app.config import Settings, get_settings
from app.db import get_session
from app.models import DailyTask, DriftEvent, Theme, ThemeStatus, WeeklyReview
from app.schemas import DailyTaskOut, HomeOut, TaskToggle, ThemeOut, WeeklyReviewOut
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
    for t in themes:
        if t.status == ThemeStatus.active:
            domain_svc.ensure_today_tasks(session, t)
    session.commit()

    tasks = list(
        session.exec(
            select(DailyTask)
            .where(DailyTask.task_date == today)
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
        today_tasks=[DailyTaskOut.model_validate(t) for t in tasks],
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
) -> DailyTask:
    task = session.get(DailyTask, task_id)
    if not task:
        raise HTTPException(404, "任务不存在")
    task.done = body.done
    session.add(task)
    domain_svc.sync_activity_done(session, task, body.done)
    session.commit()
    session.refresh(task)
    return task


@router.post("/reviews/weekly", response_model=WeeklyReviewOut)
def create_weekly_review(
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
    }
    try:
        result = chat_json(
            settings,
            system=system_prompt_for("weekly_review"),
            messages=[
                {
                    "role": "user",
                    "content": f"请基于本周数据生成复盘 JSON：{payload}",
                }
            ],
        )
    except Exception as e:
        raise HTTPException(502, f"LLM 调用失败: {e}") from e

    row = WeeklyReview(
        week_start=week_start.isoformat(),
        summary=str(result.get("summary") or ""),
        wins=result.get("wins") or [],
        issues=result.get("issues") or [],
        adjustments=result.get("adjustments") or [],
        raw=result,
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
