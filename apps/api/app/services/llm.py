from __future__ import annotations

import json
import re
from typing import Any

from openai import OpenAI

from app.config import Settings


def get_llm_client(settings: Settings) -> OpenAI:
    if not settings.deepseek_api_key:
        raise RuntimeError(
            "未配置 DEEPSEEK_API_KEY。请在设置页配置，或在仓库根目录 .env 中设置后重启 API。"
        )
    return OpenAI(
        api_key=settings.deepseek_api_key,
        base_url=settings.deepseek_base_url,
    )


def extract_json(text: str) -> dict[str, Any]:
    text = text.strip()
    if text.startswith("```"):
        text = re.sub(r"^```(?:json)?\s*", "", text)
        text = re.sub(r"\s*```$", "", text)
    try:
        data = json.loads(text)
        if isinstance(data, dict):
            return data
    except json.JSONDecodeError:
        pass
    match = re.search(r"\{[\s\S]*\}", text)
    if not match:
        raise ValueError(f"模型未返回可解析 JSON：{text[:200]}")
    data = json.loads(match.group(0))
    if not isinstance(data, dict):
        raise ValueError("模型 JSON 根节点必须是对象")
    return data


OUTPUT_CONTRACT = (
    "你必须只输出一个 JSON 对象，字段固定为："
    '{"assistant_message":"给用户看的简短中文回复","live_doc":{...右侧活文档}}。'
    "不要把活文档字段平铺到根节点；不要输出 markdown 代码围栏。"
)


def normalize_cocreate_result(kind: str, result: dict[str, Any]) -> dict[str, Any]:
    """Accept either wrapped {assistant_message, live_doc} or flattened live_doc fields."""
    assistant = str(result.get("assistant_message") or "").strip()
    live_doc = result.get("live_doc")
    if isinstance(live_doc, dict) and live_doc:
        return {
            "assistant_message": assistant or "已生成初稿，请看右侧文档。",
            "live_doc": live_doc,
        }

    # Flattened payloads
    if kind == "stage" and isinstance(result.get("levels"), list):
        return {
            "assistant_message": assistant or "已生成 5 级学习阶梯，请选择你当前所在级别。",
            "live_doc": {
                "levels": result["levels"],
                "selected_level": result.get("selected_level"),
            },
        }
    if kind == "resources" and isinstance(result.get("resources"), list):
        return {
            "assistant_message": assistant or "已筛出高杠杆资料初稿，可继续加约束。",
            "live_doc": {
                "constraints": result.get("constraints") or [],
                "target_count": result.get("target_count") or len(result["resources"]),
                "resources": result["resources"],
                "order": result.get("order") or list(range(len(result["resources"]))),
                "path_7d": result.get("path_7d") or "",
            },
        }
    if kind == "plan" and (
        isinstance(result.get("phases"), dict) or isinstance(result.get("core_20"), list)
    ):
        phases = result.get("phases") or {}
        durations = result.get("durations") or {}
        if isinstance(phases, dict):
            for key in ("learning", "practice", "application"):
                phase = phases.get(key)
                if isinstance(phase, dict) and phase.get("duration") and key not in durations:
                    durations[key] = phase["duration"]
        if not durations:
            durations = {
                "learning": "10 节 × 2 小时",
                "practice": "约 4 周",
                "application": "长尾",
            }
        phase_minutes = result.get("phase_minutes") or {}
        if not isinstance(phase_minutes, dict) or not phase_minutes:
            phase_minutes = {"learning": 120, "practice": 30, "application": 30}
        return {
            "assistant_message": assistant or "已生成学/练/用三阶段计划初稿。",
            "live_doc": {
                "goal": result.get("goal") or "",
                "core_20": result.get("core_20") or [],
                "phases": phases,
                "durations": durations,
                "phase_minutes": phase_minutes,
                "rationale": result.get("rationale") or "",
                "daily_minutes": result.get("daily_minutes") or 30,
            },
        }
    if kind == "weekly_review":
        return result

    return {
        "assistant_message": assistant or "已生成初稿，请看右侧文档。",
        "live_doc": live_doc if isinstance(live_doc, dict) else {},
        "_raw": result,
    }


def chat_json(
    settings: Settings,
    *,
    system: str,
    messages: list[dict[str, str]],
    temperature: float = 0.4,
    kind: str | None = None,
) -> dict[str, Any]:
    client = get_llm_client(settings)
    # weekly_review 有独立 JSON 契约，不要叠共创的 assistant_message/live_doc 约束
    if kind in (None, "weekly_review"):
        system_full = system
    else:
        system_full = f"{system}\n\n{OUTPUT_CONTRACT}"
    payload = [{"role": "system", "content": system_full}, *messages]
    kwargs: dict[str, Any] = {
        "model": settings.deepseek_model,
        "messages": payload,
        "temperature": temperature,
        "extra_body": {"thinking": {"type": "disabled"}},
    }
    # Prefer JSON mode when available；DeepSeek 要求 prompt 含 "json" 字样
    try:
        completion = client.chat.completions.create(
            **kwargs,
            response_format={"type": "json_object"},
        )
    except Exception as first_err:
        # JSON mode 不支持或 prompt 不合规时降级；连接类错误直接抛出
        err_text = str(first_err)
        if "Connection" in err_text or "connect" in err_text.lower():
            raise
        completion = client.chat.completions.create(**kwargs)
    content = completion.choices[0].message.content or ""
    parsed = extract_json(content)
    if kind:
        return normalize_cocreate_result(kind, parsed)
    return parsed
