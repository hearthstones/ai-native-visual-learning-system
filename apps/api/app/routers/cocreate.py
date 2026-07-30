from datetime import datetime
from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session, select

from app.config import Settings, get_settings
from app.db import get_session
from app.models import CocreateKind, CocreateSession, Theme, ThemeStatus
from app.schemas import (
    CocreateConfirmIn,
    CocreateMessageIn,
    CocreateSessionOut,
    CocreateStart,
    ThemeOut,
)
from app.services import domain as domain_svc
from app.services.llm import chat_json
from app.services.skills import system_prompt_for
from app.services.weread import enrich_resources_with_weread

router = APIRouter(prefix="/themes/{theme_id}/cocreate", tags=["cocreate"])


def _get_theme(session: Session, theme_id: str) -> Theme:
    theme = session.get(Theme, theme_id)
    if not theme:
        raise HTTPException(404, "主题不存在")
    return theme


@router.post("/start", response_model=CocreateSessionOut)
def start_cocreate(
    theme_id: str,
    body: CocreateStart,
    session: Session = Depends(get_session),
    settings: Settings = Depends(get_settings),
) -> CocreateSession:
    theme = _get_theme(session, theme_id)
    existing = session.exec(
        select(CocreateSession).where(
            CocreateSession.theme_id == theme_id,
            CocreateSession.kind == body.kind,
            CocreateSession.confirmed == False,  # noqa: E712
        )
    ).first()
    if existing:
        return existing

    seed = _seed_user_message(theme, body.kind)
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
        raise HTTPException(502, f"LLM 调用失败: {e}") from e

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
        live_doc = _maybe_enrich_weread(settings, live_doc)

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
    llm_messages.append(
        {
            "role": "user",
            "content": (
                "额外上下文：主题="
                f"{theme.title}；类型={theme.theme_type.value}；目标={theme.goal}。"
                f"当前 live_doc={row.live_doc}。"
                '请返回 JSON：{"assistant_message":"...","live_doc":{...}}'
            ),
        }
    )

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
        live_doc = _maybe_enrich_weread(settings, live_doc)

    messages.append({"role": "assistant", "content": assistant_message})
    row.messages = messages
    row.live_doc = live_doc
    row.updated_at = datetime.utcnow()
    session.add(row)
    session.commit()
    session.refresh(row)
    return row


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
        if theme.status == ThemeStatus.active and theme.locked_at:
            # allow re-confirm only updates draft docs; locking again regenerates
            pass
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


def _seed_user_message(theme: Theme, kind: CocreateKind) -> str:
    base = f"主题：{theme.title}\n类型：{theme.theme_type.value}\n目标：{theme.goal or '（未填）'}"
    if kind == CocreateKind.stage:
        return f"{base}\n请为该主题生成 5 级学习阶梯初稿。"
    if kind == CocreateKind.resources:
        ladder = theme.ladder_doc or {}
        level = theme.current_ladder_level
        return (
            f"{base}\n当前阶梯级别：{level}\n阶梯摘要：{ladder}\n"
            "请筛选 5 个高杠杆学习资料初稿。"
            + ("优先考虑微信读书可读书籍。" if theme.theme_type.value == "general" else "")
        )
    # plan
    return (
        f"{base}\n当前阶梯级别：{theme.current_ladder_level}\n"
        f"资料清单：{theme.resources_doc}\n"
        "请生成学/练/用三阶段计划初稿，约 30 分钟/天。"
    )


def _mentions_weread(text: str) -> bool:
    t = text.lower()
    return "微信读书" in text or "weread" in t or "微信" in text


def _maybe_enrich_weread(settings: Settings, live_doc: dict[str, Any]) -> dict[str, Any]:
    resources = live_doc.get("resources")
    if not isinstance(resources, list) or not settings.weread_api_key:
        return live_doc
    try:
        enriched = enrich_resources_with_weread(settings, resources)
    except Exception:
        return live_doc
    out = dict(live_doc)
    out["resources"] = enriched
    return out
