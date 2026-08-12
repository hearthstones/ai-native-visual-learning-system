#!/usr/bin/env python3
"""Clear-data smoke run: three themes through the main product path."""

from __future__ import annotations

import json
import sys
import time
import urllib.error
import urllib.request
from dataclasses import dataclass
from http.cookiejar import CookieJar
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
BASE = "http://127.0.0.1:8000/api"
OUT = ROOT / "docs" / "ai-engineering" / "seed-three-themes-flow.json"

_COOKIE_JAR = CookieJar()
_OPENER = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(_COOKIE_JAR))


def _load_dotenv(path: Path) -> dict[str, str]:
    out: dict[str, str] = {}
    if not path.is_file():
        return out
    for line in path.read_text(encoding="utf-8").splitlines():
        s = line.strip()
        if not s or s.startswith("#") or "=" not in s:
            continue
        k, v = s.split("=", 1)
        out[k.strip()] = v.strip().strip('"').strip("'")
    return out


def req(method: str, path: str, body: dict | None = None) -> tuple[int, Any, float]:
    data = None if body is None else json.dumps(body).encode()
    headers = {"Content-Type": "application/json"} if body is not None else {}
    r = urllib.request.Request(f"{BASE}{path}", data=data, headers=headers, method=method)
    t0 = time.time()
    try:
        with _OPENER.open(r, timeout=240) as resp:
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
    except Exception as e:
        elapsed = time.time() - t0
        return 0, {"detail": str(e)}, elapsed


def ensure_auth() -> None:
    """若启用了 AUTH_PASSWORD，用 .env 凭证登录并保留 cookie。"""
    code, me, _ = req("GET", "/auth/me")
    if code == 200 and isinstance(me, dict) and me.get("authenticated"):
        print(f"auth: already ok (required={me.get('auth_required')})")
        return
    if code == 200 and isinstance(me, dict) and not me.get("auth_required"):
        print("auth: gate disabled")
        return

    env = _load_dotenv(ROOT / ".env")
    user = env.get("AUTH_USERNAME") or "admin"
    password = env.get("AUTH_PASSWORD") or ""
    if not password.strip():
        print("auth: required but AUTH_PASSWORD empty in .env", file=sys.stderr)
        sys.exit(2)

    code, body, _ = req("POST", "/auth/login", {"username": user, "password": password})
    if code != 200 or not (isinstance(body, dict) and body.get("authenticated")):
        print(f"auth: login failed HTTP {code} {body}", file=sys.stderr)
        sys.exit(2)
    print(f"auth: logged in as {body.get('username') or user}")


@dataclass
class Note:
    step: str
    ok: bool
    ms: int
    detail: str = ""


@dataclass
class ThemeSpec:
    title: str
    theme_type: str  # general | tech
    goal: str
    stage_pick: int
    resource_msg: str | None
    plan_msg: str | None


THEMES = [
    ThemeSpec(
        title="主题阅读",
        theme_type="general",
        goal="两周内建立可持续的主题阅读方法：能围绕一个主题选书、做分析阅读并写出结构提纲",
        stage_pick=2,
        resource_msg="优先微信读书能直接打开的书；给我能马上照着做的阅读脚本，不要百科式书单。",
        plan_msg="每天最多 40 分钟；学习期活动控制在可执行范围内，先出检查清单。",
    ),
    ThemeSpec(
        title="AI Agent 入门",
        theme_type="tech",
        goal="一周内能讲清 Agent 核心组件（感知/规划/工具/记忆），并搭一个最小可运行 Agent 示例",
        stage_pick=2,
        resource_msg="不要堆官方长文档。我要：概念对照卡 + 3 个典型失败病例 + 最短可运行例子。官方资料最多当索引。",
        plan_msg="每天 45 分钟；练习直接对应病例与最小示例，少空泛阅读。",
    ),
    ThemeSpec(
        title="第六轮康波周期分析",
        theme_type="general",
        goal="两周内能用康波框架解释当前长波位置，并写出一份可分享的周期分析提纲",
        stage_pick=2,
        resource_msg="只要 3 份资料，偏框架与历史对照；给我阅读顺序与笔记模板，不要大部头堆砌。",
        plan_msg="每天 30 分钟；活动标题要短，便于碎片时间推进。",
    ),
]


def walk(spec: ThemeSpec, *, free_learning_first: bool = False) -> dict[str, Any]:
    notes: list[Note] = []
    frictions: list[str] = []
    resource_names: list[str] = []
    plan: dict[str, Any] = {}

    def add(step: str, code: int, elapsed: float, detail: str = "", expect: int = 200):
        ok = code == expect or (expect == 200 and 200 <= code < 300)
        n = Note(step=step, ok=ok, ms=int(elapsed * 1000), detail=detail[:400])
        if not ok:
            frictions.append(f"{step} 失败 HTTP {code}: {detail[:200]}")
        notes.append(n)
        print(f"  [{spec.title}] {step}: {'OK' if ok else 'FAIL'} {n.ms}ms {detail[:100]}")

    if free_learning_first:
        code, home, t = req("GET", "/home")
        learning = [
            th
            for th in ((home or {}).get("themes") or [])
            if th.get("phase") == "learning" and th.get("status") == "active"
        ]
        for th in learning:
            code, _, t = req("POST", f"/themes/{th['id']}/advance-phase", {})
            add("advance_prev_learning", code, t, f"from={th.get('title')}")

    code, theme, t = req(
        "POST",
        "/themes",
        {
            "title": spec.title,
            "theme_type": spec.theme_type,
            "goal": spec.goal,
        },
    )
    add("create_theme", code, t, (theme or {}).get("title", str(theme)))
    if code >= 400 or not theme:
        return {
            "theme": {"title": spec.title, "theme_type": spec.theme_type},
            "ok": False,
            "notes": [n.__dict__ for n in notes],
            "frictions": frictions,
        }
    tid = theme["id"]

    # stage
    code, sess, t = req("POST", f"/themes/{tid}/cocreate/start", {"kind": "stage"})
    levels = ((sess or {}).get("live_doc") or {}).get("levels") or []
    add(
        "cocreate_stage_start",
        code,
        t,
        f"levels={len(levels)}",
    )
    code, theme, t = req(
        "POST",
        f"/themes/{tid}/cocreate/stage/confirm",
        {"selected_level": spec.stage_pick, "live_doc": (sess or {}).get("live_doc")},
    )
    add("cocreate_stage_confirm", code, t, f"level={spec.stage_pick}")

    # resources
    code, sess, t = req(
        "POST",
        f"/themes/{tid}/cocreate/start",
        {"kind": "resources", "resource_count": 3},
    )
    resources = ((sess or {}).get("live_doc") or {}).get("resources") or []
    resource_names = [str(r.get("name") or r)[:60] for r in resources if isinstance(r, dict)]
    add("cocreate_resources_start", code, t, f"n={len(resources)} names={resource_names}")
    if spec.resource_msg:
        code, sess, t = req(
            "POST",
            f"/themes/{tid}/cocreate/resources/message",
            {"content": spec.resource_msg},
        )
        resources = ((sess or {}).get("live_doc") or {}).get("resources") or []
        resource_names = [str(r.get("name") or "")[:60] for r in resources if isinstance(r, dict)]
        add("cocreate_resources_message", code, t, f"n={len(resources)} names={resource_names}")
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
        f"daily={plan.get('daily_minutes')} learning_acts={len(acts)}",
    )
    if spec.plan_msg:
        code, sess, t = req(
            "POST",
            f"/themes/{tid}/cocreate/plan/message",
            {"content": spec.plan_msg},
        )
        plan = (sess or {}).get("live_doc") or {}
        add("cocreate_plan_message", code, t, f"daily={plan.get('daily_minutes')}")
    code, theme, t = req(
        "POST",
        f"/themes/{tid}/cocreate/plan/confirm",
        {"live_doc": (sess or {}).get("live_doc")},
    )
    add("cocreate_plan_lock", code, t, f"status={(theme or {}).get('status')} phase={(theme or {}).get('phase')}")

    # home + commitments
    code, home, t = req("GET", "/home")
    today = (home or {}).get("today_tasks") or []
    queue = (home or {}).get("queue") or []
    add("home_after_lock", code, t, f"today={len(today)} queue={len(queue)}")

    if not today and queue:
        act_id = queue[0].get("activity_id")
        code, _, t = req("POST", "/commitments", {"activity_id": act_id})
        add("commit_from_queue", code, t, f"activity={act_id}")

    code, _, t = req("POST", "/commitments/suggest", {})
    add("commitments_suggest", code, t)
    code, home, t = req("GET", "/home")
    today = (home or {}).get("today_tasks") or []
    add("home_after_suggest", code, t, f"today={len(today)}")

    activity_id = None
    for task in today:
        if task.get("theme_id") == tid and task.get("activity_id"):
            activity_id = task["activity_id"]
            task_id = task.get("id")
            break
    else:
        task_id = None
        for task in today:
            if task.get("activity_id"):
                activity_id = task["activity_id"]
                task_id = task.get("id")
                break

    if activity_id:
        code, ex, t = req("POST", f"/themes/activities/{activity_id}/expand", {})
        steps = ((ex or {}).get("execution_doc") or {}).get("steps") or (ex or {}).get("steps") or []
        add("activity_expand", code, t, f"steps={len(steps)}")
        if task_id:
            code, _, t = req("PATCH", f"/tasks/{task_id}", {"done": True})
            add("tick_today_task", code, t)
    else:
        frictions.append("无 activity_id 可展开")

    code, doc, t = req("GET", f"/themes/{tid}/plan-document")
    add("plan_document", code, t, f"locked={(doc or {}).get('locked')}")

    return {
        "theme": {
            "id": tid,
            "title": spec.title,
            "theme_type": spec.theme_type,
            "goal": spec.goal,
        },
        "ok": all(n.ok for n in notes) and not frictions,
        "notes": [n.__dict__ for n in notes],
        "frictions": frictions,
        "resource_names": resource_names,
        "plan_daily_minutes": plan.get("daily_minutes") if isinstance(plan, dict) else None,
    }


def main() -> int:
    code, health, _ = req("GET", "/health")
    if code != 200:
        # some apps expose /api/health
        print(f"health check: {code} {health}")
        sys.exit(2)
    ensure_auth()
    code, home, t = req("GET", "/home")
    themes0 = (home or {}).get("themes") or []
    print(f"home before: themes={len(themes0)} slots={(home or {}).get('slots')}")
    if themes0:
        print("WARNING: DB not empty; expected clean start after deleting learning.db")

    results = []
    for i, spec in enumerate(THEMES):
        print(f"\n=== {i + 1}/{len(THEMES)} {spec.title} ({spec.theme_type}) ===")
        # learning slot max=1: advance previous active learning theme before locking next
        results.append(walk(spec, free_learning_first=(i > 0)))

    # weekly review across themes that locked
    mastery = []
    answers = [
        "三个主题都完成了共创锁定与一次今日勾选",
        "资料与计划基本可用，个别标题偏长",
        "下周按主焦点推进一个学习槽主题",
    ]
    for r in results:
        tid = (r.get("theme") or {}).get("id")
        title = (r.get("theme") or {}).get("title")
        if tid:
            mastery.append({"theme_id": tid, "label": title, "score": 2})
    code, review, t = req(
        "POST",
        "/reviews/weekly",
        {"answers": answers, "mastery": mastery, "draft_notes": "三主题测试数据全流程复盘"},
    )
    review_ok = 200 <= code < 300
    print(f"\nweekly_review: {'OK' if review_ok else 'FAIL'} {int(t*1000)}ms {str((review or {}).get('summary') or review)[:120]}")

    code, home, t = req("GET", "/home")
    final_home = {
        "themes": [
            {
                "id": th.get("id"),
                "title": th.get("title"),
                "theme_type": th.get("theme_type"),
                "phase": th.get("phase"),
                "status": th.get("status"),
                "is_focus": th.get("is_focus"),
            }
            for th in ((home or {}).get("themes") or [])
        ],
        "slots": (home or {}).get("slots"),
        "today_tasks": len((home or {}).get("today_tasks") or []),
        "queue": len((home or {}).get("queue") or []),
        "focus_count": (home or {}).get("focus_count"),
    }
    print("\nfinal home:")
    print(json.dumps(final_home, ensure_ascii=False, indent=2))

    payload = {
        "date": time.strftime("%Y-%m-%d"),
        "mode": "live-llm",
        "base": BASE,
        "results": results,
        "weekly_review": {"ok": review_ok, "ms": int(t * 1000), "body": review},
        "final_home": final_home,
    }
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(payload, ensure_ascii=False, indent=2))
    print(f"\nWrote {OUT}")

    all_ok = all(r["ok"] for r in results) and review_ok
    for r in results:
        print(r["theme"]["title"], "OK" if r["ok"] else "FAIL", "frictions=", r["frictions"])
    return 0 if all_ok else 1


if __name__ == "__main__":
    sys.exit(main())
