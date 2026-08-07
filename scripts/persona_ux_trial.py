#!/usr/bin/env python3
"""Persona UX trial driver — API-level full-path walks. Never prints secrets."""

from __future__ import annotations

import json
import time
import urllib.error
import urllib.request
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

BASE = "http://127.0.0.1:8000/api"
OUT = Path("/workspace/docs/ai-engineering/persona-ux-trial-2026-08-07.json")


def req(method: str, path: str, body: dict | None = None) -> tuple[int, Any, float]:
    data = None if body is None else json.dumps(body).encode()
    headers = {"Content-Type": "application/json"} if body is not None else {}
    r = urllib.request.Request(f"{BASE}{path}", data=data, headers=headers, method=method)
    t0 = time.time()
    try:
        with urllib.request.urlopen(r, timeout=180) as resp:
            raw = resp.read().decode()
            elapsed = time.time() - t0
            return resp.status, (json.loads(raw) if raw else None), elapsed
    except urllib.error.HTTPError as e:
        elapsed = time.time() - t0
        raw = e.read().decode()
        try:
            parsed = json.loads(raw)
        except Exception:
            parsed = {"detail": raw[:500]}
        return e.code, parsed, elapsed


@dataclass
class Note:
    step: str
    ok: bool
    ms: int
    detail: str = ""
    friction: list[str] = field(default_factory=list)


@dataclass
class Persona:
    id: str
    name: str
    archetype: str
    theme_title: str
    theme_type: str  # general | tech
    goal: str
    stage_pick: int
    resource_msg: str | None
    plan_msg: str | None
    review_answers: list[str]


PERSONAS = [
    Persona(
        id="p1-general-reader",
        name="林晓（通识读者）",
        archetype="周末自学、偏好微信读书、讨厌空泛书单",
        theme_title="用分析阅读吃透非虚构",
        theme_type="general",
        goal="两周内能对任意非虚构章节写出结构提纲与三条质疑",
        stage_pick=2,
        resource_msg="优先微信读书里能直接打开的书；不要百科式书单，给我能马上照着做的阅读脚本。",
        plan_msg="每天最多 30 分钟，学习期压到更短，先出检查清单再谈长期。",
        review_answers=[
            "这周主要在建提纲模板",
            "资料有点多，不知道先读哪本",
            "下周只练一个章节的分析阅读",
        ],
    ),
    Persona(
        id="p2-tech-rust",
        name="周凯（技术工程师）",
        archetype="有项目压力、讨厌官方文档堆砌、要 AI 加工稿",
        theme_title="Rust 所有权与借用一次讲清",
        theme_type="tech",
        goal="一周内能独立解释并改对 3 个常见所有权编译错误",
        stage_pick=2,
        resource_msg="别再塞 The Book 全本。我要：概念对照卡 + 3 个编译错误病例 + 最短可运行例子。官方文档最多当索引。",
        plan_msg="学习期按每天 45 分钟重排；练习要直接对应编译错误病例。",
        review_answers=[
            "跟做了最小例子",
            "官方资料太散，加工稿更有用",
            "下周专攻 lifetime 报错",
        ],
    ),
    Persona(
        id="p3-busy-pm",
        name="陈敏（忙碌产品）",
        archetype="碎片时间、想多主题并行、依赖今日看板",
        theme_title="AI 产品评测方法论",
        theme_type="general",
        goal="建立可复用的 AI 功能评测清单，两周内评完一个竞品模块",
        stage_pick=3,
        resource_msg="只要 3 份资料，偏实操框架，不要大部头。",
        plan_msg="每天 20 分钟；活动标题要短到通勤也能看懂。",
        review_answers=[
            "只完成了一条今日任务",
            "跳转页面有点多",
            "希望今日勾选就结束，少进主题",
        ],
    ),
]


def walk(persona: Persona) -> dict[str, Any]:
    notes: list[Note] = []
    frictions: list[str] = []

    def add(step: str, code: int, elapsed: float, detail: str = "", expect: int = 200):
        ok = code == expect or (expect == 200 and 200 <= code < 300)
        n = Note(step=step, ok=ok, ms=int(elapsed * 1000), detail=detail[:400])
        if not ok:
            n.friction.append(f"{step} 失败 HTTP {code}: {detail[:200]}")
            frictions.extend(n.friction)
        if elapsed > 45:
            n.friction.append(f"{step} 等待过久 {elapsed:.1f}s")
            frictions.append(n.friction[-1])
        notes.append(n)
        print(f"  [{persona.id}] {step}: {'OK' if ok else 'FAIL'} {n.ms}ms {detail[:80]}")

    # home empty
    code, home, t = req("GET", "/home")
    add("home_empty", code, t, f"themes={len((home or {}).get('themes') or [])}")

    # create
    code, theme, t = req(
        "POST",
        "/themes",
        {
            "title": persona.theme_title,
            "theme_type": persona.theme_type,
            "goal": persona.goal,
        },
    )
    add("create_theme", code, t, (theme or {}).get("title", str(theme)))
    if code >= 400 or not theme:
        return {"persona": persona.id, "ok": False, "notes": [n.__dict__ for n in notes], "frictions": frictions}
    tid = theme["id"]

    # stage
    code, sess, t = req("POST", f"/themes/{tid}/cocreate/start", {"kind": "stage"})
    levels = ((sess or {}).get("live_doc") or {}).get("levels") or []
    add("cocreate_stage_start", code, t, f"levels={len(levels)} msg={((sess or {}).get('messages') or [{}])[-1].get('content','')[:60]}")
    if persona.resource_msg:  # optional chat on stage skipped; pick level
        pass
    code, theme, t = req(
        "POST",
        f"/themes/{tid}/cocreate/stage/confirm",
        {"selected_level": persona.stage_pick, "live_doc": (sess or {}).get("live_doc")},
    )
    add("cocreate_stage_confirm", code, t, f"level={persona.stage_pick}")

    # resources
    code, sess, t = req(
        "POST",
        f"/themes/{tid}/cocreate/start",
        {"kind": "resources", "resource_count": 3},
    )
    resources = ((sess or {}).get("live_doc") or {}).get("resources") or []
    names = [str(r.get("name") or r)[:40] for r in resources if isinstance(r, dict)]
    add("cocreate_resources_start", code, t, f"n={len(resources)} names={names}")
    # quality signals
    officialish = sum(1 for n in names if any(k in n for k in ("官方", "The Book", "文档", "Wikipedia", "百科")))
    if persona.theme_type == "tech" and officialish >= 2:
        frictions.append("技术主题资料仍偏官方/文档堆砌")
    if persona.resource_msg:
        code, sess, t = req(
            "POST",
            f"/themes/{tid}/cocreate/resources/message",
            {"content": persona.resource_msg},
        )
        resources2 = ((sess or {}).get("live_doc") or {}).get("resources") or []
        names2 = [str(r.get("name") or "")[:40] for r in resources2 if isinstance(r, dict)]
        add("cocreate_resources_message", code, t, f"n={len(resources2)} names={names2}")
        resources = resources2
    code, theme, t = req(
        "POST",
        f"/themes/{tid}/cocreate/resources/confirm",
        {"live_doc": (sess or {}).get("live_doc")},
    )
    add("cocreate_resources_confirm", code, t)

    # plan
    code, sess, t = req("POST", f"/themes/{tid}/cocreate/start", {"kind": "plan"})
    plan = (sess or {}).get("live_doc") or {}
    acts = (((plan.get("phases") or {}).get("learning") or {}).get("activities")) or []
    add(
        "cocreate_plan_start",
        code,
        t,
        f"daily={plan.get('daily_minutes')} learning_acts={len(acts)} goal={str(plan.get('goal') or '')[:50]}",
    )
    if persona.plan_msg:
        code, sess, t = req(
            "POST",
            f"/themes/{tid}/cocreate/plan/message",
            {"content": persona.plan_msg},
        )
        plan = (sess or {}).get("live_doc") or {}
        add("cocreate_plan_message", code, t, f"daily={plan.get('daily_minutes')}")
    code, theme, t = req(
        "POST",
        f"/themes/{tid}/cocreate/plan/confirm",
        {"live_doc": (sess or {}).get("live_doc")},
    )
    add("cocreate_plan_lock", code, t, f"status={(theme or {}).get('status')}")

    # home after lock
    code, home, t = req("GET", "/home")
    today = (home or {}).get("today_tasks") or []
    queue = (home or {}).get("queue") or []
    add("home_after_lock", code, t, f"today={len(today)} queue={len(queue)} focus={ (home or {}).get('focus_count') }")
    if not today and not queue:
        frictions.append("锁定后今日看板既无今日任务也无队列，冷启动着陆空")

    # commit from queue if needed
    if not today and queue:
        act_id = queue[0].get("activity_id")
        code, _, t = req("POST", "/commitments", {"activity_id": act_id})
        add("commit_from_queue", code, t, f"activity={act_id}")
        code, home, t = req("GET", "/home")
        today = (home or {}).get("today_tasks") or []
        if not today:
            frictions.append("从队列加入今日后今日仍为空")

    # suggest fill
    code, _, t = req("POST", "/commitments/suggest", {})
    add("commitments_suggest", code, t)
    code, home, t = req("GET", "/home")
    today = (home or {}).get("today_tasks") or []
    if not today:
        frictions.append("锁定+建议填入后今日承诺仍为空")

    # expand first activity if possible
    code, theme_full, t = req("GET", f"/themes/{tid}")
    add("theme_board", code, t, f"phase={(theme_full or {}).get('phase')}")

    activity_id = None
    for task in today:
        if task.get("activity_id"):
            activity_id = task["activity_id"]
            break
    if activity_id:
        # router is /themes/activities/{id}/expand (not nested under theme id)
        code, ex, t = req("POST", f"/themes/activities/{activity_id}/expand", {})
        steps = ((ex or {}).get("execution_doc") or {}).get("steps") or (ex or {}).get("steps") or []
        add("activity_expand", code, t, f"steps={len(steps)} title={str((ex or {}).get('title') or '')[:40]}")
        task_id = today[0].get("id")
        if task_id and not today[0].get("done"):
            code, _, t = req("PATCH", f"/tasks/{task_id}", {"done": True})
            add("tick_today_task", code, t)
    else:
        frictions.append("无 activity_id 可展开")

    # weekly review
    mastery = [{"theme_id": tid, "label": persona.theme_title, "score": 2}]
    code, review, t = req(
        "POST",
        "/reviews/weekly",
        {
            "answers": persona.review_answers,
            "mastery": mastery,
            "draft_notes": f"{persona.name} 试验复盘",
        },
    )
    add(
        "weekly_review",
        code,
        t,
        f"summary={str((review or {}).get('summary') or '')[:80]}",
    )

    # plan document
    code, doc, t = req("GET", f"/themes/{tid}/plan-document")
    add("plan_document", code, t, f"locked={(doc or {}).get('locked')}")

    return {
        "persona": {
            "id": persona.id,
            "name": persona.name,
            "archetype": persona.archetype,
            "theme_title": persona.theme_title,
            "theme_type": persona.theme_type,
        },
        "theme_id": tid,
        "ok": all(n.ok for n in notes),
        "notes": [n.__dict__ for n in notes],
        "frictions": frictions,
        "resource_names": names,
        "plan_daily_minutes": plan.get("daily_minutes") if isinstance(plan, dict) else None,
    }


def reset_db_via_restart_hint() -> None:
    """Caller must delete sqlite files and bounce API before each persona."""
    pass


def main() -> None:
    # Single persona if DB already clean — runner expects external reset between calls
    import sys

    which = sys.argv[1] if len(sys.argv) > 1 else "all"
    results = []
    selected = PERSONAS if which == "all" else [p for p in PERSONAS if p.id.startswith(which) or which in p.id]
    if not selected:
        selected = [p for p in PERSONAS if p.id == which]
    for p in selected:
        print(f"\n=== {p.name} ({p.id}) ===")
        results.append(walk(p))
    OUT.parent.mkdir(parents=True, exist_ok=True)
    # merge if file exists and running single
    if OUT.exists() and which != "all":
        prev = json.loads(OUT.read_text())
        prev_results = [r for r in prev.get("results", []) if r.get("persona", {}).get("id") not in {x["persona"]["id"] for x in results}]
        results = prev_results + results
    payload = {
        "date": "2026-08-07",
        "mode": "live-llm",
        "base": BASE,
        "results": results,
    }
    OUT.write_text(json.dumps(payload, ensure_ascii=False, indent=2))
    print(f"\nWrote {OUT}")
    for r in results:
        print(r["persona"]["id"], "OK" if r["ok"] else "FAIL", "frictions=", r["frictions"])


if __name__ == "__main__":
    main()
