"""Post-process helpers for cocreate live_doc (UX trial hardening)."""

from __future__ import annotations

import re
from typing import Any


_COUNT_RE = re.compile(
    r"(?:只要|只要有|仅要|只要保留|改成|改为|变成|调整为|精简到|压缩到|需要|要)"
    r"\s*(\d{1,2})\s*(?:份|本|个|条|项)|"
    r"(\d{1,2})\s*(?:份|本|个)\s*(?:资料|书|资源)",
)
_DAILY_MIN_RE = re.compile(
    r"(?:每天|每日|一天)\s*(?:最多|不超过|大概|约|大约)?\s*(\d{1,3})\s*分钟|"
    r"(\d{1,3})\s*分钟\s*(?:每天|每日|/天)",
)


def parse_resource_count_request(text: str) -> int | None:
    if not text:
        return None
    m = _COUNT_RE.search(text)
    if not m:
        return None
    raw = m.group(1) or m.group(2)
    if not raw:
        return None
    n = int(raw)
    if 1 <= n <= 12:
        return n
    return None


def parse_daily_minutes_request(text: str) -> int | None:
    if not text:
        return None
    m = _DAILY_MIN_RE.search(text)
    if not m:
        return None
    raw = m.group(1) or m.group(2)
    if not raw:
        return None
    n = int(raw)
    if 5 <= n <= 240:
        return n
    return None


def enforce_resource_count(live_doc: dict[str, Any], count: int) -> dict[str, Any]:
    """Hard-trim/pad resources to exact count; refresh order + target_count."""
    out = dict(live_doc)
    resources = list(out.get("resources") or [])
    if not isinstance(resources, list):
        resources = []
    resources = [r for r in resources if isinstance(r, dict)]
    if len(resources) > count:
        resources = resources[:count]
    elif len(resources) < count:
        # Keep shorter list; only mark target — do not invent fake books.
        pass
    out["resources"] = resources
    out["target_count"] = count
    out["order"] = list(range(len(resources)))
    constraints = list(out.get("constraints") or []) if isinstance(out.get("constraints"), list) else []
    marker = f"恰好 {count} 份"
    if marker not in constraints:
        constraints = [c for c in constraints if not str(c).startswith("恰好 ")]
        constraints.append(marker)
    out["constraints"] = constraints
    return out


def cap_phase_activities(
    live_doc: dict[str, Any],
    *,
    learning_max: int = 6,
    practice_max: int = 4,
    application_max: int = 3,
) -> dict[str, Any]:
    """Clamp activity lists so queue does not explode for 20–30 min/day users."""
    out = dict(live_doc)
    phases = out.get("phases")
    if not isinstance(phases, dict):
        return out
    phases = dict(phases)
    limits = {
        "learning": learning_max,
        "practice": practice_max,
        "application": application_max,
    }
    for key, limit in limits.items():
        phase = phases.get(key)
        if not isinstance(phase, dict):
            continue
        phase = dict(phase)
        acts = phase.get("activities")
        if isinstance(acts, list) and len(acts) > limit:
            phase["activities"] = acts[:limit]
        phases[key] = phase
    out["phases"] = phases
    return out


def force_daily_minutes(live_doc: dict[str, Any], minutes: int) -> dict[str, Any]:
    out = dict(live_doc)
    out["daily_minutes"] = minutes
    phase_minutes = dict(out.get("phase_minutes") or {}) if isinstance(out.get("phase_minutes"), dict) else {}
    # Keep learning session length if already set higher; always sync practice/application.
    phase_minutes["practice"] = minutes
    phase_minutes["application"] = minutes
    if "learning" not in phase_minutes:
        phase_minutes["learning"] = 120
    out["phase_minutes"] = phase_minutes
    phases = out.get("phases")
    if isinstance(phases, dict):
        phases = dict(phases)
        for key in ("practice", "application"):
            phase = phases.get(key)
            if isinstance(phase, dict):
                phase = dict(phase)
                acts = phase.get("activities")
                if isinstance(acts, list):
                    new_acts = []
                    for act in acts:
                        if isinstance(act, dict):
                            act = dict(act)
                            act["minutes"] = minutes
                            new_acts.append(act)
                        else:
                            new_acts.append(act)
                    phase["activities"] = new_acts
                phases[key] = phase
        out["phases"] = phases
    return out


def annotate_unverified_resources(live_doc: dict[str, Any]) -> dict[str, Any]:
    """Soft-mark generic/likely-hallucinated titles; does not drop items."""
    out = dict(live_doc)
    resources = out.get("resources")
    if not isinstance(resources, list):
        return out
    new_list = []
    for r in resources:
        if not isinstance(r, dict):
            new_list.append(r)
            continue
        item = dict(r)
        name = str(item.get("name") or "")
        rtype = str(item.get("type") or "")
        # AI packs / scripts are intentional synthetic deliverables.
        if rtype in ("ai_pack", "script") or "学习包" in name or "脚本" in name or "对照卡" in name or "病例" in name:
            new_list.append(item)
            continue
        if item.get("weread_readable") or item.get("weread_book_id") or item.get("book_id"):
            new_list.append(item)
            continue
        # Suspiciously generic textbook-style titles without verification.
        if any(k in name.lower() for k in ("从入门到精通", "实战指南", "完全手册", "宝典")):
            item["verification"] = "unverified"
            warn = str(item.get("warning") or "")
            if "待核验" not in warn:
                item["warning"] = (warn + "；书名待核验，优先当索引而非权威出处").strip("；")
        new_list.append(item)
    out["resources"] = new_list
    return out
