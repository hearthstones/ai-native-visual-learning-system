from __future__ import annotations

import json
import re
import time
from collections.abc import Iterator
from typing import Any

from openai import OpenAI

from app.config import Settings
from app.services.mock_llm import is_mock_mode, mock_chat_json


def get_llm_client(settings: Settings) -> OpenAI:
    if not settings.deepseek_api_key:
        raise RuntimeError(
            "未配置 DEEPSEEK_API_KEY。请在设置页配置，或在仓库根目录 .env 中设置后重启 API。"
        )
    if is_mock_mode(settings.deepseek_api_key):
        raise RuntimeError("当前为 mock LLM 模式，不应创建真实客户端。")
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


def _system_full(system: str, kind: str | None) -> str:
    # weekly_review / activity_expand 有独立 JSON 契约，不要叠共创的 assistant_message/live_doc 约束
    if kind in (None, "weekly_review", "activity_expand"):
        return system
    return f"{system}\n\n{OUTPUT_CONTRACT}"


def extract_assistant_message_partial(buf: str) -> str | None:
    """Best-effort pull of assistant_message string while JSON is still streaming."""
    key = '"assistant_message"'
    i = buf.find(key)
    if i < 0:
        return None
    j = buf.find(":", i + len(key))
    if j < 0:
        return None
    j += 1
    while j < len(buf) and buf[j] in " \t\n\r":
        j += 1
    if j >= len(buf) or buf[j] != '"':
        return None
    j += 1
    out: list[str] = []
    escapes = {"n": "\n", "t": "\t", "r": "\r", '"': '"', "\\": "\\", "/": "/"}
    while j < len(buf):
        c = buf[j]
        if c == "\\":
            if j + 1 >= len(buf):
                break
            nxt = buf[j + 1]
            if nxt == "u" and j + 5 < len(buf):
                hex_part = buf[j + 2 : j + 6]
                if re.fullmatch(r"[0-9a-fA-F]{4}", hex_part):
                    out.append(chr(int(hex_part, 16)))
                    j += 6
                    continue
            out.append(escapes.get(nxt, nxt))
            j += 2
            continue
        if c == '"':
            return "".join(out)
        out.append(c)
        j += 1
    return "".join(out)


def _mock_stream_events(kind: str | None, messages: list[dict[str, str]]) -> Iterator[dict[str, Any]]:
    result = mock_chat_json(kind=kind, messages=messages)
    if kind and kind not in ("weekly_review", "activity_expand"):
        result = normalize_cocreate_result(kind, result)
    text = str(result.get("assistant_message") or "")
    # Simulate typing so the UI path is exercised in mock mode.
    step = max(1, min(4, len(text) // 12 or 1))
    for i in range(0, len(text), step):
        yield {"type": "delta", "text": text[i : i + step]}
        time.sleep(0.01)
    yield {"type": "result", "result": result}


def chat_json_stream(
    settings: Settings,
    *,
    system: str,
    messages: list[dict[str, str]],
    temperature: float = 0.4,
    kind: str | None = None,
) -> Iterator[dict[str, Any]]:
    """Yield {type:delta,text} while streaming, then {type:result,result}."""
    if is_mock_mode(settings.deepseek_api_key):
        yield from _mock_stream_events(kind, messages)
        return

    client = get_llm_client(settings)
    payload = [{"role": "system", "content": _system_full(system, kind)}, *messages]
    kwargs: dict[str, Any] = {
        "model": settings.deepseek_model,
        "messages": payload,
        "temperature": temperature,
        "stream": True,
        "extra_body": {"thinking": {"type": "disabled"}},
    }
    try:
        stream = client.chat.completions.create(
            **kwargs,
            response_format={"type": "json_object"},
        )
    except Exception as first_err:
        err_text = str(first_err)
        if "Connection" in err_text or "connect" in err_text.lower():
            raise
        stream = client.chat.completions.create(**kwargs)

    buf = ""
    emitted = ""
    for chunk in stream:
        try:
            delta = chunk.choices[0].delta.content or ""
        except Exception:
            delta = ""
        if not delta:
            continue
        buf += delta
        partial = extract_assistant_message_partial(buf)
        if partial is None:
            continue
        if partial.startswith(emitted):
            neu = partial[len(emitted) :]
            if neu:
                emitted = partial
                yield {"type": "delta", "text": neu}
        else:
            # Rare reshape of the string; resync by sending remaining suffix if possible.
            emitted = partial
            yield {"type": "delta", "text": partial}

    parsed = extract_json(buf)
    if kind and kind not in ("weekly_review", "activity_expand"):
        result = normalize_cocreate_result(kind, parsed)
    else:
        result = parsed
    final_msg = str(result.get("assistant_message") or "")
    if final_msg and not emitted:
        yield {"type": "delta", "text": final_msg}
    elif final_msg.startswith(emitted) and final_msg != emitted:
        yield {"type": "delta", "text": final_msg[len(emitted) :]}
    yield {"type": "result", "result": result}


def chat_json(
    settings: Settings,
    *,
    system: str,
    messages: list[dict[str, str]],
    temperature: float = 0.4,
    kind: str | None = None,
) -> dict[str, Any]:
    if is_mock_mode(settings.deepseek_api_key):
        result = mock_chat_json(kind=kind, messages=messages)
        if kind and kind not in ("weekly_review", "activity_expand"):
            return normalize_cocreate_result(kind, result)
        return result

    client = get_llm_client(settings)
    payload = [{"role": "system", "content": _system_full(system, kind)}, *messages]
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
    if kind and kind not in ("weekly_review", "activity_expand"):
        return normalize_cocreate_result(kind, parsed)
    return parsed
