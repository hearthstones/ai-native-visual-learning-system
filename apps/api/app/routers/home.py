from datetime import date, datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session, col, select

from app.config import Settings, get_settings
from app.db import get_session
from app.models import DailyTask, DriftEvent, Theme, ThemeStatus, WeeklyReview
from app.schemas import (
    CommitmentCreate,
    CommitmentSuggest,
    DailyTaskOut,
    HomeOut,
    QueueItemOut,
    TaskToggle,
    ThemeOut,
    WeeklyReviewIn,
    WeeklyReviewOut,
)
from app.services import activity_expand as expand_svc
from app.services import domain as domain_svc
from app.services.llm import chat_json
from app.services.skills import system_prompt_for
from app.services.weread import WereadError, search_books

router = APIRouter(tags=["home"])


def _queue_item_out(theme: Theme, act) -> QueueItemOut:
    from app.schemas import ExecutionSummaryOut

    raw = expand_svc.execution_summary(
        act.execution_doc if isinstance(act.execution_doc, dict) else None
    )
    summary = ExecutionSummaryOut.model_validate(raw) if raw else None
    return QueueItemOut(
        activity_id=act.id,
        theme_id=theme.id,
        theme_title=theme.title,
        phase=theme.phase,
        title=domain_svc.format_daily_task_title(act),
        description=act.description or act.title,
        execution_summary=summary,
    )


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
            # 仅刷新已有承诺，不静默灌今日任务
            domain_svc.refresh_today_commitments(session, t)

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
    queue = [
        _queue_item_out(theme, act)
        for theme, act in domain_svc.list_queue_activities(session)
    ]
    drifts = session.exec(
        select(DriftEvent).order_by(DriftEvent.created_at.desc()).limit(10)
    ).all()
    return HomeOut(
        slots=domain_svc.slot_snapshot(session),
        focus_count=domain_svc.count_focus(session),
        themes=[ThemeOut.model_validate(t) for t in themes],
        today_tasks=[domain_svc.daily_task_out(session, t) for t in tasks],
        queue=queue,
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


@router.post("/commitments", response_model=DailyTaskOut)
def create_commitment(
    body: CommitmentCreate,
    session: Session = Depends(get_session),
) -> DailyTaskOut:
    from app.models import Activity

    act = session.get(Activity, body.activity_id)
    if not act:
        raise HTTPException(404, "活动不存在")
    theme = session.get(Theme, act.theme_id)
    if not theme:
        raise HTTPException(404, "主题不存在")
    try:
        task = domain_svc.commit_activity_today(session, theme, body.activity_id)
    except ValueError as e:
        raise HTTPException(409, str(e)) from e
    session.commit()
    session.refresh(task)
    return domain_svc.daily_task_out(session, task)


@router.post("/commitments/suggest", response_model=list[DailyTaskOut])
def suggest_commitments(
    body: CommitmentSuggest = CommitmentSuggest(),
    session: Session = Depends(get_session),
) -> list[DailyTaskOut]:
    themes: list[Theme]
    if body.theme_id:
        theme = session.get(Theme, body.theme_id)
        if not theme:
            raise HTTPException(404, "主题不存在")
        themes = [theme]
    else:
        themes = list(
            session.exec(select(Theme).where(Theme.status == ThemeStatus.active)).all()
        )
    out: list[DailyTaskOut] = []
    for theme in themes:
        if theme.status != ThemeStatus.active:
            continue
        try:
            tasks = domain_svc.suggest_commitments(session, theme)
        except ValueError as e:
            raise HTTPException(409, str(e)) from e
        out.extend(domain_svc.daily_task_out(session, t) for t in tasks)
    session.commit()
    return out


@router.delete("/commitments/{task_id}", status_code=204)
def delete_commitment(
    task_id: str,
    session: Session = Depends(get_session),
) -> None:
    task = session.get(DailyTask, task_id)
    if not task:
        raise HTTPException(404, "承诺不存在")
    today = date.today().isoformat()
    if task.task_date != today:
        raise HTTPException(400, "只能移出今天的承诺")
    domain_svc.uncommit_today_task(session, task)
    session.commit()
    return None


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
    tasks_done = sum(1 for t in tasks if t.done)
    tasks_total = len(tasks)
    completion_rate = (tasks_done / tasks_total) if tasks_total else 0.0
    mastery_scores = [
        int(m.get("score") or 0)
        for m in (body.mastery or [])
        if isinstance(m, dict)
    ]
    mastery_avg = (
        sum(mastery_scores) / len(mastery_scores) if mastery_scores else 0.0
    )
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
        "stats": {
            "tasks_done": tasks_done,
            "tasks_total": tasks_total,
            "completion_rate": round(completion_rate, 3),
            "mastery_avg": round(mastery_avg, 2),
            "mastery_all_zero": (not mastery_scores) or all(s <= 0 for s in mastery_scores),
        },
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
                        "务必先读 stats；若 completion_rate=0，禁止夸奖已掌握或已运用。"
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

    # Soft guard: zero completion must not invent mastery wins
    if completion_rate <= 0:
        banned = ("已能运用", "已掌握", "有成效", "理论学习有一定成效", "成功应用")
        wins = result.get("wins") or []
        if isinstance(wins, list):
            result["wins"] = [
                w
                for w in wins
                if isinstance(w, str) and not any(b in w for b in banned)
            ]
        summary = str(result.get("summary") or "")
        if any(b in summary for b in banned):
            result["summary"] = (
                f"本周今日推进完成 {tasks_done}/{tasks_total}，执行尚未启动；"
                "先把下一步做成可勾选项，再谈掌握与应用。"
            )

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
