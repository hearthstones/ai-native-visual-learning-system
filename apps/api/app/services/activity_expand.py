"""单条计划活动 → 可长期复用的 execution_doc。"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any
from uuid import uuid4

from app.config import Settings
from app.models import Activity, Theme
from app.plan_defaults import DEFAULT_DAILY_MINUTES
from app.services.llm import chat_json
from app.services.skills import system_prompt_for


def empty_execution_doc() -> dict[str, Any]:
    return {
        "goal": "",
        "steps": [],
        "resource_ref": None,
        "outcome": "",
        "minutes": DEFAULT_DAILY_MINUTES,
        "messages": [],
        "updated_at": None,
    }


def has_execution(doc: dict[str, Any] | None) -> bool:
    if not isinstance(doc, dict):
        return False
    steps = doc.get("steps")
    goal = (doc.get("goal") or "").strip()
    return bool(goal) or (isinstance(steps, list) and len(steps) > 0)


def next_undone_step_text(doc: dict[str, Any] | None) -> str | None:
    if not isinstance(doc, dict):
        return None
    steps = doc.get("steps")
    if not isinstance(steps, list):
        return None
    for step in steps:
        if not isinstance(step, dict):
            continue
        if step.get("done"):
            continue
        text = str(step.get("text") or "").strip()
        if text:
            return text
    return None


def execution_summary(doc: dict[str, Any] | None) -> dict[str, Any] | None:
    """首页轻量摘要；未展开时返回 None。"""
    if not has_execution(doc):
        return None
    assert isinstance(doc, dict)
    steps = doc.get("steps") if isinstance(doc.get("steps"), list) else []
    step_dicts = [s for s in steps if isinstance(s, dict)]
    steps_total = len(step_dicts)
    steps_done = sum(1 for s in step_dicts if s.get("done"))
    goal = str(doc.get("goal") or "").strip() or None
    next_step = next_undone_step_text(doc)
    minutes = doc.get("minutes")
    minutes_out = int(minutes) if isinstance(minutes, (int, float)) and minutes > 0 else None
    return {
        "expanded": True,
        "goal": goal,
        "next_step": next_step,
        "steps_done": steps_done,
        "steps_total": steps_total,
        "minutes": minutes_out,
    }


def _resource_catalog(theme: Theme) -> list[dict[str, Any]]:
    doc = theme.resources_doc or {}
    resources = doc.get("resources") or []
    if not isinstance(resources, list):
        return []
    order = doc.get("order")
    if isinstance(order, list) and order:
        indices = [int(i) for i in order if isinstance(i, (int, float))]
    else:
        indices = list(range(len(resources)))
    out: list[dict[str, Any]] = []
    for idx in indices:
        if not (0 <= idx < len(resources)):
            continue
        item = resources[idx]
        if not isinstance(item, dict):
            continue
        name = str(item.get("name") or "").strip()
        if not name:
            continue
        out.append(
            {
                "index": idx,
                "name": name,
                "type": item.get("type"),
                "how_to_use": item.get("how_to_use") or "",
                "why": item.get("why") or "",
            }
        )
    return out


def build_context(
    theme: Theme,
    activity: Activity,
    *,
    daily_minutes: int,
) -> dict[str, Any]:
    return {
        "theme": {
            "title": theme.title,
            "goal": theme.goal,
            "phase": theme.phase.value if theme.phase else None,
            "ladder_level": theme.current_ladder_level,
        },
        "activity": {
            "title": activity.title,
            "description": activity.description,
            "activity_type": activity.activity_type.value if activity.activity_type else None,
        },
        "daily_minutes": daily_minutes,
        "resources": _resource_catalog(theme),
    }


def normalize_execution(
    raw: dict[str, Any] | None,
    *,
    daily_minutes: int,
    previous: dict[str, Any] | None = None,
    assistant_message: str = "",
    user_message: str | None = None,
    reset_step_done: bool = True,
) -> dict[str, Any]:
    prev = previous if isinstance(previous, dict) else {}
    src = raw if isinstance(raw, dict) else {}
    if "execution" in src and isinstance(src["execution"], dict):
        exe = src["execution"]
        assistant_message = assistant_message or str(src.get("assistant_message") or "")
    else:
        exe = src

    goal = str(exe.get("goal") or "").strip()
    outcome = str(exe.get("outcome") or "").strip()
    try:
        minutes = int(exe.get("minutes") or daily_minutes or DEFAULT_DAILY_MINUTES)
    except (TypeError, ValueError):
        minutes = daily_minutes or DEFAULT_DAILY_MINUTES
    if minutes <= 0:
        minutes = daily_minutes or DEFAULT_DAILY_MINUTES

    old_done_by_text: dict[str, bool] = {}
    if not reset_step_done:
        for step in prev.get("steps") or []:
            if isinstance(step, dict) and step.get("text"):
                old_done_by_text[str(step["text"])] = bool(step.get("done"))

    steps_raw = exe.get("steps") or []
    steps: list[dict[str, Any]] = []
    if isinstance(steps_raw, list):
        for item in steps_raw:
            if isinstance(item, str) and item.strip():
                text = item.strip()
                steps.append(
                    {
                        "id": str(uuid4()),
                        "text": text,
                        "done": False if reset_step_done else old_done_by_text.get(text, False),
                    }
                )
            elif isinstance(item, dict) and str(item.get("text") or "").strip():
                text = str(item["text"]).strip()
                step_id = str(item.get("id") or uuid4())
                if reset_step_done:
                    done = False
                elif "done" in item:
                    done = bool(item.get("done"))
                else:
                    done = old_done_by_text.get(text, False)
                steps.append({"id": step_id, "text": text, "done": done})

    if len(steps) > 4:
        steps = steps[:4]

    resource_ref = exe.get("resource_ref")
    if resource_ref is not None and not isinstance(resource_ref, dict):
        resource_ref = None
    if isinstance(resource_ref, dict):
        name = str(resource_ref.get("name") or "").strip()
        idx = resource_ref.get("index")
        try:
            idx_out: int | None = int(idx) if idx is not None else None
        except (TypeError, ValueError):
            idx_out = None
        resource_ref = {"index": idx_out, "name": name} if name or idx_out is not None else None

    messages = list(prev.get("messages") or [])
    if user_message is not None:
        messages.append({"role": "user", "content": user_message})
    if assistant_message:
        messages.append({"role": "assistant", "content": assistant_message})

    return {
        "goal": goal,
        "steps": steps,
        "resource_ref": resource_ref,
        "outcome": outcome,
        "minutes": minutes,
        "messages": messages[-20:],
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }


def generate_execution(
    settings: Settings,
    theme: Theme,
    activity: Activity,
    *,
    daily_minutes: int,
) -> dict[str, Any]:
    context = build_context(theme, activity, daily_minutes=daily_minutes)
    system = system_prompt_for("activity_expand")
    user_prompt = (
        "请把下面这条计划活动展开为可执行结构。只输出 JSON。\n"
        f"{context}"
    )
    result = chat_json(
        settings,
        system=system,
        messages=[{"role": "user", "content": user_prompt}],
        temperature=0.4,
        kind="activity_expand",
    )
    assistant = str(result.get("assistant_message") or "已展开为可执行步骤，可直接用或继续改。")
    return normalize_execution(
        result,
        daily_minutes=daily_minutes,
        previous=None,
        assistant_message=assistant,
        user_message=None,
        reset_step_done=True,
    )


def revise_execution(
    settings: Settings,
    theme: Theme,
    activity: Activity,
    *,
    daily_minutes: int,
    user_content: str,
) -> dict[str, Any]:
    current = activity.execution_doc if isinstance(activity.execution_doc, dict) else {}
    context = build_context(theme, activity, daily_minutes=daily_minutes)
    system = system_prompt_for("activity_expand")
    history = []
    for msg in (current.get("messages") or [])[-8:]:
        if isinstance(msg, dict) and msg.get("role") in ("user", "assistant") and msg.get("content"):
            history.append({"role": msg["role"], "content": str(msg["content"])})
    history.append(
        {
            "role": "user",
            "content": (
                "请根据我的意见，更新这一条活动的 execution。"
                "保留仍合理的部分，只改需要改的。"
                f"\n当前 execution：{ {k: current.get(k) for k in ('goal','steps','resource_ref','outcome','minutes')} }"
                f"\n上下文：{context}"
                f"\n我的意见：{user_content}"
            ),
        }
    )
    result = chat_json(
        settings,
        system=system,
        messages=history,
        temperature=0.4,
        kind="activity_expand",
    )
    assistant = str(result.get("assistant_message") or "已按你的意见更新。")
    return normalize_execution(
        result,
        daily_minutes=daily_minutes,
        previous=current,
        assistant_message=assistant,
        user_message=user_content,
        reset_step_done=True,
    )


def apply_manual_patch(
    current: dict[str, Any] | None,
    patch: dict[str, Any],
    *,
    daily_minutes: int,
) -> dict[str, Any]:
    base = dict(current) if isinstance(current, dict) else empty_execution_doc()
    merged = {
        "goal": patch["goal"] if "goal" in patch else base.get("goal"),
        "steps": patch["steps"] if "steps" in patch else base.get("steps"),
        "resource_ref": patch["resource_ref"] if "resource_ref" in patch else base.get("resource_ref"),
        "outcome": patch["outcome"] if "outcome" in patch else base.get("outcome"),
        "minutes": patch["minutes"] if "minutes" in patch else base.get("minutes"),
        "messages": base.get("messages") or [],
    }
    return normalize_execution(
        {"execution": merged},
        daily_minutes=int(merged.get("minutes") or daily_minutes),
        previous=base,
        assistant_message="",
        user_message=None,
        reset_step_done=False,
    )


def set_step_done(doc: dict[str, Any] | None, step_id: str, done: bool) -> dict[str, Any]:
    base = dict(doc) if isinstance(doc, dict) else empty_execution_doc()
    steps = []
    found = False
    for step in base.get("steps") or []:
        if not isinstance(step, dict):
            continue
        if str(step.get("id")) == str(step_id):
            steps.append({**step, "done": done})
            found = True
        else:
            steps.append(step)
    if not found:
        raise KeyError("step_not_found")
    base["steps"] = steps
    base["updated_at"] = datetime.now(timezone.utc).isoformat()
    return base
