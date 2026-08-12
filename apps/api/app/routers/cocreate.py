from datetime import datetime
from typing import Any
from collections.abc import Iterator
import json

from fastapi import APIRouter, Depends, HTTPException
from fastapi.encoders import jsonable_encoder
from sqlmodel import Session, select
from sse_starlette.sse import EventSourceResponse

from app.config import Settings, get_settings
from app.db import engine, get_session
from app import plan_defaults
from app.models import CocreateKind, CocreateSession, Theme, ThemePhase, ThemeStatus
from app.schemas import (
    CocreateConfirmIn,
    CocreateMessageIn,
    CocreateSessionOut,
    CocreateStart,
    PlanPrefs,
    ThemeOut,
)
from app.services import domain as domain_svc
from app.services import cocreate_post as post_svc
from app.services.llm import chat_json, chat_json_stream
from app.services.skills import system_prompt_for
from app.services.weread import enrich_resources_with_weread, sanitize_weread_bindings

router = APIRouter(prefix="/themes/{theme_id}/cocreate", tags=["cocreate"])


def _sse(event: str, data: Any) -> dict[str, str]:
    return {
        "event": event,
        "data": json.dumps(jsonable_encoder(data), ensure_ascii=False),
    }


def _session_payload(row: CocreateSession) -> dict[str, Any]:
    return CocreateSessionOut.model_validate(row).model_dump()


def _get_theme(session: Session, theme_id: str) -> Theme:
    theme = session.get(Theme, theme_id)
    if not theme:
        raise HTTPException(404, "主题不存在")
    return theme


def _assert_plan_slot_or_409(session: Session, theme: Theme) -> None:
    """Fail early before spending another LLM call when learning slot is full."""
    try:
        domain_svc.assert_slot_available(
            session,
            ThemePhase.learning,
            exclude_theme_id=theme.id,
            action_hint="请先推进/休眠/废弃腾槽后再继续计划共创。",
        )
    except ValueError as e:
        raise HTTPException(409, str(e)) from e


def _finalize_resources_doc(
    settings: Settings,
    live_doc: dict[str, Any],
    *,
    requested_count: int | None = None,
) -> dict[str, Any]:
    doc = dict(live_doc)
    default_count = plan_defaults.DEFAULT_RESOURCE_COUNT
    if requested_count:
        doc = post_svc.enforce_resource_count(doc, requested_count)
    elif not doc.get("target_count"):
        resources = doc.get("resources") if isinstance(doc.get("resources"), list) else []
        # Default product target is 5; trim oversized first drafts.
        if len(resources) > default_count:
            doc = post_svc.enforce_resource_count(doc, default_count)
        else:
            doc["target_count"] = len(resources) or default_count
            doc["order"] = list(range(len(resources)))
    doc = post_svc.annotate_unverified_resources(doc)
    doc = _maybe_enrich_weread(settings, doc)
    return doc


def _finalize_plan_doc(
    live_doc: dict[str, Any],
    *,
    prefs: PlanPrefs | None = None,
    daily_minutes: int | None = None,
) -> dict[str, Any]:
    doc = dict(live_doc)
    if prefs is not None:
        doc = _apply_plan_prefs(doc, prefs)
    if daily_minutes is not None:
        doc = post_svc.force_daily_minutes(doc, daily_minutes)
    doc = post_svc.cap_phase_activities(
        doc,
        learning_max=plan_defaults.DEFAULT_LEARNING_ACTIVITY_MAX,
        practice_max=plan_defaults.DEFAULT_PRACTICE_ACTIVITY_MAX,
        application_max=plan_defaults.DEFAULT_APPLICATION_ACTIVITY_MAX,
    )
    return doc


@router.post("/start", response_model=CocreateSessionOut)
def start_cocreate(
    theme_id: str,
    body: CocreateStart,
    session: Session = Depends(get_session),
    settings: Settings = Depends(get_settings),
) -> CocreateSession:
    theme = _get_theme(session, theme_id)
    if body.kind == CocreateKind.plan and theme.status != ThemeStatus.active:
        # Draft themes still occupy no learning slot until lock; warn if another theme holds it.
        _assert_plan_slot_or_409(session, theme)

    existing = session.exec(
        select(CocreateSession).where(
            CocreateSession.theme_id == theme_id,
            CocreateSession.kind == body.kind,
            CocreateSession.confirmed == False,  # noqa: E712
        )
    ).first()
    if existing and not body.force:
        return existing
    if existing and body.force:
        session.delete(existing)
        session.commit()

    seed = _seed_user_message(
        theme,
        body.kind,
        resource_count=body.resource_count,
        plan_prefs=body.plan_prefs,
    )
    system = system_prompt_for(body.kind.value)
    context_msgs = [
        {
            "role": "user",
            "content": seed,
        }
    ]
    try:
        result = chat_json(
            settings,
            system=system,
            messages=context_msgs,
            kind=body.kind.value,
        )
    except Exception as e:
        # Transient network / provider blips — one quick retry
        try:
            result = chat_json(
                settings,
                system=system,
                messages=context_msgs,
                kind=body.kind.value,
            )
        except Exception as e2:
            raise HTTPException(502, f"LLM 调用失败: {e2}") from e2

    assistant_message = str(result.get("assistant_message") or "已生成初稿，请看右侧文档。")
    live_doc = result.get("live_doc") or {}
    if not isinstance(live_doc, dict):
        live_doc = {}
    if not live_doc:
        raise HTTPException(
            502,
            f"LLM 未返回活文档（kind={body.kind.value}）。原始键：{list((result.get('_raw') or result).keys())}",
        )

    if body.kind == CocreateKind.resources:
        live_doc = _finalize_resources_doc(
            settings,
            live_doc,
            requested_count=body.resource_count,
        )
    elif body.kind == CocreateKind.plan:
        live_doc = _finalize_plan_doc(live_doc, prefs=body.plan_prefs)

    messages = [
        {"role": "user", "content": seed},
        {"role": "assistant", "content": assistant_message},
    ]
    row = CocreateSession(
        theme_id=theme_id,
        kind=body.kind,
        messages=messages,
        live_doc=live_doc,
    )
    session.add(row)
    session.commit()
    session.refresh(row)
    return row


@router.post("/start/stream")
def start_cocreate_stream(
    theme_id: str,
    body: CocreateStart,
    session: Session = Depends(get_session),
    settings: Settings = Depends(get_settings),
) -> EventSourceResponse:
    theme = _get_theme(session, theme_id)
    if body.kind == CocreateKind.plan and theme.status != ThemeStatus.active:
        _assert_plan_slot_or_409(session, theme)

    existing = session.exec(
        select(CocreateSession).where(
            CocreateSession.theme_id == theme_id,
            CocreateSession.kind == body.kind,
            CocreateSession.confirmed == False,  # noqa: E712
        )
    ).first()
    if existing and not body.force:
        payload = _session_payload(existing)

        def existing_gen() -> Iterator[dict[str, str]]:
            yield _sse("session", payload)
            yield _sse("done", {"ok": True, "reused": True})

        return EventSourceResponse(existing_gen())
    if existing and body.force:
        session.delete(existing)
        session.commit()

    seed = _seed_user_message(
        theme,
        body.kind,
        resource_count=body.resource_count,
        plan_prefs=body.plan_prefs,
    )
    system = system_prompt_for(body.kind.value)
    context_msgs = [{"role": "user", "content": seed}]
    kind = body.kind
    resource_count = body.resource_count
    plan_prefs = body.plan_prefs
    theme_snapshot = {
        "id": theme.id,
        "title": theme.title,
        "theme_type": theme.theme_type.value,
        "goal": theme.goal,
    }

    def event_gen() -> Iterator[dict[str, str]]:
        yield _sse("status", {"phase": "generating", "kind": kind.value})
        try:
            result: dict[str, Any] | None = None
            for ev in chat_json_stream(
                settings,
                system=system,
                messages=context_msgs,
                kind=kind.value,
            ):
                if ev.get("type") == "delta":
                    yield _sse("delta", {"text": str(ev.get("text") or "")})
                elif ev.get("type") == "result":
                    result = ev.get("result") if isinstance(ev.get("result"), dict) else None
            if not result:
                raise RuntimeError("LLM 流式结果为空")

            assistant_message = str(result.get("assistant_message") or "已生成初稿，请看右侧文档。")
            live_doc = result.get("live_doc") or {}
            if not isinstance(live_doc, dict):
                live_doc = {}
            if not live_doc:
                raise RuntimeError(
                    f"LLM 未返回活文档（kind={kind.value}）。"
                    f"原始键：{list((result.get('_raw') or result).keys())}"
                )

            if kind == CocreateKind.resources:
                live_doc = _finalize_resources_doc(
                    settings,
                    live_doc,
                    requested_count=resource_count,
                )
            elif kind == CocreateKind.plan:
                live_doc = _finalize_plan_doc(live_doc, prefs=plan_prefs)

            messages = [
                {"role": "user", "content": seed},
                {"role": "assistant", "content": assistant_message},
            ]
            with Session(engine) as db:
                row = CocreateSession(
                    theme_id=theme_snapshot["id"],
                    kind=kind,
                    messages=messages,
                    live_doc=live_doc,
                )
                db.add(row)
                db.commit()
                db.refresh(row)
                payload = _session_payload(row)
            yield _sse("live_doc", live_doc)
            yield _sse("session", payload)
            yield _sse("done", {"ok": True})
        except Exception as e:
            yield _sse("error", {"detail": f"LLM 调用失败: {e}"})

    return EventSourceResponse(event_gen())


@router.get("/{kind}", response_model=CocreateSessionOut)
def get_cocreate(
    theme_id: str,
    kind: CocreateKind,
    session: Session = Depends(get_session),
) -> CocreateSession:
    _get_theme(session, theme_id)
    row = session.exec(
        select(CocreateSession)
        .where(CocreateSession.theme_id == theme_id, CocreateSession.kind == kind)
        .order_by(CocreateSession.updated_at.desc())
    ).first()
    if not row:
        raise HTTPException(404, "尚无共创会话，请先 start")
    return row


@router.post("/{kind}/message", response_model=CocreateSessionOut)
def post_message(
    theme_id: str,
    kind: CocreateKind,
    body: CocreateMessageIn,
    session: Session = Depends(get_session),
    settings: Settings = Depends(get_settings),
) -> CocreateSession:
    theme = _get_theme(session, theme_id)
    row = session.exec(
        select(CocreateSession)
        .where(
            CocreateSession.theme_id == theme_id,
            CocreateSession.kind == kind,
            CocreateSession.confirmed == False,  # noqa: E712
        )
        .order_by(CocreateSession.updated_at.desc())
    ).first()
    if not row:
        raise HTTPException(404, "尚无进行中的共创会话")

    messages = list(row.messages or [])
    messages.append({"role": "user", "content": body.content})

    system = system_prompt_for(kind.value)
    llm_messages = [{"role": m["role"], "content": m["content"]} for m in messages]
    extra = (
        "额外上下文：主题="
        f"{theme.title}；类型={theme.theme_type.value}；目标={theme.goal}。"
        f"当前 live_doc={row.live_doc}。"
        '请返回 JSON：{"assistant_message":"...","live_doc":{...}}'
    )
    if kind == CocreateKind.resources:
        extra += (
            " 若用户本轮要求调整资料数量，必须把 live_doc.resources 与 order "
            "严格改成该数量，并更新 target_count；禁止继续输出固定 5 条。"
        )
    if kind == CocreateKind.plan:
        extra += (
            " 若用户本轮调整了学/练/用时长或每天分钟数，同步更新 durations、"
            "各 phase.duration、daily_minutes，并按新节奏重排 activities。"
            " 学习期活动不超过 6 条，练习期不超过 4 条。"
        )
    llm_messages.append({"role": "user", "content": extra})

    try:
        result = chat_json(
            settings,
            system=system,
            messages=llm_messages,
            kind=kind.value,
        )
    except Exception as e:
        raise HTTPException(502, f"LLM 调用失败: {e}") from e

    assistant_message = str(result.get("assistant_message") or "已更新。")
    live_doc = result.get("live_doc") or row.live_doc
    if not isinstance(live_doc, dict) or not live_doc:
        live_doc = row.live_doc

    if kind == CocreateKind.resources:
        requested = post_svc.parse_resource_count_request(body.content)
        live_doc = _finalize_resources_doc(
            settings,
            live_doc if isinstance(live_doc, dict) else {},
            requested_count=requested,
        )
    elif kind == CocreateKind.plan:
        minutes = post_svc.parse_daily_minutes_request(body.content)
        live_doc = _finalize_plan_doc(
            live_doc if isinstance(live_doc, dict) else {},
            daily_minutes=minutes,
        )

    messages.append({"role": "assistant", "content": assistant_message})
    row.messages = messages
    row.live_doc = live_doc
    row.updated_at = datetime.utcnow()
    session.add(row)
    session.commit()
    session.refresh(row)
    return row


@router.post("/{kind}/message/stream")
def post_message_stream(
    theme_id: str,
    kind: CocreateKind,
    body: CocreateMessageIn,
    session: Session = Depends(get_session),
    settings: Settings = Depends(get_settings),
) -> EventSourceResponse:
    theme = _get_theme(session, theme_id)
    row = session.exec(
        select(CocreateSession)
        .where(
            CocreateSession.theme_id == theme_id,
            CocreateSession.kind == kind,
            CocreateSession.confirmed == False,  # noqa: E712
        )
        .order_by(CocreateSession.updated_at.desc())
    ).first()
    if not row:
        raise HTTPException(404, "尚无进行中的共创会话")

    session_id = row.id
    prior_live_doc = dict(row.live_doc or {}) if isinstance(row.live_doc, dict) else {}
    messages = list(row.messages or [])
    messages.append({"role": "user", "content": body.content})

    system = system_prompt_for(kind.value)
    llm_messages = [{"role": m["role"], "content": m["content"]} for m in messages]
    extra = (
        "额外上下文：主题="
        f"{theme.title}；类型={theme.theme_type.value}；目标={theme.goal}。"
        f"当前 live_doc={prior_live_doc}。"
        '请返回 JSON：{"assistant_message":"...","live_doc":{...}}'
    )
    if kind == CocreateKind.resources:
        extra += (
            " 若用户本轮要求调整资料数量，必须把 live_doc.resources 与 order "
            "严格改成该数量，并更新 target_count；禁止继续输出固定 5 条。"
        )
    if kind == CocreateKind.plan:
        extra += (
            " 若用户本轮调整了学/练/用时长或每天分钟数，同步更新 durations、"
            "各 phase.duration、daily_minutes，并按新节奏重排 activities。"
            " 学习期活动不超过 6 条，练习期不超过 4 条。"
        )
    llm_messages.append({"role": "user", "content": extra})
    user_content = body.content

    def event_gen() -> Iterator[dict[str, str]]:
        yield _sse("status", {"phase": "generating", "kind": kind.value})
        try:
            result: dict[str, Any] | None = None
            for ev in chat_json_stream(
                settings,
                system=system,
                messages=llm_messages,
                kind=kind.value,
            ):
                if ev.get("type") == "delta":
                    yield _sse("delta", {"text": str(ev.get("text") or "")})
                elif ev.get("type") == "result":
                    result = ev.get("result") if isinstance(ev.get("result"), dict) else None
            if not result:
                raise RuntimeError("LLM 流式结果为空")

            assistant_message = str(result.get("assistant_message") or "已更新。")
            live_doc = result.get("live_doc") or prior_live_doc
            if not isinstance(live_doc, dict) or not live_doc:
                live_doc = prior_live_doc

            if kind == CocreateKind.resources:
                requested = post_svc.parse_resource_count_request(user_content)
                live_doc = _finalize_resources_doc(
                    settings,
                    live_doc if isinstance(live_doc, dict) else {},
                    requested_count=requested,
                )
            elif kind == CocreateKind.plan:
                minutes = post_svc.parse_daily_minutes_request(user_content)
                live_doc = _finalize_plan_doc(
                    live_doc if isinstance(live_doc, dict) else {},
                    daily_minutes=minutes,
                )

            out_messages = list(messages)
            out_messages.append({"role": "assistant", "content": assistant_message})
            with Session(engine) as db:
                db_row = db.get(CocreateSession, session_id)
                if not db_row or db_row.confirmed:
                    raise RuntimeError("共创会话已不存在或已确认")
                db_row.messages = out_messages
                db_row.live_doc = live_doc
                db_row.updated_at = datetime.utcnow()
                db.add(db_row)
                db.commit()
                db.refresh(db_row)
                payload = _session_payload(db_row)
            yield _sse("live_doc", live_doc)
            yield _sse("session", payload)
            yield _sse("done", {"ok": True})
        except Exception as e:
            yield _sse("error", {"detail": f"LLM 调用失败: {e}"})

    return EventSourceResponse(event_gen())


@router.post("/{kind}/confirm", response_model=ThemeOut)
def confirm_cocreate(
    theme_id: str,
    kind: CocreateKind,
    body: CocreateConfirmIn,
    session: Session = Depends(get_session),
) -> Theme:
    theme = _get_theme(session, theme_id)
    row = session.exec(
        select(CocreateSession)
        .where(
            CocreateSession.theme_id == theme_id,
            CocreateSession.kind == kind,
        )
        .order_by(CocreateSession.updated_at.desc())
    ).first()
    if not row:
        raise HTTPException(404, "尚无共创会话")
    if row.confirmed:
        raise HTTPException(
            409,
            "本步已确认。请先「重新共创」后再确认；直接确认会覆盖已锁定的计划进度。",
        )

    live_doc = body.live_doc or row.live_doc or {}
    if kind == CocreateKind.stage:
        level = body.selected_level or live_doc.get("selected_level")
        if not level:
            raise HTTPException(400, "请先选择当前阶梯级别（1–5）")
        live_doc["selected_level"] = int(level)
        theme.current_ladder_level = int(level)
        theme.ladder_doc = live_doc
    elif kind == CocreateKind.resources:
        theme.resources_doc = live_doc
    elif kind == CocreateKind.plan:
        live_doc = _finalize_plan_doc(live_doc if isinstance(live_doc, dict) else {})
        try:
            domain_svc.lock_theme_plan(session, theme, live_doc)
        except ValueError as e:
            raise HTTPException(409, str(e)) from e

    row.live_doc = live_doc
    row.confirmed = True
    row.updated_at = datetime.utcnow()
    theme.updated_at = datetime.utcnow()
    session.add(row)
    session.add(theme)
    session.commit()
    session.refresh(theme)
    return theme


def _seed_user_message(
    theme: Theme,
    kind: CocreateKind,
    *,
    resource_count: int | None = None,
    plan_prefs: PlanPrefs | None = None,
) -> str:
    base = f"主题：{theme.title}\n类型：{theme.theme_type.value}\n目标：{theme.goal or '（未填）'}"
    if kind == CocreateKind.stage:
        return f"{base}\n请为该主题生成 5 级学习阶梯初稿。"
    if kind == CocreateKind.resources:
        ladder = theme.ladder_doc or {}
        level = theme.current_ladder_level
        theme_type = theme.theme_type.value
        if theme_type == "tech":
            curate = (
                "主题类型=tech：请默认交付 AI 学习包（概念对照卡、常见编译/概念错误病例、最短可运行例子）；"
                "官方文档/The Book 配额≤1且仅作索引，不要当第一天主读物。"
            )
        else:
            curate = (
                "主题类型=general：请默认交付「1 本主书 + 本周阅读脚本」；"
                "how_to_use 要有可立即执行的步骤与输出物；优先微信读书可读书籍；不要三本经典并列空书单。"
            )
        if resource_count:
            return (
                f"{base}\n当前阶梯级别：{level}\n阶梯摘要：{ladder}\n"
                f"{curate}\n"
                f"请按用户要求筛选恰好 {resource_count} 个高杠杆学习资料（可含 script/ai_pack）。"
            )
        return (
            f"{base}\n当前阶梯级别：{level}\n阶梯摘要：{ladder}\n"
            f"{curate}\n"
            "请根据主题、目标与当前阶梯，推荐一套可执行资料初稿。"
            f"默认约 {plan_defaults.DEFAULT_RESOURCE_COUNT} 份；在 assistant_message 里简要说明推荐理由，并邀请我提意见。"
        )
    if plan_prefs is not None:
        learning_is_2h = (
            "2 小时" in plan_prefs.learning_duration
            or "2小时" in plan_prefs.learning_duration
        )
        learning_acts = "约 10 条" if learning_is_2h else "4–6 条"
        return (
            f"{base}\n当前阶梯级别：{theme.current_ladder_level}\n"
            f"资料清单：{theme.resources_doc}\n"
            "请按以下用户指定节奏生成学/练/用三阶段计划：\n"
            f"- 学习期：{plan_prefs.learning_duration}（activities {learning_acts}）\n"
            f"- 练习期：{plan_prefs.practice_duration}（activities ≤{plan_defaults.DEFAULT_PRACTICE_ACTIVITY_MAX} 条）\n"
            f"- 应用期：{plan_prefs.application_duration}（activities ≤{plan_defaults.DEFAULT_APPLICATION_ACTIVITY_MAX} 条）\n"
            f"- 每天约 {plan_prefs.daily_minutes} 分钟（练习/应用期；若学习期为 2 小时课表则学节用 120 分钟）\n"
            "activities 数量与摘要必须匹配上述时长；标题尽量短。"
        )
    return (
        f"{base}\n当前阶梯级别：{theme.current_ladder_level}\n"
        f"资料清单：{theme.resources_doc}\n"
        "请根据主题、目标、阶梯与资料，推荐学/练/用三阶段计划初稿。\n"
        "首轮节奏锚点（除非上下文强烈需要微调，否则按此）：\n"
        f"- 学习期：{plan_defaults.DEFAULT_LEARNING_DURATION}，activities 约 {plan_defaults.DEFAULT_LEARNING_ACTIVITY_MAX} 条，每节约 120 分钟\n"
        f"- 练习期：{plan_defaults.DEFAULT_PRACTICE_DURATION}，每天约 {plan_defaults.DEFAULT_DAILY_MINUTES} 分钟，activities ≤{plan_defaults.DEFAULT_PRACTICE_ACTIVITY_MAX}\n"
        f"- 应用期：{plan_defaults.DEFAULT_APPLICATION_DURATION}，每天约 {plan_defaults.DEFAULT_DAILY_MINUTES} 分钟，activities ≤{plan_defaults.DEFAULT_APPLICATION_ACTIVITY_MAX}\n"
        "在 assistant_message 里说明推荐理由，并邀请我提意见。"
    )


def _apply_plan_prefs(live_doc: dict[str, Any], prefs: PlanPrefs) -> dict[str, Any]:
    out = dict(live_doc)
    out["daily_minutes"] = prefs.daily_minutes
    out["durations"] = {
        "learning": prefs.learning_duration,
        "practice": prefs.practice_duration,
        "application": prefs.application_duration,
    }
    learning_minutes = (
        120
        if ("2 小时" in prefs.learning_duration or "2小时" in prefs.learning_duration)
        else prefs.daily_minutes
    )
    out["phase_minutes"] = {
        "learning": learning_minutes,
        "practice": prefs.daily_minutes,
        "application": prefs.daily_minutes,
    }
    phases = out.get("phases")
    if isinstance(phases, dict):
        phases = dict(phases)
        for key, duration in out["durations"].items():
            phase = phases.get(key)
            if isinstance(phase, dict):
                phase = dict(phase)
                phase.setdefault("duration", duration)
                phases[key] = phase
        out["phases"] = phases
    return out


def _maybe_enrich_weread(settings: Settings, live_doc: dict[str, Any]) -> dict[str, Any]:
    resources = live_doc.get("resources")
    if not isinstance(resources, list):
        return live_doc
    out = dict(live_doc)
    # Always drop non-book / mismatched bindings, even when WeRead is off.
    cleaned = sanitize_weread_bindings(resources)
    if not settings.weread_api_key:
        out["resources"] = cleaned
        return out
    try:
        enriched = enrich_resources_with_weread(settings, cleaned)
    except Exception:
        out["resources"] = cleaned
        return out
    out["resources"] = sanitize_weread_bindings(enriched)
    return out
